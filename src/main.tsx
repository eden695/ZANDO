import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Enregistrement sûr du Service Worker (actif en HTTPS ou localhost, ignoré sans erreur en file:// APK WebView)
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
) {
  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        // Ne jamais forcer un rechargement hors ligne qui pourrait afficher une erreur réseau
      },
      onOfflineReady() {
        // Cache hors ligne prêt
      },
      onRegisterError() {
        // Ignoré proprement si le WebView Android gère son propre cache local
      },
    });
  } catch {
    // WebView restrictif : l'app continue de fonctionner localement via IndexedDB
  }
}

createRoot(document.getElementById('root')!).render(<App />);
