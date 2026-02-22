import { HiOutlineGlobe, HiOutlineLightBulb } from "react-icons/hi";
import { FaHandHoldingHeart } from "react-icons/fa";

const values = [
  {
    icon: FaHandHoldingHeart,
    title: "Financial Inclusion",
    description:
      "Providing accessible agricultural credit to underserved farmers and communities through decentralized finance.",
  },
  {
    icon: HiOutlineGlobe,
    title: "Global Sustainability",
    description:
      "Enabling transparent funding that supports sustainable farming practices and long‑term environmental impact.",
  },
  {
    icon: HiOutlineLightBulb,
    title: "Innovation",
    description:
      "Leveraging blockchain infrastructure on Stellar to deliver secure, efficient, and inclusive financing solutions.",
  },
];

export function MissionSection() {
  return (
    <section
      aria-labelledby="mission-heading"
      className="relative pt-24 pb-8 px-4 md:px-6 lg:px-8 bg-linear-to-b from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-stellar-blue font-semibold text-xs tracking-[0.2em] uppercase">
            Our Mission
          </span>

          <h2
            id="mission-heading"
            className="mt-4 text-4xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight"
          >
            Driving Financial Inclusion Through
            <span className="block bg-linear-to-r from-stellar-blue to-blue-600 bg-clip-text text-transparent">
              Decentralized Innovation
            </span>
          </h2>

          <p className="mt-6 text-lg md:text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
            We empower farmers and agricultural communities with transparent and
            accessible credit infrastructure built on the Stellar network.
          </p>
        </div>

        {/* Values */}
        <div className="grid md:grid-cols-3 gap-8">
          {values.map((value, i) => {
            const Icon = value.icon;
            return (
              <div
                key={i}
                className="group rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-sm hover:shadow-lg transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-xl bg-linear-to-br from-stellar-blue to-blue-600 flex items-center justify-center text-white mb-6 group-hover:scale-105 transition-transform">
                  <Icon className="w-7 h-7" />
                </div>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {value.title}
                </h3>

                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {value.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
