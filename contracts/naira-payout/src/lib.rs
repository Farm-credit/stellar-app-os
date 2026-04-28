#![no_std]

//! Naira Payout Contract — Closes #333
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

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, IntoVal,
};

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

    /// Initiate a USDC/XLM → NGN payout for a farmer.
    ///
    /// - `funder`: platform wallet that holds the USDC (authorises the transfer)
    /// - `farmer`: identifies the payout record and the beneficiary
    /// - `token`: Stellar Asset Contract address for USDC or XLM
    /// - `usdc_amount`: amount in stroops to transfer to the anchor
    /// - `expected_ngn_amount`: pre-quoted NGN equivalent (from SEP-38 quote)
    /// - `off_ramp_method`: mobile money or bank transfer
    /// - `off_ramp_ref_hash`: SHA-256 of the farmer's off-ramp reference (PII stays off-chain)
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
    /// `anchor_tx_id`: 32-byte anchor transaction identifier (SEP-24/31 tx id hash)
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
    /// Does not reverse the on-chain token transfer (that requires a separate
    /// recovery flow with the anchor); it simply records the cancellation.
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn payout_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("PAYOUT"), farmer.clone()).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, BytesN, Env,
    };

    struct Ctx {
        env: Env,
        client: NairaPayoutClient<'static>,
        _admin: Address,
        funder: Address,
        farmer: Address,
        token: Address,
        anchor: Address,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

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
            _admin: admin,
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

        // Initiate: transfer 10 USDC to anchor, record ≈ ₦16,000 expected NGN
        client.initiate_payout(
            &funder,
            &farmer,
            &token,
            &10_000,
            &16_000_000, // NGN kobo-equivalent at ~1600 NGN/USDC
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

        // Confirm: anchor delivered NGN
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

        // Second payout should succeed after cancellation
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
}
