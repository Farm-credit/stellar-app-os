# 🏛️ Harvesta / FarmCredit — C4 Architecture Documentation

> **Comprehensive C4 Model Architecture Specification**  
> **System Context (L1) • Container Architecture (L2) • Component Specifications (L3) • Dynamic & Deployment Topologies (L4)**  
> **Stellar Network (Soroban) • Next.js 15 PWA • Zero-Knowledge Cryptography • AWS & IPFS Infrastructure**

---

## Executive Summary

Harvesta (FarmCredit) is an enterprise-grade, decentralized reforestation, agroforestry financing, and verifiable carbon credit platform built on the **Stellar Network (Soroban Smart Contracts)**. The platform connects tree sponsors, field planters, independent verifiers, and corporate carbon buyers through cryptographically verified workflows:
- **Time-locked, milestone-based smart escrows** with survival guarantees and platform fee distribution.
- **Zero-Knowledge (ZK) privacy-preserving donations** and private geofenced location proofs using Groth16 SNARKs.
- **Offline-first Progressive Web App (PWA)** for rural planters with EXIF telemetry, GPS verification, and satellite oracle cross-referencing.
- **On-chain Carbon Credits (VCU)**, automated market maker (Carbon DEX), dynamic NFT certificates, and DAO governance.

---

## 1. C4 Level 1: System Context Diagram

The System Context diagram illustrates the high-level boundary of the Harvesta platform, the primary human actors interacting with the system, and external third-party services and networks.

```mermaid
C4Context
    title System Context Diagram (Level 1) - Harvesta Platform Ecosystem

    Person(sponsor, "Sponsor / Donor", "Individuals & organizations funding tree planting, purchasing carbon credits, or making anonymous ZK donations.")
    Person(planter, "Planter / Farmer", "Local farmers planting trees, staking bonds, submitting photo & GPS proofs via offline-ready PWA.")
    Person(verifier, "Independent Verifier / Oracle", "Field auditors & automated oracles verifying tree survival, growth telemetry, and NDVI satellite imagery.")
    Person(corporate, "Corporate Carbon Buyer", "Enterprises purchasing verified carbon units (VCU), retiring offsets, and downloading ESG compliance reports.")
    Person(daoMember, "DAO Member / Governance", "Token holders participating in species whitelisting, parameter adjustment, and upgrade timelock votes.")
    Person(admin, "Platform Admin & Auditor", "Compliance officers monitoring fraud prevention, AML/KYC attestations, and system health.")

    Enterprise_Boundary(harvestaBoundary, "Harvesta (FarmCredit) Platform") {
        System(harvestaSystem, "Harvesta Core Platform", "Orchestrates tree lifecycle, milestone escrows, carbon credit minting, ZK privacy proofs, offline synchronization, and analytics.")
    }

    System_Ext(stellarNetwork, "Stellar Blockchain & Soroban", "Decentralized ledger executing Soroban smart contracts, managing multi-tranche escrows, minting Tree NFTs and Carbon tokens.")
    System_Ext(ipfsNetwork, "IPFS & Pinata Network", "Decentralized, content-addressed immutable storage for planting photos, EXIF metadata, time-lapses, and certificates.")
    System_Ext(fiatGateway, "Fiat & Payment Rails", "Stripe payment processing for fiat donations and SEP-24 / NGN anchor rails for direct planter fiat payouts.")
    System_Ext(satelliteService, "Satellite Imagery (Copernicus/Sentinel-2)", "Multi-spectral Earth observation satellite feeds providing NDVI/EVI vegetation indices for automated canopy verification.")
    System_Ext(cloudInfra, "AWS Cloud & CDN Infrastructure", "CloudFront CDN, AWS WAF, RDS PostgreSQL, ElastiCache Redis, Multi-Region S3 backup replication, and Sentry APM.")

    Rel(sponsor, harvestaSystem, "Sponsors trees, views portfolio, mints NFT certificates, executes ZK donations", "HTTPS/WSS")
    Rel(planter, harvestaSystem, "Registers profile, stakes bond, submits planting & survival proofs", "HTTPS/PWA Offline")
    Rel(verifier, harvestaSystem, "Audits milestones, submits survival assessments, validates disputes", "HTTPS/REST")
    Rel(corporate, harvestaSystem, "Trades carbon credits, executes retirements, exports GHG reports", "HTTPS/GraphQL")
    Rel(daoMember, harvestaSystem, "Submits proposals, votes on species catalog & contract upgrades", "HTTPS/Web3")
    Rel(admin, harvestaSystem, "Reviews compliance, triggers circuit breakers, inspects logs", "HTTPS/Admin Portal")

    Rel(harvestaSystem, stellarNetwork, "Submits transactions, invokes Soroban WASM contracts, ingests ledger events", "JSON-RPC / Horizon")
    Rel(harvestaSystem, ipfsNetwork, "Pins planting photos, telemetry JSON, audit documents, and dynamic SVG metadata", "IPFS API / Pinata")
    Rel(harvestaSystem, fiatGateway, "Processes card payments and settles NGN local bank payouts", "REST Webhooks")
    Rel(harvestaSystem, satelliteService, "Fetches multi-spectral imagery and calculates canopy growth indices", "REST / OGC API")
    Rel(harvestaSystem, cloudInfra, "Hosts compute, caches sessions, persists relational state, collects metrics", "AWS SDK / VPC")
```

