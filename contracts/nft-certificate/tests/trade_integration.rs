#![cfg(test)]

//! End-to-end integration test for nft-certificate secondary-market royalty (#762).
//!
//! Tests the complete lifecycle of an NFT certificate from mint through
//! multiple trades, verifying that the 5% royalty is correctly enforced
//! at each step using real Stellar asset contracts for payment.
//!
//! Run with: cargo test --test nft-certificate-trade-test

use soroban_sdk::{
    testutils::Address as _,
    token, Address, Env, String, Vec,
};
use nft_certificate::{CertificateMetadata, NftCertificate, NftCertificateClient};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const ROYALTY_BPS: i128 = 500;
const BPS_DENOMINATOR: i128 = 10_000;

fn deploy_token(env: &Env, admin: &Address) -> Address {
    env.register_stellar_asset_contract_v2(admin.clone())
        .address()
}

fn mint_token(env: &Env, token_addr: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_addr).mint(to, &amount);
}

fn balance(env: &Env, token_addr: &Address, account: &Address) -> i128 {
    token::Client::new(env, token_addr).balance(account)
}

fn metadata(env: &Env, tree_count: i128, co2_offset: i128) -> CertificateMetadata {
    CertificateMetadata {
        tree_count,
        co2_offset_kg: co2_offset,
        planting_date: String::from_str(env, "2025-07-30"),
        region: String::from_str(env, "Sahel Corridor"),
    }
}

struct TestEnv {
    env: Env,
    client: NftCertificateClient<'static>,
    payment_token: Address,
}

fn setup() -> TestEnv {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let payment_token = deploy_token(&env, &admin);

    let contract_id = env.register_contract(None, NftCertificate);
    let client = NftCertificateClient::new(&env, &contract_id);
    client.initialize(&admin);

    TestEnv {
        env,
        client,
        payment_token,
    }
}

// ------------------------------------------------------------------
// Full lifecycle test: mint → trade → re-trade
// ------------------------------------------------------------------

