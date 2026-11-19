'use client';

import * as React from 'react';
import { CalendarDays, Radio, Users } from 'lucide-react';

import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/molecules/Card';
import { cn } from '@/lib/utils';
import {
  getFeaturedPlantingEvent,
  getPlantingEventsForProject,
  getSponsorsToInvite,
  linkRecordingToTrees,
  type PlantingEvent,
} from '@/lib/treePlantingStreams';

interface LivePlantingStreamProps {
  projectId: string;
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
}

function StreamEmbed({ event }: { event: PlantingEvent }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl bg-stellar-navy"
      data-testid="stream-player"
    >
      <video
        src={event.streamUrl}
        controls
        playsInline
        preload="metadata"
        poster={event.thumbnailUrl}
        aria-label={`Live stream: ${event.title}`}
        className="aspect-video w-full object-cover"
      />
      <div className="absolute left-3 top-3 flex items-center gap-2">
        {event.status === 'live' ? (
          <Badge className="bg-red-600 text-white border-transparent animate-pulse">
            <Radio size={12} className="mr-1" /> LIVE
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-white/90 text-stellar-navy">
            {event.status === 'scheduled' ? 'Scheduled' : 'Recording'}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function LivePlantingStream({ projectId }: LivePlantingStreamProps) {
  const featured = React.useMemo(() => getFeaturedPlantingEvent(projectId), [projectId]);
  const events = React.useMemo(() => getPlantingEventsForProject(projectId), [projectId]);

  if (!featured) {
    return (
      <Card className="p-6 border-stellar-green/10">
        <p className="text-sm text-muted-foreground">
          No planting events are scheduled for this project yet. Sponsors are invited to every live
          stream as soon as one is set up.
        </p>
      </Card>
    );
  }

  const invitees = getSponsorsToInvite(featured);
  const featuredLink = `/projects/${projectId}#live-events`;

  return (
    <div className="space-y-6" data-testid="live-planting-stream">
      <Card className="p-6 space-y-4 border-stellar-blue/10">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="font-bold">{featured.title}</h4>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{featured.description}</p>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays size={14} />
            {formatEventDate(featured.scheduledAt)}
          </p>
        </div>

        <StreamEmbed event={featured} />

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Users size={15} className="text-stellar-blue" />
            {invitees.length} sponsor{invitees.length === 1 ? '' : 's'} of this batch were notified
            and invited
          </p>
          {featured.status === 'scheduled' && (
            <p className="text-xs text-muted-foreground">
              Watch on the event page at {formatEventDate(featured.scheduledAt)} — invite sent to
              batch sponsors.
            </p>
          )}
        </div>
      </Card>

      {events.length > 1 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">More events</p>
          {events
            .filter((event) => event.id !== featured.id)
            .map((event) => {
              const recordings = linkRecordingToTrees(event);
              return (
                <div
                  key={event.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm',
                    'border-border hover:border-stellar-blue/50'
                  )}
                >
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatEventDate(event.scheduledAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {recordings.length > 0 && (
                      <a
                        href={event.recordingUrl}
                        className="text-xs text-stellar-blue underline"
                        title={`Recording linked to ${recordings.length} tree profiles`}
                      >
                        Recording • {recordings.length} trees
                      </a>
                    )}
                    <a
                      href={featuredLink}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      View event
                    </a>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
