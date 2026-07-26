'use client';

import {
  X,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  TreePine,
  Briefcase,
  Coins,
} from 'lucide-react';
import { useToast, type Toast as ToastType } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-slide-in {
          from {
            transform: translateY(1rem) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes toast-fade-out {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        .animate-toast-in {
          animation: toast-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div className="fixed bottom-0 right-0 z-50 flex flex-col gap-3 p-4 md:p-6 w-full max-w-md pointer-events-none max-h-screen overflow-y-auto">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => dismissToast(toast.id)} />
        ))}
      </div>
    </>
  );
}

function ToastItem({ toast, onClose }: { toast: ToastType; onClose: () => void }) {
  const getIcon = () => {
    // Specifically handle the four requested event types in terms of icons
    if (toast.type === 'contract') {
      const lowerTitle = toast.title.toLowerCase();
      if (lowerTitle.includes('tree') || lowerTitle.includes('sponsor')) {
        return <TreePine className="h-5 w-5 text-emerald-500 dark:text-emerald-400 shrink-0" />;
      }
      if (
        lowerTitle.includes('planter') ||
        lowerTitle.includes('job') ||
        lowerTitle.includes('accept')
      ) {
        return <Briefcase className="h-5 w-5 text-indigo-500 dark:text-indigo-400 shrink-0" />;
      }
      if (
        lowerTitle.includes('verify') ||
        lowerTitle.includes('verification') ||
        lowerTitle.includes('complete')
      ) {
        return <CheckCircle2 className="h-5 w-5 text-sky-500 dark:text-sky-400 shrink-0" />;
      }
      if (lowerTitle.includes('payment') || lowerTitle.includes('received')) {
        return <Coins className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0" />;
      }
      return <Sparkles className="h-5 w-5 text-purple-500 dark:text-purple-400 shrink-0" />;
    }

    switch (toast.type) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-rose-500 dark:text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-sky-500 dark:text-sky-400 shrink-0" />;
    }
  };

  const getBorderColor = () => {
    if (toast.type === 'contract') {
      const lowerTitle = toast.title.toLowerCase();
      if (lowerTitle.includes('tree') || lowerTitle.includes('sponsor'))
        return 'border-emerald-500/30';
      if (
        lowerTitle.includes('planter') ||
        lowerTitle.includes('job') ||
        lowerTitle.includes('accept')
      )
        return 'border-indigo-500/30';
      if (
        lowerTitle.includes('verify') ||
        lowerTitle.includes('verification') ||
        lowerTitle.includes('complete')
      )
        return 'border-sky-500/30';
      if (lowerTitle.includes('payment') || lowerTitle.includes('received'))
        return 'border-amber-500/30';
      return 'border-purple-500/30';
    }

    switch (toast.type) {
      case 'success':
        return 'border-emerald-500/30';
      case 'error':
        return 'border-rose-500/30';
      case 'warning':
        return 'border-amber-500/30';
      case 'info':
      default:
        return 'border-sky-500/30';
    }
  };

  return (
    <div
      role="alert"
      className={cn(
        'animate-toast-in pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-4 shadow-xl transition-all',
        'backdrop-blur-md bg-white/80 dark:bg-slate-900/80',
        'text-slate-900 dark:text-slate-100',
        getBorderColor()
      )}
    >
      <div className="mt-0.5">{getIcon()}</div>

      <div className="flex-1 space-y-1">
        <h4 className="text-sm font-semibold leading-tight">{toast.title}</h4>
        {toast.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
            {toast.description}
          </p>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              onClose();
            }}
            className="mt-2 text-xs font-semibold text-stellar-blue hover:text-stellar-blue/80 dark:text-stellar-cyan dark:hover:text-stellar-cyan/80 transition-colors pointer-events-auto block"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="Close notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
