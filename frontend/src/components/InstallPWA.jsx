/**
 * مكون تثبيت PWA
 * يظهر زر لتثبيت التطبيق على سطح المكتب أو الهاتف
 */

import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Download, X, Smartphone, Monitor } from 'lucide-react';
import { t } from '../utils/translations';

const InstallPWA = () => {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // التحقق إذا كان التطبيق مثبتاً بالفعل
    const checkInstalled = () => {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true);
        return true;
      }
      if (window.navigator.standalone === true) {
        setIsInstalled(true);
        return true;
      }
      return false;
    };

    // التحقق من iOS
    const checkIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };

    setIsIOS(checkIOS());
    
    if (checkInstalled()) {
      return;
    }

    // التحقق إذا تم رفض التثبيت سابقاً
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    const dismissedTime = dismissed ? parseInt(dismissed) : 0;
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    if (dismissedTime > oneDayAgo) {
      return;
    }

    // الاستماع لحدث beforeinstallprompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // إظهار تعليمات iOS بعد 5 ثواني
    if (checkIOS() && !checkInstalled()) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 5000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      if (isIOS) {
        setShowIOSInstructions(true);
      }
      return;
    }

    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setShowBanner(false);
    }
    
    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSInstructions(false);
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());
  };

  if (isInstalled || !showBanner) {
    return null;
  }

  // تعليمات iOS
  if (showIOSInstructions) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border">
          <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <Button variant="ghost" size="icon" onClick={handleDismiss}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          <h3 className="text-lg font-bold mb-2">{t('تثبيت التطبيق على iPhone/iPad')}</h3>
          
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
              <p>{t('اضغط على زر المشاركة')} <span className="inline-block w-5 h-5 bg-muted rounded">⬆️</span> {t('في أسفل الشاشة')}</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
              <p>{t('مرر للأسفل واختر')} "<strong>{t('إضافة إلى الشاشة الرئيسية')}</strong>"</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
              <p>{t('اضغط "إضافة" في الزاوية العلوية')}</p>
            </div>
          </div>
          
          <Button className="w-full mt-4" onClick={handleDismiss}>
            {t('فهمت')}
          </Button>
        </div>
      </div>
    );
  }

  // بانر التثبيت العادي
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-card rounded-2xl p-4 shadow-2xl border border-border z-50 animate-in slide-in-from-bottom-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/60 rounded-xl flex items-center justify-center shrink-0">
          <Monitor className="w-6 h-6 text-primary-foreground" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground mb-1">{t('تثبيت التطبيق')}</h3>
          <p className="text-sm text-muted-foreground mb-3">
            {t('ثبّت التطبيق للوصول السريع والعمل بدون إنترنت')}
          </p>
          
          <div className="flex gap-2">
            <Button size="sm" onClick={handleInstall} className="gap-2">
              <Download className="w-4 h-4" />
              {t('تثبيت')}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              {t('لاحقاً')}
            </Button>
          </div>
        </div>
        
        <Button variant="ghost" size="icon" className="shrink-0 -mt-1 -mr-1" onClick={handleDismiss}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default InstallPWA;
