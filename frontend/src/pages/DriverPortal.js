import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { formatPrice } from '../utils/currency';
import { playDriverNotification, playDeliveryComplete } from '../utils/sound';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Truck,
  Phone,
  MapPin,
  Clock,
  Check,
  Package,
  RefreshCw,
  Navigation,
  AlertCircle,
  CheckCircle,
  User,
  DollarSign,
  Download,
  Locate,
  MapPinOff,
  Wifi,
  WifiOff,
  Share2,
  LogIn,
  Lock,
  Mail,
  LogOut,
  Volume2,
  VolumeX,
  Bell
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DriverPortal() {
  // حالة تسجيل الدخول
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  
  const [driver, setDriver] = useState(null);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ unpaid_total: 0, paid_today: 0, pending_orders: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Sound notification states
  const [soundEnabled, setSoundEnabled] = useState(true);
  const previousOrdersRef = useRef([]);
  
  // GPS Tracking states
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPWAInstallable, setIsPWAInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // التحقق من وجود جلسة محفوظة - استخدام مفاتيح خاصة ببوابة السائق
  useEffect(() => {
    const savedDriver = localStorage.getItem('maestro_driver_session');
    if (savedDriver) {
      try {
        const driverData = JSON.parse(savedDriver);
        setDriver(driverData);
        setIsLoggedIn(true);
      } catch (e) {
        localStorage.removeItem('maestro_driver_session');
      }
    }
    setLoading(false);
  }, []);

  // Register Service Worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration);
        })
        .catch((error) => {
          console.log('SW registration failed:', error);
        });
    }

    // Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsPWAInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Online/Offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // تسجيل الدخول
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    
    try {
      // تسجيل الدخول للحصول على بيانات المستخدم
      const loginRes = await axios.post(`${API}/auth/login`, {
        email: loginForm.email,
        password: loginForm.password
      });
      
      const userData = loginRes.data.user;
      
      // التحقق من أن المستخدم سائق توصيل
      if (userData.role !== 'delivery') {
        setLoginError('هذا الحساب ليس حساب سائق توصيل');
        setLoginLoading(false);
        return;
      }
      
      // جلب بيانات السائق المرتبط بالمستخدم
      const driverRes = await axios.get(`${API}/drivers/by-user/${userData.id}`, {
        headers: { Authorization: `Bearer ${loginRes.data.token}` }
      });
      
      const driverData = {
        ...driverRes.data,
        token: loginRes.data.token,
        user_id: userData.id
      };
      
      // حفظ الجلسة - استخدام مفاتيح خاصة ببوابة السائق
      localStorage.setItem('maestro_driver_session', JSON.stringify(driverData));
      localStorage.setItem('maestro_driver_token', loginRes.data.token);
      
      setDriver(driverData);
      setIsLoggedIn(true);
      toast.success('تم تسجيل الدخول بنجاح!');
      
    } catch (err) {
      console.error('Login error:', err);
      if (err.response?.status === 401) {
        setLoginError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      } else if (err.response?.status === 404) {
        setLoginError('لم يتم ربط حسابك بسائق. تواصل مع الإدارة');
      } else {
        setLoginError(err.response?.data?.detail || 'فشل تسجيل الدخول');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  // تسجيل الخروج
  const handleLogout = () => {
    localStorage.removeItem('maestro_driver_session');
    localStorage.removeItem('maestro_driver_token');
    setDriver(null);
    setIsLoggedIn(false);
    setOrders([]);
    setStats({ unpaid_total: 0, paid_today: 0, pending_orders: 0 });
    toast.success('تم تسجيل الخروج');
  };

  // GPS Location tracking
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('جهازك لا يدعم GPS');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ latitude, longitude });
        setLocationEnabled(true);
        setLocationError(null);

        // Send location to server
        if (driver?.id) {
          try {
            await axios.put(`${API}/drivers/portal/${driver.id}/location`, {
              latitude,
              longitude
            });
          } catch (err) {
            console.error('Failed to update location:', err);
          }
        }
      },
      (error) => {
        console.error('GPS error:', error);
        setLocationError(
          error.code === 1 ? 'يرجى السماح بالوصول للموقع' :
          error.code === 2 ? 'الموقع غير متاح' :
          'خطأ في تحديد الموقع'
        );
        setLocationEnabled(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [driver?.id]);

  // Start tracking when driver is loaded
  useEffect(() => {
    if (driver && isLoggedIn) {
      const cleanup = startLocationTracking();
      
      // Update location every 30 seconds
      const locationInterval = setInterval(() => {
        if (currentLocation && driver?.id) {
          axios.put(`${API}/drivers/portal/${driver.id}/location`, currentLocation)
            .catch(console.error);
        }
      }, 30000);

      return () => {
        if (cleanup) cleanup();
        clearInterval(locationInterval);
      };
    }
  }, [driver, isLoggedIn, startLocationTracking, currentLocation]);

  // Fetch driver data
  useEffect(() => {
    if (driver?.id && isLoggedIn) {
      fetchDriverData();
      const interval = setInterval(fetchDriverData, 15000);
      return () => clearInterval(interval);
    }
  }, [driver?.id, isLoggedIn]);

  // التحقق من الطلبات الجديدة وتشغيل الإشعار الصوتي
  const checkForNewOrders = useCallback((newOrders) => {
    if (!soundEnabled) return;
    
    const activeOrders = newOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    const previousActiveOrders = previousOrdersRef.current.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    
    // البحث عن طلبات جديدة
    const newOrderIds = activeOrders.map(o => o.id);
    const prevOrderIds = previousActiveOrders.map(o => o.id);
    
    const brandNewOrders = newOrderIds.filter(id => !prevOrderIds.includes(id));
    
    if (brandNewOrders.length > 0 && previousOrdersRef.current.length > 0) {
      // تشغيل صوت الإشعار
      playDriverNotification();
      
      // إظهار إشعار Toast
      toast.success(
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-green-500 animate-bounce" />
          <span>طلب جديد! ({brandNewOrders.length})</span>
        </div>,
        { duration: 5000 }
      );
      
      // محاولة إظهار إشعار النظام
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🛵 طلب توصيل جديد!', {
          body: `لديك ${brandNewOrders.length} طلب جديد للتوصيل`,
          icon: '/favicon.ico',
          vibrate: [200, 100, 200]
        });
      }
    }
    
    // تحديث المرجع للطلبات السابقة
    previousOrdersRef.current = newOrders;
  }, [soundEnabled]);

  const fetchDriverData = async () => {
    if (!driver?.id) return;
    
    try {
      const res = await axios.get(`${API}/drivers/portal/${driver.id}`);
      const newOrders = res.data.orders || [];
      
      // التحقق من الطلبات الجديدة
      checkForNewOrders(newOrders);
      
      setOrders(newOrders);
      setStats(res.data.stats || { unpaid_total: 0, paid_today: 0, pending_orders: 0 });
      setError(null);
    } catch (err) {
      console.error('Error fetching driver data:', err);
      if (err.response?.status === 404) {
        setError('السائق غير موجود');
        handleLogout();
      }
    }
  };

  // طلب إذن الإشعارات عند تسجيل الدخول
  useEffect(() => {
    if (isLoggedIn && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isLoggedIn]);

  const markAsDelivered = async (orderId) => {
    try {
      await axios.put(`${API}/drivers/portal/${driver.id}/complete?order_id=${orderId}`);
      
      // تشغيل صوت إتمام التوصيل
      if (soundEnabled) {
        playDeliveryComplete();
      }
      
      toast.success('تم تسليم الطلب بنجاح!');
      fetchDriverData();
    } catch (err) {
      toast.error('فشل في تحديث الحالة');
    }
  };

  const openNavigation = (address) => {
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(address)}`;
    
    const useWaze = window.confirm('فتح في Google Maps?\n\nاضغط إلغاء لفتح Waze');
    window.open(useWaze ? googleMapsUrl : wazeUrl, '_blank');
  };

  const callCustomer = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  const installPWA = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      toast.success('تم تثبيت التطبيق!');
      setIsPWAInstallable(false);
    }
    setDeferredPrompt(null);
  };

  // صفحة تسجيل الدخول
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4" dir="rtl">
        <Toaster position="top-center" richColors />
        
        <Card className="w-full max-w-sm bg-gray-800 border-gray-700">
          <CardContent className="p-6">
            {/* Logo */}
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Truck className="h-10 w-10 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-white">بوابة السائق</h1>
              <p className="text-gray-400 text-sm mt-1">Maestro EGP</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label className="text-gray-300">البريد الإلكتروني</Label>
                <div className="relative mt-1">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <Input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    className="pr-10 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                    placeholder="example@maestroegp.com"
                    required
                    dir="ltr"
                  />
                </div>
              </div>
              
              <div>
                <Label className="text-gray-300">كلمة المرور</Label>
                <div className="relative mt-1">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <Input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="pr-10 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {loginError && (
                <div className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {loginError}
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full bg-green-500 hover:bg-green-600 text-white"
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="h-5 w-5 ml-2" />
                    تسجيل الدخول
                  </>
                )}
              </Button>
            </form>

            {/* PWA Install */}
            {isPWAInstallable && (
              <div className="mt-6 pt-4 border-t border-gray-700">
                <Button 
                  variant="outline" 
                  className="w-full border-green-500 text-green-400 hover:bg-green-500/10"
                  onClick={installPWA}
                >
                  <Download className="h-5 w-5 ml-2" />
                  تثبيت التطبيق
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <p className="text-red-400 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  const activeOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  const completedOrders = orders.filter(o => o.status === 'delivered');

  // تبديل حالة الصوت
  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
    toast.info(soundEnabled ? 'تم إيقاف الإشعارات الصوتية' : 'تم تفعيل الإشعارات الصوتية');
  };

  // اختبار الصوت
  const testSound = () => {
    playDriverNotification();
    toast.info('جاري تشغيل صوت الإشعار...');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white" dir="rtl">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center relative">
              <Truck className="h-6 w-6 text-green-500" />
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
            <div>
              <h1 className="font-bold text-lg">{driver?.name}</h1>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{driver?.phone}</span>
                {locationEnabled ? (
                  <span className="flex items-center gap-1 text-green-400">
                    <Locate className="h-3 w-3" />
                    GPS
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400">
                    <MapPinOff className="h-3 w-3" />
                    GPS
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Sound Toggle Button */}
            <Button 
              variant="ghost" 
              size="icon"
              onClick={toggleSound}
              className={soundEnabled ? "text-green-400" : "text-gray-500"}
              title={soundEnabled ? "إيقاف الصوت" : "تفعيل الصوت"}
              data-testid="sound-toggle-btn"
            >
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>
            
            {isPWAInstallable && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={installPWA}
                className="text-green-400"
                title="تثبيت التطبيق"
              >
                <Download className="h-5 w-5" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon"
              onClick={fetchDriverData}
              className="text-gray-400"
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleLogout}
              className="text-red-400"
              title="تسجيل الخروج"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* GPS Error Banner */}
        {locationError && (
          <div className="mt-3 bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {locationError}
            <Button 
              size="sm" 
              variant="ghost"
              onClick={startLocationTracking}
              className="mr-auto text-red-300"
            >
              إعادة المحاولة
            </Button>
          </div>
        )}
        
        {/* Offline Banner */}
        {!isOnline && (
          <div className="mt-3 bg-yellow-500/20 text-yellow-400 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <WifiOff className="h-4 w-4" />
            غير متصل بالإنترنت
          </div>
        )}
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 p-4">
        <div className="bg-red-500/10 rounded-xl p-3 text-center">
          <DollarSign className="h-5 w-5 text-red-500 mx-auto mb-1" />
          <p className="text-xs text-gray-400">غير مدفوع</p>
          <p className="text-sm font-bold text-red-500">{formatPrice(stats.unpaid_total)}</p>
        </div>
        <div className="bg-green-500/10 rounded-xl p-3 text-center">
          <CheckCircle className="h-5 w-5 text-green-500 mx-auto mb-1" />
          <p className="text-xs text-gray-400">مدفوع اليوم</p>
          <p className="text-sm font-bold text-green-500">{formatPrice(stats.paid_today)}</p>
        </div>
        <div className="bg-blue-500/10 rounded-xl p-3 text-center">
          <Package className="h-5 w-5 text-blue-500 mx-auto mb-1" />
          <p className="text-xs text-gray-400">طلبات نشطة</p>
          <p className="text-sm font-bold text-blue-500">{activeOrders.length}</p>
        </div>
      </div>

      {/* Active Orders */}
      <div className="px-4 pb-4">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <Package className="h-5 w-5 text-orange-500" />
          الطلبات النشطة ({activeOrders.length})
        </h2>
        
        {activeOrders.length === 0 ? (
          <div className="bg-gray-800/50 rounded-xl p-8 text-center">
            <Truck className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">لا توجد طلبات نشطة</p>
            <p className="text-xs text-gray-500 mt-1">ستظهر الطلبات الجديدة هنا</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeOrders.map(order => (
              <Card 
                key={order.id} 
                className="bg-gray-800 border-gray-700 overflow-hidden"
              >
                <CardContent className="p-4">
                  {/* Order Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                          #{order.order_number}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          order.status === 'ready' ? 'bg-green-500/20 text-green-400' :
                          order.status === 'preparing' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {order.status === 'ready' ? 'جاهز للتوصيل' :
                           order.status === 'preparing' ? 'قيد التحضير' : 'معلق'}
                        </span>
                      </div>
                      <p className="text-lg font-bold text-green-400 mt-2">
                        {formatPrice(order.total)}
                      </p>
                    </div>
                    <div className="text-left text-xs text-gray-400">
                      <Clock className="h-3 w-3 inline ml-1" />
                      {new Date(order.created_at).toLocaleTimeString('ar-IQ', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-gray-300">
                      <User className="h-4 w-4 text-gray-500" />
                      <span>{order.customer_name || 'زبون'}</span>
                    </div>
                    {order.customer_phone && (
                      <button 
                        onClick={() => callCustomer(order.customer_phone)}
                        className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                      >
                        <Phone className="h-4 w-4" />
                        <span>{order.customer_phone}</span>
                      </button>
                    )}
                    {order.delivery_address && (
                      <button 
                        onClick={() => openNavigation(order.delivery_address)}
                        className="flex items-start gap-2 text-green-400 hover:text-green-300"
                      >
                        <MapPin className="h-4 w-4 mt-0.5" />
                        <span className="text-sm text-right">{order.delivery_address}</span>
                      </button>
                    )}
                  </div>

                  {/* Items */}
                  <div className="bg-gray-900/50 rounded-lg p-3 mb-4">
                    <p className="text-xs text-gray-500 mb-2">الأصناف:</p>
                    <div className="space-y-1">
                      {order.items?.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-300">
                            {item.product_name} x{item.quantity}
                          </span>
                          <span className="text-gray-400">{formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="border-blue-500 text-blue-400 hover:bg-blue-500/10"
                      onClick={() => order.delivery_address && openNavigation(order.delivery_address)}
                    >
                      <Navigation className="h-4 w-4 ml-2" />
                      فتح الخريطة
                    </Button>
                    <Button
                      className="bg-green-500 hover:bg-green-600 text-white"
                      onClick={() => markAsDelivered(order.id)}
                    >
                      <Check className="h-4 w-4 ml-2" />
                      تم التسليم
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed Orders Today */}
      {completedOrders.length > 0 && (
        <div className="px-4 pb-8">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2 text-gray-400">
            <CheckCircle className="h-5 w-5 text-green-500" />
            تم التسليم ({completedOrders.length})
          </h2>
          <div className="space-y-2">
            {completedOrders.slice(0, 5).map(order => (
              <div 
                key={order.id}
                className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <span className="font-medium">#{order.order_number}</span>
                    <span className="text-gray-500 text-sm mr-2">{order.customer_name}</span>
                  </div>
                </div>
                <span className={`text-sm font-bold ${
                  order.driver_payment_status === 'paid' ? 'text-green-500' : 'text-red-500'
                }`}>
                  {formatPrice(order.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PWA Install Banner */}
      {isPWAInstallable && (
        <div className="fixed bottom-4 left-4 right-4 bg-green-600 rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Download className="h-6 w-6" />
              <div>
                <p className="font-bold">تثبيت التطبيق</p>
                <p className="text-xs text-green-200">للوصول السريع</p>
              </div>
            </div>
            <Button onClick={installPWA} className="bg-white text-green-600 hover:bg-green-50">
              تثبيت
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
