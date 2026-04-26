# Gas Cost Analysis — FarmCredit Smart Contracts

Soroban fees = **base inclusion fee** + **resource fee** (CPU instructions + memory + ledger reads/writes + events).

All estimates are in **stroops** (1 XLM = 10,000,000 stroops) and are approximations based on the Stellar Mainnet fee schedule as of Q2 2025. Actual fees depend on network congestion and ledger state. Always measure with `soroban contract invoke --fee-mode simulate` on testnet before mainnet.

---

## Fee Components

| Component | Unit | Mainnet Rate |
|-----------|------|-------------|
| Base inclusion fee | per tx | 100 stroops |
| CPU instructions | per 10k insns | ~25 stroops |
| Read ledger entries | per entry | ~6,250 stroops |
| Write ledger entries | per entry | ~10,000 stroops |
| Read bytes | per 1 KB | ~250 stroops |
| Write bytes | per 1 KB | ~1,000 stroops |
| Events | per 100 bytes | ~250 stroops |

---

## nullifier-registry

| Operation | Ledger Reads | Ledger Writes | Estimated Fee (stroops) | Estimated Fee (XLM) |
|-----------|-------------|--------------|------------------------|---------------------|
| `initialize` | 1 (instance) | 1 (instance) | ~20,000 | ~0.002 |
| `compute_commitment` | 0 | 0 | ~5,000 | ~0.0005 |
| `register` | 2 (instance + commitment check) | 2 (instance + entry write) | ~45,000 | ~0.0045 |
| `is_registered` | 1 (persistent) | 0 | ~8,000 | ~0.0008 |
| `get_entry` | 1 (persistent) | 0 | ~12,000 | ~0.0012 |
| `pause` / `unpause` | 1 (instance) | 1 (instance) | ~18,000 | ~0.0018 |
| `propose_admin` | 1 (instance) | 1 (instance) | ~18,000 | ~0.0018 |
| `accept_admin` | 1 (instance) | 2 (instance admin + remove pending) | ~25,000 | ~0.0025 |

`register` is the hot path — expect ~0.005 XLM per tree registration at current rates.

---

## escrow-milestone

| Operation | Ledger Reads | Ledger Writes | Estimated Fee (stroops) | Estimated Fee (XLM) |
|-----------|-------------|--------------|------------------------|---------------------|
| `initialize` | 1 | 1 | ~20,000 | ~0.002 |
| `deposit` | 3 (instance + escrow check + token) | 2 (escrow state + token transfer) | ~65,000 | ~0.0065 |
| `verify_milestone` | 3 (instance + escrow + token) | 2 (escrow state + token transfer) | ~70,000 | ~0.007 |
| `release_remainder` | 3 (instance + escrow + token) | 2 (escrow state + token transfer) | ~70,000 | ~0.007 |
| `refund` | 3 (instance + escrow + token) | 2 (escrow state + token transfer) | ~65,000 | ~0.0065 |
| `get_escrow` | 2 (instance + escrow) | 0 | ~14,000 | ~0.0014 |
| `pause` / `unpause` | 1 | 1 | ~18,000 | ~0.0018 |
| `propose_admin` | 1 | 1 | ~18,000 | ~0.0018 |
| `accept_admin` | 1 | 2 | ~25,000 | ~0.0025 |

Full escrow lifecycle cost (deposit + verify_milestone + release_remainder): ~0.021 XLM per farmer.

---

## tree-escrow

| Operation | Ledger Reads | Ledger Writes | Estimated Fee (stroops) | Estimated Fee (XLM) |
|-----------|-------------|--------------|------------------------|---------------------|
| `initialize` | 1 | 1 | ~20,000 | ~0.002 |
| `deposit` | 3 (instance + record check + token) | 2 (record + token transfer) | ~65,000 | ~0.0065 |
| `verify_planting` | 3 (instance + record + token) | 2 (record + token transfer) | ~75,000 | ~0.0075 |
| `verify_survival` | 3 (instance + record + token) | 2 (record + token transfer) | ~75,000 | ~0.0075 |
| `refund` | 3 (instance + record + token) | 2 (record + token transfer) | ~65,000 | ~0.0065 |
| `get_record` | 2 (instance + record) | 0 | ~14,000 | ~0.0014 |
| `pause` / `unpause` | 1 | 1 | ~18,000 | ~0.0018 |
| `propose_admin` | 1 | 1 | ~18,000 | ~0.0018 |
| `accept_admin` | 1 | 2 | ~25,000 | ~0.0025 |

Full tree lifecycle cost (deposit + verify_planting + verify_survival): ~0.022 XLM per tree.

---

## Ledger Entry TTL

Persistent storage entries expire if not extended. For escrow state entries that must survive across the 6-month tree survival period (~15.7M ledger sequences at 5s/ledger):

- Default persistent TTL: ~1 year of ledger sequences
- For tree-escrow, explicitly extend entry TTL after `verify_planting` using `env.storage().persistent().extend_ttl()` if the deployment will run beyond the default TTL window.

**Action required before mainnet**: confirm current testnet TTL defaults are sufficient for the 6-month + buffer period, or add TTL extension calls in `verify_planting`.

---

## Cost at Scale

| Scale | nullifier-registry | escrow-milestone | tree-escrow |
|-------|-------------------|-----------------|-------------|
| 100 farmers | ~0.45 XLM | ~2.1 XLM | ~2.2 XLM |
| 1,000 farmers | ~4.5 XLM | ~21 XLM | ~22 XLM |
| 10,000 farmers | ~45 XLM | ~210 XLM | ~220 XLM |

Admin operations (pause, admin transfer) are infrequent and negligible at any scale.
