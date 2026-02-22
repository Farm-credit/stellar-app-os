import React from "react";

interface Milestone {
  date: string;
  title: string;
  description: string;
}

const milestones: Milestone[] = [
  {
    date: "2023 Q1",
    title: "Platform Conceptualized",
    description: "FarmCredit idea born to address agricultural credit gaps.",
  },
  {
    date: "2023 Q3",
    title: "MVP Launched",
    description: "First version of FarmCredit goes live on Stellar testnet.",
  },
  {
    date: "2024 Q2",
    title: "Mainnet Launch",
    description: "FarmCredit launches on Stellar mainnet with first partners.",
  },
  {
    date: "2025 Q1",
    title: "10,000+ Farmers Onboarded",
    description: "Major adoption milestone reached.",
  },
];

export function TimelineSection() {
  return (
    <section aria-labelledby="timeline-heading" className="py-12 px-4 md:px-8 max-w-4xl mx-auto">
      <h2 id="timeline-heading" className="text-2xl md:text-3xl font-bold mb-8 text-stellar-blue text-center">Our Journey</h2>
      <ol className="relative border-l-2 border-stellar-blue">
        {milestones.map((m, idx) => (
          <li key={m.date} className="mb-10 ml-6">
            <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-stellar-blue rounded-full ring-8 ring-background text-white font-bold">
              {idx + 1}
            </span>
            <div className="pl-2">
              <h3 className="font-semibold text-lg text-foreground">{m.title}</h3>
              <time className="block text-xs text-muted-foreground mb-1">{m.date}</time>
              <p className="text-sm text-muted-foreground">{m.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
