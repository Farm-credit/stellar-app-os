import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import BenefactorLandingPage, { generateMetadata, generateStaticParams } from '../page';
import { resetBenefactorStoreForTesting, saveBenefactorConfig } from '@/lib/api/benefactor-landing';

const mockNotFound = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => {
    mockNotFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

describe('Benefactor Landing Page (/sponsor/[brand])', () => {
  beforeEach(() => {
    resetBenefactorStoreForTesting();
    mockNotFound.mockClear();
  });

  it('renders benefactor branding, verified CSR metrics, and supported beneficiaries', async () => {
    const pageJsx = await BenefactorLandingPage({
      params: Promise.resolve({ brand: 'acme-corp' }),
    });

    render(pageJsx);

    // Organization Branding
    expect(screen.getByRole('heading', { level: 1, name: /Acme Corp/i })).toBeInTheDocument();
    expect(screen.getByText(/Verified Corporate Benefactor/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Empowering smallholder regenerative agroforestry/i)
    ).toBeInTheDocument();

    // CSR Impact Metrics
    expect(screen.getByText(/Total Trees Funded/i)).toBeInTheDocument();
    expect(screen.getByText(/CO₂ Sequestered/i)).toBeInTheDocument();
    expect(screen.getByText(/Supported Farmers/i)).toBeInTheDocument();

    // Beneficiaries
    expect(screen.getByText(/Aminu Musa/i)).toBeInTheDocument();
    expect(screen.getByText(/Amina Bello/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Kano State, Nigeria/i).length).toBeGreaterThanOrEqual(1);

    // Projects
    expect(screen.getByText(/Amazon Rainforest Restoration/i)).toBeInTheDocument();
  });

  it('renders external website link when configured', async () => {
    const pageJsx = await BenefactorLandingPage({
      params: Promise.resolve({ brand: 'acme-corp' }),
    });

    render(pageJsx);

    const siteLink = screen.getByRole('link', { name: /Visit Website/i });
    expect(siteLink).toHaveAttribute('href', 'https://acme-example.com');
  });

  it('triggers notFound() when the brand slug does not exist', async () => {
    await expect(
      BenefactorLandingPage({
        params: Promise.resolve({ brand: 'nonexistent-brand' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('triggers notFound() when the brand is unpublished / in draft status', async () => {
    saveBenefactorConfig('GACME1111111111111111111111111111111111111111111111111111111', {
      isPublished: false,
    });

    await expect(
      BenefactorLandingPage({
        params: Promise.resolve({ brand: 'acme-corp' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('generates appropriate page metadata for valid brand', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ brand: 'acme-corp' }),
    });

    expect(meta.title).toContain('Acme Corp');
    expect(meta.description).toContain('Empowering smallholder regenerative agroforestry');
  });

  it('returns fallback metadata when brand is not found', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ brand: 'unknown-corp' }),
    });

    expect(meta.title).toBe('Benefactor Not Found | FarmCredit');
  });

  it('provides static params for published benefactors', async () => {
    const params = await generateStaticParams();
    expect(params).toContainEqual({ brand: 'acme-corp' });
    expect(params).toContainEqual({ brand: 'apex-logistics' });
  });
});
