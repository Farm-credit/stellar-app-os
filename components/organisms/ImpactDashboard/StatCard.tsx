/**
 * StatCard Atom Component
 *
 * Card displaying a single statistic with icon, label, and value.
 * Features smooth hover effects and gradient overlays.
 */

"use client";

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  /** Card label/title */
  label: string;
  /** Icon component from lucide-react */
  icon: LucideIcon;
  /** Icon color using Stellar design tokens */
  iconColor: "blue" | "green" | "purple";
  /** Optional description text */
  description?: string;
  /** Child content (typically Counter component) */
  children: React.ReactNode;
}

/**
 * Get gradient color based on icon color
 */
function getGradientColor(color: "blue" | "green" | "purple"): string {
  switch (color) {
    case "blue":
      return "rgba(20, 182, 231, 0.05)";
    case "green":
      return "rgba(0, 179, 107, 0.05)";
    case "purple":
      return "rgba(62, 27, 219, 0.05)";
  }
}

/**
 * Get icon color class
 */
function getIconColorClass(color: "blue" | "green" | "purple"): string {
  switch (color) {
    case "blue":
      return "text-stellar-blue";
    case "green":
      return "text-stellar-green";
    case "purple":
      return "text-stellar-purple";
  }
}

/**
 * Get border color on hover
 */
function getBorderColorClass(color: "blue" | "green" | "purple"): string {
  switch (color) {
    case "blue":
      return "hover:border-stellar-blue/30";
    case "green":
      return "hover:border-stellar-green/30";
    case "purple":
      return "hover:border-stellar-purple/30";
  }
}

export function StatCard({
  label,
  icon: Icon,
  iconColor,
  description,
  children,
}: StatCardProps) {
  return (
    <div
      className={`
        group relative overflow-hidden rounded-2xl bg-card border border-border 
        p-6 transition-all duration-300 
        hover:shadow-lg hover:shadow-${iconColor === "blue" ? "stellar-blue" : iconColor === "green" ? "stellar-green" : "stellar-purple"}/10
        ${getBorderColorClass(iconColor)}
      `}
    >
      {/* Animated gradient overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, ${getGradientColor(iconColor)}, transparent 70%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col gap-3">
        {/* Icon and Label */}
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl bg-secondary/50 ${getIconColorClass(iconColor)}`}
          >
            <Icon className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
        </div>

        {/* Value (Counter) */}
        <div className="text-4xl font-bold text-foreground tabular-nums">
          {children}
        </div>

        {/* Description */}
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
