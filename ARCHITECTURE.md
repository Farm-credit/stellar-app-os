flowchart TB
    subgraph Clients["📱 Client Layer (Frontend / PWA)"]
        direction TB
        SP["🌱 Sponsor Web App<br/>(Donations, Carbon Dashboard, DEX)"]
        PL["📸 Planter Mobile PWA<br/>(Offline Camera, GPS Telemetry)"]
        INV["🛰️ Investor & Verifier Portal<br/>(Telemetry, Satellite NDVI Map)"]
        GOV["🗳️ DAO Governance Portal<br/>(Proposal & Species Voting)"]
        WAL["🔑 Stellar Wallets<br/>(Freighter / Albedo / xBull)"]
        ZKW["🔒 ZK WASM Prover<br/>(In-Browser Groth16 Proofs)"]
        
        SP --- WAL
        PL --- WAL
        INV --- WAL
        GOV --- WAL
        SP --- ZKW
        PL --- ZKW
    end

    subgraph Storage["📦 Decentralized Storage (IPFS)"]
        IPFS["🌐 IPFS Network (Pinata Pinning Cluster)<br/>• Planting Photos & Time-lapses<br/>• GPS Telemetry & Metadata JSON<br/>• Dynamic NFT Certificates & Seals"]
    end

    subgraph Backend["⚙️ Backend & Off-Chain Infrastructure"]
        API["🚀 API Server (Next.js 15 App Router / Node.js)<br/>• SEP-10 & JWT Authentication<br/>• Upload Coordinator & EXIF Validator<br/>• Anonymous ZK Relay & Metadata Sanitization<br/>• Compliance Reporting API (SEC / EPA / Carbon Tax)"]
        INDEXER["📡 Stellar Event Indexer & Ingestion<br/>• Soroban RPC Listener<br/>• Horizon Event Streamer<br/>• Event Integrity Checker"]
        CALC["📊 Carbon Sequestration Engine<br/>• FAO/IPCC Biomass Growth Models<br/>• Scheduled Carbon Accrual Crons<br/>• Emissions & Offset Ledger"]
        ORACLE["🛰️ Verification & Satellite Engine<br/>• Sentinel-2 Imagery Sync (NDVI Indices)<br/>• GPS Boundary & Geofence Validator<br/>• ZK-Proof Verification Service"]
        WORKERS["⚡ Background Workers & Daemons<br/>• Soroban TTL Renewal Bot<br/>• S3 Multi-Region Backup Replication<br/>• Compliance Report Generator"]
        DB[(🗄️ PostgreSQL Database (AWS RDS)<br/>• Off-chain Cache & Tree Index<br/>• User Profiles, Roles & Audit Trails<br/>• Compliance Reports & Emissions Baselines)]
        REDIS[(⚡ Redis Cache (AWS ElastiCache)<br/>• Session Tokens & Rate Limits<br/>• BullMQ Task Queues)]
        
        API <--> DB 
        API <--> REDIS
        INDEXER --> DB
        CALC <--> DB
        ORACLE <--> DB 
        WORKERS <--> REDIS
        WORKERS --> DB
    end

    subgraph Blockchain["⚡ Stellar Network (Soroban Smart Contracts)"]
        direction TB
        RPC["🔗 Soroban RPC Node / Horizon"]
        
        subgraph Contracts["Smart Contracts Ecosystem (Rust / WASM)"]
            ESC["🔒 Escrow & Settlement<br/>(escrow, tree-escrow, escrow-milestone, donation-escrow, naira-payout)"]
            REG["🌳 Tree & Planter Registries<br/>(tree-registry, tree-token, tree-genetics, planter-registry, planting-bond)"]
            CARB["📉 Carbon Credits & DEX<br/>(carbon-credits, carbon-marketplace, carbon-dex, carbon-price-oracle, soil-health)"]
            ZKC["🛡️ Privacy & Zero-Knowledge<br/>(zk-verifier, zk-location-verifier, nullifier-registry, aggregate-verifier)"]
            GOVC["🏛️ Governance & Security<br/>(platform-governance, species-voting, treasury, upgrade-timelock, admin-controls)"]
            SEQUESTR["🔒 Permanent Sequestration<br/>(sequestration-bond, leakage-prevention, 30-year-lock, insurance-pool)"]
        end
        
        RPC <--> Contracts
    end

    %% Interactions
    PL -->|"1. Upload Proof (Photo + GPS)"| IPFS
    PL -->|"2. Submit Job Completion (IPFS CID)"| API
    SP -->|"3. Sponsor Tree / Anonymous ZK Deposit"| WAL
    WAL -->|"4. Sign & Submit Tx"| RPC
    
    API -->|"5. Pin Metadata / Verify CIDs"| IPFS
    API -->|"6. Trigger Verification Checks"| ORACLE
    
    INDEXER <-->|"7. Poll / Listen to Ledger Events"| RPC
    ORACLE -->|"8. Execute Verified Tranche Release"| RPC
    CALC -->|"9. Trigger On-Chain Carbon Minting"| RPC
    WORKERS -->|"10. Contract TTL Renewal Pings"| RPC
    
    Clients <-->|"11. Query Cached Data & Analytics"| API
