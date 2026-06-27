# Species Voting Contract

On-chain governance for adding new tree species to the species catalogue.

## Overview

The Species Voting contract allows TREE token holders to propose and vote for new tree species to be added to the species catalogue. Voting power is proportional to TREE token holdings.

## Features

- **Proposal Creation**: Token holders can propose new species with CO₂ sequestration data
- **Token-Based Voting**: Voting power is proportional to TREE token holdings
- **Threshold-Based Approval**: Proposals require a minimum threshold of votes to pass
- **Time-Limited Voting**: Proposals have a configurable voting window (default 7 days)
- **Execution**: Passed proposals can be executed to register species in the species-registry

## Contract Functions

### Initialization

```rust
initialize(
    admin: Address,
    tree_token: Address,
    species_registry: Address,
    voting_threshold: i128,
    voting_period: u64
)
```

- `admin`: Admin address for contract management
- `tree_token`: TREE token contract address
- `species_registry`: Species registry contract address
- `voting_threshold`: Minimum votes required (in token base units)
- `voting_period`: Voting window in seconds (default 604800 = 7 days)

### Proposal Functions

#### `propose_species`

Create a new species proposal.

```rust
propose_species(
    slug: Symbol,
    name: String,
    co2_scaled: i128,
    maturity_years: u32
)
```

- `slug`: Short identifier (e.g., "mahogany")
- `name`: Human-readable name
- `co2_scaled`: kg CO₂/year × 100
- `maturity_years`: Years to biomass maturity

#### `vote`

Vote on a proposal.

```rust
vote(
    proposal_id: u64,
    vote_for: bool
)
```

- `proposal_id`: Proposal to vote on
- `vote_for`: true to vote for, false to vote against

#### `execute_proposal`

Execute a passed proposal to register the species.

```rust
execute_proposal(
    proposal_id: u64
)
```

### Query Functions

- `get_proposal(proposal_id)`: Retrieve a proposal by ID
- `get_vote(proposal_id, voter)`: Retrieve a vote record
- `proposal_count()`: Total number of proposals
- `voting_threshold()`: Current voting threshold
- `voting_period()`: Current voting period in seconds

### Admin Functions

- `update_voting_threshold(new_threshold)`: Update the voting threshold
- `update_voting_period(new_period)`: Update the voting period

## Storage Layout

### Instance Storage
- `ADMIN`: Admin address
- `TREE_TOKEN`: TREE token contract address
- `SPECIES_REGISTRY`: Species registry contract address
- `PROPOSAL_COUNT`: Total proposals created
- `VOTING_THRESHOLD`: Minimum votes required
- `VOTING_PERIOD`: Voting window in seconds

### Persistent Storage
- `proposal:<id>`: ProposalRecord (keyed by proposal ID)
- `vote:<id>:<addr>`: VoteRecord (keyed by proposal ID + voter address)

## Proposal Lifecycle

1. **Active**: Proposal is created and open for voting
2. **Passed**: Proposal meets voting threshold and majority support
3. **Rejected**: Proposal fails to meet threshold or majority
4. **Executed**: Proposal has been executed to register the species

## Testing

Run tests with:

```bash
cargo test --package species-voting
```

## Deployment

1. Build the contract:

```bash
cargo build --package species-voting --release
```

2. Deploy to testnet/mainnet using Soroban CLI

3. Initialize with appropriate parameters:

```bash
soroban contract invoke \
  --id <contract_id> \
  --fn initialize \
  --arg <admin> \
  --arg <tree_token> \
  --arg <species_registry> \
  --arg 1000000 \
  --arg 604800
```

## Integration

The contract integrates with:
- **TREE Token**: For voting power calculation
- **Species Registry**: For executing approved proposals
- **Admin Controls**: For pause/resume functionality (optional)
