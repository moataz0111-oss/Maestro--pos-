import React, { useEffect, useState } from 'react';
import { Download, Share, Plus, ChevronDown, Store } from 'lucide-react';

const CustomerInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // تغيير manifest
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.href = '/manifest-customer.json?v=' + Date.now();
    }

    // تحديث meta tags
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = '#f97316';
    
    document.title = 'تثبيت تطبيق قائمة الطعام';

    // تحديث apple touch icons
    const appleTouchIcons = document.querySelectorAll('link[rel="apple-touch-icon"]');
    appleTouchIcons.forEach(icon => {
      icon.href = '/icons/customer-icon-192.png';
    });

    // التحقق من iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // التحقق من standalone mode
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);

    // معالجة beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  if (isStandalone) {
    // إذا كان التطبيق مثبت، انتقل للقائمة
    window.location.href = '/menu/default';
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex flex-col items-center justify-center p-6 text-white" dir="rtl">
      {/* الشعار */}
      <div className="w-24 h-24 rounded-3xl bg-black flex items-center justify-center shadow-2xl mb-6">
        <span className="text-orange-500 text-5xl font-bold">M</span>
      </div>

      <h1 className="text-3xl font-bold mb-2">{t('قائمة الطعام')}</h1>
      <p className="text-orange-100 mb-8 text-center">{t('اطلب طعامك المفضل بسهولة')}</p>

      {/* تعليمات التثبيت */}
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 w-full max-w-sm">
        {isIOS ? (
          // تعليمات iOS
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center mb-4">{t('خطوات التثبيت على iOS')}</h2>
            
            <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold">1</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">{t('اضغط على زر المشاركة')}</p>
                <Share className="h-5 w-5 mt-1 text-orange-200" />
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold">2</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">{t('اختر "إضافة للشاشة الرئيسية"')}</p>
                <div className="flex items-center gap-1 mt-1 text-orange-200 text-sm">
                  <Plus className="h-4 w-4" />
                  Add to Home Screen
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold">3</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">{t('اضغط "إضافة"')}</p>
              </div>
            </div>
          </div>
        ) : deferredPrompt ? (
          // زر التثبيت لـ Android/Chrome
          <div className="text-center">
            <button
              onClick={handleInstall}
              className="w-full bg-white text-orange-600 font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:bg-orange-50 transition-colors"
            >
              <Download className="h-6 w-6" />
              تثبيت التطبيق
            </button>
            <p className="text-orange-100 text-sm mt-3">{t('التطبيق مجاني ولا يحتاج مساحة كبيرة')}</p>
          </div>
        ) : (
          // تعليمات عامة
          <div className="text-center">
            <p className="mb-4">{t('افتح هذه الصفحة من متصفح Chrome أو Safari')}</p>
            <button
              onClick={() => window.location.href = '/menu/default'}
              className="w-full bg-white text-orange-600 font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2"
            >
              <Store className="h-6 w-6" />
              تصفح القائمة
            </button>
          </div>
        )}
      </div>

      {/* رابط تصفح القائمة */}
      <button
        onClick={() => window.location.href = '/menu/default'}
        className="mt-6 text-orange-100 hover:text-white flex items-center gap-1 underline"
      >
        أو تصفح القائمة الآن
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
};

export default CustomerInstall;
