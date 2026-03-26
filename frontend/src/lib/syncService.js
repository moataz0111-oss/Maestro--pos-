/**
 * Sync Service
 * خدمة المزامنة بين التخزين المحلي والخادم
 */

import db, { STORES } from './offlineDB';
import offlineStorage from './offlineStorage';
import { getOnlineStatus } from '../hooks/useOnlineStatus';
import { playSyncComplete } from '../utils/sound';
import { API_URL } from '../utils/api';

let isSyncing = false;
let syncListeners = [];

// إضافة مستمع للمزامنة
export const addSyncListener = (callback) => {
  syncListeners.push(callback);
  return () => {
    syncListeners = syncListeners.filter(l => l !== callback);
  };
};

// إشعار المستمعين
const notifySyncListeners = (event, data) => {
  syncListeners.forEach(callback => callback(event, data));
};

/**
 * بدء المزامنة
 */
export const startSync = async (token) => {
  if (isSyncing) {
    console.log('⏳ المزامنة جارية بالفعل...');
    return { success: false, message: 'المزامنة جارية' };
  }

  if (!getOnlineStatus()) {
    console.log('❌ لا يوجد اتصال - لا يمكن المزامنة');
    return { success: false, message: 'لا يوجد اتصال' };
  }

  isSyncing = true;
  notifySyncListeners('start', {});

  const results = {
    orders: { synced: 0, failed: 0 },
    customers: { synced: 0, failed: 0 },
    expenses: { synced: 0, failed: 0 },
    total: 0
  };

  try {
    const API = API_URL;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 1. مزامنة الطلبات
    const unsyncedOrders = await offlineStorage.getUnsyncedOrders();
    console.log(`📤 مزامنة ${unsyncedOrders.length} طلب...`);

    for (const order of unsyncedOrders) {
      try {
        notifySyncListeners('progress', {
          type: 'order',
          current: results.orders.synced + results.orders.failed + 1,
          total: unsyncedOrders.length,
          item: order
        });

        // إرسال الطلب للخادم
        const response = await fetch(`${API}/sync/orders`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...order,
            offline_id: order.offline_id,
            is_offline_order: true
          })
        });

        if (response.ok) {
          const serverOrder = await response.json();
          
          // تحديث الطلب المحلي
          await offlineStorage.markOrderAsSynced(
            order.offline_id || order.id,
            serverOrder.id,
            serverOrder.order_number
          );

          results.orders.synced++;
          console.log(`✅ تم مزامنة الطلب: ${order.offline_id} → #${serverOrder.order_number}`);
        } else {
          const error = await response.text();
          console.error(`❌ فشل مزامنة الطلب: ${order.offline_id}`, error);
          results.orders.failed++;
        }
      } catch (error) {
        console.error(`❌ خطأ في مزامنة الطلب: ${order.offline_id}`, error);
        results.orders.failed++;
      }
    }

    // 2. مزامنة العملاء
    const unsyncedCustomers = await db.getItemsByIndex(STORES.CUSTOMERS, 'is_synced', false);
    console.log(`📤 مزامنة ${unsyncedCustomers.length} عميل...`);

    for (const customer of unsyncedCustomers) {
      try {
        const response = await fetch(`${API}/sync/customers`, {
          method: 'POST',
          headers,
          body: JSON.stringify(customer)
        });

        if (response.ok) {
          const serverCustomer = await response.json();
          await db.updateItem(STORES.CUSTOMERS, {
            ...customer,
            id: serverCustomer.id,
            is_synced: true,
            synced_at: new Date().toISOString()
          });
          results.customers.synced++;
        } else {
          results.customers.failed++;
        }
      } catch (error) {
        results.customers.failed++;
      }
    }

    // 3. مزامنة المصاريف
    const unsyncedExpenses = await db.getItemsByIndex(STORES.EXPENSES, 'is_synced', false);
    console.log(`📤 مزامنة ${unsyncedExpenses.length} مصروف...`);

    for (const expense of unsyncedExpenses) {
      try {
        notifySyncListeners('progress', {
          type: 'expense',
          current: results.expenses.synced + results.expenses.failed + 1,
          total: unsyncedExpenses.length,
          item: expense
        });

        const response = await fetch(`${API}/expenses`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            category: expense.category,
            description: expense.description,
            amount: expense.amount,
            payment_method: expense.payment_method,
            reference_number: expense.reference_number,
            date: expense.date,
            branch_id: expense.branch_id
          })
        });

        if (response.ok) {
          // تحديث المصروف المحلي
          await db.updateItem(STORES.EXPENSES, {
            ...expense,
            is_synced: true,
            synced_at: new Date().toISOString()
          });
          results.expenses.synced++;
          console.log(`✅ تم مزامنة المصروف: ${expense.offline_id || expense.id}`);
        } else {
          const error = await response.text();
          console.error(`❌ فشل مزامنة المصروف: ${expense.offline_id}`, error);
          results.expenses.failed++;
        }
      } catch (error) {
        console.error(`❌ خطأ في مزامنة المصروف:`, error);
        results.expenses.failed++;
      }
    }

    // 4. تحديث البيانات من الخادم
    await offlineStorage.initializeOfflineData(token);

    // 4. تنظيف الطابور
    const syncQueue = await offlineStorage.getSyncQueue();
    for (const item of syncQueue) {
      if (item.status === 'completed') {
        await offlineStorage.removeSyncQueueItem(item.id);
      }
    }

    results.total = results.orders.synced + results.customers.synced + results.expenses.synced;

    console.log('✅ اكتملت المزامنة:', results);
    notifySyncListeners('complete', results);
    
    // تشغيل صوت نجاح المزامنة
    if (results.total > 0) {
      try {
        playSyncComplete();
      } catch (soundError) {
        console.log('Sound playback skipped');
      }
    }

    return { success: true, results };
  } catch (error) {
    console.error('❌ خطأ في المزامنة:', error);
    notifySyncListeners('error', { error: error.message });
    return { success: false, error: error.message };
  } finally {
    isSyncing = false;
  }
};

