use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
};

const SHARES: i128 = 100;
const PRICE: i128 = 100_000;
const TARGET: i128 = SHARES * PRICE;
const NOW: u64 = 1_700_000_000;

struct Ctx {
    env: Env,
    client: ImpactCertificateFractionalizationClient<'static>,
    contract: Address,
    token: Address,
    admin: Address,
    verifier: Address,
    steward: Address,
    plot_id: u32,
}

fn params(env: &Env, steward: &Address, token: &Address, deadline: u64) -> PlotParams {
    PlotParams {
        steward: steward.clone(),
        payment_token: token.clone(),
        total_shares: SHARES,
        share_price: PRICE,
        deadline,
        metadata: PlotMetadata {
            region: String::from_str(env, "Northern Nigeria"),
            tree_count: 500,
            co2_offset_kg: 24_000,
            verification_id: String::from_str(env, "COMM-PLOT-17"),
        },
    }
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    let admin = Address::generate(&env);
    let verifier = Address::generate(&env);
    let steward = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let contract = env.register(ImpactCertificateFractionalization, ());
    let client = ImpactCertificateFractionalizationClient::new(&env, &contract);
    let contract_id = contract.clone();
    client.initialize(&admin);
    client.add_verifier(&admin, &verifier);
    let plot_id = client.register_plot(&verifier, &params(&env, &steward, &token, NOW + 3600));
    Ctx {
        env,
        client,
        contract: contract_id,
        token,
        admin,
        verifier,
        steward,
        plot_id,
    }
}

fn funded(ctx: &Ctx, amount: i128) -> Address {
    let who = Address::generate(&ctx.env);
    StellarAssetClient::new(&ctx.env, &ctx.token).mint(&who, &amount);
    who
}

fn balance(ctx: &Ctx, who: &Address) -> i128 {
    TokenClient::new(&ctx.env, &ctx.token).balance(who)
}

fn fund_plot(ctx: &Ctx) -> [Address; 3] {
    let a = funded(ctx, 4_000_000);
    let b = funded(ctx, 3_000_000);
    let c = funded(ctx, 3_000_000);
    ctx.client.contribute(&a, &ctx.plot_id, &4_000_000);
    ctx.client.contribute(&b, &ctx.plot_id, &3_000_000);
    ctx.client.contribute(&c, &ctx.plot_id, &3_000_000);
    [a, b, c]
}

#[test]
fn initialize_sets_defaults() {
    let ctx = setup();
    assert_eq!(ctx.client.get_admin(), ctx.admin);
    assert_eq!(ctx.client.get_verifiers().len(), 1);
    assert!(ctx.client.is_verifier(&ctx.verifier));
    assert!(ctx.client.is_verifier(&ctx.admin));
    assert_eq!(ctx.client.total_certificates_minted(), 0);
}

#[test]
fn double_initialize_is_rejected() {
    let ctx = setup();
    assert_eq!(
        ctx.client.try_initialize(&ctx.admin),
        Err(Ok(ImpactFractionError::AlreadyInitialized.into()))
    );
}

#[test]
fn verifier_lifecycle() {
    let ctx = setup();
    let verifier = Address::generate(&ctx.env);
    ctx.client.add_verifier(&ctx.admin, &verifier);
    assert!(ctx.client.is_verifier(&verifier));
    assert_eq!(ctx.client.get_verifiers().len(), 2);
    assert_eq!(
        ctx.client.try_add_verifier(&ctx.admin, &verifier),
        Err(Ok(ImpactFractionError::VerifierAlreadyExists.into()))
    );
    ctx.client.remove_verifier(&ctx.admin, &verifier);
    assert!(!ctx.client.is_verifier(&verifier));
    assert_eq!(
        ctx.client.try_remove_verifier(&ctx.admin, &verifier),
        Err(Ok(ImpactFractionError::VerifierNotFound.into()))
    );
}

#[test]
fn non_admin_cannot_manage_verifiers() {
    let ctx = setup();
    let outsider = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client.try_add_verifier(&outsider, &outsider),
        Err(Ok(ImpactFractionError::Unauthorized.into()))
    );
}

