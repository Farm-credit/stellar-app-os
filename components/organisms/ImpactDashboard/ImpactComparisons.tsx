/**
 * ImpactComparisons Molecule Component
 *
 * Grid of cards showing real-world impact equivalents.
 * Animated counters make abstract CO2 numbers relatable.
 */

"use client";

import {
  Car,
  Navigation,
  Smartphone,
  Droplet,
  type LucideIcon,
} from "lucide-react";

import { Counter } from "./Counter";
import { ImpactComparison } from "@/types/impact.types";
import { formatNumber } from "@/lib/Impact-utils";

interface ImpactComparisonsProps {
  comparisons: ImpactComparison[];
}

/**
 * Map icon names to components
 */
const iconMap: Record<string, LucideIcon> = {
  Car,
  Navigation,
  Smartphone,
  Droplet,
};

export function ImpactComparisons({ comparisons }: ImpactComparisonsProps) {
  if (!comparisons || comparisons.length === 0) {
    return (
      <div className="text-center p-10 bg-linear-to-br from-muted/30 to-muted/10 rounded-2xl border border-dashed border-border/50">
        <p className="text-muted-foreground font-medium">
          No impact data yet. Start contributing to see your real-world impact!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {comparisons.map((comparison, index) => {
        const Icon = iconMap[comparison.icon];

        return (
          <div
            key={comparison.id}
            className="group relative overflow-hidden bg-card border border-border rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:shadow-stellar-green/10 hover:border-stellar-green/40 hover:-translate-y-1"
            style={{
              animation: "fadeIn 0.5s ease-out",
              animationDelay: `${index * 100}ms`,
              animationFillMode: "backwards",
            }}
          >
            {/* Gradient overlay on hover */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle at top left, rgba(0, 179, 107, 0.08), transparent 70%)",
              }}
            />

            {/* Content */}
            <div className="relative z-10 flex flex-col gap-4">
              {/* Icon */}
              <div className="flex items-center justify-between">
                <div className="p-3 rounded-xl bg-linear-to-br from-stellar-green/20 to-stellar-green/10 text-stellar-green ring-1 ring-stellar-green/20">
                  <Icon
                    className="w-6 h-6"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </div>
              </div>

              {/* Value */}
              <div className="space-y-2">
                <div className="text-4xl font-bold text-foreground tabular-nums tracking-tight">
                  <Counter value={comparison.value} formatter={formatNumber} />
                </div>
                <p className="text-sm font-semibold text-muted-foreground">
                  {comparison.label}
                </p>
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                {comparison.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