#[test]
fn test_full_secondary_market_lifecycle() {
    let ctx = setup();

    let planter = Address::generate(&ctx.env);
    let buyer1 = Address::generate(&ctx.env);
    let buyer2 = Address::generate(&ctx.env);
    let buyer3 = Address::generate(&ctx.env);
    let token_id: u64 = 1;
    let price: i128 = 1_000; // 1000 stroops

    println!("\n🧪 NFT Certificate — Full Secondary Market Lifecycle");
    println!("====================================================\n");

    // ── Step 1: Mint certificate to planter ────────────────────────────
    println!("1️⃣ Mint certificate to original planter");
    ctx.client
        .mint(&planter, &token_id, &metadata(&ctx.env, 100, 4800));

    let token = ctx.client.get_token(&token_id).unwrap();
    assert_eq!(token.owner, planter);
    assert_eq!(token.original_planter, planter);
    assert_eq!(ctx.client.total_supply(), 1);
    println!("   ✅ Token {} minted to planter", token_id);

    // ── Step 2: Planter sells to buyer1 (self-sale, no royalty) ────────
    println!("\n2️⃣ Planter sells to Buyer 1 (primary sale — no royalty)");
    mint_token(&ctx.env, &ctx.payment_token, &buyer1, price);

    let planter_bal_before = balance(&ctx.env, &ctx.payment_token, &planter);
    ctx.client
        .trade(&planter, &buyer1, &token_id, &ctx.payment_token, &price);
    let planter_bal_after = balance(&ctx.env, &ctx.payment_token, &planter);

    // Planter receives full price (no royalty on self-sale)
    assert_eq!(planter_bal_after - planter_bal_before, price);
    println!("   ✅ Planter received full {} stroops (no royalty)", price);

    // Ownership transferred
    let token = ctx.client.get_token(&token_id).unwrap();
    assert_eq!(token.owner, buyer1);
    assert_eq!(token.original_planter, planter); // unchanged
    println!("   ✅ Ownership → Buyer 1, original planter stays {:?}", planter);

    // ── Step 3: Buyer1 sells to buyer2 (secondary — 5% royalty!) ───────
    println!("\n3️⃣ Buyer 1 sells to Buyer 2 (secondary market — 5% royalty!)");
    mint_token(&ctx.env, &ctx.payment_token, &buyer2, price);

    let planter_bal_before = balance(&ctx.env, &ctx.payment_token, &planter);
    let seller_bal_before = balance(&ctx.env, &ctx.payment_token, &buyer1);
    ctx.client
        .trade(&buyer1, &buyer2, &token_id, &ctx.payment_token, &price);
    let planter_bal_after = balance(&ctx.env, &ctx.payment_token, &planter);
    let seller_bal_after = balance(&ctx.env, &ctx.payment_token, &buyer1);

    let expected_royalty = (price * ROYALTY_BPS) / BPS_DENOMINATOR;
    let expected_seller = price - expected_royalty;

    assert_eq!(planter_bal_after - planter_bal_before, expected_royalty);
    assert_eq!(seller_bal_after - seller_bal_before, expected_seller);
    println!("   ✅ Planter royalty: {} stroops (5%)", expected_royalty);
    println!("   ✅ Seller received: {} stroops (95%)", expected_seller);

    let token = ctx.client.get_token(&token_id).unwrap();
    assert_eq!(token.owner, buyer2);
    assert_eq!(token.original_planter, planter);
    println!("   ✅ Ownership → Buyer 2, original planter unchanged");

    // ── Step 4: Buyer2 sells to buyer3 (secondary — 5% royalty again!) ──
    println!("\n4️⃣ Buyer 2 sells to Buyer 3 (secondary market — 5% royalty again!)");
    mint_token(&ctx.env, &ctx.payment_token, &buyer3, price);

    let planter_bal_before = balance(&ctx.env, &ctx.payment_token, &planter);
    ctx.client
        .trade(&buyer2, &buyer3, &token_id, &ctx.payment_token, &price);
    let planter_bal_after = balance(&ctx.env, &ctx.payment_token, &planter);

    // Planter receives another 5%
    assert_eq!(planter_bal_after - planter_bal_before, expected_royalty);
    println!("   ✅ Planter received another {} stroops royalty", expected_royalty);

    let token = ctx.client.get_token(&token_id).unwrap();
    assert_eq!(token.owner, buyer3);
    assert_eq!(token.original_planter, planter);
    println!("   ✅ Ownership → Buyer 3, original planter still unchanged");

    // ── Summary ────────────────────────────────────────────────────────
    println!("\n📊 Lifecycle Summary:");
    println!("   Certificate: #{}, {} trees, {} kg CO₂",
        token_id, token.metadata.tree_count, token.metadata.co2_offset_kg);
    println!("   Original planter: {:?}", planter);
    println!("   Current owner: {:?}", buyer3);
    println!("   Trades: 3 (1 primary + 2 secondary)");
    println!("   Total royalty paid to planter: {} stroops",
        expected_royalty * 2);
    println!("\n🎉 End-to-end integration test PASSED!\n");
}

// ------------------------------------------------------------------
// Merge + trade combined flow
// ------------------------------------------------------------------

