#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, Vec};
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PoolError { AlreadyInitialized = 1, PoolNotOpen = 2, InvalidAmount = 3, TargetNotReached = 4, AlreadyClaimed = 5, Unauthorized = 6 }
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Member { pub wallet: Address, pub contributed: i128, pub claimed: bool }
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Pool { pub creator: Address, pub payment_token: Address, pub credit_token: Address, pub target_amount: i128, pub total_contributed: i128, pub total_credits: i128, pub members: Vec<Member>, pub funded: bool }
#[contract]
pub struct CommunityOffsetPool;
#[contractimpl]
impl CommunityOffsetPool {
    pub fn initialize(env: Env, creator: Address, payment_token: Address, credit_token: Address, target_amount: i128) { if env.storage().instance().has(&0u32) || target_amount <= 0 { panic_with(&env, PoolError::AlreadyInitialized); } creator.require_auth(); env.storage().instance().set(&0u32, &Pool { creator, payment_token, credit_token, target_amount, total_contributed: 0, total_credits: 0, members: Vec::new(&env), funded: false }); }
    pub fn contribute(env: Env, wallet: Address, amount: i128) { wallet.require_auth(); if amount <= 0 { panic_with(&env, PoolError::InvalidAmount); } let mut pool: Pool = load(&env); if pool.funded { panic_with(&env, PoolError::PoolNotOpen); } let payment = token::Client::new(&env, &pool.payment_token); payment.transfer(&wallet, &env.current_contract_address(), &amount); let mut found = false; for index in 0..pool.members.len() { let mut member = pool.members.get(index).unwrap(); if member.wallet == wallet { member.contributed += amount; pool.members.set(index, member); found = true; break; } } if !found { pool.members.push_back(Member { wallet, contributed: amount, claimed: false }); } pool.total_contributed += amount; if pool.total_contributed >= pool.target_amount { pool.funded = true; } env.storage().instance().set(&0u32, &pool); }
    pub fn finalize(env: Env, caller: Address, total_credits: i128) { caller.require_auth(); let mut pool: Pool = load(&env); if caller != pool.creator { panic_with(&env, PoolError::Unauthorized); } if !pool.funded || total_credits <= 0 { panic_with(&env, PoolError::TargetNotReached); } pool.total_credits = total_credits; env.storage().instance().set(&0u32, &pool); }
    pub fn claim(env: Env, wallet: Address) { wallet.require_auth(); let mut pool: Pool = load(&env); if !pool.funded || pool.total_credits <= 0 { panic_with(&env, PoolError::TargetNotReached); } for index in 0..pool.members.len() { let mut member = pool.members.get(index).unwrap(); if member.wallet == wallet { if member.claimed { panic_with(&env, PoolError::AlreadyClaimed); } let credits = pool.total_credits * member.contributed / pool.total_contributed; token::Client::new(&env, &pool.credit_token).transfer(&env.current_contract_address(), &wallet, &credits); member.claimed = true; pool.members.set(index, member); env.storage().instance().set(&0u32, &pool); return; } } panic_with(&env, PoolError::Unauthorized); }
    pub fn get_pool(env: Env) -> Pool { load(&env) }
}
fn load(env: &Env) -> Pool { env.storage().instance().get(&0u32).unwrap_or_else(|| panic_with(env, PoolError::Unauthorized)) }
fn panic_with(env: &Env, error: PoolError) -> ! { soroban_sdk::panic_with_error!(env, error) }
