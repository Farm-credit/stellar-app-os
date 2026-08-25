# Full Flow Integration Testing Guide

This document explains how to test the complete tree planting and carbon credit flow from sponsor deposit to carbon credit issuance.

## Overview

The full flow integration test covers:

1. **Sponsor deposits funds** → Escrow contract receives payment
2. **Planter accepts** → Implicit (farmer address specified in deposit)  
3. **Planter uploads proof** → Admin verifies planting progress (5 updates)
4. **Verifier approves** → Oracle reports survival rate, admin verifies survival
5. **Payment released** → Funds distributed to planter based on milestones
6. **Carbon credits issued** → TREE tokens minted representing CO2 offset

## Test Scenarios

### 1. Single Donor Flow
- Sponsor deposits funds for specific planter
- Complete progress verification (5 updates = 50% release)
- Survival verification after 6+ months (40% release)
- Year milestone (remaining 10% release)
- TREE tokens minted to sponsor/recipient

### 2. Gift Sponsorship Flow
- Sponsor pays but TREE tokens go to gift recipient
- Same milestone structure as single donor
- Carbon credits attributed to gift recipient

### 3. Batch Deposit Flow  
- Multiple planters in single transaction
- Each gets individual escrow record
- Independent milestone progression

### 4. Carbon Credit Burning
- Corporate buyers burn TREE tokens for ESG claims
- Permanent destruction with audit trail
- On-chain ESG reporting records

## Quick Start

### Option 1: Automated Script (Recommended)

```bash
# Deploy contracts and run all tests
./scripts/deploy-and-test.sh

# Deploy only (skip tests)
./scripts/deploy-and-test.sh --deploy-only

# Tests only (assumes contracts deployed)
./scripts/deploy-and-test.sh --skip-deploy

# Deploy without tests
./scripts/deploy-and-test.sh --no-tests
```

### Option 2: Manual Testing

#### Prerequisites

```bash
# Install Stellar CLI
curl -sSL https://github.com/stellar/stellar-cli/releases/latest/download/install.sh | sh

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown
```

#### 1. Build Contracts

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
cd ..
```

#### 2. Deploy to Testnet

```bash
# Setup identity
stellar keys generate testnet-deployer --network testnet
stellar keys fund testnet-deployer --network testnet

# Deploy contracts
stellar contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/tree_escrow.wasm \
  --source testnet-deployer \
  --network testnet

# Repeat for other contracts...
```

#### 3. Initialize Contracts

```bash
# Initialize tree-escrow
stellar contract invoke \
  --id <TREE_ESCROW_CONTRACT_ID> \
  --source testnet-deployer \
  --network testnet \
  -- initialize \
  --admin <ADMIN_ADDRESS> \
  --tree_token <TREE_TOKEN_ADDRESS> \
  --oracle <ORACLE_ADDRESS> \
  --survival_threshold_percent 80 \
  --min_density 1000 \
  --job_size_threshold 10
```

#### 4. Run Tests

```bash
# Run Rust unit tests
cd contracts
cargo test --release

# Run integration tests  
cd tree-escrow
cargo test --release full_flow
cd ../..

# Run JavaScript integration tests (optional)
node scripts/test-full-flow.mjs
```

## Test Structure

### Rust Integration Tests (`contracts/full-flow-test.rs`)

Comprehensive test suite covering:

- **`test_full_flow_single_donor()`** - Complete single donor path
- **`test_full_flow_gift_sponsorship()`** - Gift sponsorship with recipient
- **`test_full_flow_batch_deposit()`** - Batch deposit scenarios  
- **`test_carbon_credit_burning()`** - ESG carbon credit burning

### JavaScript Integration Tests (`scripts/test-full-flow.mjs`)

End-to-end testing with actual Soroban sandbox:

- Contract deployment automation
- Real network interaction simulation  
- Balance and state verification
- Event emission testing

## Flow Verification Points

### 1. Escrow Deposit ✅
- [ ] Funds transferred from sponsor to contract
- [ ] Escrow record created with correct details
- [ ] Status set to `Funded`

### 2. Progress Updates (5x) ✅
- [ ] Each update releases 10% of funds to planter
- [ ] First update mints TREE tokens
- [ ] Status transitions to `Planted` 
- [ ] Progress counter increments

### 3. Survival Verification ✅
- [ ] Oracle survival report submitted
- [ ] 6+ months elapsed since planting
- [ ] Survival rate ≥ threshold (80%)
- [ ] Remaining funds (40%) released
- [ ] Status transitions to `Survived`

### 4. Year Milestone ✅ 
- [ ] 1+ year elapsed since planting
- [ ] Final 10% released
- [ ] Status transitions to `Completed`

### 5. Carbon Credits ✅
- [ ] TREE tokens minted (1 token = 1 tree = 48kg CO2)
- [ ] Tokens sent to correct recipient (sponsor or gift)
- [ ] Burn functionality available for ESG claims

## Key Assertions

### Balance Checks
```rust
// Sponsor paid correct amount
assert_eq!(initial_balance - final_balance, ESCROW_AMOUNT);

