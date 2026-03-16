const { contextBridge, ipcRenderer } = require('electron');

// الواجهة الآمنة بين Electron و الواجهة الأمامية
contextBridge.exposeInMainWorld('electronAPI', {
  // ============ الإعدادات ============
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // ============ حالة الاتصال ============
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  onConnectionChange: (callback) => {
    ipcRenderer.on('connection-status', (event, status) => callback(status));
  },
  
  // ============ الطابعات ============
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (data) => ipcRenderer.invoke('print-receipt', data),
  printKitchen: (data) => ipcRenderer.invoke('print-kitchen', data),
  
  // ============ قاعدة البيانات المحلية ============
  db: {
    insert: (table, data) => ipcRenderer.invoke('db-query', { action: 'insert', table, data }),
    update: (table, data, query) => ipcRenderer.invoke('db-query', { action: 'update', table, data, query }),
    delete: (table, query) => ipcRenderer.invoke('db-query', { action: 'delete', table, query }),
    find: (table, query) => ipcRenderer.invoke('db-query', { action: 'find', table, query }),
    findOne: (table, query) => ipcRenderer.invoke('db-query', { action: 'findOne', table, query })
  },
  
  // ============ المزامنة ============
  syncNow: () => ipcRenderer.invoke('sync-now'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  getPendingCount: () => ipcRenderer.invoke('get-pending-count'),
  onSyncProgress: (callback) => {
    ipcRenderer.on('sync-progress', (event, progress) => callback(progress));
  },
  onSyncComplete: (callback) => {
    ipcRenderer.on('sync-complete', (event, result) => callback(result));
  },
  
  // ============ الترخيص ============
  license: {
    verify: () => ipcRenderer.invoke('license-verify'),
    check: () => ipcRenderer.invoke('license-check'),
    getData: () => ipcRenderer.invoke('license-get-data'),
    hasFeature: (featureName) => ipcRenderer.invoke('license-has-feature', featureName),
    getFeatures: () => ipcRenderer.invoke('license-get-features')
  },
  onLicenseWarning: (callback) => {
    ipcRenderer.on('license-warning', (event, warning) => callback(warning));
  },
  onFeaturesUpdate: (callback) => {
    ipcRenderer.on('features-update', (event, features) => callback(features));
  },
  
  // ============ المصادقة ============
  auth: {
    saveToken: (token) => ipcRenderer.invoke('save-auth-token', token),
    getToken: () => ipcRenderer.invoke('get-auth-token'),
    clearToken: () => ipcRenderer.invoke('clear-auth-token')
  },
  
  // ============ الباركود ============
  barcode: {
    processInput: (key, timestamp) => ipcRenderer.invoke('barcode-process', key, timestamp),
    getSettings: () => ipcRenderer.invoke('barcode-get-settings'),
    updateSettings: (settings) => ipcRenderer.invoke('barcode-update-settings', settings),
    findProduct: (barcode) => ipcRenderer.invoke('barcode-find-product', barcode)
  },
  onBarcodeScanned: (callback) => {
    ipcRenderer.on('barcode-scanned', (event, data) => callback(data));
  },
  
  // ============ التنقل ============
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, route) => callback(route));
  },
  
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
  
  // ============ الإشعارات ============
  showNotification: (title, body) => {
    new Notification(title, { body });
  }
});

// إضافة متغير للتحقق من وجود Electron
contextBridge.exposeInMainWorld('isElectron', true);

// استماع لأحداث لوحة المفاتيح للباركود
document.addEventListener('keydown', (event) => {
  // تجاهل المفاتيح الخاصة
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  
  // إرسال المفتاح لمعالج الباركود
  ipcRenderer.invoke('barcode-process', event.key, Date.now());
});
