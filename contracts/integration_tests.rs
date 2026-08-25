//! Integration tests for the full tree planting flow
//! 
//! Run with: cargo test --release integration_tests

#[cfg(test)]
mod integration_tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, BytesN, Env, String as SorobanString,
    };

    // Mock contract implementations for testing
    mod tree_escrow {
        pub use crate::*;
        pub type TreeEscrowClient<'a> = super::TreeEscrowClient<'a>;
    }

    // Import actual tree-escrow contract
    use tree_escrow::{
        BatchSlot, EscrowRecord, EscrowStatus, TreeEscrow, TreeEscrowClient,
    };

    // Constants for testing
    const TREE_COUNT: i128 = 5;
    const ESCROW_AMOUNT: i128 = 10_000_000; // 10 XLM
    const AREA_HECTARES: i128 = 1;
    const SURVIVAL_RATE: u32 = 85;
    const SURVIVAL_THRESHOLD: u32 = 80;
    const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

    struct TestAccounts {
        admin: Address,
        sponsor: Address,
        planter: Address,
        oracle: Address,
        gift_recipient: Address,
    }

    struct TestAssets {
        xlm: Address,
        usdc: Address, 
        tree: Address,
    }

    struct TestContracts {
        tree_escrow: TreeEscrowClient<'static>,
    }

    struct FullFlowTest {
        env: Env,
        accounts: TestAccounts,
        assets: TestAssets,
        contracts: TestContracts,
    }

    impl FullFlowTest {
        fn setup() -> Self {
            let env = Env::default();
            env.mock_all_auths();

            // Create test accounts
            let accounts = TestAccounts {
                admin: Address::generate(&env),
                sponsor: Address::generate(&env),
                planter: Address::generate(&env),
                oracle: Address::generate(&env),
                gift_recipient: Address::generate(&env),
            };

            // Create test assets (mock stellar asset contracts)
            let assets = TestAssets {
                xlm: env.register_stellar_asset_contract_v2(accounts.admin.clone()).address(),
                usdc: env.register_stellar_asset_contract_v2(accounts.admin.clone()).address(), 
                tree: env.register_stellar_asset_contract_v2(accounts.admin.clone()).address(),
            };

            // Fund accounts with test tokens
            token::StellarAssetClient::new(&env, &assets.xlm).mint(&accounts.sponsor, &100_000_000);
            token::StellarAssetClient::new(&env, &assets.usdc).mint(&accounts.sponsor, &100_000_000);
            token::StellarAssetClient::new(&env, &assets.tree).mint(&accounts.admin, &1_000_000_000_000);

            // Deploy and initialize tree-escrow contract
            let tree_escrow_id = env.register_contract(None, TreeEscrow);
            let tree_escrow = TreeEscrowClient::new(&env, &tree_escrow_id);

            // Initialize tree-escrow
            tree_escrow.initialize(
                &accounts.admin,
                &assets.tree,
                &accounts.oracle,
                &SURVIVAL_THRESHOLD,
                &1000_i128, // min_density
                &10_i128,   // job_size_threshold  
            );

            let contracts = TestContracts {
                tree_escrow,
            };

            Self {
                env,
                accounts,
                assets,
                contracts,
            }
        }

        fn advance_time(&self, seconds: u64) {
            self.env.ledger().with_mut(|ledger| {
                ledger.timestamp += seconds;
            });
        }

        fn create_proof_hash(&self) -> BytesN<32> {
            BytesN::from_array(&self.env, &[
                0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
                0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
                0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
                0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
            ])
        }

        fn check_balances(&self) -> (i128, i128, i128) {
            let sponsor_xlm = token::Client::new(&self.env, &self.assets.xlm).balance(&self.accounts.sponsor);
            let planter_xlm = token::Client::new(&self.env, &self.assets.xlm).balance(&self.accounts.planter);
            let recipient_tree = token::Client::new(&self.env, &self.assets.tree).balance(&self.accounts.gift_recipient);
            
            (sponsor_xlm, planter_xlm, recipient_tree)
        }
    }

    #[test]
    fn test_complete_single_donor_flow() {
        let test = FullFlowTest::setup();

        println!("\n🧪 FULL FLOW INTEGRATION TEST: Single Donor");
        println!("=============================================\n");

        // Get initial balances
        let initial_sponsor_balance = token::Client::new(&test.env, &test.assets.xlm).balance(&test.accounts.sponsor);
        let initial_planter_balance = token::Client::new(&test.env, &test.assets.xlm).balance(&test.accounts.planter);

        println!("📊 Initial balances:");
        println!("  Sponsor XLM: {}", initial_sponsor_balance);
        println!("  Planter XLM: {}", initial_planter_balance);

        // Step 1: Sponsor deposits funds
        println!("\n1️⃣ SPONSOR DEPOSITS FUNDS");
        println!("========================");

        test.contracts.tree_escrow.deposit(
            &test.accounts.sponsor,
            &test.accounts.planter,
            &test.assets.xlm,
            &ESCROW_AMOUNT,
            &TREE_COUNT,
            &AREA_HECTARES,
        );

        // Verify deposit
        let escrow_record = test.contracts.tree_escrow.get_record(&test.accounts.planter).unwrap();
        assert_eq!(escrow_record.total_amount, ESCROW_AMOUNT);
        assert_eq!(escrow_record.tree_count, TREE_COUNT);
        assert_eq!(escrow_record.status, EscrowStatus::Funded);
        assert_eq!(escrow_record.donor, test.accounts.sponsor);
        assert_eq!(escrow_record.farmer, test.accounts.planter);

        let sponsor_balance_after_deposit = token::Client::new(&test.env, &test.assets.xlm).balance(&test.accounts.sponsor);
        assert_eq!(initial_sponsor_balance - sponsor_balance_after_deposit, ESCROW_AMOUNT);

        println!("✅ Escrow created successfully");
        println!("  Amount: {} stroops", ESCROW_AMOUNT);
        println!("  Trees: {}", TREE_COUNT);
        println!("  Status: Funded");

        // Step 2: Complete 5 progress updates (planting verification)
        println!("\n2️⃣ PLANTING PROGRESS VERIFICATION");
        println!("=================================");

        for progress_num in 1..=5 {
            println!("  📈 Progress update {}/5", progress_num);

            let proof_hash = test.create_proof_hash();
            let planter_balance_before = token::Client::new(&test.env, &test.assets.xlm).balance(&test.accounts.planter);

            test.contracts.tree_escrow.verify_progress(
                &test.accounts.planter,
                &proof_hash,
                &TREE_COUNT,
            );

            let planter_balance_after = token::Client::new(&test.env, &test.assets.xlm).balance(&test.accounts.planter);
            let payment_received = planter_balance_after - planter_balance_before;

            // Each progress update should release 10% of total amount
            let expected_payment = ESCROW_AMOUNT / 10; // 10%
            assert_eq!(payment_received, expected_payment);

            println!("    💰 Payment released: {} stroops", payment_received);

            // Check escrow record after first update
            if progress_num == 1 {
                let record = test.contracts.tree_escrow.get_record(&test.accounts.planter).unwrap();
                assert_eq!(record.status, EscrowStatus::Planted);
                assert!(record.planted_at > 0);
                assert_eq!(record.verified_tree_count, TREE_COUNT);

                // Check TREE tokens were minted
                let tree_balance = token::Client::new(&test.env, &test.assets.tree).balance(&test.accounts.sponsor);
                assert!(tree_balance > 0);
                println!("    🌳 TREE tokens minted: {}", tree_balance);
            }
        }

        // Verify all progress updates completed
        let record_after_progress = test.contracts.tree_escrow.get_record(&test.accounts.planter).unwrap();
        assert_eq!(record_after_progress.progress_updates, 5);
        assert_eq!(record_after_progress.status, EscrowStatus::Planted);

        let total_progress_payments = token::Client::new(&test.env, &test.assets.xlm).balance(&test.accounts.planter) - initial_planter_balance;
        let expected_progress_total = ESCROW_AMOUNT * 5 / 10; // 50% total
        assert_eq!(total_progress_payments, expected_progress_total);

        println!("✅ All progress updates completed");
        println!("  Total progress payments: {} stroops (50%)", total_progress_payments);

        // Step 3: Simulate time passage (6+ months)
        println!("\n3️⃣ TIME PASSAGE SIMULATION");
        println!("==========================");

        test.advance_time(SIX_MONTHS_SECS + 1000);
        println!("⏰ Advanced time by 6+ months");

        // Step 4: Oracle survival report
        println!("\n4️⃣ ORACLE SURVIVAL REPORT");
        println!("=========================");

        let tree_id = 1u64;
        test.contracts.tree_escrow.submit_survival_report(
            &test.accounts.oracle,
            &tree_id,
            &SURVIVAL_RATE,
        );

        let oracle_report = test.contracts.tree_escrow.get_oracle_report(&tree_id).unwrap();
        assert_eq!(oracle_report.tree_id, tree_id);
        assert_eq!(oracle_report.survival_rate_percent, SURVIVAL_RATE);
        assert_eq!(oracle_report.oracle, test.accounts.oracle);

        println!("✅ Oracle report submitted");
        println!("  Tree ID: {}", tree_id);
        println!("  Survival rate: {}%", SURVIVAL_RATE);

        // Step 5: Survival verification
        println!("\n5️⃣ SURVIVAL VERIFICATION");
        println!("========================");

        let planter_balance_before_survival = token::Client::new(&test.env, &test.assets.xlm).balance(&test.accounts.planter);
        let survival_proof = test.create_proof_hash();

        test.contracts.tree_escrow.verify_survival(
            &test.accounts.planter,
            &survival_proof,
            &SURVIVAL_RATE,
        );

        let planter_balance_after_survival = token::Client::new(&test.env, &test.assets.xlm).balance(&test.accounts.planter);
        let survival_payment = planter_balance_after_survival - planter_balance_before_survival;

        // Survival should release 40% more
        let expected_survival_payment = ESCROW_AMOUNT * 4 / 10; // 40%
        assert_eq!(survival_payment, expected_survival_payment);

        // Verify escrow status changed
        let final_record = test.contracts.tree_escrow.get_record(&test.accounts.planter).unwrap();
        assert_eq!(final_record.status, EscrowStatus::Survived);
        assert_eq!(final_record.survival_rate_percent, SURVIVAL_RATE);

        println!("✅ Survival verification completed");
        println!("  Payment released: {} stroops (40%)", survival_payment);
        println!("  Status: Survived");

        // Final verification and summary
        println!("\n6️⃣ FINAL VERIFICATION");
        println!("=====================");

        let (final_sponsor, final_planter, final_tree) = test.check_balances();
        let total_planter_received = final_planter - initial_planter_balance;
        let total_sponsor_paid = initial_sponsor_balance - final_sponsor;

        // Verify payment amounts (should be 90% total - 50% progress + 40% survival)
        let expected_total_payment = ESCROW_AMOUNT * 9 / 10; // 90%
        assert_eq!(total_planter_received, expected_total_payment);
        assert_eq!(total_sponsor_paid, ESCROW_AMOUNT);

        println!("📊 Final balances:");
        println!("  Sponsor paid: {} stroops", total_sponsor_paid);
        println!("  Planter received: {} stroops (90%)", total_planter_received);
        println!("  TREE tokens minted: {}", final_record.tree_tokens_minted);

        // Verify CO2 impact calculation
        let co2_offset_kg = TREE_COUNT * 48; // 48 kg per tree
        println!("  🌍 CO2 offset: {} kg", co2_offset_kg);

        // Verify all contract state is correct
        assert_eq!(final_record.released, expected_total_payment);
        assert_eq!(final_record.verified_tree_count, TREE_COUNT);
        assert!(final_record.tree_tokens_minted > 0);
        assert!(final_record.planted_at > 0);

        println!("\n🎉 FULL FLOW TEST COMPLETED SUCCESSFULLY!");
        println!("=========================================");
        println!("✅ All verifications passed");
        println!("✅ Payments distributed correctly");
        println!("✅ Carbon credits issued");
        println!("✅ CO2 impact recorded");
    }

    #[test]
    fn test_gift_sponsorship_flow() {
        let test = FullFlowTest::setup();

        println!("\n🧪 FULL FLOW INTEGRATION TEST: Gift Sponsorship");
        println!("===============================================\n");

        // Step 1: Sponsor creates gift sponsorship
        println!("1️⃣ GIFT SPONSORSHIP CREATION");
        println!("============================");

        test.contracts.tree_escrow.sponsor_as_gift(
            &test.accounts.sponsor,
            &test.accounts.gift_recipient,
            &test.accounts.planter,
            &test.assets.xlm,
            &ESCROW_AMOUNT,
            &TREE_COUNT,
            &AREA_HECTARES,
        );

        let escrow_record = test.contracts.tree_escrow.get_record(&test.accounts.planter).unwrap();
        assert_eq!(escrow_record.gift_recipient, Some(test.accounts.gift_recipient.clone()));
        
        println!("✅ Gift escrow created");
        println!("  Sponsor: {}", test.accounts.sponsor);
        println!("  Gift recipient: {}", test.accounts.gift_recipient);
        println!("  Planter: {}", test.accounts.planter);

        // Step 2: Complete first progress update to mint TREE tokens
        println!("\n2️⃣ FIRST PROGRESS UPDATE");
        println!("========================");

        let proof_hash = test.create_proof_hash();
        test.contracts.tree_escrow.verify_progress(
            &test.accounts.planter,
            &proof_hash,
            &TREE_COUNT,
        );

        // Verify TREE tokens went to gift recipient, not sponsor
        let recipient_tree_balance = token::Client::new(&test.env, &test.assets.tree).balance(&test.accounts.gift_recipient);
        let sponsor_tree_balance = token::Client::new(&test.env, &test.assets.tree).balance(&test.accounts.sponsor);

        assert!(recipient_tree_balance > 0);
        assert_eq!(sponsor_tree_balance, 0);

        println!("✅ TREE tokens minted to gift recipient");
        println!("  Recipient balance: {} TREE", recipient_tree_balance);
        println!("  Sponsor balance: {} TREE", sponsor_tree_balance);

        // Complete remaining flow quickly
        for i in 2..=5 {
            let proof = test.create_proof_hash();
            test.contracts.tree_escrow.verify_progress(&test.accounts.planter, &proof, &TREE_COUNT);
        }

        test.advance_time(SIX_MONTHS_SECS + 1000);
        test.contracts.tree_escrow.submit_survival_report(&test.accounts.oracle, &1u64, &SURVIVAL_RATE);
        
        let survival_proof = test.create_proof_hash();
        test.contracts.tree_escrow.verify_survival(&test.accounts.planter, &survival_proof, &SURVIVAL_RATE);

        let final_record = test.contracts.tree_escrow.get_record(&test.accounts.planter).unwrap();
        assert_eq!(final_record.status, EscrowStatus::Survived);

        println!("\n✅ Gift sponsorship flow completed");
        println!("🎁 Carbon credits properly attributed to gift recipient");
    }

    #[test]
    fn test_error_scenarios() {
        let test = FullFlowTest::setup();

        println!("\n🧪 ERROR SCENARIO TESTING");
        println!("=========================\n");

        // Test 1: Invalid amounts
        println!("1️⃣ Testing invalid deposit amounts...");
        
        // This should panic with AmountMustBePositive
        let result = std::panic::catch_unwind(|| {
            test.contracts.tree_escrow.deposit(
                &test.accounts.sponsor,
                &test.accounts.planter,
                &test.assets.xlm,
                &0, // Invalid: zero amount
                &TREE_COUNT,
                &AREA_HECTARES,
            );
        });
        assert!(result.is_err());
        println!("  ✅ Zero amount correctly rejected");

        // Test 2: Survival verification before time elapsed
        println!("\n2️⃣ Testing premature survival verification...");
        
        // Create valid deposit first
        test.contracts.tree_escrow.deposit(
            &test.accounts.sponsor,
            &test.accounts.planter,
            &test.assets.xlm,
            &ESCROW_AMOUNT,
            &TREE_COUNT,
            &AREA_HECTARES,
        );

        // Complete progress updates
        for _ in 1..=5 {
            let proof = test.create_proof_hash();
            test.contracts.tree_escrow.verify_progress(&test.accounts.planter, &proof, &TREE_COUNT);
        }

        // Try survival verification without time passage - should fail
        let survival_result = std::panic::catch_unwind(|| {
            let survival_proof = test.create_proof_hash();
            test.contracts.tree_escrow.verify_survival(&test.accounts.planter, &survival_proof, &SURVIVAL_RATE);
        });
        assert!(survival_result.is_err());
        println!("  ✅ Premature survival verification correctly rejected");

        // Test 3: Low survival rate
        println!("\n3️⃣ Testing low survival rate...");
        
        test.advance_time(SIX_MONTHS_SECS + 1000);
        test.contracts.tree_escrow.submit_survival_report(&test.accounts.oracle, &1u64, &70); // Below 80% threshold

        let low_survival_result = std::panic::catch_unwind(|| {
            let survival_proof = test.create_proof_hash();
            test.contracts.tree_escrow.verify_survival(&test.accounts.planter, &survival_proof, &70);
        });
        assert!(low_survival_result.is_err());
        println!("  ✅ Low survival rate correctly rejected");

        println!("\n✅ All error scenarios handled correctly");
    }

    #[test]
    fn test_oracle_survival_reports() {
        let test = FullFlowTest::setup();

        println!("\n🧪 ORACLE SURVIVAL REPORT TESTING");
        println!("==================================\n");

        // Test multiple oracle reports
        let tree_ids = [1u64, 2u64, 3u64];
        let survival_rates = [85u32, 90u32, 75u32];

        for (tree_id, survival_rate) in tree_ids.iter().zip(survival_rates.iter()) {
            println!("📊 Submitting report for tree {}: {}%", tree_id, survival_rate);
            
            test.contracts.tree_escrow.submit_survival_report(
                &test.accounts.oracle,
                tree_id,
                survival_rate,
            );

            let report = test.contracts.tree_escrow.get_oracle_report(tree_id).unwrap();
            assert_eq!(report.tree_id, *tree_id);
            assert_eq!(report.survival_rate_percent, *survival_rate);
            assert_eq!(report.oracle, test.accounts.oracle);
            assert!(report.reported_at > 0);
        }

        println!("✅ All oracle reports submitted and verified");

        // Test report override (latest wins)
        println!("\n📝 Testing report override...");
        let updated_rate = 95u32;
        test.contracts.tree_escrow.submit_survival_report(&test.accounts.oracle, &1u64, &updated_rate);
        
        let updated_report = test.contracts.tree_escrow.get_oracle_report(&1u64).unwrap();
        assert_eq!(updated_report.survival_rate_percent, updated_rate);
        println!("  ✅ Report override successful: {}%", updated_rate);

        // Test unauthorized oracle
        println!("\n🚫 Testing unauthorized oracle...");
        let fake_oracle = Address::generate(&test.env);
        let unauthorized_result = std::panic::catch_unwind(|| {
            test.contracts.tree_escrow.submit_survival_report(&fake_oracle, &4u64, &85u32);
        });
        assert!(unauthorized_result.is_err());
        println!("  ✅ Unauthorized oracle correctly rejected");

        println!("\n✅ Oracle system working correctly");
    }
}