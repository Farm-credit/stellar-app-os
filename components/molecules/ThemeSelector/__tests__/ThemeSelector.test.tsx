import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThemeSelector } from '@/components/molecules/ThemeSelector/ThemeSelector';

describe('ThemeSelector', () => {
  it('renders all 3 theme options (Light, Dark, System)', () => {
    const handleChange = vi.fn();
    render(<ThemeSelector value="system" onChange={handleChange} />);

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);

    expect(screen.getByRole('radio', { name: /Light theme/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Dark theme/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /System theme/i })).toBeInTheDocument();
  });

  it('marks the currently selected theme with aria-checked="true"', () => {
    const handleChange = vi.fn();
    const { rerender } = render(<ThemeSelector value="light" onChange={handleChange} />);

    expect(screen.getByRole('radio', { name: /Light theme/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: /Dark theme/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('radio', { name: /System theme/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );

    rerender(<ThemeSelector value="dark" onChange={handleChange} />);

    expect(screen.getByRole('radio', { name: /Dark theme/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: /Light theme/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('triggers onChange with the selected theme when an option is clicked', () => {
    const handleChange = vi.fn();
    render(<ThemeSelector value="system" onChange={handleChange} />);

    const darkOption = screen.getByRole('radio', { name: /Dark theme/i });
    fireEvent.click(darkOption);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('dark');

    const lightOption = screen.getByRole('radio', { name: /Light theme/i });
    fireEvent.click(lightOption);

    expect(handleChange).toHaveBeenCalledTimes(2);
    expect(handleChange).toHaveBeenCalledWith('light');
  });

  it('renders custom label and description when provided', () => {
    const handleChange = vi.fn();
    render(
      <ThemeSelector
        value="system"
        onChange={handleChange}
        label="Interface Appearance"
        description="Select your preferred color scheme"
      />
    );

    expect(screen.getByText('Interface Appearance')).toBeInTheDocument();
    expect(screen.getByText('Select your preferred color scheme')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Interface Appearance' })).toBeInTheDocument();
  });
});
