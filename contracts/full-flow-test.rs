#[cfg(test)]
mod full_flow_integration_tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger, LedgerInfo},
        token, Address, BytesN, Env, Vec,
    };

    // Import all the contract clients we need
    use tree_escrow::{TreeEscrow, TreeEscrowClient};
    use tree_token::{TreeToken, TreeTokenClient};
    use donation_escrow::{DonationEscrow, DonationEscrowClient};
    use farmer_registry::{FarmerRegistry, FarmerRegistryClient};

    const TREE_COUNT: i128 = 5;
    const ESCROW_AMOUNT: i128 = 10_000_000; // 10 XLM in stroops
    const AREA_HECTARES: i128 = 1;
    const SURVIVAL_RATE: u32 = 85; // 85%
    const SURVIVAL_THRESHOLD: u32 = 80; // 80% minimum
    
    // 6 months in seconds
    const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

    struct TestSetup {
        env: Env,
        // Accounts
        admin: Address,
        sponsor: Address,
        planter: Address,
        verifier: Address,
        oracle: Address,
        gift_recipient: Address,
        
        // Tokens
        xlm_token: Address,
        usdc_token: Address,
        tree_token: Address,
        
        // Contract clients
        tree_escrow: TreeEscrowClient<'static>,
        tree_token_client: TreeTokenClient<'static>,
        donation_escrow: DonationEscrowClient<'static>,
    }

    impl TestSetup {
        fn new() -> Self {
            let env = Env::default();
            env.mock_all_auths();

            // Generate test accounts
            let admin = Address::generate(&env);
            let sponsor = Address::generate(&env);
            let planter = Address::generate(&env);
            let verifier = Address::generate(&env);
            let oracle = Address::generate(&env);
            let gift_recipient = Address::generate(&env);

            // Create mock tokens
            let xlm_token = env.register_stellar_asset_contract_v2(admin.clone()).address();
            let usdc_token = env.register_stellar_asset_contract_v2(admin.clone()).address();
            let tree_token = env.register_stellar_asset_contract_v2(admin.clone()).address();

            // Mint initial balances
            token::StellarAssetClient::new(&env, &xlm_token).mint(&sponsor, &100_000_000); // 100 XLM
            token::StellarAssetClient::new(&env, &usdc_token).mint(&sponsor, &100_000_000); // 100 USDC
            token::StellarAssetClient::new(&env, &tree_token).mint(&admin, &1_000_000_000_000); // 1M TREE

            // Deploy contracts
            let tree_escrow_id = env.register_contract(None, TreeEscrow);
            let tree_escrow = TreeEscrowClient::new(&env, &tree_escrow_id);

            let tree_token_contract_id = env.register_contract(None, TreeToken);
            let tree_token_client = TreeTokenClient::new(&env, &tree_token_contract_id);

            let donation_escrow_id = env.register_contract(None, DonationEscrow);
            let donation_escrow = DonationEscrowClient::new(&env, &donation_escrow_id);

            // Initialize contracts
            tree_escrow.initialize(
                &admin,
                &tree_token,
                &oracle,
                &SURVIVAL_THRESHOLD,
                &1000_i128, // min_density
                &10_i128,   // job_size_threshold
            );

            tree_token_client.initialize(&admin, &tree_token);

            donation_escrow.initialize(&admin, &xlm_token, &usdc_token);

            // Add tokens to whitelists
            tree_escrow.add_to_whitelist(&xlm_token);
            tree_escrow.add_to_whitelist(&usdc_token);
            tree_escrow.add_to_whitelist(&tree_token);

            tree_token_client.add_to_whitelist(&tree_token);

            donation_escrow.add_to_whitelist(&xlm_token);
            donation_escrow.add_to_whitelist(&usdc_token);

            Self {
                env,
                admin,
                sponsor,
                planter,
                verifier,
                oracle,
                gift_recipient,
                xlm_token,
                usdc_token,
                tree_token,
                tree_escrow,
                tree_token_client,
                donation_escrow,
            }
        }

        fn generate_proof_hash(&self) -> BytesN<32> {
            // Generate a mock proof hash
            BytesN::from_array(&self.env, &[
                0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
                0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
                0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
            ])
        }

        fn advance_time(&self, seconds: u64) {
            self.env.ledger().with_mut(|li| {
                li.timestamp += seconds;
            });
        }

        fn check_balances(&self) {
            let sponsor_xlm = token::Client::new(&self.env, &self.xlm_token).balance(&self.sponsor);
            let planter_xlm = token::Client::new(&self.env, &self.xlm_token).balance(&self.planter);
            let recipient_tree = token::Client::new(&self.env, &self.tree_token).balance(&self.gift_recipient);
            
            println!("Final balances:");
            println!("  Sponsor XLM: {}", sponsor_xlm);
            println!("  Planter XLM: {}", planter_xlm);
            println!("  Recipient TREE: {}", recipient_tree);
        }
    }

    #[test]
    fn test_full_flow_single_donor() {
        let setup = TestSetup::new();
        
        println!("\n🧪 Testing Full Flow: Single Donor Path\n");

        // Step 1: Sponsor deposits funds into escrow
        println!("1️⃣ Sponsor deposits funds into escrow...");
        
        let initial_sponsor_balance = token::Client::new(&setup.env, &setup.xlm_token).balance(&setup.sponsor);
        
        setup.tree_escrow.deposit(
            &setup.sponsor,
            &setup.planter,
            &setup.xlm_token,
            &ESCROW_AMOUNT,
            &TREE_COUNT,
            &AREA_HECTARES,
        );
        
        let post_deposit_balance = token::Client::new(&setup.env, &setup.xlm_token).balance(&setup.sponsor);
        assert_eq!(initial_sponsor_balance - post_deposit_balance, ESCROW_AMOUNT);
        println!("  ✅ Escrow deposit successful");

        // Verify escrow record was created
        let escrow_record = setup.tree_escrow.get_record(&setup.planter).unwrap();
        assert_eq!(escrow_record.total_amount, ESCROW_AMOUNT);
        assert_eq!(escrow_record.tree_count, TREE_COUNT);
        assert_eq!(escrow_record.status, tree_escrow::EscrowStatus::Funded);
        
        // Step 2: Planter accepts job (implicit - farmer is specified in deposit)
        println!("2️⃣ Planter accepts the job (implicit)...");
        println!("  ✅ Planter address: {}", setup.planter);

        // Step 3: Complete all 5 progress updates (planting verification)
        println!("3️⃣ Admin verifies planting progress (5 updates)...");
        
        let initial_planter_balance = token::Client::new(&setup.env, &setup.xlm_token).balance(&setup.planter);
        
        for i in 1..=5 {
            println!("  📊 Progress update {}/5...", i);
            
            let proof_hash = setup.generate_proof_hash();
            setup.tree_escrow.verify_progress(
                &setup.planter,
                &proof_hash,
                &TREE_COUNT,
            );
            
            // Check that funds were released (10% each time)
            let current_balance = token::Client::new(&setup.env, &setup.xlm_token).balance(&setup.planter);
            let expected_released = (ESCROW_AMOUNT * i as i128 * 1000) / 10000; // 10% each time
            assert_eq!(current_balance - initial_planter_balance, expected_released);
        }
        
        // Check that TREE tokens were minted on first progress update
        let recipient_tree_balance = token::Client::new(&setup.env, &setup.tree_token).balance(&setup.sponsor);
        assert_eq!(recipient_tree_balance, TREE_COUNT * 1_000_000); // Assuming 6 decimals
        println!("  ✅ TREE tokens minted: {} TREE", recipient_tree_balance);

        // Verify escrow status changed to Planted
        let escrow_record = setup.tree_escrow.get_record(&setup.planter).unwrap();
        assert_eq!(escrow_record.status, tree_escrow::EscrowStatus::Planted);
        assert_eq!(escrow_record.progress_updates, 5);
        
        // Step 4: Simulate 6+ months passing and survival verification
        println!("4️⃣ Simulating 6+ months time passage...");
        setup.advance_time(SIX_MONTHS_SECS + 1000); // 6 months + buffer
        
        // Oracle submits survival report
        println!("5️⃣ Oracle submits survival report...");
        let tree_id = 1u64;
        setup.tree_escrow.submit_survival_report(
            &setup.oracle,
            &tree_id,
            &SURVIVAL_RATE,
        );
        
        let oracle_report = setup.tree_escrow.get_oracle_report(&tree_id).unwrap();
        assert_eq!(oracle_report.survival_rate_percent, SURVIVAL_RATE);
        println!("  ✅ Oracle report submitted: {}% survival", SURVIVAL_RATE);
        
        // Admin verifies survival
        println!("6️⃣ Admin verifies survival...");
        let survival_proof = setup.generate_proof_hash();
        let pre_survival_balance = token::Client::new(&setup.env, &setup.xlm_token).balance(&setup.planter);
        
        setup.tree_escrow.verify_survival(
            &setup.planter,
            &survival_proof,
            &SURVIVAL_RATE,
        );
        
        let post_survival_balance = token::Client::new(&setup.env, &setup.xlm_token).balance(&setup.planter);
        
        // Verify remaining funds were released (should be 50% total now - 50% from progress, 40% from survival)
        let total_released = post_survival_balance - initial_planter_balance;
        let expected_total = (ESCROW_AMOUNT * 9000) / 10000; // 90% total (50% progress + 40% survival)
        assert_eq!(total_released, expected_total);
        println!("  ✅ Survival payment released: {} stroops", post_survival_balance - pre_survival_balance);
        
        // Verify escrow status changed to Survived
        let escrow_record = setup.tree_escrow.get_record(&setup.planter).unwrap();
        assert_eq!(escrow_record.status, tree_escrow::EscrowStatus::Survived);
        assert_eq!(escrow_record.survival_rate_percent, SURVIVAL_RATE);
        
        // Step 7: Final assertions
        println!("7️⃣ Running final assertions...");
        
        // Check final balances
        setup.check_balances();
        
        // Verify total CO2 impact
        let co2_offset_kg = TREE_COUNT * 48; // 48 kg CO2 per tree
        println!("  🌍 Total CO2 offset: {} kg", co2_offset_kg);
        
        // Verify escrow completion
        assert_eq!(escrow_record.verified_tree_count, TREE_COUNT);
        assert!(escrow_record.released > 0);
        assert_eq!(escrow_record.tree_tokens_minted, TREE_COUNT * 1_000_000); // 6 decimals
        
        println!("\n🎉 Full flow test completed successfully!");
        println!("\n📊 Test Summary:");
        println!("  ✅ Escrow deposit: {} stroops", ESCROW_AMOUNT);
        println!("  ✅ Trees planted: {}", TREE_COUNT);
        println!("  ✅ Progress updates: 5/5");
        println!("  ✅ Survival rate: {}%", SURVIVAL_RATE);
        println!("  ✅ Funds released: {} stroops", escrow_record.released);
        println!("  ✅ TREE tokens minted: {}", escrow_record.tree_tokens_minted);
        println!("  ✅ CO2 offset: {} kg", co2_offset_kg);
    }

    #[test]
    fn test_full_flow_gift_sponsorship() {
        let setup = TestSetup::new();
        
        println!("\n🧪 Testing Full Flow: Gift Sponsorship Path\n");

        // Step 1: Sponsor creates gift sponsorship
        println!("1️⃣ Sponsor creates gift sponsorship...");
        
        setup.tree_escrow.sponsor_as_gift(
            &setup.sponsor,
            &setup.gift_recipient,
            &setup.planter,
            &setup.xlm_token,
            &ESCROW_AMOUNT,
            &TREE_COUNT,
            &AREA_HECTARES,
        );
        
        let escrow_record = setup.tree_escrow.get_record(&setup.planter).unwrap();
        assert_eq!(escrow_record.gift_recipient, Some(setup.gift_recipient.clone()));
        println!("  ✅ Gift escrow created");

        // Step 2-3: Complete progress updates
        println!("2️⃣ Completing progress updates...");
        for i in 1..=5 {
            let proof_hash = setup.generate_proof_hash();
            setup.tree_escrow.verify_progress(
                &setup.planter,
                &proof_hash,
                &TREE_COUNT,
            );
        }

        // Verify TREE tokens went to gift recipient, not sponsor
        let recipient_tree_balance = token::Client::new(&setup.env, &setup.tree_token).balance(&setup.gift_recipient);
        let sponsor_tree_balance = token::Client::new(&setup.env, &setup.tree_token).balance(&setup.sponsor);
        
        assert_eq!(recipient_tree_balance, TREE_COUNT * 1_000_000);
        assert_eq!(sponsor_tree_balance, 0);
        println!("  ✅ TREE tokens issued to gift recipient: {} TREE", recipient_tree_balance);

        // Step 4-5: Complete survival verification
        setup.advance_time(SIX_MONTHS_SECS + 1000);
        
        let tree_id = 1u64;
        setup.tree_escrow.submit_survival_report(&setup.oracle, &tree_id, &SURVIVAL_RATE);
        
        let survival_proof = setup.generate_proof_hash();
        setup.tree_escrow.verify_survival(&setup.planter, &survival_proof, &SURVIVAL_RATE);
        
        let final_record = setup.tree_escrow.get_record(&setup.planter).unwrap();
        assert_eq!(final_record.status, tree_escrow::EscrowStatus::Survived);
        
        println!("  ✅ Gift sponsorship flow completed successfully");
        
        // Verify carbon credits are properly attributed to gift recipient
        let final_tree_balance = token::Client::new(&setup.env, &setup.tree_token).balance(&setup.gift_recipient);
        assert_eq!(final_tree_balance, TREE_COUNT * 1_000_000);
        
        println!("\n🎁 Gift Sponsorship Summary:");
        println!("  ✅ Sponsor: {}", setup.sponsor);
        println!("  ✅ Gift recipient: {}", setup.gift_recipient);
        println!("  ✅ Planter: {}", setup.planter);
        println!("  ✅ Carbon credits to recipient: {} TREE", final_tree_balance);
    }

    #[test]
    fn test_full_flow_batch_deposit() {
        let setup = TestSetup::new();
        
        println!("\n🧪 Testing Full Flow: Batch Deposit Path\n");

        // Step 1: Create batch deposit with multiple planters
        println!("1️⃣ Creating batch deposit...");
        
        let planter2 = Address::generate(&setup.env);
        let planter3 = Address::generate(&setup.env);
        
        let batch_slots = Vec::from_array(&setup.env, [
            tree_escrow::BatchSlot {
                farmer: setup.planter.clone(),
                amount: ESCROW_AMOUNT / 3,
                gift_recipient: None,
                referrer: None,
            },
            tree_escrow::BatchSlot {
                farmer: planter2.clone(),
                amount: ESCROW_AMOUNT / 3,
                gift_recipient: Some(setup.gift_recipient.clone()),
                referrer: None,
            },
            tree_escrow::BatchSlot {
                farmer: planter3.clone(),
                amount: ESCROW_AMOUNT / 3,
                gift_recipient: None,
                referrer: None,
            },
        ]);
        
        setup.tree_escrow.batch_deposit(
            &setup.sponsor,
            &setup.xlm_token,
            &batch_slots,
        );
        
        // Verify all escrows were created
        let record1 = setup.tree_escrow.get_record(&setup.planter).unwrap();
        let record2 = setup.tree_escrow.get_record(&planter2).unwrap();
        let record3 = setup.tree_escrow.get_record(&planter3).unwrap();
        
        assert_eq!(record1.total_amount, ESCROW_AMOUNT / 3);
        assert_eq!(record2.gift_recipient, Some(setup.gift_recipient.clone()));
        assert_eq!(record3.total_amount, ESCROW_AMOUNT / 3);
        
        println!("  ✅ Batch deposit created 3 escrows");

        // Step 2: Complete flow for one of the planters
        println!("2️⃣ Completing flow for planter 2...");
        
        // Complete progress updates
        for i in 1..=5 {
            let proof_hash = setup.generate_proof_hash();
            setup.tree_escrow.verify_progress(&planter2, &proof_hash, &1); // 1 tree per batch
        }
        
        // Check TREE tokens went to gift recipient
        let recipient_tree_balance = token::Client::new(&setup.env, &setup.tree_token).balance(&setup.gift_recipient);
        assert_eq!(recipient_tree_balance, 1_000_000); // 1 TREE with 6 decimals
        
        // Complete survival verification
        setup.advance_time(SIX_MONTHS_SECS + 1000);
        
        let tree_id = 2u64;
        setup.tree_escrow.submit_survival_report(&setup.oracle, &tree_id, &SURVIVAL_RATE);
        
        let survival_proof = setup.generate_proof_hash();
        setup.tree_escrow.verify_survival(&planter2, &survival_proof, &SURVIVAL_RATE);
        
        let final_record = setup.tree_escrow.get_record(&planter2).unwrap();
        assert_eq!(final_record.status, tree_escrow::EscrowStatus::Survived);
        
        println!("  ✅ Batch deposit flow completed for one planter");
        
        println!("\n📦 Batch Deposit Summary:");
        println!("  ✅ Total planters: 3");
        println!("  ✅ Completed flows: 1");
        println!("  ✅ Gift recipients: 1");
        println!("  ✅ Total escrow amount: {} stroops", ESCROW_AMOUNT);
    }

    #[test] 
    fn test_carbon_credit_burning() {
        let setup = TestSetup::new();
        
        println!("\n🧪 Testing Carbon Credit Burning for ESG\n");

        // First complete a full flow to get TREE tokens
        setup.tree_escrow.deposit(
            &setup.sponsor,
            &setup.planter,
            &setup.xlm_token,
            &ESCROW_AMOUNT,
            &TREE_COUNT,
            &AREA_HECTARES,
        );

        // Complete all progress updates
        for _ in 1..=5 {
            let proof_hash = setup.generate_proof_hash();
            setup.tree_escrow.verify_progress(&setup.planter, &proof_hash, &TREE_COUNT);
        }

        // Complete survival verification
        setup.advance_time(SIX_MONTHS_SECS + 1000);
        let tree_id = 1u64;
        setup.tree_escrow.submit_survival_report(&setup.oracle, &tree_id, &SURVIVAL_RATE);
        
        let survival_proof = setup.generate_proof_hash();
        setup.tree_escrow.verify_survival(&setup.planter, &survival_proof, &SURVIVAL_RATE);

        // Now test carbon credit burning
        println!("1️⃣ Corporate buyer burns TREE tokens for ESG...");
        
        let corporate_buyer = Address::generate(&setup.env);
        let burn_amount = TREE_COUNT * 1_000_000; // All TREE tokens
        
        // Transfer TREE tokens to corporate buyer first
        token::Client::new(&setup.env, &setup.tree_token).transfer(
            &setup.sponsor,
            &corporate_buyer,
            &burn_amount,
        );
        
        // Burn tokens for ESG claim
        let esg_reference = soroban_sdk::String::from_str(&setup.env, "ESG-REPORT-2026-Q1");
        setup.tree_token_client.burn(&corporate_buyer, &burn_amount, &esg_reference);
        
        // Verify burn record was created
        let burn_record = setup.tree_token_client.get_burn_record(&0).unwrap();
        assert_eq!(burn_record.burner, corporate_buyer);
        assert_eq!(burn_record.token_count, burn_amount);
        assert_eq!(burn_record.esg_reference, esg_reference);
        
        // Verify tokens were actually burned
        let final_balance = token::Client::new(&setup.env, &setup.tree_token).balance(&corporate_buyer);
        assert_eq!(final_balance, 0);
        
        println!("  ✅ {} TREE tokens burned for ESG", burn_amount);
        println!("  ✅ CO2 offset claimed: {} kg", (burn_amount / 1_000_000) * 48);
        
        let burn_count = setup.tree_token_client.burn_count();
        assert_eq!(burn_count, 1);
        
        println!("\n🔥 Carbon Credit Burning Summary:");
        println!("  ✅ Tokens burned: {} TREE", burn_amount);
        println!("  ✅ ESG reference: {}", esg_reference);
        println!("  ✅ CO2 offset: {} kg", (burn_amount / 1_000_000) * 48);
        println!("  ✅ Burn records created: {}", burn_count);
    }
}