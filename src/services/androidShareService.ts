import {blobToDataUrl} from './mediaService';
import {sanitizePhoneForWhatsApp} from '../utils/format';

export interface ShareResult {
  method: 'web-share-file' | 'web-share-text' | 'download-fallback';
  message: string;
}

export function detectAndroidWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /wv|website2apk|android.*version\/[\d.]+/.test(ua);
}

export function canUseNativeFileShare(file: File): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({files: [file]});
  } catch {
    return false;
  }
}

export async function downloadBlobSafely(blob: Blob, filename: string): Promise<'anchor' | 'dataurl-fallback'> {
  if (!blob || blob.size === 0) {
    throw new Error('Le fichier généré est vide.');
  }

  const isWebView = detectAndroidWebView();
  if (isWebView && blob.size <= 12 * 1024 * 1024) {
    // Android WebView / Website 2 APK DownloadListener rejette souvent blob: sans erreur JS -> data: URI fiable
    const dataUrl = await blobToDataUrl(blob);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return 'dataurl-fallback';
  }

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Delay revocation so browser / Android download manager reads the full stream
    setTimeout(() => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }, 15000);

    return 'anchor';
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const dataUrl = await blobToDataUrl(blob);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return 'dataurl-fallback';
  }
}

export async function tryNativeFileShare(
  blob: Blob,
  filename: string,
  title: string,
  text: string,
): Promise<{shared: boolean; cancelled?: boolean}> {
  try {
    const file = new File([blob], filename, {type: blob.type || 'application/octet-stream'});
    if (canUseNativeFileShare(file)) {
      await navigator.share({
        title,
        text,
        files: [file],
      });
      return {shared: true};
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {shared: false, cancelled: true};
    }
  }
  return {shared: false};
}

export async function shareFileWithFallback(
  blob: Blob,
  filename: string,
  title: string,
  text: string,
): Promise<ShareResult> {
  const nativeRes = await tryNativeFileShare(blob, filename, title, text);
  if (nativeRes.shared) {
    return {
      method: 'web-share-file',
      message: 'Fichier partagé via le menu natif de l’appareil.',
    };
  }
  if (nativeRes.cancelled) {
    return {
      method: 'web-share-file',
      message: 'Partage annulé par l’utilisateur.',
    };
  }

  await downloadBlobSafely(blob, filename);
  await copyTextSafely(text);

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({title, text});
      return {
        method: 'web-share-text',
        message: 'Fichier téléchargé et message prêt à partager.',
      };
    } catch {
      // Ignore if blocked in WebView
    }
  }

  return {
    method: 'download-fallback',
    message: 'Fichier téléchargé sur votre appareil. Vous pouvez maintenant le joindre sur WhatsApp ou vos réseaux.',
  };
}

export async function copyTextSafely(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export interface ExternalLaunchResult {
  launched: boolean;
  offline: boolean;
  message: string;
}

export async function openWhatsAppChat(
  phone: string,
  message: string,
): Promise<ExternalLaunchResult> {
  await copyTextSafely(message);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      launched: false,
      offline: true,
      message:
        'Connexion Internet requise pour ouvrir WhatsApp. Le message a été copié localement pour envoi dès votre reconnexion.',
    };
  }

  const clean = sanitizePhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  const url = clean
    ? `https://api.whatsapp.com/send?phone=${clean}&text=${encoded}`
    : `https://api.whatsapp.com/send?text=${encoded}`;
  launchExternalUri(url);
  return {
    launched: true,
    offline: false,
    message: 'Ouverture de WhatsApp avec votre message prêt.',
  };
}

export async function openSocialAppIntent(
  platform: 'whatsapp' | 'facebook' | 'instagram' | 'tiktok' | 'email',
  textToCopy?: string,
  subject?: string,
): Promise<ExternalLaunchResult> {
  if (textToCopy) {
    await copyTextSafely(textToCopy);
  }

  const labels: Record<typeof platform, string> = {
    whatsapp: 'WhatsApp',
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    email: 'Email',
  };

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      launched: false,
      offline: true,
      message: `Connexion Internet requise pour ouvrir ${labels[platform]}. ${
        textToCopy ? 'Le texte a été copié localement.' : ''
      }`.trim(),
    };
  }

  const urls: Record<typeof platform, string> = {
    whatsapp: textToCopy
      ? `https://api.whatsapp.com/send?text=${encodeURIComponent(textToCopy)}`
      : 'https://api.whatsapp.com/',
    facebook: 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
    tiktok: 'https://www.tiktok.com/',
    email: `mailto:?subject=${encodeURIComponent(subject || 'Catalogue boutique')}&body=${encodeURIComponent(textToCopy || '')}`,
  };
  launchExternalUri(urls[platform]);
  return {
    launched: true,
    offline: false,
    message: `Ouverture de ${labels[platform]} pour partager.`,
  };
}

function launchExternalUri(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
