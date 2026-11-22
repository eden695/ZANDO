import {CreditTransaction, Customer} from '../types/commerce';

export interface CustomerCreditSummary {
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalCreditTaken: number;
  totalPayments: number;
  totalAdvances: number;
  totalRefunds: number;
  netBalance: number; // > 0 = client doit de l'argent ; < 0 = client a une avance ; 0 = soldé
  isOverdue: boolean;
  oldestDueDate?: string;
  lastActivityAt: number;
  transactions: CreditTransaction[];
}

export interface GlobalCreditKPIs {
  totalCreditIssued: number;
  totalAdvances: number;
  totalRecovered: number;
  totalRemainingToRecover: number;
  debtorCount: number;
  overdueCount: number;
  settledCount: number;
}

export function computeCreditSummaries(
  customers: Customer[],
  transactions: CreditTransaction[],
): {summaries: CustomerCreditSummary[]; kpis: GlobalCreditKPIs} {
  const byCustomer = new Map<string, CreditTransaction[]>();
  const customerMap = new Map<string, Customer>(customers.map((c) => [c.id, c]));

  for (const tx of transactions) {
    const list = byCustomer.get(tx.customerId) ?? [];
    list.push(tx);
    byCustomer.set(tx.customerId, list);
  }

  // Ensure every customer with at least 1 credit transaction appears
  const allCustomerIds = new Set<string>([
    ...customers.map((c) => c.id),
    ...Array.from(byCustomer.keys()),
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const summaries: CustomerCreditSummary[] = [];

  let totalCreditIssued = 0;
  let totalAdvances = 0;
  let totalRecovered = 0;
  let totalRemainingToRecover = 0;
  let debtorCount = 0;
  let overdueCount = 0;
  let settledCount = 0;

  for (const cid of allCustomerIds) {
    const txs = (byCustomer.get(cid) ?? []).sort((a, b) => a.createdAt - b.createdAt);
    if (txs.length === 0) continue;

    const cust = customerMap.get(cid);
    const customerName = cust?.name || txs[txs.length - 1].customerName;
    const customerPhone = cust?.phone || txs[txs.length - 1].customerPhone;

    let creditTaken = 0;
    let payments = 0;
    let advances = 0;
    let refunds = 0;
    let balance = 0;
    let oldestDueDate: string | undefined;

    for (const tx of txs) {
      if (tx.type === 'credit_sale') {
        creditTaken += tx.amount;
      } else if (tx.type === 'partial_payment') {
        payments += tx.amount;
      } else if (tx.type === 'advance') {
        advances += tx.amount;
      } else if (tx.type === 'refund') {
        refunds += tx.amount;
      }

      if (tx.direction === 'debt_increase') {
        balance += tx.amount;
      } else {
        balance -= tx.amount;
      }

      if (tx.type === 'credit_sale' && tx.dueDate) {
        if (!oldestDueDate || tx.dueDate < oldestDueDate) {
          oldestDueDate = tx.dueDate;
        }
      }
    }

    const isOverdue = balance > 0 && Boolean(oldestDueDate && oldestDueDate < todayStr);
    const lastActivityAt = txs[txs.length - 1].createdAt;

    totalCreditIssued += creditTaken;
    totalAdvances += advances;
    totalRecovered += payments;

    if (balance > 0) {
      totalRemainingToRecover += balance;
      debtorCount += 1;
      if (isOverdue) overdueCount += 1;
    } else if (balance === 0 && creditTaken > 0) {
      settledCount += 1;
    }

    summaries.push({
      customerId: cid,
      customerName,
      customerPhone,
      totalCreditTaken: creditTaken,
      totalPayments: payments,
      totalAdvances: advances,
      totalRefunds: refunds,
      netBalance: balance,
      isOverdue,
      oldestDueDate,
      lastActivityAt,
      transactions: [...txs].reverse(),
    });
  }

  summaries.sort((a, b) => b.netBalance - a.netBalance || b.lastActivityAt - a.lastActivityAt);

  return {
    summaries,
    kpis: {
      totalCreditIssued,
      totalAdvances,
      totalRecovered,
      totalRemainingToRecover,
      debtorCount,
      overdueCount,
      settledCount,
    },
  };
}
