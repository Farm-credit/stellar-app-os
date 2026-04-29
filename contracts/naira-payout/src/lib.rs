#![no_std]

//! Naira Payout Contract — Closes #333, #420
//!
//! Routes USDC/XLM farmer payouts through a Stellar SEP-24/SEP-31 anchor to
//! deliver Nigerian Naira via mobile money or bank transfer.
//!
//! Flow:
//!   1. Admin calls `initiate_payout(funder, farmer, token, usdc_amount, ...)`
//!   2. Contract transfers `usdc_amount` of `token` from `funder` to the
//!      registered anchor withdrawal address on-chain.
//!   3. Emits `initpay` event — the off-chain anchor service picks this up and
//!      executes a SEP-24 interactive withdrawal or SEP-31 direct payment to
//!      convert USDC → NGN and deliver funds to the farmer's mobile/bank account.
//!   4. Admin calls `confirm_payout(farmer, anchor_tx_id)` after the anchor
//!      confirms NGN delivery, recording the completion on-chain.
//!   5. Admin may call `cancel_payout(farmer)` before confirmation if needed.
//!
//! Multi-currency oracle (Issue #420):
//!   - Oracle address is registered via `set_oracle` (admin-only).
//!   - Oracle calls `update_rate(base, quote, rate)` to publish exchange rates.
//!   - `payout_in_currency(recipient, amount, currency)` converts and transfers NGN.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, IntoVal,
    Symbol,
};

// ── Existing types ────────────────────────────────────────────────────────────

/// Off-ramp delivery method for Nigerian Naira.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OffRampMethod {
    /// Mobile money (e.g., MTN MoMo, Airtel Money, OPay)
    MobileMoney,
    /// Bank transfer via NIBSS or direct interbank
    BankTransfer,
}

/// Lifecycle state of a single payout record.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum PayoutStatus {
    /// Funds sent to anchor address; NGN delivery in progress
    Pending,
    /// Anchor confirmed NGN delivered to farmer's account
    Completed,
    /// Admin cancelled before anchor confirmed delivery
    Cancelled,
}

/// Persistent on-chain record for a single farmer's payout request.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PayoutRecord {
    pub farmer: Address,
    pub funder: Address,
    pub token: Address,
    /// USDC/XLM amount in stroops (7 decimal places)
    pub usdc_amount: i128,
    /// Expected NGN amount in kobo-equivalent (integer, 2 decimal places for NGN)
    pub expected_ngn_amount: i128,
    pub off_ramp_method: OffRampMethod,
    /// SHA-256(mobile_number || bank_account || farmer_id) — keeps PII off-chain
    pub off_ramp_ref_hash: BytesN<32>,
    pub status: PayoutStatus,
    pub initiated_at: u64,
    /// Zero until confirmed
    pub completed_at: u64,
    /// Anchor transaction ID; zero bytes until confirmed
    pub anchor_tx_id: BytesN<32>,
}

// ── Multi-currency types (Issue #420) ─────────────────────────────────────────

/// Supported payout currencies.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum SupportedCurrency {
    NGN,
    USD,
    GHS,
    KES,
}

/// On-chain exchange rate between two currencies.
/// `rate` is in basis points: 1 base unit = rate/10000 quote units.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ExchangeRate {
    pub base: Symbol,
    pub quote: Symbol,
    pub rate: i128,
    pub updated_at: u64,
    pub oracle: Address,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct NairaPayout;

