#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, IntoVal, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum trees per donation
const MAX_TREES: u32 = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DonationStatus {
    Pending,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct DonationRecord {
    pub donor: Address,
    pub token: Address,
    pub amount: i128,
    pub tree_count: u32,
    pub timestamp: u64,
    pub batch_id: u32,
    pub status: DonationStatus,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct DonationEscrow;

#[contractimpl]
impl DonationEscrow {
    /// Initialize contract
    pub fn initialize(env: Env, admin: Address, xlm_token: Address, usdc_token: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }

        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("TOKENS"), &(xlm_token, usdc_token));

        // (current_batch, seq)
        env.storage().instance().set(&symbol_short!("BATCHSEQ"), &(1u32, 0u64));
    }

    /// Donate funds into escrow
    pub fn donate(
        env: Env,
        donor: Address,
        token: Address,
        amount: i128,
        tree_count: u32,
    ) -> u64 {
        donor.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        if tree_count == 0 || tree_count > MAX_TREES {
            panic!("tree_count must be between 1 and 50");
        }

        let (xlm, usdc): (Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("TOKENS"))
            .expect("not initialized");

        if token != xlm && token != usdc {
            panic!("unsupported token");
        }

        let (batch_id, seq): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap();

        let next_seq = seq + 1;

        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(batch_id, next_seq));

        // transfer funds
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );

        let rec = DonationRecord {
            donor: donor.clone(),
            token: token.clone(),
            amount,
            tree_count,
            timestamp: env.ledger().timestamp(),
            batch_id,
            status: DonationStatus::Pending,
        };

        env.storage()
            .persistent()
            .set(&Self::donation_key(&env, next_seq), &rec);

        env.events().publish(
            (symbol_short!("donate"), donor),
            (batch_id, tree_count, amount, token),
        );

        next_seq
    }

    /// Move to next batch
    pub fn advance_batch(env: Env) -> u32 {
        Self::require_admin(&env);

        let (batch_id, seq): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap();

        let next_batch = batch_id + 1;

        env.storage()
            .instance()
            .set(&symbol_short!("BATCHSEQ"), &(next_batch, seq));

        env.events().publish(
            (symbol_short!("batch"), batch_id),
            (next_batch, true),
        );

        next_batch
    }

    /// Release multiple donations
    pub fn release_batch(env: Env, seqs: Vec<u64>, destination: Address) {
        Self::require_admin(&env);

        for i in 0..seqs.len() {
            let seq = seqs.get(i).unwrap();

            let key = Self::donation_key(&env, seq);

            let mut rec: DonationRecord = env
                .storage()
                .persistent()
                .get(&key)
                .expect("not found");

            if rec.status != DonationStatus::Pending {
                panic!("already processed");
            }

            token::Client::new(&env, &rec.token).transfer(
                &env.current_contract_address(),
                &destination,
                &rec.amount,
            );

            rec.status = DonationStatus::Released;

            env.storage().persistent().set(&key, &rec);

            env.events().publish((symbol_short!("release"), seq), rec.amount);
        }
    }

    /// Refund donation
    pub fn refund(env: Env, seq: u64) {
        Self::require_admin(&env);

        let key = Self::donation_key(&env, seq);

        let mut rec: DonationRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("not found");

        if rec.status != DonationStatus::Pending {
            panic!("already processed");
        }

        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.donor,
            &rec.amount,
        );

        rec.status = DonationStatus::Refunded;

        env.storage().persistent().set(&key, &rec);

        env.events().publish((symbol_short!("refund"), seq), rec.amount);
    }

    /// Get donation by seq
    pub fn get_donation(env: Env, seq: u64) -> Option<DonationRecord> {
        env.storage()
            .persistent()
            .get(&Self::donation_key(&env, seq))
    }

    /// Current batch id
    pub fn current_batch(env: Env) -> u32 {
        let (batch_id, _): (u32, u64) = env
            .storage()
            .instance()
            .get(&symbol_short!("BATCHSEQ"))
            .unwrap_or((1, 0));

        batch_id
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn donation_key(env: &Env, seq: u64) -> soroban_sdk::Val {
        (symbol_short!("DON"), seq).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("not initialized");

        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env};

    fn setup() -> (Env, Address, Address, Address, Address, DonationEscrowClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, DonationEscrow);
        let client = DonationEscrowClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);

        let xlm = env.register_stellar_asset_contract(admin.clone());
        let usdc = env.register_stellar_asset_contract(admin.clone());

        token::StellarAssetClient::new(&env, &xlm).mint(&donor, &100_000);
        token::StellarAssetClient::new(&env, &usdc).mint(&donor, &100_000);

        client.initialize(&admin, &xlm, &usdc);

        (env, admin, donor, xlm, usdc, client)
    }

    #[test]
    fn test_donate_and_fetch() {
        let (_env, _admin, donor, xlm, _usdc, client) = setup();

        let seq = client.donate(&donor, &xlm, &5_000, &3);

        let rec = client.get_donation(&seq).unwrap();

        assert_eq!(rec.amount, 5_000);
        assert_eq!(rec.tree_count, 3);
        assert_eq!(rec.status, DonationStatus::Pending);
    }

    #[test]
    fn test_release() {
        let (_env, _admin, donor, xlm, _usdc, client) = setup();

        let seq = client.donate(&donor, &xlm, &5_000, &3);

        let dest = Address::generate(&_env);

        client.release_batch(&soroban_sdk::vec![&_env, seq], &dest);

        let rec = client.get_donation(&seq).unwrap();

        assert_eq!(rec.status, DonationStatus::Released);
    }

    #[test]
    fn test_refund() {
        let (_env, _admin, donor, xlm, _usdc, client) = setup();

        let seq = client.donate(&donor, &xlm, &5_000, &3);

        client.refund(&seq);

        let rec = client.get_donation(&seq).unwrap();

        assert_eq!(rec.status, DonationStatus::Refunded);
    }
}