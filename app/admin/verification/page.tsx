"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, Clock3, FileText, Image as ImageIcon, MessageSquare, XCircle } from "lucide-react";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Select } from "@/components/atoms/Select";
import { Text } from "@/components/atoms/Text";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/molecules/Card";
import { mockVerificationComments, mockVerificationQueue } from "@/lib/api/mock/verificationQueue";
import { requestNotificationPermission, showNotification } from "@/lib/notifications";
import type { VerificationComment, VerificationDecision, VerificationDocument, VerificationProject } from "@/lib/types/verification";

interface NotificationEvent {
  id: string;
  projectId: string;
  message: string;
  createdAt: string;
}

const CURRENT_REVIEWER = "Admin Reviewer";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function sortPendingProjects(projects: VerificationProject[]): VerificationProject[] {
  const pending = projects.filter((project) => project.queueStatus === "pending" || project.queueStatus === "resubmitted");
  return [...pending].sort((a, b) => {
    if (a.flagged !== b.flagged) {
      return Number(b.flagged) - Number(a.flagged);
    }

    const aTime = new Date(a.submittedAt).getTime();
    const bTime = new Date(b.submittedAt).getTime();
    return aTime - bTime;
  });
}

function buildDecisionMessage(project: VerificationProject, decision: VerificationDecision): string {
  return `Project ${project.projectName} has been ${decision}.`;
}

function nextCommentId(comments: VerificationComment[]): string {
  return `comment-${comments.length + 1}-${Date.now()}`;
}

function nextNotificationId(notifications: NotificationEvent[]): string {
  return `notification-${notifications.length + 1}-${Date.now()}`;
}

function isLargeDocument(document: VerificationDocument): boolean {
  return document.sizeMb >= 15;
}

