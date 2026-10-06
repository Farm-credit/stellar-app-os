# 🏛️ Harvesta / FarmCredit — System Architecture & C4 Model Guide

> **High-Level System Architecture, Component Specifications, and Data Flows**  
> **Stellar Network (Soroban) • Next.js 15 PWA • Zero-Knowledge Cryptography • AWS Multi-Region & IPFS**  
> **See also:** Full C4 Architecture Model specification in [docs/C4_ARCHITECTURE.md](file:///docs/C4_ARCHITECTURE.md).

---

## 1. High-Level System Context (C4 Level 1)

```mermaid
C4Context
    title System Context Diagram - Harvesta Platform Ecosystem

    Person(sponsor, "Sponsor / Donor", "Sponsors trees, subscribes to monthly carbon offsets, and makes anonymous ZK donations.")
    Person(planter, "Planter / Farmer", "Plants trees, stakes security bonds, and submits photo + GPS telemetry proofs via offline-first PWA.")
    Person(verifier, "Verifier / Satellite Oracle", "Verifies planting density, 6-month and 1-year survival milestones, and NDVI canopy indices.")
    Person(corporate, "Corporate Buyer", "Purchases verified carbon credits (VCU), executes on-chain retirements, and exports ESG reports.")
    Person(daoMember, "DAO Member", "Votes on species catalog whitelists, treasury disbursements, and contract upgrade timelocks.")

    Enterprise_Boundary(harvestaBoundary, "Harvesta System Boundary") {
        System(harvestaCore, "Harvesta Platform", "Decentralized agroforestry, milestone escrow management, carbon trading, and ZK verification platform.")
    }

    System_Ext(stellar, "Stellar / Soroban", "Decentralized blockchain ledger executing Soroban WASM smart contracts, managing escrows, and minting tokens.")
    System_Ext(ipfs, "IPFS & Pinata", "Content-addressed storage for planting photos, time-lapse imagery, and verifiable certificates.")
    System_Ext(fiat, "Payment & Anchor Rails", "Stripe payment processing and SEP-24 / NGN anchor rails for direct planter payouts.")
    System_Ext(satellite, "Copernicus / Sentinel-2", "Multi-spectral satellite imagery for vegetation index (NDVI) and canopy validation.")
    System_Ext(awsCloud, "AWS Infrastructure", "CloudFront CDN, AWS WAF, RDS PostgreSQL Multi-AZ, ElastiCache Redis, and S3 backup replication.")

    Rel(sponsor, harvestaCore, "Sponsors trees, mints NFT certificates, executes ZK donations", "HTTPS")
    Rel(planter, harvestaCore, "Stakes bond, submits geotagged photo proofs", "HTTPS / PWA Offline")
    Rel(verifier, harvestaCore, "Audits survival milestones, validates disputes", "HTTPS / REST")
    Rel(corporate, harvestaCore, "Swaps carbon tokens on DEX, burns credits for offsets", "HTTPS / Web3")
    Rel(daoMember, harvestaCore, "Submits proposals, casts governance votes", "HTTPS / Web3")

    Rel(harvestaCore, stellar, "Submits transactions, invokes contracts, ingests events", "JSON-RPC / Horizon")
    Rel(harvestaCore, ipfs, "Pins photo proofs, telemetry JSON, and metadata", "IPFS / Pinata API")
    Rel(harvestaCore, fiat, "Card payments & local currency off-ramps", "Webhooks / REST")
    Rel(harvestaCore, satellite, "Fetches imagery for canopy verification", "REST / OGC")
    Rel(harvestaCore, awsCloud, "Hosts compute, caches sessions, persists state", "VPC / AWS SDK")
```

---

## 2. Container Architecture (C4 Level 2)

```mermaid
C4Container
    title Container Architecture - Harvesta Platform

    Person(user, "User / Sponsor / Planter", "Platform participants.")

    Container_Boundary(clients, "Client Layer (PWA & Web)") {
        Container(webApp, "Sponsor & Corporate Web Portal", "Next.js 15, React 19, Tailwind CSS", "Web interface for sponsors, carbon market traders, and DAO members.")
        Container(mobileApp, "Planter Field PWA", "Next.js 15 PWA, Service Worker, IndexedDB", "Offline-first camera & GPS telemetry collection application for field planters.")
        Container(clientZK, "ZK Prover (WASM)", "SnarkJS, Groth16 Prover", "Executes in-browser zero-knowledge proof generation.")
    }

    Container_Boundary(backend, "Backend & Compute Tier") {
        Container(apiGateway, "API & Application Gateway", "Next.js App Router, Node.js", "Handles REST & GraphQL endpoints, SEP-10 wallet auth, and rate-limiting.")
        Container(indexer, "Ledger Event Indexer", "Node.js, Stellar SDK", "Listens to Soroban events, verifies integrity, and updates relational store.")
        Container(carbonEngine, "Carbon Sequestration Engine", "Node.js, FAO/IPCC Models", "Computes species growth curves, CO2 yields, and triggers credit minting.")
        Container(oracleService, "Satellite & Location Oracle", "Node.js, GDAL, Sentinel-2", "Validates NDVI canopy scores and geofence boundaries.")
        Container(workers, "Background Workers & Crons", "BullMQ, Node.js", "Handles TTL renewal bots, S3 backup replication, and notifications.")
    }

    Container_Boundary(data, "Data & Storage Tier") {
        ContainerDb(postgres, "PostgreSQL Database", "AWS RDS Multi-AZ", "Stores user accounts, indexed tree records, species parameters, and audit logs.")
        ContainerDb(redis, "Redis Cache", "AWS ElastiCache", "Manages session tokens, rate limits, API caches, and BullMQ job queues.")
        ContainerDb(ipfsStorage, "Decentralized IPFS Storage", "Pinata Cluster", "Stores high-res planting photos, metadata JSON, and certificates.")
    }

    Container_Boundary(blockchain, "Stellar Blockchain Tier") {
        Container(sorobanContracts, "Soroban Smart Contracts", "Rust / WASM", "Escrows, registries, carbon credits, DEX, ZK verifiers, and DAO governance.")
    }

    Rel(user, webApp, "Interacts with platform", "HTTPS")
    Rel(user, mobileApp, "Captures planting data", "HTTPS / Offline")
    Rel(webApp, clientZK, "Generates anonymous donation proof", "WASM")
    Rel(mobileApp, clientZK, "Generates location commitment", "WASM")

    Rel(webApp, apiGateway, "API queries & transaction requests", "HTTPS / JSON")
    Rel(mobileApp, apiGateway, "Uploads queued photo & GPS telemetry", "HTTPS / Multi-part")

    Rel(apiGateway, postgres, "Reads/writes database", "Prisma / SQL")
    Rel(apiGateway, redis, "Manages caches & rate limits", "ioredis")
    Rel(apiGateway, ipfsStorage, "Pins photos and metadata", "HTTPS API")

    Rel(indexer, sorobanContracts, "Streams contract events", "JSON-RPC / Horizon")
    Rel(indexer, postgres, "Indexes blockchain state", "SQL")
    Rel(carbonEngine, sorobanContracts, "Mints verified carbon credits", "JSON-RPC")
    Rel(oracleService, sorobanContracts, "Submits oracle verification attestations", "JSON-RPC")
    Rel(workers, sorobanContracts, "Executes contract TTL renewals", "JSON-RPC")
```

---

## 3. Smart Contracts Ecosystem (C4 Level 3)

The smart contract layer contains 26+ modular Soroban contracts categorized into 6 domains:

```mermaid
graph TB
    subgraph "1. Escrow & Settlement"
        ESC["escrow<br/>(Single-Tree & 1-Yr Survival Guarantee #1021)"]
        TESC["tree-escrow<br/>(3-Tranche Milestone Payouts & Min Density #514)"]
        MESC["escrow-milestone<br/>(Single-Milestone Remainder Release)"]
        DESC["donation-escrow<br/>(Campaigns, Multi-Currency & Subscriptions)"]
        NPAY["naira-payout<br/>(Direct NGN Fiat Off-Ramp Settlement)"]
    end

    subgraph "2. Registry & Core Assets"
        TREG["tree-registry<br/>(Tree NFT IDs, Species, Geohash, Status)"]
        TTOK["tree-token<br/>(Tokenized Fractional Tree Ownership)"]
        TGEN["tree-genetics<br/>(Seed Provenance & Biodiversity Lineage)"]
        TRET["tree-retirement<br/>(Mortality Logging & Carbon Burning)"]
        PREG["planter-registry / farmer-registry<br/>(Planter Profiles, Staking, KYC)"]
        PBLK["planter-blacklist<br/>(Fraud Prevention & Quarantine)"]
        PBOND["planting-bond<br/>(Security Bond Staking & Slashing)"]
    end

    subgraph "3. Carbon Credits & Marketplace"
        CC["carbon-credits<br/>(Verified Carbon Units Minting & Burning)"]
        CMKT["carbon-marketplace<br/>(P2P Order Book Trading)"]
        CDEX["carbon-dex<br/>(AMM Carbon/USDC Liquidity Pools)"]
        CORA["carbon-price-oracle<br/>(Spot Carbon Pricing Feeds)"]
    end

    subgraph "4. Zero-Knowledge & Verification"
        ZKV["zk-verifier<br/>(Groth16 SNARK Proof Verifier)"]
        ZKL["zk-location-verifier<br/>(Private Northern Nigeria Boundary Check)"]
        NREG["nullifier-registry<br/>(SHA-256 Double-Claim Protection)"]
        AGGV["aggregate-impact-verifier<br/>(Multi-Tree Batch Proofs)"]
        NFTC["nft-certificate / sponsor-receipt<br/>(Dynamic SVG NFT Certificates)"]
        KYC["kyc-attestation<br/>(On-Chain KYC/AML Validation)"]
    end

    subgraph "5. Governance & Operations"
        GOV["platform-governance<br/>(DAO Proposal & Voting Engine)"]
        SPEC["species-voting / species-catalog<br/>(Species Whitelist & Growth Curves)"]
        TREAS["treasury<br/>(Multisig Protocol Reserves)"]
        STAK["staking-rewards / verifier-staking<br/>(Incentive Distribution)"]
        UPL["upgrade-timelock / transparent-proxy<br/>(Governed Contract Upgrades)"]
        ADM["admin-controls / auth-contract<br/>(Role-Based Access & Circuit Breaker)"]
        SEAL["public-seal<br/>(Notary Audit Timestamp Seals)"]
    end

    ESC --> TREG
    TESC --> PREG
    TESC --> PBOND
    DESC --> ZKV
    DESC --> NREG
    ZKL --> NREG
    CC --> TREG
    CMKT --> CC
    CDEX --> CC
    CMKT --> CORA
    NFTC --> TREG
    GOV --> TREAS
    SPEC --> TREG
    UPL --> ADM

    style ESC fill:#e1f5fe,stroke:#0288d1
    style TESC fill:#e1f5fe,stroke:#0288d1
    style TREG fill:#e8f5e9,stroke:#388e3c
    style CC fill:#fff3e0,stroke:#f57c00
    style ZKV fill:#f3e5f5,stroke:#7b1fa2
    style GOV fill:#fbe9e7,stroke:#d84315
```

---

## 4. End-to-End Data Flows (C4 Level 4)

### 4.1 Anonymous Tree Sponsorship & Escrow Lock

```mermaid
sequenceDiagram
    autonumber
    actor Sponsor as Sponsor
    participant Prover as ZK Prover (WASM)
    participant Wallet as Stellar Wallet
    participant Escrow as Donation Escrow Contract
    participant ZKVer as ZK Verifier Contract
    participant NullReg as Nullifier Registry
    participant TreeReg as Tree Registry Contract
    participant Indexer as Event Indexer
    participant DB as PostgreSQL

    Sponsor->>Prover: Generate private donation parameters (Amount, Salt, Secret)
    Prover->>Prover: Build Groth16 ZK proof & Nullifier hash
    Sponsor->>Wallet: Sign deposit transaction
    Wallet->>Escrow: Submit `deposit_anonymous(proof, commitment, nullifier)`
    Escrow->>ZKVer: Validate Groth16 proof
    ZKVer-->>Escrow: Proof valid
    Escrow->>NullReg: Verify & store nullifier
    NullReg-->>Escrow: Nullifier confirmed
    Escrow->>TreeReg: Mint Tree NFT record with locked escrow
    Escrow-->>Wallet: Transaction confirmed
    Indexer->>Escrow: Ingest `AnonymousDonationEscrowed` event
    Indexer->>DB: Store indexed donation & tree commitment
```

### 4.2 Planter Proof Submission, Satellite Telemetry & Milestone Disbursement

```mermaid
sequenceDiagram
    autonumber
    actor Planter as Planter (Mobile PWA)
    participant LocalDB as IndexedDB (Offline)
    participant API as API Server (/api/planting)
    participant IPFS as IPFS / Pinata
    participant Oracle as Satellite Oracle (Sentinel-2)
    participant Escrow as Tree Escrow Contract
    participant TreeReg as Tree Registry Contract
    participant Stellar as Stellar Network

    Planter->>LocalDB: Capture photo & GPS coordinates (offline queue)
    LocalDB->>API: Auto-sync queued payload when online
    API->>IPFS: Pin high-res photo & EXIF telemetry JSON
    IPFS-->>API: Return IPFS CID (`ipfs://Qm...`)
    API->>Oracle: Request Sentinel-2 canopy & NDVI verification
    Oracle-->>API: Canopy index verified (NDVI score = 0.72)
    API->>Escrow: Invoke `verify_planting_milestone(tree_id, ipfs_cid, oracle_sig)`
    Escrow->>TreeReg: Set status to `Planted` & store IPFS CID
    Escrow->>Stellar: Release Tranche 1 (30%) to Planter wallet
    Note over Escrow, Stellar: Tranche 2 (40%) released at 6-month survival check<br/>Tranche 3 (30%) released at 1-year survival check
```

---

## 5. Deployment & Cloud Infrastructure (C4 Deployment Topology)

```mermaid
graph TB
    subgraph Edge["1. Edge & Security Tier"]
        CF["AWS CloudFront CDN<br/>(TLS 1.3 Termination & Static Caching)"]
        WAF["AWS WAF<br/>(DDoS Mitigation, Bot Control, Rate Limiting)"]
        CF --- WAF
    end

    subgraph Compute["2. Compute & Application Tier"]
        VERCEL["Vercel Serverless Cluster<br/>(Next.js 15 Web App & API Routes)"]
        WORKERS["AWS ECS Docker Workers<br/>(Event Indexer, TTL Renewal Bot, Carbon Cron)"]
    end

    subgraph DataTier["3. Data & Storage Tier (AWS VPC)"]
        RDS_M["AWS RDS PostgreSQL (Primary)"]
        RDS_S["AWS RDS PostgreSQL (Standby Replica)"]
        REDIS["AWS ElastiCache Redis Cluster"]
        S3_1["AWS S3 Primary Bucket (us-east-1)"]
        S3_2["AWS S3 Replicated Bucket (eu-west-1)"]
        
        RDS_M -->|Synchronous Replication| RDS_S
        S3_1 -->|Cross-Region Replication| S3_2
    end

    subgraph Decentralized["4. Decentralized Networks"]
        PINATA["Pinata IPFS Pinning Cluster<br/>(Planting Photos & Telemetry JSON)"]
        SOROBAN["Stellar Soroban RPC & Horizon Nodes<br/>(Smart Contracts & Ledger State)"]
    end

    subgraph Observability["5. Observability Tier"]
        ELK["ELK Stack (Elasticsearch, Logstash, Kibana)"]
        SENTRY["Sentry Error Tracking & APM"]
        PROM["Prometheus & Grafana Dashboard"]
    end

    WAF --> VERCEL
    VERCEL --> RDS_M
    VERCEL --> REDIS
    VERCEL --> PINATA
    VERCEL --> SOROBAN
    
    WORKERS --> RDS_M
    WORKERS --> REDIS
    WORKERS --> SOROBAN
    
    VERCEL --> SENTRY
    WORKERS --> SENTRY
    VERCEL --> ELK
    WORKERS --> PROM

    style Edge fill:#e8eaf6,stroke:#3f51b5
    style Compute fill:#e0f2f1,stroke:#00897b
    style DataTier fill:#fff8e1,stroke:#fbc02d
    style Decentralized fill:#f3e5f5,stroke:#8e24aa
    style Observability fill:#fbe9e7,stroke:#d84315
```

---

## 6. Technology Stack & Key References

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 15, React 19, Tailwind CSS v4, shadcn/ui | Modern, responsive web and mobile PWA interface |
| **PWA & Offline** | Service Worker, Workbox, IndexedDB | Offline capture & auto-sync for rural planters |
| **Smart Contracts** | Rust, Soroban SDK v21+, WASM | 26+ modular smart contracts on Stellar |
| **Cryptography** | SnarkJS, Groth16, Circom, SHA-256 | Zero-knowledge privacy proofs and nullifiers |
| **Database & Cache** | PostgreSQL 16 (AWS RDS), Redis 7 (ElastiCache) | Off-chain relational cache, sessions, and queues |
| **Decentralized Storage**| IPFS, Pinata Gateway | Content-addressed storage for photos and telemetry |
| **Observability** | Sentry APM, ELK Stack, Prometheus & Grafana | Real-time error tracking, logging, and metrics |
| **Infrastructure** | AWS CloudFront, WAF, S3 Multi-Region, Terraform | Cloud hosting, security, and disaster recovery |

For the complete technical specifications and C4 model diagrams, please refer to [docs/C4_ARCHITECTURE.md](file:///docs/C4_ARCHITECTURE.md).
