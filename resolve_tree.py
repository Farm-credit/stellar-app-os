import re

with open("contracts/tree-escrow/src/lib.rs", "r") as f:
    text = f.read()

# 1. lp_shares
text = text.replace("""<<<<<<< HEAD
    pub lp_shares: i128,
=======
    pub year_proof: BytesN<32>,
    /// Ledger timestamp after which the job can be expired if still unaccepted (Closes #517)
    pub expiry_deadline: u64,
>>>>>>> upstream/main""", """    pub lp_shares: i128,
    pub year_proof: BytesN<32>,
    /// Ledger timestamp after which the job can be expired if still unaccepted (Closes #517)
    pub expiry_deadline: u64,""")

# 2. initialize
text = text.replace("""<<<<<<< HEAD
    /// The escrow contract must be the TREE token admin so it can mint rewards
    /// when planting verification is confirmed.
    ///
    /// OPTIMIZED: Cache tree token decimals to avoid repeated calculations
    pub fn initialize(env: Env, admin: Address, tree_token: Address, amm: Address) {
        if env.storage().instance().has(&symbol_short!("ADMINTREE")) {
            panic!("already initialized");
=======
    /// * `admin` — controls planting verification, refunds, and tree registration
    /// * `tree_token` — TREE reward token; the contract must be its admin
    /// * `oracle` — the only address allowed to submit survival reports
    /// * `survival_threshold_percent` — minimum survival rate (0..=100) for Tranche 2 release
    /// * `min_density` — minimum trees per hectare for jobs above size threshold
    /// * `job_size_threshold` — minimum job size (hectares) for density rules to apply
    pub fn initialize(
        env: Env,
        admin: Address,
        tree_token: Address,
        oracle: Address,
        survival_threshold_percent: u32,
        min_density: i128,
        job_size_threshold: i128,
    ) {
        if env.storage().instance().has(&DataKey::AdminTree) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        if survival_threshold_percent > 100 {
            panic_with_error!(&env, HarvestaError::SurvivalThresholdOutOfRange);
        }
        if min_density <= 0 {
            panic!("min density must be positive");
        }
        if job_size_threshold <= 0 {
            panic!("job size threshold must be positive");
>>>>>>> upstream/main""", """    pub fn initialize(
        env: Env,
        admin: Address,
        tree_token: Address,
        oracle: Address,
        survival_threshold_percent: u32,
        min_density: i128,
        job_size_threshold: i128,
        amm: Address,
    ) {
        if env.storage().instance().has(&DataKey::AdminTree) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        if survival_threshold_percent > 100 {
            panic_with_error!(&env, HarvestaError::SurvivalThresholdOutOfRange);
        }
        if min_density <= 0 {
            panic!("min density must be positive");
        }
        if job_size_threshold <= 0 {
            panic!("job size threshold must be positive");""")

# 3. initialize setting
text = text.replace("""<<<<<<< HEAD
        // OPTIMIZATION: Store admin and tree token as tuple (reduces reads from 2 to 1)
        env.storage().instance().set(
            &symbol_short!("ADMINTREE"),
            &(admin, tree_token, tree_decimals, amm),
        );
=======
        env.storage()
            .instance()
            .set(&DataKey::AdminTree, &(admin, tree_token, tree_decimals));
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&DataKey::SurvivalThreshold, &survival_threshold_percent);
        env.storage()
            .instance()
            .set(&DataKey::MinDensity, &min_density);
        env.storage()
            .instance()
            .set(&DataKey::JobSizeThreshold, &job_size_threshold);
>>>>>>> upstream/main""", """        env.storage()
            .instance()
            .set(&DataKey::AdminTree, &(admin, tree_token, tree_decimals, amm));
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&DataKey::SurvivalThreshold, &survival_threshold_percent);
        env.storage()
            .instance()
            .set(&DataKey::MinDensity, &min_density);
        env.storage()
            .instance()
            .set(&DataKey::JobSizeThreshold, &job_size_threshold);""")

# 4. deposit lp_shares
text = text.replace("""<<<<<<< HEAD
        let (_, _, _, amm): (Address, Address, u32, Address) = env.storage().instance().get(&symbol_short!("ADMINTREE")).expect("contract not initialized");
        let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &amount);

=======
        let empty_hash = BytesN::from_array(&env, &[0; 32]);
>>>>>>> upstream/main""", """        let (_, _, _, amm): (Address, Address, u32, Address) = env.storage().instance().get(&DataKey::AdminTree).expect("contract not initialized");
        let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &amount);
        let empty_hash = BytesN::from_array(&env, &[0; 32]);""")

# 5. deposit record
text = text.replace("""<<<<<<< HEAD
                lp_shares,
=======
                year_proof: empty_hash,
                expiry_deadline: env.ledger().timestamp() + JOB_EXPIRY_SECS,
>>>>>>> upstream/main""", """                lp_shares,
                year_proof: empty_hash,
                expiry_deadline: env.ledger().timestamp() + JOB_EXPIRY_SECS,""")

