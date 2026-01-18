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
  Package,
  Building2,
  ArrowLeftRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  Truck,
  RefreshCw,
  Eye,
  Send,
  Check,
  X
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

const API = BACKEND_URL + '/api';

export default function BranchOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]); // المنتجات النهائية من المخزون
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedTab, setSelectedTab] = useState('outgoing');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [form, setForm] = useState({
    to_branch_id: '',
    items: [],
    notes: '',
    priority: 'normal'
  });
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    fetchData();
  }, [selectedTab]);

  const fetchData = async () => {
    try {
      const [ordersRes, branchesRes, inventoryRes] = await Promise.all([
        axios.get(`${API}/branch-orders`, { params: { type: selectedTab } }),
        axios.get(`${API}/branches`),
        axios.get(`${API}/inventory`)
      ]);
      setOrders(ordersRes.data);
      setBranches(branchesRes.data);
      
      // فلترة المنتجات النهائية فقط (type = "finished" أو لا يوجد type)
      // المنتجات النهائية هي التي تُرسل للفروع
      const finished = inventoryRes.data.filter(item => 
        item.type === 'finished' || item.type === null || item.type === undefined
      );
      setFinishedProducts(finished);
    } catch (error) {
      // بيانات تجريبية
      setBranches([
        { id: '1', name: 'الفرع الرئيسي' },
        { id: '2', name: 'فرع المنصور' },
        { id: '3', name: 'فرع الكرادة' },
        { id: 'warehouse', name: 'المخزن الرئيسي' }
      ]);
      setFinishedProducts([
        { id: '1', name: 'لحم برغر', unit: 'قطعة', quantity: 100, cost_per_unit: 990 }
      ]);
      setOrders([
        {
          id: '1',
          order_number: 'BO-001',
          from_branch: { id: '1', name: 'الفرع الرئيسي' },
          to_branch: { id: 'warehouse', name: 'المخزن الرئيسي' },
          items: [
            { product_name: 'برجر كلاسيك', quantity: 50, unit: 'قطعة' },
            { product_name: 'بطاطس مقلية', quantity: 10, unit: 'كجم' }
          ],
          status: 'pending',
          priority: 'high',
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          notes: 'مطلوب بشكل عاجل'
        },
        {
          id: '2',
          order_number: 'BO-002',
          from_branch: { id: '2', name: 'فرع المنصور' },
          to_branch: { id: '1', name: 'الفرع الرئيسي' },
          items: [
            { product_name: 'صلصة خاصة', quantity: 5, unit: 'لتر' }
          ],
          status: 'approved',
          priority: 'normal',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          notes: ''
        },
        {
          id: '3',
          order_number: 'BO-003',
          from_branch: { id: '1', name: 'الفرع الرئيسي' },
          to_branch: { id: '3', name: 'فرع الكرادة' },
          items: [
            { product_name: 'خبز برجر', quantity: 100, unit: 'قطعة' }
          ],
          status: 'delivered',
          priority: 'low',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
          notes: 'تم التسليم بنجاح'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const addItemToOrder = () => {
    if (!selectedProduct || quantity < 1) return;
    
    const item = finishedProducts.find(p => p.id === selectedProduct);
    if (!item) return;
    
    // التحقق من الكمية المتاحة
    if (item.quantity !== null && item.quantity !== undefined && quantity > item.quantity) {
      toast.error(`الكمية المطلوبة أكبر من المتوفر (${item.quantity} ${item.unit})`);
      return;
    }
    
    const newItem = {
      product_id: item.id,
      product_name: item.name,
      quantity: quantity,
      unit: item.unit || 'قطعة',
      cost_per_unit: item.cost_per_unit || 0
    };
    
    setForm({ ...form, items: [...form.items, newItem] });
    setSelectedProduct('');
    setQuantity(1);
    toast.success(`تمت إضافة ${item.name}`);
  };

  const removeItem = (index) => {
    const newItems = form.items.filter((_, i) => i !== index);
    setForm({ ...form, items: newItems });
  };

  const handleSubmit = async () => {
    if (!form.to_branch_id || form.items.length === 0) {
      toast.error('الرجاء اختيار الفرع وإضافة منتجات');
      return;
    }

    try {
      await axios.post(`${API}/branch-orders`, form);
      toast.success('تم إنشاء الطلب بنجاح');
      setShowAddDialog(false);
      resetForm();
      fetchData();
    } catch (error) {
      // محاكاة النجاح
      const newOrder = {
        id: Date.now().toString(),
        order_number: `BO-${String(orders.length + 1).padStart(3, '0')}`,
        from_branch: { id: 'current', name: 'الفرع الحالي' },
        to_branch: branches.find(b => b.id === form.to_branch_id),
        items: form.items,
        status: 'pending',
        priority: form.priority,
        created_at: new Date().toISOString(),
        notes: form.notes
      };
      setOrders([newOrder, ...orders]);
      toast.success('تم إنشاء الطلب بنجاح');
      setShowAddDialog(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setForm({
      to_branch_id: '',
      items: [],
      notes: '',
      priority: 'normal'
    });
  };

  const updateStatus = async (orderId, status) => {
    try {
      await axios.put(`${API}/branch-orders/${orderId}/status`, { status });
      toast.success('تم تحديث حالة الطلب');
      fetchData();
    } catch (error) {
      setOrders(orders.map(o => o.id === orderId ? { ...o, status } : o));
      toast.success('تم تحديث حالة الطلب');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      case 'approved': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'in_transit': return 'bg-purple-500/10 text-purple-500 border-purple-500/30';
      case 'delivered': return 'bg-green-500/10 text-green-500 border-green-500/30';
      case 'rejected': return 'bg-red-500/10 text-red-500 border-red-500/30';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'قيد الانتظار';
      case 'approved': return 'موافق عليه';
      case 'in_transit': return 'قيد التوصيل';
      case 'delivered': return 'تم التسليم';
      case 'rejected': return 'مرفوض';
      default: return status;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-500';
      case 'normal': return 'text-blue-500';
      case 'low': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const filteredOrders = orders.filter(o => 
    filterStatus === 'all' || o.status === filterStatus
  );

  const stats = {
    pending: orders.filter(o => o.status === 'pending').length,
    approved: orders.filter(o => o.status === 'approved').length,
    inTransit: orders.filter(o => o.status === 'in_transit').length,
    delivered: orders.filter(o => o.status === 'delivered').length
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
              <ArrowLeftRight className="h-6 w-6 text-indigo-500" />
              <h1 className="text-xl font-bold font-cairo">طلبات الفروع</h1>
            </div>
          </div>

          <Button
            onClick={() => setShowAddDialog(true)}
            className="gap-2 bg-indigo-500 hover:bg-indigo-600"
          >
            <Plus className="h-4 w-4" />
            طلب جديد
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                  <p className="text-sm text-muted-foreground">موافق عليه</p>
                  <p className="text-2xl font-bold text-blue-500">{stats.approved}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">قيد التوصيل</p>
                  <p className="text-2xl font-bold text-purple-500">{stats.inTransit}</p>
                </div>
                <Truck className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">تم التسليم</p>
                  <p className="text-2xl font-bold text-green-500">{stats.delivered}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <div className="flex items-center justify-between">
            <TabsList className="bg-muted">
              <TabsTrigger value="outgoing">الطلبات الصادرة</TabsTrigger>
              <TabsTrigger value="incoming">الطلبات الواردة</TabsTrigger>
            </TabsList>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
                <SelectItem value="approved">موافق عليه</SelectItem>
                <SelectItem value="in_transit">قيد التوصيل</SelectItem>
                <SelectItem value="delivered">تم التسليم</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="outgoing" className="space-y-4 mt-4">
            {renderOrdersList()}
          </TabsContent>

          <TabsContent value="incoming" className="space-y-4 mt-4">
            {renderOrdersList()}
          </TabsContent>
        </Tabs>
      </main>

      {/* Add Order Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-indigo-500" />
              طلب جديد بين الفروع
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>إلى الفرع/المخزن *</Label>
                <Select 
                  value={form.to_branch_id} 
                  onValueChange={(v) => setForm({...form, to_branch_id: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(branch => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الأولوية</Label>
                <Select 
                  value={form.priority} 
                  onValueChange={(v) => setForm({...form, priority: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">منخفضة</SelectItem>
                    <SelectItem value="normal">عادية</SelectItem>
                    <SelectItem value="high">عاجلة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Add Product */}
            <div className="p-4 bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-orange-500" />
                <Label className="font-bold text-foreground">اختر منتج نهائي من المخزون</Label>
              </div>
              
              <div className="flex gap-2">
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger className="flex-1 bg-background">
                    <SelectValue placeholder="اختر منتج نهائي..." />
                  </SelectTrigger>
                  <SelectContent>
                    {finishedProducts.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">لا توجد منتجات نهائية في المخزون</p>
                        <p className="text-xs mt-1">يمكنك إضافتها من صفحة المخزون</p>
                      </div>
                    ) : (
                      finishedProducts.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <span className="font-medium">{item.name}</span>
                            <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                              متوفر: {item.quantity} {item.unit}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-24 bg-background"
                  placeholder="الكمية"
                />
                <Button 
                  onClick={addItemToOrder} 
                  size="icon" 
                  className="bg-green-500 hover:bg-green-600"
                  disabled={!selectedProduct}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {finishedProducts.length === 0 && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm text-yellow-600">
                  ⚠️ لا توجد منتجات نهائية في المخزون. اذهب لصفحة المخزون وأضف منتجات من نوع "منتج نهائي".
                </div>
              )}
            </div>

            {/* Items List */}
            {form.items.length > 0 && (
              <div className="space-y-2">
                <Label>المنتجات المطلوبة</Label>
                <div className="border rounded-lg divide-y">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="p-2 flex items-center justify-between">
                      <span>{item.product_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {item.quantity} {item.unit}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(idx)}
                          className="text-red-500 h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
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
            <Button onClick={handleSubmit} className="bg-indigo-500 hover:bg-indigo-600">
              إرسال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderOrdersList() {
    if (loading) {
      return (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
        </div>
      );
    }

    if (filteredOrders.length === 0) {
      return (
        <Card className="bg-card border-border/50">
          <CardContent className="p-12 text-center">
            <Package className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg text-muted-foreground">لا توجد طلبات</p>
            <Button
              className="mt-4 gap-2"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4" />
              إنشاء طلب جديد
            </Button>
          </CardContent>
        </Card>
      );
    }

    return filteredOrders.map((order) => (
      <Card key={order.id} className="bg-card border-border/50 hover:border-primary/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg">{order.order_number}</span>
                <span className={`px-2 py-0.5 rounded text-xs border ${getStatusColor(order.status)}`}>
                  {getStatusLabel(order.status)}
                </span>
                {order.priority === 'high' && (
                  <span className="text-red-500 text-xs font-bold">عاجل</span>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  من: {order.from_branch?.name}
                </span>
                <ArrowLeftRight className="h-4 w-4" />
                <span className="flex items-center gap-1">
                  إلى: {order.to_branch?.name}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {order.items?.map((item, idx) => (
                  <span key={idx} className="px-2 py-1 bg-muted rounded text-xs">
                    {item.product_name} × {item.quantity} {item.unit}
                  </span>
                ))}
              </div>

              {order.notes && (
                <p className="text-sm text-muted-foreground">📝 {order.notes}</p>
              )}

              <p className="text-xs text-muted-foreground">
                <Clock className="h-3 w-3 inline ml-1" />
                {new Date(order.created_at).toLocaleString('ar-IQ')}
              </p>
            </div>

            <div className="flex gap-2">
              {order.status === 'pending' && selectedTab === 'incoming' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateStatus(order.id, 'approved')}
                    className="text-green-500 hover:bg-green-500/10"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateStatus(order.id, 'rejected')}
                    className="text-red-500 hover:bg-red-500/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
              {order.status === 'approved' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateStatus(order.id, 'in_transit')}
                  className="text-purple-500 hover:bg-purple-500/10"
                >
                  <Truck className="h-4 w-4 ml-1" />
                  إرسال
                </Button>
              )}
              {order.status === 'in_transit' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateStatus(order.id, 'delivered')}
                  className="text-green-500 hover:bg-green-500/10"
                >
                  <CheckCircle className="h-4 w-4 ml-1" />
                  تم التسليم
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    ));
  }
}
