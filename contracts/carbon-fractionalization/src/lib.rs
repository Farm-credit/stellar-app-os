//! Carbon credit fractionalization — retail access (Issue #1428)
//!
//! Large offset projects are issued in blocks of 100+ tonnes, which prices out
//! retail buyers. This contract lets a project owner list such a block once and
//! then sell it in whole-tonne portions: the minimum retail purchase is 1 tonne.
//!
//! Each listing keeps an on-chain ledger of fractional holdings. Holders can
//! transfer their tonnes to someone else or retire them against their own
//! footprint; retired tonnes can never be transferred or retired again.
//!
//! Quantities are whole tonnes of CO₂-equivalent. Prices are in the smallest unit of the
//! configured payment token, per tonne.

#![no_std]
// Soroban entry points must take `Env` and `Address` by value, and their return
// values are the contract ABI, so these two pedantic lints do not apply here.
#![allow(clippy::needless_pass_by_value, clippy::must_use_candidate)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

/// A listing must represent at least this many tonnes — the block sizes that
/// are otherwise only reachable by institutional buyers.
pub const MIN_BLOCK_TONNES: i128 = 100;
/// Smallest retail purchase, transfer or retirement: one tonne.
pub const MIN_PURCHASE_TONNES: i128 = 1;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum FractionError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    BlockTooSmall = 4,
    InvalidPrice = 5,
    BelowMinimumPurchase = 6,
    InsufficientSupply = 7,
    InsufficientHolding = 8,
    ProjectNotFound = 9,
    ProjectInactive = 10,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub payment_token: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Project {
    pub id: u32,
    pub owner: Address,
    /// Size of the listed block, in tonnes.
    pub total_tonnes: i128,
    /// Tonnes sold to buyers so far.
    pub sold_tonnes: i128,
    /// Tonnes retired by holders so far.
    pub retired_tonnes: i128,
    pub price_per_tonne: i128,
    pub active: bool,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    NextId,
    Project(u32),
    Holding(u32, Address),
    Retired(u32, Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FractionPurchased {
    #[topic]
    pub project_id: u32,
    #[topic]
    pub buyer: Address,
    pub tonnes: i128,
    pub cost: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FractionRetired {
    #[topic]
    pub project_id: u32,
    #[topic]
    pub holder: Address,
    pub tonnes: i128,
}

#[contract]
pub struct CarbonFractionalization;

#[contractimpl]
impl CarbonFractionalization {
    pub fn initialize(env: Env, admin: Address, payment_token: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            fail(&env, FractionError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(
            &DataKey::Config,
            &Config {
                admin,
                payment_token,
            },
        );
    }

    /// Lists a block of at least `MIN_BLOCK_TONNES` for fractional sale and
    /// returns its project id.
    pub fn list_project(
        env: Env,
        owner: Address,
        total_tonnes: i128,
        price_per_tonne: i128,
    ) -> u32 {
        load_config(&env);
        owner.require_auth();
        if total_tonnes < MIN_BLOCK_TONNES {
            fail(&env, FractionError::BlockTooSmall);
        }
        if price_per_tonne <= 0 {
            fail(&env, FractionError::InvalidPrice);
        }

        let id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        let project = Project {
            id,
            owner,
            total_tonnes,
            sold_tonnes: 0,
            retired_tonnes: 0,
            price_per_tonne,
            active: true,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Project(id), &project);
        id
    }

    /// Pauses or resumes sales. Allowed for the project owner or the admin.
    pub fn set_active(env: Env, caller: Address, project_id: u32, active: bool) {
        caller.require_auth();
        let config = load_config(&env);
        let mut project = load_project(&env, project_id);
        if caller != project.owner && caller != config.admin {
            fail(&env, FractionError::Unauthorized);
        }
        project.active = active;
        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);
    }

    /// Cost in payment-token units of buying `tonnes` of a project.
    pub fn quote(env: Env, project_id: u32, tonnes: i128) -> i128 {
        if tonnes < MIN_PURCHASE_TONNES {
            fail(&env, FractionError::BelowMinimumPurchase);
        }
        load_project(&env, project_id).price_per_tonne * tonnes
    }

    /// Buys `tonnes` (minimum 1) of a listed block. Payment goes straight to the
    /// project owner; the tonnes are credited to the buyer's holding. Returns
    /// the amount paid.
    pub fn buy(env: Env, buyer: Address, project_id: u32, tonnes: i128) -> i128 {
        buyer.require_auth();
        let config = load_config(&env);
        let mut project = load_project(&env, project_id);
        if !project.active {
            fail(&env, FractionError::ProjectInactive);
        }
        if tonnes < MIN_PURCHASE_TONNES {
            fail(&env, FractionError::BelowMinimumPurchase);
        }
        if tonnes > project.total_tonnes - project.sold_tonnes {
            fail(&env, FractionError::InsufficientSupply);
        }

        let cost = project.price_per_tonne * tonnes;
        token::Client::new(&env, &config.payment_token).transfer(&buyer, &project.owner, &cost);

        project.sold_tonnes += tonnes;
        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);
        add_holding(&env, project_id, &buyer, tonnes);

        FractionPurchased {
            project_id,
            buyer,
            tonnes,
            cost,
        }
        .publish(&env);
        cost
    }

    /// Moves whole tonnes between holders of the same project.
    pub fn transfer(env: Env, from: Address, to: Address, project_id: u32, tonnes: i128) {
        from.require_auth();
        load_project(&env, project_id);
        if tonnes < MIN_PURCHASE_TONNES {
            fail(&env, FractionError::BelowMinimumPurchase);
        }
        take_holding(&env, project_id, &from, tonnes);
        add_holding(&env, project_id, &to, tonnes);
    }

    /// Permanently retires tonnes from the holder's balance.
    pub fn retire(env: Env, holder: Address, project_id: u32, tonnes: i128) {
        holder.require_auth();
        let mut project = load_project(&env, project_id);
        if tonnes < MIN_PURCHASE_TONNES {
            fail(&env, FractionError::BelowMinimumPurchase);
        }
        take_holding(&env, project_id, &holder, tonnes);

        project.retired_tonnes += tonnes;
        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);
        let retired_key = DataKey::Retired(project_id, holder.clone());
        let retired: i128 = env.storage().persistent().get(&retired_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&retired_key, &(retired + tonnes));

        FractionRetired {
            project_id,
            holder,
            tonnes,
        }
        .publish(&env);
    }

    pub fn config(env: Env) -> Config {
        load_config(&env)
    }

    pub fn get_project(env: Env, project_id: u32) -> Project {
        load_project(&env, project_id)
    }

    /// Tonnes still available for purchase.
    pub fn available(env: Env, project_id: u32) -> i128 {
        let project = load_project(&env, project_id);
        project.total_tonnes - project.sold_tonnes
    }

    pub fn holding(env: Env, project_id: u32, holder: Address) -> i128 {
        holding_of(&env, project_id, &holder)
    }

    pub fn retired_by(env: Env, project_id: u32, holder: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Retired(project_id, holder))
            .unwrap_or(0)
    }
}

fn load_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| fail(env, FractionError::NotInitialized))
}

fn load_project(env: &Env, project_id: u32) -> Project {
    env.storage()
        .persistent()
        .get(&DataKey::Project(project_id))
        .unwrap_or_else(|| fail(env, FractionError::ProjectNotFound))
}

fn holding_of(env: &Env, project_id: u32, holder: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Holding(project_id, holder.clone()))
        .unwrap_or(0)
}

fn add_holding(env: &Env, project_id: u32, holder: &Address, tonnes: i128) {
    let balance = holding_of(env, project_id, holder) + tonnes;
    env.storage()
        .persistent()
        .set(&DataKey::Holding(project_id, holder.clone()), &balance);
}

fn take_holding(env: &Env, project_id: u32, holder: &Address, tonnes: i128) {
    let balance = holding_of(env, project_id, holder);
    if tonnes > balance {
        fail(env, FractionError::InsufficientHolding);
    }
    env.storage().persistent().set(
        &DataKey::Holding(project_id, holder.clone()),
        &(balance - tonnes),
    );
}

fn fail(env: &Env, error: FractionError) -> ! {
    soroban_sdk::panic_with_error!(env, error)
}

#[cfg(test)]
mod test;
