import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactElement } from 'react';
import { cloneElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CarbonOffsetCalculator } from '../CarbonOffsetCalculator';
import { calculateCarbonOffset } from '../carbonOffsetCalculations';

vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

vi.mock('@/components/atoms/Button', () => ({
  Button: ({
    asChild,
    children,
    stellar: _stellar,
    width: _width,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    children: ReactElement;
    stellar?: string;
    width?: string;
  }) =>
    asChild ? (
      cloneElement(children, props as AnchorHTMLAttributes<HTMLAnchorElement>)
    ) : (
      <button {...props}>{children}</button>
    ),
}));

describe('calculateCarbonOffset', () => {
  it('adds a ten percent planning buffer to workforce emissions', () => {
    expect(calculateCarbonOffset('employees', 100)).toEqual({
      emissionsTonnes: 290,
      credits: 319,
      estimatedCostUsd: 5742,
    });
  });

  it('guards against invalid and negative input', () => {
    expect(calculateCarbonOffset('travel', Number.NaN).credits).toBe(0);
    expect(calculateCarbonOffset('employees', -10).credits).toBe(0);
  });
});

describe('CarbonOffsetCalculator', () => {
  it('renders an accessible workforce estimate and purchase link', () => {
    render(<CarbonOffsetCalculator />);

    expect(screen.getByRole('heading', { name: /turn your footprint/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /by workforce/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('798')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /build an offset portfolio/i })).toHaveAttribute(
      'href',
      '/credits/purchase/bulk?quantity=798'
    );
  });

  it('switches to travel and updates the live estimate from the slider', () => {
    render(<CarbonOffsetCalculator />);

    fireEvent.click(screen.getByRole('button', { name: /by business travel/i }));
    const slider = screen.getByRole('slider', { name: /annual flight distance/i });
    fireEvent.change(slider, { target: { value: '200000' } });

    expect(screen.getByRole('button', { name: /by business travel/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByText('31.6 tCO₂e')).toBeInTheDocument();
  });

  it('shows disabled states when no credits are required', () => {
    render(<CarbonOffsetCalculator />);

    fireEvent.change(screen.getByRole('slider', { name: /company size/i }), {
      target: { value: '0' },
    });

    expect(screen.getByRole('button', { name: /build an offset portfolio/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reset estimates/i })).toBeEnabled();
  });
});
