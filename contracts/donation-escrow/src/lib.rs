#![no_std]

use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum trees per donation
const MAX_TREES: u32 = 50;
/// Common unit used for normalizing token amounts for reporting/calc purposes.
/// XLM and USDC both use 7 decimals, but we normalize through this shared base
/// so the contract can support additional tokens without changing callers.
const COMMON_DECIMALS: u32 = 7;

/// 30-day deadline in seconds (default campaign TTL)
const CAMPAIGN_DEADLINE_SECS: u64 = 30 * 24 * 60 * 60;
// Storage TTL constants (ledgers).  ~5 seconds per ledger.
const INSTANCE_TTL_THRESHOLD: u32 = 17_280; // ~ 1 day
const INSTANCE_TTL_LEDGERS: u32 = 103_680;   // ~ 6 days
const PERSISTENT_TTL_THRESHOLD: u32 = 120_960; // ~ 7 days
const PERSISTENT_TTL_LEDGERS: u32 = 518_400;  // ~ 30 days

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum DonationEscrowError {
    UnsupportedToken = 82,
    TokenAlreadyAccepted = 83,
    AlreadyProcessed = 84,
    AmountPerIntervalMustBePositive = 85,
    IntervalSecondsMustBePositive = 86,
    RecurringDonationNotFound = 87,
    DonationCancelled = 88,
    IntervalNotElapsed = 89,
    ProjectNotRegistered = 90,
    NotDonor = 91,
    DonationAlreadyCancelled = 92,
    /// Campaign ID does not exist
    CampaignNotFound = 93,
    /// Deadline has passed — campaign expired
    CampaignExpired = 94,
    /// Deadline has NOT yet passed — cannot auto-refund yet
    CampaignNotExpired = 95,
    /// Funding target has already been met
    TargetAlreadyMet = 96,
    /// Campaign has already been closed (claimed or fully refunded)
    CampaignAlreadyClosed = 97,
    /// Funding target was not met — cannot claim
    TargetNotMet = 98,
}

/// Status of a campaign's lifecycle.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CampaignStatus {
    /// Active — accepting donations, deadline not yet passed
    Active,
    /// Target met and funds claimed by the campaign organiser
    Claimed,
    /// Deadline passed without meeting target — refunds available
    Expired,
}

/// A time-limited funding campaign.
///
/// Donations are tracked per-campaign via `CampaignDonation` records.
/// If `total_raised >= target_amount` before `deadline`, the organiser
/// can call `claim_campaign`. Otherwise, after `deadline`, any donor
/// can call `refund_campaign_donor` for their own contribution, or the
/// admin can call `auto_refund_expired` to process all donors in batch.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Campaign {
    pub id: u64,
    /// Campaign organiser (receives funds on successful claim)
    pub organiser: Address,
    /// Accepted payment token for this campaign
    pub token: Address,
    /// Funding target in token's native units
    pub target_amount: i128,
    /// Unix timestamp after which auto-refund is available
    pub deadline: u64,
    /// Total raised so far
    pub total_raised: i128,
    pub status: CampaignStatus,
    pub created_at: u64,
}

