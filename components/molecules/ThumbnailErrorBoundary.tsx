import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Isolates the thumbnail preview so a corrupt image or an object-URL
 * revoked mid-render can't take the whole verification ticket down with it.
 */
export class ThumbnailErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Photo thumbnail failed to render:', error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