#[contractimpl]
impl NairaPayout {
    /// One-time setup: register the admin and the anchor's on-chain
    /// withdrawal address (the Stellar account operated by the anchor).
    pub fn initialize(env: Env, admin: Address, anchor_withdrawal: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("ANCHOR"), &anchor_withdrawal);
    }

    /// Register or update the oracle address (admin-only).
    pub fn set_oracle(env: Env, oracle: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("ORACLE"), &oracle);
    }

    /// Initiate a USDC/XLM → NGN payout for a farmer.
    pub fn initiate_payout(
        env: Env,
        funder: Address,
        farmer: Address,
        token: Address,
        usdc_amount: i128,
        expected_ngn_amount: i128,
        off_ramp_method: OffRampMethod,
        off_ramp_ref_hash: BytesN<32>,
    ) {
        Self::require_admin(&env);
        funder.require_auth();

        if usdc_amount <= 0 {
            panic!("amount must be positive");
        }
        if expected_ngn_amount <= 0 {
            panic!("expected NGN amount must be positive");
        }

        let key = Self::payout_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            let existing: PayoutRecord = env.storage().persistent().get(&key).unwrap();
            if existing.status == PayoutStatus::Pending {
                panic!("pending payout already exists for this farmer");
            }
        }

        let anchor: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ANCHOR"))
            .expect("contract not initialized");

        token::Client::new(&env, &token).transfer(&funder, &anchor, &usdc_amount);

        let record = PayoutRecord {
            farmer: farmer.clone(),
            funder,
            token,
            usdc_amount,
            expected_ngn_amount,
            off_ramp_method,
            off_ramp_ref_hash,
            status: PayoutStatus::Pending,
            initiated_at: env.ledger().timestamp(),
            completed_at: 0,
            anchor_tx_id: BytesN::from_array(&env, &[0u8; 32]),
        };

        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("initpay"), farmer),
            (usdc_amount, expected_ngn_amount),
        );
    }

    /// Confirm that the anchor has delivered NGN to the farmer's account.
    pub fn confirm_payout(env: Env, farmer: Address, anchor_tx_id: BytesN<32>) {
        Self::require_admin(&env);

        let key = Self::payout_key(&env, &farmer);
        let mut record: PayoutRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no payout found for farmer");

        if record.status != PayoutStatus::Pending {
            panic!("payout is not in pending state");
        }

        record.status = PayoutStatus::Completed;
        record.completed_at = env.ledger().timestamp();
        record.anchor_tx_id = anchor_tx_id.clone();

        env.storage().persistent().set(&key, &record);

        env.events()
            .publish((symbol_short!("confpay"), farmer), anchor_tx_id);
    }

    /// Cancel a pending payout before the anchor confirms delivery.
    pub fn cancel_payout(env: Env, farmer: Address) {
        Self::require_admin(&env);

        let key = Self::payout_key(&env, &farmer);
        let mut record: PayoutRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no payout found for farmer");

        if record.status != PayoutStatus::Pending {
            panic!("can only cancel a pending payout");
        }

        record.status = PayoutStatus::Cancelled;
        env.storage().persistent().set(&key, &record);

        env.events()
            .publish((symbol_short!("cancelpay"), farmer), record.usdc_amount);
    }

    /// Return the payout record for a farmer, or None if it doesn't exist.
    pub fn get_payout(env: Env, farmer: Address) -> Option<PayoutRecord> {
        env.storage()
            .persistent()
            .get(&Self::payout_key(&env, &farmer))
    }

    // ── Oracle functions (Issue #420) ─────────────────────────────────────────

    /// Publish or update an exchange rate. Caller must be the registered oracle.
    pub fn update_rate(env: Env, oracle: Address, base: Symbol, quote: Symbol, rate: i128) {
        oracle.require_auth();

        let registered: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ORACLE"))
            .expect("oracle not registered");
        if oracle != registered {
            panic!("unauthorized: caller is not the registered oracle");
        }

        if rate <= 0 {
            panic!("rate must be positive");
        }

        let rate_key = Self::rate_key(&env, &base, &quote);
        let entry = ExchangeRate {
            base: base.clone(),
            quote: quote.clone(),
            rate,
            updated_at: env.ledger().timestamp(),
            oracle: oracle.clone(),
        };
        env.storage().persistent().set(&rate_key, &entry);

        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("rateupdtd")),
            (base, quote, rate, oracle),
        );
    }

    /// Transfer NGN to a recipient, converting from `currency` if needed.
    ///
    /// Requires the anchor token address to be set (uses ANCHOR as the NGN
    /// token source — the anchor holds the NGN token balance).
    pub fn payout_in_currency(
        env: Env,
        recipient: Address,
        amount: i128,
        currency: Symbol,
        token: Address,
    ) {
        Self::require_admin(&env);

        // Validate currency is supported
        Self::symbol_to_currency(&currency);

        let ngn_sym = Symbol::new(&env, "NGN");
        let ngn_amount = if currency == ngn_sym {
            amount
        } else {
            let rate_key = Self::rate_key(&env, &currency, &ngn_sym);
            let entry: ExchangeRate = env
                .storage()
                .persistent()
                .get(&rate_key)
                .expect("rate not found for currency pair");

            if env.ledger().timestamp() - entry.updated_at > 3600 {
                panic!("Exchange rate is stale, must be updated within 1 hour");
            }

            (amount * entry.rate) / 10000
        };

        let anchor: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ANCHOR"))
            .expect("contract not initialized");

        anchor.require_auth();
        token::Client::new(&env, &token).transfer(&anchor, &recipient, &ngn_amount);

        env.events().publish(
            (symbol_short!("payout"), symbol_short!("processd")),
            (recipient, amount, currency, ngn_amount),
        );
    }

    /// Return the stored exchange rate for a (base, quote) pair, or None.
    pub fn get_rate(env: Env, base: Symbol, quote: Symbol) -> Option<ExchangeRate> {
        env.storage()
            .persistent()
            .get(&Self::rate_key(&env, &base, &quote))
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn payout_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("PAYOUT"), farmer.clone()).into_val(env)
    }

    fn rate_key(env: &Env, base: &Symbol, quote: &Symbol) -> soroban_sdk::Val {
        (symbol_short!("EXRATE"), base.clone(), quote.clone()).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();
    }

    /// Convert a Symbol to SupportedCurrency; panics with "unsupported currency" if unknown.
    fn symbol_to_currency(sym: &Symbol) -> SupportedCurrency {
        // Symbol doesn't implement PartialEq with string literals directly in no_std;
        // we compare via the short symbol constants.
        if sym == &symbol_short!("NGN") {
            SupportedCurrency::NGN
        } else if sym == &symbol_short!("USD") {
            SupportedCurrency::USD
        } else if sym == &symbol_short!("GHS") {
            SupportedCurrency::GHS
        } else if sym == &symbol_short!("KES") {
            SupportedCurrency::KES
        } else {
            panic!("unsupported currency");
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, BytesN, Env, Symbol,
    };

    struct Ctx {
        env: Env,
        client: NairaPayoutClient<'static>,
        admin: Address,
        funder: Address,
        farmer: Address,
        token: Address,
        anchor: Address,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);

        let contract_id = env.register_contract(None, NairaPayout);
        let client = NairaPayoutClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let funder = Address::generate(&env);
        let farmer = Address::generate(&env);
        let anchor = Address::generate(&env);

        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &token_id).mint(&funder, &100_000);

        client.initialize(&admin, &anchor);

        Ctx {
            env,
            client,
            admin,
            funder,
            farmer,
            token: token_id,
            anchor,
        }
    }

    fn dummy_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── Existing tests ────────────────────────────────────────────────────────

    #[test]
    fn test_full_mobile_money_lifecycle() {
        let Ctx {
            env,
            client,
            funder,
            farmer,
            token,
            anchor,
            ..
        } = setup();

        assert_eq!(balance(&env, &token, &funder), 100_000);
        assert_eq!(balance(&env, &token, &anchor), 0);

        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &10_000,
            &16_000_000,
            &OffRampMethod::MobileMoney,
            &dummy_hash(&env, 1),
        );

        assert_eq!(balance(&env, &token, &funder), 90_000, "funder debited");
        assert_eq!(balance(&env, &token, &anchor), 10_000, "anchor credited");

        let record = client.get_payout(&farmer).unwrap();
        assert_eq!(record.status, PayoutStatus::Pending);
        assert_eq!(record.usdc_amount, 10_000);
        assert_eq!(record.expected_ngn_amount, 16_000_000);
        assert_eq!(record.off_ramp_method, OffRampMethod::MobileMoney);

        client.confirm_payout(&farmer, &dummy_hash(&env, 2));

        let record = client.get_payout(&farmer).unwrap();
        assert_eq!(record.status, PayoutStatus::Completed);
        assert_eq!(record.anchor_tx_id, dummy_hash(&env, 2));
        assert!(record.completed_at > 0, "completion timestamp recorded");
    }

    #[test]
    fn test_bank_transfer_off_ramp() {
        let Ctx {
            env,
            client,
            funder,
            farmer,
            token,
            ..
        } = setup();

        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &5_000,
            &8_000_000,
            &OffRampMethod::BankTransfer,
            &dummy_hash(&env, 3),
        );

        let record = client.get_payout(&farmer).unwrap();
        assert_eq!(record.off_ramp_method, OffRampMethod::BankTransfer);
        assert_eq!(record.status, PayoutStatus::Pending);
    }

    #[test]
    fn test_cancel_payout() {
        let Ctx {
            env,
            client,
            funder,
            farmer,
            token,
            ..
        } = setup();

        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &5_000,
            &8_000_000,
            &OffRampMethod::MobileMoney,
            &dummy_hash(&env, 1),
        );
        client.cancel_payout(&farmer);

        let record = client.get_payout(&farmer).unwrap();
        assert_eq!(record.status, PayoutStatus::Cancelled);
    }

    #[test]
    fn test_new_payout_allowed_after_cancel() {
        let Ctx {
            env,
            client,
            funder,
            farmer,
            token,
            ..
        } = setup();

        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &5_000,
            &8_000_000,
            &OffRampMethod::MobileMoney,
            &dummy_hash(&env, 1),
        );
        client.cancel_payout(&farmer);

        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &5_000,
            &8_200_000,
            &OffRampMethod::BankTransfer,
            &dummy_hash(&env, 2),
        );

        let record = client.get_payout(&farmer).unwrap();
        assert_eq!(record.status, PayoutStatus::Pending);
        assert_eq!(record.off_ramp_method, OffRampMethod::BankTransfer);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_zero_amount_rejected() {
        let Ctx {
            env,
            client,
            funder,
            farmer,
            token,
            ..
        } = setup();
        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &0,
            &1_000,
            &OffRampMethod::MobileMoney,
            &dummy_hash(&env, 1),
        );
    }

    #[test]
    #[should_panic(expected = "pending payout already exists")]
    fn test_duplicate_pending_payout_rejected() {
        let Ctx {
            env,
            client,
            funder,
            farmer,
            token,
            ..
        } = setup();
        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &5_000,
            &8_000_000,
            &OffRampMethod::MobileMoney,
            &dummy_hash(&env, 1),
        );
        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &5_000,
            &8_000_000,
            &OffRampMethod::MobileMoney,
            &dummy_hash(&env, 1),
        );
    }

    #[test]
    #[should_panic(expected = "payout is not in pending state")]
    fn test_double_confirm_rejected() {
        let Ctx {
            env,
            client,
            funder,
            farmer,
            token,
            ..
        } = setup();
        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &5_000,
            &8_000_000,
            &OffRampMethod::MobileMoney,
            &dummy_hash(&env, 1),
        );
        client.confirm_payout(&farmer, &dummy_hash(&env, 2));
        client.confirm_payout(&farmer, &dummy_hash(&env, 2));
    }

    #[test]
    #[should_panic(expected = "can only cancel a pending payout")]
    fn test_cancel_completed_rejected() {
        let Ctx {
            env,
            client,
            funder,
            farmer,
            token,
            ..
        } = setup();
        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &5_000,
            &8_000_000,
            &OffRampMethod::MobileMoney,
            &dummy_hash(&env, 1),
        );
        client.confirm_payout(&farmer, &dummy_hash(&env, 2));
        client.cancel_payout(&farmer);
    }

    // ── Oracle / multi-currency tests (Issue #420) ────────────────────────────

    fn setup_oracle(ctx: &Ctx) -> Address {
        let oracle = Address::generate(&ctx.env);
        ctx.client.set_oracle(&oracle);
        oracle
    }

    fn mint_to_anchor(ctx: &Ctx, amount: i128) {
        token::StellarAssetClient::new(&ctx.env, &ctx.token).mint(&ctx.anchor, &amount);
    }

    #[test]
    fn test_update_rate_stores_and_emits() {
        let ctx = setup();
        let oracle = setup_oracle(&ctx);

        let base = Symbol::new(&ctx.env, "USD");
        let quote = Symbol::new(&ctx.env, "NGN");
        ctx.client.update_rate(&oracle, &base, &quote, &16000_i128);

        let entry = ctx.client.get_rate(&base, &quote).unwrap();
        assert_eq!(entry.rate, 16000);
        assert_eq!(entry.oracle, oracle);
        assert_eq!(entry.base, base);
        assert_eq!(entry.quote, quote);
    }

    #[test]
    #[should_panic(expected = "unauthorized: caller is not the registered oracle")]
    fn test_update_rate_non_oracle_rejected() {
        let ctx = setup();
        setup_oracle(&ctx);

        let impostor = Address::generate(&ctx.env);
        ctx.client.update_rate(
            &impostor,
            &Symbol::new(&ctx.env, "USD"),
            &Symbol::new(&ctx.env, "NGN"),
            &16000_i128,
        );
    }

    #[test]
    fn test_payout_ngn_direct_transfer() {
        let ctx = setup();
        mint_to_anchor(&ctx, 50_000);

        let recipient = Address::generate(&ctx.env);
        ctx.client.payout_in_currency(
            &recipient,
            &10_000,
            &Symbol::new(&ctx.env, "NGN"),
            &ctx.token,
        );

        assert_eq!(balance(&ctx.env, &ctx.token, &recipient), 10_000);
    }

    #[test]
    fn test_payout_usd_converts_correctly() {
        let ctx = setup();
        let oracle = setup_oracle(&ctx);
        mint_to_anchor(&ctx, 200_000_000);

        // 1 USD = 1600 NGN → rate = 16_000_000 basis points
        let base = Symbol::new(&ctx.env, "USD");
        let quote = Symbol::new(&ctx.env, "NGN");
        ctx.client.update_rate(&oracle, &base, &quote, &16_000_000_i128);

        let recipient = Address::generate(&ctx.env);
        // Send 1 USD (amount=1), expect 1 * 16_000_000 / 10000 = 1600 NGN
        ctx.client.payout_in_currency(
            &recipient,
            &1_i128,
            &Symbol::new(&ctx.env, "USD"),
            &ctx.token,
        );

        assert_eq!(balance(&ctx.env, &ctx.token, &recipient), 1600);
    }

    #[test]
    #[should_panic(expected = "Exchange rate is stale, must be updated within 1 hour")]
    fn test_payout_stale_rate_rejected() {
        let ctx = setup();
        let oracle = setup_oracle(&ctx);
        mint_to_anchor(&ctx, 200_000_000);

        let base = Symbol::new(&ctx.env, "USD");
        let quote = Symbol::new(&ctx.env, "NGN");
        ctx.client.update_rate(&oracle, &base, &quote, &16_000_000_i128);

        // Advance ledger time by more than 1 hour (3601 seconds)
        ctx.env.ledger().with_mut(|l| {
            l.timestamp += 3601;
        });

        let recipient = Address::generate(&ctx.env);
        ctx.client.payout_in_currency(
            &recipient,
            &1_i128,
            &Symbol::new(&ctx.env, "USD"),
            &ctx.token,
        );
    }

    #[test]
    #[should_panic(expected = "unsupported currency")]
    fn test_payout_unsupported_currency_rejected() {
        let ctx = setup();
        let recipient = Address::generate(&ctx.env);
        ctx.client.payout_in_currency(
            &recipient,
            &1_000,
            &Symbol::new(&ctx.env, "EUR"),
            &ctx.token,
        );
    }

    #[test]
    #[should_panic(expected = "rate not found for currency pair")]
    fn test_payout_missing_rate_rejected() {
        let ctx = setup();
        // Oracle registered but no rate set for GHS
        setup_oracle(&ctx);
        mint_to_anchor(&ctx, 200_000_000);

        let recipient = Address::generate(&ctx.env);
        ctx.client.payout_in_currency(
            &recipient,
            &1_000,
            &Symbol::new(&ctx.env, "GHS"),
            &ctx.token,
        );
    }
}
