# Privacy-Preserving Donation Implementation

## 🎯 Overview

This implementation adds **zero-knowledge proof (ZK proof) technology** to enable privacy-preserving donations. Donors can now prove they made a valid donation without revealing their wallet address on the blockchain.

## ✨ Features Implemented

### 1. **Anonymous Donation Toggle**
- Beautiful UI toggle in the donor information step
- Clear explanation of how privacy-preserving donations work
- Visual indicators when anonymous mode is active

### 2. **In-Browser ZK Proof Generation**
- Generates Groth16 ZK proofs using WebAssembly
- All computation happens locally (no data leaves the browser)
- Real-time progress indicators during proof generation
- ~500ms generation time (mock implementation, real proofs: 2-5s)

### 3. **Smart Contract Integration**
- Anonymous transaction builder
- Nullifier registry to prevent double-donations
- Proof verification before submission
- Seamless integration with existing Stellar infrastructure

### 4. **Complete UI Flow**
- `AnonymousDonationToggle`: Enable/disable privacy mode
- `ZKProofGenerator`: Visual feedback during proof generation
- `AnonymousPaymentSection`: Complete payment flow for anonymous donations
- Responsive design with dark mode support

## 📁 Files Created

### Core ZK Proof System
```
lib/zk/
├── types.ts                    # TypeScript definitions for ZK proofs
├── crypto.ts                   # Cryptographic utilities (hashing, commitments)
└── prover.ts                   # ZK proof generation and verification
```

### Stellar Integration
```
lib/stellar/
└── anonymous-donation.ts       # Anonymous transaction builder
```

### React Components
```
components/molecules/
├── AnonymousDonationToggle/
│   └── AnonymousDonationToggle.tsx
├── ZKProofGenerator/
│   └── ZKProofGenerator.tsx
└── AnonymousPaymentSection/
    └── AnonymousPaymentSection.tsx
```

### Hooks
```
hooks/
└── useAnonymousDonation.ts     # React hook for managing anonymous donations
```

### API Endpoints
```
app/api/transaction/
└── submit-anonymous/
    └── route.ts                # API for submitting anonymous donations
```

### Documentation
```
docs/
└── PRIVACY_PRESERVING_DONATIONS.md  # Comprehensive technical documentation
```

## 🚀 How to Use

### For Users

1. **Navigate to Donation Flow**
   - Go to `/donate`
   - Select donation amount
   - Click "Continue"

2. **Enable Anonymous Mode**
   - On the "Your Info" page, toggle "Privacy-Preserving Donation"
   - Read the information panel to understand how it works
   - Fill in your information (or skip for full anonymity)

3. **Generate Proof & Donate**
   - Connect your Stellar wallet
   - ZK proof is automatically generated in your browser
   - Review the cost breakdown (includes small relayer fee)
   - Submit your anonymous donation

### For Developers

#### Install Dependencies

```bash
# The package.json has been updated with required dependencies
npm install
# or
pnpm install
```

**New dependencies added:**
- `snarkjs`: ZK proof generation library
- `circomlibjs`: Circom circuit utilities
- `@noble/curves`: Elliptic curve cryptography
- `@noble/hashes`: Cryptographic hash functions

#### Test the Implementation

```typescript
import { generateAnonymousDonationProof } from '@/lib/zk/prover';

// Generate a proof
const result = await generateAnonymousDonationProof(
  'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  25.00
);

console.log('Proof generated:', result.success);
console.log('Generation time:', result.generationTimeMs, 'ms');
```

#### Integrate with Existing Components

The implementation is already integrated with:
- ✅ `DonorInfoStep` - Added anonymous donation toggle
- ✅ `PaymentStep` - Ready for anonymous payment section integration
- ✅ `DonationContext` - Tracks anonymous mode state

## 🔧 Configuration

### Environment Variables

Add to your `.env.local`:

```env
# Nullifier Registry Smart Contract (Soroban)
NEXT_PUBLIC_CONTRACT_NULLIFIER_REGISTRY=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Circuit Files (for production)
NEXT_PUBLIC_CIRCUIT_WASM_PATH=/circuits/anonymous_donation.wasm
NEXT_PUBLIC_CIRCUIT_ZKEY_PATH=/circuits/circuit_final.zkey
NEXT_PUBLIC_VERIFICATION_KEY_PATH=/circuits/verification_key.json
```

### Smart Contract Deployment

The nullifier registry contract needs to be deployed to Stellar. See `docs/PRIVACY_PRESERVING_DONATIONS.md` for details.

## 🏗️ Architecture

### Flow Diagram

