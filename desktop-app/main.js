const { app, BrowserWindow, ipcMain, Menu, Tray, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { initDatabase, getDatabase } = require('./src/database');
const { SyncManager } = require('./src/sync-manager');
const { PrinterManager } = require('./src/printer-manager');
const { LicenseManager } = require('./src/license-manager');
const { BarcodeScanner } = require('./src/barcode-scanner');
const { AutoUpdater } = require('./src/auto-updater');

// تخزين الإعدادات
const store = new Store({
  defaults: {
    serverUrl: '',
    branchId: '',
    authToken: '',
    autoSync: true,
    syncInterval: 30000, // 30 ثانية
    language: 'ar',
    printerSettings: {
      receiptPrinter: '',
      kitchenPrinter: '',
      autoPrint: true
    },
    // بيانات الترخيص المحفوظة
    licenseData: null,
    lastOnlineCheck: null
  }
});

let mainWindow;
let tray;
let syncManager;
let printerManager;
let licenseManager;
let barcodeScanner;
let autoUpdater;
let isOnline = true;
let licenseValid = false;

// التحقق من وجود ملفات الواجهة المحلية
function getLocalFrontendPath() {
  // المسارات المحتملة للواجهة المحلية
  const possiblePaths = [
    path.join(__dirname, 'frontend', 'index.html'),
    path.join(__dirname, 'build', 'index.html'),
    path.join(__dirname, '..', 'frontend', 'build', 'index.html'),
    path.join(app.getPath('userData'), 'frontend', 'index.html')
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// إنشاء النافذة الرئيسية
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      // تعطيل الـ Cache لضمان تحميل أحدث نسخة
      partition: 'persist:main'
    },
    titleBarStyle: 'default',
    title: 'Maestro POS',
    show: false // إخفاء حتى يتم التحميل
  });

  // إظهار النافذة عند الجاهزية
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // تحميل الواجهة
  loadMainInterface();

  // التعامل مع حالة الاتصال
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log('فشل التحميل:', errorDescription, 'URL:', validatedURL);
    
    // أخطاء الاتصال
    if (errorCode === -106 || errorCode === -105 || errorCode === -102 || errorCode === -118) {
      isOnline = false;
      
      // محاولة تحميل الواجهة المحلية
      const localPath = getLocalFrontendPath();
      if (localPath) {
        console.log('📱 تحميل الواجهة المحلية:', localPath);
        mainWindow.loadFile(localPath);
      } else {
        mainWindow.loadFile(path.join(__dirname, 'src', 'views', 'offline.html'));
      }
    }
  });

  // تحديث حالة الاتصال عند نجاح التحميل
  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow.webContents.getURL();
    if (url.startsWith('http')) {
      isOnline = true;
      updateTrayMenu();
    }
  });

  // عند إغلاق النافذة
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // إغلاق التطبيق عند إغلاق النافذة (على Mac يمكن إخفاء للـ tray)
  mainWindow.on('close', (event) => {
    // على Mac: إذا لم يكن التطبيق يُغلق فعلياً، اخفِ النافذة
    // على Windows/Linux: أغلق التطبيق مباشرة
    if (process.platform === 'darwin' && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    // على Windows/Linux - أغلق مباشرة
  });

  // فتح DevTools في وضع التطوير
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// تحميل الواجهة الرئيسية
function loadMainInterface() {
  const serverUrl = store.get('serverUrl');
  const authToken = store.get('authToken');
  
  if (!serverUrl) {
    // لا يوجد سيرفر - صفحة الإعداد
    mainWindow.loadFile(path.join(__dirname, 'src', 'views', 'setup.html'));
    return;
  }
  
  // محاولة تحميل من السيرفر أولاً
  console.log('🌐 محاولة الاتصال بالسيرفر:', serverUrl);
  
  // إضافة token للـ cookies إذا وجد
  if (authToken) {
    mainWindow.webContents.session.cookies.set({
      url: serverUrl,
      name: 'auth_token',
      value: authToken
    }).catch(err => console.log('Cookie error:', err));
  }
  
  mainWindow.loadURL(serverUrl);
}

// إنشاء أيقونة الـ System Tray
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'فتح البرنامج', 
      click: () => mainWindow.show() 
    },
    { 
      label: isOnline ? '🟢 متصل' : '🔴 غير متصل',
      enabled: false
    },
    { type: 'separator' },
    { 
      label: 'مزامنة الآن', 
      click: () => syncManager.syncNow() 
    },
    { 
      label: '🔄 إعادة تحميل', 
      click: () => mainWindow.reload()
    },
    { 
      label: '🧹 مسح البيانات المؤقتة', 
      click: async () => {
        const { session } = require('electron');
        await session.defaultSession.clearCache();
        await session.defaultSession.clearStorageData({
          storages: ['indexdb', 'localstorage', 'cachestorage', 'serviceworkers']
        });
        mainWindow.reload();
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'تم',
          message: 'تم مسح البيانات المؤقتة وإعادة تحميل البرنامج'
        });
      }
    },
    { type: 'separator' },
    { 
      label: 'الإعدادات', 
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('navigate', '/settings');
      }
    },
    { type: 'separator' },
    { 
      label: 'إغلاق البرنامج', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Maestro POS');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    mainWindow.show();
  });
}

