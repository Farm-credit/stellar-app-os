import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TreeImage } from '@/components/atoms/TreeImage';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

// Mock next/image so we can render it in jsdom without a full Next.js context.
vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    width,
    height,
    className,
  }: {
    alt: string;
    src: string;
    width?: number;
    height?: number;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} width={width} height={height} className={className} />
  ),
}));

// Mock the useAltText hook — this lets us control what the hook returns.
vi.mock('@/hooks/useAltText', () => ({
  useAltText: vi.fn(),
}));

import { useAltText } from '@/hooks/useAltText';

const mockUseAltText = vi.mocked(useAltText);

// ---------------------------------------------------------------------------
// Default mock values
// ---------------------------------------------------------------------------

function setMockAltText(altText: string, isLoading = false, error: string | null = null) {
  mockUseAltText.mockReturnValue({ altText, isLoading, error });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TreeImage', () => {
  const baseProps = {
    src: '/test-image.jpg',
    width: 400,
    height: 300,
  };

  beforeEach(() => {
    // Default: hook returns generic fallback, not loading
    setMockAltText('Tree photo');
  });

  describe('explicit alt prop', () => {
    it('uses the explicit alt prop when provided', () => {
      render(<TreeImage {...baseProps} alt="A young teak tree in Abia State" />);
      expect(screen.getByRole('img', { hidden: true })).toHaveAttribute(
        'alt',
        'A young teak tree in Abia State'
      );
    });

    it('does not call useAltText when an explicit alt is provided', () => {
      render(
        <TreeImage {...baseProps} alt="Explicit description" imageKey="photos/tree-123.jpg" />
      );
      // The hook should have been called with null since we have an explicit alt
      expect(mockUseAltText).toHaveBeenCalledWith(null);
    });
  });

  describe('auto-generated alt text via imageKey', () => {
    it('shows auto-generated alt text from the hook when imageKey is provided', () => {
      setMockAltText('A mango tree planted in red soil. Confidence: 95%');
      render(<TreeImage {...baseProps} imageKey="photos/tree-abc.jpg" />);

      const img = screen.getByRole('img', { hidden: true });
      expect(img).toHaveAttribute('alt', 'A mango tree planted in red soil. Confidence: 95%');
    });

    it('passes the imageKey to useAltText when no explicit alt is provided', () => {
      render(<TreeImage {...baseProps} imageKey="photos/tree-xyz.jpg" />);
      expect(mockUseAltText).toHaveBeenCalledWith('photos/tree-xyz.jpg');
    });
  });

  describe('fallback behaviour', () => {
    it('falls back to "Tree photo" when the API fails (hook returns error)', () => {
      setMockAltText('Tree photo', false, 'Request failed with status 500');
      render(<TreeImage {...baseProps} imageKey="photos/broken.jpg" />);

      const img = screen.getByRole('img', { hidden: true });
      expect(img).toHaveAttribute('alt', 'Tree photo');
    });

    it('falls back to "Tree photo" when neither alt nor imageKey is provided', () => {
      render(<TreeImage {...baseProps} />);
      const img = screen.getByRole('img', { hidden: true });
      expect(img).toHaveAttribute('alt', 'Tree photo');
    });

    it('falls back to "Tree photo" when imageKey is null', () => {
      render(<TreeImage {...baseProps} imageKey={null} />);
      const img = screen.getByRole('img', { hidden: true });
      expect(img).toHaveAttribute('alt', 'Tree photo');
    });
  });

  describe('loading state', () => {
    it('sets aria-busy on the wrapper when loading', () => {
      setMockAltText('Tree photo', true);
      const { container } = render(<TreeImage {...baseProps} imageKey="photos/loading.jpg" />);

      const wrapper = container.querySelector('[aria-busy]');
      expect(wrapper).not.toBeNull();
      expect(wrapper).toHaveAttribute('aria-busy', 'true');
    });

    it('does not set aria-busy when not loading', () => {
      setMockAltText('Tree photo', false);
      const { container } = render(<TreeImage {...baseProps} imageKey="photos/loaded.jpg" />);

      const wrapper = container.querySelector('[aria-busy="true"]');
      expect(wrapper).toBeNull();
    });
  });

  describe('WCAG compliance', () => {
    it('never renders an empty alt attribute', () => {
      render(<TreeImage {...baseProps} />);
      const img = screen.getByRole('img', { hidden: true });
      const altValue = img.getAttribute('alt');
      expect(altValue).toBeTruthy();
    });

    it('sets displayName correctly', () => {
      expect(TreeImage.displayName).toBe('TreeImage');
    });
  });

  describe('className and wrapper', () => {
    it('applies className to the img element', () => {
      render(<TreeImage {...baseProps} className="rounded-lg" />);
      const img = screen.getByRole('img', { hidden: true });
      expect(img).toHaveClass('rounded-lg');
    });

    it('applies wrapperClassName to the outer wrapper', () => {
      const { container } = render(<TreeImage {...baseProps} wrapperClassName="custom-wrapper" />);
      expect(container.querySelector('.custom-wrapper')).not.toBeNull();
    });
  });
});
