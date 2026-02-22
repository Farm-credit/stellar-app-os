import Image from "next/image";
import Link from "next/link";

import { BsLinkedin, BsTwitterX, BsEnvelope } from "react-icons/bs";

interface TeamMember {
  name: string;
  role: string;
  photo: string;
  bio?: string;
  linkedin?: string;
  twitter?: string;
  email?: string;
}

const team: TeamMember[] = [
  {
    name: "Ada Lovelace",
    role: "Co-Founder & CTO",
    photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=776&q=80",
    bio: "Pioneering the future of agricultural technology with innovative solutions.",
    linkedin: "https://linkedin.com/in/ada-lovelace",
    twitter: "https://twitter.com/adalovelace",
    email: "ada@company.com",
  },
  {
    name: "George Washington Carver",
    role: "Co-Founder & CEO",
    photo: "https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=774&q=80",
    bio: "Visionary leader with decades of experience in sustainable farming.",
    linkedin: "https://linkedin.com/in/george-carver",
    email: "george@company.com",
  },
  {
    name: "Wangari Maathai",
    role: "Head of Sustainability",
    photo: "https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=761&q=80",
    bio: "Dedicated to creating environmentally conscious agricultural practices.",
    linkedin: "https://linkedin.com/in/wangari-maathai",
    twitter: "https://twitter.com/wangari",
    email: "wangari@company.com",
  },
  {
    name: "Norman Borlaug",
    role: "Lead Agronomist",
    photo: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1740&q=80",
    bio: "Revolutionizing crop science for a food-secure future.",
    linkedin: "https://linkedin.com/in/norman-borlaug",
    email: "norman@company.com",
  },
];

export function TeamSection() {
  return (
    <section aria-labelledby="team-heading" className="py-20 px-4 md:px-6 lg:px-8 max-w-7xl mx-auto bg-linear-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Section Header */}
      <div className="text-center mb-16">
        <span className="text-stellar-blue font-semibold text-sm uppercase tracking-wider">Our Leadership</span>
        <h2 
          id="team-heading" 
          className="text-3xl md:text-4xl lg:text-5xl font-bold  text-black mt-2 mb-4"
        >
          Meet the Team
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Passionate experts dedicated to revolutionizing sustainable agriculture through innovation and dedication.
        </p>
        <div className="w-24 h-1 bg-linear-to-r from-stellar-blue to-blue-600 mx-auto mt-6 rounded-full" />
      </div>

      {/* Team Grid */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6 xl:gap-8">
        {team.map((member, index) => (
          <li 
            key={member.name} 
            className="group relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden border border-gray-100 dark:border-gray-700 hover:-translate-y-2"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Card Content */}
            <div className="p-6 flex flex-col items-center text-center">
              {/* Image Container with Overlay */}
              <div className="relative mb-4">
                <div className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-stellar-blue/20 group-hover:ring-stellar-blue/40 transition-all duration-300">
                  <Image
                    src={member.photo}
                    alt={member.name}
                    width={112}
                    height={112}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
                
                {/* Social Icons Overlay - Appears on Hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="flex gap-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-full p-2 shadow-xl">
                    {member.linkedin && (
                      <Link
                        href={member.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 bg-[#0077B5]/10 rounded-full text-[#0077B5] hover:bg-[#0077B5] hover:text-white transition-all duration-300 hover:scale-110"
                        aria-label={`${member.name}'s LinkedIn profile`}
                      >
                        <BsLinkedin className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    {member.twitter && (
                      <Link
                        href={member.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 bg-[#1DA1F2]/10 rounded-full text-[#1DA1F2] hover:bg-[#1DA1F2] hover:text-white transition-all duration-300 hover:scale-110"
                        aria-label={`${member.name}'s Twitter profile`}
                      >
                        <BsTwitterX className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    {member.email && (
                      <Link
                        href={`mailto:${member.email}`}
                        className="p-2.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-600 hover:text-white transition-all duration-300 hover:scale-110"
                        aria-label={`Email ${member.name}`}
                      >
                        <BsEnvelope className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Member Info */}
              <h3 className="font-bold text-xl text-gray-900 dark:text-white mb-1">
                {member.name}
              </h3>
              <p className="text-stellar-blue dark:text-blue-400 font-medium text-sm mb-3">
                {member.role}
              </p>
              
              {/* Bio */}
              {member.bio && (
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {member.bio}
                </p>
              )}
            </div>

            {/* Decorative Gradient Line */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-linear-to-r from-stellar-blue to-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
          </li>
        ))}
      </ul>
    </section>
  );
}