# Harvesta Architecture Diagram

## High-Level System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WebApp[Web Application<br/>Next.js + React]
        MobileApp[Mobile App<br/>React Native<br/>(Planned)]
    end

    subgraph "Frontend Layer"
        Components[React Components]
        Hooks[Custom Hooks]
        Contexts[React Context]
        Utils[Utility Functions]
    end

    subgraph "API Layer"
        APIRoutes[API Routes<br/>Next.js App Router]
        Webhooks[Webhook Handlers]
        Auth[Authentication]
    end

    subgraph "Business Logic Layer"
        Services[Business Services]
        StellarSDK[Stellar SDK]
        IPFSClient[IPFS Client]
        EmailService[Email Service]
        Analytics[Analytics Service]
    end

    subgraph "Data Layer"
        PostgreSQL[(PostgreSQL<br/>Database)]
        Redis[(Redis<br/>Cache)]
        IPFS[(IPFS<br/>Decentralized Storage)]
    end

    subgraph "Blockchain Layer"
        Stellar[Stellar Network]
        Soroban[Soroban Smart Contracts]
    end

    subgraph "Smart Contracts"
        TreeEscrow[Tree Escrow]
        FarmerRegistry[Farmer Registry]
        SpeciesRegistry[Species Registry]
        DonationEscrow[Donation Escrow]
        EscrowMilestone[Escrow Milestone]
        AdminControls[Admin Controls]
        KYCAttestation[KYC Attestation]
        LocationProof[Location Proof]
        NullifierRegistry[Nullifier Registry]
        ZKVerifier[ZK Verifier]
        ZKLocationVerifier[ZK Location Verifier]
        AggregateImpactVerifier[Aggregate Impact Verifier]
        NairaPayout[Naira Payout]
        TreeToken[Tree Token]
        SpeciesVoting[Species Voting]
    end

    subgraph "External Services"
        Stripe[Stripe<br/>Payment Processing]
        Freighter[Freighter<br/>Wallet]
        Albedo[Albedo<br/>Wallet]
        XBull[xBull<br/>Wallet]
        EmailProvider[Email Provider<br/>SendGrid/SES]
    end

    subgraph "Monitoring & Observability"
        Logs[Logging]
        Metrics[Metrics Collection]
        Alerts[Alerting]
    end

    %% Data Flows
    WebApp --> Components
    Components --> Hooks
    Components --> Contexts
    Components --> APIRoutes
    
    APIRoutes --> Services
    APIRoutes --> Auth
    Webhooks --> Services
    
    Services --> StellarSDK
    Services --> IPFSClient
    Services --> EmailService
    Services --> Analytics
    
    Services --> PostgreSQL
    Services --> Redis
    IPFSClient --> IPFS
    
    StellarSDK --> Stellar
    Stellar --> Soroban
    Soroban --> TreeEscrow
    Soroban --> FarmerRegistry
    Soroban --> SpeciesRegistry
    Soroban --> DonationEscrow
    Soroban --> EscrowMilestone
    Soroban --> AdminControls
    Soroban --> KYCAttestation
    Soroban --> LocationProof
    Soroban --> NullifierRegistry
    Soroban --> ZKVerifier
    Soroban --> ZKLocationVerifier
    Soroban --> AggregateImpactVerifier
    Soroban --> NairaPayout
    Soroban --> TreeToken
    Soroban --> SpeciesVoting
    
    Services --> Stripe
    WebApp --> Freighter
    WebApp --> Albedo
    WebApp --> XBull
    EmailService --> EmailProvider
    
    Services --> Logs
    Services --> Metrics
    Metrics --> Alerts

    style WebApp fill:#e1f5ff
    style MobileApp fill:#e1f5ff
    style Stellar fill:#ffeb3b
    style Soroban fill:#ff9800
    style IPFS fill:#4caf50
    style PostgreSQL fill:#2196f3
    style Redis fill:#f44336
