(function () {
  'use strict';

  const L = window.FoodieLogic;
  const D = window.FoodieData;
  const T = window.FoodieTests;

  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const toasts = document.getElementById('toasts');

  const STORE_KEY = 'foodie.state.v1';
  const TEST_USER = '9876543210';
  const FREE_DELIVERY_AT = 199;
  const GITHUB_REPO = 'https://github.com/VeNoM-hubs/FoodieTest';
  const GITHUB_README = GITHUB_REPO + '#testing';
  const ADDRESSES = [
    { id: 'home', label: 'Home', line: '12, 4th Cross Street, T. Nagar', city: 'Chennai, Tamil Nadu 600017' },
    { id: 'work', label: 'Work', line: 'Tidel Park, Rajiv Gandhi Salai, Taramani', city: 'Chennai, Tamil Nadu 600113' },
  ];
  const STATUS_TEXT = {
    'Placed': 'Order received by the restaurant',
    'Preparing': 'The kitchen is preparing your food',
    'Out for delivery': 'Ravi is on the way with your order',
    'Delivered': 'Enjoy your meal!',
  };

  const defaults = () => ({
    user: null,
    lastActive: Date.now(),
    cart: { restaurantId: null, items: {} },
    coupon: null,
    orders: [],
    nextOrderNo: 10482,
    sandbox: 'approve',
    addressId: 'home',
    payMethod: 'UPI',
    upiId: '',
    vegOnly: false,
    guideSeen: false,
  });

  let state = loadState();
  let ui = freshUi();
  let pageTimer = null;
  let lastSaved = 0;
  let guideOpen = false;
  let guidePromise = null;
  let readmeCache = null;

  function freshUi() {
    return {
      couponMsg: null,
      login: { step: 'mobile', mobile: '', error: '' },
      card: { number: '', exp: '', cvv: '' },
      labResults: {},
      labRan: false,
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      return Object.assign(defaults(), saved || {});
    } catch (e) {
      return defaults();
    }
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  /* ---------- helpers ---------- */

  const fmt = L.formatINR;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = hash.split('?');
    return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs || '') };
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function toast(message, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = message;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function openModal(html, extraClass) {
    guideOpen = extraClass === 'guide';
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal ${extraClass || ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    updateGuideIndicator();
  }

  function closeModal() {
    modalRoot.innerHTML = '';
    modalRoot.onclick = null;
    if (guideOpen) {
      guideOpen = false;
      updateGuideIndicator();
    }
  }

  function confirmDialog(title, text, okLabel) {
    return new Promise((resolve) => {
      openModal(`
        <h3>${esc(title)}</h3>
        <p class="muted" style="margin-top:8px">${esc(text)}</p>
        <div class="modal-actions">
          <button class="btn ghost" data-modal="cancel">No</button>
          <button class="btn" data-modal="ok">${esc(okLabel)}</button>
        </div>`);
      modalRoot.onclick = (e) => {
        const btn = e.target.closest('[data-modal]');
        if (!btn) return;
        closeModal();
        resolve(btn.dataset.modal === 'ok');
      };
    });
  }

  function dietIcon(veg) {
    return `<span class="diet ${veg ? 'veg' : 'nonveg'}" title="${veg ? 'Veg' : 'Non-veg'}"></span>`;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function couponExpired(coupon) {
    return L.isoDate(new Date()) > coupon.expires;
  }

  /* ---------- cart ---------- */

  function cartLines() {
    return Object.entries(state.cart.items).map(([id, qty]) => {
      const found = D.findDish(id);
      if (!found) return null;
      const { dish } = found;
      return { id, name: dish.name, price: dish.price, veg: dish.veg, emoji: dish.emoji, qty };
    }).filter(Boolean);
  }

  function cartCount() {
    return Object.values(state.cart.items).reduce((a, b) => a + b, 0);
  }

  function cartRestaurant() {
    return D.findRestaurant(state.cart.restaurantId);
  }

  function currentBill() {
    return L.buildBill(cartLines(), state.coupon, new Date());
  }

  function setQty(dishId, qty) {
    if (qty <= 0) delete state.cart.items[dishId];
    else state.cart.items[dishId] = qty;
    if (!Object.keys(state.cart.items).length) {
      state.cart.restaurantId = null;
      state.coupon = null;
      ui.couponMsg = null;
    }
    save();
  }

  async function addDish(dishId) {
    const found = D.findDish(dishId);
    if (!found) return;
    const { restaurant } = found;
    const current = cartRestaurant();
    if (current && current.id !== restaurant.id && cartCount() > 0) {
      const ok = await confirmDialog(
        'Items already in cart',
        `Your cart contains dishes from ${current.name}. Do you want to discard the selection and add dishes from ${restaurant.name}?`,
        'Yes, start afresh');
      if (!ok) return;
      state.cart = { restaurantId: null, items: {} };
      state.coupon = null;
      ui.couponMsg = null;
    }
    state.cart.restaurantId = restaurant.id;
    setQty(dishId, (state.cart.items[dishId] || 0) + 1);
    render();
  }

  function increment(dishId) {
    const qty = state.cart.items[dishId] || 0;
    if (!L.canIncrement(qty)) {
      toast(`You can add up to ${L.MAX_QTY} of this dish`, 'error');
      return;
    }
    setQty(dishId, qty + 1);
    render();
  }

  function decrement(dishId) {
    setQty(dishId, (state.cart.items[dishId] || 0) - 1);
    render();
  }

  function typedQty(dishId, value) {
    const result = L.validateQuantity(value);
    if (!result.ok) {
      toast(result.message, 'error');
    } else {
      setQty(dishId, result.qty);
    }
    render();
  }

  function applyCouponCode(code) {
    if (!String(code || '').trim()) {
      ui.couponMsg = { ok: false, text: 'Enter a coupon code' };
      render();
      return;
    }
    const result = L.applyCoupon(code, L.itemTotal(cartLines()), new Date());
    ui.couponMsg = { ok: result.ok, text: result.message };
    if (result.ok) {
      state.coupon = result.code;
      toast(result.message, 'success');
    }
    save();
    render();
  }

  /* ---------- session (BR-07) ---------- */

  function checkSession() {
    if (state.user && L.isSessionExpired(state.lastActive)) {
      expireSession();
      return true;
    }
    return false;
  }

  function expireSession() {
    state.user = null;
    save();
    closeModal();
    toast('Session expired after 15 minutes of inactivity. Please sign in again.', 'error');
    go('#/login');
  }

  function touch() {
    if (!state.user || checkSession()) return;
    state.lastActive = Date.now();
    if (state.lastActive - lastSaved > 5000) {
      lastSaved = state.lastActive;
      save();
    }
  }

  function signInTestUser() {
    state.user = { mobile: TEST_USER };
    state.lastActive = Date.now();
    if (!state.upiId) state.upiId = TEST_USER + '@ybl';
  }

  /* ---------- payment (BR-06) ---------- */

  function findOrder(id) {
    return state.orders.find((o) => o.id === id) || null;
  }

  function pay() {
    const lines = cartLines();
    const restaurant = cartRestaurant();
    if (!lines.length || !restaurant) return;

    if (state.payMethod === 'UPI') {
      if (!/^[\w.-]{2,}@[a-z]{2,}$/i.test((state.upiId || '').trim())) {
        toast('Enter a valid UPI ID, e.g. name@okaxis', 'error');
        return;
      }
    } else {
      const { number, exp, cvv } = ui.card;
      if (!/^\d{16}$/.test(number.replace(/\s/g, '')) || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp) || !/^\d{3}$/.test(cvv)) {
        toast('Enter a valid card number, expiry (MM/YY) and CVV', 'error');
        return;
      }
    }

    const address = ADDRESSES.find((a) => a.id === state.addressId) || ADDRESSES[0];
    const order = L.createOrder({
      id: 'FO' + state.nextOrderNo,
      restaurant,
      lines,
      bill: currentBill(),
      method: state.payMethod,
      address: `${address.label}: ${address.line}, ${address.city}`,
    });
    state.nextOrderNo += 1;
    state.orders.unshift(order);
    state.cart = { restaurantId: null, items: {} };
    state.coupon = null;
    ui.couponMsg = null;
    save();
    processPayment(order.id);
  }

  function processPayment(orderId) {
    const order = findOrder(orderId);
    if (!order) return;
    const mode = state.sandbox;
    openModal(`
      <div style="text-align:center">
        <div class="spinner"></div>
        <h3>Processing payment</h3>
        <p class="muted" style="margin-top:6px">${fmt(order.amount)} via ${esc(order.method)} · FOODIE Pay sandbox</p>
        <p class="small muted" style="margin-top:10px">Gateway mode: <b>${mode === 'decline' ? 'Decline' : 'Approve'}</b></p>
      </div>`);
    setTimeout(() => {
      const result = L.sandboxCharge(order.amount, mode);
      L.recordPayment(order, result);
      save();
      closeModal();
      if (result.success) toast('Payment successful. Your order is confirmed!', 'success');
      else toast('Payment failed: ' + result.reason, 'error');
      go('#/order/' + order.id);
    }, 1600);
  }

  /* ---------- shared fragments ---------- */

  function dishControl(dish) {
    const qty = state.cart.items[dish.id] || 0;
    if (!qty) {
      return `<button class="add-btn" data-action="add" data-id="${dish.id}" aria-label="Add ${esc(dish.name)}">ADD</button>`;
    }
    return `
      <div class="stepper">
        <button data-action="dec" data-id="${dish.id}" aria-label="Decrease">−</button>
        <span class="qty">${qty}</span>
        <button data-action="inc" data-id="${dish.id}" aria-label="Increase" ${L.canIncrement(qty) ? '' : 'disabled title="Max 10 per dish"'}>+</button>
      </div>`;
  }

  function billHtml(bill) {
    const fee = bill.deliveryFee > 0
      ? fmt(bill.deliveryFee)
      : '<span class="free"><span class="strike">₹40</span>FREE</span>';
    const feeHint = bill.itemTotal < FREE_DELIVERY_AT
      ? `Add ${fmt(FREE_DELIVERY_AT - bill.itemTotal)} more for FREE delivery`
      : `Free delivery on orders of ${fmt(FREE_DELIVERY_AT)} or more`;
    return `
      <div class="bill">
        <h3>Bill details</h3>
        <div class="bill-row"><span>Item total</span><span>${fmt(bill.itemTotal)}</span></div>
        <div class="bill-row"><span>Delivery fee<span class="hint">${feeHint}</span></span><span>${fee}</span></div>
        <div class="bill-row"><span>Taxes &amp; charges<span class="hint">5% GST + ₹40 packaging on orders above ₹1,000</span></span><span>${fmt(bill.charges)}</span></div>
        ${bill.discount ? `<div class="bill-row discount"><span>Coupon discount (${esc(bill.coupon.code)})</span><span>−${fmt(bill.discount)}</span></div>` : ''}
        <div class="bill-row total"><span>To pay</span><span>${fmt(bill.toPay)}</span></div>
      </div>`;
  }

  function sandboxControl() {
    const mode = state.sandbox;
    return `
      <div class="sandbox">
        <div>
          <b class="small">🧪 Sandbox payment gateway</b>
          <div class="muted small">Test build only: choose how the bank responds</div>
        </div>
        <div class="segmented" role="group" aria-label="Sandbox gateway mode">
          <button class="${mode === 'approve' ? 'on approve' : ''}" data-action="sandbox" data-mode="approve">Approve</button>
          <button class="${mode === 'decline' ? 'on decline' : ''}" data-action="sandbox" data-mode="decline">Decline</button>
        </div>
      </div>`;
  }

  function restCard(r) {
    return `
      <a class="rest-card" href="#/restaurant/${r.id}">
        <div class="rest-img" style="background:${r.tint}">${r.emoji}<div class="rest-offer">₹100 OFF ABOVE ₹299</div></div>
        <div class="rest-name">${esc(r.name)}</div>
        <div class="rest-meta"><span class="star">★</span>${r.rating} · ${r.eta}</div>
        <div class="rest-sub">${esc(r.cuisines.join(', '))}</div>
        <div class="rest-sub">${esc(r.area)}</div>
      </a>`;
  }

  function emptyState(art, title, text, cta, href) {
    return `
      <div class="empty">
        <div class="empty-art">${art}</div>
        <h2>${title}</h2>
        <p>${text}</p>
        ${cta ? `<a class="btn" href="${href}">${cta}</a>` : ''}
      </div>`;
  }

  /* ---------- views ---------- */

  function homeView() {
    const offers = Object.entries(L.COUPONS).map(([code, c], i) => {
      const expired = couponExpired(c);
      return `
        <div class="offer ${expired ? 'expired' : i % 2 ? 'alt' : ''}">
          <div class="offer-code">${code}</div>
          <div class="offer-text">${esc(c.title)}${expired ? ' · Expired' : ''}</div>
        </div>`;
    }).join('');

    return `
      <section class="hero">
        <div>
          <h1>Hungry? Order food from<br>the best restaurants in Chennai</h1>
          <p>Free delivery on orders of ₹199 or more · Use FEAST100 for ₹100 off</p>
          <form class="hero-search" id="hero-search">
            <input class="input" name="q" placeholder="Search for restaurants and food" aria-label="Search">
            <button class="btn ghost" type="submit">Search</button>
          </form>
        </div>
        <div class="hero-art">🍱</div>
      </section>

      <h2 class="section-title">What's on your mind?</h2>
      <div class="categories">
        ${D.CATEGORIES.map((c) => `
          <a class="category" href="#/search?q=${encodeURIComponent(c.label)}">
            <span class="category-emoji">${c.emoji}</span>${c.label}
          </a>`).join('')}
      </div>

      <h2 class="section-title">Best offers for you</h2>
      <div class="offers">${offers}</div>

      <h2 class="section-title">Restaurants with online food delivery in Chennai</h2>
      <div class="restaurants">${D.RESTAURANTS.map(restCard).join('')}</div>`;
  }

  function searchView(q) {
    return `
      <form class="hero-search" id="search-form" style="max-width:none;margin:0 0 20px">
        <input class="input" id="search-input" name="q" value="${esc(q)}" placeholder="Search for restaurants and food" aria-label="Search" autocomplete="off">
      </form>
      <div id="search-results">${searchResults(q)}</div>`;
  }

  function searchResults(q) {
    if (!q.trim()) {
      return `
        <h2 class="section-title" style="margin-top:0">Popular cuisines</h2>
        <div class="categories">
          ${D.CATEGORIES.map((c) => `
            <a class="category" href="#/search?q=${encodeURIComponent(c.label)}">
              <span class="category-emoji">${c.emoji}</span>${c.label}
            </a>`).join('')}
        </div>`;
    }
    const { restaurants, dishes } = D.search(q);
    if (!restaurants.length && !dishes.length) {
      return emptyState('🔍', 'No results', `We couldn't find anything for “${esc(q)}”. Try “biryani” or “burger”.`);
    }
    return `
      ${restaurants.length ? `
        <h2 class="section-title" style="margin-top:0">Restaurants</h2>
        <div class="restaurants">${restaurants.map(restCard).join('')}</div>` : ''}
      ${dishes.length ? `
        <h2 class="section-title">Dishes</h2>
        <div class="card">
          ${dishes.map(({ restaurant, dish }) => `
            <div class="dish">
              <div class="dish-info">
                <a class="muted small" href="#/restaurant/${restaurant.id}">By ${esc(restaurant.name)} →</a>
                <div class="row" style="margin-top:6px">${dietIcon(dish.veg)}</div>
                <div class="dish-name">${esc(dish.name)}</div>
                <div class="dish-price">${fmt(dish.price)}</div>
              </div>
              <div class="dish-media">
                <div class="dish-img">${dish.emoji}</div>
                <div class="add-wrap">${dishControl(dish)}</div>
              </div>
            </div>`).join('')}
        </div>` : ''}`;
  }

  function restaurantView(id) {
    const r = D.findRestaurant(id);
    if (!r) return emptyState('🍽️', 'Restaurant not found', 'It may have moved.', 'Back to home', '#/');
    const dishes = r.menu.filter((d) => !state.vegOnly || d.veg);
    const inCart = state.cart.restaurantId === r.id && cartCount() > 0;

    return `
      <div class="crumbs"><a href="#/">Home</a> / <a href="#/search?q=${encodeURIComponent(r.cuisines[0])}">Chennai</a> / ${esc(r.name)}</div>
      <section class="rest-head">
        <h1>${esc(r.name)}</h1>
        <div class="card rest-info">
          <div class="rest-meta"><span class="star">★</span>${r.rating} (1K+ ratings) · ${fmt(r.costForTwo)} for two</div>
          <div class="link" style="margin-top:6px">${esc(r.cuisines.join(', '))}</div>
          <div class="small muted" style="margin-top:8px">📍 ${esc(r.area)} · ⏱ ${r.eta}</div>
          <div class="small" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">🛵 Free delivery on orders of ₹199 or more</div>
        </div>
      </section>

      <div class="offers" style="margin-top:18px">
        ${Object.entries(L.COUPONS).filter(([, c]) => !couponExpired(c)).map(([code, c]) => `
          <div class="card row" style="padding:12px">
            <span style="font-size:24px">🏷️</span>
            <div><b>${esc(c.title)}</b><div class="small muted">USE ${code}</div></div>
          </div>`).join('')}
      </div>

      <div class="menu-tools">
        <h2 style="font-size:18px">Recommended (${dishes.length})</h2>
        <label class="toggle"><input type="checkbox" data-change="veg-only" ${state.vegOnly ? 'checked' : ''}><span class="track"></span>Veg only</label>
      </div>

      ${dishes.map((d) => `
        <div class="dish">
          <div class="dish-info">
            <div class="row">${dietIcon(d.veg)}${d.bestseller ? '<span class="bestseller">★ Bestseller</span>' : ''}</div>
            <div class="dish-name">${esc(d.name)}</div>
            <div class="dish-price">${fmt(d.price)}</div>
            <div class="dish-desc">${esc(d.desc)}</div>
          </div>
          <div class="dish-media">
            <div class="dish-img">${d.emoji}</div>
            <div class="add-wrap">${dishControl(d)}</div>
          </div>
        </div>`).join('') || emptyState('🥦', 'No veg dishes', 'Turn off “Veg only” to see the full menu.')}

      ${inCart ? `
        <a class="cart-bar" href="#/cart">
          <span>${cartCount()} item${cartCount() > 1 ? 's' : ''} added · ${fmt(L.itemTotal(cartLines()))}</span>
          <span>VIEW CART 🛒</span>
        </a>` : ''}`;
  }

  function cartView() {
    const lines = cartLines();
    const r = cartRestaurant();
    if (!lines.length || !r) {
      return emptyState('🛒', 'Your cart is empty', 'You can go to the home page to view more restaurants.', 'See restaurants near you', '#/');
    }
    const bill = currentBill();

    return `
      <h1 class="page-title">Cart</h1>
      <div class="two-col">
        <div>
          <div class="card">
            <div class="cart-rest">
              <div class="cart-rest-img" style="background:${r.tint}">${r.emoji}</div>
              <div><b>${esc(r.name)}</b><div class="muted small">${esc(r.area)}, Chennai</div></div>
            </div>
            ${lines.map((l) => `
              <div class="cart-line">
                ${dietIcon(l.veg)}
                <div class="cart-line-name">${esc(l.name)}<div class="muted small">${fmt(l.price)} each</div></div>
                <div class="stepper">
                  <button data-action="dec" data-id="${l.id}" aria-label="Decrease">−</button>
                  <input class="qty-input" type="number" inputmode="numeric" value="${l.qty}" data-qty-for="${l.id}" aria-label="Quantity of ${esc(l.name)}">
                  <button data-action="inc" data-id="${l.id}" aria-label="Increase" ${L.canIncrement(l.qty) ? '' : 'disabled title="Max 10 per dish"'}>+</button>
                </div>
                <div class="cart-line-total">${fmt(l.price * l.qty)}</div>
              </div>`).join('')}
            <a href="#/restaurant/${r.id}" class="link-btn small" style="display:inline-block;margin-top:10px">+ Add more items</a>
          </div>

          <div class="card">${couponSection(bill)}</div>
        </div>

        <div>
          <div class="card">
            ${billHtml(bill)}
            <button class="btn block" style="margin-top:16px" data-action="to-checkout">
              ${state.user ? `Proceed to checkout · ${fmt(bill.toPay)}` : 'Sign in to proceed'}
            </button>
          </div>
        </div>
      </div>`;
  }

  function couponSection(bill) {
    let applied = '';
    if (state.coupon) {
      const c = bill.coupon;
      applied = c && c.ok
        ? `<div class="applied spread"><div><b>‘${esc(c.code)}’ applied</b><div class="small">You saved ${fmt(c.discount)} on this order</div></div><button class="link-btn" data-action="remove-coupon">Remove</button></div>`
        : `<div class="applied spread" style="background:var(--orange-soft);border-color:#ffd2ad"><div><b>${esc(state.coupon)}</b><div class="small">${esc(c ? c.message : '')}</div></div><button class="link-btn" data-action="remove-coupon">Remove</button></div>`;
    }
    const msg = ui.couponMsg && !(state.coupon && ui.couponMsg.ok)
      ? `<div class="${ui.couponMsg.ok ? 'success-text' : 'error-text'}" id="coupon-msg">${esc(ui.couponMsg.text)}</div>`
      : '';

    return `
      <h3 style="font-size:16px;margin-bottom:12px">Apply coupon</h3>
      ${applied || `
        <form class="coupon-form" id="coupon-form">
          <input class="input" name="code" placeholder="Enter coupon code" autocomplete="off" aria-label="Coupon code">
          <button class="btn" type="submit">Apply</button>
        </form>
        ${msg}`}
      <div class="coupon-list">
        ${Object.entries(L.COUPONS).map(([code, c]) => `
          <button class="coupon-chip" data-action="apply-coupon" data-code="${code}" ${state.coupon === code ? 'disabled' : ''}>
            <span><strong>${code}</strong><span class="muted small" style="display:block">${esc(c.title)} · min order ${fmt(c.minCart)}</span></span>
            <span class="pill ${couponExpired(c) ? 'red' : 'orange'}">${couponExpired(c) ? 'Expired' : 'Apply'}</span>
          </button>`).join('')}
      </div>`;
  }

  function checkoutView() {
    if (!state.user) { location.hash = '#/login?next=checkout'; return null; }
    const lines = cartLines();
    const r = cartRestaurant();
    if (!lines.length || !r) { location.hash = '#/cart'; return null; }
    const bill = currentBill();
    if (!state.upiId) state.upiId = state.user.mobile + '@ybl';

    return `
      <h1 class="page-title">Checkout</h1>
      <div class="two-col">
        <div>
          <div class="card">
            <h3 style="font-size:16px;margin-bottom:12px">Delivery address</h3>
            <div class="stack">
              ${ADDRESSES.map((a) => `
                <div class="address ${state.addressId === a.id ? 'selected' : ''}" data-action="address" data-id="${a.id}" role="radio" aria-checked="${state.addressId === a.id}" tabindex="0">
                  <input type="radio" tabindex="-1" aria-hidden="true" style="pointer-events:none" ${state.addressId === a.id ? 'checked' : ''}>
                  <div><b>${a.label}</b><div class="small muted">${esc(a.line)}</div><div class="small muted">${esc(a.city)}</div></div>
                </div>`).join('')}
            </div>
          </div>

          <div class="card">
            <h3 style="font-size:16px;margin-bottom:12px">Payment method</h3>
            <div class="stack">
              <div class="pay-option ${state.payMethod === 'UPI' ? 'selected' : ''}" data-action="pay-method" data-method="UPI">
                <input type="radio" tabindex="-1" aria-hidden="true" style="pointer-events:none" ${state.payMethod === 'UPI' ? 'checked' : ''}>
                <div><b>UPI</b><div class="small muted">Google Pay, PhonePe, Paytm and more</div></div>
              </div>
              <div class="pay-option ${state.payMethod === 'Card' ? 'selected' : ''}" data-action="pay-method" data-method="Card">
                <input type="radio" tabindex="-1" aria-hidden="true" style="pointer-events:none" ${state.payMethod === 'Card' ? 'checked' : ''}>
                <div><b>Credit / Debit card</b><div class="small muted">Visa, Mastercard, RuPay</div></div>
              </div>
            </div>
            <div class="pay-fields">
              ${state.payMethod === 'UPI' ? `
                <div class="field"><label for="upi-id">UPI ID</label>
                  <input class="input" id="upi-id" value="${esc(state.upiId)}" placeholder="yourname@okaxis" autocomplete="off"></div>` : `
                <div class="field"><label for="card-number">Card number</label>
                  <input class="input" id="card-number" value="${esc(ui.card.number)}" placeholder="4111 1111 1111 1111" inputmode="numeric" autocomplete="off"></div>
                <div class="split">
                  <div class="field"><label for="card-exp">Expiry (MM/YY)</label><input class="input" id="card-exp" value="${esc(ui.card.exp)}" placeholder="12/28" autocomplete="off"></div>
                  <div class="field"><label for="card-cvv">CVV</label><input class="input" id="card-cvv" value="${esc(ui.card.cvv)}" placeholder="123" inputmode="numeric" autocomplete="off"></div>
                </div>`}
              ${sandboxControl()}
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <div class="cart-rest">
              <div class="cart-rest-img" style="background:${r.tint}">${r.emoji}</div>
              <div><b>${esc(r.name)}</b><div class="muted small">${cartCount()} item${cartCount() > 1 ? 's' : ''}</div></div>
            </div>
            ${lines.map((l) => `
              <div class="bill-row small"><span>${dietIcon(l.veg)} ${esc(l.name)} × ${l.qty}</span><span>${fmt(l.price * l.qty)}</span></div>`).join('')}
            <div style="margin-top:14px">${billHtml(bill)}</div>
            <button class="btn block green" style="margin-top:16px" data-action="pay">Pay ${fmt(bill.toPay)}</button>
            <a href="#/cart" class="link-btn small" style="display:block;text-align:center;margin-top:10px">Edit cart</a>
          </div>
        </div>
      </div>`;
  }

  function loginView(next) {
    if (state.user) { location.hash = '#/' + (next || ''); return null; }
    const s = ui.login;
    if (s.step === 'otp') {
      return `
        <div class="auth-wrap card">
          <div class="auth-art">🔐</div>
          <h1>Enter OTP</h1>
          <p class="muted" style="margin:6px 0 18px">Sent to +91 ${esc(s.mobile)} · <button class="link-btn" data-action="change-number">Change</button></p>
          <form id="otp-form" class="stack">
            <div class="field">
              <label for="otp">One-time password</label>
              <input class="input ${s.error ? 'invalid' : ''}" id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="4-digit OTP" autofocus>
              ${s.error ? `<div class="error-text">${esc(s.error)}</div>` : ''}
            </div>
            <button class="btn block" type="submit">Verify &amp; continue</button>
            <p class="small muted">Sandbox OTP: <b>${L.SANDBOX_OTP}</b></p>
          </form>
        </div>`;
    }
    return `
      <div class="auth-wrap card">
        <div class="auth-art">🍔</div>
        <h1>Login / Sign up</h1>
        <p class="muted" style="margin:6px 0 18px">Enter your mobile number to continue</p>
        <form id="mobile-form" class="stack" novalidate>
          <div class="field">
            <label for="mobile">Mobile number</label>
            <div class="prefix-input">
              <span class="prefix">+91</span>
              <input class="input ${s.error ? 'invalid' : ''}" id="mobile" name="mobile" type="tel" inputmode="numeric" value="${esc(s.mobile)}" placeholder="10-digit mobile number" autocomplete="tel-national" autofocus>
            </div>
            ${s.error ? `<div class="error-text" id="mobile-error">${esc(s.error)}</div>` : ''}
          </div>
          <button class="btn block" type="submit">Send OTP</button>
          <p class="small muted">By continuing, you agree to FOODIE's Terms of Service and Privacy Policy.</p>
        </form>
      </div>`;
  }

  function ordersView() {
    if (!state.orders.length) {
      return emptyState('🧾', 'No orders yet', 'Your past orders will show up here.', 'Order now', '#/');
    }
    return `
      <h1 class="page-title">Your orders</h1>
      ${state.orders.map((o) => {
        const status = L.trackingStatus(o);
        return `
          <a class="card order-card" href="#/order/${o.id}">
            <div>
              <b>${esc(o.restaurantName)}</b> <span class="muted small">#${o.id}</span>
              <div class="small muted">${o.lines.map((l) => `${esc(l.name)} × ${l.qty}`).join(', ')}</div>
              <div class="small muted">${formatTime(o.createdAt)}</div>
            </div>
            <div class="row" style="flex-wrap:wrap">
              <span class="pill ${status === 'Delivered' ? 'green' : 'orange'}">${status === 'Placed' ? 'Order Placed' : status}</span>
              <span class="pill ${o.payment === 'Success' ? 'green' : o.payment === 'Failed' ? 'red' : ''}">Payment ${o.payment}</span>
              <b>${fmt(o.amount)}</b>
            </div>
          </a>`;
      }).join('')}`;
  }

  function orderView(id) {
    const o = findOrder(id);
    if (!o) return emptyState('🧾', 'Order not found', 'Check your order history.', 'View orders', '#/orders');
    const status = L.trackingStatus(o);
    const idx = L.STATUS_FLOW.indexOf(status);
    const paymentPill = o.payment === 'Success' ? 'green' : o.payment === 'Failed' ? 'red' : 'orange';

    return `
      <div class="crumbs"><a href="#/orders">Orders</a> / #${o.id}</div>
      <h1 class="page-title">Order status</h1>
      <div class="two-col">
        <div>
          <div class="card status-hero">
            <h2>Order #${o.id}</h2>
            <div class="status-badge">✓ ${status === 'Placed' ? 'Order Placed' : status}</div>
            ${o.payment === 'Failed' ? '<p class="error-text" style="font-size:15px;margin-top:12px">Payment could not be completed</p>' : ''}
            ${o.payment === 'Pending' ? '<p class="muted" style="margin-top:12px">Waiting for payment confirmation…</p>' : ''}
            <p class="muted small" style="margin-top:10px">${esc(o.restaurantName)} · ${formatTime(o.createdAt)}</p>
          </div>

          <div class="card">
            <h3 style="font-size:16px">Live tracking</h3>
            <ul class="timeline">
              ${L.STATUS_FLOW.map((s, i) => `
                <li class="${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}">
                  <span class="dot">${i < idx ? '✓' : ''}</span>
                  <div><b>${s === 'Placed' ? 'Order Placed' : s}</b><div class="small muted">${STATUS_TEXT[s]}</div></div>
                </li>`).join('')}
            </ul>
          </div>
        </div>

        <div>
          <div class="card">
            <h3 style="font-size:16px;margin-bottom:12px">Payment</h3>
            <dl class="kv">
              <dt>Method</dt><dd>${esc(o.method)}</dd>
              <dt>Status</dt><dd><span class="pill ${paymentPill}">${o.payment}</span></dd>
              <dt>Amount</dt><dd>${fmt(o.amount)}</dd>
              <dt>Transaction</dt><dd class="mono">${o.txnId ? esc(o.txnId) : '—'} ${o.payment === 'Failed' ? '<span class="pill red">FAILED</span>' : ''}</dd>
            </dl>
            ${o.payment !== 'Success' ? `
              <div style="margin-top:14px">${sandboxControl()}</div>
              <button class="btn outline block" style="margin-top:12px" data-action="retry" data-id="${o.id}">Retry Payment</button>` : ''}
          </div>

          <div class="card">
            <h3 style="font-size:16px;margin-bottom:8px">Order summary</h3>
            <div class="small muted" style="margin-bottom:8px">Deliver to ${esc(o.address)}</div>
            ${o.lines.map((l) => `<div class="bill-row small"><span>${dietIcon(l.veg)} ${esc(l.name)} × ${l.qty}</span><span>${fmt(l.price * l.qty)}</span></div>`).join('')}
            <div style="margin-top:12px">${billHtml(o.bill)}</div>
          </div>
        </div>
      </div>`;
  }

  /* ---------- Testing guide (README) ---------- */

  function inlineMd(text) {
    return text.split('`').map((part, i) => {
      if (i % 2) return `<code>${esc(part)}</code>`;
      return esc(part)
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) =>
          `<a href="${href.startsWith('#') ? GITHUB_REPO + href : href}" target="_blank" rel="noopener">${label}</a>`)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }).join('');
  }

  function renderMarkdown(md) {
    const lines = md.replace(/\r/g, '').split('\n');
    const listItem = /^\s*([-*]|\d+\.)\s+/;
    const blockStart = /^(#{1,4}\s|```|\s*\||>|\s*([-*]|\d+\.)\s)/;
    const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i += 1; continue; }

      if (line.startsWith('```')) {
        const code = [];
        i += 1;
        while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
        i += 1;
        out.push(`<pre class="code"><code>${esc(code.join('\n'))}</code></pre>`);
        continue;
      }

      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        out.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`);
        i += 1;
        continue;
      }

      if (line.trim().startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
        const [head, , ...body] = rows;
        out.push(`
          <div class="table-wrap"><table>
            <thead><tr>${cells(head).map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead>
            <tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>`);
        continue;
      }

      if (listItem.test(line)) {
        const tag = /^\s*\d+\./.test(line) ? 'ol' : 'ul';
        const items = [];
        while (i < lines.length && listItem.test(lines[i])) items.push(lines[i++].replace(listItem, ''));
        out.push(`<${tag}>${items.map((t) => `<li>${inlineMd(t)}</li>`).join('')}</${tag}>`);
        continue;
      }

      if (line.startsWith('>')) {
        const quote = [];
        while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
        out.push(`<blockquote>${inlineMd(quote.join(' '))}</blockquote>`);
        continue;
      }

      const para = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !blockStart.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inlineMd(para.join(' '))}</p>`);
    }
    return out.join('');
  }

  function testingSection(md) {
    const lines = md.replace(/\r/g, '').split('\n');
    const start = lines.findIndex((l) => /^##\s+Testing\s*$/.test(l));
    if (start < 0) return null;
    const next = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
    return lines.slice(start, next < 0 ? lines.length : next).join('\n');
  }

  async function loadReadme() {
    if (readmeCache) return readmeCache;
    const res = await fetch('README.md', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    readmeCache = await res.text();
    return readmeCache;
  }

  function guideShell(body) {
    return `
      <div class="guide-head">
        <div class="row">
          <span style="font-size:24px" aria-hidden="true">📖</span>
          <div>
            <b>Testing guide</b><span class="pill orange">README.md</span>
            <div class="small muted">Section: Testing · press Esc or F1 to close</div>
          </div>
        </div>
        <button class="guide-close" data-action="close-guide" aria-label="Close testing guide">✕</button>
      </div>
      <div class="guide-body">${body}</div>
      <div class="guide-foot">Source: <code>README.md</code> · <a href="${GITHUB_README}" target="_blank" rel="noopener">View the full README on GitHub ↗</a></div>`;
  }

  async function openGuide() {
    state.guideSeen = true;
    save();
    openModal(guideShell('<div class="spinner"></div>'), 'guide');
    modalRoot.onclick = (e) => { if (e.target.classList.contains('modal-backdrop')) closeGuide(); };

    let body;
    try {
      const section = testingSection(await loadReadme());
      if (!section) throw new Error('Testing section not found');
      body = `<div class="md">${renderMarkdown(section)}</div>`;
    } catch (err) {
      body = `
        <div class="empty">
          <div class="empty-art">📖</div>
          <h2>Open the testing guide on GitHub</h2>
          <p>README.md could not be loaded here (${esc(err.message)}). This happens when index.html is opened straight from disk; run <code>npm start</code> to read it inside the app.</p>
          <a class="btn" href="${GITHUB_README}" target="_blank" rel="noopener">Open README · Testing ↗</a>
        </div>`;
    }
    const target = guideOpen && modalRoot.querySelector('.guide-body');
    if (target) target.innerHTML = body;
  }

  function closeGuide() {
    if (!guideOpen) return;
    closeModal();
    document.getElementById('guide-fab').focus();
  }

  function toggleGuide() {
    if (guideOpen) closeGuide();
    else guidePromise = openGuide();
  }

  function updateGuideIndicator() {
    const fab = document.getElementById('guide-fab');
    fab.classList.toggle('unseen', !state.guideSeen);
    fab.classList.toggle('open', guideOpen);
    fab.setAttribute('aria-expanded', String(guideOpen));
  }

  async function runGuideScenario() {
    const rows = [];
    const check = (label, input, expected, actual) => rows.push({ label, input, expected, actual, pass: expected === actual });
    const fab = document.getElementById('guide-fab');
    const pressKey = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    const guidePanel = () => modalRoot.querySelector('.modal.guide');

    if (guideOpen) closeGuide();
    const box = fab.getBoundingClientRect();
    const visible = box.width > 0 && box.height > 0 && getComputedStyle(fab).visibility !== 'hidden';
    check('indicator', 'button on every page', 'Visible', visible ? 'Visible' : 'Hidden');
    check('indicator', 'F1 shortcut hint', 'Shown',
      fab.getAttribute('aria-keyshortcuts') === 'F1' && document.querySelector('.test-ribbon kbd') ? 'Shown' : 'Missing');

    fab.click();
    await guidePromise;
    const heading = guidePanel() && guidePanel().querySelector('.md h2');
    const tcRows = guidePanel() ? [...guidePanel().querySelectorAll('.md td:first-child')].filter((td) => /^TC-\d+$/.test(td.textContent)).length : 0;
    check('click button', 'guide panel', 'Open', guidePanel() ? 'Open' : 'Closed');
    check('click button', 'README section', 'Testing', heading ? heading.textContent : 'README not loaded');
    check('click button', 'test cases listed', '10', String(tcRows));
    check('indicator', 'button state while open', 'Open', fab.classList.contains('open') ? 'Open' : 'Closed');
    check('indicator', 'unread dot after opening', 'Cleared', fab.classList.contains('unseen') ? 'Still shown' : 'Cleared');

    pressKey('Escape');
    check('Esc key', 'guide panel', 'Closed', guidePanel() ? 'Open' : 'Closed');

    pressKey('F1');
    await guidePromise;
    check('F1 key', 'guide panel', 'Open', guidePanel() ? 'Open' : 'Closed');
    pressKey('F1');
    check('F1 key again', 'guide panel', 'Closed', guidePanel() ? 'Open' : 'Closed');

    ui.labResults['UI-01'] = { rows, pass: rows.every((r) => r.pass) };
    render();
  }

  /* ---------- Test Lab ---------- */

  function testEnv() {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    const loaded = nav && (nav.loadEventEnd || nav.domContentLoadedEventEnd);
    return {
      loadMs: Math.round(loaded || performance.now()),
      viewportWidth: window.innerWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  }

  function runTest(id) {
    const tc = T.TEST_CASES.find((t) => t.id === id);
    if (tc && tc.run) ui.labResults[id] = tc.run(testEnv());
  }

  function runAll() {
    T.TEST_CASES.forEach((tc) => runTest(tc.id));
    ui.labRan = true;
  }

  function tcStatus(tc) {
    const res = ui.labResults[tc.id];
    if (res) return res.pass ? 'PASS' : 'FAIL';
    return tc.manual ? tc.reportStatus : null;
  }

  const SCENARIOS = {
    'TC-01'() {
      state.cart = { restaurantId: 'burger-corner', items: { 'bc-1': 1 } };
      state.coupon = null;
      save();
      go('#/cart');
      toast('Type 11 in the quantity box for Classic Chicken Burger and press Enter');
    },
    'TC-02'() {
      signInTestUser();
      state.cart = { restaurantId: 'cafe-mocha', items: { 'cm-1': 1, 'cm-2': 1 } };
      state.coupon = null;
      save();
      go('#/checkout');
      toast('Item total is exactly ₹199: check the delivery fee in Bill details');
    },
    'TC-03'() {
      state.user = null;
      ui.login = { step: 'mobile', mobile: '', error: '' };
      save();
      go('#/login');
      toast('Try 9876543210, 98765, 98765432101, 98765abcde and 1234567890');
    },
    'TC-04'() {
      state.cart = { restaurantId: 'biryani-junction', items: { 'bj-3': 1 } };
      state.coupon = null;
      ui.couponMsg = null;
      save();
      go('#/cart');
      toast('Cart is ₹350. Try FOOD99X, SUMMER50 and FEAST100; swap to Chicken Dum Biryani (₹250) for R3');
    },
    'TC-06'() {
      signInTestUser();
      state.cart = { restaurantId: 'biryani-junction', items: { 'bj-1': 2 } };
      state.coupon = 'FEAST100';
      state.sandbox = 'approve';
      save();
      go('#/checkout');
      toast('2 × Veg Biryani with FEAST100: the amount should be ₹260 everywhere');
    },
    'TC-07'() {
      state.user = null;
      state.cart = { restaurantId: null, items: {} };
      state.coupon = null;
      state.sandbox = 'approve';
      ui.login = { step: 'mobile', mobile: '', error: '' };
      save();
      go('#/login?next=search');
      toast('Sign in with 9876543210 (OTP 1234), then search “biryani”');
    },
    'TC-08'() {
      signInTestUser();
      state.cart = { restaurantId: 'burger-corner', items: { 'bc-1': 2 } };
      state.coupon = null;
      state.sandbox = 'decline';
      save();
      go('#/checkout');
      toast('Sandbox set to Decline. Tap “Pay ₹438”');
    },
    'TC-10'() {
      go('#/');
      toast('Hand the app to the user: they should order unaided in under 2 minutes');
    },
    'UI-01'() {
      state.guideSeen = false;
      save();
      updateGuideIndicator();
      go('#/');
      toast('Indicator reset: find the pulsing dot on “Testing guide” (bottom-right), then click it or press F1');
    },
  };
  SCENARIOS['TC-05'] = null;
  SCENARIOS['TC-09'] = null;
  const DEFECT_SCENARIO = { 'BUG-01': 'TC-01', 'BUG-02': 'TC-02', 'BUG-03': 'TC-08' };

  function resultTable(res) {
    return `
      <div class="table-wrap tc-result">
        <table>
          <thead><tr><th>Case</th><th>Input</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead>
          <tbody>
            ${res.rows.map((r) => `
              <tr>
                <td>${esc(r.label)}</td><td>${esc(r.input)}</td><td>${esc(r.expected)}</td><td>${esc(r.actual)}</td>
                <td class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function codeListing() {
    const lines = L.calculateTotal.toString().split('\n');
    const indent = Math.min(...lines.slice(1).filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    return `<pre class="code">${lines.map((l, i) => {
      const text = esc((i ? l.slice(indent) : l));
      const num = String(i + 1).padStart(2, ' ');
      return /BUG-02/.test(l) ? `<span class="bugline">${num}  ${text}</span>` : `${num}  ${text}`;
    }).join('\n')}</pre>`;
  }

  function tcCard(tc) {
    const status = tcStatus(tc);
    const res = ui.labResults[tc.id];
    return `
      <div class="card tc ${status === 'PASS' ? 'is-pass' : status === 'FAIL' ? 'is-fail' : ''}" id="${tc.id}">
        <div class="tc-head">
          <div>
            <div class="tc-title">${tc.id} · ${esc(tc.title)}</div>
            <div class="tc-meta">
              <span class="pill">${esc(tc.technique)}</span>
              <span class="pill">${esc(tc.level)}</span>
              <span class="pill">Module: ${esc(tc.module)}</span>
              <span class="pill ${tc.priority === 'Critical' ? 'red' : tc.priority === 'High' ? 'orange' : ''}">${tc.priority}</span>
              <span class="pill">👤 ${esc(tc.executedBy)}</span>
            </div>
          </div>
          <div class="row" style="flex-wrap:wrap">
            ${tc.reportStatus
              ? `<span class="pill ${tc.reportStatus === 'PASS' ? 'green' : 'red'}">Report: ${tc.reportStatus}</span>`
              : '<span class="pill">Not in report</span>'}
            ${tc.manual
              ? '<span class="pill dark">Manual</span>'
              : res ? `<span class="pill ${res.pass ? 'green' : 'red'}">Live: ${res.pass ? 'PASS' : 'FAIL'}</span>` : '<span class="pill">Not run</span>'}
          </div>
        </div>
        <ol>${tc.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <div class="tc-expect">
          <div><b>Expected</b>${esc(tc.expected)}</div>
          <div><b>${tc.reportStatus ? 'Actual (report)' : 'Actual'}</b>${esc(tc.reportActual)}${tc.defect ? ` · <a href="#/testlab" data-action="jump" data-id="${tc.defect}" class="link-btn">${tc.defect}</a>` : ''}</div>
        </div>
        ${tc.coverage ? `<p class="small muted" style="margin-top:10px">Coverage: ${esc(tc.coverage)}</p>${codeListing()}` : ''}
        <div class="row" style="margin-top:14px;flex-wrap:wrap">
          ${tc.run ? `<button class="btn sm" data-action="run-tc" data-id="${tc.id}">▶ Run ${tc.id}</button>` : ''}
          ${tc.browserRun ? `<button class="btn sm" data-action="run-ui" data-id="${tc.id}">▶ Run ${tc.id}</button>` : ''}
          ${SCENARIOS[tc.id] ? `<button class="btn sm outline" data-action="scenario" data-id="${tc.id}">Try it in the app</button>` : ''}
        </div>
        ${res ? resultTable(res) : ''}
      </div>`;
  }

  function bugCard(bug) {
    return `
      <div class="card bug ${bug.severity === 'Critical' ? 'critical' : ''}" id="${bug.id}">
        <div class="tc-head">
          <div class="tc-title">${bug.id}: ${esc(bug.title)}</div>
          <div class="row" style="flex-wrap:wrap">
            <span class="pill ${bug.severity === 'Critical' ? 'red' : 'orange'}">${bug.severity} · ${bug.priority}</span>
            <span class="pill red">${bug.status}</span>
          </div>
        </div>
        <dl>
          <dt>Module / Test case</dt><dd>${esc(bug.module)} · ${bug.testCase}</dd>
          <dt>Reported by</dt><dd>${esc(bug.reportedBy)}</dd>
          <dt>Steps to reproduce</dt><dd><ol>${bug.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></dd>
          <dt>Expected result</dt><dd>${esc(bug.expected)}</dd>
          <dt>Actual result</dt><dd style="color:var(--red);font-weight:600">${esc(bug.actual)}</dd>
          <dt>Root cause</dt><dd>${esc(bug.rootCause)}</dd>
          <dt>Suggested fix</dt><dd>${esc(bug.fix)}</dd>
        </dl>
        <button class="btn sm outline" style="margin-top:14px" data-action="scenario" data-id="${DEFECT_SCENARIO[bug.id]}">Reproduce ${bug.id} in the app</button>
      </div>`;
  }

  function testLabView() {
    const statuses = T.TEST_CASES.map(tcStatus);
    const executed = statuses.filter(Boolean).length;
    const passed = statuses.filter((s) => s === 'PASS').length;
    const failed = statuses.filter((s) => s === 'FAIL').length;
    const rate = executed ? Math.round((passed / executed) * 100) : 0;
    const env = testEnv();
    const statusById = Object.fromEntries(T.TEST_CASES.map((tc, i) => [tc.id, statuses[i]]));

    return `
      <section class="lab-hero">
        <div class="spread" style="flex-wrap:wrap">
          <div>
            <h1>🧪 FOODIE Test Lab</h1>
            <p class="muted" style="margin-top:4px">Team 04 Manual Test Report · test build v1.0 · October 2026</p>
          </div>
          <button class="btn" data-action="run-all">▶ Run all automated tests</button>
        </div>
        <div class="summary">
          <div><b>${executed}</b><span>Executed</span></div>
          <div><b style="color:#5fd4a4">${passed}</b><span>Passed</span></div>
          <div><b style="color:#ff8a94">${failed}</b><span>Failed</span></div>
          <div><b>${rate}%</b><span>Pass rate</span></div>
          <div><b>${T.DEFECTS.length}</b><span>Open defects (1 Critical, 2 Major)</span></div>
        </div>
        <p class="verdict">Verdict: NOT READY for release. Fix BUG-03 (P1) and BUG-01 / BUG-02 (P2), re-run TC-01, TC-02 and TC-08, then run a full regression.</p>
        <p class="small muted" style="margin-top:6px">TC-07 and TC-10 are manual; their status comes from the report. All others run live against this build's code.</p>
      </section>

      <h2 class="section-title">Test controls</h2>
      <div class="lab-controls">
        <div class="card">
          <b>Payment gateway</b>
          <p class="small muted" style="margin:4px 0 10px">Used by TC-06, TC-07 and TC-08</p>
          <div class="segmented">
            <button class="${state.sandbox === 'approve' ? 'on approve' : ''}" data-action="sandbox" data-mode="approve">Approve</button>
            <button class="${state.sandbox === 'decline' ? 'on decline' : ''}" data-action="sandbox" data-mode="decline">Decline</button>
          </div>
        </div>
        <div class="card">
          <b>Session timeout (15 min)</b>
          <p class="small muted" style="margin:4px 0 10px">${state.user ? `Signed in as +91 ${esc(state.user.mobile)}` : 'Not signed in'}</p>
          <div class="row" style="flex-wrap:wrap">
            ${state.user ? '' : '<button class="btn sm ghost" data-action="sign-in-test">Sign in test user</button>'}
            <button class="btn sm" data-action="simulate-idle">Simulate 15 min idle</button>
          </div>
        </div>
        <div class="card">
          <b>Performance &amp; layout</b>
          <p class="small muted" style="margin-top:4px">Page load: <b>${(env.loadMs / 1000).toFixed(2)} s</b> (target &lt; 3 s)</p>
          <p class="small muted">Viewport: <b>${env.viewportWidth}px</b> · ${env.overflow ? '<span style="color:var(--red)">horizontal scroll</span>' : 'no horizontal scroll'}</p>
          <p class="small muted">Use DevTools device mode at 360 × 800 for TC-09.</p>
        </div>
        <div class="card">
          <b>Test data</b>
          <p class="small muted" style="margin:4px 0 10px">Clears cart, orders, session and settings. Order numbers restart at #FO10482.</p>
          <button class="btn sm ghost" data-action="reset">Reset app data</button>
        </div>
      </div>

      <h2 class="section-title">Business rules &amp; traceability</h2>
      <div class="card table-wrap">
        <table>
          <thead><tr><th>Rule</th><th>Requirement</th><th>Test cases</th><th>Result</th><th>Defect</th></tr></thead>
          <tbody>
            ${T.BUSINESS_RULES.map((br) => {
              const results = br.tests.map((id) => statusById[id]);
              const result = results.includes('FAIL') ? 'FAIL' : results.every((r) => r === 'PASS') ? 'PASS' : '—';
              return `
                <tr>
                  <td><b>${br.id}</b></td><td>${esc(br.text)}</td><td>${br.tests.join(', ')}</td>
                  <td class="${result === 'PASS' ? 'pass' : result === 'FAIL' ? 'fail' : ''}">${result}</td>
                  <td>${br.defect || '–'}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <h2 class="section-title">Test cases (${T.TEST_CASES.length})</h2>
      ${T.TEST_CASES.map(tcCard).join('')}

      <h2 class="section-title">Additional scenario: TS-07 testing guide</h2>
      <p class="small muted" style="margin:-6px 0 12px">Added with the README; not part of the report's 10 test cases or its pass rate.</p>
      ${T.UI_SCENARIOS.map(tcCard).join('')}

      <h2 class="section-title">Defect reports (${T.DEFECTS.length})</h2>
      ${T.DEFECTS.map(bugCard).join('')}`;
  }

  /* ---------- render ---------- */

  function updateHeader(page) {
    const count = cartCount();
    const badge = document.getElementById('cart-count');
    badge.hidden = count === 0;
    badge.textContent = count;

    document.getElementById('nav-user').innerHTML = state.user
      ? `<span class="nav-user"><span class="nav-icon">👤</span><span class="mobile-num">+91 ${esc(state.user.mobile)}</span><button class="link-btn" data-action="logout">Logout</button></span>`
      : `<a href="#/login" class="nav-link ${page === 'login' ? 'active' : ''}"><span class="nav-icon">👤</span><span class="nav-text">Sign in</span></a>`;

    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === page || (page === 'order' && a.dataset.nav === 'orders'));
    });
  }

  function render() {
    clearInterval(pageTimer);
    pageTimer = null;
    if (checkSession()) return;

    const { parts, query } = route();
    const page = parts[0] || '';
    let view;
    switch (page) {
      case '': view = homeView(); break;
      case 'search': view = searchView(query.get('q') || ''); break;
      case 'restaurant': view = restaurantView(parts[1]); break;
      case 'cart': view = cartView(); break;
      case 'checkout': view = checkoutView(); break;
      case 'login': view = loginView(query.get('next')); break;
      case 'orders': view = ordersView(); break;
      case 'order': view = orderView(parts[1]); break;
      case 'testlab': view = testLabView(); break;
      default: view = emptyState('🍽️', 'Page not found', 'The page you are looking for does not exist.', 'Go home', '#/');
    }
    if (view == null) return;

    app.innerHTML = view;
    updateHeader(page);

    if (page === 'order') {
      const order = findOrder(parts[1]);
      if (order && order.payment === 'Success' && L.trackingStatus(order) !== 'Delivered') {
        pageTimer = setInterval(render, 1000);
      }
    }
    if (page === 'testlab' && !ui.labRan) {
      runAll();
      render();
    }
  }

  /* ---------- events ---------- */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    switch (action) {
      case 'add': addDish(id); break;
      case 'inc': increment(id); break;
      case 'dec': decrement(id); break;
      case 'apply-coupon': applyCouponCode(el.dataset.code); break;
      case 'remove-coupon':
        state.coupon = null; ui.couponMsg = null; save(); render(); break;
      case 'to-checkout': go(state.user ? '#/checkout' : '#/login?next=checkout'); break;
      case 'address': state.addressId = id; save(); render(); break;
      case 'pay-method': state.payMethod = el.dataset.method; save(); render(); break;
      case 'sandbox':
        state.sandbox = el.dataset.mode; save(); render();
        toast(`Sandbox gateway will ${state.sandbox === 'decline' ? 'DECLINE' : 'APPROVE'} payments`);
        break;
      case 'pay': pay(); break;
      case 'retry': processPayment(id); break;
      case 'logout':
        state.user = null; save(); toast('Logged out'); go('#/'); break;
      case 'change-number':
        ui.login = { step: 'mobile', mobile: '', error: '' }; render(); break;
      case 'run-tc': runTest(id); render(); break;
      case 'run-all': runAll(); render(); toast('Automated test cases re-run against this build'); break;
      case 'open-guide': toggleGuide(); break;
      case 'close-guide': closeGuide(); break;
      case 'run-ui': runGuideScenario(); break;
      case 'scenario': if (SCENARIOS[id]) SCENARIOS[id](); break;
      case 'jump': {
        e.preventDefault();
        const target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'sign-in-test': signInTestUser(); save(); render(); toast('Signed in as +91 ' + TEST_USER); break;
      case 'simulate-idle':
        if (!state.user) { toast('Sign in first to test the session timeout', 'error'); break; }
        state.lastActive = Date.now() - L.SESSION_TIMEOUT_MS;
        save();
        checkSession();
        break;
      case 'reset':
        localStorage.removeItem(STORE_KEY);
        state = defaults();
        ui = freshUi();
        save();
        toast('App data reset');
        render();
        break;
      default: break;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      toggleGuide();
      return;
    }
    if (e.key === 'Escape' && guideOpen) {
      closeGuide();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="radio"][data-action]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    e.preventDefault();
    switch (form.id) {
      case 'hero-search':
      case 'search-form':
        go('#/search?q=' + encodeURIComponent(form.q.value.trim()));
        break;
      case 'coupon-form':
        applyCouponCode(form.code.value);
        break;
      case 'mobile-form': {
        const value = form.mobile.value;
        const result = L.validateMobile(value);
        if (!result.ok) {
          ui.login = { step: 'mobile', mobile: value, error: result.message };
        } else {
          ui.login = { step: 'otp', mobile: result.mobile, error: '' };
          toast(`OTP sent to +91 ${result.mobile} (sandbox OTP ${L.SANDBOX_OTP})`);
        }
        render();
        break;
      }
      case 'otp-form': {
        if (!L.validateOtp(form.otp.value)) {
          ui.login.error = 'Incorrect OTP. Please try again.';
          render();
          break;
        }
        state.user = { mobile: ui.login.mobile };
        state.lastActive = Date.now();
        if (!state.upiId) state.upiId = ui.login.mobile + '@ybl';
        ui.login = { step: 'mobile', mobile: '', error: '' };
        save();
        toast('Welcome to FOODIE!', 'success');
        go('#/' + (route().query.get('next') || ''));
        break;
      }
      default: break;
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'search-input') {
      const q = t.value;
      history.replaceState(null, '', '#/search' + (q ? '?q=' + encodeURIComponent(q) : ''));
      document.getElementById('search-results').innerHTML = searchResults(q);
    } else if (t.id === 'upi-id') {
      state.upiId = t.value;
      save();
    } else if (t.id === 'card-number') {
      ui.card.number = t.value;
    } else if (t.id === 'card-exp') {
      ui.card.exp = t.value;
    } else if (t.id === 'card-cvv') {
      ui.card.cvv = t.value;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.qtyFor) typedQty(t.dataset.qtyFor, t.value);
    else if (t.dataset.change === 'veg-only') { state.vegOnly = t.checked; save(); render(); }
  });

  ['click', 'keydown', 'touchstart', 'scroll'].forEach((type) =>
    window.addEventListener(type, touch, { passive: true, capture: true }));
  setInterval(checkSession, 15000);

  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo(0, 0);
  });

  updateGuideIndicator();
  render();
})();
