import {
  clearDatabaseStoreContents,
  DEMO_DB_NAME,
  openZandoDB,
  STORES,
} from '../db/indexedDb';
import {
  CreditTransaction,
  Customer,
  Expense,
  Order,
  Product,
  Promotion,
  Sale,
  StoreProfile,
} from '../types/commerce';
import {createIndependentCatalogSnapshot} from './catalogueGenerator';
import {saveCompressedImageBlob} from './mediaService';

async function createSampleProductBlob(title: string, bgHex: string, accentHex: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new Blob([], {type: 'image/jpeg'});
  }
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 640, 480);

  ctx.fillStyle = accentHex;
  ctx.beginPath();
  ctx.arc(320, 195, 92, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title.slice(0, 2).toUpperCase(), 320, 210);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 25px sans-serif';
  ctx.fillText(title, 320, 358);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b ?? new Blob()), 'image/jpeg', 0.85);
  });
}

async function createDemoLogoBlob(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Blob([], {type: 'image/jpeg'});

  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.arc(200, 200, 130, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 110px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ÉK', 200, 206);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b ?? new Blob()), 'image/jpeg', 0.88);
  });
}

async function populateRichSampleInCurrentDb(isDemoStore: boolean): Promise<void> {
  const now = Date.now();
  const db = await openZandoDB(isDemoStore ? DEMO_DB_NAME : undefined);

  const [logoRec, img1, img2, img3, img4, img5, img6] = await Promise.all([
    saveCompressedImageBlob(await createDemoLogoBlob(), {maxWidth: 400, maxHeight: 400, quality: 0.85}),
    saveCompressedImageBlob(await createSampleProductBlob('Sac Cuir', '#F1F5F9', '#0F172A'), {maxWidth: 640, maxHeight: 640, quality: 0.8}),
    saveCompressedImageBlob(await createSampleProductBlob('Montre Classic', '#ECFDF5', '#059669'), {maxWidth: 640, maxHeight: 640, quality: 0.8}),
    saveCompressedImageBlob(await createSampleProductBlob('Parfum Oud', '#FEF3C7', '#D97706'), {maxWidth: 640, maxHeight: 640, quality: 0.8}),
    saveCompressedImageBlob(await createSampleProductBlob('Baskets', '#E2E8F0', '#334155'), {maxWidth: 640, maxHeight: 640, quality: 0.8}),
    saveCompressedImageBlob(await createSampleProductBlob('Chemise Lin', '#EFF6FF', '#2563EB'), {maxWidth: 640, maxHeight: 640, quality: 0.8}),
    saveCompressedImageBlob(await createSampleProductBlob('Lunettes Soleil', '#FFF1F2', '#E11D48'), {maxWidth: 640, maxHeight: 640, quality: 0.8}),
  ]);

  const profile: StoreProfile = {
    id: 'default',
    name: isDemoStore ? 'Boutique Étoile (Démo)' : 'Atelier Kinshasa Mode',
    description:
      'Boutique fictive de démonstration : maroquinerie, montres, parfums et prêt-à-porter avec livraison express.',
    phone: '+243 810 000 123',
    email: 'demo@etoile-boutique.example',
    address: 'Avenue du Commerce 42, Gombe',
    currency: 'FCFA',
    primaryColor: '#0F172A',
    accentColor: '#059669',
    themeMode: 'light',
    layoutMode: 'grid',
    logoBlobId: logoRec.id,
    instagramHandle: '@boutiqueetoile_demo',
    facebookPage: 'BoutiqueEtoileDemo',
    tiktokHandle: '@boutiqueetoile',
    updatedAt: now,
  };

  const products: Product[] = [
    {
      id: 'prod_demo_1',
      sku: 'SAC-001',
      name: 'Sac Bandoulière Cuir Noir',
      description: 'Cuir souple finition mate, double compartiment zippé.',
      category: 'Maroquinerie',
      price: 25000,
      costPrice: 14500,
      extraFees: 500,
      supplier: 'Atelier Maroquin',
      stock: 14,
      lowStockThreshold: 4,
      unit: 'pièce',
      imageBlobId: img1.id,
      isActive: true,
      createdAt: now - 86400000 * 15,
      updatedAt: now - 86400000,
    },
    {
      id: 'prod_demo_2',
      sku: 'MTR-014',
      name: 'Montre Acier Minimaliste',
      description: 'Boîtier acier inoxydable étanche 3 ATM, bracelet maille.',
      category: 'Horlogerie',
      price: 38000,
      costPrice: 21000,
      extraFees: 800,
      supplier: 'Horlogerie Nord',
      stock: 3,
      lowStockThreshold: 5,
      unit: 'pièce',
      imageBlobId: img2.id,
      isActive: true,
      createdAt: now - 86400000 * 12,
      updatedAt: now - 86400000,
    },
    {
      id: 'prod_demo_3',
      sku: 'PRF-008',
      name: 'Eau de Parfum Ambre & Oud 100ml',
      description: 'Tenue longue durée, flacon verre épais.',
      category: 'Parfumerie',
      price: 32000,
      costPrice: 18000,
      extraFees: 500,
      supplier: 'Maison Orient',
      stock: 22,
      lowStockThreshold: 5,
      unit: 'flacon',
      imageBlobId: img3.id,
      isActive: true,
      createdAt: now - 86400000 * 10,
      updatedAt: now - 86400000,
    },
    {
      id: 'prod_demo_4',
      sku: 'CHS-021',
      name: 'Baskets Urbaines Blanches',
      description: 'Semelle confortable, pointures 39 à 44 disponibles.',
      category: 'Chaussures',
      price: 29000,
      costPrice: 17500,
      extraFees: 1000,
      supplier: 'Urban Step',
      stock: 2,
      lowStockThreshold: 4,
      unit: 'paire',
      imageBlobId: img4.id,
      isActive: true,
      createdAt: now - 86400000 * 8,
      updatedAt: now - 86400000,
    },
    {
      id: 'prod_demo_5',
      sku: 'VET-033',
      name: 'Chemise Lin Coupe Droite',
      description: 'Tissu respirant 100% lin, coloris blanc cassé.',
      category: 'Prêt-à-porter',
      price: 18000,
      costPrice: 11000,
      extraFees: 300,
      supplier: 'Textile Sud',
      stock: 16,
      lowStockThreshold: 4,
      unit: 'pièce',
      imageBlobId: img5.id,
      isActive: true,
      createdAt: now - 86400000 * 6,
      updatedAt: now - 86400000,
    },
    {
      id: 'prod_demo_6',
      sku: 'ACC-052',
      name: 'Lunettes Polarisées Classiques',
      description: 'Protection UV400 avec étui rigide inclus.',
      category: 'Accessoires',
      price: 12000,
      costPrice: 7500,
      extraFees: 200,
      supplier: 'Optic Express',
      stock: 19,
      lowStockThreshold: 4,
      unit: 'pièce',
      imageBlobId: img6.id,
      isActive: true,
      createdAt: now - 86400000 * 20,
      updatedAt: now - 86400000 * 10,
    },
  ];

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now - 86400000).toISOString().slice(0, 10);
  const threeDaysAgoStr = new Date(now - 86400000 * 3).toISOString().slice(0, 10);
  const pastDueStr = new Date(now - 86400000 * 5).toISOString().slice(0, 10);
  const futureDueStr = new Date(now + 86400000 * 7).toISOString().slice(0, 10);
  const nextMonthStr = new Date(now + 86400000 * 30).toISOString().slice(0, 10);

  const promotions: Promotion[] = [
    {
      id: 'promo_demo_1',
      title: 'Offre Spéciale Parfumerie',
      description: '15% de réduction sur toute la gamme parfumerie.',
      discountType: 'percent',
      discountValue: 15,
      scope: 'category',
      targetCategory: 'Parfumerie',
      targetProductIds: [],
      startsAt: new Date(now - 86400000 * 5).toISOString().slice(0, 10),
      endsAt: nextMonthStr,
      isActive: true,
      createdAt: now - 86400000 * 5,
      updatedAt: now,
    },
  ];

  const customers: Customer[] = [
    {
      id: 'cust_demo_1',
      name: 'Amina Diallo (Démo)',
      phone: '+225 0701020304',
      email: '',
      address: 'Cocody Angré, Abidjan',
      channel: 'WhatsApp',
      notes: 'Cliente fidèle, règle régulièrement par Mobile Money.',
      createdAt: now - 86400000 * 14,
      updatedAt: now - 86400000,
    },
    {
      id: 'cust_demo_2',
      name: 'Marc Kabongo (Démo)',
      phone: '+243 820112233',
      email: '',
      address: 'Lingwala, Centre',
      channel: 'Instagram',
      notes: 'Achète souvent à crédit avec acompte.',
      createdAt: now - 86400000 * 10,
      updatedAt: now - 86400000,
    },
    {
      id: 'cust_demo_3',
      name: 'Chantal Mbeki (Démo)',
      phone: '+243 899445566',
      email: '',
      address: 'Bandalungwa, Kinshasa',
      channel: 'Facebook',
      notes: 'A versé une avance pour la prochaine livraison.',
      createdAt: now - 86400000 * 7,
      updatedAt: now - 86400000,
    },
  ];

  const sales: Sale[] = [
    {
      id: 'sale_demo_1',
      receiptNumber: 'FAC-1001',
      customerId: 'cust_demo_1',
      customerName: 'Amina Diallo (Démo)',
      customerPhone: '+225 0701020304',
      channel: 'WhatsApp',
      paymentMethod: 'Mobile Money',
      paymentStatus: 'paid',
      amountPaid: 52200,
      refundedAmount: 0,
      extraFees: 0,
      items: [
        {
          productId: 'prod_demo_1',
          productName: 'Sac Bandoulière Cuir Noir',
          sku: 'SAC-001',
          quantity: 1,
          unitPrice: 25000,
          originalPrice: 25000,
          costPrice: 14500,
          extraFees: 500,
          discountApplied: 0,
          lineTotal: 25000,
        },
        {
          productId: 'prod_demo_3',
          productName: 'Eau de Parfum Ambre & Oud 100ml',
          sku: 'PRF-008',
          quantity: 1,
          unitPrice: 27200,
          originalPrice: 32000,
          costPrice: 18000,
          extraFees: 500,
          discountApplied: 4800,
          lineTotal: 27200,
        },
      ],
      subtotal: 57000,
      discountTotal: 4800,
      total: 52200,
      notes: 'Livré par coursier.',
      createdAt: now - 86400000 * 4,
    },
    {
      id: 'sale_demo_2',
      receiptNumber: 'FAC-1002',
      customerId: 'cust_demo_2',
      customerName: 'Marc Kabongo (Démo)',
      customerPhone: '+243 820112233',
      channel: 'Instagram',
      paymentMethod: 'Crédit',
      paymentStatus: 'partial',
      amountPaid: 20000,
      refundedAmount: 0,
      extraFees: 0,
      dueDate: pastDueStr,
      items: [
        {
          productId: 'prod_demo_2',
          productName: 'Montre Acier Minimaliste',
          sku: 'MTR-014',
          quantity: 1,
          unitPrice: 38000,
          originalPrice: 38000,
          costPrice: 21000,
          extraFees: 800,
          discountApplied: 0,
          lineTotal: 38000,
        },
      ],
      subtotal: 38000,
      discountTotal: 0,
      total: 38000,
      notes: 'Acompte de 15 000 + paiement partiel de 5 000.',
      createdAt: now - 86400000 * 8,
    },
    {
      id: 'sale_demo_3',
      receiptNumber: 'FAC-1003',
      customerId: 'cust_demo_1',
      customerName: 'Amina Diallo (Démo)',
      customerPhone: '+225 0701020304',
      channel: 'WhatsApp',
      paymentMethod: 'Espèces',
      paymentStatus: 'paid',
      amountPaid: 47000,
      refundedAmount: 0,
      extraFees: 500,
      items: [
        {
          productId: 'prod_demo_4',
          productName: 'Baskets Urbaines Blanches',
          sku: 'CHS-021',
          quantity: 1,
          unitPrice: 29000,
          originalPrice: 29000,
          costPrice: 17500,
          extraFees: 1000,
          discountApplied: 0,
          lineTotal: 29000,
        },
        {
          productId: 'prod_demo_5',
          productName: 'Chemise Lin Coupe Droite',
          sku: 'VET-033',
          quantity: 1,
          unitPrice: 18000,
          originalPrice: 18000,
          costPrice: 11000,
          extraFees: 300,
          discountApplied: 0,
          lineTotal: 18000,
        },
      ],
      subtotal: 47000,
      discountTotal: 0,
      total: 47000,
      notes: 'Vente du jour en boutique.',
      createdAt: now - 3600000 * 2, // Aujourd'hui
    },
  ];

  const creditTransactions: CreditTransaction[] = [
    {
      id: 'crd_demo_1',
      customerId: 'cust_demo_2',
      customerName: 'Marc Kabongo (Démo)',
      customerPhone: '+243 820112233',
      type: 'credit_sale',
      amount: 23000,
      direction: 'debt_increase',
      saleId: 'sale_demo_2',
      receiptNumber: 'FAC-1002',
      dueDate: pastDueStr,
      note: 'Reste dû sur montre (acompte initial 15 000 FCFA)',
      createdAt: now - 86400000 * 8,
    },
    {
      id: 'crd_demo_2',
      customerId: 'cust_demo_2',
      customerName: 'Marc Kabongo (Démo)',
      customerPhone: '+243 820112233',
      type: 'partial_payment',
      amount: 5000,
      direction: 'debt_decrease',
      saleId: 'sale_demo_2',
      receiptNumber: 'FAC-1002',
      note: 'Paiement partiel Mobile Money',
      createdAt: now - 86400000 * 2,
    },
    {
      id: 'crd_demo_3',
      customerId: 'cust_demo_3',
      customerName: 'Chantal Mbeki (Démo)',
      customerPhone: '+243 899445566',
      type: 'advance',
      amount: 15000,
      direction: 'debt_decrease',
      dueDate: futureDueStr,
      note: 'Avance déposée sur réservation sac cuir',
      createdAt: now - 86400000 * 1,
    },
  ];

  const expenses: Expense[] = [
    {
      id: 'exp_demo_1',
      title: 'Publicité sponsorisée Instagram',
      category: 'Publicité',
      amount: 8500,
      date: todayStr,
      paymentMethod: 'Carte',
      notes: 'Campagne week-end sur les parfums',
      createdAt: now - 3600000 * 4,
    },
    {
      id: 'exp_demo_2',
      title: 'Livreur courses Gombe & Lingwala',
      category: 'Transport & Livraison',
      amount: 4500,
      date: yesterdayStr,
      paymentMethod: 'Espèces',
      notes: '3 courses clients',
      createdAt: now - 86400000,
    },
    {
      id: 'exp_demo_3',
      title: 'Sachets kraft & boîtes cadeaux',
      category: 'Emballage',
      amount: 6000,
      date: threeDaysAgoStr,
      paymentMethod: 'Espèces',
      notes: 'Lot de 50 emballages',
      createdAt: now - 86400000 * 3,
    },
  ];

  const orders: Order[] = [
    {
      id: 'ord_demo_1',
      orderNumber: 'CMD-204',
      customerId: 'cust_demo_3',
      customerName: 'Chantal Mbeki (Démo)',
      customerPhone: '+243 899445566',
      deliveryAddress: 'Bandalungwa, Avenue Kasa-Vubu 18',
      channel: 'Facebook',
      status: 'confirmed',
      items: [
        {
          productId: 'prod_demo_1',
          productName: 'Sac Bandoulière Cuir Noir',
          sku: 'SAC-001',
          quantity: 1,
          unitPrice: 25000,
          originalPrice: 25000,
          costPrice: 14500,
          discountApplied: 0,
          lineTotal: 25000,
        },
      ],
      total: 25000,
      notes: 'Avance de 15 000 FCFA déjà versée.',
      stockDeducted: false,
      createdAt: now - 3600000 * 5,
      updatedAt: now - 3600000 * 2,
    },
  ];

  const tx = db.transaction(
    [
      STORES.STORE_PROFILE,
      STORES.PRODUCTS,
      STORES.PROMOTIONS,
      STORES.CUSTOMERS,
      STORES.SALES,
      STORES.ORDERS,
      STORES.EXPENSES,
      STORES.CREDIT_TRANSACTIONS,
    ],
    'readwrite',
  );
  tx.objectStore(STORES.STORE_PROFILE).put(profile);
  for (const p of products) tx.objectStore(STORES.PRODUCTS).put(p);
  for (const pr of promotions) tx.objectStore(STORES.PROMOTIONS).put(pr);
  for (const c of customers) tx.objectStore(STORES.CUSTOMERS).put(c);
  for (const s of sales) tx.objectStore(STORES.SALES).put(s);
  for (const o of orders) tx.objectStore(STORES.ORDERS).put(o);
  for (const ex of expenses) tx.objectStore(STORES.EXPENSES).put(ex);
  for (const cr of creditTransactions) tx.objectStore(STORES.CREDIT_TRANSACTIONS).put(cr);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Also generate 1 sample independent catalog in demo mode
  const demoCatalog = await createIndependentCatalogSnapshot(profile, products, promotions, {
    title: 'Catalogue Collection Démo',
    subtitle: 'Découvrez nos articles phares disponibles sur commande WhatsApp.',
    selectedProductIds: products.slice(0, 4).map((p) => p.id),
    showStock: true,
    showPromotions: true,
    imageMaxWidth: 520,
    imageQuality: 0.72,
  });

  const catTx = db.transaction(STORES.CATALOGS, 'readwrite');
  catTx.objectStore(STORES.CATALOGS).put(demoCatalog);
  await new Promise<void>((resolve, reject) => {
    catTx.oncomplete = () => resolve();
    catTx.onerror = () => reject(catTx.error);
  });
}

export async function seedDemoDatabase(): Promise<void> {
  await clearDatabaseStoreContents(DEMO_DB_NAME);
  await populateRichSampleInCurrentDb(true);
}

export async function loadSampleCommerceData(): Promise<void> {
  await populateRichSampleInCurrentDb(false);
}
