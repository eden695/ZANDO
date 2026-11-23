import React, {useState} from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  TrendingUp,
  Users,
} from 'lucide-react';
import {SheetModal} from './SheetModal';

interface DemoOnboardingProps {
  guideOpen: boolean;
  onCloseGuide: () => void;
  onNavigate: (route: string) => void;
}

const GUIDE_STEPS = [
  {
    title: '1. Tableau de bord & Identité',
    description:
      'Visualisez votre chiffre d’affaires sur 30 jours, les alertes de stock et les dernières ventes. Personnalisez l’identité, le logo et les catégories de votre boutique.',
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
      'Enregistrez des ventes au comptant ou à crédit en plein écran. Le stock est déduit automatiquement et les paiements partiels alimentent le journal des crédits.',
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
      'Générez un catalogue HTML autonome avec panier WhatsApp, envoi SMS et appel direct, ou un PDF prêt à partager.',
    route: 'catalogs',
    routeLabel: 'Générer un Catalogue',
  },
];

export const DemoOnboardingOverlay: React.FC<DemoOnboardingProps> = ({
  guideOpen,
  onCloseGuide,
  onNavigate,
}) => {
  const [stepIdx, setStepIdx] = useState(0);

  const currentStep = GUIDE_STEPS[stepIdx] ?? GUIDE_STEPS[0];

  return (
    <>
      {/* Interactive Step-by-Step Guide Modal (opened from Settings) */}
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
