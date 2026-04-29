# Privacy-Preserving Donation Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRIVACY-PRESERVING DONATION SYSTEM               │
│                                                                          │
│  ┌────────────────┐         ┌──────────────┐        ┌────────────────┐ │
│  │   User Browser │────────▶│  Next.js App │───────▶│ Stellar Network│ │
│  │   (WebAssembly)│         │   (React)    │        │   (Blockchain) │ │
│  └────────────────┘         └──────────────┘        └────────────────┘ │
│         │                           │                        │          │
│         │ ZK Proof                  │ Transaction            │ On-Chain │
│         │ Generation                │ Submission             │ Storage  │
│         ▼                           ▼                        ▼          │
│  ┌────────────────┐         ┌──────────────┐        ┌────────────────┐ │
│  │  Cryptographic │         │  API Routes  │        │ Smart Contract │ │
│  │   Operations   │         │  (Verify)    │        │  (Nullifier)   │ │
│  └────────────────┘         └──────────────┘        └────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## Detailed Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Browser)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        UI COMPONENTS                              │  │
│  │                                                                   │  │
│  │  ┌─────────────────────┐  ┌──────────────────┐  ┌─────────────┐ │  │
│  │  │ DonorInfoStep       │  │ PaymentStep      │  │ Confirmation│ │  │
│  │  │                     │  │                  │  │             │ │  │
│  │  │ ┌─────────────────┐ │  │ ┌──────────────┐│  │             │ │  │
│  │  │ │ Anonymous       │ │  │ │ Anonymous    ││  │             │ │  │
│  │  │ │ DonationToggle  │ │  │ │ Payment      ││  │             │ │  │
│  │  │ └─────────────────┘ │  │ │ Section      ││  │             │ │  │
│  │  │                     │  │ └──────────────┘│  │             │ │  │
│  │  │                     │  │ ┌──────────────┐│  │             │ │  │
│  │  │                     │  │ │ ZKProof      ││  │             │ │  │
│  │  │                     │  │ │ Generator    ││  │             │ │  │
│  │  │                     │  │ └──────────────┘│  │             │ │  │
│  │  └─────────────────────┘  └──────────────────┘  └─────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        REACT HOOKS                                │  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  useAnonymousDonation()                                     │  │  │
│  │  │                                                             │  │  │
│  │  │  • generateProof()                                          │  │  │
│  │  │  • submitAnonymousDonation()                                │  │  │
│  │  │  • checkNullifier()                                         │  │  │
│  │  │  • estimateCost()                                           │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    ZK PROOF SYSTEM (lib/zk/)                      │  │
│  │                                                                   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │  │
│  │  │   prover.ts  │  │  crypto.ts   │  │      types.ts        │   │  │
│  │  │              │  │              │  │                      │   │  │
│  │  │ • generate   │  │ • hash       │  │ • ZKProof           │   │  │
│  │  │   Proof()    │  │ • commit     │  │ • ProofInput        │   │  │
│  │  │ • verify     │  │ • nullifier  │  │ • ProofResult       │   │  │
│  │  │   Proof()    │  │ • nonce      │  │                      │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              CRYPTOGRAPHIC OPERATIONS (WebAssembly)               │  │
│  │                                                                   │  │
│  │  • SHA-256 Hashing                                                │  │
│  │  • Field Element Arithmetic                                       │  │
│  │  • Commitment Generation                                          │  │
│  │  • Nullifier Computation                                          │  │
│  │  • Groth16 Proof Construction (Mock)                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP Request
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Next.js API)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              API ROUTES (app/api/transaction/)                    │  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  POST /api/transaction/submit-anonymous                     │  │  │
│  │  │                                                             │  │  │
│  │  │  1. Verify ZK Proof                                         │  │  │
│  │  │  2. Check Nullifier (not used before)                       │  │  │
│  │  │  3. Validate Transaction                                    │  │  │
│  │  │  4. Submit to Stellar                                       │  │  │
│  │  │  5. Return Transaction Hash                                 │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  GET /api/transaction/submit-anonymous?nullifier=...        │  │  │
│  │  │                                                             │  │  │
│  │  │  • Check if nullifier exists                                │  │  │
│  │  │  • Return boolean result                                    │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │         STELLAR INTEGRATION (lib/stellar/)                        │  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  anonymous-donation.ts                                      │  │  │
│  │  │                                                             │  │  │
│  │  │  • buildAnonymousDonationTransaction()                      │  │  │
│  │  │  • buildNullifierRegistrationTransaction()                  │  │  │
│  │  │  • isNullifierUsed()                                        │  │  │
│  │  │  • estimateAnonymousDonationCost()                          │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Transaction Submission
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        STELLAR BLOCKCHAIN                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      TRANSACTION FLOW                             │  │
│  │                                                                   │  │
│  │  ┌────────────────┐         ┌────────────────┐                   │  │
│  │  │  Payment 1     │         │  Payment 2     │                   │  │
│  │  │  (70%)         │         │  (30%)         │                   │  │
│  │  │                │         │                │                   │  │
│  │  │  Planting      │         │  Replanting    │                   │  │
│  │  │  Address       │         │  Buffer        │                   │  │
│  │  └────────────────┘         └────────────────┘                   │  │
│  │                                                                   │  │
│  │  Memo: anon:{"n":"abc123...","c":"def456...","t":1234567890}     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              SMART CONTRACT (Soroban)                             │  │
│  │                                                                   │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  Nullifier Registry Contract                                │  │  │
│  │  │                                                             │  │  │
│  │  │  Storage:                                                   │  │  │
│  │  │  ┌──────────────────────────────────────────────────────┐  │  │  │
│  │  │  │ Nullifier Hash → Commitment                          │  │  │  │
│  │  │  │ abc123...      → def456...                           │  │  │  │
│  │  │  │ ghi789...      → jkl012...                           │  │  │  │
│  │  │  └──────────────────────────────────────────────────────┘  │  │  │
│  │  │                                                             │  │  │
│  │  │  Functions:                                                 │  │  │
│  │  │  • register_nullifier(nullifier, commitment, timestamp)    │  │  │
│  │  │  • check_nullifier(nullifier) → bool                       │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌──────────────┐
│   1. USER    │
│   INITIATES  │
│   DONATION   │
└──────┬───────┘
       │
       │ Enables Anonymous Mode
       ▼
