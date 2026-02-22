import React from "react";

interface TeamMember {
  name: string;
  role: string;
  photo: string;
}

const team: TeamMember[] = [
  {
    name: "Ada Lovelace",
    role: "Co-Founder & CTO",
    photo: "/images/team/ada.jpg",
  },
  {
    name: "George Washington Carver",
    role: "Co-Founder & CEO",
    photo: "/images/team/george.jpg",
  },
  {
    name: "Wangari Maathai",
    role: "Head of Sustainability",
    photo: "/images/team/wangari.jpg",
  },
  {
    name: "Norman Borlaug",
    role: "Lead Agronomist",
    photo: "/images/team/norman.jpg",
  },
];

export function TeamSection() {
  return (
    <section aria-labelledby="team-heading" className="py-12 px-4 md:px-8 max-w-5xl mx-auto">
      <h2 id="team-heading" className="text-2xl md:text-3xl font-bold mb-8 text-stellar-blue text-center">Meet the Team</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
        {team.map((member) => (
          <li key={member.name} className="flex flex-col items-center bg-card rounded-lg shadow p-4">
            <img
              src={member.photo}
              alt={member.name}
              className="w-24 h-24 rounded-full object-cover mb-3 border-4 border-stellar-blue"
              loading="lazy"
              width={96}
              height={96}
            />
            <span className="font-semibold text-lg text-foreground">{member.name}</span>
            <span className="text-sm text-muted-foreground">{member.role}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
