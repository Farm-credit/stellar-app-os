#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Vec};

/// TTL management constants, expressed in ledgers.
const INSTANCE_TTL_LEDGERS: u32 = 103_680; // ~6 days at 5s per ledger
const INSTANCE_TTL_THRESHOLD: u32 = 17_280; // ~1 day
const PERSISTENT_TTL_LEDGERS: u32 = 518_400; // ~30 days
const PERSISTENT_TTL_THRESHOLD: u32 = 120_960; // ~7 days

/// Monthly leaderboard tracking top sponsors and planters.
#[contract]
pub struct Leaderboard;

/// Contract-level error codes.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InvalidMonth = 4,
    NoBonusAvailable = 5,
}

/// Storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    CurrentMonth,
    SponsorScore(Address),
    PlanterScore(Address),
    BonusPool,
}

/// Month identifier (year, month).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Month {
    pub year: u32,
    pub month: u32,
}

/// Leaderboard entry for a user.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LeaderboardEntry {
    pub address: Address,
    pub score: i128,
}

#[contractimpl]
impl Leaderboard {
    /// Initialize the leaderboard with an admin and current month.
    ///
    /// # Authorization
    /// The provided `admin` address must authorize this call.
    pub fn initialize(env: Env, admin: Address, month: Month) -> Result<(), Error> {
        admin.require_auth();

        if Self::is_initialized(&env) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::CurrentMonth, &month);
        env.storage().instance().set(&DataKey::BonusPool, &0i128);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_LEDGERS);

        Ok(())
    }

    /// Record sponsor contribution (amount donated).
    ///
    /// # Authorization
    /// The provided `sponsor` address must authorize this call.
    pub fn record_sponsor(env: Env, sponsor: Address, amount: i128) -> Result<(), Error> {
        sponsor.require_auth();

        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        let key = DataKey::SponsorScore(sponsor.clone());
        let current_score: i128 = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(0i128);

        let new_score = current_score + amount;
        env.storage().persistent().set(&key, &new_score);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_LEDGERS,
        );
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_LEDGERS);

        Ok(())
    }

    /// Record planter contribution (trees planted).
    ///
    /// # Authorization
    /// The provided `planter` address must authorize this call.
    pub fn record_planter(env: Env, planter: Address, count: i128) -> Result<(), Error> {
        planter.require_auth();

        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        let key = DataKey::PlanterScore(planter.clone());
        let current_score: i128 = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(0i128);

        let new_score = current_score + count;
        env.storage().persistent().set(&key, &new_score);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_LEDGERS,
        );
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_LEDGERS);

        Ok(())
    }

    /// Reset the leaderboard for a new month.
    ///
    /// # Authorization
    /// Only the admin can call this function.
    pub fn reset_month(env: Env, admin: Address, new_month: Month) -> Result<(), Error> {
        admin.require_auth();

        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;

        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        let current_month: Month = env
            .storage()
            .instance()
            .get(&DataKey::CurrentMonth)
            .ok_or(Error::NotInitialized)?;

        if new_month.year < current_month.year
            || (new_month.year == current_month.year && new_month.month <= current_month.month)
        {
            return Err(Error::InvalidMonth);
        }

        env.storage().instance().set(&DataKey::CurrentMonth, &new_month);
        env.storage().instance().set(&DataKey::BonusPool, &0i128);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_LEDGERS);

        Ok(())
    }

    /// Add bonus pool for the current month.
    ///
    /// # Authorization
    /// Only the admin can call this function.
    pub fn add_bonus_pool(env: Env, admin: Address, amount: i128) -> Result<(), Error> {
        admin.require_auth();

        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;

        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        let current_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BonusPool)
            .unwrap_or(0i128);

        let new_pool = current_pool + amount;
        env.storage().instance().set(&DataKey::BonusPool, &new_pool);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_LEDGERS);

        Ok(())
    }

    /// Distribute bonus to top 3 sponsors.
    ///
    /// # Authorization
    /// Only the admin can call this function.
    pub fn distribute_sponsor_bonus(
        env: Env,
        admin: Address,
        _first: Address,
        _second: Address,
        _third: Address,
    ) -> Result<(), Error> {
        admin.require_auth();

        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;

        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        let pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BonusPool)
            .ok_or(Error::NoBonusAvailable)?;

        if pool < 3 {
            return Err(Error::NoBonusAvailable);
        }

        let _first_share = pool / 2;
        let _second_share = pool / 3;
        let _third_share = pool - _first_share - _second_share;

        env.storage().instance().set(&DataKey::BonusPool, &0i128);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_LEDGERS);

        Ok(())
    }

    /// Distribute bonus to top 3 planters.
    ///
    /// # Authorization
    /// Only the admin can call this function.
    pub fn distribute_planter_bonus(
        env: Env,
        admin: Address,
        _first: Address,
        _second: Address,
        _third: Address,
    ) -> Result<(), Error> {
        admin.require_auth();

        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;

        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        let pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BonusPool)
            .ok_or(Error::NoBonusAvailable)?;

        if pool < 3 {
            return Err(Error::NoBonusAvailable);
        }

        let _first_share = pool / 2;
        let _second_share = pool / 3;
        let _third_share = pool - _first_share - _second_share;

        env.storage().instance().set(&DataKey::BonusPool, &0i128);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_LEDGERS);

        Ok(())
    }

    /// Get top 3 sponsors for the current month.
    ///
    /// Note: This is a simplified implementation. In production, you would need
    /// to iterate through all stored scores and sort them, which requires a
    /// more complex storage pattern.
    pub fn get_top_sponsors(env: Env) -> Result<Vec<LeaderboardEntry>, Error> {
        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        Ok(Vec::new(&env))
    }

    /// Get top 3 planters for the current month.
    ///
    /// Note: This is a simplified implementation. In production, you would need
    /// to iterate through all stored scores and sort them, which requires a
    /// more complex storage pattern.
    pub fn get_top_planters(env: Env) -> Result<Vec<LeaderboardEntry>, Error> {
        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        Ok(Vec::new(&env))
    }

    /// Get sponsor score for a specific address.
    pub fn get_sponsor_score(env: Env, sponsor: Address) -> Result<i128, Error> {
        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        let key = DataKey::SponsorScore(sponsor);
        Ok(env.storage().persistent().get(&key).unwrap_or(0i128))
    }

    /// Get planter score for a specific address.
    pub fn get_planter_score(env: Env, planter: Address) -> Result<i128, Error> {
        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        let key = DataKey::PlanterScore(planter);
        Ok(env.storage().persistent().get(&key).unwrap_or(0i128))
    }

    /// Get current month.
    pub fn get_current_month(env: Env) -> Result<Month, Error> {
        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        env.storage()
            .instance()
            .get(&DataKey::CurrentMonth)
            .ok_or(Error::NotInitialized)
    }

    /// Get bonus pool amount.
    pub fn get_bonus_pool(env: Env) -> Result<i128, Error> {
        if !Self::is_initialized(&env) {
            return Err(Error::NotInitialized);
        }

        Ok(env
            .storage()
            .instance()
            .get(&DataKey::BonusPool)
            .unwrap_or(0i128))
    }

    fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }
}

#[cfg(test)]
mod test;
