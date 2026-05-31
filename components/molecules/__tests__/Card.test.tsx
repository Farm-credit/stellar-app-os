import { render, screen } from '@testing-library/react';
import { Card } from '@/components/molecules/Card';

describe('Card', () => {
  it('renders card content and default card styling', () => {
    render(
      <Card>
        <div>Card content</div>
      </Card>
    );

    expect(screen.getByText(/card content/i)).toBeInTheDocument();
    expect(screen.getByText(/card content/i).parentElement).toHaveClass('rounded-xl');
  });
});
