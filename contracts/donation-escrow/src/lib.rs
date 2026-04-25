#![no_std]

//! Donation Escrow Contract — Closes #302
//!
//! Accepts XLM and USDC donations, locking funds in escrow per planting batch.
//! Each donation creates an immutable on-chain record containing:
//!   • Donor address
//!   • Token (XLM or USDC — any SEP-41 token)
//!   • Amount deposited
//!   • Number of trees funded
//!   • Deposit timestamp
//!
//! Fund release flow:
//!   Locked → Released (admin confirms planting) / Refunded (admin cancels)
//!
//! Batch IDs are monotonically incrementing integers (0, 1, 2, …).

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, IntoVal,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Minimum donation is 1 stroops / 1 base-unit of any token
const MIN_DONATION: i128 = 1;
/// Minimum tree count per batch
const MIN_TREES: u32 = 1;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BatchStatus {
    /// Funds deposited and locked, awaiting planting verification
    Locked,
    /// Planting verified — funds released to the farmer wallet
    Released,
    /// Batch cancelled before planting — funds returned to donor
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct DonationBatch {
    /// Sequential batch identifier
    pub batch_id: u64,
    /// Donor's Stellar account
    pub donor: Address,
    /// SEP-41 token address (XLM native or USDC issuer contract)
    pub token: Address,
    /// Amount of token deposited (in token's base unit / stroops for XLM)
    pub amount: i128,
    /// Number of trees this donation funds
    pub tree_count: u32,
    /// Ledger timestamp of the deposit
    pub deposited_at: u64,
    /// Current lifecycle status of this batch
    pub status: BatchStatus,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct DonationEscrow;

#[contractimpl]
impl DonationEscrow {
    /// One-time initialisation — sets the admin/verifier address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        // Initialise batch counter at 0
        env.storage().instance().set(&symbol_short!("NEXT_ID"), &0u64);
    }

    /// Donor deposits `amount` of `token` into escrow, funding `tree_count` trees.
    ///
    /// `token` may be the native XLM wrapped asset or the USDC contract address.
    /// Returns the assigned batch ID for tracking.
    pub fn donate(
        env: Env,
        donor: Address,
        token: Address,
        amount: i128,
        tree_count: u32,
    ) -> u64 {
        donor.require_auth();

        if amount < MIN_DONATION {
            panic!("donation amount must be at least 1");
        }
        if tree_count < MIN_TREES {
            panic!("tree_count must be at least 1");
        }

        // Pull funds from donor into contract escrow
        token::Client::new(&env, &token)
            .transfer(&donor, &env.current_contract_address(), &amount);

        // Assign and increment batch ID
        let batch_id: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("NEXT_ID"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol_short!("NEXT_ID"), &(batch_id + 1));

        let batch = DonationBatch {
            batch_id,
            donor: donor.clone(),
            token,
            amount,
            tree_count,
            deposited_at: env.ledger().timestamp(),
            status: BatchStatus::Locked,
        };

        env.storage().persistent().set(&Self::batch_key(&env, batch_id), &batch);

        env.events().publish(
            (symbol_short!("donated"), donor),
            (batch_id, amount, tree_count),
        );

        batch_id
    }

    /// Admin releases locked funds to a farmer wallet after planting is verified.
    pub fn release_batch(env: Env, batch_id: u64, farmer: Address) {
        Self::require_admin(&env);

        let key = Self::batch_key(&env, batch_id);
        let mut batch: DonationBatch = env
            .storage()
            .persistent()
            .get(&key)
            .expect("batch not found");

        if batch.status != BatchStatus::Locked {
            panic!("batch is not in Locked state");
        }

        token::Client::new(&env, &batch.token)
            .transfer(&env.current_contract_address(), &farmer, &batch.amount);

        batch.status = BatchStatus::Released;
        env.storage().persistent().set(&key, &batch);

        env.events().publish(
            (symbol_short!("released"), farmer),
            (batch_id, batch.amount),
        );
    }

    /// Admin refunds a locked batch back to the original donor (before planting).
    pub fn refund_batch(env: Env, batch_id: u64) {
        Self::require_admin(&env);

        let key = Self::batch_key(&env, batch_id);
        let mut batch: DonationBatch = env
            .storage()
            .persistent()
            .get(&key)
            .expect("batch not found");

        if batch.status != BatchStatus::Locked {
            panic!("only Locked batches can be refunded");
        }

        token::Client::new(&env, &batch.token)
            .transfer(&env.current_contract_address(), &batch.donor, &batch.amount);

        batch.status = BatchStatus::Refunded;
        env.storage().persistent().set(&key, &batch);

        env.events().publish(
            (symbol_short!("refunded"), batch.donor.clone()),
            (batch_id, batch.amount),
        );
    }

    /// Fetch a donation batch by ID.
    pub fn get_batch(env: Env, batch_id: u64) -> Option<DonationBatch> {
        env.storage().persistent().get(&Self::batch_key(&env, batch_id))
    }

    /// Returns the next batch ID that will be assigned (i.e. total batches so far).
    pub fn next_batch_id(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("NEXT_ID"))
            .unwrap_or(0)
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn batch_key(env: &Env, batch_id: u64) -> soroban_sdk::Val {
        (symbol_short!("BATCH"), batch_id).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env};

    fn setup() -> (Env, Address, Address, Address, DonationEscrowClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, DonationEscrow);
        let client = DonationEscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract(admin.clone());
        token::StellarAssetClient::new(&env, &token_id).mint(&donor, &100_000);

        client.initialize(&admin);
        (env, admin, donor, token_id, client)
    }

    #[test]
    fn test_donate_locks_funds_and_returns_batch_id() {
        let (_env, _admin, donor, token, client) = setup();

        let batch_id = client.donate(&donor, &token, &50_000, &100);
        assert_eq!(batch_id, 0);

        let batch = client.get_batch(&0).unwrap();
        assert_eq!(batch.donor, donor);
        assert_eq!(batch.amount, 50_000);
        assert_eq!(batch.tree_count, 100);
        assert_eq!(batch.status, BatchStatus::Locked);
    }

    #[test]
    fn test_batch_ids_increment() {
        let (env, _admin, donor, token, client) = setup();
        let donor2 = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&donor2, &10_000);

        let id0 = client.donate(&donor, &token, &10_000, &10);
        let id1 = client.donate(&donor2, &token, &10_000, &20);
        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
        assert_eq!(client.next_batch_id(), 2);
    }

    #[test]
    fn test_release_batch_transfers_to_farmer() {
        let (env, _admin, donor, token, client) = setup();
        let farmer = Address::generate(&env);

        client.donate(&donor, &token, &50_000, &100);
        client.release_batch(&0, &farmer);

        let batch = client.get_batch(&0).unwrap();
        assert_eq!(batch.status, BatchStatus::Released);
    }

    #[test]
    fn test_refund_batch_returns_to_donor() {
        let (_env, _admin, donor, token, client) = setup();

        client.donate(&donor, &token, &50_000, &100);
        client.refund_batch(&0);

        let batch = client.get_batch(&0).unwrap();
        assert_eq!(batch.status, BatchStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "only Locked batches can be refunded")]
    fn test_double_refund_rejected() {
        let (_env, _admin, donor, token, client) = setup();

        client.donate(&donor, &token, &50_000, &100);
        client.refund_batch(&0);
        client.refund_batch(&0); // must panic
    }

    #[test]
    #[should_panic(expected = "batch is not in Locked state")]
    fn test_release_after_refund_rejected() {
        let (env, _admin, donor, token, client) = setup();
        let farmer = Address::generate(&env);

        client.donate(&donor, &token, &50_000, &100);
        client.refund_batch(&0);
        client.release_batch(&0, &farmer); // must panic
    }

    #[test]
    #[should_panic(expected = "donation amount must be at least 1")]
    fn test_zero_amount_rejected() {
        let (_env, _admin, donor, token, client) = setup();
        client.donate(&donor, &token, &0, &10);
    }

    #[test]
    #[should_panic(expected = "tree_count must be at least 1")]
    fn test_zero_tree_count_rejected() {
        let (_env, _admin, donor, token, client) = setup();
        client.donate(&donor, &token, &1_000, &0);
    }
}
