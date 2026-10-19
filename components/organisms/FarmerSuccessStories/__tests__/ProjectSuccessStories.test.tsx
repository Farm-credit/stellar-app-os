import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSuccessStories } from '../ProjectSuccessStories';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children?: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

describe('ProjectSuccessStories', () => {
  it('shows published sponsor spotlights and measured outcomes for a project', () => {
    render(<ProjectSuccessStories projectId="proj-009" />);

    expect(screen.getByText(/From a dusted plot to a 3.2-hectare woodland/i)).toBeInTheDocument();
    expect(screen.getByText(/Aminu’s verified survival rate/i)).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sponsor spotlight for aminu musa/i })).toHaveAttribute(
      'href',
      '/success-stories/aminu-musa-kano-reforestation'
    );
    expect(screen.getByRole('link', { name: /explore all curated stories/i })).toHaveAttribute(
      'href',
      '/success-stories'
    );
  });

  it('offers the quarterly editorial preparation message for projects without a published story', () => {
    render(<ProjectSuccessStories projectId="proj-013" />);

    expect(
      screen.getByText(/stories are being prepared for the next editorial review/i)
    ).toBeInTheDocument();
  });
});
