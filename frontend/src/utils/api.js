import axios from 'axios';

// ملف مركزي لتحديد رابط الـ API
// يعمل تلقائياً مع بيئة المعاينة والإنتاج والتطوير

const getBackendUrl = () => {
  // التأكد من وجود window (للتوافق مع SSR)
  if (typeof window === 'undefined') {
    return process.env.REACT_APP_BACKEND_URL || '';
  }
  
  const hostname = window.location.hostname;
  
  // في بيئة التطوير المحلية (localhost)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // استخدم REACT_APP_BACKEND_URL إذا كان متاحاً، وإلا استخدم localhost
    return process.env.REACT_APP_BACKEND_URL || window.location.origin;
  }
  
  // أي نطاق آخر (إنتاج/معاينة/نطاق مخصص): استخدم نفس الأصل الحالي
  return window.location.origin;
};

// تصدير كـ singleton
export const BACKEND_URL = getBackendUrl();
export const API_URL = `${BACKEND_URL}/api`;

// دالة للحصول على URL (للاستخدام في أماكن تحتاج دالة)
export const getApiUrl = () => API_URL;
export const getBackendUrlFn = () => BACKEND_URL;

// ==================== API CACHE ====================
// نظام كاش بسيط لتسريع الاستجابة
const apiCache = new Map();
const CACHE_DURATION = 30000; // 30 ثانية

export const cachedFetch = async (url, options = {}) => {
  const cacheKey = `${url}-${JSON.stringify(options)}`;
  const cached = apiCache.get(cacheKey);
  
  // إذا كان هناك كاش صالح، أعده مباشرة
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  // اجلب البيانات الجديدة
  const response = await fetch(url, options);
  const data = await response.json();
  
  // خزّن في الكاش
  apiCache.set(cacheKey, { data, timestamp: Date.now() });
  
  return data;
};

// مسح الكاش عند تحديث البيانات
export const clearCache = (urlPattern) => {
  if (urlPattern) {
    for (const key of apiCache.keys()) {
      if (key.includes(urlPattern)) {
        apiCache.delete(key);
      }
    }
  } else {
    apiCache.clear();
  }
};

// ==================== ENTERPRISE PROJECT SCOPE INTERCEPTOR ====================
// عند تفعيل وضع المؤسسة واختيار مشروع محدد، يُضاف تلقائياً X-Project-Id لكل طلب
// + project_id لطلبات GET/DELETE. الخلفية تستخدمه لعزل القراءة/الكتابة بالمشروع.
if (typeof window !== 'undefined' && !window.__PROJECT_INTERCEPTOR_INSTALLED__) {
  window.__PROJECT_INTERCEPTOR_INSTALLED__ = true;
  axios.interceptors.request.use((config) => {
    try {
      const pid = localStorage.getItem('selectedProjectId');
      if (pid && pid !== 'all' && pid !== 'null' && pid !== 'undefined') {
        config.headers = config.headers || {};
        // إذا لم يمرَّر header يدوياً، اضفه
        if (!config.headers['X-Project-Id'] && !config.headers['x-project-id']) {
          config.headers['X-Project-Id'] = pid;
        }
        const method = (config.method || 'get').toLowerCase();
        if (method === 'get' || method === 'delete') {
          const currentParams = config.params || {};
          if (currentParams.project_id === undefined) {
            config.params = { ...currentParams, project_id: pid };
          }
        }
      }
    } catch (e) { /* noop */ }
    return config;
  });
}

export default API_URL;
