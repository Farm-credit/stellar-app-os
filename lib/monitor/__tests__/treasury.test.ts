const mockLoadAccount = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email/sendgrid', () => ({
  sendTreasuryAlertEmail: vi.fn(),
  sendTreasuryDailySummaryEmail: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: vi.fn().mockImplementation(function () {
      return { loadAccount: mockLoadAccount };
    }),
  },
}));

import { sendTreasuryAlertEmail, sendTreasuryDailySummaryEmail } from '@/lib/email/sendgrid';
import {
  checkAssetBalance,
  checkBalances,
  checkAndAlert,
  sendDailySummary,
} from '@/lib/monitor/treasury';

const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const PLANTING_ADDRESS = 'GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA';
const REPLANTING_ADDRESS = 'GBUQWP3BOUZX34TOND2QV7QQ7K7VJTG6VSE62MFPXXXIAGKZ6YTDCXI';

function makeNativeBalance(amount: string) {
  return { balance: amount, asset_type: 'native' };
}

function makeUsdcBalance(amount: string) {
  return {
    balance: amount,
    asset_type: 'credit_alphanum4',
    asset_code: 'USDC',
    asset_issuer: USDC_ISSUER,
  };
}

function createMockAccount(balances: ReturnType<typeof makeUsdcBalance>[]) {
  return { balances };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_HORIZON_URL = 'https://horizon-testnet.stellar.org';
  process.env.NEXT_PUBLIC_USDC_ISSUER = USDC_ISSUER;
  process.env.NEXT_PUBLIC_PLANTING_ADDRESS = PLANTING_ADDRESS;
  process.env.NEXT_PUBLIC_REPLANTING_BUFFER_ADDRESS = REPLANTING_ADDRESS;
  process.env.TREASURY_USDC_ALERT_THRESHOLD = '500';
  process.env.TREASURY_NOTIFICATION_EMAIL = 'treasury@harvesta.app';
});

describe('checkAssetBalance', () => {
  it('returns the USDC balance for a given address', async () => {
    mockLoadAccount.mockResolvedValue(createMockAccount([makeUsdcBalance('1200.50')]));
    const result = await checkAssetBalance({
      address: PLANTING_ADDRESS,
      assetCode: 'USDC',
      assetIssuer: USDC_ISSUER,
    });
    expect(result.balance).toBe(1200.5);
    expect(result.address).toBe(PLANTING_ADDRESS);
    expect(result.assetCode).toBe('USDC');
  });

  it('returns 0 when the asset balance is not found', async () => {
    mockLoadAccount.mockResolvedValue(createMockAccount([makeNativeBalance('100')]));
    const result = await checkAssetBalance({
      address: PLANTING_ADDRESS,
      assetCode: 'USDC',
      assetIssuer: USDC_ISSUER,
    });
    expect(result.balance).toBe(0);
  });

  it('returns 0 when the account has no balances', async () => {
    mockLoadAccount.mockResolvedValue(createMockAccount([]));
    const result = await checkAssetBalance({
      address: PLANTING_ADDRESS,
      assetCode: 'USDC',
      assetIssuer: USDC_ISSUER,
    });
    expect(result.balance).toBe(0);
  });
});

describe('checkBalances', () => {
  it('checks default addresses (planting + replanting)', async () => {
    mockLoadAccount
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('1000')]))
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('200')]));
    const result = await checkBalances();
    expect(result.balances).toHaveLength(2);
    expect(result.balances[0].address).toBe(PLANTING_ADDRESS);
    expect(result.balances[0].balance).toBe(1000);
    expect(result.balances[1].address).toBe(REPLANTING_ADDRESS);
    expect(result.balances[1].balance).toBe(200);
  });

  it('flags alerts for balances below threshold', async () => {
    mockLoadAccount
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('600')]))
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('50')]));
    const result = await checkBalances();
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].address).toBe(REPLANTING_ADDRESS);
    expect(result.alerts[0].balance).toBe(50);
  });

  it('uses custom asset overrides when provided', async () => {
    mockLoadAccount.mockResolvedValue(createMockAccount([makeUsdcBalance('999')]));
    const override = {
      address: 'GAAAAACUSTOMADDRESS1234567890123456789012345678901234',
      assetCode: 'USDC',
      assetIssuer: USDC_ISSUER,
    };
    const result = await checkBalances([override]);
    expect(result.balances).toHaveLength(1);
    expect(result.balances[0].address).toBe(override.address);
  });
});

describe('checkAndAlert', () => {
  it('sends alert email when balance is below threshold', async () => {
    mockLoadAccount
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('100')]))
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('1000')]));
    await checkAndAlert();
    expect(sendTreasuryAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendTreasuryAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        address: PLANTING_ADDRESS,
        balance: 100,
      })
    );
  });

  it('does not send alert when all balances are above threshold', async () => {
    mockLoadAccount
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('1000')]))
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('2000')]));
    await checkAndAlert();
    expect(sendTreasuryAlertEmail).not.toHaveBeenCalled();
  });

  it('sends multiple alerts when multiple balances are low', async () => {
    mockLoadAccount
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('50')]))
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('30')]));
    await checkAndAlert();
    expect(sendTreasuryAlertEmail).toHaveBeenCalledTimes(2);
  });
});

describe('sendDailySummary', () => {
  it('sends a daily summary email with all balances', async () => {
    mockLoadAccount
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('800')]))
      .mockResolvedValueOnce(createMockAccount([makeUsdcBalance('300')]));
    await sendDailySummary();
    expect(sendTreasuryDailySummaryEmail).toHaveBeenCalledTimes(1);
    expect(sendTreasuryDailySummaryEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        balances: expect.arrayContaining([
          expect.objectContaining({ address: PLANTING_ADDRESS, balance: 800 }),
          expect.objectContaining({ address: REPLANTING_ADDRESS, balance: 300 }),
        ]),
      })
    );
  });
});
