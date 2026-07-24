import re

def patch_tree_escrow():
    with open('contracts/tree-escrow/src/lib.rs', 'r') as f:
        content = f.read()

    # 1. Update AmmInterface
    content = content.replace(
        "fn withdraw(env: Env, from: Address, token: Address, share_amount: i128) -> i128;",
        "fn withdraw(env: Env, from: Address, token: Address, share_amount: i128) -> i128;\n    fn swap(env: Env, from: Address, token_in: Address, token_out: Address, amount_in: i128) -> i128;"
    )

    # 2. Update ADMINTREE tuple reads
    content = content.replace(
        "(Address, Address, u32, Address)",
        "(Address, Address, u32, Address, Address, Address)"
    )
    content = content.replace(
        "let (_, _, _, amm):",
        "let (_, _, _, amm, xlm, usdc):"
    )
    content = content.replace(
        "let (admin, tree_token, tree_decimals, amm):",
        "let (admin, tree_token, tree_decimals, amm, _xlm, _usdc):"
    )
    content = content.replace(
        "let (admin, _tree_token, _tree_decimals, amm):",
        "let (admin, _tree_token, _tree_decimals, amm, _xlm, _usdc):"
    )
    content = content.replace(
        "let (_admin, tree_token, _decimals, _amm):",
        "let (_admin, tree_token, _decimals, _amm, _xlm, _usdc):"
    )
    content = content.replace(
        "let (admin, _tree_token, _decimals, _amm):",
        "let (admin, _tree_token, _decimals, _amm, _xlm, _usdc):"
    )

    # 3. Update initialize
    content = content.replace(
        "pub fn initialize(env: Env, admin: Address, tree_token: Address, amm: Address) {",
        "pub fn initialize(env: Env, admin: Address, tree_token: Address, amm: Address, xlm: Address, usdc: Address) {"
    )
    content = content.replace(
        "&(admin, tree_token, tree_decimals, amm),",
        "&(admin, tree_token, tree_decimals, amm, xlm, usdc),"
    )

    # 4. Update deposit
    deposit_orig = """        let (_, _, _, amm, xlm, usdc): (Address, Address, u32, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMINTREE")).expect("contract not initialized");
        let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &amount);"""
    
    deposit_new = """        let (_, _, _, amm, xlm, usdc): (Address, Address, u32, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMINTREE")).expect("contract not initialized");
        
        let fee = (amount * 200) / 10_000;
        let net_amount = amount - fee;

        if fee > 0 && token == xlm {
            let swap_amount = fee / 2;
            AmmClient::new(&env, &amm).swap(&env.current_contract_address(), &xlm, &usdc, &swap_amount);
        }

        let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &net_amount);"""
    content = content.replace(deposit_orig, deposit_new)
    
    # Fix total_amount in deposit
    content = content.replace("total_amount: amount,", "total_amount: net_amount,")
    # Fix amount in deposit event
    content = content.replace("symbol_short!(\"deposit\"), farmer), amount);", "symbol_short!(\"deposit\"), farmer), net_amount);")

    # 5. Update batch_deposit
    batch_orig = """        let (_, _, _, amm, xlm, usdc): (Address, Address, u32, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMINTREE")).expect("contract not initialized");
        let total_lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &total);"""
    batch_new = """        let (_, _, _, amm, xlm, usdc): (Address, Address, u32, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMINTREE")).expect("contract not initialized");
        
        let fee = (total * 200) / 10_000;
        let net_total = total - fee;

        if fee > 0 && token == xlm {
            let swap_amount = fee / 2;
            AmmClient::new(&env, &amm).swap(&env.current_contract_address(), &xlm, &usdc, &swap_amount);
        }

        let total_lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &net_total);"""
    content = content.replace(batch_orig, batch_new)

    # Fix variables in batch_deposit
    content = content.replace("let mut slot_shares = (slot.amount * total_lp_shares) / total;", "let slot_net = slot.amount - (slot.amount * 200) / 10_000;\n            let mut slot_shares = if net_total > 0 { (slot_net * total_lp_shares) / net_total } else { 0 };")
    content = content.replace("total_amount: slot.amount,", "total_amount: slot_net,")
    content = content.replace("symbol_short!(\"deposit\"), slot.farmer), slot.amount);", "symbol_short!(\"deposit\"), slot.farmer), slot_net);")
    content = content.replace("symbol_short!(\"batch\"), donor), total);", "symbol_short!(\"batch\"), donor), net_total);")

    # 6. Update MockAmm in tests
    mock_amm_orig = """        pub fn withdraw(env: Env, from: Address, token: Address, shares: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&caller, &from, &shares);
            shares
        }"""
    mock_amm_new = """        pub fn withdraw(env: Env, from: Address, token: Address, shares: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&caller, &from, &shares);
            shares
        }
        pub fn swap(env: Env, from: Address, token_in: Address, _token_out: Address, amount_in: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token_in).transfer(&from, &caller, &amount_in);
            amount_in
        }"""
    content = content.replace(mock_amm_orig, mock_amm_new)

    # 7. Update setup in tests
    setup_orig = "client.initialize(&admin, &tree_token, &amm);"
    setup_new = """let xlm = token.clone();
        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        client.initialize(&admin, &tree_token, &amm, &xlm, &usdc);"""
    content = content.replace(setup_orig, setup_new)

    with open('contracts/tree-escrow/src/lib.rs', 'w') as f:
        f.write(content)

