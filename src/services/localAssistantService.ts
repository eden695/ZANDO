import {
  AssistantMessage,
  CreditTransaction,
  Customer,
  Expense,
  Order,
  Product,
  Promotion,
  Sale,
  StoreProfile,
} from '../types/commerce';
import {
  formatMoney,
  generateId,
  isPromotionCurrentlyActive,
  normalizeTextForSearch,
} from '../utils/format';
import {computeCreditSummaries} from './creditEngine';
import {calculateFinanceSummary, getPeriodBounds} from './financeEngine';

export interface AssistantDataContext {
  storeProfile: StoreProfile;
  products: Product[];
  sales: Sale[];
  orders: Order[];
  customers: Customer[];
  promotions: Promotion[];
  expenses: Expense[];
  creditTransactions: CreditTransaction[];
}

export const ASSISTANT_SUGGESTIONS: string[] = [
  'Combien ai-je dans la caisse ?',
  'Combien ai-je vendu aujourd’hui ?',
  'Quel est mon bénéfice du mois ?',
  'Quels sont mes cinq produits les plus vendus ?',
  'Quels produits sont presque épuisés ?',
  'Quels clients me doivent de l’argent ?',
  'Quelle est la valeur de mon stock ?',
  'Combien ai-je dépensé cette semaine ?',
  'Quelles promotions sont actuellement actives ?',
  'Quels produits n’ont enregistré aucune vente récemment ?',
];

function hasAny(norm: string, keywords: string[]): boolean {
  return keywords.some((kw) => norm.includes(kw));
}

