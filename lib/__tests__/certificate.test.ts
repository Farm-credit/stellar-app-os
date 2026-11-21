import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getExplorerUrl,
  getDisplayName,
  CertificateError,
  generateCertificatePdf,
} from '@/lib/certificate';
import type { CertificateData, GenerateCertificateOptions } from '@/lib/certificate';

const mockSave = vi.fn();
const mockText = vi.fn();
const mockSetFont = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetTextColor = vi.fn();
const mockSetFillColor = vi.fn();
const mockSetDrawColor = vi.fn();
const mockSetLineWidth = vi.fn();
const mockRect = vi.fn();
const mockRoundedRect = vi.fn();
const mockLine = vi.fn();
const mockAddImage = vi.fn();
const mockSplitTextToSize = vi.fn(() => ['line1']);

function createMockJsPdfInstance() {
  return {
    save: mockSave,
    text: mockText,
    setFont: mockSetFont,
    setFontSize: mockSetFontSize,
    setTextColor: mockSetTextColor,
    setFillColor: mockSetFillColor,
    setDrawColor: mockSetDrawColor,
    setLineWidth: mockSetLineWidth,
    rect: mockRect,
    roundedRect: mockRoundedRect,
    line: mockLine,
    addImage: mockAddImage,
    splitTextToSize: mockSplitTextToSize,
    output: vi.fn(() => new ArrayBuffer(0)),
  };
}

vi.mock('jspdf', () => {
  const MockJsPDF = function () {
    return createMockJsPdfInstance();
  };
  return { default: MockJsPDF };
});

function makeValidData(overrides: Partial<CertificateData> = {}): CertificateData {
  return {
    userName: 'Test User',
    walletAddress: 'GABCDEF123456',
    quantityRetired: 10,
    treeCount: 10,
    co2Offset: 0.48,
    plantingDate: new Date('2025-01-15'),
    region: 'Amazon Basin, Brazil',
    projectName: 'Amazon Reforestation',
    projectDescription: 'Planting native trees in the Amazon rainforest.',
    transactionHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    retirementDate: new Date('2025-06-01'),
    ...overrides,
  };
}

function makeValidOptions(
  overrides: Partial<GenerateCertificateOptions> = {}
): GenerateCertificateOptions {
  return {
    qrDataUrl: 'data:image/png;base64,test',
    data: makeValidData(),
    ...overrides,
  };
}

describe('getExplorerUrl', () => {
  it('returns default explorer URL with tx hash', () => {
    const url = getExplorerUrl('txhash123');
    expect(url).toBe('https://stellar.expert/explorer/public/tx/txhash123');
  });

  it('uses custom base URL when provided', () => {
    const url = getExplorerUrl('txhash123', 'https://custom.explorer/tx');
    expect(url).toBe('https://custom.explorer/tx/txhash123');
  });
});

describe('getDisplayName', () => {
  it('returns "Anonymous Donor" when isAnonymous is true', () => {
    const name = getDisplayName({ userName: 'Test', walletAddress: 'G...', isAnonymous: true });
    expect(name).toBe('Anonymous Donor');
  });

  it('returns userName when provided and not anonymous', () => {
    const name = getDisplayName({ userName: 'Alice', walletAddress: 'G...', isAnonymous: false });
    expect(name).toBe('Alice');
  });

  it('falls back to walletAddress when userName is empty', () => {
    const name = getDisplayName({ userName: '', walletAddress: 'GABCDEF', isAnonymous: false });
    expect(name).toBe('GABCDEF');
  });

  it('falls back to walletAddress when userName is null', () => {
    const name = getDisplayName({ userName: null, walletAddress: 'GABCDEF', isAnonymous: false });
    expect(name).toBe('GABCDEF');
  });

  it('trims whitespace from userName', () => {
    const name = getDisplayName({ userName: '  Bob  ', walletAddress: 'G...', isAnonymous: false });
    expect(name).toBe('Bob');
  });
});

describe('CertificateError', () => {
  it('creates error with message and code', () => {
    const err = new CertificateError('Test error', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Test error');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('CertificateError');
  });
});

describe('generateCertificatePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws CertificateError when qrDataUrl is empty', async () => {
    await expect(
      generateCertificatePdf({
        ...makeValidOptions(),
        qrDataUrl: '',
      })
    ).rejects.toThrow(CertificateError);
  });

  it('throws CertificateError when transactionHash is empty', async () => {
    await expect(
      generateCertificatePdf({
        ...makeValidOptions(),
        data: makeValidData({ transactionHash: '' }),
      })
    ).rejects.toThrow(CertificateError);
  });

  it('throws CertificateError when treeCount is negative', async () => {
    await expect(
      generateCertificatePdf({
        ...makeValidOptions(),
        data: makeValidData({ treeCount: -1 }),
      })
    ).rejects.toThrow(CertificateError);
  });

  it('throws CertificateError when co2Offset is negative', async () => {
    await expect(
      generateCertificatePdf({
        ...makeValidOptions(),
        data: makeValidData({ co2Offset: -5 }),
      })
    ).rejects.toThrow(CertificateError);
  });

  it('generates PDF with valid data', async () => {
    const options = makeValidOptions();
    expect(mockSave).not.toHaveBeenCalled();
    await generateCertificatePdf(options);
    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSetFillColor).toHaveBeenCalled();
    expect(mockText).toHaveBeenCalled();
  });

  it('handles anonymous display name', async () => {
    const options = makeValidOptions({
      data: makeValidData({ isAnonymous: true, userName: 'Hidden' }),
    });
    await generateCertificatePdf(options);
    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith(expect.stringContaining('Anonymous_Donor'));
  });

  it('handles QR addImage failure gracefully', async () => {
    mockAddImage.mockImplementationOnce(() => {
      throw new Error('Invalid image');
    });
    const options = makeValidOptions();
    await expect(generateCertificatePdf(options)).resolves.toBeUndefined();
  });

  it('includes project description when provided', async () => {
    const options = makeValidOptions({
      data: makeValidData({ projectDescription: 'A detailed description of the project.' }),
    });
    await expect(generateCertificatePdf(options)).resolves.toBeUndefined();
    expect(mockSave).toHaveBeenCalledOnce();
  });

  it('handles missing project description', async () => {
    const options = makeValidOptions({
      data: makeValidData({ projectDescription: '' }),
    });
    await expect(generateCertificatePdf(options)).resolves.toBeUndefined();
    expect(mockSave).toHaveBeenCalledOnce();
  });
});
