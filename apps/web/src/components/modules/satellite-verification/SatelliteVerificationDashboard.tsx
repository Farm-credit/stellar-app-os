// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Satellite Verification Dashboard
 * Issue #1429: Environmental impact verification - satellite imagery
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  MapPin, 
  TreePine, 
  Cloud, 
  Leaf, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Download,
  Eye,
  Map,
  Calculator,
  Zap,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SatelliteImageBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

type VerificationType = 'tree_count' | 'land_cover_change' | 'vegetation_health';

interface VerificationJob {
  id: string;
  request: {
    projectId: string;
    bounds: { north: number; south: number; east: number; west: number };
    verificationType: string;
    startDate: string;
    endDate: string;
    provider?: string;
  };
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface CostEstimate {
  estimatedCost: number;
  currency: 'USD';
  estimatedProcessingTimeMinutes: number;
  provider: string;
  areaHectares: number;
}

interface SatelliteVerificationDashboardProps {
  projectId?: string;
  className?: string;
}

export function SatelliteVerificationDashboard({ 
  projectId: initialProjectId, 
  className 
}: SatelliteVerificationDashboardProps) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
  const [jobs, setJobs] = useState<VerificationJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [costEstimate, setCostEstimate] = useState<{ estimatedCost: number; estimatedProcessingTimeMinutes: number; areaHectares: number } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    verificationType: 'tree_count' as 'tree_count' | 'land_cover_change' | 'vegetation_health',
    bounds: { north: 0, south: 0, east: 0, west: 0 },
    startDate: '',
    endDate: '',
    provider: 'sentinel-2',
    resolutionMeters: 10,
    cloudCoverThreshold: 20,
    webhookUrl: '',
  });
  
  const [activeTab, setActiveTab] = useState<'submit' | 'jobs' | 'estimate'>('submit');
  const [showBoundsHelper, setShowBoundsHelper] = useState(false);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Load jobs when project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadJobs();
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        if (data.projects?.length > 0 && !initialProjectId) {
          setSelectedProjectId(data.projects[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadJobs = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/satellite/verification?projectId=${selectedProjectId}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBoundsChange = (field: keyof typeof formData.bounds, value: number) => {
    setFormData(prev => ({
      ...prev,
      bounds: { ...prev.bounds, [field]: value },
    }));
  };

  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEstimateCost = async () => {
    if (!formData.bounds.north || !formData.bounds.south || !formData.bounds.east || !formData.bounds.west) {
      alert('Please fill in all bounds coordinates');
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      alert('Please select start and end dates');
      return;
    }

    try {
      const res = await fetch('/api/satellite/verification?action=estimate-cost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        const data = await res.json();
        setCostEstimate(data.costEstimate);
      } else {
        const error = await res.json();
        alert(`Cost estimation failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Cost estimation failed:', error);
      alert('Cost estimation failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedProjectId) {
      alert('Please select a project');
      return;
    }
    if (!formData.bounds.north || !formData.bounds.south || !formData.bounds.east || !formData.bounds.west) {
      alert('Please fill in all bounds coordinates');
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      alert('Please select start and end dates');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/satellite/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          ...formData,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Verification job submitted successfully! Job ID: ${data.job.id}`);
        setFormData(prev => ({
          ...prev,
          bounds: { north: 0, south: 0, east: 0, west: 0 },
          startDate: '',
          endDate: '',
        }));
        setCostEstimate(null);
        loadJobs();
        setActiveTab('jobs');
      } else {
        const error = await res.json();
        alert(`Submission failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Submission failed:', error);
      alert('Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      queued: 'secondary',
      processing: 'default',
      completed: 'default',
      failed: 'destructive',
    };
    const icons: Record<string, string> = {
      pending: '⏳',
      queued: '⏳',
      processing: '⚡',
      completed: '✅',
      failed: '❌',
    };
    return (
      <Badge variant={variants[status] || 'outline'} className="gap-1">
        {icons[status] || '❓'} {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getResultPreview = (result: any) => {
    if (!result) return null;
    switch (result.type) {
      case 'tree_count':
        return `🌲 ${result.data.estimatedTreeCount.toLocaleString()} trees (${(result.data.confidence * 100).toFixed(0)}% confidence)`;
      case 'land_cover_change':
        return `🌳 Gain: ${result.data.forestGainHectares} ha, Loss: ${result.data.forestLossHectares} ha, Net: ${result.data.netChangeHectares} ha`;
      case 'vegetation_health':
        return `🌿 NDVI: ${result.data.meanNDVI}, EVI: ${result.data.meanEVI}, Score: ${result.data.healthScore}/100`;
      default:
        return 'Result available';
    }
  };

  const formatNumber = (num: number) => new Intl.NumberFormat().format(num);

  return (
    <Card className={cn('space-y-6', className)}>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Map className="w-5 h-5" />
              Satellite Verification
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Verify environmental claims using satellite imagery: tree counts, land cover changes, vegetation health
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="submit">
              <MapPin className="w-4 h-4 mr-2" />
              Submit Job
            </TabsTrigger>
            <TabsTrigger value="jobs">
              <Leaf className="w-4 h-4 mr-2" />
              Job History
            </TabsTrigger>
            <TabsTrigger value="estimate">
              <Calculator className="w-4 h-4 mr-2" />
              Cost Estimate
            </TabsTrigger>
          </TabsList>

          {/* Submit Tab */}
          <TabsContent value="submit" className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Project Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Project Selection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger className="w-full sm:w-[300px]">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Verification Type */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Verification Type
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { value: 'tree_count', label: 'Tree Count', desc: 'Count trees from aerial imagery', icon: '🌲' },
                      { value: 'land_cover_change', label: 'Land Cover Change', desc: 'Detect forest gain/loss', icon: '🌳' },
                      { value: 'vegetation_health', label: 'Vegetation Health', desc: 'NDVI/EVI analysis', icon: '🌿' },
                    ].map(opt => (
                      <label
                        key={opt.value}
                        className={cn(
                          'relative p-4 border rounded-lg cursor-pointer transition-colors',
                          formData.verificationType === opt.value
                            ? 'border-primary bg-primary/5'
                            : 'border-muted/50 hover:border-primary/50'
                        )}
                      >
                        <input
                          type="radio"
                          name="verificationType"
                          value={opt.value}
                          checked={formData.verificationType === opt.value}
                          onChange={() => handleFormChange('verificationType', opt.value)}
                          className="sr-only"
                        />
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{opt.icon}</span>
                          <div>
                            <p className="font-medium">{opt.label}</p>
                            <p className="text-sm text-muted-foreground">{opt.desc}</p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Geographic Bounds */}
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Map className="w-4 h-4" />
                    Geographic Bounds (WGS84)
                  </CardTitle>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowBoundsHelper(!showBoundsHelper)}>
                    {showBoundsHelper ? 'Hide' : 'Show'} coordinate helper
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {showBoundsHelper && (
                    <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                      <p className="font-medium mb-2">Enter coordinates in decimal degrees (WGS84):</p>
                      <ul className="space-y-1 list-disc list-inside">
                        <li>North: Top latitude (max 90, min -90)</li>
                        <li>South: Bottom latitude (must be < North)</li>
                        <li>East: Right longitude (max 180, min -180)</li>
                        <li>West: Left longitude (must be < East)</li>
                      </ul>
                      <p className="mt-2">Example: Amazon basin ~ North: -2, South: -10, East: -50, West: -70</p>
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <Label htmlFor="north">North (Latitude)</Label>
                      <Input
                        id="north"
                        type="number"
                        step="0.0001"
                        min="-90"
                        max="90"
                        value={formData.bounds.north}
                        onChange={e => handleBoundsChange('north', parseFloat(e.target.value))}
                        placeholder="e.g., -2.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="south">South (Latitude)</Label>
                      <Input
                        id="south"
                        type="number"
                        step="0.0001"
                        min="-90"
                        max="90"
                        value={formData.bounds.south}
                        onChange={e => handleBoundsChange('south', parseFloat(e.target.value))}
                        placeholder="e.g., -10.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="east">East (Longitude)</Label>
                      <Input
                        id="east"
                        type="number"
                        step="0.0001"
                        min="-180"
                        max="180"
                        value={formData.bounds.east}
                        onChange={e => handleBoundsChange('east', parseFloat(e.target.value))}
                        placeholder="e.g., -50.0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="west">West (Longitude)</Label>
                      <Input
                        id="west"
                        type="number"
                        step="0.0001"
                        min="-180"
                        max="180"
                        value={formData.bounds.west}
                        onChange={e => handleBoundsChange('west', parseFloat(e.target.value))}
                        placeholder="e.g., -70.0"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Date Range */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Date Range
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={e => handleFormChange('startDate', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={e => handleFormChange('endDate', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Provider Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cloud className="w-4 h-4" />
                    Satellite Provider
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {['sentinel-2', 'landsat-8', 'planet'].map(provider => {
                      const info = {
                        'sentinel-2': { name: 'Sentinel-2', res: '10m', freq: '5 days', indices: 'NDVI, EVI, NDWI' },
                        'landsat-8': { name: 'Landsat 8', res: '30m', freq: '16 days', indices: 'NDVI, EVI, NBR' },
                        'planet': { name: 'PlanetScope', res: '3m', freq: 'Daily', indices: 'NDVI, EVI, SAVI' },
                      }[provider];
                      return (
                        <label
                          key={provider}
                          className={cn(
                            'relative p-4 border rounded-lg cursor-pointer transition-colors',
                            formData.provider === provider
                              ? 'border-primary bg-primary/5'
                              : 'border-muted/50 hover:border-primary/50'
                          )}
                        >
                          <input
                            type="radio"
                            name="provider"
                            value={provider}
                            checked={formData.provider === provider}
                            onChange={() => handleFormChange('provider', provider)}
                            className="sr-only"
                          />
                          <div>
                            <p className="font-medium">{info.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Resolution: {info.res} • Revisit: {info.freq} • Indices: {info.indices}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Advanced Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    Advanced Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="resolutionMeters">Resolution (meters)</Label>
                    <Select value={formData.resolutionMeters.toString()} onValueChange={e => handleFormChange('resolutionMeters', parseInt(e))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Auto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3m (Planet)</SelectItem>
                        <SelectItem value="10">10m (Sentinel-2)</SelectItem>
                        <SelectItem value="30">30m (Landsat-8)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="cloudCoverThreshold">Max Cloud Cover (%)</Label>
                    <Input
                      id="cloudCoverThreshold"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.cloudCoverThreshold}
                      onChange={e => handleFormChange('cloudCoverThreshold', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="webhookUrl">Webhook URL (optional)</Label>
                    <Input
                      id="webhookUrl"
                      type="url"
                      value={formData.webhookUrl}
                      onChange={e => handleFormChange('webhookUrl', e.target.value)}
                      placeholder="https://your-app.com/webhook/satellite"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Cost Estimate */}
              {costEstimate && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-primary" />
                      Cost Estimate
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-3">
                    <div className="text-center p-4 bg-background rounded-lg">
                      <p className="text-2xl font-bold text-primary">${costEstimate.estimatedCost.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">Estimated Cost</p>
                    </div>
                    <div className="text-center p-4 bg-background rounded-lg">
                      <p className="text-2xl font-bold">{costEstimate.estimatedProcessingTimeMinutes} min</p>
                      <p className="text-sm text-muted-foreground">Processing Time</p>
                    </div>
                    <div className="text-center p-4 bg-background rounded-lg">
                      <p className="text-2xl font-bold">{costEstimate.areaHectares.toFixed(1)} ha</p>
                      <p className="text-sm text-muted-foreground">Area</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={handleEstimateCost}>
                  <Calculator className="w-4 h-4 mr-2" />
                  Estimate Cost
                </Button>
                <Button type="submit" disabled={submitting} className="ml-auto">
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Submit Verification Job
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* Jobs Tab */}
          <TabsContent value="jobs">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12">
                <Leaf className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No verification jobs yet</h3>
                <p className="text-muted-foreground mt-1">Submit your first verification job from the Submit tab</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {jobs.length} job{jobs.length !== 1 ? 's' : ''}
                  </span>
                  <Button variant="outline" size="sm" onClick={loadJobs}>
                    <Loader2 className="w-4 h-4 mr-2" /> Refresh
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-muted/50">
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-16">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Type</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Progress</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Created</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Updated</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-48">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map(job => (
                        <tr key={job.id} className="border-b border-muted/30 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            {getStatusBadge(job.status)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="capitalize">{job.request.verificationType.replace('_', ' ')}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary rounded-full transition-all duration-300"
                                  style={{ width: `${job.progress}%` }}
                                />
                              </div>
                              <span className="text-sm font-mono w-12 text-right">{job.progress}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">{formatDate(job.createdAt)}</td>
                          <td className="px-4 py-3 text-sm">{formatDate(job.updatedAt)}</td>
                          <td className="px-4 py-3">
                            {job.result ? getResultPreview(job.result) : job.error ? (
                              <span className="text-red-600">{job.error}</span>
                            ) : (
                              <span className="text-muted-foreground">Pending...</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* Estimate Tab */}
          <TabsContent value="estimate">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                  Cost Estimation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={e => { e.preventDefault(); handleEstimateCost(); }} className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="est-verificationType">Verification Type</Label>
                      <Select value={formData.verificationType} onValueChange={e => handleFormChange('verificationType', e as any)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tree_count">Tree Count</SelectItem>
                          <SelectItem value="land_cover_change">Land Cover Change</SelectItem>
                          <SelectItem value="vegetation_health">Vegetation Health</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="est-provider">Provider</Label>
                      <Select value={formData.provider} onValueChange={e => handleFormChange('provider', e)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sentinel-2">Sentinel-2 (10m, 5-day revisit)</SelectItem>
                          <SelectItem value="landsat-8">Landsat-8 (30m, 16-day revisit)</SelectItem>
                          <SelectItem value="planet">PlanetScope (3m, daily)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-4">
                    <div>
                      <Label htmlFor="est-north">North</Label>
                      <Input id="est-north" type="number" step="0.0001" min="-90" max="90" value={formData.bounds.north} onChange={e => handleBoundsChange('north', parseFloat(e.target.value))} />
                    </div>
                    <div>
                      <Label htmlFor="est-south">South</Label>
                      <Input id="est-south" type="number" step="0.0001" min="-90" max="90" value={formData.bounds.south} onChange={e => handleBoundsChange('south', parseFloat(e.target.value))} />
                    </div>
                    <div>
                      <Label htmlFor="est-east">East</Label>
                      <Input id="est-east" type="number" step="0.0001" min="-180" max="180" value={formData.bounds.east} onChange={e => handleBoundsChange('east', parseFloat(e.target.value))} />
                    </div>
                    <div>
                      <Label htmlFor="est-west">West</Label>
                      <Input id="est-west" type="number" step="0.0001" min="-180" max="180" value={formData.bounds.west} onChange={e => handleBoundsChange('west', parseFloat(e.target.value))} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="est-startDate">Start Date</Label>
                      <Input id="est-startDate" type="date" value={formData.startDate} onChange={e => handleFormChange('startDate', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="est-endDate">End Date</Label>
                      <Input id="est-endDate" type="date" value={formData.endDate} onChange={e => handleFormChange('endDate', e.target.value)} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="est-provider">Provider</Label>
                      <Select value={formData.provider} onValueChange={e => handleFormChange('provider', e)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sentinel-2">Sentinel-2 (10m, $0.50/ha)</SelectItem>
                          <SelectItem value="landsat-8">Landsat-8 (30m, $0.25/ha)</SelectItem>
                          <SelectItem value="planet">PlanetScope (3m, $1.00/ha)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="est-type">Verification Type</Label>
                      <Select value={formData.verificationType} onValueChange={e => handleFormChange('verificationType', e)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tree_count">Tree Count ($0.50/ha)</SelectItem>
                          <SelectItem value="land_cover_change">Land Cover Change ($0.25/ha)</SelectItem>
                          <SelectItem value="vegetation_health">Vegetation Health ($0.25/ha)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button type="submit" className="w-full sm:w-auto">
                    <Calculator className="w-4 h-4 mr-2" />
                    Calculate Estimate
                  </Button>
                </form>

                {costEstimate && (
                  <Card className="border-primary/50 bg-primary/5 mt-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-primary" />
                        Estimation Results
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-4">
                      <div className="text-center p-4 bg-background rounded-lg border border-primary/20">
                        <p className="text-3xl font-bold text-primary">${costEstimate.estimatedCost.toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground">Estimated Cost (USD)</p>
                      </div>
                      <div className="text-center p-4 bg-background rounded-lg">
                        <p className="text-2xl font-bold">{costEstimate.estimatedProcessingTimeMinutes} min</p>
                        <p className="text-sm text-muted-foreground">Processing Time</p>
                      </div>
                      <div className="text-center p-4 bg-background rounded-lg">
                        <p className="text-2xl font-bold">{costEstimate.areaHectares.toFixed(1)} ha</p>
                        <p className="text-sm text-muted-foreground">Area</p>
                      </div>
                      <div className="text-center p-4 bg-background rounded-lg">
                        <p className="text-2xl font-bold">{costEstimate.provider}</p>
                        <p className="text-sm text-muted-foreground">Provider</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString();
}

function formatNumber(num: number) {
  return new Intl.NumberFormat().format(Math.round(num));
}