---

## 2. C4 Level 2: Container Diagram

The Container diagram details the high-level software containers, frontends, APIs, data stores, background workers, and blockchain smart contracts making up the Harvesta system.

```mermaid
C4Container
    title Container Diagram (Level 2) - Harvesta System Architecture

    Person(user, "User / Sponsor / Planter / Buyer", "Platform users accessing web, mobile, or API interfaces.")

    Container_Boundary(frontendApps, "Client Applications Layer") {
        Container(sponsorWeb, "Sponsor Web Application", "Next.js 15, React, Tailwind CSS, Lucide, Framer Motion", "Desktop & responsive portal for sponsorship, carbon dashboard, DEX trading, and DAO governance.")
        Container(planterPWA, "Planter Mobile PWA", "Next.js 15 PWA, Service Worker, IndexedDB, HTML5 Camera/GPS", "Offline-first mobile application for field workers to capture geotagged photos and sync when online.")
        Container(zkWasm, "ZK Prover Client (WASM)", "SnarkJS, Groth16 WASM Prover", "Generates client-side zero-knowledge proofs for anonymous donations and location boundary proofs.")
    }

    Container_Boundary(apiAndBackend, "Backend & Compute Services") {
        Container(apiServer, "API & Application Gateway", "Next.js App Router, Node.js, TypeScript", "Serves REST & GraphQL endpoints, SEP-10 authentication, 2FA lockout guards, and ZK verification.")
        Container(eventIndexer, "Stellar Ledger Event Indexer", "Node.js, Stellar SDK, Horizon Streamer", "Listens to Soroban events, verifies event integrity, and indexes on-chain state to PostgreSQL.")
        Container(carbonEngine, "Carbon Sequestration Engine", "Node.js, FAO/IPCC Biomass Models", "Calculates species-specific CO2 sequestration rates, biomass growth curves, and scheduled accrual crons.")
        Container(satelliteOracle, "Satellite & Location Oracle", "Node.js, GDAL, Sentinel-2 API", "Processes satellite raster bands, calculates NDVI indices, and validates planter GPS boundary claims.")
        Container(workerCrons, "Background Workers & Crons", "BullMQ, Node.js", "Handles Soroban TTL renewal bots, S3 backup replication, email notifications, and dispute resolution timers.")
    }

    Container_Boundary(persistenceLayer, "Data & Storage Tier") {
        ContainerDb(postgresDb, "Relational Database", "PostgreSQL 16 (AWS RDS Multi-AZ)", "Stores user profiles, tree metadata index, species parameters, audit trails, and off-chain cached states.")
        ContainerDb(redisCache, "Cache & Session Store", "Redis 7 (AWS ElastiCache)", "Stores session tokens, rate limiting counters, API response caches, and background task queues.")
        ContainerDb(ipfsStore, "Decentralized IPFS Storage", "IPFS / Pinata Pinning Cluster", "Stores planting photo proofs, EXIF payloads, certificates, and ZK verification keys.")
    }

    Container_Boundary(blockchainLayer, "Stellar / Soroban Smart Contracts Tier") {
        Container(sorobanContracts, "Soroban Smart Contracts", "Rust / WASM on Stellar", "Collection of 26+ smart contracts handling escrows, registries, carbon credits, DEX, ZK verifiers, and DAO.")
    }

    Rel(user, sponsorWeb, "Visits and interacts", "HTTPS / Browser")
    Rel(user, planterPWA, "Captures planting data offline/online", "HTTPS / Mobile")
    Rel(sponsorWeb, zkWasm, "Invokes local proof generator", "In-memory / WASM")
    Rel(planterPWA, zkWasm, "Generates location boundary proofs", "In-memory / WASM")

    Rel(sponsorWeb, apiServer, "API requests, queries, transaction building", "HTTPS / JSON")
    Rel(planterPWA, apiServer, "Syncs queued offline photos and telemetry", "HTTPS / Multi-part")

    Rel(apiServer, postgresDb, "Reads and writes transactional state", "Prisma / SQL (Port 5432)")
    Rel(apiServer, redisCache, "Reads/writes cached data & rate limits", "ioredis (Port 6379)")
    Rel(apiServer, ipfsStore, "Pins photos and metadata JSON", "HTTPS / Pinata API")

    Rel(eventIndexer, sorobanContracts, "Listens to contract events & ledger state", "JSON-RPC / Horizon (WSS/HTTPS)")
    Rel(eventIndexer, postgresDb, "Writes indexed ledger transactions", "SQL")

    Rel(carbonEngine, postgresDb, "Reads tree growth data and updates carbon yields", "SQL")
    Rel(carbonEngine, sorobanContracts, "Triggers on-chain carbon credit minting", "Stellar SDK / RPC")

    Rel(satelliteOracle, postgresDb, "Stores satellite NDVI verification scores", "SQL")
    Rel(satelliteOracle, sorobanContracts, "Submits oracle verification attestations", "Stellar SDK / RPC")

    Rel(workerCrons, redisCache, "Consumes background job queues", "Redis Protocol")
    Rel(workerCrons, sorobanContracts, "Executes TTL contract renewal pings", "JSON-RPC")
    Rel(workerCrons, postgresDb, "Updates background job status", "SQL")
```