#[test]
fn unregistered_verifier_cannot_register_plot() {
    let ctx = setup();
    let outsider = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client.try_register_plot(
            &outsider,
            &params(&ctx.env, &ctx.steward, &ctx.token, NOW + 3600)
        ),
        Err(Ok(ImpactFractionError::NotVerifier.into()))
    );
}

#[test]
fn invalid_plot_parameters_are_rejected() {
    let ctx = setup();
    let mut bad = params(&ctx.env, &ctx.steward, &ctx.token, NOW + 3600);
    bad.total_shares = 0;
    assert_eq!(
        ctx.client.try_register_plot(&ctx.verifier, &bad),
        Err(Ok(ImpactFractionError::InvalidPlotParameters.into()))
    );
    bad.total_shares = SHARES;
    bad.share_price = 0;
    assert_eq!(
        ctx.client.try_register_plot(&ctx.verifier, &bad),
        Err(Ok(ImpactFractionError::InvalidPlotParameters.into()))
    );
    bad.share_price = PRICE;
    bad.deadline = NOW;
    assert_eq!(
        ctx.client.try_register_plot(&ctx.verifier, &bad),
        Err(Ok(ImpactFractionError::InvalidPlotParameters.into()))
    );
    bad.deadline = NOW + 3600;
    bad.metadata.tree_count = 0;
    assert_eq!(
        ctx.client.try_register_plot(&ctx.verifier, &bad),
        Err(Ok(ImpactFractionError::InvalidPlotParameters.into()))
    );
}

#[test]
fn plot_registers_with_expected_state() {
    let ctx = setup();
    let plot = ctx.client.get_plot(&ctx.plot_id);
    assert_eq!(plot.id, 0);
    assert_eq!(plot.steward, ctx.steward);
    assert_eq!(plot.verifier, ctx.verifier);
    assert_eq!(plot.total_shares, SHARES);
    assert_eq!(plot.target_amount, TARGET);
    assert_eq!(plot.status, PlotStatus::Open);
    assert!(plot.active);
    assert_eq!(plot.total_contributed, 0);
    assert_eq!(ctx.client.funding_progress_bps(&ctx.plot_id), 0);
}

#[test]
fn micro_contributions_accumulate_and_fund_the_plot() {
    let ctx = setup();
    let a = funded(&ctx, 5_000_000);
    let b = funded(&ctx, 5_000_000);
    ctx.client.contribute(&a, &ctx.plot_id, &2_000_000);
    ctx.client.contribute(&a, &ctx.plot_id, &3_000_000);
    ctx.client.contribute(&b, &ctx.plot_id, &5_000_000);

    let contribution = ctx.client.get_contribution(&ctx.plot_id, &a).unwrap();
    assert_eq!(contribution.amount, 5_000_000);
    assert!(!contribution.refunded);
    let plot = ctx.client.get_plot(&ctx.plot_id);
    assert_eq!(plot.total_contributed, TARGET);
    assert_eq!(plot.status, PlotStatus::Funded);
    assert_eq!(plot.beneficiary_count, 2);
    assert_eq!(ctx.client.get_benefactors(&ctx.plot_id).len(), 2);
    assert_eq!(ctx.client.funding_progress_bps(&ctx.plot_id), 10_000);
    assert_eq!(balance(&ctx, &a), 0);
    assert_eq!(balance(&ctx, &ctx.contract), TARGET);
}

#[test]
fn contribution_bounds_are_enforced() {
    let ctx = setup();
    let a = funded(&ctx, MAX_MICRO_CONTRIBUTION * 2);
    assert_eq!(
        ctx.client.try_contribute(&a, &ctx.plot_id, &0),
        Err(Ok(ImpactFractionError::ContributionTooSmall.into()))
    );
    assert_eq!(
        ctx.client
            .try_contribute(&a, &ctx.plot_id, &(MAX_MICRO_CONTRIBUTION + 1)),
        Err(Ok(ImpactFractionError::ContributionTooLarge.into()))
    );
    assert_eq!(balance(&ctx, &a), MAX_MICRO_CONTRIBUTION * 2);
}

