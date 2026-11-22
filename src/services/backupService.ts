import {
  APP_VERSION,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_STORE_PROFILE,
  loadAllDomainData,
  openZandoDB,
  STORES,
} from '../db/indexedDb';
import {
  BackupSerializedBlob,
  MediaBlobRecord,
  SchemaMeta,
  ZandoBackupPayload,
} from '../types/commerce';
import {blobToDataUrl, clearAllCachedUrls, dataUrlToBlob} from './mediaService';

const SAFETY_SNAPSHOT_KEY = 'zando_pro_last_safety_meta';

export async function exportFullBackup(): Promise<{payload: ZandoBackupPayload; blob: Blob; filename: string}> {
  const data = await loadAllDomainData();

  const serializedBlobs: BackupSerializedBlob[] = [];
  for (const media of data.mediaBlobs) {
    try {
      const dataUrl = await blobToDataUrl(media.blob);
      serializedBlobs.push({
        id: media.id,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height,
        originalSize: media.originalSize,
        compressedSize: media.compressedSize,
        createdAt: media.createdAt,
        dataUrl,
      });
    } catch {
      // Skip unreadable blob without aborting entire backup
    }
  }

  const payload: ZandoBackupPayload = {
    format: 'zando-pro-backup',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: Date.now(),
    storeProfile: data.storeProfile,
    products: data.products,
    promotions: data.promotions,
    customers: data.customers,
    sales: data.sales,
    orders: data.orders,
    catalogs: data.catalogs,
    expenses: data.expenses,
    creditTransactions: data.creditTransactions,
    mediaBlobs: serializedBlobs,
  };

  const db = await openZandoDB();
  const tx = db.transaction(STORES.SCHEMA_META, 'readwrite');
  tx.objectStore(STORES.SCHEMA_META).put({
    ...data.schemaMeta,
    lastBackupAt: payload.exportedAt,
  } satisfies SchemaMeta);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], {type: 'application/json;charset=utf-8'});
  const datePart = new Date(payload.exportedAt).toISOString().slice(0, 10);
  const safeStoreName =
    (data.storeProfile.name || 'boutique')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'boutique';
  const filename = `zando-pro-sauvegarde-${safeStoreName}-${datePart}.json`;

  try {
    localStorage.setItem(
      SAFETY_SNAPSHOT_KEY,
      JSON.stringify({lastBackupAt: payload.exportedAt, productsCount: data.products.length}),
    );
  } catch {
    // Ignore localStorage quota issues
  }

  return {payload, blob, filename};
}

export function validateBackupJson(rawText: string): ZandoBackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Le fichier sélectionné n’est pas un fichier JSON valide.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Structure de sauvegarde invalide.');
  }

  const candidate = parsed as Partial<ZandoBackupPayload>;
  if (candidate.format !== 'zando-pro-backup') {
    throw new Error('Ce fichier ne correspond pas à une sauvegarde ZANDO Pro.');
  }

  if (typeof candidate.schemaVersion !== 'number' || candidate.schemaVersion < 1) {
    throw new Error('Version de schéma manquante ou incompatible.');
  }

  return {
    format: 'zando-pro-backup',
    schemaVersion: candidate.schemaVersion,
    appVersion: candidate.appVersion ?? APP_VERSION,
    exportedAt: candidate.exportedAt ?? Date.now(),
    storeProfile: candidate.storeProfile ?? DEFAULT_STORE_PROFILE,
    products: Array.isArray(candidate.products) ? candidate.products : [],
    promotions: Array.isArray(candidate.promotions) ? candidate.promotions : [],
    customers: Array.isArray(candidate.customers) ? candidate.customers : [],
    sales: Array.isArray(candidate.sales) ? candidate.sales : [],
    orders: Array.isArray(candidate.orders) ? candidate.orders : [],
    catalogs: Array.isArray(candidate.catalogs) ? candidate.catalogs : [],
    expenses: Array.isArray(candidate.expenses) ? candidate.expenses : [],
    creditTransactions: Array.isArray(candidate.creditTransactions)
      ? candidate.creditTransactions
      : [],
    mediaBlobs: Array.isArray(candidate.mediaBlobs) ? candidate.mediaBlobs : [],
  };
}

