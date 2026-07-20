import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary, installGlobalErrorHandlers } from './diagnostics';
import './styles/tokens.css';
import './styles/theme.css';
import './styles.css';
import './styles/components.css';

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);