#[test]
fn test_merge_then_trade_with_royalty() {
    let ctx = setup();

    let planter = Address::generate(&ctx.env);
    let buyer = Address::generate(&ctx.env);
    let price: i128 = 2_500;

    println!("\n🧪 NFT Certificate — Merge then Trade");
    println!("======================================\n");

    // Mint two certificates to the planter
    ctx.client
        .mint(&planter, &1, &metadata(&ctx.env, 50, 2400));
    ctx.client
        .mint(&planter, &2, &metadata(&ctx.env, 75, 3600));
    assert_eq!(ctx.client.total_supply(), 2);

    // Merge them
    let merged_meta = metadata(&ctx.env, 125, 6000);
    let token_ids = Vec::from_array(&ctx.env, [1, 2]);
    ctx.client
        .merge(&planter, &token_ids, &3, &merged_meta);

    // Old tokens burned, new one created
    assert!(ctx.client.get_token(&1).is_none());
    assert!(ctx.client.get_token(&2).is_none());
    let merged = ctx.client.get_token(&3).unwrap();
    assert_eq!(merged.owner, planter);
    assert_eq!(merged.original_planter, planter);
    assert_eq!(merged.metadata.tree_count, 125);
    assert_eq!(ctx.client.total_supply(), 1);
    println!("   ✅ Merged 2 certificates → #3 (125 trees)");

    // Trade the merged certificate to a buyer (self-sale, no royalty)
    mint_token(&ctx.env, &ctx.payment_token, &buyer, price);
    let planter_bal_before = balance(&ctx.env, &ctx.payment_token, &planter);
    ctx.client
        .trade(&planter, &buyer, &3, &ctx.payment_token, &price);
    let planter_bal_after = balance(&ctx.env, &ctx.payment_token, &planter);

    assert_eq!(planter_bal_after - planter_bal_before, price);
    println!("   ✅ Merged certificate traded — planter got full {} stroops", price);

    let token = ctx.client.get_token(&3).unwrap();
    assert_eq!(token.owner, buyer);
    assert_eq!(token.original_planter, planter);

    println!("\n🎉 Merge + Trade test PASSED!\n");
}

// ------------------------------------------------------------------
// Multiple rounds of secondary trading
// ------------------------------------------------------------------

#[test]
fn test_multiple_secondary_trades_accumulate_royalty() {
    let ctx = setup();

    let planter = Address::generate(&ctx.env);
    let mut buyers: Vec<Address> = Vec::new(&ctx.env);
    for _ in 0..5 {
        buyers.push_back(Address::generate(&ctx.env));
    }

    let token_id: u64 = 1;
    let price: i128 = 10_000; // large enough for integer division

    println!("\n🧪 NFT Certificate — 5 Rounds of Trading");
    println!("==========================================\n");

    // Mint to planter
    ctx.client
        .mint(&planter, &token_id, &metadata(&ctx.env, 200, 9600));
    println!("   0️⃣ Certificate minted to planter");

    let mut total_royalty_accumulated: i128 = 0;
    let expected_per_trade = (price * ROYALTY_BPS) / BPS_DENOMINATOR;

    // Round 1: planter → buyer[0] (self-sale, no royalty)
    mint_token(&ctx.env, &ctx.payment_token, &buyers.get(0).unwrap(), price);
    ctx.client
        .trade(&planter, &buyers.get(0).unwrap(), &token_id, &ctx.payment_token, &price);
    println!("   1️⃣ Planter → Buyer A (no royalty)\n");

    // Rounds 2-5: secondary trades, each pays 5% royalty
    let labels = ["A", "B", "C", "D", "E"];
    for i in 1..5 {
        mint_token(&ctx.env, &ctx.payment_token, &buyers.get(i).unwrap(), price);

        let planter_before = balance(&ctx.env, &ctx.payment_token, &planter);
        ctx.client.trade(
            &buyers.get(i - 1).unwrap(),
            &buyers.get(i).unwrap(),
            &token_id,
            &ctx.payment_token,
            &price,
        );
        let planter_after = balance(&ctx.env, &ctx.payment_token, &planter);
        let royalty = planter_after - planter_before;

        assert_eq!(royalty, expected_per_trade);
        total_royalty_accumulated += royalty;
        println!("   {}️⃣ Buyer {} → Buyer {} (royalty {} stroops)",
            i + 1, labels[(i - 1) as usize], labels[i as usize], royalty);
    }

    // Verify final state
    let token = ctx.client.get_token(&token_id).unwrap();
    assert_eq!(token.owner, buyers.get(4).unwrap());
    assert_eq!(token.original_planter, planter);

    println!("\n📊 Results:");
    println!("   Trades: 5 (1 primary + 4 secondary)");
    println!("   Total royalty accumulated: {} stroops", total_royalty_accumulated);
    println!("   Expected total: {} stroops", expected_per_trade * 4);
    assert_eq!(total_royalty_accumulated, expected_per_trade * 4);

    println!("\n🎉 Multiple-round trading test PASSED!\n");
}

