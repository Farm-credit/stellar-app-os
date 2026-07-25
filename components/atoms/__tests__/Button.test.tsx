import { render, screen } from '@testing-library/react';
import { Button } from '@/components/atoms/Button';

describe('Button', () => {
  it('renders button content', () => {
    render(<Button>Click me</Button>);

    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('applies provided attributes and className', () => {
    render(
      <Button type="submit" className="custom-button">
        Submit
      </Button>
    );

    const button = screen.getByRole('button', { name: /submit/i });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveClass('custom-button');
  });
});
