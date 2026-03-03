/**
 * Offline Storage Service
 * خدمة التخزين المحلي للعمل بدون إنترنت
 */

import db, { STORES } from './offlineDB';
import { getOnlineStatus } from '../hooks/useOnlineStatus';

// توليد معرف فريد للطلبات المحلية
export const generateOfflineId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `OFF-${timestamp}-${random}`.toUpperCase();
};

// توليد UUID
export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * تهيئة البيانات من الخادم
 */
export const initializeOfflineData = async (token) => {
  if (!getOnlineStatus()) {
    console.log('⚠️ لا يوجد اتصال - استخدام البيانات المحلية');
    return false;
  }

  try {
    const API = process.env.REACT_APP_BACKEND_URL + '/api';
    const headers = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // جلب البيانات بالتوازي
    const [
      productsRes,
      categoriesRes,
      customersRes,
      branchesRes,
      tablesRes,
      settingsRes
    ] = await Promise.all([
      fetch(`${API}/products`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/categories`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/customers`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/branches`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/tables`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/settings/dashboard`, { headers }).then(r => r.json()).catch(() => ({}))
    ]);

    // حفظ في IndexedDB
    await Promise.all([
      db.addItems(STORES.PRODUCTS, Array.isArray(productsRes) ? productsRes : []),
      db.addItems(STORES.CATEGORIES, Array.isArray(categoriesRes) ? categoriesRes : []),
      db.addItems(STORES.CUSTOMERS, Array.isArray(customersRes) ? customersRes : []),
      db.addItems(STORES.BRANCHES, Array.isArray(branchesRes) ? branchesRes : []),
      db.addItems(STORES.TABLES, Array.isArray(tablesRes) ? tablesRes : []),
      db.addItem(STORES.SETTINGS, { key: 'dashboard', ...settingsRes })
    ]);

    // حفظ وقت آخر تحديث
    await db.addItem(STORES.SETTINGS, { 
      key: 'lastSync', 
      value: new Date().toISOString() 
    });

    console.log('✅ تم تحديث البيانات المحلية');
    return true;
  } catch (error) {
    console.error('❌ خطأ في تحديث البيانات المحلية:', error);
    return false;
  }
};

/**
 * حفظ بيانات المستخدم للدخول Offline
 */
export const saveUserForOfflineLogin = async (user, passwordHash) => {
  try {
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name || user.full_name,
      role: user.role,
      branch_id: user.branch_id,
      tenant_id: user.tenant_id,
      permissions: user.permissions || {},
      passwordHash: passwordHash, // كلمة المرور مشفرة
      savedAt: new Date().toISOString()
    };
    
    await db.addItem(STORES.USERS, userData);
    console.log('✅ تم حفظ بيانات المستخدم للدخول Offline');
    return true;
  } catch (error) {
    console.error('❌ خطأ في حفظ بيانات المستخدم:', error);
    return false;
  }
};

/**
 * التحقق من بيانات المستخدم Offline
 */
export const verifyOfflineUser = async (email, passwordHash) => {
  try {
    const users = await db.getItemsByIndex(STORES.USERS, 'email', email);
    if (users.length === 0) {
      return { success: false, error: 'لم يتم العثور على المستخدم' };
    }

    const user = users[0];
    if (user.passwordHash !== passwordHash) {
      return { success: false, error: 'كلمة المرور غير صحيحة' };
    }

    return { success: true, user };
  } catch (error) {
    return { success: false, error: 'خطأ في التحقق' };
  }
};

/**
 * حفظ طلب جديد
 */
export const saveOfflineOrder = async (order) => {
  try {
    const offlineOrder = {
      ...order,
      id: order.id || generateUUID(),
      offline_id: generateOfflineId(),
      is_synced: false,
      is_offline: true,
      created_at: order.created_at || new Date().toISOString(),
      synced_at: null
    };

    await db.addItem(STORES.ORDERS, offlineOrder);
    
    // إضافة للطابور
    await addToSyncQueue('order', 'create', offlineOrder);

    console.log('✅ تم حفظ الطلب محلياً:', offlineOrder.offline_id);
    return offlineOrder;
  } catch (error) {
    console.error('❌ خطأ في حفظ الطلب:', error);
    throw error;
  }
};

/**
 * تحديث طلب
 */
export const updateOfflineOrder = async (orderId, updates) => {
  try {
    const order = await db.getItem(STORES.ORDERS, orderId);
    if (!order) throw new Error('الطلب غير موجود');

    const updatedOrder = {
      ...order,
      ...updates,
      is_synced: false,
      updated_at: new Date().toISOString()
    };

    await db.updateItem(STORES.ORDERS, updatedOrder);
    await addToSyncQueue('order', 'update', updatedOrder);

    return updatedOrder;
  } catch (error) {
    console.error('❌ خطأ في تحديث الطلب:', error);
    throw error;
  }
};

/**
 * الحصول على طلبات اليوم
 */
export const getTodayOrders = async () => {
  try {
    const allOrders = await db.getAllItems(STORES.ORDERS);
    const today = new Date().toDateString();
    
    return allOrders.filter(order => {
      const orderDate = new Date(order.created_at).toDateString();
      return orderDate === today;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (error) {
    console.error('❌ خطأ في جلب الطلبات:', error);
    return [];
  }
};

/**
 * الحصول على الطلبات غير المتزامنة
 */
export const getUnsyncedOrders = async () => {
  return db.getItemsByIndex(STORES.ORDERS, 'is_synced', false);
};

/**
 * عدد الطلبات غير المتزامنة
 */
export const countUnsyncedOrders = async () => {
  const orders = await getUnsyncedOrders();
  return orders.length;
};

/**
 * حفظ عميل جديد
 */
export const saveOfflineCustomer = async (customer) => {
  try {
    const offlineCustomer = {
      ...customer,
      id: customer.id || generateUUID(),
      is_synced: false,
      created_at: customer.created_at || new Date().toISOString()
    };

    await db.addItem(STORES.CUSTOMERS, offlineCustomer);
    await addToSyncQueue('customer', 'create', offlineCustomer);

    return offlineCustomer;
  } catch (error) {
    console.error('❌ خطأ في حفظ العميل:', error);
    throw error;
  }
};

/**
 * إضافة عنصر لطابور المزامنة
 */
export const addToSyncQueue = async (entityType, action, data) => {
  try {
    const queueItem = {
      type: entityType,
      action: action,
      data: data,
      status: 'pending',
      attempts: 0,
      created_at: new Date().toISOString(),
      last_attempt: null,
      error: null
    };

    await db.addItem(STORES.SYNC_QUEUE, queueItem);
    return true;
  } catch (error) {
    console.error('❌ خطأ في إضافة لطابور المزامنة:', error);
    return false;
  }
};

/**
 * الحصول على عناصر طابور المزامنة
 */
export const getSyncQueue = async () => {
  try {
    const items = await db.getItemsByIndex(STORES.SYNC_QUEUE, 'status', 'pending');
    return items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } catch (error) {
    console.error('❌ خطأ في جلب طابور المزامنة:', error);
    return [];
  }
};

/**
 * تحديث حالة عنصر في الطابور
 */
export const updateSyncQueueItem = async (id, updates) => {
  try {
    const item = await db.getItem(STORES.SYNC_QUEUE, id);
    if (item) {
      await db.updateItem(STORES.SYNC_QUEUE, { ...item, ...updates });
    }
  } catch (error) {
    console.error('❌ خطأ في تحديث الطابور:', error);
  }
};

/**
 * حذف عنصر من الطابور بعد المزامنة
 */
export const removeSyncQueueItem = async (id) => {
  try {
    await db.deleteItem(STORES.SYNC_QUEUE, id);
  } catch (error) {
    console.error('❌ خطأ في حذف من الطابور:', error);
  }
};

/**
 * تحديث طلب بعد المزامنة
 */
export const markOrderAsSynced = async (offlineId, serverId, serverOrderNumber) => {
  try {
    const orders = await db.getAllItems(STORES.ORDERS);
    const order = orders.find(o => o.offline_id === offlineId || o.id === offlineId);
    
    if (order) {
      await db.updateItem(STORES.ORDERS, {
        ...order,
        id: serverId,
        order_number: serverOrderNumber,
        is_synced: true,
        synced_at: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ خطأ في تحديث حالة المزامنة:', error);
  }
};

/**
 * مسح البيانات القديمة (أكثر من 7 أيام)
 */
export const cleanupOldData = async () => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const orders = await db.getAllItems(STORES.ORDERS);
    const oldOrders = orders.filter(order => {
      return order.is_synced && new Date(order.created_at) < sevenDaysAgo;
    });

    for (const order of oldOrders) {
      await db.deleteItem(STORES.ORDERS, order.id);
    }

    console.log(`🗑️ تم حذف ${oldOrders.length} طلب قديم`);
  } catch (error) {
    console.error('❌ خطأ في تنظيف البيانات:', error);
  }
};

export default {
  generateOfflineId,
  generateUUID,
  initializeOfflineData,
  saveUserForOfflineLogin,
  verifyOfflineUser,
  saveOfflineOrder,
  updateOfflineOrder,
  getTodayOrders,
  getUnsyncedOrders,
  countUnsyncedOrders,
  saveOfflineCustomer,
  addToSyncQueue,
  getSyncQueue,
  updateSyncQueueItem,
  removeSyncQueueItem,
  markOrderAsSynced,
  cleanupOldData
};
