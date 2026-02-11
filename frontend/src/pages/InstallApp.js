
import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Share2, MoreVertical, Plus, Check, ExternalLink } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
export default function InstallApp() {
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  useEffect(() => {
    // Detect device
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));
    
    // Check if already installed
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
    
    // Listen for install prompt
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
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-gray-800 border-green-500">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">التطبيق مثبت!</h1>
            <p className="text-gray-400 mb-6">التطبيق يعمل الآن بشكل مستقل</p>
            <Button 
              className="w-full bg-green-500 hover:bg-green-600"
              onClick={() => window.location.href = '/driver'}
            >
              فتح التطبيق
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-900 p-4" dir="rtl">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center py-8">
          <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Smartphone className="h-12 w-12 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">تثبيت تطبيق السائق</h1>
          <p className="text-gray-400">Maestro EGP Driver App</p>
        </div>
        {/* Auto Install Button (if available) */}
        {deferredPrompt && (
          <Card className="bg-green-500/20 border-green-500 mb-6">
            <CardContent className="p-4">
              <Button 
                className="w-full bg-green-500 hover:bg-green-600 text-lg py-6"
                onClick={handleInstall}
              >
                <Download className="h-6 w-6 ml-2" />
                تثبيت التطبيق الآن
              </Button>
            </CardContent>
          </Card>
        )}
        {/* iOS Instructions */}
        {isIOS && (
          <Card className="bg-gray-800 border-gray-700 mb-4">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center">
                  🍎
                </div>
                تثبيت على iPhone/iPad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                  1
                </div>
                <div>
                  <p className="text-white font-medium">افتح في Safari</p>
                  <p className="text-gray-400 text-sm">تأكد من استخدام متصفح Safari وليس Chrome</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                  2
                </div>
                <div>
                  <p className="text-white font-medium">اضغط على زر المشاركة</p>
                  <p className="text-gray-400 text-sm flex items-center gap-1">
                    <Share2 className="h-4 w-4" /> في أسفل الشاشة
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                  3
                </div>
                <div>
                  <p className="text-white font-medium">اختر "Add to Home Screen"</p>
                  <p className="text-gray-400 text-sm flex items-center gap-1">
                    <Plus className="h-4 w-4" /> إضافة إلى الشاشة الرئيسية
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                  4
                </div>
                <div>
                  <p className="text-white font-medium">اضغط "Add"</p>
                  <p className="text-gray-400 text-sm">سيظهر التطبيق على شاشتك الرئيسية</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {/* Android Instructions */}
        {isAndroid && (
          <Card className="bg-gray-800 border-gray-700 mb-4">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center">
                  🤖
                </div>
                تثبيت على Android
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                  1
                </div>
                <div>
                  <p className="text-white font-medium">افتح في Chrome</p>
                  <p className="text-gray-400 text-sm">تأكد من استخدام متصفح Chrome</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                  2
                </div>
                <div>
                  <p className="text-white font-medium">اضغط على القائمة</p>
                  <p className="text-gray-400 text-sm flex items-center gap-1">
                    <MoreVertical className="h-4 w-4" /> النقاط الثلاث في الأعلى
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                  3
                </div>
                <div>
                  <p className="text-white font-medium">اختر "تثبيت التطبيق"</p>
                  <p className="text-gray-400 text-sm">أو "Add to Home screen"</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                  4
                </div>
                <div>
                  <p className="text-white font-medium">اضغط "Install"</p>
                  <p className="text-gray-400 text-sm">سيظهر التطبيق في قائمة التطبيقات</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {/* Generic Instructions */}
        {!isIOS && !isAndroid && (
          <Card className="bg-gray-800 border-gray-700 mb-4">
            <CardHeader>
              <CardTitle className="text-white">تعليمات التثبيت</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400">
              <p className="mb-4">يمكنك تثبيت هذا التطبيق من متصفحك:</p>
              <ul className="space-y-2">
                <li>• <strong>Chrome:</strong> اضغط على ⋮ ثم "Install app"</li>
                <li>• <strong>Safari:</strong> اضغط على Share ثم "Add to Home Screen"</li>
                <li>• <strong>Edge:</strong> اضغط على ⋯ ثم "Apps" ثم "Install"</li>
              </ul>
            </CardContent>
          </Card>
        )}
        {/* Open Driver Page */}
        <Button 
          variant="outline"
          className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
          onClick={() => window.location.href = '/driver'}
        >
          <ExternalLink className="h-5 w-5 ml-2" />
          فتح صفحة السائق
        </Button>
        <p className="text-center text-gray-500 text-xs mt-6">
          بعد التثبيت، افتح التطبيق من الشاشة الرئيسية للحصول على تجربة كاملة
        </p>
      </div>
    </div>
  );
}
