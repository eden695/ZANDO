import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Layers,
  Moon,
  Pipette,
  Sun,
  Trash2,
} from 'lucide-react';
import {BlobImage} from '../components/BlobImage';
import {ModernSelect} from '../components/ModernSelect';
import {PageColorPipette} from '../components/PageColorPipette';
import {useStore} from '../context/StoreContext';
import {copyTextSafely, openWhatsAppChat} from '../services/androidShareService';
import {deleteMediaBlob, saveCompressedImageBlob} from '../services/mediaService';
import {ProductLayoutMode, StoreProfile, ThemeMode} from '../types/commerce';
import {analyzeWhatsAppPhone, getContrastTextColor} from '../utils/format';

const CURRENCIES = ['FCFA', 'XOF', 'XAF', 'CDF', 'GNF', 'MAD', 'EUR (€)', 'USD ($)'];

export const StoreIdentityModule: React.FC = () => {
  const {storeProfile, products, saveStoreProfile, notify} = useStore();
  const [form, setForm] = useState<StoreProfile>(storeProfile);
  const [saving, setSaving] = useState(false);
  const [pipetteTarget, setPipetteTarget] = useState<'primaryColor' | 'accentColor' | null>(null);
  const [selectedCategoryPreview, setSelectedCategoryPreview] = useState<string>('ALL');

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(storeProfile);
  }, [storeProfile]);

  const primaryFg = getContrastTextColor(form.primaryColor);
  const accentFg = getContrastTextColor(form.accentColor);
  const phoneCheck = useMemo(() => analyzeWhatsAppPhone(form.phone), [form.phone]);

  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const cat = p.category.trim() || 'Général';
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [products]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const saved = await saveCompressedImageBlob(
        file,
        {maxWidth: 400, maxHeight: 400, quality: 0.85, mimeType: 'image/jpeg'},
        form.logoBlobId,
      );
      const next = {...form, logoBlobId: saved.id};
      setForm(next);
      await saveStoreProfile(next);
      notify('Logo de votre boutique enregistré localement.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur lors du chargement du logo.', 'error');
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const saved = await saveCompressedImageBlob(
        file,
        {maxWidth: 1200, maxHeight: 500, quality: 0.8, mimeType: 'image/jpeg'},
        form.bannerBlobId,
      );
      const next = {...form, bannerBlobId: saved.id};
      setForm(next);
      await saveStoreProfile(next);
      notify('Bannière de boutique enregistrée.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur lors du chargement de la bannière.', 'error');
    }
  };

  const handlePipettePick = async (hex: string) => {
    if (!pipetteTarget) return;
    const target = pipetteTarget;
    setPipetteTarget(null);
    const next = {...form, [target]: hex};
    setForm(next);
    await saveStoreProfile(next);
    await copyTextSafely(hex);
    notify(`Couleur ${hex} copiée et appliquée.`, 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveStoreProfile(form);
      notify('Identité commerciale mise à jour.', 'success');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
          Personnalisez ici l’identité de votre boutique (utilisée sur votre vitrine, vos boutons d’action et vos catalogues HTML/PDF exportés). Le logo officiel <strong>ZANDO Pro</strong> reste celui de l’application principale.
        </div>

        {/* Logo & Banner */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Visuels de votre boutique
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                <BlobImage
                  blobId={form.logoBlobId}
                  alt={form.name}
                  fallbackLabel="Logo"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Logo commercial
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-semibold cursor-pointer transition-opacity hover:opacity-90"
                    style={{backgroundColor: form.primaryColor, color: primaryFg}}
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Choisir</span>
                  </button>
                  {form.logoBlobId && (
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteMediaBlob(form.logoBlobId);
                        const next = {...form, logoBlobId: undefined};
                        setForm(next);
                        await saveStoreProfile(next);
                      }}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      aria-label="Retirer le logo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Bannière de catalogue
              </div>
              <div className="h-24 w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                <BlobImage
                  blobId={form.bannerBlobId}
                  alt="Bannière boutique"
                  fallbackLabel="Aucune bannière"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-semibold cursor-pointer transition-opacity hover:opacity-90"
                  style={{backgroundColor: form.primaryColor, color: primaryFg}}
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>Importer une bannière</span>
                </button>
                {form.bannerBlobId && (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteMediaBlob(form.bannerBlobId);
                      const next = {...form, bannerBlobId: undefined};
                      setForm(next);
                      await saveStoreProfile(next);
                    }}
                    className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    Retirer
                  </button>
                )}
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBannerUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Business Information */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Informations commerciales & coordonnées
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Nom commercial *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({...form, name: e.target.value})}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Devise principale</label>
              <ModernSelect
                value={form.currency}
                onChange={(val) => setForm({...form, currency: val})}
                options={CURRENCIES.map((c) => ({value: c, label: c}))}
                ariaLabel="Devise principale"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Téléphone WhatsApp (avec indicatif pays)
              </label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm({...form, phone: e.target.value})}
                placeholder="+243 810 000 000"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
              {form.phone.trim() && (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      phoneCheck.isShort || !phoneCheck.hasCountryCodeHint
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    {phoneCheck.isShort
                      ? `Numéro incomplet (${phoneCheck.waDigits.length} chiffres)`
                      : !phoneCheck.hasCountryCodeHint
                        ? `Ajoutez l’indicatif pays (ex. +243, +225) · détecté : ${phoneCheck.waDigits}`
                        : `WhatsApp prêt : +${phoneCheck.waDigits} (${phoneCheck.waDigits.length} chiffres)`}
                  </span>
                  {phoneCheck.waDigits.length >= 8 && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await openWhatsAppChat(
                          form.phone,
                          `Test WhatsApp boutique ${form.name}`,
                        );
                        notify(res.message, res.offline ? 'error' : 'info');
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      <span>Tester</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Email de contact</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({...form, email: e.target.value})}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Adresse physique / Ville</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({...form, address: e.target.value})}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold">Description de la boutique</label>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {form.description.length} caractères
              </span>
            </div>
            <textarea
              rows={5}
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
              placeholder="Décrivez votre boutique, vos spécialités, horaires, zones de livraison et conditions..."
              className="w-full min-h-[135px] px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm leading-relaxed resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Instagram</label>
              <input
                type="text"
                value={form.instagramHandle}
                onChange={(e) => setForm({...form, instagramHandle: e.target.value})}
                placeholder="@maboutique"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Facebook</label>
              <input
                type="text"
                value={form.facebookPage}
                onChange={(e) => setForm({...form, facebookPage: e.target.value})}
                placeholder="MaBoutiqueOfficiel"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">TikTok</label>
              <input
                type="text"
                value={form.tiktokHandle}
                onChange={(e) => setForm({...form, tiktokHandle: e.target.value})}
                placeholder="@maboutique"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
          </div>
        </section>

        {/* Colors, Pipette, Theme & Live Button Preview */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Couleurs, pipette sur la page, thème et présentation
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold">Couleur principale (en-têtes & boutons)</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => {
                    const next = {...form, primaryColor: e.target.value.toUpperCase()};
                    setForm(next);
                  }}
                  className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={form.primaryColor}
                  onChange={(e) => setForm({...form, primaryColor: e.target.value})}
                  className="w-28 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setPipetteTarget('primaryColor')}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Pipette className="w-4 h-4" />
                  <span>Pipette page</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold">Couleur d’accent (boutons d’action)</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => {
                    const next = {...form, accentColor: e.target.value.toUpperCase()};
                    setForm(next);
                  }}
                  className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={form.accentColor}
                  onChange={(e) => setForm({...form, accentColor: e.target.value})}
                  className="w-28 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setPipetteTarget('accentColor')}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Pipette className="w-4 h-4" />
                  <span>Pipette page</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Thème de l’interface</label>
              <div className="flex gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {(['light', 'dark'] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      const next = {...form, themeMode: mode};
                      setForm(next);
                      saveStoreProfile(next);
                    }}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 min-h-[38px] rounded-lg text-xs font-semibold cursor-pointer ${
                      form.themeMode === mode
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {mode === 'light' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    <span>{mode === 'light' ? 'Clair' : 'Sombre'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Présentation produits</label>
              <ModernSelect
                value={form.layoutMode}
                onChange={(val) => setForm({...form, layoutMode: val as ProductLayoutMode})}
                options={[
                  {value: 'grid', label: 'Grille visuelle'},
                  {value: 'list', label: 'Liste compacte'},
                ]}
                ariaLabel="Présentation produits"
              />
            </div>
          </div>

          {/* Live Color Button Preview */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 bg-slate-50 dark:bg-slate-950/60">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Aperçu des boutons avec vos couleurs choisies :
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                className="min-h-[42px] px-4 rounded-xl text-xs font-semibold"
                style={{backgroundColor: form.primaryColor, color: primaryFg}}
              >
                Bouton principal ({form.primaryColor})
              </button>
              <button
                type="button"
                className="min-h-[42px] px-4 rounded-xl text-xs font-semibold"
                style={{backgroundColor: form.accentColor, color: accentFg}}
              >
                Bouton d’action ({form.accentColor})
              </button>
              <button
                type="button"
                className="min-h-[42px] px-4 rounded-xl border text-xs font-semibold bg-white dark:bg-slate-900"
                style={{borderColor: form.accentColor, color: form.accentColor}}
              >
                Bouton contour
              </button>
            </div>
          </div>
        </section>

        {/* Store Categories Overview with Modern Dropdown */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>Toutes les catégories de la boutique</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Consultez l’ensemble des catégories actives dans votre inventaire et vos catalogues.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <ModernSelect
                value={selectedCategoryPreview}
                onChange={setSelectedCategoryPreview}
                searchable
                searchPlaceholder="Chercher une catégorie..."
                ariaLabel="Toutes les catégories de la boutique"
                options={[
                  {
                    value: 'ALL',
                    label: 'Toutes les catégories',
                    badge: `${products.length} art.`,
                  },
                  ...categoryStats.map((cat) => ({
                    value: cat.name,
                    label: cat.name,
                    badge: `${cat.count} art.`,
                  })),
                ]}
              />
            </div>
          </div>

          {categoryStats.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aucune catégorie enregistrée pour le moment. Les catégories sont créées automatiquement lorsque vous ajoutez ou importez des produits.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {categoryStats
                .filter(
                  (c) => selectedCategoryPreview === 'ALL' || c.name === selectedCategoryPreview,
                )
                .map((c) => (
                  <div
                    key={c.name}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {c.name}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                      {c.count}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[46px] px-6 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 transition-opacity hover:opacity-95"
            style={{backgroundColor: form.accentColor, color: accentFg}}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer l’identité boutique'}
          </button>
        </div>
      </form>

      <PageColorPipette
        activeTargetLabel={
          pipetteTarget === 'primaryColor'
            ? 'Couleur principale'
            : pipetteTarget === 'accentColor'
              ? 'Couleur d’accent'
              : null
        }
        onPickColor={handlePipettePick}
        onCancel={() => setPipetteTarget(null)}
      />
    </>
  );
};
