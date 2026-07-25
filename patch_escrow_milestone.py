import re

with open("contracts/escrow-milestone/src/lib.rs", "r") as f:
    content = f.read()

# Add AmmClient and lp_shares
content = content.replace(
    "pub struct EscrowState {",
    "#[soroban_sdk::contractclient(name = \"AmmClient\")]\n"
    "pub trait AmmInterface {\n"
    "    fn deposit(env: Env, from: Address, token: Address, amount: i128) -> i128;\n"
    "    fn withdraw(env: Env, from: Address, token: Address, share_amount: i128) -> i128;\n"
    "}\n\n"
    "#[contracttype]\n"
    "#[derive(Clone, Debug)]\n"
    "pub struct EscrowState {"
)

content = content.replace(
    "pub dispute_open: bool,\n}",
    "pub dispute_open: bool,\n    pub lp_shares: i128,\n}"
)

# initialize
content = content.replace(
    "pub fn initialize(env: Env, admin: Address) {",
    "pub fn initialize(env: Env, admin: Address, amm: Address) {"
)
content = content.replace(
    ".set(&symbol_short!(\"ADMIN\"), &admin);",
    ".set(&symbol_short!(\"ADMIN\"), &(admin, amm));"
)

# require_admin
content = content.replace(
    "let admin: Address = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))",
    "let (admin, _amm): (Address, Address) = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))"
)

# deposit
content = content.replace(
    "token::Client::new(&env, &token).transfer(\n            &funder,\n            &env.current_contract_address(),\n            &amount,\n        );",
    "token::Client::new(&env, &token).transfer(\n            &funder,\n            &env.current_contract_address(),\n            &amount,\n        );\n\n        "
    "let (_, amm): (Address, Address) = env.storage().instance().get(&symbol_short!(\"ADMIN\")).expect(\"contract not initialized\");\n        "
    "let lp_shares = AmmClient::new(&env, &amm).deposit(&env.current_contract_address(), &token, &amount);"
)
content = content.replace(
    "dispute_open: false,\n        });",
    "dispute_open: false,\n            lp_shares,\n        });"
)

# release_partial
content = content.replace(
    "let admin: Address = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))\n            .expect(\"contract not initialized\");",
    "let (admin, amm): (Address, Address) = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))\n            .expect(\"contract not initialized\");"
)
content = content.replace(
    "let payout = (state.total_amount * completion_pct as i128) / 100;",
    "let payout = (state.total_amount * completion_pct as i128) / 100;\n        let remainder = state.total_amount - state.released;\n        let payout_shares = if remainder > 0 { (payout * state.lp_shares) / remainder } else { 0 };"
)
content = content.replace(
    "token::Client::new(&env, &state.token).transfer(\n            &env.current_contract_address(),\n            &state.farmer,\n            &payout,\n        );",
    "let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &payout_shares);\n        token::Client::new(&env, &state.token).transfer(\n            &env.current_contract_address(),\n            &state.farmer,\n            &withdrawn_amount,\n        );"
)
content = content.replace(
    "state.released += payout;",
    "state.released += payout;\n        state.lp_shares -= payout_shares;"
)

# verify_milestone
content = content.replace(
    "let admin: Address = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))\n            .expect(\"contract not initialized\");",
    "let (admin, amm): (Address, Address) = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))\n            .expect(\"contract not initialized\");"
)
content = content.replace(
    "let release_amount = (state.total_amount * MILESTONE_1_BPS) / BPS_DENOM;",
    "let release_amount = (state.total_amount * MILESTONE_1_BPS) / BPS_DENOM;\n        let release_shares = (state.lp_shares * MILESTONE_1_BPS) / BPS_DENOM;"
)
content = content.replace(
    "token::Client::new(&env, &state.token).transfer(\n            &env.current_contract_address(),\n            &state.farmer,\n            &release_amount,\n        );",
    "let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &release_shares);\n        token::Client::new(&env, &state.token).transfer(\n            &env.current_contract_address(),\n            &state.farmer,\n            &withdrawn_amount,\n        );"
)
content = content.replace(
    "state.released = release_amount;",
    "state.released = release_amount;\n        state.lp_shares -= release_shares;"
)

# verify_survival
content = content.replace(
    "let admin: Address = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))\n            .expect(\"contract not initialized\");",
    "let (admin, amm): (Address, Address) = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))\n            .expect(\"contract not initialized\");"
)
content = content.replace(
    "token::Client::new(&env, &state.token)\n            .transfer(&env.current_contract_address(), &state.farmer, &remainder);",
    "let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &state.lp_shares);\n        token::Client::new(&env, &state.token).transfer(&env.current_contract_address(), &state.farmer, &withdrawn_amount);"
)
content = content.replace(
    "state.released += remainder;",
    "state.released += remainder;\n        state.lp_shares = 0;"
)

# resolve_dispute
content = content.replace(
    "let remainder = state.total_amount - state.released;",
    "let remainder = state.total_amount - state.released;\n        let (_, amm): (Address, Address) = env.storage().instance().get(&symbol_short!(\"ADMIN\")).expect(\"contract not initialized\");"
)
content = content.replace(
    "token::Client::new(&env, &state.token).transfer(\n                    &env.current_contract_address(),\n                    &state.farmer,\n                    &remainder,\n                );",
    "let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &state.lp_shares);\n                token::Client::new(&env, &state.token).transfer(\n                    &env.current_contract_address(),\n                    &state.farmer,\n                    &withdrawn_amount,\n                );"
)
content = content.replace(
    "token::Client::new(&env, &state.token).transfer(\n                    &env.current_contract_address(),\n                    &state.funder,\n                    &remainder,\n                );",
    "let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &state.lp_shares);\n                token::Client::new(&env, &state.token).transfer(\n                    &env.current_contract_address(),\n                    &state.funder,\n                    &withdrawn_amount,\n                );"
)
content = content.replace(
    "state.released += remainder;\n            }",
    "state.released += remainder;\n            }\n            state.lp_shares = 0;"
)
content = content.replace(
    "state.status = EscrowStatus::Refunded;\n        }",
    "state.lp_shares = 0;\n            state.status = EscrowStatus::Refunded;\n        }"
)

# refund
content = content.replace(
    "let admin: Address = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))\n            .expect(\"contract not initialized\");",
    "let (admin, amm): (Address, Address) = env\n            .storage()\n            .instance()\n            .get(&symbol_short!(\"ADMIN\"))\n            .expect(\"contract not initialized\");"
)
content = content.replace(
    "token::Client::new(&env, &state.token).transfer(\n            &env.current_contract_address(),\n            &state.funder,\n            &state.total_amount,\n        );",
    "let withdrawn_amount = AmmClient::new(&env, &amm).withdraw(&env.current_contract_address(), &state.token, &state.lp_shares);\n        token::Client::new(&env, &state.token).transfer(\n            &env.current_contract_address(),\n            &state.funder,\n            &withdrawn_amount,\n        );"
)
content = content.replace(
    "state.status = EscrowStatus::Refunded;",
    "state.status = EscrowStatus::Refunded;\n        state.lp_shares = 0;"
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
    "client.initialize(&admin);",
    "let amm = env.register_contract(None, MockAmm);\n        client.initialize(&admin, &amm);"
)

with open("contracts/escrow-milestone/src/lib.rs", "w") as f:
    f.write(content)