#[test]
fn contributions_close_at_the_deadline() {
    let ctx = setup();
    let a = funded(&ctx, 1_000_000);
    ctx.env.ledger().set_timestamp(NOW + 3600);
    assert_eq!(
        ctx.client.try_contribute(&a, &ctx.plot_id, &1_000_000),
        Err(Ok(ImpactFractionError::DeadlinePassed.into()))
    );
}

#[test]
fn paused_plot_rejects_contributions() {
    let ctx = setup();
    let a = funded(&ctx, 1_000_000);
    ctx.client.set_active(&ctx.verifier, &ctx.plot_id, &false);
    assert_eq!(
        ctx.client.try_contribute(&a, &ctx.plot_id, &1_000_000),
        Err(Ok(ImpactFractionError::PlotNotActive.into()))
    );
    ctx.client.set_active(&ctx.verifier, &ctx.plot_id, &true);
    ctx.client.contribute(&a, &ctx.plot_id, &1_000_000);
    assert_eq!(
        ctx.client.get_plot(&ctx.plot_id).total_contributed,
        1_000_000
    );
}

#[test]
fn cancelled_plot_cannot_be_funded_or_minted() {
    let ctx = setup();
    let a = funded(&ctx, 1_000_000);
    ctx.client.contribute(&a, &ctx.plot_id, &1_000_000);
    ctx.client.cancel(&ctx.verifier, &ctx.plot_id);
    assert_eq!(
        ctx.client.get_plot(&ctx.plot_id).status,
        PlotStatus::Cancelled
    );
    assert_eq!(
        ctx.client.try_contribute(&a, &ctx.plot_id, &1_000_000),
        Err(Ok(ImpactFractionError::PlotCancelled.into()))
    );
}

#[test]
fn mint_requires_a_funded_plot() {
    let ctx = setup();
    assert_eq!(
        ctx.client.try_mint_shares(&ctx.verifier, &ctx.plot_id),
        Err(Ok(ImpactFractionError::PlotNotFunded.into()))
    );
    let _ = fund_plot(&ctx);
    let outsider = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client.try_mint_shares(&outsider, &ctx.plot_id),
        Err(Ok(ImpactFractionError::Unauthorized.into()))
    );
}

#[test]
fn mint_creates_fractional_certificates_and_releases_funds() {
    let ctx = setup();
    let [a, b, c] = fund_plot(&ctx);
    assert_eq!(ctx.client.preview_shares(&ctx.plot_id, &a), 40);
    assert_eq!(ctx.client.preview_shares(&ctx.plot_id, &b), 30);

    let minted = ctx.client.mint_shares(&ctx.verifier, &ctx.plot_id);
    assert_eq!(minted, 3);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &a), 40);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &b), 30);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &c), 30);
    assert_eq!(ctx.client.total_certificates_minted(), 3);

    let certificate = ctx
        .client
        .get_certificate(&ctx.client.certificate_of(&ctx.plot_id, &a).unwrap())
        .unwrap();
    assert_eq!(certificate.owner, a);
    assert_eq!(certificate.steward, ctx.steward);
    assert_eq!(certificate.shares, 40);
    assert_eq!(certificate.plot_id, ctx.plot_id);
    assert_eq!(certificate.minted_at, NOW);

    let plot = ctx.client.get_plot(&ctx.plot_id);
    assert_eq!(plot.status, PlotStatus::Minted);
    assert_eq!(plot.shares_minted, SHARES);
    assert_eq!(balance(&ctx, &ctx.steward), TARGET);
    assert_eq!(balance(&ctx, &ctx.contract), 0);
    assert_eq!(
        ctx.client.try_mint_shares(&ctx.verifier, &ctx.plot_id),
        Err(Ok(ImpactFractionError::AlreadyMinted.into()))
    );
}

#[test]
fn last_benefactor_receives_the_integer_division_remainder() {
    let ctx = setup();
    let a = funded(&ctx, 4_000_000);
    let b = funded(&ctx, 4_000_000);
    let c = funded(&ctx, 4_000_000);
    ctx.client.contribute(&a, &ctx.plot_id, &3_333_333);
    ctx.client.contribute(&b, &ctx.plot_id, &3_333_333);
    ctx.client.contribute(&c, &ctx.plot_id, &3_333_334);
    ctx.client.mint_shares(&ctx.verifier, &ctx.plot_id);

    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &a), 33);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &b), 33);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &c), 34);
    assert_eq!(
        ctx.client.shares_of(&ctx.plot_id, &a)
            + ctx.client.shares_of(&ctx.plot_id, &b)
            + ctx.client.shares_of(&ctx.plot_id, &c),
        SHARES
    );
}

