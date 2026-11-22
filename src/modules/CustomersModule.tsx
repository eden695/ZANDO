import React, {useMemo, useState} from 'react';
import {Edit3, MessageCircle, Plus, Search, Trash2} from 'lucide-react';
import {SheetModal} from '../components/SheetModal';
import {useStore} from '../context/StoreContext';
import {openWhatsAppChat} from '../services/androidShareService';
import {Customer, SalesChannel} from '../types/commerce';
import {formatMoney, generateId} from '../utils/format';

export const CustomersModule: React.FC = () => {
  const {customers, sales, orders, storeProfile, saveCustomer, removeCustomer, notify} =
    useStore();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [channel, setChannel] = useState<SalesChannel>('WhatsApp');
  const [notes, setNotes] = useState('');

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setChannel('WhatsApp');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email);
    setAddress(c.address);
    setChannel(c.channel);
    setNotes(c.notes);
    setModalOpen(true);
  };

  const customerStats = useMemo(() => {
    const map = new Map<string, {spent: number; salesCount: number; ordersCount: number}>();
    for (const c of customers) {
      const custSales = sales.filter(
        (s) => s.customerId === c.id || (c.phone && s.customerPhone === c.phone),
      );
      const custOrders = orders.filter(
        (o) => o.customerId === c.id || (c.phone && o.customerPhone === c.phone),
      );
      map.set(c.id, {
        spent: custSales.reduce((acc, s) => acc + s.total, 0),
        salesCount: custSales.length,
        ordersCount: custOrders.length,
      });
    }
    return map;
  }, [customers, sales, orders]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) =>
      `${c.name} ${c.phone} ${c.address} ${c.channel}`.toLowerCase().includes(q),
    );
  }, [customers, search]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      notify('Le nom du client est requis.', 'error');
      return;
    }
    const now = Date.now();
    const existing = editingId ? customers.find((c) => c.id === editingId) : undefined;
    const customer: Customer = {
      id: existing ? existing.id : generateId('cust'),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      channel,
      notes: notes.trim(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    await saveCustomer(customer);
    setModalOpen(false);
    notify(existing ? 'Fiche client mise à jour.' : 'Client ajouté.', 'success');
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
            placeholder="Rechercher un client par nom, téléphone ou adresse..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nouveau client</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
          Aucun client enregistré.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((customer) => {
            const stats = customerStats.get(customer.id) ?? {
              spent: 0,
              salesCount: 0,
              ordersCount: 0,
            };
            return (
              <article
                key={customer.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {customer.channel}
                        {customer.phone && ` · ${customer.phone}`}
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                        {customer.name}
                      </h3>
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        {formatMoney(stats.spent, storeProfile.currency)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {stats.salesCount} achat{stats.salesCount > 1 ? 's' : ''} · {stats.ordersCount} cmd
                      </div>
                    </div>
                  </div>
                  {customer.address && (
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                      {customer.address}
                    </p>
                  )}
                  {customer.notes && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 italic">
                      {customer.notes}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      openWhatsAppChat(
                        customer.phone,
                        `Bonjour ${customer.name}, c'est ${storeProfile.name}.`,
                      )
                    }
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(customer)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    aria-label="Modifier le client"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await removeCustomer(customer.id);
                      notify('Client supprimé.', 'info');
                    }}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    aria-label="Supprimer le client"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <SheetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Modifier le client' : 'Nouveau client'}
      >
        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold mb-1">Nom complet *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Téléphone WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+243..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Canal d’acquisition</label>
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
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Email (optionnel)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
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
              Enregistrer
            </button>
          </div>
        </form>
      </SheetModal>
    </div>
  );
};
