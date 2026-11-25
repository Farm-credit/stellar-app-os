import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocationPreferenceField } from './LocationPreferenceField';

describe('LocationPreferenceField', () => {
  it('renders region preference select and availability disclaimer', () => {
    const onChange = vi.fn();
    render(
      <LocationPreferenceField
        value={{ preferredRegion: '', preferredCountry: '', preferenceNotes: '' }}
        onChange={onChange}
      />
    );

    expect(screen.getByLabelText(/preferred planting region/i)).toBeInTheDocument();
    expect(screen.getByText(/subject to planting zone capacity/i)).toBeInTheDocument();
  });

  it('calls onChange when sponsor selects a preferred region', () => {
    const onChange = vi.fn();
    render(
      <LocationPreferenceField
        value={{ preferredRegion: '', preferredCountry: '', preferenceNotes: '' }}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText(/preferred planting region/i), {
      target: { value: 'Sub-Saharan Africa' },
    });

    expect(onChange).toHaveBeenCalledWith({ preferredRegion: 'Sub-Saharan Africa' });
  });

  it('shows country and notes fields once a region is chosen', () => {
    const onChange = vi.fn();
    render(
      <LocationPreferenceField
        value={{
          preferredRegion: 'Sub-Saharan Africa',
          preferredCountry: 'Nigeria',
          preferenceNotes: '',
        }}
        onChange={onChange}
      />
    );

    const countryInput = screen.getByLabelText(/specific country or area/i);
    expect(countryInput).toHaveValue('Nigeria');

    fireEvent.change(countryInput, { target: { value: 'Kenya' } });
    expect(onChange).toHaveBeenCalledWith({ preferredCountry: 'Kenya' });
  });
});
