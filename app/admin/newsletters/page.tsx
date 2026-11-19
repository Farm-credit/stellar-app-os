'use client';

import { useMemo, useState } from 'react';
import { useSponsorTrees } from '@/hooks/useSponsorTrees';

type NewsletterStatus = 'draft' | 'scheduled' | 'published';

interface Newsletter {
  id: string;
  month: string;
  platformNews: string;
  featuredStory: string;
  speciesSpotlight: string;
  conservationTip: string;
  status: NewsletterStatus;
  scheduledFor?: string;
  publishedAt?: string;
}

const initialNewsletters: Newsletter[] = [
  {
    id: 'nl-2024-05',
    month: '2024-05',
    platformNews: 'We planted our 2 millionth tree this month!',
    featuredStory: 'Restoring the Atlantic Forest with local communities.',
    speciesSpotlight: 'Ceiba pentandra — the Kapok tree.',
    conservationTip: 'Reduce single-use plastics to protect waterways.',
    status: 'published',
    publishedAt: '2024-05-01',
  },
  {
    id: 'nl-2024-06',
    month: '2024-06',
    platformNews: 'New sponsor dashboard features are live.',
    featuredStory: 'Mangrove revival along the Kenyan coast.',
    speciesSpotlight: 'Rhizophora mangle — the Red Mangrove.',
    conservationTip: 'Support local nurseries when planting native species.',
    status: 'scheduled',
    scheduledFor: '2024-06-01',
  },
  {
    id: 'nl-2024-07',
    month: '2024-07',
    platformNews: '',
    featuredStory: '',
    speciesSpotlight: '',
    conservationTip: '',
    status: 'draft',
  },
];

const emptyForm = {
  month: '',
  platformNews: '',
  featuredStory: '',
  speciesSpotlight: '',
  conservationTip: '',
};

