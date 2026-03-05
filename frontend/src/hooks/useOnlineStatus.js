/**
 * Online Status Hook
 * للكشف عن حالة الاتصال بالإنترنت
 */

import { useState, useEffect, useCallback } from 'react';

// حالة الاتصال العامة
let globalOnlineStatus = navigator.onLine;
let listeners = [];

// إضافة مستمع
const addListener = (callback) => {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
};

// إشعار جميع المستمعين
const notifyListeners = (isOnline) => {
  globalOnlineStatus = isOnline;
  listeners.forEach(callback => callback(isOnline));
};

// الاستماع للأحداث العامة
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => notifyListeners(true));
  window.addEventListener('offline', () => notifyListeners(false));
}

/**
 * Hook لكشف حالة الاتصال
 */
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(globalOnlineStatus);
  const [lastOnline, setLastOnline] = useState(new Date());
  const [wasOffline, setWasOffline] = useState(false);
  const [previousStatus, setPreviousStatus] = useState(globalOnlineStatus);

  useEffect(() => {
    const handleStatusChange = (online) => {
      // إذا كان offline سابقاً وأصبح online الآن
      if (!previousStatus && online) {
        setWasOffline(true);
        // إعادة تعيين wasOffline بعد 10 ثواني (لإعطاء وقت كافي للمزامنة)
        setTimeout(() => setWasOffline(false), 10000);
      }
      
      setPreviousStatus(online);
      setIsOnline(online);
      
      if (online) {
        setLastOnline(new Date());
      }
    };

    const unsubscribe = addListener(handleStatusChange);
    
    // التحقق الدوري من الاتصال
    const checkConnection = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch('/api/health', {
          method: 'HEAD',
          cache: 'no-cache',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok && !isOnline) {
          notifyListeners(true);
        }
      } catch (error) {
        if (isOnline && !navigator.onLine) {
          notifyListeners(false);
        }
      }
    };

    // التحقق كل 30 ثانية
    const interval = setInterval(checkConnection, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [isOnline, previousStatus]);

  return { isOnline, lastOnline, wasOffline };
};

/**
 * الحصول على حالة الاتصال الحالية
 */
export const getOnlineStatus = () => globalOnlineStatus;

/**
 * التحقق من الاتصال يدوياً
 */
export const checkConnection = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-cache',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const isOnline = response.ok;
    notifyListeners(isOnline);
    return isOnline;
  } catch (error) {
    notifyListeners(false);
    return false;
  }
};

export default useOnlineStatus;
