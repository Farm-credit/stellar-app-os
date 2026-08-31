# 🏛️ Architecture Documentation — FarmCredit / Harvesta

> **High-Level System Architecture, Component Specifications, and Data Flows**  
> **Stellar Network (Soroban) • Next.js 15 PWA • PostgreSQL • IPFS**

---

## 1. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Clients["📱 Client Layer (Frontend / PWA)"]
        direction TB
        SP["🌱 Sponsor Web App<br/>(Donations, Carbon Dashboard)"]
        PL["📸 Planter Mobile PWA<br/>(Camera, GPS, Offline Mode)"]
        INV["🛰️ Investor & Verifier Portal<br/>(Telemetry, Satellite Map)"]
        GOV["🗳️ DAO Governance Portal<br/>(Proposal Voting)"]
        WAL["🔑 Stellar Wallets<br/>(Freighter / Albedo / xBull)"]
        
        SP --- WAL
        PL --- WAL
        INV --- WAL
        GOV --- WAL
    end

    subgraph Storage["📦 Decentralized Storage (IPFS)"]
        IPFS["🌐 IPFS Network (Pinata / IPFS Gateway)<br/>• Planting Photos & Time-lapses<br/>• GPS Telemetry & Metadata JSON<br/>• Carbon Credit Certificates"]
    end

    subgraph Backend["⚙️ Backend & Off-Chain Infrastructure"]
        API["🚀 API Server (Node.js / Express / Next.js API)<br/>• JWT & Wallet Auth<br/>• Upload Coordinator<br/>• Metadata Sanitization"]
        INDEXER["📡 Stellar Event Indexer & Ingestion<br/>• Soroban RPC Listener<br/>• Horizon Event Streamer<br/>• Event Integrity Checker"]
        CALC["📊 Carbon Sequestration Engine<br/>• FAO/IPCC Biomass Growth Models<br/>• Scheduled Carbon Calculation Cron"]
        ORACLE["🛰️ Verification & Satellite Engine<br/>• Sentinel-2 Imagery Sync<br/>• GPS Boundary & EXIF Validator<br/>• ZK-Proof Verification Service"]
        DB[(🗄️ PostgreSQL Database<br/>• Off-chain Cache & Tree Index<br/>• User Profiles & Roles<br/>• Proposals & Telemetry Cache)]
        
        API <--> DB
        INDEXER --> DB
        CALC <--> DB
        ORACLE <--> DB
    end

    subgraph Blockchain["⚡ Stellar Network (Soroban Smart Contracts)"]
        direction TB
        RPC["🔗 Soroban RPC Node / Horizon"]
        
        subgraph Contracts["Smart Contracts (Rust / WASM)"]
            TR["🌳 Tree Registry Contract<br/>(Tree NFT IDs, Species, Geohash)"]
            ESC["🔒 Escrow Contract<br/>(Multi-Tranche XLM/USDC Locking & Payout)"]
            PR["🧑‍🌾 Planter Registry Contract<br/>(Staking, Reputation, Blacklist)"]
            CC["📉 Carbon Credits Contract<br/>(CO₂ Minting, Retirement Records)"]
            NR["🛡️ Nullifier & ZK Registry<br/>(Double-Claim & Proof Verification)"]
            GC["🏛️ Governance Contract<br/>(DAO Voting & Parameter Adjustments)"]
            TREAS["🏦 Treasury Contract<br/>(4-of-7 Multisig & Emergency Guard)"]
        end
        
        RPC <--> Contracts
    end

    %% Interactions
    PL -->|"1. Upload Proof (Photo + GPS)"| IPFS
    PL -->|"2. Submit Job Completion (IPFS CID)"| API
    SP -->|"3. Sponsor Tree (XLM/USDC)"| WAL
    WAL -->|"4. Sign & Submit Tx"| RPC
    
    API -->|"5. Pin Metadata / Verify CIDs"| IPFS
    API -->|"6. Trigger Verification Checks"| ORACLE
    
    INDEXER <-->|"7. Poll / Listen to Ledger Events"| RPC
    ORACLE -->|"8. Execute Verified Tranche Release"| RPC
    CALC -->|"9. Sync On-Chain Carbon Accruals"| RPC
    
    Clients <-->|"10. Query Cached Data & Analytics"| API
```

---

## 2. End-to-End Data Flows

### Flow A: Tree Sponsorship & Escrow Lock
```mermaid
sequenceDiagram
    autonumber
    actor Sponsor
    participant FE as Frontend (Next.js PWA)
    participant Wallet as Freighter / Albedo
    participant Escrow as Escrow Contract (Soroban)
    participant TreeReg as Tree Registry Contract
    participant Indexer as Backend Event Indexer
    participant DB as PostgreSQL

    Sponsor->>FE: Select species, quantity & region
    FE->>Wallet: Request deposit transaction signing (XLM / USDC)
    Wallet->>Escrow: Deposit funds into Escrow (lockTranche)
    Escrow->>TreeReg: Mint Tree IDs with parameters & sponsor info
    Escrow-->>Wallet: Transaction confirmed on Stellar ledger
    Indexer->>Escrow: Ingest `FundsEscrowed` & `TreeMinted` events
    Indexer->>DB: Store tree metadata, sponsor link, and escrow status
    FE->>DB: Fetch updated sponsor dashboard with pending planting
