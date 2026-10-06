// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

'use client';

import React, { useState } from 'react';
import type { FarmerPortfolioResponse } from '@/lib/types/farmer-portfolio';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';

interface FarmerPortfolioViewProps {
  portfolio: FarmerPortfolioResponse;
}

export function FarmerPortfolioView({ portfolio }: FarmerPortfolioViewProps) {
  const { farmer, summary, projects, buyerReviews } = portfolio;
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'reviews' | 'projects'>('all');

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Farmer Profile Header */}
      <Card className="border border-border/60 bg-card/80 backdrop-blur-sm shadow-md">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-emerald-500/20">
                {farmer.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-3">
                  <Text variant="h2" as="h1" className="text-2xl sm:text-3xl font-bold tracking-tight">
                    {farmer.name}
                  </Text>
                  {farmer.verified && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Verified Farmer (Tier {farmer.kycTier})
                    </span>
                  )}
                </div>
                {farmer.organization && (
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    {farmer.organization}
                  </p>
                )}
                <p className="text-xs text-muted-foreground font-mono">
                  {farmer.address.slice(0, 10)}...{farmer.address.slice(-10)} • {farmer.location}, {farmer.country}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(farmer.address)}
              >
                Copy Address
              </Button>
              <Button stellar="accent" size="sm">
                Contact Farmer
              </Button>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-border/50 text-sm text-muted-foreground leading-relaxed">
            {farmer.bio}
          </div>
        </CardContent>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Acres */}
        <Card className="border border-border/50 bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Acres</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-foreground">{summary.totalAcres.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground font-medium">acres managed</span>
            </div>
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Across {summary.totalProjects} project{summary.totalProjects !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {/* Total Credits Available */}
        <Card className="border border-border/50 bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Credits Available</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {summary.totalCreditsAvailable.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground font-medium">tCO₂e</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.totalCreditsIssued.toLocaleString()} total issued
            </p>
          </CardContent>
        </Card>

        {/* Average Price */}
        <Card className="border border-border/50 bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Average Price</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-foreground">${summary.averagePrice.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground font-medium">/ ton</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Weighted across active inventory</p>
          </CardContent>
        </Card>

        {/* Buyer Reviews & Rating */}
        <Card className="border border-border/50 bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buyer Reviews</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-amber-500">★ {summary.overallRating}</span>
              <span className="text-xs text-muted-foreground font-medium">/ 5.0</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.totalReviews} verified review{summary.totalReviews !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {/* Certification Status */}
        <Card className="border border-border/50 bg-card hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Certification Status</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {summary.certificationStatuses.slice(0, 2).map((cert) => (
                <span
                  key={cert}
                  className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                >
                  {cert}
                </span>
              ))}
            </div>
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Audit certified & verified
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-border gap-6">
        <button
          className={`pb-3 text-sm font-semibold transition-colors ${
            selectedFilter === 'all'
              ? 'border-b-2 border-emerald-600 text-emerald-600'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setSelectedFilter('all')}
        >
          All Portfolio Overview
        </button>
        <button
          className={`pb-3 text-sm font-semibold transition-colors ${
            selectedFilter === 'projects'
              ? 'border-b-2 border-emerald-600 text-emerald-600'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setSelectedFilter('projects')}
        >
          Listed Projects ({projects.length})
        </button>
        <button
          className={`pb-3 text-sm font-semibold transition-colors ${
            selectedFilter === 'reviews'
              ? 'border-b-2 border-emerald-600 text-emerald-600'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setSelectedFilter('reviews')}
        >
          Buyer Reviews ({buyerReviews.length})
        </button>
      </div>

      {/* Listed Projects Portfolio */}
      {(selectedFilter === 'all' || selectedFilter === 'projects') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Text variant="h3" as="h2" className="text-xl font-bold">
              Listed Carbon Projects
            </Text>
            <span className="text-sm text-muted-foreground">
              {projects.length} verified project{projects.length !== 1 ? 's' : ''} listed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card key={project.id} className="border border-border/70 hover:border-emerald-500/50 transition-all flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {project.projectType}
                    </span>
                    <span className="text-xs font-bold text-amber-500 flex items-center gap-1">
                      ★ {project.averageRating} ({project.reviewCount})
                    </span>
                  </div>
                  <CardTitle className="text-lg font-bold mt-2 line-clamp-1">{project.name}</CardTitle>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    {project.location}, {project.country}
                  </p>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>

                  <div className="grid grid-cols-2 gap-2 p-3 bg-muted/40 rounded-xl text-xs">
                    <div>
                      <span className="text-muted-foreground block">Total Area</span>
                      <span className="font-semibold text-foreground">{project.acres} acres</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Credits Available</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {project.creditsAvailable.toLocaleString()} tCO₂e
                      </span>
                    </div>
                    <div className="mt-1">
                      <span className="text-muted-foreground block">Price per Ton</span>
                      <span className="font-bold text-foreground">${project.pricePerTon.toFixed(2)} USD</span>
                    </div>
                    <div className="mt-1">
                      <span className="text-muted-foreground block">Vintage</span>
                      <span className="font-semibold text-foreground">{project.vintageYear}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Certification Status:</span>
                    <div className="flex flex-wrap gap-1">
                      {project.certifications.map((cert) => (
                        <span
                          key={cert}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900"
                        >
                          {cert}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Button stellar="accent" className="w-full mt-2" size="sm">
                    View Project & Buy Credits
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Buyer Reviews Section */}
      {(selectedFilter === 'all' || selectedFilter === 'reviews') && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <Text variant="h3" as="h2" className="text-xl font-bold">
                Buyer Reviews & Institutional Feedback
              </Text>
              <p className="text-xs text-muted-foreground mt-0.5">
                Independent reviews from corporate offset buyers and verifiers
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-extrabold text-amber-500">★ {summary.overallRating}</span>
              <span className="text-xs text-muted-foreground block">from {buyerReviews.length} buyers</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {buyerReviews.map((review) => (
              <Card key={review.id} className="border border-border/70 bg-card">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{review.buyerName}</span>
                        {review.verified && (
                          <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium">
                            Verified Buyer
                          </span>
                        )}
                      </div>
                      {review.buyerCompany && (
                        <p className="text-xs text-muted-foreground">{review.buyerCompany}</p>
                      )}
                    </div>
                    <div className="flex items-center text-amber-500 text-sm font-bold">
                      {'★'.repeat(Math.round(review.rating))}
                      <span className="ml-1 text-xs text-muted-foreground">({review.rating})</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{review.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{review.comment}</p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                    <span>Project: {review.projectName || review.projectId}</span>
                    <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
