//! # Soroban Custom Error Code Standard
//!
//! This module defines the workspace-wide allocation scheme for Soroban custom
//! error codes (issue #1813). A Soroban `#[contracterror]` is encoded on-chain
//! as a single `u32`. When every contract numbers its errors from `1`, the same
//! integer means different things in different contracts, which makes
//! predictable frontend error handling impossible.
//!
//! The standard therefore splits the `u32` into two fields:
//!
//! ```text
//!  ┌────────────────────┬────────────────────┐
//!  │   namespace (16b)  │   local code (16b) │
//!  └────────────────────┴────────────────────┘
//!    0            = shared registry (HarvestaError)
//!    1..=N        = one dedicated block per workspace crate
//! ```
//!
//! * Namespace `0` is reserved for the shared canonical registry
//!   [`crate::HarvestaError`]; its codes are the historical, already deployed
//!   `1..=118` values and are never renumbered (zero regression).
//! * Every other workspace crate owns exactly one `65_536` value block, so no
//!   two crates can ever emit the same `u32`.
//! * [`global_code`] / [`namespace_of`] / [`local_of`] are the `const fn`
//!   primitives a contract or an SDK client uses to build and decode codes.
//! * [`CRATE_ERROR_RANGES`] is the machine-readable allocation table. It is
//!   checked for disjointness at compile time via a const assertion.
//!
//! This module intentionally depends only on `core` so that it can be reused by
//! contracts, off-chain tooling and TypeScript bindings generators alike.

/// Version of this allocation standard. Bump only on a deliberate ABI change.
pub const STANDARD_VERSION: u32 = 1;

/// Number of high bits used for the crate namespace.
pub const NAMESPACE_BITS: u32 = 16;

/// Number of low bits used for the per-crate local code.
pub const LOCAL_CODE_BITS: u32 = 16;

/// Mask isolating the local code field.
pub const LOCAL_CODE_MASK: u32 = 0xFFFF;

/// Largest local code a single crate may allocate.
pub const MAX_LOCAL_CODE: u32 = LOCAL_CODE_MASK;

/// Namespace reserved for the shared canonical registry.
pub const SHARED_NAMESPACE: u32 = 0;

/// Width of one namespace block (`2^16`).
pub const NAMESPACE_SPAN: u32 = 1 << LOCAL_CODE_BITS;

/// First code of the shared canonical registry.
pub const SHARED_REGISTRY_FIRST: u32 = 1;

/// Last currently allocated code of the shared canonical registry.
///
/// When a new shared error is added, this value must be bumped together with
/// the `HarvestaError` enum. The value is a capacity ceiling, not a count.
pub const SHARED_REGISTRY_LAST: u32 = 118;

/// The range owned by the shared canonical registry.
pub const GLOBAL_SHARED_RANGE: ErrorRange =
    ErrorRange::new(SHARED_REGISTRY_FIRST, SHARED_REGISTRY_LAST);

/// A closed, inclusive interval of `u32` error codes allocated to one owner.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ErrorRange {
    pub first: u32,
    pub last: u32,
}

impl ErrorRange {
    /// Creates an inclusive range. Callers are expected to use disjoint values.
    pub const fn new(first: u32, last: u32) -> Self {
        Self { first, last }
    }

    /// Number of codes in the range.
    pub const fn len(self) -> u32 {
        self.last - self.first + 1
    }

    /// Whether `code` belongs to this range.
    pub const fn contains(self, code: u32) -> bool {
        code >= self.first && code <= self.last
    }

    /// Whether the interval is well-formed.
    pub const fn is_valid(self) -> bool {
        self.first <= self.last
    }

    /// Whether two inclusive ranges share at least one value.
    pub const fn overlaps(self, other: ErrorRange) -> bool {
        self.first <= other.last && other.first <= self.last
    }
}

/// Canonical workspace crate names. The index of a name is its namespace minus
/// one (namespace `0` belongs to the shared registry, not to a crate).
pub const CRATE_NAMES: &[&str] = &[
    "additionality-verifier",
    "admin-controls",
    "aggregate-impact-verifier",
    "atomic-swap",
    "auth-contract",
    "bonus-pool",
    "carbon-credits",
    "carbon-dex",
    "carbon-futures",
    "carbon-fractionalization",
    "carbon-insurance",
    "carbon-marketplace",
    "carbon-price-oracle",
    "community-offset-pool",
    "contract-utils",
    "cross-chain-settlement",
    "donation-escrow",
    "escrow",
    "escrow-milestone",
    "farmer-bonus-pool",
    "farmer-escrow",
    "farmer-registry",
    "harvesta-errors",
    "insurance-pool",
    "kyc-attestation",
    "leaderboard",
    "leakage-prevention",
    "location-proof",
    "naira-payout",
    "nft-certificate",
    "nullifier-registry",
    "planter-blacklist",
    "planter-registry",
    "platform-governance",
    "planting-bond",
    "public-seal",
    "shared",
    "sponsor-receipt",
    "species-catalog",
    "species-registry",
    "species-voting",
    "staking-rewards",
    "subscription-sponsorship",
    "transparent-proxy",
    "tree-escrow",
    "tree-genetics",
    "tree-registry",
    "tree_registry",
    "tree-retirement",
    "tree-token",
    "treasury",
    "upgrade-timelock",
    "verifier-staking",
    "xlm-bridge",
    "zk-location-verifier",
    "zk-verifier",
];