---

## 3. C4 Level 3: Component Diagrams

### 3.1 Smart Contracts Architecture Component Diagram

Harvesta's on-chain architecture comprises modular Soroban smart contracts written in Rust, categorized into 6 functional domains:

```mermaid
C4Component
    title Component Diagram (Level 3) - Soroban Smart Contracts Ecosystem

    Container_Boundary(escrowDomain, "Escrow & Financial Settlement") {
        Component(escrowCore, "escrow", "Rust / Soroban", "Single-tree escrow with 1-Year Survival Insurance Guarantee (#1021) and platform fees (#467).")
        Component(treeEscrow, "tree-escrow", "Rust / Soroban", "Multi-tranche milestone escrow (30% planting, 40% 6mo, 30% 1yr) with minimum planting density validation (#514).")
        Component(escrowMilestone, "escrow-milestone", "Rust / Soroban", "Single-milestone escrow with remainder release triggered by authorized verifiers.")
        Component(donationEscrow, "donation-escrow", "Rust / Soroban", "Multi-currency campaign escrow supporting XLM, USDC, EURC, and recurring subscription pools.")
        Component(nairaPayout, "naira-payout", "Rust / Soroban", "Settles local currency disbursements to Nigerian farmers via regulated off-ramp anchors.")
        Component(subSponsorship, "subscription-sponsorship", "Rust / Soroban", "Automates recurring monthly planting sponsorships and continuous carbon offset funding.")
    }

    Container_Boundary(registryDomain, "Tree & Planter Registries") {
        Component(treeRegistry, "tree-registry", "Rust / Soroban", "Registers unique tree IDs, species attributes, geohashes, and lifecycle states (Planted, Verified, Dead).")
        Component(treeToken, "tree-token", "Rust / Soroban", "Tokenized fractional tree ownership and semi-fungible impact representations.")
        Component(treeGenetics, "tree-genetics", "Rust / Soroban", "Tracks seed source provenance, genetic variety, and biodiversity resilience metrics.")
        Component(treeRetirement, "tree-retirement", "Rust / Soroban", "Handles permanent tree mortality, offset retirement, and token burns.")
        Component(planterRegistry, "planter-registry / farmer-registry", "Rust / Soroban", "Maintains planter identities, performance tiers, KYC status, and completed job histories.")
        Component(planterBlacklist, "planter-blacklist", "Rust / Soroban", "Anti-fraud registry preventing bad actors from accepting jobs or withdrawing bonds.")
        Component(plantingBond, "planting-bond", "Rust / Soroban", "Manages security bond deposits staked by planters, with slashing rules for fraud.")
    }

    Container_Boundary(carbonDomain, "Carbon Credits & Marketplace") {
        Component(carbonCredits, "carbon-credits", "Rust / Soroban", "Mints Verified Carbon Units (VCU), manages vintages, serial numbers, and irreversible offset retirement.")
        Component(carbonMarketplace, "carbon-marketplace", "Rust / Soroban", "Peer-to-peer order book marketplace for listing, buying, and selling carbon credits.")
        Component(carbonDex, "carbon-dex", "Rust / Soroban", "Automated Market Maker (AMM) liquidity pools enabling instant swaps between Carbon Tokens, XLM, and USDC.")
        Component(carbonOracle, "carbon-price-oracle", "Rust / Soroban", "Decentralized oracle feed supplying global spot carbon prices and currency conversion rates.")
    }

    Container_Boundary(privacyDomain, "Zero-Knowledge & Verification") {
        Component(zkVerifier, "zk-verifier / groth16", "Rust / Soroban", "On-chain Groth16 zk-SNARK verifier validating anonymous donation proofs.")
        Component(zkLocationVerifier, "zk-location-verifier / location-proof", "Rust / Soroban", "Proves planter GPS coordinates are inside approved regional polygons without leaking exact coords.")
        Component(nullifierRegistry, "nullifier-registry", "Rust / Soroban", "Maintains spent nullifiers (SHA-256 commitments) to prevent double-spending and replay attacks.")
        Component(aggregateVerifier, "aggregate-impact-verifier", "Rust / Soroban", "Aggregates and verifies batched multi-tree impact claims in a single cryptographic proof.")
        Component(nftCertificate, "nft-certificate / sponsor-receipt", "Rust / Soroban", "Generates on-chain verifiable SVG NFT certificates and donation receipts for sponsors.")
        Component(kycAttestation, "kyc-attestation", "Rust / Soroban", "Verifies on-chain KYC/AML accreditation for institutional sponsors and authorized verifiers.")
    }

    Container_Boundary(govDomain, "Governance & Protocol Security") {
        Component(platformGov, "platform-governance", "Rust / Soroban", "DAO voting engine for protocol parameter updates, fee structures, and proposal lifecycle.")
        Component(speciesVoting, "species-voting / species-catalog", "Rust / Soroban", "Community-governed whitelist of indigenous tree species and ecological biomass growth formulas.")
        Component(treasury, "treasury", "Rust / Soroban", "Multi-signature protocol treasury managing platform reserve funds and ecosystem grants.")
        Component(stakingRewards, "staking-rewards / verifier-staking", "Rust / Soroban", "Incentive distribution engine rewarding verifiers, liquidity providers, and active planters.")
        Component(upgradeTimelock, "upgrade-timelock / transparent-proxy", "Rust / Soroban", "Time-delayed proxy architecture for transparent, governed smart contract upgrades.")
        Component(adminControls, "admin-controls / auth-contract", "Rust / Soroban", "Role-Based Access Control (RBAC), emergency circuit breakers, and administrative multisig.")
        Component(publicSeal, "public-seal", "Rust / Soroban", "Cryptographic notary seals attesting to external audit timestamps and compliance data.")
    }

    Rel(escrowCore, treeRegistry, "Mints tree record on deposit", "Soroban Cross-Contract Call")
    Rel(escrowCore, adminControls, "Validates emergency pause status", "Auth Check")
    Rel(treeEscrow, planterRegistry, "Checks planter standing & bond status", "Contract Call")
    Rel(treeEscrow, plantingBond, "Enforces bond lock / slashing", "Contract Call")
    Rel(escrowMilestone, treeRegistry, "Updates tree milestone status", "Contract Call")

    Rel(donationEscrow, zkVerifier, "Verifies ZK proof for private donation", "WASM Call")
    Rel(donationEscrow, nullifierRegistry, "Registers spent nullifiers", "Contract Call")
    Rel(zkLocationVerifier, nullifierRegistry, "Records location proof commitment", "Contract Call")

    Rel(carbonCredits, treeRegistry, "Queries tree age & species CO2 quota", "Contract Call")
    Rel(carbonMarketplace, carbonCredits, "Escrows & transfers carbon tokens", "Token Transfer")
    Rel(carbonDex, carbonCredits, "Manages carbon/USDC liquidity pool", "AMM Swap")
    Rel(carbonMarketplace, carbonOracle, "Fetches floor price validation", "Oracle Read")

    Rel(nftCertificate, treeRegistry, "Pulls metadata for dynamic SVG generation", "Metadata Read")
    Rel(platformGov, treasury, "Executes approved funding allocations", "Multisig Call")
    Rel(speciesVoting, treeRegistry, "Whitelists eligible planting species", "Registry Update")
    Rel(upgradeTimelock, transparentProxy, "Dispatches upgrade WASM hash after timelock", "Contract Upgrade")
```

