#![no_std]

//! XLM Cross-Chain Bridge Contract
//!
//! Enables purchasing tree sponsorships using wrapped XLM on other
//! Stellar-compatible chains via a bridge mechanism.
//!
//! ## Flow
//!
//! 1. **`lock_for_purchase`** — A cross-chain user (or their relayer) locks
//!    native XLM together with the destination details for a tree
//!    sponsorship purchase: the Stellar wallet that will hold the sponsorship
//!    receipts, the farmer to plant, the tree count and the planting area.
//!    The lock is recorded with a unique monotonically increasing id and the
//!    funds are held by this contract.
//!
//! 2. **`execute_purchase`** — Callable only by the admin (the bridge
//!    operator / attestation aggregator). Releases the locked XLM by
//!    sponsoring the trees directly through the tree-escrow contract
//!    (`sponsor_as_gift`, so the sponsorship receipts go to the designated
//!    recipient), charging the configured bridge fee.
//!
//! 3. **`cancel_lock`** — Admin can refund a lock that can never be executed
//!    (invalid destination details, refund requests from the source chain).
//!    The locked amount is refunded to the original sender.
//!
//! ## Security
//!
//! - Lock ids are strictly monotonic; the executor validates lock state
//!   before releasing any funds.
//! - `execute_purchase` and `cancel_lock` require the admin's authorization;
//!   the whole contract can be paused for incident response.
//! - Fees are capped at 5% (500 bps) and paid to a dedicated fee wallet.
//!
//! ## Integration
//!
//! The bridge forwards purchases through the tree-escrow contract's
//! `sponsor_as_gift` entry point (`donor` = this contract, `recipient_wallet`
//! = the cross-chain user's chosen Stellar recipient), which creates the
//! on-chain escrow record and mints the sponsorship receipts.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal, String, Symbol, Vec,
};

// ── Constants ────────────────────────────────────────────────────────────────

/// Basis-point denominator (100% = 10_000 bps).
const BPS_DENOM: i128 = 10_000;

/// Absolute fee ceiling: 5% (500 bps). `set_fee_bps` cannot exceed this.
const FEE_BPS_CEILING: i128 = 500;

/// Upper bound on the length of cross-chain address strings.
const MAX_ADDRESS_LEN: u32 = 128;

/// Upper bound on the length of the source-chain identifier.
const MAX_CHAIN_LEN: u32 = 32;

// ── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum XlmBridgeError {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,
    /// The contract has not been initialized yet.
    NotInitialized = 2,
    /// Amount must be strictly positive.
    AmountMustBePositive = 3,
    /// Tree count must be strictly positive.
    TreeCountMustBePositive = 4,
    /// Planting area must be strictly positive.
    AreaMustBePositive = 5,
    /// The referenced lock does not exist.
    LockNotFound = 6,
    /// The lock is not in the `Locked` state for this operation.
    LockNotActive = 7,
    /// Only the admin (bridge operator) can call this.
    Unauthorized = 8,
    /// A cross-chain address string exceeds the length limit.
    AddressTooLong = 9,
    /// The source-chain identifier exceeds the length limit.
    ChainIdTooLong = 10,
    /// A configured fee exceeds the allowed ceiling.
    FeeExceedsCeiling = 11,
    /// The tree-escrow cross-contract purchase call failed.
    EscrowCallFailed = 13,
    /// The contract is currently paused.
    Paused = 14,
}

// ── Types ────────────────────────────────────────────────────────────────────

/// Lifecycle state of a cross-chain lock.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum LockStatus {
    /// Funds held, waiting for the operator to execute the purchase.
    Locked,
    /// Purchase executed through tree-escrow.
    Executed,
    /// Refunded to the original sender.
    Cancelled,
}

