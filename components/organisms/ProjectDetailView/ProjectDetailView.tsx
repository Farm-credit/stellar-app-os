'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Share2,
  MapPin,
  Calendar,
  ShieldCheck,
  FileText,
  ExternalLink,
  ChevronRight,
  Heart,
} from 'lucide-react';

import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/molecules/Card';
import { FarmPlotSatelliteView } from '@/components/organisms/FarmPlotSatelliteView/FarmPlotSatelliteView';
import {
  ImpactMetrics,
  type ImpactMetric,
} from '@/components/organisms/ImpactMetrics/ImpactMetrics';
import {
  ProjectTimeline,
  type Milestone,
} from '@/components/organisms/ProjectTimeline/ProjectTimeline';
import { ProjectCarousel } from '@/components/organisms/ProjectCarousel/ProjectCarousel';

import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { toast } from 'sonner';
import type { AdminProjectDetail } from '@/lib/types/adminProject';
import type { CarbonProject } from '@/lib/types/carbon';

interface ProjectDetailViewProps {
  adminProject: AdminProjectDetail;
  carbonProject: CarbonProject;
}

export function ProjectDetailView({ adminProject, carbonProject }: ProjectDetailViewProps) {
  const router = useRouter();

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator
        .share({
          title: adminProject.name,
          text: adminProject.description,
          url: window.location.href,
        })
        .catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard!');
    }
  };

  const impactMetrics: ImpactMetric[] = [
    { label: 'CO2 Removed', value: '25,480', unit: 'tons', icon: 'co2' },
    { label: 'Trees Planted', value: '1.2M', icon: 'tree' },
    { label: 'Energy Saved', value: '450', unit: 'MWh', icon: 'energy' },
    { label: 'Water Conserved', value: '85K', unit: 'gal', icon: 'water' },
    { label: 'Jobs Created', value: '120', icon: 'community' },
    { label: 'Verified Status', value: 'Active', icon: 'verified' },
  ];

  const milestones: Milestone[] = [
    {
      date: 'March 2024',
      title: 'Project Inception',
      description: 'Initial land survey and community engagement completed.',
      status: 'completed',
    },
    {
      date: 'June 2024',
      title: 'First Planting Phase',
      description: 'Over 200,000 native saplings planted across the north sector.',
      status: 'completed',
    },
    {
      date: 'Jan 2025',
      title: 'MRV Certification',
      description: 'Successful third-party verification of carbon sequestration rates.',
      status: 'completed',
    },
    {
      date: 'June 2025',
      title: 'Secondary Growth Phase',
      description: 'Expanding planting efforts to the eastern buffer zones.',
      status: 'ongoing',
    },
    {
      date: 'Dec 2025',
      title: 'Full Capacity Reached',
      description: 'Projected completion of initial reforestation goals.',
      status: 'upcoming',
    },
  ];

  return (
    <main className="min-h-screen bg-background pb-20">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/projects')}
          >
            <ArrowLeft size={16} />
            Back to Explore
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="rounded-full" onClick={handleShare}>
              <Share2 size={18} />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full">
              <Heart size={18} />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[60vh] min-h-[400px] w-full overflow-hidden">
        <Image
          src={`https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=2000`}
          alt={adminProject.name}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stellar-navy via-stellar-navy/40 to-transparent" />

        <div className="absolute bottom-0 left-0 w-full p-8 md:p-16">
          <div className="container mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-4xl space-y-4"
            >
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="secondary"
                  className="bg-stellar-blue/20 text-stellar-blue border-stellar-blue/30 backdrop-blur-md"
                >
                  {adminProject.type}
                </Badge>
                <Badge
                  variant="secondary"
                  className="bg-stellar-green/20 text-stellar-green border-stellar-green/30 backdrop-blur-md"
                >
                  {carbonProject.verificationStatus}
                </Badge>
              </div>
              <Text as="h1" className="text-4xl md:text-6xl font-bold text-white tracking-tight">
                {adminProject.name}
              </Text>
              <div className="flex items-center gap-4 text-white/80">
                <div className="flex items-center gap-1">
                  <MapPin size={18} className="text-stellar-blue" />
                  <span>
                    {adminProject.location}, {adminProject.country}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar size={18} className="text-stellar-blue" />
                  <span>Started {new Date(adminProject.startDate).getFullYear()}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-4">
                <Button
                  stellar="primary"
                  size="lg"
                  className="min-w-[160px] font-bold shadow-lg shadow-stellar-blue/20"
                >
                  Donate
                </Button>
                <Button
                  size="lg"
                  className="min-w-[160px] font-bold bg-white text-stellar-navy hover:bg-white/90 shadow-lg"
                >
                  Buy Credits
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Content Grid */}
      <div className="container mx-auto px-4 -mt-8 relative z-10">
        {/* Impact Summary */}
        <ImpactMetrics metrics={impactMetrics} className="mb-12" />

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Main Content */}
          <div className="flex-1 space-y-12">
            <section id="about">
              <Text variant="h3" className="mb-6 font-bold flex items-center gap-2">
                About the Project
                <div className="h-px bg-stellar-blue/20 flex-1 ml-4" />
              </Text>
              <div className="prose prose-lg dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
                <p>{adminProject.description}</p>
                <p>
                  This initiative employs advanced ecological restoration techniques to ensure high
                  survival rates for native species. By partnering with local cooperatives, we
                  guarantee long-term stewardship and socio-economic benefits for the surrounding
                  communities.
                </p>
                <p>
                  Our MRV (Measurement, Reporting, and Verification) framework utilizes satellite
                  imagery and ground-level sensors to provide real-time data on carbon sequestration
                  and biodiversity health.
                </p>
              </div>
            </section>

            <section id="timeline">
              <Text variant="h3" className="mb-8 font-bold flex items-center gap-2">
                Project Roadmap
                <div className="h-px bg-stellar-blue/20 flex-1 ml-4" />
              </Text>
              <ProjectTimeline milestones={milestones} />
            </section>
          </div>

          {/* Sidebar */}
          <aside className="w-full lg:w-[380px] space-y-8">
            {/* Map Card */}
            <Card className="p-0 overflow-hidden border-stellar-blue/10">
              <FarmPlotSatelliteView
                plotName={adminProject.name}
                plotLocation={`${adminProject.location}, ${adminProject.country}`}
                coordinates={carbonProject.coordinates}
                plotId={adminProject.id}
                className="p-4"
              />
            </Card>

            {/* MRV Documents */}
            <Card className="p-6 space-y-4 border-stellar-blue/10 bg-stellar-blue/5">
              <Text variant="h4" className="font-bold flex items-center gap-2">
                <ShieldCheck size={20} className="text-stellar-blue" />
                MRV Documentation
              </Text>
              <div className="space-y-3">
                {adminProject.mrvDocuments.map((doc) => (
                  <a
                    key={doc.id}
                    href="#"
                    className="flex items-center justify-between p-3 rounded-lg bg-background border border-border hover:border-stellar-blue/50 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-muted text-muted-foreground group-hover:bg-stellar-blue/10 group-hover:text-stellar-blue">
                        <FileText size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-medium line-clamp-1">{doc.fileName}</div>
                        <div className="text-xs text-muted-foreground">
                          {(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB • {doc.version}
                        </div>
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-muted-foreground" />
                  </a>
                ))}
              </div>
              <Button
                variant="ghost"
                className="w-full text-xs text-stellar-blue hover:bg-stellar-blue/10"
              >
                View All Records <ChevronRight size={14} />
              </Button>
            </Card>

            {/* Project Stats */}
            <Card className="p-6 space-y-4 border-stellar-blue/10">
              <Text variant="h4" className="font-bold">
                Project Summary
              </Text>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Registry</span>
                  <span className="font-medium">{adminProject.registry}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Methodology</span>
                  <span className="font-medium">{adminProject.methodology}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vintage Year</span>
                  <span className="font-medium">{adminProject.vintageYear}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price per unit</span>
                  <span className="font-medium text-stellar-blue">
                    ${adminProject.pricePerTonUsd}
                  </span>
                </div>
              </div>
            </Card>
          </aside>
        </div>

        {/* Related Projects */}
        <section className="mt-24">
          <ProjectCarousel projects={mockCarbonProjects.filter((p) => p.id !== carbonProject.id)} />
        </section>
      </div>
    </main>
  );
}