// إنشاء القائمة الرئيسية للتطبيق
function createAppMenu() {
  const template = [
    {
      label: 'Maestro POS',
      submenu: [
        { label: 'حول البرنامج', role: 'about' },
        { type: 'separator' },
        { 
          label: '🔄 إعادة تحميل',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow.reload()
        },
        { 
          label: '🧹 مسح البيانات المؤقتة',
          accelerator: 'CmdOrCtrl+Shift+Delete',
          click: async () => {
            const { session } = require('electron');
            await session.defaultSession.clearCache();
            await session.defaultSession.clearStorageData({
              storages: ['indexdb', 'localstorage', 'cachestorage', 'serviceworkers']
            });
            mainWindow.reload();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'تم',
              message: 'تم مسح البيانات المؤقتة وإعادة تحميل البرنامج'
            });
          }
        },
        { type: 'separator' },
        { label: 'إغلاق', role: 'quit' }
      ]
    },
    {
      label: 'تحرير',
      submenu: [
        { label: 'تراجع', role: 'undo' },
        { label: 'إعادة', role: 'redo' },
        { type: 'separator' },
        { label: 'قص', role: 'cut' },
        { label: 'نسخ', role: 'copy' },
        { label: 'لصق', role: 'paste' },
        { label: 'تحديد الكل', role: 'selectAll' }
      ]
    },
    {
      label: 'عرض',
      submenu: [
        { 
          label: 'تكبير',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(currentZoom + 0.1);
          }
        },
        { 
          label: 'تصغير',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(Math.max(0.5, currentZoom - 0.1));
          }
        },
        { 
          label: 'حجم افتراضي',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.setZoomFactor(1)
        },
        { type: 'separator' },
        { label: 'ملء الشاشة', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'مساعدة',
      submenu: [
        { 
          label: 'أدوات المطور',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow.webContents.openDevTools()
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// تهيئة التطبيق
app.whenReady().then(async () => {
  // مسح الـ Cache عند بدء التشغيل لضمان تحميل أحدث نسخة
  const { session } = require('electron');
  await session.defaultSession.clearCache();
  await session.defaultSession.clearStorageData({
    storages: ['cachestorage', 'serviceworkers']
  });
  console.log('🧹 تم مسح Cache التطبيق');
  
  // تهيئة قاعدة البيانات المحلية
  await initDatabase();
  
  // تهيئة مدير الترخيص
  licenseManager = new LicenseManager(store);
  
  // التحقق من الترخيص عند بدء التشغيل
  const licenseResult = await licenseManager.verifyOnStartup();
  
  if (licenseResult.needsSetup) {
    // التطبيق يحتاج إعداد أولي
    licenseValid = true;
  } else if (!licenseResult.valid) {
    // الترخيص غير صالح
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'خطأ في الترخيص',
      message: licenseResult.message || 'الترخيص غير صالح',
      detail: 'يرجى التواصل مع الدعم الفني أو الاتصال بالإنترنت للتحقق من الترخيص.',
      buttons: ['موافق']
    });
    
    // إذا كان السبب خطير، لا نسمح بتشغيل التطبيق
    if (['disabled', 'expired', 'grace_expired'].includes(licenseResult.reason)) {
      app.quit();
      return;
    }
  } else {
    licenseValid = true;
    console.log('✅ الترخيص صالح:', licenseResult.data?.tenantName || 'Unknown');
  }
  
  // تهيئة مدير المزامنة
  syncManager = new SyncManager(store, getDatabase());
  
  // تهيئة مدير الطابعات
  printerManager = new PrinterManager(store);
  
  // تهيئة ماسح الباركود
  barcodeScanner = new BarcodeScanner(store);
  barcodeScanner.start();
  
  // تهيئة مدير التحديث التلقائي
  autoUpdater = new AutoUpdater(store);
  
  // إنشاء النافذة
  createWindow();
  createTray();
  createAppMenu();
  
  // بدء المزامنة التلقائية
  if (store.get('autoSync')) {
    syncManager.startAutoSync();
  }
  
  // بدء الفحص الدوري للترخيص (كل ساعة)
  if (licenseValid) {
    licenseManager.startPeriodicCheck(60);
  }
  
  // بدء فحص التحديثات (بعد 10 ثواني من بدء التشغيل)
  autoUpdater.startPeriodicCheck(60); // فحص كل ساعة
  
  // مراقبة حالة الاتصال
  setInterval(checkConnection, 10000);
});

// التحقق من الاتصال
async function checkConnection() {
  const serverUrl = store.get('serverUrl');
  if (!serverUrl) return;
  
  try {
    const response = await fetch(`${serverUrl}/api/health`, { 
      method: 'GET',
      timeout: 5000 
    });
    
    if (response.ok && !isOnline) {
      isOnline = true;
      mainWindow.webContents.send('connection-status', true);
      syncManager.syncNow(); // مزامنة فورية عند عودة الاتصال
      updateTrayMenu();
    }
  } catch (error) {
    if (isOnline) {
      isOnline = false;
      mainWindow.webContents.send('connection-status', false);
      updateTrayMenu();
    }
  }
}

// تحديث قائمة الـ Tray
function updateTrayMenu() {
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'فتح البرنامج', click: () => mainWindow.show() },
      { label: isOnline ? '🟢 متصل' : '🔴 غير متصل', enabled: false },
      { type: 'separator' },
      { label: 'مزامنة الآن', click: () => syncManager.syncNow(), enabled: isOnline },
      { type: 'separator' },
      { label: 'الإعدادات', click: () => mainWindow.show() },
      { type: 'separator' },
      { label: 'إغلاق البرنامج', click: () => { app.isQuitting = true; app.quit(); }}
    ]);
    tray.setContextMenu(contextMenu);
  }
}

