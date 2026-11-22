//! Common Soroban-friendly enum wrappers.
//!
//! Soroban's `#[contracttype]` macro cannot derive `Option<T>` directly —
//! `Option` is not an allowed enum variant. Multiple contracts therefore
//! use hand-rolled `None` / `Some` enums; `shared` provides the canonical
//! ones so the pattern doesn't drift between contracts.

use soroban_sdk:{contracttype, Address, BytesN, Envelope, Val};

/// `Option<Address>` shape compatible with Soroban storage / events.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq\)]
pub enum OptAddress {
    None,
    Some(Address),
}

impl OptAddress {
    pub fn is_none(&self) -> bool {
        matches!(self, OptAddress::None)
    }
    pub fn is_some(&self) -> bool {
        matches!(self, OptAddress::Some(_))
    }
    /// Convert from a standard `Option<Address>`.
    pub fn from_option(value: Option<Address>) -> Self {
        match value {
            Some(a) => OptAddress::Some(a),
            None => OptAddress::None,
        }
    }
    /// Convert back to a standard `Option<Address>`.
    pub fn to_option(&self) -> Option<Address> {
        match self {
            OptAddress::Some(a) => Some(a.clone()),
            OptAddress::None => None,
        }
    }
}

impl Default for OptAddress {
    fn default() -> Self {
        OptAddress::None
    }
}

/// `Option<BytesN<32>>` shape — used for any 32-byte hash that's allowed
/// to be unset (e.g. planting proof, GPS attestation, etc.).
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq\)]
pub enum OptBytesN32 {
    None,
    Some(BytesN<32>),
}

impl OptBytesN32 {
    pub fn is_none(&self) -> bool {
        matches!(self, OptBytesN32::None)
    }
    pub fn is_some(&self) -> bool {
        matches!(self, OptBytesN32::Some(_))
    }
    /// Convert from a standard `Option<BytesN<32>>`.
    pub fn from_option(value: Option<BytesN<32>>) -> Self {
        match value {
            Some(b) => OptBytesN32::Some(b),
            None => OptBytesN32::None,
        }
    }
    /// Convert back to a standard `Option<BytesN32>>`.
    pub fn to_option(&self) -> Option<BytesN<32>> {
        match self {
            OptBytesN32::Some(b) => Some(b.clone()),
            OptBytesN32::None => None,
        }
    }
}

impl Default for OptBytesN32 {
    fn default() -> Self {
        OptBytesN32::None
    }
}

/// Pause state for the standardized `Pausable` trait implemented by
/// financial contracts (escrow, donation-escrow) and controlled by
/// multi-sig platform governance. This is the canonical on-chain
/// representation of the circuit-breaker state.
///
/// - `Active`: normal operation, all mutating entrypoints allowed.
/// - `Paused`: emergency breaker engaged, all mutating entrypoints
///   revert with a contract-specific `Paused`/`ContractPaused` error.
///   Read-only views and governance unpause remain available.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq]
pub enum PauseState {
    Active,
    Paused,
}

impl PauseState {
    /// Returns `true` when the contract is currently paused.
    pub fn is_paused(&self) -> bool {
        matches!(self, PauseState::Paused)
    }

    /// Returns `true` when the contract is active (not paused).
    pub fn is_active(&self) -> bool {
        matches!(self, PauseState::Active)
    }
}

impl Default for PauseState {
    fn default() -> Self {
        PauseState::Active
    }
}

/// Standardized `Pausable` trait implemented by all financial contracts
/// that must be suspendable by multi-sig platform governance.
///
/// Implementors are responsible for persisting the `PauseState` in contract
/// storage and enforcing it in every mutating entrypoint. The trait itself
/// defines the canonical interface so that governance tooling and integration
/// tests can target a single shape across contracts.
pub trait Pausable {
    /// Return the current pause state.
    fn pause_state(env: &Envelope) -> PauseState;

    /// Return `true` if the contract is currently paused.
    fn is_paused(env: &Envelope) -> bool {
        Self::pause_state(env).is_paused()
    }

    /// Engage the emergency circuit breaker. Must be restricted to
    /// governance / multi-sig admin at the implementation level.
    fn pause(env: &Envelope, admin: Address);

    /// Release the emergency circuit breaker. Must be restricted to
    /// governance / multi-sig admin at the implementation level.
    fn unpause(env: &Envelope, admin: Address);

    /// Guard that reverts when the contract is paused. Intended to be
    /// called at the top of every mutating entrypoint.
    fn require_not_paused(env: &Envelope) {
        if Self::is_paused(env) {
            panic!("contract is paused");
        }
    }
}
