import React, {useState} from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Play,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import {SheetModal} from './SheetModal';
import {ZandoLogo} from './ZandoLogo';
import {useStore} from '../context/StoreContext';

interface DemoOnboardingProps {
  guideOpen: boolean;
  onCloseGuide: () => void;
  onNavigate: (route: string) => void;
}

const GUIDE_STEPS = [
  {
    title: '1. Tableau de bord & Identité',
    description:
      'Visualisez votre chiffre d’affaires sur 30 jours, les alertes de stock et les dernières ventes. Votre boutique de démonstration « Boutique Étoile » utilise des données fictives totalement isolées.',
    route: 'dashboard',
    routeLabel: 'Voir le Tableau de bord',
  },
  {
    title: '2. Produits & Importation Excel / CSV',
    description:
      'Ajoutez vos produits avec photos compressées en Blob, ou importez des dizaines d’articles hors ligne depuis un fichier .xlsx / .csv avec détection des doublons.',
    route: 'products',
    routeLabel: 'Explorer Produits & Import',
  },
  {
    title: '3. Ventes & Caisse (Comptant, Partiel, Crédit)',
    description:
      'Enregistrez des ventes au comptant ou à crédit. Le stock est déduit automatiquement et les paiements partiels alimentent le journal des crédits.',
    route: 'sales',
    routeLabel: 'Ouvrir Ventes & Caisse',
  },
  {
    title: '4. Calculateur du Bénéfice Réel',
    description:
      'Analysez votre bénéfice brut, vos dépenses d’activité et votre bénéfice net réel par produit, vente, jour, semaine et mois.',
    route: 'finances',
    routeLabel: 'Analyser les Bénéfices',
  },
  {
    title: '5. Crédits, Avances & Rappels WhatsApp',
    description:
      'Consultez l’historique immuable de chaque client endetté, enregistrez des paiements partiels ou avances, et préparez des rappels WhatsApp personnalisés.',
    route: 'credits',
    routeLabel: 'Voir Crédits Clients',
  },
  {
    title: '6. Assistant Commercial Local',
    description:
      'Posez des questions en français sur votre caisse, vos meilleurs produits ou vos dettes clients — calculs 100% locaux sans Internet.',
    route: 'assistant',
    routeLabel: 'Tester l’Assistant',
  },
  {
    title: '7. Catalogues Autonomes HTML & PDF',
    description:
      'Générez un catalogue HTML autonome avec panier WhatsApp intégré ou un PDF prêt à partager sur Android.',
    route: 'catalogs',
    routeLabel: 'Générer un Catalogue',
  },
];

export const DemoOnboardingOverlay: React.FC<DemoOnboardingProps> = ({
  guideOpen,
  onCloseGuide,
  onNavigate,
}) => {
  const {showOnboardingChoice, enterDemoMode, startRealStore} = useStore();
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const currentStep = GUIDE_STEPS[stepIdx] ?? GUIDE_STEPS[0];

  return (
    <>
      {/* Floating First-Launch Choice Window (non-masking) */}
      {showOnboardingChoice && (
        <div
          className="fixed inset-0 z-50 pointer-events-none flex items-end justify-center sm:justify-end p-3 sm:p-5"
          role="dialog"
          aria-modal="false"
          aria-label="Bienvenue sur ZANDO Pro"
        >
          <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-300 dark:border-slate-700 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.25)] space-y-4">
            <ZandoLogo />

            <div className="space-y-1.5">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white leading-tight">
                Gestion commerciale professionnelle hors ligne
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Toutes vos données restent privées sur votre appareil (IndexedDB). Choisissez comment démarrer :
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await enterDemoMode();
                  setBusy(false);
                }}
                className="w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Play className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    Découvrir ZANDO Pro (Mode Démonstration)
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Explorez une boutique fictive complète dans une base isolée : produits, ventes, bénéfices, crédits clients et assistant.
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await startRealStore();
                  onNavigate('store');
                  setBusy(false);
                }}
                className="w-full flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Store className="w-5 h-5 text-slate-700 dark:text-slate-200 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    Configurer mon entreprise
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Commencez immédiatement avec un espace réel vide et personnalisez votre boutique.
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Step-by-Step Guide Modal */}
      <SheetModal
        open={guideOpen}
        onClose={onCloseGuide}
        title="Guide interactif ZANDO Pro"
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
              <Compass className="w-4 h-4" />
              Étape {stepIdx + 1} sur {GUIDE_STEPS.length}
            </span>
            <div className="flex gap-1">
              {GUIDE_STEPS.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setStepIdx(idx)}
                  aria-label={`Étape ${idx + 1}`}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    idx === stepIdx
                      ? 'w-6 bg-emerald-600'
                      : 'w-2 bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-5 space-y-2.5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {currentStep.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {currentStep.description}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onNavigate(currentStep.route);
                  onCloseGuide();
                }}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
              >
                <span>{currentStep.routeLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>Bénéfices réels</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-amber-600" />
              <span>Crédits traçables</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-sky-600" />
              <span>100% Hors ligne</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              disabled={stepIdx === 0}
              onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-40"
            >
              Précédent
            </button>

            {stepIdx < GUIDE_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.min(GUIDE_STEPS.length - 1, i + 1))}
                className="min-h-[44px] px-5 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                Suivant
              </button>
            ) : (
              <button
                type="button"
                onClick={onCloseGuide}
                className="min-h-[44px] px-5 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
              >
                Terminer le guide
              </button>
            )}
          </div>
        </div>
      </SheetModal>
    </>
  );
};
