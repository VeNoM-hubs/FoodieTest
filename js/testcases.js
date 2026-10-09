/*
 * Test basis from the Team 04 Manual Test Report (FOODIE v1.0, Oct 2026).
 * Shared by the in-app Test Lab (#/testlab) and `npm test`.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = isNode
    ? factory(require('./logic.js'), require('./data.js'))
    : factory(root.FoodieLogic, root.FoodieData);
  if (isNode) module.exports = api;
  else root.FoodieTests = api;
})(typeof self !== 'undefined' ? self : this, function (L, D) {
  const TEST_DATE = new Date(2026, 9, 9);

  const line = (dishId, qty) => {
    const { dish } = D.findDish(dishId);
    return { id: dish.id, name: dish.name, price: dish.price, qty, veg: dish.veg };
  };
  const row = (label, input, expected, actual) => ({ label, input, expected, actual, pass: expected === actual });
  const result = (rows) => ({ rows, pass: rows.every((r) => r.pass) });

  const BUSINESS_RULES = [
    { id: 'BR-01', text: 'Mobile number must be exactly 10 digits and start with 6, 7, 8 or 9.', tests: ['TC-03'] },
    { id: 'BR-02', text: 'Quantity of a single dish in the cart must be between 1 and 10.', tests: ['TC-01'], defect: 'BUG-01' },
    { id: 'BR-03', text: 'Delivery is free when the item subtotal is ₹199 or more; otherwise a ₹40 fee applies.', tests: ['TC-02', 'TC-05'], defect: 'BUG-02' },
    { id: 'BR-04', text: 'A coupon applies only if the code exists, is not expired and the cart total is ≥ ₹299.', tests: ['TC-04', 'TC-06'] },
    { id: 'BR-05', text: 'The payable total can never be negative.', tests: ['TC-05'] },
    { id: 'BR-06', text: 'If payment fails, the order must NOT be placed; the user can retry.', tests: ['TC-08'], defect: 'BUG-03' },
    { id: 'BR-07', text: 'Pages load in under 3 s; session expires after 15 min idle; layout works on a 360 px screen.', tests: ['TC-09'] },
    { id: 'E2E', text: 'End-to-end ordering & acceptance.', tests: ['TC-07', 'TC-10'] },
  ];

  const TEST_CASES = [
    {
      id: 'TC-01', title: 'Item quantity boundaries', technique: 'BVA (BR-02)', level: 'Unit / System', module: 'cart',
      priority: 'High', executedBy: 'Bhaskar Lukram', defect: 'BUG-01',
      steps: ['Open “Burger Corner” and add “Classic Chicken Burger”.', 'Open the cart and type each quantity (0, 1, 2, 9, 10, 11) in the quantity field.', 'Press Enter and check whether it is accepted or rejected.'],
      expected: '0 and 11 rejected; 1–10 accepted', reportActual: '11 accepted (item total ₹2,409)', reportStatus: 'FAIL',
      run() {
        const cases = [[0, 'min − 1'], [1, 'min'], [2, 'min + 1'], [9, 'max − 1'], [10, 'max'], [11, 'max + 1']];
        return result(cases.map(([qty, boundary]) => {
          const expected = qty >= 1 && qty <= L.MAX_QTY ? 'Accepted' : 'Rejected';
          const actual = L.validateQuantity(qty).ok ? 'Accepted' : 'Rejected';
          return row(boundary, `qty ${qty}`, expected, actual);
        }));
      },
    },
    {
      id: 'TC-02', title: 'Free-delivery threshold (≥ ₹199)', technique: 'BVA (BR-03)', level: 'Unit / System', module: 'billing',
      priority: 'High', executedBy: 'Bhaskar Lukram', defect: 'BUG-02',
      steps: ['Build a cart worth ₹198 (Veg Club Sandwich + Chocolate Brownie at Café Mocha).', 'Build a cart worth ₹199 (Veg Club Sandwich + Cold Coffee).', 'Build a cart worth ₹200 (2 × Cold Coffee).', 'Check the delivery fee under Bill details each time.'],
      expected: 'Fee ₹40, ₹0, ₹0', reportActual: 'Fee ₹40, ₹40, ₹0 (to pay ₹239 at ₹199)', reportStatus: 'FAIL',
      run() {
        const carts = [
          ['just below', [line('cm-1', 1), line('cm-3', 1)], 40],
          ['on boundary', [line('cm-1', 1), line('cm-2', 1)], 0],
          ['just above', [line('cm-2', 2)], 0],
        ];
        return result(carts.map(([boundary, lines, fee]) => {
          const bill = L.buildBill(lines, null, TEST_DATE);
          return row(boundary, `subtotal ${L.formatINR(bill.itemTotal)}`, L.formatINR(fee), L.formatINR(bill.deliveryFee));
        }));
      },
    },
    {
      id: 'TC-03', title: 'Mobile number validation', technique: 'ECP (BR-01)', level: 'Unit / System', module: 'auth',
      priority: 'Medium', executedBy: 'Khushi Raghav', defect: null,
      steps: ['Open Sign in.', 'Enter each value and tap “Send OTP”.', 'Check that only the valid number moves to the OTP step.'],
      expected: 'Only V1 accepted', reportActual: 'As expected', reportStatus: 'PASS',
      run() {
        const classes = [
          ['V1 valid: 10 digits, starts 6–9', '9876543210', 'Accepted'],
          ['I1 invalid: fewer than 10 digits', '98765', 'Rejected'],
          ['I2 invalid: more than 10 digits', '98765432101', 'Rejected'],
          ['I3 invalid: letters or symbols', '98765abcde', 'Rejected'],
          ['I4 invalid: starts with 0–5', '1234567890', 'Rejected'],
        ];
        return result(classes.map(([cls, value, expected]) =>
          row(cls, value, expected, L.validateMobile(value).ok ? 'Accepted' : 'Rejected')));
      },
    },
    {
      id: 'TC-04', title: 'Coupon rules (decision table R1–R4)', technique: 'Cause–effect graph + decision table (BR-04)', level: 'Unit / System', module: 'billing',
      priority: 'High', executedBy: 'Khushi Raghav', defect: null,
      steps: ['Build the cart for each rule (₹350 = Mutton Biryani; ₹250 = Chicken Dum Biryani).', 'Enter the coupon code under “Apply coupon”.', 'Check the message and the bill.'],
      expected: 'Invalid / expired / add ₹49 more / ₹100 off', reportActual: 'As expected', reportStatus: 'PASS',
      run() {
        const rules = [
          ['R1 code missing', 'FOOD99X', 350, 'E2 Invalid coupon'],
          ['R2 expired', 'SUMMER50', 350, 'E3 Coupon expired'],
          ['R3 total < ₹299', 'FEAST100', 250, 'E4 Add ₹49 more to apply FEAST100'],
          ['R4 all true', 'FEAST100', 350, 'E1 FEAST100 applied: ₹100 off'],
        ];
        return result(rules.map(([rule, code, total, expected]) => {
          const r = L.applyCoupon(code, total, TEST_DATE);
          return row(rule, `${code}, ${L.formatINR(total)}`, expected, `${r.effect} ${r.message}`);
        }));
      },
    },
    {
      id: 'TC-05', title: 'calculateTotal() basis paths', technique: 'White-box / unit (CFG, V(G) = 4)', level: 'Unit', module: 'billing',
      priority: 'High', executedBy: 'Kartik Gupta', defect: null,
      steps: ['Call calculateTotal(subtotal, discount) from the unit test driver for each basis path.', 'P4 is not reachable from the UI (coupons need ≥ ₹299), so it only runs here.'],
      expected: '₹250, ₹190, ₹200, ₹0', reportActual: 'As expected; 100% coverage', reportStatus: 'PASS',
      coverage: 'Black-box only (P1–P3): statement 87.5%, branch 83.3%, path 75%. With P4: 100% / 100% / 100%.',
      run() {
        const paths = [
          ['P1 A→C→E→G', 250, 0, 250],
          ['P2 A→B→C→E→G', 150, 0, 190],
          ['P3 A→C→D→E→G', 300, 100, 200],
          ['P4 A→B→C→D→E→F→G', 50, 100, 0],
        ];
        return result(paths.map(([path, subtotal, discount, expected]) =>
          row(path, `(${L.formatINR(subtotal)}, ${L.formatINR(discount)})`, L.formatINR(expected), L.formatINR(L.calculateTotal(subtotal, discount)))));
      },
    },
    {
      id: 'TC-06', title: 'Amount flows cart → bill → payment', technique: 'Integration (bottom-up)', level: 'Integration', module: 'cart, billing, payment',
      priority: 'High', executedBy: 'Kartik Gupta', defect: null,
      steps: ['Add 2 × Veg Biryani (₹180) from Biryani Junction.', 'Apply coupon FEAST100.', 'Pay with the sandbox set to Approve.', 'Compare the amount at each interface.'],
      expected: 'Total ₹260 at every interface', reportActual: 'Values matched', reportStatus: 'PASS',
      run() {
        const lines = [line('bj-1', 2)];
        const restaurant = D.findRestaurant('biryani-junction');
        const bill = L.buildBill(lines, 'FEAST100', TEST_DATE);
        const order = L.createOrder({ id: 'FO-TEST', restaurant, lines, bill, method: 'UPI', address: 'Home' });
        const charge = L.sandboxCharge(order.amount, 'approve');
        return result([
          row('cart', 'item total', '₹360', L.formatINR(L.itemTotal(lines))),
          row('billing', 'bill to pay', '₹260', L.formatINR(bill.toPay)),
          row('order', 'order amount', '₹260', L.formatINR(order.amount)),
          row('payment', 'amount charged', '₹260', L.formatINR(charge.amountCharged)),
        ]);
      },
    },
    {
      id: 'TC-07', title: 'End-to-end order', technique: 'System (functional)', level: 'System', module: 'all',
      priority: 'High', executedBy: 'Ayush Pandey', defect: null, manual: true,
      steps: ['Sign in with 9876543210 (OTP 1234).', 'Search “biryani” and open Biryani Junction.', 'Add Mutton Biryani, apply FEAST100.', 'Check out, pay by UPI with the sandbox set to Approve.', 'Track the order until “Delivered”.'],
      expected: 'Order confirmed and tracked to delivery', reportActual: 'As expected', reportStatus: 'PASS',
    },
    {
      id: 'TC-08', title: 'Order handling when payment fails', technique: 'System (negative, BR-06)', level: 'System', module: 'payment',
      priority: 'Critical', executedBy: 'Ayush Pandey', defect: 'BUG-03',
      steps: ['Add 2 × Classic Chicken Burger (cart ₹438).', 'Set the sandbox gateway to Decline.', 'Pay by UPI.', 'Open the order status screen.'],
      expected: '“Payment failed”; order not placed', reportActual: '“Order Placed” with payment Failed', reportStatus: 'FAIL',
      run() {
        const lines = [line('bc-1', 2)];
        const restaurant = D.findRestaurant('burger-corner');
        const bill = L.buildBill(lines, null, TEST_DATE);
        const order = L.createOrder({ id: 'FO-TEST', restaurant, lines, bill, method: 'UPI', address: 'Home' });
        L.recordPayment(order, L.sandboxCharge(order.amount, 'decline'));
        return result([
          row('cart', 'amount', '₹438', L.formatINR(order.amount)),
          row('payment', 'UPI decline', 'Failed', order.payment),
          row('order status', 'after decline', 'Not placed', order.status === 'Placed' ? 'Placed' : 'Not placed'),
        ]);
      },
    },
    {
      id: 'TC-09', title: 'Layout, session timeout, page load', technique: 'System (non-functional, BR-07)', level: 'System', module: 'all',
      priority: 'Medium', executedBy: 'Kartik Gupta', defect: null,
      steps: ['Open the app at 360 × 800 and check for horizontal scrolling.', 'Stay idle for 15 minutes (or use “Simulate 15 min idle”) and check you are signed out.', 'Measure home page load time.'],
      expected: 'No layout issues; timeout; load < 3 s', reportActual: 'Correct; load 1.8 s', reportStatus: 'PASS',
      run(env) {
        const now = Date.now();
        const rows = [
          row('session', 'idle 14 min', 'Active', L.isSessionExpired(now - 14 * 60000, now) ? 'Expired' : 'Active'),
          row('session', 'idle 15 min', 'Expired', L.isSessionExpired(now - 15 * 60000, now) ? 'Expired' : 'Active'),
        ];
        if (env && env.loadMs != null) {
          rows.push(row('page load', `${(env.loadMs / 1000).toFixed(2)} s`, '< 3 s', env.loadMs < 3000 ? '< 3 s' : '≥ 3 s'));
        }
        if (env && env.viewportWidth != null) {
          rows.push(row('layout', `${env.viewportWidth} px viewport`, 'No horizontal scroll', env.overflow ? 'Horizontal scroll' : 'No horizontal scroll'));
        }
        return result(rows);
      },
    },
    {
      id: 'TC-10', title: 'Alpha UAT with 4 users', technique: 'Acceptance (alpha UAT)', level: 'Acceptance', module: 'all',
      priority: 'High', executedBy: 'Ayush Pandey', defect: null, manual: true,
      steps: ['Give the app to 4 users outside the team.', 'AC-1: they place an order in under 2 minutes without help.', 'AC-2: the bill is correct.', 'AC-3: the order status updates live.'],
      expected: 'Order < 2 min; bill correct; live status', reportActual: 'Avg 1 min 20 s; all correct', reportStatus: 'PASS',
    },
  ];

  // Scenario TS-07, added with the README. Runs in the browser only (Test Lab) and is not part of the report's pass rate.
  const UI_SCENARIOS = [
    {
      id: 'UI-01', title: 'Testing guide opens from the function button (F1)', technique: 'System (UI, help) · TS-07', level: 'System', module: 'help',
      priority: 'Low', executedBy: 'Team 04', defect: null, browserRun: true,
      steps: ['Check the “Testing guide” button (bottom-right) shows the pulsing dot and README badge.', 'Click the button, or press the F1 function key.', 'Check the panel shows the README “Testing” section with all 10 test cases.', 'Press Esc (or F1 again) to close it; the dot stays cleared.'],
      expected: 'Guide panel opens on the Testing section; indicator clears', reportActual: 'Run it to see the live result', reportStatus: null,
    },
  ];

  const DEFECTS = [
    {
      id: 'BUG-01', title: 'Cart accepts quantity 11 when typed manually', module: 'cart', testCase: 'TC-01',
      severity: 'Major', priority: 'P2', status: 'Open', reportedBy: 'Bhaskar Lukram · Oct 2026',
      steps: ['Open “Burger Corner” and add “Classic Chicken Burger” (₹219).', 'In the cart, type 11 in the quantity field and confirm.'],
      expected: 'Rejected with “Quantity must be between 1 and 10”.',
      actual: '11 items accepted; item total ₹2,409, total ₹2,569.',
      rootCause: 'Limit enforced only by the “+” button; typed input not validated.',
      fix: 'Validate quantity on input and on the server (1–10).',
    },
    {
      id: 'BUG-02', title: '₹40 delivery fee charged at exactly ₹199', module: 'billing', testCase: 'TC-02',
      severity: 'Major', priority: 'P2', status: 'Open', reportedBy: 'Bhaskar Lukram · Oct 2026',
      steps: ['Add items so the item total is exactly ₹199.', 'Go to checkout and view Bill details.'],
      expected: 'Delivery fee FREE; to pay ₹199.',
      actual: 'Delivery fee ₹40; to pay ₹239.',
      rootCause: 'calculateTotal() line 3 uses “<= 199” instead of “< 199”.',
      fix: 'Change to “< 199”; add regression tests at ₹198/199/200.',
    },
    {
      id: 'BUG-03', title: 'Order shows “Placed” after payment fails', module: 'payment', testCase: 'TC-08',
      severity: 'Critical', priority: 'P1', status: 'Open', reportedBy: 'Ayush Pandey · Oct 2026',
      steps: ['Build a cart worth ₹438 and pay by UPI.', 'Let the sandbox decline the payment.', 'Open the order status screen.'],
      expected: '“Payment failed”; order not placed; “Retry payment” offered.',
      actual: 'Order #FO10482 shows “Order Placed” while payment is Failed.',
      rootCause: 'Order saved as “Placed” before the payment result; no rollback on failure.',
      fix: 'Create orders as “Pending payment”; set “Placed” only on success.',
    },
  ];

  return { TEST_DATE, BUSINESS_RULES, TEST_CASES, UI_SCENARIOS, DEFECTS };
});
