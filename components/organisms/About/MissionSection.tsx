import React from "react";

export function MissionSection() {
  return (
    <section aria-labelledby="mission-heading" className="py-12 px-4 md:px-8 max-w-3xl mx-auto text-center">
      <h1 id="mission-heading" className="text-3xl md:text-4xl font-bold mb-4 text-stellar-blue">Our Mission</h1>
      <p className="text-lg md:text-xl text-muted-foreground mb-2">
        Empowering farmers and communities through decentralized, transparent, and accessible agricultural credit on the Stellar network.
      </p>
      <p className="text-base text-foreground">
        We believe in financial inclusion, sustainability, and innovation. Our platform bridges the gap between traditional finance and the future of agriculture.
      </p>
    </section>
  );
}
