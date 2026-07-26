#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, IntoVal, Symbol, Val, Vec,
};

#[derive(Clone, Copy)]
#[contracttype]
enum DataKey {
    TokenA,
    TokenB,
    ReserveA,
    ReserveB,
    FeeBps, // Fee in basis points
}

#[contract]
pub struct CarbonDEX;

#[contractimpl]
impl CarbonDEX {
    /// Initializes the contract with the two tokens to be traded, and the fee.
    pub fn initialize(env: Env, token_a: Address, token_b: Address, fee_bps: u32) {
        if fee_bps >= 10000 {
            panic!("Fee must be less than 100%");
        }

        env.storage().instance().set(&DataKey::TokenA, &token_a);
        env.storage().instance().set(&DataKey::TokenB, &token_b);
        env.storage().instance().set(&DataKey::ReserveA, &0_i128);
        env.storage().instance().set(&DataKey::ReserveB, &0_i128);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
    }

    /// Deposits liquidity into the pool.
    pub fn deposit(env: Env, from: Address, amount_a: i128, amount_b: i128) {
        from.require_auth();

        let token_a_addr = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b_addr = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let mut reserve_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap();
        let mut reserve_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap();

        let token_a = token::Client::new(&env, &token_a_addr);
        let token_b = token::Client::new(&env, &token_b_addr);

        token_a.transfer_from(&from, &env.current_contract_address(), &amount_a);
        token_b.transfer_from(&from, &env.current_contract_address(), &amount_b);

        reserve_a += amount_a;
        reserve_b += amount_b;

        env.storage().instance().set(&DataKey::ReserveA, &reserve_a);
        env.storage().instance().set(&DataKey::ReserveB, &reserve_b);
    }

    /// Swaps one token for another.
    pub fn swap(env: Env, to: Address, in_token: Address, in_amount: i128) -> i128 {
        to.require_auth();

        let token_a_addr: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b_addr: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let mut reserve_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap();
        let mut reserve_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap();
        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap();

        let (in_token_addr, out_token_addr, in_reserve, out_reserve) =
            if in_token == token_a_addr {
                (token_a_addr.clone(), token_b_addr.clone(), reserve_a, reserve_b)
            } else if in_token == token_b_addr {
                (token_b_addr.clone(), token_a_addr.clone(), reserve_b, reserve_a)
            } else {
                panic!("Invalid input token");
            };

        let in_token_client = token::Client::new(&env, &in_token_addr);
        let out_token_client = token::Client::new(&env, &out_token_addr);

        in_token_client.transfer_from(&to, &env.current_contract_address(), &in_amount);

        // xy=k logic with fee
        let in_amount_minus_fee = in_amount - (in_amount * fee_bps as i128 / 10000);
        let out_amount = (in_amount_minus_fee * out_reserve) / (in_reserve + in_amount_minus_fee);

        if out_amount <= 0 {
            panic!("Swap would result in zero or negative output");
        }

        out_token_client.transfer(&to, &out_amount);

        // Update reserves
        if in_token == token_a_addr {
            reserve_a += in_amount;
            reserve_b -= out_amount;
        } else {
            reserve_b += in_amount;
            reserve_a -= out_amount;
        }

        env.storage().instance().set(&DataKey::ReserveA, &reserve_a);
        env.storage().instance().set(&DataKey::ReserveB, &reserve_b);

        out_amount
    }

    /// Withdraws liquidity from the pool.
    pub fn withdraw(env: Env, to: Address, amount_a: i128, amount_b: i128) {
        to.require_auth();

        let token_a_addr = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b_addr = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let mut reserve_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap();
        let mut reserve_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap();

        if amount_a > reserve_a || amount_b > reserve_b {
            panic!("Withdrawal amount exceeds reserves");
        }

        let token_a = token::Client::new(&env, &token_a_addr);
        let token_b = token::Client::new(&env, &token_b_addr);

        token_a.transfer(&to, &amount_a);
        token_b.transfer(&to, &amount_b);

        reserve_a -= amount_a;
        reserve_b -= amount_b;

        env.storage().instance().set(&DataKey::ReserveA, &reserve_a);
        env.storage().instance().set(&DataKey::ReserveB, &reserve_b);
    }
}

#[cfg(test)]
mod test;
