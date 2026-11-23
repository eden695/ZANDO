export type ThemeMode = 'light' | 'dark';
export type ProductLayoutMode = 'grid' | 'list';
export type SalesChannel = 'WhatsApp' | 'Instagram' | 'Facebook' | 'Boutique' | 'Autre';
export type PaymentMethod = 'Espèces' | 'Mobile Money' | 'Virement' | 'Carte' | 'Crédit';
export type SalePaymentStatus = 'paid' | 'partial' | 'credit';
export type OrderStatus = 'pending' | 'confirmed' | 'delivering' | 'delivered' | 'cancelled';
export type DiscountType = 'percent' | 'fixed';
export type PromotionScope = 'all' | 'category' | 'products';
export type AppMode = 'unset' | 'real' | 'demo';

export type ExpenseCategory =
  | 'Approvisionnement'
  | 'Transport & Livraison'
  | 'Loyer & Électricité'
  | 'Publicité'
  | 'Emballage'
  | 'Salaires'
  | 'Frais divers';

export type CreditTransactionType =
  | 'credit_sale'
  | 'partial_payment'
  | 'advance'
  | 'refund'
  | 'correction';

export interface StoreProfile {
  id: 'default';
  name: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
  primaryColor: string;
  accentColor: string;
  themeMode: ThemeMode;
  layoutMode: ProductLayoutMode;
  logoBlobId?: string;
  bannerBlobId?: string;
  instagramHandle: string;
  facebookPage: string;
  tiktokHandle: string;
  updatedAt: number;
}

export interface MediaBlobRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  createdAt: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  price: number;
  costPrice: number;
  extraFees?: number; // Frais supplémentaires par unité (transport, emballage...)
  supplier?: string;  // Fournisseur
  stock: number;
  lowStockThreshold: number;
  unit: string;
  imageBlobId?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Promotion {
  id: string;
  title: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  scope: PromotionScope;
  targetCategory?: string;
  targetProductIds: string[];
  startsAt: string; // YYYY-MM-DD
  endsAt: string;   // YYYY-MM-DD
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  channel: SalesChannel;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  costPrice?: number;
  extraFees?: number;
  discountApplied: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  receiptNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  channel: SalesChannel;
  paymentMethod: PaymentMethod;
  paymentStatus?: SalePaymentStatus; // Défaut 'paid' pour rétrocompatibilité v1
  amountPaid?: number;               // Montant réellement encaissé à ce jour
  refundedAmount?: number;           // Remboursements effectués
  extraFees?: number;                // Frais additionnels sur la vente
  dueDate?: string;                  // Échéance crédit YYYY-MM-DD
  items: SaleItem[];
  subtotal: number;
  discountTotal: number;
  total: number;
  notes: string;
  createdAt: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  channel: SalesChannel;
  status: OrderStatus;
  items: SaleItem[];
  total: number;
  notes: string;
  stockDeducted: boolean;
  linkedSaleId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Expense {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  notes: string;
  createdAt: number;
}

export interface CreditTransaction {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  type: CreditTransactionType;
  amount: number; // Toujours >= 0
  direction: 'debt_increase' | 'debt_decrease';
  saleId?: string;
  receiptNumber?: string;
  dueDate?: string; // YYYY-MM-DD
  note: string;
  referenceTransactionId?: string; // Pour correction traçable
  createdAt: number;
}

export interface AssistantMetric {
  label: string;
  value: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  metrics?: AssistantMetric[];
  details?: string[];
  recommendations?: string[];
  followUps?: string[];
  actionRoute?: string;
  actionLabel?: string;
  createdAt: number;
}

export interface CatalogSnapshotProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  originalPrice: number;
  finalPrice: number;
  promoLabel?: string;
  stock: number;
  unit: string;
  imageDataUrl?: string;
}

export interface SavedCatalog {
  id: string;
  title: string;
  subtitle: string;
  createdAt: number;
  storeName: string;
  storePhone: string;
  storeEmail: string;
  storeAddress: string;
  storeDescription: string;
  currency: string;
  primaryColor: string;
  accentColor: string;
  logoDataUrl?: string;
  bannerDataUrl?: string;
  showStock: boolean;
  showPromotions: boolean;
  categories: string[];
  products: CatalogSnapshotProduct[];
  htmlSizeBytes: number;
}

export interface MigrationRecord {
  version: number;
  appliedAt: number;
  description: string;
}

export interface SchemaMeta {
  id: 'schema';
  currentVersion: number;
  appVersion: string;
  lastUpdatedAt: number;
  lastBackupAt?: number;
  migrations: MigrationRecord[];
}

export interface BackupSerializedBlob {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  createdAt: number;
  dataUrl: string;
}

export interface ZandoBackupPayload {
  format: 'zando-pro-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  storeProfile: StoreProfile;
  products: Product[];
  promotions: Promotion[];
  customers: Customer[];
  sales: Sale[];
  orders: Order[];
  catalogs: SavedCatalog[];
  expenses?: Expense[];
  creditTransactions?: CreditTransaction[];
  mediaBlobs: BackupSerializedBlob[];
}