// Planter received milestone payments  
assert_eq!(planter_received, expected_milestone_total);

// TREE tokens minted correctly
assert_eq!(tree_balance, TREE_COUNT * 10^6); // 6 decimals
```

### State Verification
```rust
// Escrow progression
assert_eq!(record.status, EscrowStatus::Survived);
assert_eq!(record.progress_updates, 5);
assert_eq!(record.verified_tree_count, TREE_COUNT);

// Oracle data
assert_eq!(oracle_report.survival_rate_percent, 85);
```

### Event Verification
```rust
// Key events emitted
env.events().assert_published((symbol_short!("deposit"), farmer), amount);
env.events().assert_published((symbol_short!("treemint"), recipient), tokens);
env.events().assert_published((symbol_short!("survived"), farmer), payment);
```

## Error Scenarios Tested

### Invalid Inputs
- Zero or negative amounts
- Invalid survival rates (>100%)
- Unauthorized callers

### Timing Constraints  
- Survival verification before 6 months
- Progress updates after completion
- Double processing attempts

### State Transitions
- Refunds after planting started
- Verification out of sequence
- Duplicate operations

## Troubleshooting

### Common Issues

**Contract deployment fails:**
```bash
# Check network connection and identity
stellar keys show testnet-deployer
stellar keys fund testnet-deployer --network testnet
```

**Test failures:**
```bash
# Run with verbose output
cargo test --release -- --nocapture

# Run specific test
cargo test --release test_full_flow_single_donor
```

**Balance mismatches:**
```bash
# Check account funding
stellar keys address testnet-deployer | xargs -I {} curl "https://horizon-testnet.stellar.org/accounts/{}"
```

### Debug Output

Tests include detailed logging:

```
🧪 Testing Full Flow: Single Donor Path

1️⃣ Sponsor deposits funds into escrow...
  ✅ Escrow deposit successful

2️⃣ Planter accepts the job (implicit)...
  ✅ Planter address: GDXJ...

3️⃣ Admin verifies planting progress (5 updates)...
  📊 Progress update 1/5...
  📊 Progress update 2/5...
  ...
  ✅ TREE tokens minted: 5000000 TREE

4️⃣ Simulating 6+ months time passage...
5️⃣ Oracle submits survival report...
  ✅ Oracle report submitted: 85% survival

6️⃣ Admin verifies survival...
  ✅ Survival payment released: 4000000 stroops

7️⃣ Running final assertions...
  🌍 Total CO2 offset: 240 kg

🎉 Full flow test completed successfully!
```

## Integration with CI/CD

### GitHub Actions

```yaml
name: Full Flow Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown
      - name: Install Stellar CLI
        run: curl -sSL https://github.com/stellar/stellar-cli/releases/latest/download/install.sh | sh
      - name: Run tests
        run: ./scripts/deploy-and-test.sh --no-deploy
```

### Local Development

```bash
# Quick test during development
cargo test --release --workspace

# Full integration test
./scripts/deploy-and-test.sh

# Continuous testing
cargo watch -x "test --release"
```

## Expected Outcomes

After successful completion:

- **Escrow records** show `Completed` status
- **Planter balances** reflect milestone payments
- **TREE tokens** minted to correct recipients  
- **CO2 impact** calculated (trees × 48kg)
- **Burn records** available for ESG claims

## Contributing

When adding new test scenarios:

1. Follow the established test structure
2. Include comprehensive assertions  
3. Add debug logging for troubleshooting
4. Update this README with new scenarios
5. Ensure tests pass in CI/CD

## Support

For issues with the testing framework:

1. Check the troubleshooting section
2. Review contract documentation
3. Examine test output logs
4. Open an issue with reproduction steps