# 🌱 Harvesta — Plant Trees. Track Impact. Offset Carbon.

> A decentralised tree-planting platform on Stellar where anyone can pay farmers and individuals to plant trees — anonymously or with full carbon-offset tracking — and planters upload real-world progress with a unique tree ID.

---

## What is Harvesta?

Harvesta connects **tree sponsors** with **on-the-ground planters** (farmers, community groups, individuals) through a transparent, blockchain-backed payment system built on **Stellar** using **Soroban** smart contracts.

You can:

- **Sponsor a tree** — pay a planter to plant and care for a tree on your behalf.
- **Go anonymous** — make a one-time donation with no account required.
- **Track your forest** — create an account, get a unique tree ID for every tree you sponsor, and follow its growth through planter-uploaded photo and GPS updates.
- **Measure your impact** — the platform calculates estimated CO₂ offset per tree species and shows your cumulative carbon footprint reduction.

Planters receive **instant Stellar payments** the moment a tree is verified, with no banks, no delays, and no middlemen.

---

## How It Works

```
Sponsor                   Harvesta Platform              Planter
  │                              │                          │
  │── Choose species, qty ──────>│                          │
  │── Pay in XLM / USDC ────────>│                          │
  │                              │── Escrow in contract ───>│
  │                              │                          │── Plant tree
  │                              │                          │── Upload photo + GPS
  │                              │<── Progress update ──────│
  │<── Carbon dashboard update ──│                          │
  │                              │── Release payment ──────>│
```

1. **Sponsor** selects tree species, quantity, region, and payment method (XLM or USDC).
2. **Smart contract** holds funds in escrow, mints a unique Tree NFT ID.
3. **Planter** receives the job, plants the tree, and uploads timestamped photo + GPS proof.
4. **Contract** releases payment to planter upon verification.
5. **Sponsor dashboard** shows live tree progress, species info, and CO₂ offset estimate.

---

## Features

| Feature                | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| 🌳 Sponsor a Tree      | Pay any planter to plant a tree on your behalf           |
| 👤 Anonymous Donations | One-time payment, no account needed                      |
| 🆔 Unique Tree ID      | Each sponsored tree gets a tamper-proof on-chain ID      |
| 📸 Planter Updates     | Planters upload photo + GPS progress per tree            |
| 📊 Carbon Dashboard    | Track estimated CO₂ offset across your entire portfolio  |
| 💸 Instant Settlement  | Planters paid in XLM/USDC the moment work is verified    |
| 🔒 Escrow Protection   | Funds held in smart contract until planting is confirmed |
| 🗺️ Regional Selection  | Sponsor trees in specific countries or biomes            |

---

## Tech Stack

| Layer           | Technology                                       |
| --------------- | ------------------------------------------------ |
| Smart Contracts | Soroban (Rust), Stellar mainnet/testnet          |
| Frontend        | React + TypeScript + Vite                        |
| Wallet          | Freighter, Albedo, xBull                         |
| Storage         | IPFS (planter photo uploads)                     |
| Off-chain API   | Node.js / Express                                |
| Database        | PostgreSQL                                       |
| Carbon Data     | Open-source CO₂ sequestration tables per species |

---

## Smart Contracts

```
contracts/
├── tree_registry/      # Mint and manage unique Tree IDs (NFT-like)
├── escrow/             # Hold sponsor funds, release on verification
├── planter_registry/   # Register planters, track reputation score
├── carbon_credits/     # Calculate and record CO₂ offset per tree
└── governance/         # DAO voting for platform parameters
```

---

## Getting Started

### Prerequisites

- Rust + `cargo` (stable)
- `stellar-cli` ≥ 21
- Node.js ≥ 18
- A Stellar testnet account funded via [friendbot](https://friendbot.stellar.org)

### Install

```bash
git clone https://github.com/RuhinaCodes/Harvesta.git
cd Harvesta
```

### Build Contracts

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

### Deploy to Testnet

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/tree_registry.wasm \
  --network testnet
```

### Run Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Carbon Offset Methodology

Harvesta uses published biomass growth tables (FAO / IPCC Tier 1) to estimate CO₂ sequestration per tree species per year. Estimates are clearly labelled as projections and updated annually.

Example:

| Species    | Avg CO₂/year (kg) | Maturity |
| ---------- | ----------------- | -------- |
| Teak       | 22 kg             | 20 years |
| Moringa    | 9 kg              | 3 years  |
| Eucalyptus | 31 kg             | 10 years |
| Mangrove   | 14 kg             | 15 years |

---

## For Planters

1. Register your wallet and identity on-chain.
2. Browse open planting jobs in your region.
3. Accept a job — funds are locked in escrow immediately.
4. Plant the tree and upload photo + GPS coordinates using the mobile-friendly uploader.
5. Receive payment to your Stellar wallet instantly upon verification.

---

## Roadmap

- [x] Core escrow contract
- [x] Tree registry (unique ID minting)
- [ ] Planter reputation scoring
- [ ] Mobile planter app (React Native)
- [ ] DAO governance for fee parameters
- [ ] Satellite verification integration (Sentinel-2)
- [ ] Carbon credit marketplace

---

## Contributing

Issues are open and labelled — see the [Issues tab](../../issues). Smart contract work is in `contracts/`, frontend in `frontend/`, backend in `scripts/`.

---

## License

Apache 2.0
