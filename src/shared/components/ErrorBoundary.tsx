import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Prevents one malformed node/document from turning the whole app into a
 * blank white screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected application error',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Mindgraph crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div role="alert" className="h-screen w-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-2xl border border-rose-500/40 bg-card p-6 space-y-4 text-center">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
          <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>
          <p className="text-xs text-muted-foreground break-words">{this.state.message}</p>
          <p className="text-[11px] text-muted-foreground">
            Your last saved project should still be available. Reload to continue.
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reload app
          </Button>
        </div>
      </div>
    );
  }
}
