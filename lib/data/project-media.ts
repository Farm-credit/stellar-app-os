/**
 * Mock Project Media Data - Issue #1820
 */

import type { ProjectMediaItem } from '@/lib/types/project-media';

const photo = (id: string): string => `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80`;

export const mockProjectMedia: ProjectMediaItem[] = [
  {
    id: 'pm-001',
    projectId: 'proj-001',
    kind: 'photo',
    url: `${photo('photo-1542601906990-b4d3fb778b09')}&w=1600`,
    thumbnailUrl: `${photo('photo-1542601906990-b4d3fb778b09')}&w=400`,
    capturedAt: '2026-09-02T08:15:00Z',
    caption: 'Seedlings six weeks after planting, block A',
    capturedBy: 'Verifier Amina Yusuf',
    verified: true,
  },
  {
    id: 'pm-002',
    projectId: 'proj-001',
    kind: 'drone',
    url: `${photo('photo-1516026672322-bc52d61a55d5')}&w=1600`,
    thumbnailUrl: `${photo('photo-1516026672322-bc52d61a55d5')}&w=400`,
    capturedAt: '2026-10-15T10:30:00Z',
    caption: 'Canopy survey from 120 m, north plot',
    capturedBy: 'Partner drone team',
    verified: true,
  },
  {
    id: 'pm-003',
    projectId: 'proj-001',
    kind: 'satellite',
    url: `${photo('photo-1446776811953-b23d57bd21aa')}&w=1600`,
    thumbnailUrl: `${photo('photo-1446776811953-b23d57bd21aa')}&w=400`,
    capturedAt: '2026-11-01T12:00:00Z',
    caption: 'Quarterly satellite pass showing canopy growth',
    capturedBy: 'Satellite verification service',
    verified: true,
  },
  {
    id: 'pm-004',
    projectId: 'proj-002',
    kind: 'photo',
    url: `${photo('photo-1542273917363-3b1817f69a2d')}&w=1600`,
    thumbnailUrl: `${photo('photo-1542273917363-3b1817f69a2d')}&w=400`,
    capturedAt: '2026-10-20T09:00:00Z',
    caption: 'Community steward inspecting saplings',
    capturedBy: 'Verifier Chidi Okafor',
    verified: false,
  },
];

export function getProjectMedia(projectId: string): ProjectMediaItem[] {
  return mockProjectMedia.filter((item) => item.projectId === projectId);
}
