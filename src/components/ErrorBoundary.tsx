import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level React error boundary. Without this, any unhandled error during
 * render (a null ref, a bad prop type, a Firebase library exception) crashes
 * the whole app to a blank white page with the only signal being a stack
 * trace in the browser console — which kitchen staff never see.
 *
 * When caught, we render a friendly recovery UI with a reload button. The
 * error message is shown verbatim in dev builds for debugging, hidden in
 * production builds so customers don't see internals.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the browser console so developers debugging in DevTools
    // still see the original stack. In production a remote logging service
    // (Sentry, etc.) would hook in here.
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50 text-center">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-sm border border-gray-100">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-500 text-sm mb-6">
              The page hit an unexpected error. Reloading usually fixes it.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3.5 rounded-2xl transition-colors active:scale-[0.98]"
            >
              Reload page
            </button>
            {import.meta.env.DEV && this.state.error.message && (
              <pre className="mt-4 text-left text-xs bg-gray-50 rounded-xl p-3 text-red-600 overflow-x-auto whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
