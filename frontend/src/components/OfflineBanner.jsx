/**
 * شريط حالة Offline
 * يظهر عندما يكون المستخدم غير متصل أو لديه بيانات للمزامنة
 */

import React, { useState, useEffect } from 'react';
import { useOffline } from '../context/OfflineContext';
import { useTranslation } from '../hooks/useTranslation';
import { Wifi, WifiOff, Loader2, CloudOff, CheckCircle2 } from 'lucide-react';

const OfflineBanner = () => {
  const { t } = useTranslation();
  const { isOnline, isOffline, syncStatus } = useOffline();
  const [showSuccess, setShowSuccess] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  // تتبع الانتقال من offline إلى online
  useEffect(() => {
    if (isOffline) {
      setWasOffline(true);
      setShowSuccess(false);
    }
  }, [isOffline]);

  // عند العودة للاتصال بعد انقطاع
  useEffect(() => {
    if (isOnline && wasOffline && syncStatus.syncCompleted && syncStatus.pendingOrders === 0) {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        setShowSuccess(false);
        setWasOffline(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, syncStatus.syncCompleted, syncStatus.pendingOrders]);

  // === حالة 1: متصل ولا مشاكل ===
  if (isOnline && !syncStatus.isSyncing && syncStatus.pendingOrders === 0 && !showSuccess) {
    return null;
  }

  // === حالة 2: نجاح المزامنة بعد الانقطاع ===
  if (showSuccess) {
    return (
      <div 
        className="px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium shadow-lg"
        style={{ 
          background: 'linear-gradient(135deg, #059669, #10b981)', 
          color: 'white',
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999 
        }}
      >
        <CheckCircle2 className="h-4 w-4" />
        <span>{t('تم الاتصال والمزامنة بنجاح!')}</span>
      </div>
    );
  }

  // === حالة 3: غير متصل ===
  if (isOffline) {
    return (
      <div 
        className="px-4 py-2.5 flex items-center justify-between text-sm font-medium shadow-lg"
        style={{ 
          background: 'linear-gradient(135deg, #d97706, #f59e0b)', 
          color: 'white',
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999 
        }}
      >
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 animate-pulse" />
          <span>{t('لا يوجد اتصال بالإنترنت')} - {t('وضع Offline')}</span>
        </div>
        <div className="flex items-center gap-2">
          <CloudOff className="h-4 w-4" />
          {syncStatus.pendingOrders > 0 ? (
            <span className="bg-white/25 px-2.5 py-0.5 rounded-full text-xs font-bold">
              {syncStatus.pendingOrders} {t('طلب في انتظار المزامنة')}
            </span>
          ) : (
            <span className="text-xs opacity-90">{t('البيانات محفوظة محلياً')}</span>
          )}
        </div>
      </div>
    );
  }

  // === حالة 4: جاري المزامنة ===
  if (syncStatus.isSyncing) {
    return (
      <div 
        className="px-4 py-2.5 flex items-center justify-between text-sm font-medium shadow-lg"
        style={{ 
          background: 'linear-gradient(135deg, #2563eb, #3b82f6)', 
          color: 'white',
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999 
        }}
      >
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          <span>{t('تم الاتصال!')} - {t('جاري المزامنة...')}</span>
        </div>
        <div className="flex items-center gap-2">
          {syncStatus.syncProgress ? (
            <span className="bg-white/25 px-2.5 py-0.5 rounded-full text-xs font-bold">
              {syncStatus.syncProgress.current}/{syncStatus.syncProgress.total}
            </span>
          ) : (
            <span className="bg-white/25 px-2.5 py-0.5 rounded-full text-xs font-bold">
              {syncStatus.pendingOrders} {t('طلب')}
            </span>
          )}
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </div>
    );
  }

  // === حالة 5: متصل مع طلبات معلقة ===
  if (isOnline && syncStatus.pendingOrders > 0) {
    return (
      <div 
        className="px-4 py-2.5 flex items-center justify-between text-sm font-medium shadow-lg"
        style={{ 
          background: 'linear-gradient(135deg, #2563eb, #3b82f6)', 
          color: 'white',
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999 
        }}
      >
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          <span>{t('جاري رفع الطلبات...')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-white/25 px-2.5 py-0.5 rounded-full text-xs font-bold">
            {syncStatus.pendingOrders} {t('طلب جاهز للرفع')}
          </span>
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
