# Carbon DEX constant-product AMM

Carbon DEX supports ordered token pairs with a constant-product invariant. An administrator creates a pair with `create_pair(token_a, token_b, fee_bps)`. Pair order is fixed; callers use the same order for `add_liquidity`, `quote_swap`, `swap`, and `remove_liquidity`.

Liquidity providers call `add_liquidity` with both assets. The first deposit mints `floor(sqrt(amount_a * amount_b)) - 1,000` shares and permanently locks 1,000 pool shares. Later deposits mint the minimum of the two proportional contributions, preventing one-sided reserve dilution. `remove_liquidity` burns provider shares and returns each reserve pro rata.

For a swap, the fee is deducted from the input before pricing. With input reserve `x`, output reserve `y`, input amount `a`, and fee `f` basis points, the output is:

```text
fee = floor(a * f / 10,000)
a_after_fee = a - fee
output = floor(y * a_after_fee / (x + a_after_fee))
```

The contract rejects zero or negative amounts, missing or empty reserves, output amounts that round to zero, slippage below `min_amount_out`, and arithmetic overflow. Every state-changing user operation requires the caller's authorization. Pair and LP-position storage receives a persistent TTL extension on writes.

The implementation exposes `get_pair`, `get_pair_position`, and `quote_swap` for read-only integrations. Swap events include the ordered token addresses, input amount, and output amount.

## Flash Loan Protection Guard

Carbon DEX includes an integrated Flash Loan Protection Guard to protect downstream lending markets, collateral valuation contracts, and integrators against intra-block price manipulation attacks.

### Vulnerability Context
In constant-product AMMs, flash loan attackers can borrow large liquidity within a transaction, execute an oversized swap to artificially skew spot reserves, exploit a downstream protocol that reads the skewed spot price, and then swap back within the same ledger sequence.

### Guard Architecture
1. **Block-Start Reserve Snapshots**:
   - Every pair tracks `block_start_reserve_a` and `block_start_reserve_b`.
   - On the first swap in a new ledger sequence (`current_ledger > last_swap_ledger`), the contract snapshots the closing reserves of the previous block as the immutable block-start baseline.
   - Subsequent swaps within the *same* ledger sequence keep the initial block-start snapshot intact, recording `total_swaps_in_block`.

2. **Divergence Thresholds & Strict Mode**:
   - `FlashLoanGuardConfig` specifies `max_divergence_bps` (default: 500 bps / 5%) and `cooldown_ledgers` (default: 1).
   - If an intra-block swap moves the spot price ratio beyond `max_divergence_bps` relative to the block-start snapshot, guarded pricing queries reject execution with `Error::FlashLoanManipulationDetected` (24).
   - In `strict_mode`, guarded queries strictly reject any intra-block price reads where a swap already took place (`Error::SameBlockManipulationRejected` - 26).

3. **Time-Weighted Average Price (TWAP) Integration**:
   - The contract continuously tracks `cumulative_price_a` and `cumulative_price_b` scaled by `PRICE_PRECISION` (1e12), weighted by elapsed time between blocks.
   - Integrators can query `get_twap_price(token_a, token_b)` or `quote_swap_twap(token_a, token_b, amount_in)` to obtain price quotes priced against unmanipulated block snapshots.

4. **Guarded Query Endpoints**:
   - `quote_swap_guarded(env, token_a, token_b, amount_in)`: Evaluates swap quotes while strictly validating against same-block divergence and cooldown limits.
   - `quote_swap_twap(env, token_a, token_b, amount_in)`: Provides swap quotes using the protected block-start reserves.
   - `get_safe_price(env, token_a, token_b) -> (i128, i128)`: Returns pre-swap snapshot reserves if an intra-block swap has taken place, preventing price manipulation.
   - `get_twap_price(env, token_a, token_b) -> (i128, i128)`: Returns cumulative time-weighted prices.
   - `configure_flash_loan_guard(env, token_a, token_b, config)`: Admin-only configuration endpoint with parameter validation and event publishing.
   - `get_flash_loan_guard_config` / `get_flash_loan_guard_state` / `is_flash_loan_guarded`: Read-only introspection of guard status.

## Security review notes

Before production deployment, reviewers should verify that every swap, liquidity add, and liquidity removal is authorized by the relevant account, that zero amounts and reserve underflow are rejected, and that minimum-output or maximum-input bounds are enforced before token transfers. The fee remains in pool reserves, so invariant checks should be performed using the post-fee reserves and integer arithmetic without unchecked overflow. Pricing queries for external protocols should consistently utilize `quote_swap_guarded`, `quote_swap_twap`, or `get_safe_price` to prevent flash loan exploits.
