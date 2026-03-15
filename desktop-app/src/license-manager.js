const axios = require('axios');
const { app, dialog, BrowserWindow } = require('electron');
const Store = require('electron-store');

class LicenseManager {
  constructor(store) {
    this.store = store;
    this.checkInterval = null;
    this.graceHours = 24; // فترة السماح للعمل offline (24 ساعة)
    this.lastOnlineCheck = null;
  }

  // التحقق من الترخيص عند بدء التشغيل
  async verifyOnStartup() {
    const serverUrl = this.store.get('serverUrl');
    const authToken = this.store.get('authToken');
    
    if (!serverUrl || !authToken) {
      return { valid: true, needsSetup: true };
    }

    try {
      const result = await this.checkLicense();
      
      if (result.valid) {
        this.lastOnlineCheck = new Date().toISOString();
        this.store.set('lastOnlineCheck', this.lastOnlineCheck);
        this.store.set('licenseData', result.data);
        return result;
      } else {
        return result;
      }
    } catch (error) {
      // إذا لم يكن هناك اتصال، تحقق من فترة السماح
      return this.checkOfflineGrace();
    }
  }

  // التحقق من الترخيص من السيرفر
  async checkLicense() {
    const serverUrl = this.store.get('serverUrl');
    const authToken = this.store.get('authToken');

    try {
      const response = await axios.get(`${serverUrl}/api/license/verify`, {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 10000
      });

      const data = response.data;

      return {
        valid: data.is_active && !data.is_expired,
        data: {
          tenantId: data.tenant_id,
          tenantName: data.tenant_name,
          isActive: data.is_active,
          isExpired: data.is_expired,
          expiryDate: data.expiry_date,
          features: data.features || [],
          maxBranches: data.max_branches || 1,
          maxUsers: data.max_users || 5,
          plan: data.plan || 'basic'
        },
        message: data.message
      };
    } catch (error) {
      if (error.response) {
        // السيرفر رد لكن برفض
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
          return { valid: false, reason: 'unauthorized', message: 'جلسة منتهية - يرجى تسجيل الدخول مجدداً' };
        } else if (status === 403) {
          return { valid: false, reason: 'disabled', message: data.detail || 'الحساب معطل' };
        } else if (status === 402) {
          return { valid: false, reason: 'expired', message: data.detail || 'الاشتراك منتهي' };
        }
      }
      
      // خطأ في الاتصال
      throw error;
    }
  }

  // التحقق من فترة السماح للعمل offline
  checkOfflineGrace() {
    const lastCheck = this.store.get('lastOnlineCheck');
    const licenseData = this.store.get('licenseData');

    if (!lastCheck || !licenseData) {
      return {
        valid: false,
        reason: 'no_license',
        message: 'لا يمكن التحقق من الترخيص - يرجى الاتصال بالإنترنت'
      };
    }

    const lastCheckDate = new Date(lastCheck);
    const now = new Date();
    const hoursSinceCheck = (now - lastCheckDate) / (1000 * 60 * 60);

    if (hoursSinceCheck > this.graceHours) {
      return {
        valid: false,
        reason: 'grace_expired',
        message: `انتهت فترة السماح (${this.graceHours} ساعة) - يرجى الاتصال بالإنترنت للتحقق من الترخيص`,
        hoursSinceCheck: Math.floor(hoursSinceCheck)
      };
    }

    // لا يزال ضمن فترة السماح
    return {
      valid: true,
      offline: true,
      data: licenseData,
      remainingHours: Math.floor(this.graceHours - hoursSinceCheck),
      message: `وضع Offline - متبقي ${Math.floor(this.graceHours - hoursSinceCheck)} ساعة`
    };
  }

  // بدء الفحص الدوري
  startPeriodicCheck(intervalMinutes = 60) {
    // فحص كل ساعة
    this.checkInterval = setInterval(async () => {
      await this.periodicCheck();
    }, intervalMinutes * 60 * 1000);

    console.log(`✅ بدء الفحص الدوري للترخيص كل ${intervalMinutes} دقيقة`);
  }

  // إيقاف الفحص الدوري
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // الفحص الدوري
  async periodicCheck() {
    try {
      const result = await this.checkLicense();

      if (!result.valid) {
        this.handleInvalidLicense(result);
      } else {
        // تحديث آخر فحص ناجح
        this.lastOnlineCheck = new Date().toISOString();
        this.store.set('lastOnlineCheck', this.lastOnlineCheck);
        this.store.set('licenseData', result.data);

        // إرسال الميزات المتاحة للواجهة
        this.notifyFeaturesUpdate(result.data.features);
      }
    } catch (error) {
      // إذا لم يكن هناك اتصال، تحقق من فترة السماح
      const graceResult = this.checkOfflineGrace();
      
      if (!graceResult.valid) {
        this.handleInvalidLicense(graceResult);
      }
    }
  }

  // معالجة الترخيص غير الصالح
  handleInvalidLicense(result) {
    const windows = BrowserWindow.getAllWindows();
    
    // إظهار رسالة للمستخدم
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'مشكلة في الترخيص',
      message: result.message || 'الترخيص غير صالح',
      detail: this.getDetailMessage(result.reason),
      buttons: ['موافق']
    });

    // إذا كان السبب خطير، أغلق التطبيق
    if (['disabled', 'expired', 'grace_expired', 'unauthorized'].includes(result.reason)) {
      app.quit();
    }
  }

  // رسالة تفصيلية حسب السبب
  getDetailMessage(reason) {
    const messages = {
      'disabled': 'تم تعطيل حسابك من قبل المالك. يرجى التواصل مع الدعم.',
      'expired': 'انتهى اشتراكك. يرجى تجديد الاشتراك للاستمرار.',
      'grace_expired': 'انتهت فترة السماح للعمل بدون إنترنت. يرجى الاتصال بالإنترنت.',
      'unauthorized': 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.',
      'no_license': 'لم يتم العثور على بيانات الترخيص. يرجى الاتصال بالإنترنت.'
    };
    return messages[reason] || 'حدث خطأ في التحقق من الترخيص.';
  }

  // التحقق من ميزة معينة
  hasFeature(featureName) {
    const licenseData = this.store.get('licenseData');
    if (!licenseData || !licenseData.features) return false;
    return licenseData.features.includes(featureName);
  }

  // الحصول على الميزات المتاحة
  getFeatures() {
    const licenseData = this.store.get('licenseData');
    return licenseData?.features || [];
  }

  // الحصول على بيانات الترخيص
  getLicenseData() {
    return this.store.get('licenseData');
  }

  // إرسال تحديث الميزات للواجهة
  notifyFeaturesUpdate(features) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send('features-update', features);
    });
  }

  // إرسال تحذير انتهاء الاشتراك
  notifyExpiryWarning(daysRemaining) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send('license-warning', {
        type: 'expiry',
        daysRemaining,
        message: `تنبيه: اشتراكك سينتهي بعد ${daysRemaining} يوم`
      });
    });
  }
}

module.exports = { LicenseManager };
