import {
  CreditTransaction,
  Expense,
  Product,
  Sale,
} from '../types/commerce';

export type ProfitPeriod = 'today' | 'week' | 'month' | 'all' | 'custom';

export interface ProductProfitBreakdown {
  productId: string;
  productName: string;
  category: string;
  quantitySold: number;
  grossRevenue: number;
  discountsGiven: number;
  cogs: number;
  extraFees: number;
  grossProfit: number;
  marginPercent: number;
}

export interface SaleProfitBreakdown {
  saleId: string;
  receiptNumber: string;
  customerName: string;
  createdAt: number;
  revenueNet: number;
  cogs: number;
  extraFees: number;
  grossProfit: number;
  marginPercent: number;
  amountPaid: number;
  refundedAmount: number;
  remainingDebt: number;
}

export interface ProfitSeriesPoint {
  key: string;
  label: string;
  revenue: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
}

export interface FinanceSummary {
  grossSalesRevenue: number;
  refundsTotal: number;
  netRevenue: number;         // CA net reconnu (hors doublon de paiements partiels)
  cogsTotal: number;          // Coût d'achat des marchandises vendues
  extraFeesTotal: number;     // Frais supplémentaires produits & ventes
  grossProfit: number;        // Bénéfice brut = CA net - COGS - Frais supp.
  expensesTotal: number;      // Dépenses d'exploitation imputables
  netProfit: number;          // Bénéfice net estimé = Bénéfice brut - Dépenses
  grossMarginPercent: number;
  netMarginPercent: number;
  cashCollectedSales: number; // Encaissements directs + paiements partiels
  customerAdvances: number;   // Avances clients enregistrées
  netCashFlow: number;        // Trésorerie nette réelle (encaissements - remboursements - dépenses)
  dailyProfit: number;
  weeklyProfit: number;
  monthlyProfit: number;
  productBreakdowns: ProductProfitBreakdown[];
  saleBreakdowns: SaleProfitBreakdown[];
  mostProfitableProducts: ProductProfitBreakdown[];
  lowProfitProducts: ProductProfitBreakdown[];
  series: ProfitSeriesPoint[];
}

export function getPeriodBounds(
  period: ProfitPeriod,
  customStart?: string,
  customEnd?: string,
): {startMs: number; endMs: number} {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    return {startMs: start, endMs: endOfToday};
  }
  if (period === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0).getTime();
    return {startMs: start, endMs: endOfToday};
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    return {startMs: start, endMs: endOfToday};
  }
  if (period === 'custom') {
    const startMs = customStart ? new Date(`${customStart}T00:00:00`).getTime() : 0;
    const endMs = customEnd ? new Date(`${customEnd}T23:59:59.999`).getTime() : endOfToday;
    return {startMs: Number.isFinite(startMs) ? startMs : 0, endMs: Number.isFinite(endMs) ? endMs : endOfToday};
  }
  return {startMs: 0, endMs: Number.MAX_SAFE_INTEGER};
}

function computeSingleSaleStats(
  sale: Sale,
  productMap: Map<string, Product>,
  filterCategory?: string,
  filterProductId?: string,
): {
  revenueNet: number;
  grossRevenue: number;
  refunds: number;
  cogs: number;
  extraFees: number;
  grossProfit: number;
  itemResults: Array<{
    productId: string;
    productName: string;
    category: string;
    quantity: number;
    grossRevenue: number;
    discounts: number;
    cogs: number;
    extraFees: number;
  }>;
} {
  const refunded = Math.min(sale.total, Math.max(0, sale.refundedAmount ?? 0));
  const activeRatio = sale.total > 0 ? Math.max(0, (sale.total - refunded) / sale.total) : 1;

  const matchingItems = sale.items.filter((item) => {
    const prod = productMap.get(item.productId);
    const cat = prod?.category || 'Général';
    if (filterCategory && filterCategory !== 'ALL' && cat !== filterCategory) return false;
    if (filterProductId && filterProductId !== 'ALL' && item.productId !== filterProductId) return false;
    return true;
  });

  if (matchingItems.length === 0) {
    return {
      revenueNet: 0,
      grossRevenue: 0,
      refunds: 0,
      cogs: 0,
      extraFees: 0,
      grossProfit: 0,
      itemResults: [],
    };
  }

  let grossRevenue = 0;
  let cogs = 0;
  let itemFees = 0;
  const itemResults: Array<{
    productId: string;
    productName: string;
    category: string;
    quantity: number;
    grossRevenue: number;
    discounts: number;
    cogs: number;
    extraFees: number;
  }> = [];

  for (const item of matchingItems) {
    const prod = productMap.get(item.productId);
    const unitCost = item.costPrice ?? prod?.costPrice ?? 0;
    const unitFee = item.extraFees ?? prod?.extraFees ?? 0;

    const itemRev = item.lineTotal * activeRatio;
    const itemCogs = unitCost * item.quantity * activeRatio;
    const itemFeeTotal = unitFee * item.quantity * activeRatio;

    grossRevenue += item.lineTotal;
    cogs += itemCogs;
    itemFees += itemFeeTotal;

    itemResults.push({
      productId: item.productId,
      productName: item.productName,
      category: prod?.category || 'Général',
      quantity: item.quantity,
      grossRevenue: itemRev,
      discounts: item.discountApplied * item.quantity * activeRatio,
      cogs: itemCogs,
      extraFees: itemFeeTotal,
    });
  }

  const isFilteredByItem =
    (filterCategory && filterCategory !== 'ALL') ||
    (filterProductId && filterProductId !== 'ALL');

  const saleLevelFee = isFilteredByItem ? 0 : (sale.extraFees ?? 0) * activeRatio;
  const revenueNet = isFilteredByItem ? grossRevenue * activeRatio : Math.max(0, sale.total - refunded);
  const totalFees = itemFees + saleLevelFee;

  return {
    revenueNet,
    grossRevenue,
    refunds: isFilteredByItem ? grossRevenue * (1 - activeRatio) : refunded,
    cogs,
    extraFees: totalFees,
    grossProfit: revenueNet - cogs - totalFees,
    itemResults,
  };
}