export default function VerificationQueuePage(): React.ReactNode {
  const [projects, setProjects] = useState<VerificationProject[]>(mockVerificationQueue);
  const [comments, setComments] = useState<VerificationComment[]>(mockVerificationComments);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const sortedPendingProjects = useMemo(() => sortPendingProjects(projects), [projects]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => (sortedPendingProjects[0] ? sortedPendingProjects[0].id : ""));
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [decisionReason, setDecisionReason] = useState<string>("");
  const [decisionError, setDecisionError] = useState<string>("");
  const [newComment, setNewComment] = useState<string>("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  const effectiveSelectedProjectId = useMemo(() => {
    if (selectedProjectId && sortedPendingProjects.some((project) => project.id === selectedProjectId)) {
      return selectedProjectId;
    }

    return sortedPendingProjects[0]?.id ?? "";
  }, [selectedProjectId, sortedPendingProjects]);

  const selectedProject = useMemo(
    () => sortedPendingProjects.find((project) => project.id === effectiveSelectedProjectId) ?? null,
    [effectiveSelectedProjectId, sortedPendingProjects]
  );

  const effectiveSelectedDocumentId = useMemo(() => {
    if (selectedProject && selectedDocumentId && selectedProject.documents.some((document) => document.id === selectedDocumentId)) {
      return selectedDocumentId;
    }

    return selectedProject?.documents[0]?.id ?? "";
  }, [selectedDocumentId, selectedProject]);

  const selectedDocument = useMemo(
    () => selectedProject?.documents.find((document) => document.id === effectiveSelectedDocumentId) ?? null,
    [effectiveSelectedDocumentId, selectedProject]
  );

  const projectComments = useMemo(
    () => comments.filter((comment) => comment.projectId === effectiveSelectedProjectId),
    [comments, effectiveSelectedProjectId]
  );

  const rootComments = useMemo(
    () => projectComments.filter((comment) => comment.parentId === null).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [projectComments]
  );

  const commentsByParent = useMemo(() => {
    const map: Record<string, VerificationComment[]> = {};
    for (const comment of projectComments) {
      if (!comment.parentId) {
        continue;
      }
      if (!map[comment.parentId]) {
        map[comment.parentId] = [];
      }
      map[comment.parentId].push(comment);
    }

    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    return map;
  }, [projectComments]);

  const blockedByLock = selectedProject ? Boolean(selectedProject.lockOwner && selectedProject.lockOwner !== CURRENT_REVIEWER) : false;
  const hasMissingFields = selectedProject ? selectedProject.missingFields.length > 0 : false;

  const decisionBlockedMessage = blockedByLock
    ? `This project is currently locked by ${selectedProject?.lockOwner}.`
    : hasMissingFields
      ? "Approval is blocked until required fields are completed."
      : "";

  const queueStats = useMemo(() => {
    const flagged = sortedPendingProjects.filter((project) => project.flagged).length;
    const resubmitted = sortedPendingProjects.filter((project) => project.queueStatus === "resubmitted").length;

    return {
      total: sortedPendingProjects.length,
      flagged,
      resubmitted,
    };
  }, [sortedPendingProjects]);

  const handleDecision = (decision: VerificationDecision): void => {
    if (!selectedProject) {
      return;
    }

    const trimmedReason = decisionReason.trim();
    if (!trimmedReason) {
      setDecisionError("Reason is required before approving or rejecting.");
      return;
    }

    if (blockedByLock || (decision === "approved" && hasMissingFields)) {
      setDecisionError(decisionBlockedMessage || "Decision cannot be submitted at this time.");
      return;
    }

    const nowIso = new Date().toISOString();

    setProjects((previousProjects) =>
      previousProjects.map((project) =>
        project.id === selectedProject.id
          ? {
              ...project,
              queueStatus: decision,
              decisionHistory: [
                ...project.decisionHistory,
                {
                  decision,
                  reason: trimmedReason,
                  decidedBy: CURRENT_REVIEWER,
                  decidedAt: nowIso,
                },
              ],
            }
          : project
      )
    );

    const message = buildDecisionMessage(selectedProject, decision);
    showNotification("Verification decision submitted", { body: message });
    setNotifications((previousNotifications) => [
      {
        id: nextNotificationId(previousNotifications),
        projectId: selectedProject.id,
        message,
        createdAt: nowIso,
      },
      ...previousNotifications,
    ]);

    setDecisionReason("");
    setDecisionError("");
  };

  const addComment = (content: string, parentId: string | null): void => {
    if (!selectedProject) {
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return;
    }

    setComments((previousComments) => [
      ...previousComments,
      {
        id: nextCommentId(previousComments),
        projectId: selectedProject.id,
        parentId,
        author: CURRENT_REVIEWER,
        content: trimmedContent,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const handleCreateComment = (): void => {
    addComment(newComment, null);
    setNewComment("");
  };

  const handleCreateReply = (parentId: string): void => {
    const draft = replyDrafts[parentId] ?? "";
    addComment(draft, parentId);
    setReplyDrafts((currentDrafts) => ({ ...currentDrafts, [parentId]: "" }));
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-3">
        <Text as="h1" variant="h2">
          Admin Verification Queue
        </Text>
        <Text variant="muted">Review submitted projects, annotate findings, and make final verification decisions.</Text>
      </header>

      <section aria-label="Queue summary" className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Pending</CardDescription>
            <CardTitle className="text-3xl">{queueStats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Flagged Priority</CardDescription>
            <CardTitle className="text-3xl text-destructive">{queueStats.flagged}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Resubmissions</CardDescription>
            <CardTitle className="text-3xl text-stellar-blue">{queueStats.resubmitted}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <main className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Pending Projects</CardTitle>
            <CardDescription>Sorted by flagged status, then oldest submission date.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul aria-label="Pending verification projects" className="space-y-3">
              {sortedPendingProjects.length === 0 ? (
                <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No pending projects in queue.</li>
              ) : (
                sortedPendingProjects.map((project, index) => {
                  const isSelected = project.id === effectiveSelectedProjectId;
                  const needsAttention = project.flagged || project.missingFields.length > 0;
                  return (
                    <li key={project.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          setSelectedDocumentId("");
                          setDecisionError("");
                          setDecisionReason("");
                          setNewComment("");
                        }}
                          className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          isSelected ? "border-stellar-blue bg-stellar-blue/5" : "border-border hover:border-stellar-blue/40"
                        }`}
                        aria-pressed={isSelected}
                        aria-label={`Select ${project.projectName}`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Priority #{index + 1}</span>
                          <div className="flex items-center gap-2">
                            {project.flagged ? <Badge variant="destructive">Flagged</Badge> : null}
                            {project.queueStatus === "resubmitted" ? <Badge variant="outline">Resubmitted</Badge> : null}
                          </div>
                        </div>
                        <p className="font-medium">{project.projectName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{project.applicantName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Submitted {formatDateOnly(project.submittedAt)}</p>
                        {needsAttention ? (
                          <p className="mt-2 text-xs text-destructive">
                            Requires attention
                            {project.missingFields.length > 0 ? `: ${project.missingFields.length} field(s) incomplete` : ""}
                          </p>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {selectedProject ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-2xl">{selectedProject.projectName}</CardTitle>
                      <CardDescription>
                        {selectedProject.applicantName} • {selectedProject.location}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedProject.flagged ? (
                        <Badge variant="destructive">
                          <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                          Flagged
                        </Badge>
                      ) : null}
                      <Badge variant="outline">
                        <Clock3 className="mr-1 h-3.5 w-3.5" />
                        Submitted {formatDateOnly(selectedProject.submittedAt)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                    <p>
                      Resubmissions: <span className="font-medium text-foreground">{selectedProject.resubmissionCount}</span>
                    </p>
                    <p>
                      Active reviewers: <span className="font-medium text-foreground">{selectedProject.activeReviewers.length}</span>
                    </p>
                  </div>

                  {selectedProject.activeReviewers.length > 1 ? (
                    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700">
                      Concurrent review detected. Coordinate comments to avoid duplicate feedback.
                    </div>
                  ) : null}

                  {selectedProject.missingFields.length > 0 ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                      <p className="mb-2 text-sm font-medium text-destructive">Partially filled application</p>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                        {selectedProject.missingFields.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {selectedProject.decisionHistory.length > 0 ? (
                    <div className="rounded-lg border p-3">
                      <p className="mb-2 text-sm font-medium">Previous decisions</p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {selectedProject.decisionHistory.map((record) => (
                          <li key={`${record.decidedAt}-${record.decidedBy}`} className="rounded-md bg-muted/50 p-2">
                            {record.decision.toUpperCase()} by {record.decidedBy} on {formatDateTime(record.decidedAt)}. Reason: {record.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Submitted Documents</CardTitle>
                  <CardDescription>Preview PDFs and images inline for faster decisions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="block text-sm font-medium" htmlFor="document-picker">
                    Select document
                  </label>
                  <Select
                    id="document-picker"
                    value={effectiveSelectedDocumentId}
                    onChange={(event) => setSelectedDocumentId(event.target.value)}
                    aria-label="Choose a document for inline preview"
                  >
                    {selectedProject.documents.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.name} ({document.type.toUpperCase()}, {document.sizeMb.toFixed(1)} MB)
                      </option>
                    ))}
                  </Select>

                  {selectedDocument ? (
                    <div className="rounded-xl border p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {selectedDocument.type === "pdf" ? (
                            <FileText className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <ImageIcon className="mr-1 h-3.5 w-3.5" />
                          )}
                          {selectedDocument.type.toUpperCase()}
                        </Badge>
                        <Badge variant="outline">{selectedDocument.sizeMb.toFixed(1)} MB</Badge>
                        {selectedDocument.pageCount ? <Badge variant="outline">{selectedDocument.pageCount} pages</Badge> : null}
                        <span className="text-xs text-muted-foreground">Uploaded {formatDateTime(selectedDocument.uploadedAt)}</span>
                      </div>

                      {isLargeDocument(selectedDocument) ? (
                        <p className="mb-3 text-sm text-muted-foreground">
                          Large document detected. Preview may take longer on slower connections.
                        </p>
                      ) : null}

                      {selectedDocument.type === "pdf" ? (
                        <iframe
                          title={`Preview of ${selectedDocument.name}`}
                          src={selectedDocument.url}
                          className="h-[420px] w-full rounded-lg border"
                        />
                      ) : (
                        <Image
                          src={selectedDocument.url}
                          alt={selectedDocument.name}
                          width={1200}
                          height={800}
                          className="max-h-[420px] w-full rounded-lg border object-contain"
                        />
                      )}

                      <a
                        className="mt-3 inline-block text-sm text-stellar-blue underline-offset-2 hover:underline"
                        href={selectedDocument.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open document in new tab
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No document selected.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Decision</CardTitle>
                  <CardDescription>Approve or reject. Reason is required for audit history and applicant notification.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="block text-sm font-medium" htmlFor="decision-reason">
                    Reason
                  </label>
                  <textarea
                    id="decision-reason"
                    value={decisionReason}
                    onChange={(event) => {
                      setDecisionReason(event.target.value);
                      if (decisionError) {
                        setDecisionError("");
                      }
                    }}
                    aria-required="true"
                    aria-invalid={Boolean(decisionError)}
                    className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                    placeholder="Provide a concise rationale for your decision."
                  />

                  {decisionBlockedMessage ? (
                    <p className="text-sm text-destructive" role="status">
                      {decisionBlockedMessage}
                    </p>
                  ) : null}

                  {decisionError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {decisionError}
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      stellar="success"
                      onClick={() => handleDecision("approved")}
                      disabled={blockedByLock || hasMissingFields}
                      aria-label="Approve project"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button stellar="primary-outline" onClick={() => handleDecision("rejected")} disabled={blockedByLock} aria-label="Reject project">
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Threaded Comments</CardTitle>
                  <CardDescription>Use comments for review feedback before final decisions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium" htmlFor="new-comment">
                      New comment
                    </label>
                    <Input
                      id="new-comment"
                      value={newComment}
                      onChange={(event) => setNewComment(event.target.value)}
                      placeholder="Add review feedback for this application."
                      aria-label="Write a new comment"
                    />
                    <Button stellar="primary" onClick={handleCreateComment} aria-label="Post comment">
                      <MessageSquare className="h-4 w-4" />
                      Post comment
                    </Button>
                  </div>

                  <ul className="space-y-3" aria-live="polite">
                    {rootComments.length === 0 ? (
                      <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No comments yet for this project.</li>
                    ) : (
                      rootComments.map((comment) => (
                        <li key={comment.id} className="rounded-lg border p-3">
                          <p className="text-sm font-medium">{comment.author}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</p>
                          <p className="mt-2 text-sm">{comment.content}</p>

                          <div className="mt-3 space-y-2 border-l pl-3">
                            {(commentsByParent[comment.id] ?? []).map((reply) => (
                              <div key={reply.id} className="rounded-md bg-muted/60 p-2">
                                <p className="text-sm font-medium">{reply.author}</p>
                                <p className="text-xs text-muted-foreground">{formatDateTime(reply.createdAt)}</p>
                                <p className="mt-1 text-sm">{reply.content}</p>
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <Input
                              value={replyDrafts[comment.id] ?? ""}
                              onChange={(event) =>
                                setReplyDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [comment.id]: event.target.value,
                                }))
                              }
                              placeholder="Reply to this comment"
                              aria-label={`Reply to comment by ${comment.author}`}
                            />
                            <Button variant="outline" onClick={() => handleCreateReply(comment.id)} aria-label="Post reply">
                              Reply
                            </Button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No pending project selected</CardTitle>
                <CardDescription>All pending projects have been reviewed.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </main>

      <section className="mt-6" aria-label="Notification events">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Notification Log</CardTitle>
            <CardDescription>Tracks decision notifications sent to applicants.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {notifications.length === 0 ? (
                <li className="text-sm text-muted-foreground">No notifications sent in this session.</li>
              ) : (
                notifications.map((notification) => (
                  <li key={notification.id} className="rounded-md border p-2 text-sm">
                    <span className="font-medium">{notification.message}</span>
                    <span className="ml-2 text-muted-foreground">{formatDateTime(notification.createdAt)}</span>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
