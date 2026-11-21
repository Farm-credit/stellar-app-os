import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationProvider, useNotification } from '@/contexts/NotificationContext';

const TestComponent = () => {
  const {
    notifications,
    toasts,
    unreadCount,
    isDrawerOpen,
    addNotification,
    addToast,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    removeNotification,
    dismissToast,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    clearAll,
    clearRead,
    toast,
  } = useNotification();

  // Get the first notification ID for testing
  const firstNotifId = notifications[0]?.id || '';
  const firstToastId = toasts[0]?.id || '';

  return (
    <div>
      <span data-testid="notifications-count">{notifications.length}</span>
      <span data-testid="toasts-count">{toasts.length}</span>
      <span data-testid="toast-duration">{toasts[0]?.duration ?? 'n/a'}</span>
      <span data-testid="unread-count">{unreadCount}</span>
      <span data-testid="drawer-open">{String(isDrawerOpen)}</span>
      <button
        onClick={() => addNotification({ title: 'Test', type: 'payout', priority: 'high' })}
        data-testid="add-notif"
      >
        Add
      </button>
      <button
        onClick={() => addToast({ title: 'Test Toast', type: 'success' })}
        data-testid="add-toast"
      >
        Add Toast
      </button>
      <button onClick={() => markAsRead(firstNotifId)} data-testid="mark-read">
        Mark Read
      </button>
      <button onClick={markAllAsRead} data-testid="mark-all-read">
        Mark All Read
      </button>
      <button onClick={() => archiveNotification(firstNotifId)} data-testid="archive">
        Archive
      </button>
      <button onClick={() => removeNotification(firstNotifId)} data-testid="remove">
        Remove
      </button>
      <button onClick={() => dismissToast(firstToastId)} data-testid="dismiss">
        Dismiss
      </button>
      <button onClick={openDrawer} data-testid="open-drawer">
        Open
      </button>
      <button onClick={closeDrawer} data-testid="close-drawer">
        Close
      </button>
      <button onClick={toggleDrawer} data-testid="toggle-drawer">
        Toggle
      </button>
      <button onClick={clearAll} data-testid="clear-all">
        Clear All
      </button>
      <button onClick={clearRead} data-testid="clear-read">
        Clear Read
      </button>
      <button onClick={() => toast.success('Success!')} data-testid="toast-success">
        Success Toast
      </button>
      <button onClick={() => toast.error('Error!')} data-testid="toast-error">
        Error Toast
      </button>
      <button onClick={() => toast.warning('Warning!')} data-testid="toast-warning">
        Warning Toast
      </button>
      <button onClick={() => toast.info('Info!')} data-testid="toast-info">
        Info Toast
      </button>
      <button onClick={() => toast.contract('Contract!')} data-testid="toast-contract">
        Contract Toast
      </button>
      <button
        onClick={() => addToast({ title: 'Custom', type: 'info', duration: 1500 })}
        data-testid="add-custom-toast"
      >
        Add Custom Toast
      </button>
    </div>
  );
};

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<NotificationProvider>{ui}</NotificationProvider>);
};

describe('NotificationContext', () => {
  it('provides initial notifications', () => {
    renderWithProvider(<TestComponent />);

    expect(screen.getByTestId('notifications-count')).toHaveTextContent('5');
  });

  it('provides initial unread count', () => {
    renderWithProvider(<TestComponent />);

    expect(screen.getByTestId('unread-count')).toHaveTextContent('2');
  });

  it('adds notification', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('add-notif'));

    expect(screen.getByTestId('notifications-count')).toHaveTextContent('6');
  });

  it('adds toast', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('add-toast'));

    expect(screen.getByTestId('toasts-count')).toHaveTextContent('1');
  });

  it('uses the default duration and clamps custom durations to the supported range', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('add-toast'));
    expect(screen.getByTestId('toast-duration')).toHaveTextContent('5000');

    fireEvent.click(screen.getByTestId('add-custom-toast'));
    expect(screen.getByTestId('toast-duration')).toHaveTextContent('2000');

    fireEvent.click(screen.getByTestId('add-custom-toast'));
    expect(screen.getByTestId('toast-duration')).toHaveTextContent('2000');
  });

  it('marks notification as read', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('mark-read'));

    expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
  });

  it('marks all as read', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('mark-all-read'));

    expect(screen.getByTestId('unread-count')).toHaveTextContent('0');
  });

  it('archives notification', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('archive'));

    expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
  });

  it('removes notification', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('remove'));

    expect(screen.getByTestId('notifications-count')).toHaveTextContent('4');
  });

  it('dismisses toast', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('add-toast'));
    // Wait for toast to be added
    waitFor(() => {
      expect(screen.getByTestId('toasts-count')).toHaveTextContent('1');
    });
    fireEvent.click(screen.getByTestId('dismiss'));

    expect(screen.getByTestId('toasts-count')).toHaveTextContent('0');
  });

  it('opens drawer', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('open-drawer'));

    expect(screen.getByTestId('drawer-open')).toHaveTextContent('true');
  });

  it('closes drawer', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('open-drawer'));
    fireEvent.click(screen.getByTestId('close-drawer'));

    expect(screen.getByTestId('drawer-open')).toHaveTextContent('false');
  });

  it('toggles drawer', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('toggle-drawer'));
    expect(screen.getByTestId('drawer-open')).toHaveTextContent('true');

    fireEvent.click(screen.getByTestId('toggle-drawer'));
    expect(screen.getByTestId('drawer-open')).toHaveTextContent('false');
  });

  it('clears all notifications', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('clear-all'));

    expect(screen.getByTestId('notifications-count')).toHaveTextContent('0');
  });

  it('clears read notifications', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('mark-all-read'));
    fireEvent.click(screen.getByTestId('clear-read'));

    // 2 archived notifications remain (notif-4 and notif-5)
    expect(screen.getByTestId('notifications-count')).toHaveTextContent('2');
  });

  it('toast helpers create toasts with correct types', () => {
    renderWithProvider(<TestComponent />);

    fireEvent.click(screen.getByTestId('toast-success'));
    expect(screen.getByTestId('toasts-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByTestId('toast-error'));
    expect(screen.getByTestId('toasts-count')).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('toast-warning'));
    expect(screen.getByTestId('toasts-count')).toHaveTextContent('3');

    fireEvent.click(screen.getByTestId('toast-info'));
    expect(screen.getByTestId('toasts-count')).toHaveTextContent('4');

    fireEvent.click(screen.getByTestId('toast-contract'));
    expect(screen.getByTestId('toasts-count')).toHaveTextContent('5');
  });
});
