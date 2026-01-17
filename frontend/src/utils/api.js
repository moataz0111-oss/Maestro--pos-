// ملف مركزي لتحديد رابط الـ API
// يعمل تلقائياً مع بيئة المعاينة والإنتاج

const getBackendUrl = () => {
  // في بيئة الإنتاج (emergent.host)، استخدم نفس الرابط الحالي
  if (typeof window !== 'undefined' && window.location.hostname.includes('.emergent.host')) {
    return window.location.origin;
  }
  // في بيئة المعاينة أو التطوير
  if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL;
  }
  // Fallback
  return typeof window !== 'undefined' ? window.location.origin : '';
};

// تصدير كـ singleton
export const BACKEND_URL = getBackendUrl();
export const API_URL = `${BACKEND_URL}/api`;

export default API_URL;
