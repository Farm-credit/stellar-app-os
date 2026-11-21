import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { WildlifeHabitatSnapshot, WildlifeSighting } from '@/lib/wildlife/types';
import { HABITAT_SCORE_METHOD } from '@/lib/wildlife/habitat';
import { WildlifeHabitatImpact } from './WildlifeHabitatImpact';

const PHOTO_SIGHTING: WildlifeSighting = {
  id: 'sighting-1',
  projectId: 'proj-001',
  speciesCommonName: 'African Grey Parrot',
  scientificName: 'Psittacus erithacus',
  taxonomicGroup: 'bird',
  count: 4,
  observedAt: '2026-08-14T00:00:00.000Z',
  submittedBy: 'Field Team 2',
  submitterRole: 'field_team',
  status: 'approved',
  photoUrl: 'https://images.example.com/parrots.jpg',
  createdAt: '2026-08-14T00:00:00.000Z',
};

const RECENT_SIGHTING: WildlifeSighting = {
  ...PHOTO_SIGHTING,
  id: 'sighting-2',
  speciesCommonName: 'Forest Buffalo',
  scientificName: 'Syncerus caffer nanus',
  taxonomicGroup: 'mammal',
  photoUrl: undefined,
  observedAt: '2026-09-02T00:00:00.000Z',
};

const SNAPSHOT: WildlifeHabitatSnapshot = {
  score: {
    projectId: 'proj-001',
    score: 74,
    interpretation: 'Good habitat quality',
    speciesRichness: 6,
    taxonomicGroupCount: 4,
    shannonIndex: 1.72,
    evenness: 0.96,
    approvedSightings: 8,
    totalSightings: 9,
    computedAt: '2026-10-23T00:00:00.000Z',
  },
  recentApproved: [RECENT_SIGHTING, PHOTO_SIGHTING],
  featuredPhotos: [PHOTO_SIGHTING],
};

describe('WildlifeHabitatImpact (Issue #1665)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the habitat quality score with diversity metrics', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(SNAPSHOT) });

    render(<WildlifeHabitatImpact projectId="proj-001" />);

    await waitFor(() => {
      expect(screen.getByText('74')).toBeInTheDocument();
    });
    expect(screen.getByText('/100')).toBeInTheDocument();
    expect(screen.getByText('Good habitat quality')).toBeInTheDocument();
    expect(screen.getByText('1.72')).toBeInTheDocument();
    expect(screen.getByText('8/9')).toBeInTheDocument();
    expect(screen.getByText('Species')).toBeInTheDocument();
    expect(screen.getByText('Groups')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/wildlife/habitat?projectId=proj-001');
  });

  it('features approved wildlife photos with observer attribution', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(SNAPSHOT) });

    render(<WildlifeHabitatImpact projectId="proj-001" />);
    await waitFor(() => {
      expect(screen.getByText('Featured wildlife photos')).toBeInTheDocument();
    });

    const image = screen.getByAltText('African Grey Parrot sighting at the project site');
    expect(image).toHaveAttribute('src', PHOTO_SIGHTING.photoUrl);
    expect(screen.getByText('4 observed · Aug 14, 2026 · by Field Team 2')).toBeInTheDocument();
    expect(screen.getByText('Field team')).toBeInTheDocument();
  });

  it('lists recent approved sightings', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(SNAPSHOT) });

    render(<WildlifeHabitatImpact projectId="proj-001" />);
    await waitFor(() => {
      expect(screen.getByText('Recent sightings')).toBeInTheDocument();
    });
    expect(screen.getByText('Forest Buffalo')).toBeInTheDocument();
    expect(screen.getByText(/Mammal · 4 observed/)).toBeInTheDocument();
  });

  it('shows the scoring methodology in a tooltip', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(SNAPSHOT) });
    const user = userEvent.setup();

    render(<WildlifeHabitatImpact projectId="proj-001" />);
    const trigger = await screen.findByRole('button', {
      name: /how is the habitat quality score calculated/i,
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent(HABITAT_SCORE_METHOD);
  });

  it('shows an empty state when the API reports no sightings', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...SNAPSHOT,
          score: { ...SNAPSHOT.score, score: 0, interpretation: 'No approved sightings yet' },
          recentApproved: [],
          featuredPhotos: [],
        }),
    });

    render(<WildlifeHabitatImpact projectId="proj-001" />);
    await waitFor(() => {
      expect(screen.getByText(/No approved wildlife sightings recorded yet/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Featured wildlife photos')).not.toBeInTheDocument();
  });

  it('surfaces a friendly error when the habitat API fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    render(<WildlifeHabitatImpact projectId="proj-001" />);
    await waitFor(() => {
      expect(screen.getByText(/Wildlife sighting data is unavailable/i)).toBeInTheDocument();
    });
  });
});