/// A cross-chain lock of native XLM intended for a tree sponsorship purchase.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BridgeLock {
    /// Monotonic lock identifier.
    pub id: u64,
    /// Original sender on this chain (relayer or bridged account).
    pub sender: Address,
    /// Stellar address that receives the sponsorship receipts.
    pub recipient: Address,
    /// Farmer who will plant the trees.
    pub farmer: Address,
    /// Amount of native XLM locked (in stroops).
    pub amount: i128,
    /// Number of trees the purchase covers.
    pub tree_count: i128,
    /// Planting area in hectares (scaled by the caller's convention).
    pub area_hectares: i128,
    /// Identifier of the originating chain (e.g. "ethereum", "polygon").
    pub source_chain: String,
    /// Address of the user on the source chain (opaque string).
    pub source_sender: String,
    /// Fee charged by the bridge operator (in stroops), set at execution.
    pub fee_paid: i128,
    /// Ledger timestamp of the lock.
    pub locked_at: u64,
    /// Lifecycle state.
    pub status: LockStatus,
    /// Trees actually sponsored (filled on execution).
    pub trees_bought: i128,
}

/// Administrative configuration.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    /// Bridge operator / attestation aggregator.
    pub admin: Address,
    /// Address of the native XLM (SAC) used for locked funds.
    pub xlm: Address,
    /// Deployed tree-escrow contract used to execute purchases.
    pub tree_escrow: Address,
    /// Wallet that receives accumulated bridge fees.
    pub fee_wallet: Address,
    /// Current fee in basis points.
    pub fee_bps: i128,
    /// Pause flag for incident response.
    pub paused: bool,
    /// Total number of locks ever created (also the next lock id).
    pub lock_count: u64,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Config,
    /// Lock record by id.
    Lock(u64),
    /// All lock ids created by a given sender.
    SenderLocks(Address),
}

// ── Event symbols (max 9 chars) ──────────────────────────────────────────────

const SYM_LOCKED: Symbol = symbol_short!("lock");
const SYM_EXECUTED: Symbol = symbol_short!("execute");
const SYM_CANCELLED: Symbol = symbol_short!("cancel");
const SYM_CONFIG: Symbol = symbol_short!("cfg");

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct XlmBridge;

