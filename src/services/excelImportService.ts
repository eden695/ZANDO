import * as XLSX from 'xlsx';
import {Product} from '../types/commerce';
import {generateId, normalizeTextForSearch} from '../utils/format';

export type ImportFieldKey =
  | 'name'
  | 'sku'
  | 'category'
  | 'description'
  | 'costPrice'
  | 'price'
  | 'stock'
  | 'lowStockThreshold'
  | 'supplier';

export type DuplicatePolicy = 'skip' | 'update' | 'create';
export type DuplicateCriterion = 'sku' | 'name' | 'sku_or_name';

export interface ParsedSpreadsheet {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export type ColumnMapping = Record<ImportFieldKey, string>;

export interface MappedPreviewRow {
  rowIndex: number; // 1-indexed spreadsheet data row
  sku: string;
  name: string;
  category: string;
  description: string;
  costPrice: number;
  price: number;
  stock: number;
  lowStockThreshold: number;
  supplier: string;
  errors: string[];
  duplicateOf?: Product;
}

export interface ImportReport {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
}

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, {label: string; required?: boolean}> = {
  name: {label: 'Nom du produit', required: true},
  sku: {label: 'Référence (SKU)'},
  category: {label: 'Catégorie'},
  description: {label: 'Description'},
  costPrice: {label: 'Prix d’achat'},
  price: {label: 'Prix de vente', required: true},
  stock: {label: 'Quantité en stock'},
  lowStockThreshold: {label: 'Seuil d’alerte'},
  supplier: {label: 'Fournisseur'},
};

const FIELD_SYNONYMS: Record<ImportFieldKey, string[]> = {
  name: ['nom du produit', 'nom', 'produit', 'designation', 'article', 'libelle', 'title', 'name', 'product'],
  sku: ['reference', 'ref', 'sku', 'code', 'code barre', 'barcode', 'id'],
  category: ['categorie', 'rayon', 'famille', 'groupe', 'category', 'type'],
  description: ['description', 'details', 'caracteristiques', 'note', 'notes'],
  costPrice: ['prix d achat', 'prix achat', 'cout d achat', 'cout', 'achat', 'pa', 'cost', 'cost price'],
  price: ['prix de vente', 'prix vente', 'prix', 'tarif', 'pv', 'montant', 'price', 'selling price'],
  stock: ['quantite', 'qte', 'stock', 'inventaire', 'qty', 'quantity'],
  lowStockThreshold: ['seuil d alerte', 'seuil', 'alerte', 'stock min', 'minimum', 'threshold'],
  supplier: ['fournisseur', 'vendeur', 'marque', 'supplier', 'vendor'],
};

export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {type: 'array'});
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error('Le fichier ne contient aucune feuille exploitable.');
  }

  const sheet = workbook.Sheets[firstSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1, defval: ''});
  if (matrix.length < 2) {
    throw new Error('Le fichier doit contenir une ligne d’en-tête et au moins une ligne de produit.');
  }

  const rawHeaders = matrix[0].map((cell, idx) => {
    const text = String(cell ?? '').trim();
    return text || `Colonne ${idx + 1}`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!Array.isArray(line)) continue;
    const hasAnyValue = line.some((c) => String(c ?? '').trim() !== '');
    if (!hasAnyValue) continue;

    const record: Record<string, unknown> = {};
    rawHeaders.forEach((h, colIdx) => {
      record[h] = line[colIdx] ?? '';
    });
    rows.push(record);
  }

  if (rows.length === 0) {
    throw new Error('Aucune ligne de produit valide détectée dans le fichier.');
  }

  return {
    fileName: file.name,
    sheetName: firstSheet,
    headers: rawHeaders,
    rows,
  };
}

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    norm: normalizeTextForSearch(h),
  }));

  const mapping: ColumnMapping = {
    name: '',
    sku: '',
    category: '',
    description: '',
    costPrice: '',
    price: '',
    stock: '',
    lowStockThreshold: '',
    supplier: '',
  };

  const usedHeaders = new Set<string>();

  (Object.keys(FIELD_SYNONYMS) as ImportFieldKey[]).forEach((field) => {
    const synonyms = FIELD_SYNONYMS[field];
    // Exact match first
    let found = normalizedHeaders.find(
      (h) => !usedHeaders.has(h.raw) && synonyms.includes(h.norm),
    );
    // Partial inclusion second
    if (!found) {
      found = normalizedHeaders.find(
        (h) =>
          !usedHeaders.has(h.raw) &&
          synonyms.some((syn) => h.norm.includes(syn) || (syn.length >= 4 && syn.includes(h.norm))),
      );
    }
    if (found) {
      mapping[field] = found.raw;
      usedHeaders.add(found.raw);
    }
  });

  return mapping;
}

