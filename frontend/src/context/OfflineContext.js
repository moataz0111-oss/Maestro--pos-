/**
 * Offline Context
 * سياق React للإدارة المركزية لحالة Offline
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
    lastSync: null,
    syncProgress: null,
    syncCompleted: false // جديد: لإخفاء الشريط بعد المزامنة
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const autoSyncTriggered = useRef(false); // لمنع المزامنة المتكررة

  // تهيئة قاعدة البيانات المحلية
  useEffect(() => {
    const initDB = async () => {
      try {
        await db.openDatabase();
        setIsInitialized(true);
        console.log('✅ تم تهيئة قاعدة البيانات المحلية');
      } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error);
        setIsInitialized(true);
      }
    };
    initDB();
  }, []);

  // تحديث حالة المزامنة
  const updateSyncStatus = useCallback(async () => {
    try {
      const status = await syncService.getSyncStatus();
      setSyncStatus(prev => ({
        ...prev,
        ...status,
        // إذا لم تعد هناك طلبات معلقة، أعتبر المزامنة مكتملة
        syncCompleted: status.pendingOrders === 0 && prev.syncCompleted
      }));
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
    const performAutoSync = async () => {
      // إذا عاد الاتصال وكان offline سابقاً
      if (wasOffline && isOnline && !autoSyncTriggered.current) {
        const token = localStorage.getItem('token');
        
        // تحقق من وجود طلبات معلقة
        const currentStatus = await syncService.getSyncStatus();
        
        if (token && currentStatus.pendingOrders > 0) {
          autoSyncTriggered.current = true; // منع المزامنة المتكررة
          
          toast.info(`🔄 جاري مزامنة ${currentStatus.pendingOrders} طلب تلقائياً...`, {
            duration: 3000
          });
          
          try {
            const result = await syncService.startSync(token);
            
            if (result.success && result.results) {
              const totalSynced = result.results.orders.synced + 
                                 result.results.customers.synced + 
                                 (result.results.expenses?.synced || 0);
              
              if (totalSynced > 0) {
                toast.success(`✅ تم رفع ${totalSynced} عنصر بنجاح!`, {
                  duration: 5000
                });
              }
              
              // تحديث الحالة بعد المزامنة
              setSyncStatus(prev => ({
                ...prev,
                syncCompleted: true,
                pendingOrders: 0
              }));
            }
          } catch (error) {
            console.error('Auto sync error:', error);
            toast.error('❌ فشل في المزامنة التلقائية');
          }
          
          await updateSyncStatus();
        }
      }
      
      // إعادة تعيين العلم عند قطع الاتصال
      if (!isOnline) {
        autoSyncTriggered.current = false;
        setSyncStatus(prev => ({ ...prev, syncCompleted: false }));
      }
    };
    
    performAutoSync();
  }, [wasOffline, isOnline, updateSyncStatus]);

  // الاستماع لأحداث المزامنة
  useEffect(() => {
    const unsubscribe = syncService.addSyncListener((event, data) => {
      switch (event) {
        case 'start':
          setSyncStatus(prev => ({ ...prev, isSyncing: true, syncProgress: null, syncCompleted: false }));
          break;
        case 'complete':
          setSyncStatus(prev => ({ 
            ...prev, 
            isSyncing: false, 
            syncProgress: null,
            syncCompleted: true,
            pendingOrders: 0
          }));
          updateSyncStatus();
          break;
        case 'error':
          setSyncStatus(prev => ({ ...prev, isSyncing: false, syncProgress: null }));
          toast.error('❌ فشل في المزامنة: ' + data.error);
          break;
        case 'progress':
          setSyncStatus(prev => ({
            ...prev,
            syncProgress: {
              current: data.current,
              total: data.total,
              type: data.type
            }
          }));
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
      setSyncStatus(prev => ({ ...prev, syncCompleted: true, pendingOrders: 0 }));
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
