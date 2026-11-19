#![no_std]
#![allow(
    clippy::needless_pass_by_value,
    clippy::must_use_candidate,
    clippy::missing_panics_doc,
    clippy::module_name_repetitions
)]

use harvesta_errors::standard;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
    String, Vec,
};

pub const MIN_CONTRIBUTION: i128 = 1;
pub const MAX_MICRO_CONTRIBUTION: i128 = 100_000_000;
pub const MAX_BENEFACTORS: u32 = 100;
pub const MAX_TOTAL_SHARES: i128 = 1_000_000_000;
pub const REFUND_GRACE_SECONDS: u64 = 7 * 24 * 60 * 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ImpactFractionError {
    AlreadyInitialized = 3_735_553,
    NotInitialized = 3_735_554,
    Unauthorized = 3_735_555,
    NotVerifier = 3_735_556,
    VerifierAlreadyExists = 3_735_557,
    VerifierNotFound = 3_735_558,
    PlotNotFound = 3_735_559,
    PlotNotActive = 3_735_560,
    PlotCancelled = 3_735_561,
    InvalidPlotParameters = 3_735_562,
    ContributionTooSmall = 3_735_563,
    ContributionTooLarge = 3_735_564,
    TooManyBenefactors = 3_735_565,
    DeadlinePassed = 3_735_566,
    PlotNotFunded = 3_735_567,
    AlreadyMinted = 3_735_568,
    NotAMember = 3_735_569,
    AlreadyRefunded = 3_735_570,
    RefundNotAvailable = 3_735_571,
    InsufficientShares = 3_735_572,
    CertificateNotFound = 3_735_573,
    NotCertificateOwner = 3_735_574,
    SelfTransfer = 3_735_575,
    PlotNotOpen = 3_735_576,
}