// ------------------------------------------------------------------
// Error: self-trade with integration tokens
// ------------------------------------------------------------------

#[test]
fn test_self_trade_rejected_with_payment_token() {
    let ctx = setup();

    let planter = Address::generate(&ctx.env);
    let token_id: u64 = 1;

    ctx.client
        .mint(&planter, &token_id, &metadata(&ctx.env, 100, 4800));

    // Cannot trade to yourself
    mint_token(&ctx.env, &ctx.payment_token, &planter, 1_000);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        ctx.client
            .trade(&planter, &planter, &token_id, &ctx.payment_token, &1_000i128);
    }));

    assert!(result.is_err(), "Self-trade should be rejected");
    println!("✅ Self-trade correctly rejected in integration test");
}

// ------------------------------------------------------------------
// Error: insufficient payment with tokens
// ------------------------------------------------------------------

#[test]
fn test_insufficient_payment_token_balance_rejected() {
    let ctx = setup();

    let planter = Address::generate(&ctx.env);
    let buyer = Address::generate(&ctx.env);
    let token_id: u64 = 1;

    ctx.client
        .mint(&planter, &token_id, &metadata(&ctx.env, 100, 4800));

    // Planter sells to buyer (self-sale, to make buyer the owner)
    mint_token(&ctx.env, &ctx.payment_token, &buyer, 1_000);
    ctx.client
        .trade(&planter, &buyer, &token_id, &ctx.payment_token, &1_000i128);

    // Now buyer tries to sell, but new buyer has only 10 tokens for a 100 price
    let new_buyer = Address::generate(&ctx.env);
    mint_token(&ctx.env, &ctx.payment_token, &new_buyer, 10);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        ctx.client
            .trade(&buyer, &new_buyer, &token_id, &ctx.payment_token, &100i128);
    }));

    assert!(result.is_err(), "Insufficient payment balance should be rejected");
    println!("✅ Insufficient payment correctly rejected in integration test");
}

// ------------------------------------------------------------------
// Verify original planter never changes across multiple trades
// ------------------------------------------------------------------

#[test]
fn test_original_planter_immutable() {
    let ctx = setup();

    let planter = Address::generate(&ctx.env);
    let a = Address::generate(&ctx.env);
    let b = Address::generate(&ctx.env);
    let c = Address::generate(&ctx.env);
    let token_id: u64 = 1;
    let price: i128 = 500;

    ctx.client
        .mint(&planter, &token_id, &metadata(&ctx.env, 50, 2400));

    // Check initial
    assert_eq!(
        ctx.client.original_planter_of(&token_id).unwrap(),
        planter
    );

    // Trade 1
    mint_token(&ctx.env, &ctx.payment_token, &a, price);
    ctx.client
        .trade(&planter, &a, &token_id, &ctx.payment_token, &price);
    assert_eq!(
        ctx.client.original_planter_of(&token_id).unwrap(),
        planter
    );

    // Trade 2
    mint_token(&ctx.env, &ctx.payment_token, &b, price);
    ctx.client
        .trade(&a, &b, &token_id, &ctx.payment_token, &price);
    assert_eq!(
        ctx.client.original_planter_of(&token_id).unwrap(),
        planter
    );

    // Trade 3
    mint_token(&ctx.env, &ctx.payment_token, &c, price);
    ctx.client
        .trade(&b, &c, &token_id, &ctx.payment_token, &price);
    assert_eq!(
        ctx.client.original_planter_of(&token_id).unwrap(),
        planter
    );

    // Ownership changed but planter never did
    assert_eq!(ctx.client.owner_of(&token_id).unwrap(), c);
    assert_eq!(
        ctx.client.original_planter_of(&token_id).unwrap(),
        planter
    );

    println!("✅ Original planter remained immutable through 3 trades");
}