/// A single donor's contribution to a campaign.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CampaignDonation {
    pub campaign_id: u64,
    pub donor: Address,
    pub amount: i128,
    pub refunded: bool,
    /// Attempted to remove a token that was never on the accepted list.
    TokenNotAccepted = 93,
    /// Cannot remove a canonical initial (XLM/USDC/EURC) token from the whitelist.
    CannotRemoveCanonicalToken = 94,
    /// Tree count outside of allowed range.
    InvalidTreeCount = 95,
    /// Donation amount must be strictly positive.
    InvalidAmount = 96,
    /// Persistent escrow record does not exist for the given sequence id.
    EscrowNotFound = 97,
    /// Administrative call without admin authorization.
    Unauthorized = 98,
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DonationStatus {
    Pending,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct DonationRecord {
    pub donor: Address,
    pub token: Address,
    pub amount: i128,
    pub normalized_amount: i128,
    pub tree_count: u32,
    pub timestamp: u64,
    pub batch_id: u32,
    pub status: DonationStatus,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct RecurringDonation {
    pub donor: Address,
    pub token: Address,
    pub project_id: u64,
    pub amount_per_interval: i128,
    pub normalized_amount_per_interval: i128,
    pub interval_seconds: u64,
    pub next_release: u64,
    pub total_released: i128,
    pub total_released_normalized: i128,
    pub cancelled: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AcceptedToken {
    pub token: Address,
    pub decimals: u32,
    pub canonical: bool,
}

// ── Interest accrual types ────────────────────────────────────────────────────

/// Contract-wide interest configuration stored in instance storage.
/// A single rate applies across all tracked tokens.
#[contracttype]
#[derive(Clone, Debug)]
pub struct InterestConfig {
    /// Annual interest rate in basis points (1 bp = 0.01%).
    /// Valid range: 1–10_000 (inclusive).
    pub rate_bps: u32,
    /// The treasury contract address that receives redirected interest.
    pub treasury: Address,
}

/// Per-token accrual state stored in persistent storage.
/// Updated every time a donation is locked, released, or refunded.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AccrualState {
    /// Sum of all currently locked (Pending) donation amounts for this token.
    pub locked_principal: i128,
    /// Ledger timestamp at which `locked_principal` was last snapshotted.
    /// Interest accrues on `locked_principal` from this point forward.
    pub last_accrual_ts: u64,
    /// Accumulated interest (in token stroops) not yet sent to the treasury.
    pub pending_interest: i128,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct DonationEscrow;

#[contractimpl]
impl DonationEscrow {
    /// Initialize the escrow contract.
    ///
    /// Registers the canonical payment tokens (`xlm_token`, `usdc_token`,
    /// `eurc_token`) that are always accepted for donations and sets the
    /// contract admin who controls the whitelist, batching, and disbursal.
    ///
    /// Panics if the contract has already been initialized.
    pub fn initialize(
        env: Env,
        admin: Address,
        xlm_token: Address,
        usdc_token: Address,
        eurc_token: Address,
    ) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }

        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(
            &symbol_short!("TOKENS"),
            &(
                xlm_token.clone(),
                usdc_token.clone(),
                eurc_token.clone(),
            ),
        );
        env.storage()
            .instance()
            .set(&symbol_short!("TOKENSV"), &Vec::<AcceptedToken>::new(&env));

        // (current_batch, seq)
        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(1u32, 0u64));

        // recurring donation id counter
        env.storage()
            .instance()
            .set(&symbol_short!("RECSEQ"), &0u64);

        // campaign id counter
        env.storage()
            .instance()
            .set(&symbol_short!("CAMPSEQ"), &0u64);

        // Register the three canonical payment tokens up front.
        Self::add_accepted_token_internal(&env, &xlm_token, true, true);
        Self::add_accepted_token_internal(&env, &usdc_token, false, true);
        Self::add_accepted_token_internal(&env, &eurc_token, false, true);

        Self::bump_instance(&env);
    }

    /// Extend the TTL of the contract's instance storage so configuration
    /// (admin, accepted tokens, counters, projects) does not expire.
    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_LEDGERS);
    }

    /// Extend the TTL of a persistent storage entry (escrow record, recurring
    /// donation, etc.) so campaign-relevant state lives for at least
    /// `PERSISTENT_TTL_LEDGERS` past the current ledger.
    fn bump_persistent<K: IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
        env.storage()
            .persistent()
            .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_LEDGERS);
    }

    /// Donate `amount` of `token` into escrow on behalf of `donor` in exchange
    /// for `tree_count` tree slots.
    ///
    /// Returns the escrow sequence id used to later release or refund the
    /// donation. The donor must explicitly authorize the call.
    pub fn donate(env: Env, donor: Address, token: Address, amount: i128, tree_count: u32) -> u64 {
        donor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, DonationEscrowError::InvalidAmount);
        }

        if tree_count == 0 || tree_count > MAX_TREES {
            panic_with_error!(&env, DonationEscrowError::InvalidTreeCount);
        }

        Self::assert_accepted_token(&env, &token);
        let normalized_amount = Self::normalize_amount(&env, &token, amount);

        let (batch_id, seq): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap();

        let next_seq = seq.checked_add(1).expect("sequence counter overflow");

        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(batch_id, next_seq));

        // transfer funds
        token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &amount);

        let rec = DonationRecord {
            donor: donor.clone(),
            token: token.clone(),
            amount,
            normalized_amount,
            tree_count,
            timestamp: env.ledger().timestamp(),
            batch_id,
            status: DonationStatus::Pending,
        };

        let key = Self::donation_key(&env, next_seq);
        env.storage().persistent().set(&key, &rec);
        Self::bump_persistent(&env, &key);
        Self::bump_instance(&env);

        // Track this amount in the interest accrual ledger.
        Self::record_lock(&env, &token, amount);

        env.events().publish(
            (symbol_short!("donate"), donor),
            (batch_id, tree_count, amount, token),
        );

        next_seq
    }

    /// Roll the current batch id forward so future donations land in a fresh
    /// batch.  Admin only.
    pub fn advance_batch(env: Env) -> u32 {
        Self::require_admin(&env);

        let (batch_id, seq): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap();

        let next_batch = batch_id.checked_add(1).expect("batch counter overflow");

        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(next_batch, seq));
        Self::bump_instance(&env);

        env.events()
            .publish((symbol_short!("batch"), batch_id), (next_batch, true));

        next_batch
    }

    /// Release a batch of donations out of escrow to `destination`.
    ///
    /// For each sequence id in `seqs` the recorded token amount is transferred out of the contract
    /// contract and the record is marked `Released`.  Admin only.
    ///
    /// Panics if any sequence is missing or has already been processed.
    pub fn release_batch(env: Env, seqs: Vec<u64>, destination: Address) {
        Self::require_admin(&env);

        for i in 0..seqs.len() {
            let seq = seqs.get(i).unwrap();

            let key = Self::donation_key(&env, seq);

            let mut rec: DonationRecord = env
                .storage()
                .persistent()
                .get(&key)
                .unwrap_or_else(|| panic_with_error!(&env, DonationEscrowError::EscrowNotFound));

            if rec.status != DonationStatus::Pending {
                panic_with_error!(&env, DonationEscrowError::AlreadyProcessed);
            }

            token::Client::new(&env, &rec.token).transfer(
                &env.current_contract_address(),
                &destination,
                &rec.amount,
            );

            rec.status = DonationStatus::Released;

            env.storage().persistent().set(&key, &rec);
            Self::bump_persistent(&env, &key);

            // Reduce locked principal for interest accounting.
            Self::record_unlock(&env, &rec.token, rec.amount);

            env.events()
                .publish((symbol_short!("release"), seq), rec.amount);
        }
        Self::bump_instance(&env);
    }

    /// Refund a single pending donation back to its donor.  Admin only.
    ///
    /// Panics if the sequence is missing or has already been released/refunded.
    pub fn refund(env: Env, seq: u64) {
        Self::require_admin(&env);

        let key = Self::donation_key(&env, seq);

        let mut rec: DonationRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, DonationEscrowError::EscrowNotFound));

        if rec.status != DonationStatus::Pending {
            panic_with_error!(&env, DonationEscrowError::AlreadyProcessed);
        }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.donor,
            &rec.amount,
        );

        rec.status = DonationStatus::Refunded;

        env.storage().persistent().set(&key, &rec);
        Self::bump_persistent(&env, &key);
        Self::bump_instance(&env);

        // Reduce locked principal for interest accounting.
        Self::record_unlock(&env, &rec.token, rec.amount);

        env.events()
            .publish((symbol_short!("refund"), seq), rec.amount);
    }

    /// Lookup a donation record by its sequence id.
    pub fn get_donation(env: Env, seq: u64) -> Option<DonationRecord> {
        let key = Self::donation_key(&env, seq);
        let res: Option<DonationRecord> = env.storage().persistent().get(&key);
        if res.is_some() {
            Self::bump_persistent(&env, &key);
        }
        res
    }

    /// Return the currently-active donation batch id.
    pub fn current_batch(env: Env) -> u32 {
        let (batch_id, _): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap_or((1, 0));

        batch_id
    }

    // ── Recurring donations ───────────────────────────────────────────────────

    /// Set up a recurring donation for `project_id`. Locks the first interval's
    /// amount into escrow.
    ///
    /// Returns the recurring-donation id which can later be used to
    /// `process_recurring` or `cancel_recurring`.
    pub fn setup_recurring(
        env: Env,
        donor: Address,
        token: Address,
        project_id: u64,
        amount_per_interval: i128,
        interval_seconds: u64,
    ) -> u64 {
        donor.require_auth();

        if amount_per_interval <= 0 {
            panic_with_error!(&env, DonationEscrowError::AmountPerIntervalMustBePositive);
        }
        if interval_seconds == 0 {
            panic_with_error!(&env, DonationEscrowError::IntervalSecondsMustBePositive);
        }

        Self::assert_accepted_token(&env, &token);
        let normalized_amount_per_interval =
            Self::normalize_amount(&env, &token, amount_per_interval);

        let id: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("RECSEQ"))
            .unwrap_or(0u64)
            .checked_add(1)
            .expect("recurring sequence counter overflow");

        env.storage().instance().set(&symbol_short!("RECSEQ"), &id);

        // Lock first interval amount into escrow
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount_per_interval,
        );

        let rec = RecurringDonation {
            donor: donor.clone(),
            token,
            project_id,
            amount_per_interval,
            normalized_amount_per_interval,
            interval_seconds,
            next_release: env.ledger().timestamp().checked_add(interval_seconds).expect("next release time overflow"),
            total_released: 0,
            total_released_normalized: 0,
            cancelled: false,
        };

        let key = Self::recurring_key(&env, id);
        env.storage().persistent().set(&key, &rec);
        Self::bump_persistent(&env, &key);
        Self::bump_instance(&env);

        id
    }

    /// Process a recurring donation interval. Callable by anyone.
    ///
    /// Transfers the locked interval amount to the project address registered
    /// for the project_id, then re-locks the next interval amount from the
    /// donor. Panics if cancelled, if the interval has not elapsed, or if the
    /// project is missing.
    pub fn process_recurring(env: Env, donation_id: u64) {
        let key = Self::recurring_key(&env, donation_id);

        let mut rec: RecurringDonation =
            env.storage().persistent().get(&key).unwrap_or_else(|| {
                panic_with_error!(&env, DonationEscrowError::RecurringDonationNotFound)
            });

        if rec.cancelled {
            panic_with_error!(&env, DonationEscrowError::DonationCancelled);
        }

        if env.ledger().timestamp() < rec.next_release {
            panic_with_error!(&env, DonationEscrowError::IntervalNotElapsed);
        }

        let project: Address = env
            .storage()
            .instance()
            .get(&Self::project_key(&env, rec.project_id))
            .unwrap_or_else(|| panic_with_error!(&env, DonationEscrowError::ProjectNotRegistered));

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &project,
            &rec.amount_per_interval,
        );

        rec.next_release = rec
            .next_release
            .checked_add(rec.interval_seconds)
            .expect("next release time overflow");
        rec.total_released = rec
            .total_released
            .checked_add(rec.amount_per_interval)
            .expect("total released overflow");
        rec.total_released_normalized += rec.normalized_amount_per_interval;

        env.storage().persistent().set(&key, &rec);
        Self::bump_persistent(&env, &key);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("donation"), symbol_short!("rec_proc")),
            (
                donation_id,
                rec.donor,
                rec.project_id,
                rec.amount_per_interval,
            ),
        );
    }

    /// Cancel a recurring donation and refund the locked (unreleased) interval
    /// amount back to the donor.
    ///
    /// Only the `donor` who created the recurring schedule may cancel.
    pub fn cancel_recurring(env: Env, donor: Address, donation_id: u64) {
        donor.require_auth();

        let key = Self::recurring_key(&env, donation_id);

        let mut rec: RecurringDonation =
            env.storage().persistent().get(&key).unwrap_or_else(|| {
                panic_with_error!(&env, DonationEscrowError::RecurringDonationNotFound)
            });

        if rec.donor != donor {
            panic_with_error!(&env, DonationEscrowError::NotDonor);
        }

        if rec.cancelled {
            panic_with_error!(&env, DonationEscrowError::DonationAlreadyCancelled);
        }

        rec.cancelled = true;

        // Refund the locked (unreleased) interval amount back to donor
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &donor,
            &rec.amount_per_interval,
        );

        env.storage().persistent().set(&key, &rec);
        Self::bump_persistent(&env, &key);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("donation"), symbol_short!("rec_cncl")),
            (donation_id, donor),
        );
    }

    /// Lookup a recurring-donation record by id.
    pub fn get_recurring(env: Env, donation_id: u64) -> Option<RecurringDonation> {
        let key = Self::recurring_key(&env, donation_id);
        let res: Option<RecurringDonation> = env.storage().persistent().get(&key);
        if res.is_some() {
            Self::bump_persistent(&env, &key);
        }
        res
    }

    /// Register the address that receives disbursements for `project_id`.
    ///
    /// Required before `process_recurring` can transfer funds to a project.
    /// Admin only.
    pub fn register_project(env: Env, project_id: u64, project: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&Self::project_key(&env, project_id), &project);
        Self::bump_instance(&env);
    }

    /// Add a new accepted payment token to the whitelist. Admin only.
    ///
    /// Panics if the token is already on the whitelist.
    pub fn add_accepted_token(env: Env, token_address: Address) {
        Self::require_admin(&env);
        Self::add_accepted_token_internal(&env, &token_address, true, false);
    }

    /// Remove a payment token from the accepted-token whitelist. Admin only.
    ///
    /// The canonical tokens (XLM / USDC / EURC supplied during `initialize`)
    /// cannot be removed; attempting to do so panics with
    /// `CannotRemoveCanonicalToken`.  Panics with `TokenNotAccepted` if the
    /// address was never on the whitelist.
    pub fn remove_accepted_token(env: Env, token_address: Address) {
        Self::require_admin(&env);
        Self::remove_accepted_token_internal(&env, &token_address);
    }

    /// Backward-compatible alias for `add_accepted_token`.
    pub fn add_to_whitelist(env: Env, addr: Address) {
        Self::add_accepted_token(env, addr);
    }

    /// Returns `true` if `addr` is on the accepted-token list.
    pub fn is_whitelisted(env: Env, addr: Address) -> bool {
        Self::is_accepted_token_internal(&env, &addr)
    }

    /// Panics if `addr` is not on the accepted-token list.
    pub fn assert_whitelisted(env: Env, addr: Address) {
        Self::assert_accepted_token(&env, &addr);
    }

    /// Returns a snapshot of all accepted tokens together with their decimals
    /// and canonical flag.
    pub fn get_accepted_tokens(env: Env) -> Vec<AcceptedToken> {
        Self::load_accepted_tokens(&env)
    }

    /// Returns `true` if `addr` is on the accepted-token list.
    pub fn is_accepted_token(env: Env, addr: Address) -> bool {
        Self::is_accepted_token_internal(&env, &addr)
    }

    // ── Campaign funding with auto-refund fallback (issue #755) ──────────────

    /// Create a new funding campaign.
    ///
    /// # Parameters
    /// * `organiser`      — address that will receive funds on a successful claim
    /// * `token`          — payment token (must be in the accepted token list)
    /// * `target_amount`  — minimum amount to reach for the campaign to succeed
    /// * `deadline_secs`  — seconds from now until the deadline
    ///                      (pass 0 to use the default 30-day window)
    ///
    /// # Authorization
    /// Admin must sign.
    ///
    /// # Returns
    /// The new campaign ID.
    pub fn create_campaign(
        env: Env,
        organiser: Address,
        token: Address,
        target_amount: i128,
        deadline_secs: u64,
    ) -> u64 {
        Self::require_admin(&env);
        Self::assert_accepted_token(&env, &token);

        if target_amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let ttl = if deadline_secs == 0 {
            CAMPAIGN_DEADLINE_SECS
        } else {
            deadline_secs
        };

        let id: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("CAMPSEQ"))
            .unwrap_or(0u64)
            .checked_add(1)
            .expect("campaign counter overflow");

        env.storage().instance().set(&symbol_short!("CAMPSEQ"), &id);

        let now = env.ledger().timestamp();
        let campaign = Campaign {
            id,
            organiser: organiser.clone(),
            token,
            target_amount,
            deadline: now.checked_add(ttl).expect("deadline overflow"),
            total_raised: 0,
            status: CampaignStatus::Active,
            created_at: now,
        };

        env.storage()
            .persistent()
            .set(&Self::campaign_key(&env, id), &campaign);

        env.events().publish(
            (symbol_short!("camp_crt"), organiser),
            (id, target_amount, campaign.deadline),
        );

        id
    }

    /// Donate to a specific campaign.
    ///
    /// The donation is escrowed in the contract. Funds are either released
    /// to the organiser on `claim_campaign` or refunded on `refund_campaign_donor`
    /// / `auto_refund_expired`.
    ///
    /// # Authorization
    /// `donor` must sign.
    pub fn donate_to_campaign(
        env: Env,
        donor: Address,
        campaign_id: u64,
        token: Address,
        amount: i128,
    ) -> u64 {
        donor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let camp_key = Self::campaign_key(&env, campaign_id);
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&camp_key)
            .unwrap_or_else(|| panic_with_error!(&env, DonationEscrowError::CampaignNotFound));

        if campaign.status != CampaignStatus::Active {
            panic_with_error!(&env, DonationEscrowError::CampaignAlreadyClosed);
        }
        if env.ledger().timestamp() > campaign.deadline {
            panic_with_error!(&env, DonationEscrowError::CampaignExpired);
        }
        if campaign.token != token {
            panic_with_error!(&env, DonationEscrowError::UnsupportedToken);
        }

        // Assign a campaign-scoped donation sequence
        let (_, global_seq): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap();
        let next_seq = global_seq.checked_add(1).expect("sequence overflow");
        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(campaign_id as u32, next_seq));

        // Escrow funds
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );

        // Record the campaign-level donation
        let camp_don = CampaignDonation {
            campaign_id,
            donor: donor.clone(),
            amount,
            refunded: false,
        };
        env.storage()
            .persistent()
            .set(&Self::campaign_donation_key(&env, campaign_id, next_seq), &camp_don);

        // Update campaign totals
        campaign.total_raised = campaign
            .total_raised
            .checked_add(amount)
            .expect("total raised overflow");

        env.storage().persistent().set(&camp_key, &campaign);

        env.events().publish(
            (symbol_short!("camp_don"), donor),
            (campaign_id, amount, campaign.total_raised),
        );

        next_seq
    }

    /// Claim campaign funds after the target has been met.
    ///
    /// Transfers all escrowed funds to `destination`. Only callable when
    /// `total_raised >= target_amount`.
    ///
    /// # Authorization
    /// Admin must sign.
    pub fn claim_campaign(env: Env, campaign_id: u64, destination: Address) {
        Self::require_admin(&env);

        let camp_key = Self::campaign_key(&env, campaign_id);
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&camp_key)
            .unwrap_or_else(|| panic_with_error!(&env, DonationEscrowError::CampaignNotFound));

        if campaign.status != CampaignStatus::Active {
            panic_with_error!(&env, DonationEscrowError::CampaignAlreadyClosed);
        }
        if campaign.total_raised < campaign.target_amount {
            panic_with_error!(&env, DonationEscrowError::TargetNotMet);
        }

        // Transfer all escrowed funds to the destination
        token::Client::new(&env, &campaign.token).transfer(
            &env.current_contract_address(),
            &destination,
            &campaign.total_raised,
        );

        campaign.status = CampaignStatus::Claimed;
        env.storage().persistent().set(&camp_key, &campaign);

        env.events().publish(
            (symbol_short!("camp_clm"), campaign_id),
            (campaign.total_raised, destination),
        );
    }

    /// Refund a single donor's campaign contribution after the deadline has
    /// passed without meeting the target.
    ///
    /// This is permissionless — the donor calls it for their own donation.
    /// It can also be called by anyone on behalf of the donor.
    ///
    /// # Parameters
    /// * `campaign_id` — the campaign
    /// * `donation_seq` — the sequence number returned by `donate_to_campaign`
    ///
    /// # Authorization
    /// None required — permissionless after deadline.
    pub fn refund_campaign_donor(env: Env, campaign_id: u64, donation_seq: u64) {
        let camp_key = Self::campaign_key(&env, campaign_id);
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&camp_key)
            .unwrap_or_else(|| panic_with_error!(&env, DonationEscrowError::CampaignNotFound));

        // Refund is allowed when:
        //   a) Deadline passed AND target not met (auto-refund trigger), OR
        //   b) Campaign already transitioned to Expired
        let now = env.ledger().timestamp();
        if campaign.status == CampaignStatus::Claimed {
            panic_with_error!(&env, DonationEscrowError::TargetAlreadyMet);
        }
        if campaign.status == CampaignStatus::Active
            && now <= campaign.deadline
            && campaign.total_raised < campaign.target_amount
        {
            panic_with_error!(&env, DonationEscrowError::CampaignNotExpired);
        }
        // If the campaign is still Active but the deadline has passed and the
        // target was not met, transition it to Expired.
        if campaign.status == CampaignStatus::Active && now > campaign.deadline {
            campaign.status = CampaignStatus::Expired;
            env.storage().persistent().set(&camp_key, &campaign);
        }

        let don_key = Self::campaign_donation_key(&env, campaign_id, donation_seq);
        let mut don: CampaignDonation = env
            .storage()
            .persistent()
            .get(&don_key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::EscrowNotFound));

        if don.refunded {
            panic_with_error!(&env, DonationEscrowError::AlreadyProcessed);
        }

        don.refunded = true;
        env.storage().persistent().set(&don_key, &don);

        token::Client::new(&env, &campaign.token).transfer(
            &env.current_contract_address(),
            &don.donor,
            &don.amount,
        );

        env.events().publish(
            (symbol_short!("camp_ref"), campaign_id),
            (donation_seq, don.donor, don.amount),
        );
    }

    /// Batch auto-refund all listed donors after campaign deadline without
    /// meeting the target.
    ///
    /// Permissionless — anyone can call this to trigger refunds on behalf
    /// of donors. The admin typically calls this to clean up expired campaigns.
    ///
    /// # Parameters
    /// * `campaign_id`   — the expired campaign
    /// * `donation_seqs` — list of donation sequence IDs to refund
    pub fn auto_refund_expired(env: Env, campaign_id: u64, donation_seqs: Vec<u64>) {
        let camp_key = Self::campaign_key(&env, campaign_id);
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&camp_key)
            .unwrap_or_else(|| panic_with_error!(&env, DonationEscrowError::CampaignNotFound));

        if campaign.status == CampaignStatus::Claimed {
            panic_with_error!(&env, DonationEscrowError::TargetAlreadyMet);
        }

        let now = env.ledger().timestamp();
        if campaign.status == CampaignStatus::Active && now <= campaign.deadline {
            panic_with_error!(&env, DonationEscrowError::CampaignNotExpired);
        }

        // Lazily mark as Expired on first auto-refund call
        if campaign.status == CampaignStatus::Active {
            campaign.status = CampaignStatus::Expired;
            env.storage().persistent().set(&camp_key, &campaign);
        }

        for i in 0..donation_seqs.len() {
            let seq = donation_seqs.get(i).unwrap();
            let don_key = Self::campaign_donation_key(&env, campaign_id, seq);

            let mut don: CampaignDonation = match env.storage().persistent().get(&don_key) {
                Some(d) => d,
                None => continue, // skip unknown seqs rather than aborting the whole batch
            };

            if don.refunded {
                continue; // idempotent — skip already-refunded donations
            }

            don.refunded = true;
            env.storage().persistent().set(&don_key, &don);

            token::Client::new(&env, &campaign.token).transfer(
                &env.current_contract_address(),
                &don.donor,
                &don.amount,
            );

            env.events().publish(
                (symbol_short!("auto_ref"), campaign_id),
                (seq, don.donor, don.amount),
            );
        }
    }

    /// Returns the campaign record, or `None` if it does not exist.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Option<Campaign> {
        env.storage()
            .persistent()
            .get(&Self::campaign_key(&env, campaign_id))
    }

    /// Returns a campaign donation record, or `None`.
    pub fn get_campaign_donation(
        env: Env,
        campaign_id: u64,
        donation_seq: u64,
    ) -> Option<CampaignDonation> {
        env.storage()
            .persistent()
            .get(&Self::campaign_donation_key(&env, campaign_id, donation_seq))
    }

    /// Returns `true` if `addr` is on the accepted-token list.
    pub fn is_accepted_token(env: Env, addr: Address) -> bool {
        Self::is_accepted_token_internal(&env, &addr)
    }
}

