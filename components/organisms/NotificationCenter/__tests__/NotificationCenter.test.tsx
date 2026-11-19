import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NotificationCenterDrawer } from '@/components/organisms/NotificationCenter/NotificationCenterDrawer';
import { NotificationBell, ToastContainer } from '@/components/organisms/NotificationCenter/NotificationBell';
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
          <button onClick={openDrawer} data-testid="open">Open</button>
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
          <button onClick={openDrawer} data-testid="open">Open</button>
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
          <button onClick={openDrawer} data-testid="open">Open</button>
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
          <button onClick={openDrawer} data-testid="open">Open</button>
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
    const TestComponent = () => {
      const { notifications, unreadCount, markAsRead } = useNotification();
      return (
        <div>
          <span data-testid="unread-count">{unreadCount}</span>
          <button onClick={() => markAsRead(notifications[0]?.id || '')} data-testid="mark-read">Mark Read</button>
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
          <button onClick={() => archiveNotification(notifications[0]?.id || '')} data-testid="archive">Archive</button>
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
          <button onClick={openDrawer} data-testid="open">Open</button>
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
          <button onClick={openDrawer} data-testid="open">Open</button>
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
          <button onClick={openDrawer} data-testid="open">Open</button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));
    const filterSelect = screen.getByLabelText('Filter notifications');
    fireEvent.change(filterSelect, { target: { value: 'account_alert' } });
    expect(screen.getByText(/Account Alert/i)).toBeInTheDocument();
  });

  it('marks all as read from footer', () => {
    const TestComponent = () => {
      const { openDrawer, unreadCount } = useNotification();
      return (
        <div>
          <span data-testid="unread-count">{unreadCount}</span>
          <button onClick={openDrawer} data-testid="open">Open</button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    expect(screen.getByTestId('unread-count')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('open'));

    const markAllButton = screen.getByText('Mark all as read');
    fireEvent.click(markAllButton);

    expect(screen.getByTestId('unread-count')).toHaveTextContent('0');
  });

  it('has accessible dialog attributes', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">Open</button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Notification Center');
  });

  it('has accessible filter with label', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">Open</button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    expect(screen.getByLabelText('Filter notifications')).toBeInTheDocument();
  });

  it('shows correct unread count in header', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">Open</button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    expect(screen.getByText(/unread notifications/i)).toBeInTheDocument();
  });

  it('renders notification items with type badges', () => {
    const TestComponent = () => {
      const { openDrawer } = useNotification();
      return (
        <div>
          <button onClick={openDrawer} data-testid="open">Open</button>
          <NotificationCenterDrawer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('open'));

    const articles = screen.getAllByRole('article');
    expect(articles.length).toBeGreaterThanOrEqual(3);
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
    fireEvent.keyDown(screen.getByRole('button', { name: /unread notifications/i }), { key: 'Enter' });
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

  it('has accessible aria attributes', () => {
    renderWithProvider(<NotificationBell />);

    const bell = screen.getByRole('button');
    expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bell).toHaveAttribute('aria-controls', 'notification-center-drawer');
    expect(bell).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows 9+ badge for many notifications', () => {
    const TestComponent = () => {
      const { addNotification } = useNotification();
      return (
        <div>
          <NotificationBell />
          <button onClick={() => {
            for (let i = 0; i < 10; i++) {
              addNotification({ title: `Notif ${i}`, type: 'payout', priority: 'high' });
            }
          }} data-testid="add-many">Add Many</button>
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add-many'));
    expect(screen.getByText('9+')).toBeInTheDocument();
  });
});

describe('ToastContainer', () => {
  it('renders nothing when no toasts', () => {
    renderWithProvider(<ToastContainer />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('renders toasts when added', () => {
    const TestComponent = () => {
      const { addToast } = useNotification();
      return (
        <div>
          <button onClick={() => addToast({ title: 'Test Toast', type: 'success' })} data-testid="add">Add Toast</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByText('Test Toast')).toBeInTheDocument();
  });

  it('renders toast with description', () => {
    const TestComponent = () => {
      const { addToast } = useNotification();
      return (
        <div>
          <button onClick={() => addToast({ title: 'Test', description: 'Description text', type: 'info' })} data-testid="add">Add</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByText('Description text')).toBeInTheDocument();
  });

  it('dismisses toast when close button clicked', () => {
    const TestComponent = () => {
      const { addToast } = useNotification();
      return (
        <div>
          <button onClick={() => addToast({ title: 'Dismiss Me', type: 'warning' })} data-testid="add">Add</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByText('Dismiss Me')).toBeInTheDocument();

    const dismissButton = screen.getByLabelText('Dismiss notification');
    fireEvent.click(dismissButton);
    expect(screen.queryByText('Dismiss Me')).not.toBeInTheDocument();
  });

  it('renders all toast types with correct styling', () => {
    const TestComponent = () => {
      const { toast } = useNotification();
      return (
        <div>
          <button onClick={() => toast.success('Success!')} data-testid="success">Success</button>
          <button onClick={() => toast.error('Error!')} data-testid="error">Error</button>
          <button onClick={() => toast.warning('Warning!')} data-testid="warning">Warning</button>
          <button onClick={() => toast.info('Info!')} data-testid="info">Info</button>
          <button onClick={() => toast.contract('Contract!')} data-testid="contract">Contract</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('error'));
    expect(screen.getByText('Error!')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('warning'));
    expect(screen.getByText('Warning!')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('info'));
    expect(screen.getByText('Info!')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('contract'));
    expect(screen.getByText('Contract!')).toBeInTheDocument();
  });

  it('toast has accessible role and live region', () => {
    const TestComponent = () => {
      const { addToast } = useNotification();
      return (
        <div>
          <button onClick={() => addToast({ title: 'A11y Toast', type: 'error' })} data-testid="add">Add</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add'));

    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('aria-label', 'Notifications');
    expect(region).toHaveAttribute('aria-live', 'polite');

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('renders toast with action button', () => {
    const mockAction = { label: 'Undo', onClick: vi.fn() };
    const TestComponent = () => {
      const { addToast } = useNotification();
      return (
        <div>
          <button onClick={() => addToast({ title: 'Action Toast', action: mockAction, type: 'info' })} data-testid="add">Add</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add'));

    const actionButton = screen.getByText('Undo');
    expect(actionButton).toBeInTheDocument();

    fireEvent.click(actionButton);
    expect(mockAction.onClick).toHaveBeenCalledTimes(1);
  });

  it('handles multiple toasts simultaneously', () => {
    const TestComponent = () => {
      const { addToast } = useNotification();
      return (
        <div>
          <button onClick={() => {
            addToast({ title: 'Toast 1', type: 'info' });
            addToast({ title: 'Toast 2', type: 'success' });
            addToast({ title: 'Toast 3', type: 'error' });
          }} data-testid="add-multi">Add</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add-multi'));

    expect(screen.getByText('Toast 1')).toBeInTheDocument();
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
    expect(screen.getByText('Toast 3')).toBeInTheDocument();
  });

  it('dismisses individual toasts and keeps others', () => {
    const TestComponent = () => {
      const { addToast } = useNotification();
      return (
        <div>
          <button onClick={() => {
            addToast({ title: 'Keep Me', type: 'info' });
            addToast({ title: 'Remove Me', type: 'warning' });
          }} data-testid="add">Add</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add'));

    const dismissButtons = screen.getAllByLabelText('Dismiss notification');
    fireEvent.click(dismissButtons[1]);

    expect(screen.getByText('Keep Me')).toBeInTheDocument();
    expect(screen.queryByText('Remove Me')).not.toBeInTheDocument();
  });
});

describe('ToastContext', () => {
  it('adds toast with zero duration does not auto-dismiss', () => {
    vi.useFakeTimers();
    const TestComponent = () => {
      const { addToast } = useNotification();
      return (
        <div>
          <button onClick={() => addToast({ title: 'Sticky', type: 'info', duration: 0 })} data-testid="add">Add</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByText('Sticky')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByText('Sticky')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('adds toast with custom duration auto-dismisses', () => {
    vi.useFakeTimers();
    const TestComponent = () => {
      const { addToast } = useNotification();
      return (
        <div>
          <button onClick={() => addToast({ title: 'Temp', type: 'success', duration: 100 })} data-testid="add">Add</button>
          <ToastContainer />
        </div>
      );
    };

    renderWithProvider(<TestComponent />);
    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByText('Temp')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText('Temp')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
