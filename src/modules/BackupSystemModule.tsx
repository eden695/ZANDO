import React, {useEffect, useRef, useState} from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import {SheetModal} from '../components/SheetModal';
import {
  createZandoLogoPngBlob,
  createZandoLogoSvgBlob,
  ZandoLogo,
} from '../components/ZandoLogo';
import {useStore} from '../context/StoreContext';
import {getStorageDiagnostics, StorageDiagnostic} from '../db/indexedDb';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import {downloadBlobSafely} from '../services/androidShareService';
import {
  exportFullBackup,
  restoreBackupPayload,
  validateBackupJson,
} from '../services/backupService';
import {loadSampleCommerceData} from '../services/seedService';
import {ZandoBackupPayload} from '../types/commerce';
import {formatBytes, formatDateTime} from '../utils/format';

export const BackupSystemModule: React.FC = () => {
  const {schemaMeta, appMode, reloadAll, notify} = useStore();
  const isOnline = useOnlineStatus();

  const [diag, setDiag] = useState<StorageDiagnostic | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<ZandoBackupPayload | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [swStatus, setSwStatus] = useState<'active' | 'unsupported' | 'pending'>('pending');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshDiagnostics = async () => {
    try {
      const info = await getStorageDiagnostics();
      setDiag(info);
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    refreshDiagnostics();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => setSwStatus('active'))
        .catch(() => setSwStatus('pending'));
    } else {
      setSwStatus('unsupported');
    }
  }, [appMode]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const {blob, filename, payload} = await exportFullBackup();
      await downloadBlobSafely(blob, filename);
      await reloadAll();
      await refreshDiagnostics();
      notify(
        `Sauvegarde exportée (${payload.products.length} produits, ${payload.mediaBlobs.length} images).`,
        'success',
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Échec de l’exportation.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const validated = validateBackupJson(text);
      setPendingRestore(validated);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Fichier de sauvegarde invalide.', 'error');
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    setRestoring(true);
    try {
      await restoreBackupPayload(pendingRestore, restoreMode);
      await reloadAll();
      await refreshDiagnostics();
      setPendingRestore(null);
      notify('Sauvegarde restaurée avec succès dans IndexedDB.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur lors de la restauration.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const handleLoadDemo = async () => {
    await loadSampleCommerceData();
    await reloadAll();
    await refreshDiagnostics();
    notify('Données exemple ajoutées localement.', 'success');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Backup & Restore Card */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Sauvegarde et restauration complète</span>
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Exportez l’intégralité de votre boutique (produits, images Blob, ventes, dépenses, crédits, commandes, clients, promotions et catalogues) dans un fichier JSON portable et restaurable sur tout appareil.
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Espace actif :{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {appMode === 'demo' ? 'Mode Démonstration isolé' : 'Entreprise personnelle'}
            </strong>
            {diag?.databaseName ? ` (${diag.databaseName})` : ''}
          </span>
          {schemaMeta?.lastBackupAt && (
            <span>
              Dernière sauvegarde exportée le :{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                {formatDateTime(schemaMeta.lastBackupAt)}
              </strong>
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary,#059669)] text-[var(--brand-primary-fg,#FFFFFF)] hover:opacity-95 text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Préparation...' : 'Exporter sauvegarde (.json)'}</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Restaurer depuis un fichier</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleLoadDemo}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>Charger exemple dans cet espace</span>
          </button>
        </div>
      </section>

      {/* Offline & Storage Diagnostics */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            <span>Stockage local & fonctionnement hors ligne</span>
          </h2>
          <button
            type="button"
            onClick={refreshDiagnostics}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualiser</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <div className="text-xs text-slate-500 dark:text-slate-400">Connectivité réseau</div>
            <div className="mt-1 font-bold text-slate-900 dark:text-white">
              {isOnline ? 'En ligne (sync locale active)' : 'Hors ligne (100% opérationnel)'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <div className="text-xs text-slate-500 dark:text-slate-400">Service Worker (cache PWA)</div>
            <div className="mt-1 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              {swStatus === 'active' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              <span>
                {swStatus === 'active'
                  ? 'Actif et prêt hors ligne'
                  : swStatus === 'unsupported'
                    ? 'Non supporté par ce WebView'
                    : 'Initialisation...'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 tabular-nums">
            <div className="text-xs text-slate-500 dark:text-slate-400">Espace IndexedDB utilisé</div>
            <div className="mt-1 font-bold text-slate-900 dark:text-white">
              {diag
                ? `${formatBytes(diag.usageBytes)}${diag.quotaBytes ? ` / ${formatBytes(diag.quotaBytes)}` : ''}`
                : 'Calcul...'}
            </div>
            {diag?.isPersisted && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Stockage persistant protégé
              </div>
            )}
          </div>
        </div>

        {diag && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs tabular-nums pt-1">
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Produits : <strong>{diag.counts.products}</strong>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Ventes : <strong>{diag.counts.sales}</strong>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Dépenses : <strong>{diag.counts.expenses}</strong>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Crédits : <strong>{diag.counts.creditTransactions}</strong>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Commandes : <strong>{diag.counts.orders}</strong>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Clients : <strong>{diag.counts.customers}</strong>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Promotions : <strong>{diag.counts.promotions}</strong>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Catalogues : <strong>{diag.counts.catalogs}</strong>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Images Blob : <strong>{diag.counts.mediaBlobs}</strong>
            </div>
          </div>
        )}
      </section>

      {/* Zero-Data-Loss Migration Log & Privacy Guarantees */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Confidentialité & mises à jour sans perte de données</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Schéma IndexedDB v{schemaMeta?.currentVersion ?? 2} · Application v{schemaMeta?.appVersion ?? '2.0.0'}. Aucune donnée commerciale n’est transmise vers GitHub ou un serveur distant. Les mises à jour utilisent des migrations incrémentales conservant tous vos enregistrements locaux.
        </p>

        {schemaMeta && schemaMeta.migrations.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {schemaMeta.migrations.slice(-5).reverse().map((m, idx) => (
              <div key={idx} className="py-2 flex items-start justify-between gap-3">
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>v{m.version}</strong> · {m.description}
                </span>
                <span className="text-slate-400 shrink-0 tabular-nums">
                  {formatDateTime(m.appliedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Official ZANDO Pro Logo Export */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <ZandoLogo />
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 pt-1">
              Téléchargez directement le logo officiel de <strong>ZANDO Pro</strong> (sans connexion ni lien externe) pour Website 2 APK Builder, vos visuels ou documents.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={async () => {
              try {
                const pngBlob = await createZandoLogoPngBlob(1024);
                await downloadBlobSafely(pngBlob, 'zando-pro-logo-1024.png');
                notify('Logo PNG (1024×1024) téléchargé.', 'success');
              } catch (err) {
                notify(err instanceof Error ? err.message : 'Erreur export PNG.', 'error');
              }
            }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary,#059669)] text-[var(--brand-primary-fg,#FFFFFF)] text-xs sm:text-sm font-semibold cursor-pointer hover:opacity-95"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger PNG (1024×1024)</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              const svgBlob = createZandoLogoSvgBlob('icon');
              await downloadBlobSafely(svgBlob, 'zando-pro-icone.svg');
              notify('Icône SVG téléchargée.', 'success');
            }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Icône seule (.svg)</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              const svgBlob = createZandoLogoSvgBlob('wordmark');
              await downloadBlobSafely(svgBlob, 'zando-pro-logo-complet.svg');
              notify('Logo complet « ZANDO Pro » (.svg) téléchargé.', 'success');
            }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Logo complet avec texte (.svg)</span>
          </button>
        </div>
      </section>

      {/* Restore Preview Modal */}
      <SheetModal
        open={!!pendingRestore}
        onClose={() => setPendingRestore(null)}
        title="Confirmer la restauration"
        maxWidthClass="max-w-lg"
      >
        {pendingRestore && (
          <div className="space-y-4">
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div>
                Boutique source : <strong>{pendingRestore.storeProfile.name}</strong>
              </div>
              <div>
                Date d’exportation : <strong>{formatDateTime(pendingRestore.exportedAt)}</strong>
              </div>
              <div className="tabular-nums">
                Contenu : {pendingRestore.products.length} produits · {pendingRestore.sales.length}{' '}
                ventes · {(pendingRestore.expenses || []).length} dépenses ·{' '}
                {(pendingRestore.creditTransactions || []).length} écritures crédits ·{' '}
                {pendingRestore.orders.length} commandes · {pendingRestore.customers.length} clients ·{' '}
                {pendingRestore.mediaBlobs.length} images
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="restoreMode"
                  checked={restoreMode === 'replace'}
                  onChange={() => setRestoreMode('replace')}
                  className="mt-1 accent-emerald-600"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Remplacer toutes les données actuelles
                  </div>
                  <div className="text-slate-500">
                    Restaure exactement l’état de la sauvegarde sur cet appareil.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="restoreMode"
                  checked={restoreMode === 'merge'}
                  onChange={() => setRestoreMode('merge')}
                  className="mt-1 accent-emerald-600"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Fusionner avec les données existantes
                  </div>
                  <div className="text-slate-500">
                    Ajoute les éléments de la sauvegarde sans supprimer vos ajouts récents.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                disabled={restoring}
                className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                {restoring ? 'Restauration...' : 'Restaurer maintenant'}
              </button>
            </div>
          </div>
        )}
      </SheetModal>
    </div>
  );
};
