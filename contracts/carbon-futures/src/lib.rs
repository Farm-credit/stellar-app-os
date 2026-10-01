#![no_std]
// Soroban contract entrypoints take `Env` by value and clients return owned values;
// allow these lint exceptions to satisfy the workspace's pedantic clippy config.
#![allow(clippy::needless_pass_by_value, clippy::must_use_candidate)]

//! Carbon credit derivatives — futures trading (v1)
//!
//! Farmers can lock in a forward price for next season's verified credits, while
//! buyers can hedge against future price volatility. The contract stores signed
//! forward contracts and exposes a transparent price quote derived from the spot
//! price plus an annual carry rate.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, Symbol, Vec,
};

const DEFAULT_ANNUAL_CARRY_BPS: u32 = 500; // 5.00%
const MAX_QUANTITY_TONNES: i128 = 1_000_000;
const BPS_DENOMINATOR: i128 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum FuturesError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ProjectRequired = 4,
    QuantityMustBePositive = 5,
    QuantityTooLarge = 6,
    PriceMustBePositive = 7,
    DeliveryMustBeFuture = 8,
    ContractNotFound = 9,
    ContractNotOpen = 10,
    InvalidSettlement = 11,
    InvalidCarryRate = 12,
    SellerCannotMatchOwnContract = 13,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContractStatus {
    Open,
    Matched,
    Settled,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FuturesQuote {
    pub project_id: Symbol,
    pub quantity_tonnes: i128,
    pub delivery_year: u32,
    pub years_to_delivery: u32,
    pub locked_price_per_ton: i128,
    pub notional_value: i128,
    pub annual_carry_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ForwardContract {
    pub id: u64,
    pub project_id: Symbol,
    pub seller: Address,
    pub buyer: Option<Address>,
    pub quantity_tonnes: i128,
    pub strike_price_per_ton: i128,
    pub delivery_year: u32,
    pub current_year: u32,
    pub status: ContractStatus,
    pub created_at: u64,
}

#[contracttype]
enum DataKey {
    Config,
    NextContractId,
    Contract(u64),
    OpenContracts,
}

#[contract]
pub struct CarbonFutures;

#[contractimpl]
impl CarbonFutures {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, FuturesError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Config, &Config { admin });
    }

    /// Quotes a locked forward price and notional value for a delivery year.
    ///
    /// # Panics
    ///
    /// Panics with [`FuturesError::DeliveryMustBeFuture`],
    /// [`FuturesError::InvalidCarryRate`] or [`FuturesError::QuantityTooLarge`]
    /// when validation or arithmetic fails.
    pub fn quote(
        env: Env,
        project_id: Symbol,
        quantity_tonnes: i128,
        spot_price_per_ton: i128,
        delivery_year: u32,
        current_year: u32,
        annual_carry_bps: Option<u32>,
    ) -> FuturesQuote {
        Self::validate_quote(
            &env,
            project_id.clone(),
            quantity_tonnes,
            spot_price_per_ton,
            delivery_year,
            current_year,
            annual_carry_bps,
        )
        .unwrap_or_else(|err| panic_with_error!(&env, err));

        let carry_bps = annual_carry_bps.unwrap_or(DEFAULT_ANNUAL_CARRY_BPS);
        let years_to_delivery = delivery_year
            .checked_sub(current_year)
            .expect("delivery_year must be >= current_year");

        let multiplier = BPS_DENOMINATOR + (i128::from(carry_bps) * i128::from(years_to_delivery));
        let locked_price = spot_price_per_ton
            .checked_mul(multiplier)
            .and_then(|value| value.checked_div(BPS_DENOMINATOR))
            .unwrap_or_else(|| panic_with_error!(&env, FuturesError::InvalidCarryRate));

        let notional_value = locked_price
            .checked_mul(quantity_tonnes)
            .unwrap_or_else(|| panic_with_error!(&env, FuturesError::QuantityTooLarge));

        FuturesQuote {
            project_id,
            quantity_tonnes,
            delivery_year,
            years_to_delivery,
            locked_price_per_ton: locked_price,
            notional_value,
            annual_carry_bps: carry_bps,
        }
    }

    pub fn open_contract(
        env: Env,
        seller: Address,
        project_id: Symbol,
        quantity_tonnes: i128,
        spot_price_per_ton: i128,
        delivery_year: u32,
        current_year: u32,
    ) -> u64 {
        seller.require_auth();
        let quote = Self::quote(
            env.clone(),
            project_id,
            quantity_tonnes,
            spot_price_per_ton,
            delivery_year,
            current_year,
            None,
        );

        let next_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextContractId)
            .unwrap_or(0);
        let contract = ForwardContract {
            id: next_id,
            project_id: quote.project_id.clone(),
            seller: seller.clone(),
            buyer: None,
            quantity_tonnes: quote.quantity_tonnes,
            strike_price_per_ton: quote.locked_price_per_ton,
            delivery_year: quote.delivery_year,
            current_year,
            status: ContractStatus::Open,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Contract(next_id), &contract);
        env.storage()
            .instance()
            .set(&DataKey::NextContractId, &(next_id + 1));
        Self::add_open_contract_id(&env, next_id);

        env.events().publish(
            (symbol_short!("opened"),),
            (
                next_id,
                seller,
                quote.project_id.clone(),
                quote.quantity_tonnes,
                quote.locked_price_per_ton,
                quote.delivery_year,
            ),
        );

        next_id
    }

    pub fn match_contract(env: Env, buyer: Address, contract_id: u64) -> FuturesQuote {
        buyer.require_auth();
        let mut contract: ForwardContract = env
            .storage()
            .persistent()
            .get(&DataKey::Contract(contract_id))
            .unwrap_or_else(|| panic_with_error!(&env, FuturesError::ContractNotFound));

        if buyer == contract.seller {
            panic_with_error!(&env, FuturesError::SellerCannotMatchOwnContract);
        }
        if contract.status != ContractStatus::Open {
            panic_with_error!(&env, FuturesError::ContractNotOpen);
        }

        contract.buyer = Some(buyer.clone());
        contract.status = ContractStatus::Matched;
        env.storage()
            .persistent()
            .set(&DataKey::Contract(contract_id), &contract);
        Self::remove_open_contract_id(&env, contract_id);

        let years_to_delivery = contract.delivery_year.saturating_sub(contract.current_year);
        let notional_value = contract
            .strike_price_per_ton
            .checked_mul(contract.quantity_tonnes)
            .unwrap_or_else(|| panic_with_error!(&env, FuturesError::QuantityTooLarge));

        env.events().publish(
            (symbol_short!("matched"),),
            (
                contract_id,
                buyer,
                contract.quantity_tonnes,
                contract.strike_price_per_ton,
            ),
        );

        FuturesQuote {
            project_id: contract.project_id.clone(),
            quantity_tonnes: contract.quantity_tonnes,
            delivery_year: contract.delivery_year,
            years_to_delivery,
            locked_price_per_ton: contract.strike_price_per_ton,
            notional_value,
            annual_carry_bps: DEFAULT_ANNUAL_CARRY_BPS,
        }
    }

    pub fn settle_contract(env: Env, caller: Address, contract_id: u64) {
        caller.require_auth();
        let mut contract: ForwardContract = env
            .storage()
            .persistent()
            .get(&DataKey::Contract(contract_id))
            .unwrap_or_else(|| panic_with_error!(&env, FuturesError::ContractNotFound));

        let is_seller = caller == contract.seller;
        let is_buyer = contract.buyer == Some(caller.clone());
        if !is_seller && !is_buyer {
            panic_with_error!(&env, FuturesError::Unauthorized);
        }
        if contract.status == ContractStatus::Settled
            || contract.status == ContractStatus::Cancelled
        {
            panic_with_error!(&env, FuturesError::InvalidSettlement);
        }

        contract.status = ContractStatus::Settled;
        env.storage()
            .persistent()
            .set(&DataKey::Contract(contract_id), &contract);

        env.events()
            .publish((symbol_short!("settled"),), (contract_id, caller));
    }

    pub fn cancel_contract(env: Env, seller: Address, contract_id: u64) {
        seller.require_auth();
        let mut contract: ForwardContract = env
            .storage()
            .persistent()
            .get(&DataKey::Contract(contract_id))
            .unwrap_or_else(|| panic_with_error!(&env, FuturesError::ContractNotFound));

        if contract.seller != seller || contract.status != ContractStatus::Open {
            panic_with_error!(&env, FuturesError::Unauthorized);
        }

        contract.status = ContractStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Contract(contract_id), &contract);
        Self::remove_open_contract_id(&env, contract_id);

        env.events()
            .publish((symbol_short!("cancel"),), (contract_id, seller));
    }

    pub fn get_contract(env: Env, contract_id: u64) -> ForwardContract {
        env.storage()
            .persistent()
            .get(&DataKey::Contract(contract_id))
            .unwrap_or_else(|| panic_with_error!(&env, FuturesError::ContractNotFound))
    }

    /// Returns the ids of every contract currently open for buyer matching,
    /// enabling buyers to discover hedging opportunities.
    ///
    /// # Panics
    ///
    /// Never panics; returns an empty vector when no contracts are open.
    pub fn get_open_contracts(env: Env) -> Vec<u64> {
        env.storage()
            .instance()
            .get(&DataKey::OpenContracts)
            .unwrap_or_else(|| Vec::new(&env))
    }

    fn add_open_contract_id(env: &Env, id: u64) {
        let mut ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::OpenContracts)
            .unwrap_or_else(|| Vec::new(env));
        ids.push_back(id);
        env.storage().instance().set(&DataKey::OpenContracts, &ids);
    }

    fn remove_open_contract_id(env: &Env, id: u64) {
        let ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::OpenContracts)
            .unwrap_or_else(|| Vec::new(env));
        let mut remaining: Vec<u64> = Vec::new(env);
        for existing in &ids {
            if existing != id {
                remaining.push_back(existing);
            }
        }
        env.storage()
            .instance()
            .set(&DataKey::OpenContracts, &remaining);
    }

    fn validate_quote(
        _env: &Env,
        project_id: Symbol,
        quantity_tonnes: i128,
        spot_price_per_ton: i128,
        delivery_year: u32,
        current_year: u32,
        annual_carry_bps: Option<u32>,
    ) -> Result<(), FuturesError> {
        if project_id == symbol_short!("") {
            return Err(FuturesError::ProjectRequired);
        }
        if quantity_tonnes <= 0 {
            return Err(FuturesError::QuantityMustBePositive);
        }
        if quantity_tonnes > MAX_QUANTITY_TONNES {
            return Err(FuturesError::QuantityTooLarge);
        }
        if spot_price_per_ton <= 0 {
            return Err(FuturesError::PriceMustBePositive);
        }
        if delivery_year <= current_year {
            return Err(FuturesError::DeliveryMustBeFuture);
        }
        if let Some(carry_bps) = annual_carry_bps {
            if carry_bps > 10_000 {
                return Err(FuturesError::InvalidCarryRate);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events as _};
    use soroban_sdk::TryFromVal;

    fn setup() -> (Env, Address, CarbonFuturesClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonFutures);
        let client = CarbonFuturesClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    #[test]
    fn quote_uses_forward_price_with_carry() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonFutures);
        let client = CarbonFuturesClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let quote = client.quote(
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
            &Some(500),
        );

        assert_eq!(quote.years_to_delivery, 2);
        assert_eq!(quote.locked_price_per_ton, 50_05);
        assert_eq!(quote.notional_value, 500_500);
    }

    #[test]
    fn open_and_match_contract_flow() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );

        let quote = client.match_contract(&buyer, &id);
        assert_eq!(quote.quantity_tonnes, 100);
        assert_eq!(quote.locked_price_per_ton, 50_05);

        let contract = client.get_contract(&id);
        assert_eq!(contract.status, ContractStatus::Matched);
        assert_eq!(contract.buyer, Some(buyer));
    }

    #[test]
    fn reject_past_delivery_year() {
        let env = Env::default();
        let result = CarbonFutures::validate_quote(
            &env,
            Symbol::new(&env, "proj_001"),
            100,
            45_50,
            2026,
            2026,
            None,
        );

        assert_eq!(result, Err(FuturesError::DeliveryMustBeFuture));
    }

    // ---------- buyer discovery: get_open_contracts ----------

    #[test]
    fn get_open_contracts_lists_open_contracts_only() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let matched_id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );
        let cancelled_id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_002"),
            &50,
            &40_00,
            &2028,
            &2026,
        );
        let open_id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_003"),
            &75,
            &42_00,
            &2029,
            &2026,
        );

        client.match_contract(&buyer, &matched_id);
        client.cancel_contract(&seller, &cancelled_id);

        let open = client.get_open_contracts();
        assert_eq!(open.len(), 1);
        assert_eq!(open.get(0), Some(open_id));
    }

    #[test]
    fn get_open_contracts_empty_when_no_contracts_open() {
        let (_env, _admin, client) = setup();
        assert_eq!(client.get_open_contracts().len(), 0);
    }

    #[test]
    fn buyer_cannot_match_their_own_contract_when_seller_equals_buyer() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);

        let id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );

        let error: soroban_sdk::Error = client
            .try_match_contract(&seller, &id)
            .expect_err("seller must not match their own contract")
            .unwrap();
        assert_eq!(error, FuturesError::SellerCannotMatchOwnContract.into());
    }

    // ---------- lifecycle failure paths ----------

    #[test]
    fn buyer_cannot_match_cancelled_contract() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );
        client.cancel_contract(&seller, &id);

        let error: soroban_sdk::Error = client
            .try_match_contract(&buyer, &id)
            .expect_err("cancelled contract must not be matchable")
            .unwrap();
        assert_eq!(error, FuturesError::ContractNotOpen.into());
    }

    #[test]
    fn seller_cannot_cancel_after_match() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );
        client.match_contract(&buyer, &id);

        let error: soroban_sdk::Error = client
            .try_cancel_contract(&seller, &id)
            .expect_err("matched contract must not be cancellable")
            .unwrap();
        assert_eq!(error, FuturesError::Unauthorized.into());
    }

    #[test]
    fn buyer_can_settle_matched_contract() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );
        client.match_contract(&buyer, &id);
        client.settle_contract(&buyer, &id);

        let contract = client.get_contract(&id);
        assert_eq!(contract.status, ContractStatus::Settled);
    }

    #[test]
    fn stranger_cannot_settle_contract() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        let stranger = Address::generate(&env);

        let id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );
        client.match_contract(&buyer, &id);

        let error: soroban_sdk::Error = client
            .try_settle_contract(&stranger, &id)
            .expect_err("only counterparties may settle")
            .unwrap();
        assert_eq!(error, FuturesError::Unauthorized.into());
    }

    #[test]
    fn cannot_settle_twice() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );
        client.match_contract(&buyer, &id);
        client.settle_contract(&seller, &id);

        let error: soroban_sdk::Error = client
            .try_settle_contract(&buyer, &id)
            .expect_err("settled contract must not settle again")
            .unwrap();
        assert_eq!(error, FuturesError::InvalidSettlement.into());
    }

    #[test]
    fn unknown_contract_id_panics() {
        let (_env, _admin, client) = setup();
        let error: soroban_sdk::Error = client
            .try_get_contract(&999u64)
            .expect_err("unknown contract must not resolve")
            .unwrap();
        assert_eq!(error, FuturesError::ContractNotFound.into());
    }

    #[test]
    fn initialize_twice_panics() {
        let (_env, admin, client) = setup();
        let error: soroban_sdk::Error = client
            .try_initialize(&admin)
            .expect_err("double initialization must be rejected")
            .unwrap();
        assert_eq!(error, FuturesError::AlreadyInitialized.into());
    }

    // ---------- quote input validation ----------

    #[test]
    fn quote_rejects_invalid_carry_rate() {
        let (env, _admin, client) = setup();
        let error: soroban_sdk::Error = client
            .try_quote(
                &Symbol::new(&env, "proj_001"),
                &100,
                &45_50,
                &2028,
                &2026,
                &Some(10_001u32),
            )
            .expect_err("carry rate above 10000 bps must be rejected")
            .unwrap();
        assert_eq!(error, FuturesError::InvalidCarryRate.into());
    }

    #[test]
    fn quote_rejects_zero_quantity_and_zero_price() {
        let (env, _admin, client) = setup();

        let error: soroban_sdk::Error = client
            .try_quote(
                &Symbol::new(&env, "proj_001"),
                &0i128,
                &45_50,
                &2028,
                &2026,
                &None,
            )
            .expect_err("zero quantity must be rejected")
            .unwrap();
        assert_eq!(error, FuturesError::QuantityMustBePositive.into());

        let error: soroban_sdk::Error = client
            .try_quote(
                &Symbol::new(&env, "proj_001"),
                &100,
                &0i128,
                &2028,
                &2026,
                &None,
            )
            .expect_err("zero price must be rejected")
            .unwrap();
        assert_eq!(error, FuturesError::PriceMustBePositive.into());
    }

    #[test]
    fn open_contract_rejects_past_delivery_year() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);

        let error: soroban_sdk::Error = client
            .try_open_contract(
                &seller,
                &Symbol::new(&env, "proj_001"),
                &100,
                &45_50,
                &2026,
                &2026,
            )
            .expect_err("delivery year must be in the future")
            .unwrap();
        assert_eq!(error, FuturesError::DeliveryMustBeFuture.into());
    }

    // ---------- events ----------

    fn has_event(env: &Env, topic: &str) -> bool {
        env.events().all().iter().any(|(_contract, topics, _data)| {
            topics
                .get(0)
                .is_some_and(|t| Symbol::try_from_val(env, &t).unwrap() == Symbol::new(env, topic))
        })
    }

    #[test]
    fn open_match_settle_emit_lifecycle_events() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        let id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );
        assert!(has_event(&env, "opened"));

        client.match_contract(&buyer, &id);
        assert!(has_event(&env, "matched"));

        client.settle_contract(&seller, &id);
        assert!(has_event(&env, "settled"));
    }

    #[test]
    fn cancel_emits_event() {
        let (env, _admin, client) = setup();
        let seller = Address::generate(&env);

        let id = client.open_contract(
            &seller,
            &Symbol::new(&env, "proj_001"),
            &100,
            &45_50,
            &2028,
            &2026,
        );
        client.cancel_contract(&seller, &id);
        assert!(has_event(&env, "cancel"));
    }

    // ---------- end-to-end hedging flow from the issue ----------

    #[test]
    fn full_lifecycle_farmer_locks_in_price_buyer_hedges() {
        let (env, _admin, client) = setup();
        let farmer = Address::generate(&env);
        let buyer = Address::generate(&env);

        // Farmer locks in next season's price.
        let id = client.open_contract(
            &farmer,
            &Symbol::new(&env, "proj_001"),
            &500,
            &45_50,
            &2028,
            &2026,
        );
        assert_eq!(client.get_open_contracts().len(), 1);

        // Buyer discovers the open contract and hedges.
        let open = client.get_open_contracts();
        assert_eq!(open.get(0), Some(id));
        let quote = client.match_contract(&buyer, &id);
        assert_eq!(quote.locked_price_per_ton, 50_05);
        assert_eq!(quote.notional_value, 2_502_500);
        assert_eq!(client.get_open_contracts().len(), 0);

        // Delivery season arrives; either party settles.
        client.settle_contract(&buyer, &id);
        let contract = client.get_contract(&id);
        assert_eq!(contract.status, ContractStatus::Settled);
        assert_eq!(contract.buyer, Some(buyer));
        assert_eq!(contract.strike_price_per_ton, 50_05);
    }
}
