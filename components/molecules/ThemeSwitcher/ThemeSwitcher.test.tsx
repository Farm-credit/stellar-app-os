// Note: Testing dependencies need to be installed for this test file to work
// Run: pnpm add -D @testing-library/react @testing-library/jest-dom vitest @vitest/ui jsdom
// Then add test script to package.json: "test": "vitest"

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeSwitcher, CompactThemeSwitcher, PillThemeSwitcher } from './ThemeSwitcher';

// Mock the useTheme hook
vi.mock('@/hooks/useTheme', () => ({
  useTheme: vi.fn(),
}));

import { useTheme } from '@/hooks/useTheme';

describe('ThemeSwitcher', () => {
  const mockToggle = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTheme).mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: vi.fn(),
      toggle: mockToggle,
      isDark: false,
    });
  });

  it('renders correctly in light mode', () => {
    render(<ThemeSwitcher />);
    
    const button = screen.getByRole('switch', { name: /switch to dark mode/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders correctly in dark mode', () => {
    vi.mocked(useTheme).mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: vi.fn(),
      toggle: mockToggle,
      isDark: true,
    });
    
    render(<ThemeSwitcher />);
    
    const button = screen.getByRole('switch', { name: /switch to light mode/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls toggle function when clicked', () => {
    render(<ThemeSwitcher />);
    
    const button = screen.getByRole('switch');
    fireEvent.click(button);
    
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('shows Sun icon in dark mode', () => {
    vi.mocked(useTheme).mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: vi.fn(),
      toggle: mockToggle,
      isDark: true,
    });
    
    render(<ThemeSwitcher />);
    
    const sunIcon = screen.getByRole('switch').querySelector('svg');
    expect(sunIcon).toBeInTheDocument();
  });

  it('shows Moon icon in light mode', () => {
    vi.mocked(useTheme).mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: vi.fn(),
      toggle: mockToggle,
      isDark: false,
    });
    
    render(<ThemeSwitcher />);
    
    const moonIcon = screen.getByRole('switch').querySelector('svg');
    expect(moonIcon).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<ThemeSwitcher className="custom-class" />);
    
    const button = container.querySelector('button');
    expect(button).toHaveClass('custom-class');
  });

  it('renders different sizes correctly', () => {
    const { container: smContainer } = render(<ThemeSwitcher size="sm" />);
    const { container: mdContainer } = render(<ThemeSwitcher size="md" />);
    const { container: lgContainer } = render(<ThemeSwitcher size="lg" />);
    
    expect(smContainer.querySelector('button')).toHaveClass('h-8', 'w-8');
    expect(mdContainer.querySelector('button')).toHaveClass('h-10', 'w-10');
    expect(lgContainer.querySelector('button')).toHaveClass('h-12', 'w-12');
  });

  it('renders different variants correctly', () => {
    const { container: defaultContainer } = render(<ThemeSwitcher variant="default" />);
    const { container: compactContainer } = render(<ThemeSwitcher variant="compact" />);
    const { container: pillContainer } = render(<ThemeSwitcher variant="pill" />);
    
    expect(defaultContainer.querySelector('button')).toHaveClass('rounded-2xl');
    expect(compactContainer.querySelector('button')).toHaveClass('rounded-lg');
    expect(pillContainer.querySelector('button')).toHaveClass('rounded-full');
  });

  it('has proper focus-visible styles', () => {
    const { container } = render(<ThemeSwitcher />);
    
    const button = container.querySelector('button');
    expect(button).toHaveClass('focus-visible:outline-none', 'focus-visible:ring-2');
  });

  it('is keyboard accessible', () => {
    render(<ThemeSwitcher />);
    
    const button = screen.getByRole('switch');
    button.focus();
    
    expect(button).toHaveFocus();
    
    fireEvent.keyDown(button, { key: 'Enter' });
    
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('handles Space key for activation', () => {
    render(<ThemeSwitcher />);
    
    const button = screen.getByRole('switch');
    fireEvent.keyDown(button, { key: ' ' });
    
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });
});

describe('CompactThemeSwitcher', () => {
  it('renders with compact variant and small size', () => {
    const { container } = render(<CompactThemeSwitcher />);
    
    const button = container.querySelector('button');
    expect(button).toHaveClass('rounded-lg', 'h-8', 'w-8');
  });
});

describe('PillThemeSwitcher', () => {
  it('renders with pill variant and medium size', () => {
    const { container } = render(<PillThemeSwitcher />);
    
    const button = container.querySelector('button');
    expect(button).toHaveClass('rounded-full', 'h-10', 'w-10');
  });
});

describe('ThemeSwitcher accessibility', () => {
  it('has proper ARIA attributes', () => {
    render(<ThemeSwitcher />);
    
    const button = screen.getByRole('switch');
    expect(button).toHaveAttribute('role', 'switch');
    expect(button).toHaveAttribute('aria-label');
    expect(button).toHaveAttribute('aria-pressed');
  });

  it('updates aria-pressed when theme changes', () => {
    const { rerender } = render(<ThemeSwitcher />);
    
    const button = screen.getByRole('switch');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    
    vi.mocked(useTheme).mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: vi.fn(),
      toggle: vi.fn(),
      isDark: true,
    });
    
    rerender(<ThemeSwitcher />);
    
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('has proper aria-label that reflects current theme', () => {
    vi.mocked(useTheme).mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: vi.fn(),
      toggle: vi.fn(),
      isDark: false,
    });
    
    render(<ThemeSwitcher />);
    
    const button = screen.getByRole('switch', { name: /switch to dark mode/i });
    expect(button).toBeInTheDocument();
  });
});

describe('ThemeSwitcher responsive behavior', () => {
  it('maintains functionality across different viewport sizes', () => {
    const localMockToggle = vi.fn();
    vi.mocked(useTheme).mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: vi.fn(),
      toggle: localMockToggle,
      isDark: false,
    });
    
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    
    render(<ThemeSwitcher />);
    
    const button = screen.getByRole('switch');
    expect(button).toBeInTheDocument();
    
    // Simulate desktop viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
    
    fireEvent.click(button);
    
    expect(localMockToggle).toHaveBeenCalled();
  });
});
