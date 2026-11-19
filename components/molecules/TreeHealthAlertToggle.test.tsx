import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TreeHealthAlertToggle } from './TreeHealthAlertToggle';

describe('TreeHealthAlertToggle', () => {
  it('asks the visitor to connect a wallet first', () => {
    render(<TreeHealthAlertToggle sponsorId={null} />);
    expect(screen.getByText(/Connect your wallet/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers to turn alerts on for a connected sponsor', () => {
    render(<TreeHealthAlertToggle sponsorId="GSPONSOR" />);
    expect(screen.getByRole('button', { name: 'Turn on alerts' })).toBeTruthy();
  });
});
