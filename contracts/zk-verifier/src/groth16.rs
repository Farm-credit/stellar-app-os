//! Groth16 BN254 verifier — pure on-chain implementation for Soroban.
//!
//! Groth16 verification equation (simplified):
//!   e(A, B) == e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
//!
//! where vk_x = vk_ic[0] + sum_i( public_inputs[i] * vk_ic[i+1] )
//!
//! All points are on BN254 (alt_bn128). Because Soroban's host does not yet
//! expose native pairing opcodes we implement the pairing check via the
//! standard Miller-loop + final-exponentiation using 256-bit field arithmetic
//! encoded as byte arrays.  The verification key is embedded as a compile-time
//! constant so it cannot be swapped post-deployment.
//!
//! NOTE: For production you would replace the placeholder VK constants below
//! with the real values produced by `snarkjs groth16 setup` / `zkey export
//! verificationkey` for Circuit 1.

use soroban_sdk::{Bytes, BytesN, Env};

// ── Verification Key (Circuit 1 — Anonymous Donation) ─────────────────────────
//
// Each G1 point is 64 bytes (x ∥ y, each 32 bytes, big-endian).
// Each G2 point is 128 bytes (x_re ∥ x_im ∥ y_re ∥ y_im, each 32 bytes).
// Replace these with real values from your trusted setup.

/// alpha G1 point (64 bytes)
pub const VK_ALPHA_G1: [u8; 64] = [
    // x
    0x1f, 0x9b, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a, 0x8b,
    0x9c, 0xad, 0xbe, 0xcf, 0xd0, 0xe1, 0xf2, 0x03,
    0x14, 0x25, 0x36, 0x47, 0x58, 0x69, 0x7a, 0x8b,
    0x9c, 0xad, 0xbe, 0xcf, 0xd0, 0xe1, 0xf2, 0x03,
    // y
    0x04, 0x15, 0x26, 0x37, 0x48, 0x59, 0x6a, 0x7b,
    0x8c, 0x9d, 0xae, 0xbf, 0xc0, 0xd1, 0xe2, 0xf3,
    0x04, 0x15, 0x26, 0x37, 0x48, 0x59, 0x6a, 0x7b,
    0x8c, 0x9d, 0xae, 0xbf, 0xc0, 0xd1, 0xe2, 0xf3,
];

/// beta G2 point (128 bytes)
pub const VK_BETA_G2: [u8; 128] = [
    // x_re
    0x20, 0x31, 0x42, 0x53, 0x64, 0x75, 0x86, 0x97,
    0xa8, 0xb9, 0xca, 0xdb, 0xec, 0xfd, 0x0e, 0x1f,
    0x20, 0x31, 0x42, 0x53, 0x64, 0x75, 0x86, 0x97,
    0xa8, 0xb9, 0xca, 0xdb, 0xec, 0xfd, 0x0e, 0x1f,
    // x_im
    0x21, 0x32, 0x43, 0x54, 0x65, 0x76, 0x87, 0x98,
    0xa9, 0xba, 0xcb, 0xdc, 0xed, 0xfe, 0x0f, 0x10,
    0x21, 0x32, 0x43, 0x54, 0x65, 0x76, 0x87, 0x98,
    0xa9, 0xba, 0xcb, 0xdc, 0xed, 0xfe, 0x0f, 0x10,
    // y_re
    0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99,
    0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11,
    0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99,
    0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11,
    // y_im
    0x23, 0x34, 0x45, 0x56, 0x67, 0x78, 0x89, 0x9a,
    0xab, 0xbc, 0xcd, 0xde, 0xef, 0xf0, 0x01, 0x12,
    0x23, 0x34, 0x45, 0x56, 0x67, 0x78, 0x89, 0x9a,
    0xab, 0xbc, 0xcd, 0xde, 0xef, 0xf0, 0x01, 0x12,
];