// ============ IPC Handlers ============

// إعدادات السيرفر
ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('save-settings', (event, settings) => {
  Object.keys(settings).forEach(key => {
    store.set(key, settings[key]);
  });
  return true;
});

// حالة الاتصال
ipcMain.handle('get-connection-status', () => {
  return isOnline;
});

// الطابعات
ipcMain.handle('get-printers', async () => {
  return printerManager.getPrinters();
});

ipcMain.handle('print-receipt', async (event, data) => {
  return printerManager.printReceipt(data);
});

ipcMain.handle('print-kitchen', async (event, data) => {
  return printerManager.printKitchenOrder(data);
});

// قاعدة البيانات المحلية
ipcMain.handle('db-query', async (event, { action, table, data, query }) => {
  const db = getDatabase();
  
  switch (action) {
    case 'insert':
      return db.insert(table, data);
    case 'update':
      return db.update(table, data, query);
    case 'delete':
      return db.delete(table, query);
    case 'find':
      return db.find(table, query);
    case 'findOne':
      return db.findOne(table, query);
    default:
      throw new Error('Unknown action');
  }
});

// المزامنة
ipcMain.handle('sync-now', async () => {
  return syncManager.syncNow();
});

ipcMain.handle('get-sync-status', () => {
  return syncManager.getStatus();
});

ipcMain.handle('get-pending-count', () => {
  return syncManager.getPendingCount();
});

// ============ الترخيص ============
ipcMain.handle('license-verify', async () => {
  if (!licenseManager) {
    return { valid: false, reason: 'not_initialized', message: 'مدير الترخيص غير مهيأ' };
  }
  return licenseManager.verifyOnStartup();
});

