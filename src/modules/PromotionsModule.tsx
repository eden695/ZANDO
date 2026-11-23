import React, {useMemo, useState} from 'react';
import {Edit3, Percent, Plus, Trash2} from 'lucide-react';
import {ModernSelect} from '../components/ModernSelect';
import {SheetModal} from '../components/SheetModal';
import {useStore} from '../context/StoreContext';
import {DiscountType, Promotion, PromotionScope} from '../types/commerce';
import {formatMoney, generateId, isPromotionCurrentlyActive} from '../utils/format';

export const PromotionsModule: React.FC = () => {
  const {promotions, products, storeProfile, savePromotion, removePromotion, notify} = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [scope, setScope] = useState<PromotionScope>('all');
  const [targetCategory, setTargetCategory] = useState('');
  const [targetProductIds, setTargetProductIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState(() =>
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  );
  const [isActive, setIsActive] = useState(true);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.category) s.add(p.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [products]);

  const openCreate = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setDiscountType('percent');
    setDiscountValue('10');
    setScope('all');
    setTargetCategory(categories[0] ?? '');
    setTargetProductIds([]);
    setStartsAt(new Date().toISOString().slice(0, 10));
    setEndsAt(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (promo: Promotion) => {
    setEditingId(promo.id);
    setTitle(promo.title);
    setDescription(promo.description);
    setDiscountType(promo.discountType);
    setDiscountValue(String(promo.discountValue));
    setScope(promo.scope);
    setTargetCategory(promo.targetCategory ?? '');
    setTargetProductIds(promo.targetProductIds);
    setStartsAt(promo.startsAt);
    setEndsAt(promo.endsAt);
    setIsActive(promo.isActive);
    setModalOpen(true);
  };

  const toggleProductTarget = (id: string) => {
    setTargetProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      notify('Veuillez saisir un titre de promotion.', 'error');
      return;
    }
    const val = Number(discountValue);
    if (!Number.isFinite(val) || val <= 0) {
      notify('La valeur de remise doit être supérieure à 0.', 'error');
      return;
    }

    const now = Date.now();
    const existing = editingId ? promotions.find((p) => p.id === editingId) : undefined;
    const promo: Promotion = {
      id: existing ? existing.id : generateId('prm'),
      title: title.trim(),
      description: description.trim(),
      discountType,
      discountValue: val,
      scope,
      targetCategory: scope === 'category' ? targetCategory : undefined,
      targetProductIds: scope === 'products' ? targetProductIds : [],
      startsAt,
      endsAt,
      isActive,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await savePromotion(promo);
    setModalOpen(false);
    notify(existing ? 'Promotion mise à jour.' : 'Promotion créée.', 'success');
  };

  const toggleActive = async (promo: Promotion) => {
    await savePromotion({...promo, isActive: !promo.isActive, updatedAt: Date.now()});
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Les promotions actives s’appliquent automatiquement dans vos ventes, commandes et catalogues autonomes.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle promotion</span>
        </button>
      </div>

      {promotions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
          Aucune promotion configurée.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promotions.map((promo) => {
            const activeNow = isPromotionCurrentlyActive(promo);
            const discountLabel =
              promo.discountType === 'percent'
                ? `-${promo.discountValue}%`
                : `-${formatMoney(promo.discountValue, storeProfile.currency)}`;
            const scopeLabel =
              promo.scope === 'all'
                ? 'Toute la boutique'
                : promo.scope === 'category'
                  ? `Catégorie : ${promo.targetCategory || '—'}`
                  : `${promo.targetProductIds.length} produit(s) ciblé(s)`;

            return (
              <article
                key={promo.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {activeNow ? 'Active' : promo.isActive ? 'Planifiée / Expirée' : 'Désactivée'} ·{' '}
                      {scopeLabel}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      {promo.title}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-base font-extrabold text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                    <Percent className="w-4 h-4" />
                    {discountLabel}
                  </span>
                </div>

                {promo.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-400">{promo.description}</p>
                )}

                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  Période : du {promo.startsAt || '—'} au {promo.endsAt || '—'}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => toggleActive(promo)}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold cursor-pointer ${
                      promo.isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {promo.isActive ? 'Activée' : 'En pause'}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(promo)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      aria-label="Modifier"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await removePromotion(promo.id);
                        notify('Promotion supprimée.', 'info');
                      }}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <SheetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Modifier la promotion' : 'Nouvelle promotion'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Titre de l’offre *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Promo Rentrée -15%"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Type de remise</label>
              <ModernSelect
                value={discountType}
                onChange={(val) => setDiscountType(val as DiscountType)}
                ariaLabel="Type de remise"
                options={[
                  {value: 'percent', label: 'Pourcentage (%)'},
                  {value: 'fixed', label: `Montant fixe (${storeProfile.currency})`},
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Valeur *</label>
              <input
                type="number"
                min="1"
                required
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Application</label>
            <ModernSelect
              value={scope}
              onChange={(val) => setScope(val as PromotionScope)}
              ariaLabel="Application de la promotion"
              options={[
                {value: 'all', label: 'Tous les produits'},
                {value: 'category', label: 'Une catégorie spécifique'},
                {value: 'products', label: 'Produits sélectionnés'},
              ]}
            />
          </div>

          {scope === 'category' && (
            <div>
              <label className="block text-xs font-semibold mb-1">Catégorie ciblée</label>
              <ModernSelect
                value={targetCategory}
                onChange={setTargetCategory}
                searchable
                searchPlaceholder="Rechercher une catégorie..."
                placeholder="Choisir une catégorie..."
                ariaLabel="Catégorie ciblée"
                options={categories.map((c) => ({
                  value: c,
                  label: c,
                }))}
              />
            </div>
          )}

          {scope === 'products' && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-1">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-2.5 p-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={targetProductIds.includes(p.id)}
                    onChange={() => toggleProductTarget(p.id)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Date de début</label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Date de fin</label>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 min-h-[40px] cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            <span className="text-sm">Promotion activée</span>
          </label>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </SheetModal>
    </div>
  );
};