#[contractimpl]
impl XlmBridge {
    /// Initialize the bridge.
    pub fn initialize(
        env: Env,
        admin: Address,
        xlm: Address,
        tree_escrow: Address,
        fee_wallet: Address,
        fee_bps: i128,
    ) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, XlmBridgeError::AlreadyInitialized);
        }
        if fee_bps < 0 || fee_bps > FEE_BPS_CEILING {
            panic_with_error!(&env, XlmBridgeError::FeeExceedsCeiling);
        }

        let config = Config {
            admin,
            xlm,
            tree_escrow,
            fee_wallet,
            fee_bps,
            paused: false,
            lock_count: 0,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.events()
            .publish((SYM_CONFIG, String::from_str(&env, "init")), true);
    }

    /// Lock native XLM for a cross-chain tree sponsorship purchase.
    ///
    /// `source_chain` / `source_sender` identify the user and address on the
    /// originating chain and are stored for audit purposes. `recipient` is
    /// the Stellar wallet that will hold the sponsorship receipts.
    pub fn lock_for_purchase(
        env: Env,
        sender: Address,
        recipient: Address,
        farmer: Address,
        amount: i128,
        tree_count: i128,
        area_hectares: i128,
        source_chain: String,
        source_sender: String,
    ) -> u64 {
        sender.require_auth();

        Self::assert_not_paused(&env);
        if amount <= 0 {
            panic_with_error!(&env, XlmBridgeError::AmountMustBePositive);
        }
        if tree_count <= 0 {
            panic_with_error!(&env, XlmBridgeError::TreeCountMustBePositive);
        }
        if area_hectares <= 0 {
            panic_with_error!(&env, XlmBridgeError::AreaMustBePositive);
        }
        if source_chain.len() > MAX_CHAIN_LEN {
            panic_with_error!(&env, XlmBridgeError::ChainIdTooLong);
        }
        if source_sender.len() > MAX_ADDRESS_LEN {
            panic_with_error!(&env, XlmBridgeError::AddressTooLong);
        }

        // Pull the native XLM into the bridge before recording the lock.
        let xlm = Self::get_config(&env).xlm;
        token::Client::new(&env, &xlm).transfer(
            &sender,
            &env.current_contract_address(),
            &amount,
        );

        let lock_id = Self::get_config(&env).lock_count + 1;

        let lock = BridgeLock {
            id: lock_id,
            sender: sender.clone(),
            recipient,
            farmer,
            amount,
            tree_count,
            area_hectares,
            source_chain,
            source_sender,
            fee_paid: 0,
            locked_at: env.ledger().timestamp(),
            status: LockStatus::Locked,
            trees_bought: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Lock(lock_id), &lock);

        let mut sender_locks = Self::get_locks_for_sender(env.clone(), sender.clone());
        sender_locks.push_back(lock_id);
        env.storage()
            .persistent()
            .set(&DataKey::SenderLocks(sender.clone()), &sender_locks);

        let config = Self::get_config(&env);
        let mut cfg = config;
        cfg.lock_count = lock_id;
        env.storage().instance().set(&DataKey::Config, &cfg);

        env.events().publish(
            (SYM_LOCKED, lock_id),
            (
                sender,
                lock.recipient.clone(),
                lock.farmer.clone(),
                amount,
                tree_count,
            ),
        );

        lock_id
    }

    /// Execute the purchase for a locked amount: the bridge sponsors the
    /// trees through the tree-escrow contract on behalf of the recipient
    /// (`sponsor_as_gift`). Callable by the admin only.
    ///
    /// Returns the number of trees actually sponsored.
    pub fn execute_purchase(env: Env, admin: Address, lock_id: u64) -> i128 {
        admin.require_auth();

        Self::assert_not_paused(&env);
        let config = Self::get_config(&env);
        if admin != config.admin {
            panic_with_error!(&env, XlmBridgeError::Unauthorized);
        }

        let mut lock: BridgeLock = match env.storage().persistent().get(&DataKey::Lock(lock_id)) {
            Some(l) => l,
            None => panic_with_error!(&env, XlmBridgeError::LockNotFound),
        };
        if lock.status != LockStatus::Locked {
            panic_with_error!(&env, XlmBridgeError::LockNotActive);
        }

        // Compute the bridge fee; the escrow receives the remainder.
        let fee = Self::quote_fee(env.clone(), lock.amount);
        let purchase_amount = lock
            .amount
            .checked_sub(fee)
            .expect("fee cannot exceed amount");

        // Send the fee to the fee wallet (the escrow call below pulls the
        // purchase amount out of this contract itself, as `donor`).
        if fee > 0 {
            token::Client::new(&env, &config.xlm).transfer(
                &env.current_contract_address(),
                &config.fee_wallet,
                &fee,
            );
        }

        // Cross-contract call: sponsor_as_gift(donor=bridge, recipient,
        // farmer, token=XLM, amount, tree_count, area_hectares).
        let result = env.try_invoke_contract::<(), soroban_sdk::InvokeError>(
            &config.tree_escrow,
            &symbol_short!("sponsor_as_gift"),
            (
                env.current_contract_address(),
                lock.recipient.clone(),
                lock.farmer.clone(),
                config.xlm.clone(),
                purchase_amount,
                lock.tree_count,
                lock.area_hectares,
            )
                .into_val(&env),
        );

        match result {
            Ok(Ok(())) => {}
            _ => panic_with_error!(&env, XlmBridgeError::EscrowCallFailed),
        }

        // Record success and emit.
        lock.status = LockStatus::Executed;
        lock.fee_paid = fee;
        lock.trees_bought = lock.tree_count;
        env.storage()
            .persistent()
            .set(&DataKey::Lock(lock_id), &lock);

        env.events().publish(
            (SYM_EXECUTED, lock_id),
            (
                lock.recipient.clone(),
                lock.farmer.clone(),
                purchase_amount,
                fee,
                lock.trees_bought,
            ),
        );

        lock.trees_bought
    }

    /// Cancel a lock and refund the sender. Callable by the admin only.
    pub fn cancel_lock(env: Env, admin: Address, lock_id: u64) {
        admin.require_auth();

        let config = Self::get_config(&env);
        if admin != config.admin {
            panic_with_error!(&env, XlmBridgeError::Unauthorized);
        }

        let mut lock: BridgeLock = match env.storage().persistent().get(&DataKey::Lock(lock_id)) {
            Some(l) => l,
            None => panic_with_error!(&env, XlmBridgeError::LockNotFound),
        };
        if lock.status != LockStatus::Locked {
            panic_with_error!(&env, XlmBridgeError::LockNotActive);
        }

        token::Client::new(&env, &config.xlm).transfer(
            &env.current_contract_address(),
            &lock.sender,
            &lock.amount,
        );

        lock.status = LockStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Lock(lock_id), &lock);

        env.events()
            .publish((SYM_CANCELLED, lock_id), lock.sender.clone());
    }

    // ── Admin configuration ──────────────────────────────────────────────

    /// Set or update the tree-escrow contract address.
    pub fn set_tree_escrow(env: Env, admin: Address, escrow: Address) {
        admin.require_auth();
        let mut config = Self::get_config(&env);
        if admin != config.admin {
            panic_with_error!(&env, XlmBridgeError::Unauthorized);
        }
        config.tree_escrow = escrow;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    /// Update the bridge fee (basis points). Capped at 5%.
    pub fn set_fee_bps(env: Env, admin: Address, fee_bps: i128) {
        admin.require_auth();
        if fee_bps < 0 || fee_bps > FEE_BPS_CEILING {
            panic_with_error!(&env, XlmBridgeError::FeeExceedsCeiling);
        }
        let mut config = Self::get_config(&env);
        if admin != config.admin {
            panic_with_error!(&env, XlmBridgeError::Unauthorized);
        }
        config.fee_bps = fee_bps;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    /// Pause / unpause the bridge (incident response).
    pub fn set_paused(env: Env, admin: Address, paused: bool) {
        admin.require_auth();
        let mut config = Self::get_config(&env);
        if admin != config.admin {
            panic_with_error!(&env, XlmBridgeError::Unauthorized);
        }
        config.paused = paused;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    // ── Queries ──────────────────────────────────────────────────────────

    /// Returns the administrative configuration.
    pub fn get_config(env: Env) -> Config {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(&env, XlmBridgeError::NotInitialized))
    }

    /// Returns a lock by id, if it exists.
    pub fn get_lock(env: Env, lock_id: u64) -> Option<BridgeLock> {
        env.storage().persistent().get(&DataKey::Lock(lock_id))
    }

    /// Returns every lock id created by `sender`.
    pub fn get_locks_for_sender(env: Env, sender: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::SenderLocks(sender))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Returns the bridge fee that would be charged for `amount`.
    pub fn quote_fee(env: Env, amount: i128) -> i128 {
        let config = Self::get_config(&env);
        if config.fee_bps <= 0 || amount <= 0 {
            return 0;
        }
        amount
            .checked_mul(config.fee_bps)
            .and_then(|v| v.checked_div(BPS_DENOM))
            .unwrap_or(0)
    }

    // ── Internals ────────────────────────────────────────────────────────

    fn assert_not_paused(env: &Env) {
        let config = Self::get_config(env);
        if config.paused {
            panic_with_error!(env, XlmBridgeError::Paused);
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Env,
    };

    /// Minimal mock of the tree-escrow contract. It mimics the real
    /// `sponsor_as_gift` semantics: it pulls `amount` XLM from the caller
    /// (the bridge, acting as donor) into itself.
    #[contract]
    struct MockTreeEscrow;

    const SYM_LAST: Symbol = symbol_short!("last_gift");

    #[contractimpl]
    impl MockTreeEscrow {
        pub fn sponsor_as_gift(
            env: Env,
            donor: Address,
            recipient_wallet: Address,
            farmer: Address,
            token: Address,
            amount: i128,
            tree_count: i128,
            area_hectares: i128,
        ) {
            token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &amount);
            // Stamp so the test can assert the call happened with the right args.
            env.storage().instance().set(
                &SYM_LAST,
                &(
                    donor,
                    recipient_wallet,
                    farmer,
                    amount,
                    tree_count,
                    area_hectares,
                ),
            );
        }

        /// Test-only getter: the last gift recorded by `sponsor_as_gift`.
        pub fn last_gift(env: Env) -> (Address, Address, Address, i128, i128, i128) {
            env.storage().instance().get(&SYM_LAST).unwrap()
        }
    }

    fn setup() -> (
        Env,
        Address, // admin
        Address, // xlm token id
        Address, // tree escrow (mock) id
        Address, // fee wallet
        XlmBridgeClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, XlmBridge);
        let client = XlmBridgeClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let fee_wallet = Address::generate(&env);

        let xlm = env.register_stellar_asset_contract(admin.clone());
        let escrow_id = env.register_contract(None, MockTreeEscrow);

        client.initialize(&admin, &xlm, &escrow_id, &fee_wallet, &50);

        (env, admin, xlm, escrow_id, fee_wallet, client)
    }

    fn lock(
        client: &XlmBridgeClient,
        sender: &Address,
        recipient: &Address,
        farmer: &Address,
        amount: i128,
    ) -> u64 {
        client.lock_for_purchase(
            sender,
            recipient,
            farmer,
            &amount,
            &10,
            &2,
            &String::from_str(&client.env, "ethereum"),
            &String::from_str(&client.env, "0xdeadbeef"),
        )
    }

    // ── initialize ───────────────────────────────────────────────────────

    #[test]
    fn initialize_sets_config() {
        let (_, admin, xlm, escrow_id, fee_wallet, client) = setup();
        let config = client.get_config();
        assert_eq!(config.admin, admin);
        assert_eq!(config.xlm, xlm);
        assert_eq!(config.tree_escrow, escrow_id);
        assert_eq!(config.fee_wallet, fee_wallet);
        assert_eq!(config.fee_bps, 50);
        assert_eq!(config.paused, false);
        assert_eq!(config.lock_count, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn initialize_twice_fails() {
        let (_, admin, xlm, escrow_id, fee_wallet, client) = setup();
        client.initialize(&admin, &xlm, &escrow_id, &fee_wallet, &50);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn initialize_fee_above_ceiling_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, XlmBridge);
        let client = XlmBridgeClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let xlm = env.register_stellar_asset_contract(admin.clone());
        client.initialize(
            &admin,
            &xlm,
            &Address::generate(&env),
            &Address::generate(&env),
            &501,
        );
    }

    // ── lock_for_purchase ────────────────────────────────────────────────

    #[test]
    fn lock_moves_funds_and_records() {
        let (env, _admin, xlm, _escrow_id, _fee_wallet, client) = setup();
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let farmer = Address::generate(&env);

        token::StellarAssetClient::new(&env, &xlm).mint(&sender, &1_000_000);

        let lock_id = lock(&client, &sender, &recipient, &farmer, 500_000);
        assert_eq!(lock_id, 1);

        let l = client.get_lock(&lock_id).unwrap();
        assert_eq!(l.sender, sender);
        assert_eq!(l.recipient, recipient);
        assert_eq!(l.farmer, farmer);
        assert_eq!(l.amount, 500_000);
        assert_eq!(l.tree_count, 10);
        assert_eq!(l.status, LockStatus::Locked);
        assert_eq!(l.source_chain, String::from_str(&env, "ethereum"));

        // Funds left the sender and are held by the bridge.
        assert_eq!(token::Client::new(&env, &xlm).balance(&sender), 500_000);
        assert_eq!(
            token::Client::new(&env, &xlm).balance(&client.address),
            500_000
        );

        // Second lock gets the next id.
        let id2 = lock(&client, &sender, &recipient, &farmer, 100_000);
        assert_eq!(id2, 2);
        assert_eq!(client.get_locks_for_sender(&sender).len(), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn lock_zero_amount_fails() {
        let (env, _admin, xlm, _escrow_id, _fee_wallet, client) = setup();
        let sender = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&sender, &1_000);
        client.lock_for_purchase(
            &sender,
            &Address::generate(&env),
            &Address::generate(&env),
            &0,
            &1,
            &1,
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0x1"),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn lock_overlong_chain_id_fails() {
        let (env, _admin, xlm, _escrow_id, _fee_wallet, client) = setup();
        let sender = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&sender, &1_000);
        client.lock_for_purchase(
            &sender,
            &Address::generate(&env),
            &Address::generate(&env),
            &1_000,
            &1,
            &1,
            &String::from_str(&env, "0123456789012345678901234567890123456"),
            &String::from_str(&env, "0x1"),
        );
    }

    // ── execute_purchase ─────────────────────────────────────────────────

    #[test]
    fn execute_purchase_forwards_to_escrow_and_charges_fee() {
        let (env, admin, xlm, escrow_id, fee_wallet, client) = setup();
        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let farmer = Address::generate(&env);

        token::StellarAssetClient::new(&env, &xlm).mint(&sender, &1_000_000);
        let lock_id = lock(&client, &sender, &recipient, &farmer, 1_010_000);

        // Fee at 50 bps on 1_010_000 = 5_050; purchase amount = 1_004_950.
        let trees = client.execute_purchase(&admin, &lock_id);
        assert_eq!(trees, 10);

        let l = client.get_lock(&lock_id).unwrap();
        assert_eq!(l.status, LockStatus::Executed);
        assert_eq!(l.fee_paid, 5_050);
        assert_eq!(l.trees_bought, 10);

        // Money moved: fee wallet got the fee, mock escrow got the rest.
        assert_eq!(token::Client::new(&env, &xlm).balance(&fee_wallet), 5_050);
        assert_eq!(
            token::Client::new(&env, &xlm).balance(&escrow_id),
            1_004_950
        );
        assert_eq!(token::Client::new(&env, &xlm).balance(&client.address), 0);

        // The mock recorded the gift with donor = bridge and our recipient.
        let mock = MockTreeEscrowClient::new(&env, &escrow_id);
        let last = mock.last_gift();
        assert_eq!(last.0, client.address);
        assert_eq!(last.1, recipient);
        assert_eq!(last.2, farmer);
        assert_eq!(last.3, 1_004_950);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn execute_purchase_non_admin_fails() {
        let (env, _admin, xlm, _escrow_id, _fee_wallet, client) = setup();
        let sender = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&sender, &10_000);
        let lock_id = lock(&client, &sender, &Address::generate(&env), &Address::generate(&env), 10_000);
        client.execute_purchase(&Address::generate(&env), &lock_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn execute_purchase_twice_fails() {
        let (env, admin, xlm, _escrow_id, _fee_wallet, client) = setup();
        let sender = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&sender, &10_000);
        let lock_id = lock(&client, &sender, &Address::generate(&env), &Address::generate(&env), 10_000);
        client.execute_purchase(&admin, &lock_id);
        client.execute_purchase(&admin, &lock_id);
    }

    // ── cancel_lock ──────────────────────────────────────────────────────

    #[test]
    fn cancel_lock_refunds_sender() {
        let (env, admin, xlm, _escrow_id, _fee_wallet, client) = setup();
        let sender = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&sender, &10_000);
        let lock_id = lock(&client, &sender, &Address::generate(&env), &Address::generate(&env), 10_000);

        client.cancel_lock(&admin, &lock_id);

        let l = client.get_lock(&lock_id).unwrap();
        assert_eq!(l.status, LockStatus::Cancelled);
        assert_eq!(token::Client::new(&env, &xlm).balance(&sender), 10_000);
        assert_eq!(token::Client::new(&env, &xlm).balance(&client.address), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn cancel_unknown_lock_fails() {
        let (_, admin, _xlm, _escrow_id, _fee_wallet, client) = setup();
        client.cancel_lock(&admin, &999);
    }

    // ── pause ────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn paused_locks_are_rejected() {
        let (env, admin, xlm, _escrow_id, _fee_wallet, client) = setup();
        client.set_paused(&admin, &true);
        let sender = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&sender, &10_000);
        lock(&client, &sender, &Address::generate(&env), &Address::generate(&env), 10_000);
    }

    // ── quote_fee ────────────────────────────────────────────────────────

    #[test]
    fn quote_fee_matches_execution() {
        let (_, _admin, _xlm, _escrow_id, _fee_wallet, client) = setup();
        assert_eq!(client.quote_fee(&1_010_000), 5_050);
        assert_eq!(client.quote_fee(&0), 0);
    }
}
