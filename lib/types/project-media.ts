/**
 * Project Media Feed Types - Issue #1820
 *
 * Dated verifier photos, drone footage and satellite captures shown to
 * benefactors for a sponsored restoration project.
 */

export type ProjectMediaKind = 'photo' | 'drone' | 'satellite';

export interface ProjectMediaItem {
  id: string;
  projectId: string;
  kind: ProjectMediaKind;
  /** Full-size asset: image URL, or video URL when `isVideo` is true. */
  url: string;
  thumbnailUrl: string;
  /** True when `url` points to video footage rather than a still image. */
  isVideo?: boolean;
  /** ISO date string of when the media was captured. */
  capturedAt: string;
  caption: string;
  /** Verifier or partner who captured the media. */
  capturedBy: string;
  verified: boolean;
}

export type ProjectMediaLoader = (
  projectId: string,
  signal?: AbortSignal
) => Promise<ProjectMediaItem[]>;
