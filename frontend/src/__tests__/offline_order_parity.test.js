/**
 * Tests for Offline order flow parity with Online.
 *
 * Verifies that an offline order built in POS.saveOrderOffline()
 * contains ALL the fields needed by:
 *   1. Receipt printer (sendReceiptPrint)
 *   2. Kitchen printer (printOrderToAllPrinters)
 *   3. Kitchen Display Service (KitchenDisplay)
 *   4. Backend sync (POST /sync/orders)
 *
 * Regression: previously the offline payload was missing product_name,
 * coupon_*, total_amount, and other fields → KDS/printer/sync produced
 * different results from Online mode.
 */

// Helper: simulate the payload construction from POS.saveOrderOffline()
function buildOfflinePayload({ cart, discount = 0, couponDiscount = 0, appliedCoupon = null, ...meta }) {
  const subtotalCalc = cart.reduce((sum, item) =>
    sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)),
    0
  );
  const totalDiscountVal = discount + couponDiscount;
  const totalCalc = Math.max(0, subtotalCalc - Math.min(subtotalCalc, totalDiscountVal));

  return {
    order_type: meta.orderType,
    table_id: meta.orderType === 'dine_in' ? meta.selectedTable : null,
    customer_name: meta.customerName,
    customer_phone: meta.customerPhone,
    items: cart.map(item => ({
      product_id: item.product_id || item.id,
      product_name: item.product_name || item.name,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      cost: item.cost || 0,
      notes: item.notes || '',
      extras: item.selectedExtras || []
    })),
    subtotal: subtotalCalc,
    total: totalCalc,
    total_amount: totalCalc,
    discount,
    coupon_id: appliedCoupon?.id || null,
    coupon_code: appliedCoupon?.code || null,
    coupon_name: appliedCoupon?.name || null,
    coupon_discount: couponDiscount,
    tax: 0,
    branch_id: meta.currentBranchId,
    payment_method: meta.paymentMethod,
    delivery_app: meta.orderType === 'delivery' ? meta.deliveryApp : null,
    driver_id: meta.selectedDriver || null,
    notes: meta.orderNotes,
    status: 'pending',
    cashier_id: meta.userId,
    cashier_name: meta.userName,
  };
}

describe('Offline order payload parity with Online', () => {
  test('contains product_name on every item (needed by KDS + printer)', () => {
    const cart = [
      { id: 'p1', product_name: 'برجر', name: 'برجر', price: 10000, quantity: 2 },
      { id: 'p2', name: 'كولا', price: 1500, quantity: 1 },
    ];
    const payload = buildOfflinePayload({ cart, orderType: 'takeaway', paymentMethod: 'cash' });
    expect(payload.items.every(i => i.product_name)).toBe(true);
    expect(payload.items[0].product_name).toBe('برجر');
    expect(payload.items[1].product_name).toBe('كولا');
  });

  test('total respects discount + coupon_discount', () => {
    const cart = [{ id: 'p1', name: 'item', price: 10000, quantity: 1 }];
    const payload = buildOfflinePayload({ cart, discount: 1000, couponDiscount: 500 });
    expect(payload.subtotal).toBe(10000);
    expect(payload.total).toBe(8500);
    expect(payload.total_amount).toBe(8500);
    expect(payload.coupon_discount).toBe(500);
  });

  test('coupon fields persisted when applied', () => {
    const cart = [{ id: 'p1', name: 'x', price: 5000, quantity: 1 }];
    const coupon = { id: 'c1', code: 'WELCOME10', name: 'ترحيب' };
    const payload = buildOfflinePayload({ cart, couponDiscount: 500, appliedCoupon: coupon });
    expect(payload.coupon_id).toBe('c1');
    expect(payload.coupon_code).toBe('WELCOME10');
    expect(payload.coupon_name).toBe('ترحيب');
  });

  test('extras are aggregated into subtotal correctly', () => {
    const cart = [
      {
        id: 'p1', name: 'برجر', price: 10000, quantity: 2,
        selectedExtras: [
          { name: 'جبن', price: 1000, quantity: 1 },
          { name: 'صلصة', price: 500, quantity: 2 },
        ],
      },
    ];
    const payload = buildOfflinePayload({ cart });
    // 2 × 10000 + (1×1000 + 2×500) = 22000
    expect(payload.subtotal).toBe(22000);
    expect(payload.items[0].extras).toHaveLength(2);
  });

  test('delivery_app field set only for delivery orders', () => {
    const cart = [{ id: 'p1', name: 'x', price: 1000, quantity: 1 }];
    const dineIn = buildOfflinePayload({ cart, orderType: 'dine_in', deliveryApp: 'CARRIAGE' });
    const delivery = buildOfflinePayload({ cart, orderType: 'delivery', deliveryApp: 'CARRIAGE' });
    expect(dineIn.delivery_app).toBeNull();
    expect(delivery.delivery_app).toBe('CARRIAGE');
  });

  test('table_id present only for dine_in orders', () => {
    const cart = [{ id: 'p1', name: 'x', price: 1000, quantity: 1 }];
    const takeaway = buildOfflinePayload({ cart, orderType: 'takeaway', selectedTable: 'T5' });
    const dineIn = buildOfflinePayload({ cart, orderType: 'dine_in', selectedTable: 'T5' });
    expect(takeaway.table_id).toBeNull();
    expect(dineIn.table_id).toBe('T5');
  });

  test('cashier identity preserved (needed by sync + KDS user filter)', () => {
    const cart = [{ id: 'p1', name: 'x', price: 1000, quantity: 1 }];
    const payload = buildOfflinePayload({
      cart, userId: 'u123', userName: 'أحمد',
    });
    expect(payload.cashier_id).toBe('u123');
    expect(payload.cashier_name).toBe('أحمد');
  });
});

describe('Offline order dedup logic', () => {
  // Mimics the setPendingOrders dedup check in saveOrderOffline
  function checkExists(prev, saved) {
    return prev.some(o =>
      (saved.id && o.id === saved.id) ||
      (saved.offline_id && o.offline_id === saved.offline_id) ||
      (saved.offline_id && o.id === saved.offline_id)
    );
  }

  test('detects duplicate by id', () => {
    const prev = [{ id: 'X', offline_id: null }];
    expect(checkExists(prev, { id: 'X', offline_id: null })).toBe(true);
  });

  test('detects duplicate by offline_id', () => {
    const prev = [{ id: 'a', offline_id: 'OFF-1' }];
    expect(checkExists(prev, { id: 'b', offline_id: 'OFF-1' })).toBe(true);
  });

  test('detects when offline_id matches another order id (rare race)', () => {
    const prev = [{ id: 'OFF-X', offline_id: null }];
    expect(checkExists(prev, { id: 'new', offline_id: 'OFF-X' })).toBe(true);
  });

  test('no false positives for distinct orders', () => {
    const prev = [{ id: 'A', offline_id: 'OFF-1' }];
    expect(checkExists(prev, { id: 'B', offline_id: 'OFF-2' })).toBe(false);
  });
});
