#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, IntoVal, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum trees per donation
const MAX_TREES: u32 = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DonationStatus {
    Pending,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct DonationRecord {
    pub donor: Address,
    pub token: Address,
    pub amount: i128,
    pub tree_count: u32,
    pub timestamp: u64,
    pub batch_id: u32,
    pub status: DonationStatus,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct RecurringDonation {
    pub donor: Address,
    pub token: Address,
    pub project_id: u64,
    pub amount_per_interval: i128,
    pub interval_seconds: u64,
    pub next_release: u64,
    pub total_released: i128,
    pub cancelled: bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct DonationEscrow;

#[contractimpl]
impl DonationEscrow {
    /// Initialize contract
    pub fn initialize(env: Env, admin: Address, xlm_token: Address, usdc_token: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }

        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("TOKENS"), &(xlm_token, usdc_token));

        // (current_batch, seq)
        env.storage().instance().set(&symbol_short!("BATCHSEQ"), &(1u32, 0u64));

        // recurring donation id counter
        env.storage().instance().set(&symbol_short!("RECSEQ"), &0u64);
    }

    /// Donate funds into escrow
    pub fn donate(
        env: Env,
        donor: Address,
        token: Address,
        amount: i128,
        tree_count: u32,
    ) -> u64 {
        donor.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        if tree_count == 0 || tree_count > MAX_TREES {
            panic!("tree_count must be between 1 and 50");
        }

        let (xlm, usdc): (Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("TOKENS"))
            .expect("not initialized");

        if token != xlm && token != usdc {
            panic!("unsupported token");
        }

        let (batch_id, seq): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap();

        let next_seq = seq + 1;

        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(batch_id, next_seq));

        // transfer funds
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );

        let rec = DonationRecord {
            donor: donor.clone(),
            token: token.clone(),
            amount,
            tree_count,
            timestamp: env.ledger().timestamp(),
            batch_id,
            status: DonationStatus::Pending,
        };

        env.storage()
            .persistent()
            .set(&Self::donation_key(&env, next_seq), &rec);

        env.events().publish(
            (symbol_short!("donate"), donor),
            (batch_id, tree_count, amount, token),
        );

        next_seq
    }

    /// Move to next batch
    pub fn advance_batch(env: Env) -> u32 {
        Self::require_admin(&env);

        let (batch_id, seq): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap();

        let next_batch = batch_id + 1;

        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(next_batch, seq));

        env.events().publish(
            (symbol_short!("batch"), batch_id),
            (next_batch, true),
        );

        next_batch
    }

    /// Release multiple donations
    pub fn release_batch(env: Env, seqs: Vec<u64>, destination: Address) {
        Self::require_admin(&env);

        for i in 0..seqs.len() {
            let seq = seqs.get(i).unwrap();

            let key = Self::donation_key(&env, seq);

            let mut rec: DonationRecord = env
                .storage()
                .persistent()
                .get(&key)
                .expect("not found");

            if rec.status != DonationStatus::Pending {
                panic!("already processed");
            }

            token::Client::new(&env, &rec.token).transfer(
                &env.current_contract_address(),
                &destination,
                &rec.amount,
            );

            rec.status = DonationStatus::Released;

            env.storage().persistent().set(&key, &rec);

            env.events().publish((symbol_short!("release"), seq), rec.amount);
        }
    }

    /// Refund donation
    pub fn refund(env: Env, seq: u64) {
        Self::require_admin(&env);

        let key = Self::donation_key(&env, seq);

        let mut rec: DonationRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("not found");

        if rec.status != DonationStatus::Pending {
            panic!("already processed");
        }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.donor,
            &rec.amount,
        );

        rec.status = DonationStatus::Refunded;

        env.storage().persistent().set(&key, &rec);

        env.events().publish((symbol_short!("refund"), seq), rec.amount);
    }

    /// Get donation by seq
    pub fn get_donation(env: Env, seq: u64) -> Option<DonationRecord> {
        env.storage()
            .persistent()
            .get(&Self::donation_key(&env, seq))
    }

    /// Current batch id
    pub fn current_batch(env: Env) -> u32 {
        let (batch_id, _): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap_or((1, 0));

        batch_id
    }

    // ── Recurring donations ───────────────────────────────────────────────────

    /// Set up a recurring donation. Locks the first interval's amount into escrow.
    /// Returns the donation_id.
    pub fn setup_recurring(
        env: Env,
        donor: Address,
        token: Address,
        project_id: u64,
        amount_per_interval: i128,
        interval_seconds: u64,
    ) -> u64 {
        donor.require_auth();

        if amount_per_interval <= 0 {
            panic!("amount_per_interval must be positive");
        }
        if interval_seconds == 0 {
            panic!("interval_seconds must be positive");
        }

        let (xlm, usdc): (Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("TOKENS"))
            .expect("not initialized");

        if token != xlm && token != usdc {
            panic!("unsupported token");
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("RECSEQ"))
            .unwrap_or(0u64)
            + 1;

        env.storage().instance().set(&symbol_short!("RECSEQ"), &id);

        // Lock first interval amount into escrow
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount_per_interval,
        );

        let rec = RecurringDonation {
            donor: donor.clone(),
            token,
            project_id,
            amount_per_interval,
            interval_seconds,
            next_release: env.ledger().timestamp() + interval_seconds,
            total_released: 0,
            cancelled: false,
        };

        env.storage()
            .persistent()
            .set(&Self::recurring_key(&env, id), &rec);

        id
    }

    /// Process a recurring donation interval. Callable by anyone.
    pub fn process_recurring(env: Env, donation_id: u64) {
        let key = Self::recurring_key(&env, donation_id);

        let mut rec: RecurringDonation = env
            .storage()
            .persistent()
            .get(&key)
            .expect("recurring donation not found");

        if rec.cancelled {
            panic!("CancelledDonation");
        }

        if env.ledger().timestamp() < rec.next_release {
            panic!("IntervalNotElapsed");
        }

        let project: Address = env
            .storage()
            .instance()
            .get(&Self::project_key(&env, rec.project_id))
            .expect("project not registered");

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &project,
            &rec.amount_per_interval,
        );

        rec.next_release += rec.interval_seconds;
        rec.total_released += rec.amount_per_interval;

        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (symbol_short!("donation"), symbol_short!("rec_proc")),
            (donation_id, rec.donor, rec.project_id, rec.amount_per_interval),
        );
    }

    /// Cancel a recurring donation and refund locked funds to donor.
    pub fn cancel_recurring(env: Env, donor: Address, donation_id: u64) {
        donor.require_auth();

        let key = Self::recurring_key(&env, donation_id);

        let mut rec: RecurringDonation = env
            .storage()
            .persistent()
            .get(&key)
            .expect("recurring donation not found");

        if rec.donor != donor {
            panic!("not the donor");
        }

        if rec.cancelled {
            panic!("already cancelled");
        }

        rec.cancelled = true;

        // Refund the locked (unreleased) interval amount back to donor
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &donor,
            &rec.amount_per_interval,
        );

        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (symbol_short!("donation"), symbol_short!("rec_cncl")),
            (donation_id, donor),
        );
    }

    /// Get recurring donation by id
    pub fn get_recurring(env: Env, donation_id: u64) -> Option<RecurringDonation> {
        env.storage()
            .persistent()
            .get(&Self::recurring_key(&env, donation_id))
    }

    /// Register a project address (admin only)
    pub fn register_project(env: Env, project_id: u64, project: Address) {
        Self::require_admin(&env);
        env.storage().instance().set(&Self::project_key(&env, project_id), &project);
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn donation_key(env: &Env, seq: u64) -> soroban_sdk::Val {
        (symbol_short!("DON"), seq).into_val(env)
    }

    fn recurring_key(env: &Env, id: u64) -> soroban_sdk::Val {
        (symbol_short!("RDONATE"), id).into_val(env)
    }

    fn project_key(env: &Env, project_id: u64) -> soroban_sdk::Val {
        (symbol_short!("PROJ"), project_id).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("not initialized");

        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger as _}, token, Address, Env};

    fn setup() -> (Env, Address, Address, Address, Address, DonationEscrowClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, DonationEscrow);
        let client = DonationEscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);

        let xlm = env.register_stellar_asset_contract(admin.clone());
        let usdc = env.register_stellar_asset_contract(admin.clone());

        token::StellarAssetClient::new(&env, &xlm).mint(&donor, &100_000);
        token::StellarAssetClient::new(&env, &usdc).mint(&donor, &100_000);

        client.initialize(&admin, &xlm, &usdc);

        (env, admin, donor, xlm, usdc, client)
    }

    #[test]
    fn test_donate_and_fetch() {
        let (_env, _admin, donor, xlm, _usdc, client) = setup();

        let seq = client.donate(&donor, &xlm, &5_000, &3);

        let rec = client.get_donation(&seq).unwrap();

        assert_eq!(rec.amount, 5_000);
        assert_eq!(rec.tree_count, 3);
        assert_eq!(rec.status, DonationStatus::Pending);
    }

    #[test]
    fn test_release() {
        let (_env, _admin, donor, xlm, _usdc, client) = setup();

        let seq = client.donate(&donor, &xlm, &5_000, &3);

        let dest = Address::generate(&_env);

        client.release_batch(&soroban_sdk::vec![&_env, seq], &dest);

        let rec = client.get_donation(&seq).unwrap();

        assert_eq!(rec.status, DonationStatus::Released);
    }

    #[test]
    fn test_refund() {
        let (_env, _admin, donor, xlm, _usdc, client) = setup();

        let seq = client.donate(&donor, &xlm, &5_000, &3);

        client.refund(&seq);

        let rec = client.get_donation(&seq).unwrap();

        assert_eq!(rec.status, DonationStatus::Refunded);
    }

    // ── Recurring donation tests ──────────────────────────────────────────────

    fn setup_recurring_env() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        u64,
        DonationEscrowClient<'static>,
    ) {
        let (env, admin, donor, xlm, usdc, client) = setup();

        let project = Address::generate(&env);
        let project_id: u64 = 1;
        client.register_project(&project_id, &project);

        (env, admin, donor, xlm, usdc, project_id, client)
    }

    #[test]
    fn test_process_recurring_succeeds_after_interval() {
        let (env, _admin, donor, xlm, _usdc, project_id, client) = setup_recurring_env();

        let interval: u64 = 1_000;
        let amount: i128 = 1_000;

        let id = client.setup_recurring(&donor, &xlm, &project_id, &amount, &interval);

        // Advance ledger time past the interval
        env.ledger().with_mut(|l| l.timestamp += interval + 1);

        client.process_recurring(&id);

        let rec = client.get_recurring(&id).unwrap();
        assert_eq!(rec.total_released, amount);
    }

    #[test]
    #[should_panic(expected = "IntervalNotElapsed")]
    fn test_process_recurring_fails_before_interval() {
        let (_env, _admin, donor, xlm, _usdc, project_id, client) = setup_recurring_env();

        let id = client.setup_recurring(&donor, &xlm, &project_id, &1_000, &1_000);

        // Do NOT advance time — should panic
        client.process_recurring(&id);
    }

    #[test]
    fn test_cancel_recurring_refunds_donor() {
        let (env, _admin, donor, xlm, _usdc, project_id, client) = setup_recurring_env();

        let amount: i128 = 1_000;
        let id = client.setup_recurring(&donor, &xlm, &project_id, &amount, &1_000);

        let balance_before = token::Client::new(&env, &xlm).balance(&donor);

        client.cancel_recurring(&donor, &id);

        let balance_after = token::Client::new(&env, &xlm).balance(&donor);
        assert_eq!(balance_after - balance_before, amount);

        let rec = client.get_recurring(&id).unwrap();
        assert!(rec.cancelled);
    }

    #[test]
    #[should_panic(expected = "CancelledDonation")]
    fn test_process_recurring_on_cancelled_panics() {
        let (env, _admin, donor, xlm, _usdc, project_id, client) = setup_recurring_env();

        let interval: u64 = 1_000;
        let id = client.setup_recurring(&donor, &xlm, &project_id, &1_000, &interval);

        client.cancel_recurring(&donor, &id);

        // Advance time past interval
        env.ledger().with_mut(|l| l.timestamp += interval + 1);

        // Should panic with CancelledDonation
        client.process_recurring(&id);
    }

    #[test]
    fn test_total_released_increments_across_intervals() {
        let (env, _admin, donor, xlm, _usdc, project_id, client) = setup_recurring_env();

        let interval: u64 = 1_000;
        let amount: i128 = 500;

        // Mint enough for multiple intervals
        token::StellarAssetClient::new(&env, &xlm).mint(&donor, &10_000);

        let id = client.setup_recurring(&donor, &xlm, &project_id, &amount, &interval);

        // First interval: advance past next_release (ledger starts at 0, next_release = interval)
        env.ledger().with_mut(|l| l.timestamp = interval + 1);
        client.process_recurring(&id);

        let rec = client.get_recurring(&id).unwrap();
        assert_eq!(rec.total_released, amount);
        // next_release was interval, after processing it becomes interval + interval = 2*interval
        assert_eq!(rec.next_release, 2 * interval);
    }
}
