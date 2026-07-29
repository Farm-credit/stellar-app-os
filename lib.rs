#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, Map,
};

/// The lockup period for unbonding tokens, set to 14 days in seconds.
const LOCKUP_PERIOD: u64 = 14 * 24 * 60 * 60; // 1,209,600 seconds

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,
    /// The contract has not been initialized.
    NotInitialized = 2,
    /// The amount to stake or unbond must be positive.
    AmountMustBePositive = 3,
    /// The user has insufficient staked balance to unbond the requested amount.
    InsufficientStakedBalance = 4,
    /// An unbonding request is already in progress for the user.
    /// The user must withdraw the previous unbonding before starting a new one.
    UnbondingInProgress = 5,
    /// The user has no pending unbonding to withdraw.
    NothingToWithdraw = 6,
    /// The 14-day unbonding period has not yet completed.
    UnbondingPeriodNotOver = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Unbonding {
    /// The amount of tokens being unbonded.
    pub amount: i128,
    /// The Unix timestamp when the unbonding lockup period completes.
    pub completion_time: u64,
}

#[contracttype]
enum DataKey {
    /// Stores the address of the token being staked.
    Token,
    /// Stores the total amount of tokens staked in the contract.
    TotalStaked,
    /// A map from a user's address to their staked balance.
    Staked(Address),
    /// A map from a user's address to their pending unbonding.
    Unbonding(Address),
}

#[contract]
pub struct VerifierStakingContract;