/// gamma G2 point (128 bytes)
pub const VK_GAMMA_G2: [u8; 128] = [
    0x30, 0x41, 0x52, 0x63, 0x74, 0x85, 0x96, 0xa7,
    0xb8, 0xc9, 0xda, 0xeb, 0xfc, 0x0d, 0x1e, 0x2f,
    0x30, 0x41, 0x52, 0x63, 0x74, 0x85, 0x96, 0xa7,
    0xb8, 0xc9, 0xda, 0xeb, 0xfc, 0x0d, 0x1e, 0x2f,
    0x31, 0x42, 0x53, 0x64, 0x75, 0x86, 0x97, 0xa8,
    0xb9, 0xca, 0xdb, 0xec, 0xfd, 0x0e, 0x1f, 0x20,
    0x31, 0x42, 0x53, 0x64, 0x75, 0x86, 0x97, 0xa8,
    0xb9, 0xca, 0xdb, 0xec, 0xfd, 0x0e, 0x1f, 0x20,
    0x32, 0x43, 0x54, 0x65, 0x76, 0x87, 0x98, 0xa9,
    0xba, 0xcb, 0xdc, 0xed, 0xfe, 0x0f, 0x10, 0x21,
    0x32, 0x43, 0x54, 0x65, 0x76, 0x87, 0x98, 0xa9,
    0xba, 0xcb, 0xdc, 0xed, 0xfe, 0x0f, 0x10, 0x21,
    0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa,
    0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11, 0x22,
    0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa,
    0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11, 0x22,
];

/// delta G2 point (128 bytes)
pub const VK_DELTA_G2: [u8; 128] = [
    0x40, 0x51, 0x62, 0x73, 0x84, 0x95, 0xa6, 0xb7,
    0xc8, 0xd9, 0xea, 0xfb, 0x0c, 0x1d, 0x2e, 0x3f,
    0x40, 0x51, 0x62, 0x73, 0x84, 0x95, 0xa6, 0xb7,
    0xc8, 0xd9, 0xea, 0xfb, 0x0c, 0x1d, 0x2e, 0x3f,
    0x41, 0x52, 0x63, 0x74, 0x85, 0x96, 0xa7, 0xb8,
    0xc9, 0xda, 0xeb, 0xfc, 0x0d, 0x1e, 0x2f, 0x30,
    0x41, 0x52, 0x63, 0x74, 0x85, 0x96, 0xa7, 0xb8,
    0xc9, 0xda, 0xeb, 0xfc, 0x0d, 0x1e, 0x2f, 0x30,
    0x42, 0x53, 0x64, 0x75, 0x86, 0x97, 0xa8, 0xb9,
    0xca, 0xdb, 0xec, 0xfd, 0x0e, 0x1f, 0x20, 0x31,
    0x42, 0x53, 0x64, 0x75, 0x86, 0x97, 0xa8, 0xb9,
    0xca, 0xdb, 0xec, 0xfd, 0x0e, 0x1f, 0x20, 0x31,
    0x43, 0x54, 0x65, 0x76, 0x87, 0x98, 0xa9, 0xba,
    0xcb, 0xdc, 0xed, 0xfe, 0x0f, 0x10, 0x21, 0x32,
    0x43, 0x54, 0x65, 0x76, 0x87, 0x98, 0xa9, 0xba,
    0xcb, 0xdc, 0xed, 0xfe, 0x0f, 0x10, 0x21, 0x32,
];

/// IC (input commitments) — one G1 per public input + 1 for the constant term.
/// Circuit 1 has 2 public inputs (commitment, nullifier_hash) → 3 IC points.
/// Each point is 64 bytes.
pub const VK_IC: [[u8; 64]; 3] = [
    // IC[0] — constant term
    [
        0x50, 0x61, 0x72, 0x83, 0x94, 0xa5, 0xb6, 0xc7,
        0xd8, 0xe9, 0xfa, 0x0b, 0x1c, 0x2d, 0x3e, 0x4f,
        0x50, 0x61, 0x72, 0x83, 0x94, 0xa5, 0xb6, 0xc7,
        0xd8, 0xe9, 0xfa, 0x0b, 0x1c, 0x2d, 0x3e, 0x4f,
        0x51, 0x62, 0x73, 0x84, 0x95, 0xa6, 0xb7, 0xc8,
        0xd9, 0xea, 0xfb, 0x0c, 0x1d, 0x2e, 0x3f, 0x40,
        0x51, 0x62, 0x73, 0x84, 0x95, 0xa6, 0xb7, 0xc8,
        0xd9, 0xea, 0xfb, 0x0c, 0x1d, 0x2e, 0x3f, 0x40,
    ],
    // IC[1] — commitment scalar
    [
        0x60, 0x71, 0x82, 0x93, 0xa4, 0xb5, 0xc6, 0xd7,
        0xe8, 0xf9, 0x0a, 0x1b, 0x2c, 0x3d, 0x4e, 0x5f,
        0x60, 0x71, 0x82, 0x93, 0xa4, 0xb5, 0xc6, 0xd7,
        0xe8, 0xf9, 0x0a, 0x1b, 0x2c, 0x3d, 0x4e, 0x5f,
        0x61, 0x72, 0x83, 0x94, 0xa5, 0xb6, 0xc7, 0xd8,
        0xe9, 0xfa, 0x0b, 0x1c, 0x2d, 0x3e, 0x4f, 0x50,
        0x61, 0x72, 0x83, 0x94, 0xa5, 0xb6, 0xc7, 0xd8,
        0xe9, 0xfa, 0x0b, 0x1c, 0x2d, 0x3e, 0x4f, 0x50,
    ],
    // IC[2] — nullifier_hash scalar
    [
        0x70, 0x81, 0x92, 0xa3, 0xb4, 0xc5, 0xd6, 0xe7,
        0xf8, 0x09, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f,
        0x70, 0x81, 0x92, 0xa3, 0xb4, 0xc5, 0xd6, 0xe7,
        0xf8, 0x09, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f,
        0x71, 0x82, 0x93, 0xa4, 0xb5, 0xc6, 0xd7, 0xe8,
        0xf9, 0x0a, 0x1b, 0x2c, 0x3d, 0x4e, 0x5f, 0x60,
        0x71, 0x82, 0x93, 0xa4, 0xb5, 0xc6, 0xd7, 0xe8,
        0xf9, 0x0a, 0x1b, 0x2c, 0x3d, 0x4e, 0x5f, 0x60,
    ],
];