function statusBadge(status: NewsletterStatus) {
  const styles: Record<NewsletterStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    scheduled: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function AdminNewslettersPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>(initialNewsletters);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Sample sponsor for the personalised tree-updates preview.
  const sampleSponsorId = 'sample-sponsor-1';
  const { trees, isLoading: treesLoading } = useSponsorTrees(sampleSponsorId);

  const treeUpdatesPreview = useMemo(() => {
    if (treesLoading) {
      return <p className="text-sm text-gray-500">Loading tree updates…</p>;
    }
    if (!trees || trees.length === 0) {
      return <p className="text-sm text-gray-500">No tree updates for this sponsor yet.</p>;
    }
    return (
      <ul className="space-y-2">
        {trees.slice(0, 5).map((tree: any) => (
          <li key={tree.id} className="rounded border border-gray-200 p-2 text-sm">
            <span className="font-medium">{tree.species ?? 'Tree'}</span>
            {tree.location ? <span className="text-gray-600"> — {tree.location}</span> : null}
            {tree.plantedAt ? (
              <span className="block text-xs text-gray-500">
                Planted {new Date(tree.plantedAt).toLocaleDateString()}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }, [trees, treesLoading]);

  const handleChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setScheduleDate('');
  };

  const handleSaveDraft = () => {
    if (!form.month) {
      setFeedback('Please select a month before saving.');
      return;
    }
    if (editingId) {
      setNewsletters((prev) =>
        prev.map((n) => (n.id === editingId ? { ...n, ...form, status: 'draft' } : n)),
      );
    } else {
      const id = `nl-${form.month}-${Date.now()}`;
      setNewsletters((prev) => [{ id, ...form, status: 'draft' }, ...prev]);
    }
    setFeedback('Draft saved.');
    resetForm();
  };

  const handleSchedule = () => {
    if (!form.month) {
      setFeedback('Please select a month before scheduling.');
      return;
    }
    if (!scheduleDate) {
      setFeedback('Please choose a schedule date.');
      return;
    }
    if (editingId) {
      setNewsletters((prev) =>
        prev.map((n) =>
          n.id === editingId ? { ...n, ...form, status: 'scheduled', scheduledFor: scheduleDate } : n,
        ),
      );
    } else {
      const id = `nl-${form.month}-${Date.now()}`;
      setNewsletters((prev) => [
        { id, ...form, status: 'scheduled', scheduledFor: scheduleDate },
        ...prev,
      ]);
    }
    setFeedback(`Newsletter scheduled for ${scheduleDate}.`);
    resetForm();
  };

  const handlePublish = () => {
    if (!form.month) {
      setFeedback('Please select a month before publishing.');
      return;
    }
    const publishedAt = new Date().toISOString().slice(0, 10);
    if (editingId) {
      setNewsletters((prev) =>
        prev.map((n) =>
          n.id === editingId ? { ...n, ...form, status: 'published', publishedAt } : n,
        ),
      );
    } else {
      const id = `nl-${form.month}-${Date.now()}`;
      setNewsletters((prev) => [{ id, ...form, status: 'published', publishedAt }, ...prev]);
    }
    setFeedback('Newsletter published.');
    resetForm();
  };

  const handleEdit = (newsletter: Newsletter) => {
    setEditingId(newsletter.id);
    setForm({
      month: newsletter.month,
      platformNews: newsletter.platformNews,
      featuredStory: newsletter.featuredStory,
      speciesSpotlight: newsletter.speciesSpotlight,
      conservationTip: newsletter.conservationTip,
    });
    setScheduleDate(newsletter.scheduledFor ?? '');
    setFeedback(null);
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Monthly Forest Health Newsletter</h1>
        <p className="mt-1 text-sm text-gray-600">
          Compose and manage the curated monthly newsletter sent to all sponsors.
        </p>
      </header>

      {feedback ? (
        <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {feedback}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Newsletter list */}
        <section className="lg:col-span-1">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Newsletters</h2>
          <ul className="space-y-3">
            {newsletters.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{n.month}</span>
                  {statusBadge(n.status)}
                </div>
                {n.scheduledFor ? (
                  <p className="mt-1 text-xs text-gray-500">Scheduled: {n.scheduledFor}</p>
                ) : null}
                {n.publishedAt ? (
                  <p className="mt-1 text-xs text-gray-500">Published: {n.publishedAt}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleEdit(n)}
                  className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Composer */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            {editingId ? 'Edit newsletter' : 'Compose newsletter'}
          </h2>
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div>
              <label htmlFor="month" className="block text-sm font-medium text-gray-700">
                Month
              </label>
              <input
                id="month"
                type="month"
                value={form.month}
                onChange={(e) => handleChange('month', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="platformNews" className="block text-sm font-medium text-gray-700">
                Platform news
              </label>
              <textarea
                id="platformNews"
                rows={3}
                value={form.platformNews}
                onChange={(e) => handleChange('platformNews', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="featuredStory" className="block text-sm font-medium text-gray-700">
                Featured reforestation story
              </label>
              <textarea
                id="featuredStory"
                rows={3}
                value={form.featuredStory}
                onChange={(e) => handleChange('featuredStory', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="speciesSpotlight" className="block text-sm font-medium text-gray-700">
                Species spotlight
              </label>
              <textarea
                id="speciesSpotlight"
                rows={2}
                value={form.speciesSpotlight}
                onChange={(e) => handleChange('speciesSpotlight', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="conservationTip" className="block text-sm font-medium text-gray-700">
                Conservation tip
              </label>
              <textarea
                id="conservationTip"
                rows={2}
                value={form.conservationTip}
                onChange={(e) => handleChange('conservationTip', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
              >
                Save draft
              </button>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  aria-label="Schedule date"
                />
                <button
                  type="button"
                  onClick={handleSchedule}
                  className="rounded bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600"
                >
                  Schedule
                </button>
              </div>
              <button
                type="button"
                onClick={handlePublish}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Publish
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="ml-auto text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>

          {/* Personalised tree updates preview */}
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              Personalised tree updates (preview)
            </h3>
            <p className="mb-3 text-xs text-gray-500">
              Each sponsor sees their own tree updates in this section. Preview shown for a sample
              sponsor.
            </p>
            {treeUpdatesPreview}
          </div>
        </section>
      </div>
    </div>
  );
}