import React, {useMemo, useState} from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {SheetModal} from '../components/SheetModal';
import {useStore} from '../context/StoreContext';
import {calculateFinanceSummary, ProfitPeriod} from '../services/financeEngine';
import {Expense, ExpenseCategory, PaymentMethod} from '../types/commerce';
import {formatDateTime, formatMoney, generateId} from '../utils/format';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Approvisionnement',
  'Transport & Livraison',
  'Loyer & Électricité',
  'Publicité',
  'Emballage',
  'Salaires',
  'Frais divers',
];

export const FinancesModule: React.FC = () => {
  const {
    sales,
    products,
    expenses,
    creditTransactions,
    storeProfile,
    saveExpense,
    removeExpense,
    notify,
  } = useStore();

  const [period, setPeriod] = useState<ProfitPeriod>('month');
  const [customStart, setCustomStart] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'sales' | 'expenses'>(
    'overview',
  );

  // Expense form modal
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Transport & Livraison');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expMethod, setExpMethod] = useState<PaymentMethod>('Espèces');
  const [expNotes, setExpNotes] = useState('');

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.category) s.add(p.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [products]);

  const summary = useMemo(
    () =>
      calculateFinanceSummary({
        sales,
        products,
        expenses,
        creditTransactions,
        period,
        customStart,
        customEnd,
        categoryFilter,
        productFilter,
      }),
    [
      sales,
      products,
      expenses,
      creditTransactions,
      period,
      customStart,
      customEnd,
      categoryFilter,
      productFilter,
    ],
  );

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(expAmount);
    if (!expTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      notify('Indiquez un intitulé et un montant valide supérieur à 0.', 'error');
      return;
    }

    const expense: Expense = {
      id: generateId('exp'),
      title: expTitle.trim(),
      category: expCategory,
      amount,
      date: expDate,
      paymentMethod: expMethod,
      notes: expNotes.trim(),
      createdAt: Date.now(),
    };
    await saveExpense(expense);
    setExpModalOpen(false);
    setExpTitle('');
    setExpAmount('');
    setExpNotes('');
    notify('Dépense enregistrée et intégrée au calcul du bénéfice net.', 'success');
  };

  const maxChartVal = useMemo(() => {
    let max = 1;
    for (const pt of summary.series) {
      max = Math.max(max, pt.revenue, Math.abs(pt.netProfit));
    }
    return max;
  }, [summary.series]);

  return (
    <div className="space-y-5">
      {/* Top Toolbar: Period & Filters + Add Expense */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['today', 'Aujourd’hui'],
              ['week', '7 jours'],
              ['month', 'Ce mois'],
              ['all', 'Tout'],
              ['custom', 'Personnalisé'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                period === key
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setExpModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          style={{
            backgroundColor: 'var(--brand-accent, #059669)',
            color: 'var(--brand-accent-fg, #FFFFFF)',
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Enregistrer une dépense</span>
        </button>
      </div>

      {period === 'custom' && (
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold">Du</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold">Au</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
            />
          </div>
        </div>
      )}

      {/* Category & Product Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setProductFilter('ALL');
          }}
          aria-label="Filtrer par catégorie"
          className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm"
        >
          <option value="ALL">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              Catégorie : {c}
            </option>
          ))}
        </select>

        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          aria-label="Filtrer par produit"
          className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm"
        >
          <option value="ALL">Tous les produits</option>
          {products
            .filter((p) => categoryFilter === 'ALL' || p.category === categoryFilter)
            .map((p) => (
              <option key={p.id} value={p.id}>
                Produit : {p.name}
              </option>
            ))}
        </select>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Chiffre d’affaires net</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            {formatMoney(summary.netRevenue, storeProfile.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            COGS : {formatMoney(summary.cogsTotal, storeProfile.currency)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Bénéfice brut</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-400">
            {formatMoney(summary.grossProfit, storeProfile.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Marge brute : {summary.grossMarginPercent.toFixed(1)}%
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Bénéfice net estimé</div>
          <div
            className={`mt-1.5 text-lg sm:text-xl font-bold ${
              summary.netProfit >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatMoney(summary.netProfit, storeProfile.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Dépenses : {formatMoney(summary.expensesTotal, storeProfile.currency)} · Marge{' '}
            {summary.netMarginPercent.toFixed(1)}%
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Encaissement / Caisse</span>
            <Wallet className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            {formatMoney(summary.netCashFlow, storeProfile.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Encaissé : {formatMoney(summary.cashCollectedSales, storeProfile.currency)}
          </div>
        </div>
      </div>

      {/* Daily / Weekly / Monthly Net Profit Strip */}
      <div className="grid grid-cols-3 gap-3 tabular-nums">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3">
          <div className="text-[11px] text-slate-500">Bénéfice du jour</div>
          <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            {formatMoney(summary.dailyProfit, storeProfile.currency)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3">
          <div className="text-[11px] text-slate-500">Bénéfice (7 jours)</div>
          <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            {formatMoney(summary.weeklyProfit, storeProfile.currency)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3">
          <div className="text-[11px] text-slate-500">Bénéfice du mois</div>
          <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            {formatMoney(summary.monthlyProfit, storeProfile.currency)}
          </div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            ['overview', 'Vue d’ensemble & évolution'],
            ['products', `Par produit (${summary.productBreakdowns.length})`],
            ['sales', `Par vente (${summary.saleBreakdowns.length})`],
            ['expenses', `Dépenses (${expenses.length})`],
          ] as const
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setActiveTab(tabKey)}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
              activeTab === tabKey
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview & Chart */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
              Évolution du chiffre d’affaires et du bénéfice net
            </h3>
            {summary.series.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Aucune opération enregistrée sur la période sélectionnée.
              </p>
            ) : (
              <div className="space-y-3">
                {summary.series.slice(-12).map((pt) => {
                  const revPct = Math.round((pt.revenue / maxChartVal) * 100);
                  const profPct = Math.round((Math.max(0, pt.netProfit) / maxChartVal) * 100);
                  return (
                    <div key={pt.key} className="space-y-1 text-xs tabular-nums">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {pt.label}
                        </span>
                        <span className="text-slate-600 dark:text-slate-400">
                          CA {formatMoney(pt.revenue, storeProfile.currency)} · Net{' '}
                          <strong
                            className={
                              pt.netProfit >= 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }
                          >
                            {formatMoney(pt.netProfit, storeProfile.currency)}
                          </strong>
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex gap-0.5">
                        <div
                          className="h-full bg-slate-400 dark:bg-slate-600 rounded-l-full"
                          style={{width: `${revPct}%`}}
                        />
                        <div
                          className="h-full bg-emerald-500 rounded-r-full"
                          style={{width: `${profPct}%`}}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-3">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <span>Produits les plus rentables</span>
              </h3>
              {summary.mostProfitableProducts.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune vente sur cette période.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  {summary.mostProfitableProducts.map((p) => (
                    <div key={p.productId} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{p.productName}</div>
                        <div className="text-[11px] text-slate-500">
                          {p.quantitySold} vendu(s) · Marge {p.marginPercent.toFixed(1)}%
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                        {formatMoney(p.grossProfit, storeProfile.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-3">
                <ArrowDownRight className="w-4 h-4 text-amber-600" />
                <span>Produits à faible rentabilité</span>
              </h3>
              {summary.lowProfitProducts.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune vente sur cette période.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  {summary.lowProfitProducts.map((p) => (
                    <div key={p.productId} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{p.productName}</div>
                        <div className="text-[11px] text-slate-500">
                          {p.quantitySold} vendu(s) · Marge {p.marginPercent.toFixed(1)}%
                        </div>
                      </div>
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 shrink-0">
                        {formatMoney(p.grossProfit, storeProfile.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Tab 2: Profit by Product */}
      {activeTab === 'products' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">Produit</th>
                <th className="px-4 py-3 font-semibold text-right">Qté</th>
                <th className="px-4 py-3 font-semibold text-right">CA</th>
                <th className="px-4 py-3 font-semibold text-right">Coût + Frais</th>
                <th className="px-4 py-3 font-semibold text-right">Bénéfice</th>
                <th className="px-4 py-3 font-semibold text-right">Marge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {summary.productBreakdowns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Aucune vente produit sur cette période.
                  </td>
                </tr>
              ) : (
                summary.productBreakdowns.map((p) => (
                  <tr key={p.productId}>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {p.productName}
                      <div className="text-[11px] font-normal text-slate-500">{p.category}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{p.quantitySold}</td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(p.grossRevenue, storeProfile.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(p.cogs + p.extraFees, storeProfile.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                      {formatMoney(p.grossProfit, storeProfile.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">{p.marginPercent.toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Profit by Sale */}
      {activeTab === 'sales' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">Reçu</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold text-right">CA net</th>
                <th className="px-4 py-3 font-semibold text-right">Encaissé</th>
                <th className="px-4 py-3 font-semibold text-right">Bénéfice brut</th>
                <th className="px-4 py-3 font-semibold text-right">Marge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {summary.saleBreakdowns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Aucune vente sur cette période.
                  </td>
                </tr>
              ) : (
                summary.saleBreakdowns.map((s) => (
                  <tr key={s.saleId}>
                    <td className="px-4 py-3 font-mono font-semibold">
                      {s.receiptNumber}
                      <div className="font-sans text-[11px] font-normal text-slate-500">
                        {formatDateTime(s.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.customerName}
                      {s.remainingDebt > 0 && (
                        <div className="text-[11px] text-amber-600 font-semibold">
                          Reste dû : {formatMoney(s.remainingDebt, storeProfile.currency)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(s.revenueNet, storeProfile.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(s.amountPaid, storeProfile.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                      {formatMoney(s.grossProfit, storeProfile.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">{s.marginPercent.toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Expenses */}
      {activeTab === 'expenses' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {expenses.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Aucune dépense enregistrée.
            </div>
          ) : (
            expenses.map((exp) => (
              <div key={exp.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">
                    {exp.date} · {exp.category} · {exp.paymentMethod}
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {exp.title}
                  </div>
                  {exp.notes && <div className="text-xs text-slate-500">{exp.notes}</div>}
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                  <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                    -{formatMoney(exp.amount, storeProfile.currency)}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await removeExpense(exp.id);
                      notify('Dépense supprimée.', 'info');
                    }}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    aria-label="Supprimer cette dépense"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* New Expense Modal */}
      <SheetModal
        open={expModalOpen}
        onClose={() => setExpModalOpen(false)}
        title="Enregistrer une dépense"
      >
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Intitulé de la dépense *</label>
            <input
              type="text"
              required
              value={expTitle}
              onChange={(e) => setExpTitle(e.target.value)}
              placeholder="Ex : Transport livraison, Emballages, Loyer..."
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Catégorie</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                Montant ({storeProfile.currency}) *
              </label>
              <input
                type="number"
                min="1"
                step="any"
                required
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Date</label>
              <input
                type="date"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Paiement</label>
              <select
                value={expMethod}
                onChange={(e) => setExpMethod(e.target.value as PaymentMethod)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="Espèces">Espèces</option>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Virement">Virement</option>
                <option value="Carte">Carte</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <input
              type="text"
              value={expNotes}
              onChange={(e) => setExpNotes(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setExpModalOpen(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl text-sm font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--brand-accent, #059669)',
                color: 'var(--brand-accent-fg, #FFFFFF)',
              }}
            >
              Enregistrer
            </button>
          </div>
        </form>
      </SheetModal>
    </div>
  );
};