/**
 * مزامنة تلقائية عند عودة الاتصال
 */
export const autoSync = async (token) => {
  const unsyncedCount = await offlineStorage.countUnsyncedOrders();
  
  if (unsyncedCount > 0) {
    console.log(`🔄 بدء المزامنة التلقائية (${unsyncedCount} عنصر)...`);
    return startSync(token);
  }
  
  return { success: true, message: 'لا توجد عناصر للمزامنة' };
};

/**
 * حالة المزامنة
 */
export const getSyncStatus = async () => {
  try {
    const unsyncedOrders = await offlineStorage.countUnsyncedOrders();
    const syncQueue = await offlineStorage.getSyncQueue();
    const lastSync = await db.getItem(STORES.SETTINGS, 'lastSync');

    return {
      isSyncing,
      pendingOrders: unsyncedOrders || 0,
      pendingItems: syncQueue?.length || 0,
      lastSync: lastSync?.value || null
    };
  } catch (error) {
    console.error('Error getting sync status:', error);
    return {
      isSyncing: false,
      pendingOrders: 0,
      pendingItems: 0,
      lastSync: null
    };
  }
};

/**
 * إعادة محاولة العناصر الفاشلة
 */
export const retryFailedItems = async (token) => {
  const syncQueue = await offlineStorage.getSyncQueue();
  const failedItems = syncQueue.filter(item => item.status === 'failed' && item.attempts < 3);

  for (const item of failedItems) {
    await offlineStorage.updateSyncQueueItem(item.id, {
      status: 'pending',
      attempts: item.attempts + 1,
      last_attempt: new Date().toISOString()
    });
  }

  if (failedItems.length > 0) {
    return startSync(token);
  }

  return { success: true, message: 'لا توجد عناصر فاشلة' };
};

/**
 * فرض المزامنة (تجاهل القفل)
 */
export const forceSync = async (token) => {
  isSyncing = false;
  return startSync(token);
};

export default {
  startSync,
  autoSync,
  getSyncStatus,
  retryFailedItems,
  forceSync,
  addSyncListener
};
