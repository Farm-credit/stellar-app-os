'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTilt } from '@/hooks/useTilt';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  glareOpacity?: number;
}

export function TiltCard({ children, className, glareOpacity = 0.2 }: TiltCardProps) {
  const { ref, state, onMouseMove, onMouseLeave } = useTilt();
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const transition = state.active ? 'transform 0.08s ease-out' : 'transform 0.45s ease-out';
  const scale = state.active ? 1.02 : 1;

  return (
    <div
      ref={ref}
      className={cn('relative', className)}
      style={
        reduced
          ? undefined
          : {
              transform: `perspective(1000px) rotateX(${state.rotateX}deg) rotateY(${state.rotateY}deg) scale3d(${scale},${scale},1)`,
              transition,
              willChange: 'transform',
              transformStyle: 'preserve-3d',
            }
      }
      onMouseMove={reduced ? undefined : onMouseMove}
      onMouseLeave={reduced ? undefined : onMouseLeave}
    >
      {children}
      {!reduced && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
          style={{
            background: `radial-gradient(circle at ${state.glareX}% ${state.glareY}%, rgba(255,255,255,${state.active ? glareOpacity : 0}) 0%, transparent 55%)`,
            transition: state.active ? 'background 0.08s ease-out' : 'background 0.45s ease-out',
          }}
        />
      )}
    </div>
  );
}