#[test]
fn open_plot_refund_after_deadline() {
    let ctx = setup();
    let a = funded(&ctx, 1_000_000);
    ctx.client.contribute(&a, &ctx.plot_id, &1_000_000);
    ctx.env.ledger().set_timestamp(NOW + 3600);
    assert!(ctx.client.is_refundable(&ctx.plot_id, &a));
    assert_eq!(ctx.client.refund(&a, &ctx.plot_id), 1_000_000);
    assert_eq!(balance(&ctx, &a), 1_000_000);
    assert!(
        ctx.client
            .get_contribution(&ctx.plot_id, &a)
            .unwrap()
            .refunded
    );
    assert_eq!(
        ctx.client.try_refund(&a, &ctx.plot_id),
        Err(Ok(ImpactFractionError::AlreadyRefunded.into()))
    );
    assert_eq!(
        ctx.client.try_contribute(&a, &ctx.plot_id, &1_000_000),
        Err(Ok(ImpactFractionError::AlreadyRefunded.into()))
    );
}

#[test]
fn funded_plot_refund_requires_the_grace_period() {
    let ctx = setup();
    let a = funded(&ctx, TARGET);
    ctx.client.contribute(&a, &ctx.plot_id, &TARGET);
    assert_eq!(ctx.client.get_plot(&ctx.plot_id).status, PlotStatus::Funded);
    ctx.env.ledger().set_timestamp(NOW + 3600);
    assert_eq!(
        ctx.client.try_refund(&a, &ctx.plot_id),
        Err(Ok(ImpactFractionError::RefundNotAvailable.into()))
    );
    ctx.env
        .ledger()
        .set_timestamp(NOW + 3600 + REFUND_GRACE_SECONDS);
    assert_eq!(ctx.client.refund(&a, &ctx.plot_id), TARGET);
    assert_eq!(ctx.client.get_plot(&ctx.plot_id).status, PlotStatus::Open);
    assert_eq!(ctx.client.preview_shares(&ctx.plot_id, &a), 0);
}

#[test]
fn minted_plot_can_never_be_refunded() {
    let ctx = setup();
    let [a, _, _] = fund_plot(&ctx);
    ctx.client.mint_shares(&ctx.verifier, &ctx.plot_id);
    ctx.env
        .ledger()
        .set_timestamp(NOW + 3600 + REFUND_GRACE_SECONDS);
    assert!(!ctx.client.is_refundable(&ctx.plot_id, &a));
    assert_eq!(
        ctx.client.try_refund(&a, &ctx.plot_id),
        Err(Ok(ImpactFractionError::RefundNotAvailable.into()))
    );
}

#[test]
fn cancelled_plot_refunds_immediately() {
    let ctx = setup();
    let a = funded(&ctx, 1_000_000);
    ctx.client.contribute(&a, &ctx.plot_id, &1_000_000);
    ctx.client.cancel(&ctx.admin, &ctx.plot_id);
    assert!(ctx.client.is_refundable(&ctx.plot_id, &a));
    assert_eq!(ctx.client.refund(&a, &ctx.plot_id), 1_000_000);
    assert_eq!(balance(&ctx, &a), 1_000_000);
}

#[test]
fn refunded_member_is_excluded_from_minting() {
    let ctx = setup();
    let a = funded(&ctx, 4_000_000);
    let b = funded(&ctx, 3_000_000);
    let c = funded(&ctx, 3_000_000);
    ctx.client.contribute(&a, &ctx.plot_id, &4_000_000);
    ctx.client.contribute(&b, &ctx.plot_id, &3_000_000);
    ctx.client.contribute(&c, &ctx.plot_id, &3_000_000);
    ctx.env
        .ledger()
        .set_timestamp(NOW + 3600 + REFUND_GRACE_SECONDS);
    ctx.client.refund(&b, &ctx.plot_id);
    assert_eq!(ctx.client.get_plot(&ctx.plot_id).status, PlotStatus::Open);

    ctx.env.ledger().set_timestamp(NOW + 1_800);
    let d = funded(&ctx, 3_000_000);
    ctx.client.contribute(&d, &ctx.plot_id, &3_000_000);
    ctx.client.mint_shares(&ctx.verifier, &ctx.plot_id);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &b), 0);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &a), 40);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &c), 30);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &d), 30);
    assert_eq!(ctx.client.total_certificates_minted(), 3);
}