---

### 3.2 Backend API & Service Layer Component Diagram

The Next.js API and backend services layer manages off-chain business logic, authentication, external integrations, background workers, and telemetry processing.

```mermaid
C4Component
    title Component Diagram (Level 3) - Backend API & Services Architecture

    Container_Boundary(apiRoutes, "API Controllers & Endpoints (app/api/)") {
        Component(authEndpoints, "Auth Controllers (/api/auth, /api/user)", "NextAuth / SEP-10", "Handles wallet challenge-response signing, JWT session management, and 2FA lockout guards.")
        Component(txEndpoints, "Transaction Controllers (/api/transaction, /api/escrow)", "Next.js Route", "Constructs, simulates, and submits Stellar transactions; relays anonymous ZK donations.")
        Component(treeEndpoints, "Tree & Planter Controllers (/api/trees, /api/planting, /api/planters)", "Next.js Route", "Manages tree catalog queries, planting assignments, geotagged photo uploads, and planter profiles.")
        Component(carbonEndpoints, "Carbon & Market Controllers (/api/carbon, /api/credits, /api/pools)", "Next.js Route", "Handles carbon credit balance queries, DEX liquidity quotes, and offset retirement certificates.")
        Component(oracleEndpoints, "Oracle & Telemetry Controllers (/api/location-proof, /api/oracle, /api/survival)", "Next.js Route", "Receives satellite imagery payloads, parses EXIF telemetry, and verifies survival claims.")
        Component(webhookEndpoints, "Webhook Handlers (/api/webhooks/stripe, /api/webhooks/stellar)", "Next.js Route", "Processes asynchronous webhook events from Stripe payments and Horizon ledger listeners.")
        Component(complianceEndpoints, "Compliance & Admin Controllers (/api/compliance, /api/tax-forms, /api/admin)", "Next.js Route", "Generates ESG compliance reports, tax forms (1099/W-9), and provides administrative dashboards.")
    }

    Container_Boundary(serviceLayer, "Business Services & Core Libraries (lib/)") {
        Component(stellarService, "Stellar Service (lib/stellar/)", "Stellar SDK, Soroban RPC", "Builds XDR envelopes, simulates contract calls, computes gas fees, and manages wallet connectors.")
        Component(ipfsService, "IPFS Service (lib/ipfs/)", "Pinata SDK, IPFS Client", "Uploads photos, validates CIDs, generates metadata JSON, and handles decentralized asset retrieval.")
        Component(zkService, "ZK Service (lib/zk/)", "SnarkJS, Groth16, WASM", "Verifies SNARK proofs, calculates nullifiers, and computes cryptographic commitments.")
        Component(carbonService, "Carbon Service (lib/carbon/)", "Growth & Biomass Algorithms", "Implements species growth curves, FAO biomass calculations, and carbon accrual schedules.")
        Component(oracleService, "Oracle Service (lib/oracle/, lib/geo/)", "GDAL, Sentinel-2 Sync", "Computes NDVI vegetation indices from satellite bands and validates geohashes.")
        Component(indexerService, "Indexer Service (lib/indexer/)", "Horizon & Soroban Listener", "Monitors ledger streams, validates event hashes, and indexes data into PostgreSQL.")
        Component(securityService, "Security & Rate Limiter (lib/rateLimit.ts, lib/cors.ts)", "Redis, Token Bucket", "Enforces DDoS protection, IP rate limiting, 2FA lockout initialization, and CORS security.")
        Component(monitoringService, "Observability Service (lib/sentry.ts, lib/metrics.ts)", "Sentry SDK, Prometheus", "Tracks error boundaries, transaction performance metrics, and application health.")
    }

    Container_Boundary(dataStores, "Data Tier") {
        ComponentDb(pgDatabase, "PostgreSQL Database", "Prisma ORM / SQL", "Off-chain persistent database.")
        ComponentDb(redisStore, "Redis Cache", "ioredis", "In-memory caching and rate limit storage.")
    }

    Rel(authEndpoints, securityService, "Checks rate limits and lockout status", "In-memory")
    Rel(txEndpoints, stellarService, "Builds & submits Stellar transactions", "Internal Call")
    Rel(txEndpoints, zkService, "Validates ZK donation proof", "Internal Call")
    Rel(treeEndpoints, ipfsService, "Pins photos and metadata", "HTTPS / API")
    Rel(treeEndpoints, pgDatabase, "Queries / updates tree database records", "Prisma")
    Rel(carbonEndpoints, carbonService, "Calculates real-time carbon sequestration", "Calculation")
    Rel(oracleEndpoints, oracleService, "Calculates NDVI vegetation indices", "Processing")
    Rel(webhookEndpoints, indexerService, "Dispatches ledger event processing", "Internal Queue")
    Rel(complianceEndpoints, pgDatabase, "Generates audit trail reports", "SQL Query")

    Rel(stellarService, monitoringService, "Logs transaction latencies & failures", "Telemetry")
    Rel(securityService, redisStore, "Increments & checks rate limit tokens", "Redis Commands")
```

