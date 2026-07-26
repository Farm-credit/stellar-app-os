//! Constant-product automated market maker (AMM) liquidity pool contract.
//! This contract facilitates swaps between two tokens (e.g., USDC and a carbon credit token).
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, IntoVal,
};

/// The fee taken from each swap, in basis points. 30 bps = 0.3%.
const SWAP_FEE_BPS: u32 = 30;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,
    /// One or both of the tokens are the same.
    IdenticalTokens = 2,
    /// The amount to swap is zero.
    ZeroSwapAmount = 3,
    /// The amount to swap would result in an output of zero.
    ZeroOutputAmount = 4,
    /// The swap would leave the pool with insufficient reserves.
    InsufficientReserves = 5,
    /// The specified token to swap is not one of the two in this pool.
    InvalidToken = 6,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Stores the two token addresses in this pool.
    Tokens,
}

#[contract]
pub struct LiquidityPoolContract;

#[contractimpl]
impl LiquidityPoolContract {
    /// Initializes the contract with the two tokens that form the liquidity pool.
    ///
    /// # Arguments
    ///
    /// * `admin` - The address of the admin account.
    /// * `token_a` - The address of the first token.
    /// * `token_b` - The address of the second token.
    ///
    /// # Panics
    ///
    /// * If the contract has already been initialized.
    /// * If `token_a` and `token_b` are the same.
    pub fn initialize(
        env: Env,
        admin: Address,
        token_a: Address,
        token_b: Address,
    ) -> Result<(), Error> {
        admin.require_auth();

        if env.storage().instance().has(&DataKey::Tokens) {
            return Err(Error::AlreadyInitialized);
        }

        if token_a == token_b {
            return Err(Error::IdenticalTokens);
        }

        // Store tokens, ensuring a consistent order to simplify logic.
        if token_a < token_b {
            env.storage()
                .instance()
                .set(&DataKey::Tokens, &(token_a, token_b));
        } else {
            env.storage()
                .instance()
                .set(&DataKey::Tokens, &(token_b, token_a));
        }

        Ok(())
    }

    /// Swaps a specific amount of one token for another.
    ///
    /// The user must authorize this contract to take `amount_in` of `token_in` from their account.
    /// The calculated `amount_out` of `token_out` will be sent to the `recipient`.
    ///
    /// # Arguments
    ///
    /// * `swapper` - The address of the user performing the swap.
    /// * `token_in` - The address of the token being sent to the pool.
    /// * `amount_in` - The amount of `token_in` to swap.
    /// * `recipient` - The address to receive the swapped tokens.
    ///
    /// # Returns
    ///
    /// The amount of the output token sent to the recipient.
    pub fn swap(
        env: Env,
        swapper: Address,
        token_in: Address,
        amount_in: i128,
        recipient: Address,
    ) -> Result<i128, Error> {
        swapper.require_auth();

        if amount_in <= 0 {
            return Err(Error::ZeroSwapAmount);
        }

        let (token_a, token_b): (Address, Address) =
            env.storage().instance().get(&DataKey::Tokens).unwrap();

        let (reserve_in, reserve_out, token_out) = if token_in == token_a {
            (
                token::Client::new(&env, &token_a).balance(&env.current_contract_address()),
                token::Client::new(&env, &token_b).balance(&env.current_contract_address()),
                token_b,
            )
        } else if token_in == token_b {
            (
                token::Client::new(&env, &token_b).balance(&env.current_contract_address()),
                token::Client::new(&env, &token_a).balance(&env.current_contract_address()),
                token_a,
            )
        } else {
            return Err(Error::InvalidToken);
        };

        // Calculate amount out using the constant-product formula with fees.
        // amount_out = (reserve_out * amount_in_with_fee) / (reserve_in_after_swap)
        // where amount_in_with_fee = amount_in * (10000 - fee_bps)
        // and reserve_in_after_swap = reserve_in * 10000 + amount_in_with_fee
        let amount_in_with_fee = amount_in * (10000 - SWAP_FEE_BPS);
        let numerator = reserve_out * amount_in_with_fee;
        let denominator = reserve_in * 10000 + amount_in_with_fee;

        if denominator == 0 {
            // Should be unreachable if reserves are non-zero, but good practice.
            return Err(Error::InsufficientReserves);
        }

        let amount_out = numerator / denominator;

        if amount_out == 0 {
            return Err(Error::ZeroOutputAmount);
        }

        if reserve_out < amount_out {
            return Err(Error::InsufficientReserves);
        }

        // Perform the token transfers
        let token_in_client = token::Client::new(&env, &token_in);
        let token_out_client = token::Client::new(&env, &token_out);

        // Transfer input tokens from the swapper to this contract
        token_in_client.transfer(&swapper, &env.current_contract_address(), &amount_in);

        // Transfer output tokens from this contract to the recipient
        token_out_client.transfer(&env.current_contract_address(), &recipient, &amount_out);

        // Publish a swap event
        env.events().publish(
            (Symbol::new(&env, "swap"), swapper),
            (token_in, token_out, amount_in, amount_out).into_val(&env),
        );

        Ok(amount_out)
    }