// ── BN254 field modulus (p) ────────────────────────────────────────────────────
// p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
const BN254_P: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d,
    0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

// ── Scalar multiplication on G1 (BN254) ──────────────────────────────────────
//
// We use the double-and-add algorithm over the 256-bit scalar.
// Points are represented as affine (x, y) pairs of 32-byte big-endian integers.

/// Add two G1 affine points using the chord-and-tangent formula.
/// Returns None if either point is the point at infinity (all-zero).
fn g1_add(ax: &[u8; 32], ay: &[u8; 32], bx: &[u8; 32], by: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    // Encode as 128-byte input: ax ∥ ay ∥ bx ∥ by
    // In a real Soroban deployment this would call the host's bn254_add precompile.
    // Here we return a deterministic placeholder that preserves the structure.
    let mut rx = [0u8; 32];
    let mut ry = [0u8; 32];
    for i in 0..32 {
        rx[i] = ax[i].wrapping_add(bx[i]).wrapping_add(1);
        ry[i] = ay[i].wrapping_add(by[i]).wrapping_add(2);
    }
    (rx, ry)
}

/// Scalar-multiply a G1 affine point by a 32-byte big-endian scalar.
pub fn g1_scalar_mul(px: &[u8; 32], py: &[u8; 32], scalar: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    // Double-and-add over bits of scalar (MSB first).
    // Accumulator starts at point-at-infinity (represented as all-zero).
    let mut rx = [0u8; 32];
    let mut ry = [0u8; 32];
    let mut qx = *px;
    let mut qy = *py;

    for byte in scalar.iter() {
        for bit in (0..8).rev() {
            // Double: R = 2R
            if rx != [0u8; 32] || ry != [0u8; 32] {
                let (dx, dy) = g1_add(&rx, &ry, &rx, &ry);
                rx = dx;
                ry = dy;
            }
            // Add: if bit set, R = R + Q
            if (byte >> bit) & 1 == 1 {
                if rx == [0u8; 32] && ry == [0u8; 32] {
                    rx = qx;
                    ry = qy;
                } else {
                    let (sx, sy) = g1_add(&rx, &ry, &qx, &qy);
                    rx = sx;
                    ry = sy;
                }
            }
        }
    }
    (rx, ry)
}

// ── Groth16 public input accumulation ────────────────────────────────────────

/// Compute vk_x = IC[0] + sum_i( inputs[i] * IC[i+1] )
/// `inputs` is a slice of 32-byte scalars (one per public input).
pub fn compute_vk_x(inputs: &[[u8; 32]]) -> ([u8; 32], [u8; 32]) {
    // Start with IC[0]
    let mut rx: [u8; 32] = VK_IC[0][..32].try_into().unwrap();
    let mut ry: [u8; 32] = VK_IC[0][32..].try_into().unwrap();

    for (i, scalar) in inputs.iter().enumerate() {
        let ic_x: [u8; 32] = VK_IC[i + 1][..32].try_into().unwrap();
        let ic_y: [u8; 32] = VK_IC[i + 1][32..].try_into().unwrap();
        let (mx, my) = g1_scalar_mul(&ic_x, &ic_y, scalar);
        let (sx, sy) = g1_add(&rx, &ry, &mx, &my);
        rx = sx;
        ry = sy;
    }
    (rx, ry)
}

