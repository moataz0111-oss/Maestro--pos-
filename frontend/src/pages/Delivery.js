import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  ArrowRight,
  Truck,
  User,
  Phone,
  MapPin,
  Clock,
  Check,
  Package,
  Plus,
  Navigation,
  DollarSign,
  CreditCard,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  Wallet,
  Receipt,
  TrendingUp,
  History,
  Map,
  Locate,
  Edit,
  Trash2,
  Maximize,
  ArrowLeftRight,
  ExternalLink,
  Building,
  Trophy,
  Timer,
  Route,
  BarChart3,
  Star,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import DriverTrackingMap from '../components/DriverTrackingMap';
import { showApiError } from '../utils/apiError';

const API = API_URL;

export default function Delivery() {
  const { user, hasRole } = useAuth();
  const { t, isRTL } = useTranslation();
  const navigate = useNavigate();
  
  const [drivers, setDrivers] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  
  // أداء السائقين
  const [perfData, setPerfData] = useState(null);
  const [perfPeriod, setPerfPeriod] = useState('today');
  const [perfLoading, setPerfLoading] = useState(false);
  const [ratings, setRatings] = useState([]);
  const [ratingsSummary, setRatingsSummary] = useState({ count: 0, avg_food: 0, avg_restaurant: 0, avg_driver: 0 });
  const [allOrders, setAllOrders] = useState([]);
  const [ordersSummary, setOrdersSummary] = useState({ all: 0, rejected: 0, late: 0, accepted: 0, preparing: 0, completed: 0, cancelled: 0 });
  const [ordersFilter, setOrdersFilter] = useState('all');
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', pin: '1234' });
  
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  
  // حالات تحديد ومسح السائقين
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  
  // حالات تعديل السائق
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ id: '', name: '', phone: '', pin: '', is_active: true, branch_id: '' });
  
  // حالات جديدة لمتابعة الطلبات
  const [driverOrders, setDriverOrders] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverOrdersDialogOpen, setDriverOrdersDialogOpen] = useState(false);
  const [driverStats, setDriverStats] = useState({});
  const [collectPaymentDialogOpen, setCollectPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  
  // حالات إسناد سائق مع أجور التوصيل
  const [assignFeeDialogOpen, setAssignFeeDialogOpen] = useState(false);
  const [pendingAssign, setPendingAssign] = useState(null);
  const [assignDeliveryFee, setAssignDeliveryFee] = useState('');
  const [assignFeeHint, setAssignFeeHint] = useState(null);
  
  // حالات تحويل الطلب لسائق آخر
  const [transferDriverDialogOpen, setTransferDriverDialogOpen] = useState(false);
  const [orderToTransfer, setOrderToTransfer] = useState(null);
  const [targetDriverId, setTargetDriverId] = useState('');
  const [allDriversForTransfer, setAllDriversForTransfer] = useState([]);
  
  // حالات جديدة للخريطة
  const [driverLocations, setDriverLocations] = useState([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});

  useEffect(() => {
    fetchData();
    fetchDriverLocations();
    // Poll for updates
    const interval = setInterval(() => {
      fetchData();
      fetchDriverLocations();
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedBranch]);

  // تحميل Leaflet CSS
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
  }, []);

  const fetchDriverLocations = async () => {
    try {
      const res = await axios.get(`${API}/drivers/locations`, { 
        params: { branch_id: selectedBranch } 
      });
      setDriverLocations(res.data);
    } catch (error) {
      console.error('Failed to fetch driver locations:', error);
    }
  };

  // جلب أداء السائقين
  const fetchPerformance = async () => {
    try {
      setPerfLoading(true);
      const res = await axios.get(`${API}/drivers/performance`, {
        params: { period: perfPeriod, ...(selectedBranch && { branch_id: selectedBranch }) }
      });
      setPerfData(res.data);
    } catch (error) {
      console.error('Failed to fetch driver performance:', error);
    } finally {
      setPerfLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfPeriod, selectedBranch]);

  const fetchRatings = async () => {
    try {
      const res = await axios.get(`${API}/delivery-ratings`, {
        params: { ...(selectedBranch && { branch_id: selectedBranch }) }
      });
      setRatings(res.data?.ratings || []);
      setRatingsSummary(res.data?.summary || { count: 0, avg_food: 0, avg_restaurant: 0, avg_driver: 0 });
    } catch (error) {
      console.error('Failed to fetch delivery ratings:', error);
    }
  };

  useEffect(() => {
    fetchRatings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

  const fetchAllOrders = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await axios.get(`${API}/delivery-orders`, {
        params: { date: today, ...(selectedBranch && { branch_id: selectedBranch }) }
      });
      setAllOrders(res.data?.orders || []);
      setOrdersSummary(res.data?.summary || { all: 0, rejected: 0, late: 0, accepted: 0, preparing: 0, completed: 0, cancelled: 0 });
    } catch (error) {
      console.error('Failed to fetch delivery orders:', error);
    }
  };

  useEffect(() => {
    fetchAllOrders();
    const iv = setInterval(fetchAllOrders, 20000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

  const fetchData = async () => {
    try {
      const [driversRes, ordersRes, branchesRes] = await Promise.all([
        axios.get(`${API}/drivers`, { params: { branch_id: selectedBranch, include_orders: true } }),
        axios.get(`${API}/orders`, { params: { branch_id: selectedBranch, status: 'ready' } }),
        axios.get(`${API}/branches`)
      ]);

      const driversData = driversRes.data;
      setDrivers(driversData);
      setPendingOrders(ordersRes.data.filter(o => o.order_type === 'delivery' && !o.driver_id));
      setBranches(branchesRes.data);

      if (!selectedBranch && branchesRes.data.length > 0) {
        // اختيار أول فرع نشط
        const activeBranch = branchesRes.data.find(b => b.is_active !== false);
        setSelectedBranch(activeBranch?.id || branchesRes.data[0].id);
      }

      // جلب إحصائيات كل سائق
      const statsPromises = driversData.map(async (driver) => {
        try {
          const statsRes = await axios.get(`${API}/drivers/${driver.id}/stats`);
          return { driverId: driver.id, stats: statsRes.data };
        } catch {
          return { driverId: driver.id, stats: { unpaid_total: 0, paid_total: 0, pending_orders: 0 } };
        }
      });
      
      const statsResults = await Promise.all(statsPromises);
      const statsMap = {};
      statsResults.forEach(s => { statsMap[s.driverId] = s.stats; });
      setDriverStats(statsMap);
      
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDriver = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/drivers`, {
        ...formData,
        branch_id: selectedBranch
      });
      toast.success(t('تم إضافة السائق'));
      setDialogOpen(false);
      setFormData({ name: '', phone: '', pin: '1234' });
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في إضافة السائق'));
    }
  };

  const handleEditDriver = async (e) => {
    e.preventDefault();
    try {
      const updateData = {
        name: editFormData.name,
        phone: editFormData.phone,
        is_active: editFormData.is_active
      };
      // إضافة PIN فقط إذا تم تعديله
      if (editFormData.pin) {
        updateData.pin = editFormData.pin;
      }
      await axios.put(`${API}/drivers/${editFormData.id}`, updateData);
      toast.success(t('تم تعديل السائق'));
      setEditDialogOpen(false);
      setEditFormData({ id: '', name: '', phone: '', pin: '', is_active: true });
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في تعديل السائق'));
    }
  };

  const handleDeleteDriver = async (driverId, driverName) => {
    if (!window.confirm(`${t('هل أنت متأكد من حذف السائق')} "${driverName}"؟`)) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(`${API}/drivers/${driverId}`, { headers });
      toast.success(t('تم حذف السائق'));
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في حذف السائق'));
    }
  };

  // تحديد/إلغاء تحديد سائق واحد
  const toggleSelectDriver = (driverId) => {
    setSelectedDrivers(prev => 
      prev.includes(driverId) 
        ? prev.filter(id => id !== driverId)
        : [...prev, driverId]
    );
  };

  // تحديد الكل / إلغاء تحديد الكل
  const toggleSelectAll = () => {
    if (selectedDrivers.length === drivers.length) {
      setSelectedDrivers([]);
    } else {
      setSelectedDrivers(drivers.map(d => d.id));
    }
  };

  // مسح السائقين المحددين
  const handleDeleteSelectedDrivers = async () => {
    if (selectedDrivers.length === 0) return;
    
    setDeleteConfirmOpen(false);
    
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      // مسح السائقين واحداً تلو الآخر
      for (const driverId of selectedDrivers) {
        await axios.delete(`${API}/drivers/${driverId}`, { headers });
      }
      toast.success(`${t('تم حذف')} ${selectedDrivers.length} ${t('سائق بنجاح')}`);
      setSelectedDrivers([]);
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في حذف بعض السائقين'));
      fetchData();
    }
  };

  const openEditDialog = (driver) => {
    setEditFormData({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      pin: '',  // لا نعرض PIN الحالي
      is_active: driver.is_available !== false
    });
    setEditDialogOpen(true);
  };

  // فتح نافذة الإسناد مع إدخال أجور التوصيل
  const openAssignDialog = async (driver, order) => {
    setPendingAssign({
      driverId: driver.id,
      driverName: driver.name,
      orderId: order.id,
      orderNumber: order.order_number,
      orderTotal: order.total
    });
    setAssignDeliveryFee('');
    setAssignFeeHint(null);
    setAssignFeeDialogOpen(true);
    // اقتراح أجور تلقائي حسب المسافة (إن كانت مفعلة)
    try {
      const res = await axios.get(`${API}/delivery-fee/suggest`, { params: { order_id: order.id } });
      if (res.data?.suggested_fee != null) {
        setAssignDeliveryFee(String(res.data.suggested_fee));
        setAssignFeeHint(res.data.out_of_range
          ? `⚠️ ${res.data.reason || t('الزبون خارج نطاق التوصيل')}`
          : `🗺️ ${t('محسوبة تلقائياً حسب المسافة')} (${res.data.distance_km} ${t('كم')})`);
      } else if (res.data?.enabled && res.data?.reason) {
        setAssignFeeHint(`ℹ️ ${res.data.reason}`);
      }
    } catch (e) { /* noop */ }
  };

  const assignDriver = async (driverId, orderId, fee = 0) => {
    try {
      await axios.put(`${API}/drivers/${driverId}/assign?order_id=${orderId}${fee > 0 ? `&delivery_fee=${fee}` : ''}`);
      toast.success(fee > 0 ? `${t('تم تعيين السائق للطلب')} + ${t('أجور توصيل')} ${formatPrice(fee)}` : t('تم تعيين السائق للطلب'));
      setAssignFeeDialogOpen(false);
      setPendingAssign(null);
      fetchData();
    } catch (error) {
      showApiError(error, t('فشل في تعيين السائق'));
    }
  };

  const completeDelivery = async (driverId, orderId = null) => {
    try {
      if (orderId) {
        await axios.put(`${API}/drivers/${driverId}/complete?order_id=${orderId}`);
      } else {
        await axios.put(`${API}/drivers/${driverId}/complete`);
      }
      toast.success(t('تم تسليم الطلب بنجاح'));
      fetchData();
      if (selectedDriver) {
        fetchDriverOrders(selectedDriver.id);
      }
    } catch (error) {
      toast.error(t('فشل في تحديث الحالة'));
    }
  };

  // جلب طلبات سائق معين
  const fetchDriverOrders = async (driverId) => {
    try {
      const res = await axios.get(`${API}/drivers/${driverId}/orders`);
      setDriverOrders(res.data);
    } catch (error) {
      console.error('Failed to fetch driver orders:', error);
      toast.error(t('فشل في جلب طلبات السائق'));
    }
  };

  // فتح تفاصيل السائق
  const openDriverDetails = async (driver) => {
    setSelectedDriver(driver);
    await fetchDriverOrders(driver.id);
    setDriverOrdersDialogOpen(true);
  };

  // طباعة إيصال تحصيل من السائق (يفتح نافذة طباعة بفاتورة محصّلة باسم السائق)
  const printCollectionReceipt = (driver, orders, collectedAmount) => {
    const now = new Date();
    const rows = (orders || []).map((o) => `
      <tr>
        <td style="padding:4px 6px;border-bottom:1px dashed #ccc">#${o.order_number || '-'}</td>
        <td style="padding:4px 6px;border-bottom:1px dashed #ccc">${o.customer_name || '-'}</td>
        <td style="padding:4px 6px;border-bottom:1px dashed #ccc;text-align:left">${Number(o.total || 0).toLocaleString()}</td>
      </tr>`).join('');
    const ordersTotal = (orders || []).reduce((s, o) => s + (Number(o.total) || 0), 0);
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>إيصال تحصيل</title>
      <style>
        *{font-family:'Tahoma',sans-serif} body{padding:12px;color:#000}
        h2{text-align:center;margin:4px 0} .muted{color:#555;font-size:12px;text-align:center}
        table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
        th{text-align:right;border-bottom:2px solid #000;padding:6px}
        .tot{font-weight:bold;font-size:16px;border-top:2px solid #000;padding-top:8px;margin-top:8px;display:flex;justify-content:space-between}
        .paid{margin-top:10px;text-align:center;font-weight:bold;color:#15803d;border:2px solid #15803d;border-radius:8px;padding:6px}
      </style></head><body>
      <h2>إيصال تحصيل من السائق</h2>
      <p class="muted">السائق: ${driver?.name || '-'} • ${now.toLocaleString('ar-IQ')}</p>
      <table>
        <thead><tr><th>رقم الطلب</th><th>الزبون</th><th style="text-align:left">المبلغ</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="text-align:center;padding:8px">لا توجد طلبات</td></tr>'}</tbody>
      </table>
      <div class="tot"><span>إجمالي الطلبات (${(orders || []).length})</span><span>${ordersTotal.toLocaleString()} IQD</span></div>
      <div class="tot"><span>المبلغ المُحصّل</span><span>${Number(collectedAmount || 0).toLocaleString()} IQD</span></div>
      <div class="paid">✓ مدفوعة — محصّلة من السائق ${driver?.name || ''}</div>
      </body></html>`;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) { toast.error(t('فعّل النوافذ المنبثقة للطباعة')); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
  };

  // تسجيل دفعة من السائق
  const handleCollectPayment = async () => {
    if (!selectedDriver || paymentAmount <= 0) return;
    
    try {
      // التقط الطلبات غير المحصّلة قبل التحصيل (للطباعة)
      const collectedOrders = (driverOrders || []).filter(o => o.driver_payment_status !== 'paid');
      await axios.post(`${API}/drivers/${selectedDriver.id}/collect-payment`, {
        amount: paymentAmount
      });
      toast.success(`${t('تم تسجيل دفعة بقيمة')} ${formatPrice(paymentAmount)}`);
      // ⭐ طباعة إيصال التحصيل (فاتورة محصّلة باسم السائق)
      printCollectionReceipt(selectedDriver, collectedOrders, paymentAmount);
      setCollectPaymentDialogOpen(false);
      setPaymentAmount(0);
      fetchData();
      fetchDriverOrders(selectedDriver.id);
    } catch (error) {
      toast.error(t('فشل في تسجيل الدفعة'));
    }
  };

  // تحويل الطلب لسائق آخر
  const handleTransferDriver = async () => {
    if (!orderToTransfer || !targetDriverId) {
      toast.error(t('الرجاء اختيار السائق'));
      return;
    }
    
    try {
      await axios.post(`${API}/orders/${orderToTransfer.id}/transfer-driver`, {
        new_driver_id: targetDriverId
      });
      toast.success(t('تم تحويل الطلب للسائق الجديد'));
      setTransferDriverDialogOpen(false);
      setOrderToTransfer(null);
      setTargetDriverId('');
      fetchData();
      if (selectedDriver) {
        fetchDriverOrders(selectedDriver.id);
      }
    } catch (error) {
      showApiError(error, t('فشل في تحويل الطلب'));
    }
  };

  // فتح نافذة تحويل السائق وجلب جميع السائقين وبيانات الطلب
  const openTransferDriverDialog = async (orderInfo) => {
    setTransferDriverDialogOpen(true);
    
    try {
      // جلب جميع السائقين
      const driversRes = await axios.get(`${API}/drivers`);
      const filteredDrivers = driversRes.data.filter(d => d.id !== orderInfo.driver_id);
      setAllDriversForTransfer(filteredDrivers);
      
      // جلب بيانات الطلب الفعلية إذا كان لدينا order_id
      if (orderInfo.id) {
        try {
          const orderRes = await axios.get(`${API}/orders/${orderInfo.id}`);
          setOrderToTransfer({
            ...orderInfo,
            order_number: orderRes.data.order_number || orderInfo.order_number,
            total: orderRes.data.total || orderInfo.total,
            customer_name: orderRes.data.customer_name
          });
        } catch (orderError) {
          // إذا فشل جلب الطلب، استخدم البيانات الموجودة
          setOrderToTransfer(orderInfo);
        }
      } else {
        setOrderToTransfer(orderInfo);
      }
    } catch (error) {
      console.error('Error opening transfer dialog:', error);
      setAllDriversForTransfer([]);
      setOrderToTransfer(orderInfo);
    }
  };

  // السائقين المتاحين للتحويل (جميع السائقين ما عدا السائق الحالي)
  const availableDriversForTransfer = allDriversForTransfer;

  // تحديد طلب كمدفوع
  const markOrderAsPaid = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/driver-payment`, { is_paid: true });
      toast.success(t('تم تحديد الطلب كمدفوع'));
      fetchData();
      if (selectedDriver) {
        fetchDriverOrders(selectedDriver.id);
      }
    } catch (error) {
      toast.error(t('فشل في تحديث حالة الدفع'));
    }
  };

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

  // حساب الإجماليات
  const totalUnpaid = Object.values(driverStats).reduce((sum, s) => sum + (s.unpaid_total || 0), 0);
  const totalPaid = Object.values(driverStats).reduce((sum, s) => sum + (s.paid_today || 0), 0);
  const totalPendingOrders = Object.values(driverStats).reduce((sum, s) => sum + (s.pending_orders || 0), 0);

  return (
    <div className="min-h-screen bg-background" data-testid="delivery-page">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">{t('إدارة التوصيل')}</h1>
              <p className="text-sm text-muted-foreground">{t('متابعة السائقين والطلبات')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 ml-1" />
              {t('تحديث')}
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

            {(hasRole(['admin', 'manager']) || user?.permissions?.includes('delivery')) && (
              <div className="flex gap-2">
                {/* رابط تطبيق السائقين */}
                <Button 
                  variant="outline"
                  onClick={() => window.open('/driver-app', '_blank')}
                  className="bg-blue-500/10 border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white"
                >
                  <ExternalLink className="h-4 w-4 ml-2" />
                  {t('فتح تطبيق السائقين')}
                </Button>
                
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-primary text-primary-foreground" data-testid="add-driver-btn">
                      <Plus className="h-4 w-4 ml-2" />
                      {t('إضافة سائق')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-foreground">{t('إضافة سائق جديد')}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateDriver} className="space-y-4">
                      <div>
                        <Label className="text-foreground">{t('اسم السائق')} *</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          className="mt-1"
                          placeholder={t('الاسم الكامل للسائق')}
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">{t('رقم الهاتف')} *</Label>
                        <Input
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          required
                          className="mt-1"
                          placeholder="07xxxxxxxxx"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">{t('الفرع')} *</Label>
                        <Select 
                          value={formData.branch_id || selectedBranch || ''} 
                          onValueChange={(val) => setFormData({ ...formData, branch_id: val })}
                        >
                          <SelectTrigger className="mt-1 bg-background border-input">
                            <SelectValue placeholder={t('اختر الفرع')} />
                          </SelectTrigger>
                          <SelectContent>
                            {branches.map(branch => (
                              <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">{t('السائق سيرى طلبات هذا الفرع فقط')}</p>
                      </div>
                      <div>
                        <Label className="text-foreground">{t('الرمز السري')} (PIN) *</Label>
                        <Input
                          type="password"
                          value={formData.pin}
                          onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                          required
                          maxLength={6}
                          placeholder={t('4-6 أرقام')}
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">{t('يستخدم السائق هذا الرمز لتسجيل الدخول')}</p>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                          {t('إلغاء')}
                        </Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                          {t('إضافة')}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* إحصائيات سريعة */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('إجمالي غير المدفوع')}</p>
                  <p className="text-2xl font-bold text-red-500">{formatPrice(totalUnpaid)}</p>
                </div>
                <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('المدفوع اليوم')}</p>
                  <p className="text-2xl font-bold text-green-500">{formatPrice(totalPaid)}</p>
                </div>
                <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('طلبات معلقة')}</p>
                  <p className="text-2xl font-bold text-amber-500">{totalPendingOrders}</p>
                </div>
                <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center">
                  <Package className="h-6 w-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('السائقين النشطين')}</p>
                  <p className="text-2xl font-bold text-blue-500">{drivers.filter(d => !d.is_available).length}/{drivers.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center">
                  <Truck className="h-6 w-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="drivers" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 max-w-4xl h-auto">
            <TabsTrigger value="drivers">{t('السائقين والحسابات')}</TabsTrigger>
            <TabsTrigger value="map" className="flex items-center gap-1">
              <Map className="h-4 w-4" />
              {t('الخريطة')}
            </TabsTrigger>
            <TabsTrigger value="pending">{t('طلبات جاهزة للتوصيل')}</TabsTrigger>
            <TabsTrigger value="all-orders" className="flex items-center gap-1" data-testid="all-orders-tab">
              <Package className="h-4 w-4" />
              {t('كل الطلبات')}
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-1" data-testid="performance-tab">
              <BarChart3 className="h-4 w-4" />
              {t('الأداء')}
            </TabsTrigger>
            <TabsTrigger value="ratings" className="flex items-center gap-1" data-testid="ratings-tab">
              <Star className="h-4 w-4" />
              {t('سجل التقييمات')}
            </TabsTrigger>
          </TabsList>

          {/* السائقين */}
          <TabsContent value="drivers">
            {/* شريط أدوات تحديد ومسح السائقين */}
            {drivers.length > 0 && (
              <div className="flex items-center justify-between mb-4 p-3 bg-card rounded-lg border border-border/50">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                    className={selectedDrivers.length === drivers.length ? 'bg-primary text-primary-foreground' : ''}
                  >
                    {selectedDrivers.length === drivers.length ? t('إلغاء تحديد الكل') : t('تحديد الكل')}
                  </Button>
                  {selectedDrivers.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {t('تم تحديد')} {selectedDrivers.length} {t('من')} {drivers.length}
                    </span>
                  )}
                </div>
                {selectedDrivers.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    <Trash2 className="h-4 w-4 ml-2" />
                    {t('حذف المحدد')} ({selectedDrivers.length})
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {drivers.length === 0 ? (
                <Card className="border-border/50 bg-card col-span-full">
                  <CardContent className="py-12 text-center">
                    <Truck className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground text-lg">{t('لا يوجد سائقين')}</p>
                    <p className="text-sm text-muted-foreground">{t('أضف سائقين لبدء إدارة التوصيل')}</p>
                  </CardContent>
                </Card>
              ) : (
                drivers.map(driver => {
                  const stats = driverStats[driver.id] || { unpaid_total: 0, paid_today: 0, pending_orders: 0 };
                  const isSelected = selectedDrivers.includes(driver.id);
                  return (
                    <Card 
                      key={driver.id}
                      className={`border-border/50 bg-card transition-all hover:shadow-lg cursor-pointer ${
                        driver.current_order_id ? 'ring-2 ring-orange-500' : ''
                      } ${stats.unpaid_total > 0 ? 'border-r-4 border-r-red-500' : ''} ${
                        isSelected ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => openDriverDetails(driver)}
                      data-testid={`driver-card-${driver.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            {/* Checkbox للتحديد */}
                            <div 
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer ${
                                isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'
                              }`}
                              onClick={(e) => { e.stopPropagation(); toggleSelectDriver(driver.id); }}
                            >
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              driver.is_available ? 'bg-green-500/10' : 'bg-orange-500/10'
                            }`}>
                              <Truck className={`h-6 w-6 ${driver.is_available ? 'text-green-500' : 'text-orange-500'}`} />
                            </div>
                            <div>
                              <h3 className="font-bold text-foreground">{driver.name}</h3>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {driver.phone}
                              </p>
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            driver.is_available ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'
                          }`}>
                            {driver.is_available ? t('متاح') : t('في مهمة')}
                          </span>
                        </div>

                        {/* إحصائيات السائق */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-red-500/10 p-2 rounded-lg text-center">
                            <p className="text-xs text-muted-foreground">{t('غير مدفوع')}</p>
                            <p className="text-sm font-bold text-red-500">{formatPrice(stats.unpaid_total || 0)}</p>
                          </div>
                          <div className="bg-green-500/10 p-2 rounded-lg text-center">
                            <p className="text-xs text-muted-foreground">{t('مدفوع اليوم')}</p>
                            <p className="text-sm font-bold text-green-500">{formatPrice(stats.paid_today || 0)}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{driver.total_deliveries || 0} {t('توصيلة')}</span>
                          <span>{stats.pending_orders || 0} {t('طلب معلق')}</span>
                        </div>

                        {driver.current_order_id && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-orange-500">{t('في طريقه للتوصيل')}</span>
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600 text-white"
                                onClick={(e) => { e.stopPropagation(); completeDelivery(driver.id); }}
                              >
                                <Check className="h-4 w-4 ml-1" />
                                {t('تم التسليم')}
                              </Button>
                            </div>
                            {/* زر تحويل الطلب لسائق آخر */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full border-amber-500 text-amber-500 hover:bg-amber-500/10"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                // استدعاء الدالة التي تجلب السائقين وتفتح النافذة
                                openTransferDriverDialog({
                                  id: driver.current_order_id,
                                  order_number: driver.current_order?.order_number || '---',
                                  total: driver.current_order?.total || 0,
                                  driver_id: driver.id,
                                  driver_name: driver.name
                                });
                              }}
                              data-testid={`transfer-driver-order-${driver.id}`}
                            >
                              <ArrowLeftRight className="h-4 w-4 ml-1" />
                              {t('تحويل لسائق آخر')}
                            </Button>
                          </div>
                        )}

                        <Button 
                          variant="outline" 
                          className="w-full mt-3"
                          onClick={(e) => { e.stopPropagation(); openDriverDetails(driver); }}
                        >
                          <Eye className="h-4 w-4 ml-2" />
                          {t('عرض التفاصيل')}
                        </Button>
                        
                        {/* أزرار التعديل والحذف */}
                        <div className="flex gap-2 mt-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="flex-1"
                            onClick={(e) => { e.stopPropagation(); openEditDialog(driver); }}
                          >
                            <Edit className="h-4 w-4 ml-1" />
                            {t('تعديل')}
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={(e) => { e.stopPropagation(); handleDeleteDriver(driver.id, driver.name); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {/* معلومات الفرع */}
                        {driver.branch_id && (
                          <div className="mt-2 p-2 bg-green-500/10 rounded-lg">
                            <p className="text-xs text-green-400">
                              <Building className="h-3 w-3 inline ml-1" />
                              {t('الفرع')}: {branches.find(b => b.id === driver.branch_id)?.name || t('غير محدد')}
                            </p>
                          </div>
                        )}
                        
                        {/* رابط تطبيق السائق */}
                        <div className="mt-2 p-2 bg-blue-500/10 rounded-lg">
                          <p className="text-xs text-blue-400 mb-1">{t('رابط للسائق')}:</p>
                          <button
                            className="text-xs text-blue-300 hover:text-blue-200 break-all text-right"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = `${window.location.origin}/driver-app`;
                              navigator.clipboard.writeText(url);
                              toast.success(t('تم نسخ الرابط!'));
                            }}
                          >
                            📋 {t('انسخ الرابط')}
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* خريطة تتبع السائقين */}
          <TabsContent value="map">
            <Card className="border-border/50 bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-foreground">
                  <div className="flex items-center gap-2">
                    <Map className="h-5 w-5 text-primary" />
                    {t('تتبع السائقين على الخريطة')}
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchDriverLocations}>
                    <RefreshCw className="h-4 w-4 ml-1" />
                    {t('تحديث المواقع')}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* قائمة السائقين مع حالتهم */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {driverLocations.map(driver => (
                    <div 
                      key={driver.id}
                      className={`p-3 rounded-lg border ${
                        driver.location_lat && driver.location_lng 
                          ? 'border-green-500/30 bg-green-500/10' 
                          : 'border-gray-500/30 bg-gray-500/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                          driver.location_lat ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
                        }`} />
                        <span className="font-medium text-sm text-foreground">{driver.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {driver.location_lat && driver.location_lng ? (
                          <>
                            <Locate className="h-3 w-3 inline ml-1" />
                            {driver.location_updated_at ? (
                              `${t('آخر تحديث')}: ${new Date(driver.location_updated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                            ) : t('موقع متاح')}
                          </>
                        ) : (
                          t('لا يوجد موقع')
                        )}
                      </p>
                      {driver.current_order && (
                        <div className="mt-2 pt-2 border-t border-border text-xs">
                          <span className="text-orange-500">{t('طلب')} #{driver.current_order.order_number}</span>
                          {driver.current_order.delivery_address && (
                            <p className="text-muted-foreground truncate">
                              {driver.current_order.delivery_address}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* الخريطة المتقدمة */}
                <div className="rounded-xl overflow-hidden border border-gray-700">
                  <DriverTrackingMap 
                    drivers={driverLocations}
                    orders={pendingOrders}
                    height="550px"
                    showControls={true}
                    showDriverList={true}
                    autoRefresh={true}
                    refreshInterval={15000}
                  />
                </div>

                {/* تعليمات */}
                <div className="mt-4 p-3 bg-blue-500/10 rounded-lg">
                  <p className="text-sm text-blue-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {t('لتتبع السائقين: يجب على كل سائق فتح تطبيقه والسماح بالوصول للموقع')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* طلبات جاهزة للتوصيل - محسن */}
          <TabsContent value="pending">
            {/* إحصائيات حركة اليوم */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <Card className="border-border/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5">
                <CardContent className="p-3 text-center">
                  <Package className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                  <p className="text-xs text-muted-foreground">{t('جاهزة للتوصيل')}</p>
                  <p className="text-xl font-bold text-blue-500">{pendingOrders.length}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-gradient-to-br from-orange-500/10 to-orange-600/5">
                <CardContent className="p-3 text-center">
                  <Truck className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                  <p className="text-xs text-muted-foreground">{t('في الطريق')}</p>
                  <p className="text-xl font-bold text-orange-500">
                    {drivers.filter(d => d.current_order_id).length}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-gradient-to-br from-green-500/10 to-green-600/5">
                <CardContent className="p-3 text-center">
                  <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-500" />
                  <p className="text-xs text-muted-foreground">{t('تم التسليم اليوم')}</p>
                  <p className="text-xl font-bold text-green-500">
                    {Object.values(driverStats).reduce((sum, s) => sum + (s.delivered_today || 0), 0)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-gradient-to-br from-purple-500/10 to-purple-600/5">
                <CardContent className="p-3 text-center">
                  <DollarSign className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                  <p className="text-xs text-muted-foreground">{t('تم التحصيل')}</p>
                  <p className="text-xl font-bold text-purple-500">{formatPrice(totalPaid)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-gradient-to-br from-red-500/10 to-red-600/5">
                <CardContent className="p-3 text-center">
                  <AlertCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
                  <p className="text-xs text-muted-foreground">{t('غير محصل')}</p>
                  <p className="text-xl font-bold text-red-500">{formatPrice(totalUnpaid)}</p>
                </CardContent>
              </Card>
            </div>

            {/* قائمة الطلبات مع حالاتها */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* الطلبات الجاهزة للتعيين */}
              <Card className="border-border/50 bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-blue-500">
                    <Package className="h-5 w-5" />
                    {t('جاهزة للتعيين')}
                    <span className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded-full text-xs mr-auto">
                      {pendingOrders.filter(o => !o.driver_id).length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {pendingOrders.filter(o => !o.driver_id).length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 text-sm">{t('لا توجد طلبات')}</p>
                      ) : (
                        pendingOrders.filter(o => !o.driver_id).map(order => (
                          <div 
                            key={order.id}
                            className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-foreground">#{order.order_number}</span>
                              <span className="text-primary font-bold">{formatPrice(order.total)}</span>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{order.customer_name || t('زبون')}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" />
                              {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {drivers.filter(d => d.is_available).slice(0, 3).map(driver => (
                                <Button
                                  key={driver.id}
                                  size="sm"
                                  className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white"
                                  onClick={() => openAssignDialog(driver, order)}
                                >
                                  {driver.name}
                                </Button>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* في حيازة السائق (في الطريق) */}
              <Card className="border-border/50 bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-orange-500">
                    <Truck className="h-5 w-5" />
                    {t('في حيازة السائق')}
                    <span className="bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded-full text-xs mr-auto">
                      {drivers.filter(d => d.current_order_id).length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {drivers.filter(d => d.current_order_id).length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 text-sm">{t('لا توجد طلبات في الطريق')}</p>
                      ) : (
                        drivers.filter(d => d.current_order_id).map(driver => (
                          <div 
                            key={driver.id}
                            className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/5"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center">
                                  <Truck className="h-4 w-4 text-orange-500" />
                                </div>
                                <div>
                                  <p className="font-bold text-foreground text-sm">{driver.name}</p>
                                  <p className="text-xs text-orange-500">#{driver.current_order?.order_number || '---'}</p>
                                </div>
                              </div>
                              <span className="text-primary font-bold">
                                {formatPrice(driver.current_order?.total || 0)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mb-2">
                              {driver.current_order?.customer_name || t('زبون')}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 h-7 text-xs bg-green-500 hover:bg-green-600 text-white"
                                onClick={() => completeDelivery(driver.id)}
                              >
                                <Check className="h-3 w-3 ml-1" />
                                {t('تم التسليم')}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-amber-500 text-amber-500"
                                onClick={() => {
                                  openTransferDriverDialog({
                                    id: driver.current_order_id,
                                    order_number: driver.current_order?.order_number || '---',
                                    total: driver.current_order?.total || 0,
                                    driver_id: driver.id,
                                    driver_name: driver.name
                                  });
                                }}
                              >
                                <ArrowLeftRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* حركة اليوم - آخر الطلبات المسلمة */}
              <Card className="border-border/50 bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-green-500">
                    <History className="h-5 w-5" />
                    {t('حركة اليوم')}
                    <span className="bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full text-xs mr-auto">
                      {driverOrders.filter(o => o.status === 'delivered').length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {driverOrders.filter(o => o.status === 'delivered').length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 text-sm">{t('لا توجد طلبات مسلمة اليوم')}</p>
                      ) : (
                        driverOrders.filter(o => o.status === 'delivered').slice(0, 20).map((order, index) => (
                          <div 
                            key={order.id}
                            className={`p-2 rounded-lg border ${
                              order.driver_payment_status === 'paid' 
                                ? 'border-green-500/30 bg-green-500/5' 
                                : 'border-red-500/30 bg-red-500/5'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{index + 1}.</span>
                                <div>
                                  <p className="text-sm font-medium text-foreground">#{order.order_number}</p>
                                  <p className="text-xs text-muted-foreground">{order.driver_name || t('سائق')}</p>
                                </div>
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-bold text-foreground">{formatPrice(order.total)}</p>
                                <span className={`text-xs ${
                                  order.driver_payment_status === 'paid' ? 'text-green-500' : 'text-red-500'
                                }`}>
                                  {order.driver_payment_status === 'paid' ? t('✓ محصل') : t('○ غير محصل')}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* أداء السائقين */}
          <TabsContent value="performance">
            <div className="space-y-4" data-testid="performance-content">
              {/* اختيار الفترة */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  {t('تقرير أداء السائقين')}
                </h2>
                <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
                  {[
                    { v: 'today', l: t('اليوم') },
                    { v: 'week', l: t('أسبوع') },
                    { v: 'month', l: t('شهر') }
                  ].map(p => (
                    <Button
                      key={p.v}
                      size="sm"
                      variant={perfPeriod === p.v ? 'default' : 'ghost'}
                      onClick={() => setPerfPeriod(p.v)}
                      data-testid={`perf-period-${p.v}`}
                    >
                      {p.l}
                    </Button>
                  ))}
                </div>
              </div>

              {/* إجماليات الفترة */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="border-border/50 bg-card">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('إجمالي التوصيلات')}</p>
                      <p className="text-2xl font-bold text-blue-500" data-testid="perf-total-deliveries">{perfData?.totals?.deliveries ?? 0}</p>
                    </div>
                    <Package className="h-8 w-8 text-blue-500/40" />
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('أجور التوصيل المحققة')}</p>
                      <p className="text-2xl font-bold text-green-500" data-testid="perf-total-fees">{formatPrice(perfData?.totals?.total_fees ?? 0)}</p>
                    </div>
                    <DollarSign className="h-8 w-8 text-green-500/40" />
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('متوسط زمن التوصيل')}</p>
                      <p className="text-2xl font-bold text-amber-500" data-testid="perf-avg-time">
                        {perfData?.totals?.avg_delivery_minutes != null ? `${perfData.totals.avg_delivery_minutes} ${t('د')}` : '—'}
                      </p>
                    </div>
                    <Timer className="h-8 w-8 text-amber-500/40" />
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-card">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('مسافة تقديرية (كم)')}</p>
                      <p className="text-2xl font-bold text-purple-500" data-testid="perf-total-distance">{perfData?.totals?.distance_km ?? 0}</p>
                    </div>
                    <Route className="h-8 w-8 text-purple-500/40" />
                  </CardContent>
                </Card>
              </div>

              {/* قائمة السائقين مرتبة */}
              <Card className="border-border/50 bg-card">
                <CardContent className="p-0">
                  {perfLoading && !perfData ? (
                    <div className="p-8 text-center text-muted-foreground">{t('جاري التحميل')}...</div>
                  ) : (perfData?.drivers || []).length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">{t('لا يوجد سائقين')}</div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {/* رأس الجدول (شاشات متوسطة فأعلى) */}
                      <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-xs text-muted-foreground bg-muted/30">
                        <div className="col-span-3">{t('السائق')}</div>
                        <div className="col-span-2 text-center">{t('التوصيلات')}</div>
                        <div className="col-span-2 text-center">{t('أجور التوصيل')}</div>
                        <div className="col-span-2 text-center">{t('متوسط الزمن')}</div>
                        <div className="col-span-2 text-center">{t('المسافة (كم)')}</div>
                        <div className="col-span-1 text-center">{t('نشط')}</div>
                      </div>
                      {(perfData?.drivers || []).map((d, idx) => {
                        const isTop = idx === 0 && d.deliveries > 0;
                        return (
                          <div
                            key={d.driver_id}
                            className={`grid grid-cols-2 md:grid-cols-12 gap-2 px-4 py-3 items-center ${isTop ? 'bg-amber-500/10' : ''}`}
                            data-testid={`perf-row-${d.driver_id}`}
                          >
                            <div className="col-span-2 md:col-span-3 flex items-center gap-2">
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                isTop ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'
                              }`}>
                                {isTop ? <Trophy className="h-4 w-4" /> : idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-foreground truncate">{d.name} {isTop && '🏆'}</p>
                                <p className="text-xs text-muted-foreground" dir="ltr">{d.phone}</p>
                              </div>
                            </div>
                            <div className="md:col-span-2 text-center">
                              <span className="md:hidden text-xs text-muted-foreground">{t('توصيلات')}: </span>
                              <span className="font-bold text-blue-500">{d.deliveries}</span>
                            </div>
                            <div className="md:col-span-2 text-center">
                              <span className="md:hidden text-xs text-muted-foreground">{t('أجور')}: </span>
                              <span className="font-bold text-green-500">{formatPrice(d.total_fees)}</span>
                            </div>
                            <div className="md:col-span-2 text-center">
                              <span className="md:hidden text-xs text-muted-foreground">{t('الزمن')}: </span>
                              <span className={`font-bold ${d.avg_delivery_minutes > 60 ? 'text-red-500' : 'text-amber-500'}`}>
                                {d.avg_delivery_minutes != null ? `${d.avg_delivery_minutes} ${t('د')}` : '—'}
                              </span>
                            </div>
                            <div className="md:col-span-2 text-center">
                              <span className="md:hidden text-xs text-muted-foreground">{t('المسافة')}: </span>
                              <span className="font-bold text-purple-500">{d.distance_km}</span>
                            </div>
                            <div className="md:col-span-1 text-center">
                              {d.active_orders > 0 ? (
                                <Badge className="bg-blue-500/15 text-blue-500 border-0">{d.active_orders} 🛵</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                ℹ️ {t('متوسط الزمن: من انطلاق السائق (أو إنشاء الطلب) حتى التسليم. المسافة: تقديرية من الفرع لموقع الزبون (تتطلب تحديد موقع الفرع في الإعدادات).')}
              </p>
            </div>
          </TabsContent>

          {/* كل الطلبات (عرض شامل: مرفوض/متأخر القبول/مقبول/قيد التحضير/مكتمل) */}
          <TabsContent value="all-orders">
            <div className="space-y-4" data-testid="all-orders-content">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Package className="h-5 w-5 text-amber-500" />
                {t('كل الطلبات الواردة')} ({ordersSummary.all})
              </h2>

              {/* شرائح التصفية */}
              <div className="flex flex-wrap gap-2">
                {[
                  { k: 'all', l: t('الكل'), n: ordersSummary.all, c: 'bg-muted text-foreground' },
                  { k: 'late', l: t('متأخر القبول'), n: ordersSummary.late, c: 'bg-orange-500/15 text-orange-600 border border-orange-500/30' },
                  { k: 'rejected', l: t('مرفوض'), n: ordersSummary.rejected, c: 'bg-red-500/15 text-red-600 border border-red-500/30' },
                  { k: 'accepted', l: t('مقبول'), n: ordersSummary.accepted, c: 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30' },
                  { k: 'preparing', l: t('قيد التحضير'), n: ordersSummary.preparing, c: 'bg-blue-500/15 text-blue-600 border border-blue-500/30' },
                  { k: 'completed', l: t('مكتمل'), n: ordersSummary.completed, c: 'bg-gray-500/15 text-gray-600 border border-gray-500/30' },
                ].map((f) => (
                  <button
                    key={f.k}
                    onClick={() => setOrdersFilter(f.k)}
                    data-testid={`orders-filter-${f.k}`}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${f.c} ${ordersFilter === f.k ? 'ring-2 ring-amber-500' : 'opacity-80 hover:opacity-100'}`}
                  >
                    {f.l} ({f.n})
                  </button>
                ))}
              </div>

              {(() => {
                const filtered = allOrders.filter((o) => {
                  if (ordersFilter === 'all') return true;
                  if (ordersFilter === 'late') return o.is_late;
                  return o.category === ordersFilter;
                });
                if (filtered.length === 0) {
                  return (
                    <Card className="border-border/50 bg-card">
                      <CardContent className="py-12 text-center">
                        <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground text-lg">{t('لا توجد طلبات')}</p>
                      </CardContent>
                    </Card>
                  );
                }
                const catBadge = (o) => {
                  if (o.is_rejected) return { l: t('مرفوض'), c: 'bg-red-500/15 text-red-600 border-red-500/30' };
                  if (o.category === 'completed') return { l: t('مكتمل'), c: 'bg-gray-500/15 text-gray-600 border-gray-500/30' };
                  if (o.category === 'cancelled') return { l: t('ملغي'), c: 'bg-red-500/10 text-red-500 border-red-500/20' };
                  if (o.category === 'preparing') return { l: t('قيد التحضير'), c: 'bg-blue-500/15 text-blue-600 border-blue-500/30' };
                  if (o.category === 'accepted') return { l: t('مقبول'), c: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' };
                  return { l: t('بانتظار القبول'), c: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' };
                };
                return (
                  <div className="space-y-3">
                    {filtered.map((o) => {
                      const b = catBadge(o);
                      return (
                        <Card key={o.id} className="border-border/50 bg-card" data-testid={`delivery-order-${o.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-foreground">#{o.order_number}</span>
                                  <span className="text-foreground">{o.customer_name || t('زبون')}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full border ${b.c}`}>{b.l}</span>
                                  {o.is_late && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-600 border border-orange-500/30">⏱ {t('متأخر القبول')}</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {o.driver_name ? `${t('السائق')}: ${o.driver_name} • ` : ''}
                                  {o.items_count} {t('عناصر')} • {new Date(o.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                {o.delivery_address && <p className="text-xs text-muted-foreground">{o.delivery_address}</p>}
                                {o.is_rejected && o.cancellation_reason && (
                                  <p className="text-xs text-red-500 mt-1">{t('سبب الرفض')}: {o.cancellation_reason}{o.rejected_by_name ? ` (${o.rejected_by_name})` : ''}</p>
                                )}
                                {typeof o.acceptance_delay_seconds === 'number' && o.acceptance_delay_seconds > 0 && (
                                  <p className="text-xs text-muted-foreground">{t('زمن القبول')}: {Math.floor(o.acceptance_delay_seconds / 60)}{t('د')} {o.acceptance_delay_seconds % 60}{t('ث')}</p>
                                )}
                              </div>
                              <div className="text-left">
                                <p className="font-bold text-primary tabular-nums">{Number(o.total || 0).toLocaleString()} IQD</p>
                                {o.delivery_fee > 0 && <p className="text-xs text-muted-foreground">{t('توصيل')}: {Number(o.delivery_fee).toLocaleString()}</p>}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </TabsContent>

          {/* سجل التقييمات */}
          <TabsContent value="ratings">
            <div className="space-y-4" data-testid="ratings-content">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                {t('سجل التقييمات')} ({ratingsSummary.count})
              </h2>

              {/* ملخص المتوسطات */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { l: t('الطعام'), v: ratingsSummary.avg_food, icon: '🍽️' },
                  { l: t('المطعم'), v: ratingsSummary.avg_restaurant, icon: '🏪' },
                  { l: t('السائق'), v: ratingsSummary.avg_driver, icon: '🛵' },
                ].map((s, i) => (
                  <Card key={i} className="border-border/50 bg-card">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl mb-1">{s.icon}</div>
                      <div className="flex items-center justify-center gap-1">
                        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                        <span className="text-2xl font-bold text-foreground">{s.v || '—'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.l}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* قائمة التقييمات */}
              {ratings.length === 0 ? (
                <Card className="border-border/50 bg-card">
                  <CardContent className="py-12 text-center">
                    <Star className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground text-lg">{t('لا توجد تقييمات بعد')}</p>
                    <p className="text-sm text-muted-foreground">{t('تظهر التقييمات هنا بعد أن يقيّم الزبائن طلباتهم المسلّمة')}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {ratings.map((r) => (
                    <Card key={r.id} className="border-border/50 bg-card" data-testid={`rating-row-${r.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="font-bold text-foreground">#{r.order_number} • {r.customer_name || t('زبون')}</p>
                            <p className="text-xs text-muted-foreground">{r.driver_name || '—'} • {new Date(r.created_at).toLocaleString('ar')}</p>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm">
                            <span className="flex items-center gap-1">🍽️ <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {r.food_rating || '—'}</span>
                            <span className="flex items-center gap-1">🏪 <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {r.restaurant_rating || '—'}</span>
                            <span className="flex items-center gap-1">🛵 <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {r.driver_rating || '—'}</span>
                          </div>
                        </div>
                        {r.notes && (
                          <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg p-2">
                            <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{r.notes}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* نافذة تفاصيل السائق */}
      <Dialog open={driverOrdersDialogOpen} onOpenChange={setDriverOrdersDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-foreground">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                {selectedDriver?.name} - سجل الطلبات
              </div>
              {selectedDriver && driverStats[selectedDriver.id]?.unpaid_total > 0 && (
                <Button 
                  size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white"
                  data-testid="collect-payment-btn"
                  onClick={() => {
                    setPaymentAmount(driverStats[selectedDriver.id]?.unpaid_total || 0);
                    setCollectPaymentDialogOpen(true);
                  }}
                >
                  <Wallet className="h-4 w-4 ml-1" />
                  تحصيل المبلغ
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedDriver && (
            <div className="space-y-4">
              {/* ملخص */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-500/10 p-3 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{t('غير مدفوع')}</p>
                  <p className="text-lg font-bold text-red-500">
                    {formatPrice(driverStats[selectedDriver.id]?.unpaid_total || 0)}
                  </p>
                </div>
                <div className="bg-green-500/10 p-3 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{t('مدفوع اليوم')}</p>
                  <p className="text-lg font-bold text-green-500">
                    {formatPrice(driverStats[selectedDriver.id]?.paid_today || 0)}
                  </p>
                </div>
                <div className="bg-blue-500/10 p-3 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{t('إجمالي التوصيلات')}</p>
                  <p className="text-lg font-bold text-blue-500">
                    {selectedDriver.total_deliveries || 0}
                  </p>
                </div>
              </div>

              {/* قائمة الطلبات */}
              <div>
                <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  الطلبات (غير المدفوعة أولاً)
                </h4>
                <ScrollArea className="h-[350px]">
                  <div className="space-y-2">
                    {driverOrders.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">{t('لا توجد طلبات')}</p>
                    ) : (
                      driverOrders.map(order => (
                        <div 
                          key={order.id}
                          className={`p-3 rounded-lg border ${
                            order.driver_payment_status === 'paid' 
                              ? 'bg-green-500/5 border-green-500/30' 
                              : 'bg-red-500/5 border-red-500/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                order.driver_payment_status === 'paid' ? 'bg-green-500/20' : 'bg-red-500/20'
                              }`}>
                                {order.driver_payment_status === 'paid' 
                                  ? <CheckCircle className="h-4 w-4 text-green-500" />
                                  : <AlertCircle className="h-4 w-4 text-red-500" />
                                }
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">#{order.order_number}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    order.driver_payment_status === 'paid' 
                                      ? 'bg-green-500/20 text-green-500' 
                                      : 'bg-red-500/20 text-red-500'
                                  }`}>
                                    {order.driver_payment_status === 'paid' ? t('مدفوع') : t('غير مدفوع')}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {order.customer_name} - {new Date(order.created_at).toLocaleDateString('en-GB')}
                                </p>
                              </div>
                            </div>
                            <div className="text-left">
                              <p className="font-bold text-foreground">{formatPrice(order.total)}</p>
                              <div className="flex gap-1 mt-1">
                                {order.status !== 'delivered' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-amber-500 text-amber-500 hover:bg-amber-500/10"
                                    onClick={() => openTransferDriverDialog(order)}
                                    data-testid={`transfer-order-${order.id}`}
                                  >
                                    <ArrowLeftRight className="h-3 w-3 ml-1" />
                                    تحويل
                                  </Button>
                                )}
                                {order.driver_payment_status !== 'paid' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-green-500 text-green-500 hover:bg-green-500/10"
                                    onClick={() => markOrderAsPaid(order.id)}
                                  >
                                    <Check className="h-3 w-3 ml-1" />
                                    تم الدفع
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* نافذة إسناد السائق مع أجور التوصيل */}
      <Dialog open={assignFeeDialogOpen} onOpenChange={setAssignFeeDialogOpen}>
        <DialogContent className="max-w-sm" data-testid="assign-fee-dialog">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-500" />
              {t('إسناد الطلب للسائق')} {pendingAssign?.driverName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-center">
              <div>
                <p className="text-xs text-muted-foreground">{t('رقم الطلب')}</p>
                <p className="font-bold text-foreground">#{pendingAssign?.orderNumber}</p>
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground">{t('المبلغ')}</p>
                <p className="font-bold text-primary">{formatPrice(pendingAssign?.orderTotal || 0)}</p>
              </div>
            </div>
            <div>
              <Label className="text-foreground">{t('أجور التوصيل')} ({t('تُضاف للفاتورة وتظهر للزبون')})</Label>
              <Input
                type="number"
                min="0"
                value={assignDeliveryFee}
                onChange={(e) => setAssignDeliveryFee(e.target.value)}
                placeholder="0"
                className="mt-1 text-lg font-bold text-center"
                data-testid="assign-delivery-fee-input"
              />
              {assignFeeHint && (
                <p className="text-xs text-amber-500 mt-1" data-testid="assign-fee-hint">{assignFeeHint}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {[0, 1000, 2000, 3000, 5000].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={Number(assignDeliveryFee) === v && assignDeliveryFee !== '' ? 'default' : 'outline'}
                    onClick={() => setAssignDeliveryFee(String(v))}
                    data-testid={`assign-fee-quick-${v}`}
                  >
                    {v === 0 ? t('بدون') : v.toLocaleString()}
                  </Button>
                ))}
              </div>
              {Number(assignDeliveryFee) > 0 && (
                <p className="text-xs text-green-500 mt-2">
                  {t('الإجمالي الجديد')}: {formatPrice((pendingAssign?.orderTotal || 0) + Number(assignDeliveryFee))}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAssignFeeDialogOpen(false)} className="flex-1">
                {t('إلغاء')}
              </Button>
              <Button
                onClick={() => assignDriver(pendingAssign.driverId, pendingAssign.orderId, Number(assignDeliveryFee) || 0)}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                data-testid="confirm-assign-with-fee"
              >
                <Check className="h-4 w-4 ml-1" />
                {t('إسناد')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة تحصيل الدفعة */}
      <Dialog open={collectPaymentDialogOpen} onOpenChange={setCollectPaymentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-500" />
              تحصيل مبلغ من {selectedDriver?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">{t('المبلغ المستحق')}</p>
              <p className="text-2xl font-bold text-red-500">
                {formatPrice(driverStats[selectedDriver?.id]?.unpaid_total || 0)}
              </p>
            </div>
            
            <div>
              <Label className="text-foreground">{t('المبلغ المحصل')}</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Number(e.target.value))}
                className="mt-1 text-lg font-bold text-center"
              />
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCollectPaymentDialogOpen(false)} className="flex-1">
                {t('إلغاء')}
              </Button>
              <Button 
                onClick={handleCollectPayment}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                data-testid="confirm-collect-payment-btn"
              >
                <Check className="h-4 w-4 ml-1" />
                {t('تأكيد التحصيل')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة تعديل السائق */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Edit className="h-5 w-5 text-blue-500" />
              تعديل بيانات السائق
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditDriver} className="space-y-4">
            <div>
              <Label className="text-foreground">{t('اسم السائق')}</Label>
              <Input
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder={t('اسم السائق')}
                required
              />
            </div>
            <div>
              <Label className="text-foreground">{t('رقم الهاتف')}</Label>
              <Input
                value={editFormData.phone}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                placeholder="07xxxxxxxxx"
                required
              />
            </div>
            <div>
              <Label className="text-foreground">{t('الرمز السري الجديد (PIN)')}</Label>
              <Input
                type="password"
                value={editFormData.pin}
                onChange={(e) => setEditFormData({ ...editFormData, pin: e.target.value })}
                placeholder={t('اتركه فارغاً للإبقاء على الرمز الحالي')}
                maxLength={6}
              />
              <p className="text-xs text-muted-foreground mt-1">{t('اتركه فارغاً إذا لم ترد تغيير الرمز')}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1">
                {t('إلغاء')}
              </Button>
              <Button type="submit" className="flex-1 bg-blue-500 hover:bg-blue-600 text-white">
                <Check className="h-4 w-4 ml-1" />
                {t('حفظ التعديلات')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* نافذة تحويل الطلب لسائق آخر */}
      <Dialog open={transferDriverDialogOpen} onOpenChange={setTransferDriverDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-amber-500" />
              تحويل الطلب لسائق آخر
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {orderToTransfer && (
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('رقم الطلب:')}</p>
                    <p className="font-bold text-lg text-foreground">#{orderToTransfer.order_number}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm text-muted-foreground">{t('المبلغ:')}</p>
                    <p className="font-bold text-primary">{formatPrice(orderToTransfer.total)}</p>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-sm text-muted-foreground">{t('السائق الحالي:')}</p>
                  <p className="font-medium text-foreground">{orderToTransfer.driver_name || selectedDriver?.name || t('غير معين')}</p>
                </div>
              </div>
            )}
            
            <div>
              <Label className="text-foreground">{t('اختر السائق الجديد:')}</Label>
              <Select value={targetDriverId} onValueChange={setTargetDriverId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder={t('اختر السائق')} />
                </SelectTrigger>
                <SelectContent>
                  {availableDriversForTransfer.map(driver => (
                    <SelectItem key={driver.id} value={driver.id}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${driver.is_available ? 'bg-green-500' : 'bg-orange-500'}`}></span>
                        {driver.name} - {driver.is_available ? t('متاح') : t('في مهمة')}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {availableDriversForTransfer.length === 0 && (
                <p className="text-sm text-amber-500 mt-2">{t('لا يوجد سائقين آخرين نشطين')}</p>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setTransferDriverDialogOpen(false);
                setOrderToTransfer(null);
                setTargetDriverId('');
              }}
              className="flex-1"
            >
              إلغاء
            </Button>
            <Button 
              onClick={handleTransferDriver}
              disabled={!targetDriverId}
              className="flex-1 bg-amber-500 text-white hover:bg-amber-600"
            >
              <ArrowLeftRight className="h-4 w-4 ml-2" />
              تحويل
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة تأكيد حذف السائقين المحددين */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 text-red-500">
              <AlertCircle className="h-5 w-5" />
              تأكيد الحذف
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-foreground">
              هل أنت متأكد من حذف <span className="font-bold text-red-500">{selectedDrivers.length}</span> سائق؟
            </p>
            <p className="text-sm text-muted-foreground mt-2">{t('هذا الإجراء لا يمكن التراجع عنه.')}</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirmOpen(false)}
              className="flex-1"
            >
              {t('إلغاء')}
            </Button>
            <Button 
              onClick={handleDeleteSelectedDrivers}
              className="flex-1 bg-red-500 text-white hover:bg-red-600"
            >
              <Trash2 className="h-4 w-4 ml-2" />
              {t('حذف نهائي')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
