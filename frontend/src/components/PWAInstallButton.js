import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Download, Check, Smartphone, Monitor, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export default function PWAInstallButton({ variant = 'default', className = '' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState(() => {
    // تحديد نوع الجهاز مباشرة
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
    if (/android/.test(userAgent)) return 'android';
    if (/windows/.test(userAgent)) return 'windows';
    if (/mac/.test(userAgent)) return 'mac';
    return 'desktop';
  });

  useEffect(() => {
    // التحقق من أن التطبيق مثبت بالفعل
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // استمع لحدث beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    // استمع لحدث التثبيت
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // استخدم الطريقة الرسمية للتثبيت
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      
      setDeferredPrompt(null);
      setIsInstallable(false);
    } else if (platform === 'ios') {
      // iOS يحتاج تعليمات يدوية
      setShowInstructions(true);
    } else {
      // أظهر تعليمات التثبيت العامة
      setShowInstructions(true);
    }
  };

  // إذا كان التطبيق مثبت بالفعل
  if (isInstalled) {
    return (
      <Button 
        variant="outline" 
        disabled 
        className={`gap-2 ${className}`}
        data-testid="pwa-installed-btn"
      >
        <Check className="h-4 w-4 text-green-500" />
        <span>التطبيق مثبت</span>
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={handleInstallClick}
        variant={variant}
        className={`gap-2 ${className}`}
        data-testid="pwa-install-btn"
      >
        {platform === 'ios' || platform === 'android' ? (
          <Smartphone className="h-4 w-4" />
        ) : (
          <Monitor className="h-4 w-4" />
        )}
        <Download className="h-4 w-4" />
        <span>تثبيت التطبيق</span>
      </Button>

      {/* تعليمات التثبيت */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              تثبيت التطبيق
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {platform === 'ios' ? (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  لتثبيت التطبيق على جهازك iPhone أو iPad:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500 font-bold shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-foreground">اضغط على زر المشاركة</p>
                      <p className="text-muted-foreground text-xs">
                        الزر الموجود أسفل الشاشة (مربع مع سهم للأعلى)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500 font-bold shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-foreground">اختر "إضافة إلى الشاشة الرئيسية"</p>
                      <p className="text-muted-foreground text-xs">
                        Add to Home Screen
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500 font-bold shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-foreground">اضغط "إضافة"</p>
                      <p className="text-muted-foreground text-xs">
                        سيظهر التطبيق على شاشتك الرئيسية
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : platform === 'android' ? (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  لتثبيت التطبيق على جهازك Android:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 font-bold shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-foreground">اضغط على القائمة (⋮)</p>
                      <p className="text-muted-foreground text-xs">
                        النقاط الثلاث في أعلى المتصفح
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 font-bold shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-foreground">اختر "تثبيت التطبيق"</p>
                      <p className="text-muted-foreground text-xs">
                        أو "إضافة إلى الشاشة الرئيسية"
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 font-bold shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-foreground">أكد التثبيت</p>
                      <p className="text-muted-foreground text-xs">
                        سيظهر التطبيق على شاشتك الرئيسية
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  لتثبيت التطبيق على جهاز الكمبيوتر:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-500 font-bold shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Chrome / Edge</p>
                      <p className="text-muted-foreground text-xs">
                        ابحث عن أيقونة التثبيت في شريط العنوان (⊕)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-500 font-bold shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-foreground">أو من القائمة</p>
                      <p className="text-muted-foreground text-xs">
                        ⋮ → "تثبيت Maestro EGP..."
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-500 font-bold shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-foreground">أكد التثبيت</p>
                      <p className="text-muted-foreground text-xs">
                        سيُفتح التطبيق في نافذة مستقلة
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                بعد التثبيت، يمكنك الوصول للتطبيق بدون متصفح
              </p>
            </div>
          </div>

          <Button
            onClick={() => setShowInstructions(false)}
            className="w-full mt-2"
            variant="outline"
          >
            <X className="h-4 w-4 ml-2" />
            إغلاق
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