#[contractimpl]
impl VerifierStakingContract {
    /// Initializes the staking contract.
    ///
    /// # Arguments
    /// * `env` - The Soroban environment.
    /// * `token` - The address of the token to be used for staking.
    ///
    /// # Panics
    /// If the contract has already been initialized.
    pub fn initialize(env: Env, token: Address) {
        if env.storage().instance().has(&DataKey::Token) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::TotalStaked, &0i128);
    }

    /// Stakes a specified amount of tokens for a user.
    ///
    /// # Arguments
    /// * `env` - The Soroban environment.
    /// * `from` - The address of the user staking tokens.
    /// * `amount` - The amount of tokens to stake.
    ///
    /// # Panics
    /// * If the contract is not initialized.
    /// * If the amount is not positive.
    /// * If authorization is missing from `from`.
    pub fn stake(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::AmountMustBePositive);
        }

        let token_id = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::Token)
            .expect("not initialized");

        let staked_key = DataKey::Staked(from.clone());
        let current_staked = env.storage().persistent().get(&staked_key).unwrap_or(0i128);

        env.storage()
            .persistent()
            .set(&staked_key, &(current_staked + amount));

        let total_staked_key = DataKey::TotalStaked;
        let current_total_staked: i128 =
            env.storage().instance().get(&total_staked_key).unwrap();
        env.storage()
            .instance()
            .set(&total_staked_key, &(current_total_staked + amount));

        let token_client = token::Client::new(&env, &token_id);
        token_client.transfer(&from, &env.current_contract_address(), &amount);
    }

    /// Initiates the unbonding process for a user's staked tokens.
    /// The tokens will be locked for a 14-day period before they can be withdrawn.
    ///
    /// # Arguments
    /// * `env` - The Soroban environment.
    /// * `from` - The address of the user unbonding tokens.
    /// * `amount` - The amount of tokens to unbond.
    ///
    /// # Panics
    /// * If authorization is missing from `from`.
    /// * If the amount is not positive.
    /// * If the user has an existing unbonding in progress.
    /// * If the requested amount exceeds the user's staked balance.
    pub fn unbond(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::AmountMustBePositive);
        }

        let unbonding_key = DataKey::Unbonding(from.clone());
        if env.storage().persistent().has(&unbonding_key) {
            panic_with_error!(&env, Error::UnbondingInProgress);
        }

        let staked_key = DataKey::Staked(from.clone());
        let current_staked: i128 = env.storage().persistent().get(&staked_key).unwrap_or(0);
        if amount > current_staked {
            panic_with_error!(&env, Error::InsufficientStakedBalance);
        }

        env.storage()
            .persistent()
            .set(&staked_key, &(current_staked - amount));

        let total_staked_key = DataKey::TotalStaked;
        let current_total_staked: i128 =
            env.storage().instance().get(&total_staked_key).unwrap();
        env.storage()
            .instance()
            .set(&total_staked_key, &(current_total_staked - amount));

        let unbonding_entry = Unbonding {
            amount,
            completion_time: env.ledger().timestamp() + LOCKUP_PERIOD,
        };

        env.storage().persistent().set(&unbonding_key, &unbonding_entry);
        // Set TTL for the unbonding entry to be slightly longer than the lockup period
        env.storage()
            .persistent()
            .extend_ttl(&unbonding_key, LOCKUP_PERIOD as u32 + 7200, LOCKUP_PERIOD as u32 + 7200);
    }

    /// Withdraws tokens that have completed the 14-day unbonding period.
    ///
    /// # Arguments
    /// * `env` - The Soroban environment.
    /// * `to` - The address to receive the withdrawn tokens.
    ///
    /// # Panics
    /// * If authorization is missing from `to`.
    /// * If there is no unbonding request for the user.
    /// * If the unbonding period has not yet passed.
    pub fn withdraw(env: Env, to: Address) {
        to.require_auth();

        let unbonding_key = DataKey::Unbonding(to.clone());
        let unbonding_entry = env
            .storage()
            .persistent()
            .get::<_, Unbonding>(&unbonding_key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NothingToWithdraw));

        if env.ledger().timestamp() < unbonding_entry.completion_time {
            panic_with_error!(&env, Error::UnbondingPeriodNotOver);
        }

        let token_id = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::Token)
            .expect("not initialized");

        env.storage().persistent().remove(&unbonding_key);

        let token_client = token::Client::new(&env, &token_id);
        token_client.transfer(&env.current_contract_address(), &to, &unbonding_entry.amount);
    }

    // --- View Functions ---

    /// Returns the total amount of tokens staked in the contract.
    pub fn total_staked(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalStaked)
            .unwrap_or(0)
    }

    /// Returns the staked balance for a given user.
    pub fn staked_balance(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Staked(user))
            .unwrap_or(0)
    }

    /// Returns the pending unbonding details for a given user, if any.
    pub fn unbonding_details(env: Env, user: Address) -> Option<Unbonding> {
        env.storage().persistent().get(&DataKey::Unbonding(user))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger, LedgerInfo}, BytesN, IntoVal};

    fn create_token_contract<'a>(env: &Env, admin: &Address) -> (Address, token::Client<'a>) {
        let contract_address = env.register_stellar_asset_contract(admin.clone());
        (
            contract_address.clone(),
            token::Client::new(env, &contract_address),
        )
    }

    #[test]
    fn test_stake_and_unbond_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, VerifierStakingContract);
        let client = VerifierStakingContractClient::new(&env, &contract_id);

        let admin = Address::random(&env);
        let user = Address::random(&env);
        let (token_id, token_client) = create_token_contract(&env, &admin);

        token_client.mint(&user, &1000);

        client.initialize(&token_id);

        // Stake
        client.stake(&user, &500);
        assert_eq!(client.staked_balance(&user), 500);
        assert_eq!(client.total_staked(), 500);
        assert_eq!(token_client.balance(&user), 500);
        assert_eq!(token_client.balance(&contract_id), 500);

        // Unbond
        client.unbond(&user, &200);
        assert_eq!(client.staked_balance(&user), 300);
        assert_eq!(client.total_staked(), 300);

        let unbonding = client.unbonding_details(&user).unwrap();
        assert_eq!(unbonding.amount, 200);
        assert_eq!(unbonding.completion_time, env.ledger().timestamp() + LOCKUP_PERIOD);
    }

    #[test]
    fn test_withdraw_after_lockup() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, VerifierStakingContract);
        let client = VerifierStakingContractClient::new(&env, &contract_id);

        let admin = Address::random(&env);
        let user = Address::random(&env);
        let (token_id, token_client) = create_token_contract(&env, &admin);
        token_client.mint(&user, &1000);

        client.initialize(&token_id);
        client.stake(&user, &500);
        client.unbond(&user, &200);

        // Advance ledger time past the lockup period
        env.ledger().with_mut(|li| {
            li.timestamp += LOCKUP_PERIOD + 1;
        });

        client.withdraw(&user);

        assert_eq!(token_client.balance(&user), 700); // 500 (initial) + 200 (withdrawn)
        assert_eq!(token_client.balance(&contract_id), 300); // 500 (staked) - 200 (withdrawn)
        assert_eq!(client.unbonding_details(&user), None);
    }

    #[test]
    #[should_panic(expected = "Error(7)")] // UnbondingPeriodNotOver
    fn test_withdraw_before_lockup_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, VerifierStakingContract);
        let client = VerifierStakingContractClient::new(&env, &contract_id);

        let admin = Address::random(&env);
        let user = Address::random(&env);
        let (token_id, token_client) = create_token_contract(&env, &admin);
        token_client.mint(&user, &1000);

        client.initialize(&token_id);
        client.stake(&user, &500);
        client.unbond(&user, &200);

        // Advance time, but not enough
        env.ledger().with_mut(|li| {
            li.timestamp += LOCKUP_PERIOD - 1;
        });

        client.withdraw(&user);
    }

    #[test]
    #[should_panic(expected = "Error(5)")] // UnbondingInProgress
    fn test_unbond_while_unbonding_in_progress_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, VerifierStakingContract);
        let client = VerifierStakingContractClient::new(&env, &contract_id);

        let admin = Address::random(&env);
        let user = Address::random(&env);
        let (token_id, token_client) = create_token_contract(&env, &admin);
        token_client.mint(&user, &1000);

        client.initialize(&token_id);
        client.stake(&user, &500);
        client.unbond(&user, &100);

        // Try to unbond again
        client.unbond(&user, &100);
    }
}