import {jsPDF} from 'jspdf';
import {
  CatalogSnapshotProduct,
  Product,
  Promotion,
  SavedCatalog,
  StoreProfile,
} from '../types/commerce';
import {
  formatDate,
  formatMoney,
  generateId,
  getEffectiveProductPrice,
  sanitizePhoneForWhatsApp,
} from '../utils/format';
import {getCompressedDataUrlForCatalog} from './mediaService';

export interface BuildCatalogOptions {
  title: string;
  subtitle: string;
  selectedProductIds: string[];
  showStock: boolean;
  showPromotions: boolean;
  imageQuality: number;
  imageMaxWidth: number;
  existingCatalog?: SavedCatalog;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function createIndependentCatalogSnapshot(
  store: StoreProfile,
  products: Product[],
  promotions: Promotion[],
  options: BuildCatalogOptions,
): Promise<SavedCatalog> {
  const selectedSet = new Set(options.selectedProductIds);
  const chosenProducts = products.filter((p) => selectedSet.has(p.id));
  const includedIds = new Set<string>();

  const snapshotProducts: CatalogSnapshotProduct[] = [];
  const categorySet = new Set<string>();

  for (const product of chosenProducts) {
    includedIds.add(product.id);
    const pricing = options.showPromotions
      ? getEffectiveProductPrice(product, promotions)
      : {
          originalPrice: product.price,
          finalPrice: product.price,
          promoLabel: undefined,
        };

    const imageDataUrl = await getCompressedDataUrlForCatalog(
      product.imageBlobId,
      options.imageMaxWidth,
      options.imageQuality,
    );

    const category = product.category.trim() || 'Général';
    categorySet.add(category);

    snapshotProducts.push({
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      category,
      originalPrice: pricing.originalPrice,
      finalPrice: pricing.finalPrice,
      promoLabel: pricing.promoLabel,
      stock: product.stock,
      unit: product.unit || 'unité',
      imageDataUrl,
    });
  }

  // Preserve previously snapshotted items that are still selected even if removed from inventory later
  if (options.existingCatalog) {
    for (const oldItem of options.existingCatalog.products) {
      if (selectedSet.has(oldItem.id) && !includedIds.has(oldItem.id)) {
        includedIds.add(oldItem.id);
        categorySet.add(oldItem.category || 'Général');
        snapshotProducts.push(oldItem);
      }
    }
  }

  const [logoDataUrl, bannerDataUrl] = await Promise.all([
    getCompressedDataUrlForCatalog(store.logoBlobId, 320, 0.8),
    getCompressedDataUrlForCatalog(store.bannerBlobId, 1000, 0.72),
  ]);

  const draftCatalog: SavedCatalog = {
    id: options.existingCatalog?.id ?? generateId('cat'),
    title: options.title.trim() || `Catalogue ${store.name}`,
    subtitle: options.subtitle.trim() || store.description,
    createdAt: options.existingCatalog?.createdAt ?? Date.now(),
    storeName: store.name,
    storePhone: store.phone,
    storeEmail: store.email,
    storeAddress: store.address,
    storeDescription: store.description,
    currency: store.currency,
    primaryColor: store.primaryColor || '#0F172A',
    accentColor: store.accentColor || '#059669',
    logoDataUrl,
    bannerDataUrl,
    showStock: options.showStock,
    showPromotions: options.showPromotions,
    categories: Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'fr')),
    products: snapshotProducts,
    htmlSizeBytes: 0,
  };

  const html = generateStandaloneCatalogHtml(draftCatalog);
  draftCatalog.htmlSizeBytes = new Blob([html], {type: 'text/html;charset=utf-8'}).size;

  return draftCatalog;
}

