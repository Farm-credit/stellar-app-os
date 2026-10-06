//! Community offset pools — group purchasing (Issue #1314)
//!
//! Individuals pool money into a single pool, the pool buys credits at a lower
//! per-person cost, and each contributor receives a pro-rata share of the
//! credits bought. Escrowing the money on-chain is what makes the "lower cost
//! per person" promise safe: nobody can withdraw the pooled funds for anything
//! other than buying credits, and if the target is never reached every
//! contributor is refunded in full.
//!
//! Lifecycle:
//! 1. `initialize` — the creator opens the pool with a payment token, the credit
//!    token that will be purchased, a funding target and a deadline.
//! 2. `contribute` — members deposit the payment token. The pool flips to
//!    `Funded` as soon as contributions reach the target.
//! 3. `finalize` — the creator deposits `total_credits` of the credit token into
//!    the pool, which flips it to `Purchased`. Credits must already be inside
//!    the contract before anyone can claim, so a claim can never fail on an
//!    empty balance.
//! 4. `claim` — each member withdraws their pro-rata share of the credits.
//!
//! Escape hatches, so funds can never be stranded:
//! - `cancel` — the creator can abort an open pool before it is funded.
//! - `refund` — members reclaim their contribution when the pool was cancelled,
//!   when the deadline passed before the target was reached, or when a funded
//!   pool was left un-finalized past the refund grace period.
//!
//! The member who claims last receives the integer-division remainder, so no
//! credit is ever stranded in the contract.

#![no_std]
// Soroban entry points must take `Env` and `Address` by value, and their return
// values are the contract ABI, so these two pedantic lints do not apply here.
#![allow(clippy::needless_pass_by_value, clippy::must_use_candidate)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec,
};

/// How long a funded pool may sit un-finalized before members can force a refund.
pub const REFUND_GRACE_SECONDS: u64 = 7 * 24 * 60 * 60;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PoolError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidDeadline = 5,
    PoolNotOpen = 6,
    NotFunded = 7,
    AlreadyPurchased = 8,
    AlreadyClaimed = 9,
    NotAMember = 10,
    RefundNotAvailable = 11,
    DeadlinePassed = 12,
    AlreadyRefunded = 13,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PoolStatus {
    /// Accepting contributions.
    Open,
    /// Target reached; waiting for the creator to deposit the credits.
    Funded,
    /// Credits escrowed; members can claim their share.
    Purchased,
    /// Aborted by the creator; contributions are refundable.
    Cancelled,
}

/// Aggregate pool state, returned by `get_pool`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pool {
    pub creator: Address,
    pub payment_token: Address,
    pub credit_token: Address,
    /// Payment-token amount that must be raised to trigger a purchase.
    pub target_amount: i128,
    /// Ledger timestamp after which contributions close.
    pub deadline: u64,
    pub status: PoolStatus,
    pub total_contributed: i128,
    /// Credits bought and escrowed in the contract (set by `finalize`).
    pub total_credits: i128,
    /// Credits already paid out to members.
    pub credits_claimed: i128,
    pub member_count: u32,
    pub members_claimed: u32,
}