ipcMain.handle('license-check', async () => {
  if (!licenseManager) {
    return { valid: false, reason: 'not_initialized' };
  }
  try {
    return await licenseManager.checkLicense();
  } catch (error) {
    return licenseManager.checkOfflineGrace();
  }
});

ipcMain.handle('license-get-data', () => {
  if (!licenseManager) return null;
  return licenseManager.getLicenseData();
});

ipcMain.handle('license-has-feature', (event, featureName) => {
  if (!licenseManager) return false;
  return licenseManager.hasFeature(featureName);
});

ipcMain.handle('license-get-features', () => {
  if (!licenseManager) return [];
  return licenseManager.getFeatures();
});

// حفظ بيانات تسجيل الدخول
ipcMain.handle('save-auth-token', (event, token) => {
  store.set('authToken', token);
  return true;
});

ipcMain.handle('get-auth-token', () => {
  return store.get('authToken');
});

ipcMain.handle('clear-auth-token', () => {
  store.delete('authToken');
  store.delete('licenseData');
  store.delete('lastOnlineCheck');
  return true;
});

// ============ مسح البيانات وإعادة التحميل ============
ipcMain.handle('clear-cache', async () => {
  try {
    const { session } = require('electron');
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({
      storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
    });
    console.log('🧹 تم مسح جميع البيانات المؤقتة');
    return { success: true, message: 'تم مسح البيانات بنجاح' };
  } catch (error) {
    console.error('❌ فشل مسح البيانات:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('reload-app', () => {
  if (mainWindow) {
    mainWindow.reload();
  }
  return true;
});

ipcMain.handle('clear-and-reload', async () => {
  try {
    const { session } = require('electron');
    // مسح Cache
    await session.defaultSession.clearCache();
    // مسح IndexedDB و LocalStorage
    await session.defaultSession.clearStorageData({
      storages: ['indexdb', 'localstorage', 'cachestorage', 'serviceworkers']
    });
    console.log('🧹 تم مسح البيانات');
    // إعادة تحميل الصفحة
    if (mainWindow) {
      mainWindow.reload();
    }
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============ معلومات التطبيق ============
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-info', () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    isOnline: isOnline,
    licenseValid: licenseValid
  };
});

// ============ الباركود ============
ipcMain.handle('barcode-process', (event, key, timestamp) => {
  if (!barcodeScanner) return null;
  const result = barcodeScanner.processInput(key, timestamp);
  if (result) {
    // إرسال للواجهة
    barcodeScanner.notifyBarcodeScan(result);
  }
  return result;
});

ipcMain.handle('barcode-get-settings', () => {
  if (!barcodeScanner) return null;
  return barcodeScanner.getSettings();
});

ipcMain.handle('barcode-update-settings', (event, settings) => {
  if (!barcodeScanner) return false;
  barcodeScanner.updateSettings(settings);
  return true;
});

ipcMain.handle('barcode-find-product', async (event, barcode) => {
  if (!barcodeScanner) return null;
  const db = getDatabase();
  return barcodeScanner.findProductByBarcode(barcode, db);
});

// ============ إعادة تحميل التطبيق ============
ipcMain.handle('reload-app', () => {
  if (mainWindow) {
    loadMainInterface();
  }
  return true;
});

ipcMain.handle('open-dev-tools', () => {
  if (mainWindow) {
    mainWindow.webContents.openDevTools();
  }
  return true;
});

// ============ التحديث التلقائي ============
ipcMain.handle('update-check', () => {
  if (!autoUpdater) return { error: 'مدير التحديث غير مهيأ' };
  autoUpdater.checkForUpdates();
  return { checking: true };
});

ipcMain.handle('update-download', () => {
  if (!autoUpdater) return { error: 'مدير التحديث غير مهيأ' };
  autoUpdater.downloadUpdate();
  return { downloading: true };
});

ipcMain.handle('update-install', () => {
  if (!autoUpdater) return { error: 'مدير التحديث غير مهيأ' };
  autoUpdater.quitAndInstall();
  return { installing: true };
});

ipcMain.handle('update-get-status', () => {
  if (!autoUpdater) return null;
  return autoUpdater.getStatus();
});

// ============ ZKTeco أجهزة البصمة ============
let zktecoManager = null;

// تهيئة مدير ZKTeco
ipcMain.handle('zkteco-initialize', async () => {
  const { ZKTecoManager } = require('./src/zkteco-manager');
  zktecoManager = new ZKTecoManager(store);
  
  // الاستماع للأحداث
  zktecoManager.on('device-connected', (data) => {
    mainWindow?.webContents.send('zkteco-device-connected', data);
  });
  zktecoManager.on('device-disconnected', (data) => {
    mainWindow?.webContents.send('zkteco-device-disconnected', data);
  });
  zktecoManager.on('attendance-captured', (data) => {
    mainWindow?.webContents.send('zkteco-attendance-captured', data);
  });
  
  return zktecoManager.initialize();
});

// الاتصال بجهاز
ipcMain.handle('zkteco-connect', async (event, { ip, port, name }) => {
  if (!zktecoManager) {
    return { success: false, error: 'ZKTeco Manager غير مهيأ' };
  }
  return zktecoManager.connectDevice(ip, port || 4370, name || 'Device');
});

// قطع الاتصال
ipcMain.handle('zkteco-disconnect', async (event, deviceId) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.disconnectDevice(deviceId);
});

// جلب المستخدمين
ipcMain.handle('zkteco-get-users', async (event, deviceId) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.getUsers(deviceId);
});

