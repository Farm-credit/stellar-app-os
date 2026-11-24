export default function StewardNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Steward not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The wallet address must start with G and contain 56 characters.
      </p>
    </main>
  );
}
