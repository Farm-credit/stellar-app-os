import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CountdownTimer } from '../CountdownTimer';

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders countdown segments for days, hours, minutes, seconds', () => {
    const deadline = new Date('2026-07-31T12:00:00Z').toISOString();
    render(<CountdownTimer deadline={deadline} />);
    expect(screen.getByText('07')).toBeInTheDocument();
    const zeros = screen.getAllByText('00');
    expect(zeros.length).toBe(3);
  });

  it('displays "Voting ended" when deadline is in the past', () => {
    const deadline = new Date('2026-07-20T12:00:00Z').toISOString();
    render(<CountdownTimer deadline={deadline} />);
    expect(screen.getByText('Voting ended')).toBeInTheDocument();
  });

  it('has role="timer" with aria-label', () => {
    const deadline = new Date('2026-07-31T12:00:00Z').toISOString();
    render(<CountdownTimer deadline={deadline} />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-label', expect.stringContaining('Time remaining'));
  });

  it('applies custom className', () => {
    const deadline = new Date('2026-07-31T12:00:00Z').toISOString();
    const { container } = render(
      <CountdownTimer deadline={deadline} className="my-timer" />
    );
    expect(container.firstChild).toHaveClass('my-timer');
  });

  it('applies urgent styling when less than 24 hours remain', () => {
    const deadline = new Date('2026-07-24T20:00:00Z').toISOString();
    render(<CountdownTimer deadline={deadline} />);
    const segments = screen.getAllByText(/[0-9]{2}/);
    expect(segments.some((el) => el.className.includes('destructive'))).toBe(true);
  });
});
