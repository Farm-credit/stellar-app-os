'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { ProjectLocationMap } from '@/components/organisms/ProjectLocationMap/ProjectLocationMap';
import type { CreditSelectionProps } from '@/lib/types/carbon';

const MIN_QUANTITY = 0.1;
const PRICE_PRECISION = 2;

function calculatePrice(quantity: number, pricePerTon: number): number {
  const total = quantity * pricePerTon;
  return Math.round(total * Math.pow(10, PRICE_PRECISION)) / Math.pow(10, PRICE_PRECISION);
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: PRICE_PRECISION,
    maximumFractionDigits: PRICE_PRECISION,
  }).format(price);
}

function calculateAvailabilityPercentage(available: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(100, Math.round((available / max) * 100));
}

export function CreditSelectionStep({ projects, onSelectionChange }: CreditSelectionProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [quantityError, setQuantityError] = useState<string>('');

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  const validateQuantity = useCallback(
    (value: string): string => {
      if (!selectedProject) return '';
      if (!value) return '';

      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue <= 0) {
        return 'Quantity must be greater than 0';
      }
      if (numValue < MIN_QUANTITY) {
        return `Minimum quantity is ${MIN_QUANTITY} ton CO₂`;
      }
      if (numValue > selectedProject.availableSupply) {
        return `Maximum quantity is ${selectedProject.availableSupply.toFixed(2)} tons CO₂`;
      }
      return '';
    },
    [selectedProject]
  );

  const handleQuantityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuantity(value);

      if (!selectedProject) {
        setQuantityError('');
        return;
      }

      const error = validateQuantity(value);
      setQuantityError(error);
    },
    [selectedProject, validateQuantity]
  );

  const handleProjectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newProjectId = e.target.value;
      setSelectedProjectId(newProjectId);
      setQuantity('');
      setQuantityError('');

      if (newProjectId && onSelectionChange) {
        const project = projects.find((p) => p.id === newProjectId);
        if (project) {
          onSelectionChange({
            projectId: newProjectId,
            quantity: 0,
            calculatedPrice: 0,
          });
        }
      }
    },
    [projects, onSelectionChange]
  );

  useEffect(() => {
    if (!selectedProject || !quantity) {
      if (onSelectionChange) {
        onSelectionChange({
          projectId: selectedProjectId || null,
          quantity: 0,
          calculatedPrice: 0,
        });
      }
      return;
    }

    const numQuantity = parseFloat(quantity);
    if (isNaN(numQuantity) || numQuantity <= 0 || quantityError) {
      if (onSelectionChange) {
        onSelectionChange({
          projectId: selectedProjectId,
          quantity: 0,
          calculatedPrice: 0,
        });
      }
      return;
    }

    const price = calculatePrice(numQuantity, selectedProject.pricePerTon);
    if (onSelectionChange) {
      onSelectionChange({
        projectId: selectedProjectId,
        quantity: numQuantity,
        calculatedPrice: price,
      });
    }
  }, [selectedProject, quantity, selectedProjectId, quantityError, onSelectionChange]);

  const calculatedPrice =
    selectedProject && quantity && !quantityError
      ? calculatePrice(parseFloat(quantity), selectedProject.pricePerTon)
      : 0;

  const availableProjects = projects.filter((p) => !p.isOutOfStock);
  const maxSupply = selectedProject ? Math.max(...projects.map((p) => p.availableSupply)) : 0;
  const availabilityPercentage = selectedProject
    ? calculateAvailabilityPercentage(selectedProject.availableSupply, maxSupply)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <Text variant="h3" as="h2" className="mb-2">
          Select Carbon Credits
        </Text>
        <Text variant="muted" as="p">
          Choose a project and specify the quantity of carbon credits you wish to purchase.
        </Text>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="project-select" className="block mb-2">
            <Text variant="small" as="span" className="font-semibold">
              Project
            </Text>
          </label>
          <Select
            id="project-select"
            variant="primary"
            value={selectedProjectId}
            onChange={handleProjectChange}
            aria-label="Select carbon credit project"
            aria-required="true"
          >
            <option value="">Select a project...</option>
            {availableProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.vintageYear})
              </option>
            ))}
          </Select>
          {projects.some((p) => p.isOutOfStock) && (
            <div className="mt-2">
              <Text variant="muted" as="p" className="text-xs">
                Some projects are currently out of stock and not shown in this list.
              </Text>
            </div>
          )}
        </div>

        {selectedProject && (
          <>
            <div className="rounded-lg border border-stellar-blue/20 bg-stellar-blue/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="font-semibold">
                  Vintage Year
                </Text>
                <Badge variant="success">{selectedProject.vintageYear}</Badge>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Text variant="small" as="span" className="font-semibold">
                    Credits Available
                  </Text>
                  <Text variant="small" as="span">
                    {selectedProject.availableSupply.toFixed(2)} tons CO₂
                  </Text>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div
                    className="bg-stellar-green h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${availabilityPercentage}%` }}
                    role="progressbar"
                    aria-valuenow={availabilityPercentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${availabilityPercentage}% of maximum supply available`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="font-semibold">
                  Price per Ton
                </Text>
                <Text variant="small" as="span">
                  {formatPrice(selectedProject.pricePerTon)}
                </Text>
              </div>

              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="font-semibold">
                  Location
                </Text>
                <Text variant="small" as="span" className="text-right">
                  {selectedProject.location}
                </Text>
              </div>
            </div>

            <ProjectLocationMap
              projectName={selectedProject.name}
              locationLabel={selectedProject.location}
              coordinates={selectedProject.coordinates}
              className="rounded-lg border border-stellar-blue/20 bg-background p-4"
            />

            <div>
              <label htmlFor="quantity-input" className="block mb-2">
                <Text variant="small" as="span" className="font-semibold">
                  Quantity (tons CO₂)
                </Text>
                <Text variant="muted" as="span" className="ml-2 text-xs">
                  Minimum: {MIN_QUANTITY} ton
                </Text>
              </label>
              <Input
                id="quantity-input"
                type="number"
                step="0.1"
                min={MIN_QUANTITY}
                max={selectedProject.availableSupply}
                value={quantity}
                onChange={handleQuantityChange}
                variant={quantityError ? 'destructive' : 'primary'}
                placeholder="0.1"
                aria-label="Enter quantity in tons CO₂"
                aria-required="true"
                aria-invalid={!!quantityError}
                aria-describedby={quantityError ? 'quantity-error' : undefined}
              />
              {quantityError && (
                <Text
                  id="quantity-error"
                  variant="small"
                  as="p"
                  className="mt-1 text-destructive"
                  role="alert"
                >
                  {quantityError}
                </Text>
              )}
            </div>

            {quantity && !quantityError && calculatedPrice > 0 && (
              <div className="rounded-lg border-2 border-stellar-blue bg-stellar-blue/10 p-4">
                <div className="flex items-center justify-between">
                  <Text variant="h4" as="span" className="font-semibold">
                    Total Price
                  </Text>
                  <Text variant="h4" as="span" className="font-bold text-stellar-blue">
                    {formatPrice(calculatedPrice)}
                  </Text>
                </div>
                <Text variant="muted" as="p" className="mt-1 text-xs">
                  {parseFloat(quantity).toFixed(2)} tons ×{' '}
                  {formatPrice(selectedProject.pricePerTon)} per ton
                </Text>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
