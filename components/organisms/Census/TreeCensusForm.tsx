'use client';

import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import type { TreeCensusRow, TreeCensusSubmission, TreeSurvivalStatus } from '@/lib/census/types';
import { parseCensusCsv } from '@/lib/census/service';

const SAMPLE_CSV = `tree_id,species,status,height_cm,health_score,cause,notes
HRV-2024-0001,Teak,alive,180,90,,Healthy vigorous canopy growth
HRV-2024-0002,Moringa,alive,120,75,drought_stress,Dry season leaf shed
HRV-2024-0003,Eucalyptus,alive,210,85,,Strong taproot establishment
HRV-2024-0004,Mangrove,dead,60,0,pest_damage,Crab damage to lower stem
HRV-2024-0005,Neem,alive,145,80,,Good vegetative growth`;

export function TreeCensusForm() {
  const [projectId, setProjectId] = useState('proj-001');
  const [projectName, setProjectName] = useState('Northern Savanna Reforestation');
  const [censusYear, setCensusYear] = useState(2026);
  const [surveyorName, setSurveyorName] = useState('Field Officer Ibrahim');
  const [surveyorAgentId, setSurveyorAgentId] = useState('FLD-042');

  const [activeMode, setActiveMode] = useState<'csv' | 'manual'>('csv');

  // Manual Form States
  const [manualTreeId, setManualTreeId] = useState('HRV-2024-0010');
  const [manualSpecies, setManualSpecies] = useState('Teak');
  const [manualStatus, setManualStatus] = useState<TreeSurvivalStatus>('alive');
  const [manualHeight, setManualHeight] = useState('165');
  const [manualHealth, setManualHealth] = useState('85');
  const [manualCause, setManualCause] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualRows, setManualRows] = useState<TreeCensusRow[]>([]);

  // CSV Upload States
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [fileName, setFileName] = useState<string | null>('sample_tree_census.csv');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<TreeCensusRow[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; field: string; message: string }>>([]);

  // Submission States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<TreeCensusSubmission | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAddManualRow = () => {
    if (!manualTreeId.trim()) return;

    const row: TreeCensusRow = {
      treeId: manualTreeId.trim(),
      species: manualSpecies,
      status: manualStatus,
      heightCm: Number.parseFloat(manualHeight) || 0,
      healthScore: manualStatus === 'dead' ? 0 : Math.min(100, Math.max(0, Number.parseFloat(manualHealth) || 0)),
      cause: (manualCause as never) || null,
      notes: manualNotes.trim() || null,
    };

    setManualRows((prev) => [row, ...prev]);
    setManualTreeId(`HRV-2024-00${manualRows.length + 11}`);
    setManualNotes('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      const res = parseCensusCsv(text);
      setParsedRows(res.previewRows);
      setParseErrors(res.errors);
      setIsParsing(false);
    };
    reader.readAsText(file);
  };

  const handleParseCsvText = () => {
    setIsParsing(true);
    const res = parseCensusCsv(csvText);
    setParsedRows(res.previewRows);
    setParseErrors(res.errors);
    setIsParsing(false);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmissionResult(null);

    const rowsToSubmit = activeMode === 'csv'
      ? (parsedRows.length > 0 ? parsedRows : parseCensusCsv(csvText).previewRows)
      : manualRows;

    if (rowsToSubmit.length === 0) {
      setSubmitError('Please add or upload tree census records before submitting.');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/v1/census/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectName,
          censusYear,
          surveyorName,
          surveyorAgentId,
          records: rowsToSubmit,
        }),
      });

      const data = await res.json();
      if (res.ok && data.submission) {
        setSubmissionResult(data.submission);
        if (activeMode === 'manual') setManualRows([]);
      } else {
        setSubmitError(data.error || 'Failed to submit census data.');
      }
    } catch (err: unknown) {
      setSubmitError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateMaxMock = () => {
    // Fast generator for testing up to 10,000 records
    const rows: string[] = ['tree_id,species,status,height_cm,health_score,cause,notes'];
    const speciesList = ['Teak', 'Moringa', 'Mangrove', 'Neem', 'Baobab', 'Acacia'];
    for (let i = 1; i <= 2500; i++) {
      const isDead = i % 15 === 0;
      const sp = speciesList[i % speciesList.length];
      const h = Math.round(80 + Math.random() * 180);
      const s = isDead ? 0 : Math.round(60 + Math.random() * 40);
      rows.push(`HRV-BATCH-${String(i).padStart(5, '0')},${sp},${isDead ? 'dead' : 'alive'},${h},${s},,Annual survey`);
    }
    const generated = rows.join('\n');
    setCsvText(generated);
    setFileName('generated_batch_2500_trees.csv');
    const res = parseCensusCsv(generated);
    setParsedRows(res.previewRows);
    setParseErrors(res.errors);
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-900 via-green-800 to-slate-900 p-8 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
              <span>● Field Operations</span>
              <span>·</span>
              <span>Batch Up to 10,000 Trees</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl tracking-tight">
              Annual Tree Census Submission Tool
            </h1>
            <p className="mt-2 text-slate-300 max-w-2xl text-sm sm:text-base">
              Field teams log survival counts, height measurements, and health scores. Submission triggers automatic recalculation of project survival rates and health stats.
            </p>
          </div>
          <div className="flex gap-2 bg-white/10 p-1.5 rounded-xl border border-white/20">
            <button
              onClick={() => setActiveMode('csv')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${activeMode === 'csv' ? 'bg-white text-slate-900 shadow' : 'text-slate-200 hover:text-white'}`}
            >
              CSV Batch Upload
            </button>
            <button
              onClick={() => setActiveMode('manual')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${activeMode === 'manual' ? 'bg-white text-slate-900 shadow' : 'text-slate-200 hover:text-white'}`}
            >
              Manual Entry
            </button>
          </div>
        </div>
      </div>

      {/* Project & Surveyor Metadata Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Project ID</label>
          <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} className="text-xs" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Project Name</label>
          <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="text-xs" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Census Year</label>
          <Input
            type="number"
            value={censusYear}
            onChange={(e) => setCensusYear(Number(e.target.value))}
            className="text-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Surveyor Lead</label>
          <Input value={surveyorName} onChange={(e) => setSurveyorName(e.target.value)} className="text-xs" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Agent ID</label>
          <Input value={surveyorAgentId} onChange={(e) => setSurveyorAgentId(e.target.value)} className="text-xs" />
        </div>
      </div>

      {/* CSV Batch Upload Mode */}
      {activeMode === 'csv' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Upload Census CSV File</h3>
                <p className="text-xs text-slate-500">
                  Batch submit up to 10,000 tree records in a single CSV file. Required column: <code>tree_id</code>. Optional: <code>species, status, height_cm, health_score, cause, notes</code>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleGenerateMaxMock} className="text-xs">
                  Load 2,500 Demo Trees
                </Button>
                <label className="cursor-pointer">
                  <span className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition">
                    Browse File
                  </span>
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>

            {fileName && (
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                <span className="font-mono text-slate-700">Selected File: {fileName}</span>
                <span className="text-emerald-700 font-semibold">
                  {parsedRows.length > 0 ? `${parsedRows.length} trees ready` : 'Raw text loaded'}
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CSV Content Preview & Editor</label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={6}
                className="w-full font-mono text-xs rounded-lg border border-slate-300 p-3 bg-slate-900 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={handleParseCsvText} disabled={isParsing}>
                {isParsing ? 'Validating CSV...' : 'Validate CSV Rows'}
              </Button>
              {parseErrors.length > 0 && (
                <span className="text-xs font-semibold text-red-600">
                  {parseErrors.length} validation errors detected in CSV.
                </span>
              )}
            </div>

            {parseErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1 max-h-32 overflow-auto">
                {parseErrors.slice(0, 5).map((err, idx) => (
                  <p key={idx}>Row {err.row}: {err.message}</p>
                ))}
                {parseErrors.length > 5 && <p>...and {parseErrors.length - 5} more errors.</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Entry Mode */}
      {activeMode === 'manual' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Manual Tree Observation Entry</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tree ID</label>
              <Input value={manualTreeId} onChange={(e) => setManualTreeId(e.target.value)} className="text-xs" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Species</label>
              <select
                value={manualSpecies}
                onChange={(e) => setManualSpecies(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
              >
                {['Teak', 'Moringa', 'Mangrove', 'Neem', 'Baobab', 'Acacia', 'Eucalyptus', 'Shea'].map((sp) => (
                  <option key={sp} value={sp}>{sp}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
              <select
                value={manualStatus}
                onChange={(e) => setManualStatus(e.target.value as TreeSurvivalStatus)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="alive">Alive</option>
                <option value="dead">Dead</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Height (cm)</label>
              <Input
                type="number"
                value={manualHeight}
                onChange={(e) => setManualHeight(e.target.value)}
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Health Score (0-100)</label>
              <Input
                type="number"
                disabled={manualStatus === 'dead'}
                value={manualStatus === 'dead' ? '0' : manualHealth}
                onChange={(e) => setManualHealth(e.target.value)}
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Health Cause</label>
              <select
                value={manualCause}
                onChange={(e) => setManualCause(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="">None (Healthy)</option>
                <option value="pest_damage">Pest Damage</option>
                <option value="drought_stress">Drought Stress</option>
                <option value="disease">Disease</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Field Notes</label>
              <Input
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Observed vigorous foliage..."
                className="text-xs"
              />
            </div>
          </div>
          <div>
            <Button onClick={handleAddManualRow} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              + Add Tree to Submission Batch ({manualRows.length} staged)
            </Button>
          </div>
        </div>
      )}

      {/* Submission Action Button */}
      <div className="flex items-center justify-between bg-slate-100 p-4 rounded-xl border border-slate-200">
        <div>
          <span className="text-sm font-semibold text-slate-900">
            Ready to Submit Annual Census for {projectName}
          </span>
          <p className="text-xs text-slate-500">
            {activeMode === 'csv'
              ? `${parsedRows.length > 0 ? parsedRows.length : 'CSV rows'} will be processed`
              : `${manualRows.length} trees staged in manual batch`}
          </p>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5"
        >
          {isSubmitting ? 'Calculating Stats & Submitting...' : 'Submit Annual Census Data'}
        </Button>
      </div>

      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          <strong>Error submitting census:</strong> {submitError}
        </div>
      )}

      {/* Auto-Updated Results & Stats Card */}
      {submissionResult && (
        <div className="rounded-xl border border-emerald-300 bg-white p-6 shadow-md space-y-6">
          <div className="flex flex-wrap items-center justify-between border-b border-emerald-100 pb-4">
            <div>
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                ✓ Census Processed Successfully
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-1">
                Project Survival & Health Report — {submissionResult.censusYear}
              </h2>
              <p className="text-xs text-slate-500">Submission ID: {submissionResult.id}</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-emerald-600">
                {submissionResult.survivalRate}%
              </span>
              <p className="text-xs text-slate-500 font-semibold uppercase">Platform Survival Rate</p>
            </div>
          </div>

          {/* Metric KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
              <span className="text-2xl font-black text-emerald-800">{submissionResult.totalTreesCounted}</span>
              <p className="text-xs text-emerald-700 font-medium">Total Trees Counted</p>
            </div>
            <div className="p-4 rounded-xl bg-teal-50 border border-teal-100 text-center">
              <span className="text-2xl font-black text-teal-800">{submissionResult.aliveCount}</span>
              <p className="text-xs text-teal-700 font-medium">Surviving Trees</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-center">
              <span className="text-2xl font-black text-blue-800">{submissionResult.averageHeightCm} cm</span>
              <p className="text-xs text-blue-700 font-medium">Average Height</p>
            </div>
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-center">
              <span className="text-2xl font-black text-indigo-800">{submissionResult.averageHealthScore}/100</span>
              <p className="text-xs text-indigo-700 font-medium">Average Health Score</p>
            </div>
          </div>

          {/* Health Distribution Progress */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase">Tree Health Distribution</h4>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${(submissionResult.healthDistribution.thriving / submissionResult.totalTreesCounted) * 100}%` }}
                className="bg-emerald-500"
                title={`Thriving: ${submissionResult.healthDistribution.thriving}`}
              />
              <div
                style={{ width: `${(submissionResult.healthDistribution.moderate / submissionResult.totalTreesCounted) * 100}%` }}
                className="bg-amber-400"
                title={`Moderate: ${submissionResult.healthDistribution.moderate}`}
              />
              <div
                style={{ width: `${(submissionResult.healthDistribution.critical / submissionResult.totalTreesCounted) * 100}%` }}
                className="bg-orange-500"
                title={`Critical: ${submissionResult.healthDistribution.critical}`}
              />
              <div
                style={{ width: `${(submissionResult.healthDistribution.dead / submissionResult.totalTreesCounted) * 100}%` }}
                className="bg-red-500"
                title={`Dead: ${submissionResult.healthDistribution.dead}`}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Thriving ({submissionResult.healthDistribution.thriving})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Moderate ({submissionResult.healthDistribution.moderate})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> Critical ({submissionResult.healthDistribution.critical})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Dead ({submissionResult.healthDistribution.dead})</span>
            </div>
          </div>

          {/* Species Breakdown Table */}
          {submissionResult.speciesBreakdown.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase">Species Survival Breakdown</h4>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Species</th>
                      <th className="p-2.5">Total Count</th>
                      <th className="p-2.5">Alive</th>
                      <th className="p-2.5">Survival Rate</th>
                      <th className="p-2.5">Avg Height</th>
                      <th className="p-2.5">Avg Health</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {submissionResult.speciesBreakdown.map((row) => (
                      <tr key={row.species} className="hover:bg-slate-50">
                        <td className="p-2.5 font-medium text-slate-900">{row.species}</td>
                        <td className="p-2.5">{row.total}</td>
                        <td className="p-2.5 text-emerald-700 font-medium">{row.alive}</td>
                        <td className="p-2.5 font-bold text-slate-900">{row.survivalRate}%</td>
                        <td className="p-2.5">{row.avgHeightCm} cm</td>
                        <td className="p-2.5">{row.avgHealthScore}/100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
