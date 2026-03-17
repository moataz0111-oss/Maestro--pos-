const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

// تهيئة التخزين المحلي
const store = new Store({
  name: 'maestro-config',
  encryptionKey: 'maestro-pos-2024-secret-key'
});

// المتغيرات الرئيسية
let mainWindow = null;
let tray = null;
let isOnline = true;

// استيراد المدراء
const { initDatabase } = require('./src/database');
const { SyncManager } = require('./src/sync-manager');
const { PrinterManager } = require('./src/printer-manager');
const { LicenseManager } = require('./src/license-manager');
const { BarcodeScanner } = require('./src/barcode-scanner');
const { AutoUpdater } = require('./src/auto-updater');

let syncManager = null;
let printerManager = null;
let licenseManager = null;
let barcodeScanner = null;
let autoUpdater = null;

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
      // تفعيل الـ spellcheck وحفظ كلمات السر
      spellcheck: true,
      enableWebSQL: false,
      // تفعيل clipboard
      sandbox: false
    },
    titleBarStyle: 'default',
    title: 'Maestro POS',
    show: false
  });

  // تفعيل قائمة النقر بزر الماوس الأيمن (Context Menu) - تدعم اللغتين
  mainWindow.webContents.on('context-menu', (event, params) => {
    // جلب اللغة المحفوظة
    const appLang = store.get('appLanguage', 'ar');
    
    // الترجمات
    const labels = {
      ar: { undo: 'تراجع', redo: 'إعادة', cut: 'قص', copy: 'نسخ', paste: 'لصق', selectAll: 'تحديد الكل' },
      en: { undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All' }
    };
    const t = labels[appLang] || labels.ar;
    
    const menuTemplate = [];
    
    if (params.isEditable) {
      menuTemplate.push(
        { label: t.undo, role: 'undo' },
        { label: t.redo, role: 'redo' },
        { type: 'separator' },
        { label: t.cut, role: 'cut' },
        { label: t.copy, role: 'copy' },
        { label: t.paste, role: 'paste' },
        { label: t.selectAll, role: 'selectAll' }
      );
    } else if (params.selectionText) {
      menuTemplate.push(
        { label: t.copy, role: 'copy' },
        { label: t.selectAll, role: 'selectAll' }
      );
    }
    
    if (menuTemplate.length > 0) {
      const contextMenu = Menu.buildFromTemplate(menuTemplate);
      contextMenu.popup();
    }
  });

  // جلب رابط السيرفر المحفوظ
  const serverUrl = store.get('serverUrl');
  
  if (serverUrl) {
    // عرض صفحة التحميل أولاً
    mainWindow.loadFile(path.join(__dirname, 'src', 'views', 'loading.html'));
    
    // ثم تحميل السيرفر بعد تأخير قصير
    setTimeout(() => {
      mainWindow.loadURL(serverUrl);
    }, 500);
  } else {
    // فتح صفحة الإعداد
    mainWindow.loadFile(path.join(__dirname, 'src', 'views', 'setup.html'));
  }

  // إظهار النافذة عند الجاهزية
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // فحص التحديثات
    if (autoUpdater) {
      setTimeout(() => autoUpdater.checkForUpdates(), 3000);
    }
  });
  
  // معالجة فشل تحميل الصفحة
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log('❌ فشل تحميل الصفحة:', errorCode, errorDescription);
    isOnline = false;
    updateTrayStatus();
    
    // إذا فشل التحميل، عرض صفحة الخطأ
    if (errorCode !== -3) { // تجاهل إلغاء التحميل
      mainWindow.loadFile(path.join(__dirname, 'src', 'views', 'error.html'));
    }
  });

  // معالجة إغلاق النافذة بشكل صحيح
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
  
  // التأكد من إغلاق التطبيق بالكامل
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // مراقبة حالة الاتصال

  mainWindow.webContents.on('did-finish-load', () => {
    isOnline = true;
    updateTrayStatus();
  });
}

// تحديث حالة الـ Tray
function updateTrayStatus() {
  if (tray) {
    const contextMenu = Menu.buildFromTemplate(getTrayMenuTemplate());
    tray.setContextMenu(contextMenu);
  }
}

