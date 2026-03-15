const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');

let db = null;

// تهيئة قاعدة البيانات
function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'maestro-pos.db');
  
  db = new Database(dbPath);
  
  // إنشاء الجداول
  db.exec(`
    -- جدول الطلبات المحلية (للعمل offline)
    CREATE TABLE IF NOT EXISTS local_orders (
      id TEXT PRIMARY KEY,
      order_number INTEGER,
      branch_id TEXT,
      shift_id TEXT,
      customer_id TEXT,
      customer_name TEXT,
      items TEXT, -- JSON
      subtotal REAL,
      discount REAL,
      discount_type TEXT,
      tax REAL,
      total REAL,
      payment_method TEXT,
      paid_amount REAL,
      change_amount REAL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      cashier_id TEXT,
      cashier_name TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0,
      sync_error TEXT
    );
    
    -- جدول المصاريف المحلية
    CREATE TABLE IF NOT EXISTS local_expenses (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      shift_id TEXT,
      category TEXT,
      description TEXT,
      amount REAL,
      payment_method TEXT,
      created_by TEXT,
      created_at TEXT,
      synced INTEGER DEFAULT 0,
      sync_error TEXT
    );
    
    -- جدول الورديات المحلية
    CREATE TABLE IF NOT EXISTS local_shifts (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      cashier_id TEXT,
      cashier_name TEXT,
      opened_at TEXT,
      closed_at TEXT,
      opening_balance REAL,
      closing_balance REAL,
      status TEXT DEFAULT 'open',
      synced INTEGER DEFAULT 0,
      sync_error TEXT
    );
    
    -- جدول المنتجات (نسخة محلية للعمل offline)
    CREATE TABLE IF NOT EXISTS cached_products (
      id TEXT PRIMARY KEY,
      name TEXT,
      name_en TEXT,
      category_id TEXT,
      price REAL,
      image TEXT,
      barcode TEXT,
      is_available INTEGER DEFAULT 1,
      updated_at TEXT
    );
    
    -- جدول الفئات (نسخة محلية)
    CREATE TABLE IF NOT EXISTS cached_categories (
      id TEXT PRIMARY KEY,
      name TEXT,
      name_en TEXT,
      icon TEXT,
      image TEXT,
      sort_order INTEGER,
      updated_at TEXT
    );
    
    -- جدول العملاء (نسخة محلية)
    CREATE TABLE IF NOT EXISTS cached_customers (
      id TEXT PRIMARY KEY,
      name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      updated_at TEXT
    );
    
    -- جدول سجل المزامنة
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT,
      records_synced INTEGER,
      status TEXT,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT
    );
    
    -- جدول قائمة الانتظار للمزامنة
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT,
      record_id TEXT,
      action TEXT, -- insert, update, delete
      data TEXT, -- JSON
      created_at TEXT,
      attempts INTEGER DEFAULT 0,
      last_attempt TEXT,
      error TEXT
    );
    
    -- فهارس للبحث السريع
    CREATE INDEX IF NOT EXISTS idx_local_orders_synced ON local_orders(synced);
    CREATE INDEX IF NOT EXISTS idx_local_orders_branch ON local_orders(branch_id);
    CREATE INDEX IF NOT EXISTS idx_local_expenses_synced ON local_expenses(synced);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name);
    CREATE INDEX IF NOT EXISTS idx_cached_products_category ON cached_products(category_id);
    CREATE INDEX IF NOT EXISTS idx_cached_products_barcode ON cached_products(barcode);
  `);
  
  console.log('✅ تم تهيئة قاعدة البيانات المحلية');
  return db;
}

