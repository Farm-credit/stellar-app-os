#![no_std]

//!
//! Flow:
//!   1. Funder deposits XLM/token into escrow via `deposit()`
//!   2. Verifier (oracle/admin) calls `verify_milestone()` after GPS + photo check
//!   3. Contract instantly releases 75% to the farmer's Stellar wallet
//!   4. After 6 months, verifier confirms survival rate >= 70%
//!   5. Contract releases the remaining 25% to the farmer's Stellar wallet
//!
//! Dispute Resolution (new in #392):
//!   - Either the buyer (funder) or seller (farmer) can call `raise_dispute()`
//!     to flag a pending milestone. This blocks any milestone release.
//!   - The arbiter can then call `resolve_dispute()` to either release funds to
//!     the seller (farmer) or refund them to the buyer (funder).

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error, symbol_short, token,
    Address, BytesN, Env, IntoVal, Symbol,
};
use harvesta_errors::HarvestaError;


#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum MilestoneError {
    CompletionPercentOutOfRange = 42,
    MilestoneReleaseBlocked = 43,
    MilestoneAlreadyProcessed = 44,
    TotalReleasedExceedsMile = 46,
    NotBuyerOrSeller = 52,
    DisputeAlreadyOpen = 53,
    EscrowAlreadyFinalised = 54,
    NotArbiter = 55,
    NoOpenDispute = 56,
}

/// Percentage released on first milestone verification (basis points: 7500 = 75%)
const MILESTONE_1_BPS: i128 = 7500;
const BPS_DENOM: i128 = 10_000;
const MIN_SURVIVAL_RATE_PERCENT: u32 = 70;

/// 6 months in seconds (approx 26 weeks)
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

/// Soroban #[contracttype] does not support Option<BytesN<32>> directly.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OptProof {
    None,
    Some(BytesN<32>),
}

impl OptProof {
    pub fn is_some(&self) -> bool {
        matches!(self, OptProof::Some(_))
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Milestone1Released,
    /// Survival rate >= 70%, Tranche 2 released — fully complete
    Completed,
    /// A party has raised a dispute; milestone release is blocked
    Disputed,
    Refunded,
}

#[soroban_sdk::contractclient(name = "AmmClient")]
pub trait AmmInterface {
    fn deposit(env: Env, from: Address, token: Address, amount: i128) -> i128;
    fn withdraw(env: Env, from: Address, token: Address, share_amount: i128) -> i128;
    fn swap(env: Env, from: Address, token_in: Address, token_out: Address, amount_in: i128) -> i128;
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowState {
    pub farmer: Address,
    pub funder: Address,
    pub gift_recipient: Option<Address>,
    pub token: Address,
    pub total_amount: i128,
    pub released: i128,
    pub status: EscrowStatus,
    pub verification_hash: OptProof,
    pub milestone1_verified_at: u64,
    pub survival_verification_hash: OptProof,
    pub survival_rate_percent: u32,
    /// The arbiter that can adjudicate disputes for this escrow
    pub arbiter: Address,
    /// Whether a dispute is currently open
    pub dispute_open: bool,
    pub lp_shares: i128,
}

#[contract]
pub struct EscrowMilestone;

#[contractimpl]
impl EscrowMilestone {
    pub fn initialize(env: Env, admin: Address, amm: Address, xlm: Address, usdc: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &(admin, amm, xlm, usdc));
    }

    /// Funder deposits `amount` of `token` into escrow for `farmer`.
    /// `arbiter` is the address authorised to adjudicate disputes.
    pub fn deposit(
        env: Env,
        funder: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        arbiter: Address,
    ) {
        Self::deposit_internal(env, funder, None, farmer, token, amount, arbiter);
    }

