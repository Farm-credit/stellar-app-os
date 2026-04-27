# Testing Guide - Privacy-Preserving Donations

## 🧪 Testing Strategy

This guide covers testing the privacy-preserving donation system at multiple levels.

## Manual Testing

### Test Suite 1: UI/UX Flow

#### Test 1.1: Anonymous Toggle
**Objective**: Verify the anonymous donation toggle works correctly

**Steps**:
1. Navigate to `/donate`
2. Select amount ($25)
3. Click "Continue"
4. Locate "Privacy-Preserving Donation" toggle
5. Click toggle to enable
6. Verify purple border appears
7. Verify "PRIVATE" badge shows
8. Click info icon (ℹ️)
9. Verify information panel expands
10. Click toggle to disable
11. Verify returns to normal state

**Expected Results**:
- ✅ Toggle switches smoothly
- ✅ Visual feedback is immediate
- ✅ Information panel is clear and helpful
- ✅ Accessibility: Can toggle with keyboard (Tab + Space)

#### Test 1.2: Proof Generation UI
**Objective**: Verify proof generation displays correctly

**Steps**:
1. Enable anonymous mode
2. Click "Continue to Payment"
3. Connect Stellar wallet (Freighter)
4. Observe proof generation UI

**Expected Results**:
- ✅ Progress bar animates smoothly
- ✅ Steps show in sequence (Circuit → Witness → Proof)
- ✅ Percentage updates in real-time
- ✅ Success state shows technical details
- ✅ Generation time is displayed

#### Test 1.3: Payment Flow
**Objective**: Complete anonymous donation end-to-end

**Steps**:
1. Enable anonymous mode
2. Connect wallet
3. Wait for proof generation
4. Review cost breakdown
5. Click "Submit Anonymous Donation"
6. Confirm in wallet
7. Wait for confirmation

**Expected Results**:
- ✅ Cost breakdown shows all fees
- ✅ Submit button is enabled after proof
- ✅ Transaction submits successfully
- ✅ Success message displays
- ✅ Transaction hash is shown

### Test Suite 2: Error Handling

#### Test 2.1: No Wallet Connected
**Objective**: Verify graceful handling when wallet not connected

**Steps**:
1. Enable anonymous mode
2. Navigate to payment page
3. Don't connect wallet

**Expected Results**:
- ✅ "Connect Your Wallet" prompt shows
- ✅ Connect button is prominent
- ✅ No errors in console

#### Test 2.2: Proof Generation Failure
**Objective**: Verify error handling for failed proof generation

**Steps**:
1. Enable anonymous mode
2. Connect wallet
3. Simulate error (disconnect wallet during generation)

**Expected Results**:
- ✅ Error message displays clearly
- ✅ "Regenerate Proof" button appears
- ✅ User can retry

#### Test 2.3: Transaction Failure
**Objective**: Verify handling of failed transaction submission

**Steps**:
1. Complete proof generation
2. Disconnect network
3. Try to submit

**Expected Results**:
- ✅ Network error message shows
- ✅ User can retry
- ✅ Proof is preserved (no need to regenerate)

### Test Suite 3: Responsive Design

#### Test 3.1: Mobile View
**Objective**: Verify mobile responsiveness

**Devices to Test**:
- iPhone SE (375px)
- iPhone 12 Pro (390px)
- Samsung Galaxy S21 (360px)
- iPad (768px)

**Steps**:
1. Open on mobile device
2. Navigate through donation flow
3. Enable anonymous mode
4. Test all interactions

**Expected Results**:
- ✅ Layout adapts to screen size
- ✅ Touch targets are adequate (44x44px minimum)
- ✅ Text is readable
- ✅ No horizontal scrolling

#### Test 3.2: Dark Mode
**Objective**: Verify dark mode support

**Steps**:
1. Enable system dark mode
2. Navigate through donation flow
3. Check all components

