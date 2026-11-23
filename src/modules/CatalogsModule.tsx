import React, {useMemo, useState} from 'react';
import {
  BookOpen,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react';
import {ModernSelect} from '../components/ModernSelect';
import {SheetModal} from '../components/SheetModal';
import {useStore} from '../context/StoreContext';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import {
  copyTextSafely,
  downloadBlobSafely,
  openSocialAppIntent,
  tryNativeFileShare,
} from '../services/androidShareService';
import {
  createIndependentCatalogSnapshot,
  generateCatalogPdfBlob,
  generateStandaloneCatalogHtml,
} from '../services/catalogueGenerator';
import {SavedCatalog} from '../types/commerce';
import {formatBytes, formatDateTime} from '../utils/format';

export const CatalogsModule: React.FC = () => {
  const {catalogs, products, promotions, storeProfile, saveCatalog, removeCatalog, notify} =
    useStore();
  const isOnline = useOnlineStatus();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<SavedCatalog | null>(null);
  const [previewCatalog, setPreviewCatalog] = useState<SavedCatalog | null>(null);
  const [generating, setGenerating] = useState(false);

  // PDF Confirmation Modal state
  const [pdfConfirmState, setPdfConfirmState] = useState<{
    catalog: SavedCatalog;
    blob: Blob;
    filename: string;
  } | null>(null);

  // Share Modal state (PDF or HTML across networks)
  const [shareState, setShareState] = useState<{
    catalog: SavedCatalog;
    format: 'html' | 'pdf';
    blob: Blob;
    filename: string;
    caption: string;
  } | null>(null);

  // Builder state
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showStock, setShowStock] = useState(true);
  const [showPromotions, setShowPromotions] = useState(true);
  const [compressionPreset, setCompressionPreset] = useState<'compact' | 'balanced' | 'high'>(
    'balanced',
  );

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  const archivedCatalogItems = useMemo(() => {
    if (!editingCatalog) return [];
    const currentIds = new Set(products.map((p) => p.id));
    return editingCatalog.products.filter((p) => !currentIds.has(p.id));
  }, [editingCatalog, products]);

  const openBuilder = () => {
    setEditingCatalog(null);
    setTitle(`Catalogue ${storeProfile.name}`);
    setSubtitle(storeProfile.description || 'Sélection officielle disponible sur commande WhatsApp.');
    setSelectedIds(activeProducts.map((p) => p.id));
    setShowStock(true);
    setShowPromotions(true);
    setBuilderOpen(true);
  };

  const openEditCatalog = (cat: SavedCatalog) => {
    setEditingCatalog(cat);
    setTitle(cat.title);
    setSubtitle(cat.subtitle);
    setSelectedIds(cat.products.map((p) => p.id));
    setShowStock(cat.showStock);
    setShowPromotions(cat.showPromotions);
    setBuilderOpen(true);
  };

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      notify('Sélectionnez au moins un produit pour enregistrer le catalogue.', 'error');
      return;
    }

    setGenerating(true);
    try {
      const presetMap = {
        compact: {maxWidth: 480, quality: 0.62},
        balanced: {maxWidth: 640, quality: 0.74},
        high: {maxWidth: 840, quality: 0.84},
      };
      const {maxWidth, quality} = presetMap[compressionPreset];

      const snapshot = await createIndependentCatalogSnapshot(storeProfile, products, promotions, {
        title,
        subtitle,
        selectedProductIds: selectedIds,
        showStock,
        showPromotions,
        imageMaxWidth: maxWidth,
        imageQuality: quality,
        existingCatalog: editingCatalog ?? undefined,
      });

      await saveCatalog(snapshot);
      setBuilderOpen(false);
      setEditingCatalog(null);
      notify(
        `${editingCatalog ? 'Catalogue modifié' : 'Catalogue autonome enregistré'} (${formatBytes(snapshot.htmlSizeBytes)}, ${snapshot.products.length} produits).`,
        'success',
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur lors de la génération.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const getSafeSlug = (text: string) =>
    (text || 'catalogue')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'catalogue';

  const handleDownloadHtml = async (cat: SavedCatalog) => {
    try {
      const html = generateStandaloneCatalogHtml(cat);
      const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
      await downloadBlobSafely(blob, `${getSafeSlug(cat.title)}.html`);
      notify('Fichier HTML autonome téléchargé.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur lors du téléchargement HTML.', 'error');
    }
  };

  const requestPdfConfirmation = (cat: SavedCatalog) => {
    try {
      const blob = generateCatalogPdfBlob(cat);
      const filename = `${getSafeSlug(cat.title)}.pdf`;
      setPdfConfirmState({catalog: cat, blob, filename});
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de générer le PDF.', 'error');
    }
  };

  const confirmAndDownloadPdf = async () => {
    if (!pdfConfirmState) return;
    try {
      await downloadBlobSafely(pdfConfirmState.blob, pdfConfirmState.filename);
      notify(
        `Catalogue PDF téléchargé (${pdfConfirmState.filename} · ${formatBytes(pdfConfirmState.blob.size)}).`,
        'success',
      );
      setPdfConfirmState(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Échec du téléchargement PDF.', 'error');
    }
  };

  const openShareDialog = (cat: SavedCatalog, format: 'html' | 'pdf') => {
    try {
      const blob =
        format === 'html'
          ? new Blob([generateStandaloneCatalogHtml(cat)], {type: 'text/html;charset=utf-8'})
          : generateCatalogPdfBlob(cat);
      const filename = `${getSafeSlug(cat.title)}.${format}`;
      const caption = [
        `*${cat.title}* — ${cat.storeName}`,
        cat.subtitle ? cat.subtitle : '',
        `${cat.products.length} article(s) disponibles.`,
        cat.storePhone ? `Commander sur WhatsApp / Tél : ${cat.storePhone}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      setShareState({
        catalog: cat,
        format,
        blob,
        filename,
        caption,
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de préparer le partage.', 'error');
    }
  };

  const handleNativeShareNow = async () => {
    if (!shareState) return;
    const res = await tryNativeFileShare(
      shareState.blob,
      shareState.filename,
      shareState.catalog.title,
      shareState.caption,
    );
    if (res.shared) {
      notify('Catalogue partagé via le menu natif.', 'success');
      setShareState(null);
      return;
    }
    if (res.cancelled) {
      notify('Partage annulé.', 'info');
      return;
    }
    await downloadBlobSafely(shareState.blob, shareState.filename);
    await copyTextSafely(shareState.caption);
    notify(
      'Menu natif indisponible : fichier téléchargé et message copié. Choisissez un réseau ci-dessous.',
      'info',
    );
  };

  const handleNetworkShare = async (
    platform: 'whatsapp' | 'facebook' | 'instagram' | 'tiktok' | 'email',
  ) => {
    if (!shareState) return;
    // Prépare d'abord le fichier sur l'appareil afin que le commerçant puisse le joindre directement dans le réseau ouvert
    await downloadBlobSafely(shareState.blob, shareState.filename);
    const res = await openSocialAppIntent(platform, shareState.caption, shareState.catalog.title);
    notify(
      res.offline
        ? `${shareState.filename} téléchargé localement. ${res.message}`
        : `${shareState.filename} prêt à joindre dans ${platform.toUpperCase()} (texte copié).`,
      res.offline ? 'error' : 'info',
    );
  };

  const previewHtmlDoc = useMemo(() => {
    if (!previewCatalog) return '';
    return generateStandaloneCatalogHtml(previewCatalog);
  }, [previewCatalog]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
          Créez, modifiez et exportez vos catalogues hors ligne (HTML autonome avec commande WhatsApp, SMS & Appel direct, ou PDF professionnel).
        </p>
        <button
          type="button"
          onClick={openBuilder}
          disabled={products.length === 0}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          style={{
            backgroundColor: 'var(--brand-accent, #059669)',
            color: 'var(--brand-accent-fg, #FFFFFF)',
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Créer un catalogue</span>
        </button>
      </div>

      {catalogs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {products.length === 0
              ? 'Ajoutez d’abord des produits dans votre inventaire pour créer un catalogue.'
              : 'Aucun catalogue généré pour le moment.'}
          </p>
          {products.length > 0 && (
            <button
              type="button"
              onClick={openBuilder}
              className="mt-4 inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Générer mon premier catalogue</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {catalogs.map((cat) => (
            <article
              key={cat.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(cat.createdAt)} · {cat.products.length} produit
                    {cat.products.length > 1 ? 's' : ''} · HTML {formatBytes(cat.htmlSizeBytes)}
                  </div>
                  <h3 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white truncate">
                    {cat.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                    {cat.storeName} · {cat.categories.join(', ')}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Phone className="w-3 h-3 shrink-0" />
                    <span>
                      {cat.storePhone
                        ? `Numéro commande : ${cat.storePhone}`
                        : 'Aucun numéro WhatsApp/Tél enregistré'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditCatalog(cat)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    aria-label="Modifier le catalogue"
                    title="Modifier le catalogue"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await removeCatalog(cat.id);
                      notify('Catalogue supprimé.', 'info');
                    }}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    aria-label="Supprimer le catalogue"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEditCatalog(cat)}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Modifier</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewCatalog(cat)}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Aperçu HTML</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadHtml(cat)}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>HTML autonome</span>
                </button>
                <button
                  type="button"
                  onClick={() => requestPdfConfirmation(cat)}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-rose-600" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => openShareDialog(cat, 'html')}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Partager HTML</span>
                </button>
                <button
                  type="button"
                  onClick={() => openShareDialog(cat, 'pdf')}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 rounded-xl border border-emerald-600/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Partager PDF</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Builder / Editor Modal */}
      <SheetModal
        open={builderOpen}
        onClose={() => {
          setBuilderOpen(false);
          setEditingCatalog(null);
        }}
        title={editingCatalog ? 'Modifier le catalogue' : 'Générer un catalogue autonome'}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Titre du catalogue *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Compression des images</label>
              <ModernSelect
                value={compressionPreset}
                onChange={(val) =>
                  setCompressionPreset(val as 'compact' | 'balanced' | 'high')
                }
                options={[
                  {value: 'compact', label: 'Légère (480px · idéal WhatsApp)'},
                  {value: 'balanced', label: 'Équilibrée (640px · recommandée)'},
                  {value: 'high', label: 'Haute qualité (840px)'},
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Sous-titre / Message d’accroche</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 min-h-[40px] cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={showStock}
                onChange={(e) => setShowStock(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span>Afficher les disponibilités</span>
            </label>
            <label className="flex items-center gap-2 min-h-[40px] cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={showPromotions}
                onChange={(e) => setShowPromotions(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span>Inclure les promotions actives</span>
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold">
                Produits inclus ({selectedIds.length}/{products.length + archivedCatalogItems.length})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIds([
                      ...activeProducts.map((p) => p.id),
                      ...archivedCatalogItems.map((p) => p.id),
                    ])
                  }
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer"
                >
                  Tout sélectionner
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-xs font-semibold text-slate-500 cursor-pointer"
                >
                  Aucun
                </button>
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {products.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="w-4 h-4 accent-emerald-600 shrink-0"
                    />
                    <span className="truncate font-medium">{p.name}</span>
                  </span>
                  <span className="text-xs text-slate-500 shrink-0">{p.category}</span>
                </label>
              ))}
              {archivedCatalogItems.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm cursor-pointer bg-amber-50/40 dark:bg-amber-950/20"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="w-4 h-4 accent-emerald-600 shrink-0"
                    />
                    <span className="truncate font-medium">{p.name} (archivé)</span>
                  </span>
                  <span className="text-xs text-slate-500 shrink-0">{p.category}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                setBuilderOpen(false);
                setEditingCatalog(null);
              }}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={generating || selectedIds.length === 0}
              className="min-h-[44px] px-5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--brand-accent, #059669)',
                color: 'var(--brand-accent-fg, #FFFFFF)',
              }}
            >
              {generating
                ? 'Compression & génération...'
                : editingCatalog
                  ? 'Mettre à jour le catalogue'
                  : 'Enregistrer le catalogue'}
            </button>
          </div>
        </form>
      </SheetModal>

      {/* PDF Download Confirmation Modal (Real verified PDF generation + download) */}
      <SheetModal
        open={!!pdfConfirmState}
        onClose={() => setPdfConfirmState(null)}
        title="Confirmer le téléchargement PDF"
        maxWidthClass="max-w-md"
      >
        {pdfConfirmState && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-1.5 text-xs sm:text-sm">
              <div className="font-bold text-slate-900 dark:text-white">
                {pdfConfirmState.catalog.title}
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Fichier : <span className="font-mono font-semibold">{pdfConfirmState.filename}</span>
              </div>
              <div className="text-slate-600 dark:text-slate-400 tabular-nums">
                Contenu : {pdfConfirmState.catalog.products.length} produit(s) · Taille réelle :{' '}
                <strong>{formatBytes(pdfConfirmState.blob.size)}</strong>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Voulez-vous télécharger ce catalogue professionnel au format PDF dans la mémoire de votre appareil ?
            </p>

            <div className="flex flex-wrap gap-2.5 justify-end pt-1">
              <button
                type="button"
                onClick={() => setPdfConfirmState(null)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = pdfConfirmState.catalog;
                  setPdfConfirmState(null);
                  openShareDialog(target, 'pdf');
                }}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-emerald-600/40 text-emerald-700 dark:text-emerald-400 text-sm font-semibold cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Partager PDF</span>
              </button>
              <button
                type="button"
                onClick={confirmAndDownloadPdf}
                className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Confirmer et télécharger</span>
              </button>
            </div>
          </div>
        )}
      </SheetModal>

      {/* Multi-Network Share Modal for PDF & HTML */}
      <SheetModal
        open={!!shareState}
        onClose={() => setShareState(null)}
        title={`Partager le catalogue (${shareState?.format.toUpperCase() ?? ''})`}
        maxWidthClass="max-w-lg"
      >
        {shareState && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">
                {shareState.filename} ({formatBytes(shareState.blob.size)})
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Le fichier réel {shareState.format.toUpperCase()} sera envoyé via le partage système ou préparé pour le réseau choisi avec le message d’accroche copié.
              </div>
            </div>

            <button
              type="button"
              onClick={handleNativeShareNow}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Envoyer le fichier {shareState.format.toUpperCase()} (Partage Android / Système)</span>
            </button>

            {!isOnline && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                Vous êtes hors ligne : le téléchargement du fichier et la copie fonctionnent sans Internet. L’ouverture des réseaux sociaux demande une connexion.
              </div>
            )}

            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                Ou partager vers un réseau associé :
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleNetworkShare('whatsapp')}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNetworkShare('facebook')}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-sky-600" />
                  <span>Facebook</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNetworkShare('instagram')}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-pink-600" />
                  <span>Instagram</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNetworkShare('tiktok')}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>TikTok</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNetworkShare('email')}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Mail className="w-4 h-4 text-indigo-600" />
                  <span>Email</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await copyTextSafely(shareState.caption);
                    notify('Texte de partage copié.', 'success');
                  }}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-600" />
                  <span>Copier texte</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </SheetModal>

      {/* Full-Screen Interactive HTML Preview Modal */}
      <SheetModal
        open={!!previewCatalog}
        onClose={() => setPreviewCatalog(null)}
        title={`Aperçu autonome : ${previewCatalog?.title ?? ''}`}
        fullScreen
      >
        {previewCatalog && (
          <div className="flex flex-col h-full gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 shrink-0">
              <span>
                Catalogue plein écran · Images encodées en local · Commande WhatsApp, SMS & Appel direct
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openShareDialog(previewCatalog, 'html')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Partager HTML</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadHtml(previewCatalog)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Télécharger HTML</span>
                </button>
              </div>
            </div>
            <iframe
              title="Aperçu du catalogue autonome"
              srcDoc={previewHtmlDoc}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
              className="flex-1 w-full min-h-[calc(100dvh-135px)] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
            />
          </div>
        )}
      </SheetModal>
    </div>
  );
};
