import test from 'node:test';
import assert from 'node:assert';
import { Horizon, Account } from '@stellar/stellar-sdk';
import { POST } from '../../../app/api/nft/mint/route.js';

// Setup environment and mocks
process.env.NFT_MINTING_CONTRACT_TESTNET =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
process.env.NEXT_PUBLIC_TREE_DISTRIBUTOR =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

Horizon.Server.prototype.loadAccount = async function (address) {
  return new Account(address, '1');
};

test('POST /api/nft/mint - success path', async () => {
  const body = {
    donationId: 'donation-123',
    txHash: 'a'.repeat(64),
    projectId: 'project-456',
    amount: 100,
    date: '2026-06-28T12:00:00Z',
    recipientAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    network: 'testnet',
  };

  const req = new Request('http://localhost:3000/api/nft/mint', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200);

  const json = await res.json();
  assert.ok(json.transactionXdr);
  assert.ok(json.tokenId);
  assert.ok(json.metadataUri.includes(json.tokenId));
});

test('POST /api/nft/mint - missing fields validation', async () => {
  const body = {
    donationId: 'donation-123',
    // txHash missing
  };

  const req = new Request('http://localhost:3000/api/nft/mint', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 400);

  const json = await res.json();
  assert.match(json.error, /Missing required fields/);
});

test('POST /api/nft/mint - invalid recipient address', async () => {
  const body = {
    donationId: 'donation-123',
    txHash: 'a'.repeat(64),
    projectId: 'project-456',
    amount: 100,
    date: '2026-06-28T12:00:00Z',
    recipientAddress: 'invalid-address',
    network: 'testnet',
  };

  const req = new Request('http://localhost:3000/api/nft/mint', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 400);

  const json = await res.json();
  assert.strictEqual(json.error, 'INVALID_RECIPIENT_ADDRESS');
});

test('POST /api/nft/mint - unsupported network', async () => {
  const body = {
    donationId: 'donation-123',
    txHash: 'a'.repeat(64),
    projectId: 'project-456',
    amount: 100,
    date: '2026-06-28T12:00:00Z',
    recipientAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    network: 'invalid-network',
  };

  const req = new Request('http://localhost:3000/api/nft/mint', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 400);

  const json = await res.json();
  assert.strictEqual(json.error, 'UNSUPPORTED_NETWORK');
});
