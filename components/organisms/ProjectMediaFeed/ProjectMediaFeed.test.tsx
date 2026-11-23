import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ProjectMediaFeed,
  formatCaptureDate,
  sortNewestFirst,
} from '@/components/organisms/ProjectMediaFeed/ProjectMediaFeed';
import { getProjectMedia } from '@/lib/data/project-media';

const items = getProjectMedia('proj-001');

describe('ProjectMediaFeed helpers', () => {
  it('sorts newest first without mutating the input', () => {
    const sorted = sortNewestFirst(items);
    expect(sorted.map((i) => i.id)).toEqual(['pm-003', 'pm-002', 'pm-001']);
    expect(items[0].id).toBe('pm-001');
  });

  it('formats capture dates and tolerates bad input', () => {
    expect(formatCaptureDate('2026-10-15T10:30:00Z')).toBe('Oct 15, 2026');
    expect(formatCaptureDate('nope')).toBe('Date unknown');
  });
});

describe('ProjectMediaFeed', () => {
  it('renders supplied items as dated thumbnails', () => {
    render(<ProjectMediaFeed projectId="proj-001" items={items} />);
    expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(3);
    expect(screen.getByText('Nov 1, 2026')).toBeInTheDocument();
  });

  it('shows a loading state, then loaded media', async () => {
    const loadMedia = vi.fn().mockResolvedValue(items);
    render(<ProjectMediaFeed projectId="proj-001" loadMedia={loadMedia} />);
    expect(screen.getByRole('status', { name: /loading project media/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(3));
    expect(loadMedia).toHaveBeenCalledWith('proj-001', expect.any(AbortSignal));
  });

  it('shows an error with retry when loading fails', async () => {
    const loadMedia = vi
      .fn()
      .mockRejectedValueOnce(new Error('Media service down'))
      .mockResolvedValueOnce(items);
    render(<ProjectMediaFeed projectId="proj-001" loadMedia={loadMedia} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Media service down');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(3));
  });

  it('shows an empty state', () => {
    render(<ProjectMediaFeed projectId="proj-009" items={[]} />);
    expect(screen.getByText(/no media has been captured/i)).toBeInTheDocument();
  });

  it('filters by media type', () => {
    render(<ProjectMediaFeed projectId="proj-001" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Drone' }));
    expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(1);
  });

  it('opens the lightbox and steps through media', () => {
    render(<ProjectMediaFeed projectId="proj-001" items={items} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Open / })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
  });

  it('falls back when a render error is thrown', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = [null as unknown as (typeof items)[number]];
    render(<ProjectMediaFeed projectId="proj-001" items={bad} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/i);
    spy.mockRestore();
    errSpy.mockRestore();
  });
});
