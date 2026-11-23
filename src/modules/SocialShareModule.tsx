import React, {useEffect, useMemo, useState} from 'react';
import {Copy, ExternalLink, Info, MessageCircle, Share2} from 'lucide-react';
import {BlobImage} from '../components/BlobImage';
import {useStore} from '../context/StoreContext';
import {getById, STORES} from '../db/indexedDb';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import {
  copyTextSafely,
  openSocialAppIntent,
  shareFileWithFallback,
} from '../services/androidShareService';
import {MediaBlobRecord} from '../types/commerce';
import {formatMoney, getEffectiveProductPrice} from '../utils/format';

export const SocialShareModule: React.FC = () => {
  const {products, promotions, storeProfile, notify} = useStore();
  const isOnline = useOnlineStatus();
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id ?? '');
  const [caption, setCaption] = useState('');

  useEffect(() => {
    if (!selectedProductId && products[0]) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? products[0],
    [products, selectedProductId],
  );

  useEffect(() => {
    if (!selectedProduct) {
      setCaption('');
      return;
    }
    const pricing = getEffectiveProductPrice(selectedProduct, promotions);
    const priceLine =
      pricing.finalPrice < pricing.originalPrice
        ? `Prix promo : ${formatMoney(pricing.finalPrice, storeProfile.currency)} (au lieu de ${formatMoney(pricing.originalPrice, storeProfile.currency)} ${pricing.promoLabel ?? ''})`
        : `Prix : ${formatMoney(pricing.finalPrice, storeProfile.currency)}`;

    const stockLine =
      selectedProduct.stock > 0
        ? `Disponible immédiatement (${selectedProduct.stock} ${selectedProduct.unit})`
        : 'Sur commande';

    const lines = [
      `${selectedProduct.name}`,
      selectedProduct.description ? selectedProduct.description : '',
      '',
      priceLine,
      stockLine,
      storeProfile.phone ? `Commander sur WhatsApp : ${storeProfile.phone}` : '',
      storeProfile.address ? `Boutique : ${storeProfile.address}` : '',
      '',
      `#${(selectedProduct.category || 'Boutique').replace(/\s+/g, '')} #${storeProfile.name.replace(/\s+/g, '')}`,
    ].filter((l) => l !== undefined && (l !== '' || true));

    setCaption(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
  }, [selectedProduct, promotions, storeProfile]);

  const handleShareWithMedia = async () => {
    if (!selectedProduct) return;
    if (selectedProduct.imageBlobId) {
      const media = await getById<MediaBlobRecord>(STORES.MEDIA_BLOBS, selectedProduct.imageBlobId);
      if (media?.blob) {
        const res = await shareFileWithFallback(
          media.blob,
          `${selectedProduct.sku || 'produit'}.jpg`,
          selectedProduct.name,
          caption,
        );
        notify(res.message, 'info');
        return;
      }
    }

    await copyTextSafely(caption);
    notify('Texte copié dans le presse-papiers.', 'success');
  };

  return (
    <div className="space-y-5">
      {/* Honest manual-confirmation notice */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
          ZANDO Pro ne stocke aucun mot de passe de réseau social et n’effectue aucune publication cachée. Sélectionnez un article, copiez ou partagez son visuel, puis confirmez manuellement la publication dans WhatsApp, Facebook ou Instagram.
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
          Ajoutez des produits dans votre boutique pour préparer vos publications sociales.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Product Picker & Visual */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Produit à mettre en avant
              </label>
              <select
                value={selectedProduct?.id ?? ''}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.price, storeProfile.currency)}
                  </option>
                ))}
              </select>
            </div>

            {selectedProduct && (
              <div className="aspect-[4/3] w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <BlobImage
                  blobId={selectedProduct.imageBlobId}
                  alt={selectedProduct.name}
                  fallbackLabel={selectedProduct.category}
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleShareWithMedia}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Partager image + texte (Android / Web Share)</span>
            </button>
          </section>

          {/* Editable Caption & App Launchers */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Texte de publication (modifiable)
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    await copyTextSafely(caption);
                    notify('Texte de publication copié.', 'success');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier le texte</span>
                </button>
              </div>
              <textarea
                rows={8}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm leading-relaxed"
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                Copier automatiquement le texte et ouvrir l’application (nécessite Internet) :
              </div>
              {!isOnline && (
                <div className="mb-2.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  Vous êtes hors ligne : l’ouverture de WhatsApp, Facebook, Instagram et TikTok nécessite une connexion Internet. La préparation et la copie du texte fonctionnent hors ligne.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await openSocialAppIntent('whatsapp', caption);
                    notify(res.message, res.offline ? 'error' : 'info');
                  }}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await openSocialAppIntent('facebook', caption);
                    notify(res.message, res.offline ? 'error' : 'info');
                  }}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-sky-600" />
                  <span>Facebook</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await openSocialAppIntent('instagram', caption);
                    notify(res.message, res.offline ? 'error' : 'info');
                  }}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-pink-600" />
                  <span>Instagram</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await openSocialAppIntent('tiktok', caption);
                    notify(res.message, res.offline ? 'error' : 'info');
                  }}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>TikTok</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
