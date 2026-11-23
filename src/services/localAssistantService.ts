import {
  AssistantMessage,
  CreditTransaction,
  Customer,
  Expense,
  Order,
  Product,
  Promotion,
  Sale,
  SavedCatalog,
  StoreProfile,
} from '../types/commerce';
import {
  formatMoney,
  generateId,
  getEffectiveProductPrice,
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
  catalogs?: SavedCatalog[];
}

export interface SuggestionGroup {
  id: 'all' | 'finances' | 'stock' | 'clients' | 'strategy';
  label: string;
  items: string[];
}

export const ASSISTANT_SUGGESTION_GROUPS: SuggestionGroup[] = [
  {
    id: 'finances',
    label: 'Finances & Caisse',
    items: [
      'Fais-moi un bilan complet de ma boutique',
      'Combien ai-je dans la caisse ?',
      'Combien ai-je vendu aujourd’hui ?',
      'Quel est mon bénéfice du mois ?',
      'Compare cette semaine à la semaine dernière',
      'Où partent mes dépenses par catégorie ?',
      'Quels modes de paiement et quel panier moyen ?',
    ],
  },
  {
    id: 'stock',
    label: 'Stock & Produits',
    items: [
      'Que dois-je réapprovisionner en priorité ?',
      'Quelle est la valeur de mon stock ?',
      'Quels sont mes cinq produits les plus rentables ?',
      'Quels produits ont une faible marge ou un prix d’achat manquant ?',
      'Quelle catégorie rapporte le plus ?',
      'Quels produits n’ont enregistré aucune vente récemment ?',
    ],
  },
  {
    id: 'clients',
    label: 'Clients & Crédits',
    items: [
      'Quels clients me doivent de l’argent ?',
      'Qui sont mes meilleurs clients ?',
      'Quelles commandes sont en attente de livraison ?',
      'Quelles promotions sont actuellement actives ?',
    ],
  },
  {
    id: 'strategy',
    label: 'Simulations & Conseils',
    items: [
      'Si je fais une remise de 10%, quel impact sur ma marge ?',
      'Combien dois-je vendre pour couvrir mes dépenses du mois ?',
      'Quels catalogues sont déjà prêts ?',
    ],
  },
];

export const ASSISTANT_SUGGESTIONS: string[] = [
  'Fais-moi un bilan complet de ma boutique',
  'Combien ai-je dans la caisse ?',
  'Quel est mon bénéfice du mois ?',
  'Que dois-je réapprovisionner en priorité ?',
  'Compare cette semaine à la semaine dernière',
  'Quels clients me doivent de l’argent ?',
  'Quelle catégorie rapporte le plus ?',
  'Qui sont mes meilleurs clients ?',
  'Où partent mes dépenses par catégorie ?',
  'Combien dois-je vendre pour couvrir mes dépenses du mois ?',
];

function hasAny(norm: string, keywords: string[]): boolean {
  return keywords.some((kw) => norm.includes(kw));
}

function getPreviousPeriodBounds(kind: 'yesterday' | 'prev_week' | 'prev_month'): {
  startMs: number;
  endMs: number;
} {
  const now = new Date();
  if (kind === 'yesterday') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).getTime();
    return {startMs: start, endMs: end};
  }
  if (kind === 'prev_week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13, 0, 0, 0, 0).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 23, 59, 59, 999).getTime();
    return {startMs: start, endMs: end};
  }
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
  return {startMs: start, endMs: end};
}

function formatIsoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function findMatchingProduct(normQuestion: string, products: Product[]): Product | null {
  let bestMatch: {product: Product; score: number} | null = null;
  const qTokens = normQuestion.split(/\s+/).filter((t) => t.length >= 3);

  for (const p of products) {
    const normName = normalizeTextForSearch(p.name);
    const normSku = normalizeTextForSearch(p.sku);
    if (!normName && !normSku) continue;

    if (normSku.length >= 3 && normQuestion.includes(normSku)) {
      return p;
    }
    if (normName.length >= 3 && normQuestion.includes(normName)) {
      const score = normName.length + 100;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {product: p, score};
      }
      continue;
    }
    const nameTokens = normName.split(/\s+/).filter((t) => t.length >= 4);
    if (nameTokens.length > 0) {
      const matched = nameTokens.filter((tok) => qTokens.includes(tok));
      if (matched.length >= Math.min(2, nameTokens.length) && matched.length > 0) {
        const score = matched.join('').length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {product: p, score};
        }
      }
    }
  }
  return bestMatch?.product ?? null;
}

