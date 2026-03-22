import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL, BACKEND_URL } from '../utils/api';
import offlineStorage from '../lib/offlineStorage';
import { getOnlineStatus } from '../hooks/useOnlineStatus';
import { subscribeToPush, isPushSupported, getNotificationPermission } from '../lib/pushService';

const AuthContext = createContext(null);

const API = API_URL;

// دالة لتخزين جميع ملفات التطبيق للعمل Offline
const cacheAppAssets = () => {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    // جمع جميع ملفات JS و CSS من الصفحة
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);
    const images = Array.from(document.querySelectorAll('img[src]')).map(i => i.src);
    
    const assets = [...scripts, ...styles, ...images].filter(url => {
      // تجاهل الروابط الخارجية
      return url.startsWith(window.location.origin) && !url.includes('/api/');
    });
    
    // إرسال للـ Service Worker لتخزينها
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_ASSETS',
      assets: assets
    });
    
    console.log('📦 طلب تخزين', assets.length, 'ملف للعمل Offline');
  }
};

// دالة لتشفير كلمة المرور بسيطة (للتخزين المحلي فقط)
const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'maestro_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState(null);
  const [error, setError] = useState(null);
  const [isOfflineLogin, setIsOfflineLogin] = useState(false);
  const [userFetched, setUserFetched] = useState(false);

  useEffect(() => {
    if (token && !userFetched) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else if (!token) {
      setLoading(false);
    }
  }, [token, userFetched]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
      setError(null);
      
      // فتح وردية تلقائياً للكاشير أو المدير
      if (['cashier', 'manager', 'admin'].includes(response.data.role)) {
        await autoOpenShift();
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      // لا نقوم بـ logout إلا إذا كان الخطأ 401 وليس من الـ network
      // وأيضاً فقط إذا كنا في صفحة تسجيل الدخول أو التحقق الأولي
      if (error.response?.status === 401) {
        // تحقق إذا كان هذا تحقق أولي أو إعادة تحقق
        const isInitialCheck = !sessionStorage.getItem('user_verified');
        if (isInitialCheck) {
          logout();
        } else {
          // إذا كان المستخدم موجود بالفعل، لا تسجل خروجه
          console.warn('Token might be expired, but user is active - not logging out');
        }
      } else if (error.response?.status === 403) {
        // 403 يعني صلاحيات - لا تسجل خروج
        console.warn('Permission denied, but not logging out');
      } else {
        setError('فشل في الاتصال بالخادم');
      }
    } finally {
      setLoading(false);
      sessionStorage.setItem('user_verified', 'true');
    }
  };

  // فتح وردية تلقائياً
  const autoOpenShift = async () => {
    try {
      const response = await axios.post(`${API}/shifts/auto-open`);
      setCurrentShift(response.data.shift);
      
      if (!response.data.was_existing) {
        console.log('✅ تم فتح وردية جديدة تلقائياً');
      }
    } catch (error) {
      console.error('Failed to auto-open shift:', error);
    }
  };

  const login = async (email, password) => {
    const isOnline = getOnlineStatus();
    
    // محاولة تسجيل الدخول Online أولاً
    if (isOnline) {
      try {
        const response = await axios.post(`${API}/auth/login`, { email, password });
        const { user: userData, token: newToken } = response.data;
        
        // التحقق إذا كان المستخدم هو super_admin - تحويله إلى /super-admin
        if (userData.role === 'super_admin') {
          return { 
            success: false, 
            error: 'يرجى استخدام بوابة مالك النظام للدخول',
            redirectToSuperAdmin: true
          };
        }
        
        localStorage.setItem('token', newToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        setToken(newToken);
        setUser(userData);
        setIsOfflineLogin(false);
        
        // حفظ بيانات المستخدم للدخول Offline
        const passwordHash = await hashPassword(password);
        await offlineStorage.saveUserForOfflineLogin(userData, passwordHash);
        
        // تهيئة البيانات المحلية
        await offlineStorage.initializeOfflineData(newToken);
        
        // تخزين جميع ملفات التطبيق للعمل Offline
        cacheAppAssets();
        
        // تسجيل اشتراك Push للإشعارات (إذا كان المتصفح يدعمه)
        if (isPushSupported() && getNotificationPermission() !== 'denied') {
          setTimeout(() => {
            subscribeToPush(newToken).catch(err => {
              console.log('Push subscription skipped:', err.message);
            });
          }, 2000);
        }
        
        // إرسال حدث تسجيل الدخول لتحديث إعدادات العملة
        window.dispatchEvent(new CustomEvent('userLoggedIn'));
        
        // فتح وردية تلقائياً للكاشير أو المدير
        if (['cashier', 'manager', 'admin'].includes(userData.role)) {
          setTimeout(async () => {
            await autoOpenShift();
          }, 500);
        }
        
        return { success: true, user: userData };
      } catch (error) {
        // إذا فشل الاتصال، جرب Offline Login
        if (!error.response) {
          console.log('⚠️ فشل الاتصال - محاولة تسجيل الدخول Offline...');
          return await offlineLogin(email, password);
        }
        return { 
          success: false, 
          error: error.response?.data?.detail || 'فشل تسجيل الدخول' 
        };
      }
    } else {
      // تسجيل دخول Offline
      return await offlineLogin(email, password);
    }
  };

  // تسجيل دخول Offline
  const offlineLogin = async (email, password) => {
    try {
      const passwordHash = await hashPassword(password);
      const result = await offlineStorage.verifyOfflineUser(email, passwordHash);
      
      if (result.success) {
        const userData = result.user;
        
        // إنشاء token محلي مؤقت
        const offlineToken = `offline_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        
        localStorage.setItem('token', offlineToken);
        localStorage.setItem('offline_user', JSON.stringify(userData));
        setToken(offlineToken);
        setUser(userData);
        setIsOfflineLogin(true);
        
        console.log('✅ تم تسجيل الدخول Offline بنجاح');
        
        return { success: true, user: userData, isOffline: true };
      } else {
        return { 
          success: false, 
          error: result.error || 'يجب تسجيل الدخول مرة واحدة Online أولاً'
        };
      }
    } catch (error) {
      console.error('❌ خطأ في تسجيل الدخول Offline:', error);
      return { 
        success: false, 
        error: 'يجب تسجيل الدخول مرة واحدة Online أولاً'
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await axios.post(`${API}/auth/register`, userData);
      const { user: newUser, token: newToken } = response.data;
      
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      setToken(newToken);
      setUser(newUser);
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'فشل التسجيل' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('offline_user');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setCurrentShift(null);
    setIsOfflineLogin(false);
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    // المدير (admin) لديه جميع الصلاحيات
    if (user.role === 'admin') return true;
    // SuperAdmin لديه جميع الصلاحيات
    if (user.role === 'super_admin') return true;
    // إذا كانت صلاحية "all" موجودة
    if (user.permissions?.includes('all')) return true;
    // التحقق من الصلاحية المحددة
    return user.permissions?.includes(permission);
  };

  const hasRole = (roles) => {
    if (!user) return false;
    if (typeof roles === 'string') return user.role === roles;
    return roles.includes(user.role);
  };

  // تحديث الوردية الحالية
  const refreshShift = async () => {
    try {
      const response = await axios.get(`${API}/shifts/current`);
      setCurrentShift(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to refresh shift:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      register,
      logout,
      hasPermission,
      hasRole,
      isAuthenticated: !!user,
      isOfflineLogin,
      currentShift,
      refreshShift,
      autoOpenShift
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
