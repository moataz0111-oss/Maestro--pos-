import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { formatPrice } from '../utils/currency';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
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
  DollarSign
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DriverPortal() {
  const [searchParams] = useSearchParams();
  const driverId = searchParams.get('id');
  const driverPhone = searchParams.get('phone');
  
  const [driver, setDriver] = useState(null);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ unpaid_total: 0, paid_today: 0, pending_orders: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (driverId || driverPhone) {
      fetchDriverData();
      // تحديث كل 15 ثانية
      const interval = setInterval(fetchDriverData, 15000);
      return () => clearInterval(interval);
    } else {
      setError('لم يتم تحديد السائق');
      setLoading(false);
    }
  }, [driverId, driverPhone]);

  const fetchDriverData = async () => {
    try {
      // جلب بيانات السائق
      let driverData;
      if (driverId) {
        const res = await axios.get(`${API}/drivers/portal/${driverId}`);
        driverData = res.data;
      } else if (driverPhone) {
        const res = await axios.get(`${API}/drivers/portal/by-phone/${driverPhone}`);
        driverData = res.data;
      }
      
      setDriver(driverData.driver);
      setOrders(driverData.orders);
      setStats(driverData.stats);
      setError(null);
    } catch (err) {
      console.error('Error fetching driver data:', err);
      setError('فشل في جلب البيانات');
    } finally {
      setLoading(false);
    }
  };

  const markAsDelivered = async (orderId) => {
    try {
      await axios.put(`${API}/drivers/portal/${driver.id}/complete?order_id=${orderId}`);
      toast.success('تم تسليم الطلب بنجاح!');
      fetchDriverData();
    } catch (err) {
      toast.error('فشل في تحديث الحالة');
    }
  };

  const openNavigation = (address) => {
    // فتح خرائط جوجل مع العنوان
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const callCustomer = (phone) => {
    window.location.href = `tel:${phone}`;
  };

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
          <p className="text-gray-500 text-sm mt-2">تأكد من الرابط الصحيح</p>
        </div>
      </div>
    );
  }

  // تقسيم الطلبات
  const activeOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  const completedOrders = orders.filter(o => o.status === 'delivered');

  return (
    <div className="min-h-screen bg-gray-900 text-white" dir="rtl">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
              <Truck className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <h1 className="font-bold text-lg">{driver?.name}</h1>
              <p className="text-xs text-gray-400">{driver?.phone}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={fetchDriverData}
            className="text-gray-400"
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>
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
    </div>
  );
}
