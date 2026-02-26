'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Checkbox } from '@/components/atoms/Checkbox';
import { Input } from '@/components/atoms/Input';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { getActiveFilterCount } from '@/lib/utils/filterUtils';
import type { FilterSidebarProps } from '@/lib/types/filters';

export function FilterSidebar({
  filters,
  onFiltersChange,
  availableTypes,
  availableLocations,
  availableCoBenefits,
  priceRange,
  isOpen = false,
  onClose,
}: FilterSidebarProps) {
  const [locationSearch, setLocationSearch] = useState('');
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const locationDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        locationDropdownRef.current &&
        !locationDropdownRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('input[type="text"]')
      ) {
        setIsLocationDropdownOpen(false);
      }
    };

    if (isLocationDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isLocationDropdownOpen]);

  const filteredLocations = useMemo(() => {
    if (!locationSearch) return availableLocations;
    return availableLocations.filter((location) =>
      location.toLowerCase().includes(locationSearch.toLowerCase())
    );
  }, [availableLocations, locationSearch]);

  const activeFilterCount = useMemo(() => getActiveFilterCount(filters), [filters]);

  const handleTypeToggle = useCallback(
    (type: string) => {
      const newTypes = filters.types.includes(type as (typeof filters.types)[number])
        ? filters.types.filter((t) => t !== type)
        : [...filters.types, type as (typeof filters.types)[number]];
      onFiltersChange({ ...filters, types: newTypes });
    },
    [filters, onFiltersChange]
  );

  const handleLocationToggle = useCallback(
    (location: string) => {
      const newLocations = filters.locations.includes(location)
        ? filters.locations.filter((l) => l !== location)
        : [...filters.locations, location];
      onFiltersChange({ ...filters, locations: newLocations });
      setLocationSearch('');
      setIsLocationDropdownOpen(false);
    },
    [filters, onFiltersChange]
  );

  const handlePriceRangeChange = useCallback(
    (field: 'min' | 'max', value: number) => {
      onFiltersChange({
        ...filters,
        priceRange: {
          ...filters.priceRange,
          [field]: value,
        },
      });
    },
    [filters, onFiltersChange]
  );

  const handleCoBenefitToggle = useCallback(
    (coBenefit: string) => {
      const newCoBenefits = filters.coBenefits.includes(coBenefit)
        ? filters.coBenefits.filter((b) => b !== coBenefit)
        : [...filters.coBenefits, coBenefit];
      onFiltersChange({ ...filters, coBenefits: newCoBenefits });
    },
    [filters, onFiltersChange]
  );

  const handleClearAll = useCallback(() => {
    onFiltersChange({
      types: [],
      locations: [],
      priceRange: {
        min: priceRange.min,
        max: priceRange.max,
      },
      coBenefits: [],
    });
    setLocationSearch('');
    setIsLocationDropdownOpen(false);
  }, [onFiltersChange, priceRange]);

  const sidebarContent = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Text variant="h3" as="h2">
          Filters
        </Text>
        {activeFilterCount > 0 && (
          <Badge variant="accent" className="ml-2">
            {activeFilterCount}
          </Badge>
        )}
      </div>

      {/* Project Types */}
      <div>
        <Text variant="small" as="span" className="font-semibold mb-3 block">
          Project Type
        </Text>
        <div className="space-y-2">
          {availableTypes.map((type) => (
            <Checkbox
              key={type}
              id={`type-${type}`}
              label={type}
              checked={filters.types.includes(type)}
              onChange={() => handleTypeToggle(type)}
              className="data-[state=checked]:bg-stellar-blue data-[state=checked]:border-stellar-blue"
            />
          ))}
        </div>
      </div>

      {/* Location */}
      <div>
        <Text variant="small" as="span" className="font-semibold mb-3 block">
          Location
        </Text>
        <div className="relative" ref={locationDropdownRef}>
          <Input
            type="text"
            placeholder="Search locations..."
            value={locationSearch}
            onChange={(e) => {
              setLocationSearch(e.target.value);
              setIsLocationDropdownOpen(true);
            }}
            onFocus={() => setIsLocationDropdownOpen(true)}
            variant="primary"
            inputSize="md"
            aria-label="Search locations"
            aria-expanded={isLocationDropdownOpen}
            aria-haspopup="listbox"
          />
          {isLocationDropdownOpen && filteredLocations.length > 0 && (
            <div
              className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-lg border bg-background shadow-lg"
              role="listbox"
            >
              {filteredLocations.map((location) => (
                <button
                  key={location}
                  type="button"
                  role="option"
                  aria-selected={filters.locations.includes(location)}
                  onClick={() => handleLocationToggle(location)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none flex items-center gap-2"
                >
                  <Checkbox
                    checked={filters.locations.includes(location)}
                    readOnly
                    className="pointer-events-none"
                  />
                  <span>{location}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {filters.locations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {filters.locations.map((location) => (
              <Badge
                key={location}
                variant="outline"
                className="cursor-pointer hover:bg-muted"
                onClick={() => handleLocationToggle(location)}
              >
                {location}
                <span className="ml-1" aria-hidden="true">
                  ×
                </span>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Price Range */}
      <div>
        <Text variant="small" as="span" className="font-semibold mb-3 block">
          Price Range (per ton)
        </Text>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={priceRange.min}
              max={priceRange.max}
              value={filters.priceRange.min}
              onChange={(e) => handlePriceRangeChange('min', parseFloat(e.target.value) || 0)}
              variant="primary"
              inputSize="sm"
              className="w-24"
              aria-label="Minimum price"
            />
            <Text variant="muted" as="span">
              to
            </Text>
            <Input
              type="number"
              min={priceRange.min}
              max={priceRange.max}
              value={filters.priceRange.max}
              onChange={(e) => handlePriceRangeChange('max', parseFloat(e.target.value) || 100)}
              variant="primary"
              inputSize="sm"
              className="w-24"
              aria-label="Maximum price"
            />
          </div>
          <div className="space-y-2">
            <input
              type="range"
              min={priceRange.min}
              max={priceRange.max}
              value={filters.priceRange.min}
              onChange={(e) => handlePriceRangeChange('min', parseFloat(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-stellar-blue"
              aria-label="Minimum price slider"
            />
            <input
              type="range"
              min={priceRange.min}
              max={priceRange.max}
              value={filters.priceRange.max}
              onChange={(e) => handlePriceRangeChange('max', parseFloat(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-stellar-blue"
              aria-label="Maximum price slider"
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>${priceRange.min}</span>
            <span>${priceRange.max}</span>
          </div>
        </div>
      </div>

      {/* Co-benefits */}
      <div>
        <Text variant="small" as="span" className="font-semibold mb-3 block">
          Co-benefits
        </Text>
        <div className="flex flex-wrap gap-2">
          {availableCoBenefits.map((coBenefit) => {
            const isSelected = filters.coBenefits.includes(coBenefit);
            return (
              <Badge
                key={coBenefit}
                variant={isSelected ? 'accent' : 'outline'}
                className={`cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-stellar-purple text-white border-stellar-purple'
                    : 'hover:bg-stellar-purple/10'
                }`}
                onClick={() => handleCoBenefitToggle(coBenefit)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCoBenefitToggle(coBenefit);
                  }
                }}
              >
                {coBenefit}
              </Badge>
            );
          })}
        </div>
      </div>

      {/* Clear Filters */}
      {activeFilterCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearAll}
          className="w-full"
          aria-label="Clear all filters"
        >
          Clear All Filters
        </Button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-full w-80 bg-background border-r p-6 overflow-y-auto z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        aria-label="Filter sidebar"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
