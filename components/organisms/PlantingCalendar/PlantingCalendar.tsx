'use client';

import * as React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Sprout } from 'lucide-react';

import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/molecules/Card';
import { cn } from '@/lib/utils';
import { getPlantingEventsForProject, type PlantingEvent } from '@/lib/treePlantingStreams';

interface PlantingCalendarProps {
  projectId: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function PlantingCalendar({ projectId }: PlantingCalendarProps) {
  const events = React.useMemo(
    () =>
      [...getPlantingEventsForProject(projectId)].sort((a, b) =>
        a.scheduledAt.localeCompare(b.scheduledAt)
      ),
    [projectId]
  );

  const [cursor, setCursor] = React.useState(() => {
    const next = events.find((e) => e.status !== 'ended') ?? events[0];
    const d = next ? new Date(next.scheduledAt) : new Date();
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  if (events.length === 0) {
    return (
      <Card className="p-6 border-stellar-green/10" data-testid="planting-calendar-empty">
        <p className="text-sm text-muted-foreground">
          No planting events are scheduled for this project yet.
        </p>
      </Card>
    );
  }

  const byDay = new Map<string, PlantingEvent[]>();
  for (const event of events) {
    const d = new Date(event.scheduledAt);
    const key = dayKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  const firstWeekday = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const shiftMonth = (delta: number) =>
    setCursor((c) => {
      const d = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });

  return (
    <div className="space-y-6" data-testid="planting-calendar">
      <Card className="p-6 space-y-4 border-stellar-blue/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded-md border p-1.5 hover:bg-muted"
            >
              <ChevronLeft size={16} />
            </button>
            <h4 className="min-w-40 text-center font-bold" aria-live="polite">
              {monthLabel}
            </h4>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded-md border p-1.5 hover:bg-muted"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <a
            href={`/api/projects/${projectId}/planting-calendar`}
            download
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            data-testid="ical-download"
          >
            <Download size={14} /> Download iCal
          </a>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAYS.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthLabel}>
          {cells.map((day, index) => {
            const dayEvents = day ? (byDay.get(dayKey(cursor.year, cursor.month, day)) ?? []) : [];
            return (
              <div
                key={index}
                role="gridcell"
                className={cn(
                  'min-h-12 rounded-md border p-1 text-xs',
                  day === null && 'border-transparent',
                  dayEvents.length > 0 && 'border-stellar-green/40 bg-stellar-green/10'
                )}
              >
                {day}
                {dayEvents.length > 0 && (
                  <Sprout
                    size={12}
                    className="mt-1 text-stellar-green"
                    aria-label={`${dayEvents.length} planting event${dayEvents.length === 1 ? '' : 's'}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <ul className="space-y-3">
        {events.map((event) => (
          <li
            key={event.id}
            className="rounded-lg border border-border p-3 text-sm"
            data-testid="planting-calendar-event"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{event.title}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays size={12} /> {formatEventDate(event.scheduledAt)} UTC
                </p>
              </div>
              <Badge variant="secondary">
                {event.status === 'ended' ? 'Completed' : event.status === 'live' ? 'Live' : 'Scheduled'}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Batch: {event.batchId}</p>
            {event.estimatedSpecies && event.estimatedSpecies.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Estimated species: {event.estimatedSpecies.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
