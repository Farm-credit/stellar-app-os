import React from "react";

const milestones = [
  {
    year: "2023",
    title: "Foundation",
    description: "FarmCredit was founded with a vision to democratize agricultural credit.",
    achievements: ["Team formed", "Research completed", "Seed funding secured"]
  },
  {
    year: "2024",
    title: "Launch",
    description: "Platform launched on Stellar mainnet, onboarding first partners.",
    achievements: ["Mainnet launch", "5 partners", "1,000 farmers"]
  },
  {
    year: "2025",
    title: "Growth",
    description: "Rapid expansion across multiple continents with significant adoption.",
    achievements: ["10,000 farmers", "15 countries", "$10M+ credit"]
  },
  {
    year: "2026",
    title: "Scale",
    description: "Aiming for global presence with 100,000+ farmers served.",
    achievements: ["Target: 100K farmers", "Target: 30 countries", "Target: $100M credit"]
  }
];

export function TimelineSection() {
  return (
    <section className="py-20 px-4 bg-white dark:bg-gray-900">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-center text-gray-900 dark:text-white mb-4">
          Our Journey
        </h2>
        <p className="text-xl text-gray-600 dark:text-gray-300 text-center mb-16 max-w-2xl mx-auto">
          From idea to impact — the milestones that shaped our mission
        </p>

        <div className="space-y-12">
          {milestones.map((milestone, index) => (
            <div key={milestone.year} className="relative flex gap-8">
              {/* Year marker */}
              <div className="flex-none w-24 text-right">
                <span className="text-3xl font-bold text-stellar-blue">{milestone.year}</span>
              </div>

              {/* Timeline dot */}
              <div className="relative flex-none">
                <div className="w-4 h-4 mt-3 bg-stellar-blue rounded-full ring-4 ring-stellar-blue/20" />
                {index < milestones.length - 1 && (
                  <div className="absolute top-4 left-2 w-0.5 h-24 bg-linear-to-b from-stellar-blue to-transparent" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-12">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {milestone.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4 text-lg">
                  {milestone.description}
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {milestone.achievements.map((achievement) => (
                    <li key={achievement} className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-stellar-blue rounded-full" />
                      {achievement}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}