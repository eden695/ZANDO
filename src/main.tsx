import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Enregistrement du Service Worker Offline-First sans perte de données lors des mises à jour
registerSW({
  immediate: true,
  onOfflineReady() {
    // Cache hors ligne prêt
  },
});

createRoot(document.getElementById('root')!).render(<App />);
