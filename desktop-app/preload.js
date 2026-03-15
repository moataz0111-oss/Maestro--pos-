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
  
  // ============ التنقل ============
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, route) => callback(route));
  },
  
  // ============ معلومات التطبيق ============
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // ============ الإشعارات ============
  showNotification: (title, body) => {
    new Notification(title, { body });
  }
});

// إضافة متغير للتحقق من وجود Electron
contextBridge.exposeInMainWorld('isElectron', true);
