import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { evaluateSponsorAchievements } from '@/lib/gamification/sponsor-achievements';
import { SponsorAchievementGallery } from './SponsorAchievementGallery';

const trees = Array.from({ length: 10 }, (_, i) => ({
  species: 'Teak',
  region: 'Kano, Nigeria',
  plantedAt: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(),
}));

describe('SponsorAchievementGallery', () => {
  it('shows earned badges with share links and locked badges with progress', () => {
    render(
      <SponsorAchievementGallery
        achievements={evaluateSponsorAchievements(trees)}
        sponsorAddress="GADDR"
      />
    );
    expect(screen.getByText('2/5 earned')).toBeTruthy();
    expect(screen.getByLabelText('10 Trees: earned')).toBeTruthy();
    expect(screen.getByLabelText('100 Trees: not yet earned')).toBeTruthy();
    expect(screen.getByText('10/100 trees')).toBeTruthy();
    const link = screen.getAllByText('Share image')[0].closest('a');
    expect(link?.getAttribute('href')).toBe('/api/sponsors/GADDR/badges/first-tree/image');
  });
});
