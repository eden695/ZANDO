import React from 'react';
import {AlertCircle, CheckCircle2, Info, X} from 'lucide-react';
import {useStore} from '../context/StoreContext';

export const ToastBanner: React.FC = () => {
  const {toasts, dismissToast} = useStore();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-16 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon =
          toast.tone === 'success'
            ? CheckCircle2
            : toast.tone === 'error'
              ? AlertCircle
              : Info;
        const toneClasses =
          toast.tone === 'success'
            ? 'bg-emerald-950 text-emerald-50 border-emerald-800'
            : toast.tone === 'error'
              ? 'bg-rose-950 text-rose-50 border-rose-800'
              : 'bg-slate-900 text-slate-50 border-slate-700';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm ${toneClasses}`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1 leading-snug">{toast.text}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="p-1 -m-1 opacity-75 hover:opacity-100 shrink-0"
              aria-label="Fermer la notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