    /// Returns the two token addresses in the pool.
    pub fn get_tokens(env: Env) -> (Address, Address) {
        env.storage().instance().get(&DataKey::Tokens).unwrap()
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn create_token_contract<'a>(env: &Env, admin: &Address) -> (Address, token::Client<'a>) {
        let contract_address = env.register_stellar_asset_contract(admin.clone());
        let client = token::Client::new(env, &contract_address);
        (contract_address, client)
    }

    struct LiquidityPoolTest<'a> {
        env: Env,
        admin: Address,
        swapper: Address,
        recipient: Address,
        token_a_addr: Address,
        token_a_client: token::Client<'a>,
        token_b_addr: Address,
        token_b_client: token::Client<'a>,
        contract_addr: Address,
        contract_client: LiquidityPoolContractClient<'a>,
    }

    impl<'a> LiquidityPoolTest<'a> {
        fn setup() -> Self {
            let env = Env::default();
            env.mock_all_auths();

            let admin = Address::random(&env);
            let swapper = Address::random(&env);
            let recipient = Address::random(&env);

            let (token_a_addr, token_a_client) = create_token_contract(&env, &admin);
            let (token_b_addr, token_b_client) = create_token_contract(&env, &admin);

            let contract_addr = env.register_contract(None, LiquidityPoolContract);
            let contract_client = LiquidityPoolContractClient::new(&env, &contract_addr);

            // Initialize contract
            contract_client.initialize(&admin, &token_a_addr, &token_b_addr);

            // Mint initial balances for the pool and swapper
            token_a_client.mint(&contract_addr, &1_000_000_000); // 100 A
            token_b_client.mint(&contract_addr, &2_000_000_000); // 200 B
            token_a_client.mint(&swapper, &500_000_000); // 50 A

            LiquidityPoolTest {
                env,
                admin,
                swapper,
                recipient,
                token_a_addr,
                token_a_client,
                token_b_addr,
                token_b_client,
                contract_addr,
                contract_client,
            }
        }
    }

    #[test]
    fn test_swap_success() {
        let test = LiquidityPoolTest::setup();

        let amount_in = 10_000_000; // 1 A
        let expected_amount_out = 19_742_574; // Calculated based on xy=k with 0.3% fee

        let amount_out = test.contract_client.swap(
            &test.swapper,
            &test.token_a_addr,
            &amount_in,
            &test.recipient,
        );

        assert_eq!(amount_out, expected_amount_out);

        // Check final balances
        assert_eq!(test.token_a_client.balance(&test.swapper), 490_000_000);
        assert_eq!(test.token_b_client.balance(&test.recipient), expected_amount_out);
        assert_eq!(test.token_a_client.balance(&test.contract_addr), 1_010_000_000);
        assert_eq!(test.token_b_client.balance(&test.contract_addr), 2_000_000_000 - expected_amount_out);
    }

    #[test]
    fn test_swap_insufficient_reserves() {
        let test = LiquidityPoolTest::setup();
        let amount_in = 200_000_000_000; // A huge amount
        let result = test.contract_client.try_swap(
            &test.swapper,
            &test.token_a_addr,
            &amount_in,
            &test.recipient,
        );
        assert_eq!(result, Err(Ok(Error::InsufficientReserves)));
    }

    #[test]
    fn test_swap_zero_amount() {
        let test = LiquidityPoolTest::setup();
        let result = test.contract_client.try_swap(
            &test.swapper,
            &test.token_a_addr,
            &0,
            &test.recipient,
        );
        assert_eq!(result, Err(Ok(Error::ZeroSwapAmount)));
    }

    #[test]
    fn test_swap_invalid_token() {
        let test = LiquidityPoolTest::setup();
        let invalid_token = Address::random(&test.env);
        let result = test.contract_client.try_swap(
            &test.swapper,
            &invalid_token,
            &100,
            &test.recipient,
        );
        assert_eq!(result, Err(Ok(Error::InvalidToken)));
    }
}