import React, {useState} from 'react';
import {Download, Share} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {SheetModal} from './SheetModal';

export const PWAInstallButton: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          install();
        }}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{compact ? 'Installer' : 'Installer l’app'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Share className="w-4 h-4 shrink-0" />
          <span>Installer</span>
        </button>

        <SheetModal
          open={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          title="Installer ZANDO Pro sur iOS"
          maxWidthClass="max-w-sm"
        >
          <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
            <li>Appuyez sur le bouton Partager dans la barre Safari.</li>
            <li>Faites défiler et sélectionnez « Sur l’écran d’accueil ».</li>
            <li>Confirmez pour utiliser ZANDO Pro hors ligne.</li>
          </ol>
          <button
            type="button"
            onClick={() => setShowIOSGuide(false)}
            className="mt-5 w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold cursor-pointer"
          >
            Compris
          </button>
        </SheetModal>
      </>
    );
  }

  return null;
};
