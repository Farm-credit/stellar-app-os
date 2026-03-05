export type AppErrorType = 'network' | 'auth' | 'unknown';

export interface ErrorPresentation {
  type: AppErrorType;
  title: string;
  message: string;
}

function normalizeErrorMessage(error: Error): string {
  return error.message.toLowerCase();
}

function isNetworkError(error: Error): boolean {
  const message = normalizeErrorMessage(error);

  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econn') ||
    message.includes('offline')
  );
}

function isAuthError(error: Error): boolean {
  const message = normalizeErrorMessage(error);

  return (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('authentication') ||
    message.includes('authorization') ||
    message.includes('token') ||
    message.includes('session') ||
    message.includes('401') ||
    message.includes('403')
  );
}

export function getErrorPresentation(error: Error): ErrorPresentation {
  if (isNetworkError(error)) {
    return {
      type: 'network',
      title: 'Connection issue',
      message:
        'We could not reach the server. Check your internet connection and try again.',
    };
  }

  if (isAuthError(error)) {
    return {
      type: 'auth',
      title: 'Sign-in required',
      message: 'Your session may have expired. Sign in again or try the action one more time.',
    };
  }

  return {
    type: 'unknown',
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again in a moment.',
  };
}
