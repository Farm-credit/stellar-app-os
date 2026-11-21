use admin_controls::{AdminControls, AdminControlsClient};
use escrow::{Escrow, EscrowClient, EscrowStatus};
use soroban_sdk::{testutils::Address as _, token, Address, Env, Vec};

fn setup() -> (
    Env,
    Address,
    Address,
    Address,
    Address,
    EscrowClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();
    let escrow_id = env.register_contract(None, Escrow);
    let escrow = EscrowClient::new(&env, &escrow_id);
    let controls_id = env.register_contract(None, AdminControls);
    let controls = AdminControlsClient::new(&env, &controls_id);
    let admin = Address::generate(&env);
    let verifier = Address::generate(&env);
    let sponsor = Address::generate(&env);
    let token_admin = Address::generate(&env);
    controls.initialize(&admin, &verifier);
    escrow.initialize(&admin, &verifier, &controls_id);
    let token = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    token::StellarAssetClient::new(&env, &token).mint(&sponsor, &10_000);
    (env, verifier, sponsor, token, escrow_id, escrow)
}

#[test]
fn batch_release_settles_all_requested_escrows() {
    let (env, _verifier, sponsor, token, _escrow_id, escrow) = setup();
    let planter_one = Address::generate(&env);
    let planter_two = Address::generate(&env);
    escrow.deposit(&sponsor, &planter_one, &1, &token, &1_000);
    escrow.deposit(&sponsor, &planter_two, &2, &token, &2_000);

    escrow.batch_release(&Vec::from_array(&env, [1_u64, 2_u64]));

    assert_eq!(
        escrow.get_escrow(&1).unwrap().status,
        EscrowStatus::Released
    );
    assert_eq!(
        escrow.get_escrow(&2).unwrap().status,
        EscrowStatus::Released
    );
    assert_eq!(
        token::Client::new(&env, &token).balance(&planter_one),
        1_000
    );
    assert_eq!(
        token::Client::new(&env, &token).balance(&planter_two),
        2_000
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #17)")]
fn batch_release_rejects_empty_list() {
    let (_env, _verifier, _sponsor, _token, _escrow_id, escrow) = setup();
    escrow.batch_release(&Vec::new(&_env));
}
