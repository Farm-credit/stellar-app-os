'use client';

import React, { useState } from 'react';
import { 
  Building2, 
  BarChart3, 
  Download, 
  Settings, 
  TrendingUp, 
  TreePine, 
  Wind,
  PlusCircle,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { AnalyticsWidget } from '@/components/AnalyticsWidget';
import { generateEsgReport } from '@/lib/corporate';
import { cn } from '@/lib/utils';

export function CorporateDashboard() {
  const [isExporting, setIsExporting] = useState(false);

  const stats = [
    { label: 'Total Portfolio', value: '12,500 Trees', icon: TreePine, color: 'text-stellar-blue' },
    { label: 'CO2 Sequestration', value: '450.2 Tons', icon: Wind, color: 'text-stellar-cyan' },
    { label: 'Project Count', value: '8 Projects', icon: Building2, color: 'text-stellar-purple' },
    { label: 'Next Milestone', value: '15k Trees', icon: TrendingUp, color: 'text-stellar-green' },
  ];

  const handleExportEsg = async () => {
    setIsExporting(true);
    try {
      generateEsgReport({
        companyName: 'Acme Corp',
        totalTrees: 12500,
        totalCo2Offset: 450.2,
        projectsSupported: [
          'Amazon Rainforest Restoration',
          'Kenya Mangrove Planting',
          'Indonesia Peatland Protection',
          'European Mixed Forest Growth'
        ],
        period: 'Q1 2026',
        reportId: 'ESG-2026-ACME-001'
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Text variant="h2" className="text-3xl font-bold tracking-tight text-white">
            Corporate Impact Dashboard
          </Text>
          <Text variant="muted" className="text-lg">
            Manage your organization's environmental footprint and ESG compliance.
          </Text>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportEsg} disabled={isExporting} variant="outline" className="gap-2 border-white/10 hover:bg-white/5">
            <Download className="h-4 w-4" />
            Export ESG Report
          </Button>
          <Button className="gap-2 bg-stellar-blue hover:bg-stellar-blue/90 shadow-lg shadow-stellar-blue/20">
            <PlusCircle className="h-4 w-4" />
            Bulk Purchase
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-white/5 bg-stellar-navy/40 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/60">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-white">{stat.value}</p>
                </div>
                <div className={cn("rounded-full p-2 bg-white/5", stat.color)}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Chart */}
        <Card className="lg:col-span-2 border-white/5 bg-stellar-navy/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-stellar-blue" />
              Impact Growth Projection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center text-white/20 italic">
              [Impact Growth Chart Placeholder]
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & Settings */}
        <div className="space-y-6">
          <Card className="border-white/5 bg-stellar-navy/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-stellar-purple" />
                Custom Branding
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-white/60 uppercase">Company Name</label>
                <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-white">Acme Corp</div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-white/60 uppercase">Brand Color</label>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-stellar-blue border border-white/10" />
                  <span className="text-sm text-white/80">#14B6E7</span>
                </div>
              </div>
              <Button variant="outline" className="w-full text-xs py-2 border-white/10">Edit Brand Settings</Button>
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-stellar-navy/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-stellar-green" />
                Latest Documentation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                'Tax-Deductible Receipt Q1',
                'Verification Audit #442',
                'Project Impact Summary'
              ].map((doc, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer group">
                  <span className="text-sm text-white/70 group-hover:text-white transition-colors">{doc}</span>
                  <Download className="h-4 w-4 text-white/20 group-hover:text-stellar-blue transition-colors" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