def patch_escrow_milestone():
    with open('contracts/escrow-milestone/src/lib.rs', 'r') as f:
        content = f.read()

    # 1. Update AmmInterface
    content = content.replace(
        "fn withdraw(env: Env, from: Address, token: Address, share_amount: i128) -> i128;",
        "fn withdraw(env: Env, from: Address, token: Address, share_amount: i128) -> i128;\n    fn swap(env: Env, from: Address, token_in: Address, token_out: Address, amount_in: i128) -> i128;"
    )

    # 2. Update ADMIN tuple reads
    content = content.replace(
        "(Address, Address)",
        "(Address, Address, Address, Address)"
    )
    content = content.replace(
        "let (_, amm):",
        "let (_, amm, xlm, usdc):"
    )
    content = content.replace(
        "let (admin, amm):",
        "let (admin, amm, _xlm, _usdc):"
    )

    # 3. Update initialize
    content = content.replace(
        "pub fn initialize(env: Env, admin: Address, amm: Address) {",
        "pub fn initialize(env: Env, admin: Address, amm: Address, xlm: Address, usdc: Address) {"
    )
    content = content.replace(
        "&(admin, amm)",
        "&(admin, amm, xlm, usdc)"
    )

    # 4. Update deposit
    deposit_orig = """        let (_, amm, xlm, usdc): (Address, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).expect("contract not initialized");
        let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &amount);"""
    
    deposit_new = """        let (_, amm, xlm, usdc): (Address, Address, Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).expect("contract not initialized");
        
        let fee = (amount * 200) / 10_000;
        let net_amount = amount - fee;

        if fee > 0 && token == xlm {
            let swap_amount = fee / 2;
            AmmClient::new(&env, &amm).swap(&env.current_contract_address(), &xlm, &usdc, &swap_amount);
        }

        let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &net_amount);"""
    content = content.replace(deposit_orig, deposit_new)
    
    # Fix total_amount in deposit
    content = content.replace("total_amount: amount,", "total_amount: net_amount,")
    content = content.replace("symbol_short!(\"deposit\"), farmer), amount);", "symbol_short!(\"deposit\"), farmer), net_amount);")

    # 6. Update MockAmm in tests
    mock_amm_orig = """        pub fn withdraw(env: Env, from: Address, token: Address, shares: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&caller, &from, &shares);
            shares
        }"""
    mock_amm_new = """        pub fn withdraw(env: Env, from: Address, token: Address, shares: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&caller, &from, &shares);
            shares
        }
        pub fn swap(env: Env, from: Address, token_in: Address, _token_out: Address, amount_in: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token_in).transfer(&from, &caller, &amount_in);
            amount_in
        }"""
    content = content.replace(mock_amm_orig, mock_amm_new)

    # 7. Update setup in tests
    setup_orig = "client.initialize(&admin, &amm);"
    setup_new = """let xlm = token.clone();
        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        client.initialize(&admin, &amm, &xlm, &usdc);"""
    content = content.replace(setup_orig, setup_new)

    with open('contracts/escrow-milestone/src/lib.rs', 'w') as f:
        f.write(content)

patch_tree_escrow()
patch_escrow_milestone()
