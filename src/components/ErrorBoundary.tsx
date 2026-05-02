import React, { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-black text-text-primary uppercase tracking-widest mb-2">
              Component Error
            </h3>
            <p className="text-[10px] text-text-secondary font-mono opacity-60 max-w-xs">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-surface border border-surface-border rounded-lg text-[10px] font-black uppercase text-text-primary hover:bg-white/5 transition-all"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
