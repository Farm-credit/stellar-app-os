#![no_std]

//! Location Proof Contract — Closes #639
//!
//! Extends location-proof verification to validate coordinate bounds against
//! multi-vertex polygons representing specific afforestation zones, upgrading
//! from the original simple `in_region` boolean flag supplied by the prover.
//!
//! # Polygon geofencing design
//!
//! Afforestation zones are registered on-chain as ordered lists of `Vertex`
//! values (latitude/longitude as scaled integers — millionths of a degree).
//! When a proof is submitted via `submit_proof_in_zone`, the contract:
//!
//!   1. Loads the polygon for the given `zone_id`.
//!   2. Runs the **even-odd ray-casting algorithm** using pure integer arithmetic
//!      (no floating point, no external crates).
//!   3. Panics with `PointOutsidePolygon` if the result is "outside".
//!   4. Stores the proof entry with the matched `zone_id` for auditability.
//!
//! # Ray-casting algorithm
//!
//! For a test point P = (px, py) and polygon edge from A = (ax, ay) to B = (bx, by):
//!
//!   - Cast a horizontal ray rightward from P (increasing x direction).
//!   - An edge crosses the ray when one endpoint is strictly above py and the
//!     other is at or below py (or vice-versa), AND the x-intercept of the edge
//!     at y=py is ≥ px.
//!   - Count crossings; odd = inside, even = outside.
//!
//! All arithmetic uses `i64` to prevent overflow when multiplying scaled i32
//! coordinates.
//!
//! # Coordinate convention
//!
//! Latitude and longitude are stored as `i32` values in **millionths of a degree**
//! (microdegrees).  Examples:
//!   - 9°N  → lat =  9_000_000
//!   - 14°N → lat = 14_000_000
//!   -  3°E → lon =  3_000_000
//!   - 15°E → lon = 15_000_000
//!
//! This matches the existing commitment scheme:
//!   `commitment = SHA-256(lat_i32_be || lon_i32_be || farmer_id_xdr || nonce_be)`
//!
//! # Backward compatibility
//!
//! The original `submit_proof(farmer_id, commitment, in_region, nonce)` function
//! is preserved unchanged.  New callers should use `submit_proof_in_zone` which
//! performs on-chain polygon validation.

use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Bytes, BytesN,
    Env, IntoVal, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Minimum number of vertices required for a valid polygon.
const MIN_VERTICES: u32 = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

/// A single polygon vertex expressed as microdegrees (millionths of a degree).
///
/// `lat` — latitude  × 1_000_000  (positive = North, negative = South)
/// `lon` — longitude × 1_000_000  (positive = East,  negative = West)
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Vertex {
    pub lat: i32,
    pub lon: i32,
}

/// An afforestation zone defined by an ordered polygon of vertices.
///
/// Vertices must be given in either clockwise or counter-clockwise order;
/// the ray-casting algorithm is winding-order agnostic.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AfforestationZone {
    /// Unique numeric identifier for this zone.
    pub zone_id: u32,
    /// Ordered polygon vertices (≥ 3 required).
    pub vertices: Vec<Vertex>,
    /// Human-readable name stored for off-chain indexing (max 32 chars).
    pub name: soroban_sdk::String,
    /// Ledger timestamp when the zone was last updated.
    pub updated_at: u64,
}

/// Proof entry — produced by either `submit_proof` (legacy) or
/// `submit_proof_in_zone` (polygon-gated).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LocationProofEntry {
    /// SHA-256 commitment of (lat || lon || farmer_id || nonce)
    pub commitment: BytesN<32>,
    /// True when the point passed the geofence check.
    pub in_region: bool,
    /// Farmer's Stellar address.
    pub farmer_id: Address,
    /// Ledger timestamp of submission.
    pub submitted_at: u64,
    /// Nonce used in the commitment (prevents replay).
    pub nonce: u64,
    /// Zone ID matched by `submit_proof_in_zone`; 0 for legacy proofs.
    pub zone_id: u32,
}

// ── Storage key helpers ───────────────────────────────────────────────────────

