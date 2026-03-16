/**
 * مدير التحديث التلقائي
 * يفحص التحديثات ويُحدّث التطبيق تلقائياً
 */

const { autoUpdater } = require('electron-updater');
const { dialog, BrowserWindow } = require('electron');

class AutoUpdater {
  constructor(store) {
    this.store = store;
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.updateInfo = null;
    
    // إعدادات التحديث
    autoUpdater.autoDownload = false; // لا تحمل تلقائياً، اسأل المستخدم أولاً
    autoUpdater.autoInstallOnAppQuit = true;
    
    // معالجة الأحداث
    this.setupEventHandlers();
  }

  /**
   * إعداد معالجات الأحداث
   */
  setupEventHandlers() {
    // عند البحث عن التحديثات
    autoUpdater.on('checking-for-update', () => {
      console.log('🔍 جاري البحث عن تحديثات...');
      this.sendStatusToWindow('checking', 'جاري البحث عن تحديثات...');
    });

    // عند وجود تحديث متاح
    autoUpdater.on('update-available', (info) => {
      console.log('✅ يوجد تحديث متاح:', info.version);
      this.updateAvailable = true;
      this.updateInfo = info;
      this.sendStatusToWindow('available', `يوجد تحديث جديد: ${info.version}`);
      
      // اسأل المستخدم
      this.promptForUpdate(info);
    });

    // عند عدم وجود تحديث
    autoUpdater.on('update-not-available', (info) => {
      console.log('👍 التطبيق محدّث');
      this.sendStatusToWindow('not-available', 'التطبيق محدّث بأحدث إصدار');
    });

    // أثناء التحميل
    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.round(progress.percent);
      console.log(`📥 جاري التحميل: ${percent}%`);
      this.sendStatusToWindow('downloading', `جاري التحميل: ${percent}%`, {
        percent: percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred
      });
    });

    // عند اكتمال التحميل
    autoUpdater.on('update-downloaded', (info) => {
      console.log('✅ تم تحميل التحديث:', info.version);
      this.updateDownloaded = true;
      this.sendStatusToWindow('downloaded', 'تم تحميل التحديث بنجاح');
      
      // اسأل المستخدم عن التثبيت
      this.promptForInstall(info);
    });

    // عند حدوث خطأ
    autoUpdater.on('error', (error) => {
      console.error('❌ خطأ في التحديث:', error.message);
      this.sendStatusToWindow('error', `خطأ في التحديث: ${error.message}`);
    });
  }

  /**
   * إرسال الحالة للواجهة
   */
  sendStatusToWindow(status, message, data = {}) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      win.webContents.send('update-status', {
        status,
        message,
        ...data
      });
    });
  }

  /**
   * فحص التحديثات
   */
  checkForUpdates() {
    console.log('🔄 فحص التحديثات...');
    autoUpdater.checkForUpdates().catch(err => {
      console.error('خطأ في فحص التحديثات:', err.message);
    });
  }

  /**
   * سؤال المستخدم عن تحميل التحديث
   */
  promptForUpdate(info) {
    const response = dialog.showMessageBoxSync({
      type: 'info',
      title: 'تحديث متاح',
      message: `يوجد إصدار جديد: ${info.version}`,
      detail: `الإصدار الحالي: ${require('../package.json').version}\n\nهل تريد تحميل التحديث الآن؟`,
      buttons: ['تحميل الآن', 'لاحقاً'],
      defaultId: 0,
      cancelId: 1
    });

    if (response === 0) {
      this.downloadUpdate();
    }
  }

  /**
   * تحميل التحديث
   */
  downloadUpdate() {
    console.log('📥 بدء تحميل التحديث...');
    autoUpdater.downloadUpdate().catch(err => {
      console.error('خطأ في تحميل التحديث:', err.message);
      this.sendStatusToWindow('error', `فشل التحميل: ${err.message}`);
    });
  }

  /**
   * سؤال المستخدم عن تثبيت التحديث
   */
  promptForInstall(info) {
    const response = dialog.showMessageBoxSync({
      type: 'info',
      title: 'تم تحميل التحديث',
      message: `تم تحميل الإصدار ${info.version} بنجاح`,
      detail: 'هل تريد إعادة تشغيل التطبيق الآن لتثبيت التحديث؟',
      buttons: ['إعادة التشغيل الآن', 'لاحقاً'],
      defaultId: 0,
      cancelId: 1
    });

    if (response === 0) {
      this.quitAndInstall();
    }
  }

  /**
   * إعادة التشغيل وتثبيت التحديث
   */
  quitAndInstall() {
    console.log('🔄 إعادة التشغيل لتثبيت التحديث...');
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * الحصول على حالة التحديث
   */
  getStatus() {
    return {
      updateAvailable: this.updateAvailable,
      updateDownloaded: this.updateDownloaded,
      updateInfo: this.updateInfo,
      currentVersion: require('../package.json').version
    };
  }

  /**
   * فحص التحديثات عند بدء التشغيل (بتأخير)
   */
  checkOnStartup(delaySeconds = 10) {
    setTimeout(() => {
      this.checkForUpdates();
    }, delaySeconds * 1000);
  }

  /**
   * فحص دوري للتحديثات
   */
  startPeriodicCheck(intervalMinutes = 60) {
    // فحص أولي
    this.checkOnStartup();
    
    // فحص دوري
    this.periodicInterval = setInterval(() => {
      this.checkForUpdates();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * إيقاف الفحص الدوري
   */
  stopPeriodicCheck() {
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
      this.periodicInterval = null;
    }
  }
}

module.exports = { AutoUpdater };
