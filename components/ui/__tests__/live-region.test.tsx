import { render } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LiveRegion, useAnnouncer } from '../live-region';

function Probe({ onAnnounce }: { onAnnounce: (announce: (m: string) => void) => void }) {
  const announce = useAnnouncer('probe-region');
  onAnnounce(announce);
  return null;
}

describe('LiveRegion', () => {
  it('renders a polite hidden status region by default', () => {
    render(<LiveRegion id="sr-status" message="Trees loaded" />);

    const region = document.getElementById('sr-status');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('role')).toBe('status');
    expect(region!.getAttribute('aria-live')).toBe('polite');
    expect(region!.getAttribute('aria-atomic')).toBe('true');
    expect(region!.className).toContain('sr-only');
    expect(region!.textContent).toBe('Trees loaded');
  });

  it('renders an assertive alert region when requested', () => {
    render(<LiveRegion id="sr-alert" message="Payment failed" assertive />);

    const region = document.getElementById('sr-alert');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('role')).toBe('alert');
    expect(region!.getAttribute('aria-live')).toBe('assertive');
  });
});

describe('useAnnouncer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.getElementById('probe-region')?.remove();
  });

  it('creates a hidden live region on demand and announces a message', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    let announce: (message: string) => void = () => {};
    render(<Probe onAnnounce={(fn) => (announce = fn)} />);
    announce('Sponsorship saved');

    const region = document.getElementById('probe-region');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('role')).toBe('status');
    expect(region!.getAttribute('aria-live')).toBe('polite');
    expect(region!.className).toContain('sr-only');
    expect(region!.textContent).toBe('Sponsorship saved');
  });
});
