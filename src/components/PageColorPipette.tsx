import React, {useCallback, useEffect, useState} from 'react';
import {Pipette, X} from 'lucide-react';

interface PageColorPipetteProps {
  activeTargetLabel: string | null;
  onPickColor: (hex: string) => void;
  onCancel: () => void;
}

let colorParserCtx: CanvasRenderingContext2D | null = null;

function getColorParserContext(): CanvasRenderingContext2D | null {
  if (!colorParserCtx && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    colorParserCtx = canvas.getContext('2d', {willReadFrequently: true});
  }
  return colorParserCtx;
}

function rgbToHex(colorStr: string): string | null {
  if (
    !colorStr ||
    colorStr === 'none' ||
    colorStr === 'transparent' ||
    colorStr === 'rgba(0, 0, 0, 0)'
  ) {
    return null;
  }
  if (colorStr.startsWith('#')) {
    if (colorStr.length === 7) return colorStr.toUpperCase();
    if (colorStr.length === 4) {
      const r = colorStr[1];
      const g = colorStr[2];
      const b = colorStr[3];
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
  }
  const match = colorStr.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/i);
  if (match) {
    const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
    if (alpha < 0.05) return null;

    const r = Math.min(255, Math.max(0, parseInt(match[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(match[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(match[3], 10)));
    return (
      '#' +
      [r, g, b]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  }

  // Fallback for Tailwind v4 oklch(), lab(), color(srgb ...), hsl(), etc.
  const ctx = getColorParserContext();
  if (!ctx) return null;
  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = colorStr;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    if (data[3] < 13) return null; // < ~5% opacity
    return (
      '#' +
      [data[0], data[1], data[2]]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  } catch {
    return null;
  }
}

function samplePixelFromMedia(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): string | null {
  if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const sx = Math.min(
        el.naturalWidth - 1,
        Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * el.naturalWidth)),
      );
      const sy = Math.min(
        el.naturalHeight - 1,
        Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * el.naturalHeight)),
      );
      ctx.drawImage(el, sx, sy, 1, 1, 0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      if (data[3] < 10) return null;
      return (
        '#' +
        [data[0], data[1], data[2]]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()
      );
    } catch {
      return null;
    }
  }
  if (el instanceof HTMLCanvasElement) {
    try {
      const rect = el.getBoundingClientRect();
      const ctx = el.getContext('2d');
      if (!ctx || rect.width <= 0 || rect.height <= 0) return null;
      const sx = Math.floor(((clientX - rect.left) / rect.width) * el.width);
      const sy = Math.floor(((clientY - rect.top) / rect.height) * el.height);
      const data = ctx.getImageData(sx, sy, 1, 1).data;
      return (
        '#' +
        [data[0], data[1], data[2]]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()
      );
    } catch {
      return null;
    }
  }
  return null;
}

function sampleColorAtPoint(clientX: number, clientY: number): string {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;
    if (el.dataset?.pipetteUi === 'true') continue;

    if (el instanceof HTMLElement) {
      const mediaColor = samplePixelFromMedia(el, clientX, clientY);
      if (mediaColor) return mediaColor;
    }

    const styles = window.getComputedStyle(el);
    if (el instanceof SVGElement) {
      const fillHex = rgbToHex(styles.fill);
      if (fillHex) return fillHex;
      const strokeHex = rgbToHex(styles.stroke);
      if (strokeHex) return strokeHex;
    }

    const bgHex = rgbToHex(styles.backgroundColor);
    if (bgHex) return bgHex;

    // Check inline text/icon color if directly on a text/icon leaf
    if (el.children.length === 0) {
      const fgHex = rgbToHex(styles.color);
      if (fgHex) return fgHex;
    }
  }
  return '#059669';
}

export const PageColorPipette: React.FC<PageColorPipetteProps> = ({
  activeTargetLabel,
  onPickColor,
  onCancel,
}) => {
  const [hoverColor, setHoverColor] = useState('#059669');
  const [pointerPos, setPointerPos] = useState<{x: number; y: number} | null>(null);

  useEffect(() => {
    if (!activeTargetLabel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTargetLabel, onCancel]);

  const inspectAt = useCallback((clientX: number, clientY: number) => {
    const overlay = document.getElementById('zando-page-pipette-overlay');
    if (overlay) overlay.style.pointerEvents = 'none';
    const sampled = sampleColorAtPoint(clientX, clientY);
    if (overlay) overlay.style.pointerEvents = 'auto';
    setHoverColor(sampled);
    setPointerPos({x: clientX, y: clientY});
    return sampled;
  }, []);

  if (!activeTargetLabel) return null;

  return (
    <div
      id="zando-page-pipette-overlay"
      data-pipette-ui="true"
      onPointerMove={(e) => inspectAt(e.clientX, e.clientY)}
      onPointerDown={(e) => {
        // Prevent picking when clicking the cancel HUD button
        const target = e.target as HTMLElement;
        if (target.closest('[data-pipette-cancel="true"]')) return;
        const picked = inspectAt(e.clientX, e.clientY);
        onPickColor(picked);
      }}
      className="fixed inset-0 z-[100] cursor-crosshair select-none touch-none"
      aria-label="Pipette de couleur sur toute la page"
    >
      {/* Floating HUD bar */}
      <div
        data-pipette-ui="true"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[101] flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700"
      >
        <Pipette className="w-4 h-4 text-emerald-400 shrink-0" />
        <div
          className="w-6 h-6 rounded-lg border border-white/30 shrink-0"
          style={{backgroundColor: hoverColor}}
        />
        <div className="text-xs leading-tight">
          <div className="font-semibold">
            Pipette ({activeTargetLabel}) · <span className="font-mono">{hoverColor}</span>
          </div>
          <div className="text-[11px] text-slate-300">
            Parcourez toute la page et touchez/cliquez pour copier la couleur
          </div>
        </div>
        <button
          type="button"
          data-pipette-cancel="true"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
          aria-label="Annuler la pipette"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Magnifier swatch following pointer */}
      {pointerPos && (
        <div
          data-pipette-ui="true"
          className="fixed pointer-events-none z-[101] flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/95 text-white text-[11px] font-mono shadow-lg border border-white/20"
          style={{
            left: Math.min(window.innerWidth - 115, pointerPos.x + 16),
            top: Math.min(window.innerHeight - 44, pointerPos.y + 16),
          }}
        >
          <span
            className="w-3.5 h-3.5 rounded border border-white/40"
            style={{backgroundColor: hoverColor}}
          />
          <span>{hoverColor}</span>
        </div>
      )}
    </div>
  );
};
