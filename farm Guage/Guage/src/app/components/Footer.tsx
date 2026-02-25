import { LinkColumn } from './LinkColumn';
import { Newsletter } from './Newsletter';
import { SocialLinks } from './SocialLinks';
import { Rocket } from 'lucide-react';

const productLinks = [
  { label: 'Deploy', href: '#deploy' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Features', href: '#features' },
];

const resourceLinks = [
  { label: 'Docs', href: '#docs' },
  { label: 'Blog', href: '#blog' },
  { label: 'Support', href: '#support' },
];

const companyLinks = [
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
  { label: 'Careers', href: '#careers' },
];

export function Footer() {
  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Logo Section */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Rocket className="w-6 h-6 text-blue-500" />
              <span className="text-xl font-bold text-white">NovaLaunch</span>
            </div>
            <p className="text-sm text-gray-400">
              Empowering developers to build and deploy faster.
            </p>
          </div>

          {/* Link Columns - Desktop 3 columns, Mobile stacked */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-8">
            <LinkColumn title="Product" links={productLinks} />
            <LinkColumn title="Resources" links={resourceLinks} />
            <LinkColumn title="Company" links={companyLinks} />
          </div>

          {/* Newsletter Section */}
          <div className="lg:col-span-1">
            <Newsletter />
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-400">© 2026 NovaLaunch. All rights reserved.</p>
          <SocialLinks />
        </div>
      </div>
    </footer>
  );
}
