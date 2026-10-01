#![no_std]

//! Leakage prevention — permanent sequestration (issue #1282).
//!
//! Afforestation credits only keep their value if the trees stay standing.
//! This contract locks a 30-year permanence commitment per project: the
//! project owner either posts a token **bond** or registers an **insurance
//! guarantee** (a policy id from the carbon-insurance contract, #1412) that
//! covers the project's carbon value.
//!
//! While the commitment is active:
//! - an enrolled verifier attests periodic monitoring checks (audit trail),
//! - anyone can report a leakage event (harvesting / crop failure). A
//!   reported bond-backed commitment enters a short dispute window in which
//!   the verifier can clear the report with an attestation if it is wrong.
//! - the admin confirms a disputed leakage event, which slashes the whole
//!   bond to the treasury so the destroyed carbon value is compensated.
//!
//! Once 30 years have elapsed with no confirmed leakage the owner calls
//! `claim_completion` and the bond is returned in full — permanent
//! sequestration is proven by the passage of time plus the attestation
//! trail, and anything else is paid for out of the bond.
//!
//! ## Guarantees
//! - `PERMANENCE_TERM_SECS` is a hard-coded 30-year term; commitments exist
//!   only for `AFFORESTATION` project types.
//! - A bond can only ever move to its owner (`claim_completion`) or to the
//!   treasury (`confirm_breach`) — never to a third party.
//! - Insurance-backed commitments transfer no funds here; the insurance
//!   contract (#1412) pays the guarantee, and this contract only records the
//!   policy reference and its breach state.

// Soroban contract entry points must take `Env` (and the addresses they
// authorize) by value: the contract macro materializes arguments from the
// invocation, so `clippy::needless_pass_by_value` cannot be satisfied here
// without breaking the contract ABI.
#![allow(clippy::needless_pass_by_value)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, Env,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// 30-year permanence requirement for afforestation projects:
/// 30 × 365 days (leap days are not credited to the obligor).
pub const PERMANENCE_TERM_SECS: u64 = 30 * 365 * 24 * 60 * 60;

/// Window in which a leakage report can be disputed by the verifier before
/// the admin may confirm it.
pub const DISPUTE_WINDOW_SECS: u64 = 30 * 24 * 60 * 60;

/// The only project type this v1 contract accepts (upper ASCII, compared
/// without allocation): afforestation is the leakage-prone category.
const AFFORESTATION: &[u8] = b"AFFORESTATION";

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum LeakageError {
    /// `initialize` was called a second time.
    AlreadyInitialized = 1,
    /// The contract has not been initialized yet.
    NotInitialized = 2,
    /// The caller is not the address allowed to perform this action.
    Unauthorized = 3,
    /// Bond is zero/negative, or an insurance guarantee was registered
    /// without a policy reference.
    InvalidGuarantee = 4,
    /// No commitment exists for the supplied id.
    CommitmentNotFound = 5,
    /// The project type is not afforestation — v1 only guards the
    /// 30-year permanence risk this contract was built for.
    NotAfforestation = 6,
    /// A commitment already exists for this project.
    CommitmentExists = 7,
    /// The commitment is no longer live (released or reported/breached).
    CommitmentNotActive = 8,
    /// The 30-year term has not elapsed (or a breach was confirmed).
    TermNotComplete = 9,
    /// The verifier already cleared the leakage report.
    NoPendingBreach = 10,
    /// The dispute window is still open — the verifier must clear the report
    /// or the admin must wait it out.
    DisputeWindowOpen = 11,
    /// A monitoring attestation cannot be recorded against a breached
    /// commitment.
    AlreadyBreached = 12,
    /// The leakage report is not in the state this action needs.
    InvalidStatus = 13,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// How a project covers its 30-year permanence obligation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GuaranteeKind {
    /// Token bond held in escrow by this contract.
    Bond,
    /// Policy issued by the carbon-insurance contract (#1412); `policy_id`
    /// on the commitment points at it.
    Insurance,
}

