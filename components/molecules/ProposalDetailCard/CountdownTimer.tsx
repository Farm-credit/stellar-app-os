'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  deadline: string;
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(deadline: string): TimeLeft | null {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function CountdownTimer({ deadline, className }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => calculateTimeLeft(deadline));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(deadline));
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  if (!timeLeft) {
    return (
      <span
        className={cn('text-sm font-medium text-muted-foreground', className)}
        aria-label="Voting has ended"
      >
        Voting ended
      </span>
    );
  }

  const units: { label: string; value: number }[] = [
    { label: 'd', value: timeLeft.days },
    { label: 'h', value: timeLeft.hours },
    { label: 'm', value: timeLeft.minutes },
    { label: 's', value: timeLeft.seconds },
  ];

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 24;

  return (
    <div
      className={cn('flex items-center gap-1.5 text-sm tabular-nums', className)}
      role="timer"
      aria-label={`Time remaining: ${timeLeft.days} days, ${timeLeft.hours} hours, ${timeLeft.minutes} minutes, ${timeLeft.seconds} seconds`}
    >
      {units.map((unit, i) => (
        <span key={unit.label} className="flex items-baseline gap-0.5">
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 font-semibold',
              isUrgent ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-foreground'
            )}
          >
            {pad(unit.value)}
          </span>
          <span className="text-muted-foreground">{unit.label}</span>
          {i < units.length - 1 && <span className="ml-0.5 text-muted-foreground">:</span>}
        </span>
      ))}
    </div>
  );
}