┌──────────────────────────────────────┐
│   2. GENERATE ZK PROOF (Browser)     │
│                                      │
│   Private Inputs:                    │
│   • Wallet Address: GXXX...          │
│   • Amount: $25.00                   │
│   • Nonce: random_32_bytes           │
│                                      │
│   Cryptographic Operations:          │
│   • commitment = Hash(wallet||amt||n)│
│   • nullifier = Hash(wallet||nonce)  │
│   • amtCommit = Hash(amount||nonce)  │
│                                      │
│   Output: ZK Proof                   │
│   • pi_a, pi_b, pi_c (proof points)  │
│   • publicSignals (commitments)      │
└──────┬───────────────────────────────┘
       │
       │ Proof Generated (500ms)
       ▼
┌──────────────────────────────────────┐
│   3. BUILD TRANSACTION               │
│                                      │
│   Transaction Structure:             │
│   • Source: Relayer Account          │
│   • Operations:                      │
│     - Payment(70% → Planting)        │
│     - Payment(30% → Buffer)          │
│   • Memo: Proof metadata             │
│   • Fee: 1000 stroops                │
└──────┬───────────────────────────────┘
       │
       │ Transaction XDR
       ▼
┌──────────────────────────────────────┐
│   4. SUBMIT TO API                   │
│                                      │
│   POST /api/transaction/submit-anon  │
│   Body: {                            │
│     transactionXdr: "...",           │
│     proof: {...},                    │
│     nullifier: "abc123...",          │
│     network: "testnet"               │
│   }                                  │
└──────┬───────────────────────────────┘
       │
       │ API Validates
       ▼
┌──────────────────────────────────────┐
│   5. VERIFY PROOF                    │
│                                      │
│   Checks:                            │
│   ✓ Proof structure valid            │
│   ✓ Public signals match             │
│   ✓ Nullifier not used before        │
│   ✓ Commitments consistent           │
└──────┬───────────────────────────────┘
       │
       │ Proof Valid ✓
       ▼
┌──────────────────────────────────────┐
│   6. SUBMIT TO STELLAR               │
│                                      │
│   Horizon API:                       │
│   POST /transactions                 │
│   Body: tx=<signed_xdr>              │
└──────┬───────────────────────────────┘
       │
       │ Transaction Hash
       ▼
┌──────────────────────────────────────┐
│   7. ON-CHAIN STORAGE                │
│                                      │
│   Ledger Entry:                      │
│   • Transaction Hash: 0xabc...       │
│   • Operations: 2 payments           │
│   • Memo: Proof metadata             │
│   • Source: Relayer (NOT donor!)     │
│                                      │
│   Smart Contract:                    │
│   • Nullifier registered             │
│   • Prevents double-spend            │
└──────┬───────────────────────────────┘
       │
       │ Success!
       ▼