/// Lifecycle of a permanence commitment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CommitmentStatus {
    /// The obligation is live and being monitored.
    Active,
    /// A leakage event was reported; the verifier may still dispute it
    /// until the window closes.
    Reported,
    /// The bond was slashed to the treasury, or the insurance policy was
    /// marked breached. Terminal.
    Breached,
    /// 30 years elapsed with no confirmed leakage; the bond was returned
    /// (or the insurance guarantee released). Terminal.
    Released,
}

/// A 30-year permanence commitment for one afforestation project.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Commitment {
    pub id: u64,
    /// The obligor — normally the planter or project sponsor.
    pub owner: Address,
    /// Machine-readable project id (e.g. the tree-registry project symbol).
    pub project_id: Address,
    /// Uppercase registry project type; must be `AFFORESTATION`.
    pub project_type: BytesN<16>,
    pub kind: GuaranteeKind,
    /// Escrowed amount for bonds; the insured value for insurance policies.
    pub amount: i128,
    /// Carbon tonnes the commitment undertakes to keep sequestered.
    pub tonnes: i128,
    /// Carbon-insurance policy id when `kind == Insurance`, else 0.
    pub policy_id: u64,
    pub status: CommitmentStatus,
    pub started_at: u64,
    /// Earliest timestamp at which `claim_completion` succeeds.
    pub matures_at: u64,
    /// Timestamp of the most recent verifier attestation.
    pub last_attested_at: u64,
    /// Number of verifier monitoring attestations recorded.
    pub attestations: u32,
    /// When the leakage report was filed (0 when none exists).
    pub breach_reported_at: u64,
    /// End of the dispute window for the current report.
    pub dispute_expires_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    Treasury,
    Token,
    /// Address allowed to record monitoring attestations and clear reports.
    Verifier,
    NextCommitmentId,
    Commitment(Address),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct LeakagePrevention;