export function calculateFinanceSummary(params: {
  sales: Sale[];
  products: Product[];
  expenses: Expense[];
  creditTransactions: CreditTransaction[];
  period: ProfitPeriod;
  customStart?: string;
  customEnd?: string;
  categoryFilter?: string;
  productFilter?: string;
}): FinanceSummary {
  const {
    sales,
    products,
    expenses,
    creditTransactions,
    period,
    customStart,
    customEnd,
    categoryFilter = 'ALL',
    productFilter = 'ALL',
  } = params;

  const productMap = new Map<string, Product>(products.map((p) => [p.id, p]));
  const {startMs, endMs} = getPeriodBounds(period, customStart, customEnd);

  // Quick fixed-window profits (always computed cleanly across all sales - expenses)
  const todayBounds = getPeriodBounds('today');
  const weekBounds = getPeriodBounds('week');
  const monthBounds = getPeriodBounds('month');

  const computeWindowNetProfit = (sMs: number, eMs: number): number => {
    let gross = 0;
    for (const sale of sales) {
      if (sale.createdAt < sMs || sale.createdAt > eMs) continue;
      gross += computeSingleSaleStats(sale, productMap).grossProfit;
    }
    let expTotal = 0;
    for (const exp of expenses) {
      const expMs = new Date(`${exp.date}T12:00:00`).getTime();
      if (expMs >= sMs && expMs <= eMs) expTotal += exp.amount;
    }
    return gross - expTotal;
  };

  const dailyProfit = computeWindowNetProfit(todayBounds.startMs, todayBounds.endMs);
  const weeklyProfit = computeWindowNetProfit(weekBounds.startMs, weekBounds.endMs);
  const monthlyProfit = computeWindowNetProfit(monthBounds.startMs, monthBounds.endMs);

  let grossSalesRevenue = 0;
  let refundsTotal = 0;
  let netRevenue = 0;
  let cogsTotal = 0;
  let extraFeesTotal = 0;
  let cashCollectedSales = 0;

  const productAgg = new Map<string, ProductProfitBreakdown>();
  const saleBreakdowns: SaleProfitBreakdown[] = [];
  const dayBuckets = new Map<string, ProfitSeriesPoint>();

  const seenSaleIds = new Set<string>();
  for (const sale of sales) {
    if (seenSaleIds.has(sale.id)) continue;
    seenSaleIds.add(sale.id);
    if (sale.createdAt < startMs || sale.createdAt > endMs) continue;

    const stats = computeSingleSaleStats(sale, productMap, categoryFilter, productFilter);
    if (stats.itemResults.length === 0) continue;

    grossSalesRevenue += stats.grossRevenue;
    refundsTotal += stats.refunds;
    netRevenue += stats.revenueNet;
    cogsTotal += stats.cogs;
    extraFeesTotal += stats.extraFees;

    const paid = sale.amountPaid ?? sale.total;
    const refunded = sale.refundedAmount ?? 0;
    if (categoryFilter === 'ALL' && productFilter === 'ALL') {
      cashCollectedSales += paid;
    }

    saleBreakdowns.push({
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      customerName: sale.customerName,
      createdAt: sale.createdAt,
      revenueNet: stats.revenueNet,
      cogs: stats.cogs,
      extraFees: stats.extraFees,
      grossProfit: stats.grossProfit,
      marginPercent: stats.revenueNet > 0 ? (stats.grossProfit / stats.revenueNet) * 100 : 0,
      amountPaid: paid,
      refundedAmount: refunded,
      remainingDebt: Math.max(0, sale.total - paid - refunded),
    });

    for (const ir of stats.itemResults) {
      const prev = productAgg.get(ir.productId) ?? {
        productId: ir.productId,
        productName: ir.productName,
        category: ir.category,
        quantitySold: 0,
        grossRevenue: 0,
        discountsGiven: 0,
        cogs: 0,
        extraFees: 0,
        grossProfit: 0,
        marginPercent: 0,
      };
      prev.quantitySold += ir.quantity;
      prev.grossRevenue += ir.grossRevenue;
      prev.discountsGiven += ir.discounts;
      prev.cogs += ir.cogs;
      prev.extraFees += ir.extraFees;
      prev.grossProfit = prev.grossRevenue - prev.cogs - prev.extraFees;
      prev.marginPercent = prev.grossRevenue > 0 ? (prev.grossProfit / prev.grossRevenue) * 100 : 0;
      productAgg.set(ir.productId, prev);
    }

    const d = new Date(sale.createdAt);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = dayBuckets.get(dayKey) ?? {
      key: dayKey,
      label: new Intl.DateTimeFormat('fr-FR', {day: '2-digit', month: 'short'}).format(d),
      revenue: 0,
      grossProfit: 0,
      expenses: 0,
      netProfit: 0,
    };
    bucket.revenue += stats.revenueNet;
    bucket.grossProfit += stats.grossProfit;
    dayBuckets.set(dayKey, bucket);
  }

  // Expenses (only deducted at full-business level; never double counted)
  let expensesTotal = 0;
  const seenExpenseIds = new Set<string>();
  const isItemFiltered = categoryFilter !== 'ALL' || productFilter !== 'ALL';

  if (!isItemFiltered) {
    for (const exp of expenses) {
      if (seenExpenseIds.has(exp.id)) continue;
      seenExpenseIds.add(exp.id);
      const expMs = new Date(`${exp.date}T12:00:00`).getTime();
      if (expMs < startMs || expMs > endMs) continue;
      expensesTotal += exp.amount;

      const bucket = dayBuckets.get(exp.date) ?? {
        key: exp.date,
        label: new Intl.DateTimeFormat('fr-FR', {day: '2-digit', month: 'short'}).format(
          new Date(`${exp.date}T12:00:00`),
        ),
        revenue: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
      };
      bucket.expenses += exp.amount;
      dayBuckets.set(exp.date, bucket);
    }
  }

  // Advances & unlinked partial payments/refunds from credit ledger within period
  let customerAdvances = 0;
  let unlinkedPayments = 0;
  let unlinkedRefunds = 0;
  if (!isItemFiltered) {
    for (const tx of creditTransactions) {
      if (tx.createdAt < startMs || tx.createdAt > endMs) continue;
      if (tx.type === 'advance') {
        customerAdvances += tx.amount;
      } else if (tx.type === 'partial_payment' && !tx.saleId) {
        unlinkedPayments += tx.amount;
      } else if (tx.type === 'refund' && !tx.saleId) {
        unlinkedRefunds += tx.amount;
      }
    }
  }

  const grossProfit = netRevenue - cogsTotal - extraFeesTotal;
  const netProfit = grossProfit - expensesTotal;
  const grossMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const netMarginPercent = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  // Cash collected across all receipts (never confused with netRevenue)
  const totalCashIn = cashCollectedSales + customerAdvances + unlinkedPayments;
  const totalCashOut = refundsTotal + unlinkedRefunds + expensesTotal;
  const netCashFlow = totalCashIn - totalCashOut;

  const productBreakdowns = Array.from(productAgg.values()).sort(
    (a, b) => b.grossProfit - a.grossProfit,
  );
  const mostProfitableProducts = productBreakdowns.slice(0, 5);
  const lowProfitProducts = [...productBreakdowns]
    .sort((a, b) => a.grossProfit - b.grossProfit)
    .slice(0, 5);

  const series = Array.from(dayBuckets.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((pt) => ({
      ...pt,
      netProfit: pt.grossProfit - pt.expenses,
    }));

  return {
    grossSalesRevenue,
    refundsTotal,
    netRevenue,
    cogsTotal,
    extraFeesTotal,
    grossProfit,
    expensesTotal,
    netProfit,
    grossMarginPercent,
    netMarginPercent,
    cashCollectedSales: totalCashIn,
    customerAdvances,
    netCashFlow,
    dailyProfit,
    weeklyProfit,
    monthlyProfit,
    productBreakdowns,
    saleBreakdowns,
    mostProfitableProducts,
    lowProfitProducts,
    series,
  };
}
