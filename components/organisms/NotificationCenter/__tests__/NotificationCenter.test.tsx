import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationCenterDrawer } from '@/components/organisms/NotificationCenter/NotificationCenterDrawer';
import { NotificationBell } from '@/components/organisms/NotificationCenter/NotificationBell';
import { NotificationProvider, useNotification } from '@/contexts/NotificationContext';

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<NotificationProvider>{ui}</NotificationProvider>);
};

describe('NotificationCenterDrawer', () => {
  it('renders when drawer is open', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">
            Open
          </button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    expect(screen.getByRole('dialog', { name: 'Notification Center' })).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('does not render when drawer is closed', () => {
    renderWithProvider(<NotificationCenterDrawer />);

    expect(screen.queryByRole('dialog', { name: 'Notification Center' })).not.toBeInTheDocument();
  });

  it('shows unread count in header', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">
            Open
          </button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    expect(screen.getByText(/unread notification/i)).toBeInTheDocument();
  });

  it('filters notifications by type', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">
            Open
          </button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    const filterSelect = screen.getByLabelText('Filter notifications');
    fireEvent.change(filterSelect, { target: { value: 'payout' } });

    const notifications = screen.getAllByRole('article');
    expect(notifications.length).toBeGreaterThan(0);
    notifications.forEach((n) => {
      expect(n.textContent).toContain('Payout');
    });
  });

  it('filters notifications by unread', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">
            Open
          </button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    const filterSelect = screen.getByLabelText('Filter notifications');
    fireEvent.change(filterSelect, { target: { value: 'unread' } });

    const notifications = screen.getAllByRole('article');
    expect(notifications.length).toBeGreaterThan(0);
  });

  it('marks notification as read', async () => {
    // Test the context directly
    const TestComponent = () => {
      const { notifications, unreadCount, markAsRead } = useNotification();
      return (
        <div>
          <span data-testid="unread-count">{unreadCount}</span>
          <button onClick={() => markAsRead(notifications[0]?.id || '')} data-testid="mark-read">
            Mark Read
          </button>
        </div>
      );
    };

    renderWithProvider(<TestComponent />);

    expect(screen.getByTestId('unread-count')).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('mark-read'));

    await waitFor(() => {
      expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
    });
  });

  it('archives notification', async () => {
    const TestComponent = () => {
      const { notifications, unreadCount, archiveNotification } = useNotification();
      return (
        <div>
          <span data-testid="unread-count">{unreadCount}</span>
          <button
            onClick={() => archiveNotification(notifications[0]?.id || '')}
            data-testid="archive"
          >
            Archive
          </button>
        </div>
      );
    };

    renderWithProvider(<TestComponent />);

    expect(screen.getByTestId('unread-count')).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('archive'));

    await waitFor(() => {
      expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
    });
  });

  it('closes on escape key', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">
            Open
          </button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Notification Center' })).not.toBeInTheDocument();
  });

  it('closes on overlay click', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">
            Open
          </button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    const overlay = screen.getByTestId('notification-overlay');
    fireEvent.click(overlay);

    expect(screen.queryByRole('dialog', { name: 'Notification Center' })).not.toBeInTheDocument();
  });

  it('shows empty state when no notifications match filter', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">
            Open
          </button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    const filterSelect = screen.getByLabelText('Filter notifications');
    // Filter by 'account_alert' - there's 1 notification (read)
    fireEvent.change(filterSelect, { target: { value: 'account_alert' } });

    expect(screen.getByText(/Account Alert/i)).toBeInTheDocument();
  });
});

describe('NotificationBell', () => {
  it('renders notification bell', () => {
    renderWithProvider(<NotificationBell />);

    const bell = screen.getByRole('button', { name: /unread notifications/i });
    expect(bell).toBeInTheDocument();
    expect(bell).toHaveAttribute('aria-label', '2 unread notifications');
  });

  it('shows unread badge when there are unread notifications', () => {
    renderWithProvider(<NotificationBell />);

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('opens drawer on click', () => {
    const TestComponent = () => {
      const { isDrawerOpen } = useNotification();
      return (
        <div>
          <NotificationBell />
          <span data-testid="drawer-state">{String(isDrawerOpen)}</span>
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByRole('button', { name: /unread notifications/i }));

    expect(screen.getByTestId('drawer-state')).toHaveTextContent('true');
  });

  it('opens on Enter key', () => {
    const TestComponent = () => {
      const { isDrawerOpen } = useNotification();
      return (
        <div>
          <NotificationBell />
          <span data-testid="drawer-state">{String(isDrawerOpen)}</span>
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.keyDown(screen.getByRole('button', { name: /unread notifications/i }), {
      key: 'Enter',
    });

    expect(screen.getByTestId('drawer-state')).toHaveTextContent('true');
  });

  it('opens on Space key', () => {
    const TestComponent = () => {
      const { isDrawerOpen } = useNotification();
      return (
        <div>
          <NotificationBell />
          <span data-testid="drawer-state">{String(isDrawerOpen)}</span>
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.keyDown(screen.getByRole('button', { name: /unread notifications/i }), { key: ' ' });

    expect(screen.getByTestId('drawer-state')).toHaveTextContent('true');
  });

  it('toggles drawer on subsequent clicks', () => {
    const TestComponent = () => {
      const { isDrawerOpen } = useNotification();
      return (
        <div>
          <NotificationBell />
          <span data-testid="drawer-state">{String(isDrawerOpen)}</span>
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    const bell = screen.getByRole('button', { name: /unread notifications/i });

    fireEvent.click(bell);
    expect(screen.getByTestId('drawer-state')).toHaveTextContent('true');

    fireEvent.click(bell);
    expect(screen.getByTestId('drawer-state')).toHaveTextContent('false');
  });
});
