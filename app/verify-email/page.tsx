'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle, Mail, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type VerificationStatus = 'idle' | 'verifying' | 'success' | 'error' | 'expired';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [isResending, setIsResending] = useState(false);

  const verifyToken = useCallback(
    async (tokenToVerify: string) => {
      setStatus('verifying');
      try {
        // Mock API call for verification
        const res = await fetch('/api/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenToVerify }),
        });

        const data = await res.json();

        if (res.ok) {
          setStatus('success');
          // Redirect to dashboard after a brief delay
          setTimeout(() => {
            router.push('/dashboard');
          }, 3000);
        } else {
          setStatus(data.error === 'expired' ? 'expired' : 'error');
          setErrorMessage(data.message || 'Failed to verify email. The link may be invalid.');
        }
      } catch {
        setStatus('error');
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    },
    [router]
  );

  // Initial verification if token exists
  useEffect(() => {
    if (token && status === 'idle') {
      verifyToken(token);
    }
  }, [token, status, verifyToken]);

  // Polling for verification status if no token or pending
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (status === 'idle' || status === 'expired' || status === 'error') {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/verify-email/status');
          if (res.ok) {
            const data = await res.json();
            if (data.verified) {
              setStatus('success');
              setTimeout(() => {
                router.push('/dashboard');
              }, 3000);
            }
          }
        } catch {
          // Silent fail for polling
        }
      }, 5000); // Poll every 5 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, router]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    try {
      const res = await fetch('/api/verify-email/resend', {
        method: 'POST',
      });
      if (res.ok) {
        setResendCooldown(60); // 60 seconds cooldown
      } else {
        // Handle error if needed, maybe show a toast
        console.error('Failed to resend');
      }
    } catch {
      console.error('Network error');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
      <div className="p-8 text-center space-y-6">
        {/* Status Icon */}
        <div className="flex justify-center">
          {status === 'idle' || status === 'verifying' ? (
            <div className="relative">
              <div className="absolute inset-0 bg-blue-100 dark:bg-blue-900/30 rounded-full animate-ping opacity-75"></div>
              <div className="relative bg-blue-50 dark:bg-blue-900/50 p-4 rounded-full">
                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
            </div>
          ) : status === 'success' ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/50 p-4 rounded-full animate-in zoom-in spin-in-12 duration-500">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
          ) : status === 'expired' ? (
            <div className="bg-amber-50 dark:bg-amber-900/50 p-4 rounded-full animate-in zoom-in duration-300">
              <Mail className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
          ) : (
            <div className="bg-red-50 dark:bg-red-900/50 p-4 rounded-full animate-in zoom-in duration-300">
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          )}
        </div>

        {/* Messaging */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {status === 'idle'
              ? 'Check your email'
              : status === 'verifying'
                ? 'Verifying your email...'
                : status === 'success'
                  ? 'Email verified!'
                  : status === 'expired'
                    ? 'Link expired'
                    : 'Verification failed'}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
            {status === 'idle'
              ? "We've sent a verification link to your email address. Please click the link to verify your account."
              : status === 'verifying'
                ? 'Please wait while we confirm your email address.'
                : status === 'success'
                  ? 'Your email has been successfully verified. Redirecting you to the dashboard...'
                  : status === 'expired'
                    ? "The verification link has expired. Don't worry, you can request a new one."
                    : errorMessage}
          </p>
        </div>

        {/* Actions */}
        <div className="pt-4 flex flex-col gap-3">
          {(status === 'idle' || status === 'expired' || status === 'error') && (
            <Button
              onClick={handleResend}
              disabled={resendCooldown > 0 || isResending}
              className="w-full relative group overflow-hidden"
              size="lg"
            >
              {isResending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : resendCooldown > 0 ? (
                <span>Resend available in {resendCooldown}s</span>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 group-hover:rotate-180 transition-transform duration-500" />
                  <span>Resend verification email</span>
                </>
              )}
            </Button>
          )}

          {status === 'success' && (
            <Button
              onClick={() => router.push('/dashboard')}
              className="w-full relative group overflow-hidden bg-emerald-600 hover:bg-emerald-700 text-white"
              size="lg"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          )}
        </div>
      </div>

      {/* Polling indicator for idle state */}
      <div
        className={`bg-zinc-50 dark:bg-zinc-800/50 p-4 border-t border-zinc-100 dark:border-zinc-800 transition-all duration-500 text-center ${status === 'idle' ? 'opacity-100 h-auto' : 'opacity-0 h-0 overflow-hidden py-0'}`}
      >
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Waiting for verification...
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 selection:bg-blue-100 dark:selection:bg-blue-900/40">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
