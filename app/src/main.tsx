import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadCreatorSDK } from './services/creator';
import type { ErrorBoundaryProps, ErrorBoundaryState } from './types/main.types';
import './styles.css';

// React effects can run after iframe load, too late for Creator's registration message.
// App handles connection errors; standalone localhost preview needs no SDK download.
if (window.self !== window.top) void loadCreatorSDK().catch(() => {});

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="connection-panel">
        <h1>The form couldn’t be displayed</h1>
        <p>
          Reload the widget to try again. If you had just submitted, check the Project report first.
        </p>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
