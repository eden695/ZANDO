import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {
  bulkPutProducts,
  clearStore,
  closeAndClearDbCache,
  convertOrderToSaleTransaction,
  DEFAULT_STORE_PROFILE,
  deleteRecord,
  DEMO_DB_NAME,
  getStoredAppMode,
  loadAllDomainData,
  putRecord,
  REAL_DB_NAME,
  recordCreditLedgerEntry,
  recordSaleWithStockDeduction,
  setStoredAppMode,
  STORES,
} from '../db/indexedDb';
import {answerCommercialQuestion} from '../services/localAssistantService';
import {clearAllCachedUrls, deleteMediaBlob} from '../services/mediaService';
import {seedDemoDatabase} from '../services/seedService';
import {
  AppMode,
  AssistantMessage,
  CreditTransaction,
  Customer,
  Expense,
  Order,
  Product,
  Promotion,
  Sale,
  SavedCatalog,
  SchemaMeta,
  StoreProfile,
} from '../types/commerce';
import {generateId, getContrastTextColor} from '../utils/format';

export interface ToastMessage {
  id: string;
  text: string;
  tone: 'success' | 'info' | 'error';
}

interface StoreContextValue {
  loading: boolean;
  error: string | null;
  appMode: AppMode;
  showOnboardingChoice: boolean;
  storeProfile: StoreProfile;
  products: Product[];
  promotions: Promotion[];
  customers: Customer[];
  sales: Sale[];
  orders: Order[];
  catalogs: SavedCatalog[];
  expenses: Expense[];
  creditTransactions: CreditTransaction[];
  assistantMessages: AssistantMessage[];
  schemaMeta: SchemaMeta | null;
  toasts: ToastMessage[];
  notify: (text: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: string) => void;
  reloadAll: () => Promise<void>;
  enterDemoMode: () => Promise<void>;
  resetDemoMode: () => Promise<void>;
  startRealStore: () => Promise<void>;
  saveStoreProfile: (next: StoreProfile) => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
  importProductsBatch: (products: Product[]) => Promise<void>;
  removeProduct: (product: Product) => Promise<void>;
  savePromotion: (promo: Promotion) => Promise<void>;
  removePromotion: (id: string) => Promise<void>;
  saveCustomer: (customer: Customer) => Promise<void>;
  removeCustomer: (id: string) => Promise<void>;
  addSale: (sale: Sale) => Promise<void>;
  removeSale: (id: string) => Promise<void>;
  saveOrder: (order: Order) => Promise<void>;
  removeOrder: (id: string) => Promise<void>;
  completeOrderAsSale: (order: Order, paymentMethod: Sale['paymentMethod']) => Promise<void>;
  saveCatalog: (catalog: SavedCatalog) => Promise<void>;
  removeCatalog: (id: string) => Promise<void>;
  saveExpense: (expense: Expense) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  addCreditTransaction: (entry: CreditTransaction) => Promise<void>;
  askAssistant: (question: string) => Promise<AssistantMessage>;
  clearAssistantHistory: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export const StoreProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appMode, setAppMode] = useState<AppMode>(() => getStoredAppMode());
  const [showOnboardingChoice, setShowOnboardingChoice] = useState(false);

  const [storeProfile, setStoreProfile] = useState<StoreProfile>(DEFAULT_STORE_PROFILE);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [catalogs, setCatalogs] = useState<SavedCatalog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [schemaMeta, setSchemaMeta] = useState<SchemaMeta | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), {id, text, tone}]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const reloadAll = useCallback(async () => {
    try {
      setError(null);
      const data = await loadAllDomainData();
      setStoreProfile(data.storeProfile);
      setProducts(data.products);
      setPromotions(data.promotions);
      setCustomers(data.customers);
      setSales(data.sales);
      setOrders(data.orders);
      setCatalogs(data.catalogs);
      setExpenses(data.expenses);
      setCreditTransactions(data.creditTransactions);
      setAssistantMessages(data.assistantMessages);
      setSchemaMeta(data.schemaMeta);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erreur lors du chargement de la base locale IndexedDB.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Boot sequence: always open normally in the real local workspace (demo mode is opt-in from Settings)
  useEffect(() => {
    let active = true;
    (async () => {
      const storedMode = getStoredAppMode();
      if (storedMode === 'unset') {
        if (!active) return;
        setStoredAppMode('real');
        setAppMode('real');
        setShowOnboardingChoice(false);
      }
      await reloadAll();
    })();
    return () => {
      active = false;
    };
  }, [reloadAll]);

  // Apply light/dark theme + merchant brand CSS custom properties to documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (storeProfile.themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const primary = storeProfile.primaryColor || '#0F172A';
    const accent = storeProfile.accentColor || '#059669';
    root.style.setProperty('--brand-primary', primary);
    root.style.setProperty('--brand-primary-fg', getContrastTextColor(primary));
    root.style.setProperty('--brand-accent', accent);
    root.style.setProperty('--brand-accent-fg', getContrastTextColor(accent));
  }, [storeProfile.themeMode, storeProfile.primaryColor, storeProfile.accentColor]);

  const enterDemoMode = useCallback(async () => {
    setLoading(true);
    clearAllCachedUrls();
    await closeAndClearDbCache(DEMO_DB_NAME);
    setStoredAppMode('demo');
    setAppMode('demo');
    setShowOnboardingChoice(false);
    await seedDemoDatabase();
    await reloadAll();
    notify('Mode Démonstration activé avec une base de données isolée.', 'info');
  }, [reloadAll, notify]);

  const resetDemoMode = useCallback(async () => {
    setLoading(true);
    clearAllCachedUrls();
    await seedDemoDatabase();
    await reloadAll();
    notify('Démonstration réinitialisée à son état initial.', 'info');
  }, [reloadAll, notify]);

  const startRealStore = useCallback(async () => {
    setLoading(true);
    clearAllCachedUrls();
    await closeAndClearDbCache(REAL_DB_NAME);
    setStoredAppMode('real');
    setAppMode('real');
    setShowOnboardingChoice(false);
    await reloadAll();
    notify('Espace personnel prêt. Vos données réelles sont isolées de la démonstration.', 'success');
  }, [reloadAll, notify]);

  const saveStoreProfile = useCallback(
    async (next: StoreProfile) => {
      const prevPhone = storeProfile.phone;
      const updated = {...next, id: 'default' as const, updatedAt: Date.now()};
      await putRecord(STORES.STORE_PROFILE, updated);
      setStoreProfile(updated);

      // Si le numéro WhatsApp de la boutique change, synchroniser les catalogues qui utilisaient l'ancien numéro (ou aucun numéro)
      if (updated.phone !== prevPhone && catalogs.length > 0) {
        const synced: SavedCatalog[] = [];
        let changed = false;
        for (const cat of catalogs) {
          if (!cat.storePhone || cat.storePhone === prevPhone) {
            const nextCat = {...cat, storePhone: updated.phone};
            await putRecord(STORES.CATALOGS, nextCat);
            synced.push(nextCat);
            changed = true;
          } else {
            synced.push(cat);
          }
        }
        if (changed) {
          setCatalogs(synced);
        }
      }
    },
    [storeProfile.phone, catalogs],
  );

  const saveProduct = useCallback(async (product: Product) => {
    await putRecord(STORES.PRODUCTS, product);
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === product.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = product;
        return copy.sort((a, b) => b.updatedAt - a.updatedAt);
      }
      return [product, ...prev];
    });
  }, []);

  const importProductsBatch = useCallback(
    async (items: Product[]) => {
      await bulkPutProducts(items);
      await reloadAll();
    },
    [reloadAll],
  );

  const removeProduct = useCallback(async (product: Product) => {
    await deleteRecord(STORES.PRODUCTS, product.id);
    if (product.imageBlobId) {
      await deleteMediaBlob(product.imageBlobId);
    }
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
  }, []);

  const savePromotion = useCallback(async (promo: Promotion) => {
    await putRecord(STORES.PROMOTIONS, promo);
    setPromotions((prev) => {
      const idx = prev.findIndex((p) => p.id === promo.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = promo;
        return copy;
      }
      return [promo, ...prev];
    });
  }, []);

  const removePromotion = useCallback(async (id: string) => {
    await deleteRecord(STORES.PROMOTIONS, id);
    setPromotions((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const saveCustomer = useCallback(async (customer: Customer) => {
    await putRecord(STORES.CUSTOMERS, customer);
    setCustomers((prev) => {
      const idx = prev.findIndex((c) => c.id === customer.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = customer;
        return copy.sort((a, b) => b.updatedAt - a.updatedAt);
      }
      return [customer, ...prev];
    });
  }, []);

  const removeCustomer = useCallback(async (id: string) => {
    await deleteRecord(STORES.CUSTOMERS, id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addSale = useCallback(
    async (sale: Sale) => {
      await recordSaleWithStockDeduction(sale);
      await reloadAll();
    },
    [reloadAll],
  );

  const removeSale = useCallback(async (id: string) => {
    await deleteRecord(STORES.SALES, id);
    setSales((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const saveOrder = useCallback(async (order: Order) => {
    await putRecord(STORES.ORDERS, order);
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === order.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = order;
        return copy.sort((a, b) => b.createdAt - a.createdAt);
      }
      return [order, ...prev];
    });
  }, []);

  const removeOrder = useCallback(async (id: string) => {
    await deleteRecord(STORES.ORDERS, id);
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const completeOrderAsSale = useCallback(
    async (order: Order, paymentMethod: Sale['paymentMethod']) => {
      const sale: Sale = {
        id: `sale_${Date.now().toString(36)}`,
        receiptNumber: `FAC-${Math.floor(1000 + Math.random() * 9000)}`,
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        channel: order.channel,
        paymentMethod,
        paymentStatus: 'paid',
        amountPaid: order.total,
        refundedAmount: 0,
        extraFees: 0,
        items: order.items,
        subtotal: order.items.reduce((acc, i) => acc + i.originalPrice * i.quantity, 0),
        discountTotal: order.items.reduce((acc, i) => acc + i.discountApplied * i.quantity, 0),
        total: order.total,
        notes: `Convertie depuis commande ${order.orderNumber}`,
        createdAt: Date.now(),
      };
      await convertOrderToSaleTransaction(order, sale);
      await reloadAll();
    },
    [reloadAll],
  );

  const saveCatalog = useCallback(async (catalog: SavedCatalog) => {
    await putRecord(STORES.CATALOGS, catalog);
    setCatalogs((prev) => {
      const idx = prev.findIndex((c) => c.id === catalog.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = catalog;
        return copy;
      }
      return [catalog, ...prev];
    });
  }, []);

  const removeCatalog = useCallback(async (id: string) => {
    await deleteRecord(STORES.CATALOGS, id);
    setCatalogs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const saveExpense = useCallback(async (expense: Expense) => {
    await putRecord(STORES.EXPENSES, expense);
    setExpenses((prev) => {
      const idx = prev.findIndex((e) => e.id === expense.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = expense;
        return copy.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
      }
      return [expense, ...prev].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    });
  }, []);

  const removeExpense = useCallback(async (id: string) => {
    await deleteRecord(STORES.EXPENSES, id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addCreditTransaction = useCallback(
    async (entry: CreditTransaction) => {
      await recordCreditLedgerEntry(entry);
      await reloadAll();
    },
    [reloadAll],
  );

  const askAssistant = useCallback(
    async (question: string): Promise<AssistantMessage> => {
      const userMsg: AssistantMessage = {
        id: generateId('msg'),
        role: 'user',
        text: question,
        createdAt: Date.now(),
      };
      const reply = answerCommercialQuestion(question, {
        storeProfile,
        products,
        sales,
        orders,
        customers,
        promotions,
        expenses,
        creditTransactions,
        catalogs,
      });

      await putRecord(STORES.ASSISTANT_MESSAGES, userMsg);
      await putRecord(STORES.ASSISTANT_MESSAGES, reply);
      setAssistantMessages((prev) => [...prev, userMsg, reply]);
      return reply;
    },
    [
      storeProfile,
      products,
      sales,
      orders,
      customers,
      promotions,
      expenses,
      creditTransactions,
      catalogs,
    ],
  );

  const clearAssistantHistory = useCallback(async () => {
    await clearStore(STORES.ASSISTANT_MESSAGES);
    setAssistantMessages([]);
  }, []);

  return (
    <StoreContext.Provider
      value={{
        loading,
        error,
        appMode,
        showOnboardingChoice,
        storeProfile,
        products,
        promotions,
        customers,
        sales,
        orders,
        catalogs,
        expenses,
        creditTransactions,
        assistantMessages,
        schemaMeta,
        toasts,
        notify,
        dismissToast,
        reloadAll,
        enterDemoMode,
        resetDemoMode,
        startRealStore,
        saveStoreProfile,
        saveProduct,
        importProductsBatch,
        removeProduct,
        savePromotion,
        removePromotion,
        saveCustomer,
        removeCustomer,
        addSale,
        removeSale,
        saveOrder,
        removeOrder,
        completeOrderAsSale,
        saveCatalog,
        removeCatalog,
        saveExpense,
        removeExpense,
        addCreditTransaction,
        askAssistant,
        clearAssistantHistory,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore doit être utilisé à l’intérieur de StoreProvider.');
  return ctx;
}
