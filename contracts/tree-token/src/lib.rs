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
//! # Permit / gasless approval (closes #765)
//!
//! A SEP-0011 / EIP-2612 style "permit": users sign a `PermitPayload`
//! off-chain granting a spender an allowance, without paying gas or
//! submitting a transaction themselves. Anyone may submit the signed
//! payload to `permit()`, which verifies the signature and records the
//! allowance — no tokens move at this step. The `spender` later calls
//! `transfer_from()` (with their own `require_auth()`) to draw against that
//! allowance, mirroring the classic `approve` + `transferFrom` split. This
//! is distinct from `transfer_meta`: a permit only authorises future
//! spending, it does not transfer tokens itself.
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
    StakeAmountMustBePositive = 84,
    UnstakeAmountMustBePositive = 85,
    InsufficientStake = 86,
    RewardAmountMustBePositive = 87,
    /// `permit()` amount must be zero or positive; zero explicitly revokes
    /// any existing allowance for the `(owner, spender)` pair.
    PermitAmountMustBeNonNegative = 88,
    /// The permit's `deadline` has already elapsed at submission time.
    PermitExpired = 89,
    /// The permit's `nonce` does not match the owner's next expected permit
    /// nonce (replay protection; independent of the `transfer_meta` nonce).
    InvalidPermitNonce = 92,
    /// `transfer_from` requested more than the spender's remaining allowance.
    InsufficientAllowance = 93,
    /// The allowance granted by `permit()` has passed its `deadline`.
    AllowanceExpired = 94,
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
/// ```text
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

/// A spending allowance granted by `permit()`, consumed by `transfer_from()`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Allowance {
    /// Remaining amount `spender` may transfer on the owner's behalf.
    pub amount: i128,
    /// Ledger timestamp after which this allowance can no longer be spent,
    /// even if `amount` has not been fully drawn down.
    pub expiration: u64,
}

/// Payload that a token holder signs off-chain to authorise `spender` to
/// transfer up to `amount` tokens on their behalf — a SEP-0011 / EIP-2612
/// style "permit". Unlike [`MetaTransferPayload`], a permit does not move
/// any tokens itself; it only records an allowance that `transfer_from()`
/// later draws against, mirroring the classic `approve` + `transferFrom`
/// split.
///
/// Anyone may submit this payload together with the signature to
/// `permit()` — typically the `spender` or a relayer acting for them —
/// since authorisation comes entirely from the Ed25519 signature, not from
/// the submitter's identity. The contract constructs the same
/// deterministic byte message, hashes it with SHA-256, and verifies the
/// signature against the Ed25519 public key embedded in `owner`.
///
/// ## Signing message format
///
/// ```text
/// SHA-256(
///   b"TREE_PERMIT"          // 11 bytes — domain separator
///   || owner_pubkey[32]     // owner Ed25519 pubkey (from XDR)
///   || spender_pubkey[32]   // spender Ed25519 pubkey (from XDR)
///   || amount_le[16]        // i128 as u128 little-endian
///   || nonce_le[8]          // u64 little-endian
///   || deadline_le[8]       // u64 little-endian
/// )
/// ```
#[contracttype]
#[derive(Clone, Debug)]
pub struct PermitPayload {
    /// Token holder who signs the payload and grants the allowance.
    pub owner: Address,
    /// Address permitted to spend up to `amount` on the owner's behalf.
    pub spender: Address,
    /// Maximum number of TREE tokens the spender may transfer (0 revokes
    /// any existing allowance for this `(owner, spender)` pair).
    pub amount: i128,
    /// Monotonically-increasing per-owner permit nonce (replay protection;
    /// tracked separately from the `transfer_meta` nonce sequence).
    pub nonce: u64,
    /// Ledger timestamp after which the permit signature — and any
    /// allowance it grants — is no longer valid.
    pub deadline: u64,
}

// ── Storage key helpers ────────────────────────────────────────────────────────

fn nonce_storage_key(env: &Env, addr: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "NONCE"), addr.clone())
}

fn permit_nonce_key(env: &Env, owner: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "PNONCE"), owner.clone())
}

fn allowance_key(env: &Env, owner: &Address, spender: &Address) -> (Symbol, Address, Address) {
    (Symbol::new(env, "ALLOW"), owner.clone(), spender.clone())
}

fn staked_balance_key(env: &Env, addr: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "STAKED"), addr.clone())
}

fn user_reward_per_token_paid_key(env: &Env, addr: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "USR_RPT"), addr.clone())
}

fn rewards_key(env: &Env, addr: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "REWARDS"), addr.clone())
}

