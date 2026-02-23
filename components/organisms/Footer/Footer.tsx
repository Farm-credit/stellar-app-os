import Link from 'next/link';
import { NewsletterForm } from './NewsletterForm';
import { FaXTwitter, FaGithub, FaDiscord } from 'react-icons/fa6';

interface FooterLink {
  label: string;
  href: string;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

const aboutSection: FooterSection = {
  title: 'About',
  links: [
    { label: 'About FarmCredit', href: '#about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Documentation', href: '#docs' },
  ],
};

const resourcesSection: FooterSection = {
  title: 'Resources',
  links: [
    { label: 'API Documentation', href: '#api-docs' },
    { label: 'Developer Guide', href: '#dev-guide' },
    { label: 'Community', href: '#community' },
  ],
};

const legalSection: FooterSection = {
  title: 'Legal',
  links: [
    { label: 'Terms of Service', href: '#terms' },
    { label: 'Privacy Policy', href: '#privacy' },
    { label: 'Cookie Policy', href: '#cookies' },
  ],
};

const socialLinks = [
  {
    label: 'Twitter',
    href: 'https://twitter.com',
    icon: FaXTwitter,
    ariaLabel: 'Follow us on Twitter/X',
  },
  {
    label: 'GitHub',
    href: 'https://github.com',
    icon: FaGithub,
    ariaLabel: 'View our GitHub repository',
  },
  {
    label: 'Discord',
    href: 'https://discord.com',
    icon: FaDiscord,
    ariaLabel: 'Join our Discord community',
  },
];

export function Footer(): React.ReactNode {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="bg-stellar-navy text-foreground border-t border-cyan-500/10 mt-16 px-6 py-12 md:py-10 sm:px-4"
      role="contentinfo"
    >
      <div className="max-w-6xl mx-auto">
        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Newsletter */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stellar-blue">
              Stay Updated
            </h2>
            <p className="text-sm text-slate-300/70 leading-relaxed">
              Get the latest updates on FarmCredit and the Stellar network.
            </p>
            <NewsletterForm />
          </section>

          {/* Reusable Sections */}
          {[aboutSection, resourcesSection, legalSection].map((section) => (
            <section key={section.title} className="flex flex-col gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stellar-blue">
                {section.title}
              </h2>
              <ul className="flex flex-col gap-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-300/80 hover:text-stellar-blue hover:underline transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-stellar-blue rounded"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-cyan-500/20 my-7" />

        {/* Bottom */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <p className="text-sm text-slate-300/60">
            © {currentYear} FarmCredit. All rights reserved.
          </p>

          <ul className="flex gap-4">
            {socialLinks.map((social) => {
              const Icon = social.icon;
              return (
                <li key={social.label}>
                  <Link
                    href={social.href}
                    target="_blank"
                    aria-label={social.ariaLabel}
                    className="flex items-center justify-center w-10 h-10 rounded-lg border border-cyan-500/20 text-stellar-blue hover:bg-cyan-500/10 hover:border-stellar-blue transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                  >
                    <Icon className="w-5 h-5" />
                    <span className="sr-only">{social.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </footer>
  );
}
