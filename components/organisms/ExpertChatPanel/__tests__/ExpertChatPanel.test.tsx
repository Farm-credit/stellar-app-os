import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpertChatPanel } from '../ExpertChatPanel';

describe('ExpertChatPanel', () => {
  it('renders the expert chat interface and primary assistance topics', () => {
    render(<ExpertChatPanel />);

    expect(
      screen.getByRole('heading', { name: /ask a carbon farming expert/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/carbon farming/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/soil health/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/certification/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/market prices/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: /message/i })).toBeInTheDocument();
  });
});
