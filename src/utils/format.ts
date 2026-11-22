import {Product, Promotion} from '../types/commerce';

export function generateId(prefix = 'zp'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatMoney(amount: number, currency = 'FCFA'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const zeroDecimals = ['FCFA', 'XOF', 'XAF', 'CDF', 'GNF', 'MGA'].includes(currency.toUpperCase());
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: zeroDecimals ? 0 : 2,
    maximumFractionDigits: zeroDecimals ? 0 : 2,
  }).format(safeAmount);
  return `${formatted} ${currency}`;
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function sanitizePhoneForWhatsApp(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function getContrastTextColor(hexColor: string): '#FFFFFF' | '#0F172A' {
  const clean = (hexColor || '').replace('#', '');
  if (clean.length !== 6 && clean.length !== 3) return '#FFFFFF';
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return '#FFFFFF';
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0F172A' : '#FFFFFF';
}

export function normalizeTextForSearch(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPromotionCurrentlyActive(promo: Promotion, refDate = new Date()): boolean {
  if (!promo.isActive) return false;
  const todayStr = refDate.toISOString().slice(0, 10);
  if (promo.startsAt && todayStr < promo.startsAt) return false;
  if (promo.endsAt && todayStr > promo.endsAt) return false;
  return true;
}

export function getEffectiveProductPrice(
  product: Product,
  promotions: Promotion[],
): {
  originalPrice: number;
  finalPrice: number;
  discountAmount: number;
  appliedPromo?: Promotion;
  promoLabel?: string;
} {
  let bestPrice = product.price;
  let bestPromo: Promotion | undefined;
  let promoLabel: string | undefined;

  for (const promo of promotions) {
    if (!isPromotionCurrentlyActive(promo)) continue;
    const matches =
      promo.scope === 'all' ||
      (promo.scope === 'category' && promo.targetCategory === product.category) ||
      (promo.scope === 'products' && promo.targetProductIds.includes(product.id));

    if (!matches) continue;

    let candidatePrice = product.price;
    let label = '';
    if (promo.discountType === 'percent') {
      const pct = Math.min(Math.max(promo.discountValue, 0), 99);
      candidatePrice = Math.max(0, Math.round((product.price * (100 - pct)) / 100));
      label = `-${pct}%`;
    } else {
      candidatePrice = Math.max(0, product.price - promo.discountValue);
      label = `-${promo.discountValue}`;
    }

    if (candidatePrice < bestPrice) {
      bestPrice = candidatePrice;
      bestPromo = promo;
      promoLabel = label;
    }
  }

  return {
    originalPrice: product.price,
    finalPrice: bestPrice,
    discountAmount: Math.max(0, product.price - bestPrice),
    appliedPromo: bestPromo,
    promoLabel,
  };
}
