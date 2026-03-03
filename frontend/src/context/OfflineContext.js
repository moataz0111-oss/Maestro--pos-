/**
 * Offline Context
 * سياق React للإدارة المركزية لحالة Offline
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import useOnlineStatus from '../hooks/useOnlineStatus';
import syncService from '../lib/syncService';
import offlineStorage from '../lib/offlineStorage';
import db from '../lib/offlineDB';
import { toast } from 'sonner';

const OfflineContext = createContext(null);

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }
  return context;
};

export const OfflineProvider = ({ children }) => {
  const { isOnline, wasOffline } = useOnlineStatus();
  const [syncStatus, setSyncStatus] = useState({
    isSyncing: false,
    pendingOrders: 0,
    pendingItems: 0,
    lastSync: null
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // تهيئة قاعدة البيانات المحلية
  useEffect(() => {
    const initDB = async () => {
      try {
        await db.openDatabase();
        setIsInitialized(true);
        console.log('✅ تم تهيئة قاعدة البيانات المحلية');
      } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error);
        // استمر حتى لو فشلت قاعدة البيانات
        setIsInitialized(true);
      }
    };
    initDB();
  }, []);

  // تحديث حالة المزامنة
  const updateSyncStatus = useCallback(async () => {
    try {
      const status = await syncService.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Error updating sync status:', error);
    }
  }, []);

  // تحديث دوري لحالة المزامنة
  useEffect(() => {
    updateSyncStatus();
    const interval = setInterval(updateSyncStatus, 10000);
    return () => clearInterval(interval);
  }, [updateSyncStatus]);

  // مزامنة تلقائية عند عودة الاتصال
  useEffect(() => {
    if (wasOffline && isOnline) {
      const token = localStorage.getItem('token');
      if (token && syncStatus.pendingOrders > 0) {
        toast.info(`🔄 جاري مزامنة ${syncStatus.pendingOrders} طلب...`, {
          duration: 3000
        });
        
        syncService.autoSync(token).then(result => {
          if (result.success && result.results) {
            toast.success(`✅ تم رفع ${result.results.orders.synced} طلب بنجاح!`, {
              duration: 5000
            });
          }
          updateSyncStatus();
        });
      }
    }
  }, [wasOffline, isOnline, syncStatus.pendingOrders, updateSyncStatus]);

  // الاستماع لأحداث المزامنة
  useEffect(() => {
    const unsubscribe = syncService.addSyncListener((event, data) => {
      switch (event) {
        case 'start':
          setSyncStatus(prev => ({ ...prev, isSyncing: true }));
          break;
        case 'complete':
          setSyncStatus(prev => ({ ...prev, isSyncing: false }));
          updateSyncStatus();
          break;
        case 'error':
          setSyncStatus(prev => ({ ...prev, isSyncing: false }));
          toast.error('❌ فشل في المزامنة: ' + data.error);
          break;
        case 'progress':
          // يمكن إضافة شريط تقدم هنا
          break;
        default:
          break;
      }
    });

    return () => unsubscribe();
  }, [updateSyncStatus]);

  // بدء المزامنة يدوياً
  const startSync = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('يرجى تسجيل الدخول أولاً');
      return;
    }

    if (!isOnline) {
      toast.error('لا يوجد اتصال بالإنترنت');
      return;
    }

    const result = await syncService.startSync(token);
    if (result.success) {
      toast.success('✅ تمت المزامنة بنجاح!');
    }
    updateSyncStatus();
  }, [isOnline, updateSyncStatus]);

  // تهيئة البيانات المحلية
  const initializeData = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (token && isOnline) {
      await offlineStorage.initializeOfflineData(token);
      toast.success('✅ تم تحديث البيانات المحلية');
    }
  }, [isOnline]);

  const value = {
    isOnline,
    isOffline: !isOnline,
    isInitialized,
    syncStatus,
    startSync,
    initializeData,
    updateSyncStatus
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

export default OfflineContext;