```

## Component Interactions

### User Flow: Sponsor a Tree

```mermaid
sequenceDiagram
    participant User
    participant WebApp
    participant API
    participant Stellar
    participant Soroban
    participant IPFS
    participant DB
    participant Planter

    User->>WebApp: Select species & quantity
    WebApp->>API: Get species data
    API->>DB: Query species info
    DB-->>API: Return species data
    API-->>WebApp: Species details
    WebApp->>User: Display options
    
    User->>WebApp: Connect wallet (Freighter)
    WebApp->>Stellar: Request signature
    Stellar-->>WebApp: Signature
    
    User->>WebApp: Submit payment
    WebApp->>API: Create donation
    API->>Soroban: Lock funds in escrow
    Soroban-->>API: Transaction ID
    API->>DB: Save donation record
    API-->>WebApp: Confirmation
    WebApp->>User: Show tree ID
    
    Planter->>WebApp: Upload photo + GPS
    WebApp->>IPFS: Upload image
    IPFS-->>WebApp: CID
    WebApp->>API: Submit progress
    API->>Soroban: Verify milestone
    Soroban->>Stellar: Release payment
    API->>DB: Update tree status
    API-->>User: Dashboard update
```

### Smart Contract Data Flow

```mermaid
graph LR
    A[User Donation] --> B[DonationEscrow]
    B --> C[TreeEscrow]
    C --> D[TreeToken]
    D --> E[FarmerRegistry]
    E --> F[SpeciesRegistry]
    F --> G[LocationProof]
    G --> H[ZKLocationVerifier]
    H --> I[ZKVerifier]
    I --> J[AggregateImpactVerifier]
    J --> K[EscrowMilestone]
    K --> L[AdminControls]
    L --> M[NullifierRegistry]
    M --> N[SpeciesVoting]
    N --> O[KYCAttestation]
    O --> P[NairaPayout]

    style A fill:#e1f5ff
    style B fill:#ff9800
    style C fill:#ff9800
    style D fill:#ff9800
    style E fill:#ff9800
    style F fill:#ff9800
    style G fill:#ff9800
    style H fill:#ff9800
    style I fill:#ff9800
    style J fill:#ff9800
    style K fill:#ff9800
    style L fill:#ff9800
    style M fill:#ff9800
    style N fill:#ff9800
    style O fill:#ff9800
    style P fill:#ff9800
```

## Data Storage Architecture

```mermaid
graph TB
    subgraph "On-Chain Data (Stellar)"
        SC1[Smart Contract State]
        SC2[Transaction History]
        sc3[Tree NFTs]
        SC4[Escrow Balances]
    end

    subgraph "Off-Chain Database (PostgreSQL)"
        DB1[User Profiles]
        DB2[Donation Records]
        DB3[Tree Metadata]
        DB4[Planter Profiles]
        DB5[Species Data]
        DB6[Impact Metrics]
        DB7[Webhook Logs]
        DB8[Analytics Data]
    end

    subgraph "Decentralized Storage (IPFS)"
        IPFS1[Tree Photos]
        IPFS2[GPS Coordinates]
        IPFS3[Verification Documents]
        IPFS4[Certificates]
    end

    subgraph "Cache Layer (Redis)"
        CACHE1[Session Data]
        CACHE2[API Responses]
        CACHE3[Rate Limits]
    end

    SC1 <--> DB1
    SC2 <--> DB2
    sc3 <--> DB3
    SC4 <--> DB2
    
    DB3 <--> IPFS1
    DB3 <--> IPFS2
    DB4 <--> IPFS3
    DB2 <--> IPFS4
    
    DB1 <--> CACHE1
    DB2 <--> CACHE2
    APIRoutes <--> CACHE3

    style SC1 fill:#ffeb3b
    style SC2 fill:#ffeb3b
    style sc3 fill:#ffeb3b
    style SC4 fill:#ffeb3b
    style IPFS1 fill:#4caf50
    style IPFS2 fill:#4caf50
    style IPFS3 fill:#4caf50
    style IPFS4 fill:#4caf50
    style CACHE1 fill:#f44336
    style CACHE2 fill:#f44336
    style CACHE3 fill:#f44336
