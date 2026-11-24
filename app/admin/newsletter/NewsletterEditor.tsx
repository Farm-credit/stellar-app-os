import type { ReactNode } from 'react';

interface NewsletterEditorProps {
  editorName?: string | null;
  editorEmail?: string | null;
}

export default function NewsletterEditor({
  editorName,
  editorEmail,
}: NewsletterEditorProps): ReactNode {
  return (
    <section
      aria-labelledby="newsletter-editor-heading"
      className="rounded-lg border border-gray-200 bg-white p-6"
    >
      <h2 id="newsletter-editor-heading" className="text-xl font-semibold text-gray-900">
        Compose newsletter
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Draft prepared by {editorName ?? editorEmail ?? 'Newsletter editor'}.
      </p>
      <div className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="newsletter-subject" className="text-sm font-medium text-gray-900">
            Subject
          </label>
          <input
            id="newsletter-subject"
            name="subject"
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            readOnly
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="newsletter-body" className="text-sm font-medium text-gray-900">
            Body
          </label>
          <textarea
            id="newsletter-body"
            name="body"
            rows={8}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            readOnly
          />
        </div>
      </div>
    </section>
  );
}