fn zone_key(env: &Env, zone_id: u32) -> soroban_sdk::Val {
    (symbol_short!("ZONE"), zone_id).into_val(env)
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct LocationProof;

#[contractimpl]
impl LocationProof {
    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /// One-time initialisation — sets the verifier/admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
    }

    // ── Zone management (admin-only) ──────────────────────────────────────────

    /// Register a new afforestation zone polygon.
    ///
    /// `zone_id`  — unique numeric ID; must not already be registered.
    /// `vertices` — ordered polygon vertices (≥ 3, in microdegrees).
    /// `name`     — human-readable label.
    ///
    /// # Errors
    /// - `Unauthorized`           — caller is not the admin
    /// - `PolygonTooFewVertices`  — fewer than 3 vertices supplied
    pub fn register_zone(
        env: Env,
        zone_id: u32,
        vertices: Vec<Vertex>,
        name: soroban_sdk::String,
    ) {
        Self::require_admin(&env);

        if vertices.len() < MIN_VERTICES {
            panic_with_error!(&env, HarvestaError::PolygonTooFewVertices);
        }

        let zone = AfforestationZone {
            zone_id,
            vertices,
            name,
            updated_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&zone_key(&env, zone_id), &zone);

        env.events().publish(
            (symbol_short!("ZoneReg"), zone_id),
            env.ledger().timestamp(),
        );
    }

    /// Update the polygon for an existing zone.
    ///
    /// # Errors
    /// - `Unauthorized`          — caller is not the admin
    /// - `ZoneNotFound`          — zone_id is not registered
    /// - `PolygonTooFewVertices` — fewer than 3 vertices supplied
    pub fn update_zone(
        env: Env,
        zone_id: u32,
        vertices: Vec<Vertex>,
        name: soroban_sdk::String,
    ) {
        Self::require_admin(&env);

        if !env.storage().persistent().has(&zone_key(&env, zone_id)) {
            panic_with_error!(&env, HarvestaError::ZoneNotFound);
        }

        if vertices.len() < MIN_VERTICES {
            panic_with_error!(&env, HarvestaError::PolygonTooFewVertices);
        }

        let zone = AfforestationZone {
            zone_id,
            vertices,
            name,
            updated_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&zone_key(&env, zone_id), &zone);

        env.events().publish(
            (symbol_short!("ZoneUpd"), zone_id),
            env.ledger().timestamp(),
        );
    }

    /// Returns the registered zone, or `None` if not found.
    pub fn get_zone(env: Env, zone_id: u32) -> Option<AfforestationZone> {
        env.storage()
            .persistent()
            .get(&zone_key(&env, zone_id))
    }

    // ── Proof submission — polygon-gated path (new) ───────────────────────────

    /// Submit a location proof with on-chain polygon geofencing.
    ///
    /// The prover supplies the decoded `lat`/`lon` (microdegrees) alongside
    /// the commitment.  The contract:
    ///   1. Loads the polygon for `zone_id`.
    ///   2. Runs the even-odd ray-casting algorithm in pure integer arithmetic.
    ///   3. Panics with `PointOutsidePolygon` if the point is outside.
    ///   4. Panics with `ProofCommitmentAlreadyRegistered` on replay.
    ///   5. Stores the proof entry tagged with the matched `zone_id`.
    ///
    /// `commitment` — SHA-256(lat_i32_be || lon_i32_be || farmer_id_xdr || nonce_be)
    /// `lat`        — latitude  in microdegrees (e.g. 9_000_000 for 9°N)
    /// `lon`        — longitude in microdegrees (e.g. 8_500_000 for 8.5°E)
    /// `nonce`      — per-farmer monotonically increasing counter
    /// `zone_id`    — registered polygon zone to test against
    ///
    /// # Errors
    /// - `NotInitialized`                  — contract not initialised
    /// - `ZoneNotFound`                    — zone_id is not registered
    /// - `PointOutsidePolygon`             — ray-casting says outside
    /// - `ProofCommitmentAlreadyRegistered` — duplicate commitment
    pub fn submit_proof_in_zone(
        env: Env,
        farmer_id: Address,
        commitment: BytesN<32>,
        lat: i32,
        lon: i32,
        nonce: u64,
        zone_id: u32,
    ) {
        Self::require_admin(&env);

        // Load zone — panics with ZoneNotFound if missing
        let zone: AfforestationZone = env
            .storage()
            .persistent()
            .get(&zone_key(&env, zone_id))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::ZoneNotFound));

        // Run ray-casting on-chain
        if !Self::point_in_polygon(&env, lat, lon, &zone.vertices) {
            panic_with_error!(&env, HarvestaError::PointOutsidePolygon);
        }

        // Reject duplicate commitments (replay protection)
        if env.storage().persistent().has(&commitment) {
            panic_with_error!(&env, HarvestaError::ProofCommitmentAlreadyRegistered);
        }

        let entry = LocationProofEntry {
            commitment: commitment.clone(),
            in_region: true,
            farmer_id: farmer_id.clone(),
            submitted_at: env.ledger().timestamp(),
            nonce,
            zone_id,
        };

        env.storage().persistent().set(&commitment, &entry);

        env.events().publish(
            (symbol_short!("loc_proof"), farmer_id),
            (commitment, zone_id),
        );
    }

    // ── Proof submission — legacy boolean path (unchanged) ────────────────────

    /// Submit a ZK location proof using the original boolean `in_region` flag.
    ///
    /// Preserved for backward compatibility.  New integrations should prefer
    /// `submit_proof_in_zone` which performs on-chain polygon validation.
    ///
    /// `commitment` — SHA-256(lat_i32_be || lon_i32_be || farmer_id_xdr || nonce_be)
    /// `in_region`  — true iff the prover verified the point is in Northern Nigeria
    /// `nonce`      — monotonically increasing per-farmer counter
    pub fn submit_proof(
        env: Env,
        farmer_id: Address,
        commitment: BytesN<32>,
        in_region: bool,
        nonce: u64,
    ) {
        Self::require_admin(&env);

        if !in_region {
            panic_with_error!(&env, HarvestaError::OutsideNigeriaRegion);
        }

        if env.storage().persistent().has(&commitment) {
            panic_with_error!(&env, HarvestaError::ProofCommitmentAlreadyRegistered);
        }

        let entry = LocationProofEntry {
            commitment: commitment.clone(),
            in_region,
            farmer_id: farmer_id.clone(),
            submitted_at: env.ledger().timestamp(),
            nonce,
            zone_id: 0, // legacy — no polygon zone
        };

        env.storage().persistent().set(&commitment, &entry);

        env.events()
            .publish((symbol_short!("loc_proof"), farmer_id), commitment);
    }

    // ── Read operations ───────────────────────────────────────────────────────

    /// Returns the proof entry for a given commitment, if it exists.
    pub fn get_proof(env: Env, commitment: BytesN<32>) -> Option<LocationProofEntry> {
        env.storage().persistent().get(&commitment)
    }

    /// Returns true if the commitment has been registered.
    pub fn is_proven(env: Env, commitment: BytesN<32>) -> bool {
        env.storage().persistent().has(&commitment)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    /// Even-odd ray-casting algorithm in pure integer arithmetic.
    ///
    /// Casts a horizontal ray rightward from point `(px, py)` and counts how
    /// many edges of `polygon` it crosses.  Odd = inside, even = outside.
    ///
    /// All intermediate values use `i64` to avoid overflow when multiplying
    /// two `i32` microdegree coordinates (max ~180_000_000 × 180_000_000 fits
    /// comfortably in i64).
    ///
    /// Edge cases:
    /// - A vertex exactly on `py` is counted only when it is the *lower*
    ///   endpoint of its edge (the standard half-open interval trick), ensuring
    ///   no edge is counted twice for points on horizontal polygon edges.
    /// - Horizontal edges (ay == by) are skipped entirely.
    fn point_in_polygon(env: &Env, lat: i32, lon: i32, vertices: &Vec<Vertex>) -> bool {
        let n = vertices.len();
        if n < MIN_VERTICES {
            return false;
        }

        // Map: x-axis = longitude, y-axis = latitude
        // Ray is cast rightward (increasing longitude) from the test point.
        let px: i64 = lon as i64; // x = longitude of test point
        let py: i64 = lat as i64; // y = latitude  of test point
        let mut inside = false;

        let mut j = n - 1;
        let mut i: u32 = 0;

        while i < n {
            let vi = vertices.get(i).unwrap();
            let vj = vertices.get(j).unwrap();

            let ax: i64 = vi.lon as i64; // x of vertex i
            let ay: i64 = vi.lat as i64; // y of vertex i
            let bx: i64 = vj.lon as i64; // x of vertex j
            let by: i64 = vj.lat as i64; // y of vertex j

            // Half-open interval: one endpoint strictly above py, other at or below.
            let crosses_ray = (ay > py) != (by > py);

            if crosses_ray {
                // x-intercept of edge at y=py, compared to px.
                // x_intersect = ax + (py - ay) * (bx - ax) / (by - ay)
                // Check x_intersect >= px using integer cross-multiplication:
                //   lhs = (py - ay) * (bx - ax)
                //   rhs = (px - ax) * (by - ay)
                // When dy > 0: intersect_ge_px iff lhs >= rhs
                // When dy < 0: intersect_ge_px iff lhs <= rhs  (flip because dividing by negative)
                let dy = by - ay; // guaranteed non-zero because crosses_ray is true
                let lhs = (py - ay) * (bx - ax);
                let rhs = (px - ax) * dy;

                let intersect_right = if dy > 0 { lhs >= rhs } else { lhs <= rhs };

                if intersect_right {
                    inside = !inside;
                }
            }

            j = i;
            i += 1;
        }

        let _ = env;
        inside
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Address, Bytes, BytesN, Env, String};

    // ── helpers ───────────────────────────────────────────────────────────────

    fn setup() -> (Env, Address, LocationProofClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, LocationProof);
        let client = LocationProofClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn commitment(env: &Env, seed: u8) -> BytesN<32> {
        let mut preimage = Bytes::new(env);
        preimage.extend_from_array(&[seed; 64]);
        env.crypto().sha256(&preimage).into()
    }

    fn v(lat: i32, lon: i32) -> Vertex {
        Vertex { lat, lon }
    }

    /// A simple axis-aligned rectangle in microdegrees.
    /// Covers lat [9_000_000, 11_000_000] × lon [7_000_000, 9_000_000]
    /// (approx 9°N–11°N, 7°E–9°E — squarely inside Northern Nigeria).
    fn rect_zone(env: &Env) -> Vec<Vertex> {
        vec![
            env,
            v(9_000_000, 7_000_000),   // SW
            v(11_000_000, 7_000_000),  // NW
            v(11_000_000, 9_000_000),  // NE
            v(9_000_000, 9_000_000),   // SE
        ]
    }

    /// A triangle with vertices at roughly (10°N,8°E), (9°N,7°E), (9°N,9°E).
    fn triangle_zone(env: &Env) -> Vec<Vertex> {
        vec![
            env,
            v(10_000_000, 8_000_000),  // apex
            v(9_000_000,  7_000_000),  // bottom-left
            v(9_000_000,  9_000_000),  // bottom-right
        ]
    }

    fn zone_name(env: &Env, s: &str) -> String {
        String::from_str(env, s)
    }

    // ── zone management ───────────────────────────────────────────────────────

    #[test]
    fn test_register_and_get_zone() {
        let (env, _, client) = setup();
        client.register_zone(&1u32, &rect_zone(&env), &zone_name(&env, "Kaduna North"));

        let z = client.get_zone(&1u32).unwrap();
        assert_eq!(z.zone_id, 1u32);
        assert_eq!(z.vertices.len(), 4);
        assert_eq!(z.name, zone_name(&env, "Kaduna North"));
    }

    #[test]
    fn test_update_zone_replaces_polygon() {
        let (env, _, client) = setup();
        client.register_zone(&1u32, &rect_zone(&env), &zone_name(&env, "v1"));
        client.update_zone(&1u32, &triangle_zone(&env), &zone_name(&env, "v2"));

        let z = client.get_zone(&1u32).unwrap();
        assert_eq!(z.vertices.len(), 3);
        assert_eq!(z.name, zone_name(&env, "v2"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #77)")]
    fn test_update_nonexistent_zone_rejected() {
        let (env, _, client) = setup();
        client.update_zone(&99u32, &rect_zone(&env), &zone_name(&env, "x"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #75)")]
    fn test_register_zone_too_few_vertices_rejected() {
        let (env, _, client) = setup();
        let two_pts = vec![&env, v(9_000_000, 7_000_000), v(11_000_000, 9_000_000)];
        client.register_zone(&1u32, &two_pts, &zone_name(&env, "bad"));
    }

    #[test]
    fn test_get_zone_returns_none_for_unknown_id() {
        let (_, _, client) = setup();
        assert!(client.get_zone(&42u32).is_none());
    }

    // ── submit_proof_in_zone — happy path ─────────────────────────────────────

    #[test]
    fn test_point_inside_rect_zone_accepted() {
        let (env, _, client) = setup();
        client.register_zone(&1u32, &rect_zone(&env), &zone_name(&env, "Rect"));

        let farmer = Address::generate(&env);
        let c = commitment(&env, 1);
        // Centre of rectangle: 10°N, 8°E
        client.submit_proof_in_zone(&farmer, &c, &10_000_000i32, &8_000_000i32, &1u64, &1u32);

        assert!(client.is_proven(&c));
        let entry = client.get_proof(&c).unwrap();
        assert!(entry.in_region);
        assert_eq!(entry.zone_id, 1u32);
        assert_eq!(entry.nonce, 1u64);
    }

    #[test]
    fn test_point_inside_triangle_zone_accepted() {
        let (env, _, client) = setup();
        client.register_zone(&2u32, &triangle_zone(&env), &zone_name(&env, "Tri"));

        let farmer = Address::generate(&env);
        let c = commitment(&env, 2);
        // Centroid ≈ (9.33°N, 8°E)
        client.submit_proof_in_zone(&farmer, &c, &9_333_000i32, &8_000_000i32, &1u64, &2u32);

        assert!(client.is_proven(&c));
    }

    #[test]
    fn test_multiple_zones_independent() {
        let (env, _, client) = setup();
        client.register_zone(&1u32, &rect_zone(&env), &zone_name(&env, "Rect"));
        client.register_zone(&2u32, &triangle_zone(&env), &zone_name(&env, "Tri"));

        let farmer = Address::generate(&env);
        let c1 = commitment(&env, 10);
        let c2 = commitment(&env, 11);

        // Centre of rect
        client.submit_proof_in_zone(&farmer, &c1, &10_000_000i32, &8_000_000i32, &1u64, &1u32);
        // Centroid of triangle
        client.submit_proof_in_zone(&farmer, &c2, &9_333_000i32, &8_000_000i32, &2u64, &2u32);

        assert_eq!(client.get_proof(&c1).unwrap().zone_id, 1u32);
        assert_eq!(client.get_proof(&c2).unwrap().zone_id, 2u32);
    }

    // ── submit_proof_in_zone — error paths ────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #76)")]
    fn test_point_outside_rect_zone_rejected() {
        let (env, _, client) = setup();
        client.register_zone(&1u32, &rect_zone(&env), &zone_name(&env, "Rect"));

        let farmer = Address::generate(&env);
        let c = commitment(&env, 20);
        // 5°N, 5°E — well outside [9°–11°N, 7°–9°E]
        client.submit_proof_in_zone(&farmer, &c, &5_000_000i32, &5_000_000i32, &1u64, &1u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #76)")]
    fn test_point_outside_triangle_zone_rejected() {
        let (env, _, client) = setup();
        client.register_zone(&1u32, &triangle_zone(&env), &zone_name(&env, "Tri"));

        let farmer = Address::generate(&env);
        let c = commitment(&env, 21);
        // 12°N, 8°E — north of the triangle
        client.submit_proof_in_zone(&farmer, &c, &12_000_000i32, &8_000_000i32, &1u64, &1u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #77)")]
    fn test_submit_proof_unregistered_zone_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 22);
        client.submit_proof_in_zone(&farmer, &c, &10_000_000i32, &8_000_000i32, &1u64, &99u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #66)")]
    fn test_replay_in_zone_rejected() {
        let (env, _, client) = setup();
        client.register_zone(&1u32, &rect_zone(&env), &zone_name(&env, "Rect"));

        let farmer = Address::generate(&env);
        let c = commitment(&env, 30);

        client.submit_proof_in_zone(&farmer, &c, &10_000_000i32, &8_000_000i32, &1u64, &1u32);
        // Same commitment again — must panic
        client.submit_proof_in_zone(&farmer, &c, &10_000_000i32, &8_000_000i32, &2u64, &1u32);
    }

    // ── ray-casting edge cases ────────────────────────────────────────────────

    #[test]
    fn test_point_at_polygon_centroid_is_inside() {
        // A regular convex pentagon — centroid is always inside.
        // Using integer-approximate values for a 1-degree square.
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, LocationProof);
        let client = LocationProofClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // 5-vertex convex polygon: rough pentagon around 10°N, 8°E
        let pentagon = vec![
            &env,
            v(11_000_000,  8_000_000),  // top
            v(10_309_000,  8_951_000),  // top-right
            v(9_382_000,   8_588_000),  // bottom-right
            v(9_382_000,   7_412_000),  // bottom-left
            v(10_309_000,  7_049_000),  // top-left
        ];
        client.register_zone(&1u32, &pentagon, &zone_name(&env, "Pentagon"));

        let farmer = Address::generate(&env);
        let c = commitment(&env, 40);
        // Centroid at exactly 10°N, 8°E
        client.submit_proof_in_zone(&farmer, &c, &10_000_000i32, &8_000_000i32, &1u64, &1u32);
        assert!(client.is_proven(&c));
    }

    #[test]
    fn test_concave_polygon_inside_point_accepted() {
        // L-shaped concave polygon — a point in the concave notch is outside.
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, LocationProof);
        let client = LocationProofClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // L-shape vertices (all in microdegrees, conceptually 1-unit grid):
        //   (0,0)→(0,2)→(1,2)→(1,1)→(2,1)→(2,0)→back
        // Scaled up by 1_000_000 to fit microdegree convention.
        let l_shape = vec![
            &env,
            v(0,         0),
            v(0,         2_000_000),
            v(1_000_000, 2_000_000),
            v(1_000_000, 1_000_000),
            v(2_000_000, 1_000_000),
            v(2_000_000, 0),
        ];
        client.register_zone(&1u32, &l_shape, &zone_name(&env, "L-shape"));

        // Point inside the main body of the L: (500_000, 500_000)
        let farmer = Address::generate(&env);
        let c = commitment(&env, 50);
        client.submit_proof_in_zone(&farmer, &c, &500_000i32, &500_000i32, &1u64, &1u32);
        assert!(client.is_proven(&c));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #76)")]
    fn test_concave_polygon_notch_point_rejected() {
        // Same L-shape — a point in the notch (top-right) is outside.
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, LocationProof);
        let client = LocationProofClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let l_shape = vec![
            &env,
            v(0,         0),
            v(0,         2_000_000),
            v(1_000_000, 2_000_000),
            v(1_000_000, 1_000_000),
            v(2_000_000, 1_000_000),
            v(2_000_000, 0),
        ];
        client.register_zone(&1u32, &l_shape, &zone_name(&env, "L-shape"));

        let farmer = Address::generate(&env);
        let c = commitment(&env, 51);
        // Point in the notch: (1_500_000, 1_500_000) — outside the L
        client.submit_proof_in_zone(&farmer, &c, &1_500_000i32, &1_500_000i32, &1u64, &1u32);
    }

    // ── legacy submit_proof (backward compatibility) ──────────────────────────

    #[test]
    fn test_legacy_submit_and_lookup() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 1);

        client.submit_proof(&farmer, &c, &true, &1u64);
        assert!(client.is_proven(&c));

        let entry = client.get_proof(&c).unwrap();
        assert_eq!(entry.farmer_id, farmer);
        assert!(entry.in_region);
        assert_eq!(entry.nonce, 1u64);
        assert_eq!(entry.zone_id, 0u32); // legacy — no zone
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #66)")]
    fn test_legacy_replay_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 2);

        client.submit_proof(&farmer, &c, &true, &1u64);
        client.submit_proof(&farmer, &c, &true, &2u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #65)")]
    fn test_legacy_out_of_region_rejected() {
        let (env, _, client) = setup();
        let farmer = Address::generate(&env);
        let c = commitment(&env, 3);
        client.submit_proof(&farmer, &c, &false, &1u64);
    }
}
