import React, { Component, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-surface-background flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="w-16 h-16 bg-sentiment-negative/10 text-sentiment-negative rounded-2xl flex items-center justify-center mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="font-display text-2xl font-bold text-text-primary mb-2">
            Đã có sự cố xảy ra
          </h2>
          <p className="text-text-secondary text-sm max-w-md mb-6 leading-relaxed">
            Ứng dụng gặp lỗi ngoài dự kiến. Bạn vui lòng thử tải lại trang hoặc quay về trang chủ.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <RefreshCw size={16} />
              Tải lại trang
            </button>
            <button
              onClick={this.handleGoHome}
              className="px-5 py-2.5 bg-white border border-border-subtle text-text-primary rounded-xl font-bold text-sm hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              Về trang chủ
            </button>
          </div>
          {this.state.error && (
            <pre className="mt-8 p-4 bg-slate-900 text-slate-100 text-xs rounded-xl max-w-xl overflow-auto text-left">
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
