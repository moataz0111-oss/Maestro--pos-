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

// مفتاح التخزين المحلي لتتبع حالة المزامنة
const SYNC_DONE_KEY = 'maestro_sync_done';
const SYNC_SESSION_KEY = 'maestro_sync_session';

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }
  return context;
};

export const OfflineProvider = ({ children }) => {
  const { isOnline } = useOnlineStatus();
  const [syncStatus, setSyncStatus] = useState({
    isSyncing: false,
    pendingOrders: 0,
    pendingItems: 0,
    lastSync: null,
    syncProgress: null,
    syncCompleted: false
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const syncInProgress = useRef(false);

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

  // تحديث حالة المزامنة (بدون تشغيل المزامنة)
  const updateSyncStatus = useCallback(async () => {
    try {
      const status = await syncService.getSyncStatus();
      setSyncStatus(prev => ({
        ...prev,
        pendingOrders: status.pendingOrders,
        pendingItems: status.pendingItems,
        lastSync: status.lastSync,
        // إذا وجدت طلبات جديدة، أعد تعيين حالة syncCompleted
        syncCompleted: status.pendingOrders === 0 ? prev.syncCompleted : false
      }));
      return status;
    } catch (error) {
      console.error('Error updating sync status:', error);
      return { pendingOrders: 0 };
    }
  }, []);

  // التحقق من وجود طلبات معلقة حقيقية (غير مزامنة)
  const hasRealPendingOrders = useCallback(async () => {
    try {
      const status = await syncService.getSyncStatus();
      return status.pendingOrders > 0;
    } catch {
      return false;
    }
  }, []);

  // مزامنة مرة واحدة فقط
  const performSync = useCallback(async () => {
    // منع المزامنة المتكررة
    if (syncInProgress.current) {
      console.log('⏳ مزامنة قيد التنفيذ بالفعل...');
      return;
    }

    // التحقق من أن المزامنة لم تتم في هذه الجلسة
    const sessionId = sessionStorage.getItem(SYNC_SESSION_KEY);
    const currentSession = Date.now().toString();
    
    if (!sessionId) {
      sessionStorage.setItem(SYNC_SESSION_KEY, currentSession);
    }

    const token = localStorage.getItem('token');
    if (!token || !isOnline) return;

    // التحقق من وجود طلبات معلقة حقيقية
    const hasPending = await hasRealPendingOrders();
    if (!hasPending) {
      setSyncStatus(prev => ({ ...prev, syncCompleted: true, pendingOrders: 0 }));
      return;
    }

    // بدء المزامنة
    syncInProgress.current = true;
    setSyncStatus(prev => ({ ...prev, isSyncing: true }));

    try {
      console.log('🔄 بدء المزامنة...');
      const result = await syncService.startSync(token);

      if (result.success) {
        const totalSynced = (result.results?.orders?.synced || 0) + 
                          (result.results?.customers?.synced || 0) + 
                          (result.results?.expenses?.synced || 0);

        // تحديث الحالة - المزامنة اكتملت
        setSyncStatus({
          isSyncing: false,
          pendingOrders: 0,
          pendingItems: 0,
          lastSync: new Date().toISOString(),
          syncProgress: null,
          syncCompleted: true
        });

        // حفظ أن المزامنة تمت
        localStorage.setItem(SYNC_DONE_KEY, Date.now().toString());

        if (totalSynced > 0) {
          toast.success(`✅ تم رفع ${totalSynced} عنصر بنجاح!`, { duration: 3000 });
        }

        console.log('✅ المزامنة اكتملت بنجاح');
      }
    } catch (error) {
      console.error('❌ خطأ في المزامنة:', error);
      setSyncStatus(prev => ({ ...prev, isSyncing: false }));
    } finally {
      syncInProgress.current = false;
    }
  }, [isOnline, hasRealPendingOrders]);

  // عند تحميل التطبيق أو تغير حالة الاتصال
  useEffect(() => {
    const checkAndSync = async () => {
      if (!isOnline) {
        // عند قطع الاتصال - إعادة تعيين حالة المزامنة
        localStorage.removeItem(SYNC_DONE_KEY);
        setSyncStatus(prev => ({ ...prev, syncCompleted: false }));
        return;
      }

      // عند الاتصال - التحقق من الطلبات المعلقة
      const hasPending = await hasRealPendingOrders();
      
      if (hasPending) {
        // التحقق من أن المزامنة لم تتم بالفعل
        const syncDone = localStorage.getItem(SYNC_DONE_KEY);
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        
        if (!syncDone || parseInt(syncDone) < fiveMinutesAgo) {
          // انتظار قصير ثم المزامنة
          setTimeout(() => performSync(), 1500);
        } else {
          // المزامنة تمت مؤخراً - إخفاء الشريط
          setSyncStatus(prev => ({ ...prev, syncCompleted: true, pendingOrders: 0 }));
        }
      } else {
        // لا توجد طلبات معلقة
        setSyncStatus(prev => ({ ...prev, syncCompleted: true, pendingOrders: 0 }));
      }
    };

    if (isInitialized) {
      checkAndSync();
    }
  }, [isOnline, isInitialized, hasRealPendingOrders, performSync]);

  // الاستماع لأحداث المزامنة
  useEffect(() => {
    const unsubscribe = syncService.addSyncListener((event, data) => {
      switch (event) {
        case 'start':
          setSyncStatus(prev => ({ ...prev, isSyncing: true, syncProgress: null }));
          break;
        case 'complete':
          setSyncStatus(prev => ({ 
            ...prev, 
            isSyncing: false, 
            syncProgress: null,
            syncCompleted: true,
            pendingOrders: 0
          }));
          localStorage.setItem(SYNC_DONE_KEY, Date.now().toString());
          break;
        case 'error':
          setSyncStatus(prev => ({ ...prev, isSyncing: false, syncProgress: null }));
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
  }, []);

  // بدء المزامنة يدوياً (للاستخدام من الخارج إذا لزم الأمر)
  const startSync = useCallback(async () => {
    localStorage.removeItem(SYNC_DONE_KEY); // إعادة تعيين
    await performSync();
  }, [performSync]);

  // تهيئة البيانات المحلية
  const initializeData = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (token && isOnline) {
      await offlineStorage.initializeOfflineData(token);
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
