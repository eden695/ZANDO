import React, {useEffect, useRef, useState} from 'react';
import {ImagePlus, Moon, Pipette, Sun, Trash2} from 'lucide-react';
import {BlobImage} from '../components/BlobImage';
import {PageColorPipette} from '../components/PageColorPipette';
import {useStore} from '../context/StoreContext';
import {copyTextSafely} from '../services/androidShareService';
import {deleteMediaBlob, saveCompressedImageBlob} from '../services/mediaService';
import {ProductLayoutMode, StoreProfile, ThemeMode} from '../types/commerce';
import {getContrastTextColor} from '../utils/format';

const CURRENCIES = ['FCFA', 'XOF', 'XAF', 'CDF', 'GNF', 'MAD', 'EUR (€)', 'USD ($)'];

export const StoreIdentityModule: React.FC = () => {
  const {storeProfile, saveStoreProfile, notify} = useStore();
  const [form, setForm] = useState<StoreProfile>(storeProfile);
  const [saving, setSaving] = useState(false);
  const [pipetteTarget, setPipetteTarget] = useState<'primaryColor' | 'accentColor' | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(storeProfile);
  }, [storeProfile]);

  const primaryFg = getContrastTextColor(form.primaryColor);
  const accentFg = getContrastTextColor(form.accentColor);

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
              <select
                value={form.currency}
                onChange={(e) => setForm({...form, currency: e.target.value})}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Téléphone WhatsApp (avec indicatif pays)
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({...form, phone: e.target.value})}
                placeholder="+243 810 000 000"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
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
            <label className="block text-xs font-semibold mb-1">Description de la boutique</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
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
              <select
                value={form.layoutMode}
                onChange={(e) => setForm({...form, layoutMode: e.target.value as ProductLayoutMode})}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="grid">Grille visuelle</option>
                <option value="list">Liste compacte</option>
              </select>
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
