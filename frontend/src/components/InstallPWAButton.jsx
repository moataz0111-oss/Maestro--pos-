import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Download, Share } from 'lucide-react';
import { toast } from 'sonner';

// زر "تثبيت التطبيق" — يظهر تلقائياً عندما يكون التطبيق قابلاً للتثبيت (Android/Chrome/Desktop)
// وعلى iOS يعرض تعليمات الإضافة للشاشة الرئيسية.
export const InstallPWAButton = ({ className = '' }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // إذا كان مُثبّتاً ويعمل بملء الشاشة، لا نعرض الزر
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone) return;

    // كشف iOS (لا يدعم beforeinstallprompt)
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
    if (ios) {
      setIsIOS(true);
      setVisible(true);
    }

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
      toast.success('تم تثبيت التطبيق بنجاح ✓');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      toast('للتثبيت على iPhone/iPad: اضغط زر المشاركة ⬆️ ثم "إضافة إلى الشاشة الرئيسية"', { duration: 6000, icon: '📲' });
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleInstall}
      data-testid="install-pwa-btn"
      className={`gap-1.5 border-primary/40 text-primary hover:bg-primary/10 ${className}`}
    >
      {isIOS ? <Share className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      <span className="hidden sm:inline">تثبيت التطبيق</span>
      <span className="sm:hidden">تثبيت</span>
    </Button>
  );
};

export default InstallPWAButton;
