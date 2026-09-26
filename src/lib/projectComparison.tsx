// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project Comparison Tool
 *
 * Issue #1416: Compare multiple offset projects side-by-side:
 * - Price, co-benefits, methodology, verifier, risk rating, buyer reviews
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, X, Star, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';

const supabase = createClient();

export interface Project {
  id: string;
  name: string;
  description: string;
  location: string;
  country: string;
  projectType:
    'reforestation' | 'avoided_deforestation' | 'renewable_energy' | 'community' | 'blue_carbon';
  methodology: string;
  verifier: string;
  certification: string[];
  pricePerTon: number;
  currency: 'USD' | 'EUR' | 'GBP';
  vintage: string;
  totalCredits: number;
  availableCredits: number;
  riskRating: 'low' | 'medium' | 'high';
  coBenefits: CoBenefit[];
  images: string[];
  buyerReviews: BuyerReview[];
  createdAt: string;
  updatedAt: string;
}

export interface CoBenefit {
  category:
    'biodiversity' | 'community' | 'water' | 'soil' | 'climate_resilience' | 'gender_equality';
  description: string;
  verified: boolean;
}

export interface BuyerReview {
  id: string;
  projectId: string;
  buyerName: string;
  buyerCompany?: string;
  rating: number; // 1-5
  title: string;
  content: string;
  verified: boolean;
  createdAt: string;
}

export interface ComparisonCriteria {
  id: string;
  label: string;
  key: keyof Project | 'coBenefits' | 'buyerReviews' | 'riskAssessment';
  type: 'text' | 'number' | 'rating' | 'tags' | 'boolean' | 'custom';
  sortable: boolean;
  defaultVisible: boolean;
}

export const COMPARISON_CRITERIA: ComparisonCriteria[] = [
  {
    id: 'name',
    label: 'Project Name',
    key: 'name',
    type: 'text',
    sortable: true,
    defaultVisible: true,
  },
  {
    id: 'location',
    label: 'Location',
    key: 'location',
    type: 'text',
    sortable: true,
    defaultVisible: true,
  },
  {
    id: 'projectType',
    label: 'Type',
    key: 'projectType',
    type: 'text',
    sortable: true,
    defaultVisible: true,
  },
  {
    id: 'methodology',
    label: 'Methodology',
    key: 'methodology',
    type: 'text',
    sortable: false,
    defaultVisible: true,
  },
  {
    id: 'verifier',
    label: 'Verifier',
    key: 'verifier',
    type: 'text',
    sortable: false,
    defaultVisible: true,
  },
  {
    id: 'certification',
    label: 'Certifications',
    key: 'certification',
    type: 'tags',
    sortable: false,
    defaultVisible: true,
  },
  {
    id: 'pricePerTon',
    label: 'Price/Ton',
    key: 'pricePerTon',
    type: 'number',
    sortable: true,
    defaultVisible: true,
  },
  {
    id: 'vintage',
    label: 'Vintage',
    key: 'vintage',
    type: 'text',
    sortable: true,
    defaultVisible: false,
  },
  {
    id: 'totalCredits',
    label: 'Total Credits',
    key: 'totalCredits',
    type: 'number',
    sortable: true,
    defaultVisible: false,
  },
  {
    id: 'availableCredits',
    label: 'Available',
    key: 'availableCredits',
    type: 'number',
    sortable: true,
    defaultVisible: true,
  },
  {
    id: 'riskRating',
    label: 'Risk Rating',
    key: 'riskRating',
    type: 'rating',
    sortable: true,
    defaultVisible: true,
  },
  {
    id: 'coBenefits',
    label: 'Co-Benefits',
    key: 'coBenefits',
    type: 'custom',
    sortable: false,
    defaultVisible: true,
  },
  {
    id: 'buyerReviews',
    label: 'Buyer Reviews',
    key: 'buyerReviews',
    type: 'custom',
    sortable: false,
    defaultVisible: true,
  },
];

export async function getProjects(filters?: {
  projectType?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  riskRating?: string;
  verifier?: string;
}): Promise<Project[]> {
  let query = supabase
    .from('projects')
    .select(
      `
      *,
      co_benefits(*),
      buyer_reviews(*)
    `
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (filters?.projectType) {
    query = query.eq('project_type', filters.projectType);
  }
  if (filters?.country) {
    query = query.eq('country', filters.country);
  }
  if (filters?.minPrice) {
    query = query.gte('price_per_ton', filters.minPrice);
  }
  if (filters?.maxPrice) {
    query = query.lte('price_per_ton', filters.maxPrice);
  }
  if (filters?.riskRating) {
    query = query.eq('risk_rating', filters.riskRating);
  }
  if (filters?.verifier) {
    query = query.eq('verifier', filters.verifier);
  }

  const { data, error } = await query.limit(50);

  if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
  return data as Project[];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      `
      *,
      co_benefits(*),
      buyer_reviews(*)
    `
    )
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as Project;
}

export async function getComparisonProjects(ids: string[]): Promise<Project[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('projects')
    .select(
      `
      *,
      co_benefits(*),
      buyer_reviews(*)
    `
    )
    .in('id', ids);

  if (error) throw new Error(`Failed to fetch comparison projects: ${error.message}`);
  return data as Project[];
}

export function getRiskColor(rating: Project['riskRating']): string {
  switch (rating) {
    case 'low':
      return 'text-green-600 bg-green-100';
    case 'medium':
      return 'text-yellow-600 bg-yellow-100';
    case 'high':
      return 'text-red-600 bg-red-100';
  }
}

export function getRiskIcon(rating: Project['riskRating']): React.ReactNode {
  switch (rating) {
    case 'low':
      return <Check className="w-4 h-4 text-green-600" />;
    case 'medium':
      return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    case 'high':
      return <X className="w-4 h-4 text-red-600" />;
  }
}

export function formatPrice(price: number, currency: Project['currency'] = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function getAverageRating(reviews: BuyerReview[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

export function getCoBenefitIcon(category: CoBenefit['category']): React.ReactNode {
  const icons: Record<CoBenefit['category'], React.ReactNode> = {
    biodiversity: <span className="text-green-600">🌿</span>,
    community: <span className="text-blue-600">👥</span>,
    water: <span className="text-cyan-600">💧</span>,
    soil: <span className="text-amber-600">🌱</span>,
    climate_resilience: <span className="text-purple-600">🛡️</span>,
    gender_equality: <span className="text-pink-600">⚖️</span>,
  };
  return icons[category] || <Info className="w-4 h-4" />;
}
