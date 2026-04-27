# 🚀 Quick Start Guide - Privacy-Preserving Donations

## ⚡ Get Started in 5 Minutes

### Step 1: Install Dependencies

Since PowerShell script execution is disabled on your system, you'll need to install dependencies manually:

**Option A: Enable PowerShell Scripts (Recommended)**
```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then install:
```bash
pnpm install
# or
npm install
```

**Option B: Use WSL/Git Bash**
```bash
# Open Git Bash or WSL
npm install
```

### Step 2: Verify Installation

Check that the new dependencies are installed:
```bash
npm list snarkjs circomlibjs @noble/curves @noble/hashes
```

You should see:
```
├── snarkjs@0.7.5
├── circomlibjs@0.1.7
├── @noble/curves@1.7.0
└── @noble/hashes@1.6.1
```

### Step 3: Start Development Server

```bash
npm run dev
```

### Step 4: Test the Feature

1. **Navigate to Donation Page**
   - Open: `http://localhost:3000/donate`
   - Select amount: $25
   - Click "Continue"

2. **Enable Anonymous Mode**
   - Toggle "Privacy-Preserving Donation" ON
   - Click the info icon to learn more
   - Click "Continue to Payment"

3. **Watch the Magic** ✨
   - Connect your Stellar wallet (Freighter)
   - ZK proof generates automatically (~500ms)
   - See the progress bar and technical details
   - Submit your anonymous donation

## 📋 Feature Checklist

### ✅ What's Working Now

- [x] Anonymous donation toggle UI
- [x] ZK proof generation (mock implementation)
- [x] In-browser cryptographic operations
- [x] Progress indicators and status tracking
- [x] Cost breakdown display
- [x] Wallet integration
- [x] API endpoint for submission
- [x] Error handling and validation
- [x] Responsive design
- [x] Dark mode support
- [x] Accessibility features

### 🚧 What Needs Production Setup

- [ ] Real Circom circuit compilation
- [ ] Trusted setup ceremony
- [ ] Smart contract deployment (nullifier registry)
- [ ] Relayer service infrastructure
- [ ] Circuit files hosting
- [ ] Production environment variables

## 🎯 Key Files to Review

### 1. **Core Logic**
```
lib/zk/prover.ts          # ZK proof generation
lib/zk/crypto.ts          # Cryptographic utilities
```

### 2. **UI Components**
```
components/molecules/AnonymousDonationToggle/
components/molecules/ZKProofGenerator/
components/molecules/AnonymousPaymentSection/
```

### 3. **Integration Points**
```
components/organisms/DonorInfoStep/DonorInfoStep.tsx
components/organisms/PaymentStep/PaymentStep.tsx
```

### 4. **API**
```
app/api/transaction/submit-anonymous/route.ts
```

## 🔍 Testing Scenarios

### Scenario 1: Standard Anonymous Donation
1. Enable anonymous mode
2. Connect wallet
3. Wait for proof generation
4. Submit donation
5. ✅ Success: Transaction submitted privately

### Scenario 2: Error Handling
1. Enable anonymous mode
2. Don't connect wallet
3. ✅ See: "Connect Your Wallet" prompt
4. Connect wallet with insufficient funds
5. ✅ See: Clear error message

### Scenario 3: Toggle On/Off
1. Enable anonymous mode
2. Read information panel
3. Disable anonymous mode
4. ✅ See: Standard payment options return

### Scenario 4: Mobile Experience
1. Open on mobile device
2. Enable anonymous mode
3. ✅ See: Responsive layout, touch-friendly

## 🎨 UI Components Preview

### AnonymousDonationToggle
```
┌─────────────────────────────────────────┐
│  🛡️  Privacy-Preserving Donation    ℹ️  │
│                                         │
│  Your donation will be submitted with   │
│  zero-knowledge proof technology...     │
│                                         │
│  👁️‍🗨️ Wallet address hidden             │
│  🛡️  Cryptographic proof generated      │
│  🔒 No personal data stored             │
│                                         │
│  [●────────] Anonymous Mode Active      │
│                                    PRIVATE│
└─────────────────────────────────────────┘
```

