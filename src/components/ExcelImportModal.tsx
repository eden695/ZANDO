import React, {useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import {SheetModal} from './SheetModal';
import {useStore} from '../context/StoreContext';
import {downloadBlobSafely} from '../services/androidShareService';
import {
  autoDetectColumnMapping,
  buildImportPreview,
  ColumnMapping,
  DuplicateCriterion,
  DuplicatePolicy,
  generateExcelTemplateBlob,
  IMPORT_FIELD_LABELS,
  ImportFieldKey,
  ImportReport,
  ParsedSpreadsheet,
  parseSpreadsheetFile,
  prepareProductsForImport,
} from '../services/excelImportService';
import {formatMoney} from '../utils/format';

interface ExcelImportModalProps {
  open: boolean;
  onClose: () => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({open, onClose}) => {
  const {products, storeProfile, importProductsBatch, notify} = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: '',
    sku: '',
    category: '',
    description: '',
    costPrice: '',
    price: '',
    stock: '',
    lowStockThreshold: '',
    supplier: '',
  });
  const [criterion, setCriterion] = useState<DuplicateCriterion>('sku_or_name');
  const [policy, setPolicy] = useState<DuplicatePolicy>('update');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const resetState = () => {
    setParsed(null);
    setReport(null);
    setFileError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFileError(null);
    setReport(null);
    try {
      const result = await parseSpreadsheetFile(file);
      setParsed(result);
      setMapping(autoDetectColumnMapping(result.headers));
    } catch (err) {
      setParsed(null);
      setFileError(
        err instanceof Error ? err.message : 'Impossible de lire ce fichier Excel ou CSV.',
      );
    }
  };

  const handleDownloadTemplate = async () => {
    const blob = generateExcelTemplateBlob();
    await downloadBlobSafely(blob, 'modele-import-produits-zando-pro.xlsx');
    notify('Modèle Excel téléchargé.', 'success');
  };

  const previewRows = useMemo(() => {
    if (!parsed) return [];
    return buildImportPreview(parsed.rows, mapping, products, criterion);
  }, [parsed, mapping, products, criterion]);

  const stats = useMemo(() => {
    const valid = previewRows.filter((r) => r.errors.length === 0).length;
    const invalid = previewRows.filter((r) => r.errors.length > 0).length;
    const duplicates = previewRows.filter((r) => r.errors.length === 0 && r.duplicateOf).length;
    return {valid, invalid, duplicates};
  }, [previewRows]);

  const handleExecuteImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const {productsToSave, report: finalReport} = prepareProductsForImport(previewRows, policy);
      if (productsToSave.length > 0) {
        await importProductsBatch(productsToSave);
      }
      setReport(finalReport);
      notify(
        `Import terminé : ${finalReport.created} créé(s), ${finalReport.updated} mis à jour.`,
        'success',
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur lors de l’importation.', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <SheetModal
      open={open}
      onClose={handleClose}
      title="Importation Excel (.xlsx) et CSV"
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Step 1: File Picker & Template */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Importer votre liste de produits hors ligne</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Formats acceptés : .xlsx, .xls, .csv. Aucune donnée n’est envoyée en ligne.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Modèle Excel</span>
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 min-h-[42px] px-4 rounded-xl text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--brand-accent, #059669)',
                color: 'var(--brand-accent-fg, #FFFFFF)',
              }}
            >
              <Upload className="w-4 h-4" />
              <span>{parsed ? 'Changer de fichier' : 'Choisir un fichier'}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {fileError && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3.5 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{fileError}</span>
          </div>
        )}

        {/* Final Import Report */}
        {report && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="w-5 h-5" />
              <span>Rapport d’importation terminé</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs tabular-nums">
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900">
                Créés : <strong>{report.created}</strong>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900">
                Mis à jour : <strong>{report.updated}</strong>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900">
                Ignorés (doublons) : <strong>{report.skipped}</strong>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900">
                Lignes invalides : <strong>{report.invalid}</strong>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
              >
                Fermer et voir les produits
              </button>
            </div>
          </div>
        )}

        {/* Mapping + Duplicate Rules + Preview */}
        {parsed && !report && (
          <>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Fichier : <strong>{parsed.fileName}</strong> · Feuille : <strong>{parsed.sheetName}</strong> ·{' '}
              <span className="tabular-nums">{parsed.rows.length} ligne(s) détectée(s)</span>
            </div>

            {/* Column Mapping Grid */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Correspondance des colonnes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(Object.keys(IMPORT_FIELD_LABELS) as ImportFieldKey[]).map((fieldKey) => {
                  const meta = IMPORT_FIELD_LABELS[fieldKey];
                  return (
                    <div key={fieldKey}>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        {meta.label} {meta.required ? '*' : ''}
                      </label>
                      <select
                        value={mapping[fieldKey]}
                        onChange={(e) =>
                          setMapping((prev) => ({...prev, [fieldKey]: e.target.value}))
                        }
                        className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                      >
                        <option value="">-- Non mappé --</option>
                        {parsed.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Duplicate Strategy */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold mb-1">Détecter les doublons par</label>
                <select
                  value={criterion}
                  onChange={(e) => setCriterion(e.target.value as DuplicateCriterion)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="sku_or_name">Référence (SKU) ou Nom du produit</option>
                  <option value="sku">Référence (SKU) uniquement</option>
                  <option value="name">Nom du produit uniquement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">En cas de doublon</label>
                <select
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value as DuplicatePolicy)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="update">Mettre à jour le produit existant</option>
                  <option value="skip">Ignorer le doublon</option>
                  <option value="create">Importer comme nouveau produit</option>
                </select>
              </div>
            </div>

            {/* Validation Summary */}
            <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                Valides : {stats.valid}
              </span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                Doublons détectés : {stats.duplicates}
              </span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                Erreurs : {stats.invalid}
              </span>
            </div>

            {/* Preview Table */}
            <div className="max-h-60 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Ligne</th>
                    <th className="px-3 py-2 font-semibold">Produit</th>
                    <th className="px-3 py-2 font-semibold">Réf.</th>
                    <th className="px-3 py-2 font-semibold text-right">Achat</th>
                    <th className="px-3 py-2 font-semibold text-right">Vente</th>
                    <th className="px-3 py-2 font-semibold text-right">Qté</th>
                    <th className="px-3 py-2 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  {previewRows.slice(0, 60).map((row) => (
                    <tr key={row.rowIndex}>
                      <td className="px-3 py-2 text-slate-400">{row.rowIndex}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">
                        {row.name || '—'}
                        {row.supplier && (
                          <div className="text-[11px] font-normal text-slate-500">
                            {row.category} · {row.supplier}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono">{row.sku}</td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(row.costPrice, storeProfile.currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatMoney(row.price, storeProfile.currency)}
                      </td>
                      <td className="px-3 py-2 text-right">{row.stock}</td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            {row.errors.join(', ')}
                          </span>
                        ) : row.duplicateOf ? (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            Doublon ({policy === 'update' ? 'sera mis à jour' : policy === 'skip' ? 'ignoré' : 'nouveau'})
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            Prêt
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={importing || stats.valid === 0}
                onClick={handleExecuteImport}
                className="min-h-[44px] px-5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--brand-accent, #059669)',
                  color: 'var(--brand-accent-fg, #FFFFFF)',
                }}
              >
                {importing ? 'Importation...' : `Importer ${stats.valid} produit(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </SheetModal>
  );
};
