//! Fractionalized impact certificates for micro-benefactors (Issue #1808)
//!
//! A steward registers a community agroforestry plot and splits it into a
//! fixed number of equal shares. A verifier confirms the plot on the ground,
//! which opens it to contributions. Micro-benefactors then pool funds by
//! buying as little as one share each; every holder receives a certificate
//! (an NFT-style record with a unique id) for their stake in the plot.
//!
//! Contributions sit in this contract until the plot is fully funded, at which
//! point the steward can release the pool. If the plot is cancelled first,
//! every holder can reclaim exactly what they paid.
//!
//! Shares are whole units. Prices are in the smallest unit of the configured
//! payment token, per share.

#![no_std]
#![allow(clippy::needless_pass_by_value, clippy::must_use_candidate)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN, Env,
};

/// Smallest purchase, transfer or refund: one share.
pub const MIN_SHARES: u32 = 1;
/// Upper bound on the shares a single plot can be split into.
pub const MAX_SHARES_PER_PLOT: u32 = 1_000_000;

/// Error codes live in this crate's block of contracts/error-code-ranges.json.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PlotSharesError {
    AlreadyInitialized = 3101,
    NotInitialized = 3102,
    Unauthorized = 3103,
    NotVerifier = 3104,
    InvalidShareCount = 3105,
    InvalidPrice = 3106,
    PlotNotFound = 3107,
    PlotNotOpen = 3108,
    ExceedsAvailableShares = 3109,
    InsufficientShares = 3110,
    PlotNotFunded = 3111,
    PoolAlreadyReleased = 3112,
    PlotNotCancelled = 3113,
    NothingToRefund = 3114,
    InvalidStatus = 3115,
    AmountOverflow = 3116,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlotStatus {
    /// Registered, waiting for a verifier.
    Pending,
    /// Verified on the ground and accepting contributions.
    Open,
    /// Every share is sold; the pool can be released.
    Funded,
    /// Pool paid out to the steward.
    Released,
    /// Cancelled before release; holders can claim refunds.
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub payment_token: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Plot {
    pub id: u32,
    pub steward: Address,
    /// Hash of the off-chain plot dossier (boundary, species, verification report).
    pub metadata_hash: BytesN<32>,
    pub total_shares: u32,
    pub sold_shares: u32,
    pub price_per_share: i128,
    pub status: PlotStatus,
    pub verified_by: Option<Address>,
}

/// A holder's stake in one plot; the transferable "NFT share" record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Certificate {
    /// Unique across all plots and holders; minted on a holder's first purchase.
    pub certificate_id: u64,
    pub plot_id: u32,
    pub holder: Address,
    pub shares: u32,
    /// Payment-token units this holder paid in and has not yet refunded.
    pub paid: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    NextPlot,
    NextCertificate,
    Verifier(Address),
    Plot(u32),
    Certificate(u32, Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlotRegistered {
    #[topic]
    pub plot_id: u32,
    pub steward: Address,
    pub total_shares: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesPurchased {
    #[topic]
    pub plot_id: u32,
    #[topic]
    pub buyer: Address,
    pub shares: u32,
    pub cost: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesTransferred {
    #[topic]
    pub plot_id: u32,
    #[topic]
    pub from: Address,
    pub to: Address,
    pub shares: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolReleased {
    #[topic]
    pub plot_id: u32,
    pub steward: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub plot_id: u32,
    #[topic]
    pub holder: Address,
    pub amount: i128,
}

#[contract]
pub struct ImpactPlotShares;

#[contractimpl]
impl ImpactPlotShares {
    pub fn initialize(env: Env, admin: Address, payment_token: Address) {
        if env.storage().instance().has(&DataKey::Config) {
            fail(&env, PlotSharesError::AlreadyInitialized);
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

    /// Admin adds or removes a verifier allowed to open plots.
    pub fn set_verifier(env: Env, verifier: Address, allowed: bool) {
        let config = load_config(&env);
        config.admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Verifier(verifier), &allowed);
    }

    pub fn is_verifier(env: Env, verifier: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Verifier(verifier))
            .unwrap_or(false)
    }

    /// Registers a plot split into `total_shares` equal shares. It stays
    /// `Pending` until a verifier opens it. Returns the plot id.
    pub fn register_plot(
        env: Env,
        steward: Address,
        metadata_hash: BytesN<32>,
        total_shares: u32,
        price_per_share: i128,
    ) -> u32 {
        load_config(&env);
        steward.require_auth();
        if total_shares < MIN_SHARES || total_shares > MAX_SHARES_PER_PLOT {
            fail(&env, PlotSharesError::InvalidShareCount);
        }
        if price_per_share <= 0 {
            fail(&env, PlotSharesError::InvalidPrice);
        }
        // The full pool must be representable.
        if price_per_share
            .checked_mul(i128::from(total_shares))
            .is_none()
        {
            fail(&env, PlotSharesError::AmountOverflow);
        }

        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextPlot)
            .unwrap_or(0);
        env.storage().instance().set(&DataKey::NextPlot, &(id + 1));
        save_plot(
            &env,
            &Plot {
                id,
                steward: steward.clone(),
                metadata_hash,
                total_shares,
                sold_shares: 0,
                price_per_share,
                status: PlotStatus::Pending,
                verified_by: None,
            },
        );
        PlotRegistered {
            plot_id: id,
            steward,
            total_shares,
        }
        .publish(&env);
        id
    }

    /// A verifier confirms the plot, opening it to contributions.
    pub fn verify_plot(env: Env, verifier: Address, plot_id: u32) {
        load_config(&env);
        verifier.require_auth();
        if !Self::is_verifier(env.clone(), verifier.clone()) {
            fail(&env, PlotSharesError::NotVerifier);
        }
        let mut plot = load_plot(&env, plot_id);
        if plot.status != PlotStatus::Pending {
            fail(&env, PlotSharesError::InvalidStatus);
        }
        plot.status = PlotStatus::Open;
        plot.verified_by = Some(verifier);
        save_plot(&env, &plot);
    }

    /// Cost in payment-token units of `shares` shares of a plot.
    pub fn quote(env: Env, plot_id: u32, shares: u32) -> i128 {
        if shares < MIN_SHARES {
            fail(&env, PlotSharesError::InvalidShareCount);
        }
        cost_of(&env, &load_plot(&env, plot_id), shares)
    }

    /// Pools `shares` (minimum 1) worth of funds into a verified plot. The
    /// payment is held here until the plot is released or cancelled; the buyer's
    /// certificate is created on first purchase and topped up afterwards.
    /// Returns the certificate id.
    pub fn contribute(env: Env, buyer: Address, plot_id: u32, shares: u32) -> u64 {
        let config = load_config(&env);
        buyer.require_auth();
        let mut plot = load_plot(&env, plot_id);
        if plot.status != PlotStatus::Open {
            fail(&env, PlotSharesError::PlotNotOpen);
        }
        if shares < MIN_SHARES {
            fail(&env, PlotSharesError::InvalidShareCount);
        }
        if shares > plot.total_shares - plot.sold_shares {
            fail(&env, PlotSharesError::ExceedsAvailableShares);
        }

        let cost = cost_of(&env, &plot, shares);
        token::Client::new(&env, &config.payment_token).transfer(
            &buyer,
            &env.current_contract_address(),
            &cost,
        );

        plot.sold_shares += shares;
        if plot.sold_shares == plot.total_shares {
            plot.status = PlotStatus::Funded;
        }
        save_plot(&env, &plot);

        let mut cert = load_certificate(&env, plot_id, &buyer).unwrap_or_else(|| Certificate {
            certificate_id: next_certificate_id(&env),
            plot_id,
            holder: buyer.clone(),
            shares: 0,
            paid: 0,
        });
        cert.shares += shares;
        cert.paid += cost;
        save_certificate(&env, &cert);

        SharesPurchased {
            plot_id,
            buyer,
            shares,
            cost,
        }
        .publish(&env);
        cert.certificate_id
    }

    /// Moves whole shares between holders of the same plot. Shares travel with
    /// the money they were bought with, so a later refund pays the new holder
    /// the same per-share amount.
    pub fn transfer_shares(env: Env, from: Address, to: Address, plot_id: u32, shares: u32) {
        from.require_auth();
        let plot = load_plot(&env, plot_id);
        if plot.status == PlotStatus::Cancelled || plot.status == PlotStatus::Released {
            fail(&env, PlotSharesError::InvalidStatus);
        }
        if shares < MIN_SHARES {
            fail(&env, PlotSharesError::InvalidShareCount);
        }
        let mut src = load_certificate(&env, plot_id, &from)
            .unwrap_or_else(|| fail(&env, PlotSharesError::InsufficientShares));
        if shares > src.shares {
            fail(&env, PlotSharesError::InsufficientShares);
        }
        let moved_paid = cost_of(&env, &plot, shares);

        src.shares -= shares;
        src.paid -= moved_paid;
        save_certificate(&env, &src);

        let mut dst = load_certificate(&env, plot_id, &to).unwrap_or_else(|| Certificate {
            certificate_id: next_certificate_id(&env),
            plot_id,
            holder: to.clone(),
            shares: 0,
            paid: 0,
        });
        dst.shares += shares;
        dst.paid += moved_paid;
        save_certificate(&env, &dst);

        SharesTransferred {
            plot_id,
            from,
            to,
            shares,
        }
        .publish(&env);
    }

    /// Pays the pooled funds to the steward once every share is sold.
    pub fn release_pool(env: Env, plot_id: u32) -> i128 {
        let config = load_config(&env);
        let mut plot = load_plot(&env, plot_id);
        plot.steward.require_auth();
        match plot.status {
            PlotStatus::Funded => {}
            PlotStatus::Released => fail(&env, PlotSharesError::PoolAlreadyReleased),
            _ => fail(&env, PlotSharesError::PlotNotFunded),
        }
        let amount = cost_of(&env, &plot, plot.total_shares);
        plot.status = PlotStatus::Released;
        save_plot(&env, &plot);
        token::Client::new(&env, &config.payment_token).transfer(
            &env.current_contract_address(),
            &plot.steward,
            &amount,
        );
        PoolReleased {
            plot_id,
            steward: plot.steward,
            amount,
        }
        .publish(&env);
        amount
    }

    /// Admin cancels a plot that has not been released, enabling refunds.
    pub fn cancel_plot(env: Env, plot_id: u32) {
        let config = load_config(&env);
        config.admin.require_auth();
        let mut plot = load_plot(&env, plot_id);
        if plot.status == PlotStatus::Released || plot.status == PlotStatus::Cancelled {
            fail(&env, PlotSharesError::InvalidStatus);
        }
        plot.status = PlotStatus::Cancelled;
        save_plot(&env, &plot);
    }

    /// Returns a holder's payment for a cancelled plot and burns their shares.
    pub fn claim_refund(env: Env, holder: Address, plot_id: u32) -> i128 {
        let config = load_config(&env);
        holder.require_auth();
        let plot = load_plot(&env, plot_id);
        if plot.status != PlotStatus::Cancelled {
            fail(&env, PlotSharesError::PlotNotCancelled);
        }
        let mut cert = load_certificate(&env, plot_id, &holder)
            .unwrap_or_else(|| fail(&env, PlotSharesError::NothingToRefund));
        let amount = cert.paid;
        if cert.shares == 0 || amount <= 0 {
            fail(&env, PlotSharesError::NothingToRefund);
        }
        cert.shares = 0;
        cert.paid = 0;
        save_certificate(&env, &cert);
        token::Client::new(&env, &config.payment_token).transfer(
            &env.current_contract_address(),
            &holder,
            &amount,
        );
        Refunded {
            plot_id,
            holder,
            amount,
        }
        .publish(&env);
        amount
    }

    pub fn config(env: Env) -> Config {
        load_config(&env)
    }

    pub fn get_plot(env: Env, plot_id: u32) -> Plot {
        load_plot(&env, plot_id)
    }

    /// The holder's certificate for a plot, if they ever held shares in it.
    pub fn get_certificate(env: Env, plot_id: u32, holder: Address) -> Option<Certificate> {
        load_certificate(&env, plot_id, &holder)
    }

    pub fn shares_of(env: Env, plot_id: u32, holder: Address) -> u32 {
        load_certificate(&env, plot_id, &holder).map_or(0, |c| c.shares)
    }

    /// Holder's ownership of the plot in basis points (10_000 = whole plot).
    pub fn ownership_bps(env: Env, plot_id: u32, holder: Address) -> u32 {
        let plot = load_plot(&env, plot_id);
        let shares = load_certificate(&env, plot_id, &holder).map_or(0, |c| c.shares);
        u32::try_from(u64::from(shares) * 10_000 / u64::from(plot.total_shares)).unwrap_or(0)
    }

    /// Shares still available for purchase.
    pub fn available(env: Env, plot_id: u32) -> u32 {
        let plot = load_plot(&env, plot_id);
        plot.total_shares - plot.sold_shares
    }
}

fn cost_of(env: &Env, plot: &Plot, shares: u32) -> i128 {
    plot.price_per_share
        .checked_mul(i128::from(shares))
        .unwrap_or_else(|| fail(env, PlotSharesError::AmountOverflow))
}

fn next_certificate_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextCertificate)
        .unwrap_or(1);
    env.storage()
        .instance()
        .set(&DataKey::NextCertificate, &(id + 1));
    id
}

fn load_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| fail(env, PlotSharesError::NotInitialized))
}

fn load_plot(env: &Env, plot_id: u32) -> Plot {
    env.storage()
        .persistent()
        .get(&DataKey::Plot(plot_id))
        .unwrap_or_else(|| fail(env, PlotSharesError::PlotNotFound))
}

fn save_plot(env: &Env, plot: &Plot) {
    env.storage()
        .persistent()
        .set(&DataKey::Plot(plot.id), plot);
}

fn load_certificate(env: &Env, plot_id: u32, holder: &Address) -> Option<Certificate> {
    env.storage()
        .persistent()
        .get(&DataKey::Certificate(plot_id, holder.clone()))
}

fn save_certificate(env: &Env, cert: &Certificate) {
    env.storage().persistent().set(
        &DataKey::Certificate(cert.plot_id, cert.holder.clone()),
        cert,
    );
}

fn fail(env: &Env, error: PlotSharesError) -> ! {
    soroban_sdk::panic_with_error!(env, error)
}

#[cfg(test)]
mod test;
