const { contextBridge, ipcRenderer } = require('electron');

// كشف API للواجهة الأمامية
contextBridge.exposeInMainWorld('electronAPI', {
  // ============ إعداد السيرفر ============
  saveServerUrl: (url) => ipcRenderer.invoke('save-server-url', url),
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveLanguage: (lang) => ipcRenderer.invoke('save-language', lang),
  getLanguage: () => ipcRenderer.invoke('get-language'),
  
  // ============ الطباعة ============
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (content, printerName) => ipcRenderer.invoke('print-receipt', { content, printerName }),
  printKitchenOrder: (content, printerName) => ipcRenderer.invoke('print-kitchen-order', { content, printerName }),
  
  // ============ قاعدة البيانات المحلية ============
  saveOrder: (order) => ipcRenderer.invoke('db-save-order', order),
  getPendingOrders: () => ipcRenderer.invoke('db-get-pending-orders'),
  saveProducts: (products) => ipcRenderer.invoke('db-save-products', products),
  getProducts: () => ipcRenderer.invoke('db-get-products'),
  saveCategories: (categories) => ipcRenderer.invoke('db-save-categories', categories),
  getCategories: () => ipcRenderer.invoke('db-get-categories'),
  
  // ============ المزامنة ============
  syncNow: () => ipcRenderer.invoke('sync-now'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  onSyncStatus: (callback) => {
    ipcRenderer.on('sync-status', (event, data) => callback(data));
  },
  
  // ============ الترخيص ============
  license: {
    verify: () => ipcRenderer.invoke('license-verify'),
    activate: (serverUrl, token) => ipcRenderer.invoke('license-activate', { serverUrl, token }),
    getStatus: () => ipcRenderer.invoke('license-get-status')
  },
  
  // ============ الباركود ============
  onBarcodeDetected: (callback) => {
    ipcRenderer.on('barcode-detected', (event, barcode) => callback(barcode));
  },
  
  // ============ Token المصادقة ============
  saveAuthToken: (token) => ipcRenderer.invoke('save-auth-token', token),
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
  clearAuthToken: () => ipcRenderer.invoke('clear-auth-token'),
  
  // ============ معلومات التطبيق ============
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  reloadApp: () => ipcRenderer.invoke('reload-app'),
  openDevTools: () => ipcRenderer.invoke('open-dev-tools'),
  
  // ============ مسح البيانات ============
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  clearAndReload: () => ipcRenderer.invoke('clear-and-reload'),
  
  // ============ التحديث التلقائي ============
  update: {
    check: () => ipcRenderer.invoke('update-check'),
    download: () => ipcRenderer.invoke('update-download'),
    install: () => ipcRenderer.invoke('update-install'),
    getStatus: () => ipcRenderer.invoke('update-get-status')
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  },
  
  // ============ ZKTeco ============
  zkteco: {
    initialize: () => ipcRenderer.invoke('zkteco-initialize'),
    connect: (ip, port, name) => ipcRenderer.invoke('zkteco-connect', { ip, port, name }),
    disconnect: (deviceId) => ipcRenderer.invoke('zkteco-disconnect', deviceId),
    getUsers: (deviceId) => ipcRenderer.invoke('zkteco-get-users', deviceId),
    getLogs: (deviceId) => ipcRenderer.invoke('zkteco-get-logs', deviceId),
    getDevices: () => ipcRenderer.invoke('zkteco-get-devices')
  },
  onZKTecoDeviceConnected: (callback) => {
    ipcRenderer.on('zkteco-device-connected', (event, data) => callback(data));
  },
  onZKTecoDeviceDisconnected: (callback) => {
    ipcRenderer.on('zkteco-device-disconnected', (event, data) => callback(data));
  },
  onZKTecoAttendance: (callback) => {
    ipcRenderer.on('zkteco-attendance-captured', (event, data) => callback(data));
  },
  
  // ============ الإشعارات ============
  onNotification: (callback) => {
    ipcRenderer.on('notification', (event, data) => callback(data));
  },
  
  // ============ التنقل ============
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, path) => callback(path));
  },
  
  // ============ حالة الاتصال ============
  isElectron: true,
  platform: process.platform
});

// معالجة الباركود من لوحة المفاتيح
let barcodeBuffer = '';
let barcodeTimeout = null;

document.addEventListener('keydown', (event) => {
  // تجاهل مفاتيح التحكم
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  
  // مسح المخزن المؤقت بعد 100ms من عدم النشاط
  clearTimeout(barcodeTimeout);
  barcodeTimeout = setTimeout(() => {
    barcodeBuffer = '';
  }, 100);
  
  // Enter يعني نهاية الباركود
  if (event.key === 'Enter' && barcodeBuffer.length > 3) {
    ipcRenderer.invoke('barcode-process', barcodeBuffer, Date.now());
    barcodeBuffer = '';
    return;
  }
  
  // إضافة الحرف للمخزن المؤقت
  if (event.key.length === 1) {
    barcodeBuffer += event.key;
  }
});
