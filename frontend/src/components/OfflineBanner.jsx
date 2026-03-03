/**
 * Offline Banner Component
 * شريط يعرض حالة الاتصال والمزامنة
 */

import React from 'react';
import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff, CheckCircle } from 'lucide-react';
import { useOffline } from '../context/OfflineContext';
import { useTranslation } from '../hooks/useTranslation';
import { Button } from '../components/ui/button';

const OfflineBanner = () => {
  const { t } = useTranslation();
  const { isOnline, isOffline, syncStatus, startSync } = useOffline();

  // لا تعرض شيء إذا كان متصل ولا توجد طلبات معلقة
  if (isOnline && syncStatus.pendingOrders === 0 && !syncStatus.isSyncing) {
    return null;
  }

  // وضع Offline
  if (isOffline) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 animate-pulse" />
          <span className="font-medium">
            {t('وضع Offline')} - {t('لا يوجد اتصال بالإنترنت')}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {syncStatus.pendingOrders > 0 && (
            <div className="flex items-center gap-2 bg-amber-600 px-3 py-1 rounded-full">
              <CloudOff className="h-4 w-4" />
              <span>
                {syncStatus.pendingOrders} {t('طلب في الانتظار')}
              </span>
            </div>
          )}
          <span className="text-amber-100 text-xs">
            {t('الطلبات تُحفظ محلياً وسترفع عند عودة الاتصال')}
          </span>
        </div>
      </div>
    );
  }

  // جاري المزامنة
  if (syncStatus.isSyncing) {
    return (
      <div className="bg-blue-500 text-white px-4 py-2 flex items-center justify-between text-sm sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="font-medium">
            {t('جاري المزامنة...')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4" />
          <span>
            {t('رفع')} {syncStatus.pendingOrders} {t('طلب')}
          </span>
        </div>
      </div>
    );
  }

  // متصل مع طلبات معلقة
  if (isOnline && syncStatus.pendingOrders > 0) {
    return (
      <div className="bg-green-500 text-white px-4 py-2 flex items-center justify-between text-sm sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          <span className="font-medium">
            {t('تم الاتصال!')}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            {syncStatus.pendingOrders} {t('طلب جاهز للرفع')}
          </span>
          <Button 
            size="sm" 
            variant="secondary"
            onClick={startSync}
            className="h-7 bg-white text-green-600 hover:bg-green-50"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            {t('مزامنة الآن')}
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

/**
 * شريط مصغر للحالة (للعرض في أسفل الشاشة)
 */
export const OfflineStatusBadge = () => {
  const { t } = useTranslation();
  const { isOnline, syncStatus } = useOffline();

  return (
    <div className={`
      fixed bottom-4 right-4 px-3 py-2 rounded-full shadow-lg text-sm font-medium
      flex items-center gap-2 z-40 transition-all duration-300
      ${isOnline ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}
    `}>
      {isOnline ? (
        <>
          <CheckCircle className="h-4 w-4" />
          <span>{t('متصل')}</span>
          {syncStatus.pendingOrders > 0 && (
            <span className="bg-white text-green-600 px-2 py-0.5 rounded-full text-xs">
              {syncStatus.pendingOrders}
            </span>
          )}
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 animate-pulse" />
          <span>{t('غير متصل')}</span>
          {syncStatus.pendingOrders > 0 && (
            <span className="bg-white text-amber-600 px-2 py-0.5 rounded-full text-xs">
              {syncStatus.pendingOrders}
            </span>
          )}
        </>
      )}
    </div>
  );
};

export default OfflineBanner;
