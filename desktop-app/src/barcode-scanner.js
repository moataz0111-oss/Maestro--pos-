/**
 * مدير قارئ الباركود
 * يدعم قارئات USB HID (التي تعمل كلوحة مفاتيح)
 */

const { BrowserWindow, globalShortcut } = require('electron');

class BarcodeScanner {
  constructor(store) {
    this.store = store;
    this.buffer = '';
    this.lastKeyTime = 0;
    this.timeout = null;
    this.isEnabled = true;
    this.scanTimeout = 50; // الوقت الأقصى بين الأحرف (ms)
    this.minLength = 4; // الحد الأدنى لطول الباركود
    this.maxLength = 50; // الحد الأقصى لطول الباركود
  }

  /**
   * بدء الاستماع للباركود
   */
  start() {
    if (!this.isEnabled) return;
    
    console.log('🔍 بدء الاستماع لقارئ الباركود');
  }

  /**
   * إيقاف الاستماع
   */
  stop() {
    this.buffer = '';
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  /**
   * معالجة المدخلات (تُستدعى من preload.js)
   */
  processInput(key, timestamp) {
    if (!this.isEnabled) return null;

    const now = timestamp || Date.now();
    const timeDiff = now - this.lastKeyTime;
    this.lastKeyTime = now;

    // إذا مر وقت طويل، ابدأ من جديد
    if (timeDiff > this.scanTimeout && this.buffer.length > 0) {
      this.buffer = '';
    }

    // إلغاء المؤقت السابق
    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    // Enter = نهاية الباركود
    if (key === 'Enter') {
      const barcode = this.buffer.trim();
      this.buffer = '';
      
      // التحقق من صلاحية الباركود
      if (barcode.length >= this.minLength && barcode.length <= this.maxLength) {
        console.log('📦 باركود تم مسحه:', barcode);
        return {
          type: 'barcode',
          value: barcode,
          timestamp: now
        };
      }
      return null;
    }

    // إضافة الحرف للـ buffer
    if (key.length === 1) {
      this.buffer += key;
    }

    // مؤقت للتنظيف إذا لم يكتمل الباركود
    this.timeout = setTimeout(() => {
      if (this.buffer.length > 0 && this.buffer.length < this.minLength) {
        // ربما كتابة يدوية وليس باركود
        this.buffer = '';
      }
    }, 500);

    return null;
  }

  /**
   * إرسال الباركود للواجهة
   */
  notifyBarcodeScan(barcode) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send('barcode-scanned', barcode);
    });
  }

  /**
   * تفعيل/تعطيل
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  /**
   * البحث عن منتج بالباركود (من قاعدة البيانات المحلية)
   */
  async findProductByBarcode(barcode, db) {
    try {
      // البحث في المنتجات المخزنة محلياً
      const product = db.findOne('cached_products', { barcode: barcode });
      return product;
    } catch (error) {
      console.error('خطأ في البحث عن المنتج:', error);
      return null;
    }
  }

  /**
   * إعدادات الماسح
   */
  getSettings() {
    return {
      enabled: this.isEnabled,
      scanTimeout: this.scanTimeout,
      minLength: this.minLength,
      maxLength: this.maxLength
    };
  }

  updateSettings(settings) {
    if (settings.scanTimeout !== undefined) {
      this.scanTimeout = settings.scanTimeout;
    }
    if (settings.minLength !== undefined) {
      this.minLength = settings.minLength;
    }
    if (settings.maxLength !== undefined) {
      this.maxLength = settings.maxLength;
    }
    if (settings.enabled !== undefined) {
      this.setEnabled(settings.enabled);
    }
  }
}

module.exports = { BarcodeScanner };
