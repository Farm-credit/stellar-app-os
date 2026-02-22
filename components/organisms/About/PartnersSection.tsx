import React from "react";
import Image from "next/image";

const partners = [
  { 
    name: "AgriGlobal", 
    logo: "https://placehold.co/200x200/0A5C4B/white?text=AG", 
    url: "#"
  },
  { 
    name: "VetCare International", 
    logo: "https://placehold.co/200x200/2563EB/white?text=VC", 
    url: "#" 
  },
  { 
    name: "FarmTech Solutions", 
    logo: "https://placehold.co/200x200/DC2626/white?text=FT", 
    url: "#" 
  },
  { 
    name: "GreenHarvest", 
    logo: "https://placehold.co/200x200/059669/white?text=GH", 
    url: "#" 
  },
  { 
    name: "EcoVet Alliance", 
    logo: "https://placehold.co/200x200/7C3AED/white?text=EV", 
    url: "#" 
  },
  { 
    name: "Livestock Innovations", 
    logo: "https://placehold.co/200x200/D97706/white?text=LI", 
    url: "#" 
  },
];

export function PartnersSection() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">
          Our Partners
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          {partners.map((partner) => (
            <div key={partner.name} className="flex flex-col items-center">
              <div className="w-24 h-24 mb-3 relative">
                <Image
                  src={partner.logo}
                  alt={partner.name}
                  width={96}
                  height={96}
                  className="w-full h-full object-contain rounded-lg shadow-md"
                  unoptimized // For placeholder images
                />
              </div>
              <span className="text-sm font-medium text-center">
                {partner.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}