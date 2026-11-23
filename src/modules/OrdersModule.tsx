import React, {useMemo, useState} from 'react';
import {
  CheckCircle2,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {SheetModal} from '../components/SheetModal';
import {useStore} from '../context/StoreContext';
import {openWhatsAppChat} from '../services/androidShareService';
import {Order, OrderStatus, PaymentMethod, SaleItem, SalesChannel} from '../types/commerce';
import {
  formatDateTime,
  formatMoney,
  generateId,
  getEffectiveProductPrice,
} from '../utils/format';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  delivering: 'En livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'text-amber-700 dark:text-amber-400',
  confirmed: 'text-sky-700 dark:text-sky-400',
  delivering: 'text-indigo-700 dark:text-indigo-400',
  delivered: 'text-emerald-700 dark:text-emerald-400',
  cancelled: 'text-rose-700 dark:text-rose-400',
};

export const OrdersModule: React.FC = () => {
  const {
    orders,
    products,
    customers,
    promotions,
    storeProfile,
    saveOrder,
    removeOrder,
    completeOrderAsSale,
    notify,
  } = useStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<Order | null>(null);
  const [convertMethod, setConvertMethod] = useState<PaymentMethod>('Mobile Money');

  // Create order form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [channel, setChannel] = useState<SalesChannel>('WhatsApp');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});

  const openNewOrder = () => {
    setEditingId(null);
    setCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setChannel('WhatsApp');
    setNotes('');
    setCart({});
    setModalOpen(true);
  };

  const openEditOrder = (order: Order) => {
    setEditingId(order.id);
    setCustomerId(order.customerId ?? '');
    setCustomerName(order.customerName);
    setCustomerPhone(order.customerPhone);
    setDeliveryAddress(order.deliveryAddress);
    setChannel(order.channel);
    setNotes(order.notes);
    const map: Record<string, number> = {};
    for (const item of order.items) {
      map[item.productId] = item.quantity;
    }
    setCart(map);
    setModalOpen(true);
  };

  const filteredOrders = useMemo(() => {
    const q = search.toLowerCase().trim();
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (!q) return true;
      return `${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.deliveryAddress}`
        .toLowerCase()
        .includes(q);
    });
  }, [orders, search, statusFilter]);

  const cartSummary = useMemo(() => {
    const items: SaleItem[] = [];
    let total = 0;
    for (const [pid, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const product = products.find((p) => p.id === pid);
      if (!product) continue;
      const pricing = getEffectiveProductPrice(product, promotions);
      const lineTotal = pricing.finalPrice * qty;
      total += lineTotal;
      items.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        unitPrice: pricing.finalPrice,
        originalPrice: pricing.originalPrice,
        discountApplied: pricing.discountAmount,
        lineTotal,
      });
    }
    return {items, total};
  }, [cart, products, promotions]);

  const handleCustomerPick = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setCustomerName(c.name);
      setCustomerPhone(c.phone);
      setDeliveryAddress(c.address);
      setChannel(c.channel);
    }
  };

  const adjustCart = (pid: string, delta: number) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[pid] || 0) + delta);
      if (next === 0) {
        const copy = {...prev};
        delete copy[pid];
        return copy;
      }
      return {...prev, [pid]: next};
    });
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      notify('Veuillez indiquer le nom du client.', 'error');
      return;
    }
    if (cartSummary.items.length === 0) {
      notify('Ajoutez au moins un article à la commande.', 'error');
      return;
    }

    const now = Date.now();
    const existing = editingId ? orders.find((o) => o.id === editingId) : undefined;
    const order: Order = {
      id: existing ? existing.id : generateId('ord'),
      orderNumber: existing ? existing.orderNumber : `CMD-${Math.floor(100 + Math.random() * 900)}`,
      customerId: customerId || undefined,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: deliveryAddress.trim(),
      channel,
      status: existing ? existing.status : 'pending',
      items: cartSummary.items,
      total: cartSummary.total,
      notes: notes.trim(),
      stockDeducted: existing ? existing.stockDeducted : false,
      linkedSaleId: existing?.linkedSaleId,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await saveOrder(order);
    setModalOpen(false);
    notify(existing ? 'Commande mise à jour.' : `Commande ${order.orderNumber} créée.`, 'success');
  };

  const handleStatusChange = async (order: Order, nextStatus: OrderStatus) => {
    await saveOrder({
      ...order,
      status: nextStatus,
      updatedAt: Date.now(),
    });
    notify(`Commande ${order.orderNumber} : ${STATUS_LABELS[nextStatus]}.`, 'info');
  };

  const handleConvertOrder = async () => {
    if (!convertTarget) return;
    await completeOrderAsSale(convertTarget, convertMethod);
    setConvertTarget(null);
    notify('Commande encaissée, convertie en vente et stock déduit.', 'success');
  };

  const messageCustomerWhatsApp = async (order: Order) => {
    const itemsText = order.items
      .map((i) => `- ${i.quantity}x ${i.productName}`)
      .join('\n');
    const msg = `Bonjour ${order.customerName},\nVotre commande ${order.orderNumber} chez ${storeProfile.name} est actuellement : ${STATUS_LABELS[order.status]}.\n${itemsText}\nTotal : ${formatMoney(order.total, storeProfile.currency)}`;
    const res = await openWhatsAppChat(order.customerPhone, msg);
    notify(res.message, res.offline ? 'error' : 'info');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par numéro de commande, client ou adresse..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={openNewOrder}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle commande</span>
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(['ALL', 'pending', 'confirmed', 'delivering', 'delivered', 'cancelled'] as const).map(
          (st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[38px] px-3.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
                statusFilter === st
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {st === 'ALL' ? `Toutes (${orders.length})` : STATUS_LABELS[st]}
            </button>
          ),
        )}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
          Aucune commande trouvée.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {order.orderNumber}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className={`font-bold ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {order.channel} · {formatDateTime(order.createdAt)}
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    {order.customerName}
                    {order.customerPhone && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {order.customerPhone}
                      </span>
                    )}
                  </h3>
                  {order.deliveryAddress && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Livraison : {order.deliveryAddress}
                    </p>
                  )}
                </div>

                <div className="text-right tabular-nums">
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {formatMoney(order.total, storeProfile.currency)}
                  </div>
                  {order.linkedSaleId && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      Encaissée en vente
                    </div>
                  )}
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                {order.items.map((item, idx) => (
                  <div key={idx}>
                    {item.quantity} × {item.productName} ({formatMoney(item.lineTotal, storeProfile.currency)})
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <select
                  value={order.status}
                  onChange={(e) => handleStatusChange(order, e.target.value as OrderStatus)}
                  aria-label="Statut de la commande"
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap items-center gap-2">
                  {!order.linkedSaleId && order.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => setConvertTarget(order)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Encaisser</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => messageCustomerWhatsApp(order)}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditOrder(order)}
                    className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await removeOrder(order.id);
                      notify('Commande supprimée.', 'info');
                    }}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    aria-label="Supprimer la commande"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create / Edit Order Modal */}
      <SheetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Modifier la commande' : 'Nouvelle commande client'}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSaveOrder} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Client existant</label>
              <select
                value={customerId}
                onChange={(e) => handleCustomerPick(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="">-- Nouveau client --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nom complet *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Téléphone WhatsApp</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Canal d’origine</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as SalesChannel)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="WhatsApp">WhatsApp</option>
                <option value="Instagram">Instagram</option>
                <option value="Facebook">Facebook</option>
                <option value="Boutique">Boutique</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Adresse de livraison</label>
            <input
              type="text"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Quartier, rue, repère..."
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5">Articles commandés</label>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {products.map((p) => {
                const qty = cart[p.id] || 0;
                const pricing = getEffectiveProductPrice(p, promotions);
                return (
                  <div key={p.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{p.name}</div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {formatMoney(pricing.finalPrice, storeProfile.currency)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {qty > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => adjustCart(p.id, -1)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold tabular-nums">{qty}</span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => adjustCart(p.id, 1)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 tabular-nums">
            <span className="text-sm font-medium">Total commande</span>
            <span className="text-base font-bold">
              {formatMoney(cartSummary.total, storeProfile.currency)}
            </span>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
            >
              Enregistrer la commande
            </button>
          </div>
        </form>
      </SheetModal>

      {/* Convert Order to Sale Modal */}
      <SheetModal
        open={!!convertTarget}
        onClose={() => setConvertTarget(null)}
        title={`Encaisser ${convertTarget?.orderNumber ?? ''}`}
        maxWidthClass="max-w-md"
      >
        {convertTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Cette opération va créer un reçu de vente de{' '}
              <strong className="tabular-nums">
                {formatMoney(convertTarget.total, storeProfile.currency)}
              </strong>
              , marquer la commande comme <strong>Livrée</strong> et déduire les quantités du stock.
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1">Mode de paiement</label>
              <select
                value={convertMethod}
                onChange={(e) => setConvertMethod(e.target.value as PaymentMethod)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="Espèces">Espèces</option>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Virement">Virement</option>
                <option value="Carte">Carte</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setConvertTarget(null)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConvertOrder}
                className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
              >
                Confirmer l’encaissement
              </button>
            </div>
          </div>
        )}
      </SheetModal>
    </div>
  );
};
