const axios = require('axios');
const { BrowserWindow } = require('electron');

class SyncManager {
  constructor(store, db) {
    this.store = store;
    this.db = db;
    this.isSyncing = false;
    this.syncInterval = null;
    this.lastSyncTime = null;
    this.pendingCount = 0;
  }

  // بدء المزامنة التلقائية
  startAutoSync() {
    const interval = this.store.get('syncInterval') || 30000;
    
    this.syncInterval = setInterval(() => {
      this.syncNow();
    }, interval);
    
    console.log(`✅ بدء المزامنة التلقائية كل ${interval / 1000} ثانية`);
  }

  // إيقاف المزامنة التلقائية
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // الحصول على حالة المزامنة
  getStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      pendingCount: this.pendingCount
    };
  }

  // الحصول على عدد السجلات المعلقة
  getPendingCount() {
    try {
      const counts = this.db.getUnsyncedCount();
      this.pendingCount = counts.total;
      return counts;
    } catch (error) {
      console.error('خطأ في حساب السجلات المعلقة:', error);
      return { total: 0 };
    }
  }

  // مزامنة الآن
  async syncNow() {
    if (this.isSyncing) {
      console.log('⏳ المزامنة قيد التنفيذ...');
      return { success: false, message: 'المزامنة قيد التنفيذ' };
    }

    const serverUrl = this.store.get('serverUrl');
    const token = this.store.get('authToken');
    
    if (!serverUrl) {
      return { success: false, message: 'لم يتم تحديد السيرفر' };
    }

    this.isSyncing = true;
    this.notifyProgress({ status: 'started', message: 'بدء المزامنة...' });

    const results = {
      orders: { synced: 0, failed: 0 },
      expenses: { synced: 0, failed: 0 },
      shifts: { synced: 0, failed: 0 },
      cached: { products: 0, categories: 0, customers: 0 }
    };

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. مزامنة الطلبات
      this.notifyProgress({ status: 'syncing', message: 'مزامنة الطلبات...' });
      const orderResults = await this.syncOrders(serverUrl, headers);
      results.orders = orderResults;

      // 2. مزامنة المصاريف
      this.notifyProgress({ status: 'syncing', message: 'مزامنة المصاريف...' });
      const expenseResults = await this.syncExpenses(serverUrl, headers);
      results.expenses = expenseResults;

      // 3. مزامنة الورديات
      this.notifyProgress({ status: 'syncing', message: 'مزامنة الورديات...' });
      const shiftResults = await this.syncShifts(serverUrl, headers);
      results.shifts = shiftResults;

      // 4. تحديث البيانات المحلية من السيرفر
      this.notifyProgress({ status: 'caching', message: 'تحديث البيانات المحلية...' });
      const cacheResults = await this.updateLocalCache(serverUrl, headers);
      results.cached = cacheResults;

      this.lastSyncTime = new Date().toISOString();
      this.pendingCount = this.db.getUnsyncedCount().total;

      // تسجيل المزامنة
      this.db.insert('sync_log', {
        sync_type: 'full',
        records_synced: results.orders.synced + results.expenses.synced + results.shifts.synced,
        status: 'success',
        started_at: this.lastSyncTime,
        completed_at: new Date().toISOString()
      });

      this.notifyProgress({ 
        status: 'completed', 
        message: 'تمت المزامنة بنجاح',
        results 
      });

      return { success: true, results };

    } catch (error) {
      console.error('❌ خطأ في المزامنة:', error);
      
      this.db.insert('sync_log', {
        sync_type: 'full',
        records_synced: 0,
        status: 'failed',
        error_message: error.message,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });

      this.notifyProgress({ 
        status: 'error', 
        message: `خطأ: ${error.message}` 
      });

      return { success: false, error: error.message };

    } finally {
      this.isSyncing = false;
    }
  }

  // مزامنة الطلبات
  async syncOrders(serverUrl, headers) {
    const unsyncedOrders = this.db.getUnsyncedRecords('local_orders');
    let synced = 0;
    let failed = 0;

    for (const order of unsyncedOrders) {
      try {
        // تحويل items من JSON string إلى array
        const orderData = {
          ...order,
          items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items
        };
        delete orderData.synced;
        delete orderData.sync_error;

        await axios.post(`${serverUrl}/api/orders`, orderData, { headers });
        
        this.db.markAsSynced('local_orders', order.id);
        synced++;
      } catch (error) {
        console.error(`فشل مزامنة الطلب ${order.id}:`, error.message);
        this.db.setSyncError('local_orders', order.id, error.message);
        failed++;
      }
    }

    return { synced, failed };
  }

  // مزامنة المصاريف
  async syncExpenses(serverUrl, headers) {
    const unsyncedExpenses = this.db.getUnsyncedRecords('local_expenses');
    let synced = 0;
    let failed = 0;

    for (const expense of unsyncedExpenses) {
      try {
        const expenseData = { ...expense };
        delete expenseData.synced;
        delete expenseData.sync_error;

        await axios.post(`${serverUrl}/api/expenses`, expenseData, { headers });
        
        this.db.markAsSynced('local_expenses', expense.id);
        synced++;
      } catch (error) {
        console.error(`فشل مزامنة المصروف ${expense.id}:`, error.message);
        this.db.setSyncError('local_expenses', expense.id, error.message);
        failed++;
      }
    }

    return { synced, failed };
  }

  // مزامنة الورديات
  async syncShifts(serverUrl, headers) {
    const unsyncedShifts = this.db.getUnsyncedRecords('local_shifts');
    let synced = 0;
    let failed = 0;

    for (const shift of unsyncedShifts) {
      try {
        const shiftData = { ...shift };
        delete shiftData.synced;
        delete shiftData.sync_error;

        // إذا كانت الوردية مغلقة، أرسل طلب إغلاق
        if (shift.status === 'closed') {
          await axios.post(`${serverUrl}/api/shifts/${shift.id}/close`, shiftData, { headers });
        } else {
          await axios.post(`${serverUrl}/api/shifts`, shiftData, { headers });
        }
        
        this.db.markAsSynced('local_shifts', shift.id);
        synced++;
      } catch (error) {
        console.error(`فشل مزامنة الوردية ${shift.id}:`, error.message);
        this.db.setSyncError('local_shifts', shift.id, error.message);
        failed++;
      }
    }

    return { synced, failed };
  }

  // تحديث البيانات المحلية من السيرفر
  async updateLocalCache(serverUrl, headers) {
    const results = { products: 0, categories: 0, customers: 0 };

    try {
      // جلب المنتجات
      const productsRes = await axios.get(`${serverUrl}/api/products`, { headers });
      if (productsRes.data && Array.isArray(productsRes.data)) {
        // مسح المنتجات القديمة وإدراج الجديدة
        this.db.exec('DELETE FROM cached_products');
        
        for (const product of productsRes.data) {
          this.db.insert('cached_products', {
            id: product.id,
            name: product.name,
            name_en: product.name_en || '',
            category_id: product.category_id,
            price: product.price,
            image: product.image || '',
            barcode: product.barcode || '',
            is_available: product.is_available ? 1 : 0,
            updated_at: new Date().toISOString()
          });
          results.products++;
        }
      }

      // جلب الفئات
      const categoriesRes = await axios.get(`${serverUrl}/api/categories`, { headers });
      if (categoriesRes.data && Array.isArray(categoriesRes.data)) {
        this.db.exec('DELETE FROM cached_categories');
        
        for (const category of categoriesRes.data) {
          this.db.insert('cached_categories', {
            id: category.id,
            name: category.name,
            name_en: category.name_en || '',
            icon: category.icon || '',
            image: category.image || '',
            sort_order: category.sort_order || 0,
            updated_at: new Date().toISOString()
          });
          results.categories++;
        }
      }

      // جلب العملاء
      const customersRes = await axios.get(`${serverUrl}/api/customers`, { headers });
      if (customersRes.data && Array.isArray(customersRes.data)) {
        this.db.exec('DELETE FROM cached_customers');
        
        for (const customer of customersRes.data) {
          this.db.insert('cached_customers', {
            id: customer.id,
            name: customer.name,
            phone: customer.phone || '',
            email: customer.email || '',
            address: customer.address || '',
            notes: customer.notes || '',
            updated_at: new Date().toISOString()
          });
          results.customers++;
        }
      }

    } catch (error) {
      console.error('خطأ في تحديث البيانات المحلية:', error.message);
    }

    return results;
  }

  // إرسال إشعار بالتقدم
  notifyProgress(progress) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send('sync-progress', progress);
    });
  }
}

module.exports = { SyncManager };
