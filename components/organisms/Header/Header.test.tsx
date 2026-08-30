import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as React from 'react';
import { Header } from './Header';

// ── Mock framer-motion ──────────────────────────────────────────────────────
vi.mock('framer-motion', async () => {
  const actualReact = await vi.importActual<typeof React>('react');
  return {
    motion: new Proxy(
      {},
      {
        get:
          (_target: object, tag: string) =>
          ({
            children,
            ...props
          }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
            const {
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              whileHover: _whileHover,
              whileTap: _whileTap,
              variants: _variants,
              layout: _layout,
              layoutId: _layoutId,
              ...rest
            } = props as Record<string, unknown>;
            return actualReact.createElement(tag, rest, children);
          },
      }
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// ── Mock next/navigation ─────────────────────────────────────────────────────
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// ── Mock next/link ───────────────────────────────────────────────────────────
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...rest
  }: {
    children?: React.ReactNode;
    href?: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  } & Record<string, unknown>) => (
    <a href={href ?? '#'} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

// ── Mock WalletContext ───────────────────────────────────────────────────────
const mockDisconnect = vi.fn();
let mockWallet: {
  publicKey: string;
  isConnected: boolean;
  balance: { xlm: string; usdc: string };
} | null = null;

vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({
    wallet: mockWallet,
    disconnect: mockDisconnect,
    connect: vi.fn(),
    switchNetwork: vi.fn(),
    refreshBalance: vi.fn(),
    signTransaction: vi.fn(),
    isLoading: false,
    error: null,
    loadPersistedConnection: vi.fn(),
  }),
}));

// ── Mock useAppTranslation ───────────────────────────────────────────────────
vi.mock('@/hooks/useTranslation', () => ({
  useAppTranslation: () => ({
    t: ((key: string) => {
      const translations: Record<string, string> = {
        'nav.home': 'Home',
        'nav.projects': 'Projects',
        'nav.marketplace': 'Marketplace',
        'nav.transactions': 'Transactions',
        'nav.dashboard': 'Dashboard',
        'header.connectWallet': 'Connect Wallet',
        'header.openMenu': 'Open navigation menu',
        'header.languageSelector': 'Select language',
        'mobile.closeMenu': 'Close navigation menu',
      };
      return String(translations[key] ?? key);
    }) as any,
    language: 'en',
    changeLanguage: vi.fn(),
    isRTLLanguage: false,
    supportedLanguages: ['en', 'ha', 'fr', 'es', 'pt'],
    formatDate: vi.fn(),
    formatNumber: vi.fn(),
    formatCurrency: vi.fn(),
  }),
}));

// ── Mock useTheme ────────────────────────────────────────────────────────────
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    resolvedTheme: 'dark',
    setTheme: vi.fn(),
    toggle: vi.fn(),
    isDark: true,
  }),
}));

// ── Mock useWalletModal ──────────────────────────────────────────────────────
const mockOpenWallet = vi.fn();
const mockCloseWallet = vi.fn();
vi.mock('@/components/organisms/WalletModal/useWalletModal', () => ({
  useWalletModal: () => ({
    isOpen: false,
    open: mockOpenWallet,
    close: mockCloseWallet,
  }),
}));

// ── Mock WalletModal ─────────────────────────────────────────────────────────
vi.mock('@/components/organisms/WalletModal/WalletModal', () => ({
  WalletModal: () => <div data-testid="wallet-modal" />,
}));

// ── Mock MobileDrawer ────────────────────────────────────────────────────────
vi.mock('@/components/organisms/Header/MobileDrawer', () => ({
  MobileDrawer: ({
    isOpen,
    onClose,
    onOpenWallet,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onOpenWallet: () => void;
  }) =>
    isOpen ? (
      <div data-testid="mobile-drawer">
        <button type="button" onClick={onClose}>
          Close Drawer
        </button>
        <button type="button" onClick={onOpenWallet}>
          Open Wallet from Drawer
        </button>
      </div>
    ) : null,
}));

