'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
    this.props.onError?.(error, info);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center"
        >
          <p className="text-base font-medium text-[var(--text)]">Something went wrong.</p>
          <p className="text-sm text-[var(--muted)]">
            Refresh the page or contact support if the problem persists.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 text-sm font-medium text-[var(--primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