**Expected Results**:
- ✅ Colors adapt correctly
- ✅ Contrast ratios meet WCAG AA
- ✅ Purple accents remain visible
- ✅ No white flashes

### Test Suite 4: Accessibility

#### Test 4.1: Keyboard Navigation
**Objective**: Verify full keyboard accessibility

**Steps**:
1. Use only keyboard (no mouse)
2. Tab through all interactive elements
3. Use Space/Enter to activate
4. Navigate entire donation flow

**Expected Results**:
- ✅ All elements are reachable
- ✅ Focus indicators are visible
- ✅ Tab order is logical
- ✅ No keyboard traps

#### Test 4.2: Screen Reader
**Objective**: Verify screen reader compatibility

**Tools**: NVDA (Windows), VoiceOver (Mac), TalkBack (Android)

**Steps**:
1. Enable screen reader
2. Navigate donation flow
3. Listen to announcements

**Expected Results**:
- ✅ All content is announced
- ✅ ARIA labels are present
- ✅ Status updates are announced
- ✅ Error messages are clear

## Automated Testing

### Unit Tests

#### Test: ZK Proof Generation

```typescript
// tests/lib/zk/prover.test.ts
import { generateAnonymousDonationProof, verifyAnonymousDonationProof } from '@/lib/zk/prover';

describe('ZK Proof Generation', () => {
  it('should generate valid proof for valid inputs', async () => {
    const result = await generateAnonymousDonationProof(
      'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      25.00
    );

    expect(result.success).toBe(true);
    expect(result.proof).toBeDefined();
    expect(result.proof?.nullifier).toHaveLength(64);
    expect(result.proof?.donationCommitment).toHaveLength(64);
  });

  it('should reject invalid wallet address', async () => {
    const result = await generateAnonymousDonationProof('invalid', 25.00);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid wallet address');
  });

  it('should reject zero amount', async () => {
    const result = await generateAnonymousDonationProof(
      'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      0
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('greater than zero');
  });

  it('should verify valid proof', async () => {
    const result = await generateAnonymousDonationProof(
      'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      25.00
    );

    if (result.proof) {
      const isValid = await verifyAnonymousDonationProof(result.proof);
      expect(isValid).toBe(true);
    }
  });
});
```

#### Test: Cryptographic Functions

```typescript
// tests/lib/zk/crypto.test.ts
import {
  generateNonce,
  generateDonationCommitment,
  generateNullifier,
  generateAmountCommitment,
  prepareCircuitInputs,
} from '@/lib/zk/crypto';

describe('Cryptographic Functions', () => {
  it('should generate unique nonces', () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();

    expect(nonce1).not.toBe(nonce2);
    expect(nonce1).toHaveLength(64); // 32 bytes in hex
  });

  it('should generate consistent commitments', () => {
    const wallet = 'GTEST...';
    const amount = 25.00;
    const nonce = 'abc123';

    const commitment1 = generateDonationCommitment(wallet, amount, nonce);
    const commitment2 = generateDonationCommitment(wallet, amount, nonce);

    expect(commitment1).toBe(commitment2);
  });

  it('should generate different commitments for different inputs', () => {
    const nonce = 'abc123';

    const commitment1 = generateDonationCommitment('WALLET1', 25, nonce);
    const commitment2 = generateDonationCommitment('WALLET2', 25, nonce);

    expect(commitment1).not.toBe(commitment2);
  });

  it('should generate unique nullifiers per wallet', () => {
    const nonce = 'abc123';

    const nullifier1 = generateNullifier('WALLET1', nonce);
    const nullifier2 = generateNullifier('WALLET2', nonce);

    expect(nullifier1).not.toBe(nullifier2);
  });

  it('should prepare valid circuit inputs', () => {
    const inputs = prepareCircuitInputs('GTEST...', 25.00, 'abc123');

    expect(inputs.walletAddressField).toBeDefined();
    expect(inputs.amountField).toBe('25000000'); // 25 * 1e6
    expect(inputs.nonceField).toBeDefined();
    expect(inputs.donationCommitment).toHaveLength(64);
    expect(inputs.nullifier).toHaveLength(64);
    expect(inputs.amountCommitment).toHaveLength(64);
  });
});
```

