/* ===== WholyKitchen - Shopping Cart =====
   Lightweight, dependency-free cart stored in the browser (localStorage).
   Exposes window.WKCart and window.WKmoney for the checkout page.

   NOTE: prices here are for DISPLAY ONLY. The Netlify function
   (create-checkout-session) re-verifies every price server-side from its
   own catalog, so a tampered browser price can never affect what's charged.
*/
(function () {
  'use strict';

  // Product catalog — keep IDs in sync with the server function's CATALOG.
  const CATALOG = {
    'creamy-peanut-thai': { name: 'Creamy Peanut Thai', price: 1200, image: 'images/creamy-peanut-thai.png' },
    'sweet-golden-tang':  { name: 'Sweet Golden Tang',  price: 1100, image: 'images/sweet-golden-tang.png' },
    'crack':              { name: 'Crack',              price: 750,  image: 'images/crack.jpeg' },
  };

  const KEY = 'wk_cart';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function write(cart) {
    localStorage.setItem(KEY, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent('wk-cart-change'));
  }

  const Cart = {
    catalog: CATALOG,
    raw: read,
    items() {
      const c = read();
      return Object.keys(c)
        .filter(id => CATALOG[id])
        .map(id => ({ id, qty: c[id], name: CATALOG[id].name, price: CATALOG[id].price,
                      image: CATALOG[id].image, lineTotal: CATALOG[id].price * c[id] }));
    },
    add(id, qty) {
      if (!CATALOG[id]) return;
      qty = qty || 1;
      const c = read();
      c[id] = Math.min((c[id] || 0) + qty, 99);
      write(c);
    },
    setQty(id, qty) {
      const c = read();
      qty = Math.max(0, Math.min(parseInt(qty, 10) || 0, 99));
      if (qty === 0) { delete c[id]; } else { c[id] = qty; }
      write(c);
    },
    remove(id) { const c = read(); delete c[id]; write(c); },
    clear() { write({}); },
    count() { return Object.values(read()).reduce((a, b) => a + b, 0); },
    subtotal() { return this.items().reduce((a, i) => a + i.lineTotal, 0); },
  };

  window.WKCart = Cart;
  window.WKmoney = function (cents) { return '$' + (cents / 100).toFixed(2); };

  // --- Floating cart button (auto-appears site-wide when cart has items) ---
  function renderFloating() {
    let btn = document.getElementById('wk-cart-fab');
    const count = Cart.count();
    if (count === 0) { if (btn) btn.remove(); return; }
    if (!btn) {
      btn = document.createElement('a');
      btn.id = 'wk-cart-fab';
      btn.href = 'checkout.html';
      btn.setAttribute('aria-label', 'View cart and check out');
      document.body.appendChild(btn);
    }
    btn.innerHTML =
      '<span class="wk-fab-icon" aria-hidden="true">🛒</span>' +
      '<span class="wk-fab-count">' + count + '</span>' +
      '<span class="wk-fab-total">' + window.WKmoney(Cart.subtotal()) + '</span>';
  }

  // --- Cart count badge in the navbar (any [data-wk-cart-count] element) ---
  function renderNavCount() {
    const count = Cart.count();
    document.querySelectorAll('[data-wk-cart-count]').forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });
  }

  // --- Lightweight toast feedback ---
  function toast(msg) {
    let t = document.getElementById('wk-toast');
    if (!t) { t = document.createElement('div'); t.id = 'wk-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Wire any [data-add="<product-id>"] buttons to add to cart
    document.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        const id = b.getAttribute('data-add');
        if (!CATALOG[id]) return;
        Cart.add(id, 1);
        toast('Added ' + CATALOG[id].name + ' to cart');
      });
    });
    renderFloating();
    renderNavCount();
  });
  document.addEventListener('wk-cart-change', function () {
    renderFloating();
    renderNavCount();
  });
})();