```

---

### Flow B: Planter Work Submission, IPFS Pinning & Payout
```mermaid
sequenceDiagram
    autonumber
    actor Planter
    participant PWA as Planter PWA (Offline/Mobile)
    participant IPFS as IPFS (Pinata)
    participant Backend as Backend Verification Service
    participant Escrow as Escrow Contract (Soroban)
    participant PlanterReg as Planter Registry
    participant DB as PostgreSQL

    Planter->>PWA: Capture photo & GPS coordinates
    PWA->>IPFS: Upload image file and signed telemetry JSON
    IPFS-->>PWA: Return IPFS CID (`ipfs://Qm...`)
    PWA->>Backend: Submit planting proof with CID & Tree ID
    Backend->>Backend: Validate EXIF metadata, timestamp & GPS boundary
    Backend->>Escrow: Trigger milestone verification / submit proof
    Escrow->>PlanterReg: Check planter standing & reputation score
    Escrow->>Planter: Release milestone payment tranche (XLM/USDC)
    Backend->>DB: Update tree status to `PLANTED / VERIFIED`
```

---

### Flow C: ZK Location Proof & Double-Claim Nullifier
```mermaid
sequenceDiagram
    autonumber
    actor Planter
    participant ZkService as ZK Proof Generator (Circom/SnarkJS)
    participant NullifierContract as Nullifier Registry (Soroban)
    participant ZkLocationContract as ZK Location Verifier (Circuit 2)

    Planter->>ZkService: Input GPS coordinates (private) + Nonce
    ZkService->>ZkService: Generate Groth16 ZK proof + commitment hash
    Planter->>NullifierContract: Register commitment (asserts not already registered)
    NullifierContract-->>Planter: Commitment stored (prevents double claims)
    Planter->>ZkLocationContract: Submit ZK location proof
    ZkLocationContract->>ZkLocationContract: Verify proof against Northern Nigeria boundary
    ZkLocationContract-->>Planter: Location approved without revealing exact coordinates
```

---

## 3. Component Deep Dive

| Component Layer | Technologies Used | Key Responsibilities |
| :--- | :--- | :--- |
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Workbox PWA | • **Atomic UI Architecture** (Atoms, Molecules, Organisms, Templates)<br/>• **Offline Support** via Service Workers for field planters<br/>• **Stellar Wallet Bridge** (Freighter, Albedo, xBull)<br/>• **Interactive Dashboards** (Sponsor impact, Investor Telemetry, Satellite Map) |
| **Smart Contracts** | Rust, Soroban SDK, WebAssembly (WASM), Stellar CLI | • **`tree_registry`**: Tamper-proof on-chain tree NFT identity, geohashes, and lifecycle state<br/>• **`escrow`**: Non-custodial escrow holding sponsor funds and distributing multi-tranche milestone payouts<br/>• **`planter_registry`**: Planter onboarding, application staking, reputation scoring, and blacklisting<br/>• **`carbon_credits`**: On-chain minting and retirement records of verified CO₂ offsets<br/>• **`nullifier_registry` / `zk_verifier`**: Zero-knowledge proof validation to prevent replay and spoofing<br/>• **`treasury`**: 4-of-7 multisig governance vault with emergency thresholds |
| **Backend & Off-Chain** | Node.js, Express, Next.js API Routes, PostgreSQL, Stellar Horizon/RPC SDK | • **Event Indexer**: Listens to Soroban events and maintains relational state in PostgreSQL<br/>• **Carbon Engine**: Computes sequestration rates via FAO/IPCC Tier 1 biomass growth models<br/>• **Verification & Oracles**: Integrates Sentinel-2 satellite imagery, GPS boundary checks, and image integrity verification<br/>• **Storage Generator**: Pre-signed URLs for sensitive certificates and assets |
| **Decentralized Storage (IPFS)** | IPFS, Pinata SDK, Helia | • Immutable decentralized storage for planter raw photos, time-lapses, and GPS logs<br/>• Content-addressed metadata JSON referencing species, planting date, and planter signature<br/>• Cryptographic proof anchoring on the Soroban smart contracts |

---

## 4. Architectural Guarantees

1. **Funds Protection via Non-Custodial Escrows:** Funds never touch centralized intermediary servers; payouts are released solely when verified proof triggers the Soroban contract.
2. **Tamper-Proof Data Anchoring:** All raw photographic evidence and telemetry are immutably stored on **IPFS**, with hashes stored on-chain.
3. **Resilient Off-Chain Indexing:** The backend indexer guarantees event replayability and database consistency directly from Stellar ledger history.
4. **Offline Resilience (PWA):** Farmers and planters in low-connectivity rural zones can capture photos and queue submissions locally until internet connectivity is restored.
