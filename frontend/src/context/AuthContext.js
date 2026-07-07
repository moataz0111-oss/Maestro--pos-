import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL, BACKEND_URL } from '../utils/api';
import offlineStorage from '../lib/offlineStorage';
import { getOnlineStatus } from '../hooks/useOnlineStatus';
import { subscribeToPush, isPushSupported, getNotificationPermission } from '../lib/pushService';
import { getDeviceId } from '../utils/deviceId';

const AuthContext = createContext(null);

const API = API_URL;

// إرسال كوكيز الجلسة الآمنة (HttpOnly) مع كل الطلبات — طبقة حماية إضافية
axios.defaults.withCredentials = true;

// ⭐ Interceptor عام: يرفق التوكن من localStorage مع كل طلب وقت الإرسال.
// يمنع سباق التهيئة (مثل 403 على /api/branches عند تحميل الصفحة قبل ضبط axios.defaults).
let __authInterceptorRegistered = false;
if (!__authInterceptorRegistered) {
  axios.interceptors.request.use((config) => {
    const tok = localStorage.getItem('token');
    if (tok && !config.headers?.Authorization) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${tok}`;
    }
    return config;
  });
  // ⭐ Interceptor للاستجابة: إذا حظر الخادم عنوان IP (403 blocked) نعرض صفحة حظر كاملة.
  axios.interceptors.response.use(
    (res) => res,
    (error) => {
      try {
        const d = error?.response?.data;
        const blockedHeader = error?.response?.headers?.['x-blocked'];
        if (error?.response?.status === 403 && blockedHeader === '1' && d && d.blocked === true && !window.__ipBlockedShown) {
          window.__ipBlockedShown = true;
          document.documentElement.setAttribute('dir', 'rtl');
          document.body.innerHTML =
            '<div style="position:fixed;inset:0;z-index:2147483647;background:#0a0e1a;color:#fff;font-family:system-ui,Segoe UI,Tahoma,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center">'
            + '<div style="max-width:520px;padding:40px"><div style="font-size:64px">🚫</div>'
            + '<h1 style="color:#ef4444;margin:16px 0">تم حظر الوصول</h1>'
            + '<p style="color:#94a3b8;line-height:1.8">تم حظر عنوانك بسبب نشاط مشبوه أو محاولة وصول غير مصرّح بها.<br>إذا كنت تعتقد أن هذا خطأ، تواصل مع إدارة النظام.</p>'
            + '<p style="color:#475569;font-size:12px;margin-top:24px">Maestro EGP — نظام محمي</p></div></div>';
        }
      } catch (e) { /* ignore */ }
      return Promise.reject(error);
    }
  );
  __authInterceptorRegistered = true;
}

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
  const [user, setUser] = useState(() => {
    // ====================================================
    // أولاً: التحقق من جلسة Impersonation معلقة (من نافذة Super Admin)
    // ====================================================
    const pendingImpersonation = localStorage.getItem('pending_impersonation');
    if (pendingImpersonation) {
      try {
        const data = JSON.parse(pendingImpersonation);
        // التحقق من أن البيانات حديثة (أقل من دقيقة واحدة)
        if (data.timestamp && Date.now() - data.timestamp < 60 * 1000) {
          console.log('🔐 تم استعادة جلسة Impersonation المعلقة');
          // حفظ البيانات في localStorage العادي
          localStorage.setItem('token', data.token);
          localStorage.setItem('cached_user', JSON.stringify(data.user));
          localStorage.setItem('impersonated', 'true');
          localStorage.setItem('impersonated_tenant', JSON.stringify(data.tenant));
          localStorage.setItem('original_super_admin_token', data.original_super_admin_token);
          // مسح بيانات الفروع القديمة
          localStorage.removeItem('branches');
          sessionStorage.removeItem('branches_loaded');
          // مسح البيانات المعلقة
          localStorage.removeItem('pending_impersonation');
          return data.user;
        } else {
          // البيانات قديمة، نحذفها
          localStorage.removeItem('pending_impersonation');
        }
      } catch (e) {
        console.log('فشل قراءة جلسة Impersonation المعلقة');
        localStorage.removeItem('pending_impersonation');
      }
    }
    
    // ثانياً: محاولة استعادة المستخدم من localStorage
    const cachedUser = localStorage.getItem('cached_user');
    if (cachedUser) {
      try {
        return JSON.parse(cachedUser);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  
  const [token, setToken] = useState(() => {
    // التحقق من جلسة Impersonation معلقة أولاً
    const pendingImpersonation = localStorage.getItem('pending_impersonation');
    if (pendingImpersonation) {
      try {
        const data = JSON.parse(pendingImpersonation);
        if (data.timestamp && Date.now() - data.timestamp < 60 * 1000) {
          return data.token;
        }
      } catch (e) {}
    }
    return localStorage.getItem('token');
  });
  
  const [loading, setLoading] = useState(() => {
    const cachedUser = localStorage.getItem('cached_user');
    const hasToken = localStorage.getItem('token');
    return hasToken && !cachedUser;
  });
  const [currentShift, setCurrentShift] = useState(null);
  const [error, setError] = useState(null);
  const [isOfflineLogin, setIsOfflineLogin] = useState(false);
  const [userFetched, setUserFetched] = useState(false);

  // تهيئة المصادقة مرة واحدة فقط عند التحميل الأولي
  useEffect(() => {
    // إذا كان هناك مستخدم بالفعل، لا نحتاج للتحقق
    if (user && token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setLoading(false);
      setUserFetched(true);
      sessionStorage.setItem('user_verified', 'true');
      return;
    }
    
    // إذا تم التحقق من المستخدم بالفعل في هذه الجلسة، لا نعيد التحقق
    const alreadyVerified = sessionStorage.getItem('user_verified') === 'true';
    
    if (token && !userFetched && !alreadyVerified) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else if (!token) {
      setLoading(false);
    } else {
      // token موجود والتحقق تم - تأكد أن loading = false
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      const userData = response.data;
      setUser(userData);
      setError(null);
      setUserFetched(true);
      
      // حفظ بيانات المستخدم في التخزين المحلي للاستخدام في Electron
      localStorage.setItem('cached_user', JSON.stringify(userData));
      
      // ⛔ لا نفتح وردية عند الدخول — الوردية تُفتح تلقائياً عند حفظ أول طلب (لكل الكاشيرية)
    } catch (error) {
      console.error('Failed to fetch user:', error);
      
      // في حالة خطأ الشبكة، حاول استعادة المستخدم من التخزين المحلي
      if (!error.response) {
        const cachedUser = localStorage.getItem('cached_user');
        if (cachedUser) {
          try {
            const userData = JSON.parse(cachedUser);
            setUser(userData);
            setUserFetched(true);
            setError(null);
            console.log('✅ تم استعادة المستخدم من التخزين المحلي');
            return;
          } catch (e) {
            console.error('Failed to parse cached user:', e);
          }
        }
        setError('فشل في الاتصال بالخادم');
        setUserFetched(true);
      } else if (error.response?.status === 401) {
        // 401 يعني token غير صالح - تسجيل خروج فقط في التحقق الأولي
        const isInitialCheck = !sessionStorage.getItem('user_verified');
        if (isInitialCheck) {
          logout();
        } else {
          // حاول استعادة المستخدم من التخزين المحلي
          const cachedUser = localStorage.getItem('cached_user');
          if (cachedUser) {
            try {
              const userData = JSON.parse(cachedUser);
              setUser(userData);
              console.warn('Token expired but using cached user');
            } catch (e) {
              console.error('Failed to parse cached user:', e);
            }
          }
          setUserFetched(true);
        }
      } else if (error.response?.status === 403) {
        console.warn('Permission denied, but not logging out');
        setUserFetched(true);
      } else {
        setError('فشل في الاتصال بالخادم');
        setUserFetched(true);
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
        const response = await axios.post(`${API}/auth/login`, { email, password, device_id: getDeviceId() });

        // ======== المصادقة الثنائية: جهاز جديد يتطلب رمز تحقق ========
        if (response.data && response.data.requires_2fa) {
          return { success: false, requires2fa: true, data: response.data };
        }

        const { user: userData, token: newToken } = response.data;
        
        // التحقق إذا كان المستخدم هو super_admin - تحويله إلى /super-admin
        if (userData.role === 'super_admin') {
          return { 
            success: false, 
            error: 'يرجى استخدام بوابة مالك النظام للدخول',
            redirectToSuperAdmin: true
          };
        }
        
        await persistSession(userData, newToken, password);
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

  // حفظ الجلسة بعد نجاح الدخول (يُستخدم للدخول العادي وإتمام المصادقة الثنائية)
  const persistSession = async (userData, newToken, password) => {
    localStorage.removeItem('branches');
    localStorage.removeItem('selectedBranchId');
    sessionStorage.removeItem('branches_loaded');

    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    setIsOfflineLogin(false);

    localStorage.setItem('cached_user', JSON.stringify(userData));

    if (password) {
      try {
        const passwordHash = await hashPassword(password);
        await offlineStorage.saveUserForOfflineLogin(userData, passwordHash);
      } catch (e) { /* ignore */ }
    }
    try { await offlineStorage.initializeOfflineData(newToken); } catch (e) { /* ignore */ }
    cacheAppAssets();

    if (isPushSupported() && getNotificationPermission() !== 'denied') {
      setTimeout(() => {
        subscribeToPush(newToken).catch(() => {});
      }, 2000);
    }
    window.dispatchEvent(new CustomEvent('userLoggedIn'));

    // ⛔ لا نفتح وردية عند الدخول — تُفتح تلقائياً عند حفظ أول طلب في نقطة البيع
  };

  // إتمام المصادقة الثنائية للموظف/المالك برمز التحقق
  const completeTwoFactor = async (verificationId, code, password) => {
    try {
      const response = await axios.post(`${API}/auth/login/verify-2fa`, {
        verification_id: verificationId,
        code,
      });
      const { user: userData, token: newToken } = response.data;
      if (userData.role === 'super_admin') {
        return { success: true, user: userData, token: newToken, isSuperAdmin: true };
      }
      await persistSession(userData, newToken, password);
      return { success: true, user: userData };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'رمز التحقق غير صحيح' };
    }
  };

  // إعادة إرسال رمز التحقق
  const resendTwoFactor = async (verificationId) => {
    try {
      const response = await axios.post(`${API}/auth/2fa/resend`, { verification_id: verificationId });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'تعذّر إعادة الإرسال' };
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
        localStorage.setItem('cached_user', JSON.stringify(userData)); // للتوافق مع التحقق من الصلاحيات
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
    // تسجيل حدث الخروج في سجل المراقبة
    const currentToken = localStorage.getItem('token');
    if (currentToken) {
      axios.post(`${API}/auth/logout`, null, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => {}); // لا نتوقف إذا فشل التسجيل
    }
    
    // حذف جميع البيانات المخزنة (بما فيها بيانات الفروع لضمان عزل البيانات)
    localStorage.removeItem('token');
    localStorage.removeItem('offline_user');
    localStorage.removeItem('cached_user');
    localStorage.removeItem('currentShift');
    localStorage.removeItem('selectedBranchId');
    localStorage.removeItem('branches');
    sessionStorage.clear();
    
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setCurrentShift(null);
    setIsOfflineLogin(false);
    
    // التوجيه لصفحة تسجيل الدخول
    window.location.href = '/login';
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
      completeTwoFactor,
      resendTwoFactor,
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
