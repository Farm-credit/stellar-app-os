#![no_std]

//! Farmer cross-chain atomic swaps (v1).
//!
//! Farmer A on Stellar can lock a settlement against Farmer B on another
//! chain (for example Polygon) using a hashlock and timelock. Completing
//! the swap reveals the secret; after expiry the initiator can refund.
//!
//! Closes #1380

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Bytes, BytesN, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AmountMustBePositive = 3,
    SwapNotFound = 4,
    SwapNotOpen = 5,
    BadSecret = 6,
    NotExpired = 7,
    AlreadyExpired = 8,
    Unauthorized = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SwapStatus {
    Open,
    Completed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Swap {
    pub id: u64,
    pub initiator: Address,
    pub counterparty: Address,
    pub amount: i128,
    pub hashlock: BytesN<32>,
    pub expiry: u64,
    pub dest_chain: String,
    pub dest_address: String,
    pub status: SwapStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Swap(u64),
}

#[contract]
pub struct AtomicSwapContract;

#[contractimpl]
impl AtomicSwapContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("NEXT"), &1u64);
    }

    /// Farmer A proposes a Stellar-side lock for a counterparty on `dest_chain`.
    pub fn propose_swap(
        env: Env,
        initiator: Address,
        counterparty: Address,
        amount: i128,
        hashlock: BytesN<32>,
        expiry: u64,
        dest_chain: String,
        dest_address: String,
    ) -> u64 {
        require_init(&env);
        initiator.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::AmountMustBePositive);
        }
        if env.ledger().timestamp() >= expiry {
            panic_with_error!(&env, Error::AlreadyExpired);
        }

        let id: u64 = env.storage().instance().get(&symbol_short!("NEXT")).unwrap_or(1);
        let swap = Swap {
            id,
            initiator,
            counterparty,
            amount,
            hashlock,
            expiry,
            dest_chain,
            dest_address,
            status: SwapStatus::Open,
        };
        env.storage().persistent().set(&DataKey::Swap(id), &swap);
        env.storage().instance().set(&symbol_short!("NEXT"), &(id + 1));
        env.events().publish((symbol_short!("swap"), symbol_short!("open")), id);
        id
    }

    /// Complete the swap by revealing the preimage of `hashlock`.
    pub fn complete_swap(env: Env, swap_id: u64, secret: Bytes) {
        require_init(&env);
        let mut swap: Swap = env
            .storage()
            .persistent()
            .get(&DataKey::Swap(swap_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::SwapNotFound));
        if swap.status != SwapStatus::Open {
            panic_with_error!(&env, Error::SwapNotOpen);
        }
        if env.ledger().timestamp() >= swap.expiry {
            panic_with_error!(&env, Error::AlreadyExpired);
        }
        let digest = env.crypto().sha256(&secret);
        if digest != swap.hashlock {
            panic_with_error!(&env, Error::BadSecret);
        }
        swap.counterparty.require_auth();
        swap.status = SwapStatus::Completed;
        env.storage().persistent().set(&DataKey::Swap(swap_id), &swap);
        env.events()
            .publish((symbol_short!("swap"), symbol_short!("done")), swap_id);
    }

    /// Refund Farmer A after the timelock expires.
    pub fn refund_swap(env: Env, swap_id: u64) {
        require_init(&env);
        let mut swap: Swap = env
            .storage()
            .persistent()
            .get(&DataKey::Swap(swap_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::SwapNotFound));
        if swap.status != SwapStatus::Open {
            panic_with_error!(&env, Error::SwapNotOpen);
        }
        if env.ledger().timestamp() < swap.expiry {
            panic_with_error!(&env, Error::NotExpired);
        }
        swap.initiator.require_auth();
        swap.status = SwapStatus::Refunded;
        env.storage().persistent().set(&DataKey::Swap(swap_id), &swap);
        env.events()
            .publish((symbol_short!("swap"), symbol_short!("refund")), swap_id);
    }

    pub fn get_swap(env: Env, swap_id: u64) -> Swap {
        env.storage()
            .persistent()
            .get(&DataKey::Swap(swap_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::SwapNotFound))
    }
}

fn require_init(env: &Env) {
    if !env.storage().instance().has(&symbol_short!("ADMIN")) {
        panic_with_error!(env, Error::NotInitialized);
    }
}