export function answerCommercialQuestion(
  question: string,
  ctx: AssistantDataContext,
): AssistantMessage {
  const norm = normalizeTextForSearch(question);
  const currency = ctx.storeProfile.currency;

  const allTimeFinance = calculateFinanceSummary({
    sales: ctx.sales,
    products: ctx.products,
    expenses: ctx.expenses,
    creditTransactions: ctx.creditTransactions,
    period: 'all',
  });

  // 1. Caisse / Trésorerie
  if (hasAny(norm, ['caisse', 'tresorerie', 'liquide', 'encaisse', 'argent disponible'])) {
    return {
      id: generateId('msg'),
      role: 'assistant',
      text: `Selon vos encaissements réels enregistrés dans IndexedDB (ventes payées, acomptes, paiements partiels et avances, déduction faite des remboursements et dépenses), le solde de caisse estimé est de ${formatMoney(allTimeFinance.netCashFlow, currency)}.`,
      metrics: [
        {label: 'Trésorerie nette', value: formatMoney(allTimeFinance.netCashFlow, currency)},
        {label: 'Total encaissé', value: formatMoney(allTimeFinance.cashCollectedSales, currency)},
        {label: 'Dépenses payées', value: formatMoney(allTimeFinance.expensesTotal, currency)},
      ],
      actionRoute: 'finances',
      actionLabel: 'Ouvrir Bénéfices & Finances',
      createdAt: Date.now(),
    };
  }

  // 2. Ventes aujourd'hui / semaine / mois
  if (hasAny(norm, ['vendu', 'vente', 'chiffre d affaires', 'ca ']) && !hasAny(norm, ['plus vendus', 'aucune vente', 'sans vente', 'invendus'])) {
    const isToday = hasAny(norm, ['aujourd hui', 'aujourdhui', 'jour', 'ce matin']);
    const isWeek = hasAny(norm, ['semaine', '7 jours']);
    const isMonth = hasAny(norm, ['mois', 'mensuel']);

    const period = isToday ? 'today' : isWeek ? 'week' : isMonth ? 'month' : 'today';
    const label = isToday ? 'aujourd’hui' : isWeek ? 'cette semaine' : isMonth ? 'ce mois-ci' : 'aujourd’hui';
    const bounds = getPeriodBounds(period);
    const matchingSales = ctx.sales.filter(
      (s) => s.createdAt >= bounds.startMs && s.createdAt <= bounds.endMs,
    );
    const fin = calculateFinanceSummary({
      sales: ctx.sales,
      products: ctx.products,
      expenses: ctx.expenses,
      creditTransactions: ctx.creditTransactions,
      period,
    });

    if (matchingSales.length === 0) {
      return {
        id: generateId('msg'),
        role: 'assistant',
        text: `Aucune vente n’a encore été enregistrée ${label}.`,
        metrics: [{label: `Ventes (${label})`, value: `0 (${formatMoney(0, currency)})`}],
        actionRoute: 'sales',
        actionLabel: 'Voir Ventes & Caisse',
        createdAt: Date.now(),
      };
    }

    return {
      id: generateId('msg'),
      role: 'assistant',
      text: `Vous avez enregistré ${matchingSales.length} vente${matchingSales.length > 1 ? 's' : ''} ${label} pour un chiffre d’affaires net de ${formatMoney(fin.netRevenue, currency)}.`,
      metrics: [
        {label: 'Chiffre d’affaires', value: formatMoney(fin.netRevenue, currency)},
        {label: 'Nombre de ventes', value: String(matchingSales.length)},
        {label: 'Bénéfice brut', value: formatMoney(fin.grossProfit, currency)},
      ],
      actionRoute: 'sales',
      actionLabel: 'Ouvrir Ventes & Caisse',
      createdAt: Date.now(),
    };
  }

  // 3. Bénéfice / Marge / Rentabilité
  if (hasAny(norm, ['benefice', 'profit', 'marge', 'rentabilite', 'gagne'])) {
    const isToday = hasAny(norm, ['aujourd hui', 'aujourdhui', 'jour']);
    const isWeek = hasAny(norm, ['semaine']);
    const period = isToday ? 'today' : isWeek ? 'week' : 'month';
    const periodLabel = isToday ? 'du jour' : isWeek ? 'de la semaine' : 'du mois en cours';

    const fin = calculateFinanceSummary({
      sales: ctx.sales,
      products: ctx.products,
      expenses: ctx.expenses,
      creditTransactions: ctx.creditTransactions,
      period,
    });

    const missingCostCount = ctx.products.filter((p) => !p.costPrice || p.costPrice <= 0).length;
    const warning =
      missingCostCount > 0
        ? ` Note : ${missingCostCount} produit(s) n’ont pas de prix d’achat renseigné, leur coût est compté à 0.`
        : '';

    return {
      id: generateId('msg'),
      role: 'assistant',
      text: `Bénéfice ${periodLabel} : ${formatMoney(fin.netProfit, currency)} net estimé (${formatMoney(fin.grossProfit, currency)} brut avant ${formatMoney(fin.expensesTotal, currency)} de dépenses).${warning}`,
      metrics: [
        {label: 'Bénéfice net', value: formatMoney(fin.netProfit, currency)},
        {label: 'Bénéfice brut', value: formatMoney(fin.grossProfit, currency)},
        {label: 'Marge nette', value: `${fin.netMarginPercent.toFixed(1)}%`},
      ],
      actionRoute: 'finances',
      actionLabel: 'Analyser les bénéfices',
      createdAt: Date.now(),
    };
  }

  // 4. Top produits les plus vendus / les plus rentables
  if (hasAny(norm, ['plus vendus', 'meilleurs produits', 'top', 'best seller', 'plus rentables'])) {
    if (allTimeFinance.productBreakdowns.length === 0) {
      return {
        id: generateId('msg'),
        role: 'assistant',
        text: 'Aucune vente enregistrée pour classer vos produits pour le moment.',
        actionRoute: 'sales',
        actionLabel: 'Ouvrir Ventes & Caisse',
        createdAt: Date.now(),
      };
    }

    const byProfit = hasAny(norm, ['rentables', 'benefice']);
    const sorted = [...allTimeFinance.productBreakdowns]
      .sort((a, b) => (byProfit ? b.grossProfit - a.grossProfit : b.quantitySold - a.quantitySold))
      .slice(0, 5);

    return {
      id: generateId('msg'),
      role: 'assistant',
      text: byProfit
        ? `Voici vos ${sorted.length} produits générant le plus de bénéfice brut :`
        : `Voici vos ${sorted.length} produits les plus vendus en volume :`,
      details: sorted.map(
        (p, i) =>
          `${i + 1}. ${p.productName} — ${p.quantitySold} vendu(s) · CA ${formatMoney(p.grossRevenue, currency)} · Bénéfice ${formatMoney(p.grossProfit, currency)}`,
      ),
      actionRoute: 'finances',
      actionLabel: 'Voir le détail par produit',
      createdAt: Date.now(),
    };
  }

  // 5. Produits presque épuisés / stock faible / rupture
  if (hasAny(norm, ['epuise', 'epuises', 'stock faible', 'rupture', 'manque', 'reapprovisionner', 'presque vide'])) {
    const low = ctx.products.filter((p) => p.stock <= p.lowStockThreshold);
    if (low.length === 0) {
      return {
        id: generateId('msg'),
        role: 'assistant',
        text: `Tous vos ${ctx.products.length} produits sont au-dessus de leur seuil d’alerte de stock.`,
        actionRoute: 'products',
        actionLabel: 'Voir Produits & Stock',
        createdAt: Date.now(),
      };
    }

    return {
      id: generateId('msg'),
      role: 'assistant',
      text: `${low.length} produit${low.length > 1 ? 's' : ''} nécessite${low.length > 1 ? 'nt' : ''} un réapprovisionnement :`,
      details: low.slice(0, 8).map(
        (p) => `${p.name} — Stock : ${p.stock} ${p.unit} (seuil d’alerte : ${p.lowStockThreshold})`,
      ),
      actionRoute: 'products',
      actionLabel: 'Gérer le stock',
      createdAt: Date.now(),
    };
  }

  // 6. Clients endettés / crédits / dettes
  if (hasAny(norm, ['doivent', 'dette', 'dettes', 'credit', 'credits', 'creance', 'impaye', 'retard'])) {
    const {summaries, kpis} = computeCreditSummaries(ctx.customers, ctx.creditTransactions);
    const debtors = summaries.filter((s) => s.netBalance > 0);
    if (debtors.length === 0) {
      return {
        id: generateId('msg'),
        role: 'assistant',
        text: 'Aucun client ne vous doit d’argent actuellement.',
        metrics: [
          {label: 'Restant à récupérer', value: formatMoney(0, currency)},
          {label: 'Total avances', value: formatMoney(kpis.totalAdvances, currency)},
        ],
        actionRoute: 'credits',
        actionLabel: 'Ouvrir Crédits Clients',
        createdAt: Date.now(),
      };
    }

    return {
      id: generateId('msg'),
      role: 'assistant',
      text: `${debtors.length} client${debtors.length > 1 ? 's' : ''} ont un solde débiteur pour un total restant à récupérer de ${formatMoney(kpis.totalRemainingToRecover, currency)}.`,
      metrics: [
        {label: 'À récupérer', value: formatMoney(kpis.totalRemainingToRecover, currency)},
        {label: 'Clients endettés', value: String(kpis.debtorCount)},
        {label: 'En retard', value: String(kpis.overdueCount)},
      ],
      details: debtors.slice(0, 6).map(
        (d) =>
          `${d.customerName} — Reste dû : ${formatMoney(d.netBalance, currency)}${d.isOverdue ? ' (EN RETARD)' : ''}`,
      ),
      actionRoute: 'credits',
      actionLabel: 'Gérer les crédits',
      createdAt: Date.now(),
    };
  }

  // 7. Valeur du stock
  if (hasAny(norm, ['valeur de mon stock', 'valeur du stock', 'valeur stock', 'inventaire'])) {
    const retailVal = ctx.products.reduce((acc, p) => acc + p.price * Math.max(0, p.stock), 0);
    const costVal = ctx.products.reduce((acc, p) => acc + p.costPrice * Math.max(0, p.stock), 0);
    const totalUnits = ctx.products.reduce((acc, p) => acc + Math.max(0, p.stock), 0);

    return {
      id: generateId('msg'),
      role: 'assistant',
      text: `Votre inventaire compte ${totalUnits} unité(s) réparties sur ${ctx.products.length} référence(s). Valeur au prix de vente : ${formatMoney(retailVal, currency)} (coût d’achat estimé : ${formatMoney(costVal, currency)}).`,
      metrics: [
        {label: 'Valeur vente', value: formatMoney(retailVal, currency)},
        {label: 'Coût d’achat', value: formatMoney(costVal, currency)},
        {label: 'Unités en stock', value: String(totalUnits)},
      ],
      actionRoute: 'products',
      actionLabel: 'Voir l’inventaire',
      createdAt: Date.now(),
    };
  }

  // 8. Dépenses
  if (hasAny(norm, ['depense', 'depenses', 'charges', 'frais'])) {
    const isToday = hasAny(norm, ['aujourd hui', 'jour']);
    const isMonth = hasAny(norm, ['mois']);
    const period = isToday ? 'today' : isMonth ? 'month' : 'week';
    const label = isToday ? 'aujourd’hui' : isMonth ? 'ce mois-ci' : 'cette semaine';
    const bounds = getPeriodBounds(period);

    const matching = ctx.expenses.filter((e) => {
      const ms = new Date(`${e.date}T12:00:00`).getTime();
      return ms >= bounds.startMs && ms <= bounds.endMs;
    });
    const total = matching.reduce((acc, e) => acc + e.amount, 0);

    return {
      id: generateId('msg'),
      role: 'assistant',
      text:
        matching.length === 0
          ? `Aucune dépense enregistrée ${label}.`
          : `Vous avez enregistré ${matching.length} dépense(s) ${label} pour un total de ${formatMoney(total, currency)}.`,
      metrics: [{label: `Dépenses (${label})`, value: formatMoney(total, currency)}],
      details: matching.slice(0, 5).map((e) => `${e.title} (${e.category}) — ${formatMoney(e.amount, currency)}`),
      actionRoute: 'finances',
      actionLabel: 'Voir les dépenses',
      createdAt: Date.now(),
    };
  }

  // 9. Promotions actives
  if (hasAny(norm, ['promo', 'promotion', 'promotions', 'reduction', 'remise'])) {
    const active = ctx.promotions.filter((p) => isPromotionCurrentlyActive(p));
    if (active.length === 0) {
      return {
        id: generateId('msg'),
        role: 'assistant',
        text: 'Aucune promotion n’est actuellement active.',
        actionRoute: 'promotions',
        actionLabel: 'Créer une promotion',
        createdAt: Date.now(),
      };
    }

    return {
      id: generateId('msg'),
      role: 'assistant',
      text: `${active.length} promotion${active.length > 1 ? 's' : ''} active${active.length > 1 ? 's' : ''} en ce moment :`,
      details: active.map(
        (p) =>
          `${p.title} (${p.discountType === 'percent' ? `-${p.discountValue}%` : `-${formatMoney(p.discountValue, currency)}`}) · jusqu’au ${p.endsAt || '—'}`,
      ),
      actionRoute: 'promotions',
      actionLabel: 'Gérer les promotions',
      createdAt: Date.now(),
    };
  }

  // 10. Produits sans vente récente
  if (hasAny(norm, ['aucune vente', 'sans vente', 'invendu', 'invendus', 'dormant', 'pas vendu'])) {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const soldRecently = new Set<string>();
    for (const s of ctx.sales) {
      if (s.createdAt >= thirtyDaysAgo) {
        for (const item of s.items) soldRecently.add(item.productId);
      }
    }
    const unsold = ctx.products.filter((p) => p.isActive && !soldRecently.has(p.id));
    if (unsold.length === 0) {
      return {
        id: generateId('msg'),
        role: 'assistant',
        text: 'Tous vos produits actifs ont enregistré au moins une vente au cours des 30 derniers jours.',
        actionRoute: 'products',
        actionLabel: 'Voir les produits',
        createdAt: Date.now(),
      };
    }

    return {
      id: generateId('msg'),
      role: 'assistant',
      text: `${unsold.length} produit(s) actif(s) n’ont enregistré aucune vente sur les 30 derniers jours :`,
      details: unsold.slice(0, 8).map(
        (p) => `${p.name} — Stock : ${p.stock} ${p.unit} · Prix : ${formatMoney(p.price, currency)}`,
      ),
      actionRoute: 'promotions',
      actionLabel: 'Lancer une promotion',
      createdAt: Date.now(),
    };
  }

  // 11. Commandes en attente
  if (hasAny(norm, ['commande', 'commandes', 'livraison', 'en attente'])) {
    const pending = ctx.orders.filter(
      (o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'delivering',
    );
    return {
      id: generateId('msg'),
      role: 'assistant',
      text:
        pending.length === 0
          ? 'Vous n’avez aucune commande en attente ou en cours de livraison.'
          : `Vous avez ${pending.length} commande(s) active(s) à traiter.`,
      details: pending.slice(0, 5).map(
        (o) => `${o.orderNumber} — ${o.customerName} · ${formatMoney(o.total, currency)}`,
      ),
      actionRoute: 'orders',
      actionLabel: 'Ouvrir Commandes',
      createdAt: Date.now(),
    };
  }

  // Fallback clair sans inventer de réponse
  const {kpis} = computeCreditSummaries(ctx.customers, ctx.creditTransactions);
  return {
    id: generateId('msg'),
    role: 'assistant',
    text: 'Je n’ai pas identifié exactement l’indicateur demandé, voici néanmoins votre résumé en temps réel calculé depuis la base locale :',
    metrics: [
      {label: 'CA Net total', value: formatMoney(allTimeFinance.netRevenue, currency)},
      {label: 'Bénéfice net', value: formatMoney(allTimeFinance.netProfit, currency)},
      {label: 'Créances clients', value: formatMoney(kpis.totalRemainingToRecover, currency)},
    ],
    details: [
      'Essayez par exemple : « Combien ai-je vendu aujourd’hui ? », « Quel est mon bénéfice du mois ? », « Quels clients me doivent de l’argent ? ».',
    ],
    createdAt: Date.now(),
  };
}
