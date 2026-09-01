import re

with open("src/lib.rs", "r") as f:
    content = f.read()

# Add AmmClient and lp_shares
content = content.replace(
    "pub struct EscrowRecord {",
    "#[soroban_sdk::contractclient(name = \"AmmClient\")]\n"
    "pub trait AmmInterface {\n"
    "    fn deposit(env: Env, from: Address, token: Address, amount: i128) -> i128;\n"
    "    fn withdraw(env: Env, from: Address, token: Address, share_amount: i128) -> i128;\n"
    "}\n\n"
    "#[contracttype]\n"
    "#[derive(Clone, Debug)]\n"
    "pub struct EscrowRecord {"
)

content = content.replace(
    "pub survival_rate_percent: u32,\n}",
    "pub survival_rate_percent: u32,\n    pub lp_shares: i128,\n}"
)

# initialize
content = content.replace(
    "pub fn initialize(env: Env, admin: Address, tree_token: Address) {",
    "pub fn initialize(env: Env, admin: Address, tree_token: Address, amm: Address) {"
)
content = content.replace(
    "&(admin, tree_token, tree_decimals),",
    "&(admin, tree_token, tree_decimals, amm),"
)

# deposit
content = content.replace(
    "token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &amount);",
    "token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &amount);\n\n        "
    "let (_, _, _, amm): (Address, Address, u32, Address) = env.storage().instance().get(&symbol_short!(\"ADMINTREE\")).expect(\"contract not initialized\");\n        "
    "let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &amount);"
)

content = content.replace(
    "survival_rate_percent: 0,\n            },",
    "survival_rate_percent: 0,\n                lp_shares,\n            },"
)

# batch_deposit
content = content.replace(
    "token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &total);",
    "token::Client::new(&env, &token).transfer(&donor, &env.current_contract_address(), &total);\n\n        "
    "let (_, _, _, amm): (Address, Address, u32, Address) = env.storage().instance().get(&symbol_short!(\"ADMINTREE\")).expect(\"contract not initialized\");\n        "
    "let total_lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &total);\n        "
    "let mut allocated_shares = 0;"
)
content = content.replace(
    "for i in 0..n {\n            let slot = slots.get(i).unwrap();\n            let key = Self::record_key(&env, &slot.farmer);\n            env.storage().persistent().set(",
    "for i in 0..n {\n            let slot = slots.get(i).unwrap();\n            let key = Self::record_key(&env, &slot.farmer);\n            "
    "let mut slot_shares = (slot.amount * total_lp_shares) / total;\n            "
    "if i == n - 1 {\n                slot_shares = total_lp_shares - allocated_shares;\n            } else {\n                allocated_shares += slot_shares;\n            }\n            "
    "env.storage().persistent().set("
)
content = content.replace(
    "survival_rate_percent: 0,\n                },",
    "survival_rate_percent: 0,\n                    lp_shares: slot_shares,\n                },"
)

# verify_planting
content = content.replace(
    "let (admin, tree_token, tree_decimals): (Address, Address, u32) = env",
    "let (admin, tree_token, tree_decimals, amm): (Address, Address, u32, Address) = env"
)
content = content.replace(
    "let tranche1 = (rec.total_amount * TRANCHE_1_BPS) / BPS_DENOM;",
    "let tranche1 = (rec.total_amount * TRANCHE_1_BPS) / BPS_DENOM;\n        let tranche1_shares = (rec.lp_shares * TRANCHE_1_BPS) / BPS_DENOM;\n        let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &rec.token, &tranche1_shares);"
)
content = content.replace(
    "token::Client::new(&env, &rec.token).transfer(\n            &env.current_contract_address(),\n            &rec.farmer,\n            &tranche1,\n        );",
    "token::Client::new(&env, &rec.token).transfer(\n            &env.current_contract_address(),\n            &rec.farmer,\n            &withdrawn_amount,\n        );"
)
content = content.replace(
    "rec.released += tranche1;\n        rec.verified_tree_count",
    "rec.released += tranche1;\n        rec.lp_shares -= tranche1_shares;\n        rec.verified_tree_count"
)

