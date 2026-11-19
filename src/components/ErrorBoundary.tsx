import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-transparent p-4" dir="rtl">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-4 border border-border">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-danger mb-4 border border-red-200">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-xl font-extrabold text-text-main">خطای موقت در سامانه رخ داد</h1>
            <p className="text-xs text-text-secondary leading-relaxed pb-2">
              هنگام پردازش اطلاعات خطایی رخ داد. اطلاعات قبلی شما در سیستم محفوظ است.
            </p>
            {this.state.error?.message && (
              <div className="bg-canvas p-3 rounded-xl text-left text-xs font-mono text-danger overflow-auto max-h-32 mb-4 border border-border">
                {this.state.error?.message}
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="primary" className="w-full" onClick={() => { this.setState({ hasError: false }); window.location.reload(); }} >
                بارگذاری مجدد سامانه
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { localStorage.removeItem('akhavan_crm_state'); window.location.reload(); }} >
                بازنشانی حافظه موقت (Reset Local Cache)
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
