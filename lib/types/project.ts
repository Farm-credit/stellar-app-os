
export type ProjectStatus = "active" | "completed" | "paused" | "upcoming";
export type MilestoneStatus = "done" | "active" | "pending";
export type MediaKind = "image" | "video";
export type MetricVariant = "green" | "blue" | "amber" | "stone";
export type DocType = "verification" | "audit" | "report" | "certificate";


export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ProjectLocation {
  label: string;
  country: string;
  region: string;
  coordinates: Coordinates;
}

export interface HeroMedia {
  kind: MediaKind;
  src: string;
  alt: string;
  poster?: string;
}

export interface ImpactMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  suffix?: string;
  icon: string;
  variant: MetricVariant;
  helpText: string;
}

export interface Milestone {
  id: string;
  title: string;
  body: string;
  date: string;
  status: MilestoneStatus;
  completedDate?: string;
}

export interface MRVDocument {
  id: string;
  title: string;
  docType: DocType;
  issuer: string;
  issuedAt: string;
  href: string;
  fileSizeKb: number;
}

export interface Organisation {
  name: string;
  website: string;
  verified: boolean;
}

export interface ProjectProgress {
  treesTarget: number;
  treesPlanted: number;
  co2TargetTonnes: number;
  co2RemovedTonnes: number;
  fundingGoalUsd: number;
  fundingRaisedUsd: number;
}

export interface RelatedProject {
  id: string;
  title: string;
  coverSrc: string;
  location: string;
  status: ProjectStatus;
  treesPlanted: number;
  co2RemovedTonnes: number;
  creditPriceUsd: number;
}

export interface Project {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  status: ProjectStatus;
  organisation: Organisation;
  location: ProjectLocation;
  hero: HeroMedia;
  excerpt: string;
  bodyHtml: string;
  metrics: ImpactMetric[];
  milestones: Milestone[];
  mrvDocuments: MRVDocument[];
  relatedProjects: RelatedProject[];
  progress: ProjectProgress;
  tags: string[];
  creditPriceUsd: number;
  minCredits: number;
  publishedAt: string;
  updatedAt: string;
}
