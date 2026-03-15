import 'core-js/stable';
import 'regenerator-runtime/runtime';

import './i18n';

import React from 'react';
import { createRoot } from 'react-dom/client';

import App from 'App';
import ErrorBoundary from 'App/ErrorBoundary';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found. Check that index.html is loaded.');
}
const root = createRoot(container);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
