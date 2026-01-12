import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
  Navigation
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';

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

  useEffect(() => {
    fetchData();
    // Poll for updates
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [selectedBranch]);

  const fetchData = async () => {
    try {
      const [driversRes, ordersRes, branchesRes] = await Promise.all([
        axios.get(`${API}/drivers`, { params: { branch_id: selectedBranch } }),
        axios.get(`${API}/orders`, { params: { branch_id: selectedBranch, status: 'ready' } }),
        axios.get(`${API}/branches`)
      ]);

      setDrivers(driversRes.data);
      setPendingOrders(ordersRes.data.filter(o => o.order_type === 'delivery' && !o.driver_id));
      setBranches(branchesRes.data);

      if (!selectedBranch && branchesRes.data.length > 0) {
        setSelectedBranch(branchesRes.data[0].id);
      }
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

  const assignDriver = async (driverId, orderId) => {
    try {
      await axios.put(`${API}/drivers/${driverId}/assign?order_id=${orderId}`);
      toast.success('تم تعيين السائق للطلب');
      fetchData();
    } catch (error) {
      toast.error('فشل في تعيين السائق');
    }
  };

  const completeDelivery = async (driverId) => {
    try {
      await axios.put(`${API}/drivers/${driverId}/complete`);
      toast.success('تم تسليم الطلب بنجاح');
      fetchData();
    } catch (error) {
      toast.error('فشل في تحديث الحالة');
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Drivers */}
          <div>
            <h2 className="text-lg font-bold font-cairo mb-4 text-foreground">السائقين</h2>
            <div className="space-y-3">
              {drivers.length === 0 ? (
                <Card className="border-border/50 bg-card">
                  <CardContent className="py-8 text-center">
                    <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">لا يوجد سائقين</p>
                  </CardContent>
                </Card>
              ) : (
                drivers.map(driver => (
                  <Card 
                    key={driver.id}
                    className={`border-border/50 bg-card ${driver.current_order_id ? 'ring-2 ring-orange-500' : ''}`}
                    data-testid={`driver-card-${driver.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            driver.is_available ? 'bg-green-500/10' : 'bg-orange-500/10'
                          }`}>
                            <Truck className={`h-6 w-6 ${driver.is_available ? 'text-green-500' : 'text-orange-500'}`} />
                          </div>
                          <div>
                            <h3 className="font-bold text-foreground">{driver.name}</h3>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {driver.phone}
                            </p>
                          </div>
                        </div>
                        <div className="text-left">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            driver.is_available ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'
                          }`}>
                            {driver.is_available ? 'متاح' : 'في مهمة'}
                          </span>
                          <p className="text-xs text-muted-foreground mt-1">
                            {driver.total_deliveries} توصيلات
                          </p>
                        </div>
                      </div>

                      {driver.current_order_id && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">في طريقه لتوصيل طلب</span>
                            <Button
                              size="sm"
                              className="bg-green-500 hover:bg-green-600 text-white"
                              onClick={() => completeDelivery(driver.id)}
                            >
                              <Check className="h-4 w-4 ml-1" />
                              تم التسليم
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Pending Delivery Orders */}
          <div>
            <h2 className="text-lg font-bold font-cairo mb-4 text-foreground">طلبات جاهزة للتوصيل</h2>
            <div className="space-y-3">
              {pendingOrders.length === 0 ? (
                <Card className="border-border/50 bg-card">
                  <CardContent className="py-8 text-center">
                    <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">لا توجد طلبات جاهزة للتوصيل</p>
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
                            {order.delivery_app && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                                {order.delivery_app}
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
          </div>
        </div>
      </main>
    </div>
  );
}
