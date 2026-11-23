import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { isStaleBuildError, reloadForNewVersion } from '@/lib/staleBuild';

interface State {
  error: Error | null;
}

/** Shows a recoverable error instead of a blank page if a screen crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MEETOS screen error', error, info.componentStack);
    if (isStaleBuildError(error)) reloadForNewVersion();
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (isStaleBuildError(this.state.error)) {
      return (
        <div role="alert" className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-6 text-center shadow-card">
          <RefreshCw className="mx-auto size-6 text-brand-text" aria-hidden />
          <h2 className="mt-3 text-[15px] font-semibold text-fg">A new version of Meetos is available</h2>
          <p className="mt-1 text-[13px] text-fg-2">Reload to continue. Anything you already saved is kept.</p>
          <button className="mt-4 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-fg hover:bg-surface-2" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return (
      <div role="alert" className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-6 text-center shadow-card">
        <AlertTriangle className="mx-auto size-6 text-warning" aria-hidden />
        <h2 className="mt-3 text-[15px] font-semibold text-fg">Something went wrong on this screen</h2>
        <p className="mt-1 text-[13px] text-fg-2">{this.state.error.message}</p>
        <button className="mt-4 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-fg hover:bg-surface-2" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
