import { render, screen } from '@testing-library/react';
import { Text } from '@/components/atoms/Text';

describe('Text', () => {
  it('renders the correct element type for heading variants', () => {
    render(
      <Text as="h2" variant="h2">
        Heading
      </Text>
    );

    const heading = screen.getByRole('heading', { name: /heading/i });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName.toLowerCase()).toBe('h2');
  });
});
