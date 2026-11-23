import React, {useEffect, useRef, useState} from 'react';
import {GripHorizontal, Maximize2, Minimize2, X} from 'lucide-react';

interface SheetModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
  fullScreen?: boolean;
}

export const SheetModal: React.FC<SheetModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
  fullScreen = false,
}) => {
  const [minimized, setMinimized] = useState(false);
  const [offset, setOffset] = useState({x: 0, y: 0});
  const [dragging, setDragging] = useState(false);

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Reset position & minimized state each time the floating window opens
  useEffect(() => {
    if (open) {
      setMinimized(false);
      setOffset({x: 0, y: 0});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (fullScreen) return;
    // Ignore drag start when tapping header buttons
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (fullScreen || !dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;

    const maxLeft = -(window.innerWidth * 0.75);
    const maxRight = window.innerWidth * 0.4;
    const maxUp = -(window.innerHeight * 0.75);
    const maxDown = window.innerHeight * 0.25;

    setOffset({
      x: Math.min(maxRight, Math.max(maxLeft, dragStartRef.current.origX + dx)),
      y: Math.min(maxDown, Math.max(maxUp, dragStartRef.current.origY + dy)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    }
    setDragging(false);
    dragStartRef.current = null;
  };

  if (!open) return null;

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
            <span>Fermer</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">{children}</div>
        {footer && (
          <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0 pb-safe">
            {footer}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none flex items-end justify-center sm:justify-end p-2.5 sm:p-5"
      role="dialog"
      aria-modal="false"
      aria-label={title}
    >
      <div
        ref={cardRef}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        }}
        className={`pointer-events-auto relative ${
          minimized ? 'w-auto max-w-[92vw] sm:max-w-xs' : `w-full ${maxWidthClass} max-h-[68dvh] sm:max-h-[76dvh]`
        } flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-300/90 dark:border-slate-700 rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.24)] ring-1 ring-slate-900/5 dark:ring-white/10 overflow-hidden transition-[box-shadow]`}
      >
        {/* Draggable Floating Window Title Bar */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200/90 dark:border-slate-800 shrink-0 select-none touch-none ${
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          } bg-slate-50/90 dark:bg-slate-950/70`}
          title="Glisser pour déplacer la fenêtre"
        >
          <div className="flex items-center gap-2 min-w-0">
            <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label={minimized ? 'Agrandir la fenêtre' : 'Réduire la fenêtre'}
              title={minimized ? 'Agrandir' : 'Réduire'}
            >
              {minimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] -mr-1 flex items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Fermer"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5">{children}</div>
            {footer && (
              <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 shrink-0 pb-safe">
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
