import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// تسجيل Service Worker للعمل Offline
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw-offline.js', {
        scope: '/',
        updateViaCache: 'none' // دائماً يتحقق من التحديثات بدون cache
      });
      console.log('✅ Service Worker registered successfully:', registration.scope);
      
      // التحقق من التحديثات كل 5 دقائق
      setInterval(() => {
        registration.update();
      }, 5 * 60 * 1000);
      
      // تحديث تلقائي عند وجود نسخة جديدة
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 New version available, reloading...');
              // إعادة تحميل الصفحة تلقائياً عند وجود تحديث
              window.location.reload();
            }
          });
        }
      });
      
      // إعادة تحميل عند تغيير الـ controller (SW جديد أصبح نشط)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 Service Worker controller changed, reloading...');
        window.location.reload();
      });
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
    }
  }
};

// Hide initial loader when React starts
const hideLoader = () => {
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      loader.style.display = 'none';
    }, 300);
  }
};

// Global error handler
window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global error:', message, source, lineno, colno, error);
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.innerHTML = `
      <div style="text-align: center; color: white; padding: 20px;">
        <h1 style="color: #ef4444; margin-bottom: 16px;">حدث خطأ</h1>
        <p style="color: #94a3b8; margin-bottom: 24px;">يرجى تحديث الصفحة أو مسح البيانات</p>
        <button onclick="window.location.reload()" style="
          background: #3b82f6;
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          margin: 8px;
        ">تحديث الصفحة</button>
        <button onclick="localStorage.clear(); sessionStorage.clear(); window.location.reload();" style="
          background: #6b7280;
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          margin: 8px;
        ">مسح البيانات</button>
      </div>
    `;
  }
  return false;
};

const root = ReactDOM.createRoot(document.getElementById("root"));

try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  hideLoader();
  
  // تسجيل Service Worker بعد تحميل التطبيق
  registerServiceWorker();
} catch (error) {
  console.error('Failed to render app:', error);
}
