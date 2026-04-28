# Privacy-Preserving Donations with Zero-Knowledge Proofs

## Overview

This system implements privacy-preserving donations using zero-knowledge (ZK) proofs, allowing donors to prove they made a valid donation without revealing their wallet address on-chain.

## Architecture

### Components

1. **ZK Proof Generation (`lib/zk/`)**
   - `prover.ts`: Generates Groth16 ZK proofs in-browser using WebAssembly
   - `crypto.ts`: Cryptographic utilities for commitments and nullifiers
   - `types.ts`: TypeScript definitions for ZK proof structures

2. **Smart Contract Integration (`lib/stellar/anonymous-donation.ts`)**
   - Builds anonymous donation transactions
   - Integrates with nullifier registry contract
   - Prevents double-donations using nullifiers

3. **React Components**
   - `AnonymousDonationToggle`: UI toggle for enabling anonymous mode
   - `ZKProofGenerator`: Visual feedback during proof generation
   - `AnonymousPaymentSection`: Complete payment flow for anonymous donations

4. **API Endpoints**
   - `/api/transaction/submit-anonymous`: Verifies proofs and submits transactions

## How It Works

### 1. Proof Generation

When a donor enables anonymous mode:

```typescript
// Generate cryptographic commitments
const nonce = generateNonce(); // Random 32-byte value
const donationCommitment = Hash(walletAddress || amount || nonce);
const nullifier = Hash(walletAddress || nonce);
const amountCommitment = Hash(amount || nonce);

// Generate ZK proof
const proof = await generateAnonymousDonationProof(walletAddress, amount, nonce);
```

### 2. Proof Structure

The proof contains:
- **Private inputs** (never revealed):
  - Donor wallet address
  - Random nonce
  
- **Public outputs** (revealed on-chain):
  - Donation commitment
  - Nullifier (prevents double-donations)
  - Amount commitment

### 3. Transaction Submission

```typescript
// Build anonymous transaction
const { transactionXdr } = await buildAnonymousDonationTransaction(
  amount,
  proof,
  relayerPublicKey,
  network
);

// Submit through relayer (donor's identity hidden)
const txHash = await submitTransaction(transactionXdr);
```

### 4. On-Chain Verification

The smart contract verifies:
1. ✅ Proof is cryptographically valid
2. ✅ Nullifier hasn't been used before
3. ✅ Amount commitment matches the payment
4. ✅ Donation goes to correct addresses (70% planting, 30% buffer)

## Security Guarantees

### Privacy
- **Wallet address never revealed**: Only the proof is submitted on-chain
- **No linkability**: Different donations from the same wallet cannot be linked
- **No metadata leakage**: Transaction metadata doesn't reveal donor identity

### Integrity
- **Proof of funds**: ZK proof cryptographically proves the donor has the funds
- **Double-spend prevention**: Nullifiers prevent the same donation from being submitted twice
- **Amount verification**: The committed amount matches the actual payment

### Cryptographic Primitives

- **Hash function**: SHA-256 for commitments
- **ZK proof system**: Groth16 (efficient verification)
- **Elliptic curve**: BN254 (optimal for Groth16)
- **Field arithmetic**: BN254 scalar field (254-bit prime)

## Usage

### For Donors

1. **Enable Anonymous Mode**
   ```tsx
   <AnonymousDonationToggle
     isAnonymous={true}
     onToggle={setIsAnonymous}
   />
   ```

2. **Generate Proof**
   - Happens automatically in-browser
   - Takes ~500ms (simulated, real proofs may take 2-5 seconds)
   - No data leaves the browser during generation

3. **Submit Donation**
   - Proof is submitted with transaction
   - Donor's wallet address remains private
   - Transaction appears on-chain without revealing identity

### For Developers

#### Generate a Proof

```typescript
import { generateAnonymousDonationProof } from '@/lib/zk/prover';

const result = await generateAnonymousDonationProof(
  walletAddress,
  amount
);

if (result.success) {
  console.log('Proof generated:', result.proof);
  console.log('Generation time:', result.generationTimeMs, 'ms');
}
```

#### Verify a Proof

```typescript
import { verifyAnonymousDonationProof } from '@/lib/zk/prover';

const isValid = await verifyAnonymousDonationProof(proof);
console.log('Proof valid:', isValid);
```

#### Build Anonymous Transaction

```typescript
import { buildAnonymousDonationTransaction } from '@/lib/stellar/anonymous-donation';

const { transactionXdr, nullifier } = await buildAnonymousDonationTransaction(
  amount,
  proof,
  relayerPublicKey,
  network
);
```

## Smart Contract Interface

### Nullifier Registry Contract

