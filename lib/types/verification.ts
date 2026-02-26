export type QueueStatus = "pending" | "resubmitted" | "approved" | "rejected";

export type VerificationDocumentType = "pdf" | "image";

export type VerificationDecision = "approved" | "rejected";

export interface ReviewerPresence {
  reviewerName: string;
  lastActiveAt: string;
}

export interface VerificationDocument {
  id: string;
  name: string;
  url: string;
  type: VerificationDocumentType;
  uploadedAt: string;
  sizeMb: number;
  pageCount?: number;
}

export interface DecisionRecord {
  decision: VerificationDecision;
  reason: string;
  decidedBy: string;
  decidedAt: string;
}

export interface VerificationProject {
  id: string;
  projectName: string;
  applicantName: string;
  location: string;
  submittedAt: string;
  queueStatus: QueueStatus;
  flagged: boolean;
  missingFields: string[];
  resubmissionCount: number;
  documents: VerificationDocument[];
  activeReviewers: ReviewerPresence[];
  lockOwner: string | null;
  decisionHistory: DecisionRecord[];
}

export interface VerificationComment {
  id: string;
  projectId: string;
  parentId: string | null;
  author: string;
  content: string;
  createdAt: string;
}
