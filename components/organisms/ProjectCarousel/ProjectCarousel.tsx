'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { ProjectCard } from '@/components/molecules/ProjectCard';
import type { CarbonProject } from '@/lib/types/carbon';
import { cn } from '@/lib/utils';

interface ProjectCarouselProps {
  projects: CarbonProject[];
  className?: string;
}

export function ProjectCarousel({ projects, className }: ProjectCarouselProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <div className={cn('relative group', className)}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold tracking-tight">Related Projects</h3>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll('left')}
            className="rounded-full border-stellar-blue/20 bg-background/50 backdrop-blur-sm hover:bg-stellar-blue/10 hover:text-stellar-blue"
            aria-label="Previous projects"
          >
            <ChevronLeft size={20} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll('right')}
            className="rounded-full border-stellar-blue/20 bg-background/50 backdrop-blur-sm hover:bg-stellar-blue/10 hover:text-stellar-blue"
            aria-label="Next projects"
          >
            <ChevronRight size={20} />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {projects.map((project) => (
          <motion.div
            key={project.id}
            className="min-w-[85%] md:min-w-[calc(50%-12px)] lg:min-w-[calc(33.333%-16px)] snap-start"
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <div className="h-full border border-stellar-blue/10 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
              <ProjectCard project={project} />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
