/**
 * Push Notifications Service
 * خدمة إشعارات Push للتطبيق
 */

import { API_URL } from '../utils/api';

const API = API_URL;

// مفتاح VAPID العام — يُجلب ديناميكياً من الخادم لضمان مطابقته للمفتاح الخاص
let VAPID_PUBLIC_KEY = null;

const fetchVapidKey = async () => {
  if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
  try {
    const res = await fetch(`${API}/push/vapid-public-key`);
    const data = await res.json();
    VAPID_PUBLIC_KEY = data.public_key || data.publicKey || data.vapid_public_key;
    return VAPID_PUBLIC_KEY;
  } catch (e) {
    console.error('Failed to fetch VAPID key:', e);
    return null;
  }
};

/**
 * التحقق من دعم المتصفح للإشعارات
 */
export const isPushSupported = () => {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
};

/**
 * الحصول على حالة إذن الإشعارات
 */
export const getNotificationPermission = () => {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission; // 'granted', 'denied', 'default'
};

/**
 * طلب إذن الإشعارات من المستخدم
 */
export const requestNotificationPermission = async () => {
  if (!isPushSupported()) {
    console.log('Push notifications not supported');
    return false;
  }
  
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

/**
 * تحويل مفتاح VAPID من base64 إلى Uint8Array
 */
const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

/**
 * تسجيل اشتراك Push
 */
export const subscribeToPush = async (token, phone = null, userType = 'admin') => {
  if (!isPushSupported()) {
    console.log('Push notifications not supported');
    return null;
  }

  try {
    // التأكد من وجود إذن
    if (Notification.permission !== 'granted') {
      const granted = await requestNotificationPermission();
      if (!granted) return null;
    }

    const vapidKey = await fetchVapidKey();
    if (!vapidKey) {
      console.error('❌ لا يمكن جلب مفتاح VAPID من الخادم');
      return null;
    }

    // الحصول على Service Worker
    const registration = await navigator.serviceWorker.ready;

    // التحقق من وجود اشتراك سابق
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // إنشاء اشتراك جديد
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
    }

    // إرسال الاشتراك للخادم
    const subscriptionJson = subscription.toJSON();
    const response = await fetch(`${API}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        endpoint: subscriptionJson.endpoint,
        keys: subscriptionJson.keys,
        phone: phone,
        user_type: userType
      })
    });

    if (response.ok) {
      console.log('✅ تم تسجيل اشتراك Push بنجاح');
      return subscription;
    } else {
      console.error('❌ فشل تسجيل اشتراك Push');
      return null;
    }
  } catch (error) {
    console.error('Error subscribing to push:', error);
    return null;
  }
};

/**
 * إلغاء اشتراك Push
 */
export const unsubscribeFromPush = async (token) => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      // إلغاء من الخادم
      await fetch(`${API}/push/unsubscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // إلغاء من المتصفح
      await subscription.unsubscribe();
      console.log('✅ تم إلغاء اشتراك Push');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error unsubscribing from push:', error);
    return false;
  }
};

/**
 * الحصول على اسم الجهاز
 */
const getDeviceName = () => {
  const ua = navigator.userAgent;
  
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  
  return 'Unknown Device';
};

/**
 * عرض إشعار محلي (بدون Push)
 */
export const showLocalNotification = async (title, body, data = {}) => {
  if (!isPushSupported()) return;
  
  if (Notification.permission === 'granted') {
    const registration = await navigator.serviceWorker.ready;
    
    registration.showNotification(title, {
      body,
      icon: '/icons/admin-icon-192.png',
      badge: '/icons/admin-icon-192.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'local-notification',
      data,
      requireInteraction: false
    });
  }
};

/**
 * الحصول على قائمة الأجهزة المشتركة
 */
export const getSubscribedDevices = async (token) => {
  try {
    const response = await fetch(`${API}/push/subscriptions`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      return await response.json();
    }
    return { count: 0, devices: [] };
  } catch (error) {
    console.error('Error fetching subscribed devices:', error);
    return { count: 0, devices: [] };
  }
};

export default {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  showLocalNotification,
  getSubscribedDevices
};