// جلب سجلات الحضور
ipcMain.handle('zkteco-get-logs', async (event, deviceId) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.getAttendanceLogs(deviceId);
});

// إضافة مستخدم
ipcMain.handle('zkteco-add-user', async (event, { deviceId, userData }) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.addUser(deviceId, userData);
});

// حذف مستخدم
ipcMain.handle('zkteco-delete-user', async (event, { deviceId, uid }) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.deleteUser(deviceId, uid);
});

// مسح السجلات
ipcMain.handle('zkteco-clear-logs', async (event, deviceId) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.clearAttendanceLogs(deviceId);
});

// ضبط الوقت
ipcMain.handle('zkteco-set-time', async (event, deviceId) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.setDeviceTime(deviceId);
});

// بدء الاستماع للبصمات الحية
ipcMain.handle('zkteco-start-realtime', async (event, deviceId) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.startRealTimeCapture(deviceId);
});

// فحص جهاز
ipcMain.handle('zkteco-ping', async (event, { ip, port }) => {
  if (!zktecoManager) {
    const { ZKTecoManager } = require('./src/zkteco-manager');
    zktecoManager = new ZKTecoManager(store);
    await zktecoManager.initialize();
  }
  return zktecoManager.pingDevice(ip, port || 4370);
});

// البحث عن أجهزة
ipcMain.handle('zkteco-scan', async (event, { baseIp, startRange, endRange }) => {
  if (!zktecoManager) {
    const { ZKTecoManager } = require('./src/zkteco-manager');
    zktecoManager = new ZKTecoManager(store);
    await zktecoManager.initialize();
  }
  return zktecoManager.scanNetwork(baseIp, startRange, endRange);
});

// الأجهزة المتصلة
ipcMain.handle('zkteco-get-devices', () => {
  if (!zktecoManager) return [];
  return zktecoManager.getConnectedDevices();
});

// حفظ إعدادات الأجهزة
ipcMain.handle('zkteco-save-settings', (event, devices) => {
  if (!zktecoManager) return false;
  zktecoManager.saveDeviceSettings(devices);
  return true;
});

// جلب الأجهزة المحفوظة
ipcMain.handle('zkteco-get-saved', () => {
  if (!zktecoManager) {
    return store.get('zktecoDevices', []);
  }
  return zktecoManager.getSavedDevices();
});

// إغلاق التطبيق
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// تنظيف عند الإغلاق
app.on('before-quit', () => {
  app.isQuitting = true;
  if (syncManager) {
    syncManager.stopAutoSync();
  }
  if (licenseManager) {
    licenseManager.stopPeriodicCheck();
  }
  if (autoUpdater) {
    autoUpdater.stopPeriodicCheck();
  }
});

// على Mac: إظهار النافذة عند النقر على أيقونة Dock
app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

// إغلاق التطبيق عند إغلاق كل النوافذ (على Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
