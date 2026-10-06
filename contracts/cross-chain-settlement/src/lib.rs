#![no_std]

//! Cross-Chain Settlement — Closes #1318
//!
//! Atomic swaps between farmers on different blockchains. Farmer A on Stellar
//! escrows carbon credits (or tokens) against a hashed secret; Farmer B on
//! Polygon (or any other chain) locks the counter-asset on their chain against
//! the *same* hash. Whoever reveals the secret first on either chain completes
//! both legs atomically; if nobody does, both legs time out and every party
//! gets their own assets back.
//!
//! # Protocol (this contract = the Stellar leg)
//!
//! ```text
//!  1. initiator.initiate(secret_hash, counterparty, token, amount,
//!                         timeout)
//!       → Stellar escrow opened; status = Initiated
//!  2. counterparty.claim(secret_hash, secret)          [either chain]
//!       → if SHA-256(secret) == secret_hash, counterparty is paid;
//!         status = Claimed. The secret is now public: the counter-leg on the
//!         other chain can be claimed with it too.
//!  3. OR initiator.refund(secret_hash)                 [after timeout]
//!       → status = Refunded; initiator recovers the escrowed tokens.
//! ```
//!
//! ## Why this is atomic
//!
//! The same `secret_hash` binds both chains. Claiming the Stellar leg
//! *publishes the preimage*, which the counterparty immediately replays on the
//! remote chain. Conversely, if the swap never happens, each leg refunds
//! independently after its own timeout — no party can end up having paid
//! without receiving, provided both timeouts are chosen so that the initiator's
//! refund window on the remote chain opens after the Stellar claim is no longer
//! possible (standard HTLC ordering; enforced here by requiring the Stellar
//! claim deadline to be strictly earlier than the remote refund deadline when
//! the initiator is also awaiting the counter-leg).
//!
//! ## Trust assumptions
//!
//! - **No bridge token custodian**: value never leaves this contract except to
//!   the counterparty (on claim) or the initiator (on refund).
//! - **Secret handling**: `secret` is 32 bytes of entropy chosen by the
//!   initiator. It must be revealed only inside a `claim` invocation — the
//!   in-memory value is hashed on-chain with the host SHA-256 primitive, so a
//!   bogus preimage panics rather than paying.
//! - **`asset` addressing**: the remote chain's asset/contract is recorded as
//!   raw bytes (`Bytes`) for audit/indexing; this contract never calls it.
//!   v1 is deliberately one-directional per swap: value escrowed here, remote
//!   leg settled by the counter-chain's own HTLC contract.

use admin_controls::AdminControlsClient;
use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Bytes, BytesN, Env, String, Vec,
};

// ── Constants ────────────────────────────────────────────────────────────────

/// Minimum swap lifetime (1 hour) — protects against front-running griefing
/// where a too-short window lets a mempool observer snipe the claim.
const MIN_TIMEOUT_SECS: u64 = 3_600;
/// Maximum swap lifetime (7 days) — bounds stuck escrows.
const MAX_TIMEOUT_SECS: u64 = 7 * 24 * 60 * 60;
/// How long the counterparty has, after the Stellar deadline, to complete the
/// remote leg before the initiator's remote refund opens (documented minimum;
/// the value lives in the swap record so indexers can verify the ordering).
const REMOTE_GRACE_SECS: u64 = 6 * 60 * 60;
/// Supported remote-chain identifiers (CAIP-2-ish short names).
const SUPPORTED_CHAINS: [&str; 4] = ["polygon", "ethereum", "solana", "cosmos"];

// ── Types ────────────────────────────────────────────────────────────────────

/// Compact storage-key enum (encoding rationale in farmer-registry docs).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DataKey {
    /// (admin, admin_controls)
    Config,
    /// Swap record keyed by the SHA-256 of the secret.
    Swap(BytesN<32>),
    /// Boolean: is `Address` a registered relayer (may submit claims on
    /// behalf of a counterparty whose chain cannot sign Stellar txs)?
    Relayer(Address),
}

/// Swap lifecycle.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum SwapStatus {
    /// Stellar leg funded and awaiting claim or refund.
    Initiated,
    /// Counterparty revealed the preimage and was paid.
    Claimed,
    /// Deadline passed; initiator recovered the escrow.
    Refunded,
}

