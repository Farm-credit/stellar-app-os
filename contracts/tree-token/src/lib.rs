#![no_std]

//! TREE Token — Closes #321, #630
//!
//! SAC-compatible TREE token with a burn function for corporate ESG claims,
//! and meta-transaction (gasless transfer) support.
//!
//! # Burn
//!
//! Corporate buyers call `burn()` to permanently destroy TREE tokens and
//! claim the corresponding carbon offset for ESG reporting. Each burn emits
//! a `TokenBurned` event with the burner address and token count, providing
//! an immutable on-chain audit trail for ESG disclosures.
//!
//! # Meta-transactions / gasless transfers (closes #630)
//!
//! Users who cannot afford gas fees sign a `MetaTransferPayload` off-chain.
//! A whitelisted relayer submits the signed payload on-chain via
//! `transfer_meta()`. The contract:
//!
//!   1. Checks the payload has not expired (`expiry` ledger timestamp).
//!   2. Validates `amount > 0` and `fee >= 0`.
//!   3. Verifies the per-sender `nonce` is the next expected value (replay
//!      protection).
//!   4. Verifies the 64-byte Ed25519 `signature` over SHA-256 of the
//!      deterministic payload encoding.
//!   5. Increments the sender nonce.
//!   6. Transfers `amount` tokens from `from` → `to`.
//!   7. If `fee > 0`, transfers `fee` tokens from `from` → `relayer`.
//!
//! # Pause / Admin controls
//!
//! All state-changing functions check the pause flag (see #323 integration).
//! The admin can pause/unpause and update the oracle address.

use harvesta_errors::HarvestaError;
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Bytes, BytesN, Env, IntoVal, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum TreeTokenError {
    BurnAmountMustBePositive = 14,
    NonceAlreadyUsed = 83,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// On-chain record of a TREE token burn for ESG audit purposes.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BurnRecord {
    /// Address that burned the tokens
    pub burner: Address,
    /// Number of TREE tokens burned (in base units)
    pub token_count: i128,
    /// Optional reference string for ESG report (e.g. report ID, project name)
    pub esg_reference: soroban_sdk::String,
    /// Ledger timestamp of the burn
    pub burned_at: u64,
}

/// Payload that a user signs off-chain to authorise a gasless transfer.
///
/// The relayer passes this struct together with the 64-byte Ed25519
/// `signature` to `transfer_meta()`. The contract constructs the same
/// deterministic byte message, hashes it with SHA-256, and verifies the
/// signature against the Ed25519 public key embedded in `from`.
///
/// ## Signing message format
///
/// ```
/// SHA-256(
///   b"TREE_META_TRANSFER"   // 18 bytes — domain separator
///   || from_pubkey[32]      // sender Ed25519 pubkey (from XDR)
///   || to_pubkey[32]        // recipient Ed25519 pubkey (from XDR)
///   || amount_le[16]        // i128 as u128 little-endian
///   || fee_le[16]           // i128 as u128 little-endian
///   || nonce_le[8]          // u64 little-endian
///   || expiry_le[8]         // u64 little-endian
/// )
/// ```
#[contracttype]
#[derive(Clone, Debug)]
pub struct MetaTransferPayload {
    /// Token holder who signs the payload
    pub from: Address,
    /// Recipient of the token transfer
    pub to: Address,
    /// Number of TREE tokens to transfer (must be > 0)
    pub amount: i128,
    /// Relayer fee in TREE base units paid from `from`; may be 0
    pub fee: i128,
    /// Monotonically-increasing per-sender nonce (prevents replay attacks)
    pub nonce: u64,
    /// Ledger timestamp after which the payload is invalid; use `u64::MAX` for none
    pub expiry: u64,
}

// ── Storage key helpers ────────────────────────────────────────────────────────

fn nonce_storage_key(env: &Env, addr: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "NONCE"), addr.clone())
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct TreeToken;