---

### 3.3 Frontend & Client Architecture Component Diagram

The client presentation layer is built as a progressive, offline-ready web application using Next.js 15, React, and client-side zero-knowledge cryptography.

```mermaid
C4Component
    title Component Diagram (Level 3) - Frontend & Client Architecture

    Container_Boundary(presentationLayer, "UI & Component Modules") {
        Component(sponsorPortal, "Sponsor & Donor Portal", "React, Tailwind, Lucide", "Interactive tree sponsorship checkout, dynamic map view, carbon offset tracker, and NFT gallery.")
        Component(planterMobile, "Planter Field PWA", "React, HTML5 Media & Geo APIs", "Mobile-optimized interface for field workers: camera capture, GPS geotagging, offline queue manager.")
        Component(dexPortal, "Carbon DEX & Marketplace UI", "React, TradingView Charts", "Order book, liquidity pool staking, token swapping, and offset retirement certificate generator.")
        Component(governancePortal, "DAO Governance UI", "React, Markdown Renderer", "Species whitelist voting, proposal creation, voting power display, and timelock monitor.")
        Component(adminPortal, "Admin & Compliance UI", "React, Data Tables, Charts", "System health dashboards, verifier dispute queues, KYC audit tables, and circuit breaker switches.")
    }

    Container_Boundary(stateAndHooks, "State Management & Custom Hooks") {
        Component(walletContext, "Wallet Context & Connectors", "Freighter, Albedo, xBull, SEP-10", "Manages multi-wallet connection state, public keys, network selection, and transaction signing.")
        Component(offlineContext, "Offline Sync Manager", "Service Worker, IndexedDB, Workbox", "Queues photo uploads and GPS logs in IndexedDB when offline; auto-syncs when connection restores.")
        Component(zkHook, "useAnonymousDonation()", "SnarkJS, WebAssembly Prover", "Generates client-side Groth16 ZK proof, secrets, commitments, and nullifiers.")
        Component(treeHook, "useTreeData() / useCarbon()", "SWR / React Query", "Optimistic caching, live pollers, and real-time ledger state synchronizers.")
    }

    Container_Boundary(clientWasm, "Client Cryptography & Offline Storage") {
        Component(wasmProver, "ZK SnarkJS WASM Prover", "WebAssembly", "Executes zero-knowledge proof calculations locally in the browser to maintain donor privacy.")
        Component(indexedDbStore, "Browser IndexedDB", "Local Storage", "Stores encrypted offline planting proofs, draft reports, and cached map tiles.")
    }

    Rel(sponsorPortal, walletContext, "Requests transaction signature", "React Hook")
    Rel(sponsorPortal, zkHook, "Triggers anonymous proof generation", "React Hook")
    Rel(zkHook, wasmProver, "Executes witness generation & proof construction", "WASM Execution")

    Rel(planterMobile, offlineContext, "Saves photo & GPS telemetry", "IndexedDB Queue")
    Rel(offlineContext, indexedDbStore, "Persists queued jobs locally", "Storage API")
    Rel(dexPortal, walletContext, "Signs DEX swaps & liquidity deposits", "Stellar Wallet SDK")
    Rel(governancePortal, walletContext, "Signs DAO ballot votes", "Stellar Wallet SDK")
    Rel(sponsorPortal, treeHook, "Fetches live tree & carbon statistics", "HTTP / SWR")
```

