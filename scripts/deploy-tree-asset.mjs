/**
 * Deploy TREE custom asset on Stellar testnet.
 *
 * 1 TREE = 1 verified tree planted = ~48 kg CO2 offset over its lifetime
 *
 * Steps:
 *   1. Generate issuer + distributor keypairs
 *   2. Fund both from Friendbot
 *   3. Distributor opens a trustline for TREE
 *   4. Issuer sends max supply to distributor (escrow contract will mint via SAC)
 *   5. Lock issuer account (set master weight to 0) — no further issuance without multisig
 *
 * Run: node scripts/deploy-tree-asset.mjs
 */

import { Keypair, Asset, TransactionBuilder, Operation, Networks, Horizon, BASE_FEE } from '@stellar/stellar-sdk';

const HORIZON = 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const server = new Horizon.Server(HORIZON);

/** CO2 offset per tree in kg — derived from CO2_PER_DOLLAR * 1000 (0.048 t = 48 kg) */
const CO2_KG_PER_TREE = 48;

/** Total supply minted to distributor. Escrow contract mints on-demand via SAC. */
const TOTAL_SUPPLY = '1000000000'; // 1 billion TREE

async function friendbot(publicKey) {
  const res = await fetch(`${FRIENDBOT}?addr=${publicKey}`);
  if (!res.ok) throw new Error(`Friendbot failed for ${publicKey}: ${res.statusText}`);
}

async function deploy() {
  const issuer      = Keypair.random();
  const distributor = Keypair.random();

  console.log('\n── Keypairs ──────────────────────────────────────────');
  console.log(`Issuer      public : ${issuer.publicKey()}`);
  console.log(`Issuer      secret : ${issuer.secret()}`);
  console.log(`Distributor public : ${distributor.publicKey()}`);
  console.log(`Distributor secret : ${distributor.secret()}`);

  // Fund both accounts
  console.log('\n── Funding via Friendbot ─────────────────────────────');
  await Promise.all([friendbot(issuer.publicKey()), friendbot(distributor.publicKey())]);
  console.log('Both accounts funded.');

  const tree = new Asset('TREE', issuer.publicKey());

  // ── Tx 1: Distributor opens trustline ─────────────────────────────────────
  const distAccount = await server.loadAccount(distributor.publicKey());
  const tx1 = new TransactionBuilder(distAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: tree }))
    .setTimeout(30)
    .build();
  tx1.sign(distributor);
  await server.submitTransaction(tx1);
  console.log('\n── Tx 1: Trustline opened by distributor ─────────────');

  // ── Tx 2: Issuer sends total supply to distributor ────────────────────────
  const issuerAccount = await server.loadAccount(issuer.publicKey());
  const tx2 = new TransactionBuilder(issuerAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.payment({
      destination: distributor.publicKey(),
      asset: tree,
      amount: TOTAL_SUPPLY,
    }))
    .setTimeout(30)
    .build();
  tx2.sign(issuer);
  const res2 = await server.submitTransaction(tx2);
  console.log(`Tx 2 hash: ${res2.hash}`);
  console.log(`${TOTAL_SUPPLY} TREE minted to distributor.`);

  // ── Tx 3: Lock issuer (set master weight = 0) ─────────────────────────────
  const issuerAccount2 = await server.loadAccount(issuer.publicKey());
  const tx3 = new TransactionBuilder(issuerAccount2, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.setOptions({ masterWeight: 0 }))
    .setTimeout(30)
    .build();
  tx3.sign(issuer);
  const res3 = await server.submitTransaction(tx3);
  console.log(`Tx 3 hash: ${res3.hash}`);
  console.log('Issuer locked (master weight = 0). No further issuance possible.');

  // ── Output asset config ───────────────────────────────────────────────────
  const config = {
    asset: 'TREE',
    network: 'testnet',
    issuer: issuer.publicKey(),
    distributor: distributor.publicKey(),
    co2KgPerTree: CO2_KG_PER_TREE,
    totalSupply: TOTAL_SUPPLY,
    horizonUrl: HORIZON,
    stellarExpert: `https://stellar.expert/explorer/testnet/asset/TREE-${issuer.publicKey()}`,
  };

  console.log('\n── Asset Config (copy to lib/stellar/tree-asset.ts) ──');
  console.log(JSON.stringify(config, null, 2));

  return config;
}

deploy().catch((err) => {
  console.error(err?.response?.data ?? err);
  process.exit(1);
});