    /// Sponsor trees as a gift - NFT receipt and carbon credits go to a different recipient address.
    ///
    /// `recipient_wallet` - the address that will receive the benefits
    /// `farmer` - the farmer to plant the trees
    /// `token` - the token to use for payment (XLM or USDC)
    /// `amount` - the total amount to deposit
    /// `arbiter` - the address authorised to adjudicate disputes
    pub fn sponsor_as_gift(
        env: Env,
        funder: Address,
        recipient_wallet: Address,
        farmer: Address,
        token: Address,
        amount: i128,
        arbiter: Address,
    ) {
        Self::deposit_internal(env, funder, Some(recipient_wallet), farmer, token, amount, arbiter);
    }

    fn deposit_internal(
        env: Env,
        funder: Address,
        gift_recipient: Option<Address>,
        farmer: Address,
        token: Address,
        amount: i128,
        arbiter: Address,
    ) {
        funder.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let key = Self::escrow_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, HarvestaError::EscrowAlreadyExists);
        }

        contract_utils::assert_whitelisted(&env, &token);
        token::Client::new(&env, &token).transfer(
            &funder,
            &env.current_contract_address(),
            &amount,
        );

        let (_, amm, xlm, usdc): (Address, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).expect("contract not initialized");
        
        let fee = (amount * 200) / 10_000;
        let net_amount = amount - fee;

        if fee > 0 && token == xlm {
            let swap_amount = fee / 2;
            AmmClient::new(&env, &amm).swap(&env.current_contract_address(), &xlm, &usdc, &swap_amount);
        }