#### Test: Anonymous Transaction Builder

```typescript
// tests/lib/stellar/anonymous-donation.test.ts
import {
  buildAnonymousDonationTransaction,
  estimateAnonymousDonationCost,
} from '@/lib/stellar/anonymous-donation';
import { generateAnonymousDonationProof } from '@/lib/zk/prover';

describe('Anonymous Transaction Builder', () => {
  it('should build valid transaction', async () => {
    const proofResult = await generateAnonymousDonationProof('GTEST...', 25.00);
    
    if (proofResult.proof) {
      const result = await buildAnonymousDonationTransaction(
        25.00,
        proofResult.proof,
        'GRELAYER...',
        'testnet'
      );

      expect(result.transactionXdr).toBeDefined();
      expect(result.networkPassphrase).toContain('Test SDF Network');
      expect(result.nullifier).toBe(proofResult.proof.nullifier);
    }
  });

  it('should estimate costs correctly', () => {
    const estimate = estimateAnonymousDonationCost(25.00);

    expect(estimate.donationAmount).toBe(25.00);
    expect(estimate.relayerFee).toBe(0.50);
    expect(estimate.networkFee).toBeGreaterThan(0);
    expect(estimate.totalCost).toBeGreaterThan(25.00);
  });
});
```

### Integration Tests

#### Test: Complete Donation Flow

```typescript
// tests/integration/anonymous-donation.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DonorInfoStep } from '@/components/organisms/DonorInfoStep/DonorInfoStep';
import { PaymentStep } from '@/components/organisms/PaymentStep/PaymentStep';

describe('Anonymous Donation Flow', () => {
  it('should complete anonymous donation', async () => {
    // Step 1: Enable anonymous mode
    const { container } = render(<DonorInfoStep />);
    
    const toggle = screen.getByRole('switch', { name: /anonymous/i });
    fireEvent.click(toggle);
    
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Step 2: Navigate to payment
    const continueButton = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(continueButton);

    // Step 3: Verify payment page shows anonymous section
    render(<PaymentStep />);
    
    await waitFor(() => {
      expect(screen.getByText(/Privacy-Preserving/i)).toBeInTheDocument();
    });
  });
});
```

### API Tests

#### Test: Submit Anonymous Endpoint

```typescript
// tests/api/submit-anonymous.test.ts
import { POST, GET } from '@/app/api/transaction/submit-anonymous/route';
import { generateAnonymousDonationProof } from '@/lib/zk/prover';

describe('POST /api/transaction/submit-anonymous', () => {
  it('should accept valid proof', async () => {
    const proofResult = await generateAnonymousDonationProof('GTEST...', 25.00);
    
    const request = new Request('http://localhost:3000/api/transaction/submit-anonymous', {
      method: 'POST',
      body: JSON.stringify({
        transactionXdr: 'mock_xdr',
        network: 'testnet',
        proof: proofResult.proof,
        nullifier: proofResult.proof?.nullifier,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should reject invalid proof', async () => {
    const request = new Request('http://localhost:3000/api/transaction/submit-anonymous', {
      method: 'POST',
      body: JSON.stringify({
        transactionXdr: 'mock_xdr',
        network: 'testnet',
        proof: { invalid: 'proof' },
        nullifier: 'abc123',
      }),
    });

    const response = await POST(request);
    
    expect(response.status).toBe(400);
  });
});

describe('GET /api/transaction/submit-anonymous', () => {
  it('should check nullifier status', async () => {
    const request = new Request(
      'http://localhost:3000/api/transaction/submit-anonymous?nullifier=abc123&network=testnet'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('isUsed');
  });
});
```