---

## 4. C4 Level 4: Dynamic Interaction & Data Flow Diagrams

### 4.1 Flow 1: Privacy-Preserving Anonymous Tree Sponsorship & Escrow

```mermaid
sequenceDiagram
    autonumber
    actor Sponsor as 👤 Sponsor (Browser)
    participant Prover as 🔒 ZK WASM Prover (Client)
    participant Wallet as 🔑 Stellar Wallet (Freighter)
    participant API as 🚀 Backend API (/api/transaction)
    participant Escrow as 🔒 Donation Escrow (Soroban)
    participant ZKVer as 🛡️ ZK Verifier Contract
    participant NullReg as 📜 Nullifier Registry Contract
    participant TreeReg as 🌳 Tree Registry Contract
    participant Indexer as 📡 Ledger Event Indexer
    participant DB as 🗄️ PostgreSQL Database

    Sponsor->>Prover: 1. Generate donation parameters (Amount, Salt, Secret)
    Prover->>Prover: 2. Construct Groth16 ZK Proof & compute Nullifier Hash
    Sponsor->>Wallet: 3. Sign anonymous deposit transaction (XLM / USDC)
    Wallet->>Escrow: 4. Submit `deposit_anonymous(proof, commitment, nullifier)`
    Escrow->>ZKVer: 5. Verify Groth16 cryptographic proof validity
    ZKVer-->>Escrow: 6. Proof Valid = true
    Escrow->>NullReg: 7. Check & register nullifier (prevent double-spend)
    NullReg-->>Escrow: 8. Nullifier registered successfully
    Escrow->>TreeReg: 9. Mint unassigned Tree NFT record with funded escrow lock
    Escrow-->>Wallet: 10. Transaction confirmed on Stellar ledger
    Indexer->>Escrow: 11. Ingest `AnonymousDonationEscrowed` event
    Indexer->>DB: 12. Save anonymous tree record, escrow status & commitment
    API-->>Sponsor: 13. Return cryptographic deposit receipt & anonymous Tree ID
```

---

### 4.2 Flow 2: Planter Proof-of-Planting, Satellite Telemetry & Multi-Tranche Payout

```mermaid
sequenceDiagram
    autonumber
    actor Planter as 🧑‍🌾 Planter (Mobile PWA)
    participant LocalDB as 💾 Browser IndexedDB
    participant API as 🚀 Backend API (/api/planting)
    participant IPFS as 🌐 IPFS / Pinata
    participant Oracle as 🛰️ Satellite & NDVI Engine
    participant Escrow as 🔒 Tree Escrow Contract
    participant TreeReg as 🌳 Tree Registry Contract
    participant Stellar as ⚡ Stellar Ledger / Fiat Anchor

    Note over Planter, LocalDB: Field worker operating in remote low-connectivity zone
    Planter->>Planter: 1. Capture planting photo with camera & GPS coordinates
    Planter->>LocalDB: 2. Store photo blob + EXIF telemetry in IndexedDB queue
    Note over Planter, API: Network connection detected (Auto-Sync triggered)
    LocalDB->>API: 3. Upload queued photo payload & GPS metadata
    API->>IPFS: 4. Pin high-resolution photo & telemetry JSON
    IPFS-->>API: 5. Return immutable IPFS CID
    API->>Oracle: 6. Trigger automated satellite verification & NDVI analysis
    Oracle->>Oracle: 7. Validate coordinates against Sentinel-2 spectral raster
    Oracle-->>API: 8. Satellite canopy verification passed (NDVI score = 0.72)
    API->>Escrow: 9. Submit `verify_planting_milestone(tree_id, ipfs_cid, oracle_sig)`
    Escrow->>TreeReg: 10. Update tree status to `Planted` & store IPFS CID
    Escrow->>Stellar: 11. Release Tranche 1 (30% of escrowed funds) to Planter wallet
    Stellar-->>Planter: 12. Planter receives payment (USDC or NGN fiat off-ramp)
    Note over Escrow, Stellar: 6 Months later: Survival check releases Tranche 2 (40%)<br/>12 Months later: 1-Year survival check releases Tranche 3 (30%)
```

---

### 4.3 Flow 3: Carbon Sequestration Accrual, Verification, and Secondary DEX Trading

