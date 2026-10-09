/*
 * FOODIE business logic (test build v1.0).
 * Pure functions shared by the web app, the in-app Test Lab and the Node unit tests.
 *
 * This build intentionally ships with the three open defects from the
 * Team 04 Manual Test Report: BUG-01 (cart), BUG-02 (billing), BUG-03 (payment).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoodieLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_QTY = 10;
  const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
  const SANDBOX_OTP = '1234';

  const COUPONS = {
    FEAST100: { discount: 100, minCart: 299, expires: '2026-12-31', title: 'Flat ₹100 off on orders above ₹299' },
    WELCOME50: { discount: 50, minCart: 299, expires: '2027-03-31', title: 'Flat ₹50 off for new users above ₹299' },
    SUMMER50: { discount: 50, minCart: 299, expires: '2026-06-30', title: 'Summer special: ₹50 off (ended)' },
  };

  const STATUS_FLOW = ['Placed', 'Preparing', 'Out for delivery', 'Delivered'];
  const STAGE_AFTER_MS = [0, 10000, 25000, 45000];

  // BR-01: exactly 10 digits, first digit 6–9.
  function validateMobile(value) {
    const mobile = String(value == null ? '' : value).trim();
    if (/^[6-9]\d{9}$/.test(mobile)) return { ok: true, mobile };
    return { ok: false, message: 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9' };
  }

  function validateOtp(value) {
    return String(value).trim() === SANDBOX_OTP;
  }

  // "+" button guard (BR-02 upper limit is only enforced here).
  function canIncrement(qty) {
    return qty < MAX_QTY;
  }

  // Quantity typed into the cart input.
  // BUG-01: only the lower bound is checked, so 11+ is accepted.
  function validateQuantity(value) {
    const qty = Number(value);
    if (!Number.isInteger(qty) || qty < 1) {
      return { ok: false, message: 'Quantity must be between 1 and 10' };
    }
    return { ok: true, qty };
  }

  // Billing function under white-box test (TC-05). Kept line-for-line with the report.
  function calculateTotal(subtotal, discount) {
    let total = subtotal;
    if (subtotal <= 199) {          // BUG-02: should be  < 199
      total = total + 40;           // delivery fee
    }
    if (discount > 0) {
      total = total - discount;
    }
    if (total < 0) {
      total = 0;
    }
    return total;
  }

  function deliveryFee(subtotal) {
    return calculateTotal(subtotal, 0) - subtotal;
  }

  // Large orders (item total above ₹1,000) pay 5% GST plus ₹40 packaging.
  function taxesAndCharges(subtotal) {
    return subtotal > 1000 ? Math.round(subtotal * 0.05) + 40 : 0;
  }

  function isoDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  // BR-04, implemented from the decision table (rules R1–R4).
  function applyCoupon(code, cartTotal, today) {
    const key = String(code == null ? '' : code).trim().toUpperCase();
    const coupon = COUPONS[key];
    if (!coupon) {
      return { ok: false, effect: 'E2', rule: 'R1', message: 'Invalid coupon' };
    }
    if (isoDate(today || new Date()) > coupon.expires) {
      return { ok: false, effect: 'E3', rule: 'R2', message: 'Coupon expired' };
    }
    if (cartTotal < coupon.minCart) {
      const short = coupon.minCart - cartTotal;
      return { ok: false, effect: 'E4', rule: 'R3', message: `Add ₹${short} more to apply ${key}` };
    }
    return {
      ok: true, effect: 'E1', rule: 'R4', code: key, discount: coupon.discount,
      message: `${key} applied: ₹${coupon.discount} off`,
    };
  }

  function itemTotal(lines) {
    return lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  }

  function buildBill(lines, couponCode, today) {
    const subtotal = itemTotal(lines);
    const coupon = couponCode ? applyCoupon(couponCode, subtotal, today) : null;
    const discount = coupon && coupon.ok ? coupon.discount : 0;
    const charges = taxesAndCharges(subtotal);
    return {
      itemTotal: subtotal,
      deliveryFee: deliveryFee(subtotal),
      charges,
      discount,
      coupon,
      toPay: calculateTotal(subtotal, discount) + charges,
    };
  }

  // BUG-03: the order is saved as "Placed" before the payment result is known.
  function createOrder({ id, restaurant, lines, bill, method, address, now }) {
    return {
      id,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      lines: lines.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty, veg: l.veg })),
      bill,
      amount: bill.toPay,
      method,
      address,
      status: 'Placed',
      payment: 'Pending',
      createdAt: now || Date.now(),
      paidAt: null,
      txnId: null,
    };
  }

  // Sandbox UPI/card gateway (stubbed in unit tests).
  function sandboxCharge(amount, mode) {
    const success = mode !== 'decline';
    return {
      success,
      amountCharged: success ? amount : 0,
      amountRequested: amount,
      txnId: 'TXN' + Math.floor(100000 + Math.random() * 900000),
      reason: success ? null : 'Declined by bank (sandbox)',
    };
  }

  // BUG-03: no rollback on failure; the order keeps status "Placed".
  function recordPayment(order, result, now) {
    order.txnId = result.txnId;
    if (result.success) {
      order.payment = 'Success';
      order.paidAt = now || Date.now();
    } else {
      order.payment = 'Failed';
    }
    return order;
  }

  function trackingStatus(order, now) {
    if (order.payment !== 'Success') return order.status;
    const elapsed = (now || Date.now()) - order.paidAt;
    let stage = 0;
    STAGE_AFTER_MS.forEach((ms, i) => { if (elapsed >= ms) stage = i; });
    return STATUS_FLOW[stage];
  }

  function isSessionExpired(lastActive, now) {
    return (now || Date.now()) - lastActive >= SESSION_TIMEOUT_MS;
  }

  function formatINR(amount) {
    return '₹' + Number(amount).toLocaleString('en-IN');
  }

  return {
    MAX_QTY, SESSION_TIMEOUT_MS, SANDBOX_OTP, COUPONS, STATUS_FLOW,
    validateMobile, validateOtp, canIncrement, validateQuantity,
    calculateTotal, deliveryFee, taxesAndCharges, applyCoupon, itemTotal, buildBill,
    createOrder, sandboxCharge, recordPayment, trackingStatus, isSessionExpired,
    isoDate, formatINR,
  };
});
