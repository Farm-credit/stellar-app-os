#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal,
};

/// 90 days in seconds
const REFUND_WINDOW: u64 = 90 * 24 * 60 * 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AmountMustBePositive = 3,
    EscrowAlreadyFunded = 4,
    EscrowNotFound = 5,
    EscrowAlreadySettled = 6,
    RefundWindowNotOpen = 7,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Pending,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowRecord {
    pub sponsor: Address,
    pub planter: Address,
    pub token: Address,
    pub amount: i128,
    pub deposit_time: u64,
    pub status: EscrowStatus,
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// Initialize with a verifier address (the only party that can call release).
    pub fn initialize(env: Env, verifier: Address) {
        if env.storage().instance().has(&symbol_short!("VERIFIER")) {
            panic_with_error!(&env, EscrowError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("VERIFIER"), &verifier);
    }

    /// Sponsor deposits funds for a specific tree_id into escrow.
    pub fn deposit(
        env: Env,
        sponsor: Address,
        planter: Address,
        tree_id: u64,
        token: Address,
        amount: i128,
    ) {
        sponsor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, EscrowError::AmountMustBePositive);
        }

        let key = Self::escrow_key(&env, tree_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, EscrowError::EscrowAlreadyFunded);
        }

        token::Client::new(&env, &token).transfer(
            &sponsor,
            &env.current_contract_address(),
            &amount,
        );

        env.storage().persistent().set(
            &key,
            &EscrowRecord {
                sponsor: sponsor.clone(),
                planter,
                token: token.clone(),
                amount,
                deposit_time: env.ledger().timestamp(),
                status: EscrowStatus::Pending,
            },
        );

        env.events().publish(
            (symbol_short!("FundsDep"), tree_id),
            (sponsor, token, amount),
        );
    }

    /// Release funds to the planter. Only callable by the registered verifier.
    pub fn release(env: Env, tree_id: u64) {
        Self::require_verifier(&env);

        let key = Self::escrow_key(&env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowNotFound));

        if record.status != EscrowStatus::Pending {
            panic_with_error!(&env, EscrowError::EscrowAlreadySettled);
        }

        token::Client::new(&env, &record.token).transfer(
            &env.current_contract_address(),
            &record.planter,
            &record.amount,
        );

        record.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("FundsRel"), tree_id),
            (record.planter, record.amount),
        );
    }

    /// Refund funds to sponsor if 90 days have elapsed without a release.
    /// Only the original sponsor may call this.
    pub fn refund(env: Env, tree_id: u64) {
        let key = Self::escrow_key(&env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowNotFound));

        if record.status != EscrowStatus::Pending {
            panic_with_error!(&env, EscrowError::EscrowAlreadySettled);
        }

        record.sponsor.require_auth();

        let elapsed = env.ledger().timestamp().saturating_sub(record.deposit_time);
        if elapsed < REFUND_WINDOW {
            panic_with_error!(&env, EscrowError::RefundWindowNotOpen);
        }

        token::Client::new(&env, &record.token).transfer(
            &env.current_contract_address(),
            &record.sponsor,
            &record.amount,
        );

        record.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("FundsRef"), tree_id),
            (record.sponsor, record.amount),
        );
    }

    /// Get escrow record for a tree.
    pub fn get_escrow(env: Env, tree_id: u64) -> Option<EscrowRecord> {
        env.storage()
            .persistent()
            .get(&Self::escrow_key(&env, tree_id))
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn escrow_key(env: &Env, tree_id: u64) -> soroban_sdk::Val {
        (symbol_short!("ESC"), tree_id).into_val(env)
    }

    fn require_verifier(env: &Env) {
        let verifier: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("VERIFIER"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::NotInitialized));
        verifier.require_auth();
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

    fn setup() -> (Env, Address, Address, Address, Address, EscrowClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, Escrow);
        let client = EscrowClient::new(&env, &contract_id);

        let verifier = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let token_admin = Address::generate(&env);

        let token = env.register_stellar_asset_contract(token_admin.clone());
        token::StellarAssetClient::new(&env, &token).mint(&sponsor, &1_000_000);

        client.initialize(&verifier);

        (env, verifier, sponsor, planter, token, client)
    }

    #[test]
    fn test_deposit_stores_record() {
        let (_env, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.amount, 10_000);
        assert_eq!(rec.sponsor, sponsor);
        assert_eq!(rec.planter, planter);
        assert_eq!(rec.status, EscrowStatus::Pending);
    }

    #[test]
    fn test_release_transfers_to_planter() {
        let (env, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        let before = token::Client::new(&env, &token).balance(&planter);
        client.release(&1u64);
        let after = token::Client::new(&env, &token).balance(&planter);

        assert_eq!(after - before, 10_000);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Released);
    }

    #[test]
    fn test_refund_after_90_days_returns_to_sponsor() {
        let (env, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        env.ledger().with_mut(|l| l.timestamp += REFUND_WINDOW + 1);

        let before = token::Client::new(&env, &token).balance(&sponsor);
        client.refund(&1u64);
        let after = token::Client::new(&env, &token).balance(&sponsor);

        assert_eq!(after - before, 10_000);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_refund_before_90_days_panics() {
        let (env, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        env.ledger()
            .with_mut(|l| l.timestamp += REFUND_WINDOW - 1);

        client.refund(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_double_deposit_rejected() {
        let (_env, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.deposit(&sponsor, &planter, &1u64, &token, &5_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_release_twice_panics() {
        let (_env, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.release(&1u64);
        client.release(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_refund_after_release_panics() {
        let (env, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.release(&1u64);

        env.ledger().with_mut(|l| l.timestamp += REFUND_WINDOW + 1);
        client.refund(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_release_nonexistent_panics() {
        let (_env, _verifier, _sponsor, _planter, _token, client) = setup();

        client.release(&999u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_zero_amount_rejected() {
        let (_env, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &0);
    }

    #[test]
    fn test_different_tree_ids_are_independent() {
        let (_env, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &1_000);
        client.deposit(&sponsor, &planter, &2u64, &token, &2_000);

        client.release(&1u64);

        let rec1 = client.get_escrow(&1u64).unwrap();
        let rec2 = client.get_escrow(&2u64).unwrap();

        assert_eq!(rec1.status, EscrowStatus::Released);
        assert_eq!(rec2.status, EscrowStatus::Pending);
    }
}