```mermaid
sequenceDiagram
    autonumber
    actor Buyer as 🏢 Corporate Carbon Buyer
    participant API as 🚀 Backend API (/api/carbon)
    participant Engine as 📊 Carbon Sequestration Engine
    participant Oracle as 🛰️ Verification Oracle
    participant CarbonContract as 📉 Carbon Credits Contract (Soroban)
    participant DEX as 💱 Carbon DEX / AMM Contract
    participant TreeReg as 🌳 Tree Registry Contract

    Engine->>TreeReg: 1. Fetch verified tree cohorts, species growth rates & age
    Engine->>Engine: 2. Apply FAO/IPCC biomass formulas to calculate accrued CO₂ (tons)
    Engine->>Oracle: 3. Cross-reference canopy growth index via Sentinel-2
    Oracle-->>Engine: 4. Canopy density confirmed
    Engine->>CarbonContract: 5. Call `mint_carbon_credits(tree_id, vintage_year, co2_tons)`
    CarbonContract->>CarbonContract: 6. Mint tokenized Verified Carbon Units (VCU tokens)
    CarbonContract->>DEX: 7. Deposit minted VCU to Carbon/USDC Liquidity Pool
    Buyer->>DEX: 8. Submit swap order (Swap 10,000 USDC → VCU Carbon Tokens)
    DEX->>DEX: 9. Execute automated constant-product AMM swap formula
    DEX-->>Buyer: 10. Transfer VCU Carbon Tokens to Buyer's Stellar wallet
    Buyer->>CarbonContract: 11. Invoke `retire_carbon_credits(amount, beneficiary, reason)`
    CarbonContract->>CarbonContract: 12. Permanently burn VCU tokens & emit `CarbonOffsetRetired`
    CarbonContract-->>API: 13. Generate auditable cryptographic Carbon Retirement Certificate (PDF/SVG)
    API-->>Buyer: 14. Download official ESG/GHG Protocol compliance certificate
```

---

## 5. C4 Deployment & Infrastructure Architecture Diagram

The Deployment diagram illustrates the physical and containerized infrastructure topology across AWS Cloud, Vercel edge networks, decentralized networks, and observability services.

```mermaid
C4Deployment
    title Deployment & Infrastructure Diagram - Production Environment

    Deployment_Node(edgeTier, "Edge & Security Tier", "Global Anycast Edge") {
        Deployment_Node(awsCloudFront, "AWS CloudFront & WAF", "CDN & Web Application Firewall") {
            Container(cdnEdge, "CloudFront CDN Edge", "Edge Caching & SSL Termination", "Accelerates static asset delivery, enforces TLS 1.3, and mitigates DDoS attacks.")
            Container(wafRules, "AWS WAF Rules", "Rate Limiting & Bot Control", "Inspects HTTP headers, blocks malicious payloads, and limits abusive IP traffic.")
        }
    }

    Deployment_Node(computeTier, "Application & Compute Tier", "Vercel & AWS ECS Cluster") {
        Deployment_Node(vercelPlatform, "Vercel Serverless Platform", "Next.js 15 Node.js Runtime") {
            Container(frontendContainers, "Next.js Web & API Nodes", "Node.js Serverless", "Renders React server components, handles API routes, and proxies wallet requests.")
        }
        Deployment_Node(workerCluster, "AWS ECS / Docker Workers", "Linux Containers") {
            Container(workerProcess, "Worker & Indexer Daemon", "Dockerfile.workers", "Runs Soroban ledger indexers, carbon calculation crons, and TTL renewal bots.")
        }
    }

    Deployment_Node(dataTier, "Database & Storage Tier", "AWS VPC Private Subnet") {
        Deployment_Node(rdsCluster, "AWS RDS PostgreSQL", "Multi-AZ Database Cluster") {
            ContainerDb(primaryDb, "Primary PostgreSQL Node", "PostgreSQL 16", "Active read/write transactional relational database.")
            ContainerDb(standbyDb, "Standby Replica", "PostgreSQL 16", "Synchronous warm standby replica with automated failover.")
        }
        Deployment_Node(elasticacheCluster, "AWS ElastiCache Redis", "Multi-AZ Redis Cluster") {
            ContainerDb(redisPrimary, "Redis Master & Replica", "Redis 7 Cluster", "In-memory cache, session tokens, rate limiting counters, and BullMQ queues.")
        }
        Deployment_Node(s3Storage, "AWS S3 Multi-Region Backup", "s3-backup-replication.tf") {
            ContainerDb(s3Primary, "Primary S3 Bucket (us-east-1)", "Object Storage", "Stores system backups, audit exports, and generated PDF/SVG certificates.")
            ContainerDb(s3Secondary, "Replicated S3 Bucket (eu-west-1)", "Object Storage", "Automated cross-region disaster recovery replica.")
        }
    }

    Deployment_Node(decentralizedTier, "Decentralized Networks Tier", "Global P2P Networks") {
        Deployment_Node(pinataCluster, "IPFS Pinning Cluster", "Pinata Gateway") {
            ContainerDb(ipfsNodes, "IPFS Storage Nodes", "IPFS Protocol", "Immutable storage for tree photos, EXIF payloads, and verification documents.")
        }
        Deployment_Node(stellarCluster, "Stellar Network", "Mainnet / Testnet") {
            Container(sorobanNodes, "Soroban RPC & Horizon Nodes", "Stellar Core & RPC", "Processes smart contract calls, maintains distributed ledger, and emits events.")
        }
    }

    Deployment_Node(observabilityTier, "Observability & Monitoring Tier", "AWS & Cloud SaaS") {
        Deployment_Node(elkStack, "ELK Logging Stack", "docker-compose.elk.yml") {
            Container(elasticSearch, "Elasticsearch & Logstash", "Search & Ingestion", "Aggregates application, access, and security logs in real-time.")
            Container(kibana, "Kibana Dashboard", "Visualizer", "Log visualization, query analytics, and anomaly alerting.")
        }
        Deployment_Node(prometheusStack, "Metrics & APM", "docker-compose.monitoring.yml & Sentry") {
            Container(sentryApm, "Sentry Error Tracking", "Cloud APM", "Real-time error tracking, exception alerting, and distributed performance tracing.")
            Container(grafanaMon, "Prometheus & Grafana", "Time-Series Metrics", "Monitors server CPU, memory, transaction throughput, and Soroban gas consumption.")
        }
    }

    Rel(cdnEdge, frontendContainers, "Routes valid web & API traffic", "HTTPS / Keep-Alive")
    Rel(frontendContainers, primaryDb, "Queries and persists data", "PostgreSQL Wire Protocol / TLS")
    Rel(frontendContainers, redisPrimary, "Caches responses & checks rate limits", "Redis Protocol / TLS")
    Rel(frontendContainers, ipfsNodes, "Uploads and pins photos", "HTTPS / REST")
    Rel(frontendContainers, sorobanNodes, "Simulates & submits Soroban transactions", "JSON-RPC (HTTPS)")

    Rel(workerProcess, primaryDb, "Updates indexed events & carbon records", "SQL")
    Rel(workerProcess, redisPrimary, "Pulls queued jobs", "Redis Protocol")
    Rel(workerProcess, sorobanNodes, "Listens to ledger streams & renews contract TTLs", "WSS / JSON-RPC")

    Rel(primaryDb, standbyDb, "Synchronous Multi-AZ streaming replication", "Internal VPC")
    Rel(s3Primary, s3Secondary, "Automated asynchronous cross-region replication", "AWS Backbone")

    Rel(frontendContainers, elkStack, "Streams JSON application logs", "WSS / Logstash")
    Rel(frontendContainers, sentryApm, "Captures unhandled exceptions & APM traces", "HTTPS")
    Rel(workerProcess, sentryApm, "Captures worker job failures", "HTTPS")
```