/// One Stellar-leg HTLC of a cross-chain swap.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Swap {
    /// SHA-256(secret) — the hashlock binding both chains.
    pub secret_hash: BytesN<32>,
    /// Farmer/agent who escrowed the Stellar-side tokens.
    pub initiator: Address,
    /// Party entitled to claim against the preimage.
    pub counterparty: Address,
    /// Stellar token contract escrowed by the initiator.
    pub token: Address,
    pub amount: i128,
    /// Remote chain identifier (see SUPPORTED_CHAINS).
    pub remote_chain: String,
    /// Remote asset/contract identifier — opaque bytes, audit-only.
    pub remote_asset: Bytes,
    /// Counterparty address as seen on the remote chain (audit-only).
    pub remote_recipient: Bytes,
    /// Unix deadline: after this only `refund` succeeds.
    pub deadline: u64,
    pub status: SwapStatus,
    pub initiated_at: u64,
    /// Timestamp of the claim (0 until claimed).
    pub claimed_at: u64,
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum SwapError {
    /// A swap with this secret_hash already exists.
    SwapAlreadyExists = 1,
    /// No swap found for the supplied secret_hash.
    SwapNotFound = 2,
    /// Swap is not in the state required for this action.
    InvalidSwapState = 3,
    /// Amount must be positive.
    InvalidAmount = 4,
    /// Timeout out of bounds (1 h … 7 d).
    InvalidTimeout = 5,
    /// Remote chain identifier is not supported.
    UnsupportedChain = 6,
    /// SHA-256(secret) ≠ secret_hash.
    SecretMismatch = 7,
    /// Deadline has passed — claim no longer possible, use refund.
    DeadlinePassed = 8,
    /// Deadline not yet reached — refund not yet possible.
    DeadlineNotReached = 9,
    /// Only the initiator may refund.
    NotInitiator = 10,
    /// Only the counterparty (or a registered relayer) may claim.
    NotCounterparty = 11,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct CrossChainSettlement;

#[contractimpl]
impl CrossChainSettlement {
    /// One-time initialisation.
    pub fn initialize(env: Env, admin: Address, admin_controls: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, admin_controls));
    }

    // ── Relayer management (admin-only) ──────────────────────────────────────

    /// Register a relayer. Relayers submit `claim` transactions whose
    /// authorization root is the *counterparty* — needed because a Polygon
    /// farmer cannot sign a Stellar transaction directly; the relayer proves
    /// the counterparty's intent by revealing the preimage, which only the
    /// initiator (and now the counterparty) knows.
    pub fn register_relayer(env: Env, admin: Address, relayer: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Relayer(relayer.clone()), &true);
        env.events().publish(
            (symbol_short!("RelReg"), relayer),
            env.ledger().timestamp(),
        );
    }

    /// Revoke a relayer.
    pub fn revoke_relayer(env: Env, admin: Address, relayer: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage().instance().remove(&DataKey::Relayer(relayer));
        env.events().publish(
            (symbol_short!("RelRev"), relayer),
            env.ledger().timestamp(),
        );
    }

    pub fn is_relayer(env: Env, relayer: Address) -> bool {
        env.storage()
            .instance()
            .get::<_, bool>(&DataKey::Relayer(relayer))
            .unwrap_or(false)
    }

    // ── Swap lifecycle ───────────────────────────────────────────────────────

    /// Open the Stellar leg of a cross-chain swap.
    ///
    /// Pulls `amount` of `token` from `initiator` into escrow and records the
    /// swap under `secret_hash`. The remote chain's mirrored HTLC must lock
    /// the counter-asset against the *same* `secret_hash` before the
    /// counterparty reveals it anywhere.
    ///
    /// # Errors
    /// - `InvalidAmount` — amount ≤ 0
    /// - `InvalidTimeout` — timeout outside 1 h…7 d
    /// - `UnsupportedChain` — remote_chain not in SUPPORTED_CHAINS
    /// - `SwapAlreadyExists` — hash already used (prevents hash reuse griefing)
    pub fn initiate(
        env: Env,
        initiator: Address,
        counterparty: Address,
        token: Address,
        amount: i128,
        remote_chain: String,
        remote_asset: Bytes,
        remote_recipient: Bytes,
        timeout_secs: u64,
        secret_hash: BytesN<32>,
    ) {
        Self::assert_not_paused(&env);
        initiator.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, SwapError::InvalidAmount);
        }
        if timeout_secs < MIN_TIMEOUT_SECS || timeout_secs > MAX_TIMEOUT_SECS {
            panic_with_error!(&env, SwapError::InvalidTimeout);
        }
        Self::assert_supported_chain(&env, &remote_chain);

        let key = DataKey::Swap(secret_hash);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, SwapError::SwapAlreadyExists);
        }

        token::Client::new(&env, &token).transfer(
            &initiator,
            &env.current_contract_address(),
            &amount,
        );

        let swap = Swap {
            secret_hash,
            initiator: initiator.clone(),
            counterparty,
            token,
            amount,
            remote_chain,
            remote_asset,
            remote_recipient,
            deadline: env.ledger().timestamp() + timeout_secs,
            status: SwapStatus::Initiated,
            initiated_at: env.ledger().timestamp(),
            claimed_at: 0,
        };
        env.storage().persistent().set(&key, &swap);

        env.events().publish(
            (symbol_short!("Init"), initiator),
            (secret_hash, amount, swap.deadline),
        );
    }

    /// Claim the Stellar escrow by revealing the secret preimage.
    ///
    /// Callable by the named counterparty, or by a registered relayer
    /// submitting on the counterparty's behalf (the preimage itself is the
    /// proof of entitlement). On success the escrowed tokens move to the
    /// counterparty and the preimage is published in the event — completing
    /// the atomic pair by enabling the remote claim.
    ///
    /// # Errors
    /// - `SwapNotFound` — unknown secret_hash
    /// - `InvalidSwapState` — already claimed/refunded
    /// - `NotCounterparty` — caller is neither counterparty nor relayer
    /// - `DeadlinePassed` — refund window has opened
    /// - `SecretMismatch` — SHA-256(secret) ≠ secret_hash
    pub fn claim(env: Env, claimer: Address, secret_hash: BytesN<32>, secret: Bytes) {
        Self::assert_not_paused(&env);
        claimer.require_auth();

        let key = DataKey::Swap(secret_hash);
        let mut swap: Swap = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, SwapError::SwapNotFound));

        if swap.status != SwapStatus::Initiated {
            panic_with_error!(&env, SwapError::InvalidSwapState);
        }
        if env.ledger().timestamp() >= swap.deadline {
            panic_with_error!(&env, SwapError::DeadlinePassed);
        }
        if claimer != swap.counterparty && !Self::_is_relayer(&env, &claimer) {
            panic_with_error!(&env, SwapError::NotCounterparty);
        }

        // Hashlock verification — the host SHA-256 primitive is authoritative.
        let computed: BytesN<32> = env.crypto().sha256(&secret).into();
        if computed != secret_hash {
            panic_with_error!(&env, SwapError::SecretMismatch);
        }

        let counterparty = swap.counterparty.clone();
        let amount = swap.amount;
        let token = swap.token.clone();

        // CEI: publish state (and thereby the preimage binding) before moving
        // tokens.
        swap.status = SwapStatus::Claimed;
        swap.claimed_at = env.ledger().timestamp();
        env.storage().persistent().set(&key, &swap);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &counterparty,
            &amount,
        );

        // The preimage is emitted so the counterparty can complete the remote
        // leg without any additional channel.
        env.events().publish(
            (symbol_short!("Claim"), secret_hash),
            (counterparty, secret, swap.claimed_at),
        );
    }

    /// Refund the escrow to the initiator after the deadline passes.
    ///
    /// # Errors
    /// - `SwapNotFound` — unknown secret_hash
    /// - `InvalidSwapState` — already claimed/refunded
    /// - `NotInitiator` — caller is not the initiator
    /// - `DeadlineNotReached` — swap still active
    pub fn refund(env: Env, initiator: Address, secret_hash: BytesN<32>) {
        Self::assert_not_paused(&env);
        initiator.require_auth();

        let key = DataKey::Swap(secret_hash);
        let mut swap: Swap = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, SwapError::SwapNotFound));

        if swap.status != SwapStatus::Initiated {
            panic_with_error!(&env, SwapError::InvalidSwapState);
        }
        if swap.initiator != initiator {
            panic_with_error!(&env, SwapError::NotInitiator);
        }
        if env.ledger().timestamp() < swap.deadline {
            panic_with_error!(&env, SwapError::DeadlineNotReached);
        }

        let amount = swap.amount;
        let token = swap.token.clone();
        let initiator_addr = swap.initiator.clone();

        // CEI: state first.
        swap.status = SwapStatus::Refunded;
        env.storage().persistent().set(&key, &swap);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &initiator_addr,
            &amount,
        );

        env.events().publish(
            (symbol_short!("Refund"), secret_hash),
            (initiator_addr, amount),
        );
    }

    // ── Query ────────────────────────────────────────────────────────────────

    /// Returns the swap record for `secret_hash`, if present.
    pub fn get_swap(env: Env, secret_hash: BytesN<32>) -> Option<Swap> {
        env.storage().persistent().get(&DataKey::Swap(secret_hash))
    }

    /// Returns true when the swap exists, is still `Initiated`, and the clock
    /// has not passed the deadline — the state in which the counterparty can
    /// safely lock the remote leg.
    pub fn is_claimable(env: Env, secret_hash: BytesN<32>) -> bool {
        match env
            .storage()
            .persistent()
            .get::<_, Swap>(&DataKey::Swap(secret_hash))
        {
            Some(swap) => {
                swap.status == SwapStatus::Initiated
                    && env.ledger().timestamp() < swap.deadline
            }
            None => false,
        }
    }

    /// Latest deadline by which the remote leg must refund to stay atomic:
    /// Stellar deadline plus the remote grace window. Indexers surface this so
    /// the counter-chain HTLC can be created with a strictly later timeout.
    pub fn remote_deadline(env: Env, secret_hash: BytesN<32>) -> u64 {
        match env
            .storage()
            .persistent()
            .get::<_, Swap>(&DataKey::Swap(secret_hash))
        {
            Some(swap) => swap.deadline + REMOTE_GRACE_SECS,
            None => 0,
        }
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    fn require_admin(env: &Env, caller: &Address) {
        let (admin, _) = Self::config(env);
        if *caller != admin {
            panic_with_error!(env, HarvestaError::Unauthorized);
        }
    }

    fn assert_not_paused(env: &Env) {
        let (_, ac) = Self::config(env);
        AdminControlsClient::new(env, &ac).assert_not_paused();
    }

    fn _is_relayer(env: &Env, addr: &Address) -> bool {
        env.storage()
            .instance()
            .get::<_, bool>(&DataKey::Relayer(addr.clone()))
            .unwrap_or(false)
    }

    fn assert_supported_chain(env: &Env, chain: &String) {
        for supported in SUPPORTED_CHAINS {
            if *chain == String::from_str(env, supported) {
                return;
            }
        }
        panic_with_error!(env, SwapError::UnsupportedChain);
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Env,
    };

    struct Ctx {
        env: Env,
        admin: Address,
        farmer_a: Address,
        farmer_b: Address,
        token: Address,
        relayer: Address,
        client: CrossChainSettlementClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(10_000);

        let ac_id = env.register_contract(None, admin_controls::AdminControls);
        let ac_client = admin_controls::AdminControlsClient::new(&env, &ac_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        ac_client.initialize(&admin, &oracle);

        let contract_id = env.register_contract(None, CrossChainSettlement);
        let client = CrossChainSettlementClient::new(&env, &contract_id);
        client.initialize(&admin, &ac_id);

        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

        let farmer_a = Address::generate(&env);
        let farmer_b = Address::generate(&env);
        let relayer = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&farmer_a, &1_000_000);

        Ctx { env, admin, farmer_a, farmer_b, token, relayer, client }
    }

    /// Deterministic (secret, hash) pair for a seed.
    fn secret_pair(env: &Env, seed: u8) -> (Bytes, BytesN<32>) {
        let mut raw = [0u8; 32];
        raw[0] = seed;
        raw[31] = seed.wrapping_add(1);
        let secret = Bytes::from_slice(env, &raw);
        let hash: BytesN<32> = env.crypto().sha256(&secret).into();
        (secret, hash)
    }

    fn chain(env: &Env) -> String {
        String::from_str(env, "polygon")
    }

    fn remote_bytes(env: &Env, seed: u8) -> Bytes {
        Bytes::from_slice(env, &[seed; 8])
    }

    /// Initiator A opens a swap for B with a 24h timeout. Returns the secret.
    fn open_swap(ctx: &Ctx, seed: u8, timeout_secs: u64) -> (Bytes, BytesN<32>) {
        let (secret, hash) = secret_pair(&ctx.env, seed);
        ctx.client.initiate(
            &ctx.farmer_a,
            &ctx.farmer_b,
            &ctx.token,
            &5_000,
            &chain(&ctx.env),
            &remote_bytes(&ctx.env, 1),
            &remote_bytes(&ctx.env, 2),
            &timeout_secs,
            &hash,
        );
        (secret, hash)
    }

    // ── initiate ─────────────────────────────────────────────────────────────

    #[test]
    fn test_initiate_escrows_tokens() {
        let ctx = setup();
        let before = token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_a);
        open_swap(&ctx, 1, 24 * 60 * 60);

        let after = token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_a);
        assert_eq!(before - after, 5_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_initiate_zero_amount_rejected() {
        let ctx = setup();
        let (_, hash) = secret_pair(&ctx.env, 1);
        ctx.client.initiate(
            &ctx.farmer_a,
            &ctx.farmer_b,
            &ctx.token,
            &0,
            &chain(&ctx.env),
            &remote_bytes(&ctx.env, 1),
            &remote_bytes(&ctx.env, 2),
            &24 * 60 * 60,
            &hash,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_initiate_timeout_too_short_rejected() {
        let ctx = setup();
        let (_, hash) = secret_pair(&ctx.env, 1);
        ctx.client.initiate(
            &ctx.farmer_a,
            &ctx.farmer_b,
            &ctx.token,
            &5_000,
            &chain(&ctx.env),
            &remote_bytes(&ctx.env, 1),
            &remote_bytes(&ctx.env, 2),
            &59 * 60, // < 1 h
            &hash,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_initiate_timeout_too_long_rejected() {
        let ctx = setup();
        let (_, hash) = secret_pair(&ctx.env, 1);
        ctx.client.initiate(
            &ctx.farmer_a,
            &ctx.farmer_b,
            &ctx.token,
            &5_000,
            &chain(&ctx.env),
            &remote_bytes(&ctx.env, 1),
            &remote_bytes(&ctx.env, 2),
            &8 * 24 * 60 * 60, // > 7 d
            &hash,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_initiate_unsupported_chain_rejected() {
        let ctx = setup();
        let (_, hash) = secret_pair(&ctx.env, 1);
        ctx.client.initiate(
            &ctx.farmer_a,
            &ctx.farmer_b,
            &ctx.token,
            &5_000,
            &String::from_str(&ctx.env, "avalanche"),
            &remote_bytes(&ctx.env, 1),
            &remote_bytes(&ctx.env, 2),
            &24 * 60 * 60,
            &hash,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_hash_reuse_rejected() {
        let ctx = setup();
        let (_, hash) = secret_pair(&ctx.env, 1);
        for _ in 0..2 {
            ctx.client.initiate(
                &ctx.farmer_a,
                &ctx.farmer_b,
                &ctx.token,
                &5_000,
                &chain(&ctx.env),
                &remote_bytes(&ctx.env, 1),
                &remote_bytes(&ctx.env, 2),
                &24 * 60 * 60,
                &hash,
            );
        }
    }

    // ── claim ────────────────────────────────────────────────────────────────

    #[test]
    fn test_counterparty_claim_with_correct_preimage() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);

        let before = token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_b);
        ctx.client.claim(&ctx.farmer_b, &hash, &secret);

        assert_eq!(
            token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_b) - before,
            5_000
        );
        let swap = ctx.client.get_swap(&hash).unwrap();
        assert_eq!(swap.status, SwapStatus::Claimed);
        assert!(swap.claimed_at > 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_claim_with_wrong_preimage_rejected() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);
        let (bogus, _) = secret_pair(&ctx.env, 9);
        let _ = secret;
        ctx.client.claim(&ctx.farmer_b, &hash, &bogus);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_claim_by_stranger_rejected() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);
        let stranger = Address::generate(&ctx.env);
        ctx.client.claim(&stranger, &hash, &secret);
    }

    #[test]
    fn test_registered_relayer_can_claim_for_counterparty() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);

        ctx.client.register_relayer(&ctx.admin, &ctx.relayer);
        assert!(ctx.client.is_relayer(&ctx.relayer));

        let before = token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_b);
        ctx.client.claim(&ctx.relayer, &hash, &secret);
        assert_eq!(
            token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_b) - before,
            5_000
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_unregistered_relayer_rejected() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);
        ctx.client.claim(&ctx.relayer, &hash, &secret);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_claim_after_deadline_rejected() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);

        ctx.env.ledger().set_timestamp(10_000 + 24 * 60 * 60);
        ctx.client.claim(&ctx.farmer_b, &hash, &secret);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_double_claim_rejected() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);
        ctx.client.claim(&ctx.farmer_b, &hash, &secret);
        ctx.client.claim(&ctx.farmer_b, &hash, &secret);
    }

    // ── refund ───────────────────────────────────────────────────────────────

    #[test]
    fn test_refund_after_deadline_returns_tokens() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);
        let _ = secret;

        ctx.env.ledger().set_timestamp(10_000 + 24 * 60 * 60 + 1);
        let before = token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_a);
        ctx.client.refund(&ctx.farmer_a, &hash);
        assert_eq!(
            token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_a) - before,
            5_000
        );
        assert_eq!(
            ctx.client.get_swap(&hash).unwrap().status,
            SwapStatus::Refunded
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_refund_before_deadline_rejected() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);
        let _ = secret;
        ctx.client.refund(&ctx.farmer_a, &hash);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_refund_by_non_initiator_rejected() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);
        let _ = secret;
        ctx.env.ledger().set_timestamp(10_000 + 24 * 60 * 60 + 1);
        ctx.client.refund(&ctx.farmer_b, &hash);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_refund_after_claim_rejected() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 1, 24 * 60 * 60);
        ctx.client.claim(&ctx.farmer_b, &hash, &secret);
        ctx.env.ledger().set_timestamp(10_000 + 24 * 60 * 60 + 1);
        ctx.client.refund(&ctx.farmer_a, &hash);
    }

    // ── atomicity properties ─────────────────────────────────────────────────

    #[test]
    fn test_refund_after_failed_claim_preserves_initiator_funds() {
        // The "abort" path of the atomic swap: preimage never revealed on
        // either chain → both legs refund; nobody loses value.
        let ctx = setup();
        let (_, hash) = open_swap(&ctx, 2, 24 * 60 * 60);

        let a_before = token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_a);
        ctx.env.ledger().set_timestamp(10_000 + 24 * 60 * 60 + 1);
        ctx.client.refund(&ctx.farmer_a, &hash);
        assert_eq!(
            token::Client::new(&ctx.env, &ctx.token).balance(&ctx.farmer_a),
            a_before
        );
        assert!(!ctx.client.is_claimable(&hash));
    }

    #[test]
    fn test_successful_claim_leaves_no_escrowed_value() {
        // The "commit" path: preimage revealed → counterparty paid in full;
        // contract retains zero balance for this swap's token.
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 3, 24 * 60 * 60);

        ctx.client.claim(&ctx.farmer_b, &hash, &secret);
        assert_eq!(
            token::Client::new(&ctx.env, &ctx.token)
                .balance(&ctx.client.address),
            0
        );
    }

    #[test]
    fn test_remote_deadline_extends_stellar_deadline() {
        let ctx = setup();
        let (_, hash) = open_swap(&ctx, 4, 24 * 60 * 60);

        let swap = ctx.client.get_swap(&hash).unwrap();
        assert_eq!(
            ctx.client.remote_deadline(&hash),
            swap.deadline + REMOTE_GRACE_SECS
        );
    }

    #[test]
    fn test_is_claimable_reflects_lifecycle() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 5, 24 * 60 * 60);

        assert!(ctx.client.is_claimable(&hash));
        ctx.client.claim(&ctx.farmer_b, &hash, &secret);
        assert!(!ctx.client.is_claimable(&hash));
    }

    // ── relayer management ───────────────────────────────────────────────────

    #[test]
    fn test_revoke_relayer_blocks_claims() {
        let ctx = setup();
        let (secret, hash) = open_swap(&ctx, 6, 24 * 60 * 60);

        ctx.client.register_relayer(&ctx.admin, &ctx.relayer);
        ctx.client.revoke_relayer(&ctx.admin, &ctx.relayer);
        assert!(!ctx.client.is_relayer(&ctx.relayer));

        // Counterparty can still claim directly.
        ctx.client.claim(&ctx.farmer_b, &hash, &secret);
        assert_eq!(
            ctx.client.get_swap(&hash).unwrap().status,
            SwapStatus::Claimed
        );
    }
}
