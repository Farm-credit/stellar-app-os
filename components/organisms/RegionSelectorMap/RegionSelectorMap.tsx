'use client';

/**
 * Region Selector Map - Issue #1683
 *
 * Interactive map component for sponsors to select planting regions
 * by ecosystem type (rainforest, savannah, mangrove, mountain)
 */

import { useState } from 'react';
import { MapPin, Check, ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/molecules/Card';
import {
  ecosystemAvailability,
  getRegionAvailability,
  type EcosystemAvailability,
  type PlantingRegion,
  type EcosystemType,
} from '@/lib/data/planting-regions';

interface RegionSelectorMapProps {
  treeCount: number;
  onRegionSelect: (region: PlantingRegion) => void;
  selectedRegion?: PlantingRegion;
  className?: string;
}

export function RegionSelectorMap({
  treeCount,
  onRegionSelect,
  selectedRegion,
  className,
}: RegionSelectorMapProps) {
  const [selectedEcosystem, setSelectedEcosystem] = useState<EcosystemType | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  const handleEcosystemClick = (ecosystem: EcosystemType) => {
    setSelectedEcosystem(ecosystem === selectedEcosystem ? null : ecosystem);
  };

  const handleRegionClick = (region: PlantingRegion) => {
    if (getRegionAvailability(region.id, treeCount)) {
      onRegionSelect(region);
    }
  };

  const selectedEcosystemData = selectedEcosystem
    ? ecosystemAvailability.find(e => e.ecosystemType === selectedEcosystem)
    : null;

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Ecosystem Type Selection */}
        <section>
          <Text variant="h3" className="text-lg font-semibold mb-4">
            Choose Ecosystem Type
          </Text>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ecosystemAvailability.map((ecosystem) => (
              <button
                key={ecosystem.ecosystemType}
                type="button"
                onClick={() => handleEcosystemClick(ecosystem.ecosystemType)}
                aria-pressed={selectedEcosystem === ecosystem.ecosystemType}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedEcosystem === ecosystem.ecosystemType
                    ? 'border-stellar-green bg-stellar-green/5'
                    : 'border-border hover:border-stellar-green/50 hover:bg-muted/30'
                }`}
              >
                <div className="text-3xl mb-2">{ecosystem.icon}</div>
                <Text
                  variant="body"
                  className={`font-semibold capitalize ${
                    selectedEcosystem === ecosystem.ecosystemType
                      ? 'text-stellar-green'
                      : 'text-foreground'
                  }`}
                >
                  {ecosystem.ecosystemType}
                </Text>
                <Text variant="small" className="text-muted-foreground mt-1">
                  {ecosystem.totalAvailableCapacity.toLocaleString()} trees available
                </Text>
              </button>
            ))}
          </div>
        </section>

        {/* Selected Ecosystem Description */}
        {selectedEcosystemData && (
          <Card className="p-4 bg-stellar-blue/5 border-stellar-blue/20">
            <div className="flex items-start gap-3">
              <div className="text-2xl">{selectedEcosystemData.icon}</div>
              <div className="flex-1">
                <Text variant="body" className="font-semibold capitalize">
                  {selectedEcosystemData.ecosystemType} Ecosystem
                </Text>
                <Text variant="small" className="text-muted-foreground mt-1">
                  {selectedEcosystemData.description}
                </Text>
              </div>
              <Info className="w-5 h-5 text-stellar-blue flex-shrink-0" />
            </div>
          </Card>
        )}

        {/* Region Selection */}
        {selectedEcosystem && selectedEcosystemData && (
          <section>
            <Text variant="h3" className="text-lg font-semibold mb-4">
              Select Planting Region
            </Text>
            <div className="space-y-3">
              {selectedEcosystemData.availableRegions.map((region) => {
                const isAvailable = getRegionAvailability(region.id, treeCount);
                const isSelected = selectedRegion?.id === region.id;
                const isHovered = hoveredRegion === region.id;

                return (
                  <button
                    key={region.id}
                    type="button"
                    onClick={() => handleRegionClick(region)}
                    onMouseEnter={() => setHoveredRegion(region.id)}
                    onMouseLeave={() => setHoveredRegion(null)}
                    disabled={!isAvailable}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-stellar-green bg-stellar-green/5'
                        : isHovered
                        ? 'border-stellar-green/50 bg-muted/30'
                        : isAvailable
                        ? 'border-border hover:border-stellar-green/30'
                        : 'border-border opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Region Image */}
                      {region.imageUrl && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                          <img
                            src={region.imageUrl}
                            alt={region.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      {/* Region Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Text variant="body" className="font-semibold">
                            {region.name}
                          </Text>
                          {isSelected && (
                            <Check className="w-4 h-4 text-stellar-green flex-shrink-0" />
                          )}
                        </div>
                        <Text variant="small" className="text-muted-foreground">
                          {region.country}
                        </Text>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {region.availableCapacity.toLocaleString()} / {region.totalCapacity.toLocaleString()} trees
                          </Badge>
                          {!isAvailable && (
                            <Badge variant="destructive" className="text-xs">
                              Insufficient capacity
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Chevron */}
                      <ChevronRight
                        className={`w-5 h-5 flex-shrink-0 transition-transform ${
                          isHovered ? 'translate-x-1' : ''
                        } ${isAvailable ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Selected Region Summary */}
        {selectedRegion && (
          <Card className="p-4 bg-stellar-green/5 border-stellar-green/30">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-stellar-green">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <Text variant="body" className="font-semibold">
                  {selectedRegion.name}, {selectedRegion.country}
                </Text>
                <Text variant="small" className="text-muted-foreground">
                  {treeCount} trees will be planted here
                </Text>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRegionSelect(selectedRegion)}
              >
                Change
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