---

## 6. Technical Specifications & Architecture Decisions

### 6.1 Key Architectural Patterns

| Pattern | Implementation | Justification |
|---|---|---|
| **Multi-Tranche Escrow** | `tree-escrow`, `escrow` | Funds released in 3 tranches (30% planting, 40% 6mo, 30% 1yr) ensuring planter long-term care and survival alignment. |
| **Survival Insurance Guarantee** | `escrow` (#1021) | Optional 2% fee providing sponsors 100% full refund if tree dies within 1 year. |
| **Zero-Knowledge Privacy** | Groth16 SnarkJS, `zk-verifier`, `nullifier-registry` | Enables donors to prove funding validity and planters to prove regional boundaries without revealing identity or exact coordinates. |
| **Offline-First PWA** | Next.js PWA, Service Workers, IndexedDB | Allows field planters in rural Nigerian regions without internet access to capture geotagged proofs and auto-sync when connected. |
| **Decentralized Storage & Notary** | IPFS (Pinata), `public-seal` | Ensures immutable proof photos, EXIF metadata, and audit reports cannot be retroactively altered. |
| **Automated Carbon Sequestration** | `carbon-credits`, `carbon-dex`, FAO biomass models | Accrues verifiable carbon units (VCU) based on verified tree growth curves and provides liquid on-chain trading. |
| **Timelocked Contract Upgradability** | `upgrade-timelock`, `transparent-proxy` | Ensures protocol smart contract upgrades require multi-day timelocks and DAO governance approval. |

### 6.2 Security & Compliance Matrix

| Security Layer | Mechanism | Protection |
|---|---|---|
| **Edge Security** | AWS WAF, CloudFront | Rate limiting, bot filtering, DDoS mitigation, TLS 1.3 termination. |
| **Authentication & AuthZ** | SEP-10 Wallet Challenge, NextAuth, 2FA Lockout Guard | Cryptographic wallet authentication, session replay prevention, brute force protection. |
| **Smart Contract Defense** | Soroban Auth framework, Reentrancy protection, Safe Math | Prevents unauthorized contract invocations, integer overflow, and state exploitation. |
| **Double-Claim Prevention** | `nullifier-registry` (SHA-256) | Guarantees zero-knowledge donation commitments cannot be replayed or claimed twice. |
| **Planter Anti-Fraud** | `planting-bond`, `planter-blacklist`, EXIF/GPS validator | Financial bond slashing for fake coordinates or fraudulent tree photos. |
| **Disaster Recovery** | S3 Multi-Region Replication, RDS Multi-AZ Standby | RPO < 5 minutes, RTO < 15 minutes in the event of an AWS availability zone outage. |

---

## 7. Document Revision History

| Version | Date | Author / Issue | Changes Summary |
|---|---|---|---|
| `v1.0.0` | 2026-08-15 | Architecture Working Group | Initial architecture documentation. |
| `v2.0.0` | 2026-09-02 | Issue #1184 (Farm-credit/stellar-app-os) | Complete overhaul to C4 Architecture Model (L1 Context, L2 Container, L3 Smart Contracts / Backend / Frontend Components, L4 Dynamic Flows & AWS/Stellar Deployment Topology). Reflected all recent smart contracts, APIs, ZK privacy engine, and multi-region infrastructure. |
