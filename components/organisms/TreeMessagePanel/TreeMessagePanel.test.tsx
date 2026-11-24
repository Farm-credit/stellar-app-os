import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldThreadView } from '@/lib/types/field-messaging';
import { TreeMessagePanel } from './TreeMessagePanel';

const emptyThread: FieldThreadView = {
  treeId: 'tree-001',
  sponsorLanguage: 'en',
  fieldTeamLanguage: 'ha',
  messages: [],
  slaBusinessDays: 5,
  replyDueAt: null,
  overdue: false,
};

function respond(thread: FieldThreadView, status = 200) {
  return Promise.resolve(new Response(JSON.stringify({ success: true, thread }), { status }));
}

describe('TreeMessagePanel', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the 5 business day response time before any message is sent', () => {
    render(<TreeMessagePanel treeId="tree-001" language="en" />);

    expect(screen.getByText(/replies within 5 business days/i)).toBeInTheDocument();
  });

  it('asks the visitor to connect a wallet instead of showing the form', () => {
    render(<TreeMessagePanel treeId="tree-001" language="en" />);

    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the thread and says translation is on when languages differ', async () => {
    fetchMock.mockReturnValueOnce(respond(emptyThread));
    render(<TreeMessagePanel treeId="tree-001" sponsorId="GSPONSOR" language="en" />);

    await waitFor(() =>
      expect(screen.getByText(/translated between English and Hausa/i)).toBeInTheDocument()
    );
    expect(fetchMock.mock.calls[0][0]).toContain('/api/trees/tree-001/messages?');
    expect(fetchMock.mock.calls[0][0]).toContain('sponsorId=GSPONSOR');
  });

  it('sends a message in the sponsor language and shows the reply deadline', async () => {
    fetchMock.mockReturnValueOnce(respond(emptyThread));
    render(<TreeMessagePanel treeId="tree-001" sponsorId="GSPONSOR" language="es" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fetchMock.mockReturnValueOnce(
      respond({
        ...emptyThread,
        sponsorLanguage: 'es',
        messages: [
          {
            id: 'fmsg-1',
            senderRole: 'sponsor',
            text: 'Hola',
            originalText: 'Hola',
            translated: false,
            translationUnavailable: false,
            language: 'es',
            createdAt: '2026-10-19T09:00:00.000Z',
          },
        ],
        replyDueAt: '2026-10-26T09:00:00.000Z',
      })
    );
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Hola' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(screen.getByText(/reply expected by/i)).toBeInTheDocument());
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      sponsorId: 'GSPONSOR',
      body: 'Hola',
      language: 'es',
    });
    expect(screen.getByLabelText('Your message')).toHaveValue('');
  });

  it('shows a translated reply with its original text', async () => {
    fetchMock.mockReturnValueOnce(
      respond({
        ...emptyThread,
        messages: [
          {
            id: 'fmsg-2',
            senderRole: 'field_team',
            text: 'Your tree is doing well',
            originalText: 'Yana lafiya',
            translated: true,
            translationUnavailable: false,
            language: 'ha',
            createdAt: '2026-10-20T09:00:00.000Z',
          },
        ],
      })
    );
    render(<TreeMessagePanel treeId="tree-001" sponsorId="GSPONSOR" language="en" />);

    await waitFor(() => expect(screen.getByText('Your tree is doing well')).toBeInTheDocument());
    expect(screen.getByText(/translated from hausa/i)).toBeInTheDocument();
    expect(screen.getByText('Yana lafiya')).toBeInTheDocument();
  });

  it('flags an overdue reply', async () => {
    fetchMock.mockReturnValueOnce(
      respond({ ...emptyThread, replyDueAt: '2026-10-01T09:00:00.000Z', overdue: true })
    );
    render(<TreeMessagePanel treeId="tree-001" sponsorId="GSPONSOR" language="en" />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/was due by/i));
  });

  it('shows an error when sending fails', async () => {
    fetchMock.mockReturnValueOnce(respond(emptyThread));
    render(<TreeMessagePanel treeId="tree-001" sponsorId="GSPONSOR" language="en" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fetchMock.mockReturnValueOnce(
      Promise.resolve(new Response(JSON.stringify({ error: 'Tree not found' }), { status: 404 }))
    );
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Tree not found'));
  });
});