export async function restoreBackupPayload(
  payload: ZandoBackupPayload,
  mode: 'replace' | 'merge',
): Promise<void> {
  const db = await openZandoDB();

  const hydratedBlobs: MediaBlobRecord[] = [];
  for (const item of payload.mediaBlobs) {
    try {
      const blob = dataUrlToBlob(item.dataUrl);
      hydratedBlobs.push({
        id: item.id,
        blob,
        mimeType: item.mimeType || blob.type || 'image/jpeg',
        width: item.width || 600,
        height: item.height || 600,
        originalSize: item.originalSize || blob.size,
        compressedSize: blob.size,
        createdAt: item.createdAt || Date.now(),
      });
    } catch {
      // Skip corrupted individual media entry
    }
  }

  const storeNames = [
    STORES.STORE_PROFILE,
    STORES.MEDIA_BLOBS,
    STORES.PRODUCTS,
    STORES.PROMOTIONS,
    STORES.CUSTOMERS,
    STORES.SALES,
    STORES.ORDERS,
    STORES.CATALOGS,
    STORES.EXPENSES,
    STORES.CREDIT_TRANSACTIONS,
    STORES.SCHEMA_META,
  ];

  const tx = db.transaction(storeNames, 'readwrite');

  if (mode === 'replace') {
    clearAllCachedUrls();
    for (const storeName of storeNames) {
      if (storeName !== STORES.SCHEMA_META) {
        tx.objectStore(storeName).clear();
      }
    }
  }

  tx.objectStore(STORES.STORE_PROFILE).put({
    ...DEFAULT_STORE_PROFILE,
    ...payload.storeProfile,
    id: 'default',
    updatedAt: Date.now(),
  });

  for (const blobRec of hydratedBlobs) tx.objectStore(STORES.MEDIA_BLOBS).put(blobRec);
  for (const p of payload.products) tx.objectStore(STORES.PRODUCTS).put(p);
  for (const promo of payload.promotions) tx.objectStore(STORES.PROMOTIONS).put(promo);
  for (const cust of payload.customers) tx.objectStore(STORES.CUSTOMERS).put(cust);
  for (const sale of payload.sales) tx.objectStore(STORES.SALES).put(sale);
  for (const order of payload.orders) tx.objectStore(STORES.ORDERS).put(order);
  for (const cat of payload.catalogs) tx.objectStore(STORES.CATALOGS).put(cat);
  for (const exp of payload.expenses ?? []) tx.objectStore(STORES.EXPENSES).put(exp);
  for (const crd of payload.creditTransactions ?? [])
    tx.objectStore(STORES.CREDIT_TRANSACTIONS).put(crd);

  const metaStore = tx.objectStore(STORES.SCHEMA_META);
  const existingMetaReq = metaStore.get('schema');
  existingMetaReq.onsuccess = () => {
    const prev = existingMetaReq.result as SchemaMeta | undefined;
    metaStore.put({
      id: 'schema',
      currentVersion: CURRENT_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      lastUpdatedAt: Date.now(),
      lastBackupAt: payload.exportedAt,
      migrations: [
        ...(prev?.migrations ?? []),
        {
          version: CURRENT_SCHEMA_VERSION,
          appliedAt: Date.now(),
          description: `Restauration (${mode === 'replace' ? 'remplacement complet' : 'fusion'}) depuis sauvegarde du ${new Date(payload.exportedAt).toLocaleDateString('fr-FR')}.`,
        },
      ],
    } satisfies SchemaMeta);
  };

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Erreur lors de la restauration IndexedDB.'));
  });
}
