'use client';

import { type JSX, useState, useEffect, useRef } from 'react';
import { Sun, Moon, Sparkles } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface ThemeSwitcherProps {
  variant?: 'default' | 'compact' | 'pill';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ThemeSwitcher({
  variant = 'default',
  size = 'md',
  className,
}: ThemeSwitcherProps): JSX.Element {
  const { theme, toggle, isDark } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);
  const [showSparkle, setShowSparkle] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = (): void => {
    setIsAnimating(true);
    setShowSparkle(true);
    
    // Reset animation state after animation completes
    setTimeout(() => {
      setIsAnimating(false);
    }, 600);
    
    setTimeout(() => {
      setShowSparkle(false);
    }, 400);
    
    toggle();
  };

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  const iconSize = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const variantClasses = {
    default: 'rounded-2xl',
    compact: 'rounded-lg',
    pill: 'rounded-full',
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleToggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-pressed={isDark}
      role="switch"
      className={cn(
        // Glassmorphism base styles
        'relative overflow-hidden',
        'backdrop-blur-xl',
        'border border-white/10',
        'shadow-lg',
        'transition-all duration-300 ease-out',
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-stellar-blue',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background',
        'disabled:opacity-50',
        'disabled:cursor-not-allowed',
        
        // Theme-specific glassmorphism
        isDark
          ? 'bg-white/5 hover:bg-white/10 shadow-black/30'
          : 'bg-black/5 hover:bg-black/10 shadow-black/10',
        
        // Size and variant
        sizeClasses[size],
        variantClasses[variant],
        
        // Animation
        isAnimating && 'scale-95',
        
        className
      )}
    >
      {/* Animated gradient background */}
      <div
        className={cn(
          'absolute inset-0 opacity-0 transition-opacity duration-500',
          isAnimating && 'opacity-100',
          isDark
            ? 'bg-gradient-to-tr from-stellar-blue/20 via-stellar-purple/20 to-stellar-cyan/20'
            : 'bg-gradient-to-tr from-stellar-blue/10 via-stellar-purple/10 to-stellar-cyan/10'
        )}
      />

      {/* Sparkle effect */}
      {showSparkle && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles
            className={cn(
              'absolute text-stellar-blue animate-pulse',
              iconSize[size]
            )}
            style={{
              animation: 'sparkle 0.6s ease-out forwards',
            }}
          />
        </div>
      )}

      {/* Theme icon */}
      <div className="relative z-10 flex items-center justify-center">
        {isDark ? (
          <Sun
            className={cn(
              'text-yellow-300 transition-transform duration-300',
              iconSize[size],
              isAnimating && 'rotate-180 scale-0'
            )}
            aria-hidden="true"
          />
        ) : (
          <Moon
            className={cn(
              'text-stellar-blue transition-transform duration-300',
              iconSize[size],
              isAnimating && '-rotate-180 scale-0'
            )}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Glow effect */}
      <div
        className={cn(
          'absolute inset-0 rounded-inherit opacity-0 blur-xl transition-opacity duration-300',
          isDark
            ? 'bg-stellar-blue/20 hover:opacity-100'
            : 'bg-stellar-purple/20 hover:opacity-100'
        )}
      />
    </button>
  );
}

// Export a compact version for mobile
export function CompactThemeSwitcher(props: Omit<ThemeSwitcherProps, 'variant'>): JSX.Element {
  return <ThemeSwitcher {...props} variant="compact" size="sm" />;
}

// Export a pill version for inline use
export function PillThemeSwitcher(props: Omit<ThemeSwitcherProps, 'variant'>): JSX.Element {
  return <ThemeSwitcher {...props} variant="pill" size="md" />;
}
