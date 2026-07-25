#![no_std]

//! Common Soroban-friendly enum wrappers.
//!
//! Soroban's `#[contracttype]` macro cannot derive `Option<T>` directly —
//! `Option` is not an allowed enum variant. Multiple contracts therefore
//! use hand-rolled `None` / `Some` enums; `shared` provides the canonical
//! ones so the pattern doesn't drift between contracts.

use soroban_sdk::{contracttype, Address, BytesN};

/// `Option<Address>` shape compatible with Soroban storage / events.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
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
}

impl Default for OptAddress {
    fn default() -> Self {
        OptAddress::None
    }
}

/// `Option<BytesN<32>>` shape — used for any 32-byte hash that's allowed
/// to be unset (e.g. planting proof, GPS attestation, etc.).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
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
}

impl Default for OptBytesN32 {
    fn default() -> Self {
        OptBytesN32::None
    }
}
