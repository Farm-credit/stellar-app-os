// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TiltCard } from '../TiltCard';

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('TiltCard', () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it('renders children', () => {
    render(
      <TiltCard>
        <span>content</span>
      </TiltCard>,
    );
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('applies the provided className to the wrapper', () => {
    const { container } = render(
      <TiltCard className="test-class">
        <div />
      </TiltCard>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('test-class');
  });

  it('renders a decorative glare overlay marked aria-hidden', () => {
    const { container } = render(
      <TiltCard>
        <div />
      </TiltCard>,
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('tilts on mouse move and resets on mouse leave', () => {
    const { container } = render(
      <TiltCard>
        <div />
      </TiltCard>,
    );
    const wrapper = container.firstChild as HTMLElement;

    // jsdom returns a zeroed rect; assert the tilt math runs and stays finite.
    fireEvent.mouseMove(wrapper, { clientX: 10, clientY: 10 });
    expect(wrapper.style.transform).toContain('perspective(1000px)');

    fireEvent.mouseLeave(wrapper);
    expect(wrapper.style.transform).toContain('rotateX(0deg)');
    expect(wrapper.style.transform).toContain('rotateY(0deg)');
  });

  it('disables tilt transforms when prefers-reduced-motion is set', () => {
    mockMatchMedia(true);
    const { container } = render(
      <TiltCard>
        <div />
      </TiltCard>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.transform).toBe('');
    // No glare overlay is rendered in reduced-motion mode.
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