#[test]
fn shares_can_be_transferred_and_merged() {
    let ctx = setup();
    let [a, b, _] = fund_plot(&ctx);
    ctx.client.mint_shares(&ctx.verifier, &ctx.plot_id);
    let a_id = ctx.client.certificate_of(&ctx.plot_id, &a).unwrap();
    let b_id = ctx.client.certificate_of(&ctx.plot_id, &b).unwrap();

    ctx.client.transfer_shares(&a, &b, &a_id, &10);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &a), 30);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &b), 40);
    assert_eq!(ctx.client.get_certificate(&a_id).unwrap().owner, a);
    assert_eq!(ctx.client.get_certificate(&b_id).unwrap().shares, 40);
    assert_eq!(ctx.client.certificate_of(&ctx.plot_id, &b), Some(b_id));

    ctx.client.transfer_shares(&a, &b, &a_id, &30);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &a), 0);
    assert_eq!(ctx.client.shares_of(&ctx.plot_id, &b), 70);
    assert_eq!(ctx.client.get_certificate(&a_id), None);
    assert_eq!(ctx.client.certificate_of(&ctx.plot_id, &a), None);
}

#[test]
fn transfer_guards() {
    let ctx = setup();
    let [a, b, _] = fund_plot(&ctx);
    ctx.client.mint_shares(&ctx.verifier, &ctx.plot_id);
    let a_id = ctx.client.certificate_of(&ctx.plot_id, &a).unwrap();
    let outsider = Address::generate(&ctx.env);

    assert_eq!(
        ctx.client.try_transfer_shares(&a, &a, &a_id, &1),
        Err(Ok(ImpactFractionError::SelfTransfer.into()))
    );
    assert_eq!(
        ctx.client.try_transfer_shares(&outsider, &b, &a_id, &1),
        Err(Ok(ImpactFractionError::NotCertificateOwner.into()))
    );
    assert_eq!(
        ctx.client.try_transfer_shares(&a, &b, &a_id, &41),
        Err(Ok(ImpactFractionError::InsufficientShares.into()))
    );
    assert_eq!(
        ctx.client.try_transfer_shares(&a, &b, &a_id, &0),
        Err(Ok(ImpactFractionError::InsufficientShares.into()))
    );
    assert_eq!(
        ctx.client.try_transfer_shares(&a, &b, &999, &1),
        Err(Ok(ImpactFractionError::CertificateNotFound.into()))
    );
}

#[test]
fn missing_plot_and_non_authority_are_rejected() {
    let ctx = setup();
    let outsider = Address::generate(&ctx.env);
    assert_eq!(
        ctx.client.try_get_plot(&42),
        Err(Ok(ImpactFractionError::PlotNotFound.into()))
    );
    assert_eq!(
        ctx.client.try_set_active(&outsider, &ctx.plot_id, &false),
        Err(Ok(ImpactFractionError::Unauthorized.into()))
    );
    assert_eq!(
        ctx.client.try_cancel(&outsider, &ctx.plot_id),
        Err(Ok(ImpactFractionError::Unauthorized.into()))
    );
}

#[test]
fn error_codes_use_the_allocated_crate_block() {
    assert_eq!(
        ImpactFractionError::AlreadyInitialized as u32,
        standard::global_code(56, 1)
    );
    assert_eq!(
        ImpactFractionError::PlotNotOpen as u32,
        standard::global_code(56, 24)
    );
    assert_eq!(
        standard::namespace_of(ImpactFractionError::Unauthorized as u32),
        57
    );
    assert_eq!(
        standard::local_of(ImpactFractionError::Unauthorized as u32),
        3
    );
}
