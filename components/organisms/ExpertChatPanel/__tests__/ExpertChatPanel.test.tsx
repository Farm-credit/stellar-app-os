import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpertChatPanel } from '../ExpertChatPanel';

const storageKey = 'farmcredit-expert-chat:v2';

function storedTranscript(messages: Array<Record<string, unknown>>) {
  return JSON.stringify({ version: 2, messages });
}

describe('ExpertChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the expert chat interface and primary assistance topics', () => {
    render(<ExpertChatPanel />);

    expect(
      screen.getByRole('heading', { name: /ask a carbon farming expert/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/carbon farming/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/soil health/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/certification/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/market prices/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: /message/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear conversation/i })).toBeInTheDocument();
  });

  it('restores a versioned transcript and bounds the restored history', async () => {
    const savedMessages = Array.from({ length: 52 }, (_, index) => ({
      id: `message-${index}`,
      sender: index % 2 === 0 ? 'user' : 'assistant',
      text: `Saved message ${index}`,
      timestamp: index + 1,
      status: index % 2 === 0 ? 'sent' : 'received',
    }));
    vi.mocked(window.localStorage.getItem).mockReturnValue(storedTranscript(savedMessages));

    render(<ExpertChatPanel />);

    await waitFor(() => expect(screen.getByText('Saved message 51')).toBeInTheDocument());
    expect(screen.queryByText('Saved message 0')).not.toBeInTheDocument();
    expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
    expect(window.localStorage.getItem).toHaveBeenCalledWith(storageKey);
  });

  it('clears the conversation, cancels a pending response, and removes persisted history', async () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(
      storedTranscript([
        {
          id: 'saved-user',
          sender: 'user',
          text: 'A saved farmer question',
          timestamp: 123,
          status: 'sent',
        },
      ])
    );
    render(<ExpertChatPanel />);
    await waitFor(() => expect(screen.getByText('A saved farmer question')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /clear conversation/i }));

    expect(screen.queryByText('A saved farmer question')).not.toBeInTheDocument();
    expect(screen.getByText(/hi, i’m your farmcredit agronomy desk/i)).toBeInTheDocument();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(storageKey);
  });

  it('sends a question and preserves the existing agronomy reply behavior', () => {
    vi.useFakeTimers();
    render(<ExpertChatPanel />);
    const input = screen.getByRole('textbox', { name: /message/i });

    fireEvent.change(input, { target: { value: 'How can I improve soil health?' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(screen.getByText('How can I improve soil health?')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/expert is typing/i);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(
      screen.getByText(/healthy soil starts with a simple baseline: organic matter/i)
    ).toBeInTheDocument();
  });

  it('exposes an accessible live status while loading and after the response', () => {
    vi.useFakeTimers();
    render(<ExpertChatPanel />);
    const input = screen.getByRole('textbox', { name: /message/i });

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    fireEvent.change(input, { target: { value: 'Tell me about certification' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(screen.getByRole('status')).toHaveTextContent(/expert is typing/i);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/conversation ready/i);
  });

  it('allows farmers to send questions about soil health and carbon farming', () => {
    render(<ExpertChatPanel />);

    const textarea = screen.getByRole('textbox', { name: /message/i });
    const sendButton = screen.getByRole('button', { name: /send question/i });

    fireEvent.change(textarea, { target: { value: 'How can I measure my soil carbon levels?' } });
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);
    expect(screen.getByText('How can I measure my soil carbon levels?')).toBeInTheDocument();
  });

  it('allows clicking quick topic suggestions to ask questions', () => {
    render(<ExpertChatPanel />);

    const topicButton = screen.getByRole('button', { name: /^soil health$/i });
    fireEvent.click(topicButton);

    expect(screen.getAllByText('Soil health').length).toBeGreaterThan(0);
  });
});
