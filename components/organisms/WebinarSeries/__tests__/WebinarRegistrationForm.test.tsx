import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebinarRegistrationForm } from '../WebinarRegistrationForm';

function fill(name: string, email: string) {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
}

describe('WebinarRegistrationForm (#1419)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows validation errors without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<WebinarRegistrationForm slug="s" title="Soil testing" isFull={false} />);

    fill('A', 'nope');
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('confirms a registration', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ registration: { status: 'registered' } }), { status: 201 })
      );
    render(<WebinarRegistrationForm slug="soil-101" title="Soil testing" isFull={false} />);

    fill('Ada Obi', 'ada@farm.ng');
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      "You're registered for Soil testing"
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v2/webinars/soil-101/registrations',
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toEqual({
      name: 'Ada Obi',
      email: 'ada@farm.ng',
    });
  });

  it('offers the waitlist when the session is full', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ registration: { status: 'waitlisted' } }), { status: 201 })
    );
    render(<WebinarRegistrationForm slug="s" title="Soil testing" isFull />);

    fill('Ada Obi', 'ada@farm.ng');
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    expect(await screen.findByRole('status')).toHaveTextContent("You're on the waitlist");
  });

  it('shows server errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'This email is already registered for the session' }), {
        status: 409,
      })
    );
    render(<WebinarRegistrationForm slug="s" title="Soil testing" isFull={false} />);

    fill('Ada Obi', 'ada@farm.ng');
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already registered');
  });
});
