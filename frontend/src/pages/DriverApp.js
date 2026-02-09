import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../utils/api';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
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
  Target
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

  // تسجيل دخول السائق برقم الهاتف والرمز السري
  const loginDriver = async () => {
    if (!driverPhone || driverPhone.length < 10) {
      toast.error('يرجى إدخال رقم هاتف صحيح');
      return;
    }
    
    if (!driverPin || driverPin.length < 4) {
      toast.error('يرجى إدخال الرمز السري (4 أرقام على الأقل)');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/driver/login?phone=${driverPhone}&pin=${driverPin}`);
      
      if (res.data.driver) {
        setDriver(res.data.driver);
        setIsLoggedIn(true);
        localStorage.setItem('driver_phone', driverPhone);
        toast.success(`مرحباً ${res.data.driver.name}!`);
        fetchOrders(res.data.driver.id);
      }
    } catch (error) {
      const message = error.response?.data?.detail || 'فشل في تسجيل الدخول';
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
      setOrders(res.data || []);
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
        // استخدام API بدون JWT للسائقين
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
      toast.error('المتصفح لا يدعم تحديد الموقع');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      updateLocation,
      (error) => {
        console.log('Location error:', error);
        toast.error('فشل في تحديد الموقع');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );

    setWatchId(id);
    setIsTracking(true);
    toast.success('تم بدء تتبع الموقع');
  };

  // إيقاف تتبع الموقع
  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsTracking(false);
    toast.info('تم إيقاف تتبع الموقع');
  };

  // تسليم الطلب
  const deliverOrder = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/status`, null, {
        params: { status: 'delivered' }
      });
      toast.success('تم تسليم الطلب بنجاح!');
      fetchOrders();
      setSelectedOrder(null);
    } catch (error) {
      toast.error('فشل في تحديث حالة الطلب');
    }
  };

  // تسجيل الخروج
  const logout = () => {
    stopTracking();
    setIsLoggedIn(false);
    setDriver(null);
    setOrders([]);
    localStorage.removeItem('driver_phone');
    toast.info('تم تسجيل الخروج');
  };

  // التحقق من تسجيل الدخول السابق
  useEffect(() => {
    const savedPhone = localStorage.getItem('driver_phone');
    if (savedPhone) {
      setDriverPhone(savedPhone);
      // محاولة تسجيل الدخول التلقائي
      axios.get(`${API}/driver/login`, { params: { phone: savedPhone } })
        .then(res => {
          if (res.data.driver) {
            setDriver(res.data.driver);
            setIsLoggedIn(true);
            fetchOrders(res.data.driver.id);
          }
        })
        .catch(() => {});
    }
  }, []);

  // تحديث الطلبات كل 30 ثانية
  useEffect(() => {
    if (isLoggedIn && driver) {
      const interval = setInterval(() => fetchOrders(), 30000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, driver]);

  // صفحة تسجيل الدخول
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center p-4" dir="rtl">
        <Toaster position="top-center" richColors />
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center">
              <Truck className="h-10 w-10 text-white" />
            </div>
            <CardTitle className="text-2xl">تطبيق السائق</CardTitle>
            <p className="text-gray-500">سجل دخولك برقم هاتفك والرمز السري</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">رقم الهاتف</label>
              <Input
                type="tel"
                placeholder="07xxxxxxxxx"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                className="text-lg text-center"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">الرمز السري (PIN)</label>
              <Input
                type="password"
                placeholder="****"
                maxLength={6}
                value={driverPin}
                onChange={(e) => setDriverPin(e.target.value)}
                className="text-lg text-center tracking-widest"
              />
            </div>
            <Button
              onClick={loginDriver}
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin ml-2" />
                  جاري التحقق...
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5 ml-2" />
                  تسجيل الدخول
                </>
              )}
            </Button>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchOrders()}
                className="text-white hover:bg-white/20"
              >
                <RefreshCw className="h-5 w-5" />
              </Button>
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
                    بدء التتبع
                  </>
                )}
              </Button>
            </div>

            {/* الخريطة المصغرة */}
            {currentLocation && (
              <div className="mt-4 h-40 rounded-lg overflow-hidden">
                <MapContainer
                  center={currentLocation}
                  zoom={16}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <MapUpdater center={currentLocation} />
                  <Marker position={currentLocation}>
                    <Popup>موقعك الحالي</Popup>
                  </Marker>
                </MapContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* الطلبات المسندة */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              الطلبات المسندة إليك
              <Badge className="mr-auto">{orders.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">لا توجد طلبات حالياً</p>
                <p className="text-sm text-gray-400">سيتم إشعارك عند وصول طلبات جديدة</p>
              </div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    selectedOrder?.id === order.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedOrder(order)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold">#{order.order_number}</p>
                      <p className="text-sm text-gray-500">{order.customer_name}</p>
                    </div>
                    <Badge className={
                      order.status === 'out_for_delivery'
                        ? 'bg-blue-500'
                        : order.status === 'ready'
                        ? 'bg-yellow-500'
                        : 'bg-gray-500'
                    }>
                      {order.status_label || order.status}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span className="line-clamp-2">{order.delivery_address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="h-4 w-4" />
                      <a href={`tel:${order.customer_phone}`} className="text-blue-500">
                        {order.customer_phone}
                      </a>
                    </div>
                  </div>

                  {selectedOrder?.id === order.id && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      {/* خريطة التوصيل */}
                      {order.delivery_location && (
                        <div className="h-48 rounded-lg overflow-hidden">
                          <MapContainer
                            center={[order.delivery_location.latitude, order.delivery_location.longitude]}
                            zoom={15}
                            style={{ height: '100%', width: '100%' }}
                            zoomControl={false}
                          >
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {currentLocation && (
                              <Marker 
                                position={currentLocation}
                                icon={L.divIcon({
                                  className: 'driver-marker',
                                  html: '<div style="background: #3b82f6; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white;">🛵</div>',
                                  iconSize: [30, 30],
                                  iconAnchor: [15, 15]
                                })}
                              >
                                <Popup>موقعك</Popup>
                              </Marker>
                            )}
                            <Marker 
                              position={[order.delivery_location.latitude, order.delivery_location.longitude]}
                              icon={L.divIcon({
                                className: 'delivery-marker',
                                html: '<div style="background: #ef4444; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white;">📍</div>',
                                iconSize: [30, 30],
                                iconAnchor: [15, 15]
                              })}
                            >
                              <Popup>موقع التوصيل</Popup>
                            </Marker>
                          </MapContainer>
                        </div>
                      )}

                      {/* أزرار الإجراءات */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${order.delivery_location?.latitude},${order.delivery_location?.longitude}`, '_blank')}
                        >
                          <Navigation className="h-4 w-4 ml-2" />
                          فتح الخريطة
                        </Button>
                        <a href={`tel:${order.customer_phone}`}>
                          <Button variant="outline" className="w-full">
                            <Phone className="h-4 w-4 ml-2" />
                            اتصال
                          </Button>
                        </a>
                      </div>

                      {order.status !== 'delivered' && (
                        <Button
                          className="w-full bg-green-500 hover:bg-green-600"
                          onClick={() => deliverOrder(order.id)}
                        >
                          <CheckCircle className="h-5 w-5 ml-2" />
                          تم التسليم
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
