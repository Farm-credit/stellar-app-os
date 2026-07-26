#![no_std]

use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum trees per donation
const MAX_TREES: u32 = 50;
/// Common unit used for normalizing token amounts for reporting/calc purposes.
/// XLM and USDC both use 7 decimals, but we normalize through this shared base
/// so the contract can support additional tokens without changing callers.
const COMMON_DECIMALS: u32 = 7;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum DonationEscrowError {
    UnsupportedToken = 82,
    TokenAlreadyAccepted = 83,
    AlreadyProcessed = 84,
    AmountPerIntervalMustBePositive = 85,
    IntervalSecondsMustBePositive = 86,
    RecurringDonationNotFound = 87,
    DonationCancelled = 88,
    IntervalNotElapsed = 89,
    ProjectNotRegistered = 90,
    NotDonor = 91,
    DonationAlreadyCancelled = 92,
}

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
    pub normalized_amount: i128,
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
    pub normalized_amount_per_interval: i128,
    pub interval_seconds: u64,
    pub next_release: u64,
    pub total_released: i128,
    pub total_released_normalized: i128,
    pub cancelled: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AcceptedToken {
    pub token: Address,
    pub decimals: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct DonationEscrow;

#[contractimpl]
impl DonationEscrow {
    /// Initialize contract
    pub fn initialize(env: Env, admin: Address, xlm_token: Address, usdc_token: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }

        // Keep a canonical record of the two supported payment rails.
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(
            &symbol_short!("TOKENS"),
            &(xlm_token.clone(), usdc_token.clone()),
        );
        env.storage()
            .instance()
            .set(&symbol_short!("TOKENSV"), &Vec::<AcceptedToken>::new(&env));

        // (current_batch, seq)
        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(1u32, 0u64));

        // recurring donation id counter
        env.storage()
            .instance()
            .set(&symbol_short!("RECSEQ"), &0u64);

        // Register the two canonical payment tokens up front.
        Self::add_accepted_token_internal(&env, &xlm_token, false);
        Self::add_accepted_token_internal(&env, &usdc_token, false);
    }

    /// Donate funds into escrow
    pub fn donate(env: Env, donor: Address, token: Address, amount: i128, tree_count: u32) -> u64 {
        donor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        if tree_count == 0 || tree_count > MAX_TREES {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
        }

        Self::assert_accepted_token(&env, &token);
        let normalized_amount = Self::normalize_amount(&env, &token, amount);

        let (batch_id, seq): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap();

        let next_seq = seq.checked_add(1).expect("sequence counter overflow");

        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(batch_id, next_seq));

        // transfer funds
        token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &amount);

        let rec = DonationRecord {
            donor: donor.clone(),
            token: token.clone(),
            amount,
            normalized_amount,
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

        let next_batch = batch_id.checked_add(1).expect("batch counter overflow");

        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(next_batch, seq));

        env.events()
            .publish((symbol_short!("batch"), batch_id), (next_batch, true));

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
                .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

            if rec.status != DonationStatus::Pending {
                panic_with_error!(&env, DonationEscrowError::AlreadyProcessed);
            }

            token::Client::new(&env, &rec.token).transfer(
                &env.current_contract_address(),
                &destination,
                &rec.amount,
            );

            rec.status = DonationStatus::Released;

            env.storage().persistent().set(&key, &rec);

            env.events()
                .publish((symbol_short!("release"), seq), rec.amount);
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
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if rec.status != DonationStatus::Pending {
            panic_with_error!(&env, DonationEscrowError::AlreadyProcessed);
        }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.donor,
            &rec.amount,
        );

        rec.status = DonationStatus::Refunded;

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("refund"), seq), rec.amount);
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
            panic_with_error!(&env, DonationEscrowError::AmountPerIntervalMustBePositive);
        }
        if interval_seconds == 0 {
            panic_with_error!(&env, DonationEscrowError::IntervalSecondsMustBePositive);
        }

        Self::assert_accepted_token(&env, &token);
        let normalized_amount_per_interval =
            Self::normalize_amount(&env, &token, amount_per_interval);

        let id: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("RECSEQ"))
            .unwrap_or(0u64)
            .checked_add(1)
            .expect("recurring sequence counter overflow");

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
            normalized_amount_per_interval,
            interval_seconds,
            next_release: env.ledger().timestamp().checked_add(interval_seconds).expect("next release time overflow"),
            total_released: 0,
            total_released_normalized: 0,
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

        let mut rec: RecurringDonation =
            env.storage().persistent().get(&key).unwrap_or_else(|| {
                panic_with_error!(&env, DonationEscrowError::RecurringDonationNotFound)
            });

        if rec.cancelled {
            panic_with_error!(&env, DonationEscrowError::DonationCancelled);
        }

        if env.ledger().timestamp() < rec.next_release {
            panic_with_error!(&env, DonationEscrowError::IntervalNotElapsed);
        }

        let project: Address = env
            .storage()
            .instance()
            .get(&Self::project_key(&env, rec.project_id))
            .unwrap_or_else(|| panic_with_error!(&env, DonationEscrowError::ProjectNotRegistered));

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &project,
            &rec.amount_per_interval,
        );

        rec.next_release = rec
            .next_release
            .checked_add(rec.interval_seconds)
            .expect("next release time overflow");
        rec.total_released = rec
            .total_released
            .checked_add(rec.amount_per_interval)
            .expect("total released overflow");
        rec.total_released_normalized += rec.normalized_amount_per_interval;

        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (symbol_short!("donation"), symbol_short!("rec_proc")),
            (
                donation_id,
                rec.donor,
                rec.project_id,
                rec.amount_per_interval,
            ),
        );
    }

    /// Cancel a recurring donation and refund locked funds to donor.
    pub fn cancel_recurring(env: Env, donor: Address, donation_id: u64) {
        donor.require_auth();

        let key = Self::recurring_key(&env, donation_id);

        let mut rec: RecurringDonation =
            env.storage().persistent().get(&key).unwrap_or_else(|| {
                panic_with_error!(&env, DonationEscrowError::RecurringDonationNotFound)
            });

        if rec.donor != donor {
            panic_with_error!(&env, DonationEscrowError::NotDonor);
        }

        if rec.cancelled {
            panic_with_error!(&env, DonationEscrowError::DonationAlreadyCancelled);
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
        env.storage()
            .instance()
            .set(&Self::project_key(&env, project_id), &project);
    }

    /// Add a new accepted payment token. Restricted to admin.
    pub fn add_accepted_token(env: Env, token_address: Address) {
        Self::require_admin(&env);
        Self::add_accepted_token_internal(&env, &token_address, true);
    }

    /// Backward-compatible alias for the accepted token list.
    pub fn add_to_whitelist(env: Env, addr: Address) {
        Self::add_accepted_token(env, addr);
    }

    /// Returns `true` if `addr` is on the accepted-token list.
    pub fn is_whitelisted(env: Env, addr: Address) -> bool {
        Self::is_accepted_token_internal(&env, &addr)
    }

    /// Panics if `addr` is not on the accepted-token list.
    pub fn assert_whitelisted(env: Env, addr: Address) {
        Self::assert_accepted_token(&env, &addr);
    }

    /// Returns a snapshot of all accepted tokens and their decimals.
    pub fn get_accepted_tokens(env: Env) -> Vec<AcceptedToken> {
        Self::load_accepted_tokens(&env)
    }

    /// Returns `true` if `addr` is on the accepted-token list.
    pub fn is_accepted_token(env: Env, addr: Address) -> bool {
        Self::is_accepted_token_internal(&env, &addr)
    }
}

