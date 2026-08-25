# Platform Governance Contract

On-chain governance for platform parameters. Token holders can propose and vote on:
- Platform fee percentage
- Minimum planting bond
- Verifier whitelist
- Species selection (with quadratic voting)

## Overview

The Platform Governance contract allows staked token holders to propose and vote on changes to critical platform parameters. Voting power is proportional to staked tokens for most proposal types. Proposals require a quorum (default 10% of total staked tokens) and a simple majority to pass. A 48-hour timelock applies after voting closes before execution.

### Quadratic Voting for Species Selection

For species selection proposals, the contract implements **quadratic voting**. This means voting power is calculated as the square root of token holdings rather than being directly proportional. This prevents large token holders from dominating species selection decisions and promotes more democratic outcomes.

**Example:**
- A holder with 10,000 tokens has voting power = sqrt(10,000) = 100
- A holder with 100 tokens has voting power = sqrt(100) = 10
- The ratio of voting power is 10:1 instead of 100:1

## Features

- **Proposal Creation**: Token holders can create proposals with description hash and voting options
- **Token-Based Voting**: Voting power is proportional to staked tokens (except for species selection)
- **Quadratic Voting**: Species selection uses sqrt(token holdings) for voting power
- **Quorum Requirement**: Proposals require 10% of total staked tokens to be valid
- **Timelock**: 48-hour delay after vote closes before execution
- **Multi-Option Voting**: Support for multiple voting options per proposal
- **Proposal Types**: PlatformFee, MinPlantingBond, VerifierWhitelist, SpeciesSelection
- **Emergency Overrides**: Admin functions for direct parameter changes

## Contract Functions

### Initialization

```rust
initialize(
    admin: Address,
    staking_contract: Address,
    admin_controls: Address,
    platform_fee: u64,
    min_planting_bond: i128
)
```

- `admin`: Admin address for contract management
- `staking_contract`: Verifier-staking contract for voting power calculation
- `admin_controls`: Admin-controls contract for parameter updates
- `platform_fee`: Initial platform fee percentage (default 5%)
- `min_planting_bond`: Initial minimum planting bond (default 1M tokens)

### Proposal Functions

#### `create_proposal`

Create a new governance proposal.

```rust
create_proposal(
    description_hash: String,
    proposal_type: ProposalType,
    options: Vec<VoteOption>,
    voting_period: u64,
    proposer: Address
)
```

- `description_hash`: Hash of proposal description (off-chain details)
- `proposal_type`: Type of proposal (PlatformFee, MinPlantingBond, VerifierWhitelist)
- `options`: Voting options for the proposal
- `voting_period`: Voting window in seconds
- `proposer`: Address creating the proposal

#### `vote`

Vote on a proposal.

```rust
vote(
    proposal_id: u64,
    option_id: u32,
    voter: Address
)
```

- `proposal_id`: Proposal to vote on
- `option_id`: Option to vote for
- `voter`: Address voting

#### `execute`

Execute a passed proposal to update platform parameters.

```rust
execute(
    proposal_id: u64
)
```

- `proposal_id`: Proposal to execute

### Query Functions

- `get_proposal(proposal_id)`: Retrieve a proposal by ID
- `get_vote(proposal_id, voter)`: Retrieve a vote record
- `proposal_count()`: Total number of proposals
- `platform_fee()`: Current platform fee percentage
- `min_planting_bond()`: Current minimum planting bond
- `verifier_whitelist()`: Current verifier whitelist
- `quorum_percentage()`: Current quorum requirement
- `timelock_seconds()`: Current timelock period

### Admin Functions

- `update_quorum_percentage(new_percentage)`: Update the quorum requirement
- `update_timelock(new_timelock)`: Update the timelock period
- `set_platform_fee(new_fee)`: Directly set platform fee (emergency override)
- `set_min_planting_bond(new_bond)`: Directly set minimum planting bond (emergency override)
- `add_verifier_to_whitelist(verifier)`: Add verifier to whitelist (emergency override)
- `remove_verifier_from_whitelist(verifier)`: Remove verifier from whitelist (emergency override)

## Storage Layout

### Instance Storage
- `ADMIN`: Admin address
- `STAKING`: Staking contract address
- `ADM_CTRL`: Admin-controls contract address
- `PROP_CNT`: Total proposals created
- `QUORUM_P`: Quorum requirement (default 10%)
- `TIMELOCK`: Timelock period in seconds (default 172800 = 48h)
- `PLAT_FEE`: Current platform fee percentage
- `MIN_BND`: Current minimum planting bond
- `PAUSED`: Pause flag

### Persistent Storage
- `proposal:<id>`: ProposalRecord (keyed by proposal ID)
- `vote:<id>:<addr>`: VoteRecord (keyed by proposal ID + voter address)
- `VER_WL`: Verifier whitelist (Vec<Address>)

## Proposal Lifecycle

1. **Active**: Proposal is created and open for voting
2. **Passed**: Proposal meets quorum and majority support
3. **Rejected**: Proposal fails to meet quorum or majority
4. **Executed**: Proposal has been executed to update parameters
5. **Expired**: Proposal voting period ended without passing

## Quorum and Voting

- **Quorum**: 10% of total staked tokens must vote for proposal to be valid
- **Majority**: Winning option must have >50% of votes cast
- **Voting Power**: 
  - PlatformFee, MinPlantingBond, VerifierWhitelist: Proportional to staked token amount
  - SpeciesSelection: Quadratic voting = sqrt(staked token amount)
- **Timelock**: 48 hours after vote closes before execution

## Quadratic Voting Implementation

The contract uses an on-chain integer square root algorithm to calculate voting power for species selection proposals:

```rust
fn isqrt(n: i128) -> i128 {
    // Binary search algorithm for integer square root
    // Returns the largest integer x such that x * x <= n
}
```

This ensures that:
- Large token holders have diminishing marginal voting power
- Small token holders have proportionally more influence
- The system is resistant to whale attacks in species selection
- All calculations are performed on-chain without external dependencies

## Testing

Run tests with:

```bash
cargo test --package platform-governance
```

## Deployment

1. Build the contract:

```bash
cargo build --package platform-governance --release
```

2. Deploy to testnet/mainnet using Soroban CLI

3. Initialize with appropriate parameters:

```bash
soroban contract invoke \
  --id <contract_id> \
  --fn initialize \
  --arg <admin> \
  --arg <staking_contract> \
  --arg <admin_controls> \
  --arg 5 \
  --arg 1000000
```

## Integration

The contract integrates with:
- **Verifier Staking**: For voting power calculation
- **Admin Controls**: For parameter updates (optional)
- **TREE Token**: For staked token balance queries

## Proposal Types

### PlatformFee
Proposals to change the platform fee percentage. Options should specify the new fee percentage. Uses normal proportional voting.

### MinPlantingBond
Proposals to change the minimum planting bond amount. Options should specify the new bond amount. Uses normal proportional voting.

### VerifierWhitelist
Proposals to add or remove verifiers from the whitelist. Options should specify the verifier addresses. Uses normal proportional voting.

### SpeciesSelection
Proposals to select tree species for planting campaigns. Options should specify different species options. **Uses quadratic voting** where voting power = sqrt(token holdings). This prevents large token holders from dominating species selection decisions.

## Security Considerations

- **Quorum Requirement**: Prevents small groups from passing proposals
- **Timelock**: Provides time for review before execution
- **Admin Overrides**: Emergency functions for critical situations
- **Pause Capability**: Contract can be paused in emergencies