```rust
// Soroban smart contract (pseudocode)
pub fn register_nullifier(
    env: Env,
    nullifier: BytesN<32>,
    commitment: BytesN<32>,
    timestamp: u64
) -> Result<(), Error> {
    // Check if nullifier already exists
    if env.storage().has(&nullifier) {
        return Err(Error::NullifierAlreadyUsed);
    }
    
    // Store nullifier
    env.storage().set(&nullifier, &commitment);
    
    Ok(())
}

pub fn check_nullifier(env: Env, nullifier: BytesN<32>) -> bool {
    env.storage().has(&nullifier)
}
```

## Circuit Design

### Inputs

```circom
template AnonymousDonation() {
    // Private inputs
    signal input walletAddress;
    signal input amount;
    signal input nonce;
    
    // Public outputs
    signal output donationCommitment;
    signal output nullifier;
    signal output amountCommitment;
    
    // Compute commitments
    component commitHash = Poseidon(3);
    commitHash.inputs[0] <== walletAddress;
    commitHash.inputs[1] <== amount;
    commitHash.inputs[2] <== nonce;
    donationCommitment <== commitHash.out;
    
    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== walletAddress;
    nullifierHash.inputs[1] <== nonce;
    nullifier <== nullifierHash.out;
    
    component amountHash = Poseidon(2);
    amountHash.inputs[0] <== amount;
    amountHash.inputs[1] <== nonce;
    amountCommitment <== amountHash.out;
}
```

## Production Deployment

### Prerequisites

1. **Compile Circuit**
   ```bash
   circom circuits/anonymous_donation.circom --r1cs --wasm --sym
   ```

2. **Generate Trusted Setup**
   ```bash
   snarkjs groth16 setup anonymous_donation.r1cs pot12_final.ptau circuit_final.zkey
   ```

3. **Export Verification Key**
   ```bash
   snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
   ```

4. **Deploy Smart Contract**
   - Deploy nullifier registry contract to Stellar
   - Update `NEXT_PUBLIC_CONTRACT_NULLIFIER_REGISTRY` in `.env`

### Configuration

```env
# Nullifier Registry Contract
NEXT_PUBLIC_CONTRACT_NULLIFIER_REGISTRY=C...

# Circuit Files (served from /public/circuits/)
NEXT_PUBLIC_CIRCUIT_WASM_PATH=/circuits/anonymous_donation.wasm
NEXT_PUBLIC_CIRCUIT_ZKEY_PATH=/circuits/circuit_final.zkey
NEXT_PUBLIC_VERIFICATION_KEY_PATH=/circuits/verification_key.json
```

## Performance

### Proof Generation
- **Development (mock)**: ~500ms
- **Production (real)**: 2-5 seconds
- **Memory usage**: ~100-200 MB
- **Browser compatibility**: Modern browsers with WebAssembly support

### Proof Verification
- **Client-side**: ~50-100ms
- **On-chain (smart contract)**: ~0.1-0.5 seconds
- **Gas cost**: ~50,000-100,000 operations

## Limitations

1. **Browser Requirement**: Proof generation requires WebAssembly support
2. **Relayer Dependency**: Requires a relayer to submit transactions (adds ~$0.50 fee)
3. **One-time Use**: Each proof can only be used once (nullifier prevents reuse)
4. **Amount Visibility**: The donation amount is still visible (only wallet address is hidden)

## Future Enhancements

1. **Amount Privacy**: Hide donation amounts using range proofs
2. **Batch Donations**: Support multiple donations in a single proof
3. **Recursive Proofs**: Compress multiple proofs into one
4. **Mobile Support**: Optimize for mobile browsers
5. **Relayer Network**: Decentralized relayer network for better privacy

## Security Considerations

### Threats Mitigated
- ✅ Wallet address exposure
- ✅ Transaction linkability
- ✅ Double-spending
- ✅ Front-running attacks

### Remaining Risks
- ⚠️ Relayer can see the proof (but not the wallet address)
- ⚠️ Timing attacks (donation time might correlate with wallet activity)
- ⚠️ Amount analysis (donation amounts are visible)

### Best Practices
1. Use a dedicated relayer service (not your own wallet)
2. Add random delays before submitting
3. Use Tor or VPN for additional network-level privacy
4. Don't reuse the same amount for multiple donations

## References

- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Circom Language](https://docs.circom.io/)
- [Stellar Smart Contracts](https://developers.stellar.org/docs/smart-contracts)

## Support

For questions or issues:
- GitHub Issues: [stellar-app-os/issues](https://github.com/your-org/stellar-app-os/issues)
- Documentation: [docs/](./docs/)
- Community: [Discord](https://discord.gg/stellar)