impl DonationEscrow {
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
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));

        admin.require_auth();
    }

    fn assert_accepted_token(env: &Env, token: &Address) {
        if !Self::is_accepted_token_internal(env, token) {
            panic_with_error!(env, DonationEscrowError::UnsupportedToken);
        }
    }

    fn add_accepted_token_internal(env: &Env, token_address: &Address, fail_on_duplicate: bool) {
        let mut tokens = Self::load_accepted_tokens(env);
        for i in 0..tokens.len() {
            if tokens.get(i).unwrap().token == *token_address {
                if fail_on_duplicate {
                    panic_with_error!(env, DonationEscrowError::TokenAlreadyAccepted);
                }
                return;
            }
        }

        let decimals = token::Client::new(env, token_address).decimals();
        tokens.push_back(AcceptedToken {
            token: token_address.clone(),
            decimals,
        });
        env.storage()
            .instance()
            .set(&symbol_short!("TOKENSV"), &tokens);
    }

    fn normalize_amount(env: &Env, token: &Address, amount: i128) -> i128 {
        let tokens = Self::load_accepted_tokens(env);
        for i in 0..tokens.len() {
            let accepted = tokens.get(i).unwrap();
            if accepted.token == *token {
                return Self::normalize_to_common_unit(amount, accepted.decimals);
            }
        }
        panic_with_error!(env, DonationEscrowError::UnsupportedToken);
    }

    fn load_accepted_tokens(env: &Env) -> Vec<AcceptedToken> {
        env.storage()
            .instance()
            .get(&symbol_short!("TOKENSV"))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn is_accepted_token_internal(env: &Env, token: &Address) -> bool {
        let tokens = Self::load_accepted_tokens(env);
        for i in 0..tokens.len() {
            if tokens.get(i).unwrap().token == *token {
                return true;
            }
        }
        false
    }

    fn normalize_to_common_unit(amount: i128, decimals: u32) -> i128 {
        if decimals == COMMON_DECIMALS {
            return amount;
        }

        let diff = if decimals > COMMON_DECIMALS {
            decimals - COMMON_DECIMALS
        } else {
            COMMON_DECIMALS - decimals
        };

        let mut factor = 1i128;
        let mut i = 0u32;
        while i < diff {
            factor = factor
                .checked_mul(10)
                .unwrap_or_else(|| panic!("normalization factor overflow"));
            i += 1;
        }

        if decimals > COMMON_DECIMALS {
            amount / factor
        } else {
            amount * factor
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Address, Env,
    };

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        DonationEscrowClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, DonationEscrow);
        let client = DonationEscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);

        let xlm = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let usdc = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

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
        assert_eq!(rec.normalized_amount, 5_000);
        assert_eq!(rec.tree_count, 3);
        assert_eq!(rec.status, DonationStatus::Pending);
    }

    #[test]
    fn test_initial_tokens_are_persisted_in_storage() {
        let (_env, _admin, _donor, xlm, usdc, client) = setup();

        assert!(client.is_whitelisted(&xlm));
        assert!(client.is_whitelisted(&usdc));

        let accepted = client.get_accepted_tokens();
        assert_eq!(accepted.len(), 2);
    }

    #[test]
    fn test_add_accepted_token_accepts_additional_payment_token() {
        let (env, admin, donor, _xlm, _usdc, client) = setup();
        let extra = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &extra).mint(&donor, &100_000);

        client.add_accepted_token(&extra);
        assert!(client.is_whitelisted(&extra));
        assert_eq!(client.get_accepted_tokens().len(), 3);

        let seq = client.donate(&donor, &extra, &10_000, &2);
        let rec = client.get_donation(&seq).unwrap();
        assert_eq!(rec.normalized_amount, 10_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #83)")]
    fn test_add_accepted_token_rejects_duplicates() {
        let (env, admin, donor, _xlm, _usdc, client) = setup();
        let extra = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &extra).mint(&donor, &100_000);

        client.add_accepted_token(&extra);
        client.add_accepted_token(&extra);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #82)")]
    fn test_donate_rejects_unsupported_token() {
        let (env, _admin, donor, _xlm, _usdc, client) = setup();
        let unsupported = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        token::StellarAssetClient::new(&env, &unsupported).mint(&donor, &100_000);

        client.donate(&donor, &unsupported, &5_000, &1);
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
        assert_eq!(rec.total_released_normalized, amount);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #89)")]
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
    #[should_panic(expected = "Error(Contract, #88)")]
    fn test_process_recurring_on_cancelled_panics() {
        let (env, _admin, donor, xlm, _usdc, project_id, client) = setup_recurring_env();

        let interval: u64 = 1_000;
        let id = client.setup_recurring(&donor, &xlm, &project_id, &1_000, &interval);

        client.cancel_recurring(&donor, &id);

        // Advance time past interval
        env.ledger().with_mut(|l| l.timestamp += interval + 1);

        // Should panic with DonationCancelled
        client.process_recurring(&id);
    }

    #[test]
    fn test_normalization_helper_scales_amounts_to_common_unit() {
        assert_eq!(DonationEscrow::normalize_to_common_unit(1_000, 7), 1_000);
        assert_eq!(DonationEscrow::normalize_to_common_unit(1_000, 6), 10_000);
        assert_eq!(DonationEscrow::normalize_to_common_unit(10_000, 8), 1_000);
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