# 6. batch deposit amm
text = text.replace("""<<<<<<< HEAD
        let (_, _, _, amm): (Address, Address, u32, Address) = env.storage().instance().get(&symbol_short!("ADMINTREE")).expect("contract not initialized");
        let total_lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &total);
        let mut allocated_shares = 0;

        // Write one escrow record per slot
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            let key = Self::record_key(&env, &slot.farmer);
            let mut slot_shares = (slot.amount * total_lp_shares) / total;
            if i == n - 1 {
                slot_shares = total_lp_shares - allocated_shares;
            } else {
                allocated_shares += slot_shares;
            }
=======
        let zero_hash = BytesN::from_array(&env, &[0; 32]);
        for i in 0..n {
            let slot = slots.get(i).unwrap();
            let key = DataKey::Escrow(slot.farmer.clone());
>>>>>>> upstream/main""", """        let (_, _, _, amm): (Address, Address, u32, Address) = env.storage().instance().get(&DataKey::AdminTree).expect("contract not initialized");
        let total_lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &total);
        let mut allocated_shares = 0;
        let zero_hash = BytesN::from_array(&env, &[0; 32]);

        for i in 0..n {
            let slot = slots.get(i).unwrap();
            let key = DataKey::Escrow(slot.farmer.clone());
            let mut slot_shares = (slot.amount * total_lp_shares) / total;
            if i == n - 1 {
                slot_shares = total_lp_shares - allocated_shares;
            } else {
                allocated_shares += slot_shares;
            }""")

# 7. batch deposit lp_shares
text = text.replace("""<<<<<<< HEAD
                    lp_shares: slot_shares,
=======
                    year_proof: zero_hash.clone(),
                    expiry_deadline: env.ledger().timestamp() + JOB_EXPIRY_SECS,
>>>>>>> upstream/main""", """                    lp_shares: slot_shares,
                    year_proof: zero_hash.clone(),
                    expiry_deadline: env.ledger().timestamp() + JOB_EXPIRY_SECS,""")

# 8. verify progress admintree
text = text.replace("""<<<<<<< HEAD
        // OPTIMIZATION: Single read for admin, tree token, and decimals (was 2 reads)
        let (admin, tree_token, tree_decimals, amm): (Address, Address, u32, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMINTREE"))
            .expect("contract not initialized");

=======
        let (admin, tree_token, tree_decimals) = Self::admin_tree(&env);
>>>>>>> upstream/main""", """        let (admin, tree_token, tree_decimals, amm) = Self::admin_tree(&env);""")

# 9. verify progress logic
text = text.replace("""<<<<<<< HEAD
        let tranche1_shares = (rec.lp_shares * TRANCHE_1_BPS) / BPS_DENOM;
        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &rec.token, &tranche1_shares);

        // OPTIMIZATION: Use cached decimals instead of calling token_unit() (saves computation)
        let tree_token_unit = Self::compute_token_unit(tree_decimals);
=======
        let tranche1 = rec
            .total_amount
            .checked_mul(TRANCHE_1_BPS)
            .expect("tranche1 calculation overflow")
            .checked_div(BPS_DENOM)
            .expect("tranche1 division error");
        let tree_unit = Self::compute_token_unit(tree_decimals);
>>>>>>> upstream/main""", """        let tranche1 = rec
            .total_amount
            .checked_mul(TRANCHE_1_BPS)
            .expect("tranche1 calculation overflow")
            .checked_div(BPS_DENOM)
            .expect("tranche1 division error");
        let tranche1_shares = (rec.lp_shares * TRANCHE_1_BPS) / BPS_DENOM;
        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &rec.token, &tranche1_shares);
        let tree_unit = Self::compute_token_unit(tree_decimals);""")

# 9.1 replace tree_token_unit with tree_unit
text = text.replace("let tree_tokens = verified_tree_count\n            .checked_mul(tree_token_unit)", "let tree_tokens = verified_tree_count\n            .checked_mul(tree_unit)")

# 10. verify progress withdrawn
text = text.replace("""<<<<<<< HEAD
            &withdrawn_amount,
        );
        token::StellarAssetClient::new(&env, &tree_token).mint(&rec.donor, &tree_tokens);

        rec.released += tranche1;
        rec.lp_shares -= tranche1_shares;
        rec.verified_tree_count = verified_tree_count;
        rec.tree_tokens_minted = tree_tokens;
        rec.status = EscrowStatus::Planted;
        rec.planted_at = OptU64::Some(env.ledger().timestamp());
        rec.planting_proof = OptProof::Some(proof_hash.clone());

        env.storage().persistent().set(&key, &rec);
=======
            &stream_amount,
        );
>>>>>>> upstream/main""", """            &withdrawn_amount,
        );""")
# wait, wait! The upstream branch changed verify_progress to release `stream_amount` (10%) and NOT `tranche1` (30%). It was completely revamped!
# Let me look closely at upstream verify_progress.

with open("contracts/tree-escrow/src/lib.rs", "w") as f:
    f.write(text)
