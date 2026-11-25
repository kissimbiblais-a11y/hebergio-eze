import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Une erreur inattendue est survenue.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <div
            role="alert"
            className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/50 dark:bg-slate-900"
          >
            <h1 className="text-lg font-semibold text-red-700 dark:text-red-400">
              Erreur d’application détectée
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              L’opération demandée a été bloquée ou a rencontré une erreur de validation.
            </p>
            <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-800 dark:bg-slate-950 dark:text-slate-200">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              Recharger Hébergio
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
