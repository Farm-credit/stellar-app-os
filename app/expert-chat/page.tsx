import { ExpertChatPanel } from '@/components/organisms/ExpertChatPanel/ExpertChatPanel';

export default function ExpertChatPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
            Farmer support
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Live chat with agricultural experts
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            Talk with specialists who can help you answer practical questions about carbon farming,
            soil health, certification, and current market prices.
          </p>
        </div>

        <ExpertChatPanel />
      </div>
    </main>
  );
}
