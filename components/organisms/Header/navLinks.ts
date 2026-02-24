export interface HeaderNavLink {
  href: string;
  label: string;
  matchPrefix?: string;
}

export const headerNavLinks: HeaderNavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/projects', label: 'Projects' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/dashboard/credits', label: 'Dashboard', matchPrefix: '/dashboard' },
];
