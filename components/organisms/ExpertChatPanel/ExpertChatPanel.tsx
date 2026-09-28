'use client';

import { useMemo, useState } from 'react';

const topicSuggestions = [
  'Carbon farming',
  'Soil health',
  'Certification',
  'Market prices',
  'Field measurements',
];

type ChatMessage = {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
};

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    sender: 'assistant',
    text: 'Hi, I’m your FarmCredit agronomy desk. I can help with carbon farming plans, soil conditions, certification readiness, and carbon market pricing.',
  },
  {
    id: 'example',
    sender: 'assistant',
    text: 'Ask about field sampling, verification requirements, or the best time to sell verified credits.',
  },
];

function buildAssistantReply(input: string): string {
  const normalized = input.toLowerCase();

  if (normalized.includes('carbon') || normalized.includes('farming')) {
    return 'For carbon farming, start with a field baseline, improve soil cover, reduce disturbance, and keep records of inputs, yields, and sequestration evidence. A credible plan usually combines regenerative practices with consistent measurement and verification.';
  }

  if (normalized.includes('soil')) {
    return 'Healthy soil starts with a simple baseline: organic matter, pH, moisture retention, and compaction. Focus on cover crops, residue retention, and targeted nutrient management so you can show measurable improvement over time.';
  }

  if (normalized.includes('certif')) {
    return 'Certification readiness depends on traceability and recordkeeping. Keep field maps, input logs, training records, and sales documents organized, then review your evidence against the standard before the site audit.';
  }

  if (normalized.includes('market') || normalized.includes('price')) {
    return 'Pricing varies by standard, region, buyer demand, and co-benefit claims. Compare offers by verified tonnes, delivery timing, and whether the buyer requires additional assurance or MRV documentation.';
  }

  return 'I can help with field planning, soil health, certification, or market strategy. Share the specific challenge you are facing and I’ll suggest the next practical step.';
}

export function ExpertChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const experts = useMemo(
    () => [
      { name: 'Dr. Ada Mensah', specialty: 'Soil science', status: 'Online' },
      { name: 'Samuel Nwosu', specialty: 'Carbon methodologies', status: 'Busy' },
      { name: 'Grace Okafor', specialty: 'Certification support', status: 'Online' },
    ],
    []
  );

  const handleSend = (customPrompt?: string) => {
    const trimmed = (customPrompt ?? input).trim();

    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      sender: 'user',
      text: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsSending(true);

    window.setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        sender: 'assistant',
        text: buildAssistantReply(trimmed),
      };

      setMessages((current) => [...current, assistantMessage]);
      setIsSending(false);
    }, 500);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSend();
  };

  return (
    <section className="w-full max-w-6xl rounded-[28px] border border-border bg-card p-4 shadow-sm sm:p-6 lg:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm font-medium text-stellar-blue">
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            Live expert support
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Ask a carbon farming expert
            </h2>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              Speak with qualified advisors who can help farmers understand carbon farming, soil
              health, certification, and market pricing in clear, practical language.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {topicSuggestions.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => handleSend(topic)}
                className="rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-stellar-blue hover:text-stellar-blue"
              >
                {topic}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 shadow-inner">
            <div className="flex max-h-[360px] flex-col gap-3 overflow-y-auto pr-1">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.sender === 'assistant'
                      ? 'bg-muted text-foreground'
                      : 'ml-auto bg-stellar-blue text-white'
                  }`}
                >
                  {message.text}
                </div>
              ))}

              {isSending && (
                <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
                  Expert is typing...
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label htmlFor="expert-chat-input" className="sr-only">
              Message
            </label>
            <textarea
              id="expert-chat-input"
              aria-label="Message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about soil health, carbon methods, certification, or market prices..."
              rows={3}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/20"
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Average response time: under 4 minutes
              </p>
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="rounded-full bg-stellar-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stellar-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send question
              </button>
            </div>
          </form>
        </div>

        <aside className="rounded-2xl border border-border bg-background p-5">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Agronomy team</h3>
            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700">
              3 online
            </span>
          </div>

          <div className="space-y-4">
            {experts.map((expert) => (
              <div key={expert.name} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{expert.name}</p>
                    <p className="text-sm text-muted-foreground">{expert.specialty}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${
                      expert.status === 'Online'
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : 'bg-amber-500/10 text-amber-700'
                    }`}
                  >
                    {expert.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-stellar-blue/5 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-stellar-blue">
              Popular topics
            </p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• How to improve soil organic carbon</li>
              <li>• Preparing for verification and audits</li>
              <li>• Timing your credit sales for better margins</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
