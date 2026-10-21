import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VolunteerCoordination } from './VolunteerCoordination';

const event = {
  id: 'event-1',
  coordinator_wallet: 'owner',
  title: 'Riverbank planting',
  location: 'North gate',
  briefing: 'Bring gloves and drinking water.',
  starts_at: new Date(Date.now() + 3600000).toISOString(),
  ends_at: new Date(Date.now() + 7200000).toISOString(),
};
const registration = {
  id: 'person-1',
  event_id: event.id,
  wallet: 'volunteer',
  name: 'Pat',
  email: 'pat@example.test',
  role: 'digger',
  minutes: null,
  briefing_sent_at: null,
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
function respond(wallet: string, registrations = [registration], ended = false) {
  const data = ended
    ? { ...event, starts_at: '2020-01-01T10:00:00Z', ends_at: '2020-01-01T12:00:00Z' }
    : event;
  fetchMock.mockImplementation((path: string) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          path.endsWith('/session')
            ? { wallet }
            : path.endsWith('/event-1')
              ? { event: data, volunteers: registrations }
              : { events: [data] }
        ),
    })
  );
}

describe('volunteer coordination interface', () => {
  it('lets the coordinator assign a role and shows the briefing', async () => {
    respond('owner');
    render(<VolunteerCoordination />);
    fireEvent.click(await screen.findByRole('button', { name: /Riverbank planting/ }));
    const role = await screen.findByLabelText('Assigned role for Pat');
    expect(screen.getByText('Bring gloves and drinking water.')).toBeInTheDocument();
    fireEvent.change(role, { target: { value: 'photographer' } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/planting/events/event-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ action: 'role', volunteerId: 'person-1', role: 'photographer' }),
        })
      )
    );
  });

  it('lets a volunteer sign up without showing coordinator controls', async () => {
    respond('volunteer', []);
    render(<VolunteerCoordination />);
    fireEvent.click(await screen.findByRole('button', { name: /Riverbank planting/ }));
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Pat' } });
    fireEvent.change(screen.getByLabelText('Briefing email'), {
      target: { value: 'pat@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/planting/events/event-1',
        expect.objectContaining({ method: 'POST' })
      )
    );
    expect(screen.queryByLabelText('Assigned role for Pat')).not.toBeInTheDocument();
  });

  it('opens hours logging after the event and submits integer minutes', async () => {
    respond('volunteer', [registration], true);
    render(<VolunteerCoordination />);
    fireEvent.click(await screen.findByRole('button', { name: /Riverbank planting/ }));
    fireEvent.change(await screen.findByLabelText('Minutes volunteered'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save hours' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/planting/events/event-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ action: 'hours', volunteerId: 'person-1', minutes: 90 }),
        })
      )
    );
  });

  it('shows server failures instead of reporting a successful signup', async () => {
    respond('volunteer', []);
    render(<VolunteerCoordination />);
    fireEvent.click(await screen.findByRole('button', { name: /Riverbank planting/ }));
    await screen.findByLabelText('Your name');
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Sign-up has closed' }),
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign up' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-up has closed');
  });
});
