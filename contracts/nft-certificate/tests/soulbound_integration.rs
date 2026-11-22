#![cfg(test)]

//! Regression coverage for verified steward badges (issue #1815).
//!
//! The production implementation is deliberately separate from transferable
//! certificates: issuers opt into `mint_soulbound`, while existing `mint`
//! callers retain the secondary-market flow.

use nft_certificate::{CertificateMetadata, NftCertificate, NftCertificateClient};
use soroban_sdk::{testutils::Address as _, token, Address, Env, String, Vec};

fn metadata(env: &Env) -> CertificateMetadata {
    CertificateMetadata {
        tree_count: 10,
        co2_offset_kg: 480,
        planting_date: String::from_str(env, "2026-01-01"),
        region: String::from_str(env, "Community Stewardship Zone"),
    }
}

fn setup() -> (Env, Address, Address, NftCertificateClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract = env.register_contract(None, NftCertificate);
    let client = NftCertificateClient::new(&env, &contract);
    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    client.initialize(&admin);
    client.add_issuer(&issuer);
    (env, admin, issuer, client)
}

#[test]
fn verified_badge_is_visible_as_soulbound_and_cannot_be_traded() {
    let (env, _admin, issuer, client) = setup();
    let steward = Address::generate(&env);
    let buyer = Address::generate(&env);
    let payment = env.register_stellar_asset_contract_v2(issuer.clone()).address();
    token::StellarAssetClient::new(&env, &payment).mint(&buyer, &1_000);

    client.mint_soulbound(&issuer, &steward, &7, &metadata(&env));
    let badge = client.get_token(&7).unwrap();
    assert!(badge.soulbound);
    assert!(client.is_soulbound(&7));

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.trade(&steward, &buyer, &7, &payment, &100);
    }));
    assert!(result.is_err(), "soulbound badges must reject resale");
    assert_eq!(client.owner_of(&7).unwrap(), steward);
    assert_eq!(token::Client::new(&env, &payment).balance(&buyer), 1_000);
}

#[test]
fn issuer_can_irreversibly_bind_a_transferable_certificate() {
    let (env, _admin, issuer, client) = setup();
    let steward = Address::generate(&env);
    client.mint(&issuer, &steward, &8, &metadata(&env));
    assert!(!client.is_soulbound(&8));

    client.make_soulbound(&issuer, &8);
    assert!(client.is_soulbound(&8));
    assert!(client.get_token(&8).unwrap().soulbound);
}

#[test]
fn batch_verified_badges_are_all_bound() {
    let (env, _admin, issuer, client) = setup();
    let steward = Address::generate(&env);
    let ids = Vec::from_array(&env, [11_u64, 12_u64]);
    let metadata = Vec::from_array(&env, [metadata(&env), metadata(&env)]);

    client.batch_mint_soulbound(&issuer, &steward, &ids, &metadata);
    assert!(client.is_soulbound(&11));
    assert!(client.is_soulbound(&12));
}