// ── Mock LanguageSelector ────────────────────────────────────────────────────
vi.mock('@/components/organisms/Header/LanguageSelector', () => ({
  LanguageSelector: ({ variant }: { variant?: string }) => (
    <div data-testid="language-selector" data-variant={variant}>
      Language Selector
    </div>
  ),
}));

// ── Mock Button ──────────────────────────────────────────────────────────────
vi.mock('@/components/atoms/Button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

// ── Mock Text ────────────────────────────────────────────────────────────────
vi.mock('@/components/atoms/Text', () => ({
  Text: ({
    children,
    className,
    variant: _variant,
  }: React.HTMLAttributes<HTMLElement> & { variant?: string }) => {
    void _variant;
    return <span className={className as string}>{children}</span>;
  },
}));

// ── Mock lucide-react icons ──────────────────────────────────────────────────
vi.mock('lucide-react', () => ({
  Menu: () => <span data-testid="icon-menu">Menu</span>,
  Sun: () => <span data-testid="icon-sun">Sun</span>,
  Moon: () => <span data-testid="icon-moon">Moon</span>,
}));

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/';
    mockWallet = null;
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the header banner landmark', () => {
      render(<Header />);
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('renders the FarmCredit logo', () => {
      render(<Header />);
      expect(screen.getByText('FarmCredit')).toBeInTheDocument();
    });

    it('logo links to home', () => {
      render(<Header />);
      expect(screen.getByText('FarmCredit').closest('a')).toHaveAttribute('href', '/');
    });

    it('renders desktop navigation with all links', () => {
      render(<Header />);
      const nav = screen.getByRole('navigation', { name: /Main navigation/i });
      expect(nav).toBeInTheDocument();
      expect(nav).toHaveClass('hidden');
    });

    it('renders mobile hamburger menu button', () => {
      render(<Header />);
      expect(screen.getByRole('button', { name: /Open navigation menu/i })).toBeInTheDocument();
    });

    it('renders the wallet connect button on desktop', () => {
      render(<Header />);
      expect(
        screen.getByRole('button', { name: /Connect your Stellar wallet/i })
      ).toBeInTheDocument();
    });
  });

  // ── Desktop navigation ─────────────────────────────────────────────────────

  describe('desktop navigation', () => {
    it('renders all five nav links', () => {
      render(<Header />);
      expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Marketplace' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Transactions' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    });

    it('marks active page with aria-current="page"', () => {
      mockPathname = '/marketplace';
      render(<Header />);
      expect(screen.getByRole('link', { name: /Marketplace/i })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });

    it('does not mark inactive pages with aria-current', () => {
      mockPathname = '/marketplace';
      render(<Header />);
      expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    });
  });

  // ── Mobile drawer integration ──────────────────────────────────────────────

  describe('mobile drawer integration', () => {
    it('does not render MobileDrawer when closed', () => {
      render(<Header />);
      expect(screen.queryByTestId('mobile-drawer')).not.toBeInTheDocument();
    });

    it('opens MobileDrawer when hamburger button is clicked', () => {
      render(<Header />);
      fireEvent.click(screen.getByRole('button', { name: /Open navigation menu/i }));
      expect(screen.getByTestId('mobile-drawer')).toBeInTheDocument();
    });

    it('hamburger button has aria-expanded="false" when drawer is closed', () => {
      render(<Header />);
      expect(screen.getByRole('button', { name: /Open navigation menu/i })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });

    it('hamburger button has aria-controls="mobile-nav"', () => {
      render(<Header />);
      expect(screen.getByRole('button', { name: /Open navigation menu/i })).toHaveAttribute(
        'aria-controls',
        'mobile-nav'
      );
    });

    it('closes MobileDrawer when drawer onClose is called', () => {
      render(<Header />);
      fireEvent.click(screen.getByRole('button', { name: /Open navigation menu/i }));
      expect(screen.getByTestId('mobile-drawer')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Close Drawer'));
      expect(screen.queryByTestId('mobile-drawer')).not.toBeInTheDocument();
    });
  });

  // ── Theme toggle ───────────────────────────────────────────────────────────

  describe('theme toggle', () => {
    it('renders theme toggle button on desktop', () => {
      render(<Header />);
      const themeButtons = screen.getAllByRole('button');
      const themeButton = themeButtons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Switch to')
      );
      expect(themeButton).toBeInTheDocument();
    });

    it('theme toggle has accessible label', () => {
      render(<Header />);
      const toggles = screen.getAllByRole('button', { name: /Switch to.*mode/i });
      expect(toggles.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Language selector ──────────────────────────────────────────────────────

  describe('language selector', () => {
    it('renders desktop language selector', () => {
      render(<Header />);
      const langSelector = screen.getByTestId('language-selector');
      expect(langSelector).toHaveAttribute('data-variant', 'desktop');
    });
  });

  // ── Wallet integration ─────────────────────────────────────────────────────

  describe('wallet integration', () => {
    it('shows Connect Wallet when no wallet is connected', () => {
      render(<Header />);
      expect(
        screen.getByRole('button', { name: /Connect your Stellar wallet/i })
      ).toBeInTheDocument();
    });

    it('opens wallet modal when Connect Wallet is clicked', () => {
      render(<Header />);
      fireEvent.click(screen.getByRole('button', { name: /Connect your Stellar wallet/i }));
      expect(mockOpenWallet).toHaveBeenCalled();
    });

    it('shows truncated public key when wallet is connected', () => {
      mockWallet = {
        publicKey: 'GABC1234567890DEF1234567890',
        isConnected: true,
        balance: { xlm: '100.50', usdc: '250.00' },
      };
      render(<Header />);
      expect(screen.getByText(/GABC12…7890/)).toBeInTheDocument();
    });

    it('shows XLM balance when wallet is connected', () => {
      mockWallet = {
        publicKey: 'GABC1234567890DEF1234567890',
        isConnected: true,
        balance: { xlm: '100.50', usdc: '250.00' },
      };
      render(<Header />);
      expect(screen.getByText('100.50')).toBeInTheDocument();
    });

    it('shows USDC balance when wallet is connected', () => {
      mockWallet = {
        publicKey: 'GABC1234567890DEF1234567890',
        isConnected: true,
        balance: { xlm: '100.50', usdc: '250.00' },
      };
      render(<Header />);
      expect(screen.getByText('250.00')).toBeInTheDocument();
    });
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('has role="banner" on the header element', () => {
      render(<Header />);
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('logo has accessible label', () => {
      render(<Header />);
      expect(screen.getByRole('link', { name: /FarmCredit home/i })).toBeInTheDocument();
    });

    it('desktop nav has accessible label', () => {
      render(<Header />);
      expect(screen.getByRole('navigation', { name: /Main navigation/i })).toBeInTheDocument();
    });

    it('hamburger button has accessible label', () => {
      render(<Header />);
      expect(screen.getByRole('button', { name: /Open navigation menu/i })).toBeInTheDocument();
    });
  });

  // ── Scroll shadow ──────────────────────────────────────────────────────────

  describe('scroll shadow', () => {
    it('does not have shadow class on initial render', () => {
      render(<Header />);
      const header = screen.getByRole('banner');
      expect(header.className).not.toContain('shadow-lg');
    });

    it('adds shadow class on scroll', () => {
      render(<Header />);
      act(() => {
        Object.defineProperty(window, 'scrollY', { value: 10, writable: true });
        window.dispatchEvent(new Event('scroll'));
      });
      const header = screen.getByRole('banner');
      expect(header.className).toContain('shadow-lg');
    });
  });

  // ── WalletModal ────────────────────────────────────────────────────────────

  describe('WalletModal', () => {
    it('renders WalletModal', () => {
      render(<Header />);
      expect(screen.getByTestId('wallet-modal')).toBeInTheDocument();
    });
  });
});
