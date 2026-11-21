# Upgrade Timelock

`upgrade-timelock` provides a reusable Soroban controller for contract upgrades. It separates upgrade approval from activation and enforces a **minimum 48-hour delay** between the two operations.

## Lifecycle

An administrator calls `approve_upgrade(target, wasm_hash)`. The controller stores the target contract, the already-installed Wasm hash, the approval timestamp, and the earliest activation timestamp. While an upgrade is pending, another upgrade cannot be approved; the administrator must cancel the pending record first.

After the delay has elapsed, any account may call `activate_upgrade()`. The controller invokes the target contract's conventional `upgrade(BytesN<32>)` entry point. If that call fails, the transaction reverts and the pending record remains available. On success, the controller removes the pending record and emits an activation event.

The administrator may call `cancel_upgrade()` before activation. The minimum delay may be increased, but never reduced below 48 hours.

## Target contract integration

Soroban contracts update their own executable through `Env::deployer()`. A target contract must expose an `upgrade(BytesN<32>)` entry point and authorize the timelock controller as its upgrade operator. The target remains responsible for checking that the caller is the configured controller and for calling `update_current_contract_wasm`:

```rust
pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
    let controller: Address = env
        .storage()
        .instance()
        .get(&DataKey::UpgradeController)
        .expect("upgrade controller not initialized");
    controller.require_auth();
    env.deployer().update_current_contract_wasm(new_wasm_hash);
}
```

The new Wasm executable must be uploaded before `approve_upgrade` is called. This controller deliberately does not accept an arbitrary activation timestamp: the delay is measured from on-chain approval time and cannot be shortened by an administrator.

## Verification

Run the focused test suite from the repository root:

```bash
cargo test --manifest-path contracts/upgrade-timelock/Cargo.toml
```

The tests cover initialization, the 48-hour schedule, early-activation rejection, permissionless activation, cancellation, duplicate-approval rejection, and delay configuration.
