interface CommentSectionProps {
  enabled?: boolean;
}

export function CommentSection({ enabled = false }: CommentSectionProps) {
  if (!enabled) {
    return null;
  }

  return (
    <section aria-labelledby="comments-heading" className="mt-12 rounded-xl border bg-card p-6">
      <h2 id="comments-heading" className="mb-2 text-2xl font-semibold tracking-tight">
        Comments
      </h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Community comments are in early access. Be respectful and constructive.
      </p>

      <form className="space-y-4" aria-label="Comment form">
        <div>
          <label htmlFor="comment-name" className="mb-1 block text-sm font-medium">
            Name
          </label>
          <input
            id="comment-name"
            name="name"
            type="text"
            required
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="comment-email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="comment-email"
            name="email"
            type="email"
            required
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="comment-message" className="mb-1 block text-sm font-medium">
            Comment
          </label>
          <textarea
            id="comment-message"
            name="comment"
            rows={5}
            required
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          disabled
          className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
          aria-disabled="true"
        >
          Posting soon
        </button>
      </form>
    </section>
  );
}
