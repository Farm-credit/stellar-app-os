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

## Security review notes

Before production deployment, reviewers should verify that every swap, liquidity add, and liquidity removal is authorized by the relevant account, that zero amounts and reserve underflow are rejected, and that minimum-output or maximum-input bounds are enforced before token transfers. The fee remains in pool reserves, so invariant checks should be performed using the post-fee reserves and integer arithmetic without unchecked overflow.