const _: () = {
    assert!(ImpactFractionError::AlreadyInitialized as u32 == standard::global_code(56, 1));
    assert!(ImpactFractionError::PlotNotOpen as u32 == standard::global_code(56, 24));
};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlotStatus {
    Open,
    Funded,
    Minted,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlotMetadata {
    pub region: String,
    pub tree_count: i128,
    pub co2_offset_kg: i128,
    pub verification_id: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlotParams {
    pub steward: Address,
    pub payment_token: Address,
    pub total_shares: i128,
    pub share_price: i128,
    pub deadline: u64,
    pub metadata: PlotMetadata,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Plot {
    pub id: u32,
    pub steward: Address,
    pub verifier: Address,
    pub payment_token: Address,
    pub total_shares: i128,
    pub share_price: i128,
    pub target_amount: i128,
    pub deadline: u64,
    pub status: PlotStatus,
    pub active: bool,
    pub total_contributed: i128,
    pub beneficiary_count: u32,
    pub shares_minted: i128,
    pub metadata: PlotMetadata,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Contribution {
    pub benefactor: Address,
    pub amount: i128,
    pub refunded: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ShareCertificate {
    pub token_id: u64,
    pub plot_id: u32,
    pub owner: Address,
    pub shares: i128,
    pub steward: Address,
    pub minted_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Verifiers,
    NextPlotId,
    NextTokenId,
    Plot(u32),
    Benefactors(u32),
    Contribution(u32, Address),
    Certificate(u64),
    CertificateOf(u32, Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlotRegistered {
    #[topic]
    pub plot_id: u32,
    #[topic]
    pub verifier: Address,
    pub steward: Address,
    pub total_shares: i128,
    pub target_amount: i128,
    pub deadline: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Contributed {
    #[topic]
    pub plot_id: u32,
    #[topic]
    pub benefactor: Address,
    pub amount: i128,
    pub total_contributed: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlotFunded {
    #[topic]
    pub plot_id: u32,
    pub total_contributed: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlotCancelled {
    #[topic]
    pub plot_id: u32,
    #[topic]
    pub authority: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub plot_id: u32,
    #[topic]
    pub benefactor: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesMinted {
    #[topic]
    pub plot_id: u32,
    pub certificates: u32,
    pub total_shares: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesTransferred {
    #[topic]
    pub token_id: u64,
    #[topic]
    pub from: Address,
    pub to: Address,
    pub shares: i128,
}

#[contract]
pub struct ImpactCertificateFractionalization;

#[contractimpl]
impl ImpactCertificateFractionalization {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            fail(&env, ImpactFractionError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Verifiers, &Vec::<Address>::new(&env));
        env.storage().instance().set(&DataKey::NextPlotId, &0u32);
        env.storage().instance().set(&DataKey::NextTokenId, &0u64);
    }

    pub fn get_admin(env: Env) -> Address {
        load_admin(&env)
    }

    pub fn add_verifier(env: Env, admin: Address, verifier: Address) {
        admin.require_auth();
        if admin != load_admin(&env) {
            fail(&env, ImpactFractionError::Unauthorized);
        }
        let mut verifiers = load_verifiers(&env);
        if verifiers.contains(&verifier) {
            fail(&env, ImpactFractionError::VerifierAlreadyExists);
        }
        verifiers.push_back(verifier);
        env.storage()
            .instance()
            .set(&DataKey::Verifiers, &verifiers);
    }

    pub fn remove_verifier(env: Env, admin: Address, verifier: Address) {
        admin.require_auth();
        if admin != load_admin(&env) {
            fail(&env, ImpactFractionError::Unauthorized);
        }
        let verifiers = load_verifiers(&env);
        if !verifiers.contains(&verifier) {
            fail(&env, ImpactFractionError::VerifierNotFound);
        }
        let mut kept = Vec::<Address>::new(&env);
        for i in 0..verifiers.len() {
            let candidate = verifiers.get(i).unwrap();
            if candidate != verifier {
                kept.push_back(candidate);
            }
        }
        env.storage().instance().set(&DataKey::Verifiers, &kept);
    }

    pub fn get_verifiers(env: Env) -> Vec<Address> {
        load_verifiers(&env)
    }

    pub fn is_verifier(env: Env, address: Address) -> bool {
        address == load_admin(&env) || load_verifiers(&env).contains(&address)
    }

    pub fn register_plot(env: Env, verifier: Address, params: PlotParams) -> u32 {
        verifier.require_auth();
        if !Self::is_verifier(env.clone(), verifier.clone()) {
            fail(&env, ImpactFractionError::NotVerifier);
        }
        if params.total_shares <= 0 || params.total_shares > MAX_TOTAL_SHARES {
            fail(&env, ImpactFractionError::InvalidPlotParameters);
        }
        if params.share_price <= 0 {
            fail(&env, ImpactFractionError::InvalidPlotParameters);
        }
        if params.deadline <= env.ledger().timestamp() {
            fail(&env, ImpactFractionError::InvalidPlotParameters);
        }
        if params.metadata.tree_count <= 0 || params.metadata.co2_offset_kg <= 0 {
            fail(&env, ImpactFractionError::InvalidPlotParameters);
        }
        let target_amount = params
            .total_shares
            .checked_mul(params.share_price)
            .unwrap_or_else(|| fail(&env, ImpactFractionError::InvalidPlotParameters));

        let plot_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextPlotId)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::NextPlotId, &(plot_id + 1));
        let plot = Plot {
            id: plot_id,
            steward: params.steward.clone(),
            verifier: verifier.clone(),
            payment_token: params.payment_token,
            total_shares: params.total_shares,
            share_price: params.share_price,
            target_amount,
            deadline: params.deadline,
            status: PlotStatus::Open,
            active: true,
            total_contributed: 0,
            beneficiary_count: 0,
            shares_minted: 0,
            metadata: params.metadata,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Plot(plot_id), &plot);
        env.storage()
            .persistent()
            .set(&DataKey::Benefactors(plot_id), &Vec::<Address>::new(&env));

        PlotRegistered {
            plot_id,
            verifier,
            steward: params.steward,
            total_shares: plot.total_shares,
            target_amount,
            deadline: plot.deadline,
        }
        .publish(&env);
        plot_id
    }

    pub fn set_active(env: Env, authority: Address, plot_id: u32, active: bool) {
        authority.require_auth();
        let mut plot = load_plot(&env, plot_id);
        if authority != load_admin(&env) && authority != plot.verifier {
            fail(&env, ImpactFractionError::Unauthorized);
        }
        if plot.status != PlotStatus::Open {
            fail(&env, ImpactFractionError::PlotNotOpen);
        }
        plot.active = active;
        env.storage()
            .persistent()
            .set(&DataKey::Plot(plot_id), &plot);
    }

    pub fn contribute(env: Env, benefactor: Address, plot_id: u32, amount: i128) {
        benefactor.require_auth();
        if amount < MIN_CONTRIBUTION {
            fail(&env, ImpactFractionError::ContributionTooSmall);
        }
        if amount > MAX_MICRO_CONTRIBUTION {
            fail(&env, ImpactFractionError::ContributionTooLarge);
        }

        let mut plot = load_plot(&env, plot_id);
        if plot.status == PlotStatus::Cancelled {
            fail(&env, ImpactFractionError::PlotCancelled);
        }
        if plot.status != PlotStatus::Open || !plot.active {
            fail(&env, ImpactFractionError::PlotNotActive);
        }
        let mut contribution = load_contribution(&env, plot_id, &benefactor);
        if contribution.refunded {
            fail(&env, ImpactFractionError::AlreadyRefunded);
        }
        if env.ledger().timestamp() >= plot.deadline {
            fail(&env, ImpactFractionError::DeadlinePassed);
        }

        token::Client::new(&env, &plot.payment_token).transfer(
            &benefactor,
            env.current_contract_address(),
            &amount,
        );

        if contribution.amount == 0 {
            let mut benefactors: Vec<Address> = env
                .storage()
                .persistent()
                .get(&DataKey::Benefactors(plot_id))
                .unwrap_or_else(|| Vec::new(&env));
            if plot.beneficiary_count >= MAX_BENEFACTORS {
                fail(&env, ImpactFractionError::TooManyBenefactors);
            }
            benefactors.push_back(benefactor.clone());
            env.storage()
                .persistent()
                .set(&DataKey::Benefactors(plot_id), &benefactors);
            plot.beneficiary_count += 1;
        }
        contribution.amount += amount;
        env.storage().persistent().set(
            &DataKey::Contribution(plot_id, benefactor.clone()),
            &contribution,
        );

        plot.total_contributed += amount;
        if plot.total_contributed >= plot.target_amount {
            plot.status = PlotStatus::Funded;
            PlotFunded {
                plot_id,
                total_contributed: plot.total_contributed,
            }
            .publish(&env);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Plot(plot_id), &plot);

        Contributed {
            plot_id,
            benefactor,
            amount,
            total_contributed: plot.total_contributed,
        }
        .publish(&env);
    }

    pub fn mint_shares(env: Env, verifier: Address, plot_id: u32) -> u32 {
        verifier.require_auth();
        let mut plot = load_plot(&env, plot_id);
        if verifier != load_admin(&env) && verifier != plot.verifier {
            fail(&env, ImpactFractionError::Unauthorized);
        }
        if plot.status == PlotStatus::Minted {
            fail(&env, ImpactFractionError::AlreadyMinted);
        }
        if plot.status == PlotStatus::Cancelled {
            fail(&env, ImpactFractionError::PlotCancelled);
        }
        if plot.status != PlotStatus::Funded {
            fail(&env, ImpactFractionError::PlotNotFunded);
        }

        let benefactors: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Benefactors(plot_id))
            .unwrap_or_else(|| Vec::new(&env));
        let mut recipients = 0u32;
        for i in 0..benefactors.len() {
            let contribution = load_contribution(&env, plot_id, &benefactors.get(i).unwrap());
            if contribution.amount > 0 && !contribution.refunded {
                recipients += 1;
            }
        }
        if recipients == 0 {
            fail(&env, ImpactFractionError::NotAMember);
        }

        let mut minted: i128 = 0;
        let mut seen = 0u32;
        for i in 0..benefactors.len() {
            let beneficiary = benefactors.get(i).unwrap();
            let contribution = load_contribution(&env, plot_id, &beneficiary);
            if contribution.amount == 0 || contribution.refunded {
                continue;
            }
            seen += 1;
            let shares = if seen == recipients {
                plot.total_shares - minted
            } else {
                plot.total_shares
                    .checked_mul(contribution.amount)
                    .and_then(|value| value.checked_div(plot.total_contributed))
                    .unwrap_or_else(|| fail(&env, ImpactFractionError::InvalidPlotParameters))
            };
            minted += shares;

            let token_id = next_token_id(&env);
            env.storage().persistent().set(
                &DataKey::Certificate(token_id),
                &ShareCertificate {
                    token_id,
                    plot_id,
                    owner: beneficiary.clone(),
                    shares,
                    steward: plot.steward.clone(),
                    minted_at: env.ledger().timestamp(),
                },
            );
            env.storage()
                .persistent()
                .set(&DataKey::CertificateOf(plot_id, beneficiary), &token_id);
        }

        token::Client::new(&env, &plot.payment_token).transfer(
            &env.current_contract_address(),
            &plot.steward,
            &plot.total_contributed,
        );
        plot.status = PlotStatus::Minted;
        plot.shares_minted = plot.total_shares;
        env.storage()
            .persistent()
            .set(&DataKey::Plot(plot_id), &plot);

        SharesMinted {
            plot_id,
            certificates: recipients,
            total_shares: plot.total_shares,
        }
        .publish(&env);
        recipients
    }

    pub fn refund(env: Env, benefactor: Address, plot_id: u32) -> i128 {
        benefactor.require_auth();
        let mut plot = load_plot(&env, plot_id);
        if !refundable(&env, &plot) {
            fail(&env, ImpactFractionError::RefundNotAvailable);
        }
        let mut contribution = load_contribution(&env, plot_id, &benefactor);
        if contribution.amount == 0 {
            fail(&env, ImpactFractionError::NotAMember);
        }
        if contribution.refunded {
            fail(&env, ImpactFractionError::AlreadyRefunded);
        }

        let amount = contribution.amount;
        contribution.refunded = true;
        env.storage().persistent().set(
            &DataKey::Contribution(plot_id, benefactor.clone()),
            &contribution,
        );
        plot.total_contributed -= amount;
        if plot.status == PlotStatus::Funded && plot.total_contributed < plot.target_amount {
            plot.status = PlotStatus::Open;
        }
        env.storage()
            .persistent()
            .set(&DataKey::Plot(plot_id), &plot);

        token::Client::new(&env, &plot.payment_token).transfer(
            &env.current_contract_address(),
            &benefactor,
            &amount,
        );
        Refunded {
            plot_id,
            benefactor,
            amount,
        }
        .publish(&env);
        amount
    }

    pub fn cancel(env: Env, authority: Address, plot_id: u32) {
        authority.require_auth();
        let mut plot = load_plot(&env, plot_id);
        if authority != load_admin(&env) && authority != plot.verifier {
            fail(&env, ImpactFractionError::Unauthorized);
        }
        if plot.status == PlotStatus::Minted {
            fail(&env, ImpactFractionError::AlreadyMinted);
        }
        if plot.status == PlotStatus::Cancelled {
            fail(&env, ImpactFractionError::PlotCancelled);
        }
        plot.status = PlotStatus::Cancelled;
        plot.active = false;
        env.storage()
            .persistent()
            .set(&DataKey::Plot(plot_id), &plot);
        PlotCancelled { plot_id, authority }.publish(&env);
    }

    pub fn transfer_shares(env: Env, owner: Address, to: Address, token_id: u64, shares: i128) {
        owner.require_auth();
        if owner == to {
            fail(&env, ImpactFractionError::SelfTransfer);
        }
        if shares <= 0 {
            fail(&env, ImpactFractionError::InsufficientShares);
        }
        let mut certificate = load_certificate(&env, token_id);
        if certificate.owner != owner {
            fail(&env, ImpactFractionError::NotCertificateOwner);
        }
        if shares > certificate.shares {
            fail(&env, ImpactFractionError::InsufficientShares);
        }

        let plot_id = certificate.plot_id;
        let steward = certificate.steward.clone();
        let minted_at = certificate.minted_at;
        certificate.shares -= shares;
        if certificate.shares == 0 {
            env.storage()
                .persistent()
                .remove(&DataKey::Certificate(token_id));
            env.storage()
                .persistent()
                .remove(&DataKey::CertificateOf(plot_id, owner.clone()));
        } else {
            env.storage()
                .persistent()
                .set(&DataKey::Certificate(token_id), &certificate);
        }

        let destination_key = DataKey::CertificateOf(plot_id, to.clone());
        if let Some(existing_id) = env
            .storage()
            .persistent()
            .get::<DataKey, u64>(&destination_key)
        {
            let mut destination = load_certificate(&env, existing_id);
            destination.shares += shares;
            env.storage()
                .persistent()
                .set(&DataKey::Certificate(existing_id), &destination);
        } else {
            let new_id = next_token_id(&env);
            env.storage().persistent().set(
                &DataKey::Certificate(new_id),
                &ShareCertificate {
                    token_id: new_id,
                    plot_id,
                    owner: to.clone(),
                    shares,
                    steward,
                    minted_at,
                },
            );
            env.storage().persistent().set(&destination_key, &new_id);
        }
        SharesTransferred {
            token_id,
            from: owner,
            to,
            shares,
        }
        .publish(&env);
    }

    pub fn get_plot(env: Env, plot_id: u32) -> Plot {
        load_plot(&env, plot_id)
    }

    pub fn get_contribution(env: Env, plot_id: u32, benefactor: Address) -> Option<Contribution> {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(plot_id, benefactor))
    }

    pub fn get_benefactors(env: Env, plot_id: u32) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Benefactors(plot_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_certificate(env: Env, token_id: u64) -> Option<ShareCertificate> {
        env.storage()
            .persistent()
            .get(&DataKey::Certificate(token_id))
    }

    pub fn certificate_of(env: Env, plot_id: u32, owner: Address) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::CertificateOf(plot_id, owner))
    }

    pub fn shares_of(env: Env, plot_id: u32, owner: Address) -> i128 {
        match env
            .storage()
            .persistent()
            .get::<DataKey, u64>(&DataKey::CertificateOf(plot_id, owner))
        {
            Some(token_id) => env
                .storage()
                .persistent()
                .get::<DataKey, ShareCertificate>(&DataKey::Certificate(token_id))
                .map_or(0, |certificate| certificate.shares),
            None => 0,
        }
    }

    pub fn preview_shares(env: Env, plot_id: u32, benefactor: Address) -> i128 {
        let plot = load_plot(&env, plot_id);
        let contribution = load_contribution(&env, plot_id, &benefactor);
        if contribution.amount == 0 || contribution.refunded || plot.total_contributed <= 0 {
            return 0;
        }
        plot.total_shares * contribution.amount / plot.total_contributed
    }

    pub fn funding_progress_bps(env: Env, plot_id: u32) -> u32 {
        let plot = load_plot(&env, plot_id);
        if plot.target_amount <= 0 {
            return 0;
        }
        let bps = plot.total_contributed * 10_000 / plot.target_amount;
        u32::try_from(bps.min(10_000)).unwrap_or(10_000)
    }

    pub fn is_refundable(env: Env, plot_id: u32, benefactor: Address) -> bool {
        let plot = load_plot(&env, plot_id);
        let contribution = load_contribution(&env, plot_id, &benefactor);
        contribution.amount > 0 && !contribution.refunded && refundable(&env, &plot)
    }

    pub fn total_certificates_minted(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(0)
    }
}

fn load_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| fail(env, ImpactFractionError::NotInitialized))
}

fn load_verifiers(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&DataKey::Verifiers)
        .unwrap_or_else(|| Vec::new(env))
}

fn load_plot(env: &Env, plot_id: u32) -> Plot {
    env.storage()
        .persistent()
        .get(&DataKey::Plot(plot_id))
        .unwrap_or_else(|| fail(env, ImpactFractionError::PlotNotFound))
}

fn load_contribution(env: &Env, plot_id: u32, benefactor: &Address) -> Contribution {
    env.storage()
        .persistent()
        .get(&DataKey::Contribution(plot_id, benefactor.clone()))
        .unwrap_or_else(|| Contribution {
            benefactor: benefactor.clone(),
            amount: 0,
            refunded: false,
        })
}

fn load_certificate(env: &Env, token_id: u64) -> ShareCertificate {
    env.storage()
        .persistent()
        .get(&DataKey::Certificate(token_id))
        .unwrap_or_else(|| fail(env, ImpactFractionError::CertificateNotFound))
}

fn next_token_id(env: &Env) -> u64 {
    let token_id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextTokenId)
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&DataKey::NextTokenId, &(token_id + 1));
    token_id
}

fn refundable(env: &Env, plot: &Plot) -> bool {
    match plot.status {
        PlotStatus::Cancelled => true,
        PlotStatus::Open => env.ledger().timestamp() >= plot.deadline,
        PlotStatus::Funded => {
            env.ledger().timestamp() >= plot.deadline.saturating_add(REFUND_GRACE_SECONDS)
        }
        PlotStatus::Minted => false,
    }
}

fn fail(env: &Env, error: ImpactFractionError) -> ! {
    soroban_sdk::panic_with_error!(env, error)
}

#[cfg(test)]
mod test;
