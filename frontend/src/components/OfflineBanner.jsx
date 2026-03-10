/**
 * شريط حالة Offline
 * يظهر عندما يكون المستخدم غير متصل أو لديه بيانات للمزامنة
 */

import React from 'react';
import { useOffline } from '../context/OfflineContext';
import { useTranslation } from '../hooks/useTranslation';
import { Wifi, WifiOff, Loader2, Cloud } from 'lucide-react';

const OfflineBanner = () => {
  const { t } = useTranslation();
  const { isOnline, isOffline, syncStatus } = useOffline();

  // === حالة 1: متصل ولا يوجد شيء للعرض ===
  // إخفاء الشريط إذا:
  // - متصل بالإنترنت
  // - والمزامنة ليست جارية
  // - و(لا توجد طلبات معلقة أو المزامنة اكتملت)
  if (isOnline && !syncStatus.isSyncing && (syncStatus.pendingOrders === 0 || syncStatus.syncCompleted)) {
    return null;
  }

  // === حالة 2: غير متصل ===
  if (isOffline) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span className="font-medium">
            {t('وضع Offline')} - {t('لا يوجد اتصال بالإنترنت')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4" />
          <span className="text-sm">
            {t('البيانات محفوظة محلياً')}
          </span>
        </div>
      </div>
    );
  }

  // === حالة 3: جاري المزامنة ===
  if (syncStatus.isSyncing) {
    return (
      <div className="bg-green-500 text-white px-4 py-2 flex items-center justify-between text-sm sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          <span className="font-medium">
            {t('تم الاتصال!')} - {t('جاري المزامنة تلقائياً...')}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {syncStatus.syncProgress ? (
            <span>
              {t('جاري رفع')} {syncStatus.syncProgress.current}/{syncStatus.syncProgress.total}
            </span>
          ) : (
            <span>
              {syncStatus.pendingOrders} {t('طلب جاهز للرفع')}
            </span>
          )}
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </div>
    );
  }

  // === حالة 4: متصل مع طلبات معلقة (لم تبدأ المزامنة بعد) ===
  if (isOnline && syncStatus.pendingOrders > 0 && !syncStatus.syncCompleted) {
    return (
      <div className="bg-green-500 text-white px-4 py-2 flex items-center justify-between text-sm sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          <span className="font-medium">
            {t('تم الاتصال!')} - {t('جاري المزامنة تلقائياً...')}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            {syncStatus.pendingOrders} {t('طلب جاهز للرفع')}
          </span>
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </div>
    );
  }

  // لا تعرض شيء
  return null;
};

export default OfflineBanner;