## Performance Testing

### Load Testing

```typescript
// tests/performance/proof-generation.test.ts
describe('Proof Generation Performance', () => {
  it('should generate proof within acceptable time', async () => {
    const startTime = performance.now();
    
    const result = await generateAnonymousDonationProof('GTEST...', 25.00);
    
    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(1000); // Mock should be < 1 second
  });

  it('should handle concurrent proof generation', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      generateAnonymousDonationProof(`GTEST${i}...`, 25.00)
    );

    const results = await Promise.all(promises);

    results.forEach(result => {
      expect(result.success).toBe(true);
    });
  });
});
```

### Memory Testing

```typescript
// tests/performance/memory.test.ts
describe('Memory Usage', () => {
  it('should not leak memory during proof generation', async () => {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

    // Generate 100 proofs
    for (let i = 0; i < 100; i++) {
      await generateAnonymousDonationProof('GTEST...', 25.00);
    }

    // Force garbage collection (if available)
    if (global.gc) {
      global.gc();
    }

    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable (< 50 MB)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
  });
});
```

## Security Testing

### Test: Nullifier Uniqueness

```typescript
describe('Nullifier Security', () => {
  it('should generate unique nullifiers for same wallet with different nonces', async () => {
    const wallet = 'GTEST...';
    
    const proof1 = await generateAnonymousDonationProof(wallet, 25.00);
    const proof2 = await generateAnonymousDonationProof(wallet, 25.00);

    expect(proof1.proof?.nullifier).not.toBe(proof2.proof?.nullifier);
  });

  it('should generate same nullifier for same inputs', () => {
    const wallet = 'GTEST...';
    const nonce = 'abc123';

    const nullifier1 = generateNullifier(wallet, nonce);
    const nullifier2 = generateNullifier(wallet, nonce);

    expect(nullifier1).toBe(nullifier2);
  });
});
```

### Test: Commitment Binding

```typescript
describe('Commitment Security', () => {
  it('should bind commitment to specific wallet and amount', () => {
    const nonce = 'abc123';

    const commitment1 = generateDonationCommitment('WALLET1', 25, nonce);
    const commitment2 = generateDonationCommitment('WALLET1', 50, nonce);
    const commitment3 = generateDonationCommitment('WALLET2', 25, nonce);

    // Different amounts should produce different commitments
    expect(commitment1).not.toBe(commitment2);
    
    // Different wallets should produce different commitments
    expect(commitment1).not.toBe(commitment3);
  });
});
```

## Browser Compatibility Testing

### Browsers to Test

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile Safari (iOS 14+)
- ✅ Chrome Mobile (Android 10+)

### Features to Verify

- WebAssembly support
- Crypto API availability
- Local storage
- Service workers (if used)

## Test Coverage Goals

```
┌─────────────────────────────────────────┐
│         TARGET COVERAGE                  │
├─────────────────────────────────────────┤
│ Unit Tests:        > 80%                │
│ Integration Tests: > 70%                │
│ E2E Tests:         > 60%                │
│                                         │
│ Critical Paths:    100%                 │
│ - Proof generation                      │
│ - Transaction building                  │
│ - API endpoints                         │
└─────────────────────────────────────────┘
```

## Running Tests

### Setup

```bash
# Install test dependencies
npm install --save-dev @testing-library/react @testing-library/jest-dom jest

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- proof-generation.test.ts

# Run in watch mode
npm test -- --watch
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test -- --coverage
      - run: npm run lint
```

## Test Checklist

Before deploying to production:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing completed
- [ ] Accessibility audit passed
- [ ] Performance benchmarks met
- [ ] Security review completed
- [ ] Browser compatibility verified
- [ ] Mobile testing completed
- [ ] Dark mode tested
- [ ] Error scenarios handled
- [ ] Documentation updated
- [ ] Code coverage > 80%

---

**Happy Testing! 🧪**
