const { app, BrowserWindow, ipcMain, Menu, Tray, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { initDatabase, getDatabase } = require('./src/database');
const { SyncManager } = require('./src/sync-manager');
const { PrinterManager } = require('./src/printer-manager');
const { LicenseManager } = require('./src/license-manager');
const { BarcodeScanner } = require('./src/barcode-scanner');

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
let isOnline = true;
let licenseValid = false;

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
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    title: 'Maestro POS'
  });

  // تحميل الواجهة
  const serverUrl = store.get('serverUrl');
  if (serverUrl) {
    mainWindow.loadURL(serverUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'src', 'views', 'setup.html'));
  }

  // التعامل مع حالة الاتصال
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.log('فشل التحميل:', errorDescription);
    if (errorCode === -106 || errorCode === -105) { // لا يوجد اتصال
      isOnline = false;
      mainWindow.loadFile(path.join(__dirname, 'src', 'views', 'offline.html'));
    }
  });

  // عند إغلاق النافذة
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // إخفاء للـ tray بدلاً من الإغلاق
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
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

// تهيئة التطبيق
app.whenReady().then(async () => {
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
  
  // إنشاء النافذة
  createWindow();
  createTray();
  
  // بدء المزامنة التلقائية
  if (store.get('autoSync')) {
    syncManager.startAutoSync();
  }
  
  // بدء الفحص الدوري للترخيص (كل ساعة)
  if (licenseValid) {
    licenseManager.startPeriodicCheck(60);
  }
  
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
  if (syncManager) {
    syncManager.stopAutoSync();
  }
  if (licenseManager) {
    licenseManager.stopPeriodicCheck();
  }
});
