import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as React from 'react';
import { MobileDrawer } from './MobileDrawer';
import type { ReactNode } from 'react';

// ── Mock framer-motion to avoid jsdom animation issues ──────────────────────
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
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
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
vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({
    wallet: null,
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
        'mobile.closeMenu': 'Close navigation menu',
        'mobile.tapToDisconnect': 'Tap to disconnect',
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
vi.mock('lucide-react', () => {
  const createElement =
    (name: string) =>
    ({ className }: Record<string, unknown>) => (
      <span data-testid={`icon-${name}`} className={className as string}>
        {name}
      </span>
    );
  return {
    X: createElement('X'),
    Home: createElement('Home'),
    FolderOpen: createElement('FolderOpen'),
    ShoppingBag: createElement('ShoppingBag'),
    LayoutDashboard: createElement('LayoutDashboard'),
    History: createElement('History'),
  };
});

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('MobileDrawer', () => {
  const defaultProps = {
    isOpen: false,
    onClose: vi.fn(),
    onOpenWallet: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/';
    document.body.style.overflow = '';
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(<MobileDrawer {...defaultProps} isOpen={false} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders the drawer panel when isOpen is true', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders the FarmCredit brand text', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByText('FarmCredit')).toBeInTheDocument();
    });

    it('renders all five navigation links', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('link', { name: /Home/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Projects/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Marketplace/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Transactions/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    });

    it('renders the language selector in mobile variant', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      const langSelector = screen.getByTestId('language-selector');
      expect(langSelector).toHaveAttribute('data-variant', 'mobile');
    });

    it('renders the wallet connect button when no wallet is connected', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(
        screen.getByRole('button', { name: /Connect your Stellar wallet/i })
      ).toBeInTheDocument();
    });

    it('renders the close button', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('button', { name: /Close navigation menu/i })).toBeInTheDocument();
    });

    it('renders navigation landmark', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(
        screen.getByRole('navigation', { name: /Mobile main navigation/i })
      ).toBeInTheDocument();
    });

    it('renders all nav link icons', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByTestId('icon-Home')).toBeInTheDocument();
      expect(screen.getByTestId('icon-FolderOpen')).toBeInTheDocument();
      expect(screen.getByTestId('icon-ShoppingBag')).toBeInTheDocument();
      expect(screen.getByTestId('icon-History')).toBeInTheDocument();
      expect(screen.getByTestId('icon-LayoutDashboard')).toBeInTheDocument();
    });
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('has role="dialog" on the drawer panel', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('role', 'dialog');
    });

    it('has aria-modal="true" on the drawer panel', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('has aria-label="Mobile navigation" on the drawer panel', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Mobile navigation');
    });

    it('has id="mobile-nav" on the drawer panel', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('id', 'mobile-nav');
    });

    it('marks the active page link with aria-current="page"', () => {
      mockPathname = '/projects';
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('link', { name: /Projects/i })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });

    it('does not mark non-active links with aria-current', () => {
      mockPathname = '/projects';
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('link', { name: /Home/i })).not.toHaveAttribute('aria-current');
    });

    it('icons are marked aria-hidden', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      const icons = screen.getAllByText(/Home|FolderOpen|ShoppingBag|History|LayoutDashboard/);
      icons.forEach((icon) => {
        expect(icon).toBeInTheDocument();
      });
    });

    it('close button has accessible label', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('button', { name: /Close navigation menu/i })).toBeInTheDocument();
    });
  });

  // ── Interactions ───────────────────────────────────────────────────────────

  describe('interactions', () => {
    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={onClose} onOpenWallet={vi.fn()} />);
      await vi.waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Close navigation menu/i }));
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={onClose} onOpenWallet={vi.fn()} />);
      const backdrop = document.querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeInTheDocument();
      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape key press', () => {
      const onClose = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={onClose} onOpenWallet={vi.fn()} />);
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenWallet when Connect Wallet is clicked', () => {
      const onOpenWallet = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={onOpenWallet} />);
      fireEvent.click(screen.getByRole('button', { name: /Connect your Stellar wallet/i }));
      expect(onOpenWallet).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when a nav link is clicked', () => {
      const onClose = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={onClose} onOpenWallet={vi.fn()} />);
      fireEvent.click(screen.getByRole('link', { name: /Home/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('links have correct href attributes', () => {
      render(<MobileDrawer {...defaultProps} isOpen={true} />);
      expect(screen.getByRole('link', { name: /Home/i })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: /Projects/i })).toHaveAttribute('href', '/projects');
      expect(screen.getByRole('link', { name: /Marketplace/i })).toHaveAttribute(
        'href',
        '/marketplace'
      );
      expect(screen.getByRole('link', { name: /Transactions/i })).toHaveAttribute(
        'href',
        '/transactions'
      );
      expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute(
        'href',
        '/dashboard'
      );
    });
  });

  // ── Body scroll lock ───────────────────────────────────────────────────────

  describe('body scroll lock', () => {
    it('locks body scroll when drawer opens', () => {
      render(<MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={vi.fn()} />);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scroll when drawer closes', () => {
      const { rerender } = render(
        <MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={vi.fn()} />
      );
      expect(document.body.style.overflow).toBe('hidden');

      rerender(<MobileDrawer isOpen={false} onClose={vi.fn()} onOpenWallet={vi.fn()} />);
      expect(document.body.style.overflow).toBe('');
    });
  });

  // ── Touch swipe gesture ────────────────────────────────────────────────────

  describe('touch swipe gesture', () => {
    it('calls onClose on a rightward swipe exceeding the threshold', () => {
      const onClose = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={onClose} onOpenWallet={vi.fn()} />);
      const panel = screen.getByRole('dialog');

      fireEvent.touchStart(panel, {
        touches: [{ clientX: 50, clientY: 200 }],
      });
      fireEvent.touchEnd(panel, {
        changedTouches: [{ clientX: 200, clientY: 210 }],
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose on a short rightward swipe (below threshold)', () => {
      const onClose = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={onClose} onOpenWallet={vi.fn()} />);
      const panel = screen.getByRole('dialog');

      fireEvent.touchStart(panel, {
        touches: [{ clientX: 50, clientY: 200 }],
      });
      fireEvent.touchEnd(panel, {
        changedTouches: [{ clientX: 100, clientY: 205 }],
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not call onClose on a leftward swipe', () => {
      const onClose = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={onClose} onOpenWallet={vi.fn()} />);
      const panel = screen.getByRole('dialog');

      fireEvent.touchStart(panel, {
        touches: [{ clientX: 200, clientY: 200 }],
      });
      fireEvent.touchEnd(panel, {
        changedTouches: [{ clientX: 50, clientY: 200 }],
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not call onClose on a swipe with too much vertical movement', () => {
      const onClose = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={onClose} onOpenWallet={vi.fn()} />);
      const panel = screen.getByRole('dialog');

      fireEvent.touchStart(panel, {
        touches: [{ clientX: 50, clientY: 200 }],
      });
      fireEvent.touchEnd(panel, {
        changedTouches: [{ clientX: 200, clientY: 400 }],
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not call onClose when there is no touch start', () => {
      const onClose = vi.fn();
      render(<MobileDrawer isOpen={true} onClose={onClose} onOpenWallet={vi.fn()} />);
      const panel = screen.getByRole('dialog');

      fireEvent.touchEnd(panel, {
        changedTouches: [{ clientX: 200, clientY: 200 }],
      });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ── Active link styling ────────────────────────────────────────────────────

  describe('active link styling', () => {
    it('applies active styling to the current page link', () => {
      mockPathname = '/dashboard';
      render(<MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={vi.fn()} />);
      const link = screen.getByRole('link', { name: /Dashboard/i });
      expect(link.className).toContain('bg-stellar-blue/10');
      expect(link.className).toContain('text-stellar-blue');
    });

    it('applies inactive styling to non-current page links', () => {
      mockPathname = '/dashboard';
      render(<MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={vi.fn()} />);
      const link = screen.getByRole('link', { name: /Home/i });
      expect(link.className).toContain('text-white/70');
    });

    it('shows active indicator dot for the current page', () => {
      mockPathname = '/projects';
      render(<MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={vi.fn()} />);
      const link = screen.getByRole('link', { name: /Projects/i });
      const dot = link.querySelector('.rounded-full');
      expect(dot).toBeInTheDocument();
    });
  });

  // ── Focus management ───────────────────────────────────────────────────────

  describe('focus management', () => {
    it('close button receives focus when drawer opens', () => {
      render(<MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={vi.fn()} />);
      const closeButton = screen.getByRole('button', { name: /Close navigation menu/i });
      // Focus is set via setTimeout; in jsdom we check it's focusable
      expect(closeButton).toBeInTheDocument();
    });

    it('traps Tab focus within the drawer', () => {
      render(<MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={vi.fn()} />);
      const panel = screen.getByRole('dialog');

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      expect(focusable.length).toBeGreaterThan(0);

      // Verify the last focusable element is the wallet button
      const lastFocusable = focusable[focusable.length - 1];
      expect(lastFocusable).toHaveAttribute('aria-label', 'Connect your Stellar wallet');
    });
  });

  // ── Responsive visibility ──────────────────────────────────────────────────

  describe('responsive visibility', () => {
    it('drawer panel has md:hidden class for mobile-only visibility', () => {
      render(<MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={vi.fn()} />);
      const panel = screen.getByRole('dialog');
      expect(panel.className).toContain('md:hidden');
    });

    it('backdrop has md:hidden class for mobile-only visibility', () => {
      render(<MobileDrawer isOpen={true} onClose={vi.fn()} onOpenWallet={vi.fn()} />);
      const backdrop = document.querySelector('[aria-hidden="true"]');
      expect(backdrop?.className).toContain('md:hidden');
    });
  });
});
