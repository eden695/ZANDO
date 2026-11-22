/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {useCallback, useState} from 'react';
import {
  BookOpen,
  ClipboardList,
  Compass,
  CreditCard,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Package,
  Percent,
  Plus,
  RotateCcw,
  Share2,
  ShoppingCart,
  Store,
  Sun,
  TrendingUp,
  Users,
  WifiOff,
} from 'lucide-react';
import {DemoOnboardingOverlay} from './components/DemoOnboardingOverlay';
import {PWAInstallButton} from './components/PWAInstallButton';
import {SheetModal} from './components/SheetModal';
import {ToastBanner} from './components/ToastBanner';
import {ZandoLogo} from './components/ZandoLogo';
import {StoreProvider, useStore} from './context/StoreContext';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import {AssistantModule} from './modules/AssistantModule';
import {BackupSystemModule} from './modules/BackupSystemModule';
import {CatalogsModule} from './modules/CatalogsModule';
import {CreditsModule} from './modules/CreditsModule';
import {CustomersModule} from './modules/CustomersModule';
import {DashboardModule, ModuleRoute} from './modules/DashboardModule';
import {FinancesModule} from './modules/FinancesModule';
import {OrdersModule} from './modules/OrdersModule';
import {ProductsModule} from './modules/ProductsModule';
import {PromotionsModule} from './modules/PromotionsModule';
import {SalesModule} from './modules/SalesModule';
import {SocialShareModule} from './modules/SocialShareModule';
import {StoreIdentityModule} from './modules/StoreIdentityModule';

const NAV_ITEMS: Array<{
  id: ModuleRoute;
  label: string;
  icon: React.ComponentType<{className?: string}>;
}> = [
  {id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard},
  {id: 'products', label: 'Produits & Stock', icon: Package},
  {id: 'sales', label: 'Ventes & Caisse', icon: ShoppingCart},
  {id: 'finances', label: 'Bénéfices & Dépenses', icon: TrendingUp},
  {id: 'credits', label: 'Crédits Clients', icon: CreditCard},
  {id: 'assistant', label: 'Assistant Local', icon: MessageSquareText},
  {id: 'orders', label: 'Commandes', icon: ClipboardList},
  {id: 'customers', label: 'Clients', icon: Users},
  {id: 'promotions', label: 'Promotions', icon: Percent},
  {id: 'catalogs', label: 'Catalogues HTML / PDF', icon: BookOpen},
  {id: 'social', label: 'Publication Sociale', icon: Share2},
  {id: 'store', label: 'Identité Boutique', icon: Store},
  {id: 'backup', label: 'Sauvegarde & Hors-ligne', icon: Database},
];

