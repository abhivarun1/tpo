import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E6E9EF] rounded-2xl p-8 shadow-sm text-center">
            <div className="w-12 h-12 rounded-full bg-[#FFEDE8] text-[#D93838] flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-[#171B26] tracking-tight mb-2">
              Application Error
            </h1>
            <p className="text-sm text-[#596273] mb-6 leading-relaxed">
              Teddy Ranks encountered an unexpected issue while rendering this view.
            </p>

            {this.state.error && (
              <div className="bg-[#F7F8FA] border border-[#E6E9EF] rounded-xl p-3 mb-6 text-left">
                <p className="text-xs font-mono text-[#D93838] break-words">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2E5BFF] hover:bg-[#1E46DB] text-white text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#F7F8FA] hover:bg-[#E6E9EF] text-[#171B26] border border-[#E6E9EF] text-sm font-medium transition-colors"
              >
                <Home className="w-4 h-4" />
                Return Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
