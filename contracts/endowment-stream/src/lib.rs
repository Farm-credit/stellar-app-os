#![no_std]

//! Benefactor endowment streams with per-second linear vesting (issue #1814).
//!
//! Funds are deposited once by a benefactor and become claimable by the
//! verified recipient as ledger time advances. Claims are permissioned by the
//! recipient, and cancellation is permissioned by the benefactor. Every
//! stream is token-address based, so USDC, CARBON, or the native-asset SAC can
//! use the same interface.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EndowmentError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    InvalidAmount = 3,
    InvalidSchedule = 4,
    StreamNotFound = 5,
    StreamClosed = 6,
    UnsupportedToken = 7,
    NothingToClaim = 8,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Stream {
    pub id: u64,
    pub funder: Address,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub cancelled: bool,
}

#[contracttype]
enum DataKey {
    Admin,
    Tokens,
    Sequence,
    Stream(u64),
}

#[contract]
pub struct EndowmentStream;

#[contractimpl]
impl EndowmentStream {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, EndowmentError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Tokens, &Vec::<Address>::new(&env));
        env.storage().instance().set(&DataKey::Sequence, &0_u64);
    }

    pub fn add_supported_token(env: Env, token: Address) {
        Self::require_admin(&env);
        let mut tokens: Vec<Address> = env.storage().instance().get(&DataKey::Tokens).unwrap();
        if !tokens.contains(&token) {
            tokens.push_back(token);
            env.storage().instance().set(&DataKey::Tokens, &tokens);
        }
    }

    pub fn remove_supported_token(env: Env, token: Address) {
        Self::require_admin(&env);
        let tokens: Vec<Address> = env.storage().instance().get(&DataKey::Tokens).unwrap();
        let mut updated = Vec::new(&env);
        for i in 0..tokens.len() {
            let candidate = tokens.get(i).unwrap();
            if candidate != token {
                updated.push_back(candidate);
            }
        }
        env.storage().instance().set(&DataKey::Tokens, &updated);
    }

    pub fn is_supported_token(env: Env, token: Address) -> bool {
        env.storage().instance().get::<DataKey, Vec<Address>>(&DataKey::Tokens)
            .map(|tokens| tokens.contains(&token))
            .unwrap_or(false)
    }

    /// Deposit a stream. `start_time` may be the current ledger time or a
    /// future time, while `end_time` must be strictly later than start.
    pub fn create_stream(
        env: Env,
        funder: Address,
        recipient: Address,
        token: Address,
        total_amount: i128,
        start_time: u64,
        end_time: u64,
    ) -> u64 {
        funder.require_auth();
        if total_amount <= 0 {
            panic_with_error!(&env, EndowmentError::InvalidAmount);
        }
        if end_time <= start_time {
            panic_with_error!(&env, EndowmentError::InvalidSchedule);
        }
        if !Self::is_supported_token(env.clone(), token.clone()) {
            panic_with_error!(&env, EndowmentError::UnsupportedToken);
        }
        token::Client::new(&env, &token).transfer(
            &funder,
            &env.current_contract_address(),
            &total_amount,
        );

        let id: u64 = env.storage().instance().get(&DataKey::Sequence).unwrap_or(0) + 1;
        env.storage().instance().set(&DataKey::Sequence, &id);
        env.storage().persistent().set(&DataKey::Stream(id), &Stream {
            id,
            funder: funder.clone(),
            recipient: recipient.clone(),
            token,
            total_amount,
            claimed_amount: 0,
            start_time,
            end_time,
            cancelled: false,
        });
        env.events().publish((symbol_short!("created"), id), (funder, recipient, total_amount));
        id
    }

    /// Claim all currently vested, not-yet-claimed funds.
    pub fn claim(env: Env, recipient: Address, stream_id: u64) -> i128 {
        recipient.require_auth();
        let mut stream = Self::load(&env, stream_id);
        if stream.cancelled || stream.claimed_amount >= stream.total_amount {
            panic_with_error!(&env, EndowmentError::StreamClosed);
        }
        if stream.recipient != recipient {
            panic_with_error!(&env, EndowmentError::Unauthorized);
        }
        let vested = Self::vested_amount(&env, &stream);
        let amount = vested - stream.claimed_amount;
        if amount <= 0 {
            panic_with_error!(&env, EndowmentError::NothingToClaim);
        }
        stream.claimed_amount += amount;
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        token::Client::new(&env, &stream.token).transfer(
            &env.current_contract_address(),
            &stream.recipient,
            &amount,
        );
        env.events().publish((symbol_short!("claimed"), stream_id), (recipient, amount));
        amount
    }

    /// Cancel a stream and return its unvested balance to the funder. Vested
    /// funds remain claimable by the recipient after cancellation.
    pub fn cancel(env: Env, funder: Address, stream_id: u64) -> i128 {
        funder.require_auth();
        let mut stream = Self::load(&env, stream_id);
        if stream.cancelled {
            panic_with_error!(&env, EndowmentError::StreamClosed);
        }
        if stream.funder != funder {
            panic_with_error!(&env, EndowmentError::Unauthorized);
        }
        let vested = Self::vested_amount(&env, &stream);
        let refundable = stream.total_amount - vested;
        stream.cancelled = true;
        stream.total_amount = vested;
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        if refundable > 0 {
            token::Client::new(&env, &stream.token).transfer(
                &env.current_contract_address(),
                &stream.funder,
                &refundable,
            );
        }
        env.events().publish((symbol_short!("cancelled"), stream_id), refundable);
        refundable
    }

    pub fn get_stream(env: Env, stream_id: u64) -> Option<Stream> {
        env.storage().persistent().get(&DataKey::Stream(stream_id))
    }

    fn vested_amount(env: &Env, stream: &Stream) -> i128 {
        let now = env.ledger().timestamp();
        if now <= stream.start_time {
            0
        } else if now >= stream.end_time {
            stream.total_amount
        } else {
            let elapsed = (now - stream.start_time) as i128;
            let duration = (stream.end_time - stream.start_time) as i128;
            stream.total_amount * elapsed / duration
        }
    }

    fn load(env: &Env, stream_id: u64) -> Stream {
        env.storage().persistent().get(&DataKey::Stream(stream_id))
            .unwrap_or_else(|| panic_with_error!(env, EndowmentError::StreamNotFound))
    }

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, EndowmentError::Unauthorized));
        admin.require_auth();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env};

    fn setup() -> (Env, Address, Address, Address, EndowmentStreamClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let funder = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(admin.clone()).address();
        soroban_sdk::token::StellarAssetClient::new(&env, &token_id).mint(&funder, &1_000);
        let id = env.register_contract(None, EndowmentStream);
        let client = EndowmentStreamClient::new(&env, &id);
        client.initialize(&admin);
        client.add_supported_token(&token_id);
        (env, admin, funder, token_id, client)
    }

    #[test]
    fn accrues_linearly_and_claims_only_once_per_step() {
        let (env, _, funder, token_id, client) = setup();
        let recipient = Address::generate(&env);
        let start = env.ledger().timestamp();
        let stream_id = client.create_stream(&funder, &recipient, &token_id, &1_000, &start, &(start + 100));
        env.ledger().set_timestamp(start + 25);
        assert_eq!(client.claim(&recipient, &stream_id), 250);
        assert_eq!(client.get_stream(&stream_id).unwrap().claimed_amount, 250);
        env.ledger().set_timestamp(start + 100);
        assert_eq!(client.claim(&recipient, &stream_id), 750);
    }

    #[test]
    fn cancellation_returns_unvested_balance_and_preserves_vested_claim() {
        let (env, _, funder, token_id, client) = setup();
        let recipient = Address::generate(&env);
        let start = env.ledger().timestamp();
        let stream_id = client.create_stream(&funder, &recipient, &token_id, &1_000, &start, &(start + 100));
        env.ledger().set_timestamp(start + 40);
        assert_eq!(client.cancel(&funder, &stream_id), 600);
        assert_eq!(client.claim(&recipient, &stream_id), 400);
        assert!(client.get_stream(&stream_id).unwrap().cancelled);
    }
}