function parseNumericCell(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  const str = String(val ?? '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

export function buildImportPreview(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  existingProducts: Product[],
  criterion: DuplicateCriterion,
): MappedPreviewRow[] {
  const skuMap = new Map<string, Product>();
  const nameMap = new Map<string, Product>();

  for (const p of existingProducts) {
    if (p.sku.trim()) skuMap.set(p.sku.trim().toLowerCase(), p);
    if (p.name.trim()) nameMap.set(normalizeTextForSearch(p.name), p);
  }

  return rows.map((row, idx) => {
    const errors: string[] = [];

    const name = mapping.name ? String(row[mapping.name] ?? '').trim() : '';
    const skuRaw = mapping.sku ? String(row[mapping.sku] ?? '').trim() : '';
    const category = mapping.category ? String(row[mapping.category] ?? '').trim() : '';
    const description = mapping.description ? String(row[mapping.description] ?? '').trim() : '';
    const supplier = mapping.supplier ? String(row[mapping.supplier] ?? '').trim() : '';

    const rawPrice = mapping.price ? row[mapping.price] : '';
    const rawCost = mapping.costPrice ? row[mapping.costPrice] : '';
    const rawStock = mapping.stock ? row[mapping.stock] : '';
    const rawThreshold = mapping.lowStockThreshold ? row[mapping.lowStockThreshold] : '';

    const parsedPrice = parseNumericCell(rawPrice);
    const parsedCost = parseNumericCell(rawCost);
    const parsedStock = parseNumericCell(rawStock);
    const parsedThreshold = parseNumericCell(rawThreshold);

    if (!name) {
      errors.push('Nom du produit manquant');
    }

    if (parsedPrice === null || parsedPrice < 0) {
      errors.push('Prix de vente invalide');
    }

    if (mapping.costPrice && String(rawCost ?? '').trim() !== '' && (parsedCost === null || parsedCost < 0)) {
      errors.push('Prix d’achat invalide');
    }

    if (mapping.stock && String(rawStock ?? '').trim() !== '' && (parsedStock === null || parsedStock < 0)) {
      errors.push('Quantité négative ou invalide');
    }

    let duplicateOf: Product | undefined;
    if (criterion === 'sku' && skuRaw) {
      duplicateOf = skuMap.get(skuRaw.toLowerCase());
    } else if (criterion === 'name' && name) {
      duplicateOf = nameMap.get(normalizeTextForSearch(name));
    } else if (criterion === 'sku_or_name') {
      duplicateOf =
        (skuRaw ? skuMap.get(skuRaw.toLowerCase()) : undefined) ??
        (name ? nameMap.get(normalizeTextForSearch(name)) : undefined);
    }

    return {
      rowIndex: idx + 2,
      sku: skuRaw || `IMP-${String(idx + 1).padStart(3, '0')}`,
      name,
      category: category || 'Général',
      description,
      costPrice: Math.max(0, parsedCost ?? 0),
      price: Math.max(0, parsedPrice ?? 0),
      stock: Math.max(0, Math.round(parsedStock ?? 0)),
      lowStockThreshold: Math.max(0, Math.round(parsedThreshold ?? 3)),
      supplier,
      errors,
      duplicateOf,
    };
  });
}

export function prepareProductsForImport(
  previewRows: MappedPreviewRow[],
  policy: DuplicatePolicy,
): {productsToSave: Product[]; report: ImportReport} {
  const now = Date.now();
  const productsToSave: Product[] = [];
  const report: ImportReport = {
    totalRows: previewRows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    invalid: 0,
  };

  for (const row of previewRows) {
    if (row.errors.length > 0) {
      report.invalid += 1;
      continue;
    }

    if (row.duplicateOf) {
      if (policy === 'skip') {
        report.skipped += 1;
        continue;
      }
      if (policy === 'update') {
        productsToSave.push({
          ...row.duplicateOf,
          name: row.name,
          sku: row.sku,
          category: row.category,
          description: row.description || row.duplicateOf.description,
          price: row.price,
          costPrice: row.costPrice > 0 ? row.costPrice : row.duplicateOf.costPrice,
          stock: row.stock,
          lowStockThreshold: row.lowStockThreshold,
          supplier: row.supplier || row.duplicateOf.supplier,
          updatedAt: now,
        });
        report.updated += 1;
        continue;
      }
    }

    productsToSave.push({
      id: generateId('prd'),
      sku: row.duplicateOf && policy === 'create' ? `${row.sku}-${Math.floor(10 + Math.random() * 89)}` : row.sku,
      name: row.name,
      description: row.description,
      category: row.category,
      price: row.price,
      costPrice: row.costPrice,
      extraFees: 0,
      supplier: row.supplier,
      stock: row.stock,
      lowStockThreshold: row.lowStockThreshold,
      unit: 'pièce',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    report.created += 1;
  }

  return {productsToSave, report};
}

export function generateExcelTemplateBlob(): Blob {
  const headers = [
    'Nom du produit',
    'Référence',
    'Catégorie',
    'Description',
    "Prix d'achat",
    'Prix de vente',
    'Quantité',
    "Seuil d'alerte",
    'Fournisseur',
  ];

  const sampleRows = [
    [
      'Sac Bandoulière Cuir',
      'SAC-101',
      'Maroquinerie',
      'Cuir souple noir, double compartiment',
      15000,
      25000,
      12,
      3,
      'Atelier Central',
    ],
    [
      'Montre Classique Acier',
      'MTR-204',
      'Horlogerie',
      'Bracelet acier inoxydable',
      22000,
      38000,
      8,
      2,
      'Import Direct',
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  worksheet['!cols'] = [
    {wch: 26},
    {wch: 14},
    {wch: 16},
    {wch: 34},
    {wch: 14},
    {wch: 14},
    {wch: 10},
    {wch: 14},
    {wch: 18},
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Produits ZANDO Pro');
  const out = XLSX.write(workbook, {bookType: 'xlsx', type: 'array'});
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
