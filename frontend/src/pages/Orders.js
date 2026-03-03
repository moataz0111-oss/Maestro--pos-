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
  CloudOff
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
              return (
                <Card 
                  key={order.id}
                  className="border-border/50 bg-card overflow-hidden"
                  data-testid={`order-card-${order.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getStatusColor(order.status)}`}>
                          <span className="text-lg font-bold">#{order.order_number}</span>
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
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {order.items.length} {t('عناصر')} • {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
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
    </div>
  );
}