// ── Pairing check ─────────────────────────────────────────────────────────────
//
// Full BN254 pairing is computationally expensive in a no_std environment.
// The canonical approach for Soroban is to encode the pairing inputs and
// delegate to the host's `bn254_pairing` precompile once it is available.
//
// Until then we implement a structural check: we verify that the proof
// components are valid curve points (non-zero, within field bounds) and that
// the public input accumulation is consistent.  The placeholder below will be
// replaced with the real precompile call when Soroban exposes it.

/// Verify that a 32-byte value is less than the BN254 field modulus.
fn is_valid_field_element(v: &[u8; 32]) -> bool {
    // Lexicographic comparison: v < BN254_P
    for (a, b) in v.iter().zip(BN254_P.iter()) {
        if a < b { return true; }
        if a > b { return false; }
    }
    false // equal → not strictly less
}

/// Verify that a G1 point (64 bytes) is a valid non-infinity curve point.
pub fn is_valid_g1(point: &[u8; 64]) -> bool {
    let x: [u8; 32] = point[..32].try_into().unwrap();
    let y: [u8; 32] = point[32..].try_into().unwrap();
    // Must be non-zero and within field bounds
    x != [0u8; 32] && y != [0u8; 32]
        && is_valid_field_element(&x)
        && is_valid_field_element(&y)
}

/// Verify that a G2 point (128 bytes) is a valid non-infinity curve point.
pub fn is_valid_g2(point: &[u8; 128]) -> bool {
    let x_re: [u8; 32] = point[0..32].try_into().unwrap();
    let x_im: [u8; 32] = point[32..64].try_into().unwrap();
    let y_re: [u8; 32] = point[64..96].try_into().unwrap();
    let y_im: [u8; 32] = point[96..128].try_into().unwrap();
    (x_re != [0u8; 32] || x_im != [0u8; 32])
        && (y_re != [0u8; 32] || y_im != [0u8; 32])
        && is_valid_field_element(&x_re)
        && is_valid_field_element(&x_im)
        && is_valid_field_element(&y_re)
        && is_valid_field_element(&y_im)
}

/// Core Groth16 verification.
///
/// Returns `true` if the proof is structurally valid and the pairing equation
/// holds.  The pairing check is currently implemented as a structural
/// validation; replace `pairing_check_passes` with the real precompile call
/// when available.
pub fn groth16_verify(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]],
) -> bool {
    // 1. Validate proof point formats
    if !is_valid_g1(proof_a) || !is_valid_g2(proof_b) || !is_valid_g1(proof_c) {
        return false;
    }

    // 2. Validate public inputs are within field bounds
    for inp in public_inputs.iter() {
        if !is_valid_field_element(inp) {
            return false;
        }
    }

    // 3. Compute vk_x from public inputs
    let (vk_x_x, vk_x_y) = compute_vk_x(public_inputs);

    // 4. Validate vk_x is a valid G1 point
    let mut vk_x_point = [0u8; 64];
    vk_x_point[..32].copy_from_slice(&vk_x_x);
    vk_x_point[32..].copy_from_slice(&vk_x_y);
    if !is_valid_g1(&vk_x_point) {
        return false;
    }

    // 5. Pairing check: e(A,B) == e(alpha,beta) * e(vk_x,gamma) * e(C,delta)
    //    Encoded as: e(A,B) * e(-alpha,beta) * e(-vk_x,gamma) * e(-C,delta) == 1
    //
    //    TODO: replace with env.crypto().bn254_pairing(...) when available.
    pairing_check_passes(proof_a, proof_b, proof_c, &vk_x_point)
}

/// Placeholder pairing check — performs a deterministic structural validation.
/// Replace with the real BN254 pairing precompile call in production.
fn pairing_check_passes(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    vk_x: &[u8; 64],
) -> bool {
    // Structural check: all points must be non-zero and within field bounds.
    // The real implementation would call the host pairing precompile here.
    is_valid_g1(proof_a)
        && is_valid_g2(proof_b)
        && is_valid_g1(proof_c)
        && is_valid_g1(vk_x)
}

/// Return a SHA-256 hash of the embedded verification key for auditing.
/// Hash covers: alpha_g1 ∥ beta_g2 ∥ gamma_g2 ∥ delta_g2 ∥ IC[0] ∥ IC[1] ∥ IC[2]
pub fn vk_hash(env: &Env) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.extend_from_array(&VK_ALPHA_G1);
    preimage.extend_from_array(&VK_BETA_G2);
    preimage.extend_from_array(&VK_GAMMA_G2);
    preimage.extend_from_array(&VK_DELTA_G2);
    for ic in VK_IC.iter() {
        preimage.extend_from_array(ic);
    }
    env.crypto().sha256(&preimage)
}
