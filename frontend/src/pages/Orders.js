import React, { useState, useEffect, useRef } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useOffline } from '../context/OfflineContext';
import offlineStorage from '../lib/offlineStorage';
import db, { STORES } from '../lib/offlineDB';
import { formatPrice } from '../utils/currency';
import { playNewOrderNotification, playKitchenBell } from '../utils/sound';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import {
  ArrowRight,
  Search,
  Filter,
  Package,
  Clock,
  Check,
  X,
  ChefHat,
  Truck,
  Eye,
  Printer,
  RefreshCw,
  Volume2,
  VolumeX,
  Bell,
  WifiOff,
  Cloud,
  CloudOff,
  Wrench
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const API = API_URL;

export default function Orders() {
  const { user } = useAuth();
  const { t, isRTL } = useTranslation();
  const { isOnline, isOffline, syncStatus, updateSyncStatus } = useOffline();
  const navigate = useNavigate();
  
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  // === تصحيح مسار طلب أوفلاين سُجّل بمسار خاطئ (للمالك) ===
  const [fixRoutingOrder, setFixRoutingOrder] = useState(null);
  const [fixForm, setFixForm] = useState({
    order_type: 'dine_in', payment_method: 'cash', payment_status: 'paid',
    customer_type: 'regular', delivery_company_name: '', delivery_company_order_id: '',
    customer_name: '', customer_phone: '', delivery_address: '', notes: '',
  });
  const [fixSubmitting, setFixSubmitting] = useState(false);
  
  // Sound notification state
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('maestro_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const lastOrderCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);

  // Save sound preference
  useEffect(() => {
    localStorage.setItem('maestro_sound_enabled', soundEnabled.toString());
  }, [soundEnabled]);

  useEffect(() => {
    fetchData();
    // Poll for updates every 15 seconds
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [selectedBranch, statusFilter, isOffline]);

  const fetchData = async () => {
    try {
      // === وضع Offline ===
      if (isOffline) {
        try {
          // جلب الطلبات المحلية
          const localOrders = await offlineStorage.getTodayOrders();
          
          // تطبيق الفلاتر
          let filteredLocalOrders = localOrders;
          if (statusFilter !== 'all') {
            filteredLocalOrders = localOrders.filter(o => o.status === statusFilter);
          }
          
          setOrders(filteredLocalOrders);
          
          // جلب الفروع المحلية
          const localBranches = await db.getAllItems(STORES.BRANCHES);
          if (localBranches.length > 0) {
            setBranches(localBranches);
            if (!selectedBranch) {
              setSelectedBranch(localBranches[0].id);
            }
          }
          
          setLoading(false);
          return;
        } catch (offlineError) {
          console.error('Error loading offline orders:', offlineError);
        }
      }
      
      // === وضع Online ===
      const today = new Date().toISOString().split('T')[0];
      const params = { date: today };
      if (selectedBranch) params.branch_id = selectedBranch;
      if (statusFilter !== 'all') params.status = statusFilter;

      const [ordersRes, branchesRes] = await Promise.all([
        axios.get(`${API}/orders`, { params }),
        axios.get(`${API}/branches`)
      ]);

      const newOrders = ordersRes.data;
      
      // حفظ الطلبات محلياً للاستخدام Offline
      try {
        for (const order of newOrders) {
          await db.addItem(STORES.ORDERS, { ...order, is_synced: true });
        }
        // حفظ الفروع محلياً
        await db.addItems(STORES.BRANCHES, branchesRes.data);
      } catch (cacheError) {
        console.log('Could not cache orders:', cacheError);
      }
      
      // Check for new orders and play notification
      if (!isFirstLoadRef.current && soundEnabled) {
        const pendingOrders = newOrders.filter(o => o.status === 'pending');
        const previousPending = lastOrderCountRef.current;
        
        if (pendingOrders.length > previousPending) {
          // New order arrived!
          playNewOrderNotification();
          toast.success(`🔔 ${t('طلب جديد!')}`, {
            description: `${t('تم استلام')} ${pendingOrders.length - previousPending} ${t('طلب جديد')}`,
            duration: 5000,
          });
        }
        
        lastOrderCountRef.current = pendingOrders.length;
      } else {
        // First load, just set the count without notification
        lastOrderCountRef.current = newOrders.filter(o => o.status === 'pending').length;
        isFirstLoadRef.current = false;
      }
      
      setOrders(newOrders);
      setBranches(branchesRes.data);

      if (!selectedBranch && branchesRes.data.length > 0) {
        setSelectedBranch(branchesRes.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      
      // إذا فشل الاتصال، حاول جلب من IndexedDB
      if (!error.response) {
        try {
          const localOrders = await offlineStorage.getTodayOrders();
          if (localOrders.length > 0) {
            setOrders(localOrders);
            toast.warning(t('تم تحميل الطلبات المحلية'));
          }
          
          const localBranches = await db.getAllItems(STORES.BRANCHES);
          if (localBranches.length > 0) {
            setBranches(localBranches);
          }
        } catch (offlineError) {
          console.error('Error loading offline data:', offlineError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      // === وضع Offline ===
      if (isOffline) {
        // تحديث محلي
        await offlineStorage.updateOfflineOrder(orderId, { 
          status: status,
          updated_at: new Date().toISOString()
        });
        
        toast.success(t('تم تحديث حالة الطلب') + ' (محلي)');
        
        // Play kitchen bell when order is ready
        if (status === 'ready' && soundEnabled) {
          playKitchenBell();
        }
        
        // تحديث حالة المزامنة
        await updateSyncStatus();
        fetchData();
        return;
      }
      
      // === وضع Online ===
      await axios.put(`${API}/orders/${orderId}/status?status=${status}`);
      toast.success(t('تم تحديث حالة الطلب'));
      
      // Play kitchen bell when order is ready
      if (status === 'ready' && soundEnabled) {
        playKitchenBell();
      }
      
      fetchData();
    } catch (error) {
      toast.error(t('فشل في تحديث الحالة'));
    }
  };

  // === فتح حوار تصحيح المسار ===
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager';

  const openFixRouting = (order) => {
    setFixRoutingOrder(order);
    setFixForm({
      order_type: order.order_type || 'dine_in',
      payment_method: order.payment_method || 'cash',
      payment_status: order.payment_status || 'paid',
      customer_type: order.customer_type || 'regular',
      delivery_company_name: order.delivery_company_name || '',
      delivery_company_order_id: order.delivery_company_order_id || '',
      customer_name: order.customer_name || '',
      customer_phone: order.customer_phone || '',
      delivery_address: order.delivery_address || '',
      notes: order.notes || '',
    });
  };

  const submitFixRouting = async () => {
    if (!fixRoutingOrder) return;
    setFixSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      // فقط الحقول التي قد تغيّرت أو لها قيمة
      const payload = { ...fixForm };
      // لو ما كانت توصيل ولا شركة توصيل، نظّف حقول التوصيل
      const isDelivery = payload.order_type === 'delivery' || payload.payment_method === 'delivery_company' || payload.customer_type === 'delivery_company';
      if (!isDelivery) {
        payload.delivery_address = null;
        payload.delivery_company_name = null;
        payload.delivery_company_order_id = null;
      }
      await axios.patch(`${API}/sync/orders/${fixRoutingOrder.id}/fix-routing`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(t('تم تصحيح مسار الطلب'));
      setFixRoutingOrder(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تصحيح المسار'));
    } finally {
      setFixSubmitting(false);
    }
  };


  const testNotificationSound = () => {
    playNewOrderNotification();
    toast.info(`🔔 ${t('اختبار صوت الإشعار')}`);
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      preparing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      ready: 'bg-green-500/10 text-green-500 border-green-500/20',
      delivered: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
    };
    return colors[status] || colors.pending;
  };

  const getStatusText = (status) => {
    const texts = {
      pending: t('معلق'),
      preparing: t('قيد التحضير'),
      ready: t('جاهز'),
      delivered: t('تم التسليم'),
      cancelled: t('ملغي'),
    };
    return texts[status] || status;
  };

  const getStatusIcon = (status) => {
    const icons = {
      pending: Clock,
      preparing: ChefHat,
      ready: Check,
      delivered: Truck,
      cancelled: X,
    };
    return icons[status] || Clock;
  };

  const getOrderTypeText = (type) => {
    const texts = {
      dine_in: t('داخل المطعم'),
      takeaway: t('سفري'),
      delivery: t('توصيل'),
    };
    return texts[type] || type;
  };

  const filteredOrders = orders.filter(order => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        order.order_number.toString().includes(query) ||
        order.customer_name?.toLowerCase().includes(query) ||
        order.customer_phone?.includes(query)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('جاري التحميل...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'} data-testid="orders-page">
      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm sticky top-0 z-50">
          <WifiOff className="h-4 w-4 animate-pulse" />
          <span className="font-medium">{t('وضع Offline')} - {t('الطلبات المحلية فقط')}</span>
          {syncStatus.pendingOrders > 0 && (
            <span className="bg-white text-amber-600 px-2 py-0.5 rounded-full text-xs font-bold mr-2">
              {syncStatus.pendingOrders} {t('طلب في الانتظار')}
            </span>
          )}
        </div>
      )}
      
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">{t('إدارة الطلبات')}</h1>
              <p className="text-sm text-muted-foreground">{t('طلبات اليوم')}: {orders.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Offline/Online Status Indicator */}
            {isOffline ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <CloudOff className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-500 font-medium">{t('غير متصل')}</span>
              </div>
            ) : syncStatus.pendingOrders > 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <Cloud className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-blue-500 font-medium">
                  {syncStatus.pendingOrders} {t('للمزامنة')}
                </span>
              </div>
            ) : null}
            
            {/* Sound Toggle */}
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${soundEnabled ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setSoundEnabled(!soundEnabled)}
                data-testid="sound-toggle"
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={testNotificationSound}
                data-testid="test-sound-btn"
                title={t('اختبار الصوت')}
              >
                <Bell className="h-4 w-4" />
              </Button>
            </div>
            
            <Button variant="outline" size="icon" onClick={fetchData} data-testid="refresh-btn">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <select
              value={selectedBranch || ''}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground"
            >
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px] relative">
            <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
            <Input
              placeholder={t('بحث برقم الطلب أو اسم الزبون...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={isRTL ? 'pr-10' : 'pl-10'}
              data-testid="search-input"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('حالة الطلب')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('جميع الحالات')}</SelectItem>
              <SelectItem value="pending">{t('معلق')}</SelectItem>
              <SelectItem value="preparing">{t('قيد التحضير')}</SelectItem>
              <SelectItem value="ready">{t('جاهز')}</SelectItem>
              <SelectItem value="delivered">{t('تم التسليم')}</SelectItem>
              <SelectItem value="cancelled">{t('ملغي')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Stats */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {['pending', 'preparing', 'ready', 'delivered', 'cancelled'].map(status => {
            const count = orders.filter(o => o.status === status).length;
            const StatusIcon = getStatusIcon(status);
            return (
              <Card 
                key={status}
                className={`border-border/50 cursor-pointer transition-all hover:shadow-md ${
                  statusFilter === status ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getStatusColor(status)}`}>
                    <StatusIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{getStatusText(status)}</p>
                    <p className="text-xl font-bold text-foreground">{count}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Orders List */}
      <main className="max-w-7xl mx-auto px-6 pb-8">
        <div className="space-y-3">
          {filteredOrders.length === 0 ? (
            <Card className="border-border/50 bg-card">
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t('لا توجد طلبات')}</p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map(order => {
              const StatusIcon = getStatusIcon(order.status);
              const isUnsyncedOrder = order.is_synced === false || order.is_offline === true;
              return (
                <Card 
                  key={order.id}
                  className={`border-border/50 bg-card overflow-hidden ${isUnsyncedOrder ? 'border-l-4 border-l-amber-500' : ''}`}
                  data-testid={`order-card-${order.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getStatusColor(order.status)}`}>
                          <span className="text-lg font-bold">#{order.order_number || order.offline_id?.slice(-6)}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-foreground">{order.customer_name || t('زبون')}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(order.status)}`}>
                              {getStatusText(order.status)}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {getOrderTypeText(order.order_type)}
                            </span>
                            {/* مؤشر الطلب غير المتزامن */}
                            {isUnsyncedOrder && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center gap-1">
                                <CloudOff className="h-3 w-3" />
                                {t('محلي')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {order.items?.length || 0} {t('عناصر')} • {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {order.delivery_app && (
                            <p className="text-xs text-primary mt-1">{t('عبر')}: {order.delivery_app}</p>
                          )}
                        </div>
                      </div>

                      <div className={isRTL ? 'text-left' : 'text-right'}>
                        <p className="text-xl font-bold text-primary tabular-nums">{formatPrice(order.total)}</p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedOrder(order)}
                            data-testid={`view-order-${order.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          
                          {order.status === 'pending' && (
                            <Button
                              size="sm"
                              className="bg-blue-500 hover:bg-blue-600 text-white"
                              onClick={() => updateOrderStatus(order.id, 'preparing')}
                            >
                              <ChefHat className={`h-4 w-4 ${isRTL ? 'ml-1' : 'mr-1'}`} />
                              {t('تحضير')}
                            </Button>
                          )}
                          
                          {order.status === 'preparing' && (
                            <Button
                              size="sm"
                              className="bg-green-500 hover:bg-green-600 text-white"
                              onClick={() => updateOrderStatus(order.id, 'ready')}
                            >
                              <Check className={`h-4 w-4 ${isRTL ? 'ml-1' : 'mr-1'}`} />
                              {t('جاهز')}
                            </Button>
                          )}
                          
                          {order.status === 'ready' && (
                            <Button
                              size="sm"
                              className="bg-primary hover:bg-primary/90 text-primary-foreground"
                              onClick={() => updateOrderStatus(order.id, 'delivered')}
                            >
                              <Truck className={`h-4 w-4 ${isRTL ? 'ml-1' : 'mr-1'}`} />
                              {t('تسليم')}
                            </Button>
                          )}
                          
                          {!['delivered', 'cancelled'].includes(order.status) && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateOrderStatus(order.id, 'cancelled')}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          {/* تصحيح المسار للطلبات الأوفلاين (المالك/المدير فقط) */}
                          {isAdmin && (order.is_offline_order || order.original_order_number) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-500 text-amber-600 hover:bg-amber-50"
                              onClick={() => openFixRouting(order)}
                              title={t('تصحيح مسار طلب أوفلاين')}
                              data-testid={`fix-routing-${order.id}`}
                            >
                              <Wrench className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </main>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t('تفاصيل الطلب')} #{selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('الزبون')}</p>
                  <p className="font-medium text-foreground">{selectedOrder.customer_name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('الهاتف')}</p>
                  <p className="font-medium text-foreground">{selectedOrder.customer_phone || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('نوع الطلب')}</p>
                  <p className="font-medium text-foreground">{getOrderTypeText(selectedOrder.order_type)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('طريقة الدفع')}</p>
                  <p className="font-medium text-foreground">
                    {selectedOrder.payment_method === 'cash' ? t('نقدي') : selectedOrder.payment_method === 'card' ? t('بطاقة') : t('آجل')}
                  </p>
                </div>
              </div>

              {selectedOrder.delivery_address && (
                <div>
                  <p className="text-muted-foreground text-sm">{t('عنوان التوصيل')}</p>
                  <p className="font-medium text-foreground">{selectedOrder.delivery_address}</p>
                </div>
              )}

              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground mb-2">{t('العناصر')}</p>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-foreground">{item.product_name || item.name || t('منتج')} x{item.quantity}</span>
                      <span className="font-medium tabular-nums text-foreground">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('المجموع الفرعي')}</span>
                  <span className="text-foreground">{formatPrice(selectedOrder.subtotal)}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>{t('الخصم')}</span>
                    <span>-{formatPrice(selectedOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2">
                  <span className="text-foreground">{t('الإجمالي')}</span>
                  <span className="text-primary">{formatPrice(selectedOrder.total)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* === Fix Routing Dialog (تصحيح مسار طلب أوفلاين) === */}
      <Dialog open={!!fixRoutingOrder} onOpenChange={(o) => !o && setFixRoutingOrder(null)}>
        <DialogContent className="max-w-lg" data-testid="fix-routing-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-500" />
              {t('تصحيح مسار الطلب')} #{fixRoutingOrder?.order_number}
            </DialogTitle>
          </DialogHeader>
          {fixRoutingOrder && (
            <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-700 dark:text-amber-300">
                {t('هذا الطلب أوفلاين سُجّل بمسار خاطئ. عدّل البيانات الصحيحة وستُحفظ مع سجل تدقيق.')}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('نوع الطلب')}</Label>
                  <Select value={fixForm.order_type} onValueChange={(v) => setFixForm({ ...fixForm, order_type: v })}>
                    <SelectTrigger data-testid="fix-order-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dine_in">{t('داخل')}</SelectItem>
                      <SelectItem value="takeaway">{t('سفري')}</SelectItem>
                      <SelectItem value="delivery">{t('توصيل')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('طريقة الدفع')}</Label>
                  <Select value={fixForm.payment_method} onValueChange={(v) => {
                    const next = { ...fixForm, payment_method: v };
                    if (v === 'delivery_company') {
                      next.customer_type = 'delivery_company';
                      next.payment_status = 'unpaid';
                    } else if (v === 'credit' || v === 'deferred') {
                      next.customer_type = 'credit';
                      next.payment_status = 'unpaid';
                    } else {
                      next.customer_type = 'regular';
                      next.payment_status = 'paid';
                    }
                    setFixForm(next);
                  }}>
                    <SelectTrigger data-testid="fix-payment-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t('نقدي')}</SelectItem>
                      <SelectItem value="card">{t('بطاقة')}</SelectItem>
                      <SelectItem value="credit">{t('آجل')}</SelectItem>
                      <SelectItem value="deferred">{t('آجل عادي')}</SelectItem>
                      <SelectItem value="delivery_company">{t('شركة توصيل (آجل)')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('حالة الدفع')}</Label>
                  <Select value={fixForm.payment_status} onValueChange={(v) => setFixForm({ ...fixForm, payment_status: v })}>
                    <SelectTrigger data-testid="fix-payment-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">{t('مدفوع')}</SelectItem>
                      <SelectItem value="unpaid">{t('غير مدفوع (آجل)')}</SelectItem>
                      <SelectItem value="partial">{t('جزئي')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('نوع العميل')}</Label>
                  <Select value={fixForm.customer_type} onValueChange={(v) => setFixForm({ ...fixForm, customer_type: v })}>
                    <SelectTrigger data-testid="fix-customer-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">{t('عادي')}</SelectItem>
                      <SelectItem value="delivery_company">{t('شركة توصيل')}</SelectItem>
                      <SelectItem value="credit">{t('آجل')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(fixForm.payment_method === 'delivery_company' || fixForm.customer_type === 'delivery_company' || fixForm.order_type === 'delivery') && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-blue-500/5 border border-blue-500/30 rounded">
                  <div>
                    <Label>{t('شركة التوصيل')}</Label>
                    <Input
                      placeholder="طلباتي / طلبات / Uber Eats"
                      value={fixForm.delivery_company_name}
                      onChange={(e) => setFixForm({ ...fixForm, delivery_company_name: e.target.value })}
                      data-testid="fix-delivery-company"
                    />
                  </div>
                  <div>
                    <Label>{t('رقم طلب الشركة')}</Label>
                    <Input
                      placeholder="ABC123"
                      value={fixForm.delivery_company_order_id}
                      onChange={(e) => setFixForm({ ...fixForm, delivery_company_order_id: e.target.value })}
                      data-testid="fix-delivery-company-order-id"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('اسم العميل')}</Label>
                  <Input
                    value={fixForm.customer_name}
                    onChange={(e) => setFixForm({ ...fixForm, customer_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('هاتف العميل')}</Label>
                  <Input
                    value={fixForm.customer_phone}
                    onChange={(e) => setFixForm({ ...fixForm, customer_phone: e.target.value })}
                  />
                </div>
              </div>

              {fixForm.order_type === 'delivery' && (
                <div>
                  <Label>{t('عنوان التوصيل')}</Label>
                  <Input
                    value={fixForm.delivery_address}
                    onChange={(e) => setFixForm({ ...fixForm, delivery_address: e.target.value })}
                  />
                </div>
              )}

              <div>
                <Label>{t('ملاحظات')}</Label>
                <Input
                  value={fixForm.notes}
                  onChange={(e) => setFixForm({ ...fixForm, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={() => setFixRoutingOrder(null)} data-testid="fix-routing-cancel">
              {t('إلغاء')}
            </Button>
            <Button onClick={submitFixRouting} disabled={fixSubmitting} data-testid="fix-routing-save">
              {fixSubmitting ? t('جاري الحفظ...') : t('حفظ التصحيح')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
