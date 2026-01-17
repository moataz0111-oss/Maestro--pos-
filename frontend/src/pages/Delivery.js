import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
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
  Link,
  UserCheck,
  Maximize,
  ArrowLeftRight
} from 'lucide-react';
import { toast } from 'sonner';
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

const API = API_URL;

export default function Delivery() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  
  const [drivers, setDrivers] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '' });
  
  // حالات تعديل السائق
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ id: '', name: '', phone: '', is_active: true });
  
  // حالات ربط السائق بمستخدم
  const [linkUserDialogOpen, setLinkUserDialogOpen] = useState(false);
  const [deliveryUsers, setDeliveryUsers] = useState([]);
  const [selectedDriverForLink, setSelectedDriverForLink] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  
  // حالات جديدة لمتابعة الطلبات
  const [driverOrders, setDriverOrders] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverOrdersDialogOpen, setDriverOrdersDialogOpen] = useState(false);
  const [driverStats, setDriverStats] = useState({});
  const [collectPaymentDialogOpen, setCollectPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  
  // حالات تحويل الطلب لسائق آخر
  const [transferDriverDialogOpen, setTransferDriverDialogOpen] = useState(false);
  const [orderToTransfer, setOrderToTransfer] = useState(null);
  const [targetDriverId, setTargetDriverId] = useState('');
  
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

  const fetchData = async () => {
    try {
      const [driversRes, ordersRes, branchesRes] = await Promise.all([
        axios.get(`${API}/drivers`, { params: { branch_id: selectedBranch } }),
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
      toast.success('تم إضافة السائق');
      setDialogOpen(false);
      setFormData({ name: '', phone: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة السائق');
    }
  };

  const handleEditDriver = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/drivers/${editFormData.id}`, {
        name: editFormData.name,
        phone: editFormData.phone,
        is_active: editFormData.is_active
      });
      toast.success('تم تعديل السائق');
      setEditDialogOpen(false);
      setEditFormData({ id: '', name: '', phone: '', is_active: true });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تعديل السائق');
    }
  };

  const handleDeleteDriver = async (driverId, driverName) => {
    if (!window.confirm(`هل أنت متأكد من حذف السائق "${driverName}"؟`)) return;
    try {
      await axios.delete(`${API}/drivers/${driverId}`);
      toast.success('تم حذف السائق');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حذف السائق');
    }
  };

  const openEditDialog = (driver) => {
    setEditFormData({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      is_active: driver.is_available !== false
    });
    setEditDialogOpen(true);
  };

  const openLinkUserDialog = async (driver) => {
    setSelectedDriverForLink(driver);
    try {
      // جلب مستخدمي التوصيل
      const res = await axios.get(`${API}/users`);
      const deliveryUsers = res.data.filter(u => u.role === 'delivery');
      setDeliveryUsers(deliveryUsers);
      setSelectedUserId(driver.user_id || '');
      setLinkUserDialogOpen(true);
    } catch (error) {
      toast.error('فشل في جلب المستخدمين');
    }
  };

  const handleLinkUser = async () => {
    if (!selectedUserId) {
      toast.error('يرجى اختيار مستخدم');
      return;
    }
    try {
      await axios.put(`${API}/drivers/${selectedDriverForLink.id}/link-user?user_id=${selectedUserId}`);
      toast.success('تم ربط السائق بالمستخدم');
      setLinkUserDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في ربط السائق');
    }
  };

  const assignDriver = async (driverId, orderId) => {
    try {
      await axios.put(`${API}/drivers/${driverId}/assign?order_id=${orderId}`);
      toast.success('تم تعيين السائق للطلب');
      fetchData();
    } catch (error) {
      toast.error('فشل في تعيين السائق');
    }
  };

  const completeDelivery = async (driverId, orderId = null) => {
    try {
      if (orderId) {
        await axios.put(`${API}/drivers/${driverId}/complete?order_id=${orderId}`);
      } else {
        await axios.put(`${API}/drivers/${driverId}/complete`);
      }
      toast.success('تم تسليم الطلب بنجاح');
      fetchData();
      if (selectedDriver) {
        fetchDriverOrders(selectedDriver.id);
      }
    } catch (error) {
      toast.error('فشل في تحديث الحالة');
    }
  };

  // جلب طلبات سائق معين
  const fetchDriverOrders = async (driverId) => {
    try {
      const res = await axios.get(`${API}/drivers/${driverId}/orders`);
      setDriverOrders(res.data);
    } catch (error) {
      console.error('Failed to fetch driver orders:', error);
      toast.error('فشل في جلب طلبات السائق');
    }
  };

  // فتح تفاصيل السائق
  const openDriverDetails = async (driver) => {
    setSelectedDriver(driver);
    await fetchDriverOrders(driver.id);
    setDriverOrdersDialogOpen(true);
  };

  // تسجيل دفعة من السائق
  const handleCollectPayment = async () => {
    if (!selectedDriver || paymentAmount <= 0) return;
    
    try {
      await axios.post(`${API}/drivers/${selectedDriver.id}/collect-payment`, {
        amount: paymentAmount
      });
      toast.success(`تم تسجيل دفعة بقيمة ${formatPrice(paymentAmount)}`);
      setCollectPaymentDialogOpen(false);
      setPaymentAmount(0);
      fetchData();
      fetchDriverOrders(selectedDriver.id);
    } catch (error) {
      toast.error('فشل في تسجيل الدفعة');
    }
  };

  // تحويل الطلب لسائق آخر
  const handleTransferDriver = async () => {
    if (!orderToTransfer || !targetDriverId) {
      toast.error('الرجاء اختيار السائق');
      return;
    }
    
    try {
      await axios.post(`${API}/orders/${orderToTransfer.id}/transfer-driver`, {
        new_driver_id: targetDriverId
      });
      toast.success('تم تحويل الطلب للسائق الجديد');
      setTransferDriverDialogOpen(false);
      setOrderToTransfer(null);
      setTargetDriverId('');
      fetchData();
      if (selectedDriver) {
        fetchDriverOrders(selectedDriver.id);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحويل الطلب');
    }
  };

  // فتح نافذة تحويل السائق
  const openTransferDriverDialog = (order) => {
    setOrderToTransfer(order);
    setTransferDriverDialogOpen(true);
  };

  // السائقين المتاحين للتحويل (نشطين ومتاحين)
  const availableDriversForTransfer = drivers.filter(
    d => d.is_active && d.id !== orderToTransfer?.driver_id
  );

  // تحديد طلب كمدفوع
  const markOrderAsPaid = async (orderId) => {
    try {
      await axios.put(`${API}/orders/${orderId}/driver-payment`, { is_paid: true });
      toast.success('تم تحديد الطلب كمدفوع');
      fetchData();
      if (selectedDriver) {
        fetchDriverOrders(selectedDriver.id);
      }
    } catch (error) {
      toast.error('فشل في تحديث حالة الدفع');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحميل...</p>
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
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">إدارة التوصيل</h1>
              <p className="text-sm text-muted-foreground">متابعة السائقين والطلبات</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 ml-1" />
              تحديث
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

            {hasRole(['admin', 'manager']) && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground" data-testid="add-driver-btn">
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة سائق
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">إضافة سائق جديد</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateDriver} className="space-y-4">
                    <div>
                      <Label className="text-foreground">اسم السائق</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-foreground">رقم الهاتف</Label>
                      <Input
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        required
                        className="mt-1"
                      />
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                        إلغاء
                      </Button>
                      <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                        إضافة
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* إحصائيات سريعة */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي غير المدفوع</p>
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
                  <p className="text-sm text-muted-foreground">المدفوع اليوم</p>
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
                  <p className="text-sm text-muted-foreground">طلبات معلقة</p>
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
                  <p className="text-sm text-muted-foreground">السائقين النشطين</p>
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
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="drivers">السائقين والحسابات</TabsTrigger>
            <TabsTrigger value="map" className="flex items-center gap-1">
              <Map className="h-4 w-4" />
              الخريطة
            </TabsTrigger>
            <TabsTrigger value="pending">طلبات جاهزة للتوصيل</TabsTrigger>
          </TabsList>

          {/* السائقين */}
          <TabsContent value="drivers">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {drivers.length === 0 ? (
                <Card className="border-border/50 bg-card col-span-full">
                  <CardContent className="py-12 text-center">
                    <Truck className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground text-lg">لا يوجد سائقين</p>
                    <p className="text-sm text-muted-foreground">أضف سائقين لبدء إدارة التوصيل</p>
                  </CardContent>
                </Card>
              ) : (
                drivers.map(driver => {
                  const stats = driverStats[driver.id] || { unpaid_total: 0, paid_today: 0, pending_orders: 0 };
                  return (
                    <Card 
                      key={driver.id}
                      className={`border-border/50 bg-card transition-all hover:shadow-lg cursor-pointer ${
                        driver.current_order_id ? 'ring-2 ring-orange-500' : ''
                      } ${stats.unpaid_total > 0 ? 'border-r-4 border-r-red-500' : ''}`}
                      onClick={() => openDriverDetails(driver)}
                      data-testid={`driver-card-${driver.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
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
                            {driver.is_available ? 'متاح' : 'في مهمة'}
                          </span>
                        </div>

                        {/* إحصائيات السائق */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-red-500/10 p-2 rounded-lg text-center">
                            <p className="text-xs text-muted-foreground">غير مدفوع</p>
                            <p className="text-sm font-bold text-red-500">{formatPrice(stats.unpaid_total || 0)}</p>
                          </div>
                          <div className="bg-green-500/10 p-2 rounded-lg text-center">
                            <p className="text-xs text-muted-foreground">مدفوع اليوم</p>
                            <p className="text-sm font-bold text-green-500">{formatPrice(stats.paid_today || 0)}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{driver.total_deliveries || 0} توصيلة</span>
                          <span>{stats.pending_orders || 0} طلب معلق</span>
                        </div>

                        {driver.current_order_id && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-orange-500">في طريقه للتوصيل</span>
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600 text-white"
                                onClick={(e) => { e.stopPropagation(); completeDelivery(driver.id); }}
                              >
                                <Check className="h-4 w-4 ml-1" />
                                تم التسليم
                              </Button>
                            </div>
                            {/* زر تحويل الطلب لسائق آخر */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full border-amber-500 text-amber-500 hover:bg-amber-500/10"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                // إنشاء كائن طلب وهمي للتحويل
                                setOrderToTransfer({
                                  id: driver.current_order_id,
                                  order_number: driver.current_order?.order_number || '---',
                                  total: driver.current_order?.total || 0,
                                  driver_id: driver.id,
                                  driver_name: driver.name
                                });
                                setTransferDriverDialogOpen(true);
                              }}
                              data-testid={`transfer-driver-order-${driver.id}`}
                            >
                              <ArrowLeftRight className="h-4 w-4 ml-1" />
                              تحويل لسائق آخر
                            </Button>
                          </div>
                        )}

                        <Button 
                          variant="outline" 
                          className="w-full mt-3"
                          onClick={(e) => { e.stopPropagation(); openDriverDetails(driver); }}
                        >
                          <Eye className="h-4 w-4 ml-2" />
                          عرض التفاصيل
                        </Button>
                        
                        {/* أزرار التعديل والحذف وربط المستخدم */}
                        <div className="flex gap-2 mt-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="flex-1"
                            onClick={(e) => { e.stopPropagation(); openEditDialog(driver); }}
                          >
                            <Edit className="h-4 w-4 ml-1" />
                            تعديل
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className={`flex-1 ${driver.user_id ? 'text-green-500' : 'text-blue-500'}`}
                            onClick={(e) => { e.stopPropagation(); openLinkUserDialog(driver); }}
                          >
                            {driver.user_id ? <UserCheck className="h-4 w-4 ml-1" /> : <Link className="h-4 w-4 ml-1" />}
                            {driver.user_id ? 'مربوط' : 'ربط'}
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
                        
                        {/* رابط السائق للهاتف */}
                        <div className="mt-2 p-2 bg-blue-500/10 rounded-lg">
                          <p className="text-xs text-blue-400 mb-1">رابط للسائق:</p>
                          <button
                            className="text-xs text-blue-300 hover:text-blue-200 break-all text-right"
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = `${window.location.origin}/driver?id=${driver.id}`;
                              navigator.clipboard.writeText(url);
                              toast.success('تم نسخ الرابط!');
                            }}
                          >
                            📋 انسخ الرابط
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
                    تتبع السائقين على الخريطة
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchDriverLocations}>
                    <RefreshCw className="h-4 w-4 ml-1" />
                    تحديث المواقع
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
                              `آخر تحديث: ${new Date(driver.location_updated_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`
                            ) : 'موقع متاح'}
                          </>
                        ) : (
                          'لا يوجد موقع'
                        )}
                      </p>
                      {driver.current_order && (
                        <div className="mt-2 pt-2 border-t border-border text-xs">
                          <span className="text-orange-500">طلب #{driver.current_order.order_number}</span>
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
                    لتتبع السائقين: يجب على كل سائق فتح تطبيقه والسماح بالوصول للموقع
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
                  <p className="text-xs text-muted-foreground">جاهزة للتوصيل</p>
                  <p className="text-xl font-bold text-blue-500">{pendingOrders.length}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-gradient-to-br from-orange-500/10 to-orange-600/5">
                <CardContent className="p-3 text-center">
                  <Truck className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                  <p className="text-xs text-muted-foreground">في الطريق</p>
                  <p className="text-xl font-bold text-orange-500">
                    {drivers.filter(d => d.current_order_id).length}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-gradient-to-br from-green-500/10 to-green-600/5">
                <CardContent className="p-3 text-center">
                  <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-500" />
                  <p className="text-xs text-muted-foreground">تم التسليم اليوم</p>
                  <p className="text-xl font-bold text-green-500">
                    {Object.values(driverStats).reduce((sum, s) => sum + (s.delivered_today || 0), 0)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-gradient-to-br from-purple-500/10 to-purple-600/5">
                <CardContent className="p-3 text-center">
                  <DollarSign className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                  <p className="text-xs text-muted-foreground">تم التحصيل</p>
                  <p className="text-xl font-bold text-purple-500">{formatPrice(totalPaid)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-gradient-to-br from-red-500/10 to-red-600/5">
                <CardContent className="p-3 text-center">
                  <AlertCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
                  <p className="text-xs text-muted-foreground">غير محصل</p>
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
                    جاهزة للتعيين
                    <span className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded-full text-xs mr-auto">
                      {pendingOrders.filter(o => !o.driver_id).length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {pendingOrders.filter(o => !o.driver_id).length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 text-sm">لا توجد طلبات</p>
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
                            <p className="text-sm text-muted-foreground truncate">{order.customer_name || 'زبون'}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" />
                              {new Date(order.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {drivers.filter(d => d.is_available).slice(0, 3).map(driver => (
                                <Button
                                  key={driver.id}
                                  size="sm"
                                  className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white"
                                  onClick={() => assignDriver(driver.id, order.id)}
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
                    في حيازة السائق
                    <span className="bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded-full text-xs mr-auto">
                      {drivers.filter(d => d.current_order_id).length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {drivers.filter(d => d.current_order_id).length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 text-sm">لا توجد طلبات في الطريق</p>
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
                              {driver.current_order?.customer_name || 'زبون'}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 h-7 text-xs bg-green-500 hover:bg-green-600 text-white"
                                onClick={() => completeDelivery(driver.id)}
                              >
                                <Check className="h-3 w-3 ml-1" />
                                تم التسليم
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-amber-500 text-amber-500"
                                onClick={() => {
                                  setOrderToTransfer({
                                    id: driver.current_order_id,
                                    order_number: driver.current_order?.order_number || '---',
                                    total: driver.current_order?.total || 0,
                                    driver_id: driver.id,
                                    driver_name: driver.name
                                  });
                                  setTransferDriverDialogOpen(true);
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
                    حركة اليوم
                    <span className="bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full text-xs mr-auto">
                      {driverOrders.filter(o => o.status === 'delivered').length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {driverOrders.filter(o => o.status === 'delivered').length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 text-sm">لا توجد طلبات مسلمة اليوم</p>
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
                                  <p className="text-xs text-muted-foreground">{order.driver_name || 'سائق'}</p>
                                </div>
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-bold text-foreground">{formatPrice(order.total)}</p>
                                <span className={`text-xs ${
                                  order.driver_payment_status === 'paid' ? 'text-green-500' : 'text-red-500'
                                }`}>
                                  {order.driver_payment_status === 'paid' ? '✓ محصل' : '○ غير محصل'}
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
                  <p className="text-xs text-muted-foreground">غير مدفوع</p>
                  <p className="text-lg font-bold text-red-500">
                    {formatPrice(driverStats[selectedDriver.id]?.unpaid_total || 0)}
                  </p>
                </div>
                <div className="bg-green-500/10 p-3 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">مدفوع اليوم</p>
                  <p className="text-lg font-bold text-green-500">
                    {formatPrice(driverStats[selectedDriver.id]?.paid_today || 0)}
                  </p>
                </div>
                <div className="bg-blue-500/10 p-3 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">إجمالي التوصيلات</p>
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
                      <p className="text-center text-muted-foreground py-8">لا توجد طلبات</p>
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
                                    {order.driver_payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {order.customer_name} - {new Date(order.created_at).toLocaleDateString('ar-IQ')}
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
              <p className="text-sm text-muted-foreground">المبلغ المستحق</p>
              <p className="text-2xl font-bold text-red-500">
                {formatPrice(driverStats[selectedDriver?.id]?.unpaid_total || 0)}
              </p>
            </div>
            
            <div>
              <Label className="text-foreground">المبلغ المحصل</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Number(e.target.value))}
                className="mt-1 text-lg font-bold text-center"
              />
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCollectPaymentDialogOpen(false)} className="flex-1">
                إلغاء
              </Button>
              <Button 
                onClick={handleCollectPayment}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              >
                <Check className="h-4 w-4 ml-1" />
                تأكيد التحصيل
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
              <Label className="text-foreground">اسم السائق</Label>
              <Input
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder="اسم السائق"
                required
              />
            </div>
            <div>
              <Label className="text-foreground">رقم الهاتف</Label>
              <Input
                value={editFormData.phone}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                placeholder="07xxxxxxxxx"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1">
                إلغاء
              </Button>
              <Button type="submit" className="flex-1 bg-blue-500 hover:bg-blue-600 text-white">
                <Check className="h-4 w-4 ml-1" />
                حفظ التعديلات
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* نافذة ربط السائق بمستخدم */}
      <Dialog open={linkUserDialogOpen} onOpenChange={setLinkUserDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Link className="h-5 w-5 text-blue-500" />
              ربط السائق بحساب مستخدم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">السائق:</p>
              <p className="font-bold text-foreground">{selectedDriverForLink?.name}</p>
            </div>
            
            <div>
              <Label className="text-foreground">اختر حساب المستخدم (دور: سائق توصيل)</Label>
              <select
                className="w-full mt-2 p-2 rounded-lg border border-border bg-background text-foreground"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">-- اختر مستخدم --</option>
                {deliveryUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            
            {deliveryUsers.length === 0 && (
              <div className="p-3 bg-yellow-500/10 rounded-lg text-yellow-500 text-sm">
                <AlertCircle className="h-4 w-4 inline ml-1" />
                لا يوجد مستخدمين بدور سائق توصيل. أنشئ مستخدم جديد من الإعدادات أولاً.
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLinkUserDialogOpen(false)} className="flex-1">
                إلغاء
              </Button>
              <Button 
                onClick={handleLinkUser} 
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                disabled={!selectedUserId}
              >
                <Link className="h-4 w-4 ml-1" />
                ربط
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              بعد الربط، يمكن للسائق تسجيل الدخول من الرابط:<br/>
              <span className="text-primary">/driver</span>
            </p>
          </div>
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
                    <p className="text-sm text-muted-foreground">رقم الطلب:</p>
                    <p className="font-bold text-lg text-foreground">#{orderToTransfer.order_number}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm text-muted-foreground">المبلغ:</p>
                    <p className="font-bold text-primary">{formatPrice(orderToTransfer.total)}</p>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-sm text-muted-foreground">السائق الحالي:</p>
                  <p className="font-medium text-foreground">{orderToTransfer.driver_name || selectedDriver?.name || 'غير معين'}</p>
                </div>
              </div>
            )}
            
            <div>
              <Label className="text-foreground">اختر السائق الجديد:</Label>
              <Select value={targetDriverId} onValueChange={setTargetDriverId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="اختر السائق" />
                </SelectTrigger>
                <SelectContent>
                  {availableDriversForTransfer.map(driver => (
                    <SelectItem key={driver.id} value={driver.id}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${driver.is_available ? 'bg-green-500' : 'bg-orange-500'}`}></span>
                        {driver.name} - {driver.is_available ? 'متاح' : 'في مهمة'}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {availableDriversForTransfer.length === 0 && (
                <p className="text-sm text-amber-500 mt-2">لا يوجد سائقين آخرين نشطين</p>
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
    </div>
  );
}
