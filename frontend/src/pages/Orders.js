import React, { useState, useEffect, useRef } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { localDate } from '../utils/date';
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
  Wrench,
  Layers,
  Trash2
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
import { showApiError } from '../utils/apiError';
import PhoneCountryInput from '../components/PhoneCountryInput';

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
    customer_type: 'regular', delivery_company_id: '', delivery_company_name: '', delivery_company_order_id: '',
    customer_name: '', customer_phone: '', delivery_address: '', notes: '',
  });
  const [fixSubmitting, setFixSubmitting] = useState(false);
  // قائمة شركات التوصيل (لاختيار الشركة عند تصحيح المسار)
  const [deliveryApps, setDeliveryApps] = useState([]);

  // === أداة تنظيف الطلبات المكررة القديمة (مالك/مدير عام) ===
  const isOwnerOrGM = ['admin', 'super_admin', 'manager'].includes(user?.role);
  const [showDuplicatesDialog, setShowDuplicatesDialog] = useState(false);
  const [dupGroups, setDupGroups] = useState([]);
  const [dupTotal, setDupTotal] = useState(0);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupCleaningId, setDupCleaningId] = useState(null);
  // === كشف متقدم على مستوى العمل (نفس رقم طلب الشركة / بصمة المحتوى) ===
  const [bizGroups, setBizGroups] = useState([]);
  const [bizExtra, setBizExtra] = useState(0);
  const [bizCleaning, setBizCleaning] = useState(false);

  const fetchDuplicates = async () => {
    setDupLoading(true);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 90);
      const params = {
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
      };
      if (selectedBranch) params.branch_id = selectedBranch;
      const [res, bizRes] = await Promise.all([
        axios.get(`${API}/orders/duplicates`, { params }),
        axios.get(`${API}/sync/business-duplicate-orders`).catch(() => ({ data: { groups: [], extra_orders_to_remove: 0 } })),
      ]);
      setDupGroups(res.data?.groups || []);
      setDupTotal(res.data?.total_duplicates || 0);
      setBizGroups(bizRes.data?.groups || []);
      setBizExtra(bizRes.data?.extra_orders_to_remove || 0);
    } catch (e) {
      showApiError(e, t('فشل تحميل الطلبات المكررة'));
    } finally {
      setDupLoading(false);
    }
  };

  const handleBizCleanup = async () => {
    if (!window.confirm(t('سيتم حذف') + ` ${bizExtra} ` + t('نسخة مكررة (على مستوى العمل) مع الإبقاء على نسخة واحدة لكل طلب. متابعة؟'))) return;
    setBizCleaning(true);
    try {
      const res = await axios.post(`${API}/sync/cleanup-business-duplicates`);
      toast.success(res.data?.message || t('تم تنظيف التكرارات'));
      fetchDuplicates();
      fetchData();
    } catch (e) {
      showApiError(e, t('فشل تنظيف التكرارات'));
    } finally {
      setBizCleaning(false);
    }
  };

  const openDuplicatesDialog = () => {
    setShowDuplicatesDialog(true);
    fetchDuplicates();
  };

  // حذف مباشر لطلب غير مدفوع (مالك/مدير عام) من القائمة
  const [forceDeletingId, setForceDeletingId] = useState(null);
  const handleForceDeleteOrder = async (order) => {
    const num = order.order_number || order.id?.slice(-6);
    if (!window.confirm(t('حذف نهائي للطلب') + ` #${num}؟ ` + t('لا يمكن التراجع — يُحذف من المبيعات والتقارير.'))) return;
    setForceDeletingId(order.id);
    try {
      await axios.delete(`${API}/orders/${order.id}/force-delete`);
      toast.success(t('تم حذف الطلب') + ` #${num}`);
      fetchData();
    } catch (e) {
      showApiError(e, t('فشل حذف الطلب'));
    } finally {
      setForceDeletingId(null);
    }
  };

  const handleCleanDuplicate = async (orderId, orderNumber) => {
    setDupCleaningId(orderId);
    try {
      await axios.delete(`${API}/orders/${orderId}/force-delete`);
      toast.success(t('تم حذف الطلب المكرر') + ` #${orderNumber}`);
      setDupGroups(prev => prev
        .map(g => ({ ...g, duplicates: g.duplicates.filter(d => d.id !== orderId) }))
        .filter(g => g.duplicates.length > 0));
      setDupTotal(prev => Math.max(0, prev - 1));
      fetchData();
    } catch (e) {
      showApiError(e, t('فشل حذف الطلب المكرر'));
    } finally {
      setDupCleaningId(null);
    }
  };
  
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

  // جلب شركات التوصيل مرة واحدة (لاختيارها عند تصحيح المسار)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/delivery-apps`);
        setDeliveryApps(Array.isArray(data) ? data : (data?.apps || []));
      } catch (e) { /* تجاهل */ }
    })();
  }, []);

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
      const today = localDate();
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
      delivery_company_id: order.delivery_company_id || order.delivery_app || '',
      delivery_company_name: order.delivery_company_name || order.delivery_app_name || '',
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
        payload.delivery_company_id = null;
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
      showApiError(error, t('فشل في تصحيح المسار'));
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
      out_for_delivery: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
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
      out_for_delivery: t('في الطريق'),
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
      out_for_delivery: Truck,
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
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold font-cairo text-foreground">{t('إدارة الطلبات')}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">{t('طلبات اليوم')}: {orders.length}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
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
            
            {isOwnerOrGM && (
              <Button
                variant="outline"
                size="sm"
                onClick={openDuplicatesDialog}
                className="border-orange-500 text-orange-600 hover:bg-orange-50"
                data-testid="open-duplicates-cleanup-btn"
                title={t('تنظيف الطلبات المكررة')}
              >
                <Layers className="h-4 w-4 ml-1" />
                {t('تنظيف المكرر')}
              </Button>
            )}
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-wrap gap-3 sm:gap-4 mb-6">
          <div className="flex-1 min-w-[160px] relative">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-6">
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
                      </div>
                    </div>

                    {/* أزرار الإجراءات — في وسط البطاقة وتلتف عند الحاجة */}
                    <div className="flex flex-wrap gap-2 mt-3 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedOrder(order)}
                            data-testid={`view-order-${order.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {/* حذف نهائي لطلب غير مدفوع — للمالك/المدير العام فقط */}
                          {isOwnerOrGM && order.status !== 'cancelled' && !['paid', 'credit'].includes((order.payment_status || '').toLowerCase()) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-500 text-red-600 hover:bg-red-50"
                              disabled={forceDeletingId === order.id}
                              onClick={() => handleForceDeleteOrder(order)}
                              data-testid={`force-delete-order-${order.id}`}
                              title={t('حذف نهائي (غير مدفوع)')}
                            >
                              {forceDeletingId === order.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          )}
                          
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
                          {/* تصحيح المسار - يظهر لمرة واحدة فقط للطلبات المعطوبة التي أعادت المهاجرة ترقيمها، ويختفي نهائياً بعد الإصلاح */}
                          {isAdmin
                            && order.renumbered_reason === 'fix_offline_sync_drift_v2'
                            && !order.routing_fixed_at && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-500 text-amber-600 hover:bg-amber-50"
                              onClick={() => openFixRouting(order)}
                              title={t('تصحيح مسار طلب معطوب (مرة واحدة)')}
                              data-testid={`fix-routing-${order.id}`}
                            >
                              <Wrench className="h-4 w-4" />
                            </Button>
                          )}
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
                    <Select
                      value={fixForm.delivery_company_id || '__manual__'}
                      onValueChange={(v) => {
                        if (v === '__manual__') {
                          setFixForm({ ...fixForm, delivery_company_id: '' });
                        } else {
                          const app = deliveryApps.find(a => a.id === v);
                          setFixForm({ ...fixForm, delivery_company_id: v, delivery_company_name: app?.name || fixForm.delivery_company_name });
                        }
                      }}
                    >
                      <SelectTrigger data-testid="fix-delivery-company-select"><SelectValue placeholder={t('اختر الشركة')} /></SelectTrigger>
                      <SelectContent>
                        {deliveryApps.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}{a.commission_rate ? ` (${a.commission_rate}%)` : ''}
                          </SelectItem>
                        ))}
                        <SelectItem value="__manual__">{t('أخرى (اكتب الاسم)')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {!fixForm.delivery_company_id && (
                      <Input
                        className="mt-2"
                        placeholder="طلباتي / طلبات / Uber Eats"
                        value={fixForm.delivery_company_name}
                        onChange={(e) => setFixForm({ ...fixForm, delivery_company_name: e.target.value })}
                        data-testid="fix-delivery-company"
                      />
                    )}
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
                  <PhoneCountryInput
                    value={fixForm.customer_phone}
                    onChange={(val) => setFixForm({ ...fixForm, customer_phone: val })}
                    testId="orders-customer-phone"
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

      {/* === أداة تنظيف الطلبات المكررة القديمة === */}
      <Dialog open={showDuplicatesDialog} onOpenChange={setShowDuplicatesDialog}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="duplicates-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-orange-500" />
              {t('تنظيف الطلبات المكررة القديمة')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {t('يعرض الطلبات التي لها نسخة مدفوعة حقيقية ونسخة مكررة غير مدفوعة (آخر 90 يوماً). احذف النسخة المكررة بضغطة.')}
            </p>
          </DialogHeader>

          {dupLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
           <div className="space-y-5">
            {/* === كشف متقدم: نفس رقم طلب شركة التوصيل / بصمة محتوى متطابقة === */}
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-3" data-testid="advanced-duplicates-section">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm">
                  <span className="font-bold text-orange-600">{t('فحص متقدم (نفس رقم طلب الشركة / محتوى متطابق)')}</span>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {bizExtra > 0
                      ? `${t('وُجدت')} ${bizGroups.length} ${t('مجموعة مكررة')} (${bizExtra} ${t('نسخة زائدة')})`
                      : t('لا توجد تكرارات على مستوى العمل ✅')}
                  </div>
                </div>
                {bizExtra > 0 && (
                  <Button
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700"
                    disabled={bizCleaning}
                    onClick={handleBizCleanup}
                    data-testid="auto-clean-business-duplicates-btn"
                  >
                    {bizCleaning ? <RefreshCw className="h-4 w-4 ml-1 animate-spin" /> : <Trash2 className="h-4 w-4 ml-1" />}
                    {t('تنظيف تلقائي')} ({bizExtra})
                  </Button>
                )}
              </div>
              {bizGroups.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {bizGroups.map((g, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-background/60 border" data-testid={`biz-dup-group-${i}`}>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-700">
                        {g.type === 'external_ref' ? t('نفس رقم طلب الشركة') : t('محتوى متطابق')}
                      </span>
                      <span className="mx-2 text-muted-foreground">
                        {(g.orders || []).map(o => `#${o.order_number}`).join('، ')}
                      </span>
                      <span className="text-emerald-600">→ {t('يُبقى')} #{Math.min(...(g.orders || []).map(o => o.order_number || Infinity))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* === الكشف الكلاسيكي (نسخة مدفوعة + نسخة مكررة غير مدفوعة) === */}
            {dupGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-duplicates">
              <Check className="h-10 w-10 mx-auto mb-2 text-emerald-500 opacity-70" />
              <p>{t('لا توجد طلبات مكررة (الكشف الكلاسيكي) 🎉')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-medium">
                {t('عدد النسخ المكررة')}: <span className="text-orange-600 font-bold" data-testid="duplicates-count">{dupTotal}</span>
              </div>
              {dupGroups.map((g, idx) => (
                <div key={g.signature + idx} className="border rounded-lg p-3 space-y-2" data-testid={`dup-group-${idx}`}>
                  {/* الطلب الأصلي (يُحتفظ به) */}
                  <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-sm">
                      <span className="font-bold text-emerald-700">#{g.keep.order_number}</span>
                      <span className="mx-2 text-muted-foreground">{g.keep.customer_name || t('زبون')}</span>
                      <span className="text-muted-foreground">{formatPrice(g.keep.total)}</span>
                      <span className="mx-2 text-[11px] text-emerald-600">✓ {t('مدفوع — يُحتفظ به')}</span>
                    </div>
                  </div>
                  {/* النسخ المكررة (للحذف) */}
                  {g.duplicates.map(d => (
                    <div key={d.id} className="flex items-center justify-between p-2 rounded bg-red-500/5 border border-red-500/20" data-testid={`dup-row-${d.id}`}>
                      <div className="text-sm">
                        <span className="font-bold text-red-600">#{d.order_number}</span>
                        <span className="mx-2 text-muted-foreground">{formatPrice(d.total)}</span>
                        <span className="text-[11px] text-red-500">{t('غير مدفوع — مكرر')}</span>
                        {d.is_offline_order && <span className="mx-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700">{t('أوفلاين')}</span>}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500 text-red-600 hover:bg-red-50"
                        disabled={dupCleaningId === d.id}
                        onClick={() => handleCleanDuplicate(d.id, d.order_number)}
                        data-testid={`delete-duplicate-${d.id}`}
                      >
                        {dupCleaningId === d.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 ml-1" />}
                        {t('حذف المكرر')}
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
           </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