function findMatchingCustomer(normQuestion: string, customers: Customer[]): Customer | null {
  let best: {customer: Customer; score: number} | null = null;
  const qTokens = normQuestion.split(/\s+/).filter((t) => t.length >= 3);

  for (const c of customers) {
    const normName = normalizeTextForSearch(c.name);
    const normPhone = normalizeTextForSearch(c.phone);
    if (normPhone.length >= 6 && normQuestion.includes(normPhone)) return c;
    if (normName.length >= 3 && normQuestion.includes(normName)) {
      const score = normName.length + 100;
      if (!best || score > best.score) best = {customer: c, score};
      continue;
    }
    const nameTokens = normName.split(/\s+/).filter((t) => t.length >= 4);
    if (nameTokens.length > 0) {
      const matched = nameTokens.filter((t) => qTokens.includes(t));
      if (matched.length > 0 && matched.length >= Math.min(2, nameTokens.length)) {
        const score = matched.join('').length;
        if (!best || score > best.score) best = {customer: c, score};
      }
    }
  }
  return best?.customer ?? null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingCategory(normQuestion: string, products: Product[]): string | null {
  const cleaned = normQuestion
    .replace(/\bmodes?\s+de\s+paiements?\b/g, '')
    .replace(/\bmode\s+demo(nstration)?\b/g, '');
  const categories = Array.from(new Set(products.map((p) => p.category.trim()).filter(Boolean)));
  for (const cat of categories) {
    const normCat = normalizeTextForSearch(cat);
    if (normCat.length >= 3) {
      const re = new RegExp(`(?:^|\\s)${escapeRegex(normCat)}(?:$|\\s)`);
      if (re.test(cleaned)) {
        return cat;
      }
    }
  }
  return null;
}

function extractNumbers(question: string): number[] {
  const matches = question.match(/\d+(?:[.,]\d+)?/g);
  if (!matches) return [];
  return matches
    .map((m) => Number(m.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function makeMessage(partial: Omit<AssistantMessage, 'id' | 'role' | 'createdAt'>): AssistantMessage {
  return {
    id: generateId('msg'),
    role: 'assistant',
    createdAt: Date.now(),
    ...partial,
  };
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
  const monthFinance = calculateFinanceSummary({
    sales: ctx.sales,
    products: ctx.products,
    expenses: ctx.expenses,
    creditTransactions: ctx.creditTransactions,
    period: 'month',
  });
  const weekFinance = calculateFinanceSummary({
    sales: ctx.sales,
    products: ctx.products,
    expenses: ctx.expenses,
    creditTransactions: ctx.creditTransactions,
    period: 'week',
  });
  const todayFinance = calculateFinanceSummary({
    sales: ctx.sales,
    products: ctx.products,
    expenses: ctx.expenses,
    creditTransactions: ctx.creditTransactions,
    period: 'today',
  });
  const creditData = computeCreditSummaries(ctx.customers, ctx.creditTransactions);

  // 0. Salutations / Capacités
  if (
    hasAny(norm, [
      'bonjour',
      'salut',
      'bonsoir',
      'coucou',
      'hello',
      'que sais tu faire',
      'comment utiliser',
      'aide moi',
      'capacite',
    ]) &&
    norm.split(/\s+/).length <= 7
  ) {
    const sampleProduct = ctx.products[0]?.name;
    const sampleCustomer = ctx.customers[0]?.name;
    return makeMessage({
      text: `Bonjour ! Je suis votre analyste commercial local ZANDO Pro. Je fonctionne 100 % hors ligne sur vos ${ctx.products.length} produit(s), ${ctx.sales.length} vente(s), ${ctx.customers.length} client(s) et ${ctx.expenses.length} dépense(s). Posez-moi n’importe quelle question en langage naturel :`,
      details: [
        '• Bilan & santé globale (« Fais-moi un bilan complet de ma boutique »)',
        '• Finances, caisse & comparaisons (« Compare cette semaine à la semaine dernière »)',
        sampleProduct
          ? `• Analyse d’un article précis (« Analyse le produit ${sampleProduct} »)`
          : '• Analyse de rentabilité par produit ou catégorie',
        sampleCustomer
          ? `• Fiche client & crédits (« Quelle est la situation de ${sampleCustomer} ? »)`
          : '• Suivi des dettes clients, retards et avances',
        '• Réapprovisionnement, invendus et simulations de remise ou d’objectif',
      ],
      followUps: [
        'Fais-moi un bilan complet de ma boutique',
        'Que dois-je réapprovisionner en priorité ?',
        ...(sampleProduct ? [`Analyse ${sampleProduct}`] : []),
      ],
      actionRoute: 'dashboard',
      actionLabel: 'Voir le Tableau de bord',
    });
  }

  // 1. Simulation de remise ou calcul d'objectif de vente
  if (
    hasAny(norm, [
      'simule',
      'simulation',
      'si je fais',
      'si j accorde',
      'impact remise',
      'objectif',
      'couvrir mes depenses',
      'seuil de rentabilite',
      'combien vendre pour',
    ])
  ) {
    const nums = extractNumbers(question);
    const isDiscountSim =
      norm.includes('%') || hasAny(norm, ['remise', 'reduction', 'baisse', 'rabais']);

    if (isDiscountSim) {
      const discountPct = Math.min(90, nums[0] ?? 10);
      const baseRevenue = monthFinance.netRevenue > 0 ? monthFinance.netRevenue : allTimeFinance.netRevenue;
      const baseCogs = monthFinance.netRevenue > 0 ? monthFinance.cogsTotal : allTimeFinance.cogsTotal;
      const baseFees = monthFinance.netRevenue > 0 ? monthFinance.extraFeesTotal : allTimeFinance.extraFeesTotal;

      if (baseRevenue <= 0) {
        const activeCount = ctx.products.length;
        return makeMessage({
          text: `Pour simuler l’effet réel d’une remise de ${discountPct}%, enregistrez au moins une vente ou vérifiez vos marges unitaires sur vos ${activeCount} produit(s).`,
          details: ctx.products.slice(0, 4).map((p) => {
            const discounted = Math.round(p.price * (1 - discountPct / 100));
            const newProfit = discounted - p.costPrice - (p.extraFees ?? 0);
            return `${p.name} : prix remisé ${formatMoney(discounted, currency)} → marge unitaire ${formatMoney(newProfit, currency)}`;
          }),
          actionRoute: 'promotions',
          actionLabel: 'Configurer une promotion',
        });
      }

      const currentGrossProfit = baseRevenue - baseCogs - baseFees;
      const simulatedRevenue = Math.round(baseRevenue * (1 - discountPct / 100));
      const simulatedGrossProfit = simulatedRevenue - baseCogs - baseFees;
      const diff = simulatedGrossProfit - currentGrossProfit;
      const marginBefore = (currentGrossProfit / baseRevenue) * 100;
      const marginAfter = simulatedRevenue > 0 ? (simulatedGrossProfit / simulatedRevenue) * 100 : 0;

      return makeMessage({
        text: `Simulation hors ligne d’une remise globale de ${discountPct}% appliquée sur votre volume de ventes actuel : votre marge brute passerait de ${marginBefore.toFixed(1)}% à ${marginAfter.toFixed(1)}% (impact de ${formatMoney(diff, currency)} à volume identique).`,
        metrics: [
          {label: 'Bénéfice brut actuel', value: formatMoney(currentGrossProfit, currency)},
          {label: `Après -${discountPct}%`, value: formatMoney(simulatedGrossProfit, currency)},
          {label: 'Nouvelle marge', value: `${marginAfter.toFixed(1)}%`},
        ],
        recommendations: [
          simulatedGrossProfit > 0 && currentGrossProfit > 0
            ? `Pour conserver exactement le même bénéfice total (${formatMoney(currentGrossProfit, currency)}), il faudrait augmenter vos volumes vendus d’environ ${Math.ceil(((currentGrossProfit / simulatedGrossProfit) - 1) * 100)}%.`
            : 'Attention : une remise de cette ampleur ferait passer votre marge brute moyenne en zone négative.',
        ],
        followUps: [
          'Quels produits ont une faible marge ou un prix d’achat manquant ?',
          'Quels produits n’ont enregistré aucune vente récemment ?',
        ],
        actionRoute: 'finances',
        actionLabel: 'Ouvrir Bénéfices & Finances',
      });
    }

    // Objectif / couvrir les dépenses
    const targetProfit =
      nums[0] ?? (monthFinance.expensesTotal > 0 ? monthFinance.expensesTotal : 50000);
    const refMarginRatio =
      monthFinance.grossMarginPercent > 0
        ? monthFinance.grossMarginPercent / 100
        : allTimeFinance.grossMarginPercent > 0
          ? allTimeFinance.grossMarginPercent / 100
          : 0.3;
    const avgBasket =
      ctx.sales.length > 0 ? allTimeFinance.netRevenue / ctx.sales.length : 0;
    const requiredRevenue = refMarginRatio > 0 ? Math.ceil(targetProfit / refMarginRatio) : 0;
    const estimatedOrders =
      avgBasket > 0 ? Math.ceil(requiredRevenue / avgBasket) : 0;

    return makeMessage({
      text: `Sur la base de votre taux de marge brute réel (${(refMarginRatio * 100).toFixed(1)}%), pour générer ${formatMoney(targetProfit, currency)} de bénéfice brut, il faut réaliser environ ${formatMoney(requiredRevenue, currency)} de chiffre d’affaires.`,
      metrics: [
        {label: 'Objectif visé', value: formatMoney(targetProfit, currency)},
        {label: 'CA nécessaire', value: formatMoney(requiredRevenue, currency)},
        {
          label: 'Ventes estimées',
          value: estimatedOrders > 0 ? `${estimatedOrders} vente(s)` : 'Selon panier moyen',
        },
      ],
      details:
        avgBasket > 0
          ? [`Panier moyen constaté actuellement : ${formatMoney(Math.round(avgBasket), currency)}.`]
          : undefined,
      followUps: ['Quel est mon bénéfice du mois ?', 'Où partent mes dépenses par catégorie ?'],
      actionRoute: 'finances',
      actionLabel: 'Analyser la rentabilité',
    });
  }

  // 2. Question sur un PRODUIT précis identifié dans la phrase
  const matchedProduct = findMatchingProduct(norm, ctx.products);
  if (matchedProduct) {
    const pricing = getEffectiveProductPrice(matchedProduct, ctx.promotions);
    const unitCost = matchedProduct.costPrice || 0;
    const unitFees = matchedProduct.extraFees || 0;
    const unitProfit = pricing.finalPrice - unitCost - unitFees;
    const unitMargin = pricing.finalPrice > 0 ? (unitProfit / pricing.finalPrice) * 100 : 0;
    const breakdown = allTimeFinance.productBreakdowns.find(
      (b) => b.productId === matchedProduct.id,
    );

    const stockStatus =
      matchedProduct.stock <= 0
        ? 'Rupture totale'
        : matchedProduct.stock <= matchedProduct.lowStockThreshold
          ? 'Stock critique'
          : 'Stock sain';

    return makeMessage({
      text: `Analyse complète de « ${matchedProduct.name} » (${matchedProduct.sku}) : ${stockStatus} (${matchedProduct.stock} ${matchedProduct.unit}), marge unitaire de ${formatMoney(unitProfit, currency)} (${unitMargin.toFixed(1)}%).`,
      metrics: [
        {
          label: 'Prix actuel',
          value: formatMoney(pricing.finalPrice, currency),
        },
        {
          label: 'Bénéfice / unité',
          value: formatMoney(unitProfit, currency),
        },
        {
          label: 'Vendus (total)',
          value: `${breakdown?.quantitySold ?? 0} ${matchedProduct.unit}`,
        },
      ],
      details: [
        `• Catégorie : ${matchedProduct.category}${matchedProduct.supplier ? ` · Fournisseur : ${matchedProduct.supplier}` : ''}`,
        `• Prix d’achat : ${formatMoney(unitCost, currency)}${unitFees > 0 ? ` · Frais supp. : ${formatMoney(unitFees, currency)}` : ''}`,
        pricing.promoLabel
          ? `• Promo active (${pricing.promoLabel}) : ${formatMoney(pricing.finalPrice, currency)} au lieu de ${formatMoney(pricing.originalPrice, currency)}`
          : '• Aucune promotion active sur cet article',
        breakdown
          ? `• CA cumulé : ${formatMoney(breakdown.grossRevenue, currency)} · Bénéfice brut cumulé : ${formatMoney(breakdown.grossProfit, currency)}`
          : '• Aucune vente enregistrée sur cet article pour le moment',
      ],
      recommendations:
        matchedProduct.stock <= matchedProduct.lowStockThreshold
          ? [`Réapprovisionnement conseillé (stock ${matchedProduct.stock} <= seuil ${matchedProduct.lowStockThreshold}).`]
          : matchedProduct.costPrice <= 0
            ? ['Renseignez le prix d’achat de ce produit pour calculer sa marge réelle exacte.']
            : undefined,
      followUps: [
        'Quels sont mes cinq produits les plus rentables ?',
        'Que dois-je réapprovisionner en priorité ?',
      ],
      actionRoute: 'products',
      actionLabel: 'Ouvrir Produits & Stock',
    });
  }

  // 3. Question sur un CLIENT précis identifié dans la phrase
  const matchedCustomer = findMatchingCustomer(norm, ctx.customers);
  if (matchedCustomer) {
    const creditSummary = creditData.summaries.find(
      (s) => s.customerId === matchedCustomer.id,
    );
    const customerSales = ctx.sales.filter(
      (s) =>
        s.customerId === matchedCustomer.id ||
        (matchedCustomer.phone && s.customerPhone === matchedCustomer.phone),
    );
    const customerOrders = ctx.orders.filter(
      (o) =>
        o.customerId === matchedCustomer.id ||
        (matchedCustomer.phone && o.customerPhone === matchedCustomer.phone),
    );
    const customerSpent = customerSales.reduce(
      (acc, s) => acc + Math.max(0, s.total - (s.refundedAmount ?? 0)),
      0,
    );
    const balance = creditSummary?.netBalance ?? 0;
    const balanceText =
      balance > 0
        ? `doit ${formatMoney(balance, currency)}${creditSummary?.isOverdue ? ' (EN RETARD)' : ''}`
        : balance < 0
          ? `dispose d’une avance de ${formatMoney(Math.abs(balance), currency)}`
          : 'est à jour (aucune dette)';

    return makeMessage({
      text: `Fiche client « ${matchedCustomer.name} » (${matchedCustomer.phone || 'sans téléphone'}) : ce client ${balanceText}.`,
      metrics: [
        {label: 'Total acheté', value: formatMoney(customerSpent, currency)},
        {
          label: 'Ventes / Commandes',
          value: `${customerSales.length} / ${customerOrders.length}`,
        },
        {
          label: balance >= 0 ? 'Reste dû' : 'Avance disponible',
          value: formatMoney(Math.abs(balance), currency),
        },
      ],
      details:
        creditSummary?.transactions.slice(0, 4).map(
          (tx) =>
            `• ${tx.note} : ${tx.direction === 'debt_increase' ? '+' : '-'}${formatMoney(tx.amount, currency)}`,
        ) ?? ['Aucune écriture de crédit ou d’avance enregistrée pour ce client.'],
      followUps: ['Quels clients me doivent de l’argent ?', 'Qui sont mes meilleurs clients ?'],
      actionRoute: balance !== 0 ? 'credits' : 'customers',
      actionLabel: balance !== 0 ? 'Ouvrir Crédits Clients' : 'Ouvrir Clients',
    });
  }

  // 4. Bilan complet / Santé de la boutique
  if (
    hasAny(norm, [
      'bilan',
      'resume',
      'sante',
      'comment va',
      'diagnostic',
      'situation globale',
      'point complet',
      'vue globale',
      'etat de ma boutique',
      'audit',
    ])
  ) {
    const lowStock = ctx.products.filter((p) => p.stock <= p.lowStockThreshold);
    const outOfStock = ctx.products.filter((p) => p.stock <= 0);
    const pendingOrders = ctx.orders.filter(
      (o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'delivering',
    );
    const missingCost = ctx.products.filter((p) => !p.costPrice || p.costPrice <= 0);

    const recs: string[] = [];
    if (creditData.kpis.overdueCount > 0) {
      recs.push(
        `Relancez ${creditData.kpis.overdueCount} client(s) en retard de paiement (${formatMoney(creditData.kpis.totalRemainingToRecover, currency)} à récupérer).`,
      );
    }
    if (outOfStock.length > 0 || lowStock.length > 0) {
      recs.push(
        `Réapprovisionnez ${lowStock.length} article(s) en alerte dont ${outOfStock.length} en rupture totale.`,
      );
    }
    if (missingCost.length > 0) {
      recs.push(
        `Complétez le prix d’achat de ${missingCost.length} produit(s) pour fiabiliser à 100 % le bénéfice net.`,
      );
    }
    if (pendingOrders.length > 0) {
      recs.push(`Traitez ${pendingOrders.length} commande(s) en attente de finalisation.`);
    }
    if (recs.length === 0) {
      recs.push('Tous vos indicateurs opérationnels sont sains (stock, créances et marges sous contrôle).');
    }

    return makeMessage({
      text: `Bilan exécutif de « ${ctx.storeProfile.name} » : ce mois-ci vous totalisez ${formatMoney(monthFinance.netRevenue, currency)} de CA net pour ${formatMoney(monthFinance.netProfit, currency)} de bénéfice net estimé (${monthFinance.netMarginPercent.toFixed(1)}% de marge nette), et ${formatMoney(allTimeFinance.netCashFlow, currency)} en trésorerie cumulée.`,
      metrics: [
        {label: 'Bénéfice du mois', value: formatMoney(monthFinance.netProfit, currency)},
        {label: 'Trésorerie nette', value: formatMoney(allTimeFinance.netCashFlow, currency)},
        {
          label: 'Créances à récupérer',
          value: formatMoney(creditData.kpis.totalRemainingToRecover, currency),
        },
      ],
      details: [
        `• Aujourd’hui : ${formatMoney(todayFinance.netRevenue, currency)} de CA · ${formatMoney(todayFinance.netProfit, currency)} de bénéfice`,
        `• 7 derniers jours : ${formatMoney(weekFinance.netRevenue, currency)} de CA · ${formatMoney(weekFinance.netProfit, currency)} de bénéfice`,
        `• Stock actif : ${ctx.products.length} référence(s) · ${lowStock.length} alerte(s) de stock`,
        `• Commandes actives : ${pendingOrders.length} à traiter`,
      ],
      recommendations: recs,
      followUps: [
        'Compare cette semaine à la semaine dernière',
        'Que dois-je réapprovisionner en priorité ?',
        'Quels sont mes cinq produits les plus rentables ?',
      ],
      actionRoute: 'finances',
      actionLabel: 'Ouvrir Bénéfices & Finances',
    });
  }

  // 5. Comparaison de périodes & Évolution
  if (
    hasAny(norm, [
      'compare',
      'comparaison',
      'evolution',
      'tendance',
      'croissance',
      'progression',
      'hier',
      'semaine derniere',
      'mois dernier',
    ])
  ) {
    const compareDay = hasAny(norm, ['hier', 'aujourd hui', 'jour']);
    const compareMonth = hasAny(norm, ['mois', 'mensuel']) && !hasAny(norm, ['semaine']);

    const currentBounds = compareDay
      ? getPeriodBounds('today')
      : compareMonth
        ? getPeriodBounds('month')
        : getPeriodBounds('week');
    const prevBounds = compareDay
      ? getPreviousPeriodBounds('yesterday')
      : compareMonth
        ? getPreviousPeriodBounds('prev_month')
        : getPreviousPeriodBounds('prev_week');

    const currentFin = calculateFinanceSummary({
      sales: ctx.sales,
      products: ctx.products,
      expenses: ctx.expenses,
      creditTransactions: ctx.creditTransactions,
      period: 'custom',
      customStart: formatIsoDay(currentBounds.startMs),
      customEnd: formatIsoDay(currentBounds.endMs),
    });
    const prevFin = calculateFinanceSummary({
      sales: ctx.sales,
      products: ctx.products,
      expenses: ctx.expenses,
      creditTransactions: ctx.creditTransactions,
      period: 'custom',
      customStart: formatIsoDay(prevBounds.startMs),
      customEnd: formatIsoDay(prevBounds.endMs),
    });

    const revDiff = currentFin.netRevenue - prevFin.netRevenue;
    const revPct =
      prevFin.netRevenue > 0
        ? `${revDiff >= 0 ? '+' : ''}${((revDiff / prevFin.netRevenue) * 100).toFixed(1)}%`
        : currentFin.netRevenue > 0
          ? '+100%'
          : '0%';

    const periodNames = compareDay
      ? ['Aujourd’hui', 'Hier']
      : compareMonth
        ? ['Ce mois-ci', 'Le mois dernier']
        : ['Ces 7 derniers jours', 'Les 7 jours précédents'];

    return makeMessage({
      text: `Comparaison ${periodNames[0]} vs ${periodNames[1]} : votre chiffre d’affaires évolue de ${formatMoney(revDiff, currency)} (${revPct}).`,
      metrics: [
        {label: periodNames[0], value: formatMoney(currentFin.netRevenue, currency)},
        {label: periodNames[1], value: formatMoney(prevFin.netRevenue, currency)},
        {label: 'Variation CA', value: revPct},
      ],
      details: [
        `• Bénéfice net (${periodNames[0]}) : ${formatMoney(currentFin.netProfit, currency)}`,
        `• Bénéfice net (${periodNames[1]}) : ${formatMoney(prevFin.netProfit, currency)}`,
        `• Dépenses (${periodNames[0]} vs ${periodNames[1]}) : ${formatMoney(currentFin.expensesTotal, currency)} vs ${formatMoney(prevFin.expensesTotal, currency)}`,
      ],
      followUps: ['Fais-moi un bilan complet de ma boutique', 'Quelle catégorie rapporte le plus ?'],
      actionRoute: 'finances',
      actionLabel: 'Voir la courbe d’évolution',
    });
  }

  // 6. Réapprovisionnement, ruptures & stock faible (planificateur d'achat)
  if (
    hasAny(norm, [
      'reapprovisionner',
      'reapprovisionnement',
      'acheter',
      'commander fournisseur',
      'epuise',
      'epuises',
      'stock faible',
      'rupture',
      'manque',
      'presque vide',
      'alerte stock',
    ])
  ) {
    const low = ctx.products.filter((p) => p.stock <= p.lowStockThreshold);
    if (low.length === 0) {
      return makeMessage({
        text: `Bonne nouvelle : tous vos ${ctx.products.length} produits sont au-dessus de leur seuil d’alerte de stock.`,
        followUps: ['Quelle est la valeur de mon stock ?', 'Quels produits n’ont enregistré aucune vente récemment ?'],
        actionRoute: 'products',
        actionLabel: 'Voir Produits & Stock',
      });
    }

    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const recentQty = new Map<string, number>();
    for (const s of ctx.sales) {
      if (s.createdAt < thirtyDaysAgo) continue;
      for (const item of s.items) {
        recentQty.set(item.productId, (recentQty.get(item.productId) ?? 0) + item.quantity);
      }
    }

    const prioritized = [...low]
      .map((p) => {
        const sold30 = recentQty.get(p.id) ?? 0;
        const suggestedOrder = Math.max(
          p.lowStockThreshold * 2 - p.stock,
          sold30 > 0 ? Math.ceil(sold30 / 2) : 5,
        );
        const estCost = suggestedOrder * (p.costPrice || 0);
        const priorityScore = (p.stock <= 0 ? 1000 : 100) + sold30 * 10;
        return {p, sold30, suggestedOrder, estCost, priorityScore};
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);

    const totalBudget = prioritized.reduce((acc, item) => acc + item.estCost, 0);
    const outCount = prioritized.filter((x) => x.p.stock <= 0).length;

    return makeMessage({
      text: `${low.length} produit(s) demandent un réapprovisionnement (dont ${outCount} en rupture totale). Budget d’achat estimé pour revenir à un niveau confortable : ${formatMoney(totalBudget, currency)}.`,
      metrics: [
        {label: 'En alerte / rupture', value: `${low.length} (${outCount} à 0)`},
        {label: 'Budget réassort estimé', value: formatMoney(totalBudget, currency)},
        {label: 'Produits actifs', value: String(ctx.products.length)},
      ],
      details: prioritized.slice(0, 7).map(
        ({p, sold30, suggestedOrder, estCost}) =>
          `• ${p.name} — Stock : ${p.stock} ${p.unit} (seuil ${p.lowStockThreshold}${sold30 > 0 ? `, ${sold30} vendu(s)/30j` : ''}) → Conseillé : +${suggestedOrder} (${formatMoney(estCost, currency)})`,
      ),
      followUps: ['Quelle est la valeur de mon stock ?', 'Combien ai-je dans la caisse ?'],
      actionRoute: 'products',
      actionLabel: 'Gérer le stock',
    });
  }

  // 7. Analyse par catégorie (globale ou catégorie spécifique)
  const specificCategory = findMatchingCategory(norm, ctx.products);
  if (specificCategory || hasAny(norm, ['categorie', 'categories', 'rayon', 'famille'])) {
    if (specificCategory) {
      const catFin = calculateFinanceSummary({
        sales: ctx.sales,
        products: ctx.products,
        expenses: ctx.expenses,
        creditTransactions: ctx.creditTransactions,
        period: 'all',
        categoryFilter: specificCategory,
      });
      const catProducts = ctx.products.filter(
        (p) => p.category.trim().toLowerCase() === specificCategory.toLowerCase(),
      );
      const stockVal = catProducts.reduce((acc, p) => acc + p.price * Math.max(0, p.stock), 0);

      return makeMessage({
        text: `Performance de la catégorie « ${specificCategory} » : ${catProducts.length} produit(s), ${formatMoney(catFin.netRevenue, currency)} de CA et ${formatMoney(catFin.grossProfit, currency)} de bénéfice brut (${catFin.grossMarginPercent.toFixed(1)}% de marge).`,
        metrics: [
          {label: 'CA Catégorie', value: formatMoney(catFin.netRevenue, currency)},
          {label: 'Bénéfice brut', value: formatMoney(catFin.grossProfit, currency)},
          {label: 'Valeur en stock', value: formatMoney(stockVal, currency)},
        ],
        details: catFin.productBreakdowns.slice(0, 5).map(
          (b, idx) =>
            `${idx + 1}. ${b.productName} — ${b.quantitySold} vendu(s) · Bénéfice ${formatMoney(b.grossProfit, currency)}`,
        ),
        actionRoute: 'finances',
        actionLabel: 'Filtrer dans Finances',
      });
    }

    const byCat = new Map<
      string,
      {category: string; revenue: number; profit: number; qty: number}
    >();
    for (const pb of allTimeFinance.productBreakdowns) {
      const prev = byCat.get(pb.category) ?? {
        category: pb.category,
        revenue: 0,
        profit: 0,
        qty: 0,
      };
      prev.revenue += pb.grossRevenue;
      prev.profit += pb.grossProfit;
      prev.qty += pb.quantitySold;
      byCat.set(pb.category, prev);
    }

    const sortedCats = Array.from(byCat.values()).sort((a, b) => b.profit - a.profit);
    if (sortedCats.length === 0) {
      return makeMessage({
        text: 'Aucune vente enregistrée pour comparer vos catégories pour le moment.',
        actionRoute: 'products',
        actionLabel: 'Voir les catégories',
      });
    }

    const topCat = sortedCats[0];
    return makeMessage({
      text: `Votre catégorie la plus rentable est « ${topCat.category} » avec ${formatMoney(topCat.profit, currency)} de bénéfice brut sur ${formatMoney(topCat.revenue, currency)} de ventes.`,
      metrics: [
        {label: 'Catégorie #1', value: topCat.category},
        {label: 'Bénéfice brut #1', value: formatMoney(topCat.profit, currency)},
        {label: 'Catégories vendues', value: String(sortedCats.length)},
      ],
      details: sortedCats.slice(0, 6).map((c, idx) => {
        const margin = c.revenue > 0 ? ((c.profit / c.revenue) * 100).toFixed(1) : '0.0';
        return `${idx + 1}. ${c.category} — ${c.qty} vendu(s) · CA ${formatMoney(c.revenue, currency)} · Bénéfice ${formatMoney(c.profit, currency)} (${margin}%)`;
      }),
      actionRoute: 'finances',
      actionLabel: 'Analyser par catégorie',
    });
  }

  // 8. Modes de paiement & Panier moyen
  if (
    hasAny(norm, [
      'mode de paiement',
      'paiement',
      'mobile money',
      'especes',
      'virement',
      'panier moyen',
      'ticket moyen',
    ])
  ) {
    if (ctx.sales.length === 0) {
      return makeMessage({
        text: 'Aucune vente enregistrée pour calculer les modes de paiement et le panier moyen.',
        actionRoute: 'sales',
        actionLabel: 'Ouvrir Ventes & Caisse',
      });
    }
    const buckets = new Map<Sale['paymentMethod'], {count: number; total: number}>();
    for (const s of ctx.sales) {
      const prev = buckets.get(s.paymentMethod) ?? {count: 0, total: 0};
      prev.count += 1;
      prev.total += Math.max(0, s.total - (s.refundedAmount ?? 0));
      buckets.set(s.paymentMethod, prev);
    }
    const avgBasket = allTimeFinance.netRevenue / ctx.sales.length;

    return makeMessage({
      text: `Sur ${ctx.sales.length} vente(s), votre panier moyen est de ${formatMoney(Math.round(avgBasket), currency)}. Répartition par mode de paiement :`,
      metrics: [
        {label: 'Panier moyen', value: formatMoney(Math.round(avgBasket), currency)},
        {label: 'Nombre de ventes', value: String(ctx.sales.length)},
        {label: 'CA Net cumulé', value: formatMoney(allTimeFinance.netRevenue, currency)},
      ],
      details: Array.from(buckets.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(
          ([method, data]) =>
            `• ${method} : ${data.count} vente(s) · ${formatMoney(data.total, currency)} (${((data.total / Math.max(1, allTimeFinance.netRevenue)) * 100).toFixed(1)}%)`,
        ),
      actionRoute: 'sales',
      actionLabel: 'Voir Ventes & Caisse',
    });
  }

  // 9. Meilleurs clients / fidélité
  if (
    hasAny(norm, [
      'meilleur client',
      'meilleurs clients',
      'top client',
      'fidele',
      'fideles',
      'qui achete le plus',
      'classement client',
    ])
  ) {
    if (ctx.customers.length === 0) {
      return makeMessage({
        text: 'Aucun client enregistré dans votre base pour établir un classement.',
        actionRoute: 'customers',
        actionLabel: 'Ajouter un client',
      });
    }
    const ranked = ctx.customers
      .map((c) => {
        const custSales = ctx.sales.filter(
          (s) => s.customerId === c.id || (c.phone && s.customerPhone === c.phone),
        );
        const spent = custSales.reduce(
          (acc, s) => acc + Math.max(0, s.total - (s.refundedAmount ?? 0)),
          0,
        );
        return {customer: c, spent, salesCount: custSales.length};
      })
      .sort((a, b) => b.spent - a.spent);

    const topList = ranked.slice(0, 6);
    const totalAllCustomers = ranked.reduce((acc, item) => acc + item.spent, 0);

    return makeMessage({
      text: `Voici vos ${topList.length} client(s) les plus importants sur un total de ${ctx.customers.length} client(s) enregistré(s) :`,
      metrics: [
        {label: 'Client #1', value: topList[0]?.customer.name || '—'},
        {label: 'Achats #1', value: formatMoney(topList[0]?.spent ?? 0, currency)},
        {label: 'Total clients', value: formatMoney(totalAllCustomers, currency)},
      ],
      details: topList.map(
        (item, i) =>
          `${i + 1}. ${item.customer.name} (${item.customer.phone || 'sans tél.'}) — ${formatMoney(item.spent, currency)} · ${item.salesCount} achat(s)`,
      ),
      actionRoute: 'customers',
      actionLabel: 'Ouvrir Clients',
    });
  }

  // 10. Produits peu rentables / faible marge / prix d'achat manquant
  if (
    hasAny(norm, [
      'peu rentable',
      'moins rentable',
      'faible marge',
      'prix d achat manquant',
      'sans prix d achat',
      'perte',
    ])
  ) {
    const missingCost = ctx.products.filter((p) => !p.costPrice || p.costPrice <= 0);
    const lowProfit = allTimeFinance.lowProfitProducts;

    return makeMessage({
      text:
        missingCost.length > 0
          ? `${missingCost.length} produit(s) n’ont pas encore de prix d’achat renseigné (leur coût est compté à 0). Voici les produits générant le moins de bénéfice :`
          : 'Voici les produits générant actuellement le moins de bénéfice brut ou la plus faible marge :',
      details: [
        ...lowProfit.slice(0, 4).map(
          (p) =>
            `• ${p.productName} : bénéfice ${formatMoney(p.grossProfit, currency)} (marge ${p.marginPercent.toFixed(1)}%, ${p.quantitySold} vendu(s))`,
        ),
        ...(missingCost.length > 0
          ? [`• Articles sans prix d’achat : ${missingCost.slice(0, 5).map((p) => p.name).join(', ')}`]
          : []),
      ],
      followUps: ['Si je fais une remise de 10%, quel impact sur ma marge ?', 'Quels produits n’ont enregistré aucune vente récemment ?'],
      actionRoute: 'finances',
      actionLabel: 'Analyser les marges',
    });
  }

  // 11. Caisse / Trésorerie
  if (hasAny(norm, ['caisse', 'tresorerie', 'liquide', 'encaisse', 'argent disponible'])) {
    return makeMessage({
      text: `Selon vos encaissements réels enregistrés dans IndexedDB (ventes payées, acomptes, paiements partiels et avances, déduction faite des remboursements et dépenses), votre solde de caisse estimé est de ${formatMoney(allTimeFinance.netCashFlow, currency)}.`,
      metrics: [
        {label: 'Trésorerie nette', value: formatMoney(allTimeFinance.netCashFlow, currency)},
        {label: 'Total encaissé', value: formatMoney(allTimeFinance.cashCollectedSales, currency)},
        {label: 'Dépenses + Remb.', value: formatMoney(allTimeFinance.expensesTotal + allTimeFinance.refundsTotal, currency)},
      ],
      followUps: ['Quel est mon bénéfice du mois ?', 'Quels clients me doivent de l’argent ?'],
      actionRoute: 'finances',
      actionLabel: 'Ouvrir Bénéfices & Finances',
    });
  }

  // 12. Ventes aujourd'hui / semaine / mois / global
  if (
    hasAny(norm, ['vendu', 'vente', 'chiffre d affaires', 'ca ']) &&
    !hasAny(norm, ['plus vendus', 'aucune vente', 'sans vente', 'invendus'])
  ) {
    const isToday = hasAny(norm, ['aujourd hui', 'aujourdhui', 'jour', 'ce matin']);
    const isWeek = hasAny(norm, ['semaine', '7 jours']);
    const isMonth = hasAny(norm, ['mois', 'mensuel']);
    const isAll = hasAny(norm, ['tout', 'total', 'global', 'cumul']);

    const period = isToday ? 'today' : isWeek ? 'week' : isMonth ? 'month' : isAll ? 'all' : 'today';
    const label = isToday
      ? 'aujourd’hui'
      : isWeek
        ? 'cette semaine'
        : isMonth
          ? 'ce mois-ci'
          : isAll
            ? 'au total'
            : 'aujourd’hui';
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
      return makeMessage({
        text: `Aucune vente n’a encore été enregistrée ${label}.`,
        metrics: [{label: `Ventes (${label})`, value: `0 (${formatMoney(0, currency)})`}],
        followUps: ['Compare cette semaine à la semaine dernière', 'Combien ai-je dans la caisse ?'],
        actionRoute: 'sales',
        actionLabel: 'Voir Ventes & Caisse',
      });
    }

    return makeMessage({
      text: `Vous avez enregistré ${matchingSales.length} vente${matchingSales.length > 1 ? 's' : ''} ${label} pour un chiffre d’affaires net de ${formatMoney(fin.netRevenue, currency)}.`,
      metrics: [
        {label: 'Chiffre d’affaires', value: formatMoney(fin.netRevenue, currency)},
        {label: 'Nombre de ventes', value: String(matchingSales.length)},
        {label: 'Bénéfice brut', value: formatMoney(fin.grossProfit, currency)},
      ],
      followUps: ['Quel est mon bénéfice du mois ?', 'Quels sont mes cinq produits les plus rentables ?'],
      actionRoute: 'sales',
      actionLabel: 'Ouvrir Ventes & Caisse',
    });
  }

  // 13. Bénéfice / Marge / Rentabilité
  if (hasAny(norm, ['benefice', 'profit', 'marge', 'rentabilite', 'gagne'])) {
    const isToday = hasAny(norm, ['aujourd hui', 'aujourdhui', 'jour']);
    const isWeek = hasAny(norm, ['semaine']);
    const isAll = hasAny(norm, ['tout', 'total', 'global', 'cumul']);
    const period = isToday ? 'today' : isWeek ? 'week' : isAll ? 'all' : 'month';
    const periodLabel = isToday
      ? 'du jour'
      : isWeek
        ? 'de la semaine'
        : isAll
          ? 'cumulé'
          : 'du mois en cours';

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

    return makeMessage({
      text: `Bénéfice ${periodLabel} : ${formatMoney(fin.netProfit, currency)} net estimé (${formatMoney(fin.grossProfit, currency)} brut avant ${formatMoney(fin.expensesTotal, currency)} de dépenses).${warning}`,
      metrics: [
        {label: 'Bénéfice net', value: formatMoney(fin.netProfit, currency)},
        {label: 'Bénéfice brut', value: formatMoney(fin.grossProfit, currency)},
        {label: 'Marge nette', value: `${fin.netMarginPercent.toFixed(1)}%`},
      ],
      followUps: ['Où partent mes dépenses par catégorie ?', 'Quels sont mes cinq produits les plus rentables ?'],
      actionRoute: 'finances',
      actionLabel: 'Analyser les bénéfices',
    });
  }

  // 14. Top produits les plus vendus / les plus rentables
  if (hasAny(norm, ['plus vendus', 'meilleurs produits', 'top', 'best seller', 'plus rentables'])) {
    if (allTimeFinance.productBreakdowns.length === 0) {
      return makeMessage({
        text: 'Aucune vente enregistrée pour classer vos produits pour le moment.',
        actionRoute: 'sales',
        actionLabel: 'Ouvrir Ventes & Caisse',
      });
    }

    const byProfit = hasAny(norm, ['rentables', 'benefice']);
    const sorted = [...allTimeFinance.productBreakdowns]
      .sort((a, b) => (byProfit ? b.grossProfit - a.grossProfit : b.quantitySold - a.quantitySold))
      .slice(0, 5);

    return makeMessage({
      text: byProfit
        ? `Voici vos ${sorted.length} produit(s) générant le plus de bénéfice brut :`
        : `Voici vos ${sorted.length} produit(s) les plus vendus en volume :`,
      details: sorted.map(
        (p, i) =>
          `${i + 1}. ${p.productName} — ${p.quantitySold} vendu(s) · CA ${formatMoney(p.grossRevenue, currency)} · Bénéfice ${formatMoney(p.grossProfit, currency)} (${p.marginPercent.toFixed(1)}%)`,
      ),
      followUps: ['Quelle catégorie rapporte le plus ?', 'Que dois-je réapprovisionner en priorité ?'],
      actionRoute: 'finances',
      actionLabel: 'Voir le détail par produit',
    });
  }

  // 15. Clients endettés / crédits / avances
  if (hasAny(norm, ['doivent', 'dette', 'dettes', 'credit', 'credits', 'creance', 'impaye', 'retard', 'avance'])) {
    const debtors = creditData.summaries.filter((s) => s.netBalance > 0);
    const advances = creditData.summaries.filter((s) => s.netBalance < 0);

    if (debtors.length === 0 && advances.length === 0) {
      return makeMessage({
        text: 'Aucun client ne vous doit d’argent et aucune avance n’est en cours actuellement.',
        metrics: [{label: 'Restant à récupérer', value: formatMoney(0, currency)}],
        actionRoute: 'credits',
        actionLabel: 'Ouvrir Crédits Clients',
      });
    }

    return makeMessage({
      text:
        debtors.length > 0
          ? `${debtors.length} client${debtors.length > 1 ? 's' : ''} ont un solde débiteur pour un total de ${formatMoney(creditData.kpis.totalRemainingToRecover, currency)} (${creditData.kpis.overdueCount} en retard).`
          : `Aucune dette client en attente. Vous détenez ${advances.length} avance(s) client(s).`,
      metrics: [
        {label: 'À récupérer', value: formatMoney(creditData.kpis.totalRemainingToRecover, currency)},
        {label: 'Clients endettés', value: String(creditData.kpis.debtorCount)},
        {label: 'En retard', value: String(creditData.kpis.overdueCount)},
      ],
      details: [
        ...debtors.slice(0, 5).map(
          (d) =>
            `• ${d.customerName} — Reste dû : ${formatMoney(d.netBalance, currency)}${d.isOverdue ? ' (EN RETARD)' : ''}`,
        ),
        ...advances.slice(0, 3).map(
          (a) => `• ${a.customerName} — Avance : ${formatMoney(Math.abs(a.netBalance), currency)}`,
        ),
      ],
      actionRoute: 'credits',
      actionLabel: 'Gérer les crédits & relances',
    });
  }

  // 16. Valeur du stock
  if (hasAny(norm, ['valeur', 'inventaire', 'combien vaut', 'capital stock'])) {
    const retailVal = ctx.products.reduce((acc, p) => acc + p.price * Math.max(0, p.stock), 0);
    const costVal = ctx.products.reduce((acc, p) => acc + p.costPrice * Math.max(0, p.stock), 0);
    const potentialMargin = retailVal - costVal;
    const totalUnits = ctx.products.reduce((acc, p) => acc + Math.max(0, p.stock), 0);

    return makeMessage({
      text: `Votre inventaire compte ${totalUnits} unité(s) sur ${ctx.products.length} référence(s) : valeur au prix de vente de ${formatMoney(retailVal, currency)} pour un coût d’achat de ${formatMoney(costVal, currency)} (marge potentielle latente de ${formatMoney(potentialMargin, currency)}).`,
      metrics: [
        {label: 'Valeur vente', value: formatMoney(retailVal, currency)},
        {label: 'Coût d’achat', value: formatMoney(costVal, currency)},
        {label: 'Marge en stock', value: formatMoney(potentialMargin, currency)},
      ],
      followUps: ['Que dois-je réapprovisionner en priorité ?', 'Quels produits n’ont enregistré aucune vente récemment ?'],
      actionRoute: 'products',
      actionLabel: 'Voir l’inventaire',
    });
  }

  // 17. Dépenses par catégorie & période
  if (hasAny(norm, ['depense', 'depenses', 'charges', 'frais', 'ou part'])) {
    const isToday = hasAny(norm, ['aujourd hui', 'jour']);
    const isMonth = hasAny(norm, ['mois']);
    const isAll = hasAny(norm, ['tout', 'total', 'toujours', 'global']);
    const period = isToday ? 'today' : isMonth ? 'month' : isAll ? 'all' : 'week';
    const label = isToday
      ? 'aujourd’hui'
      : isMonth
        ? 'ce mois-ci'
        : isAll
          ? 'au total'
          : 'cette semaine';
    const bounds = getPeriodBounds(period);

    const matching = ctx.expenses.filter((e) => {
      const ms = new Date(`${e.date}T12:00:00`).getTime();
      return ms >= bounds.startMs && ms <= bounds.endMs;
    });
    const total = matching.reduce((acc, e) => acc + e.amount, 0);

    const byCat = new Map<string, number>();
    for (const e of matching) {
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
    }

    return makeMessage({
      text:
        matching.length === 0
          ? `Aucune dépense enregistrée ${label}.`
          : `Vous avez enregistré ${matching.length} dépense(s) ${label} pour un total de ${formatMoney(total, currency)}.`,
      metrics: [{label: `Dépenses (${label})`, value: formatMoney(total, currency)}],
      details:
        matching.length > 0
          ? [
              ...Array.from(byCat.entries())
                .sort((a, b) => b[1] - a[1])
                .map(
                  ([cat, amt]) =>
                    `• Catégorie ${cat} : ${formatMoney(amt, currency)} (${total > 0 ? ((amt / total) * 100).toFixed(0) : 0}%)`,
                ),
              ...matching.slice(0, 3).map((e) => `  ↳ ${e.title} (${e.date}) — ${formatMoney(e.amount, currency)}`),
            ]
          : undefined,
      followUps: ['Combien dois-je vendre pour couvrir mes dépenses du mois ?'],
      actionRoute: 'finances',
      actionLabel: 'Voir les dépenses',
    });
  }

  // 18. Promotions actives
  if (hasAny(norm, ['promo', 'promotion', 'promotions', 'reduction', 'remise'])) {
    const active = ctx.promotions.filter((p) => isPromotionCurrentlyActive(p));
    if (active.length === 0) {
      return makeMessage({
        text: 'Aucune promotion n’est actuellement active.',
        followUps: ['Si je fais une remise de 10%, quel impact sur ma marge ?'],
        actionRoute: 'promotions',
        actionLabel: 'Créer une promotion',
      });
    }

    return makeMessage({
      text: `${active.length} promotion${active.length > 1 ? 's' : ''} active${active.length > 1 ? 's' : ''} en ce moment :`,
      details: active.map(
        (p) =>
          `• ${p.title} (${p.discountType === 'percent' ? `-${p.discountValue}%` : `-${formatMoney(p.discountValue, currency)}`}) · jusqu’au ${p.endsAt || '—'}`,
      ),
      actionRoute: 'promotions',
      actionLabel: 'Gérer les promotions',
    });
  }

  // 19. Produits sans vente récente / dormants
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
      return makeMessage({
        text: 'Tous vos produits actifs ont enregistré au moins une vente au cours des 30 derniers jours.',
        actionRoute: 'products',
        actionLabel: 'Voir les produits',
      });
    }

    const sleepingCapital = unsold.reduce((acc, p) => acc + p.costPrice * Math.max(0, p.stock), 0);

    return makeMessage({
      text: `${unsold.length} produit(s) actif(s) n’ont enregistré aucune vente sur les 30 derniers jours (capital immobilisé : ${formatMoney(sleepingCapital, currency)}).`,
      details: unsold.slice(0, 8).map(
        (p) => `• ${p.name} — Stock : ${p.stock} ${p.unit} · Prix : ${formatMoney(p.price, currency)}`,
      ),
      recommendations: [
        'Créez une promotion ciblée ou mettez ces articles en avant dans un catalogue WhatsApp pour libérer votre trésorerie.',
      ],
      actionRoute: 'promotions',
      actionLabel: 'Lancer une promotion',
    });
  }

  // 20. Commandes & pipeline livraison
  if (hasAny(norm, ['commande', 'commandes', 'livraison', 'en attente', 'livree', 'annulee'])) {
    const pending = ctx.orders.filter(
      (o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'delivering',
    );
    const delivered = ctx.orders.filter((o) => o.status === 'delivered').length;
    const cancelled = ctx.orders.filter((o) => o.status === 'cancelled').length;

    return makeMessage({
      text:
        pending.length === 0
          ? `Aucune commande en attente actuellement (${delivered} livrée(s), ${cancelled} annulée(s)).`
          : `Vous avez ${pending.length} commande(s) active(s) à traiter pour un montant de ${formatMoney(
              pending.reduce((acc, o) => acc + o.total, 0),
              currency,
            )}.`,
      metrics: [
        {label: 'À traiter', value: String(pending.length)},
        {label: 'Livrées', value: String(delivered)},
        {label: 'Annulées', value: String(cancelled)},
      ],
      details: pending.slice(0, 5).map(
        (o) => `• ${o.orderNumber} — ${o.customerName} · ${formatMoney(o.total, currency)}`,
      ),
      actionRoute: 'orders',
      actionLabel: 'Ouvrir Commandes',
    });
  }

  // 21. Catalogues
  if (hasAny(norm, ['catalogue', 'catalogues', 'pdf', 'html'])) {
    const cats = ctx.catalogs ?? [];
    return makeMessage({
      text:
        cats.length === 0
          ? 'Aucun catalogue n’a encore été enregistré. Vous pouvez en générer et en modifier hors ligne au format HTML autonome ou PDF.'
          : `Vous disposez de ${cats.length} catalogue(s) enregistré(s) localement (modifiables et exportables hors ligne en HTML et PDF).`,
      details: cats.slice(0, 5).map(
        (c) => `• ${c.title} — ${c.products.length} produit(s)`,
      ),
      actionRoute: 'catalogs',
      actionLabel: 'Gérer les catalogues',
    });
  }

  // 22. Fallback intelligent avec instantané réel et pistes concrètes
  return makeMessage({
    text: 'Je n’ai pas encore de règle dédiée pour cette formulation exacte, mais voici l’instantané réel de votre boutique calculé localement :',
    metrics: [
      {label: 'CA Net total', value: formatMoney(allTimeFinance.netRevenue, currency)},
      {label: 'Bénéfice net', value: formatMoney(allTimeFinance.netProfit, currency)},
      {label: 'Créances clients', value: formatMoney(creditData.kpis.totalRemainingToRecover, currency)},
    ],
    details: [
      `• Produits actifs : ${ctx.products.length} · Stock valorisé à ${formatMoney(ctx.products.reduce((a, p) => a + p.price * Math.max(0, p.stock), 0), currency)}`,
      '• Astuce : citez directement le nom d’un produit, d’une catégorie ou d’un client dans votre question pour obtenir sa fiche détaillée.',
    ],
    followUps: [
      'Fais-moi un bilan complet de ma boutique',
      'Que dois-je réapprovisionner en priorité ?',
      'Compare cette semaine à la semaine dernière',
    ],
  });
}
