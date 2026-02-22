import React from "react";

const partners = [
  { name: "Stellar Development Foundation", logo: "/images/partners/sdf.png", url: "https://stellar.org" },
  { name: "AgriTech Alliance", logo: "/images/partners/agritech.png", url: "https://agritechalliance.org" },
  { name: "OpenFinance Labs", logo: "/images/partners/openfinance.png", url: "https://openfinancelabs.com" },
];

export function PartnersSection() {
  return (
    <section aria-labelledby="partners-heading" className="py-12 px-4 md:px-8 max-w-4xl mx-auto">
      <h2 id="partners-heading" className="text-2xl md:text-3xl font-bold mb-8 text-stellar-blue text-center">Our Partners</h2>
      <ul className="flex flex-wrap justify-center items-center gap-8">
        {partners.map((partner) => (
          <li key={partner.name} className="flex flex-col items-center">
            <a href={partner.url} target="_blank" rel="noopener noreferrer" className="focus-visible:outline-2 focus-visible:outline-stellar-blue rounded">
              <img
                src={partner.logo}
                alt={partner.name + ' logo'}
                className="h-16 w-auto mb-2 object-contain"
                loading="lazy"
                height={64}
              />
              <span className="sr-only">{partner.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