```

## Security Architecture

```mermaid
graph TB
    subgraph "Authentication Layer"
        WalletAuth[Wallet Authentication<br/>Freighter/Albedo/xBull]
        SessionMgmt[Session Management<br/>JWT Tokens]
        KYC[KYC Verification<br/>Attestation Contract]
    end

    subgraph "Authorization Layer"
        RBAC[Role-Based Access Control]
        AdminControls[Admin Controls Contract]
        PermissionChecks[Permission Checks]
    end

    subgraph "Data Protection"
        Encryption[Encryption at Rest]
        TLS[TLS in Transit]
        ZKProofs[Zero-Knowledge Proofs]
        Nullifiers[Nullifier Registry]
    end

    subgraph "Smart Contract Security"
        Escrow[Escrow Protection]
        RateLimiting[Rate Limiting]
        InputValidation[Input Validation]
        ReentrancyGuard[Reentrancy Guards]
    end

    WalletAuth --> SessionMgmt
    SessionMgmt --> RBAC
    KYC --> RBAC
    
    RBAC --> PermissionChecks
    AdminControls --> PermissionChecks
    
    PermissionChecks --> Encryption
    Encryption --> TLS
    ZKProofs --> Nullifiers
    
    Escrow --> RateLimiting
    RateLimiting --> InputValidation
    InputValidation --> ReentrancyGuard

    style WalletAuth fill:#4caf50
    style KYC fill:#4caf50
    style ZKProofs fill:#4caf50
    style Escrow fill:#ff9800
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Production Environment"
        subgraph "Frontend"
            Vercel[Vercel<br/>Next.js Hosting]
            CDN[CDN<br/>Static Assets]
        end
        
        subgraph "Backend"
            API[API Server<br/>Node.js]
            Workers[Background Workers<br/>Indexer/Webhooks]
        end
        
        subgraph "Database"
            RDS[PostgreSQL<br/>AWS RDS]
            ElastiCache[Redis<br/>AWS ElastiCache]
        end
        
        subgraph "Storage"
            Pinata[Pinata<br/>IPFS Pinning]
            S3[AWS S3<br/>Backup Storage]
        end
        
        subgraph "Monitoring"
            CloudWatch[AWS CloudWatch]
            Sentry[Sentry<br/>Error Tracking]
        end
    end

    Vercel --> CDN
    Vercel --> API
    API --> RDS
    API --> ElastiCache
    API --> Pinata
    Workers --> RDS
    Workers --> Pinata
    API --> CloudWatch
    Workers --> CloudWatch
    Vercel --> Sentry
    API --> Sentry
    Pinata --> S3

    style Vercel fill:#000000
    style Vercel stroke:#ffffff
    style Vercel color:#ffffff
```

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14, React, TypeScript | Web application framework |
| **Styling** | Tailwind CSS, shadcn/ui | UI components and styling |
| **State Management** | React Context, Zustand | Client-side state |
| **Smart Contracts** | Soroban (Rust), Stellar | Blockchain logic |
| **Wallet Integration** | Freighter, Albedo, xBull | Stellar wallet connections |
| **Backend API** | Next.js API Routes | Server-side endpoints |
| **Database** | PostgreSQL | Relational data storage |
| **Cache** | Redis | Performance caching |
| **Decentralized Storage** | IPFS (Pinata) | Photo and document storage |
| **Payment Processing** | Stripe | Fiat payment gateway |
| **Email** | SendGrid/SES | Transactional emails |
| **Monitoring** | Sentry, CloudWatch | Error tracking and metrics |
| **CI/CD** | GitHub Actions | Automated testing and deployment |

## Key Design Patterns

1. **Escrow Pattern**: Funds held in smart contracts until verification
2. **NFT Pattern**: Unique tree IDs as non-fungible tokens
3. **Zero-Knowledge Proofs**: Privacy-preserving verification
4. **Webhook Pattern**: Event-driven notifications
5. **Repository Pattern**: Data access abstraction
6. **Service Layer Pattern**: Business logic separation
7. **Component Pattern**: Atomic design for UI components

## Data Flow Summary

1. **User initiates donation** → Frontend validates → Smart contract escrows funds
2. **Planter accepts job** → Smart contract records assignment → Database updates
3. **Planter uploads proof** → IPFS stores data → Smart contract verifies → Payment released
4. **Dashboard updates** → Webhook triggers → Database sync → Frontend refresh
5. **Carbon calculation** → Species data lookup → CO₂ estimation → Impact metrics stored
