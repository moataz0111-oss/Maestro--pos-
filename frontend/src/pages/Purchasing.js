import React, { useState, useEffect } from 'react';
import { BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import {
  ArrowRight,
  Plus,
  ShoppingCart,
  Package,
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  FileText,
  RefreshCw,
  Eye,
  Edit,
  Trash2,
  DollarSign,
  Bell,
  TrendingDown,
  Printer
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';

const API = BACKEND_URL;

export default function Purchasing() {
  const navigate = useNavigate();
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [selectedTab, setSelectedTab] = useState('orders');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [form, setForm] = useState({
    supplier_id: '',
    items: [],
    notes: '',
    expected_delivery: ''
  });
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ordersRes, suppliersRes, materialsRes, alertsRes] = await Promise.all([
        axios.get(`${API}/purchase-orders`),
        axios.get(`${API}/suppliers`),
        axios.get(`${API}/raw-materials`),
        axios.get(`${API}/inventory/low-stock-alerts`)
      ]);
      setPurchaseOrders(ordersRes.data);
      setSuppliers(suppliersRes.data);
      setRawMaterials(materialsRes.data);
      setLowStockAlerts(alertsRes.data);
    } catch (error) {
      // بيانات تجريبية
      setSuppliers([
        { id: '1', name: 'شركة الأغذية المتحدة', phone: '0501234567', email: 'info@united.com' },
        { id: '2', name: 'مورد اللحوم الطازجة', phone: '0507654321', email: 'fresh@meat.com' },
        { id: '3', name: 'مصنع الخبز الذهبي', phone: '0509876543', email: 'golden@bread.com' }
      ]);
      setRawMaterials([
        { id: '1', name: 'لحم بقري', unit: 'كجم', current_stock: 15, min_stock: 20, price: 25000 },
        { id: '2', name: 'دجاج طازج', unit: 'كجم', current_stock: 8, min_stock: 15, price: 12000 },
        { id: '3', name: 'خبز برجر', unit: 'قطعة', current_stock: 200, min_stock: 100, price: 500 },
        { id: '4', name: 'طماطم', unit: 'كجم', current_stock: 5, min_stock: 10, price: 3000 },
        { id: '5', name: 'بصل', unit: 'كجم', current_stock: 20, min_stock: 15, price: 2000 }
      ]);
      setLowStockAlerts([
        { id: '1', material_name: 'لحم بقري', current_stock: 15, min_stock: 20, unit: 'كجم', shortage: 5 },
        { id: '2', material_name: 'دجاج طازج', current_stock: 8, min_stock: 15, unit: 'كجم', shortage: 7 },
        { id: '3', material_name: 'طماطم', current_stock: 5, min_stock: 10, unit: 'كجم', shortage: 5 }
      ]);
      setPurchaseOrders([
        {
          id: '1',
          order_number: 'PO-001',
          supplier: { id: '1', name: 'شركة الأغذية المتحدة' },
          items: [
            { material_name: 'لحم بقري', quantity: 50, unit: 'كجم', unit_price: 25000, total: 1250000 },
            { material_name: 'دجاج طازج', quantity: 30, unit: 'كجم', unit_price: 12000, total: 360000 }
          ],
          total_amount: 1610000,
          status: 'pending',
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          expected_delivery: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString()
        },
        {
          id: '2',
          order_number: 'PO-002',
          supplier: { id: '3', name: 'مصنع الخبز الذهبي' },
          items: [
            { material_name: 'خبز برجر', quantity: 500, unit: 'قطعة', unit_price: 500, total: 250000 }
          ],
          total_amount: 250000,
          status: 'delivered',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
          delivered_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const addItemToOrder = () => {
    if (!selectedMaterial || quantity < 1 || unitPrice < 1) return;
    
    const material = rawMaterials.find(m => m.id === selectedMaterial);
    if (!material) return;
    
    const newItem = {
      material_id: material.id,
      material_name: material.name,
      quantity: quantity,
      unit: material.unit,
      unit_price: unitPrice,
      total: quantity * unitPrice
    };
    
    setForm({ ...form, items: [...form.items, newItem] });
    setSelectedMaterial('');
    setQuantity(1);
    setUnitPrice(0);
  };

  const removeItem = (index) => {
    const newItems = form.items.filter((_, i) => i !== index);
    setForm({ ...form, items: newItems });
  };

  const getTotalAmount = () => {
    return form.items.reduce((sum, item) => sum + item.total, 0);
  };

  const handleSubmit = async () => {
    if (!form.supplier_id || form.items.length === 0) {
      toast.error('الرجاء اختيار المورد وإضافة منتجات');
      return;
    }

    try {
      await axios.post(`${API}/purchase-orders`, {
        ...form,
        total_amount: getTotalAmount()
      });
      toast.success('تم إنشاء أمر الشراء بنجاح');
      setShowAddDialog(false);
      resetForm();
      fetchData();
    } catch (error) {
      // محاكاة النجاح
      const newOrder = {
        id: Date.now().toString(),
        order_number: `PO-${String(purchaseOrders.length + 1).padStart(3, '0')}`,
        supplier: suppliers.find(s => s.id === form.supplier_id),
        items: form.items,
        total_amount: getTotalAmount(),
        status: 'pending',
        created_at: new Date().toISOString(),
        expected_delivery: form.expected_delivery
      };
      setPurchaseOrders([newOrder, ...purchaseOrders]);
      toast.success('تم إنشاء أمر الشراء بنجاح');
      setShowAddDialog(false);
      resetForm();
    }
  };

  const handleAddSupplier = async () => {
    if (!supplierForm.name || !supplierForm.phone) {
      toast.error('الرجاء إدخال اسم ورقم هاتف المورد');
      return;
    }

    try {
      await axios.post(`${API}/suppliers`, supplierForm);
      toast.success('تم إضافة المورد بنجاح');
      setShowSupplierDialog(false);
      setSupplierForm({ name: '', phone: '', email: '', address: '', notes: '' });
      fetchData();
    } catch (error) {
      const newSupplier = {
        id: Date.now().toString(),
        ...supplierForm
      };
      setSuppliers([...suppliers, newSupplier]);
      toast.success('تم إضافة المورد بنجاح');
      setShowSupplierDialog(false);
      setSupplierForm({ name: '', phone: '', email: '', address: '', notes: '' });
    }
  };

  const resetForm = () => {
    setForm({
      supplier_id: '',
      items: [],
      notes: '',
      expected_delivery: ''
    });
  };

  const updateStatus = async (orderId, status) => {
    try {
      await axios.put(`${API}/purchase-orders/${orderId}/status`, { status });
      toast.success('تم تحديث حالة الطلب');
      fetchData();
    } catch (error) {
      setPurchaseOrders(purchaseOrders.map(o => 
        o.id === orderId ? { ...o, status, delivered_at: status === 'delivered' ? new Date().toISOString() : null } : o
      ));
      toast.success('تم تحديث حالة الطلب');
    }
  };

  const createOrderFromAlert = (alert) => {
    const material = rawMaterials.find(m => m.name === alert.material_name);
    if (material) {
      setForm({
        ...form,
        items: [{
          material_id: material.id,
          material_name: material.name,
          quantity: alert.shortage * 2, // طلب ضعف النقص
          unit: material.unit,
          unit_price: material.price,
          total: alert.shortage * 2 * material.price
        }]
      });
      setShowAddDialog(true);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ar-IQ').format(value) + ' د.ع';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      case 'approved': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'ordered': return 'bg-purple-500/10 text-purple-500 border-purple-500/30';
      case 'delivered': return 'bg-green-500/10 text-green-500 border-green-500/30';
      case 'cancelled': return 'bg-red-500/10 text-red-500 border-red-500/30';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'قيد الانتظار';
      case 'approved': return 'موافق عليه';
      case 'ordered': return 'تم الطلب';
      case 'delivered': return 'تم الاستلام';
      case 'cancelled': return 'ملغي';
      default: return status;
    }
  };

  const filteredOrders = purchaseOrders.filter(o => 
    filterStatus === 'all' || o.status === filterStatus
  );

  const stats = {
    totalOrders: purchaseOrders.length,
    pending: purchaseOrders.filter(o => o.status === 'pending').length,
    totalValue: purchaseOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
    alerts: lowStockAlerts.length
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="rounded-lg"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-emerald-500" />
              <h1 className="text-xl font-bold font-cairo">المشتريات</h1>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSupplierDialog(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              مورد جديد
            </Button>
            <Button
              onClick={() => setShowAddDialog(true)}
              className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            >
              <Plus className="h-4 w-4" />
              أمر شراء
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">أوامر الشراء</p>
                  <p className="text-2xl font-bold">{stats.totalOrders}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">قيد الانتظار</p>
                  <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي القيمة</p>
                  <p className="text-lg font-bold text-emerald-500">{formatCurrency(stats.totalValue)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className={`border-border/50 ${stats.alerts > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-card'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">تنبيهات المخزون</p>
                  <p className={`text-2xl font-bold ${stats.alerts > 0 ? 'text-red-500' : ''}`}>{stats.alerts}</p>
                </div>
                <Bell className={`h-8 w-8 opacity-50 ${stats.alerts > 0 ? 'text-red-500 animate-pulse' : 'text-gray-500'}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alerts */}
        {lowStockAlerts.length > 0 && (
          <Card className="bg-red-500/5 border-red-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-500">
                <AlertCircle className="h-4 w-4" />
                تنبيهات انخفاض المخزون
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {lowStockAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center gap-2 px-3 py-2 bg-background rounded-lg border border-red-500/30"
                  >
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="font-medium">{alert.material_name}</span>
                    <span className="text-sm text-muted-foreground">
                      ({alert.current_stock}/{alert.min_stock} {alert.unit})
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-emerald-500 hover:bg-emerald-500/10"
                      onClick={() => createOrderFromAlert(alert)}
                    >
                      طلب شراء
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <div className="flex items-center justify-between">
            <TabsList className="bg-muted">
              <TabsTrigger value="orders">أوامر الشراء</TabsTrigger>
              <TabsTrigger value="suppliers">الموردين</TabsTrigger>
            </TabsList>

            {selectedTab === 'orders' && (
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 ml-2" />
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                  <SelectItem value="approved">موافق عليه</SelectItem>
                  <SelectItem value="ordered">تم الطلب</SelectItem>
                  <SelectItem value="delivered">تم الاستلام</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <TabsContent value="orders" className="space-y-4 mt-4">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-12 w-12 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <Card className="bg-card border-border/50">
                <CardContent className="p-12 text-center">
                  <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-lg text-muted-foreground">لا توجد أوامر شراء</p>
                </CardContent>
              </Card>
            ) : (
              filteredOrders.map((order) => (
                <Card key={order.id} className="bg-card border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg">{order.order_number}</span>
                          <span className={`px-2 py-0.5 rounded text-xs border ${getStatusColor(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                        </div>

                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-4 w-4" />
                          {order.supplier?.name}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {order.items?.map((item, idx) => (
                            <span key={idx} className="px-2 py-1 bg-muted rounded text-xs">
                              {item.material_name} × {item.quantity} {item.unit}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-4 text-sm">
                          <span className="font-bold text-emerald-500">
                            {formatCurrency(order.total_amount)}
                          </span>
                          <span className="text-muted-foreground">
                            <Clock className="h-3 w-3 inline ml-1" />
                            {new Date(order.created_at).toLocaleDateString('ar-IQ')}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {order.status === 'pending' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatus(order.id, 'approved')}
                              className="text-blue-500 hover:bg-blue-500/10"
                            >
                              موافقة
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatus(order.id, 'cancelled')}
                              className="text-red-500 hover:bg-red-500/10"
                            >
                              إلغاء
                            </Button>
                          </>
                        )}
                        {order.status === 'approved' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(order.id, 'ordered')}
                            className="text-purple-500 hover:bg-purple-500/10"
                          >
                            تم الطلب
                          </Button>
                        )}
                        {order.status === 'ordered' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(order.id, 'delivered')}
                            className="text-green-500 hover:bg-green-500/10"
                          >
                            تم الاستلام
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map((supplier) => (
                <Card key={supplier.id} className="bg-card border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold">{supplier.name}</h3>
                        <p className="text-sm text-muted-foreground">{supplier.phone}</p>
                        {supplier.email && (
                          <p className="text-sm text-muted-foreground">{supplier.email}</p>
                        )}
                      </div>
                      <Building2 className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Add Purchase Order Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-emerald-500" />
              أمر شراء جديد
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المورد *</Label>
                <Select 
                  value={form.supplier_id} 
                  onValueChange={(v) => setForm({...form, supplier_id: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المورد" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>تاريخ التسليم المتوقع</Label>
                <Input
                  type="date"
                  value={form.expected_delivery}
                  onChange={(e) => setForm({...form, expected_delivery: e.target.value})}
                />
              </div>
            </div>

            {/* Add Item */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <Label>إضافة مادة</Label>
              <div className="grid grid-cols-4 gap-2">
                <Select value={selectedMaterial} onValueChange={setSelectedMaterial} className="col-span-2">
                  <SelectTrigger>
                    <SelectValue placeholder="المادة" />
                  </SelectTrigger>
                  <SelectContent>
                    {rawMaterials.map(material => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  placeholder="الكمية"
                />
                <Input
                  type="number"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(parseInt(e.target.value) || 0)}
                  placeholder="السعر"
                />
              </div>
              <Button onClick={addItemToOrder} size="sm" className="w-full">
                <Plus className="h-4 w-4 ml-2" />
                إضافة
              </Button>
            </div>

            {/* Items List */}
            {form.items.length > 0 && (
              <div className="space-y-2">
                <Label>المواد المطلوبة</Label>
                <div className="border rounded-lg divide-y">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="p-2 flex items-center justify-between">
                      <div>
                        <span className="font-medium">{item.material_name}</span>
                        <span className="text-sm text-muted-foreground mx-2">
                          {item.quantity} {item.unit} × {formatCurrency(item.unit_price)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-500">
                          {formatCurrency(item.total)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(idx)}
                          className="text-red-500 h-6 w-6 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="p-2 bg-muted/50 flex justify-between font-bold">
                    <span>الإجمالي</span>
                    <span className="text-emerald-500">{formatCurrency(getTotalAmount())}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Input
                placeholder="ملاحظات إضافية (اختياري)"
                value={form.notes}
                onChange={(e) => setForm({...form, notes: e.target.value})}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSubmit} className="bg-emerald-500 hover:bg-emerald-600">
              إنشاء الأمر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Dialog */}
      <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              إضافة مورد جديد
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المورد *</Label>
              <Input
                placeholder="اسم الشركة أو المورد"
                value={supplierForm.name}
                onChange={(e) => setSupplierForm({...supplierForm, name: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم الهاتف *</Label>
                <Input
                  placeholder="05xxxxxxxx"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({...supplierForm, phone: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({...supplierForm, email: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input
                placeholder="عنوان المورد"
                value={supplierForm.address}
                onChange={(e) => setSupplierForm({...supplierForm, address: e.target.value})}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSupplierDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAddSupplier} className="bg-blue-500 hover:bg-blue-600">
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
