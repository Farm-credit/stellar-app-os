'use client';

import {
  useId,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Checkbox } from '@/components/atoms/Checkbox';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import type {
  AdminActivityLogEntry,
  AdminCreditIssuanceRecord,
  AdminMrvDocument,
  AdminProjectDetail,
  AdminProjectFormValues,
  AdminProjectLifecycleStatus,
  AdminProjectType,
  AdminRiskRating,
} from '@/lib/types/adminProject';

const PROJECT_TYPE_OPTIONS: AdminProjectType[] = [
  'Reforestation',
  'Renewable Energy',
  'Mangrove Restoration',
  'Sustainable Agriculture',
  'Blue Carbon',
  'Direct Air Capture',
  'Other',
];

const LIFECYCLE_STATUS_OPTIONS: AdminProjectLifecycleStatus[] = [
  'Draft',
  'Under Review',
  'Approved',
  'Paused',
  'Archived',
];

const RISK_RATING_OPTIONS: AdminRiskRating[] = ['Low', 'Medium', 'High'];

const ACTIVE_ADMIN_NAME = 'Admin User';

interface AdminProjectDetailViewProps {
  initialProject: AdminProjectDetail;
}

export function AdminProjectDetailView({ initialProject }: AdminProjectDetailViewProps): ReactNode {
  const [project, setProject] = useState<AdminProjectDetail>(initialProject);
  const [formValues, setFormValues] = useState<AdminProjectFormValues>(() =>
    toFormValues(initialProject)
  );
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const [isSaving, startSavingTransition] = useTransition();
  const uploadInputId = useId();

  const issuanceTotal = project.creditIssuanceHistory.reduce(
    (sum, record) => sum + record.quantityTons,
    0
  );

  function setField<K extends keyof AdminProjectFormValues>(
    field: K,
    value: AdminProjectFormValues[K]
  ): void {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function handleSave(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    startSavingTransition(() => {
      setProject((current) => {
        const updated = applyFormValues(current, formValues);
        const withAudit = {
          ...updated,
          lastUpdatedAt: new Date().toISOString(),
          lastUpdatedBy: ACTIVE_ADMIN_NAME,
          activityLog: [
            createActivityEntry(
              'Saved project fields',
              'Updated editable project metadata and verification notes.'
            ),
            ...updated.activityLog,
          ],
        };

        setFormValues(toFormValues(withAudit));
        return withAudit;
      });
      setStatusMessage('Project details saved successfully.');
    });
  }

  function handleVerificationToggle(nextChecked: boolean): void {
    setProject((current) => ({
      ...current,
      verificationEnabled: nextChecked,
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: ACTIVE_ADMIN_NAME,
      activityLog: [
        createActivityEntry(
          nextChecked ? 'Verification enabled' : 'Verification disabled',
          nextChecked
            ? 'Admin enabled project verification status.'
            : 'Admin disabled project verification status.'
        ),
        ...current.activityLog,
      ],
    }));

    setFormValues((current) => ({ ...current, verificationEnabled: nextChecked }));
    setStatusMessage(
      nextChecked ? 'Verification status enabled.' : 'Verification status disabled.'
    );
  }

  function handleMrvUpload(event: ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const uploadedAt = new Date().toISOString();
    const uploadedDocuments: AdminMrvDocument[] = Array.from(files).map((file, index) => ({
      id: `mrv-${Date.now()}-${index}`,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      uploadedAt,
      uploadedBy: ACTIVE_ADMIN_NAME,
      version: 'v1.0',
      status: 'Pending Review',
    }));

    setProject((current) => ({
      ...current,
      lastUpdatedAt: uploadedAt,
      lastUpdatedBy: ACTIVE_ADMIN_NAME,
      mrvDocuments: [...uploadedDocuments, ...current.mrvDocuments],
      activityLog: [
        createActivityEntry(
          'Uploaded MRV document',
          `Added ${uploadedDocuments.length} file(s): ${uploadedDocuments
            .map((document) => document.fileName)
            .join(', ')}`
        ),
        ...current.activityLog,
      ],
    }));

    setUploadMessage(
      `${uploadedDocuments.length} MRV document${
        uploadedDocuments.length === 1 ? '' : 's'
      } uploaded.`
    );
    setStatusMessage('');
    event.target.value = '';
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Text as="h1" variant="h2" className="mb-2">
            Admin Project Detail
          </Text>
          <Text as="p" variant="muted" className="max-w-3xl">
            Review and maintain project metadata, verification status, MRV documents, and issuance
            records.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={project.verificationEnabled ? 'success' : 'secondary'}>
            {project.verificationEnabled ? 'Verified' : 'Verification Off'}
          </Badge>
          <Badge variant={lifecycleBadgeVariant(project.lifecycleStatus)}>
            {project.lifecycleStatus}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/projects">Back to Projects</Link>
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Project ID"
          value={project.id}
          helper={`Registry: ${project.registry} (${project.registryProjectId})`}
        />
        <SummaryCard
          label="Price / ton"
          value={formatCurrency(project.pricePerTonUsd)}
          helper={`Available: ${formatNumber(project.availableSupplyTons)} tCO2e`}
        />
        <SummaryCard
          label="Issued credits"
          value={`${formatNumber(project.totalIssuedTons)} tCO2e`}
          helper={`History total shown: ${formatNumber(issuanceTotal)} tCO2e`}
        />
        <SummaryCard
          label="Last updated"
          value={formatDateTime(project.lastUpdatedAt)}
          helper={`By ${project.lastUpdatedBy}`}
        />
      </div>

      <div className="mb-4 space-y-2" role="status" aria-live="polite" aria-atomic="true">
        {statusMessage ? (
          <p className="rounded-md border border-stellar-green/30 bg-stellar-green/10 px-3 py-2 text-sm text-stellar-green">
            {statusMessage}
          </p>
        ) : null}
        {uploadMessage ? (
          <p className="rounded-md border border-stellar-blue/30 bg-stellar-blue/10 px-3 py-2 text-sm text-stellar-blue">
            {uploadMessage}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Project Fields</CardTitle>
              <CardDescription>
                All editable project metadata fields are managed here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <label htmlFor="project-id" className="text-sm font-medium">
                      Project ID
                    </label>
                    <Input
                      id="project-id"
                      variant="primary"
                      value={formValues.id}
                      onChange={(event) => setField('id', event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-name" className="text-sm font-medium">
                      Project name
                    </label>
                    <Input
                      id="project-name"
                      variant="primary"
                      value={formValues.name}
                      onChange={(event) => setField('name', event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-slug" className="text-sm font-medium">
                      Slug
                    </label>
                    <Input
                      id="project-slug"
                      variant="primary"
                      value={formValues.slug}
                      onChange={(event) => setField('slug', event.target.value)}
                      required
                    />
                  </Field>
                </div>

                <Field>
                  <label htmlFor="project-description" className="text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id="project-description"
                    value={formValues.description}
                    onChange={(event) => setField('description', event.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-stellar-blue/30 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                    required
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field>
                    <label htmlFor="project-type" className="text-sm font-medium">
                      Project type
                    </label>
                    <Select
                      id="project-type"
                      variant="primary"
                      value={formValues.type}
                      onChange={(event) => setField('type', event.target.value as AdminProjectType)}
                    >
                      {PROJECT_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <label htmlFor="project-lifecycle" className="text-sm font-medium">
                      Lifecycle status
                    </label>
                    <Select
                      id="project-lifecycle"
                      variant="primary"
                      value={formValues.lifecycleStatus}
                      onChange={(event) =>
                        setField(
                          'lifecycleStatus',
                          event.target.value as AdminProjectLifecycleStatus
                        )
                      }
                    >
                      {LIFECYCLE_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <label htmlFor="project-risk-rating" className="text-sm font-medium">
                      Risk rating
                    </label>
                    <Select
                      id="project-risk-rating"
                      variant="primary"
                      value={formValues.riskRating}
                      onChange={(event) =>
                        setField('riskRating', event.target.value as AdminRiskRating)
                      }
                    >
                      {RISK_RATING_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Field>
                    <label htmlFor="project-location" className="text-sm font-medium">
                      Location
                    </label>
                    <Input
                      id="project-location"
                      variant="primary"
                      value={formValues.location}
                      onChange={(event) => setField('location', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-country" className="text-sm font-medium">
                      Country
                    </label>
                    <Input
                      id="project-country"
                      variant="primary"
                      value={formValues.country}
                      onChange={(event) => setField('country', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-region" className="text-sm font-medium">
                      Region
                    </label>
                    <Input
                      id="project-region"
                      variant="primary"
                      value={formValues.region}
                      onChange={(event) => setField('region', event.target.value)}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Field>
                    <label htmlFor="project-developer" className="text-sm font-medium">
                      Developer
                    </label>
                    <Input
                      id="project-developer"
                      variant="primary"
                      value={formValues.developer}
                      onChange={(event) => setField('developer', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-methodology" className="text-sm font-medium">
                      Methodology
                    </label>
                    <Input
                      id="project-methodology"
                      variant="primary"
                      value={formValues.methodology}
                      onChange={(event) => setField('methodology', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-registry" className="text-sm font-medium">
                      Registry
                    </label>
                    <Input
                      id="project-registry"
                      variant="primary"
                      value={formValues.registry}
                      onChange={(event) => setField('registry', event.target.value)}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Field>
                    <label htmlFor="project-registry-id" className="text-sm font-medium">
                      Registry project ID
                    </label>
                    <Input
                      id="project-registry-id"
                      variant="primary"
                      value={formValues.registryProjectId}
                      onChange={(event) => setField('registryProjectId', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-vintage-year" className="text-sm font-medium">
                      Vintage year
                    </label>
                    <Input
                      id="project-vintage-year"
                      type="number"
                      min={1900}
                      max={2100}
                      variant="primary"
                      value={String(formValues.vintageYear)}
                      onChange={(event) => setField('vintageYear', toNumber(event.target.value))}
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-start-date" className="text-sm font-medium">
                      Start date
                    </label>
                    <Input
                      id="project-start-date"
                      type="date"
                      variant="primary"
                      value={formValues.startDate}
                      onChange={(event) => setField('startDate', event.target.value)}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Field>
                    <label htmlFor="project-crediting-end" className="text-sm font-medium">
                      Crediting end date
                    </label>
                    <Input
                      id="project-crediting-end"
                      type="date"
                      variant="primary"
                      value={formValues.expectedCreditingEndDate}
                      onChange={(event) => setField('expectedCreditingEndDate', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-price" className="text-sm font-medium">
                      Price / ton (USD)
                    </label>
                    <Input
                      id="project-price"
                      type="number"
                      min={0}
                      step="0.01"
                      variant="primary"
                      value={String(formValues.pricePerTonUsd)}
                      onChange={(event) => setField('pricePerTonUsd', toNumber(event.target.value))}
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-available-supply" className="text-sm font-medium">
                      Available supply (tCO2e)
                    </label>
                    <Input
                      id="project-available-supply"
                      type="number"
                      min={0}
                      step="0.01"
                      variant="primary"
                      value={String(formValues.availableSupplyTons)}
                      onChange={(event) =>
                        setField('availableSupplyTons', toNumber(event.target.value))
                      }
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-total-issued" className="text-sm font-medium">
                      Total issued (tCO2e)
                    </label>
                    <Input
                      id="project-total-issued"
                      type="number"
                      min={0}
                      step="0.01"
                      variant="primary"
                      value={String(formValues.totalIssuedTons)}
                      onChange={(event) =>
                        setField('totalIssuedTons', toNumber(event.target.value))
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Field>
                    <label htmlFor="project-buffer-pool" className="text-sm font-medium">
                      Buffer pool (%)
                    </label>
                    <Input
                      id="project-buffer-pool"
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      variant="primary"
                      value={String(formValues.bufferPoolPercent)}
                      onChange={(event) =>
                        setField('bufferPoolPercent', toNumber(event.target.value))
                      }
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-estimated-removal" className="text-sm font-medium">
                      Estimated annual removal (tCO2e)
                    </label>
                    <Input
                      id="project-estimated-removal"
                      type="number"
                      min={0}
                      step="1"
                      variant="primary"
                      value={String(formValues.estimatedAnnualRemovalTons)}
                      onChange={(event) =>
                        setField('estimatedAnnualRemovalTons', toNumber(event.target.value))
                      }
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-verification-notes" className="text-sm font-medium">
                      Verification notes
                    </label>
                    <Input
                      id="project-verification-notes"
                      variant="primary"
                      value={formValues.verificationNotes}
                      onChange={(event) => setField('verificationNotes', event.target.value)}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <label htmlFor="project-co-benefits" className="text-sm font-medium">
                      Co-benefits (comma separated)
                    </label>
                    <textarea
                      id="project-co-benefits"
                      rows={3}
                      value={formValues.coBenefitsText}
                      onChange={(event) => setField('coBenefitsText', event.target.value)}
                      className="w-full rounded-lg border border-stellar-blue/30 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                    />
                  </Field>
                  <Field>
                    <label htmlFor="project-tags" className="text-sm font-medium">
                      Tags (comma separated)
                    </label>
                    <textarea
                      id="project-tags"
                      rows={3}
                      value={formValues.tagsText}
                      onChange={(event) => setField('tagsText', event.target.value)}
                      className="w-full rounded-lg border border-stellar-blue/30 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <Checkbox
                    checked={formValues.verificationEnabled}
                    onChange={(event) => setField('verificationEnabled', event.target.checked)}
                    label="Include verification status value when saving project fields"
                  />
                  <Button type="submit" stellar="primary" disabled={isSaving} aria-busy={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Project'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">MRV Documents</CardTitle>
              <CardDescription>
                Upload and review measurement, reporting, and verification files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label
                  htmlFor={uploadInputId}
                  className="inline-flex cursor-pointer items-center justify-center rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-stellar-blue/90 focus-within:outline-none focus-within:ring-2 focus-within:ring-stellar-blue"
                >
                  Upload MRV Document
                </label>
                <input
                  id={uploadInputId}
                  type="file"
                  className="sr-only"
                  multiple
                  onChange={handleMrvUpload}
                  aria-describedby="mrv-upload-help"
                />
                <p id="mrv-upload-help" className="text-sm text-muted-foreground">
                  Accepted by browser file picker. Uploaded files are added to the document list
                  locally.
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">MRV document upload list for this project</caption>
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">File</th>
                      <th className="px-4 py-3 font-medium">Version</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Uploaded by</th>
                      <th className="px-4 py-3 font-medium">Uploaded at</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.mrvDocuments.map((document) => (
                      <tr key={document.id} className="border-t align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium">{document.fileName}</div>
                          <div className="text-xs text-muted-foreground">{document.fileType}</div>
                        </td>
                        <td className="px-4 py-3">{document.version}</td>
                        <td className="px-4 py-3">
                          <Badge variant={documentStatusBadgeVariant(document.status)}>
                            {document.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{document.uploadedBy}</td>
                        <td className="px-4 py-3">{formatDateTime(document.uploadedAt)}</td>
                        <td className="px-4 py-3">{formatFileSize(document.sizeBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Credit Issuance History</CardTitle>
              <CardDescription>
                Historical issuance batches for auditing and reconciliation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">
                    Credit issuance history records for this project
                  </caption>
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Batch ID</th>
                      <th className="px-4 py-3 font-medium">Quantity</th>
                      <th className="px-4 py-3 font-medium">Recipient</th>
                      <th className="px-4 py-3 font-medium">Issued by</th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.creditIssuanceHistory.map((record) => (
                      <IssuanceRow key={record.id} record={record} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Verification Status</CardTitle>
              <CardDescription>
                Toggle project verification availability for admin workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Checkbox
                checked={project.verificationEnabled}
                onChange={(event) => handleVerificationToggle(event.target.checked)}
                label={
                  project.verificationEnabled
                    ? 'Verification is enabled'
                    : 'Verification is disabled'
                }
              />
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Current status</p>
                <p className="text-muted-foreground">
                  {project.verificationEnabled
                    ? 'Project can be treated as verified in admin review flows.'
                    : 'Project is excluded from verified listings until re-enabled.'}
                </p>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Saved notes</p>
                <p className="text-sm text-muted-foreground">
                  {project.verificationNotes || 'No verification notes provided.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Activity Log</CardTitle>
              <CardDescription>Recent admin actions and project changes.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {project.activityLog.map((entry) => (
                  <li key={entry.id} className="rounded-lg border p-3">
                    <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.timestamp)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.details}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Actor: {entry.actor}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ children }: { children: ReactNode }): ReactNode {
  return <div className="space-y-1.5">{children}</div>;
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}): ReactNode {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function IssuanceRow({ record }: { record: AdminCreditIssuanceRecord }): ReactNode {
  return (
    <tr className="border-t align-top">
      <td className="px-4 py-3">{formatDate(record.issuanceDate)}</td>
      <td className="px-4 py-3 font-medium">{record.batchId}</td>
      <td className="px-4 py-3">{formatNumber(record.quantityTons)} tCO2e</td>
      <td className="px-4 py-3">{record.recipient}</td>
      <td className="px-4 py-3">{record.issuedBy}</td>
      <td className="px-4 py-3 text-muted-foreground">{record.notes}</td>
    </tr>
  );
}

function toFormValues(project: AdminProjectDetail): AdminProjectFormValues {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description,
    type: project.type,
    lifecycleStatus: project.lifecycleStatus,
    location: project.location,
    country: project.country,
    region: project.region,
    developer: project.developer,
    methodology: project.methodology,
    registry: project.registry,
    registryProjectId: project.registryProjectId,
    vintageYear: project.vintageYear,
    startDate: project.startDate,
    expectedCreditingEndDate: project.expectedCreditingEndDate,
    pricePerTonUsd: project.pricePerTonUsd,
    availableSupplyTons: project.availableSupplyTons,
    totalIssuedTons: project.totalIssuedTons,
    bufferPoolPercent: project.bufferPoolPercent,
    estimatedAnnualRemovalTons: project.estimatedAnnualRemovalTons,
    riskRating: project.riskRating,
    coBenefitsText: project.coBenefits.join(', '),
    tagsText: project.tags.join(', '),
    verificationEnabled: project.verificationEnabled,
    verificationNotes: project.verificationNotes,
  };
}

function applyFormValues(
  project: AdminProjectDetail,
  formValues: AdminProjectFormValues
): AdminProjectDetail {
  return {
    ...project,
    id: formValues.id.trim(),
    slug: formValues.slug.trim(),
    name: formValues.name.trim(),
    description: formValues.description.trim(),
    type: formValues.type,
    lifecycleStatus: formValues.lifecycleStatus,
    location: formValues.location.trim(),
    country: formValues.country.trim(),
    region: formValues.region.trim(),
    developer: formValues.developer.trim(),
    methodology: formValues.methodology.trim(),
    registry: formValues.registry.trim(),
    registryProjectId: formValues.registryProjectId.trim(),
    vintageYear: formValues.vintageYear,
    startDate: formValues.startDate,
    expectedCreditingEndDate: formValues.expectedCreditingEndDate,
    pricePerTonUsd: formValues.pricePerTonUsd,
    availableSupplyTons: formValues.availableSupplyTons,
    totalIssuedTons: formValues.totalIssuedTons,
    bufferPoolPercent: formValues.bufferPoolPercent,
    estimatedAnnualRemovalTons: formValues.estimatedAnnualRemovalTons,
    riskRating: formValues.riskRating,
    coBenefits: parseCommaList(formValues.coBenefitsText),
    tags: parseCommaList(formValues.tagsText),
    verificationEnabled: formValues.verificationEnabled,
    verificationNotes: formValues.verificationNotes.trim(),
  };
}

function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createActivityEntry(action: string, details: string): AdminActivityLogEntry {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    actor: ACTIVE_ADMIN_NAME,
    action,
    details,
  };
}

function lifecycleBadgeVariant(
  status: AdminProjectLifecycleStatus
): 'default' | 'secondary' | 'success' | 'destructive' | 'accent' | 'outline' {
  switch (status) {
    case 'Approved':
      return 'success';
    case 'Under Review':
      return 'accent';
    case 'Paused':
      return 'secondary';
    case 'Archived':
      return 'outline';
    case 'Draft':
    default:
      return 'default';
  }
}

function documentStatusBadgeVariant(
  status: AdminMrvDocument['status']
): 'default' | 'secondary' | 'success' | 'destructive' | 'accent' | 'outline' {
  switch (status) {
    case 'Current':
      return 'success';
    case 'Pending Review':
      return 'accent';
    case 'Superseded':
    default:
      return 'secondary';
  }
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size = size / 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