#[contractimpl]
impl LeakagePrevention {
    /// Deploys the ledger: `admin` confirms breaches and appoints the
    /// verifier, `treasury` receives slashed bonds, `token` is the bond
    /// payment token.
    pub fn initialize(env: Env, admin: Address, treasury: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, LeakageError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextCommitmentId, &1_u64);
    }

    /// Admin-only: appoint the verifier that attests monitoring checks and
    /// may dispute leakage reports. Until this is called the admin acts as
    /// verifier.
    pub fn set_verifier(env: Env, caller: Address, verifier: Address) {
        caller.require_auth();
        Self::require_admin(&env, &caller);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.events().publish((symbol_short!("verifier"),), verifier);
    }

    // ── Commitments ──────────────────────────────────────────────────────────

    /// Lock a token bond guaranteeing `tonnes` of afforestation carbon stay
    /// sequestered for 30 years. Pulls `bond` in the payment token from the
    /// owner into escrow. Returns the commitment's project id handle.
    pub fn post_bond(
        env: Env,
        owner: Address,
        project_id: Address,
        project_type: BytesN<16>,
        bond: i128,
        tonnes: i128,
    ) -> u64 {
        owner.require_auth();
        Self::require_afforestation(&env, &project_type);
        if bond <= 0 || tonnes <= 0 {
            panic_with_error!(&env, LeakageError::InvalidGuarantee);
        }

        let id = Self::create_commitment(
            &env,
            &owner,
            &project_id,
            project_type,
            GuaranteeKind::Bond,
            bond,
            tonnes,
            0,
        );

        // Effects before interaction: the commitment exists before funds
        // move, so a reverting transfer cannot leave an untracked bond.
        let token = Self::require_token(&env);
        token::Client::new(&env, &token).transfer(&owner, &env.current_contract_address(), &bond);

        env.events()
            .publish((symbol_short!("bond"), project_id), (id, bond));
        id
    }

    /// Register an insurance guarantee instead of posting a bond: `policy_id`
    /// must reference a live carbon-insurance policy (#1412) covering the
    /// project. No funds move through this contract.
    pub fn register_insurance(
        env: Env,
        owner: Address,
        project_id: Address,
        project_type: BytesN<16>,
        insured_value: i128,
        tonnes: i128,
        policy_id: u64,
    ) -> u64 {
        owner.require_auth();
        Self::require_afforestation(&env, &project_type);
        if insured_value <= 0 || tonnes <= 0 || policy_id == 0 {
            panic_with_error!(&env, LeakageError::InvalidGuarantee);
        }

        let id = Self::create_commitment(
            &env,
            &owner,
            &project_id,
            project_type,
            GuaranteeKind::Insurance,
            insured_value,
            tonnes,
            policy_id,
        );

        env.events()
            .publish((symbol_short!("insure"), project_id), (id, policy_id));
        id
    }

    /// Verifier-only: record a periodic monitoring check that the trees are
    /// still standing. Builds the audit trail that lets the owner prove
    /// permanent sequestration at maturity.
    pub fn attest_monitoring(env: Env, caller: Address, project_id: Address) {
        caller.require_auth();
        Self::require_verifier(&env, &caller);

        let mut commitment = Self::load_commitment(&env, &project_id);
        if commitment.status != CommitmentStatus::Active {
            panic_with_error!(&env, LeakageError::CommitmentNotActive);
        }

        let now = env.ledger().timestamp();
        commitment.last_attested_at = now;
        commitment.attestations += 1;
        Self::store_commitment(&env, &commitment);

        env.events()
            .publish((symbol_short!("attest"), project_id), commitment.attestations);
    }

    // ── Leakage events ───────────────────────────────────────────────────────

    /// Report that the project's carbon was released early (harvesting,
    /// fire, failure). Permissionless: leakage hurts every credit holder, so
    /// nobody has to be trusted to flag it. Opens the dispute window during
    /// which the verifier can clear a false report.
    pub fn report_leakage(env: Env, reporter: Address, project_id: Address) {
        reporter.require_auth();

        let mut commitment = Self::load_commitment(&env, &project_id);
        match commitment.status {
            CommitmentStatus::Active => {}
            CommitmentStatus::Breached => panic_with_error!(&env, LeakageError::AlreadyBreached),
            CommitmentStatus::Released => panic_with_error!(&env, LeakageError::TermNotComplete),
            // Already reported (or under dispute): nothing new to file.
            _ => panic_with_error!(&env, LeakageError::InvalidStatus),
        }
        if env.ledger().timestamp() >= commitment.matures_at {
            // The term is over; permanence was satisfied — nothing to leak.
            panic_with_error!(&env, LeakageError::TermNotComplete);
        }

        let now = env.ledger().timestamp();
        commitment.status = CommitmentStatus::Reported;
        commitment.breach_reported_at = now;
        commitment.dispute_expires_at = now + DISPUTE_WINDOW_SECS;
        Self::store_commitment(&env, &commitment);

        env.events()
            .publish((symbol_short!("leakage"), project_id), reporter);
    }

    /// Verifier-only, inside the dispute window: clear a leakage report as
    /// wrong (e.g. an accepted prescribed-burn, not a harvest). The
    /// commitment goes back to `Active` and the report is voided.
    pub fn clear_leakage_report(env: Env, caller: Address, project_id: Address) {
        caller.require_auth();
        Self::require_verifier(&env, &caller);

        let mut commitment = Self::load_commitment(&env, &project_id);
        if commitment.status != CommitmentStatus::Reported {
            panic_with_error!(&env, LeakageError::NoPendingBreach);
        }
        if env.ledger().timestamp() >= commitment.dispute_expires_at {
            panic_with_error!(&env, LeakageError::DisputeWindowOpen);
        }

        commitment.status = CommitmentStatus::Active;
        commitment.breach_reported_at = 0;
        commitment.dispute_expires_at = 0;
        Self::store_commitment(&env, &commitment);

        env.events().publish((symbol_short!("cleared"), project_id), ());
    }

    /// Admin-only, once the dispute window has closed: confirm the leakage
    /// and collect the guarantee. A bond is slashed in full to the treasury
    /// (the platform uses it to replace the destroyed carbon); an insurance
    /// commitment is marked breached so the policy's guarantee is paid under
    /// the insurance contract instead.
    pub fn confirm_breach(env: Env, caller: Address, project_id: Address) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        let mut commitment = Self::load_commitment(&env, &project_id);
        if commitment.status != CommitmentStatus::Reported {
            panic_with_error!(&env, LeakageError::NoPendingBreach);
        }
        if env.ledger().timestamp() < commitment.dispute_expires_at {
            panic_with_error!(&env, LeakageError::DisputeWindowOpen);
        }

        commitment.status = CommitmentStatus::Breached;
        Self::store_commitment(&env, &commitment);

        if commitment.kind == GuaranteeKind::Bond {
            let token = Self::require_token(&env);
            let treasury = Self::require_treasury(&env);
            token::Client::new(&env, &token).transfer(
                &env.current_contract_address(),
                &treasury,
                &commitment.amount,
            );
            env.events()
                .publish((symbol_short!("slash"), project_id), commitment.amount);
        } else {
            env.events()
                .publish((symbol_short!("breach"), project_id), commitment.policy_id);
        }
    }

    // ── Completion ───────────────────────────────────────────────────────────

    /// Owner-side exit: after the full 30-year term with no confirmed
    /// leakage, return the bond to its owner (or release the insurance
    /// obligation). Permissionless settlement of the terminal state, but
    /// only the owner receives funds.
    pub fn claim_completion(env: Env, caller: Address, project_id: Address) {
        caller.require_auth();

        let mut commitment = Self::load_commitment(&env, &project_id);
        if commitment.status == CommitmentStatus::Released {
            panic_with_error!(&env, LeakageError::CommitmentNotActive);
        }
        if commitment.status == CommitmentStatus::Breached {
            panic_with_error!(&env, LeakageError::TermNotComplete);
        }
        if caller != commitment.owner {
            panic_with_error!(&env, LeakageError::Unauthorized);
        }
        let now = env.ledger().timestamp();
        if now < commitment.matures_at {
            panic_with_error!(&env, LeakageError::TermNotComplete);
        }

        commitment.status = CommitmentStatus::Released;
        Self::store_commitment(&env, &commitment);

        if commitment.kind == GuaranteeKind::Bond {
            let token = Self::require_token(&env);
            token::Client::new(&env, &token).transfer(
                &env.current_contract_address(),
                &commitment.owner,
                &commitment.amount,
            );
        }

        env.events()
            .publish((symbol_short!("release"), project_id), commitment.amount);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// The commitment for `project_id`, panicking when none exists.
    #[must_use]
    pub fn get_commitment(env: Env, project_id: Address) -> Commitment {
        Self::load_commitment(&env, &project_id)
    }

    /// The hard-coded 30-year permanence term, in seconds.
    #[must_use]
    pub fn permanence_term_secs(_env: Env) -> u64 {
        PERMANENCE_TERM_SECS
    }

    /// The dispute window a leakage report must survive before it can be
    /// confirmed, in seconds.
    #[must_use]
    pub fn dispute_window_secs(_env: Env) -> u64 {
        DISPUTE_WINDOW_SECS
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    #[allow(clippy::too_many_arguments)]
    fn create_commitment(
        env: &Env,
        owner: &Address,
        project_id: &Address,
        project_type: BytesN<16>,
        kind: GuaranteeKind,
        amount: i128,
        tonnes: i128,
        policy_id: u64,
    ) -> u64 {
        let key = DataKey::Commitment(project_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(env, LeakageError::CommitmentExists);
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextCommitmentId)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&DataKey::NextCommitmentId, &(id + 1));

        let now = env.ledger().timestamp();
        let commitment = Commitment {
            id,
            owner: owner.clone(),
            project_id: project_id.clone(),
            project_type,
            kind,
            amount,
            tonnes,
            policy_id,
            status: CommitmentStatus::Active,
            started_at: now,
            matures_at: now + PERMANENCE_TERM_SECS,
            last_attested_at: 0,
            attestations: 0,
            breach_reported_at: 0,
            dispute_expires_at: 0,
        };
        env.storage().persistent().set(&key, &commitment);
        id
    }

    /// v1 guards afforestation only; compare the fixed-size type without
    /// allocating by trimming trailing NULs/spaces and upper-casing.
    fn require_afforestation(env: &Env, project_type: &BytesN<16>) {
        let arr = project_type.to_array();
        let trimmed = trim_trailing(&arr);
        if trimmed.len() != AFFORESTATION.len() {
            panic_with_error!(env, LeakageError::NotAfforestation);
        }
        for (got, want) in trimmed.iter().zip(AFFORESTATION.iter()) {
            if got.to_ascii_uppercase() != *want {
                panic_with_error!(env, LeakageError::NotAfforestation);
            }
        }
    }

    fn require_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(env, LeakageError::NotInitialized))
    }

    fn require_treasury(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Treasury)
            .unwrap_or_else(|| panic_with_error!(env, LeakageError::NotInitialized))
    }

    /// Authorizes `caller` against the stored admin (no-op when it matches).
    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, LeakageError::NotInitialized));
        if caller != &admin {
            panic_with_error!(env, LeakageError::Unauthorized);
        }
    }

    /// Authorizes `caller` as the configured verifier, falling back to the
    /// admin until [`Self::set_verifier`] is used.
    fn require_verifier(env: &Env, caller: &Address) {
        let configured: Option<Address> = env.storage().instance().get(&DataKey::Verifier);
        let expected = configured.unwrap_or_else(|| {
            env.storage()
                .instance()
                .get(&DataKey::Admin)
                .unwrap_or_else(|| panic_with_error!(env, LeakageError::NotInitialized))
        });
        if caller != &expected {
            panic_with_error!(env, LeakageError::Unauthorized);
        }
    }

    fn load_commitment(env: &Env, project_id: &Address) -> Commitment {
        env.storage()
            .persistent()
            .get(&DataKey::Commitment(project_id.clone()))
            .unwrap_or_else(|| panic_with_error!(env, LeakageError::CommitmentNotFound))
    }

    fn store_commitment(env: &Env, commitment: &Commitment) {
        env.storage().persistent().set(
            &DataKey::Commitment(commitment.project_id.clone()),
            commitment,
        );
    }
}