/// A single contributor's position.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Member {
    pub wallet: Address,
    pub contributed: i128,
    pub claimed: bool,
    pub refunded: bool,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Pool,
    Member(Address),
    Members,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolCreated {
    #[topic]
    pub creator: Address,
    pub target_amount: i128,
    pub deadline: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Contributed {
    #[topic]
    pub member: Address,
    pub amount: i128,
    pub total_contributed: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Funded {
    #[topic]
    pub creator: Address,
    pub total_contributed: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Purchased {
    #[topic]
    pub creator: Address,
    pub total_credits: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub member: Address,
    pub credits: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub member: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Cancelled {
    #[topic]
    pub creator: Address,
}

#[contract]
pub struct CommunityOffsetPool;

#[contractimpl]
impl CommunityOffsetPool {
    /// Opens a pool. `deadline` must be in the future.
    pub fn initialize(
        env: Env,
        creator: Address,
        payment_token: Address,
        credit_token: Address,
        target_amount: i128,
        deadline: u64,
    ) {
        if env.storage().instance().has(&DataKey::Pool) {
            fail(&env, PoolError::AlreadyInitialized);
        }
        if target_amount <= 0 {
            fail(&env, PoolError::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            fail(&env, PoolError::InvalidDeadline);
        }
        creator.require_auth();

        let pool = Pool {
            creator: creator.clone(),
            payment_token,
            credit_token,
            target_amount,
            deadline,
            status: PoolStatus::Open,
            total_contributed: 0,
            total_credits: 0,
            credits_claimed: 0,
            member_count: 0,
            members_claimed: 0,
        };
        env.storage().instance().set(&DataKey::Pool, &pool);
        env.storage()
            .persistent()
            .set(&DataKey::Members, &Vec::<Address>::new(&env));

        PoolCreated {
            creator,
            target_amount,
            deadline,
        }
        .publish(&env);
    }

    /// Deposits `amount` of the payment token into the pool. Repeat contributions
    /// from the same wallet accumulate onto the same member record.
    pub fn contribute(env: Env, member: Address, amount: i128) {
        member.require_auth();
        if amount <= 0 {
            fail(&env, PoolError::InvalidAmount);
        }

        let mut pool = load_pool(&env);
        if pool.status != PoolStatus::Open {
            fail(&env, PoolError::PoolNotOpen);
        }
        if env.ledger().timestamp() >= pool.deadline {
            fail(&env, PoolError::DeadlinePassed);
        }

        let mut record = load_member(&env, &member);
        // A wallet that was already refunded is out of the pool for good, so it
        // can never inflate its share by contributing again.
        if record.refunded {
            fail(&env, PoolError::AlreadyRefunded);
        }

        token::Client::new(&env, &pool.payment_token).transfer(
            &member,
            env.current_contract_address(),
            &amount,
        );

        if record.contributed == 0 {
            let mut members: Vec<Address> = env
                .storage()
                .persistent()
                .get(&DataKey::Members)
                .unwrap_or_else(|| Vec::new(&env));
            members.push_back(member.clone());
            env.storage().persistent().set(&DataKey::Members, &members);
            pool.member_count += 1;
        }
        record.contributed += amount;
        env.storage()
            .persistent()
            .set(&DataKey::Member(member.clone()), &record);

        pool.total_contributed += amount;
        if pool.total_contributed >= pool.target_amount {
            pool.status = PoolStatus::Funded;
            Funded {
                creator: pool.creator.clone(),
                total_contributed: pool.total_contributed,
            }
            .publish(&env);
        }
        env.storage().instance().set(&DataKey::Pool, &pool);

        Contributed {
            member,
            amount,
            total_contributed: pool.total_contributed,
        }
        .publish(&env);
    }

    /// Creator deposits the credits that were bought with the pooled funds.
    /// The credits are held by the contract until members claim them.
    pub fn finalize(env: Env, caller: Address, total_credits: i128) {
        caller.require_auth();
        if total_credits <= 0 {
            fail(&env, PoolError::InvalidAmount);
        }

        let mut pool = load_pool(&env);
        if caller != pool.creator {
            fail(&env, PoolError::Unauthorized);
        }
        if pool.status == PoolStatus::Purchased {
            fail(&env, PoolError::AlreadyPurchased);
        }
        if pool.status != PoolStatus::Funded {
            fail(&env, PoolError::NotFunded);
        }

        token::Client::new(&env, &pool.credit_token).transfer(
            &caller,
            env.current_contract_address(),
            &total_credits,
        );

        pool.total_credits = total_credits;
        pool.status = PoolStatus::Purchased;
        env.storage().instance().set(&DataKey::Pool, &pool);

        Purchased {
            creator: caller,
            total_credits,
        }
        .publish(&env);
    }

    /// Claims the caller's pro-rata share of the escrowed credits. The final
    /// claimant receives the remainder so integer-division dust is not stranded.
    pub fn claim(env: Env, member: Address) -> i128 {
        member.require_auth();

        let mut pool = load_pool(&env);
        if pool.status != PoolStatus::Purchased {
            fail(&env, PoolError::NotFunded);
        }

        let mut record = load_member(&env, &member);
        if record.contributed == 0 {
            fail(&env, PoolError::NotAMember);
        }
        if record.claimed {
            fail(&env, PoolError::AlreadyClaimed);
        }

        let is_last = pool.members_claimed + 1 == pool.member_count;
        let mut credits = share_of(&pool, record.contributed);
        if is_last {
            credits = pool.total_credits - pool.credits_claimed;
        }

        record.claimed = true;
        env.storage()
            .persistent()
            .set(&DataKey::Member(member.clone()), &record);

        pool.credits_claimed += credits;
        pool.members_claimed += 1;
        env.storage().instance().set(&DataKey::Pool, &pool);

        token::Client::new(&env, &pool.credit_token).transfer(
            &env.current_contract_address(),
            &member,
            &credits,
        );

        Claimed {
            member,
            credits,
        }
        .publish(&env);
        credits
    }

    /// Returns a member's contribution. Available once the pool was cancelled,
    /// once the deadline passed without reaching the target, or once a funded
    /// pool went un-finalized past `REFUND_GRACE_SECONDS`.
    pub fn refund(env: Env, member: Address) -> i128 {
        member.require_auth();

        let mut pool = load_pool(&env);
        if !refundable(&env, &pool) {
            fail(&env, PoolError::RefundNotAvailable);
        }

        let mut record = load_member(&env, &member);
        if record.contributed == 0 {
            fail(&env, PoolError::NotAMember);
        }
        if record.refunded {
            fail(&env, PoolError::AlreadyRefunded);
        }

        let amount = record.contributed;
        record.refunded = true;
        env.storage()
            .persistent()
            .set(&DataKey::Member(member.clone()), &record);

        pool.total_contributed -= amount;
        if pool.total_contributed < pool.target_amount && pool.status == PoolStatus::Funded {
            pool.status = PoolStatus::Open;
        }
        env.storage().instance().set(&DataKey::Pool, &pool);

        token::Client::new(&env, &pool.payment_token).transfer(
            &env.current_contract_address(),
            &member,
            &amount,
        );

        Refunded { member, amount }.publish(&env);
        amount
    }

    /// Creator aborts a pool that has not reached its target yet.
    pub fn cancel(env: Env) {
        let mut pool = load_pool(&env);
        pool.creator.require_auth();
        if pool.status != PoolStatus::Open {
            fail(&env, PoolError::PoolNotOpen);
        }
        pool.status = PoolStatus::Cancelled;
        env.storage().instance().set(&DataKey::Pool, &pool);

        Cancelled {
            creator: pool.creator,
        }
        .publish(&env);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    pub fn get_pool(env: Env) -> Pool {
        load_pool(&env)
    }

    pub fn get_member(env: Env, wallet: Address) -> Option<Member> {
        env.storage()
            .persistent()
            .get(&DataKey::Member(wallet))
    }

    pub fn get_members(env: Env) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Members)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Credits the given wallet would receive right now, before any claim.
    pub fn preview_claim(env: Env, wallet: Address) -> i128 {
        let pool = load_pool(&env);
        if pool.status != PoolStatus::Purchased {
            return 0;
        }
        let record = load_member(&env, &wallet);
        if record.contributed == 0 || record.claimed {
            return 0;
        }
        share_of(&pool, record.contributed)
    }
}

/// Floor share of `total_credits` proportional to a member's contribution.
#[must_use]
fn share_of(pool: &Pool, contributed: i128) -> i128 {
    if pool.total_contributed <= 0 {
        return 0;
    }
    pool.total_credits * contributed / pool.total_contributed
}

/// Whether the pool's contributions may be refunded at the current ledger time.
#[must_use]
fn refundable(env: &Env, pool: &Pool) -> bool {
    match pool.status {
        PoolStatus::Cancelled => true,
        PoolStatus::Open => env.ledger().timestamp() >= pool.deadline,
        PoolStatus::Funded => {
            env.ledger().timestamp() >= pool.deadline.saturating_add(REFUND_GRACE_SECONDS)
        }
        PoolStatus::Purchased => false,
    }
}

fn load_pool(env: &Env) -> Pool {
    env.storage()
        .instance()
        .get(&DataKey::Pool)
        .unwrap_or_else(|| fail(env, PoolError::NotInitialized))
}

fn load_member(env: &Env, wallet: &Address) -> Member {
    env.storage()
        .persistent()
        .get(&DataKey::Member(wallet.clone()))
        .unwrap_or(Member {
            wallet: wallet.clone(),
            contributed: 0,
            claimed: false,
            refunded: false,
        })
}

fn fail(env: &Env, error: PoolError) -> ! {
    soroban_sdk::panic_with_error!(env, error)
}

#[cfg(test)]
mod test;
