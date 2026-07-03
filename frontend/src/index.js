import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// تسجيل Service Worker للعمل Offline - بدون إعادة تحميل تلقائية
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    // ⭐ لا نسجّل عامل خدمة المشرف (sw-offline) على صفحات الزبائن/السائق/التتبّع.
    // هذا العامل كان يُسجَّل على نطاق "/" فيتحكّم بصفحة القائمة ويخزّن index.html ومانيفست المشرف،
    // مما يسبب فتح التطبيق المثبّت على صفحة دخول الموظفين (وأيقونة سوداء) على iOS.
    const path = window.location.pathname;
    if (path.indexOf('/menu') === 0 || path.indexOf('/track') === 0 || path.indexOf('/driver-app') === 0) {
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register('/sw-offline.js', {
        scope: '/',
        updateViaCache: 'none'
      });
      console.log('Service Worker registered:', registration.scope);

      // إعادة التحميل تحدث فقط إذا وافق المستخدم صراحةً على التحديث (لا حلقات تلقائية)
      let userAcceptedUpdate = false;
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        if (userAcceptedUpdate) {
          refreshing = true;
          window.location.reload();
        } else {
          console.log('[SW] Controller changed - reload blocked intentionally');
        }
      });

      // شريط «نسخة جديدة متوفرة» — تحديث بضغطة واحدة (آمن، بطلب المستخدم)
      const showUpdateBanner = (worker) => {
        if (!worker || document.getElementById('sw-update-banner')) return;
        const bar = document.createElement('div');
        bar.id = 'sw-update-banner';
        bar.setAttribute('dir', 'rtl');
        bar.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0f766e;color:#fff;padding:12px 16px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;gap:14px;align-items:center;font-family:inherit;font-size:14px;max-width:92vw;';
        const txt = document.createElement('span');
        txt.textContent = 'يتوفر تحديث جديد للنظام';
        const btn = document.createElement('button');
        btn.textContent = 'تحديث الآن';
        btn.style.cssText = 'background:#fff;color:#0f766e;border:none;padding:8px 18px;border-radius:9px;font-weight:700;cursor:pointer;white-space:nowrap;';
        btn.onclick = () => {
          userAcceptedUpdate = true;
          btn.textContent = 'جارٍ التحديث…';
          btn.disabled = true;
          worker.postMessage({ type: 'SKIP_WAITING' });
        };
        bar.appendChild(txt);
        bar.appendChild(btn);
        document.body.appendChild(bar);
      };

      if (registration.waiting) showUpdateBanner(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const nw = registration.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(nw);
          }
        });
      });
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
};

// سجل تشخيصي لمعرفة سبب أي إعادة تحميل (debug aid)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', function(e) {
    try {
      const reason = new Error('beforeunload stack');
      console.warn('[Reload Debug] Page is about to unload. Stack:', reason.stack);
    } catch {}
  });
}

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
  // ⭐ إخفاء initial-splash الجديد
  const splash = document.getElementById('initial-splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => { splash.remove(); }, 450);
  }
};

// Global error handler
window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global error:', message, source, lineno, colno, error);
  const loader = document.getElementById('initial-loader') || document.getElementById('initial-splash');
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
  // ⭐ لا نُخفي شاشة الشعار إلا بعد أن يرسم React المحتوى فعلياً (منع الوميض الأبيض عند إعادة التحميل)
  requestAnimationFrame(() => requestAnimationFrame(() => hideLoader()));
  // أمان إضافي: إخفاء بعد ثانيتين كحد أقصى مهما حدث
  setTimeout(hideLoader, 2000);

  // تسجيل Service Worker بعد تحميل التطبيق
  registerServiceWorker();
} catch (error) {
  console.error('Failed to render app:', error);
}
