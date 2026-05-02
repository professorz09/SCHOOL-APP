import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: React.ReactNode; label?: string }
interface State { error: Error | null; info: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactComponent = (React as any).Component as new <P, S>(props: P) => {
  props: P;
  state: S;
  setState(s: Partial<S>): void;
  render(): React.ReactNode;
};

export class ErrorBoundary extends ReactComponent<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: '' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ error, info: info.componentStack ?? '' });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center">
          <AlertTriangle size={28} className="text-rose-600" />
        </div>
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-black text-slate-900 mb-1">
            {this.props.label ?? 'Screen'} Crash
          </h2>
          <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-left break-all mb-2">
            {error.message}
          </p>
          {info && (
            <pre className="text-[9px] text-slate-400 bg-slate-100 rounded-xl p-2 text-left overflow-auto max-h-40 mb-2">
              {info.trim()}
            </pre>
          )}
        </div>
        <button
          onClick={() => this.setState({ error: null, info: '' })}
          className="flex items-center gap-2 bg-indigo-600 text-white font-black text-sm px-5 py-3 rounded-2xl"
        >
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }
}
