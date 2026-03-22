/**
 * IndexedDB Database Service
 * قاعدة البيانات المحلية للعمل بدون إنترنت
 */

const DB_NAME = 'MaestroOfflineDB';
const DB_VERSION = 1;

// أسماء المخازن (Tables)
export const STORES = {
  ORDERS: 'orders',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  CUSTOMERS: 'customers',
  USERS: 'users',
  SYNC_QUEUE: 'sync_queue',
  SETTINGS: 'settings',
  BRANCHES: 'branches',
  TABLES: 'tables',
  INVENTORY: 'inventory',
  EMPLOYEES: 'employees',
  SHIFTS: 'shifts',
  EXPENSES: 'expenses',
};

let db = null;

/**
 * فتح قاعدة البيانات
 */
export const openDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('❌ خطأ في فتح قاعدة البيانات:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('✅ تم فتح قاعدة البيانات المحلية');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      console.log('🔄 تحديث قاعدة البيانات...');

      // إنشاء مخزن الطلبات
      if (!database.objectStoreNames.contains(STORES.ORDERS)) {
        const ordersStore = database.createObjectStore(STORES.ORDERS, { keyPath: 'id' });
        ordersStore.createIndex('status', 'status', { unique: false });
        ordersStore.createIndex('created_at', 'created_at', { unique: false });
        ordersStore.createIndex('is_synced', 'is_synced', { unique: false });
        ordersStore.createIndex('offline_id', 'offline_id', { unique: false });
      }

      // إنشاء مخزن المنتجات
      if (!database.objectStoreNames.contains(STORES.PRODUCTS)) {
        const productsStore = database.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
        productsStore.createIndex('category_id', 'category_id', { unique: false });
        productsStore.createIndex('is_active', 'is_active', { unique: false });
      }

      // إنشاء مخزن التصنيفات
      if (!database.objectStoreNames.contains(STORES.CATEGORIES)) {
        const categoriesStore = database.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
        categoriesStore.createIndex('is_active', 'is_active', { unique: false });
      }

      // إنشاء مخزن العملاء
      if (!database.objectStoreNames.contains(STORES.CUSTOMERS)) {
        const customersStore = database.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
        customersStore.createIndex('phone', 'phone', { unique: false });
        customersStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // إنشاء مخزن المستخدمين (للدخول Offline)
      if (!database.objectStoreNames.contains(STORES.USERS)) {
        const usersStore = database.createObjectStore(STORES.USERS, { keyPath: 'id' });
        usersStore.createIndex('email', 'email', { unique: true });
      }

      // إنشاء مخزن طابور المزامنة
      if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = database.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('type', 'type', { unique: false });
        syncStore.createIndex('created_at', 'created_at', { unique: false });
        syncStore.createIndex('status', 'status', { unique: false });
      }

      // إنشاء مخزن الإعدادات
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // إنشاء مخزن الفروع
      if (!database.objectStoreNames.contains(STORES.BRANCHES)) {
        database.createObjectStore(STORES.BRANCHES, { keyPath: 'id' });
      }

      // إنشاء مخزن الطاولات
      if (!database.objectStoreNames.contains(STORES.TABLES)) {
        const tablesStore = database.createObjectStore(STORES.TABLES, { keyPath: 'id' });
        tablesStore.createIndex('branch_id', 'branch_id', { unique: false });
      }

      // إنشاء مخزن المخزون
      if (!database.objectStoreNames.contains(STORES.INVENTORY)) {
        const inventoryStore = database.createObjectStore(STORES.INVENTORY, { keyPath: 'id' });
        inventoryStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // إنشاء مخزن الموظفين
      if (!database.objectStoreNames.contains(STORES.EMPLOYEES)) {
        database.createObjectStore(STORES.EMPLOYEES, { keyPath: 'id' });
      }

      // إنشاء مخزن الورديات
      if (!database.objectStoreNames.contains(STORES.SHIFTS)) {
        const shiftsStore = database.createObjectStore(STORES.SHIFTS, { keyPath: 'id' });
        shiftsStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      // إنشاء مخزن المصاريف
      if (!database.objectStoreNames.contains(STORES.EXPENSES)) {
        const expensesStore = database.createObjectStore(STORES.EXPENSES, { keyPath: 'id' });
        expensesStore.createIndex('is_synced', 'is_synced', { unique: false });
      }

      console.log('✅ تم إنشاء جميع المخازن');
    };
  });
};

/**
 * إضافة عنصر للمخزن
 */
export const addItem = async (storeName, item) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
};

/**
 * إضافة عناصر متعددة
 */
export const addItems = async (storeName, items) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    let completed = 0;
    items.forEach(item => {
      const request = store.put(item);
      request.onsuccess = () => {
        completed++;
        if (completed === items.length) resolve(items);
      };
      request.onerror = () => reject(request.error);
    });

    if (items.length === 0) resolve([]);
  });
};

/**
 * الحصول على عنصر بالمعرف
 */
export const getItem = async (storeName, id) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * الحصول على جميع العناصر
 */
export const getAllItems = async (storeName) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * الحصول على عناصر بفهرس معين
 */
export const getItemsByIndex = async (storeName, indexName, value) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      // التحقق من وجود الفهرس
      if (!store.indexNames.contains(indexName)) {
        // إذا لم يكن الفهرس موجوداً، نرجع مصفوفة فارغة
        console.warn(`Index '${indexName}' not found in store '${storeName}'`);
        resolve([]);
        return;
      }
      
      const index = store.index(indexName);
      
      // معالجة خاصة للقيم المنطقية (boolean)
      // IndexedDB قد لا يتعامل جيداً مع false مباشرة
      let queryValue = value;
      if (typeof value === 'boolean') {
        // استخدام IDBKeyRange للقيم المنطقية
        queryValue = IDBKeyRange.only(value);
      }
      
      const request = index.getAll(queryValue);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (event) => {
        console.error(`Error in getAll for index '${indexName}':`, event.target.error);
        // في حالة الفشل، نحاول جلب جميع العناصر وفلترتها يدوياً
        const fallbackRequest = store.getAll();
        fallbackRequest.onsuccess = () => {
          const allItems = fallbackRequest.result || [];
          const filtered = allItems.filter(item => item[indexName] === value);
          resolve(filtered);
        };
        fallbackRequest.onerror = () => resolve([]);
      };
    } catch (error) {
      console.error(`Error accessing index '${indexName}' in store '${storeName}':`, error);
      resolve([]);
    }
  });
};

/**
 * تحديث عنصر
 */
export const updateItem = async (storeName, item) => {
  return addItem(storeName, item);
};

/**
 * حذف عنصر
 */
export const deleteItem = async (storeName, id) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

/**
 * مسح جميع العناصر من مخزن
 */
export const clearStore = async (storeName) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

/**
 * عدد العناصر في مخزن
 */
export const countItems = async (storeName) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * عدد العناصر غير المتزامنة
 */
export const countUnsyncedItems = async (storeName) => {
  const items = await getItemsByIndex(storeName, 'is_synced', false);
  return items.length;
};

/**
 * الحصول على العناصر غير المتزامنة
 */
export const getUnsyncedItems = async (storeName) => {
  return getItemsByIndex(storeName, 'is_synced', false);
};

// تصدير كائن الـ db للاستخدام المباشر
export default {
  openDatabase,
  addItem,
  addItems,
  getItem,
  getAllItems,
  getItemsByIndex,
  updateItem,
  deleteItem,
  clearStore,
  countItems,
  countUnsyncedItems,
  getUnsyncedItems,
  STORES,
};
