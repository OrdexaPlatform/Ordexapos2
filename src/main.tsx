import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initPwaManager, registerServiceWorker } from './lib/pwa/pwaService';

// Initialize PWA install handlers and offline service worker
initPwaManager();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