┌──────────────────────────────────────┐
│   8. USER CONFIRMATION               │
│                                      │
│   ✓ Donation submitted privately     │
│   ✓ Wallet address hidden            │
│   ✓ Transaction hash: 0xabc...       │
│   ✓ Impact: 25 trees planted         │
└──────────────────────────────────────┘
```

## Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                        SECURITY LAYERS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: CRYPTOGRAPHIC PRIVACY                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Wallet address never revealed                            │ │
│  │ • Commitments use SHA-256 (256-bit security)               │ │
│  │ • Nullifiers prevent linkability                           │ │
│  │ • Random nonces ensure uniqueness                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Layer 2: ZERO-KNOWLEDGE PROOFS                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Groth16 protocol (proven secure)                         │ │
│  │ • BN254 elliptic curve                                     │ │
│  │ • Proof size: ~256 bytes                                   │ │
│  │ • Verification: O(1) constant time                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Layer 3: DOUBLE-SPEND PREVENTION                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Nullifier registry (on-chain)                            │ │
│  │ • Each nullifier used only once                            │ │
│  │ • Smart contract enforcement                               │ │
│  │ • Prevents replay attacks                                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Layer 4: TRANSACTION INTEGRITY                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • Amount commitments verified                              │ │
│  │ • Stellar transaction signatures                           │ │
│  │ • Atomic operations (all or nothing)                       │ │
│  │ • Immutable blockchain storage                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Layer 5: CLIENT-SIDE SECURITY                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ • In-browser proof generation                              │ │
│  │ • No private data sent to server                           │ │
│  │ • WebAssembly sandboxing                                   │ │
│  │ • HTTPS encryption in transit                              │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────��─────────────────────────────────────────────────────────┘
```

## Component Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                      DEPENDENCY GRAPH                            │
└─────────────────────────────────────────────────────────────────┘

UI Components
    │
    ├─── AnonymousDonationToggle
    │    └─── (standalone)
    │
    ├─── ZKProofGenerator
    │    └─── useAnonymousDonation hook
    │
    └─── AnonymousPaymentSection
         ├─── useAnonymousDonation hook
         ├─── ZKProofGenerator
         └─── WalletContext

Hooks
    │
    └─── useAnonymousDonation
         ├─── lib/zk/prover
         ├─── lib/stellar/anonymous-donation
         └─── API: /submit-anonymous

Core Libraries
    │
    ├─── lib/zk/prover
    │    ├─── lib/zk/crypto
    │    ├─── lib/zk/types
    │    └─── snarkjs (external)
    │
    ├─── lib/zk/crypto
    │    ├─── @noble/hashes (external)
    │    └─── @noble/curves (external)
    │
    └─── lib/stellar/anonymous-donation
         ├─── @stellar/stellar-sdk (external)
         └─── lib/config/network

API Routes
    │
    └─── /api/transaction/submit-anonymous
         ├─── lib/zk/prover (verify)
         ├─── lib/stellar/anonymous-donation
         └─── lib/stellar/transaction

External Dependencies
    │
    ├─── snarkjs@0.7.5
    ├─── circomlibjs@0.1.7
    ├─── @noble/curves@1.7.0
    ├─── @noble/hashes@1.6.1
    └─── @stellar/stellar-sdk@11.2.2
```

## Performance Characteristics

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE METRICS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Operation                    Time        Memory      Network   │
│  ────────────────────────────────────────────────────────────   │
│  Proof Generation (mock)      ~500ms      ~10 MB      0 KB     │
│  Proof Generation (real)      2-5 sec     ~150 MB     0 KB     │
│  Proof Verification           ~50ms       ~5 MB       0 KB     │
│  Transaction Building         ~100ms      ~2 MB       0 KB     │
│  API Submission               ~200ms      ~1 MB       ~5 KB    │
│  Stellar Confirmation         2-5 sec     N/A         ~10 KB   │
│  ────────────────────────────────────────────────────────────   │
│  Total (mock)                 ~3-4 sec    ~20 MB      ~15 KB   │
│  Total (real)                 ~7-12 sec   ~160 MB     ~15 KB   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

**Legend:**
- `→` : Data flow
- `▼` : Process step
- `✓` : Validation check
- `┌─┐` : Component boundary
- `│ │` : Container