export function generateStandaloneCatalogHtml(catalog: SavedCatalog): string {
  const safeStoreName = escapeHtml(catalog.storeName);
  const safeTitle = escapeHtml(catalog.title);
  const safeSubtitle = escapeHtml(catalog.subtitle);
  const safePhone = escapeHtml(catalog.storePhone);
  const safeEmail = escapeHtml(catalog.storeEmail);
  const safeAddress = escapeHtml(catalog.storeAddress);
  const cleanWaPhone = sanitizePhoneForWhatsApp(catalog.storePhone);

  // Embedded JSON payload inside standalone HTML (zero external fetch, zero server)
  const embeddedDataJson = JSON.stringify({
    storeName: catalog.storeName,
    storePhone: cleanWaPhone,
    currency: catalog.currency,
    showStock: catalog.showStock,
    products: catalog.products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category,
      originalPrice: p.originalPrice,
      finalPrice: p.finalPrice,
      promoLabel: p.promoLabel ?? null,
      stock: p.stock,
      unit: p.unit,
      imageDataUrl: p.imageDataUrl ?? null,
    })),
  }).replace(/</g, '\\u003c');

  const categoryButtons = [
    `<button type="button" class="cat-btn active" data-cat="ALL">Tout (${catalog.products.length})</button>`,
    ...catalog.categories.map((cat) => {
      const count = catalog.products.filter((p) => p.category === cat).length;
      return `<button type="button" class="cat-btn" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)} (${count})</button>`;
    }),
  ].join('');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle} — ${safeStoreName}</title>