const ZandoShell: React.FC = () => {
  const {
    loading,
    error,
    appMode,
    storeProfile,
    saveStoreProfile,
    reloadAll,
    enterDemoMode,
    resetDemoMode,
    startRealStore,
  } = useStore();
  const isOnline = useOnlineStatus();

  const [route, setRoute] = useState<ModuleRoute>('dashboard');
  const [moreOpen, setMoreOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [leaveDemoConfirmOpen, setLeaveDemoConfirmOpen] = useState(false);
  const [quickSaleTrigger, setQuickSaleTrigger] = useState(0);
  const [quickProductTrigger, setQuickProductTrigger] = useState(0);

  const activeNav = NAV_ITEMS.find((n) => n.id === route) ?? NAV_ITEMS[0];

  const handleNavigate = useCallback((next: ModuleRoute | string) => {
    setRoute(next as ModuleRoute);
    setMoreOpen(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, []);

  const triggerQuickSale = useCallback(() => {
    setRoute('sales');
    setMoreOpen(false);
    setQuickSaleTrigger((n) => n + 1);
  }, []);

  const triggerQuickProduct = useCallback(() => {
    setRoute('products');
    setMoreOpen(false);
    setQuickProductTrigger((n) => n + 1);
  }, []);

  const consumeQuickSaleTrigger = useCallback(() => setQuickSaleTrigger(0), []);
  const consumeQuickProductTrigger = useCallback(() => setQuickProductTrigger(0), []);

  const toggleTheme = () => {
    const nextTheme = storeProfile.themeMode === 'dark' ? 'light' : 'dark';
    saveStoreProfile({...storeProfile, themeMode: nextTheme});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 gap-4">
        <ZandoLogo />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ouverture de votre espace local IndexedDB...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center gap-4">
        <ZandoLogo />
        <div className="max-w-md rounded-2xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 p-6 space-y-3">
          <h1 className="text-base font-bold text-slate-900 dark:text-white">
            Base locale inaccessible
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
          <button
            type="button"
            onClick={reloadAll}
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const isMoreRouteActive = [
    'credits',
    'assistant',
    'orders',
    'customers',
    'promotions',
    'catalogs',
    'social',
    'store',
    'backup',
  ].includes(route);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30">
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
          <ZandoLogo />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 min-h-[42px] px-3.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          <PWAInstallButton />
          {appMode !== 'demo' && (
            <button
              type="button"
              onClick={enterDemoMode}
              className="w-full flex items-center justify-between min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <span>Essayer la démo isolée</span>
              <Compass className="w-4 h-4 text-emerald-600" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <span>{storeProfile.themeMode === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
            {storeProfile.themeMode === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Sticky Top App Bar */}
        <header className="sticky top-0 z-20 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="lg:hidden">
              <ZandoLogo compact />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {activeNav.label}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-semibold whitespace-nowrap">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Hors ligne</span>
              </span>
            )}
            <div className="lg:hidden">
              <PWAInstallButton compact />
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Changer de thème"
            >
              {storeProfile.themeMode === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={triggerQuickSale}
              className="hidden sm:inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer"
              style={{
                backgroundColor: 'var(--brand-accent, #059669)',
                color: 'var(--brand-accent-fg, #FFFFFF)',
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Vente rapide</span>
            </button>
          </div>
        </header>

        {/* Demo Mode Isolation Banner (scrollable, never consuming sticky budget) */}
        {appMode === 'demo' && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/70 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              Mode Démonstration actif — Données fictives isolées de votre entreprise réelle.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 font-semibold text-amber-900 dark:text-amber-200 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Guide</span>
              </button>
              <button
                type="button"
                onClick={resetDemoMode}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 font-semibold text-amber-900 dark:text-amber-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Réinitialiser la démonstration</span>
              </button>
              <button
                type="button"
                onClick={() => setLeaveDemoConfirmOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Créer mon entreprise</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Module Viewport */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-24 lg:pb-8">
          {route === 'dashboard' && (
            <DashboardModule
              onNavigate={handleNavigate}
              onQuickSale={triggerQuickSale}
              onQuickProduct={triggerQuickProduct}
              onOpenGuide={() => setGuideOpen(true)}
            />
          )}
          {route === 'products' && (
            <ProductsModule
              openCreateTrigger={quickProductTrigger}
              onConsumeCreateTrigger={consumeQuickProductTrigger}
            />
          )}
          {route === 'sales' && (
            <SalesModule
              openCreateTrigger={quickSaleTrigger}
              onConsumeCreateTrigger={consumeQuickSaleTrigger}
            />
          )}
          {route === 'finances' && <FinancesModule />}
          {route === 'credits' && <CreditsModule />}
          {route === 'assistant' && <AssistantModule onNavigate={handleNavigate} />}
          {route === 'orders' && <OrdersModule />}
          {route === 'customers' && <CustomersModule />}
          {route === 'promotions' && <PromotionsModule />}
          {route === 'catalogs' && <CatalogsModule />}
          {route === 'social' && <SocialShareModule />}
          {route === 'store' && <StoreIdentityModule />}
          {route === 'backup' && <BackupSystemModule />}
        </main>
      </div>

      {/* Mobile Fixed Bottom Thumb-Zone Navigation */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 h-16 pb-safe"
        aria-label="Navigation mobile"
      >
        {(
          [
            {id: 'dashboard', label: 'Accueil', icon: LayoutDashboard},
            {id: 'products', label: 'Produits', icon: Package},
            {id: 'sales', label: 'Ventes', icon: ShoppingCart},
            {id: 'finances', label: 'Bénéfices', icon: TrendingUp},
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = route === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNavigate(tab.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] text-[11px] font-semibold transition-colors cursor-pointer ${
                active
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="truncate max-w-full px-1">{tab.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center justify-center min-h-[44px] text-[11px] font-semibold transition-colors cursor-pointer ${
            isMoreRouteActive
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>Plus</span>
        </button>
      </nav>

      {/* Mobile "Plus" Module Hub Sheet */}
      <SheetModal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Modules ZANDO Pro"
      >
        <div className="grid grid-cols-2 gap-2.5">
          {NAV_ITEMS.filter((i) =>
            [
              'credits',
              'assistant',
              'catalogs',
              'orders',
              'customers',
              'promotions',
              'social',
              'store',
              'backup',
            ].includes(i.id),
          ).map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`flex items-center gap-3 min-h-[54px] px-3.5 py-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold leading-snug">{item.label}</span>
              </button>
            );
          })}
        </div>
      </SheetModal>

      {/* Leave Demo Confirmation Modal */}
      <SheetModal
        open={leaveDemoConfirmOpen}
        onClose={() => setLeaveDemoConfirmOpen(false)}
        title="Quitter le mode démonstration ?"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Vous allez passer vers votre base de données personnelle (<strong>zando_pro_local_db</strong>). Aucune donnée fictive de la démonstration ne sera importée dans votre entreprise réelle.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setLeaveDemoConfirmOpen(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
            >
              Rester en démo
            </button>
            <button
              type="button"
              onClick={async () => {
                setLeaveDemoConfirmOpen(false);
                await startRealStore();
                handleNavigate('store');
              }}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold cursor-pointer"
            >
              Configurer mon entreprise
            </button>
          </div>
        </div>
      </SheetModal>

      <DemoOnboardingOverlay
        guideOpen={guideOpen}
        onCloseGuide={() => setGuideOpen(false)}
        onNavigate={handleNavigate}
      />

      <ToastBanner />
    </div>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <ZandoShell />
    </StoreProvider>
  );
}
