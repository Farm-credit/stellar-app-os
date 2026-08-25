# Carbon token minting (Stellar testnet)

This small tool issues a transferable Stellar asset representing verified CO2 offsets. By convention here 1 token = 1 kg CO2.

Quick start (testnet):

1. Install dependencies inside the `tools/carbon-token` folder:

```bash
cd tools/carbon-token
npm install
```

2. Mint tokens (example creating a new recipient):

```bash
# Mint 10 tokens to a newly generated recipient (script prints recipient secret)
node mint.js  10

# OR mint 1 token to an existing recipient public key:
node mint.js GDRECIPIENTPUBKEY 1
```

Notes:

- This script uses the Stellar testnet and friendbot for account funding.
- The asset code in the script is `CO2KG`. Each token equals 1 kg CO2.
- For production (mainnet) you must:
  - Use a secure issuer account and keep its secret offline.
  - Publish metadata in your domain's `stellar.toml` under `[[CURRENCIES]]`.
  - Provide verifiable documentation for the offsets (certificate URL). See `stellar_toml_snippet.md`.

Next steps for mainnet deployment:

- Replace friendbot funding with funded accounts.
- Consider a distribution pattern (a separate distribution account) and KYC/controls if required.
