import {deleteRecord, getById, putRecord, STORES} from '../db/indexedDb';
import {MediaBlobRecord} from '../types/commerce';
import {generateId} from '../utils/format';

export interface CompressOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  mimeType?: 'image/jpeg' | 'image/webp';
}

const DEFAULT_COMPRESS_OPTIONS: CompressOptions = {
  maxWidth: 900,
  maxHeight: 900,
  quality: 0.78,
  mimeType: 'image/jpeg',
};

const objectUrlCache = new Map<string, string>();

export function revokeCachedUrl(blobId?: string): void {
  if (!blobId) return;
  const existing = objectUrlCache.get(blobId);
  if (existing) {
    URL.revokeObjectURL(existing);
    objectUrlCache.delete(blobId);
  }
}

export function clearAllCachedUrls(): void {
  for (const url of objectUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  objectUrlCache.clear();
}

export async function getBlobObjectUrl(blobId?: string): Promise<string | undefined> {
  if (!blobId) return undefined;
  const cached = objectUrlCache.get(blobId);
  if (cached) return cached;

  const record = await getById<MediaBlobRecord>(STORES.MEDIA_BLOBS, blobId);
  if (!record?.blob) return undefined;

  const url = URL.createObjectURL(record.blob);
  objectUrlCache.set(blobId, url);
  return url;
}

export async function compressImageFile(
  file: File | Blob,
  options: Partial<CompressOptions> = {},
): Promise<{blob: Blob; width: number; height: number; mimeType: string; originalSize: number}> {
  const opts = {...DEFAULT_COMPRESS_OPTIONS, ...options};
  const originalSize = file.size;

  const dataUrl = await blobToDataUrl(file);
  const img = await loadHtmlImage(dataUrl);

  let width = img.naturalWidth || img.width || 600;
  let height = img.naturalHeight || img.height || 600;

  if (width > opts.maxWidth || height > opts.maxHeight) {
    const ratio = Math.min(opts.maxWidth / width, opts.maxHeight / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexte Canvas indisponible pour la compression d’image.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const targetMime = opts.mimeType ?? 'image/jpeg';
  const compressedBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('Échec de la compression du fichier image.'));
      },
      targetMime,
      opts.quality,
    );
  });

  return {
    blob: compressedBlob,
    width,
    height,
    mimeType: compressedBlob.type || targetMime,
    originalSize,
  };
}

export async function saveCompressedImageBlob(
  file: File | Blob,
  options: Partial<CompressOptions> = {},
  replaceBlobId?: string,
): Promise<MediaBlobRecord> {
  const compressed = await compressImageFile(file, options);
  const id = replaceBlobId || generateId('img');

  if (replaceBlobId) {
    revokeCachedUrl(replaceBlobId);
  }

  const record: MediaBlobRecord = {
    id,
    blob: compressed.blob,
    mimeType: compressed.mimeType,
    width: compressed.width,
    height: compressed.height,
    originalSize: compressed.originalSize,
    compressedSize: compressed.blob.size,
    createdAt: Date.now(),
  };

  await putRecord(STORES.MEDIA_BLOBS, record);
  const url = URL.createObjectURL(record.blob);
  objectUrlCache.set(id, url);

  return record;
}

export async function deleteMediaBlob(blobId?: string): Promise<void> {
  if (!blobId) return;
  revokeCachedUrl(blobId);
  await deleteRecord(STORES.MEDIA_BLOBS, blobId);
}

export async function getCompressedDataUrlForCatalog(
  blobId?: string,
  maxWidth = 640,
  quality = 0.72,
): Promise<string | undefined> {
  if (!blobId) return undefined;
  const record = await getById<MediaBlobRecord>(STORES.MEDIA_BLOBS, blobId);
  if (!record?.blob) return undefined;

  if (record.width <= maxWidth && record.blob.size <= 75 * 1024) {
    return blobToDataUrl(record.blob);
  }

  const recompressed = await compressImageFile(record.blob, {
    maxWidth,
    maxHeight: maxWidth,
    quality,
    mimeType: 'image/jpeg',
  });
  return blobToDataUrl(recompressed.blob);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Impossible de convertir le Blob en Data URL.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Erreur de lecture du fichier.'));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  if (!header || !base64) {
    throw new Error('Data URL invalide.');
  }
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], {type: mime});
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Format d’image non pris en charge par cet appareil.'));
    img.src = src;
  });
}
