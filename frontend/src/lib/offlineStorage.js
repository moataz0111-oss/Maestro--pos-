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
      settingsRes,
      tenantRes,
      statsRes
    ] = await Promise.all([
      fetch(`${API}/products`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/categories`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/customers`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/branches`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/tables`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${API}/settings/dashboard`, { headers }).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/tenant/info`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${API}/dashboard/stats`, { headers }).then(r => r.json()).catch(() => null)
    ]);

    // حفظ في IndexedDB
    await Promise.all([
      db.addItems(STORES.PRODUCTS, Array.isArray(productsRes) ? productsRes : []),
      db.addItems(STORES.CATEGORIES, Array.isArray(categoriesRes) ? categoriesRes : []),
      db.addItems(STORES.CUSTOMERS, Array.isArray(customersRes) ? customersRes : []),
      db.addItems(STORES.BRANCHES, Array.isArray(branchesRes) ? branchesRes : []),
      db.addItems(STORES.TABLES, Array.isArray(tablesRes) ? tablesRes : []),
      db.addItem(STORES.SETTINGS, { key: 'dashboard', ...settingsRes }),
      // حفظ بيانات المستأجر (اسم المطعم والشعار)
      tenantRes ? db.addItem(STORES.SETTINGS, { key: 'tenant', ...tenantRes }) : Promise.resolve(),
      // حفظ الإحصائيات
      statsRes ? db.addItem(STORES.SETTINGS, { key: 'stats', ...statsRes }) : Promise.resolve()
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
 * حفظ الطلبات من API للاستخدام offline (cache للعرض فقط)
 * هذه الطلبات تكون مزامنة بالفعل (is_synced = true)
 */
export const cacheApiOrders = async (orders) => {
  try {
    if (!orders || orders.length === 0) return;
    
    console.log('💾 تخزين طلبات API للاستخدام offline:', orders.length);
    
    // جلب الطلبات الموجودة مرة واحدة
    const existingOrders = await db.getAllItems(STORES.ORDERS);
    const existingIds = new Set(existingOrders.map(o => o.id));
    const existingOfflineIds = new Set(existingOrders.filter(o => o.offline_id).map(o => o.offline_id));
    
    let cachedCount = 0;
    
    for (const order of orders) {
      // تجاهل الطلبات الملغاة أو المسلمة
      if (order.status === 'cancelled' || order.status === 'delivered') continue;
      
      // تحقق إذا كان الطلب موجود مسبقاً
      const existsById = existingIds.has(order.id);
      const existsByOfflineId = order.offline_id && existingOfflineIds.has(order.offline_id);
      
      if (!existsById && !existsByOfflineId) {
        // حفظ الطلب كـ cached (مزامن)
        const cachedOrder = {
          ...order,
          is_synced: true,
          is_cached: true,
          cached_at: new Date().toISOString()
        };
        
        try {
          await db.addItem(STORES.ORDERS, cachedOrder);
          cachedCount++;
        } catch (addError) {
          // إذا فشل الإضافة، جرب التحديث
          try {
            await db.updateItem(STORES.ORDERS, cachedOrder);
            cachedCount++;
          } catch (updateError) {
            console.log('Could not cache order:', order.id);
          }
        }
      }
    }
    
    if (cachedCount > 0) {
      console.log(`✅ تم تخزين ${cachedCount} طلب من API للاستخدام offline`);
    }
  } catch (error) {
    console.error('❌ خطأ في تخزين طلبات API:', error);
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
  try {
    // أولاً جرب البحث بالفهرس
    const orders = await db.getItemsByIndex(STORES.ORDERS, 'is_synced', false);
    if (orders && orders.length > 0) {
      return orders;
    }
    
    // إذا فشل، ابحث في كل الطلبات
    const allOrders = await db.getAllItems(STORES.ORDERS);
    return allOrders.filter(order => order.is_synced === false);
  } catch (error) {
    console.error('Error getting unsynced orders:', error);
    return [];
  }
};

/**
 * حذف طلب من التخزين المحلي
 */
export const deleteOfflineOrder = async (orderId) => {
  try {
    console.log('🗑️ محاولة حذف الطلب:', orderId);
    
    // جلب جميع الطلبات
    const allOrders = await db.getAllItems(STORES.ORDERS);
    console.log('📦 عدد الطلبات الموجودة:', allOrders.length);
    
    // البحث عن الطلب بكل الطرق الممكنة
    const order = allOrders.find(o => {
      const idStr = String(orderId);
      return o.id === orderId || 
        o.offline_id === orderId ||
        String(o.id) === idStr ||
        String(o.offline_id) === idStr;
    });
    
    if (!order) {
      console.warn('⚠️ الطلب غير موجود في التخزين المحلي:', orderId);
      return true;
    }
    
    console.log('📋 الطلب الموجود:', { id: order.id, offline_id: order.offline_id });
    
    // حذف الطلب باستخدام المعرف الأساسي (id)
    // لأن keyPath في IndexedDB هو 'id'
    await db.deleteItem(STORES.ORDERS, order.id);
    
    // تأكيد الحذف
    const remainingOrders = await db.getAllItems(STORES.ORDERS);
    const stillExists = remainingOrders.find(o => o.id === order.id);
    
    if (stillExists) {
      console.error('❌ فشل في حذف الطلب - لا يزال موجوداً');
      // محاولة ثانية
      try {
        await db.deleteItem(STORES.ORDERS, order.id);
      } catch (e) {
        console.error('❌ فشلت المحاولة الثانية:', e);
      }
    } else {
      console.log('✅ تم حذف الطلب بنجاح. الطلبات المتبقية:', remainingOrders.length);
    }
    
    return true;
  } catch (error) {
    console.error('❌ خطأ في حذف الطلب:', error);
    throw error;
  }
};

/**
 * عدد الطلبات غير المتزامنة
 */
export const countUnsyncedOrders = async () => {
  try {
    const orders = await getUnsyncedOrders();
    return orders.length;
  } catch (error) {
    console.error('Error counting unsynced orders:', error);
    return 0;
  }
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
    if (items && items.length > 0) {
      return items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    
    // إذا فشل البحث بالفهرس، ابحث في كل العناصر
    const allItems = await db.getAllItems(STORES.SYNC_QUEUE);
    return allItems
      .filter(item => item.status === 'pending')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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
    console.log('🔄 تعليم الطلب كمتزامن:', offlineId, '->', serverId);
    const orders = await db.getAllItems(STORES.ORDERS);
    const order = orders.find(o => o.offline_id === offlineId || o.id === offlineId);
    
    if (order) {
      // حذف الطلب المحلي القديم بدلاً من تحديثه
      // لأن الطلب أصبح موجوداً في الخادم
      try {
        await db.deleteItem(STORES.ORDERS, order.id);
        console.log('✅ تم حذف الطلب المحلي:', order.id || order.offline_id);
      } catch (deleteError) {
        // إذا فشل الحذف بالـ id، جرب بالـ offline_id
        try {
          await db.deleteItem(STORES.ORDERS, order.offline_id);
          console.log('✅ تم حذف الطلب المحلي بـ offline_id:', order.offline_id);
        } catch (e) {
          console.log('⚠️ فشل حذف الطلب المحلي:', e);
        }
      }
      
      // إزالة من طابور المزامنة أيضاً
      try {
        const syncQueue = await db.getAllItems(STORES.SYNC_QUEUE);
        const relatedItems = syncQueue.filter(item => 
          item.data?.offline_id === offlineId || 
          item.data?.id === offlineId
        );
        for (const item of relatedItems) {
          await db.deleteItem(STORES.SYNC_QUEUE, item.id);
        }
      } catch (queueError) {
        console.log('⚠️ فشل تنظيف طابور المزامنة:', queueError);
      }
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

/**
 * تنظيف الطلبات المزامنة مسبقاً (التي لها order_number ولكن is_synced = false)
 * تُستدعى عند الاتصال بالإنترنت لإزالة الطلبات المكررة
 * ملاحظة: لا تحذف الطلبات المخزنة من API (is_cached = true)
 */
export const cleanupSyncedOrders = async (apiOrders = []) => {
  try {
    const localOrders = await db.getAllItems(STORES.ORDERS);
    
    // جمع كل الـ offline_ids من API
    const apiOfflineIds = new Set(apiOrders.filter(o => o.offline_id).map(o => o.offline_id));
    
    let deletedCount = 0;
    
    for (const order of localOrders) {
      // لا تحذف الطلبات المخزنة من API (cached)
      if (order.is_cached === true) {
        continue;
      }
      
      // لا تحذف إلا الطلبات المحلية غير المزامنة التي تم رفعها
      if (order.is_synced !== false) {
        continue;
      }
      
      let shouldDelete = false;
      
      // حذف فقط إذا كان offline_id موجود في API (يعني تم رفعه بنجاح)
      if (order.offline_id && apiOfflineIds.has(order.offline_id)) {
        shouldDelete = true;
      }
      
      if (shouldDelete) {
        console.log('🗑️ حذف طلب مزامن:', order.offline_id || order.id);
        try {
          await db.deleteItem(STORES.ORDERS, order.id);
          deletedCount++;
        } catch (e) {
          try {
            await db.deleteItem(STORES.ORDERS, order.offline_id);
            deletedCount++;
          } catch (e2) {}
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`🧹 تم تنظيف ${deletedCount} طلب محلي مكرر من IndexedDB`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('❌ خطأ في تنظيف الطلبات المزامنة:', error);
    return 0;
  }
};

/**
 * حفظ حركة مخزون Offline
 */
export const saveOfflineInventoryTransaction = async (transaction) => {
  try {
    const offlineTransaction = {
      ...transaction,
      id: transaction.id || generateUUID(),
      offline_id: generateOfflineId(),
      is_synced: false,
      created_at: transaction.created_at || new Date().toISOString()
    };

    await db.addItem(STORES.INVENTORY, offlineTransaction);
    await addToSyncQueue('inventory_transaction', 'create', offlineTransaction);

    console.log('✅ تم حفظ حركة المخزون محلياً:', offlineTransaction.offline_id);
    return offlineTransaction;
  } catch (error) {
    console.error('❌ خطأ في حفظ حركة المخزون:', error);
    throw error;
  }
};

/**
 * حفظ حضور موظف Offline
 */
export const saveOfflineAttendance = async (attendance) => {
  try {
    const offlineAttendance = {
      ...attendance,
      id: attendance.id || generateUUID(),
      offline_id: generateOfflineId(),
      is_synced: false,
      created_at: attendance.created_at || new Date().toISOString()
    };

    await db.addItem(STORES.EMPLOYEES, offlineAttendance);
    await addToSyncQueue('attendance', 'create', offlineAttendance);

    console.log('✅ تم حفظ الحضور محلياً:', offlineAttendance.offline_id);
    return offlineAttendance;
  } catch (error) {
    console.error('❌ خطأ في حفظ الحضور:', error);
    throw error;
  }
};

/**
 * حفظ تحديث طاولة Offline
 */
export const saveOfflineTableUpdate = async (tableId, updates) => {
  try {
    const table = await db.getItem(STORES.TABLES, tableId);
    if (!table) throw new Error('الطاولة غير موجودة');

    const updatedTable = {
      ...table,
      ...updates,
      is_synced: false,
      updated_at: new Date().toISOString()
    };

    await db.updateItem(STORES.TABLES, updatedTable);
    await addToSyncQueue('table', 'update', updatedTable);

    return updatedTable;
  } catch (error) {
    console.error('❌ خطأ في تحديث الطاولة:', error);
    throw error;
  }
};

/**
 * الحصول على جميع الطاولات المحلية
 */
export const getLocalTables = async () => {
  try {
    return await db.getAllItems(STORES.TABLES);
  } catch (error) {
    console.error('❌ خطأ في جلب الطاولات:', error);
    return [];
  }
};

/**
 * الحصول على جميع المنتجات المحلية
 */
export const getLocalProducts = async () => {
  try {
    return await db.getAllItems(STORES.PRODUCTS);
  } catch (error) {
    console.error('❌ خطأ في جلب المنتجات:', error);
    return [];
  }
};

/**
 * الحصول على جميع التصنيفات المحلية
 */
export const getLocalCategories = async () => {
  try {
    return await db.getAllItems(STORES.CATEGORIES);
  } catch (error) {
    console.error('❌ خطأ في جلب التصنيفات:', error);
    return [];
  }
};

/**
 * الحصول على جميع الفروع المحلية
 */
export const getLocalBranches = async () => {
  try {
    return await db.getAllItems(STORES.BRANCHES);
  } catch (error) {
    console.error('❌ خطأ في جلب الفروع:', error);
    return [];
  }
};

/**
 * الحصول على المخزون المحلي
 */
export const getLocalInventory = async () => {
  try {
    return await db.getAllItems(STORES.INVENTORY);
  } catch (error) {
    console.error('❌ خطأ في جلب المخزون:', error);
    return [];
  }
};

/**
 * الحصول على الموظفين المحليين
 */
export const getLocalEmployees = async () => {
  try {
    return await db.getAllItems(STORES.EMPLOYEES);
  } catch (error) {
    console.error('❌ خطأ في جلب الموظفين:', error);
    return [];
  }
};

/**
 * الحصول على بيانات المستأجر المحلية (اسم المطعم والشعار)
 */
export const getLocalTenantInfo = async () => {
  try {
    const tenant = await db.getItem(STORES.SETTINGS, 'tenant');
    return tenant || null;
  } catch (error) {
    console.error('❌ خطأ في جلب بيانات المستأجر:', error);
    return null;
  }
};

/**
 * الحصول على الإحصائيات المحلية
 */
export const getLocalStats = async () => {
  try {
    const stats = await db.getItem(STORES.SETTINGS, 'stats');
    return stats || null;
  } catch (error) {
    console.error('❌ خطأ في جلب الإحصائيات:', error);
    return null;
  }
};

/**
 * الحصول على إعدادات لوحة التحكم المحلية
 */
export const getLocalDashboardSettings = async () => {
  try {
    const settings = await db.getItem(STORES.SETTINGS, 'dashboard');
    return settings || {};
  } catch (error) {
    console.error('❌ خطأ في جلب إعدادات لوحة التحكم:', error);
    return {};
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
  cleanupOldData,
  cleanupSyncedOrders,
  cacheApiOrders,
  saveOfflineInventoryTransaction,
  saveOfflineAttendance,
  saveOfflineTableUpdate,
  getLocalTables,
  getLocalProducts,
  getLocalCategories,
  getLocalBranches,
  getLocalInventory,
  getLocalEmployees,
  getLocalTenantInfo,
  getLocalStats,
  getLocalDashboardSettings,
  deleteOfflineOrder
};