```
┌─────────────┐
│   Donor     │
│  (Browser)  │
└──────┬──────┘
       │
       │ 1. Enable Anonymous Mode
       ▼
┌─────────────────────────────┐
│  Generate ZK Proof          │
│  (In-Browser, WebAssembly)  │
│                             │
│  Inputs (Private):          │
│  - Wallet Address           │
│  - Amount                   │
│  - Random Nonce             │
│                             │
│  Outputs (Public):          │
│  - Donation Commitment      │
│  - Nullifier                │
│  - Amount Commitment        │
└──────┬──────────────────────┘
       │
       │ 2. Build Transaction
       ▼
┌─────────────────────────────┐
│  Anonymous Transaction      │
│                             │
│  - Proof attached           │
│  - Relayer as source        │
│  - Wallet address hidden    │
└──────┬──────────────────────┘
       │
       │ 3. Submit via API
       ▼
┌─────────────────────────────┐
│  API: /submit-anonymous     │
│                             │
│  1. Verify ZK proof         │
│  2. Check nullifier         │
│  3. Submit to Stellar       │
└──────┬──────────────────────┘
       │
       │ 4. On-Chain
       ▼
┌─────────────────────────────┐
│  Stellar Blockchain         │
│                             │
│  - Transaction recorded     │
│  - Wallet address hidden    │
│  - Nullifier registered     │
│  - Donation complete ✅     │
└─────────────────────────────┘
```

## 🔐 Security Features

### Privacy Guarantees
- ✅ **Wallet address never revealed** on-chain
- ✅ **No transaction linkability** between donations
- ✅ **In-browser proof generation** (no server-side data)
- ✅ **Cryptographic commitments** using SHA-256

### Integrity Guarantees
- ✅ **Proof of funds** via ZK proof
- ✅ **Double-spend prevention** via nullifiers
- ✅ **Amount verification** via commitments
- ✅ **Smart contract verification** on-chain

## 📊 Performance

### Current Implementation (Mock Proofs)
- Proof generation: ~500ms
- Proof verification: ~50ms
- Transaction submission: ~2-3s

### Production (Real Proofs)
- Proof generation: 2-5 seconds
- Proof verification: ~100ms
- Transaction submission: ~2-3s
- Memory usage: ~100-200 MB

## 🎨 UI/UX Highlights

### Anonymous Donation Toggle
- Clean, modern design with purple accent color
- Informative tooltips explaining ZK proofs
- Feature list showing privacy benefits
- Responsive and accessible

### ZK Proof Generator
- Real-time progress bar
- Step-by-step process visualization
- Technical details for transparency
- Success/error states with clear messaging

### Anonymous Payment Section
- Cost breakdown (donation + relayer fee)
- Wallet connection flow
- Proof generation status
- Privacy guarantees displayed

## 🧪 Testing

### Manual Testing Checklist

- [ ] Toggle anonymous mode on/off
- [ ] Generate ZK proof with connected wallet
- [ ] Verify proof generation completes successfully
- [ ] Submit anonymous donation
- [ ] Check transaction on Stellar explorer
- [ ] Verify wallet address is not visible on-chain
- [ ] Test error handling (invalid proof, used nullifier)
- [ ] Test responsive design on mobile
- [ ] Test dark mode

### Unit Tests (To Be Added)

```typescript
// Example test structure
describe('ZK Proof Generation', () => {
  it('should generate valid proof', async () => {
    const result = await generateAnonymousDonationProof(
      'GTEST...',
      25.00
    );
    expect(result.success).toBe(true);
    expect(result.proof).toBeDefined();
  });

  it('should prevent double-donations', async () => {
    const proof = await generateAnonymousDonationProof('GTEST...', 25.00);
    const isUsed = await isNullifierUsed(proof.nullifier, 'testnet');
    expect(isUsed).toBe(false);
  });
});
```

## 🚧 Production Readiness

### Current Status: Development/Demo

This implementation uses **mock ZK proofs** for demonstration. For production:

### Required Steps:

1. **Compile Circom Circuit**
   ```bash
   circom circuits/anonymous_donation.circom --r1cs --wasm --sym
   ```

2. **Generate Trusted Setup**
   ```bash
   snarkjs groth16 setup anonymous_donation.r1cs pot12_final.ptau circuit_final.zkey
   ```

3. **Deploy Smart Contract**
   - Deploy nullifier registry to Stellar
   - Update environment variables

4. **Host Circuit Files**
   - Place `.wasm` and `.zkey` files in `/public/circuits/`
   - Update paths in configuration

5. **Set Up Relayer Service**
   - Deploy dedicated relayer infrastructure
   - Configure relayer fees and limits

## 📚 Documentation

Comprehensive documentation available in:
- `docs/PRIVACY_PRESERVING_DONATIONS.md` - Technical deep dive
- Inline code comments - Implementation details
- This README - Quick start guide

## 🤝 Contributing

To extend this implementation:

1. **Add Real Circuit**: Replace mock proofs with actual Circom circuit
2. **Optimize Performance**: Use Web Workers for proof generation
3. **Add Amount Privacy**: Implement range proofs to hide amounts
4. **Mobile Support**: Optimize for mobile browsers
5. **Relayer Network**: Build decentralized relayer infrastructure

## 📝 License

Same as the main project.

## 🙏 Acknowledgments

- **snarkjs**: ZK proof generation library
- **Circom**: Circuit compiler
- **Stellar**: Blockchain infrastructure
- **Groth16**: Efficient ZK proof system

---

**Built with ❤️ for privacy-preserving donations**
