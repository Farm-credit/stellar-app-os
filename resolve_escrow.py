import re

with open("contracts/escrow-milestone/src/lib.rs", "r") as f:
    content = f.read()

# Conflict 1
c1 = """<<<<<<< HEAD
        state.released += payout;
        state.lp_shares -= payout_shares;
=======
        state.released = state
            .released
            .checked_add(payout)
            .expect("released amount overflow");
>>>>>>> upstream/main"""
r1 = """        state.released = state
            .released
            .checked_add(payout)
            .expect("released amount overflow");
        state.lp_shares -= payout_shares;"""
content = content.replace(c1, r1)

# Conflict 2
c2 = """        let release_amount = (state.total_amount * MILESTONE_1_BPS) / BPS_DENOM;
<<<<<<< HEAD
        let release_shares = (state.lp_shares * MILESTONE_1_BPS) / BPS_DENOM;
=======
        let release_amount = state
            .total_amount
            .checked_mul(MILESTONE_1_BPS)
            .expect("release amount overflow")
            .checked_div(BPS_DENOM)
            .expect("release amount division error");
>>>>>>> upstream/main"""
r2 = """        let release_amount = state
            .total_amount
            .checked_mul(MILESTONE_1_BPS)
            .expect("release amount overflow")
            .checked_div(BPS_DENOM)
            .expect("release amount division error");
        let release_shares = (state.lp_shares * MILESTONE_1_BPS) / BPS_DENOM;"""
content = content.replace(c2, r2)

# Conflict 3
c3 = """        let remainder = state.total_amount - state.released;
<<<<<<< HEAD
        let (_, amm): (Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).expect("contract not initialized");
=======
        let remainder = state
            .total_amount
            .checked_sub(state.released)
            .expect("remainder calculation underflow");
>>>>>>> upstream/main"""
r3 = """        let remainder = state
            .total_amount
            .checked_sub(state.released)
            .expect("remainder calculation underflow");
        let (_, amm): (Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).expect("contract not initialized");"""
content = content.replace(c3, r3)

# Conflict 4
c4 = """<<<<<<< HEAD
        state.released += remainder;
        state.lp_shares = 0;
=======
        state.released = state
            .released
            .checked_add(remainder)
            .expect("released amount overflow");
>>>>>>> upstream/main"""
r4 = """        state.released = state
            .released
            .checked_add(remainder)
            .expect("released amount overflow");
        state.lp_shares = 0;"""
content = content.replace(c4, r4)

# Conflict 5
c5 = """<<<<<<< HEAD
        let remainder = state.total_amount - state.released;
        let (_, amm): (Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).expect("contract not initialized");
=======
        let remainder = state
            .total_amount
            .checked_sub(state.released)
            .expect("remainder calculation underflow");
>>>>>>> upstream/main"""
r5 = """        let remainder = state
            .total_amount
            .checked_sub(state.released)
            .expect("remainder calculation underflow");
        let (_, amm): (Address, Address) = env.storage().instance().get(&symbol_short!("ADMIN")).expect("contract not initialized");"""
content = content.replace(c5, r5)

# Conflict 6
c6 = """<<<<<<< HEAD
                state.released += remainder;
        state.lp_shares = 0;
=======
                state.released = state
                    .released
                    .checked_add(remainder)
                    .expect("released amount overflow");
>>>>>>> upstream/main"""
r6 = """                state.released = state
                    .released
                    .checked_add(remainder)
                    .expect("released amount overflow");
                state.lp_shares = 0;"""
content = content.replace(c6, r6)

# Conflict 7
c7 = """<<<<<<< HEAD
        let amm = env.register_contract(None, MockAmm);
        client.initialize(&admin, &amm);
=======
        client.initialize(&admin);
        client.add_to_whitelist(&token);
>>>>>>> upstream/main"""
r7 = """        let amm = env.register_contract(None, MockAmm);
        client.initialize(&admin, &amm);
        client.add_to_whitelist(&token);"""
content = content.replace(c7, r7)

with open("contracts/escrow-milestone/src/lib.rs", "w") as f:
    f.write(content)
