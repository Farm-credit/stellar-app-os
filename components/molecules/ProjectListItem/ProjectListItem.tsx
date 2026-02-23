import * as React from "react";
import Image from "next/image";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { MapPin, ImageOff } from "lucide-react";

export interface ProjectListItemProps {
  id: string | number;
  title: string;
  location: string;
  description: string;
  imageUrl: string | null;
  type: "reforestation" | "renewable" | "conservation";
  progress: number;
  price: number;
  availableCredits: number;
}

const typeConfig = {
  reforestation: { label: "Reforestation", colorClass: "bg-stellar-green" },
  renewable: { label: "Renewable Energy", colorClass: "bg-stellar-cyan text-stellar-navy" },
  conservation: { label: "Conservation", colorClass: "bg-stellar-purple" },
};

export function ProjectListItem({
  id,
  title,
  location,
  description,
  imageUrl,
  type,
  progress,
  price,
  availableCredits,
}: ProjectListItemProps) {
  const isSoldOut = availableCredits <= 0;
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  const badgeConfig = typeConfig[type] || typeConfig.reforestation;

  return (
    <div className="group flex flex-col sm:flex-row gap-4 p-4 border border-border rounded-lg bg-card hover:border-stellar-blue/30 hover:shadow-md transition-all duration-300">
      {/* Image */}
      <div className="relative h-32 w-full sm:h-24 sm:w-32 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, 128px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground bg-secondary/50">
            <ImageOff className="h-6 w-6 opacity-50" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-grow flex flex-col sm:flex-row gap-4">
        {/* Main Info */}
        <div className="flex-grow space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-grow">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <Text variant="small" className="text-xs text-muted-foreground">
                  {location}
                </Text>
              </div>
              <Text as="h3" variant="h4" className="group-hover:text-stellar-blue transition-colors">
                {title}
              </Text>
            </div>
            <Badge className={`border-none flex-shrink-0 ${badgeConfig.colorClass}`}>
              {badgeConfig.label}
            </Badge>
          </div>
          
          <Text variant="muted" className="line-clamp-2 text-sm">
            {description}
          </Text>

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <Text variant="small" className="text-xs font-medium">
                {clampedProgress}% Funded
              </Text>
              <Text variant="small" className="text-xs text-muted-foreground">
                {availableCredits > 0 ? `${availableCredits.toLocaleString()} credits` : "0 credits"}
              </Text>
            </div>
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-stellar-green transition-all duration-1000 ease-out rounded-full"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Price & Action */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 sm:min-w-[140px] pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l sm:pl-4">
          <div className="flex flex-col items-start sm:items-end">
            <Text variant="small" className="text-muted-foreground text-xs">Price</Text>
            <div className="flex items-baseline gap-1">
              <Text variant="h4" className="text-lg sm:text-xl">${price.toFixed(2)}</Text>
              <Text variant="small" className="text-muted-foreground text-xs">/unit</Text>
            </div>
          </div>
          
          <Button 
            stellar="primary" 
            disabled={isSoldOut}
            size="sm"
            className="font-semibold w-full sm:w-auto"
          >
            {isSoldOut ? "Sold Out" : "Donate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
