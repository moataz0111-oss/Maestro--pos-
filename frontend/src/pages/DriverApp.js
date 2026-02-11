import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../utils/api';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { formatPrice } from '../utils/currency';
import { useTranslation } from '../hooks/useTranslation';
import {
  Truck,
  MapPin,
  Phone,
  Navigation,
  Clock,
  CheckCircle,
  Package,
  User,
  RefreshCw,
  Loader2,
  LogIn,
  LogOut,
  Play,
  Pause,
  Target,
  Volume2,
  VolumeX,
  Download,
  DollarSign,
  Map,
  Wifi,
  WifiOff,
  History,
  TrendingUp
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API = API_URL;

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom driver icon
const driverIcon = new L.DivIcon({
  className: 'driver-marker',
  html: `<div style="background: linear-gradient(135deg, #3b82f6, #22c55e); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h15a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Z"/><path d="M3 13h12"/><path d="M18 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// مكون تحديث الخريطة
const MapUpdater = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
};

export default function DriverApp() {
  const { t, isRTL } = useTranslation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [driverPhone, setDriverPhone] = useState('');
  const [driverPin, setDriverPin] = useState('');
  const [driver, setDriver] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [watchId, setWatchId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  // حالات إضافية
  const [stats, setStats] = useState({ unpaid_total: 0, paid_today: 0, pending_orders: 0, completed_today: 0 });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPWAInstallable, setIsPWAInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [activeTab, setActiveTab] = useState('orders');
  const previousOrdersRef = useRef([]);
  const audioRef = useRef(null);

  // تشغيل صوت الإشعار
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleF4GZ9Dx7JZdDyGD0+mrb0QWSH7Z7oeZPgBwsevIe1IRKn3o7sJfKQBZo+bKmC0Gd7v29pRKADuf89aXPA1rt//ynUsLVqP24K5ZARyZ/+e1bhQShd/syo87AU6S4uirQw4zft/nvUkUPHXa5LxaITNw2fC8VR42eeDvxV0dIGrh7cleHCt43em1ZCETctbv05gyM2bc9MdcLyhv4/XBSyUnc+PuxEwxKnLc7r1ONC1u3em2TToqa9zmtkg6Nnne4K5JQkRr2d+nRk5Mb9XaoUpXUHPOxpNLYVp0xLqLS3FofLSriVJ+dX6nn4RefYSJkJCQhoaDfHt6eXp/goOCgYKFhomLiouNkZOVl5qcnp+hoqSkpKOjpKWnqautrq6usLGztLW2uLq7vL2+v8DCw8TFxsbHyMnKy8vLy8vLy8zNzs/Q0dLT1NXW19jZ2tvc3d7f4OHi4+Tk5eXl5ubn5+fo6Onp6err6+zs7Ozt7e7u7+/w8PHx8vLz8/T09fX19vb29/f39/f39/f39/f39/b29vX19fT09PPz8vLx8fDw7+/u7u3t7Ozr6+rq6eno6Ofn5uXl5OTj4+Li4eDg39/e3t3d3Nzb29ra2dnY2NfX1tbV1dXU1NPT0tLS0dHR0NDQz8/Pzs7Ozs7Nzc3NzczMzMzMzMzMzMzMzMzMzc3Nzc3Ozs7Ozs7Pz8/P0NDQ0NDR0dHS0tLS09PT1NTU1dXV1tbW19fX2NjY2dnZ2tra29vb3Nzc3d3d3t7e39/f4ODg4eHh4uLi4+Pj5OTk5eXl5ubm5+fn6Ojo6enp6urq6+vr7Ozs7e3t7u7u7+/v8PDw8fHx8vLy8/Pz9PT09fX19vb29/f3+Pj4+fn5+vr6+/v7/Pz8/f39/v7+');
      }
      audioRef.current.play();
    } catch (e) {
      console.log('Error playing sound');
    }
  };

  // التحقق من طلبات جديدة
  const checkForNewOrders = useCallback((newOrders) => {
    const activeOrders = newOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    const previousActiveOrders = previousOrdersRef.current.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    
    const newOrderIds = activeOrders.map(o => o.id);
    const prevOrderIds = previousActiveOrders.map(o => o.id);
    
    const brandNewOrders = newOrderIds.filter(id => !prevOrderIds.includes(id));
    
    if (brandNewOrders.length > 0 && previousOrdersRef.current.length > 0) {
      playNotificationSound();
      toast.success(`${t('لديك')} ${brandNewOrders.length} ${t('طلب جديد!')}`, { duration: 5000 });
    }
    
    previousOrdersRef.current = newOrders;
  }, [soundEnabled]);

  // Register Service Worker for PWA and check install
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.log);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsPWAInstallable(true);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // تثبيت التطبيق
  const installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast.success(t('تم تثبيت التطبيق'));
    }
    setDeferredPrompt(null);
    setIsPWAInstallable(false);
  };

  // تسجيل دخول السائق برقم الهاتف والرمز السري
  const loginDriver = async () => {
    if (!driverPhone || driverPhone.length < 10) {
      toast.error(t('يرجى إدخال رقم هاتف صحيح'));
      return;
    }
    
    if (!driverPin || driverPin.length < 4) {
      toast.error(t('يرجى إدخال الرمز السري'));
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/driver/login?phone=${driverPhone}&pin=${driverPin}`);
      
      if (res.data.driver) {
        const driverData = res.data.driver;
        setDriver(driverData);
        setIsLoggedIn(true);
        localStorage.setItem('driver_app_session', JSON.stringify(driverData));
        localStorage.setItem('driver_phone', driverPhone);
        toast.success(`${t('مرحباً')} ${driverData.name}!`);
        fetchOrders(driverData.id);
      }
    } catch (error) {
      const message = error.response?.data?.detail || t('فشل في تسجيل الدخول');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // جلب الطلبات المسندة للسائق
  const fetchOrders = async (driverId) => {
    try {
      const res = await axios.get(`${API}/driver/orders`, {
        params: { driver_id: driverId || driver?.id }
      });
      const newOrders = res.data || [];
      setOrders(newOrders);
      checkForNewOrders(newOrders);
      
      // حساب الإحصائيات
      const activeOrders = newOrders.filter(o => !['delivered', 'cancelled'].includes(o.status));
      const completedToday = newOrders.filter(o => o.status === 'delivered');
      const unpaid = newOrders.filter(o => o.status === 'delivered' && o.payment_method === 'cash' && !o.payment_collected);
      
      setStats({
        pending_orders: activeOrders.length,
        completed_today: completedToday.length,
        unpaid_total: unpaid.reduce((sum, o) => sum + (o.total || 0), 0),
        paid_today: completedToday.filter(o => o.payment_collected).reduce((sum, o) => sum + (o.total || 0), 0)
      });
    } catch (error) {
      console.log('Error fetching orders:', error);
    }
  };

  // تحديث موقع السائق
  const updateLocation = useCallback(async (position) => {
    const { latitude, longitude } = position.coords;
    setCurrentLocation([latitude, longitude]);

    if (driver) {
      try {
        await axios.post(`${API}/driver/update-location?driver_id=${driver.id}`, {
          latitude,
          longitude
        });
      } catch (error) {
        console.log('Error updating location:', error);
      }
    }
  }, [driver]);

  // بدء تتبع الموقع
  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error(t('المتصفح لا يدعم تحديد الموقع'));
      return;
    }

    const id = navigator.geolocation.watchPosition(
      updateLocation,
      (error) => {
        console.log('Location error:', error);
        toast.error(t('فشل في تحديد الموقع'));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );

    setWatchId(id);
    setIsTracking(true);
    toast.success(t('تم بدء تتبع الموقع'));
  };

  // إيقاف تتبع الموقع
  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsTracking(false);
    toast.info(t('تم إيقاف تتبع الموقع'));
  };

  // تسليم الطلب
  const deliverOrder = async (orderId) => {
    try {
      await axios.put(`${API}/driver/orders/${orderId}/status`, null, {
        params: { status: 'delivered', driver_id: driver.id }
      });
      playNotificationSound();
      toast.success(t('تم تسليم الطلب بنجاح!'));
      fetchOrders();
      setSelectedOrder(null);
    } catch (error) {
      const message = error.response?.data?.detail || t('فشل في تحديث حالة الطلب');
      toast.error(message);
    }
  };

  // بدء التوصيل (في الطريق)
  const startDelivery = async (orderId) => {
    try {
      await axios.put(`${API}/driver/orders/${orderId}/status`, null, {
        params: { status: 'out_for_delivery', driver_id: driver.id }
      });
      toast.success(t('تم تحديث الحالة - أنت الآن في الطريق'));
      fetchOrders();
    } catch (error) {
      const message = error.response?.data?.detail || t('فشل في تحديث حالة الطلب');
      toast.error(message);
    }
  };

  // فتح الملاحة
  const openNavigation = (address, lat, lng) => {
    let url;
    if (lat && lng) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    } else if (address) {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    } else {
      toast.error(t('لا يوجد عنوان متاح'));
      return;
    }
    window.open(url, '_blank');
  };

  // الاتصال بالعميل
  const callCustomer = (phone) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  // تسجيل الخروج
  const logout = () => {
    stopTracking();
    setIsLoggedIn(false);
    setDriver(null);
    setOrders([]);
    localStorage.removeItem('driver_app_session');
    localStorage.removeItem('driver_phone');
    toast.info(t('تم تسجيل الخروج'));
  };

  // التحقق من تسجيل الدخول السابق
  useEffect(() => {
    const savedSession = localStorage.getItem('driver_app_session');
    if (savedSession) {
      try {
        const driverData = JSON.parse(savedSession);
        setDriver(driverData);
        setIsLoggedIn(true);
        fetchOrders(driverData.id);
      } catch (e) {
        localStorage.removeItem('driver_app_session');
      }
    }
    
    const savedPhone = localStorage.getItem('driver_phone');
    if (savedPhone) {
      setDriverPhone(savedPhone);
    }
  }, []);

  // تحديث الطلبات كل 15 ثانية
  useEffect(() => {
    if (isLoggedIn && driver) {
      const interval = setInterval(() => fetchOrders(), 15000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, driver]);

  // فلترة الطلبات
  const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'delivered');

  const getStatusBadge = (status) => {
    const statusMap = {
      'assigned': { label: t('مُسند'), class: 'bg-blue-500' },
      'ready': { label: t('جاهز'), class: 'bg-yellow-500' },
      'out_for_delivery': { label: t('في الطريق'), class: 'bg-orange-500' },
      'delivered': { label: t('تم التسليم'), class: 'bg-green-500' },
      'cancelled': { label: t('ملغي'), class: 'bg-red-500' }
    };
    return statusMap[status] || { label: status, class: 'bg-gray-500' };
  };

  // صفحة تسجيل الدخول
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Toaster position="top-center" richColors />
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center shadow-lg">
              <Truck className="h-10 w-10 text-white" />
            </div>
            <CardTitle className="text-2xl">{t('تطبيق السائق')}</CardTitle>
            <p className="text-gray-500">{t('سجل دخولك برقم هاتفك والرمز السري')}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* حالة الاتصال */}
            <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              <span className="text-sm">{isOnline ? t('متصل بالإنترنت') : t('غير متصل')}</span>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t('رقم الهاتف')}</label>
              <Input
                type="tel"
                placeholder="07xxxxxxxxx"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                className="text-lg text-center"
                data-testid="driver-phone-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('الرمز السري')} (PIN)</label>
              <Input
                type="password"
                placeholder="****"
                maxLength={6}
                value={driverPin}
                onChange={(e) => setDriverPin(e.target.value)}
                className="text-lg text-center tracking-widest"
                data-testid="driver-pin-input"
                onKeyDown={(e) => e.key === 'Enter' && loginDriver()}
              />
            </div>
            <Button
              onClick={loginDriver}
              disabled={loading || !isOnline}
              className="w-full h-12 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600"
              data-testid="driver-login-btn"
            >
              {loading ? (
                <>
                  <Loader2 className={`h-5 w-5 animate-spin ${isRTL ? 'ml-2' : 'mr-2'}`} />
                  {t('جاري التحقق...')}
                </>
              ) : (
                <>
                  <LogIn className={`h-5 w-5 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                  {t('تسجيل الدخول')}
                </>
              )}
            </Button>

            {/* زر تثبيت التطبيق */}
            {isPWAInstallable && (
              <Button
                onClick={installPWA}
                variant="outline"
                className="w-full h-12 border-2 border-blue-500 text-blue-600"
              >
                <Download className={`h-5 w-5 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                {t('تثبيت التطبيق على جهازك')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // الصفحة الرئيسية للسائق
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-blue-500 to-green-500 text-white shadow-lg">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-bold text-lg">{driver?.name}</h1>
                <p className="text-sm text-white/80">{driver?.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* حالة الاتصال */}
              <div className={`p-2 rounded-full ${isOnline ? 'bg-green-400/30' : 'bg-red-400/30'}`}>
                {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              </div>
              {/* زر الصوت */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="text-white hover:bg-white/20"
              >
                {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </Button>
              {/* زر التحديث */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchOrders()}
                className="text-white hover:bg-white/20"
              >
                <RefreshCw className="h-5 w-5" />
              </Button>
              {/* زر الخروج */}
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                className="text-white hover:bg-white/20"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* إحصائيات سريعة */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Package className="h-4 w-4" />
              <span className="text-sm">طلبات نشطة</span>
            </div>
            <p className="text-2xl font-bold">{stats.pending_orders}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">مكتملة اليوم</span>
            </div>
            <p className="text-2xl font-bold">{stats.completed_today}</p>
          </div>
        </div>

        {/* حالة التتبع */}
        <Card className={`border-2 ${isTracking ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isTracking ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  <Navigation className={`h-6 w-6 ${isTracking ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <p className="font-bold">{isTracking ? 'التتبع نشط' : 'التتبع متوقف'}</p>
                  <p className="text-sm text-gray-500">
                    {isTracking ? 'يتم إرسال موقعك للعملاء' : 'اضغط للبدء'}
                  </p>
                </div>
              </div>
              <Button
                onClick={isTracking ? stopTracking : startTracking}
                variant={isTracking ? 'destructive' : 'default'}
                className={isTracking ? '' : 'bg-green-500 hover:bg-green-600'}
              >
                {isTracking ? (
                  <>
                    <Pause className="h-4 w-4 ml-2" />
                    إيقاف
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 ml-2" />
                    بدء
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* التبويبات */}
        <div className="flex gap-2 bg-white rounded-xl p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === 'orders' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Package className="h-4 w-4 inline ml-1" />
            الطلبات ({activeOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === 'map' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Map className="h-4 w-4 inline ml-1" />
            الخريطة
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <History className="h-4 w-4 inline ml-1" />
            السجل
          </button>
        </div>

        {/* محتوى التبويب */}
        {activeTab === 'orders' && (
          <div className="space-y-3">
            {activeOrders.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">لا توجد طلبات نشطة حالياً</p>
                <Button onClick={() => fetchOrders()} variant="outline" className="mt-4">
                  <RefreshCw className="h-4 w-4 ml-2" />
                  تحديث
                </Button>
              </div>
            ) : (
              activeOrders.map(order => (
                <Card key={order.id} className="overflow-hidden shadow-md">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-lg">#{order.order_number || order.id?.slice(-6)}</p>
                        <p className="text-sm text-gray-500">{order.customer_name}</p>
                      </div>
                      <Badge className={getStatusBadge(order.status).class}>
                        {getStatusBadge(order.status).label}
                      </Badge>
                    </div>
                    
                    {/* العنوان */}
                    <div className="flex items-start gap-2 mb-3 text-sm bg-gray-50 p-2 rounded-lg">
                      <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <span>{order.delivery_address || order.address || 'لا يوجد عنوان'}</span>
                    </div>

                    {/* السعر والدفع */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        <span className="font-bold text-green-600">{formatPrice(order.total)}</span>
                      </div>
                      <Badge variant="outline">
                        {order.payment_method === 'cash' ? 'نقدي' : 'إلكتروني'}
                      </Badge>
                    </div>

                    {/* الأزرار */}
                    <div className="flex gap-2">
                      {/* زر الاتصال */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => callCustomer(order.customer_phone || order.phone)}
                        className="flex-1"
                      >
                        <Phone className="h-4 w-4 ml-1" />
                        اتصال
                      </Button>
                      
                      {/* زر الملاحة */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openNavigation(order.delivery_address || order.address, order.delivery_lat, order.delivery_lng)}
                        className="flex-1"
                      >
                        <Navigation className="h-4 w-4 ml-1" />
                        الملاحة
                      </Button>

                      {/* زر الحالة */}
                      {order.status === 'assigned' || order.status === 'ready' ? (
                        <Button
                          size="sm"
                          onClick={() => startDelivery(order.id)}
                          className="flex-1 bg-orange-500 hover:bg-orange-600"
                        >
                          <Truck className="h-4 w-4 ml-1" />
                          في الطريق
                        </Button>
                      ) : order.status === 'out_for_delivery' ? (
                        <Button
                          size="sm"
                          onClick={() => deliverOrder(order.id)}
                          className="flex-1 bg-green-500 hover:bg-green-600"
                        >
                          <CheckCircle className="h-4 w-4 ml-1" />
                          تم التسليم
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === 'map' && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {currentLocation ? (
                <div className="h-[400px]">
                  <MapContainer
                    center={currentLocation}
                    zoom={15}
                    className="h-full w-full"
                    style={{ height: '400px' }}
                  >
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                      attribution='&copy; OpenStreetMap'
                    />
                    <MapUpdater center={currentLocation} />
                    
                    {/* علامة موقع السائق */}
                    <Marker position={currentLocation} icon={driverIcon}>
                      <Popup>
                        <div className="text-center">
                          <strong>موقعك الحالي</strong>
                        </div>
                      </Popup>
                    </Marker>
                    
                    {/* علامات الطلبات */}
                    {activeOrders.filter(o => o.delivery_lat && o.delivery_lng).map(order => (
                      <Marker 
                        key={order.id} 
                        position={[order.delivery_lat, order.delivery_lng]}
                      >
                        <Popup>
                          <div className="text-center">
                            <strong>#{order.order_number || order.id?.slice(-6)}</strong>
                            <br />
                            {order.customer_name}
                            <br />
                            <span className="text-green-600 font-bold">{formatPrice(order.total)}</span>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              ) : (
                <div className="h-[400px] flex items-center justify-center bg-gray-100">
                  <div className="text-center">
                    <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500">قم بتفعيل التتبع لعرض الخريطة</p>
                    <Button onClick={startTracking} className="mt-4">
                      <Target className="h-4 w-4 ml-2" />
                      تفعيل الموقع
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            {completedOrders.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">لا توجد طلبات مكتملة اليوم</p>
              </div>
            ) : (
              completedOrders.map(order => (
                <Card key={order.id} className="bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold">#{order.order_number || order.id?.slice(-6)}</p>
                        <p className="text-sm text-gray-500">{order.customer_name}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-green-600">{formatPrice(order.total)}</p>
                        <Badge className="bg-green-500">تم التسليم</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* زر تثبيت التطبيق */}
        {isPWAInstallable && (
          <Card className="bg-gradient-to-r from-blue-500 to-green-500 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Download className="h-8 w-8" />
                  <div>
                    <p className="font-bold">ثبت التطبيق</p>
                    <p className="text-sm text-white/80">للوصول السريع والإشعارات</p>
                  </div>
                </div>
                <Button onClick={installPWA} variant="secondary" size="sm">
                  تثبيت
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
