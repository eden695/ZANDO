import React, {useMemo, useState} from 'react';
import {
  AlertCircle,
  MessageCircle,
  Plus,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {ModernSelect} from '../components/ModernSelect';
import {SheetModal} from '../components/SheetModal';
import {useStore} from '../context/StoreContext';
import {openWhatsAppChat} from '../services/androidShareService';
import {computeCreditSummaries, CustomerCreditSummary} from '../services/creditEngine';
import {CreditTransaction, CreditTransactionType} from '../types/commerce';
import {formatDateTime, formatMoney, generateId} from '../utils/format';

const TX_LABELS: Record<CreditTransactionType, string> = {
  credit_sale: 'Vente à crédit',
  partial_payment: 'Paiement partiel',
  advance: 'Avance client',
  refund: 'Remboursement',
  correction: 'Correction traçable',
};

export const CreditsModule: React.FC = () => {
  const {
    customers,
    creditTransactions,
    sales,
    storeProfile,
    saveCustomer,
    addCreditTransaction,
    notify,
  } = useStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'debtors' | 'overdue' | 'advances' | 'settled'>(
    'all',
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // New operation modal
  const [opModalOpen, setOpModalOpen] = useState(false);
  const [opCustomerId, setOpCustomerId] = useState('');
  const [opNewName, setOpNewName] = useState('');
  const [opNewPhone, setOpNewPhone] = useState('');
  const [opType, setOpType] = useState<CreditTransactionType>('partial_payment');
  const [opDirection, setOpDirection] = useState<'debt_increase' | 'debt_decrease'>('debt_decrease');
  const [opAmount, setOpAmount] = useState('');
  const [opSaleId, setOpSaleId] = useState('');
  const [opDueDate, setOpDueDate] = useState('');
  const [opNote, setOpNote] = useState('');
  const [opRefTxId, setOpRefTxId] = useState('');

  const {summaries, kpis} = useMemo(
    () => computeCreditSummaries(customers, creditTransactions),
    [customers, creditTransactions],
  );

  const selectedSummary: CustomerCreditSummary | null = useMemo(
    () => summaries.find((s) => s.customerId === selectedCustomerId) ?? null,
    [summaries, selectedCustomerId],
  );

  const filteredSummaries = useMemo(() => {
    const q = search.toLowerCase().trim();
    return summaries.filter((s) => {
      if (filter === 'debtors' && s.netBalance <= 0) return false;
      if (filter === 'overdue' && !s.isOverdue) return false;
      if (filter === 'advances' && s.netBalance >= 0) return false;
      if (filter === 'settled' && s.netBalance !== 0) return false;
      if (!q) return true;
      return `${s.customerName} ${s.customerPhone}`.toLowerCase().includes(q);
    });
  }, [summaries, filter, search]);

  const openOperationModal = (
    presetCustomerId?: string,
    presetType: CreditTransactionType = 'partial_payment',
    refTxId = '',
  ) => {
    setOpCustomerId(presetCustomerId ?? (customers[0]?.id || 'NEW'));
    setOpNewName('');
    setOpNewPhone('');
    setOpType(presetType);
    setOpDirection(
      presetType === 'credit_sale' || presetType === 'refund' ? 'debt_increase' : 'debt_decrease',
    );
    setOpAmount('');
    setOpSaleId('');
    setOpDueDate('');
    setOpNote('');
    setOpRefTxId(refTxId);
    setOpModalOpen(true);
  };

  const handleOpTypeChange = (nextType: CreditTransactionType) => {
    setOpType(nextType);
    if (nextType === 'credit_sale' || nextType === 'refund') {
      setOpDirection('debt_increase');
    } else if (nextType === 'partial_payment' || nextType === 'advance') {
      setOpDirection('debt_decrease');
    }
  };

  const handleSaveOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(opAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Veuillez saisir un montant valide supérieur à 0.', 'error');
      return;
    }

    if (opType === 'correction' && !opNote.trim()) {
      notify('Une correction traçable nécessite une note explicative.', 'error');
      return;
    }

    let targetId = opCustomerId;
    let targetName = '';
    let targetPhone = '';

    if (targetId === 'NEW' || !targetId) {
      if (!opNewName.trim()) {
        notify('Veuillez indiquer le nom du client.', 'error');
        return;
      }
      targetId = generateId('cust');
      targetName = opNewName.trim();
      targetPhone = opNewPhone.trim();
      await saveCustomer({
        id: targetId,
        name: targetName,
        phone: targetPhone,
        email: '',
        address: '',
        channel: 'WhatsApp',
        notes: 'Créé depuis Crédits Clients',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      const cust = customers.find((c) => c.id === targetId);
      targetName = cust?.name ?? 'Client';
      targetPhone = cust?.phone ?? '';
    }

    const linkedSale = opSaleId ? sales.find((s) => s.id === opSaleId) : undefined;

    const entry: CreditTransaction = {
      id: generateId('crd'),
      customerId: targetId,
      customerName: targetName,
      customerPhone: targetPhone,
      type: opType,
      amount,
      direction: opDirection,
      saleId: linkedSale?.id,
      receiptNumber: linkedSale?.receiptNumber,
      dueDate: opDueDate || undefined,
      note: opNote.trim() || TX_LABELS[opType],
      referenceTransactionId: opRefTxId || undefined,
      createdAt: Date.now(),
    };

    await addCreditTransaction(entry);
    setOpModalOpen(false);
    setSelectedCustomerId(targetId);
    notify(`${TX_LABELS[opType]} enregistré(e) dans le journal financier.`, 'success');
  };

  const sendWhatsAppReminder = async (summary: CustomerCreditSummary) => {
    const overdueTxt = summary.isOverdue && summary.oldestDueDate
      ? ` (échéance dépassée depuis le ${summary.oldestDueDate})`
      : '';
    const msg = `Bonjour ${summary.customerName},\nPetit rappel amical de la part de *${storeProfile.name}* concernant votre solde en cours de *${formatMoney(summary.netBalance, storeProfile.currency)}*${overdueTxt}.\nMerci de nous confirmer votre prochain règlement. À bientôt !`;
    const res = await openWhatsAppChat(summary.customerPhone, msg);
    notify(res.message, res.offline ? 'error' : 'info');
  };

  return (
    <div className="space-y-5">
      {/* 5 Global Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 tabular-nums">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Total des créances</div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {formatMoney(kpis.totalCreditIssued, storeProfile.currency)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Total récupéré</div>
          <div className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {formatMoney(kpis.totalRecovered, storeProfile.currency)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Restant à récupérer</div>
          <div className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">
            {formatMoney(kpis.totalRemainingToRecover, storeProfile.currency)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Total des avances</div>
          <div className="mt-1 text-lg font-bold text-sky-700 dark:text-sky-400">
            {formatMoney(kpis.totalAdvances, storeProfile.currency)}
          </div>
        </div>
        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Clients endettés</div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {kpis.debtorCount}
            {kpis.overdueCount > 0 && (
              <span className="ml-2 text-xs text-rose-600 dark:text-rose-400">
                ({kpis.overdueCount} en retard)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Search + Primary Action */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client par nom ou téléphone..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => openOperationModal(undefined, 'partial_payment')}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          style={{
            backgroundColor: 'var(--brand-accent, #059669)',
            color: 'var(--brand-accent-fg, #FFFFFF)',
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle opération crédit</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            ['all', `Tous (${summaries.length})`],
            ['debtors', `Endettés (${kpis.debtorCount})`],
            ['overdue', `En retard (${kpis.overdueCount})`],
            ['advances', 'Avances'],
            ['settled', `Soldés (${kpis.settledCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
              filter === key
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Customer Financial List */}
      {filteredSummaries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
          Aucun compte crédit ou avance client enregistré pour ces critères.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSummaries.map((s) => (
            <article
              key={s.customerId}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div
                onClick={() => setSelectedCustomerId(s.customerId)}
                className="min-w-0 flex-1 cursor-pointer"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    {s.customerName}
                  </span>
                  {s.customerPhone && (
                    <span className="text-slate-500">{s.customerPhone}</span>
                  )}
                  {s.isOverdue && (
                    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Retard ({s.oldestDueDate})
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  Crédits : {formatMoney(s.totalCreditTaken, storeProfile.currency)} · Payé :{' '}
                  {formatMoney(s.totalPayments, storeProfile.currency)} · Avances :{' '}
                  {formatMoney(s.totalAdvances, storeProfile.currency)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0 tabular-nums">
                <div className="text-right mr-2">
                  <div className="text-[11px] text-slate-500">
                    {s.netBalance > 0
                      ? 'Reste à payer'
                      : s.netBalance < 0
                        ? 'Avance disponible'
                        : 'Compte soldé'}
                  </div>
                  <div
                    className={`text-base font-bold ${
                      s.netBalance > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : s.netBalance < 0
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatMoney(Math.abs(s.netBalance), storeProfile.currency)}
                  </div>
                </div>

                {s.netBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => sendWhatsAppReminder(s)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Rappel WhatsApp</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedCustomerId(s.customerId)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  Historique ({s.transactions.length})
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Immutable Ledger Detail Modal */}
      <SheetModal
        open={!!selectedSummary}
        onClose={() => setSelectedCustomerId(null)}
        title={`Historique financier : ${selectedSummary?.customerName ?? ''}`}
        maxWidthClass="max-w-2xl"
      >
        {selectedSummary && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-4 flex flex-wrap items-center justify-between gap-3 tabular-nums">
              <div>
                <div className="text-xs text-slate-500">Solde actuel</div>
                <div className="text-lg font-bold">
                  {selectedSummary.netBalance > 0
                    ? `Doit ${formatMoney(selectedSummary.netBalance, storeProfile.currency)}`
                    : selectedSummary.netBalance < 0
                      ? `Avance de ${formatMoney(Math.abs(selectedSummary.netBalance), storeProfile.currency)}`
                      : 'Soldé (0)'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openOperationModal(selectedSummary.customerId, 'partial_payment')}
                  className="min-h-[40px] px-3 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--brand-accent, #059669)',
                    color: 'var(--brand-accent-fg, #FFFFFF)',
                  }}
                >
                  + Paiement partiel
                </button>
                <button
                  type="button"
                  onClick={() => openOperationModal(selectedSummary.customerId, 'advance')}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  + Avance
                </button>
                <button
                  type="button"
                  onClick={() => openOperationModal(selectedSummary.customerId, 'refund')}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Remboursement
                </button>
                {selectedSummary.netBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => sendWhatsAppReminder(selectedSummary)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Rappel</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Journal financier immuable : aucune écriture ne peut être effacée silencieusement. Utilisez « Corriger » pour ajouter une écriture compensatoire traçable.
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
              {selectedSummary.transactions.map((tx) => (
                <div key={tx.id} className="p-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {TX_LABELS[tx.type]}
                      {tx.receiptNumber && (
                        <span className="ml-2 font-mono text-slate-500">{tx.receiptNumber}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {formatDateTime(tx.createdAt)}
                      {tx.dueDate && ` · Échéance ${tx.dueDate}`}
                    </div>
                    {tx.note && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        {tx.note}
                      </div>
                    )}
                    {tx.referenceTransactionId && (
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Réf. correction : {tx.referenceTransactionId}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0 space-y-1 tabular-nums">
                    <div
                      className={`text-sm font-bold ${
                        tx.direction === 'debt_increase'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {tx.direction === 'debt_increase' ? '+' : '-'}
                      {formatMoney(tx.amount, storeProfile.currency)}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openOperationModal(selectedSummary.customerId, 'correction', tx.id)
                      }
                      className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer"
                    >
                      Corriger
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetModal>

      {/* New Ledger Operation Modal */}
      <SheetModal
        open={opModalOpen}
        onClose={() => setOpModalOpen(false)}
        title="Nouvelle opération de crédit / avance"
      >
        <form onSubmit={handleSaveOperation} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Client *</label>
            <ModernSelect
              value={opCustomerId}
              onChange={setOpCustomerId}
              searchable
              searchPlaceholder="Rechercher un client..."
              ariaLabel="Client"
              options={[
                {value: 'NEW', label: '-- Nouveau client --'},
                ...customers.map((c) => ({
                  value: c.id,
                  label: c.name,
                  hint: c.phone || c.channel,
                })),
              ]}
            />
          </div>

          {opCustomerId === 'NEW' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Nom du client *</label>
                <input
                  type="text"
                  required
                  value={opNewName}
                  onChange={(e) => setOpNewName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Téléphone WhatsApp</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={opNewPhone}
                  onChange={(e) => setOpNewPhone(e.target.value)}
                  placeholder="+243..."
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Type d’opération</label>
              <ModernSelect
                value={opType}
                onChange={(val) => handleOpTypeChange(val as CreditTransactionType)}
                ariaLabel="Type d’opération"
                options={[
                  {value: 'partial_payment', label: 'Paiement partiel reçu'},
                  {value: 'advance', label: 'Avance déposée par le client'},
                  {value: 'credit_sale', label: 'Nouvelle créance manuelle'},
                  {value: 'refund', label: 'Remboursement client'},
                  {value: 'correction', label: 'Correction traçable'},
                ]}
              />
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
                value={opAmount}
                onChange={(e) => setOpAmount(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
          </div>

          {opType === 'correction' && (
            <div>
              <label className="block text-xs font-semibold mb-1">Sens de la correction</label>
              <ModernSelect
                value={opDirection}
                onChange={(val) =>
                  setOpDirection(val as 'debt_increase' | 'debt_decrease')
                }
                ariaLabel="Sens de la correction"
                options={[
                  {value: 'debt_decrease', label: 'Réduire le solde dû (-)'},
                  {value: 'debt_increase', label: 'Augmenter le solde dû (+)'},
                ]}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Vente associée (optionnel)</label>
              <ModernSelect
                value={opSaleId}
                onChange={setOpSaleId}
                searchable
                searchPlaceholder="Rechercher un reçu..."
                ariaLabel="Vente associée"
                options={[
                  {value: '', label: '-- Aucune vente liée --'},
                  ...sales.map((s) => ({
                    value: s.id,
                    label: `${s.receiptNumber} · ${s.customerName}`,
                    badge: formatMoney(s.total, storeProfile.currency),
                  })),
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Échéance (optionnel)</label>
              <input
                type="date"
                value={opDueDate}
                onChange={(e) => setOpDueDate(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">
              Note / commentaire {opType === 'correction' ? '*' : ''}
            </label>
            <input
              type="text"
              required={opType === 'correction'}
              value={opNote}
              onChange={(e) => setOpNote(e.target.value)}
              placeholder="Référence Mobile Money, motif de remboursement ou correction..."
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setOpModalOpen(false)}
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
              Valider l’opération
            </button>
          </div>
        </form>
      </SheetModal>
    </div>
  );
};