// قالب قائمة Tray
function getTrayMenuTemplate() {
  return [
    { 
      label: 'فتح البرنامج', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { 
      label: isOnline ? '🟢 متصل' : '🔴 غير متصل',
      enabled: false
    },
    { type: 'separator' },
    { 
      label: '🔄 إعادة تحميل', 
      click: () => {
        if (mainWindow) mainWindow.reload();
      }
    },
    { 
      label: '🧹 مسح البيانات المؤقتة', 
      click: async () => {
        if (mainWindow) {
          await mainWindow.webContents.session.clearCache();
          await mainWindow.webContents.session.clearStorageData({
            storages: ['indexdb', 'localstorage', 'cachestorage', 'serviceworkers']
          });
          mainWindow.reload();
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'تم',
            message: 'تم مسح البيانات المؤقتة وإعادة تحميل البرنامج'
          });
        }
      }
    },
    { type: 'separator' },
    { 
      label: '⚙️ إعادة تعيين رابط السيرفر', 
      click: () => {
        store.delete('serverUrl');
        if (mainWindow) {
          mainWindow.loadFile(path.join(__dirname, 'src', 'views', 'setup.html'));
        }
      }
    },
    { type: 'separator' },
    { 
      label: '❌ إغلاق البرنامج', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ];
}

// إنشاء أيقونة الـ System Tray
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate(getTrayMenuTemplate());
  
  tray.setToolTip('Maestro POS');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// إنشاء القائمة الرئيسية للتطبيق
function createAppMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { label: 'حول البرنامج', role: 'about' },
        { type: 'separator' },
        { label: 'إخفاء', role: 'hide' },
        { label: 'إخفاء الآخرين', role: 'hideOthers' },
        { label: 'إظهار الكل', role: 'unhide' },
        { type: 'separator' },
        { 
          label: 'إغلاق',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]
    }] : []),
    {
      label: 'ملف',
      submenu: [
        { 
          label: '🔄 إعادة تحميل',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.reload();
          }
        },
        { 
          label: '🧹 مسح البيانات المؤقتة',
          accelerator: 'CmdOrCtrl+Shift+Delete',
          click: async () => {
            if (mainWindow) {
              await mainWindow.webContents.session.clearCache();
              await mainWindow.webContents.session.clearStorageData({
                storages: ['indexdb', 'localstorage', 'cachestorage', 'serviceworkers']
              });
              mainWindow.reload();
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'تم',
                message: 'تم مسح البيانات المؤقتة'
              });
            }
          }
        },
        { type: 'separator' },
        ...(isMac ? [] : [{ 
          label: 'إغلاق',
          accelerator: 'Alt+F4',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }])
      ]
    },
    {
      label: 'تحرير',
      submenu: [
        { label: 'تراجع', role: 'undo', accelerator: 'CmdOrCtrl+Z' },
        { label: 'إعادة', role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { label: 'قص', role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: 'نسخ', role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { label: 'لصق', role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { label: 'تحديد الكل', role: 'selectAll', accelerator: 'CmdOrCtrl+A' }
      ]
    },
    {
      label: 'عرض',
      submenu: [
        { 
          label: 'تكبير',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            if (mainWindow) {
              const currentZoom = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(currentZoom + 0.1);
            }
          }
        },
        { 
          label: 'تصغير',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            if (mainWindow) {
              const currentZoom = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(Math.max(0.5, currentZoom - 0.1));
            }
          }
        },
        { 
          label: 'حجم افتراضي',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            if (mainWindow) mainWindow.webContents.setZoomFactor(1);
          }
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
          click: () => {
            if (mainWindow) mainWindow.webContents.openDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'الموقع الرسمي',
          click: () => shell.openExternal('https://maestroegp.com')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// تهيئة التطبيق
app.whenReady().then(async () => {
  // مسح الـ Cache عند بدء التشغيل
  const { session } = require('electron');
  try {
    await session.defaultSession.clearCache();
    console.log('✅ تم مسح Cache');
  } catch (e) {
    console.log('⚠️ لم يتم مسح Cache:', e.message);
  }
  
  // تهيئة قاعدة البيانات المحلية
  await initDatabase();
  
  // تهيئة المدراء
  syncManager = new SyncManager(store);
  printerManager = new PrinterManager(store);
  licenseManager = new LicenseManager(store);
  barcodeScanner = new BarcodeScanner();
  autoUpdater = new AutoUpdater(store);
  
  // إنشاء النافذة والقوائم
  createWindow();
  createTray();
  createAppMenu();
  
  // بدء المزامنة التلقائية
  syncManager.startAutoSync();
  
  // الاستماع لأحداث التحديث
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-status', { type: 'available', info });
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-status', { type: 'downloaded', info });
  });
  autoUpdater.on('error', (error) => {
    mainWindow?.webContents.send('update-status', { type: 'error', error: error.message });
  });
  
  // إعادة إنشاء النافذة على Mac عند النقر على الأيقونة
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

// ============ معالجات IPC ============

// حفظ رابط السيرفر
ipcMain.handle('save-server-url', (event, url) => {
  store.set('serverUrl', url);
  if (mainWindow) {
    mainWindow.loadURL(url);
  }
  return true;
});

// جلب رابط السيرفر
ipcMain.handle('get-server-url', () => {
  return store.get('serverUrl', '');
});

// حفظ جميع الإعدادات (للإعداد الأولي) - لا يتم تحميل الصفحة هنا
ipcMain.handle('save-settings', (event, settings) => {
  if (settings.serverUrl) store.set('serverUrl', settings.serverUrl);
  if (settings.authToken) store.set('authToken', settings.authToken);
  if (settings.userEmail) store.set('userEmail', settings.userEmail);
  if (settings.userName) store.set('userName', settings.userName);
  if (settings.branchId) store.set('branchId', settings.branchId);
  
  // لا نحمّل الصفحة هنا - سيتم ذلك من setup.html
  return true;
});

// تحميل رابط السيرفر يدوياً
ipcMain.handle('load-server-url', (event, url) => {
  if (mainWindow && url) {
    mainWindow.loadURL(url);
  }
  return true;
});

// جلب جميع الإعدادات
ipcMain.handle('get-settings', () => {
  return {
    serverUrl: store.get('serverUrl', ''),
    authToken: store.get('authToken', ''),
    userEmail: store.get('userEmail', ''),
    userName: store.get('userName', ''),
    branchId: store.get('branchId', ''),
    appLanguage: store.get('appLanguage', 'ar')
  };
});

// حفظ اللغة
ipcMain.handle('save-language', (event, lang) => {
  store.set('appLanguage', lang);
  return true;
});

// جلب اللغة
ipcMain.handle('get-language', () => {
  return store.get('appLanguage', 'ar');
});

// ============ الطباعة ============
ipcMain.handle('get-printers', async () => {
  return printerManager.getPrinters();
});

ipcMain.handle('print-receipt', async (event, { content, printerName }) => {
  return printerManager.printReceipt(content, printerName);
});

ipcMain.handle('print-kitchen-order', async (event, { content, printerName }) => {
  return printerManager.printKitchenOrder(content, printerName);
});

// ============ قاعدة البيانات المحلية ============
ipcMain.handle('db-save-order', async (event, order) => {
  const { saveOrder } = require('./src/database');
  return saveOrder(order);
});

ipcMain.handle('db-get-pending-orders', async () => {
  const { getPendingOrders } = require('./src/database');
  return getPendingOrders();
});

ipcMain.handle('db-save-products', async (event, products) => {
  const { saveProducts } = require('./src/database');
  return saveProducts(products);
});

ipcMain.handle('db-get-products', async () => {
  const { getProducts } = require('./src/database');
  return getProducts();
});

ipcMain.handle('db-save-categories', async (event, categories) => {
  const { saveCategories } = require('./src/database');
  return saveCategories(categories);
});

ipcMain.handle('db-get-categories', async () => {
  const { getCategories } = require('./src/database');
  return getCategories();
});

// ============ المزامنة ============
ipcMain.handle('sync-now', async () => {
  return syncManager.syncNow();
});

ipcMain.handle('get-sync-status', () => {
  return syncManager.getStatus();
});

// ============ الترخيص ============
ipcMain.handle('license-verify', async () => {
  return licenseManager.verifyLicense();
});

ipcMain.handle('license-activate', async (event, { serverUrl, token }) => {
  return licenseManager.activateDevice(serverUrl, token);
});

ipcMain.handle('license-get-status', () => {
  return licenseManager.getStatus();
});

// ============ الباركود ============
ipcMain.on('barcode-scanned', (event, barcode) => {
  mainWindow?.webContents.send('barcode-detected', barcode);
});

// ============ Token المصادقة ============
ipcMain.handle('save-auth-token', (event, token) => {
  store.set('authToken', token);
  return true;
});

ipcMain.handle('get-auth-token', () => {
  return store.get('authToken', null);
});

ipcMain.handle('clear-auth-token', () => {
  store.delete('authToken');
  store.delete('licenseData');
  store.delete('lastOnlineCheck');
  return true;
});

// ============ مسح البيانات ============
ipcMain.handle('clear-cache', async () => {
  try {
    if (mainWindow) {
      await mainWindow.webContents.session.clearCache();
      await mainWindow.webContents.session.clearStorageData({
        storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
      });
    }
    return { success: true, message: 'تم مسح البيانات بنجاح' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('reload-app', () => {
  if (mainWindow) {
    // جلب رابط السيرفر المحفوظ
    const serverUrl = store.get('serverUrl');
    if (serverUrl) {
      mainWindow.loadURL(serverUrl);
    } else {
      mainWindow.loadFile(path.join(__dirname, 'src', 'views', 'setup.html'));
    }
  }
  return true;
});

ipcMain.handle('clear-and-reload', async () => {
  try {
    if (mainWindow) {
      await mainWindow.webContents.session.clearCache();
      await mainWindow.webContents.session.clearStorageData({
        storages: ['indexdb', 'localstorage', 'cachestorage', 'serviceworkers']
      });
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
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node
  };
});

ipcMain.handle('open-dev-tools', () => {
  if (mainWindow) mainWindow.webContents.openDevTools();
  return true;
});

// ============ التحديث التلقائي ============
ipcMain.handle('update-check', async () => {
  if (!autoUpdater) return { success: false };
  return autoUpdater.checkForUpdates();
});

ipcMain.handle('update-download', async () => {
  if (!autoUpdater) return { success: false };
  return autoUpdater.downloadUpdate();
});

ipcMain.handle('update-install', () => {
  if (!autoUpdater) return { success: false };
  autoUpdater.quitAndInstall();
  return { success: true };
});

ipcMain.handle('update-get-status', () => {
  if (!autoUpdater) return null;
  return autoUpdater.getStatus();
});

// ============ ZKTeco ============
let zktecoManager = null;

ipcMain.handle('zkteco-initialize', async () => {
  const { ZKTecoManager } = require('./src/zkteco-manager');
  zktecoManager = new ZKTecoManager(store);
  
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

ipcMain.handle('zkteco-connect', async (event, { ip, port, name }) => {
  if (!zktecoManager) return { success: false, error: 'ZKTeco Manager غير مهيأ' };
  return zktecoManager.connectDevice(ip, port || 4370, name || 'Device');
});

ipcMain.handle('zkteco-disconnect', async (event, deviceId) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.disconnectDevice(deviceId);
});

ipcMain.handle('zkteco-get-users', async (event, deviceId) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.getUsers(deviceId);
});

ipcMain.handle('zkteco-get-logs', async (event, deviceId) => {
  if (!zktecoManager) return { success: false };
  return zktecoManager.getAttendanceLogs(deviceId);
});

ipcMain.handle('zkteco-get-devices', () => {
  if (!zktecoManager) return [];
  return zktecoManager.getConnectedDevices();
});

// ============ إغلاق التطبيق ============
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// التأكد من إغلاق التطبيق بالكامل عند الضغط على Cmd+Q
app.on('will-quit', () => {
  // تنظيف الموارد
  if (syncManager && syncManager.stopAutoSync) syncManager.stopAutoSync();
  if (zktecoManager && zktecoManager.disconnectAll) zktecoManager.disconnectAll();
});