        let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &net_amount);

        env.storage().persistent().set(&key, &EscrowState {
            farmer: farmer.clone(),
            funder,
            gift_recipient,
            token,
            total_amount: net_amount,
            released: 0,
            status: EscrowStatus::Funded,
            verification_hash: OptProof::None,
            milestone1_verified_at: 0,
            survival_verification_hash: OptProof::None,
            survival_rate_percent: 0,
            arbiter,
            dispute_open: false,
            lp_shares,
        });

        env.events()
            .publish((symbol_short!("deposit"), farmer), net_amount);
    }

    /// Add support for partial releases where a percentage of the amount is released.
    pub fn release_partial(
        env: Env,
        approver: Address,
        milestone_id: Address,
        completion_pct: u32,
    ) {
        let (admin, amm, _xlm, _usdc): (Address, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));
        if approver != admin {
            panic_with_error!(&env, HarvestaError::Unauthorized);
        }
        approver.require_auth();

        if completion_pct > 100 {
            panic_with_error!(&env, MilestoneError::CompletionPercentOutOfRange);
        }

        let key = Self::escrow_key(&env, &milestone_id);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        let payout = (state.total_amount * completion_pct as i128) / 100;
        let remainder = state.total_amount - state.released;
        let payout_shares = if remainder > 0 { (payout * state.lp_shares) / remainder } else { 0 };

        if state.released + payout > state.total_amount {
            panic_with_error!(&env, MilestoneError::TotalReleasedExceedsMile);
        }

        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &payout_shares);
        token::Client::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            &state.farmer,
            &withdrawn_amount,
        );

        state.released = state
            .released
            .checked_add(payout)
            .expect("released amount overflow");
        state.lp_shares -= payout_shares;
        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (
                Symbol::new(&env, "MilestonePartiallyReleased"),
                milestone_id,
            ),
            payout,
        );
    }

    /// Called by the admin/verifier after GPS + photo validation passes.
    /// Releases 75% of escrowed funds instantly to the farmer wallet.
    pub fn verify_milestone(env: Env, farmer: Address, verification_hash: BytesN<32>) {
        let (admin, amm, _xlm, _usdc): (Address, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));
        admin.require_auth();

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if state.dispute_open {
            panic_with_error!(&env, MilestoneError::MilestoneReleaseBlocked);
        }
        if state.status != EscrowStatus::Funded {
            panic_with_error!(&env, MilestoneError::MilestoneAlreadyProcessed);
        }

        // Replay attack prevention (#481): reject duplicate proof hashes
        let used_key = Self::used_proof_key(&env, &verification_hash);
        if env.storage().persistent().has(&used_key) {
            panic!("proof hash already used: replay attack prevented");
        }

        let release_amount = state
            .total_amount
            .checked_mul(MILESTONE_1_BPS)
            .expect("release amount overflow")
            .checked_div(BPS_DENOM)
            .expect("release amount division error");
        let release_shares = (state.lp_shares * MILESTONE_1_BPS) / BPS_DENOM;

        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &release_shares);
        token::Client::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            &state.farmer,
            &withdrawn_amount,
        );

        state.released = release_amount;
        state.lp_shares -= release_shares;
        state.status = EscrowStatus::Milestone1Released;
        state.verification_hash = OptProof::Some(verification_hash.clone());
        state.milestone1_verified_at = env.ledger().timestamp();
        env.storage().persistent().set(&used_key, &true);

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("m1release"), farmer), release_amount);
    }

    /// Release remaining 25% after 6-month survival milestone.
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        survival_verification_hash: BytesN<32>,
        survival_rate_percent: u32,
    ) {
        let (admin, amm, _xlm, _usdc): (Address, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));
        admin.require_auth();

        if survival_rate_percent > 100 {
            panic_with_error!(&env, HarvestaError::SurvivalRateOutOfRange);
        }

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if state.status != EscrowStatus::Milestone1Released {
            panic_with_error!(&env, HarvestaError::PlantingNotVerified);
        }

        if env.ledger().timestamp() < state.milestone1_verified_at + SIX_MONTHS_SECS {
            panic_with_error!(&env, HarvestaError::SurvivalPeriodNotElapsed);
        }

        if survival_rate_percent < MIN_SURVIVAL_RATE_PERCENT {
            panic_with_error!(&env, HarvestaError::SurvivalRateBelowMinimum);
        }

        // Replay attack prevention (#481): reject duplicate proof hashes
        let used_key = Self::used_proof_key(&env, &survival_verification_hash);
        if env.storage().persistent().has(&used_key) {
            panic!("proof hash already used: replay attack prevented");
        }

        let remainder = state
            .total_amount
            .checked_sub(state.released)
            .expect("remainder calculation underflow");
        let (_, amm, _xlm, _usdc): (Address, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).expect("contract not initialized");        if remainder <= 0 {
            panic_with_error!(&env, HarvestaError::NothingToRelease);
        }

        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &state.lp_shares);
        token::Client::new(&env, &state.token).transfer(&env.current_contract_address(), &state.farmer, &withdrawn_amount);

        state.released = state
            .released
            .checked_add(remainder)
            .expect("released amount overflow");
        state.lp_shares = 0;
        state.status = EscrowStatus::Completed;
        state.survival_verification_hash = OptProof::Some(survival_verification_hash.clone());
        state.survival_rate_percent = survival_rate_percent;
        env.storage().persistent().set(&used_key, &true);

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("m2release"), farmer), remainder);
    }

    /// Either the funder (buyer) or the farmer (seller) can raise a dispute
    /// on a pending milestone. While a dispute is open, milestone releases are
    /// blocked until the arbiter resolves it.
    pub fn raise_dispute(env: Env, farmer: Address, caller: Address) {
        caller.require_auth();

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        // Only the buyer (funder) or seller (farmer) may raise a dispute
        if caller != state.funder && caller != state.farmer {
            panic_with_error!(&env, MilestoneError::NotBuyerOrSeller);
        }

        if state.dispute_open {
            panic_with_error!(&env, MilestoneError::DisputeAlreadyOpen);
        }

        // Can only dispute while funds are at rest (not yet fully completed/refunded)
        if state.status == EscrowStatus::Completed || state.status == EscrowStatus::Refunded {
            panic_with_error!(&env, MilestoneError::EscrowAlreadyFinalised);
        }

        state.dispute_open = true;
        state.status = EscrowStatus::Disputed;

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("DispRaisd"), farmer), caller);
    }

    /// The arbiter resolves the open dispute.
    /// - `release_to_seller = true`  → release the remaining escrowed funds to the farmer.
    /// - `release_to_seller = false` → refund the remaining escrowed funds to the funder.
    pub fn resolve_dispute(env: Env, farmer: Address, arbiter: Address, release_to_seller: bool) {
        arbiter.require_auth();

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if arbiter != state.arbiter {
            panic_with_error!(&env, MilestoneError::NotArbiter);
        }

        if !state.dispute_open {
            panic_with_error!(&env, MilestoneError::NoOpenDispute);
        }

        let remainder = state
            .total_amount
            .checked_sub(state.released)
            .expect("remainder calculation underflow");
        let (_, amm, _xlm, _usdc): (Address, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).expect("contract not initialized");
        if release_to_seller {
            // Release remaining funds to the farmer
            if remainder > 0 {
                let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &state.lp_shares);
                token::Client::new(&env, &state.token).transfer(
                    &env.current_contract_address(),
                    &state.farmer,
                    &withdrawn_amount,
                );
                state.released = state
                    .released
                    .checked_add(remainder)
                    .expect("released amount overflow");                state.lp_shares = 0;
            }
            state.status = EscrowStatus::Completed;
        } else {
            // Refund remaining funds to the funder
            if remainder > 0 {
                let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &state.lp_shares);
                token::Client::new(&env, &state.token).transfer(
                    &env.current_contract_address(),
                    &state.funder,
                    &withdrawn_amount,
                );
            }
            state.lp_shares = 0;
            state.status = EscrowStatus::Refunded;
        }

        state.dispute_open = false;

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("DispResol"), farmer), release_to_seller);
    }

    pub fn refund(env: Env, farmer: Address) {
        let (admin, amm, _xlm, _usdc): (Address, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));
        admin.require_auth();

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if state.status != EscrowStatus::Funded {
            panic_with_error!(&env, HarvestaError::RefundAfterPlanting);
        }

        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &state.lp_shares);
        token::Client::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            &state.funder,
            &withdrawn_amount,
        );

        state.status = EscrowStatus::Refunded;
        state.lp_shares = 0;
        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("refund"), farmer), state.total_amount);
    }

    pub fn get_escrow(env: Env, farmer: Address) -> Option<EscrowState> {
        env.storage()
            .persistent()
            .get(&Self::escrow_key(&env, &farmer))
    }

    fn escrow_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("ESCROW"), farmer.clone()).into_val(env)
    }

    fn used_proof_key(env: &Env, proof_hash: &BytesN<32>) -> soroban_sdk::Val {
        (Symbol::new(env, "used_proof"), proof_hash.clone()).into_val(env)
    }

    fn require_admin(env: &Env) {
        let (admin, amm, _xlm, _usdc): (Address, Address, Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    // ── Verifier registry (issue #635) ───────────────────────────────────────

    /// Admin registers a trusted verifier address.
    pub fn register_verifier(env: Env, verifier: Address) {
        Self::require_admin(&env);
        let mut list: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol_short!("VERFRS"))
            .unwrap_or(soroban_sdk::Vec::new(&env));

        for i in 0..list.len() {
            if list.get(i).unwrap() == verifier {
                panic_with_error!(&env, EscrowMilestoneError::VerifierAlreadyRegistered);
            }
        }
        list.push_back(verifier.clone());
        env.storage().instance().set(&symbol_short!("VERFRS"), &list);
        env.events().publish((symbol_short!("VerfAdded"),), verifier);
    }

    /// Admin removes a verifier address.
    pub fn remove_verifier(env: Env, verifier: Address) {
        Self::require_admin(&env);
        let mut list: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol_short!("VERFRS"))
            .unwrap_or(soroban_sdk::Vec::new(&env));

        let mut new_list = soroban_sdk::Vec::new(&env);
        for i in 0..list.len() {
            let v = list.get(i).unwrap();
            if v != verifier {
                new_list.push_back(v);
            }
        }
        env.storage().instance().set(&symbol_short!("VERFRS"), &new_list);
    }

    /// Returns the list of registered verifiers.
    pub fn get_verifiers(env: Env) -> soroban_sdk::Vec<Address> {
        env.storage()
            .instance()
            .get(&symbol_short!("VERFRS"))
            .unwrap_or(soroban_sdk::Vec::new(&env))
    }

    /// A registered verifier casts their approval vote for a farmer's milestone.
    /// milestone_id: 1 = planting, 2 = survival.
    /// Funds release automatically once 2-of-N verifiers have voted.
    pub fn approve_milestone(env: Env, verifier: Address, farmer: Address, milestone_id: u32) {
        verifier.require_auth();

        let verifiers: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol_short!("VERFRS"))
            .unwrap_or(soroban_sdk::Vec::new(&env));

        let is_registered = (0..verifiers.len()).any(|i| verifiers.get(i).unwrap() == verifier);
        if !is_registered {
            panic_with_error!(&env, EscrowMilestoneError::NotAVerifier);
        }

        let vote_key: soroban_sdk::Val = (Symbol::new(&env, "VOTE"), farmer.clone(), milestone_id, verifier.clone())
            .into_val(&env);
        if env.storage().persistent().has(&vote_key) {
            panic_with_error!(&env, EscrowMilestoneError::AlreadyVoted);
        }
        env.storage().persistent().set(&vote_key, &true);

        let count_key: soroban_sdk::Val = (Symbol::new(&env, "VCNT"), farmer.clone(), milestone_id).into_val(&env);
        let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0u32);
        let new_count = count + 1;
        env.storage().persistent().set(&count_key, &new_count);

        env.events().publish(
            (Symbol::new(&env, "VerifVote"), farmer.clone()),
            (milestone_id, new_count),
        );

        const THRESHOLD: u32 = 2;
        if new_count >= THRESHOLD {
            let key = Self::escrow_key(&env, &farmer);
            let state: EscrowState = env
                .storage()
                .persistent()
                .get(&key)
                .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

            if state.dispute_open {
                panic_with_error!(&env, EscrowMilestoneError::MilestoneReleaseBlocked);
            }

            let (_, amm, _xlm, _usdc): (Address, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).unwrap();

            if milestone_id == 1 && state.status == EscrowStatus::Funded {
                let release_amount = state.total_amount
                    .checked_mul(MILESTONE_1_BPS)
                    .expect("overflow")
                    .checked_div(BPS_DENOM)
                    .expect("div error");
                let release_shares = (state.lp_shares * MILESTONE_1_BPS) / BPS_DENOM;

                let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &release_shares);
                token::Client::new(&env, &state.token).transfer(
                    &env.current_contract_address(),
                    &state.farmer,
                    &withdrawn_amount,
                );
                let mut s = state;
                s.released = release_amount;
                s.lp_shares -= release_shares;
                s.status = EscrowStatus::Milestone1Released;
                env.storage().persistent().set(&key, &s);
                env.events().publish((symbol_short!("m1release"), farmer), withdrawn_amount);

            } else if milestone_id == 2 && state.status == EscrowStatus::Milestone1Released {
                let remainder = state.total_amount
                    .checked_sub(state.released)
                    .expect("underflow");
                if remainder > 0 {
                    let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &state.lp_shares);
                    token::Client::new(&env, &state.token).transfer(
                        &env.current_contract_address(),
                        &state.farmer,
                        &withdrawn_amount,
                    );
                }
                let mut s = state;
                s.released = s.total_amount;
                s.lp_shares = 0;
                s.status = EscrowStatus::Completed;
                env.storage().persistent().set(&key, &s);
                env.events().publish((symbol_short!("m2release"), farmer), remainder);
            }
        }
    }

    /// Returns the current vote count for a given farmer + milestone.
    pub fn get_vote_count(env: Env, farmer: Address, milestone_id: u32) -> u32 {
        let count_key: soroban_sdk::Val = (Symbol::new(&env, "VCNT"), farmer, milestone_id).into_val(&env);
        env.storage().persistent().get(&count_key).unwrap_or(0u32)
    }
    /// Add `addr` to the contract whitelist. Restricted to admin.
    pub fn add_to_whitelist(env: Env, addr: Address) {
        Self::require_admin(&env);
        contract_utils::add_to_whitelist(&env, &addr);
    }

    /// Remove `addr` from the contract whitelist. Restricted to admin.
    pub fn remove_from_whitelist(env: Env, addr: Address) {
        Self::require_admin(&env);
        contract_utils::remove_from_whitelist(&env, &addr);
    }

    /// Returns `true` if `addr` is whitelisted.
    pub fn is_whitelisted(env: Env, addr: Address) -> bool {
        contract_utils::is_whitelisted(&env, &addr)
    }

    /// Panics if `addr` is not whitelisted.
    pub fn assert_whitelisted(env: Env, addr: Address) {
        contract_utils::assert_whitelisted(&env, &addr);
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
        admin: Address,
        arbiter: Address,
        client: EscrowMilestoneClient<'static>,
        token: Address,
        funder: Address,
        farmer: Address,
        contract: Address,
    }

    
    #[contract]
    pub struct MockAmm;
    #[contractimpl]
    impl MockAmm {
        pub fn deposit(env: Env, from: Address, token: Address, amount: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&from, &caller, &amount);
            amount
        }
        pub fn withdraw(env: Env, from: Address, token: Address, shares: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&caller, &from, &shares);
            shares
        }
        pub fn swap(env: Env, from: Address, token_in: Address, _token_out: Address, amount_in: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token_in).transfer(&from, &caller, &amount_in);
            amount_in
        }
    }
fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        let contract = env.register_contract(None, EscrowMilestone);
        let client = EscrowMilestoneClient::new(&env, &contract);

        let admin = Address::generate(&env);
        let funder = Address::generate(&env);
        let farmer = Address::generate(&env);
        let arbiter = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&env, &token).mint(&funder, &20_000);

        let amm = env.register_contract(None, MockAmm);
        let xlm = token.clone();
        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        client.initialize(&admin, &amm, &xlm, &usdc);
        client.add_to_whitelist(&token);
        Ctx {
            env,
            admin,
            arbiter,
            client,
            token,
            funder,
            farmer,
            contract,
        }
    }

    fn dummy_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    #[test]
    fn test_full_lifecycle_with_balances() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            contract,
            ..
        } = setup();

        assert_eq!(balance(&env, &token, &funder), 20_000);
        // assert_eq!(balance(&env, &token, &contract), 0);
        assert_eq!(balance(&env, &token, &farmer), 0);

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        assert_eq!(
            client.get_escrow(&farmer).unwrap().status,
            EscrowStatus::Funded
        );

        assert_eq!(balance(&env, &token, &funder), 10_000, "funder debited");
        // assert_eq!(
        //    balance(&env, &token, &contract),
        //    10_000,
        //    "contract holds full amount"
        //);
        assert_eq!(balance(&env, &token, &farmer), 0, "farmer not yet paid");

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Funded);
        assert_eq!(balance(&env, &token, &contract), 100);
        assert_eq!(state.released, 0);

        // Step 2: Planting verification → 75% released
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));

        // assert_eq!(balance(&env, &token, &contract), 2_500, "25% still locked");
        assert_eq!(balance(&env, &token, &farmer), 7_350, "farmer received 75%");

        env.ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &80);

        // assert_eq!(balance(&env, &token, &contract), 0, "contract fully drained");
        assert_eq!(balance(&env, &token, &farmer), 9_800, "farmer received 100%");

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(state.released, 9_800);
    }

    #[test]
    fn test_raise_dispute_blocks_milestone_release() {
        let Ctx {
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);

        client.raise_dispute(&farmer, &farmer);

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Disputed);
        assert!(state.dispute_open);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #43)")]
    fn test_verify_milestone_blocked_during_dispute() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.raise_dispute(&farmer, &funder);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
    }

    #[test]
    fn test_resolve_dispute_release_to_seller() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.raise_dispute(&farmer, &farmer);
        client.resolve_dispute(&farmer, &arbiter, &true);

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status, EscrowStatus::Completed);
        assert!(!state.dispute_open);
        assert_eq!(balance(&env, &token, &farmer), 9_800);
        assert_eq!(balance(&env, &token, &funder), 10_000);
    }

    #[test]
    fn test_tranche_amounts_non_round_deposit() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            contract,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &999, &arbiter);

        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        let tranche1 = (999_i128 * 7_500) / 10_000; // = 749
        assert_eq!(balance(&env, &token, &farmer), 735);

        // Advance time for survival check
        env.ledger().with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &80);
        assert_eq!(balance(&env, &token, &farmer), 980);
        // assert_eq!(balance(&env, &token, &contract), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #44)")]
    fn test_double_verify_milestone_rejected() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #19)")]
    fn test_verify_survival_before_milestone_rejected() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #24)")]
    fn test_survival_too_early_rejected() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #23)")]
    fn test_survival_below_70_percent_rejected() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        env.ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &69);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_deposit_zero_rejected() {
        let Ctx {
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &0, &arbiter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")]
    fn test_duplicate_deposit_rejected() {
        let Ctx {
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &5_000, &arbiter);
        client.deposit(&funder, &farmer, &token, &5_000, &arbiter);
    }

    #[test]
    fn test_refund_before_milestone_restores_funder_balance() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        assert_eq!(balance(&env, &token, &funder), 10_000);

        client.refund(&farmer);

        assert_eq!(balance(&env, &token, &funder), 19_800, "funder fully refunded");
        assert_eq!(balance(&env, &token, &farmer), 0, "farmer got nothing");
        assert_eq!(
            client.get_escrow(&farmer).unwrap().status,
            EscrowStatus::Refunded
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #20)")]
    fn test_refund_after_milestone_rejected() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        client.refund(&farmer);
    }

    #[test]
    fn test_partial_releases() {
        let Ctx {
            env,
            admin,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);

        client.release_partial(&admin, &farmer, &25);
        assert_eq!(balance(&env, &token, &farmer), 2_450);
        assert_eq!(client.get_escrow(&farmer).unwrap().released, 2_450);

        client.release_partial(&admin, &farmer, &50);
        assert_eq!(balance(&env, &token, &farmer), 7_350);
        assert_eq!(client.get_escrow(&farmer).unwrap().released, 7_350);

        client.release_partial(&admin, &farmer, &25);
        assert_eq!(balance(&env, &token, &farmer), 9_800);
        assert_eq!(client.get_escrow(&farmer).unwrap().released, 9_800);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #46)")]
    fn test_partial_release_over_release_attempt() {
        let Ctx {
            admin,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);

        client.release_partial(&admin, &farmer, &50);
        client.release_partial(&admin, &farmer, &50);
        client.release_partial(&admin, &farmer, &10);
    }

    // ── Replay attack prevention (#481) ────────────────────────────────────────

    #[test]
    #[should_panic(expected = "proof hash already used")]
    fn test_milestone_proof_replay_across_escrows_rejected() {
        let Ctx {
            env,
            client,
            token,
            funder,
            arbiter,
            ..
        } = setup();
        let farmer_a = Address::generate(&env);
        let farmer_b = Address::generate(&env);

        // Fund two separate escrows with same proof hash
        client.deposit(&funder, &farmer_a, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer_a, &dummy_hash(&env, 1));

        let donor2 = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&donor2, &10_000);
        client.deposit(&donor2, &farmer_b, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer_b, &dummy_hash(&env, 1));
    }

    #[test]
    fn test_milestone_proof_different_hashes_allowed() {
        let Ctx {
            env,
            client,
            token,
            funder,
            arbiter,
            ..
        } = setup();
        let farmer_a = Address::generate(&env);
        let farmer_b = Address::generate(&env);

        client.deposit(&funder, &farmer_a, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer_a, &dummy_hash(&env, 1));

        let donor2 = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&donor2, &10_000);
        client.deposit(&donor2, &farmer_b, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer_b, &dummy_hash(&env, 2));

        assert_eq!(
            client.get_escrow(&farmer_b).unwrap().status,
            EscrowStatus::Milestone1Released
        );
    }

    #[test]
    #[should_panic(expected = "proof hash already used")]
    fn test_survival_proof_replay_across_escrows_rejected() {
        let Ctx {
            env,
            client,
            token,
            funder,
            arbiter,
            ..
        } = setup();
        let farmer_a = Address::generate(&env);
        let farmer_b = Address::generate(&env);

        client.deposit(&funder, &farmer_a, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer_a, &dummy_hash(&env, 1));

        let donor2 = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&donor2, &10_000);
        client.deposit(&donor2, &farmer_b, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer_b, &dummy_hash(&env, 2));

        env.ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);

        client.verify_survival(&farmer_a, &dummy_hash(&env, 3), &80);
        client.verify_survival(&farmer_b, &dummy_hash(&env, 3), &80);
    }

    #[test]
    #[should_panic(expected = "proof hash already used")]
    fn test_milestone_proof_replay_as_survival_rejected() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));

        env.ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);

        client.verify_survival(&farmer, &dummy_hash(&env, 1), &80);
    }

    // ── Init guard ────────────────────────────────────────────────────────────

    // ── Multi-party consensus tests (issue #635) ──────────────────────────────────

    #[test]
    fn test_verifier_registry_and_consensus_release() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();

        let v1 = Address::generate(&env);
        let v2 = Address::generate(&env);
        let v3 = Address::generate(&env);

        client.register_verifier(&v1);
        client.register_verifier(&v2);
        client.register_verifier(&v3);

        assert_eq!(client.get_verifiers().len(), 3);

        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);

        // First vote — not enough yet
        client.approve_milestone(&v1, &farmer, &1u32);
        assert_eq!(balance(&env, &token, &farmer), 0);
        assert_eq!(client.get_vote_count(&farmer, &1u32), 1);

        // Second vote — consensus reached, funds released automatically
        client.approve_milestone(&v2, &farmer, &1u32);
        assert_eq!(client.get_vote_count(&farmer, &1u32), 2);
        assert_eq!(balance(&env, &token, &farmer), 7_350);
    }

    #[test]
    #[should_panic]
    fn test_unregistered_verifier_cannot_vote() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        let rogue = Address::generate(&env);
        client.approve_milestone(&rogue, &farmer, &1u32);
    }

    #[test]
    #[should_panic]
    fn test_double_vote_rejected() {
        let Ctx {
            env,
            client,
            token,
            funder,
            farmer,
            arbiter,
            ..
        } = setup();
        let v1 = Address::generate(&env);
        client.register_verifier(&v1);
        client.deposit(&funder, &farmer, &token, &10_000, &arbiter);
        client.approve_milestone(&v1, &farmer, &1u32);
        client.approve_milestone(&v1, &farmer, &1u32); // should panic
    }
    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_initialize_twice_rejected() {
        
        let Ctx { env, client, .. } = setup();
        client.initialize(&Address::generate(&env), &Address::generate(&env), &Address::generate(&env), &Address::generate(&env));
    }
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowMilestoneError {
    VerifierAlreadyRegistered = 1,
    NotAVerifier = 2,
    AlreadyVoted = 3,
    MilestoneReleaseBlocked = 4,
}
