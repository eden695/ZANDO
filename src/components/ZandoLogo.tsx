import React from 'react';

interface ZandoLogoProps {
  compact?: boolean;
  className?: string;
}

export const ZANDO_PRO_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="112" fill="#0F172A"/>
  <rect x="36" y="36" width="440" height="440" rx="88" stroke="#1E293B" stroke-width="8"/>
  <path d="M148 156H364L324 216H212L364 356H148L188 296H300L148 156Z" fill="#10B981"/>
  <circle cx="356" cy="156" r="22" fill="#F8FAFC"/>
</svg>`;

export const ZANDO_PRO_WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="360" viewBox="0 0 1280 360" fill="none">
  <rect x="20" y="20" width="320" height="320" rx="70" fill="#0F172A"/>
  <rect x="42" y="42" width="276" height="276" rx="55" stroke="#1E293B" stroke-width="6"/>
  <path d="M112 117H248L223 155H153L248 243H112L137 205H207L112 117Z" fill="#10B981"/>
  <circle cx="243" cy="117" r="14" fill="#F8FAFC"/>
  <text x="392" y="216" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="136" font-weight="800" letter-spacing="-4" fill="#0F172A">ZANDO <tspan fill="#059669">Pro</tspan></text>
</svg>`;

export function createZandoLogoSvgBlob(variant: 'icon' | 'wordmark' = 'icon'): Blob {
  const svg = variant === 'wordmark' ? ZANDO_PRO_WORDMARK_SVG : ZANDO_PRO_ICON_SVG;
  return new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
}

export async function createZandoLogoPngBlob(size = 1024): Promise<Blob> {
  const svgBlob = createZandoLogoSvgBlob('icon');
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Impossible de convertir le logo en PNG.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible.');
    ctx.drawImage(img, 0, 0, size, size);
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png'),
    );
    if (!pngBlob) throw new Error('Échec de génération du fichier PNG.');
    return pngBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Identité officielle ZANDO Pro — Ne doit jamais être remplacée par le logo du commerçant.
 */
export const ZandoLogo: React.FC<ZandoLogoProps> = ({compact = false, className = ''}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none shrink-0 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 512 512"
        fill="none"
        aria-hidden="true"
        className="w-8 h-8 rounded-lg shrink-0 shadow-sm"
      >
        <rect width="512" height="512" rx="112" fill="#0F172A" />
        <rect x="36" y="36" width="440" height="440" rx="88" stroke="#1E293B" strokeWidth="8" />
        <path d="M148 156H364L324 216H212L364 356H148L188 296H300L148 156Z" fill="#10B981" />
        <circle cx="356" cy="156" r="22" fill="#F8FAFC" />
      </svg>
      {!compact && (
        <span className="font-display text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
          ZANDO <span className="text-emerald-600 dark:text-emerald-400">Pro</span>
        </span>
      )}
    </div>
  );
};