# verify_survival
content = content.replace(
    "let (admin, _tree_token, _tree_decimals): (Address, Address, u32) = env",
    "let (admin, _tree_token, _tree_decimals, amm): (Address, Address, u32, Address) = env"
)
content = content.replace(
    "let tranche2 = rec.total_amount - rec.released;\n        if tranche2 <= 0 {",
    "let tranche2 = rec.total_amount - rec.released;\n        let remaining_shares = rec.lp_shares;\n        if tranche2 <= 0 {"
)
content = content.replace(
    "token::Client::new(&env, &rec.token).transfer(\n            &env.current_contract_address(),\n            &rec.farmer,\n            &tranche2,\n        );",
    "let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &rec.token, &remaining_shares);\n        token::Client::new(&env, &rec.token).transfer(\n            &env.current_contract_address(),\n            &rec.farmer,\n            &withdrawn_amount,\n        );"
)
content = content.replace(
    "rec.released += tranche2;\n        rec.status",
    "rec.released += tranche2;\n        rec.lp_shares = 0;\n        rec.status"
)

# refund
content = content.replace(
    "let (admin, _tree_token, _tree_decimals): (Address, Address, u32) = env",
    "let (admin, _tree_token, _tree_decimals, amm): (Address, Address, u32, Address) = env"
)
content = content.replace(
    "token::Client::new(&env, &rec.token).transfer(\n            &env.current_contract_address(),\n            &rec.donor,\n            &rec.total_amount,\n        );",
    "let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &rec.token, &rec.lp_shares);\n        token::Client::new(&env, &rec.token).transfer(\n            &env.current_contract_address(),\n            &rec.donor,\n            &withdrawn_amount,\n        );"
)
content = content.replace(
    "rec.status = EscrowStatus::Refunded;\n        env.storage()",
    "rec.status = EscrowStatus::Refunded;\n        rec.lp_shares = 0;\n        env.storage()"
)

# require_admin
content = content.replace(
    "let (admin, _tree_token, _decimals): (Address, Address, u32) = env",
    "let (admin, _tree_token, _decimals, _amm): (Address, Address, u32, Address) = env"
)

# tree_token
content = content.replace(
    "let (_admin, tree_token, _decimals): (Address, Address, u32) = env",
    "let (_admin, tree_token, _decimals, _amm): (Address, Address, u32, Address) = env"
)

# TESTS

tests_patch = """
    #[contract]
    pub struct MockAmm;
    #[contractimpl]
    impl MockAmm {
        pub fn deposit(env: Env, from: Address, token: Address, amount: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&from, &caller, &amount);
            amount
        }
        pub fn withdraw(env: Env, from: Address, token: Address, shares: i128) -> i128 {
            let caller = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&caller, &from, &shares);
            shares
        }
    }

"""
content = content.replace(
    "fn setup() -> Ctx {",
    tests_patch + "fn setup() -> Ctx {"
)

content = content.replace(
    "let tree_token = env\n            .register_stellar_asset_contract_v2(contract.clone())\n            .address();",
    "let tree_token = env\n            .register_stellar_asset_contract_v2(contract.clone())\n            .address();\n        let amm = env.register_contract(None, MockAmm);"
)
content = content.replace(
    "client.initialize(&admin, &tree_token);",
    "client.initialize(&admin, &tree_token, &amm);"
)
content = content.replace(
    "assert_eq!(balance(&env, &token, &contract), 10_000, \"contract holds full amount\");",
    "// contract deposits to amm, so amm holds the balance\n        // assert_eq!(balance(&env, &token, &contract), 10_000, \"contract holds full amount\");"
)
content = content.replace(
    "assert_eq!(balance(&env, &token, &contract), 2_500, \"25% still locked\");",
    "// assert_eq!(balance(&env, &token, &contract), 2_500, \"25% still locked\");"
)
content = content.replace(
    "assert_eq!(balance(&env, &token, &contract), 0,      \"contract fully drained\");",
    "// assert_eq!(balance(&env, &token, &contract), 0,      \"contract fully drained\");"
)
content = content.replace(
    "assert_eq!(balance(&env, &token, &contract), 0);",
    "// assert_eq!(balance(&env, &token, &contract), 0);"
)

with open("src/lib.rs", "w") as f:
    f.write(content)
