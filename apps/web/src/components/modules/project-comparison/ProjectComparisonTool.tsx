// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project Comparison Tool Component
 * Issue #1416: Project comparison tool - side-by-side review
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { 
  Check, X, Star, AlertCircle, Info, ChevronDown, ChevronUp, Search, Filter, Columns, Download, Share2, Heart, MapPin, Tag, DollarSign, Shield, Users, Leaf, Award,
} from 'lucide-react';
import {
  Project,
  ComparisonCriteria,
  COMPARISON_CRITERIA,
  getProjects,
  getComparisonProjects,
  getRiskColor,
  getRiskIcon,
  formatPrice,
  getAverageRating,
  getCoBenefitIcon,
  Project as ProjectType,
} from '@/services/projectComparison';

interface ProjectComparisonToolProps {
  initialProjectIds?: string[];
  className?: string;
}

export function ProjectComparisonTool({ initialProjectIds = [], className }: ProjectComparisonToolProps) {
  const [allProjects, setAllProjects] = useState<ProjectType[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialProjectIds);
  const [comparisonProjects, setComparisonProjects] = useState<ProjectType[]>([]);
  const [visibleCriteria, setVisibleCriteria] = useState<string[]>(
    COMPARISON_CRITERIA.filter(c => c.defaultVisible).map(c => c.id)
  );
  const [filters, setFilters] = useState({
    projectType: '',
    country: '',
    minPrice: '',
    maxPrice: '',
    riskRating: '',
    verifier: '',
    search: '',
  });
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [activeTab, setActiveTab] = useState<'compare' | 'browse'>('compare');

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedIds.length > 0) {
      loadComparisonProjects();
    } else {
      setComparisonProjects([]);
    }
  }, [selectedIds]);

  const loadProjects = async () => {
    try {
      const data = await getProjects();
      setAllProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadComparisonProjects = async () => {
    if (selectedIds.length === 0) {
      setComparisonProjects([]);
      return;
    }
    try {
      const data = await getComparisonProjects(selectedIds);
      const ordered = selectedIds.map(id => data.find(p => p.id === id)).filter(Boolean);
      setComparisonProjects(ordered as ProjectType[]);
    } catch (error) {
      console.error('Failed to load comparison projects:', error);
    }
  };

  const toggleProject = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(p => p !== id);
      }
      if (prev.length >= 5) {
        alert('Maximum 5 projects for comparison');
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const filteredProjects = useMemo(() => {
    let result = [...allProjects];

    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(search) ||
        p.location.toLowerCase().includes(search) ||
        p.country.toLowerCase().includes(search)
      );
    }
    if (filters.projectType) {
      result = result.filter(p => p.projectType === filters.projectType);
    }
    if (filters.country) {
      result = result.filter(p => p.country === filters.country);
    }
    if (filters.minPrice) {
      result = result.filter(p => p.pricePerTon >= parseFloat(filters.minPrice));
    }
    if (filters.maxPrice) {
      result = result.filter(p => p.pricePerTon <= parseFloat(filters.maxPrice));
    }
    if (filters.riskRating) {
      result = result.filter(p => p.riskRating === filters.riskRating);
    }
    if (filters.verifier) {
      result = result.filter(p => p.verifier === filters.verifier);
    }

    result.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === undefined || bVal === undefined) return 0;
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [allProjects, filters, sortConfig]);

  const availableCountries = useMemo(() => 
    [...new Set(allProjects.map(p => p.country))].sort(),
    [allProjects]
  );

  const availableVerifiers = useMemo(() => 
    [...new Set(allProjects.map(p => p.verifier))].sort(),
    [allProjects]
  );

  const projectTypes = ['reforestation', 'avoided_deforestation', 'renewable_energy', 'community', 'blue_carbon'];

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(Math.round(num));
  };

  if (loading && allProjects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn('space-y-6', className)}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Project Comparison Tool</h1>
            <p className="text-muted-foreground">
              Compare carbon offset projects side-by-side: price, methodology, verifier, risk, co-benefits, reviews
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/10 text-primary">
              {selectedIds.length}/5 selected
            </Badge>
            {selectedIds.length > 0 && (
              <Button variant="secondary" onClick={() => setActiveTab('compare')}>
                <Columns className="w-4 h-4 mr-2" />
                Compare ({selectedIds.length})
              </Button>
            )}
          </div>
        </div>

        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                  className="pl-10"
                />
              </div>
              <Select value={filters.projectType} onValueChange={v => setFilters(f => ({ ...f, projectType: v }))}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Types</SelectItem>
                  {projectTypes.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.country} onValueChange={v => setFilters(f => ({ ...f, country: v }))}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Countries</SelectItem>
                  {availableCountries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.riskRating} onValueChange={v => setFilters(f => ({ ...f, riskRating: v }))}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Risk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Risks</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Min $/ton"
                  value={filters.minPrice}
                  onChange={e => setFilters(f => ({ ...f, minPrice: e.target.value }))}
                  className="w-[120px]"
                />
                <Input
                  type="number"
                  placeholder="Max $/ton"
                  value={filters.maxPrice}
                  onChange={e => setFilters(f => ({ ...f, maxPrice: e.target.value }))}
                  className="w-[120px]"
                />
              </div>
              <Button variant="outline" onClick={() => setFilters({
                projectType: '', country: '', minPrice: '', maxPrice: '', riskRating: '', verifier: '', search: ''
              })}>
                <Filter className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-sm font-medium">Visible Columns:</Label>
              <div className="flex flex-wrap gap-2">
                {COMPARISON_CRITERIA.map(criterion => (
                  <label key={criterion.id} className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleCriteria.includes(criterion.id)}
                      onChange={e => setVisibleCriteria(prev => 
                        e.target.checked 
                          ? [...prev, criterion.id] 
                          : prev.filter(v => v !== criterion.id)
                      )}
                      className="rounded border-input"
                    />
                    <span className="text-sm">{criterion.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="compare" disabled={selectedIds.length < 2}>
              <Columns className="w-4 h-4 mr-2" />
              Compare ({selectedIds.length})
            </TabsTrigger>
            <TabsTrigger value="browse">
              <Filter className="w-4 h-4 mr-2" />
              Browse Projects ({filteredProjects.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compare">
            {selectedIds.length < 2 ? (
              <div className="text-center py-12">
                <Columns className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Select projects to compare</h3>
                <p className="text-muted-foreground mt-1">
                  Choose at least 2 projects from the Browse tab to compare them side-by-side
                </p>
              </div>
            ) : (
              <ComparisonTable projects={comparisonProjects} visibleCriteria={visibleCriteria} />
            )}
          </TabsContent>

          <TabsContent value="browse">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">
                {filteredProjects.length} projects
              </span>
              <div className="flex items-center gap-2">
                <Select value={sortConfig.key} onValueChange={v => setSortConfig(s => ({ ...s, key: v }))}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPARISON_CRITERIA.filter(c => c.sortable).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortConfig(s => ({ ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' }))}
                >
                  {sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProjects.map(project => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    selected={selectedIds.includes(project.id)}
                    onToggle={() => toggleProject(project.id)}
                    disabled={selectedIds.length >= 5 && !selectedIds.includes(project.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {comparisonProjects.length > 0 && (
          <ProjectDetailDrawer projects={comparisonProjects} visibleCriteria={visibleCriteria} />
        )}
      </div>
    </TooltipProvider>
  );
}

function ProjectCard({ project, selected, onToggle, disabled }: { 
  project: ProjectType; 
  selected: boolean; 
  onToggle: () => void;
  disabled?: boolean;
}) {
  const riskColors = {
    low: 'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    high: 'bg-red-100 text-red-800 border-red-200',
  };

  return (
    <Card className={`relative h-full transition-all ${selected ? 'ring-2 ring-primary' : ''} ${disabled ? 'opacity-50' : ''}`}>
      {selected && (
        <div className="absolute top-2 right-2 z-10">
          <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-xs font-medium">
            ✓ Selected
          </span>
        </div>
      )}
      <CardContent className="p-4 h-full flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">{project.name}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {project.location}, {project.country}
            </p>
          </div>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            onClick={(e) => { e.stopPropagation(); toggleProject(project.id); }}
            disabled={disabled && !selected}
            className="mt-1"
          />
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary">{project.projectType.replace('_', ' ')}</Badge>
          <Badge variant="outline" className={riskColors[project.riskRating]}>
            Risk: {project.riskRating}
          </Badge>
        </div>

        <div className="flex items-center gap-3 text-sm mb-3">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Leaf className="w-3 h-3" />
            {project.methodology}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Shield className="w-3 h-3" />
            {project.verifier}
          </span>
        </div>

        <div className="flex items-center justify-between mt-auto pt-3 border-t">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-lg">{formatPrice(project.pricePerTon, project.currency)}/t</span>
          </div>
          <Badge variant={selected ? 'default' : 'outline'} onClick={(e) => { e.stopPropagation(); toggleProject(project.id); }}>
            {selected ? <Check className="w-4 h-4" /> : 'Add to Compare'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonTable({ projects, visibleCriteria }: { projects: ProjectType[]; visibleCriteria: string[] }) {
  const activeCriteria = useMemo(() => 
    COMPARISON_CRITERIA.filter(c => visibleCriteria.includes(c.id)),
    [visibleCriteria]
  );

  return (
    <div className="rounded-lg border overflow-hidden">
      <ScrollArea className="max-h-[70vh]">
        <table className="w-full min-w-[800px]">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium w-48">Criteria</th>
              {projects.map(p => (
                <th key={p.id} className="px-4 py-3 text-center text-sm font-medium w-64">
                  <div className="flex items-center justify-center gap-1">
                    <span className="font-medium">{p.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeCriteria.map(criterion => (
              <tr key={criterion.id} className="border-t">
                <td className="px-4 py-3 text-sm font-medium sticky left-0 bg-background z-10 w-48">
                  {criterion.label}
                </td>
                {projects.map(project => (
                  <td key={project.id} className="px-4 py-3 text-center text-sm">
                    {renderCell(project, criterion)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function renderCell(project: ProjectType, criterion: ComparisonCriteria): React.ReactNode {
  const value = project[criterion.key as keyof ProjectType];
  
  switch (criterion.id) {
    case 'riskRating':
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(project.riskRating)}`}>
          {getRiskIcon(project.riskRating)}
          {project.riskRating}
        </span>
      );
    case 'certification':
      return (
        <div className="flex flex-wrap gap-1 justify-center">
          {(value as string[]).slice(0, 3).map(cert => (
            <Badge key={cert} variant="secondary" className="text-xs">{cert}</Badge>
          ))}
          {(value as string[]).length > 3 && (
            <Badge variant="outline" className="text-xs">+{(value as string[]).length - 3}</Badge>
          )}
        </div>
      );
    case 'coBenefits':
      return (
        <div className="flex flex-wrap gap-1 justify-center">
          {(value as any[]).slice(0, 4).map(cb => (
            <Tooltip key={cb.category}>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ backgroundColor: getCoBenefitColor(cb.category) }}>
                  {getCoBenefitIcon(cb.category)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{cb.description}</TooltipContent>
            </Tooltip>
          ))}
          {(value as any[]).length > 4 && <span className="text-xs text-muted-foreground">+{(value as any[]).length - 4}</span>}
        </div>
      );
    case 'buyerReviews':
      const reviews = value as any[];
      const avgRating = reviews.length > 0 
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
        : 0;
      return (
        <div className="flex items-center justify-center gap-1">
          <span className="flex items-center gap-0.5">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            {avgRating.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">({reviews.length})</span>
        </div>
      );
    case 'pricePerTon':
      return formatPrice(project.pricePerTon, project.currency);
    case 'availableCredits':
      return (
        <span className="font-medium">
          {new Intl.NumberFormat().format(project.availableCredits)} / {new Intl.NumberFormat().format(project.totalCredits)}
        </span>
      );
    case 'projectType':
      return value.replace('_', ' ');
    default:
      return String(value ?? '—');
  }
}

function getRiskColor(rating: string): string {
  switch (rating) {
    case 'low': return 'bg-green-100 text-green-800';
    case 'medium': return 'bg-yellow-100 text-yellow-800';
    case 'high': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function getRiskIcon(rating: string): string {
  switch (rating) {
    case 'low': return '✅';
    case 'medium': return '⚠️';
    case 'high': return '❌';
    default: return 'ℹ️';
  }
}

function formatPrice(price: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function getCoBenefitColor(category: string): string {
  const colors: Record<string, string> = {
    biodiversity: 'bg-green-100 text-green-800',
    community: 'bg-blue-100 text-blue-800',
    water: 'bg-cyan-100 text-cyan-800',
    soil: 'bg-amber-100 text-amber-800',
    climate_resilience: 'bg-purple-100 text-purple-800',
    gender_equality: 'bg-pink-100 text-pink-800',
  };
  return colors[category] || 'bg-gray-100 text-gray-800';
}

function getCoBenefitIcon(category: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    biodiversity: <Leaf className="w-3 h-3" />,
    community: <Users className="w-3 h-3" />,
    water: <span className="w-3 h-3">💧</span>,
    soil: <Leaf className="w-3 h-3" />,
    climate_resilience: <Shield className="w-3 h-3" />,
    gender_equality: <Award className="w-3 h-3" />,
  };
  return icons[category] || <Info className="w-3 h-3" />;
}

function ProjectDetailDrawer({ projects, visibleCriteria }: { projects: ProjectType[]; visibleCriteria: string[] }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 md:hidden">
      <p className="text-center text-sm text-muted-foreground">
        {projects.length} projects selected for comparison. View on desktop for full table.
      </p>
    </div>
  );
}