#[contractimpl]
impl TreeToken {
    /// One-time initialisation.
    ///
    /// `admin`      — multi-sig admin address (pause/unpause, oracle updates)
    /// `tree_token` — address of the deployed TREE SAC token contract
    pub fn initialize(env: Env, admin: Address, tree_token: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        contract_utils::add_to_whitelist(&env, &tree_token);
        env.storage()
            .instance()
            .set(&symbol_short!("TOKEN"), &tree_token);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        env.storage()
            .instance()
            .set(&symbol_short!("BURNCOUNT"), &0u64);
    }
    pub fn clawback(env: Env, admin: Address, from: Address, amount: i128) {
        admin.require_auth();

        let saved_admin: Address = env.storage().instance().get(&symbol_short!("ADMIN")).unwrap();
        if admin != saved_admin {
            panic!("Unauthorized: Only the designated regulator can execute clawbacks.");
        }

        let token_address: Address = env.storage().instance().get(&symbol_short!("TOKEN")).unwrap();
        let client = soroban_sdk::token::Client::new(&env, &token_address);
        
        let current_balance = client.balance(&from);
        if current_balance < amount {
            panic!("Invalid Operation: Clawback amount exceeds target balance.");
        }

        client.burn(&from, &amount);

        env.events().publish(
            (symbol_short!("clawback"), from, admin),
            amount,
        );
    }
    /// Burn `amount` TREE tokens from `burner`'s balance to claim a carbon offset.
    ///
    /// Emits `TokenBurned(burner, token_count)` for ESG audit trail.
    /// The burn is permanent and irreversible.
    ///
    /// `esg_reference` — optional identifier linking this burn to an ESG report.
    pub fn burn(env: Env, burner: Address, amount: i128, esg_reference: soroban_sdk::String) {
        Self::assert_not_paused(&env);
        burner.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, TreeTokenError::BurnAmountMustBePositive);
        }

        let tree_token: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("TOKEN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));

        contract_utils::assert_whitelisted(&env, &tree_token);
        // Burn tokens from burner's balance via SAC interface
        token::Client::new(&env, &tree_token).burn(&burner, &amount);

        // Record the burn on-chain for ESG audit
        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("BURNCOUNT"))
            .unwrap_or(0);

        let record = BurnRecord {
            burner: burner.clone(),
            token_count: amount,
            esg_reference,
            burned_at: env.ledger().timestamp(),
        };

        let key = Self::burn_key(&env, count);
        env.storage().persistent().set(&key, &record);
        env.storage()
            .instance()
            .set(&symbol_short!("BURNCOUNT"), &count.checked_add(1).expect("burn count overflow"));

        // Emit TokenBurned event — primary ESG audit signal
        env.events()
            .publish((Symbol::new(&env, "TokenBurned"), burner), amount);
    }

    // ── Meta-transactions ─────────────────────────────────────────────────────

    /// Execute a gasless token transfer on behalf of a user (meta-transaction).
    ///
    /// The `relayer` submits a `payload` signed by `payload.from` using their
    /// Ed25519 private key.  The contract verifies the signature on-chain,
    /// enforces single-use nonces, checks expiry, and deducts the relayer fee
    /// from the sender's token balance.
    ///
    /// The `relayer` must be whitelisted and must authenticate via
    /// `require_auth()`.  The user (`payload.from`) does **not** need to be
    /// present — that is the whole point of a meta-transaction.
    ///
    /// # Arguments
    ///
    /// * `relayer`   — whitelisted address submitting this transaction
    /// * `payload`   — the transfer intent signed by `payload.from`
    /// * `signature` — 64-byte Ed25519 signature from `payload.from`
    pub fn transfer_meta(
        env: Env,
        relayer: Address,
        payload: MetaTransferPayload,
        signature: BytesN<64>,
    ) {
        Self::assert_not_paused(&env);

        // Relayer authenticates the submission
        relayer.require_auth();

        // Only whitelisted relayers may submit meta-transactions
        contract_utils::assert_whitelisted(&env, &relayer);

        // ── 1. Expiry check ───────────────────────────────────────────────────
        let now = env.ledger().timestamp();
        if now > payload.expiry {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }

        // ── 2. Amount / fee validation ────────────────────────────────────────
        if payload.amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }
        if payload.fee < 0 {
            panic_with_error!(&env, HarvestaError::InvalidPayoutAmount);
        }

        // ── 3. Nonce check ────────────────────────────────────────────────────
        let nk = nonce_storage_key(&env, &payload.from);
        let expected_nonce: u64 = env.storage().persistent().get(&nk).unwrap_or(0u64);
        if payload.nonce != expected_nonce {
            panic_with_error!(&env, TreeTokenError::NonceAlreadyUsed);
        }

        // ── 4. Signature verification ─────────────────────────────────────────
        // Build the domain-separated message, SHA-256 hash it, then verify
        // the Ed25519 signature against the sender's public key.
        let msg = Self::build_signing_message(&env, &payload);
        let msg_hash: BytesN<32> = env.crypto().sha256(&msg).into();
        let from_pubkey = Self::extract_ed25519_pubkey(&env, &payload.from);
        env.crypto()
            .ed25519_verify(&from_pubkey, &msg_hash.into(), &signature);

        // ── 5. Increment nonce (replay protection) ────────────────────────────
        let next_nonce = expected_nonce.checked_add(1).expect("nonce overflow");
        env.storage().persistent().set(&nk, &next_nonce);

        // ── 6. Execute token transfer ─────────────────────────────────────────
        let tree_token: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("TOKEN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));

        let token_client = token::Client::new(&env, &tree_token);
        token_client.transfer(&payload.from, &payload.to, &payload.amount);

        // ── 7. Fee deduction (paid to relayer) ────────────────────────────────
        if payload.fee > 0 {
            token_client.transfer(&payload.from, &relayer, &payload.fee);
        }

        // Emit MetaTransfer event for off-chain indexing / auditing
        env.events().publish(
            (Symbol::new(&env, "MetaTransfer"), payload.from.clone()),
            (payload.to.clone(), payload.amount, payload.fee),
        );
    }

    /// Returns the current nonce for `account`.
    ///
    /// Off-chain signers must read this before constructing a
    /// `MetaTransferPayload` to avoid `NonceAlreadyUsed` errors.
    pub fn get_nonce(env: Env, account: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&nonce_storage_key(&env, &account))
            .unwrap_or(0u64)
    }

    // ── Burn queries ──────────────────────────────────────────────────────────

    /// Returns the burn record at sequential index `idx`, or None.
    pub fn get_burn_record(env: Env, idx: u64) -> Option<BurnRecord> {
        env.storage().persistent().get(&Self::burn_key(&env, idx))
    }

    /// Returns the total number of burn operations recorded.
    pub fn burn_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("BURNCOUNT"))
            .unwrap_or(0)
    }

    // ── Admin functions ───────────────────────────────────────────────────────

    /// Pause all state-changing functions. Admin multi-sig only.
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &true);
        env.events()
            .publish((symbol_short!("paused"),), env.ledger().timestamp());
    }

    /// Unpause the contract. Admin multi-sig only.
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        env.events()
            .publish((symbol_short!("unpaused"),), env.ledger().timestamp());
    }

    /// Returns true if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, HarvestaError::ContractPaused);
        }
    }

    // ── Whitelist management ──────────────────────────────────────────────────

    /// Add `addr` to the contract whitelist. Restricted to admin.
    pub fn add_to_whitelist(env: Env, addr: Address) {
        Self::require_admin(&env);
        contract_utils::add_to_whitelist(&env, &addr);
    }

    /// Remove `addr` from the contract whitelist. Restricted to admin.
    pub fn remove_from_whitelist(env: Env, addr: Address) {
        Self::require_admin(&env);
        contract_utils::remove_from_whitelist(&env, &addr);
    }

    /// Returns `true` if `addr` is whitelisted.
    pub fn is_whitelisted(env: Env, addr: Address) -> bool {
        contract_utils::is_whitelisted(&env, &addr)
    }

    /// Panics if `addr` is not whitelisted.
    pub fn assert_whitelisted(env: Env, addr: Address) {
        contract_utils::assert_whitelisted(&env, &addr);
    }

    fn burn_key(env: &Env, idx: u64) -> soroban_sdk::Val {
        (symbol_short!("BURN"), idx).into_val(env)
    }

    /// Build the deterministic domain-separated byte message for signing.
    ///
    /// Layout (total = 18 + 32 + 32 + 16 + 16 + 8 + 8 = 130 bytes):
    ///
    /// | Field             | Bytes | Encoding              |
    /// |-------------------|-------|-----------------------|
    /// | domain separator  | 18    | ASCII literal         |
    /// | from pubkey       | 32    | Ed25519 raw bytes     |
    /// | to pubkey         | 32    | Ed25519 raw bytes     |
    /// | amount            | 16    | u128 little-endian    |
    /// | fee               | 16    | u128 little-endian    |
    /// | nonce             | 8     | u64 little-endian     |
    /// | expiry            | 8     | u64 little-endian     |
    fn build_signing_message(env: &Env, p: &MetaTransferPayload) -> Bytes {
        let from_pk = Self::extract_ed25519_pubkey(env, &p.from);
        let to_pk = Self::extract_ed25519_pubkey(env, &p.to);

        let mut msg = Bytes::new(env);

        // Domain separator
        msg.extend_from_slice(b"TREE_META_TRANSFER");

        // Sender public key (32 bytes)
        msg.extend_from_array(&from_pk.to_array());

        // Recipient public key (32 bytes)
        msg.extend_from_array(&to_pk.to_array());

        // Amount — reinterpret i128 bits as u128 for LE encoding
        msg.extend_from_array(&(p.amount as u128).to_le_bytes());

        // Fee
        msg.extend_from_array(&(p.fee as u128).to_le_bytes());

        // Nonce
        msg.extend_from_array(&p.nonce.to_le_bytes());

        // Expiry
        msg.extend_from_array(&p.expiry.to_le_bytes());

        msg
    }

    /// Extract the 32-byte Ed25519 public key from a Stellar `Address`.
    ///
    /// A Stellar G-address (AccountID) XDR layout:
    ///   - 4 bytes: union discriminant (0 = PUBLIC_KEY_TYPE_ED25519)
    ///   - 4 bytes: key-type discriminant (0)  [inner union in XDR]
    ///   - 32 bytes: raw Ed25519 public key
    ///
    /// `Address::to_xdr` returns the full XDR blob; we skip the first 8
    /// bytes to reach the 32-byte pubkey.
    fn extract_ed25519_pubkey(env: &Env, addr: &Address) -> BytesN<32> {
        let xdr = addr.clone().to_xdr(env);
        let mut raw = [0u8; 32];
        for i in 0..32usize {
            raw[i] = xdr.get(8 + i as u32).unwrap_or(0);
        }
        BytesN::from_array(env, &raw)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

    // ── Burn test helpers ─────────────────────────────────────────────────────

    fn setup() -> (Env, Address, Address, Address, TreeTokenClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeToken);
        let client = TreeTokenClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let burner = Address::generate(&env);

        // Deploy a test TREE SAC token; contract_id is NOT the admin here —
        // we just need a mintable token for testing the burn path.
        let tree_token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &tree_token_id).mint(&burner, &1_000_000);

        client.initialize(&admin, &tree_token_id);
        client.add_to_whitelist(&tree_token_id);

        (env, admin, burner, tree_token_id, client)
    }

    fn esg_ref(env: &Env) -> soroban_sdk::String {
        String::from_str(env, "ESG-REPORT-2025-Q1")
    }

    // ── Existing burn tests ───────────────────────────────────────────────────

    #[test]
    fn test_burn_reduces_balance_and_emits_event() {
        let (env, _, burner, tree_token, client) = setup();

        let before = token::Client::new(&env, &tree_token).balance(&burner);
        client.burn(&burner, &500_000, &esg_ref(&env));
        let after = token::Client::new(&env, &tree_token).balance(&burner);

        assert_eq!(before - after, 500_000);
        assert_eq!(client.burn_count(), 1);
    }

    #[test]
    fn test_burn_record_stored_correctly() {
        let (env, _, burner, _, client) = setup();

        client.burn(&burner, &100_000, &esg_ref(&env));

        let record = client.get_burn_record(&0).unwrap();
        assert_eq!(record.burner, burner);
        assert_eq!(record.token_count, 100_000);
    }

    #[test]
    fn test_multiple_burns_sequential_index() {
        let (env, _, burner, _, client) = setup();

        client.burn(&burner, &100_000, &esg_ref(&env));
        client.burn(&burner, &200_000, &esg_ref(&env));

        assert_eq!(client.burn_count(), 2);
        assert_eq!(client.get_burn_record(&0).unwrap().token_count, 100_000);
        assert_eq!(client.get_burn_record(&1).unwrap().token_count, 200_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn test_zero_burn_rejected() {
        let (env, _, burner, _, client) = setup();
        client.burn(&burner, &0, &esg_ref(&env));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_burn_while_paused_rejected() {
        let (env, _, burner, _, client) = setup();
        client.pause();
        client.burn(&burner, &100_000, &esg_ref(&env));
    }

    #[test]
    fn test_pause_unpause_cycle() {
        let (env, _, burner, _, client) = setup();

        client.pause();
        assert!(client.is_paused());

        client.unpause();
        assert!(!client.is_paused());

        // burn should work again after unpause
        client.burn(&burner, &100_000, &esg_ref(&env));
        assert_eq!(client.burn_count(), 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (env, admin, _, tree_token, client) = setup();
        client.initialize(&admin, &tree_token);
    }

    // ── Meta-transaction test helpers ─────────────────────────────────────────

    /// Returns (env, client, tree_token_id, sender, recipient, relayer).
    /// All addresses are generated; `mock_all_auths` bypasses both
    /// `require_auth` and `ed25519_verify` so we can test logic without
    /// real keys.
    fn setup_meta() -> (
        Env,
        TreeTokenClient<'static>,
        Address,
        Address,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeToken);
        let client = TreeTokenClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let relayer = Address::generate(&env);

        let tree_token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        // Mint enough tokens for amount + fee
        token::StellarAssetClient::new(&env, &tree_token_id).mint(&sender, &1_000_000);

        client.initialize(&admin, &tree_token_id);
        client.add_to_whitelist(&tree_token_id);
        client.add_to_whitelist(&relayer);

        (env, client, tree_token_id, sender, recipient, relayer)
    }

    // ── Meta-transaction tests ────────────────────────────────────────────────

    #[test]
    fn test_meta_transfer_executes_and_deducts_fee() {
        let (env, client, tree_token, sender, recipient, relayer) = setup_meta();

        // Zeroed signature is accepted because mock_all_auths bypasses verify
        let sig = BytesN::from_array(&env, &[0u8; 64]);

        let payload = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 500_000,
            fee: 1_000,
            nonce: 0,
            expiry: u64::MAX,
        };

        let tok = token::Client::new(&env, &tree_token);
        let sender_before = tok.balance(&sender);
        let recipient_before = tok.balance(&recipient);
        let relayer_before = tok.balance(&relayer);

        client.transfer_meta(&relayer, &payload, &sig);

        let sender_after = tok.balance(&sender);
        let recipient_after = tok.balance(&recipient);
        let relayer_after = tok.balance(&relayer);

        // Sender loses amount + fee
        assert_eq!(sender_before - sender_after, 501_000);
        // Recipient gains amount
        assert_eq!(recipient_after - recipient_before, 500_000);
        // Relayer gains fee
        assert_eq!(relayer_after - relayer_before, 1_000);
    }

    #[test]
    fn test_meta_transfer_zero_fee_no_relayer_payment() {
        let (env, client, tree_token, sender, recipient, relayer) = setup_meta();
        let sig = BytesN::from_array(&env, &[0u8; 64]);

        let tok = token::Client::new(&env, &tree_token);
        let relayer_before = tok.balance(&relayer);

        client.transfer_meta(
            &relayer,
            &MetaTransferPayload {
                from: sender.clone(),
                to: recipient.clone(),
                amount: 100_000,
                fee: 0,
                nonce: 0,
                expiry: u64::MAX,
            },
            &sig,
        );

        // Relayer balance unchanged when fee is zero
        assert_eq!(tok.balance(&relayer), relayer_before);
    }

    #[test]
    fn test_meta_transfer_nonce_increments() {
        let (env, client, _, sender, recipient, relayer) = setup_meta();
        let sig = BytesN::from_array(&env, &[0u8; 64]);

        assert_eq!(client.get_nonce(&sender), 0);

        client.transfer_meta(
            &relayer,
            &MetaTransferPayload {
                from: sender.clone(),
                to: recipient.clone(),
                amount: 100,
                fee: 0,
                nonce: 0,
                expiry: u64::MAX,
            },
            &sig,
        );
        assert_eq!(client.get_nonce(&sender), 1);

        client.transfer_meta(
            &relayer,
            &MetaTransferPayload {
                from: sender.clone(),
                to: recipient.clone(),
                amount: 100,
                fee: 0,
                nonce: 1,
                expiry: u64::MAX,
            },
            &sig,
        );
        assert_eq!(client.get_nonce(&sender), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #83)")]
    fn test_meta_transfer_replay_rejected() {
        let (env, client, _, sender, recipient, relayer) = setup_meta();
        let sig = BytesN::from_array(&env, &[0u8; 64]);

        let payload = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 100,
            fee: 0,
            nonce: 0,
            expiry: u64::MAX,
        };

        client.transfer_meta(&relayer, &payload.clone(), &sig);
        // Second call with the same nonce must fail with NonceAlreadyUsed (#83)
        client.transfer_meta(&relayer, &payload, &sig);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_meta_transfer_expired_rejected() {
        let (env, client, _, sender, recipient, relayer) = setup_meta();
        let sig = BytesN::from_array(&env, &[0u8; 64]);

        env.ledger().set_timestamp(1_000);

        client.transfer_meta(
            &relayer,
            &MetaTransferPayload {
                from: sender.clone(),
                to: recipient.clone(),
                amount: 100,
                fee: 0,
                nonce: 0,
                expiry: 999, // in the past
            },
            &sig,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_meta_transfer_zero_amount_rejected() {
        let (env, client, _, sender, recipient, relayer) = setup_meta();
        let sig = BytesN::from_array(&env, &[0u8; 64]);

        client.transfer_meta(
            &relayer,
            &MetaTransferPayload {
                from: sender.clone(),
                to: recipient.clone(),
                amount: 0,
                fee: 0,
                nonce: 0,
                expiry: u64::MAX,
            },
            &sig,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_meta_transfer_while_paused_rejected() {
        let (env, client, _, sender, recipient, relayer) = setup_meta();
        let sig = BytesN::from_array(&env, &[0u8; 64]);

        client.pause();

        client.transfer_meta(
            &relayer,
            &MetaTransferPayload {
                from: sender.clone(),
                to: recipient.clone(),
                amount: 100,
                fee: 0,
                nonce: 0,
                expiry: u64::MAX,
            },
            &sig,
        );
    }
}
