import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TradeTicker } from './TradeTicker';

describe('TradeTicker', () => {
  it('renders the trade ticker component', () => {
    render(<TradeTicker />);

    expect(screen.getByText('Live Carbon Credit Trades')).toBeInTheDocument();
  });

  it('shows waiting message when no trades are available', () => {
    render(<TradeTicker />);

    expect(screen.getByText('Waiting for new purchases...')).toBeInTheDocument();
  });
});
