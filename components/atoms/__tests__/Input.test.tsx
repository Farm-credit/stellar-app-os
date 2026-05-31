import { render, screen } from '@testing-library/react';
import { Input } from '@/components/atoms/Input';

describe('Input', () => {
  it('renders an input with placeholder and type', () => {
    render(<Input type="email" placeholder="Enter email" />);

    const input = screen.getByPlaceholderText(/enter email/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'email');
  });
});