// الحصول على قاعدة البيانات
function getDatabase() {
  if (!db) {
    throw new Error('قاعدة البيانات غير مهيأة');
  }
  
  return {
    // إدراج سجل
    insert: (table, data) => {
      const columns = Object.keys(data);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map(col => {
        const val = data[col];
        return typeof val === 'object' ? JSON.stringify(val) : val;
      });
      
      const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
      return stmt.run(...values);
    },
    
    // تحديث سجل
    update: (table, data, query) => {
      const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
      const whereClause = Object.keys(query).map(key => `${key} = ?`).join(' AND ');
      
      const values = [
        ...Object.values(data).map(val => typeof val === 'object' ? JSON.stringify(val) : val),
        ...Object.values(query)
      ];
      
      const stmt = db.prepare(`UPDATE ${table} SET ${setClause} WHERE ${whereClause}`);
      return stmt.run(...values);
    },
    
    // حذف سجل
    delete: (table, query) => {
      const whereClause = Object.keys(query).map(key => `${key} = ?`).join(' AND ');
      const stmt = db.prepare(`DELETE FROM ${table} WHERE ${whereClause}`);
      return stmt.run(...Object.values(query));
    },
    
    // البحث عن سجلات
    find: (table, query = {}) => {
      let sql = `SELECT * FROM ${table}`;
      const values = [];
      
      if (Object.keys(query).length > 0) {
        const whereClause = Object.keys(query).map(key => `${key} = ?`).join(' AND ');
        sql += ` WHERE ${whereClause}`;
        values.push(...Object.values(query));
      }
      
      const stmt = db.prepare(sql);
      const results = stmt.all(...values);
      
      // تحويل JSON strings إلى objects
      return results.map(row => {
        const parsed = { ...row };
        if (parsed.items && typeof parsed.items === 'string') {
          try { parsed.items = JSON.parse(parsed.items); } catch (e) {}
        }
        if (parsed.data && typeof parsed.data === 'string') {
          try { parsed.data = JSON.parse(parsed.data); } catch (e) {}
        }
        return parsed;
      });
    },
    
    // البحث عن سجل واحد
    findOne: (table, query) => {
      const whereClause = Object.keys(query).map(key => `${key} = ?`).join(' AND ');
      const stmt = db.prepare(`SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`);
      const result = stmt.get(...Object.values(query));
      
      if (result) {
        if (result.items && typeof result.items === 'string') {
          try { result.items = JSON.parse(result.items); } catch (e) {}
        }
      }
      
      return result;
    },
    
    // تنفيذ SQL مباشر
    exec: (sql, params = []) => {
      const stmt = db.prepare(sql);
      return params.length > 0 ? stmt.all(...params) : stmt.all();
    },
    
    // عدد السجلات غير المزامنة
    getUnsyncedCount: () => {
      const orders = db.prepare('SELECT COUNT(*) as count FROM local_orders WHERE synced = 0').get();
      const expenses = db.prepare('SELECT COUNT(*) as count FROM local_expenses WHERE synced = 0').get();
      const shifts = db.prepare('SELECT COUNT(*) as count FROM local_shifts WHERE synced = 0').get();
      
      return {
        orders: orders.count,
        expenses: expenses.count,
        shifts: shifts.count,
        total: orders.count + expenses.count + shifts.count
      };
    },
    
    // الحصول على السجلات غير المزامنة
    getUnsyncedRecords: (table, limit = 50) => {
      const stmt = db.prepare(`SELECT * FROM ${table} WHERE synced = 0 ORDER BY created_at ASC LIMIT ?`);
      return stmt.all(limit);
    },
    
    // تحديد سجل كمُزامَن
    markAsSynced: (table, id) => {
      const stmt = db.prepare(`UPDATE ${table} SET synced = 1 WHERE id = ?`);
      return stmt.run(id);
    },
    
    // تسجيل خطأ مزامنة
    setSyncError: (table, id, error) => {
      const stmt = db.prepare(`UPDATE ${table} SET sync_error = ? WHERE id = ?`);
      return stmt.run(error, id);
    },
    
    // إضافة للـ queue
    addToQueue: (tableName, recordId, action, data) => {
      const stmt = db.prepare(`
        INSERT INTO sync_queue (table_name, record_id, action, data, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      return stmt.run(tableName, recordId, action, JSON.stringify(data), new Date().toISOString());
    },
    
    // مسح البيانات المُزامَنة القديمة
    cleanupSyncedData: (daysOld = 30) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysOld);
      const cutoffStr = cutoff.toISOString();
      
      db.prepare(`DELETE FROM local_orders WHERE synced = 1 AND created_at < ?`).run(cutoffStr);
      db.prepare(`DELETE FROM local_expenses WHERE synced = 1 AND created_at < ?`).run(cutoffStr);
      db.prepare(`DELETE FROM sync_log WHERE completed_at < ?`).run(cutoffStr);
    }
  };
}

// إغلاق قاعدة البيانات
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase
};
