#![no_std]

//! Staking Rewards Contract — earn XLM by sponsoring trees for 1+ years
//!
//! Closes #1095

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env};

// -- Constants ----------------------------------------------------------------
const MIN_LOCK_SECONDS: u64 = 31_536_000; // 12 months
const YEAR_SECONDS: u64 = 31_536_000; // 365 days
const BPS_DIVISOR: i128 = 10_000; // 100% = 10000 bps

// -- Types --------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StakeStatus {
    Active,
    Claimed,
    UnstakedEarly,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct StakeRecord {
    pub id: u64,
    pub sponsor: Address,
    pub amount: i128,
    pub lock_start: u64,
    pub lock_end: u64,
    pub apy_bps: u32,
    pub status: StakeStatus,
}

// -- Contract -----------------------------------------------------------------

#[contract]
pub struct StakingRewards;

#[contractimpl]
impl StakingRewards {
    /// Initialize the staking contract.
    pub fn initialize(env: Env, admin: Address, xlm_token: Address, default_apy_bps: u32) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        if default_apy_bps > BPS_DIVISOR as u32 {
            panic!("apy_bps cannot exceed 10000");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("TOKEN"), &xlm_token);
        env.storage().instance().set(&symbol_short!("APY"), &default_apy_bps);
        env.storage().instance().set(&symbol_short!("SEQ"), &0u64);
    }

    /// Lock XLM for 12+ months to earn APY rewards.
    pub fn stake(env: Env, sponsor: Address, amount: i128, lock_months: u32) -> u64 {
        sponsor.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        if lock_months < 12 {
            panic!("minimum lock is 12 months");
        }

        let token: Address = env.storage().instance().get(&symbol_short!("TOKEN"))
            .expect("not initialized");
        let apy_bps: u32 = env.storage().instance().get(&symbol_short!("APY"))
            .unwrap_or(500);

        let id: u64 = env.storage().instance().get(&symbol_short!("SEQ")).unwrap_or(0) + 1;
        env.storage().instance().set(&symbol_short!("SEQ"), &id);

        token::Client::new(&env, &token).transfer(
            &sponsor,
            &env.current_contract_address(),
            &amount,
        );

        let now = env.ledger().timestamp();
        let lock_seconds = lock_months as u64 * 30 * 24 * 60 * 60;
        let effective_lock = if lock_seconds < MIN_LOCK_SECONDS { MIN_LOCK_SECONDS } else { lock_seconds };

        let rec = StakeRecord {
            id,
            sponsor: sponsor.clone(),
            amount,
            lock_start: now,
            lock_end: now + effective_lock,
            apy_bps,
            status: StakeStatus::Active,
        };

        env.storage().persistent().set(&Self::stake_key(&env, id), &rec);
        env.storage().persistent().extend_ttl(&Self::stake_key(&env, id), 535_680, 535_680);

        env.events().publish(
            (symbol_short!("stake"),),
            (id, sponsor, amount, lock_months, apy_bps),
        );

        id
    }

    /// Calculate rewards for a stake.
    pub fn calculate_rewards(env: Env, stake_id: u64) -> i128 {
        let rec: StakeRecord = env.storage().persistent()
            .get(&Self::stake_key(&env, stake_id))
            .expect("stake not found");

        let now = env.ledger().timestamp();
        let effective_end = if now > rec.lock_end { rec.lock_end } else { now };
        let time_locked = effective_end.saturating_sub(rec.lock_start);
        if time_locked == 0 {
            return 0;
        }

        (rec.amount * rec.apy_bps as i128 * time_locked as i128)
            / (BPS_DIVISOR * YEAR_SECONDS as i128)
    }

    /// Claim principal + rewards after lock expires.
    pub fn claim(env: Env, sponsor: Address, stake_id: u64) -> i128 {
        sponsor.require_auth();

        let key = Self::stake_key(&env, stake_id);
        let mut rec: StakeRecord = env.storage().persistent().get(&key)
            .expect("stake not found");

        if rec.sponsor != sponsor {
            panic!("not the sponsor");
        }
        if rec.status != StakeStatus::Active {
            panic!("stake is not active");
        }

        let now = env.ledger().timestamp();
        if now < rec.lock_end {
            panic!("lock period not expired");
        }

        let rewards = Self::calculate_rewards(&env, stake_id);
        let token: Address = env.storage().instance().get(&symbol_short!("TOKEN"))
            .expect("not initialized");

        // Transfer principal
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &sponsor,
            &rec.amount,
        );

        // Transfer rewards
        if rewards > 0 {
            token::Client::new(&env, &token).transfer(
                &env.current_contract_address(),
                &sponsor,
                &rewards,
            );
        }

        rec.status = StakeStatus::Claimed;
        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (symbol_short!("claim"),),
            (stake_id, sponsor, rec.amount, rewards),
        );

        rec.amount + rewards
    }

    /// Early unstake: forfeit rewards, get principal back.
    pub fn unstake(env: Env, sponsor: Address, stake_id: u64) -> i128 {
        sponsor.require_auth();

        let key = Self::stake_key(&env, stake_id);
        let mut rec: StakeRecord = env.storage().persistent().get(&key)
            .expect("stake not found");

        if rec.sponsor != sponsor {
            panic!("not the sponsor");
        }
        if rec.status != StakeStatus::Active {
            panic!("stake is not active");
        }

        let token: Address = env.storage().instance().get(&symbol_short!("TOKEN"))
            .expect("not initialized");

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &sponsor,
            &rec.amount,
        );

        rec.status = StakeStatus::UnstakedEarly;
        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (symbol_short!("unstake"),),
            (stake_id, sponsor, rec.amount),
        );

        rec.amount
    }

    /// Admin: fund the rewards pool.
    pub fn fund_rewards(env: Env, admin: Address, amount: i128) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&symbol_short!("ADMIN"))
            .expect("not initialized");
        if admin != stored_admin {
            panic!("not admin");
        }

        let token: Address = env.storage().instance().get(&symbol_short!("TOKEN"))
            .expect("not initialized");
        token::Client::new(&env, &token).transfer(
            &admin,
            &env.current_contract_address(),
            &amount,
        );

        env.events().publish((symbol_short!("fund"),), (amount,));
    }

    /// Admin: update the default APY in basis points.
    pub fn update_apy(env: Env, admin: Address, new_apy_bps: u32) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&symbol_short!("ADMIN"))
            .expect("not initialized");
        if admin != stored_admin {
            panic!("not admin");
        }
        if new_apy_bps > BPS_DIVISOR as u32 {
            panic!("apy_bps cannot exceed 10000");
        }
        env.storage().instance().set(&symbol_short!("APY"), &new_apy_bps);
        env.events().publish((symbol_short!("apy"),), (new_apy_bps,));
    }

    /// Get stake record.
    pub fn get_stake(env: Env, stake_id: u64) -> Option<StakeRecord> {
        env.storage().persistent().get(&Self::stake_key(&env, stake_id))
    }

    /// Get pending rewards for a stake.
    pub fn get_pending_rewards(env: Env, stake_id: u64) -> i128 {
        Self::calculate_rewards(&env, stake_id)
    }

    // -- Internal helpers -----------------------------------------------------

    fn stake_key(env: &Env, id: u64) -> soroban_sdk::Val {
        (symbol_short!("STAKE"), id).into_val(env)
    }
}