<style>
  :root {
    --primary: ${catalog.primaryColor};
    --accent: ${catalog.accentColor};
    --bg: #F8FAFC;
    --card: #FFFFFF;
    --text: #0F172A;
    --muted: #475569;
    --border: #E2E8F0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    padding-bottom: 92px;
  }
  .container { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
  header {
    background: var(--primary);
    color: #FFFFFF;
    padding: 20px 0 24px;
    border-bottom: 3px solid var(--accent);
  }
  .hero-banner {
    width: 100%;
    max-height: 200px;
    object-fit: cover;
    border-radius: 12px;
    margin-bottom: 16px;
    display: block;
  }
  .store-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .store-logo {
    width: 60px; height: 60px; border-radius: 14px; object-fit: cover;
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2);
    flex-shrink: 0;
  }
  .store-logo-fallback {
    width: 60px; height: 60px; border-radius: 14px;
    background: var(--accent); color: #fff; font-weight: 700; font-size: 24px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  h1 { font-size: 1.45rem; font-weight: 700; letter-spacing: -0.02em; }
  .subtitle { font-size: 0.92rem; opacity: 0.9; margin-top: 4px; max-width: 65ch; }
  .contact-line {
    margin-top: 12px; font-size: 0.85rem; opacity: 0.88;
    display: flex; flex-wrap: wrap; gap: 8px 16px;
  }
  .toolbar {
    position: sticky; top: 0; z-index: 20;
    background: rgba(248, 250, 252, 0.95);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
    padding: 12px 0;
  }
  .search-input {
    width: 100%; padding: 11px 14px; border-radius: 10px;
    border: 1px solid var(--border); background: #fff; color: var(--text);
    font-size: 0.95rem; margin-bottom: 10px;
  }
  .cats { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
  .cat-btn {
    border: 1px solid var(--border); background: #fff; color: var(--muted);
    padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
    cursor: pointer; white-space: nowrap; min-height: 40px;
  }
  .cat-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
  .grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 16px; margin-top: 18px;
  }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 14px;
    overflow: hidden; display: flex; flex-direction: column;
  }
  .card-img {
    width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #E2E8F0; display: block;
  }
  .card-placeholder {
    width: 100%; aspect-ratio: 4 / 3; background: #F1F5F9; color: #64748B;
    display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.9rem;
  }
  .card-body { padding: 14px; display: flex; flex-direction: column; flex: 1; gap: 6px; }
  .meta { font-size: 0.78rem; color: var(--muted); }
  .card-title { font-size: 1rem; font-weight: 700; color: var(--text); }
  .card-desc { font-size: 0.85rem; color: var(--muted); flex: 1; }
  .price-row { display: flex; align-items: baseline; gap: 8px; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .price { font-size: 1.12rem; font-weight: 700; color: var(--text); }
  .old-price { font-size: 0.85rem; color: #94A3B8; text-decoration: line-through; }
  .promo-text { font-size: 0.78rem; font-weight: 700; color: #DC2626; }
  .stock-text { font-size: 0.8rem; font-weight: 600; }
  .stock-ok { color: #059669; }
  .stock-low { color: #D97706; }
  .stock-out { color: #DC2626; }
  .add-btn {
    margin-top: 10px; width: 100%; min-height: 44px; border: none; border-radius: 10px;
    background: var(--accent); color: #fff; font-weight: 700; font-size: 0.9rem; cursor: pointer;
  }
  .add-btn:disabled { background: #CBD5E1; color: #64748B; cursor: not-allowed; }
  .cart-bar {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 30;
    background: var(--primary); color: #fff; padding: 12px 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    box-shadow: 0 -4px 20px rgba(15, 23, 42, 0.18);
  }
  .cart-btn {
    background: var(--accent); color: #fff; border: none; border-radius: 10px;
    padding: 10px 18px; font-weight: 700; font-size: 0.92rem; cursor: pointer; min-height: 44px;
  }
  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); z-index: 50;
    display: none; align-items: flex-end; justify-content: center;
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    background: #fff; width: 100%; max-width: 540px; max-height: 90vh;
    border-radius: 20px 20px 0 0; padding: 20px; overflow-y: auto;
  }
  @media (min-width: 640px) {
    .modal-backdrop { align-items: center; padding: 16px; }
    .modal { border-radius: 18px; }
  }
  .cart-item {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 10px 0; border-bottom: 1px solid var(--border);
  }
  .qty-ctrl { display: flex; align-items: center; gap: 8px; }
  .qty-btn {
    width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--border);
    background: #F8FAFC; font-weight: 700; cursor: pointer;
  }
  .field { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; margin-top: 8px; font-size: 0.92rem; }
  .wa-submit {
    margin-top: 14px; width: 100%; min-height: 48px; border: none; border-radius: 10px;
    background: #16A34A; color: #fff; font-weight: 700; font-size: 0.98rem; cursor: pointer;
  }
  .empty { text-align: center; padding: 48px 16px; color: var(--muted); }
  footer { margin-top: 32px; padding: 18px 0; border-top: 1px solid var(--border); font-size: 0.78rem; color: var(--muted); text-align: center; }
</style>
</head>
<body>
<header>
  <div class="container">
    ${catalog.bannerDataUrl ? `<img class="hero-banner" src="${catalog.bannerDataUrl}" alt="Bannière ${safeStoreName}" />` : ''}
    <div class="store-head">
      ${
        catalog.logoDataUrl
          ? `<img class="store-logo" src="${catalog.logoDataUrl}" alt="Logo ${safeStoreName}" />`
          : `<div class="store-logo-fallback">${escapeHtml((catalog.storeName || 'B').charAt(0).toUpperCase())}</div>`
      }
      <div>
        <h1>${safeTitle}</h1>
        <p class="subtitle">${safeSubtitle}</p>
      </div>
    </div>
    <div class="contact-line">
      <span>Boutique : <strong>${safeStoreName}</strong></span>
      ${safePhone ? `<span>WhatsApp : <strong>${safePhone}</strong></span>` : ''}
      ${safeAddress ? `<span>Adresse : ${safeAddress}</span>` : ''}
      ${safeEmail ? `<span>Email : ${safeEmail}</span>` : ''}
      <span>Mis à jour le ${escapeHtml(formatDate(catalog.createdAt))}</span>
    </div>
  </div>
</header>

<div class="toolbar">
  <div class="container">
    <input id="searchBox" class="search-input" type="search" placeholder="Rechercher un produit, une catégorie ou une référence..." />
    <div class="cats" id="catBar">${categoryButtons}</div>
  </div>
</div>

<main class="container">
  <div id="productGrid" class="grid"></div>
  <div id="emptyState" class="empty" style="display:none;">Aucun produit ne correspond à votre recherche.</div>
</main>

<footer class="container">
  Catalogue autonome généré hors ligne avec ZANDO Pro · Fonctionne sans connexion Internet.
</footer>

<div class="cart-bar">
  <div>
    <div style="font-size:0.8rem;opacity:0.85;">Votre commande locale</div>
    <div id="cartSummary" style="font-weight:700;font-variant-numeric:tabular-nums;">0 article · 0 ${escapeHtml(catalog.currency)}</div>
  </div>
  <button type="button" id="openCartBtn" class="cart-btn">Voir le panier</button>
</div>

<div id="cartModal" class="modal-backdrop" role="dialog" aria-modal="true">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h2 style="font-size:1.15rem;font-weight:700;">Préparer ma commande WhatsApp</h2>
      <button type="button" id="closeCartBtn" style="border:none;background:#F1F5F9;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600;">Fermer</button>
    </div>
    <div id="cartItems"></div>
    <div id="cartTotalLine" style="margin-top:12px;font-weight:700;font-size:1.05rem;text-align:right;font-variant-numeric:tabular-nums;"></div>
    <div style="margin-top:14px;">
      <input id="buyerName" class="field" type="text" placeholder="Votre nom complet" />
      <input id="buyerAddress" class="field" type="text" placeholder="Quartier / Adresse de livraison" />
      <textarea id="buyerNotes" class="field" rows="2" placeholder="Précisions (taille, couleur, heure...)"></textarea>
    </div>
    <button type="button" id="sendWaBtn" class="wa-submit">Envoyer la commande sur WhatsApp</button>
  </div>
</div>

<script>
(function(){
  var DATA = ${embeddedDataJson};
  var currentCat = 'ALL';
  var searchQuery = '';
  var cart = {};

  function formatPrice(val) {
    return new Intl.NumberFormat('fr-FR').format(val) + ' ' + DATA.currency;
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderProducts() {
    var grid = document.getElementById('productGrid');
    var empty = document.getElementById('emptyState');
    var q = searchQuery.toLowerCase().trim();
    var filtered = DATA.products.filter(function(p) {
      var catOk = currentCat === 'ALL' || p.category === currentCat;
      var qOk = !q || (p.name + ' ' + p.description + ' ' + p.category + ' ' + p.sku).toLowerCase().indexOf(q) !== -1;
      return catOk && qOk;
    });

    if (!filtered.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    grid.innerHTML = filtered.map(function(p) {
      var out = DATA.showStock && p.stock <= 0;
      var stockHtml = '';
      if (DATA.showStock) {
        if (p.stock <= 0) stockHtml = '<div class="stock-text stock-out">Rupture de stock</div>';
        else if (p.stock <= 5) stockHtml = '<div class="stock-text stock-low">Stock limité : ' + p.stock + ' ' + esc(p.unit) + '</div>';
        else stockHtml = '<div class="stock-text stock-ok">Disponible (' + p.stock + ' ' + esc(p.unit) + ')</div>';
      }
      var promoHtml = p.promoLabel ? '<span class="promo-text">' + esc(p.promoLabel) + '</span>' : '';
      var oldPriceHtml = p.finalPrice < p.originalPrice ? '<span class="old-price">' + formatPrice(p.originalPrice) + '</span>' : '';
      var imgHtml = p.imageDataUrl
        ? '<img class="card-img" src="' + p.imageDataUrl + '" alt="' + esc(p.name) + '" />'
        : '<div class="card-placeholder">' + esc(p.category) + '</div>';

      return '<article class="card">' +
        imgHtml +
        '<div class="card-body">' +
          '<div class="meta">' + esc(p.category) + (p.sku ? ' · Réf. ' + esc(p.sku) : '') + '</div>' +
          '<div class="card-title">' + esc(p.name) + '</div>' +
          (p.description ? '<div class="card-desc">' + esc(p.description) + '</div>' : '') +
          '<div class="price-row"><span class="price">' + formatPrice(p.finalPrice) + '</span>' + oldPriceHtml + promoHtml + '</div>' +
          stockHtml +
          '<button type="button" class="add-btn" data-add="' + esc(p.id) + '"' + (out ? ' disabled' : '') + '>' + (out ? 'Indisponible' : 'Ajouter au panier') + '</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function updateCartBar() {
    var count = 0;
    var total = 0;
    Object.keys(cart).forEach(function(id) {
      var qty = cart[id];
      var prod = DATA.products.find(function(x) { return x.id === id; });
      if (prod && qty > 0) {
        count += qty;
        total += prod.finalPrice * qty;
      }
    });
    document.getElementById('cartSummary').textContent = count + ' article' + (count > 1 ? 's' : '') + ' · ' + formatPrice(total);
  }

  function renderCartModal() {
    var container = document.getElementById('cartItems');
    var totalLine = document.getElementById('cartTotalLine');
    var entries = Object.keys(cart).filter(function(id) { return cart[id] > 0; });
    if (!entries.length) {
      container.innerHTML = '<p style="color:#64748B;padding:12px 0;">Votre panier est vide.</p>';
      totalLine.textContent = '';
      return;
    }
    var total = 0;
    container.innerHTML = entries.map(function(id) {
      var prod = DATA.products.find(function(x) { return x.id === id; });
      if (!prod) return '';
      var qty = cart[id];
      var sub = prod.finalPrice * qty;
      total += sub;
      return '<div class="cart-item">' +
        '<div><div style="font-weight:600;">' + esc(prod.name) + '</div><div style="font-size:0.82rem;color:#64748B;">' + formatPrice(prod.finalPrice) + ' × ' + qty + ' = ' + formatPrice(sub) + '</div></div>' +
        '<div class="qty-ctrl">' +
          '<button type="button" class="qty-btn" data-dec="' + esc(id) + '">-</button>' +
          '<span style="font-weight:700;min-width:20px;text-align:center;">' + qty + '</span>' +
          '<button type="button" class="qty-btn" data-inc="' + esc(id) + '">+</button>' +
        '</div>' +
      '</div>';
    }).join('');
    totalLine.textContent = 'Total estimé : ' + formatPrice(total);
  }

  document.getElementById('catBar').addEventListener('click', function(e) {
    var btn = e.target.closest('.cat-btn');
    if (!btn) return;
    currentCat = btn.getAttribute('data-cat');
    document.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    renderProducts();
  });

  document.getElementById('searchBox').addEventListener('input', function(e) {
    searchQuery = e.target.value || '';
    renderProducts();
  });

  document.getElementById('productGrid').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-add]');
    if (!btn) return;
    var id = btn.getAttribute('data-add');
    cart[id] = (cart[id] || 0) + 1;
    updateCartBar();
    var orig = btn.textContent;
    btn.textContent = 'Ajouté ✓';
    setTimeout(function() { btn.textContent = orig; }, 700);
  });

  document.getElementById('openCartBtn').addEventListener('click', function() {
    renderCartModal();
    document.getElementById('cartModal').classList.add('open');
  });

  document.getElementById('closeCartBtn').addEventListener('click', function() {
    document.getElementById('cartModal').classList.remove('open');
  });

  document.getElementById('cartItems').addEventListener('click', function(e) {
    var inc = e.target.closest('[data-inc]');
    var dec = e.target.closest('[data-dec]');
    if (inc) {
      var id = inc.getAttribute('data-inc');
      cart[id] = (cart[id] || 0) + 1;
    } else if (dec) {
      var id2 = dec.getAttribute('data-dec');
      cart[id2] = Math.max(0, (cart[id2] || 0) - 1);
      if (cart[id2] === 0) delete cart[id2];
    }
    updateCartBar();
    renderCartModal();
  });

  document.getElementById('sendWaBtn').addEventListener('click', function() {
    var entries = Object.keys(cart).filter(function(id) { return cart[id] > 0; });
    if (!entries.length) return;
    var name = document.getElementById('buyerName').value.trim();
    var addr = document.getElementById('buyerAddress').value.trim();
    var notes = document.getElementById('buyerNotes').value.trim();
    var total = 0;
    var lines = ['Bonjour ' + DATA.storeName + ', je souhaite commander :'];
    entries.forEach(function(id) {
      var prod = DATA.products.find(function(x) { return x.id === id; });
      if (!prod) return;
      var q = cart[id];
      var sub = prod.finalPrice * q;
      total += sub;
      lines.push('- ' + q + 'x ' + prod.name + ' (' + formatPrice(sub) + ')');
    });
    lines.push('Total estimé : ' + formatPrice(total));
    if (name) lines.push('Client : ' + name);
    if (addr) lines.push('Livraison : ' + addr);
    if (notes) lines.push('Notes : ' + notes);

    var msg = encodeURIComponent(lines.join('\\n'));
    var waUrl = DATA.storePhone ? 'https://wa.me/' + DATA.storePhone + '?text=' + msg : 'https://wa.me/?text=' + msg;
    window.open(waUrl, '_blank');
  });

  renderProducts();
  updateCartBar();
})();
</script>
</body>
</html>`;
}

export function generateCatalogPdfBlob(catalog: SavedCatalog): Blob {
  const doc = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'a4'});
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return [15, 23, 42];
    return [
      parseInt(clean.slice(0, 2), 16) || 15,
      parseInt(clean.slice(2, 4), 16) || 23,
      parseInt(clean.slice(4, 6), 16) || 42,
    ];
  };

  const [pr, pg, pb] = hexToRgb(catalog.primaryColor);
  const [ar, ag, ab] = hexToRgb(catalog.accentColor);

  const drawHeader = () => {
    doc.setFillColor(pr, pg, pb);
    doc.rect(0, 0, pageW, 38, 'F');
    doc.setFillColor(ar, ag, ab);
    doc.rect(0, 38, pageW, 1.5, 'F');

    let textX = margin;
    if (catalog.logoDataUrl) {
      try {
        doc.addImage(catalog.logoDataUrl, 'JPEG', margin, 6, 24, 24);
        textX = margin + 28;
      } catch {
        // Ignore unsupported image format in PDF
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(catalog.title, textX, 15, {maxWidth: pageW - textX - margin});

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(catalog.storeName, textX, 22);

    const contactParts = [
      catalog.storePhone ? `WhatsApp: ${catalog.storePhone}` : '',
      catalog.storeAddress ? catalog.storeAddress : '',
      catalog.storeEmail ? catalog.storeEmail : '',
    ].filter(Boolean);
    if (contactParts.length > 0) {
      doc.setFontSize(8.5);
      doc.text(contactParts.join('  |  '), textX, 28, {maxWidth: pageW - textX - margin});
    }
    doc.setFontSize(8);
    doc.text(`Édité le ${formatDate(catalog.createdAt)} · ${catalog.products.length} articles`, textX, 34);
  };

  drawHeader();

  const colGap = 6;
  const colW = (pageW - margin * 2 - colGap) / 2;
  const cardH = 74;
  let y = 46;

  for (let i = 0; i < catalog.products.length; i++) {
    const col = i % 2;
    if (col === 0 && y + cardH > pageH - 16) {
      doc.addPage();
      y = 16;
    }

    const x = margin + col * (colW + colGap);
    const item = catalog.products[i];

    // Card outline
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, colW, cardH, 2.5, 2.5, 'FD');

    // Product image box
    if (item.imageDataUrl) {
      try {
        doc.addImage(item.imageDataUrl, 'JPEG', x + 2.5, y + 2.5, colW - 5, 38);
      } catch {
        doc.setFillColor(241, 245, 249);
        doc.rect(x + 2.5, y + 2.5, colW - 5, 38, 'F');
      }
    } else {
      doc.setFillColor(241, 245, 249);
      doc.rect(x + 2.5, y + 2.5, colW - 5, 38, 'F');
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8.5);
      doc.text(item.category, x + colW / 2, y + 22, {align: 'center'});
    }

    // Category + SKU
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const meta = item.sku ? `${item.category} · ${item.sku}` : item.category;
    doc.text(meta.slice(0, 42), x + 3.5, y + 45.5);

    // Name
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(item.name.slice(0, 34), x + 3.5, y + 51);

    // Short description
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const descLine = (item.description || '').replace(/\s+/g, ' ').slice(0, 62);
    if (descLine) {
      doc.text(descLine, x + 3.5, y + 56, {maxWidth: colW - 7});
    }

    // Price & promo
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const priceText = formatMoney(item.finalPrice, catalog.currency);
    doc.text(priceText, x + 3.5, y + 66.5);

    if (item.promoLabel) {
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(8.5);
      doc.text(item.promoLabel, x + colW - 3.5, y + 66.5, {align: 'right'});
    }

    // Stock line
    if (catalog.showStock) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      if (item.stock <= 0) {
        doc.setTextColor(220, 38, 38);
        doc.text('Rupture de stock', x + 3.5, y + 71.2);
      } else {
        doc.setTextColor(5, 150, 105);
        doc.text(`Disponible : ${item.stock} ${item.unit}`, x + 3.5, y + 71.2);
      }
    }

    if (col === 1 || i === catalog.products.length - 1) {
      y += cardH + 5;
    }
  }

  // Page footer numbering
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${catalog.storeName} · Généré hors ligne avec ZANDO Pro`, margin, pageH - 7);
    doc.text(`Page ${p}/${totalPages}`, pageW - margin, pageH - 7, {align: 'right'});
  }

  return doc.output('blob');
}