/// Number of crates covered by the standard.
pub const CRATE_COUNT: usize = CRATE_NAMES.len();

/// Namespace assigned to a crate index (`0` is reserved for the shared registry).
pub const fn namespace(crate_index: usize) -> u32 {
    crate_index as u32 + 1
}

/// The inclusive code block assigned to a crate index.
///
/// Blocks are derived from the index, so disjointness is guaranteed by
/// construction and cannot be broken by a copy/paste mistake.
pub const fn crate_range(crate_index: usize) -> ErrorRange {
    let base = NAMESPACE_SPAN * namespace(crate_index);
    ErrorRange::new(base, base + MAX_LOCAL_CODE)
}

/// Machine-readable allocation table: `(crate name, owned code range)`.
pub const CRATE_ERROR_RANGES: &[(&str, ErrorRange)] = &[
    ("additionality-verifier", crate_range(0)),
    ("admin-controls", crate_range(1)),
    ("aggregate-impact-verifier", crate_range(2)),
    ("atomic-swap", crate_range(3)),
    ("auth-contract", crate_range(4)),
    ("bonus-pool", crate_range(5)),
    ("carbon-credits", crate_range(6)),
    ("carbon-dex", crate_range(7)),
    ("carbon-futures", crate_range(8)),
    ("carbon-fractionalization", crate_range(9)),
    ("carbon-insurance", crate_range(10)),
    ("carbon-marketplace", crate_range(11)),
    ("carbon-price-oracle", crate_range(12)),
    ("community-offset-pool", crate_range(13)),
    ("contract-utils", crate_range(14)),
    ("cross-chain-settlement", crate_range(15)),
    ("donation-escrow", crate_range(16)),
    ("escrow", crate_range(17)),
    ("escrow-milestone", crate_range(18)),
    ("farmer-bonus-pool", crate_range(19)),
    ("farmer-escrow", crate_range(20)),
    ("farmer-registry", crate_range(21)),
    ("harvesta-errors", crate_range(22)),
    ("insurance-pool", crate_range(23)),
    ("kyc-attestation", crate_range(24)),
    ("leaderboard", crate_range(25)),
    ("leakage-prevention", crate_range(26)),
    ("location-proof", crate_range(27)),
    ("naira-payout", crate_range(28)),
    ("nft-certificate", crate_range(29)),
    ("nullifier-registry", crate_range(30)),
    ("planter-blacklist", crate_range(31)),
    ("planter-registry", crate_range(32)),
    ("platform-governance", crate_range(33)),
    ("planting-bond", crate_range(34)),
    ("public-seal", crate_range(35)),
    ("shared", crate_range(36)),
    ("sponsor-receipt", crate_range(37)),
    ("species-catalog", crate_range(38)),
    ("species-registry", crate_range(39)),
    ("species-voting", crate_range(40)),
    ("staking-rewards", crate_range(41)),
    ("subscription-sponsorship", crate_range(42)),
    ("transparent-proxy", crate_range(43)),
    ("tree-escrow", crate_range(44)),
    ("tree-genetics", crate_range(45)),
    ("tree-registry", crate_range(46)),
    ("tree_registry", crate_range(47)),
    ("tree-retirement", crate_range(48)),
    ("tree-token", crate_range(49)),
    ("treasury", crate_range(50)),
    ("upgrade-timelock", crate_range(51)),
    ("verifier-staking", crate_range(52)),
    ("xlm-bridge", crate_range(53)),
    ("zk-location-verifier", crate_range(54)),
    ("zk-verifier", crate_range(55)),
];

/// Builds a globally unique `u32` error code for `crate_index` and its local code.
///
/// `crate_index` follows [`CRATE_NAMES`]; pass `usize::MAX`-free values only.
pub const fn global_code(crate_index: usize, local: u32) -> u32 {
    (namespace(crate_index) << NAMESPACE_BITS) | (local & LOCAL_CODE_MASK)
}

/// Extracts the namespace field of a global code. `0` means shared registry.
pub const fn namespace_of(code: u32) -> u32 {
    code >> NAMESPACE_BITS
}

/// Extracts the local code field of a global code.
pub const fn local_of(code: u32) -> u32 {
    code & LOCAL_CODE_MASK
}

/// Whether a code belongs to the shared canonical registry namespace.
pub const fn is_shared(code: u32) -> bool {
    namespace_of(code) == SHARED_NAMESPACE
}

