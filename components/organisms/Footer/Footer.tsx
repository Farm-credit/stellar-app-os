'use client';

import Link from 'next/link';
import { NewsletterForm } from '@/components/organisms/Footer/NewsletterForm';
import { FaXTwitter, FaGithub, FaDiscord } from 'react-icons/fa6';
import { useAppTranslation } from '@/hooks/useTranslation';
import type { TFunction } from 'i18next';

interface FooterLink {
  label: string;
  href: string;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

interface SocialLink {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  ariaLabel: string;
}

function buildFooterSections(t: TFunction): FooterSection[] {
  return [
    {
      title: t('footer.about'),
      links: [
        { label: t('footer.aboutFarmCredit'), href: '/about' },
        { label: t('footer.blog'), href: '/blog' },
        { label: t('footer.documentation'), href: '#docs' },
      ],
    },
    {
      title: t('footer.resources'),
      links: [
        { label: t('footer.apiDocs'), href: '#api-docs' },
        { label: t('footer.devGuide'), href: '#dev-guide' },
        { label: t('footer.community'), href: '#community' },
      ],
    },
    {
      title: t('footer.legal'),
      links: [
        { label: t('footer.terms'), href: '#terms' },
        { label: t('footer.privacy'), href: '#privacy' },
        { label: t('footer.cookies'), href: '#cookies' },
      ],
    },
  ];
}

function buildSocialLinks(t: TFunction): SocialLink[] {
  return [
    {
      label: t('footer.twitter'),
      href: 'https://twitter.com',
      icon: FaXTwitter,
      ariaLabel: t('footer.followTwitter'),
    },
    {
      label: t('footer.github'),
      href: 'https://github.com',
      icon: FaGithub,
      ariaLabel: t('footer.viewGithub'),
    },
    {
      label: t('footer.discord'),
      href: 'https://discord.com',
      icon: FaDiscord,
      ariaLabel: t('footer.joinDiscord'),
    },
  ];
}

export function Footer(): React.ReactNode {
  const { t } = useAppTranslation();
  const currentYear = new Date().getFullYear();
  const footerSections = buildFooterSections(t);
  const socialLinks = buildSocialLinks(t);

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
              {t('footer.stayUpdated')}
            </h2>
            <p className="text-sm text-slate-300/70 leading-relaxed">
              {t('footer.stayUpdatedDesc')}
            </p>
            <NewsletterForm />
          </section>

          {/* Reusable Sections */}
          {footerSections.map((section) => (
            <section key={section.title} className="flex flex-col gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stellar-blue">
                {section.title}
              </h2>
              <ul className="flex flex-col gap-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-300/80 hover:text-stellar-blue hover:underline transition-colors duration-200 focus:outline-none rounded"
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
            {t('footer.copyright', { year: currentYear })}
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