// -- Tests --------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{token, Address, Env};

    const YEAR: u64 = 31_536_000;
    const TWELVE_MONTHS: u32 = 12;

    fn setup() -> (Env, Address, Address, Address, StakingRewardsClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StakingRewards);
        let client = StakingRewardsClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let xlm = env.register_stellar_asset_contract(admin.clone());

        token::StellarAssetClient::new(&env, &xlm).mint(&sponsor, &1_000_000);
        token::StellarAssetClient::new(&env, &xlm).mint(&admin, &1_000_000);

        client.initialize(&admin, &xlm, &500); // 5% APY

        (env, admin, sponsor, xlm, client)
    }

    fn balance(env: &Env, token: &Address, addr: &Address) -> i128 {
        token::Client::new(env, token).balance(addr)
    }

    #[test]
    fn test_initialize_sets_admin_token_and_apy() {
        let (_env, _admin, sponsor, xlm, client) = setup();
        let id = client.stake(&sponsor, &1_000, &TWELVE_MONTHS);
        let rec = client.get_stake(&id).unwrap();
        assert_eq!(rec.amount, 1_000);
        assert_eq!(rec.apy_bps, 500);
        assert_eq!(rec.status, StakeStatus::Active);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_rejected() {
        let (_env, admin, _sponsor, xlm, client) = setup();
        client.initialize(&admin, &xlm, &500);
    }

    #[test]
    fn test_stake_locks_funds() {
        let (env, _admin, sponsor, xlm, client) = setup();
        let before = balance(&env, &xlm, &sponsor);
        let id = client.stake(&sponsor, &10_000, &TWELVE_MONTHS);
        let after = balance(&env, &xlm, &sponsor);
        assert_eq!(before - after, 10_000);

        let rec = client.get_stake(&id).unwrap();
        assert_eq!(rec.amount, 10_000);
        assert_eq!(rec.status, StakeStatus::Active);
        assert!(rec.lock_end > rec.lock_start);
    }

    #[test]
    #[should_panic(expected = "minimum lock is 12 months")]
    fn test_stake_rejects_short_lock() {
        let (_env, _admin, sponsor, _xlm, client) = setup();
        client.stake(&sponsor, &1_000, &6);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_stake_rejects_zero_amount() {
        let (_env, _admin, sponsor, _xlm, client) = setup();
        client.stake(&sponsor, &0, &TWELVE_MONTHS);
    }

    #[test]
    fn test_claim_after_lock_returns_principal_plus_rewards() {
        let (env, admin, sponsor, xlm, client) = setup();
        client.fund_rewards(&admin, &100_000);

        let id = client.stake(&sponsor, &10_000, &TWELVE_MONTHS);
        let sponsor_before = balance(&env, &xlm, &sponsor);

        env.ledger().with_mut(|l| l.timestamp += YEAR + 1);

        let total = client.claim(&sponsor, &id);
        let sponsor_after = balance(&env, &xlm, &sponsor);

        assert!(total >= 10_000);
        assert_eq!(sponsor_after - sponsor_before, total);

        let rec = client.get_stake(&id).unwrap();
        assert_eq!(rec.status, StakeStatus::Claimed);
    }

    #[test]
    #[should_panic(expected = "lock period not expired")]
    fn test_claim_before_lock_expiry_rejected() {
        let (env, admin, sponsor, _xlm, client) = setup();
        client.fund_rewards(&admin, &100_000);
        let id = client.stake(&sponsor, &10_000, &TWELVE_MONTHS);
        env.ledger().with_mut(|l| l.timestamp += YEAR / 2);
        client.claim(&sponsor, &id);
    }

    #[test]
    fn test_unstake_early_returns_principal_only() {
        let (env, _admin, sponsor, xlm, client) = setup();
        let id = client.stake(&sponsor, &10_000, &TWELVE_MONTHS);
        let before = balance(&env, &xlm, &sponsor);

        let returned = client.unstake(&sponsor, &id);
        let after = balance(&env, &xlm, &sponsor);

        assert_eq!(returned, 10_000);
        assert_eq!(after - before, 10_000);

        let rec = client.get_stake(&id).unwrap();
        assert_eq!(rec.status, StakeStatus::UnstakedEarly);
    }

    #[test]
    #[should_panic(expected = "not the sponsor")]
    fn test_unstake_rejects_wrong_sponsor() {
        let (env, _admin, sponsor, _xlm, client) = setup();
        let id = client.stake(&sponsor, &10_000, &TWELVE_MONTHS);
        let impostor = Address::generate(&env);
        client.unstake(&impostor, &id);
    }

    #[test]
    fn test_calculate_rewards_scales_with_apy() {
        let (env, admin, sponsor, _xlm, client) = setup();
        client.fund_rewards(&admin, &100_000);

        let id = client.stake(&sponsor, &10_000, &TWELVE_MONTHS);
        env.ledger().with_mut(|l| l.timestamp += YEAR);

        let rewards = client.get_pending_rewards(&id);
        assert_eq!(rewards, 500); // 5% of 10_000 = 500
    }

    #[test]
    #[should_panic(expected = "not admin")]
    fn test_update_apy_rejects_non_admin() {
        let (_env, _admin, sponsor, _xlm, client) = setup();
        client.update_apy(&sponsor, &1000);
    }

    #[test]
    fn test_update_apy_succeeds_for_admin() {
        let (_env, admin, sponsor, _xlm, client) = setup();
        client.update_apy(&admin, &1000);
        let id = client.stake(&sponsor, &1_000, &TWELVE_MONTHS);
        let rec = client.get_stake(&id).unwrap();
        assert_eq!(rec.apy_bps, 1000);
    }

    #[test]
    fn test_auto_increment_stake_ids() {
        let (_env, _admin, sponsor, _xlm, client) = setup();
        let id1 = client.stake(&sponsor, &1_000, &TWELVE_MONTHS);
        let id2 = client.stake(&sponsor, &2_000, &TWELVE_MONTHS);
        assert_eq!(id2, id1 + 1);
    }
}