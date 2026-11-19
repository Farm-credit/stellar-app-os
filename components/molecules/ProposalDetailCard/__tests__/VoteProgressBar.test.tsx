import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VoteProgressBar } from '../VoteProgressBar';

describe('VoteProgressBar', () => {
  const defaultVotes = { for: 60, against: 30, abstain: 10 };

  it('renders vote breakdown group', () => {
    render(<VoteProgressBar votes={defaultVotes} />);
    expect(screen.getByRole('group', { name: /vote breakdown/i })).toBeInTheDocument();
  });

  it('displays correct percentages', () => {
    render(<VoteProgressBar votes={defaultVotes} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('displays correct vote counts in parentheses', () => {
    render(<VoteProgressBar votes={defaultVotes} />);
    expect(screen.getByText('(60)')).toBeInTheDocument();
    expect(screen.getByText('(30)')).toBeInTheDocument();
    expect(screen.getByText('(10)')).toBeInTheDocument();
  });

  it('displays For, Against, and Abstain labels', () => {
    render(<VoteProgressBar votes={defaultVotes} />);
    expect(screen.getByText('For')).toBeInTheDocument();
    expect(screen.getByText('Against')).toBeInTheDocument();
    expect(screen.getByText('Abstain')).toBeInTheDocument();
  });

  it('shows 0% for all options when no votes', () => {
    render(<VoteProgressBar votes={{ for: 0, against: 0, abstain: 0 }} />);
    const zeroPcts = screen.getAllByText('0%');
    expect(zeroPcts).toHaveLength(3);
  });

  it('applies custom className', () => {
    const { container } = render(
      <VoteProgressBar votes={defaultVotes} className="custom-votes" />
    );
    expect(container.firstChild).toHaveClass('custom-votes');
  });
});
