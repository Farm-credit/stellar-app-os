// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project Comparison Export & Share helpers
 * Issue #1416: side-by-side review enhancement
 */

import type { Project } from '@/lib/projectComparison';

const STORAGE_KEY = 'stellar-comparison-saved';

export interface SavedComparison {
  id: string;
  name: string;
  projectIds: string[];
  criteria: string[];
  createdAt: string;
}

export function getSavedComparisons(): SavedComparison[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveComparison(comp: Omit<SavedComparison, 'id' | 'createdAt'>): SavedComparison {
  const saved = getSavedComparisons();
  const entry: SavedComparison = {
    ...comp,
    id: `cmp-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  saved.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 20)));
  return entry;
}

export function deleteSavedComparison(id: string): void {
  const saved = getSavedComparisons().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

export function buildShareUrl(projectIds: string[], criteria?: string[]): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams({ ids: projectIds.join(',') });
  if (criteria?.length) params.set('cols', criteria.join(','));
  return `${window.location.origin}/projects/compare?${params.toString()}`;
}

export function parseShareUrl(search: string): { ids: string[]; cols: string[] } {
  const params = new URLSearchParams(search);
  return {
    ids: (params.get('ids') || '').split(',').filter(Boolean),
    cols: (params.get('cols') || '').split(',').filter(Boolean),
  };
}

export function toCsv(projects: Project[], criteriaIds: string[]): string {
  const headers = ['criteria', ...projects.map((p) => `"${p.name.replace(/"/g, '""')}"`)];
  const rows: string[][] = [headers];

  for (const cid of criteriaIds) {
    const row = [cid];
    for (const p of projects) {
      const val = (p as unknown as Record<string, unknown>)[cid];
      if (Array.isArray(val)) row.push(`"${(val as string[]).join('; ')}"`);
      else row.push(`"${String(val ?? '').replace(/"/g, '""')}"`);
    }
    rows.push(row);
  }
  return rows.map((r) => r.join(',')).join('\n');
}

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