/// Verifies that no two allocated ranges overlap. Used as a compile-time guard.
pub const fn ranges_are_disjoint() -> bool {
    let mut i = 0;
    while i < CRATE_ERROR_RANGES.len() {
        let mut j = i + 1;
        while j < CRATE_ERROR_RANGES.len() {
            if CRATE_ERROR_RANGES[i].1.overlaps(CRATE_ERROR_RANGES[j].1) {
                return false;
            }
            j += 1;
        }
        i += 1;
    }
    true
}

/// Verifies that every allocated range is well formed.
pub const fn ranges_are_valid() -> bool {
    let mut i = 0;
    while i < CRATE_ERROR_RANGES.len() {
        if !CRATE_ERROR_RANGES[i].1.is_valid() {
            return false;
        }
        i += 1;
    }
    true
}

/// Looks up the allocated range by canonical crate name.
pub fn crate_range_by_name(name: &str) -> Option<ErrorRange> {
    CRATE_ERROR_RANGES
        .iter()
        .find(|(candidate, _)| *candidate == name)
        .map(|(_, range)| *range)
}

/// Where a global code originates from.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorOrigin {
    Shared,
    Contract(&'static str),
}

/// Resolves a global code to its owning crate (or the shared registry).
pub fn origin_of(code: u32) -> ErrorOrigin {
    if is_shared(code) {
        return ErrorOrigin::Shared;
    }
    let index = namespace_of(code) as usize - 1;
    match CRATE_NAMES.get(index) {
        Some(name) => ErrorOrigin::Contract(name),
        None => ErrorOrigin::Contract("unknown"),
    }
}

const _: () = assert!(NAMESPACE_BITS + LOCAL_CODE_BITS == 32);
const _: () = assert!(SHARED_REGISTRY_FIRST <= SHARED_REGISTRY_LAST);
const _: () = assert!(SHARED_REGISTRY_LAST < NAMESPACE_SPAN);
const _: () = assert!(ranges_are_disjoint());
const _: () = assert!(ranges_are_valid());
const _: () = assert!(CRATE_ERROR_RANGES.len() == CRATE_NAMES.len());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_layout_is_stable() {
        assert_eq!(STANDARD_VERSION, 1);
        assert_eq!(NAMESPACE_BITS + LOCAL_CODE_BITS, 32);
        assert_eq!(LOCAL_CODE_MASK, 0xFFFF);
        assert_eq!(NAMESPACE_SPAN, 0x1_0000);
    }

    #[test]
    fn allocated_ranges_are_disjoint_and_valid() {
        assert!(ranges_are_disjoint());
        assert!(ranges_are_valid());
        assert_eq!(CRATE_ERROR_RANGES.len(), CRATE_NAMES.len());
    }

    #[test]
    fn allocation_table_matches_crate_names() {
        for (index, name) in CRATE_NAMES.iter().enumerate() {
            assert_eq!(CRATE_ERROR_RANGES[index].0, *name);
            assert_eq!(CRATE_ERROR_RANGES[index].1, crate_range(index));
            assert_eq!(crate_range(index).len(), NAMESPACE_SPAN);
        }
    }

    #[test]
    fn no_crate_range_overlaps_the_shared_registry() {
        assert!(!GLOBAL_SHARED_RANGE.overlaps(crate_range(0)));
        assert!(crate_range(0).first > SHARED_REGISTRY_LAST);
        for (_, range) in CRATE_ERROR_RANGES {
            assert!(!range.overlaps(GLOBAL_SHARED_RANGE));
        }
    }

    #[test]
    fn encode_decode_roundtrip() {
        for index in 0..CRATE_COUNT {
            for local in [0, 1, 42, MAX_LOCAL_CODE] {
                let code = global_code(index, local);
                assert_eq!(namespace_of(code), namespace(index));
                assert_eq!(local_of(code), local);
                assert!(crate_range(index).contains(code));
            }
        }
    }

    #[test]
    fn local_codes_never_leak_into_the_namespace() {
        assert_eq!(global_code(5, MAX_LOCAL_CODE + 1), global_code(5, 0));
        assert_eq!(
            global_code(5, u32::MAX),
            global_code(5, u32::MAX & LOCAL_CODE_MASK)
        );
    }

    #[test]
    fn range_lookup_by_name() {
        let expected = crate_range(16);
        assert_eq!(crate_range_by_name("donation-escrow"), Some(expected));
        assert_eq!(crate_range_by_name("does-not-exist"), None);
    }

    #[test]
    fn origin_resolution() {
        assert_eq!(origin_of(1), ErrorOrigin::Shared);
        assert_eq!(origin_of(118), ErrorOrigin::Shared);
        assert_eq!(
            origin_of(global_code(16, 5)),
            ErrorOrigin::Contract("donation-escrow")
        );
        assert_eq!(
            origin_of(global_code(55, 1)),
            ErrorOrigin::Contract("zk-verifier")
        );
    }
}