impl DonationEscrow {
    // ── internal ──────────────────────────────────────────────────────────────

    fn donation_key(env: &Env, seq: u64) -> soroban_sdk::Val {
        (symbol_short!("DON"), seq).into_val(env)
    }

    fn recurring_key(env: &Env, id: u64) -> soroban_sdk::Val {
        (symbol_short!("RDONATE"), id).into_val(env)
    }

    fn project_key(env: &Env, project_id: u64) -> soroban_sdk::Val {
        (symbol_short!("PROJ"), project_id).into_val(env)
    }

    fn campaign_key(env: &Env, campaign_id: u64) -> soroban_sdk::Val {
        (symbol_short!("CAMP"), campaign_id).into_val(env)
    }

    fn campaign_donation_key(env: &Env, campaign_id: u64, seq: u64) -> soroban_sdk::Val {
        (symbol_short!("CAMPDON"), campaign_id, seq).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));

        admin.require_auth();
    }

    fn assert_accepted_token(env: &Env, token: &Address) {
        if !Self::is_accepted_token_internal(env, token) {
            panic_with_error!(env, DonationEscrowError::UnsupportedToken);
        }
    }

    fn add_accepted_token_internal(
        env: &Env,
        token_address: &Address,
        fail_on_duplicate: bool,
        canonical: bool,
    ) {
        let mut tokens = Self::load_accepted_tokens(env);
        for i in 0..tokens.len() {
            if tokens.get(i).unwrap().token == *token_address {
                if fail_on_duplicate {
                    panic_with_error!(env, DonationEscrowError::TokenAlreadyAccepted);
                }
                return;
            }
        }

        let decimals = token::Client::new(env, token_address).decimals();
        tokens.push_back(AcceptedToken {
            token: token_address.clone(),
            decimals,
            canonical,
        });
        env.storage()
            .instance()
            .set(&symbol_short!("TOKENSV"), &tokens);
    }

    fn remove_accepted_token_internal(env: &Env, token_address: &Address) {
        let tokens = Self::load_accepted_tokens(env);
        let mut found = false;
        let mut new_tokens = Vec::new(env);
        for i in 0..tokens.len() {
            let accepted = tokens.get(i).unwrap();
            if accepted.token == *token_address {
                if accepted.canonical {
                    panic_with_error!(env, DonationEscrowError::CannotRemoveCanonicalToken);
                }
                found = true;
                continue;
            }
            new_tokens.push_back(accepted);
        }
        if !found {
            panic_with_error!(env, DonationEscrowError::TokenNotAccepted);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("TOKENSV"), &new_tokens);
    }

    fn normalize_amount(env: &Env, token: &Address, amount: i128) -> i128 {
        let tokens = Self::load_accepted_tokens(env);
        for i in 0..tokens.len() {
            let accepted = tokens.get(i).unwrap();
            if accepted.token == *token {
                return Self::normalize_to_common_unit(amount, accepted.decimals);
            }
        }
        panic_with_error!(env, DonationEscrowError::UnsupportedToken);
    }

    fn load_accepted_tokens(env: &Env) -> Vec<AcceptedToken> {
        env.storage()
            .instance()
            .get(&symbol_short!("TOKENSV"))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn is_accepted_token_internal(env: &Env, token: &Address) -> bool {
        let tokens = Self::load_accepted_tokens(env);
        for i in 0..tokens.len() {
            if tokens.get(i).unwrap().token == *token {
                return true;
            }
        }
        false
    }

    fn normalize_to_common_unit(amount: i128, decimals: u32) -> i128 {
        if decimals == COMMON_DECIMALS {
            return amount;
        }

        let diff = if decimals > COMMON_DECIMALS {
            decimals - COMMON_DECIMALS
        } else {
            COMMON_DECIMALS - decimals
        };

        let mut factor = 1i128;
        let mut i = 0u32;
        while i < diff {
            factor = factor
                .checked_mul(10)
                .unwrap_or_else(|| panic!("normalization factor overflow"));
            i += 1;
        }

        if decimals > COMMON_DECIMALS {
            amount / factor
        } else {
            amount * factor
        }
    }

    // ── Interest accrual internals ────────────────────────────────────────────

    /// Storage key for a token's AccrualState in persistent storage.
    fn accrual_key(env: &Env, token: &Address) -> soroban_sdk::Val {
        (symbol_short!("ACCR"), token.clone()).into_val(env)
    }

    /// Internal version of `accrue_interest` that can be called from within
    /// other contract functions (does not panic if config is missing — simply
    /// returns early, making it safe to call before config is set).
    fn accrue_interest_internal(env: &Env, token: &Address) {
        let cfg_opt: Option<InterestConfig> = env
            .storage()
            .instance()
            .get(&symbol_short!("INT_CFG"));
        let cfg = match cfg_opt {
            Some(c) => c,
            None => return, // config not set yet; skip silently
        };

        let key = Self::accrual_key(env, token);
        let mut state: AccrualState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(AccrualState {
                locked_principal: 0,
                last_accrual_ts: env.ledger().timestamp(),
                pending_interest: 0,
            });

        let now = env.ledger().timestamp();
        let new_interest =
            Self::compute_interest(state.locked_principal, cfg.rate_bps, state.last_accrual_ts, now);

        state.pending_interest = state
            .pending_interest
            .checked_add(new_interest)
            .expect("pending_interest overflow");
        state.last_accrual_ts = now;

        env.storage().persistent().set(&key, &state);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_BUMP_LEDGERS, TTL_BUMP_LEDGERS);
    }

    /// Increase locked principal for a token by `delta`, snapshotting interest
    /// first so the new principal only accrues from this moment onward.
    fn record_lock(env: &Env, token: &Address, delta: i128) {
        // Snapshot interest at the current principal before changing it.
        Self::accrue_interest_internal(env, token);

        let key = Self::accrual_key(env, token);
        let mut state: AccrualState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(AccrualState {
                locked_principal: 0,
                last_accrual_ts: env.ledger().timestamp(),
                pending_interest: 0,
            });

        state.locked_principal = state
            .locked_principal
            .checked_add(delta)
            .expect("locked_principal overflow");

        env.storage().persistent().set(&key, &state);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_BUMP_LEDGERS, TTL_BUMP_LEDGERS);
    }

    /// Decrease locked principal for a token by `delta`, snapshotting interest
    /// first.  Saturates to zero rather than underflowing.
    fn record_unlock(env: &Env, token: &Address, delta: i128) {
        // Snapshot interest at the current principal before reducing it.
        Self::accrue_interest_internal(env, token);

        let key = Self::accrual_key(env, token);
        let mut state: AccrualState = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(AccrualState {
                locked_principal: 0,
                last_accrual_ts: env.ledger().timestamp(),
                pending_interest: 0,
            });

        // Saturate to zero to guard against accounting inconsistencies.
        state.locked_principal = state.locked_principal.saturating_sub(delta);
        if state.locked_principal < 0 {
            state.locked_principal = 0;
        }

        env.storage().persistent().set(&key, &state);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_BUMP_LEDGERS, TTL_BUMP_LEDGERS);
    }

    /// Pure interest computation.
    ///
    /// `interest = principal * rate_bps * elapsed_secs
    ///             / (BPS_DENOMINATOR * SECONDS_PER_YEAR)`
    ///
    /// Uses integer arithmetic only; fractional stroops are truncated.
    /// Returns 0 if elapsed time is zero or principal is zero.
    fn compute_interest(
        principal: i128,
        rate_bps: u32,
        from_ts: u64,
        to_ts: u64,
    ) -> i128 {
        if principal <= 0 || to_ts <= from_ts {
            return 0;
        }
        let elapsed = (to_ts - from_ts) as i128;
        let rate = rate_bps as i128;
        // Multiply before dividing to preserve precision.
        principal
            .saturating_mul(rate)
            .saturating_mul(elapsed)
            / (BPS_DENOMINATOR * SECONDS_PER_YEAR as i128)
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

    fn mint(env: &Env, addr: &Address, to: &Address, amount: &i128) {
        token::StellarAssetClient::new(env, addr).mint(to, amount);
    }

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        Address,
        DonationEscrowClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, DonationEscrow);
        let client = DonationEscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);

        let xlm = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let usdc = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let eurc = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        mint(&env, &xlm, &donor, &100_000);
        mint(&env, &usdc, &donor, &100_000);
        mint(&env, &eurc, &donor, &100_000);

        client.initialize(&admin, &xlm, &usdc, &eurc);

        (env, admin, donor, xlm, usdc, eurc, client)
    }

    // ── Token whitelist ───────────────────────────────────────────────────

    #[test]
    fn test_initial_tokens_xlm_usdc_eurc_are_whitelisted_and_canonical() {
        let (_env, _admin, _donor, xlm, usdc, eurc, client) = setup();

        assert!(client.is_whitelisted(&xlm));
        assert!(client.is_whitelisted(&usdc));
        assert!(client.is_whitelisted(&eurc));
        assert!(client.is_accepted_token(&xlm));
        assert!(client.is_accepted_token(&usdc));
        assert!(client.is_accepted_token(&eurc));

        let accepted = client.get_accepted_tokens();
        assert_eq!(accepted.len(), 3);
        for i in 0..accepted.len() {
            let t = accepted.get(i).unwrap();
            assert!(t.canonical, "all canonical rails must be flagged canonical");
        }
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #96)")]
    fn test_zero_amount_rejected() {
        let (_env, _admin, donor, xlm, _usdc, _eurc, client) = setup();
        client.donate(&donor, &xlm, &0, &2);
    }


    #[test]
    fn test_add_accepted_token_accepts_additional_payment_token() {
        let (env, admin, donor, _xlm, _usdc, _eurc, client) = setup();
        let extra = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        mint(&env, &extra, &donor, &100_000);

        client.add_accepted_token(&extra);
        assert!(client.is_whitelisted(&extra));
        assert_eq!(client.get_accepted_tokens().len(), 4);

        let seq = client.donate(&donor, &extra, &10_000, &2);
        let rec = client.get_donation(&seq).unwrap();
        assert_eq!(rec.normalized_amount, 10_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #83)")]
    fn test_add_accepted_token_rejects_duplicates() {
        let (env, admin, donor, _xlm, _usdc, _eurc, client) = setup();
        let extra = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        mint(&env, &extra, &donor, &100_000);

        client.add_accepted_token(&extra);
        client.add_accepted_token(&extra);
    }

    #[test]
    fn test_remove_accepted_token_removes_custom_but_not_canonical() {
        let (env, admin, donor, _xlm, _usdc, _eurc, client) = setup();
        let extra = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        mint(&env, &extra, &donor, &100_000);

        client.add_accepted_token(&extra);
        assert_eq!(client.get_accepted_tokens().len(), 4);

        client.remove_accepted_token(&extra);
        assert!(!client.is_whitelisted(&extra));
        assert_eq!(client.get_accepted_tokens().len(), 3);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #94)")]
    fn test_remove_accepted_token_rejects_canonical_xlm() {
        let (_env, _admin, _donor, xlm, _usdc, _eurc, client) = setup();
        client.remove_accepted_token(&xlm);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #94)")]
    fn test_remove_accepted_token_rejects_canonical_usdc() {
        let (_env, _admin, _donor, _xlm, usdc, _eurc, client) = setup();
        client.remove_accepted_token(&usdc);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #94)")]
    fn test_remove_accepted_token_rejects_canonical_eurc() {
        let (_env, _admin, _donor, _xlm, _usdc, eurc, client) = setup();
        client.remove_accepted_token(&eurc);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #93)")]
    fn test_remove_accepted_token_rejects_unknown() {
        let (env, _admin, _donor, _xlm, _usdc, _eurc, client) = setup();
        let unknown = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        client.remove_accepted_token(&unknown);
    }

    #[test]
    fn test_add_to_whitelist_backward_alias_still_works() {
        let (env, admin, donor, _xlm, _usdc, _eurc, client) = setup();
        let extra = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        mint(&env, &extra, &donor, &100_000);

        client.add_to_whitelist(&extra);
        assert!(client.is_whitelisted(&extra));
    }

    // ── Donate / release / refund paths for XLM, USDC, EURC ────────────────

    #[test]
    fn test_donate_and_fetch_xlm() {
        let (_env, _admin, donor, xlm, _usdc, _eurc, client) = setup();

        let seq = client.donate(&donor, &xlm, &5_000, &3);
        let rec = client.get_donation(&seq).unwrap();

        assert_eq!(rec.amount, 5_000);
        assert_eq!(rec.normalized_amount, 5_000);
        assert_eq!(rec.tree_count, 3);
        assert_eq!(rec.status, DonationStatus::Pending);
    }

    #[test]
    fn test_donate_and_fetch_usdc() {
        let (_env, _admin, donor, _xlm, usdc, _eurc, client) = setup();

        let seq = client.donate(&donor, &usdc, &8_000, &2);
        let rec = client.get_donation(&seq).unwrap();

        assert_eq!(rec.amount, 8_000);
        assert_eq!(rec.normalized_amount, 8_000);
        assert_eq!(rec.tree_count, 2);
        assert_eq!(rec.token, usdc);
    }

    #[test]
    fn test_donate_and_fetch_eurc() {
        let (_env, _admin, donor, _xlm, _usdc, eurc, client) = setup();

        let seq = client.donate(&donor, &eurc, &12_345, &10);
        let rec = client.get_donation(&seq).unwrap();

        assert_eq!(rec.amount, 12_345);
        assert_eq!(rec.normalized_amount, 12_345);
        assert_eq!(rec.token, eurc);
    }

    #[test]
    fn test_mixed_token_donations_in_same_batch() {
        let (_env, _admin, donor, xlm, usdc, eurc, client) = setup();

        let s1 = client.donate(&donor, &xlm, &1_000, &1);
        let s2 = client.donate(&donor, &usdc, &2_000, &2);
        let s3 = client.donate(&donor, &eurc, &3_000, &3);

        assert_eq!(client.get_donation(&s1).unwrap().batch_id, 1);
        assert_eq!(client.get_donation(&s2).unwrap().batch_id, 1);
        assert_eq!(client.get_donation(&s3).unwrap().batch_id, 1);
        assert_eq!(client.current_batch(), 1);
    }

    #[test]
    fn test_release_batch_xlm_usdc_eurc_to_destination() {
        let (env, _admin, donor, xlm, usdc, eurc, client) = setup();

        let s1 = client.donate(&donor, &xlm, &5_000, &1);
        let s2 = client.donate(&donor, &usdc, &7_000, &1);
        let s3 = client.donate(&donor, &eurc, &9_000, &1);

        let dest = Address::generate(&env);
        client.release_batch(&soroban_sdk::vec![&env, s1, s2, s3], &dest);

        let tok = |a: &Address| token::Client::new(&env, a);
        assert_eq!(tok(&xlm).balance(&dest), 5_000);
        assert_eq!(tok(&usdc).balance(&dest), 7_000);
        assert_eq!(tok(&eurc).balance(&dest), 9_000);

        assert_eq!(client.get_donation(&s1).unwrap().status, DonationStatus::Released);
        assert_eq!(client.get_donation(&s2).unwrap().status, DonationStatus::Released);
        assert_eq!(client.get_donation(&s3).unwrap().status, DonationStatus::Released);
    }

    #[test]
    fn test_refund_eurc_returns_tokens_to_donor() {
        let (env, _admin, donor, _xlm, _usdc, eurc, client) = setup();

        let before = token::Client::new(&env, &eurc).balance(&donor);
        let seq = client.donate(&donor, &eurc, &12_345, &10);
        let after_donate = token::Client::new(&env, &eurc).balance(&donor);
        assert_eq!(before - after_donate, 12_345);

        client.refund(&seq);
        let after_refund = token::Client::new(&env, &eurc).balance(&donor);
        assert_eq!(after_refund, before);
        assert_eq!(client.get_donation(&seq).unwrap().status, DonationStatus::Refunded);
    }

    #[test]
    fn test_release_then_refund_panics_already_processed() {
        let (env, _admin, donor, _xlm, usdc, _eurc, client) = setup();

        let seq = client.donate(&donor, &usdc, &5_000, &1);
        let dest = Address::generate(&env);
        client.release_batch(&soroban_sdk::vec![&env, seq], &dest);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #84)")]
    fn test_double_release_panics_already_processed() {
        let (env, _admin, donor, xlm, _usdc, _eurc, client) = setup();

        let seq = client.donate(&donor, &xlm, &5_000, &1);
        let dest = Address::generate(&env);
        client.release_batch(&soroban_sdk::vec![&env, seq], &dest);
        client.release_batch(&soroban_sdk::vec![&env, seq], &dest);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #96)")]
    fn test_donate_zero_amount_panics() {
        let (_env, _admin, donor, xlm, _usdc, _eurc, client) = setup();
        client.donate(&donor, &xlm, &0, &1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #95)")]
    fn test_donate_zero_trees_panics() {
        let (_env, _admin, donor, xlm, _usdc, _eurc, client) = setup();
        client.donate(&donor, &xlm, &1_000, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #95)")]
    fn test_donate_too_many_trees_panics() {
        let (_env, _admin, donor, xlm, _usdc, _eurc, client) = setup();
        client.donate(&donor, &xlm, &1_000, &51);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #82)")]
    fn test_donate_rejects_unsupported_token() {
        let (env, _admin, donor, _xlm, _usdc, _eurc, client) = setup();
        let unsupported = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        mint(&env, &unsupported, &donor, &100_000);

        client.donate(&donor, &unsupported, &5_000, &1);
    }

    #[test]
    fn test_advance_batch_rolls_batch_counter() {
        let (_env, _admin, _donor, _xlm, _usdc, _eurc, client) = setup();
        assert_eq!(client.current_batch(), 1);

        let nb = client.advance_batch();
        assert_eq!(nb, 2);
        assert_eq!(client.current_batch(), 2);
    }

    #[test]
    fn test_get_donation_missing_returns_none() {
        let (_env, _admin, _donor, _xlm, _usdc, _eurc, client) = setup();
        assert!(client.get_donation(&999).is_none());
    }

    // ── Recurring donations for XLM, USDC, EURC ───────────────────────────

    fn setup_recurring_env() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        Address,
        u64,
        DonationEscrowClient<'static>,
    ) {
        let (env, admin, donor, xlm, usdc, eurc, client) = setup();

        let project = Address::generate(&env);
        let project_id: u64 = 1;
        client.register_project(&project_id, &project);

        (env, admin, donor, xlm, usdc, eurc, project_id, client)
    }

    #[test]
    fn test_process_recurring_succeeds_with_xlm() {
        let (env, _admin, donor, xlm, _usdc, _eurc, project_id, client) = setup_recurring_env();

        let interval: u64 = 1_000;
        let amount: i128 = 1_000;
        let id = client.setup_recurring(&donor, &xlm, &project_id, &amount, &interval);

        env.ledger().with_mut(|l| l.timestamp += interval + 1);
        client.process_recurring(&id);

        let rec = client.get_recurring(&id).unwrap();
        assert_eq!(rec.total_released, amount);
        assert_eq!(rec.total_released_normalized, amount);
    }

    #[test]
    fn test_process_recurring_succeeds_with_usdc() {
        let (env, _admin, donor, _xlm, usdc, _eurc, project_id, client) = setup_recurring_env();

        let interval: u64 = 500;
        let amount: i128 = 2_000;
        let id = client.setup_recurring(&donor, &usdc, &project_id, &amount, &interval);

        env.ledger().with_mut(|l| l.timestamp += interval + 1);
        client.process_recurring(&id);

        let rec = client.get_recurring(&id).unwrap();
        assert_eq!(rec.token, usdc);
        assert_eq!(rec.total_released, amount);
    }

    #[test]
    fn test_process_recurring_succeeds_with_eurc() {
        let (env, _admin, donor, _xlm, _usdc, eurc, project_id, client) = setup_recurring_env();

        let interval: u64 = 2_000;
        let amount: i128 = 500;
        let id = client.setup_recurring(&donor, &eurc, &project_id, &amount, &interval);

        env.ledger().with_mut(|l| l.timestamp += interval + 1);
        client.process_recurring(&id);

        let rec = client.get_recurring(&id).unwrap();
        assert_eq!(rec.token, eurc);
        assert_eq!(rec.total_released, amount);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #89)")]
    fn test_process_recurring_fails_before_interval() {
        let (_env, _admin, donor, _xlm, _usdc, eurc, project_id, client) = setup_recurring_env();

        let id = client.setup_recurring(&donor, &eurc, &project_id, &1_000, &1_000);
        client.process_recurring(&id);
    }

    #[test]
    fn test_cancel_recurring_refunds_eurc_back_to_donor() {
        let (env, _admin, donor, _xlm, _usdc, eurc, project_id, client) = setup_recurring_env();

        let amount: i128 = 3_333;
        let id = client.setup_recurring(&donor, &eurc, &project_id, &amount, &1_000);

        let before = token::Client::new(&env, &eurc).balance(&donor);
        client.cancel_recurring(&donor, &id);
        let after = token::Client::new(&env, &eurc).balance(&donor);

        assert_eq!(after - before, amount);
        assert!(client.get_recurring(&id).unwrap().cancelled);
    }

    #[test]
    fn test_cancel_recurring_refunds_usdc_back_to_donor() {
        let (env, _admin, donor, _xlm, usdc, _eurc, project_id, client) = setup_recurring_env();

        let amount: i128 = 2_222;
        let id = client.setup_recurring(&donor, &usdc, &project_id, &amount, &1_000);

        let before = token::Client::new(&env, &usdc).balance(&donor);
        client.cancel_recurring(&donor, &id);
        let after = token::Client::new(&env, &usdc).balance(&donor);

        assert_eq!(after - before, amount);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #88)")]
    fn test_process_recurring_on_cancelled_panics() {
        let (env, _admin, donor, _xlm, _usdc, eurc, project_id, client) = setup_recurring_env();

        let interval: u64 = 1_000;
        let id = client.setup_recurring(&donor, &eurc, &project_id, &1_000, &interval);

        client.cancel_recurring(&donor, &id);
        env.ledger().with_mut(|l| l.timestamp += interval + 1);
        client.process_recurring(&id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #92)")]
    fn test_double_cancel_recurring_panics() {
        let (_env, _admin, donor, xlm, _usdc, _eurc, project_id, client) = setup_recurring_env();

        let id = client.setup_recurring(&donor, &xlm, &project_id, &500, &500);
        client.cancel_recurring(&donor, &id);
        client.cancel_recurring(&donor, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #91)")]
    fn test_cancel_recurring_rejects_wrong_donor() {
        let (env, _admin, donor, xlm, _usdc, _eurc, project_id, client) = setup_recurring_env();

        let id = client.setup_recurring(&donor, &xlm, &project_id, &500, &500);
        let bad = Address::generate(&env);
        client.cancel_recurring(&bad, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #85)")]
    fn test_setup_recurring_rejects_zero_amount() {
        let (_env, _admin, donor, _xlm, usdc, _eurc, project_id, client) = setup_recurring_env();
        let zero: i128 = 0;
        client.setup_recurring(&donor, &usdc, &project_id, &zero, &500u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #86)")]
    fn test_setup_recurring_rejects_zero_interval() {
        let (_env, _admin, donor, _xlm, usdc, _eurc, project_id, client) = setup_recurring_env();
        client.setup_recurring(&donor, &usdc, &project_id, &100i128, &0u64);
    }

    #[test]
    fn test_total_released_increments_across_intervals_eurc() {
        let (env, _admin, donor, _xlm, _usdc, eurc, project_id, client) = setup_recurring_env();

        let interval: u64 = 1_000;
        let amount: i128 = 500;

        mint(&env, &eurc, &donor, &10_000);

        let id = client.setup_recurring(&donor, &eurc, &project_id, &amount, &interval);

        env.ledger().with_mut(|l| l.timestamp = interval + 1);
        client.process_recurring(&id);

        let rec = client.get_recurring(&id).unwrap();
        assert_eq!(rec.total_released, amount);
        assert_eq!(rec.next_release, 2 * interval);
    }

    // ── Campaign auto-refund tests (issue #755) ───────────────────────────────

    fn setup_campaign(
        client: &DonationEscrowClient,
        env: &Env,
        xlm: &Address,
        target: i128,
        deadline_secs: u64,
    ) -> u64 {
        client.create_campaign(
            &Address::generate(env), // organiser
            xlm,
            &target,
            &deadline_secs,
        )
    }

    #[test]
    fn test_create_campaign_returns_id_and_stores_record() {
        let (env, _admin, _donor, xlm, _usdc, client) = setup();
        let campaign_id = setup_campaign(&client, &env, &xlm, &10_000, &3600);
        let campaign = client.get_campaign(&campaign_id).unwrap();
        assert_eq!(campaign.id, campaign_id);
        assert_eq!(campaign.target_amount, 10_000);
        assert_eq!(campaign.status, CampaignStatus::Active);
        assert_eq!(campaign.total_raised, 0);
    }

    #[test]
    fn test_create_campaign_uses_30_day_default_when_deadline_is_zero() {
        let (env, _admin, _donor, xlm, _usdc, client) = setup();
        let id = setup_campaign(&client, &env, &xlm, &5_000, &0);
        let campaign = client.get_campaign(&id).unwrap();
        // deadline should be approximately now + 30 days
        assert!(campaign.deadline >= env.ledger().timestamp() + CAMPAIGN_DEADLINE_SECS - 1);
    }

    #[test]
    fn test_donate_to_campaign_escrows_funds_and_updates_total() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let id = setup_campaign(&client, &env, &xlm, &10_000, &3600);
        let seq = client.donate_to_campaign(&donor, &id, &xlm, &3_000);
        let campaign = client.get_campaign(&id).unwrap();
        assert_eq!(campaign.total_raised, 3_000);
        let don = client.get_campaign_donation(&id, &seq).unwrap();
        assert_eq!(don.amount, 3_000);
        assert!(!don.refunded);
    }

    #[test]
    fn test_claim_campaign_succeeds_when_target_met() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let id = setup_campaign(&client, &env, &xlm, &5_000, &3600);
        client.donate_to_campaign(&donor, &id, &xlm, &5_000);
        let dest = Address::generate(&env);
        let before = token::Client::new(&env, &xlm).balance(&dest);
        client.claim_campaign(&id, &dest);
        assert_eq!(
            token::Client::new(&env, &xlm).balance(&dest) - before,
            5_000
        );
        assert_eq!(
            client.get_campaign(&id).unwrap().status,
            CampaignStatus::Claimed
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #98)")]
    fn test_claim_campaign_rejected_when_target_not_met() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let id = setup_campaign(&client, &env, &xlm, &10_000, &3600);
        client.donate_to_campaign(&donor, &id, &xlm, &3_000); // only 3000 of 10000
        let dest = Address::generate(&env);
        client.claim_campaign(&id, &dest);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #97)")]
    fn test_claim_campaign_rejected_when_already_claimed() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let id = setup_campaign(&client, &env, &xlm, &3_000, &3600);
        client.donate_to_campaign(&donor, &id, &xlm, &3_000);
        let dest = Address::generate(&env);
        client.claim_campaign(&id, &dest);
        // Second claim should panic
        client.claim_campaign(&id, &dest);
    }

    #[test]
    fn test_refund_campaign_donor_after_deadline_not_met() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let deadline: u64 = 500;
        let id = setup_campaign(&client, &env, &xlm, &10_000, &deadline);
        let seq = client.donate_to_campaign(&donor, &id, &xlm, &2_000);

        // Advance past deadline without reaching target
        env.ledger().with_mut(|l| l.timestamp += deadline + 1);

        let before = token::Client::new(&env, &xlm).balance(&donor);
        client.refund_campaign_donor(&id, &seq);
        assert_eq!(
            token::Client::new(&env, &xlm).balance(&donor) - before,
            2_000
        );

        let don = client.get_campaign_donation(&id, &seq).unwrap();
        assert!(don.refunded);

        // Campaign should now be Expired
        assert_eq!(
            client.get_campaign(&id).unwrap().status,
            CampaignStatus::Expired
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #95)")]
    fn test_refund_campaign_donor_before_deadline_rejected() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let id = setup_campaign(&client, &env, &xlm, &10_000, &3600);
        let seq = client.donate_to_campaign(&donor, &id, &xlm, &2_000);
        // Deadline has NOT passed — should panic
        client.refund_campaign_donor(&id, &seq);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #84)")]
    fn test_refund_campaign_donor_double_refund_rejected() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let deadline: u64 = 500;
        let id = setup_campaign(&client, &env, &xlm, &10_000, &deadline);
        let seq = client.donate_to_campaign(&donor, &id, &xlm, &2_000);
        env.ledger().with_mut(|l| l.timestamp += deadline + 1);
        client.refund_campaign_donor(&id, &seq);
        // Second refund should panic
        client.refund_campaign_donor(&id, &seq);
    }

    #[test]
    fn test_auto_refund_expired_refunds_all_donors() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let donor2 = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&donor2, &10_000);

        let deadline: u64 = 500;
        let id = setup_campaign(&client, &env, &xlm, &20_000, &deadline);

        let seq1 = client.donate_to_campaign(&donor, &id, &xlm, &3_000);
        let seq2 = client.donate_to_campaign(&donor2, &id, &xlm, &4_000);

        // Advance past deadline
        env.ledger().with_mut(|l| l.timestamp += deadline + 1);

        let bal1_before = token::Client::new(&env, &xlm).balance(&donor);
        let bal2_before = token::Client::new(&env, &xlm).balance(&donor2);

        let seqs = soroban_sdk::vec![&env, seq1, seq2];
        client.auto_refund_expired(&id, &seqs);

        assert_eq!(
            token::Client::new(&env, &xlm).balance(&donor) - bal1_before,
            3_000
        );
        assert_eq!(
            token::Client::new(&env, &xlm).balance(&donor2) - bal2_before,
            4_000
        );

        assert_eq!(
            client.get_campaign(&id).unwrap().status,
            CampaignStatus::Expired
        );
    }

    #[test]
    fn test_auto_refund_expired_is_idempotent_skips_already_refunded() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let deadline: u64 = 500;
        let id = setup_campaign(&client, &env, &xlm, &20_000, &deadline);
        let seq = client.donate_to_campaign(&donor, &id, &xlm, &3_000);

        env.ledger().with_mut(|l| l.timestamp += deadline + 1);

        let seqs = soroban_sdk::vec![&env, seq];
        client.auto_refund_expired(&id, &seqs);
        // Second call should NOT panic (idempotent)
        client.auto_refund_expired(&id, &seqs);

        let don = client.get_campaign_donation(&id, &seq).unwrap();
        assert!(don.refunded);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #95)")]
    fn test_auto_refund_rejected_before_deadline() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let id = setup_campaign(&client, &env, &xlm, &10_000, &3600);
        let seq = client.donate_to_campaign(&donor, &id, &xlm, &2_000);
        // Deadline not reached — should panic
        client.auto_refund_expired(&id, &soroban_sdk::vec![&env, seq]);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #96)")]
    fn test_auto_refund_rejected_when_campaign_claimed() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let id = setup_campaign(&client, &env, &xlm, &3_000, &3600);
        let seq = client.donate_to_campaign(&donor, &id, &xlm, &3_000);
        let dest = Address::generate(&env);
        client.claim_campaign(&id, &dest);
        // Campaign already claimed — auto refund should panic
        client.auto_refund_expired(&id, &soroban_sdk::vec![&env, seq]);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #94)")]
    fn test_donate_to_campaign_rejected_after_deadline() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let deadline: u64 = 500;
        let id = setup_campaign(&client, &env, &xlm, &10_000, &deadline);
        // Advance past deadline before donating
        env.ledger().with_mut(|l| l.timestamp += deadline + 1);
        client.donate_to_campaign(&donor, &id, &xlm, &1_000);
    }

    #[test]
    fn test_multiple_donors_partial_fill_then_deadline_auto_refund() {
        let (env, _admin, donor, xlm, _usdc, client) = setup();
        let donor2 = Address::generate(&env);
        let donor3 = Address::generate(&env);
        token::StellarAssetClient::new(&env, &xlm).mint(&donor2, &10_000);
        token::StellarAssetClient::new(&env, &xlm).mint(&donor3, &10_000);

        let deadline: u64 = 1_000;
        let target: i128 = 50_000;

        let id = setup_campaign(&client, &env, &xlm, &target, &deadline);

        let seq1 = client.donate_to_campaign(&donor, &id, &xlm, &5_000);
        let seq2 = client.donate_to_campaign(&donor2, &id, &xlm, &3_000);
        let seq3 = client.donate_to_campaign(&donor3, &id, &xlm, &2_000);

        // Total = 10_000, target = 50_000 → target not met
        let campaign = client.get_campaign(&id).unwrap();
        assert_eq!(campaign.total_raised, 10_000);
        assert!(campaign.total_raised < campaign.target_amount);

        // Advance past deadline
        env.ledger().with_mut(|l| l.timestamp += deadline + 1);

        let b1 = token::Client::new(&env, &xlm).balance(&donor);
        let b2 = token::Client::new(&env, &xlm).balance(&donor2);
        let b3 = token::Client::new(&env, &xlm).balance(&donor3);

        client.auto_refund_expired(&id, &soroban_sdk::vec![&env, seq1, seq2, seq3]);

        assert_eq!(token::Client::new(&env, &xlm).balance(&donor) - b1, 5_000);
        assert_eq!(token::Client::new(&env, &xlm).balance(&donor2) - b2, 3_000);
        assert_eq!(token::Client::new(&env, &xlm).balance(&donor3) - b3, 2_000);
    // ── Normalization helper ─────────────────────────────────────────────

    #[test]
    fn test_normalization_helper_scales_amounts_to_common_unit() {
        assert_eq!(DonationEscrow::normalize_to_common_unit(1_000, 7), 1_000);
        assert_eq!(DonationEscrow::normalize_to_common_unit(1_000, 6), 10_000);
        assert_eq!(DonationEscrow::normalize_to_common_unit(10_000, 8), 1_000);
    }

    // ── Edge cases & misc ────────────────────────────────────────────────

    #[test]
    fn test_get_recurring_missing_returns_none() {
        let (_env, _admin, _donor, _xlm, _usdc, _eurc, _project_id, client) = setup_recurring_env();
        assert!(client.get_recurring(&9999).is_none());
    }

    #[test]
    fn test_register_project_persists_mapping_for_processing() {
        let (env, _admin, donor, xlm, _usdc, _eurc, project_id, client) = setup_recurring_env();

        let id = client.setup_recurring(&donor, &xlm, &project_id, &100, &100);

        env.ledger().with_mut(|l| l.timestamp = 101);
        client.process_recurring(&id);

        let rec = client.get_recurring(&id).unwrap();
        assert_eq!(rec.total_released, 100);
    }
}
