import React, {useEffect, useMemo, useState} from 'react';
import {
  Copy,
  MessageCircle,
  Minus,
  Plus,
  Receipt,
  Search,
  Trash2,
} from 'lucide-react';
import {ModernSelect} from '../components/ModernSelect';
import {SheetModal} from '../components/SheetModal';
import {useStore} from '../context/StoreContext';
import {copyTextSafely, openWhatsAppChat} from '../services/androidShareService';
import {PaymentMethod, Sale, SaleItem, SalesChannel} from '../types/commerce';
import {
  formatDateTime,
  formatMoney,
  generateId,
  getEffectiveProductPrice,
} from '../utils/format';

interface SalesModuleProps {
  openCreateTrigger?: number;
  onConsumeCreateTrigger?: () => void;
}

export const SalesModule: React.FC<SalesModuleProps> = ({
  openCreateTrigger = 0,
  onConsumeCreateTrigger,
}) => {
  const {sales, products, customers, promotions, storeProfile, addSale, removeSale, notify} =
    useStore();

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [posOpen, setPosOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // POS State
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [channel, setChannel] = useState<SalesChannel>('WhatsApp');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Espèces');
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial' | 'credit'>('full');
  const [amountPaidNow, setAmountPaidNow] = useState('');
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [extraFees, setExtraFees] = useState('0');
  const [notes, setNotes] = useState('');
  const [posSearch, setPosSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openPosModal = () => {
    setCart({});
    setCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    setChannel('WhatsApp');
    setPaymentMethod('Espèces');
    setPaymentMode('full');
    setAmountPaidNow('');
    setExtraFees('0');
    setNotes('');
    setPosSearch('');
    setPosOpen(true);
  };

  // Only opens when explicitly triggered by "Nouvelle vente / Vente rapide", and immediately consumes trigger
  useEffect(() => {
    if (openCreateTrigger > 0) {
      openPosModal();
      onConsumeCreateTrigger?.();
    }
  }, [openCreateTrigger, onConsumeCreateTrigger]);

  const filteredSales = useMemo(() => {
    const q = search.toLowerCase().trim();
    return sales.filter((s) => {
      if (channelFilter !== 'ALL' && s.channel !== channelFilter) return false;
      if (!q) return true;
      return `${s.receiptNumber} ${s.customerName} ${s.customerPhone} ${s.paymentMethod}`
        .toLowerCase()
        .includes(q);
    });
  }, [sales, search, channelFilter]);

  const posProducts = useMemo(() => {
    const q = posSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.isActive &&
        (!q || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q)),
    );
  }, [products, posSearch]);

  const cartSummary = useMemo(() => {
    const items: SaleItem[] = [];
    let subtotal = 0;
    let discountTotal = 0;
    let total = 0;

    for (const [productId, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const product = products.find((p) => p.id === productId);
      if (!product) continue;
      const pricing = getEffectiveProductPrice(product, promotions);
      const lineSub = pricing.originalPrice * qty;
      const lineFinal = pricing.finalPrice * qty;
      const lineDiscount = lineSub - lineFinal;

      subtotal += lineSub;
      discountTotal += lineDiscount;
      total += lineFinal;

      items.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        unitPrice: pricing.finalPrice,
        originalPrice: pricing.originalPrice,
        costPrice: product.costPrice,
        extraFees: product.extraFees ?? 0,
        discountApplied: pricing.discountAmount,
        lineTotal: lineFinal,
      });
    }

    return {items, subtotal, discountTotal, total};
  }, [cart, products, promotions]);

  const handleCustomerPick = (id: string) => {
    setCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone);
      setChannel(found.channel);
    }
  };

  const adjustCart = (productId: string, delta: number) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[productId] || 0) + delta);
      if (next === 0) {
        const copy = {...prev};
        delete copy[productId];
        return copy;
      }
      return {...prev, [productId]: next};
    });
  };

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartSummary.items.length === 0) {
      notify('Sélectionnez au moins un produit pour enregistrer la vente.', 'error');
      return;
    }

    const paidNow =
      paymentMode === 'full'
        ? cartSummary.total
        : paymentMode === 'credit'
          ? 0
          : Math.min(cartSummary.total, Math.max(0, Number(amountPaidNow) || 0));

    if (paidNow < cartSummary.total && !customerName.trim()) {
      notify('Indiquez le nom du client pour une vente à crédit ou paiement partiel.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const sale: Sale = {
        id: generateId('sale'),
        receiptNumber: `FAC-${Math.floor(1000 + Math.random() * 9000)}`,
        customerId: customerId || undefined,
        customerName: customerName.trim() || 'Client comptoir',
        customerPhone: customerPhone.trim(),
        channel,
        paymentMethod: paymentMode === 'credit' ? 'Crédit' : paymentMethod,
        paymentStatus:
          paidNow >= cartSummary.total ? 'paid' : paidNow > 0 ? 'partial' : 'credit',
        amountPaid: paidNow,
        refundedAmount: 0,
        extraFees: Math.max(0, Number(extraFees) || 0),
        dueDate: paidNow < cartSummary.total ? dueDate : undefined,
        items: cartSummary.items,
        subtotal: cartSummary.subtotal,
        discountTotal: cartSummary.discountTotal,
        total: cartSummary.total,
        notes: notes.trim(),
        createdAt: Date.now(),
      };
      await addSale(sale);
      setPosOpen(false);
      setSelectedSale(sale);
      notify(
        paidNow < cartSummary.total
          ? `Vente ${sale.receiptNumber} enregistrée (créance créée dans Crédits Clients).`
          : `Vente ${sale.receiptNumber} enregistrée et stock mis à jour.`,
        'success',
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur lors de la vente.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const buildReceiptText = (sale: Sale): string => {
    const paid = sale.amountPaid ?? sale.total;
    const debt = Math.max(0, sale.total - paid - (sale.refundedAmount ?? 0));
    const lines = [
      `*Reçu ${sale.receiptNumber} — ${storeProfile.name}*`,
      `Date : ${formatDateTime(sale.createdAt)}`,
      `Client : ${sale.customerName}`,
      '',
      ...sale.items.map(
        (i) => `- ${i.quantity}x ${i.productName} : ${formatMoney(i.lineTotal, storeProfile.currency)}`,
      ),
      '',
      `Total facture : *${formatMoney(sale.total, storeProfile.currency)}*`,
      `Payé (${sale.paymentMethod}) : ${formatMoney(paid, storeProfile.currency)}`,
      debt > 0 ? `Reste dû : *${formatMoney(debt, storeProfile.currency)}*` : '',
      storeProfile.phone ? `Contact boutique : ${storeProfile.phone}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  };

  const totalRevenueFiltered = filteredSales.reduce((acc, s) => acc + s.total, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par numéro de reçu, client ou téléphone..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={openPosModal}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          style={{
            backgroundColor: 'var(--brand-accent, #059669)',
            color: 'var(--brand-accent-fg, #FFFFFF)',
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle vente</span>
        </button>
      </div>

      {/* Summary & Channel Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['ALL', 'WhatsApp', 'Instagram', 'Facebook', 'Boutique', 'Autre'].map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannelFilter(ch)}
              className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
                channelFilter === ch
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {ch === 'ALL' ? 'Tous canaux' : ch}
            </button>
          ))}
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
          Total affiché :{' '}
          <strong className="text-slate-900 dark:text-white">
            {formatMoney(totalRevenueFiltered, storeProfile.currency)}
          </strong>
        </div>
      </div>

      {/* Sales List */}
      {filteredSales.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aucune vente enregistrée pour ces critères.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {filteredSales.map((sale) => {
            const paid = sale.amountPaid ?? sale.total;
            const remaining = Math.max(0, sale.total - paid - (sale.refundedAmount ?? 0));
            return (
              <div
                key={sale.id}
                onClick={() => setSelectedSale(sale)}
                className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      {sale.receiptNumber}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {sale.channel} · {sale.paymentMethod}
                    </span>
                    {remaining > 0 && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          Reste dû {formatMoney(remaining, storeProfile.currency)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white truncate">
                    {sale.customerName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {sale.items.length} article{sale.items.length > 1 ? 's' : ''} · {formatDateTime(sale.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right tabular-nums">
                    <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      {formatMoney(sale.total, storeProfile.currency)}
                    </div>
                    {sale.discountTotal > 0 && (
                      <div className="text-xs text-emerald-600 dark:text-emerald-400">
                        -{formatMoney(sale.discountTotal, storeProfile.currency)} promo
                      </div>
                    )}
                  </div>
                  <Receipt className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* POS / New Sale Full-Screen Modal */}
      <SheetModal
        open={posOpen}
        onClose={() => setPosOpen(false)}
        title="Nouvelle vente — Caisse"
        fullScreen
      >
        <form id="pos-form" onSubmit={handleSaveSale} className="max-w-5xl mx-auto space-y-5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              placeholder="Ajouter un produit par nom ou référence..."
              className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {posProducts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                Aucun produit actif disponible. Créez d’abord un produit.
              </div>
            ) : (
              posProducts.map((product) => {
                const qty = cart[product.id] || 0;
                const pricing = getEffectiveProductPrice(product, promotions);
                return (
                  <div
                    key={product.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {product.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatMoney(pricing.finalPrice, storeProfile.currency)}
                        {pricing.promoLabel ? ` (${pricing.promoLabel})` : ''} · Stock : {product.stock}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {qty > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => adjustCart(product.id, -1)}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold tabular-nums">{qty}</span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => adjustCart(product.id, 1)}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg cursor-pointer"
                        style={{
                          backgroundColor: 'var(--brand-accent, #059669)',
                          color: 'var(--brand-accent-fg, #FFFFFF)',
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Customer & Channel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Client existant (optionnel)
              </label>
              <ModernSelect
                value={customerId}
                onChange={handleCustomerPick}
                searchable
                searchPlaceholder="Chercher un client..."
                options={[
                  {value: '', label: 'Client comptoir / nouveau'},
                  ...customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                    hint: c.phone || undefined,
                  })),
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nom du client {paymentMode !== 'full' ? '*' : ''}
              </label>
              <input
                type="text"
                required={paymentMode !== 'full'}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Client comptoir"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Téléphone / WhatsApp
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+243..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Canal
                </label>
                <ModernSelect
                  value={channel}
                  onChange={(val) => setChannel(val as SalesChannel)}
                  options={[
                    {value: 'WhatsApp', label: 'WhatsApp'},
                    {value: 'Instagram', label: 'Instagram'},
                    {value: 'Facebook', label: 'Facebook'},
                    {value: 'Boutique', label: 'Boutique'},
                    {value: 'Autre', label: 'Autre'},
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mode règlement
                </label>
                <ModernSelect
                  value={paymentMode}
                  onChange={(val) =>
                    setPaymentMode(val as 'full' | 'partial' | 'credit')
                  }
                  options={[
                    {value: 'full', label: 'Comptant (100%)'},
                    {value: 'partial', label: 'Paiement partiel'},
                    {value: 'credit', label: 'À crédit (0 payé)'},
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Payment Method + Partial / Credit Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {paymentMode !== 'credit' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Moyen de paiement</label>
                <ModernSelect
                  value={paymentMethod}
                  onChange={(val) => setPaymentMethod(val as PaymentMethod)}
                  options={[
                    {value: 'Espèces', label: 'Espèces'},
                    {value: 'Mobile Money', label: 'Mobile Money'},
                    {value: 'Virement', label: 'Virement'},
                    {value: 'Carte', label: 'Carte'},
                  ]}
                />
              </div>
            )}

            {paymentMode === 'partial' && (
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Acompte encaissé ({storeProfile.currency}) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={cartSummary.total}
                  required
                  value={amountPaidNow}
                  onChange={(e) => setAmountPaidNow(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
                />
              </div>
            )}

            {paymentMode !== 'full' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Échéance du solde</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">
                Frais supp. vendeur ({storeProfile.currency})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={extraFees}
                onChange={(e) => setExtraFees(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Note de vente
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Livraison, remise manuelle, référence paiement..."
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between tabular-nums">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <div>{cartSummary.items.reduce((a, i) => a + i.quantity, 0)} article(s)</div>
              {cartSummary.discountTotal > 0 && (
                <div className="text-emerald-600 dark:text-emerald-400">
                  Remises appliquées : -{formatMoney(cartSummary.discountTotal, storeProfile.currency)}
                </div>
              )}
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              Total : {formatMoney(cartSummary.total, storeProfile.currency)}
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setPosOpen(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || cartSummary.items.length === 0}
              className="min-h-[44px] px-5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--brand-accent, #059669)',
                color: 'var(--brand-accent-fg, #FFFFFF)',
              }}
            >
              {submitting ? 'Validation...' : 'Valider la vente'}
            </button>
          </div>
        </form>
      </SheetModal>

      {/* Receipt Detail Modal */}
      <SheetModal
        open={!!selectedSale}
        onClose={() => setSelectedSale(null)}
        title={`Reçu ${selectedSale?.receiptNumber ?? ''}`}
        maxWidthClass="max-w-lg"
      >
        {selectedSale && (
          <div className="space-y-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {formatDateTime(selectedSale.createdAt)} · {selectedSale.channel} · {selectedSale.paymentMethod}
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              Client : {selectedSale.customerName}{' '}
              {selectedSale.customerPhone && `(${selectedSale.customerPhone})`}
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
              {selectedSale.items.map((item, idx) => (
                <div key={idx} className="py-2.5 flex justify-between gap-2 text-sm tabular-nums">
                  <span>
                    {item.quantity} × {item.productName}
                  </span>
                  <span className="font-semibold">
                    {formatMoney(item.lineTotal, storeProfile.currency)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1 tabular-nums text-sm">
              <div className="flex justify-between font-bold text-base text-slate-900 dark:text-white">
                <span>Total facture</span>
                <span>{formatMoney(selectedSale.total, storeProfile.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Encaissé à ce jour</span>
                <span>
                  {formatMoney(selectedSale.amountPaid ?? selectedSale.total, storeProfile.currency)}
                </span>
              </div>
              {Math.max(
                0,
                selectedSale.total -
                  (selectedSale.amountPaid ?? selectedSale.total) -
                  (selectedSale.refundedAmount ?? 0),
              ) > 0 && (
                <div className="flex justify-between font-bold text-amber-600 dark:text-amber-400">
                  <span>Reste dû</span>
                  <span>
                    {formatMoney(
                      selectedSale.total -
                        (selectedSale.amountPaid ?? selectedSale.total) -
                        (selectedSale.refundedAmount ?? 0),
                      storeProfile.currency,
                    )}
                  </span>
                </div>
              )}
            </div>

            {selectedSale.notes && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Note : {selectedSale.notes}
              </p>
            )}

            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await openWhatsAppChat(
                    selectedSale.customerPhone,
                    buildReceiptText(selectedSale),
                  );
                  notify(res.message, res.offline ? 'error' : 'info');
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Envoyer sur WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await copyTextSafely(buildReceiptText(selectedSale));
                  notify('Reçu copié dans le presse-papiers.', 'success');
                }}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>Copier</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await removeSale(selectedSale.id);
                  setSelectedSale(null);
                  notify('Vente supprimée de l’historique.', 'info');
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                aria-label="Supprimer cette vente"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </SheetModal>
    </div>
  );
};
