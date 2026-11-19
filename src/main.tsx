import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Service worker: app shell + Web Push (system notifications when background/closed)
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/serviceWorker.js').catch((error) => {
      console.warn('[AKHAVAN][PWA] Service worker registration failed:', error);
    });
  }, { once: true });
}
