/**
 * EmptyState Molecule Component
 *
 * Motivational empty state shown when user has no impact data.
 * Encourages users to start their environmental journey.
 */

"use client";

import { Sprout, TrendingUp, Globe, MapPin } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex items-center justify-center min-h-150 p-8">
      <div className="max-w-2xl text-center space-y-10">
        {/* Animated icon */}
        <div className="relative inline-flex">
          <div
            className="absolute inset-0 bg-stellar-green/20 rounded-full blur-3xl animate-pulse"
            style={{ animationDuration: "3s" }}
          />
          <div className="relative p-8 bg-linear-to-br from-stellar-green/10 to-stellar-blue/10 rounded-full border border-stellar-green/20">
            <Sprout
              className="w-20 h-20 text-stellar-green"
              strokeWidth={1.5}
            />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-4">
          <h2 className="text-4xl font-bold text-foreground tracking-tight">
            Start Your Impact Journey
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            You haven&apos;t made any environmental contributions yet. Every
            small action counts toward a healthier planet. Begin today and watch
            your impact grow.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10">
          <div className="p-6 bg-card border border-border rounded-xl hover:border-stellar-green/30 transition-all">
            <div className="p-3 rounded-lg bg-stellar-green/10 text-stellar-green w-fit mx-auto mb-4">
              <Sprout className="w-7 h-7" strokeWidth={2} />
            </div>
            <h3 className="font-bold text-foreground mb-2 text-lg">
              Plant Trees
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Support reforestation projects across the globe
            </p>
          </div>

          <div className="p-6 bg-card border border-border rounded-xl hover:border-stellar-blue/30 transition-all">
            <div className="p-3 rounded-lg bg-stellar-blue/10 text-stellar-blue w-fit mx-auto mb-4">
              <TrendingUp className="w-7 h-7" strokeWidth={2} />
            </div>
            <h3 className="font-bold text-foreground mb-2 text-lg">
              Offset CO₂
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Reduce your carbon footprint measurably
            </p>
          </div>

          <div className="p-6 bg-card border border-border rounded-xl hover:border-stellar-purple/30 transition-all">
            <div className="p-3 rounded-lg bg-stellar-purple/10 text-stellar-purple w-fit mx-auto mb-4">
              <Globe className="w-7 h-7" strokeWidth={2} />
            </div>
            <h3 className="font-bold text-foreground mb-2 text-lg">
              Track Progress
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              See your real-world environmental impact
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <div className="pt-4">
          <button className="px-8 py-4 bg-stellar-green hover:bg-stellar-green/90 text-white font-semibold rounded-xl transition-all hover:scale-105 shadow-lg hover:shadow-stellar-green/20">
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