const REWARD_MULTIPLIER: i128 = 1_000_000_000_000_000_000;


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
        env.storage()
            .instance()
            .set(&symbol_short!("TOT_STKED"), &0i128);
        env.storage()
            .instance()
            .set(&symbol_short!("RPT_STORE"), &0i128);
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

    // ── Staking and Yield Distribution ────────────────────────────────────────

    fn earned(env: &Env, account: &Address) -> i128 {
        let staked_balance: i128 = env.storage().persistent().get(&staked_balance_key(env, account)).unwrap_or(0);
        let rpt_stored: i128 = env.storage().instance().get(&symbol_short!("RPT_STORE")).unwrap_or(0);
        let user_rpt_paid: i128 = env.storage().persistent().get(&user_reward_per_token_paid_key(env, account)).unwrap_or(0);
        let rewards: i128 = env.storage().persistent().get(&rewards_key(env, account)).unwrap_or(0);

        let new_rewards = staked_balance
            .checked_mul(rpt_stored.checked_sub(user_rpt_paid).unwrap_or(0))
            .unwrap_or(0)
            .checked_div(REWARD_MULTIPLIER)
            .unwrap_or(0);

        rewards.checked_add(new_rewards).unwrap_or(0)
    }

    fn update_reward(env: &Env, account: &Option<Address>) {
        let rpt_stored: i128 = env.storage().instance().get(&symbol_short!("RPT_STORE")).unwrap_or(0);
        if let Some(user) = account {
            let earned = Self::earned(env, user);
            env.storage().persistent().set(&rewards_key(env, user), &earned);
            env.storage().persistent().set(&user_reward_per_token_paid_key(env, user), &rpt_stored);
        }
    }

    /// Stake `amount` of TREE tokens to earn yields.
    pub fn stake(env: Env, user: Address, amount: i128) {
        Self::assert_not_paused(&env);
        user.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, TreeTokenError::StakeAmountMustBePositive);
        }

        Self::update_reward(&env, &Some(user.clone()));

        let tree_token: Address = env.storage().instance().get(&symbol_short!("TOKEN")).unwrap();
        token::Client::new(&env, &tree_token).transfer(&user, &env.current_contract_address(), &amount);

        let mut staked: i128 = env.storage().persistent().get(&staked_balance_key(&env, &user)).unwrap_or(0);
        staked = staked.checked_add(amount).unwrap_or(0);
        env.storage().persistent().set(&staked_balance_key(&env, &user), &staked);
        
        let mut total_staked: i128 = env.storage().instance().get(&symbol_short!("TOT_STKED")).unwrap_or(0);
        total_staked = total_staked.checked_add(amount).unwrap_or(0);
        env.storage().instance().set(&symbol_short!("TOT_STKED"), &total_staked);

        env.storage().persistent().extend_ttl(&staked_balance_key(&env, &user), 518400, 1036800);
        env.storage().persistent().extend_ttl(&user_reward_per_token_paid_key(&env, &user), 518400, 1036800);
        env.storage().persistent().extend_ttl(&rewards_key(&env, &user), 518400, 1036800);

        env.events().publish((symbol_short!("staked"), user), amount);
    }

    /// Unstake `amount` of TREE tokens.
    pub fn unstake(env: Env, user: Address, amount: i128) {
        Self::assert_not_paused(&env);
        user.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, TreeTokenError::UnstakeAmountMustBePositive);
        }

        Self::update_reward(&env, &Some(user.clone()));

        let mut staked: i128 = env.storage().persistent().get(&staked_balance_key(&env, &user)).unwrap_or(0);
        if staked < amount {
            panic_with_error!(&env, TreeTokenError::InsufficientStake);
        }
        staked = staked.checked_sub(amount).unwrap_or(0);
        env.storage().persistent().set(&staked_balance_key(&env, &user), &staked);

        let mut total_staked: i128 = env.storage().instance().get(&symbol_short!("TOT_STKED")).unwrap_or(0);
        total_staked = total_staked.checked_sub(amount).unwrap_or(0);
        env.storage().instance().set(&symbol_short!("TOT_STKED"), &total_staked);

        let tree_token: Address = env.storage().instance().get(&symbol_short!("TOKEN")).unwrap();
        token::Client::new(&env, &tree_token).transfer(&env.current_contract_address(), &user, &amount);

        env.storage().persistent().extend_ttl(&staked_balance_key(&env, &user), 518400, 1036800);
        env.storage().persistent().extend_ttl(&user_reward_per_token_paid_key(&env, &user), 518400, 1036800);
        env.storage().persistent().extend_ttl(&rewards_key(&env, &user), 518400, 1036800);

        env.events().publish((symbol_short!("unstaked"), user), amount);
    }

    /// Claim earned TREE tokens from staking.
    pub fn claim_reward(env: Env, user: Address) {
        Self::assert_not_paused(&env);
        user.require_auth();

        Self::update_reward(&env, &Some(user.clone()));

        let reward: i128 = env.storage().persistent().get(&rewards_key(&env, &user)).unwrap_or(0);
        if reward > 0 {
            env.storage().persistent().set(&rewards_key(&env, &user), &0i128);
            let tree_token: Address = env.storage().instance().get(&symbol_short!("TOKEN")).unwrap();
            token::Client::new(&env, &tree_token).transfer(&env.current_contract_address(), &user, &reward);
            env.events().publish((symbol_short!("rew_clm"), user.clone()), reward);
        }
        
        env.storage().persistent().extend_ttl(&staked_balance_key(&env, &user), 518400, 1036800);
        env.storage().persistent().extend_ttl(&user_reward_per_token_paid_key(&env, &user), 518400, 1036800);
        env.storage().persistent().extend_ttl(&rewards_key(&env, &user), 518400, 1036800);
    }

    /// Deposit marketplace trading fee revenues into the reward pool.
    pub fn deposit_reward(env: Env, admin: Address, amount: i128) {
        Self::assert_not_paused(&env);
        let stored_admin: Address = env.storage().instance().get(&symbol_short!("ADMIN")).unwrap();
        if admin != stored_admin {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }
        admin.require_auth(); 

        if amount <= 0 {
            panic_with_error!(&env, TreeTokenError::RewardAmountMustBePositive);
        }

        let total_staked: i128 = env.storage().instance().get(&symbol_short!("TOT_STKED")).unwrap_or(0);
        if total_staked == 0 {
            panic_with_error!(&env, TreeTokenError::InsufficientStake);
        }

        let tree_token: Address = env.storage().instance().get(&symbol_short!("TOKEN")).unwrap();
        token::Client::new(&env, &tree_token).transfer(&admin, &env.current_contract_address(), &amount);

        let rpt_increase = amount.checked_mul(REWARD_MULTIPLIER).unwrap_or(0).checked_div(total_staked).unwrap_or(0);
        let mut rpt_stored: i128 = env.storage().instance().get(&symbol_short!("RPT_STORE")).unwrap_or(0);
        rpt_stored = rpt_stored.checked_add(rpt_increase).unwrap_or(0);
        env.storage().instance().set(&symbol_short!("RPT_STORE"), &rpt_stored);
        
        env.events().publish((symbol_short!("rew_dep"), admin), amount);
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
        env.storage().persistent().extend_ttl(&nk, 518400, 1036800);

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
        let nk = nonce_storage_key(&env, &account);
        let nonce = env.storage().persistent().get(&nk).unwrap_or(0u64);
        if env.storage().persistent().has(&nk) {
            env.storage().persistent().extend_ttl(&nk, 518400, 1036800);
        }
        nonce
    }

    // ── Permit (SEP-0011 / EIP-2612 style gasless approval) ──────────────────

    /// Authorise `payload.spender` to transfer up to `payload.amount` TREE
    /// tokens on behalf of `payload.owner`, using an off-chain Ed25519
    /// signature instead of an on-chain `require_auth()` call from the
    /// owner (SEP-0011 / EIP-2612 style "permit").
    ///
    /// Anyone may submit the call — typically the spender or a relayer
    /// acting on their behalf — since authorisation comes entirely from the
    /// signature, not from the submitter's identity. `permit()` never moves
    /// tokens itself; it only records an allowance that `transfer_from()`
    /// later draws against. The contract:
    ///
    ///   1. Checks the permit has not expired (`deadline` ledger timestamp).
    ///   2. Validates `amount >= 0` (0 revokes any existing allowance).
    ///   3. Verifies the per-owner `nonce` is the next expected value
    ///      (replay protection, independent of the `transfer_meta` nonce
    ///      sequence).
    ///   4. Verifies the 64-byte Ed25519 `signature` over SHA-256 of the
    ///      deterministic payload encoding.
    ///   5. Increments the owner's permit nonce.
    ///   6. Stores/overwrites the `(owner, spender)` allowance with
    ///      `amount`, expiring at `deadline`.
    ///
    /// # Arguments
    ///
    /// * `payload`   — the allowance intent signed by `payload.owner`
    /// * `signature` — 64-byte Ed25519 signature from `payload.owner`
    pub fn permit(env: Env, payload: PermitPayload, signature: BytesN<64>) {
        Self::assert_not_paused(&env);

        // ── 1. Expiry check ───────────────────────────────────────────────────
        let now = env.ledger().timestamp();
        if now > payload.deadline {
            panic_with_error!(&env, TreeTokenError::PermitExpired);
        }

        // ── 2. Amount validation ──────────────────────────────────────────────
        if payload.amount < 0 {
            panic_with_error!(&env, TreeTokenError::PermitAmountMustBeNonNegative);
        }

        // ── 3. Nonce check ────────────────────────────────────────────────────
        let nk = permit_nonce_key(&env, &payload.owner);
        let expected_nonce: u64 = env.storage().persistent().get(&nk).unwrap_or(0u64);
        if payload.nonce != expected_nonce {
            panic_with_error!(&env, TreeTokenError::InvalidPermitNonce);
        }

        // ── 4. Signature verification ─────────────────────────────────────────
        let msg = Self::build_permit_message(&env, &payload);
        let msg_hash: BytesN<32> = env.crypto().sha256(&msg).into();
        let owner_pubkey = Self::extract_ed25519_pubkey(&env, &payload.owner);
        env.crypto()
            .ed25519_verify(&owner_pubkey, &msg_hash.into(), &signature);

        // ── 5. Increment nonce (replay protection) ────────────────────────────
        let next_nonce = expected_nonce
            .checked_add(1)
            .expect("permit nonce overflow");
        env.storage().persistent().set(&nk, &next_nonce);
        env.storage().persistent().extend_ttl(&nk, 518400, 1036800);

        // ── 6. Record allowance ───────────────────────────────────────────────
        let ak = allowance_key(&env, &payload.owner, &payload.spender);
        let allowance = Allowance {
            amount: payload.amount,
            expiration: payload.deadline,
        };
        env.storage().persistent().set(&ak, &allowance);
        env.storage().persistent().extend_ttl(&ak, 518400, 1036800);

        env.events().publish(
            (
                Symbol::new(&env, "Permit"),
                payload.owner.clone(),
                payload.spender.clone(),
            ),
            (payload.amount, payload.deadline),
        );
    }

    /// Transfer `amount` TREE tokens from `owner` to `to`, drawing against
    /// an allowance previously granted via `permit()`.
    ///
    /// Unlike `permit()`, this call moves real token balances and therefore
    /// requires the spender's own on-chain authorisation — the caller must
    /// be the `spender` named in the allowance and must authenticate via
    /// `require_auth()`, mirroring the classic ERC-20 `transferFrom` split
    /// between a signature-based `approve` and an authenticated spend.
    ///
    /// # Arguments
    ///
    /// * `spender` — the address spending the allowance; must match the `require_auth()` signer
    /// * `owner`   — the token holder who granted the allowance via `permit()`
    /// * `to`      — recipient of the transfer
    /// * `amount`  — number of TREE tokens to transfer (must be > 0)
    pub fn transfer_from(env: Env, spender: Address, owner: Address, to: Address, amount: i128) {
        Self::assert_not_paused(&env);
        spender.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let ak = allowance_key(&env, &owner, &spender);
        let mut allowance: Allowance = env.storage().persistent().get(&ak).unwrap_or(Allowance {
            amount: 0,
            expiration: 0,
        });

        let now = env.ledger().timestamp();
        if now > allowance.expiration {
            panic_with_error!(&env, TreeTokenError::AllowanceExpired);
        }
        if allowance.amount < amount {
            panic_with_error!(&env, TreeTokenError::InsufficientAllowance);
        }

        allowance.amount -= amount;
        env.storage().persistent().set(&ak, &allowance);
        env.storage().persistent().extend_ttl(&ak, 518400, 1036800);

        let tree_token: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("TOKEN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));

        contract_utils::assert_whitelisted(&env, &tree_token);
        token::Client::new(&env, &tree_token).transfer(&owner, &to, &amount);

        env.events().publish(
            (Symbol::new(&env, "TransferFrom"), owner, spender),
            (to, amount),
        );
    }

    /// Returns the current permit nonce for `owner`.
    ///
    /// Off-chain signers must read this before constructing a
    /// `PermitPayload` to avoid `InvalidPermitNonce` errors. Tracked
    /// independently of the `transfer_meta` nonce sequence (`get_nonce`).
    pub fn get_permit_nonce(env: Env, owner: Address) -> u64 {
        let nk = permit_nonce_key(&env, &owner);
        let nonce = env.storage().persistent().get(&nk).unwrap_or(0u64);
        if env.storage().persistent().has(&nk) {
            env.storage().persistent().extend_ttl(&nk, 518400, 1036800);
        }
        nonce
    }

    /// Returns the current allowance `spender` may draw from `owner` via
    /// `transfer_from`, or `None` if no permit has ever been granted for
    /// this `(owner, spender)` pair.
    pub fn get_allowance(env: Env, owner: Address, spender: Address) -> Option<Allowance> {
        let ak = allowance_key(&env, &owner, &spender);
        let allowance: Option<Allowance> = env.storage().persistent().get(&ak);
        if allowance.is_some() {
            env.storage().persistent().extend_ttl(&ak, 518400, 1036800);
        }
        allowance
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

    /// Build the deterministic domain-separated byte message for `permit()`
    /// signing.
    ///
    /// Layout (total = 11 + 32 + 32 + 16 + 8 + 8 = 107 bytes):
    ///
    /// | Field             | Bytes | Encoding              |
    /// |-------------------|-------|------------------------|
    /// | domain separator  | 11    | ASCII literal          |
    /// | owner pubkey      | 32    | Ed25519 raw bytes      |
    /// | spender pubkey    | 32    | Ed25519 raw bytes      |
    /// | amount            | 16    | u128 little-endian     |
    /// | nonce             | 8     | u64 little-endian      |
    /// | deadline          | 8     | u64 little-endian      |
    fn build_permit_message(env: &Env, p: &PermitPayload) -> Bytes {
        let owner_pk = Self::extract_ed25519_pubkey(env, &p.owner);
        let spender_pk = Self::extract_ed25519_pubkey(env, &p.spender);

        let mut msg = Bytes::new(env);

        // Domain separator
        msg.extend_from_slice(b"TREE_PERMIT");

        // Owner public key (32 bytes)
        msg.extend_from_array(&owner_pk.to_array());

        // Spender public key (32 bytes)
        msg.extend_from_array(&spender_pk.to_array());

        // Amount — reinterpret i128 bits as u128 for LE encoding
        msg.extend_from_array(&(p.amount as u128).to_le_bytes());

        // Nonce
        msg.extend_from_array(&p.nonce.to_le_bytes());

        // Deadline
        msg.extend_from_array(&p.deadline.to_le_bytes());

        msg
    }

    /// Extract the 32-byte Ed25519 public key from a Stellar `Address`.
    ///
    /// `Address::to_xdr` serializes to the `ScVal` XDR form (see
    /// `soroban_sdk::xdr::ToXdr`), so a Stellar G-address (AccountID) is
    /// encoded with three 4-byte union discriminants before the raw key:
    ///   - 4 bytes: `ScVal` discriminant (selecting the `Address` variant)
    ///   - 4 bytes: `ScAddress` discriminant (0 = SC_ADDRESS_TYPE_ACCOUNT)
    ///   - 4 bytes: `PublicKey` discriminant (0 = PUBLIC_KEY_TYPE_ED25519)
    ///   - 32 bytes: raw Ed25519 public key
    ///
    /// We skip the first 12 bytes to reach the 32-byte pubkey.
    fn extract_ed25519_pubkey(env: &Env, addr: &Address) -> BytesN<32> {
        let xdr = addr.clone().to_xdr(env);
        let mut raw = [0u8; 32];
        for (i, byte) in raw.iter_mut().enumerate() {
            *byte = xdr.get(12 + i as u32).unwrap_or(0);
        }
        BytesN::from_array(env, &raw)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    extern crate std;

    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use soroban_sdk::{
        testutils::Address as _, testutils::Ledger as _, token, xdr, Address, Env, String,
    };
    use std::rc::Rc;
    use std::string::ToString;

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
        let (_env, admin, _, tree_token, client) = setup();
        client.initialize(&admin, &tree_token);
    }

    // ── Meta-transaction test helpers ─────────────────────────────────────────

    /// Builds a real Ed25519-keyed Stellar `Address` (a "G..." account
    /// address) from a signing key, so `ed25519_verify` can be exercised
    /// with genuine signatures. `testutils::Address::generate` only ever
    /// produces synthetic *contract* addresses, which have no backing
    /// keypair and cannot satisfy the crypto check.
    fn keyed_address(env: &Env, sk: &SigningKey) -> Address {
        let strkey =
            stellar_strkey::ed25519::PublicKey(sk.verifying_key().to_bytes()).to_string();
        Address::from_string(&String::from_str(env, &strkey))
    }

    /// Signs `payload` the way an off-chain sender would: build the
    /// contract's own domain-separated message, hash it with SHA-256 via
    /// the same host function the contract uses, then sign the hash with
    /// the real Ed25519 private key.
    fn sign_meta(env: &Env, sk: &SigningKey, payload: &MetaTransferPayload) -> BytesN<64> {
        let msg = TreeToken::build_signing_message(env, payload);
        let hash: BytesN<32> = env.crypto().sha256(&msg).into();
        BytesN::from_array(env, &sk.sign(&hash.to_array()).to_bytes())
    }

    /// Signs a `PermitPayload` the same way `sign_meta` signs a
    /// `MetaTransferPayload`.
    fn sign_permit(env: &Env, sk: &SigningKey, payload: &PermitPayload) -> BytesN<64> {
        let msg = TreeToken::build_permit_message(env, payload);
        let hash: BytesN<32> = env.crypto().sha256(&msg).into();
        BytesN::from_array(env, &sk.sign(&hash.to_array()).to_bytes())
    }

    /// Establishes the classic Stellar ledger state a real G-address needs
    /// before it can hold a balance of the wrapped classic asset issued by
    /// `issuer`: an `Account` entry for `holder_sk`'s address, and a
    /// `TrustLine` entry for the "aaa" asset `register_stellar_asset_contract_v2`
    /// always creates. `Address::generate()`-style contract addresses need
    /// none of this (their balances live in contract storage, not classic
    /// ledger entries), which is why this is only needed for our keyed
    /// sender.
    ///
    /// There is no public soroban-sdk testutils helper for this — it
    /// mirrors exactly what `Env::register_stellar_asset_contract_v2`
    /// itself does internally to fund the classic issuer account.
    fn fund_classic_holder(env: &Env, holder_sk: &SigningKey, issuer: &Address) {
        // `Address::to_string` returns a Soroban-native `String`; convert it
        // to a Rust `std::string::String` (via `ToString`) so `stellar_strkey`
        // can parse it.
        let issuer_strkey: std::string::String = issuer.to_string().to_string();
        let issuer_pub = stellar_strkey::ed25519::PublicKey::from_string(&issuer_strkey)
            .unwrap()
            .0;
        let issuer_id = xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(
            issuer_pub,
        )));

        let holder_pub = holder_sk.verifying_key().to_bytes();
        let holder_id = xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(
            holder_pub,
        )));

        env.host()
            .with_mut_storage(|storage| {
                use soroban_env_host::budget::AsBudget;
                let budget = env.host().as_budget();

                let account_key = Rc::new(xdr::LedgerKey::Account(xdr::LedgerKeyAccount {
                    account_id: holder_id.clone(),
                }));
                if !storage.has(&account_key, budget)? {
                    let account_entry = Rc::new(xdr::LedgerEntry {
                        last_modified_ledger_seq: 0,
                        data: xdr::LedgerEntryData::Account(xdr::AccountEntry {
                            account_id: holder_id.clone(),
                            balance: 0,
                            seq_num: xdr::SequenceNumber(0),
                            num_sub_entries: 0,
                            inflation_dest: None,
                            flags: 0,
                            home_domain: Default::default(),
                            thresholds: xdr::Thresholds([1; 4]),
                            signers: xdr::VecM::default(),
                            ext: xdr::AccountEntryExt::V0,
                        }),
                        ext: xdr::LedgerEntryExt::V0,
                    });
                    storage.put(&account_key, &account_entry, None, budget)?;
                }

                let asset = xdr::TrustLineAsset::CreditAlphanum4(xdr::AlphaNum4 {
                    asset_code: xdr::AssetCode4([b'a', b'a', b'a', 0]),
                    issuer: issuer_id.clone(),
                });
                let trustline_key = Rc::new(xdr::LedgerKey::Trustline(xdr::LedgerKeyTrustLine {
                    account_id: holder_id.clone(),
                    asset: asset.clone(),
                }));
                let trustline_entry = Rc::new(xdr::LedgerEntry {
                    last_modified_ledger_seq: 0,
                    data: xdr::LedgerEntryData::Trustline(xdr::TrustLineEntry {
                        account_id: holder_id,
                        asset,
                        balance: 0,
                        limit: i64::MAX,
                        flags: 1, // AUTHORIZED_FLAG
                        ext: xdr::TrustLineEntryExt::V0,
                    }),
                    ext: xdr::LedgerEntryExt::V0,
                });
                storage.put(&trustline_key, &trustline_entry, None, budget)?;

                Ok(())
            })
            .unwrap();
    }

    /// Returns (env, client, tree_token_id, sender, recipient, relayer, sender_sk).
    ///
    /// `sender` is backed by a real Ed25519 keypair (`sender_sk`) so tests
    /// can produce genuine `ed25519_verify`-passing signatures for
    /// `transfer_meta` and `permit`. `recipient` and `relayer` remain
    /// synthetic test addresses — they are never the subject of an
    /// `ed25519_verify` call, only opaque bytes folded into the signed
    /// message for domain separation.
    fn setup_meta() -> (
        Env,
        TreeTokenClient<'static>,
        Address,
        Address,
        Address,
        Address,
        SigningKey,
    ) {
        let env = Env::default();
        // `transfer_meta`/`transfer_from` invoke the token contract's own
        // `transfer`, which calls `from.require_auth()` on `sender` — an
        // address never named at the root of the client call (it's nested
        // inside `payload`/an argument to TreeToken's own entry point).
        // Plain `mock_all_auths` only auto-authorizes root-invocation
        // addresses; this variant is the SDK's documented way to mock auth
        // for such non-root calls too.
        env.mock_all_auths_allowing_non_root_auth();

        let contract_id = env.register_contract(None, TreeToken);
        let client = TreeTokenClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let sender_sk = SigningKey::from_bytes(&[7u8; 32]);
        let sender = keyed_address(&env, &sender_sk);
        let recipient = Address::generate(&env);
        let relayer = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let tree_token_id = sac.address();

        // `sender` is a real G-address, so it needs classic Account +
        // TrustLine ledger entries before it can hold the wrapped asset.
        fund_classic_holder(&env, &sender_sk, &sac.issuer().address());

        // Mint enough tokens for amount + fee
        token::StellarAssetClient::new(&env, &tree_token_id).mint(&sender, &1_000_000);

        client.initialize(&admin, &tree_token_id);
        client.add_to_whitelist(&tree_token_id);
        client.add_to_whitelist(&relayer);

        (
            env,
            client,
            tree_token_id,
            sender,
            recipient,
            relayer,
            sender_sk,
        )
    }

    // ── Meta-transaction tests ────────────────────────────────────────────────

    #[test]
    fn test_meta_transfer_executes_and_deducts_fee() {
        let (env, client, tree_token, sender, recipient, relayer, sk) = setup_meta();

        let payload = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 500_000,
            fee: 1_000,
            nonce: 0,
            expiry: u64::MAX,
        };
        let sig = sign_meta(&env, &sk, &payload);

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
        let (env, client, tree_token, sender, recipient, relayer, sk) = setup_meta();

        let tok = token::Client::new(&env, &tree_token);
        let relayer_before = tok.balance(&relayer);

        let payload = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 100_000,
            fee: 0,
            nonce: 0,
            expiry: u64::MAX,
        };
        let sig = sign_meta(&env, &sk, &payload);
        client.transfer_meta(&relayer, &payload, &sig);

        // Relayer balance unchanged when fee is zero
        assert_eq!(tok.balance(&relayer), relayer_before);
    }

    #[test]
    fn test_meta_transfer_nonce_increments() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        assert_eq!(client.get_nonce(&sender), 0);

        let payload1 = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 100,
            fee: 0,
            nonce: 0,
            expiry: u64::MAX,
        };
        let sig1 = sign_meta(&env, &sk, &payload1);
        client.transfer_meta(&relayer, &payload1, &sig1);
        assert_eq!(client.get_nonce(&sender), 1);

        let payload2 = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 100,
            fee: 0,
            nonce: 1,
            expiry: u64::MAX,
        };
        let sig2 = sign_meta(&env, &sk, &payload2);
        client.transfer_meta(&relayer, &payload2, &sig2);
        assert_eq!(client.get_nonce(&sender), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #83)")]
    fn test_meta_transfer_replay_rejected() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        let payload = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 100,
            fee: 0,
            nonce: 0,
            expiry: u64::MAX,
        };
        let sig = sign_meta(&env, &sk, &payload);

        client.transfer_meta(&relayer, &payload.clone(), &sig);
        // Second call with the same nonce must fail with NonceAlreadyUsed (#83)
        client.transfer_meta(&relayer, &payload, &sig);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_meta_transfer_expired_rejected() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        env.ledger().set_timestamp(1_000);

        let payload = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 100,
            fee: 0,
            nonce: 0,
            expiry: 999, // in the past
        };
        let sig = sign_meta(&env, &sk, &payload);
        client.transfer_meta(&relayer, &payload, &sig);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_meta_transfer_zero_amount_rejected() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        let payload = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 0,
            fee: 0,
            nonce: 0,
            expiry: u64::MAX,
        };
        let sig = sign_meta(&env, &sk, &payload);
        client.transfer_meta(&relayer, &payload, &sig);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_meta_transfer_while_paused_rejected() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        client.pause();

        let payload = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 100,
            fee: 0,
            nonce: 0,
            expiry: u64::MAX,
        };
        let sig = sign_meta(&env, &sk, &payload);
        client.transfer_meta(&relayer, &payload, &sig);
    }
    // ── Staking Tests ─────────────────────────────────────────────────────────

    #[test]
    fn test_stake_unstake() {
        let (env, _, staker, tree_token_id, client) = setup();
        let tok = token::Client::new(&env, &tree_token_id);
        
        let initial_balance = tok.balance(&staker);
        
        // Stake 100_000
        client.stake(&staker, &100_000);
        assert_eq!(tok.balance(&staker), initial_balance - 100_000);
        assert_eq!(tok.balance(&client.address), 100_000);

        // Unstake 50_000
        client.unstake(&staker, &50_000);
        assert_eq!(tok.balance(&staker), initial_balance - 50_000);
        assert_eq!(tok.balance(&client.address), 50_000);
        
        // Unstake remaining 50_000
        client.unstake(&staker, &50_000);
        assert_eq!(tok.balance(&staker), initial_balance);
        assert_eq!(tok.balance(&client.address), 0);
    }

    #[test]
    fn test_deposit_and_claim_rewards() {
        let (env, admin, staker1, tree_token_id, client) = setup();
        let tok = token::Client::new(&env, &tree_token_id);

        let staker2 = Address::generate(&env);

        // Mint some tokens for admin to use as rewards
        let token_admin = token::StellarAssetClient::new(&env, &tree_token_id);
        token_admin.mint(&admin, &50_000);
        
        // Mint for staker2
        token_admin.mint(&staker2, &1_000_000);

        // Staker 1 stakes 100k
        client.stake(&staker1, &100_000);
        
        // Staker 2 stakes 300k
        client.stake(&staker2, &300_000);

        // Admin deposits 40k reward
        client.deposit_reward(&admin, &40_000);

        let staker1_before = tok.balance(&staker1);
        let staker2_before = tok.balance(&staker2);

        // Staker 1 claims reward
        client.claim_reward(&staker1);
        // Staker 1 has 1/4 of the pool (100k out of 400k), so should get 10k
        assert_eq!(tok.balance(&staker1), staker1_before + 10_000);

        // Staker 2 claims reward
        client.claim_reward(&staker2);
        // Staker 2 has 3/4 of the pool (300k out of 400k), so should get 30k
        assert_eq!(tok.balance(&staker2), staker2_before + 30_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #86)")]
    fn test_deposit_reward_no_stakers_rejected() {
        let (env, admin, _, tree_token_id, client) = setup();
        let token_admin = token::StellarAssetClient::new(&env, &tree_token_id);
        token_admin.mint(&admin, &50_000);

        // Attempting to deposit without stakers should panic
        client.deposit_reward(&admin, &10_000);
    }

    // ── Permit tests ──────────────────────────────────────────────────────────
    //
    // Reuses `setup_meta()`: `sender` acts as the permit `owner` (backed by
    // a real Ed25519 keypair), `relayer` acts as `spender`, `recipient` as
    // the `transfer_from` destination.

    #[test]
    fn test_permit_grants_allowance_and_increments_nonce() {
        let (env, client, _, sender, _, relayer, sk) = setup_meta();

        assert_eq!(client.get_permit_nonce(&sender), 0);
        assert!(client.get_allowance(&sender, &relayer).is_none());

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 250_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);

        assert_eq!(client.get_permit_nonce(&sender), 1);
        let allowance = client.get_allowance(&sender, &relayer).unwrap();
        assert_eq!(allowance.amount, 250_000);
        assert_eq!(allowance.expiration, u64::MAX);
    }

    #[test]
    fn test_permit_zero_amount_revokes_existing_allowance() {
        let (env, client, _, sender, _, relayer, sk) = setup_meta();

        let payload1 = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 100_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig1 = sign_permit(&env, &sk, &payload1);
        client.permit(&payload1, &sig1);
        assert_eq!(
            client.get_allowance(&sender, &relayer).unwrap().amount,
            100_000
        );

        // A follow-up permit for 0 explicitly revokes the allowance.
        let payload2 = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 0,
            nonce: 1,
            deadline: u64::MAX,
        };
        let sig2 = sign_permit(&env, &sk, &payload2);
        client.permit(&payload2, &sig2);
        assert_eq!(client.get_allowance(&sender, &relayer).unwrap().amount, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #92)")]
    fn test_permit_replay_rejected() {
        let (env, client, _, sender, _, relayer, sk) = setup_meta();

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 1_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig = sign_permit(&env, &sk, &payload);

        client.permit(&payload.clone(), &sig);
        // Second call with the same nonce must fail with InvalidPermitNonce (#92)
        client.permit(&payload, &sig);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #89)")]
    fn test_permit_expired_rejected() {
        let (env, client, _, sender, _, relayer, sk) = setup_meta();

        env.ledger().set_timestamp(1_000);

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 1_000,
            nonce: 0,
            deadline: 999, // in the past
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #88)")]
    fn test_permit_negative_amount_rejected() {
        let (env, client, _, sender, _, relayer, sk) = setup_meta();

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: -1,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_permit_while_paused_rejected() {
        let (env, client, _, sender, _, relayer, sk) = setup_meta();

        client.pause();

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 1_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);
    }

    #[test]
    fn test_permit_nonce_independent_of_meta_transfer_nonce() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        // Consume a transfer_meta nonce first.
        let meta_payload = MetaTransferPayload {
            from: sender.clone(),
            to: recipient.clone(),
            amount: 100,
            fee: 0,
            nonce: 0,
            expiry: u64::MAX,
        };
        let meta_sig = sign_meta(&env, &sk, &meta_payload);
        client.transfer_meta(&relayer, &meta_payload, &meta_sig);
        assert_eq!(client.get_nonce(&sender), 1);
        // Permit nonce sequence is untouched.
        assert_eq!(client.get_permit_nonce(&sender), 0);

        let permit_payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 1_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let permit_sig = sign_permit(&env, &sk, &permit_payload);
        client.permit(&permit_payload, &permit_sig);
        assert_eq!(client.get_permit_nonce(&sender), 1);
        // transfer_meta nonce is untouched by permit.
        assert_eq!(client.get_nonce(&sender), 1);
    }

    // ── transfer_from tests ───────────────────────────────────────────────────

    #[test]
    fn test_transfer_from_executes_and_decrements_allowance() {
        let (env, client, tree_token, sender, recipient, relayer, sk) = setup_meta();

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 300_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);

        let tok = token::Client::new(&env, &tree_token);
        let sender_before = tok.balance(&sender);
        let recipient_before = tok.balance(&recipient);

        client.transfer_from(&relayer, &sender, &recipient, &120_000);

        assert_eq!(tok.balance(&sender), sender_before - 120_000);
        assert_eq!(tok.balance(&recipient), recipient_before + 120_000);
        assert_eq!(
            client.get_allowance(&sender, &relayer).unwrap().amount,
            180_000
        );

        // Spend the remainder — should succeed since it's within allowance.
        client.transfer_from(&relayer, &sender, &recipient, &180_000);
        assert_eq!(client.get_allowance(&sender, &relayer).unwrap().amount, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #93)")]
    fn test_transfer_from_insufficient_allowance_rejected() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 50_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);

        // Requesting more than the granted allowance must fail.
        client.transfer_from(&relayer, &sender, &recipient, &50_001);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #93)")]
    fn test_transfer_from_without_permit_rejected() {
        let (_env, client, _, sender, recipient, relayer, _sk) = setup_meta();

        // No permit was ever granted — allowance defaults to 0.
        client.transfer_from(&relayer, &sender, &recipient, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #94)")]
    fn test_transfer_from_allowance_expired_rejected() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 50_000,
            nonce: 0,
            deadline: 1_000,
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);

        env.ledger().set_timestamp(1_001);
        client.transfer_from(&relayer, &sender, &recipient, &10_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_transfer_from_zero_amount_rejected() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 50_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);

        client.transfer_from(&relayer, &sender, &recipient, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_transfer_from_while_paused_rejected() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 50_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);

        client.pause();
        client.transfer_from(&relayer, &sender, &recipient, &1_000);
    }

    #[test]
    fn test_transfer_from_wrong_spender_has_no_allowance() {
        let (env, client, _, sender, recipient, relayer, sk) = setup_meta();
        let stranger = Address::generate(&env);

        let payload = PermitPayload {
            owner: sender.clone(),
            spender: relayer.clone(),
            amount: 50_000,
            nonce: 0,
            deadline: u64::MAX,
        };
        let sig = sign_permit(&env, &sk, &payload);
        client.permit(&payload, &sig);

        // `stranger` was never granted an allowance by `sender`.
        assert!(client.get_allowance(&sender, &stranger).is_none());
        let result = client.try_transfer_from(&stranger, &sender, &recipient, &1_000);
        assert!(result.is_err());
    }
}
