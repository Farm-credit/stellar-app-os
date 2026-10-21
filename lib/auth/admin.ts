import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const ADMIN_ROLE_COOKIE_NAME = 'farmcredit_role';
const ADMIN_ROLE_VALUE = 'admin';

export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  const role = cookieStore.get(ADMIN_ROLE_COOKIE_NAME)?.value;

  return role === ADMIN_ROLE_VALUE;
}

export async function requireAdminAccess(): Promise<void> {
  const isAdmin = await isAdminRequest();

  if (!isAdmin) {
    redirect('/');
  }
}

export async function requireNewsletterEditorAccess(): Promise<void> {
  const isAdmin = await isAdminRequest();

  if (!isAdmin) {
    redirect('/');
  }
}

export type NewsletterStatus = 'draft' | 'scheduled' | 'sent';

export interface NewsletterSection {
  id: string;
  type: 'news' | 'story' | 'species' | 'tip' | 'personalized';
  title: string;
  body: string;
}

export interface Newsletter {
  id: string;
  title: string;
  subject: string;
  month: string;
  status: NewsletterStatus;
  sections: NewsletterSection[];
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewsletterInput {
  title: string;
  subject: string;
  month: string;
  sections: NewsletterSection[];
}

export interface NewsletterPreview {
  newsletter: Newsletter;
  html: string;
}

export interface NewsletterApi {
  list(): Promise<Newsletter[]>;
  create(input: NewsletterInput): Promise<Newsletter>;
  update(id: string, input: Partial<NewsletterInput>): Promise<Newsletter>;
  schedule(id: string, scheduledAt: string): Promise<Newsletter>;
  preview(id: string): Promise<NewsletterPreview>;
}

async function assertAdmin(): Promise<void> {
  const isAdmin = await isAdminRequest();

  if (!isAdmin) {
    throw new Error('Unauthorized: admin access required');
  }
}

function generateId(): string {
  return `nl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function renderSectionHtml(section: NewsletterSection): string {
  const title = escapeHtml(section.title);
  const body = escapeHtml(section.body).replace(/\n/g, '<br />');

  return `<section data-section-type="${section.type}"><h2>${title}</h2><p>${body}</p></section>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderNewsletterHtml(newsletter: Newsletter): string {
  const sections = newsletter.sections.map(renderSectionHtml).join('\n');

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    `<title>${escapeHtml(newsletter.subject)}</title>`,
    '</head>',
    '<body>',
    `<h1>${escapeHtml(newsletter.title)}</h1>`,
    sections,
    '</body>',
    '</html>',
  ].join('\n');
}

const newsletterStore = new Map<string, Newsletter>();

export function createNewsletterApi(): NewsletterApi {
  return {
    async list(): Promise<Newsletter[]> {
      await assertAdmin();

      return Array.from(newsletterStore.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    },

    async create(input: NewsletterInput): Promise<Newsletter> {
      await assertAdmin();

      const now = new Date().toISOString();
      const newsletter: Newsletter = {
        id: generateId(),
        title: input.title,
        subject: input.subject,
        month: input.month,
        status: 'draft',
        sections: input.sections,
        scheduledAt: null,
        createdAt: now,
        updatedAt: now,
      };

      newsletterStore.set(newsletter.id, newsletter);

      return newsletter;
    },

    async update(id: string, input: Partial<NewsletterInput>): Promise<Newsletter> {
      await assertAdmin();

      const existing = newsletterStore.get(id);

      if (!existing) {
        throw new Error(`Newsletter not found: ${id}`);
      }

      const updated: Newsletter = {
        ...existing,
        ...input,
        id: existing.id,
        status: existing.status,
        scheduledAt: existing.scheduledAt,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };

      newsletterStore.set(id, updated);

      return updated;
    },

    async schedule(id: string, scheduledAt: string): Promise<Newsletter> {
      await assertAdmin();

      const existing = newsletterStore.get(id);

      if (!existing) {
        throw new Error(`Newsletter not found: ${id}`);
      }

      const updated: Newsletter = {
        ...existing,
        status: 'scheduled',
        scheduledAt,
        updatedAt: new Date().toISOString(),
      };

      newsletterStore.set(id, updated);

      return updated;
    },

    async preview(id: string): Promise<NewsletterPreview> {
      await assertAdmin();

      const newsletter = newsletterStore.get(id);

      if (!newsletter) {
        throw new Error(`Newsletter not found: ${id}`);
      }

      return {
        newsletter,
        html: renderNewsletterHtml(newsletter),
      };
    },
  };
}