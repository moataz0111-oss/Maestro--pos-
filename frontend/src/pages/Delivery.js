import React, { useState, useEffect, useRef } from 'react';
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
  UserCheck
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
                            <div className="flex items-center justify-between">
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
                        
                        {/* أزرار التعديل والحذف */}
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
                            className="flex-1 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={(e) => { e.stopPropagation(); handleDeleteDriver(driver.id, driver.name); }}
                          >
                            <Trash2 className="h-4 w-4 ml-1" />
                            حذف
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

                {/* الخريطة */}
                <div className="relative rounded-lg overflow-hidden border border-border" style={{ height: '500px' }}>
                  {driverLocations.filter(d => d.location_lat && d.location_lng).length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                      <div className="text-center">
                        <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground text-lg">لا توجد مواقع متاحة للسائقين</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          يجب على السائقين تفعيل GPS من تطبيقهم
                        </p>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      title="خريطة السائقين"
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      style={{ border: 0 }}
                      src={`https://www.google.com/maps/embed/v1/view?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&center=${
                        driverLocations.find(d => d.location_lat)?.location_lat || 33.3
                      },${
                        driverLocations.find(d => d.location_lng)?.location_lng || 44.4
                      }&zoom=12&maptype=roadmap`}
                      allowFullScreen
                    />
                  )}
                  
                  {/* علامات السائقين فوق الخريطة */}
                  <div className="absolute top-4 right-4 bg-card/90 backdrop-blur-sm rounded-lg p-3 max-w-xs shadow-lg">
                    <p className="text-xs font-medium text-foreground mb-2">السائقين النشطين:</p>
                    <div className="space-y-1">
                      {driverLocations.filter(d => d.location_lat).map(driver => (
                        <div key={driver.id} className="flex items-center gap-2 text-xs">
                          <div className={`w-2 h-2 rounded-full ${
                            driver.is_available ? 'bg-green-500' : 'bg-orange-500'
                          }`} />
                          <span className="text-foreground">{driver.name}</span>
                          {driver.current_order && (
                            <span className="text-orange-400">#{driver.current_order.order_number}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
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

          {/* طلبات جاهزة للتوصيل */}
          <TabsContent value="pending">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingOrders.length === 0 ? (
                <Card className="border-border/50 bg-card col-span-full">
                  <CardContent className="py-12 text-center">
                    <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground text-lg">لا توجد طلبات جاهزة للتوصيل</p>
                  </CardContent>
                </Card>
              ) : (
                pendingOrders.map(order => (
                  <Card 
                    key={order.id}
                    className="border-border/50 bg-card"
                    data-testid={`order-card-${order.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-sm font-bold">
                              #{order.order_number}
                            </span>
                            {order.delivery_app_name && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                                {order.delivery_app_name}
                              </span>
                            )}
                          </div>
                          <h3 className="font-medium mt-2 text-foreground">{order.customer_name || 'زبون'}</h3>
                        </div>
                        <p className="text-lg font-bold text-primary">{formatPrice(order.total)}</p>
                      </div>

                      <div className="space-y-2 text-sm text-muted-foreground mb-4">
                        {order.customer_phone && (
                          <p className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {order.customer_phone}
                          </p>
                        )}
                        {order.delivery_address && (
                          <p className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {order.delivery_address}
                          </p>
                        )}
                        <p className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {new Date(order.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Assign Driver */}
                      <div className="border-t border-border pt-3">
                        <p className="text-sm text-muted-foreground mb-2">تعيين سائق:</p>
                        <div className="flex flex-wrap gap-2">
                          {drivers.filter(d => d.is_available).map(driver => (
                            <Button
                              key={driver.id}
                              size="sm"
                              variant="outline"
                              onClick={() => assignDriver(driver.id, order.id)}
                            >
                              <Navigation className="h-4 w-4 ml-1" />
                              {driver.name}
                            </Button>
                          ))}
                          {drivers.filter(d => d.is_available).length === 0 && (
                            <p className="text-sm text-muted-foreground">لا يوجد سائقين متاحين</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
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
                              {order.driver_payment_status !== 'paid' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-1 h-7 text-xs border-green-500 text-green-500 hover:bg-green-500/10"
                                  onClick={() => markOrderAsPaid(order.id)}
                                >
                                  <Check className="h-3 w-3 ml-1" />
                                  تم الدفع
                                </Button>
                              )}
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
    </div>
  );
}
