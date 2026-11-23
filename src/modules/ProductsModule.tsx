import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Camera,
  Edit3,
  FileSpreadsheet,
  ImagePlus,
  Minus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {BlobImage} from '../components/BlobImage';
import {ExcelImportModal} from '../components/ExcelImportModal';
import {ModernSelect} from '../components/ModernSelect';
import {SheetModal} from '../components/SheetModal';
import {useStore} from '../context/StoreContext';
import {saveCompressedImageBlob} from '../services/mediaService';
import {Product} from '../types/commerce';
import {formatBytes, formatMoney, generateId, getEffectiveProductPrice} from '../utils/format';

interface ProductsModuleProps {
  openCreateTrigger?: number;
  onConsumeCreateTrigger?: () => void;
}

const EMPTY_FORM = {
  id: '',
  sku: '',
  name: '',
  description: '',
  category: '',
  supplier: '',
  price: '',
  costPrice: '',
  extraFees: '0',
  stock: '1',
  lowStockThreshold: '3',
  unit: 'pièce',
  imageBlobId: undefined as string | undefined,
  isActive: true,
};

export const ProductsModule: React.FC<ProductsModuleProps> = ({
  openCreateTrigger = 0,
  onConsumeCreateTrigger,
}) => {
  const {products, promotions, storeProfile, saveProduct, removeProduct, notify} = useStore();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [imageStats, setImageStats] = useState<string | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const openCreateModal = () => {
    setForm({
      ...EMPTY_FORM,
      sku: `PRD-${Math.floor(100 + Math.random() * 900)}`,
    });
    setImageStats(null);
    setModalOpen(true);
  };

  useEffect(() => {
    if (openCreateTrigger > 0) {
      openCreateModal();
      onConsumeCreateTrigger?.();
    }
  }, [openCreateTrigger, onConsumeCreateTrigger]);

  const openEditModal = (product: Product) => {
    setForm({
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      category: product.category,
      supplier: product.supplier ?? '',
      price: String(product.price),
      costPrice: String(product.costPrice),
      extraFees: String(product.extraFees ?? 0),
      stock: String(product.stock),
      lowStockThreshold: String(product.lowStockThreshold),
      unit: product.unit,
      imageBlobId: product.imageBlobId,
      isActive: product.isActive,
    });
    setImageStats(null);
    setModalOpen(true);
  };

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const cat = p.category.trim();
      if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [products]);

  const categories = useMemo(
    () => categoryCounts.map((c) => c.name),
    [categoryCounts],
  );

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((p) => {
      if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false;
      if (stockFilter === 'low' && !(p.stock > 0 && p.stock <= p.lowStockThreshold)) return false;
      if (stockFilter === 'out' && p.stock > 0) return false;
      if (!q) return true;
      return `${p.name} ${p.sku} ${p.category} ${p.supplier ?? ''} ${p.description}`
        .toLowerCase()
        .includes(q);
    });
  }, [products, search, selectedCategory, stockFilter]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const saved = await saveCompressedImageBlob(
        file,
        {maxWidth: 900, maxHeight: 900, quality: 0.78, mimeType: 'image/jpeg'},
        form.imageBlobId,
      );
      setForm((prev) => ({...prev, imageBlobId: saved.id}));
      setImageStats(
        `Image compressée : ${formatBytes(saved.originalSize)} → ${formatBytes(saved.compressedSize)} (${saved.width}×${saved.height}px)`,
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur de compression image.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      notify('Veuillez saisir le nom du produit.', 'error');
      return;
    }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      notify('Le prix de vente doit être un nombre valide.', 'error');
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      const existing = form.id ? products.find((p) => p.id === form.id) : undefined;
      const product: Product = {
        id: existing ? existing.id : generateId('prd'),
        sku: form.sku.trim() || `PRD-${Math.floor(100 + Math.random() * 900)}`,
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim() || 'Général',
        supplier: form.supplier.trim(),
        price,
        costPrice: Math.max(0, Number(form.costPrice) || 0),
        extraFees: Math.max(0, Number(form.extraFees) || 0),
        stock: Math.max(0, Math.round(Number(form.stock) || 0)),
        lowStockThreshold: Math.max(0, Math.round(Number(form.lowStockThreshold) || 0)),
        unit: form.unit.trim() || 'pièce',
        imageBlobId: form.imageBlobId,
        isActive: form.isActive,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };
      await saveProduct(product);
      setModalOpen(false);
      notify(existing ? 'Produit mis à jour.' : 'Produit ajouté à la boutique.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible d’enregistrer le produit.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStock = async (product: Product, delta: number) => {
    const nextStock = Math.max(0, product.stock + delta);
    if (nextStock === product.stock) return;
    await saveProduct({
      ...product,
      stock: nextStock,
      updatedAt: Date.now(),
    });
  };

  const confirmDelete = async () => {
    if (!deletingProduct) return;
    await removeProduct(deletingProduct);
    setDeletingProduct(null);
    notify('Produit supprimé.', 'info');
  };

  const liveMargin = useMemo(() => {
    const p = Number(form.price) || 0;
    const c = (Number(form.costPrice) || 0) + (Number(form.extraFees) || 0);
    if (p <= 0 || c <= 0) return null;
    const profit = p - c;
    const pct = Math.round((profit / p) * 100);
    return {profit, pct};
  }, [form.price, form.costPrice, form.extraFees]);

  return (
    <div className="space-y-5">
      {/* Search + Excel Import + Primary CTA */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, SKU, catégorie ou fournisseur..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-semibold whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Importer Excel / CSV</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              backgroundColor: 'var(--brand-accent, #059669)',
              color: 'var(--brand-accent-fg, #FFFFFF)',
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau produit</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="w-full sm:w-72">
          <ModernSelect
            value={selectedCategory}
            onChange={setSelectedCategory}
            searchable
            searchPlaceholder="Rechercher une catégorie..."
            ariaLabel="Filtrer par catégorie de la boutique"
            options={[
              {
                value: 'ALL',
                label: 'Toutes les catégories de la boutique',
                badge: `${products.length}`,
              },
              ...categoryCounts.map((c) => ({
                value: c.name,
                label: c.name,
                badge: `${c.count}`,
              })),
            ]}
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start">
          {(
            [
              ['all', 'Tous'],
              ['low', 'Stock faible'],
              ['out', 'Rupture'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStockFilter(val)}
              className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                stockFilter === val
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid / Empty State */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {products.length === 0
              ? 'Votre catalogue produits est vide.'
              : 'Aucun produit ne correspond aux filtres sélectionnés.'}
          </p>
          {products.length === 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--brand-accent, #059669)',
                  color: 'var(--brand-accent-fg, #FFFFFF)',
                }}
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter un premier produit</span>
              </button>
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Importer Excel / CSV</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const pricing = getEffectiveProductPrice(product, promotions);
            const isOut = product.stock <= 0;
            const isLow = !isOut && product.stock <= product.lowStockThreshold;

            return (
              <article
                key={product.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <BlobImage
                    blobId={product.imageBlobId}
                    alt={product.name}
                    fallbackLabel={product.category}
                  />
                </div>
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {product.category} · Réf. {product.sku}
                    {product.supplier && ` · ${product.supplier}`}
                    {!product.isActive && ' · Masqué'}
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {product.name}
                  </h3>

                  {product.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                      {product.description}
                    </p>
                  )}

                  <div className="mt-auto pt-2 flex items-baseline justify-between gap-2 tabular-nums">
                    <div>
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {formatMoney(pricing.finalPrice, storeProfile.currency)}
                      </span>
                      {pricing.finalPrice < pricing.originalPrice && (
                        <span className="ml-2 text-xs text-slate-400 line-through">
                          {formatMoney(pricing.originalPrice, storeProfile.currency)}
                        </span>
                      )}
                    </div>
                    {pricing.promoLabel && (
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                        {pricing.promoLabel}
                      </span>
                    )}
                  </div>

                  {/* Stock & Quick Controls */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickStock(product, -1)}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        aria-label="Diminuer le stock"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className={`px-2 text-xs font-bold tabular-nums ${
                          isOut
                            ? 'text-rose-600 dark:text-rose-400'
                            : isLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {product.stock} {product.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuickStock(product, 1)}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        aria-label="Augmenter le stock"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(product)}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        aria-label="Modifier le produit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingProduct(product)}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        aria-label="Supprimer le produit"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <SheetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Modifier le produit' : 'Nouveau produit'}
      >
        <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
              <BlobImage
                blobId={form.imageBlobId}
                alt={form.name || 'Aperçu produit'}
                fallbackLabel="Photo"
              />
            </div>
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>Galerie / Fichier</span>
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Appareil photo</span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImagePick}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImagePick}
                className="hidden"
              />
              {imageStats ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">{imageStats}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Compression automatique en local avant enregistrement Blob.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nom du produit *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({...form, name: e.target.value})}
                placeholder="Ex : Sac bandoulière cuir"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Catégorie
              </label>
              <div className="space-y-1.5">
                {categories.length > 0 && (
                  <ModernSelect
                    compact
                    value={categories.includes(form.category) ? form.category : '__CUSTOM__'}
                    onChange={(val) => {
                      if (val === '__CUSTOM__') {
                        setForm((prev) => ({
                          ...prev,
                          category: categories.includes(prev.category) ? '' : prev.category,
                        }));
                      } else {
                        setForm((prev) => ({...prev, category: val}));
                      }
                    }}
                    searchable
                    searchPlaceholder="Choisir une catégorie existante..."
                    ariaLabel="Choisir une catégorie existante"
                    options={[
                      ...categoryCounts.map((c) => ({
                        value: c.name,
                        label: c.name,
                        badge: `${c.count}`,
                      })),
                      {
                        value: '__CUSTOM__',
                        label: '+ Saisir / créer une nouvelle catégorie...',
                      },
                    ]}
                  />
                )}
                {(categories.length === 0 || !categories.includes(form.category)) && (
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({...form, category: e.target.value})}
                    placeholder="Ex : Maroquinerie, Électronique..."
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Référence SKU
              </label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({...form, sku: e.target.value})}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Fournisseur
              </label>
              <input
                type="text"
                value={form.supplier}
                onChange={(e) => setForm({...form, supplier: e.target.value})}
                placeholder="Nom du fournisseur"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
              placeholder="Détails, matières, tailles disponibles..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Prix vente ({storeProfile.currency}) *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={form.price}
                onChange={(e) => setForm({...form, price: e.target.value})}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Prix d’achat
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.costPrice}
                onChange={(e) => setForm({...form, costPrice: e.target.value})}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Frais / unité
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.extraFees}
                onChange={(e) => setForm({...form, extraFees: e.target.value})}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
          </div>

          {liveMargin && (
            <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              Marge nette unitaire estimée :{' '}
              <strong className="text-emerald-700 dark:text-emerald-400">
                {formatMoney(liveMargin.profit, storeProfile.currency)} ({liveMargin.pct}%)
              </strong>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Stock actuel
              </label>
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm({...form, stock: e.target.value})}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Seuil alerte
              </label>
              <input
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(e) => setForm({...form, lowStockThreshold: e.target.value})}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Unité
              </label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm({...form, unit: e.target.value})}
                placeholder="pièce"
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({...form, isActive: e.target.checked})}
              className="w-5 h-5 rounded accent-emerald-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">
              Produit actif et visible dans les catalogues générés
            </span>
          </label>
        </form>

        <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="product-form"
            disabled={saving}
            className="min-h-[44px] px-5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: 'var(--brand-accent, #059669)',
              color: 'var(--brand-accent-fg, #FFFFFF)',
            }}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </SheetModal>

      {/* Excel / CSV Import Modal */}
      <ExcelImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />

      {/* Delete confirmation */}
      <SheetModal
        open={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        title="Supprimer ce produit ?"
        maxWidthClass="max-w-md"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Voulez-vous supprimer <strong>{deletingProduct?.name}</strong> ? Cette action retire le produit et son image locale de votre inventaire (les anciens catalogues déjà enregistrés restent intacts).
        </p>
        <div className="mt-5 flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => setDeletingProduct(null)}
            className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer"
          >
            Supprimer
          </button>
        </div>
      </SheetModal>
    </div>
  );
};
