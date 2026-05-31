import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/atoms/Badge';

describe('Badge', () => {
  it('renders badge text and default styling', () => {
    render(<Badge>Active</Badge>);

    const badge = screen.getByText(/active/i);
    expect(badge).toBeInTheDocument();
  });

  it('renders the success variant', () => {
    render(<Badge variant="success">Success</Badge>);

    const badge = screen.getByText(/success/i);
    expect(badge).toHaveClass('border-transparent');
  });
});
