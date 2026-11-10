import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Guard against Firestore internal assertion errors from crashing the page
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason?.message || String(event?.reason || '');
    if (
      reason.includes('INTERNAL ASSERTION FAILED') ||
      reason.includes('ca9') ||
      reason.includes('b815') ||
      reason.includes('Missing or insufficient permissions')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.warn('Suppressed transient Firestore internal event:', reason);
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event?.message || String(event?.error || '');
    if (
      msg.includes('INTERNAL ASSERTION FAILED') ||
      msg.includes('ca9') ||
      msg.includes('b815')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.warn('Suppressed transient Firestore window error:', msg);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