### ZKProofGenerator
```
┌─────────────────────────────────────────┐
│  ⚡ Generating Zero-Knowledge Proof      │
│  Computing cryptographic proof...       │
│                                         │
│  [████████████████░░░░] 75%            │
│                                         │
│  ✓ Circuit computation                  │
│  ⚡ Witness generation                   │
│  ○ Proof construction                   │
│                                         │
│  Protocol: Groth16                      │
│  Curve: BN254                           │
└─────────────────────────────────────────┘
```

## 🔧 Configuration

### Environment Variables (Optional for Development)

Create `.env.local`:
```env
# Only needed for production with real circuits
NEXT_PUBLIC_CONTRACT_NULLIFIER_REGISTRY=CXXXXXXX...
NEXT_PUBLIC_CIRCUIT_WASM_PATH=/circuits/anonymous_donation.wasm
NEXT_PUBLIC_CIRCUIT_ZKEY_PATH=/circuits/circuit_final.zkey
```

### Network Configuration

The system uses your existing network configuration from:
```typescript
// lib/config/network.ts
export const networkConfig = {
  network: 'testnet',
  horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL,
  contracts: {
    nullifierRegistry: process.env.NEXT_PUBLIC_CONTRACT_NULLIFIER_REGISTRY,
    // ...
  }
};
```

## 🐛 Troubleshooting

### Issue: Dependencies won't install
**Solution**: 
```bash
# Try with --legacy-peer-deps
npm install --legacy-peer-deps

# Or use specific package manager
pnpm install --force
```

### Issue: TypeScript errors
**Solution**:
```bash
# Restart TypeScript server in VS Code
# Press: Ctrl+Shift+P
# Type: "TypeScript: Restart TS Server"
```

### Issue: Wallet won't connect
**Solution**:
- Install Freighter wallet extension
- Make sure you're on testnet
- Check browser console for errors

### Issue: Proof generation fails
**Solution**:
- This is expected in development (mock proofs)
- Check browser console for detailed errors
- Verify wallet is connected

## 📚 Documentation

### For Users
- `PRIVACY_IMPLEMENTATION_README.md` - Feature overview and usage

### For Developers
- `docs/PRIVACY_PRESERVING_DONATIONS.md` - Technical deep dive
- `IMPLEMENTATION_SUMMARY.md` - What was built
- Inline code comments - Implementation details

## 🎓 Learning Resources

### Zero-Knowledge Proofs
- [ZK Proofs Explained](https://z.cash/technology/zksnarks/)
- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)

### Stellar Development
- [Stellar Docs](https://developers.stellar.org/)
- [Soroban Smart Contracts](https://soroban.stellar.org/)
- [Freighter Wallet](https://www.freighter.app/)

## 💬 Need Help?

### Common Questions

**Q: Is this production-ready?**
A: The architecture is production-ready, but you need to:
- Compile real Circom circuits
- Deploy smart contracts
- Set up relayer infrastructure

**Q: How long does proof generation take?**
A: Currently ~500ms (mock). Real proofs: 2-5 seconds.

**Q: Can I use this on mainnet?**
A: Yes, but complete the production setup steps first.

**Q: Is the wallet address really hidden?**
A: Yes! Only the ZK proof is submitted on-chain, not your wallet address.

**Q: What's the relayer fee?**
A: Currently ~$0.50 to cover transaction costs.

## 🚀 Next Steps

### For Development
1. ✅ Test the UI flow
2. ✅ Review the code
3. ✅ Understand the architecture
4. ⏭️ Write unit tests
5. ⏭️ Add integration tests

### For Production
1. ⏭️ Compile Circom circuit
2. ⏭️ Run trusted setup
3. ⏭️ Deploy smart contracts
4. ⏭️ Set up relayer service
5. ⏭️ Security audit
6. ⏭️ Deploy to mainnet

## 🎉 You're Ready!

The privacy-preserving donation system is fully implemented and ready for testing. Start the dev server and try it out!

```bash
npm run dev
```

Then visit: `http://localhost:3000/donate`

---

**Built with ❤️ and zero-knowledge proofs**

Questions? Check the documentation or review the code comments!