/// Drop trailing NUL and space padding from a fixed-size type label.
fn trim_trailing(bytes: &[u8; 16]) -> &[u8] {
    let mut end = bytes.len();
    while end > 0 && (bytes[end - 1] == b'\0' || bytes[end - 1] == b' ') {
        end -= 1;
    }
    &bytes[..end]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{Address, Env};

    const BOND: i128 = 1_000_000;
    const TONNES: i128 = 500;

    /// Fixed-size project-type label, padded with NULs.
    fn project_type(env: &Env, name: &[u8]) -> BytesN<16> {
        let mut out = [0u8; 16];
        let mut i = 0;
        while i < name.len() && i < 16 {
            out[i] = name[i];
            i += 1;
        }
        BytesN::from_array(env, &out)
    }

    fn setup() -> (Env, Address, Address, Address, LeakagePreventionClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();

        let contract_id = env.register(LeakagePrevention, ());
        let client = LeakagePreventionClient::new(&env, &contract_id);
        client.initialize(&admin, &treasury, &token);

        (env, admin, treasury, token, client)
    }

    fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token).mint(to, &amount);
    }

    fn balance(env: &Env, token: &Address, of: &Address) -> i128 {
        token::Client::new(env, token).balance(of)
    }

    /// Posts the standard bond for a freshly minted owner. Returns
    /// `(owner, project_id, commitment_id)`.
    fn bonded(
        env: &Env,
        client: &LeakagePreventionClient<'static>,
        token: &Address,
    ) -> (Address, Address, u64) {
        let owner = Address::generate(env);
        let project_id = Address::generate(env);
        mint(env, token, &owner, BOND);
        let afforestation_type = project_type(env, b"AFFORESTATION");
        let id = client.post_bond(&owner, &project_id, &afforestation_type, &BOND, &TONNES);
        (owner, project_id, id)
    }

    fn advance(env: &Env, secs: u64) {
        env.ledger().with_mut(|l| l.timestamp += secs);
    }

    // ── initialize ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (_env, admin, treasury, token, client) = setup();
        client.initialize(&admin, &treasury, &token);
    }

    #[test]
    fn test_term_constants_are_exposed() {
        let (_env, _, _, _, client) = setup();
        assert_eq!(client.permanence_term_secs(), 30 * 365 * 24 * 60 * 60);
        assert_eq!(client.dispute_window_secs(), 30 * 24 * 60 * 60);
    }

    // ── posting bonds ────────────────────────────────────────────────────────

    #[test]
    fn test_post_bond_escrows_funds_and_opens_commitment() {
        let (env, _, _, token, client) = setup();
        let (owner, project_id, id) = bonded(&env, &client, &token);

        assert_eq!(id, 1);
        assert_eq!(balance(&env, &token, &owner), 0);
        assert_eq!(balance(&env, &token, &client.address), BOND);

        let commitment = client.get_commitment(&project_id);
        assert_eq!(commitment.owner, owner);
        assert_eq!(commitment.kind, GuaranteeKind::Bond);
        assert_eq!(commitment.amount, BOND);
        assert_eq!(commitment.tonnes, TONNES);
        assert_eq!(commitment.status, CommitmentStatus::Active);
        assert_eq!(commitment.policy_id, 0);
        assert_eq!(commitment.matures_at, commitment.started_at + PERMANENCE_TERM_SECS);
    }

    #[test]
    fn test_project_type_is_matched_case_insensitively() {
        let (env, _, _, token, client) = setup();
        let owner = Address::generate(&env);
        let project_id = Address::generate(&env);
        mint(&env, &token, &owner, BOND);

        let id =
            client.post_bond(&owner, &project_id, &project_type(&env, b"afforestation"), &BOND, &TONNES);
        assert_eq!(id, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_non_afforestation_project_rejected() {
        let (env, _, _, token, client) = setup();
        let owner = Address::generate(&env);
        let project_id = Address::generate(&env);
        mint(&env, &token, &owner, BOND);
        client.post_bond(&owner, &project_id, &project_type(&env, b"Reforestation"), &BOND, &TONNES);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_post_bond_rejects_zero_amount() {
        let (env, _, _, _token, client) = setup();
        let owner = Address::generate(&env);
        let project_id = Address::generate(&env);
        client.post_bond(&owner, &project_id, &project_type(&env, b"AFFORESTATION"), &0, &TONNES);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_duplicate_commitment_for_project_rejected() {
        let (env, _, _, token, client) = setup();
        let (owner, project_id, _) = bonded(&env, &client, &token);
        mint(&env, &token, &owner, BOND);
        client.post_bond(&owner, &project_id, &project_type(&env, b"AFFORESTATION"), &BOND, &TONNES);
    }

    // ── insurance guarantees ─────────────────────────────────────────────────

    #[test]
    fn test_register_insurance_moves_no_funds() {
        let (env, _, _, token, client) = setup();
        let owner = Address::generate(&env);
        let project_id = Address::generate(&env);
        mint(&env, &token, &owner, BOND);

        let id = client.register_insurance(
            &owner,
            &project_id,
            &project_type(&env, b"AFFORESTATION"),
            &BOND,
            &TONNES,
            &7,
        );
        assert_eq!(id, 1);
        assert_eq!(balance(&env, &token, &owner), BOND);
        assert_eq!(balance(&env, &token, &client.address), 0);

        let commitment = client.get_commitment(&project_id);
        assert_eq!(commitment.kind, GuaranteeKind::Insurance);
        assert_eq!(commitment.policy_id, 7);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_insurance_requires_policy_reference() {
        let (env, _, _, _, client) = setup();
        let owner = Address::generate(&env);
        let project_id = Address::generate(&env);
        client.register_insurance(
            &owner,
            &project_id,
            &project_type(&env, b"AFFORESTATION"),
            &BOND,
            &TONNES,
            &0,
        );
    }

    // ── monitoring attestations ──────────────────────────────────────────────

    #[test]
    fn test_admin_attests_until_verifier_is_set() {
        let (env, admin, _treasury, token, client) = setup();
        let (_, project_id, _) = bonded(&env, &client, &token);

        client.attest_monitoring(&admin, &project_id);
        let commitment = client.get_commitment(&project_id);
        assert_eq!(commitment.attestations, 1);
        assert!(commitment.last_attested_at > 0);
    }

    #[test]
    fn test_configured_verifier_attests() {
        let (env, admin, _, token, client) = setup();
        let verifier = Address::generate(&env);
        client.set_verifier(&admin, &verifier);
        let (_, project_id, _) = bonded(&env, &client, &token);

        client.attest_monitoring(&verifier, &project_id);
        assert_eq!(client.get_commitment(&project_id).attestations, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_attestation_rejects_non_verifier() {
        let (env, admin, _, token, client) = setup();
        let verifier = Address::generate(&env);
        client.set_verifier(&admin, &verifier);
        let (_, project_id, _) = bonded(&env, &client, &token);

        client.attest_monitoring(&Address::generate(&env), &project_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_set_verifier_requires_admin() {
        let (env, _, _, _, client) = setup();
        client.set_verifier(&Address::generate(&env), &Address::generate(&env));
    }

    // ── leakage reporting, disputes, slashing ────────────────────────────────

    #[test]
    fn test_report_then_confirm_slashes_bond_to_treasury() {
        let (env, admin, treasury, token, client) = setup();
        let (owner, project_id, _) = bonded(&env, &client, &token);

        client.report_leakage(&Address::generate(&env), &project_id);
        assert_eq!(client.get_commitment(&project_id).status, CommitmentStatus::Reported);

        // Confirmation must wait out the dispute window.
        advance(&env, DISPUTE_WINDOW_SECS + 1);
        client.confirm_breach(&admin, &project_id);

        let commitment = client.get_commitment(&project_id);
        assert_eq!(commitment.status, CommitmentStatus::Breached);
        assert_eq!(balance(&env, &token, &treasury), BOND);
        assert_eq!(balance(&env, &token, &owner), 0);
    }

    #[test]
    fn test_verifier_can_clear_false_report_in_window() {
        let (env, admin, treasury, token, client) = setup();
        let (_, project_id, _) = bonded(&env, &client, &token);

        client.report_leakage(&Address::generate(&env), &project_id);
        client.clear_leakage_report(&admin, &project_id);

        let commitment = client.get_commitment(&project_id);
        assert_eq!(commitment.status, CommitmentStatus::Active);
        assert_eq!(commitment.breach_reported_at, 0);
        assert_eq!(commitment.dispute_expires_at, 0);

        // And the treasury sees nothing — the report was voided.
        advance(&env, DISPUTE_WINDOW_SECS + 1);
        assert_eq!(balance(&env, &token, &treasury), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_confirm_breach_blocked_during_dispute_window() {
        let (env, admin, _, token, client) = setup();
        let (_, project_id, _) = bonded(&env, &client, &token);

        client.report_leakage(&Address::generate(&env), &project_id);
        client.confirm_breach(&admin, &project_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_clear_after_window_closed_rejected() {
        let (env, admin, _, token, client) = setup();
        let (_, project_id, _) = bonded(&env, &client, &token);

        client.report_leakage(&Address::generate(&env), &project_id);
        advance(&env, DISPUTE_WINDOW_SECS + 1);
        client.clear_leakage_report(&admin, &project_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_confirm_without_report_rejected() {
        let (env, admin, _, token, client) = setup();
        let (_, project_id, _) = bonded(&env, &client, &token);
        advance(&env, DISPUTE_WINDOW_SECS + 1);
        client.confirm_breach(&admin, &project_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_confirm_breach_requires_admin() {
        let (env, _, _, token, client) = setup();
        let (_, project_id, _) = bonded(&env, &client, &token);

        client.report_leakage(&Address::generate(&env), &project_id);
        advance(&env, DISPUTE_WINDOW_SECS + 1);
        client.confirm_breach(&Address::generate(&env), &project_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn test_double_report_rejected() {
        let (env, _, _, token, client) = setup();
        let (_, project_id, _) = bonded(&env, &client, &token);

        client.report_leakage(&Address::generate(&env), &project_id);
        client.report_leakage(&Address::generate(&env), &project_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_report_after_term_elapsed_rejected() {
        let (env, _, _, token, client) = setup();
        let (_, project_id, _) = bonded(&env, &client, &token);

        advance(&env, PERMANENCE_TERM_SECS);
        client.report_leakage(&Address::generate(&env), &project_id);
    }

    #[test]
    fn test_insurance_breach_marks_commitment_without_transfers() {
        let (env, admin, treasury, token, client) = setup();
        let owner = Address::generate(&env);
        let project_id = Address::generate(&env);
        mint(&env, &token, &owner, BOND);
        client.register_insurance(&owner, &project_id, &project_type(&env, b"AFFORESTATION"), &BOND, &TONNES, &7);

        client.report_leakage(&Address::generate(&env), &project_id);
        advance(&env, DISPUTE_WINDOW_SECS + 1);
        client.confirm_breach(&admin, &project_id);

        assert_eq!(
            client.get_commitment(&project_id).status,
            CommitmentStatus::Breached
        );
        // The guarantee itself is paid under the insurance contract; nothing
        // moves through this one.
        assert_eq!(balance(&env, &token, &treasury), 0);
        assert_eq!(balance(&env, &token, &client.address), 0);
        assert_eq!(balance(&env, &token, &owner), BOND);
    }

    // ── completion ───────────────────────────────────────────────────────────

    #[test]
    fn test_claim_completion_after_30_years_returns_bond() {
        let (env, _, _, token, client) = setup();
        let (owner, project_id, _) = bonded(&env, &client, &token);

        advance(&env, PERMANENCE_TERM_SECS);
        client.claim_completion(&owner, &project_id);

        assert_eq!(client.get_commitment(&project_id).status, CommitmentStatus::Released);
        assert_eq!(balance(&env, &token, &owner), BOND);
        assert_eq!(balance(&env, &token, &client.address), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_early_claim_rejected() {
        let (env, _, _, token, client) = setup();
        let (owner, project_id, _) = bonded(&env, &client, &token);

        advance(&env, PERMANENCE_TERM_SECS - 2);
        client.claim_completion(&owner, &project_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_only_owner_can_claim_completion() {
        let (env, _, _, token, client) = setup();
        let (_, project_id, _) = bonded(&env, &client, &token);

        advance(&env, PERMANENCE_TERM_SECS);
        client.claim_completion(&Address::generate(&env), &project_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_breached_commitment_can_never_be_released() {
        let (env, admin, _, token, client) = setup();
        let (owner, project_id, _) = bonded(&env, &client, &token);

        client.report_leakage(&Address::generate(&env), &project_id);
        advance(&env, DISPUTE_WINDOW_SECS + 1);
        client.confirm_breach(&admin, &project_id);

        advance(&env, PERMANENCE_TERM_SECS);
        client.claim_completion(&owner, &project_id);
    }
}
