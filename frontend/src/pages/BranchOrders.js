import React, { useState, useEffect } from 'react';
import { BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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
  X,
  Minus,
  Edit,
  Trash2
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
import { Badge } from '../components/ui/badge';

const API = BACKEND_URL + '/api';

export default function BranchOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]); // المنتجات النهائية
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
      const [ordersRes, branchesRes, productsRes] = await Promise.all([
        axios.get(`${API}/branch-orders`, { params: { type: selectedTab } }),
        axios.get(`${API}/branches`),
        axios.get(`${API}/finished-products`) // API جديد للمنتجات النهائية
      ]);
      setOrders(ordersRes.data);
      setBranches(branchesRes.data);
      setFinishedProducts(productsRes.data);
    } catch (error) {
      // بيانات تجريبية
      setBranches([
        { id: '1', name: 'الفرع الرئيسي' },
        { id: '2', name: 'فرع المنصور' },
        { id: '3', name: 'فرع الكرادة' },
        { id: 'warehouse', name: 'المخزن الرئيسي' }
      ]);
      setFinishedProducts([
        { id: '1', name: 'لحم برغر', unit: 'قطعة', quantity: 100, cost_per_unit: 990 },
        { id: '2', name: 'دجاج مقلي', unit: 'قطعة', quantity: 50, cost_per_unit: 1500 }
      ]);
      setOrders([
        {
          id: '1',
          order_number: 'BO-001',
          from_branch: { id: 'warehouse', name: 'المخزن الرئيسي' },
          to_branch: { id: '1', name: 'الفرع الرئيسي' },
          items: [
            { product_name: 'لحم برغر', quantity: 50, unit: 'قطعة' }
          ],
          status: 'pending',
          priority: 'normal',
          created_at: new Date().toISOString(),
          notes: ''
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const addItemToOrder = () => {
    if (!selectedProduct || quantity < 1) {
      toast.error('اختر منتج وحدد الكمية');
      return;
    }
    
    const product = finishedProducts.find(p => p.id === selectedProduct);
    if (!product) {
      toast.error('المنتج غير موجود');
      return;
    }
    
    // التحقق من الكمية المتاحة
    if (product.quantity !== null && product.quantity !== undefined && quantity > product.quantity) {
      toast.error(`الكمية المطلوبة (${quantity}) أكبر من المتوفر (${product.quantity} ${product.unit})`);
      return;
    }
    
    // التحقق من عدم التكرار
    const existingIndex = form.items.findIndex(item => item.product_id === product.id);
    if (existingIndex >= 0) {
      // تحديث الكمية
      const newItems = [...form.items];
      newItems[existingIndex].quantity += quantity;
      setForm(prev => ({ ...prev, items: newItems }));
      toast.success(`تم تحديث كمية ${product.name}`);
    } else {
      // إضافة منتج جديد
      const newItem = {
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        unit: product.unit || 'قطعة',
        cost_per_unit: product.cost_per_unit || 0
      };
      
      setForm(prev => ({ ...prev, items: [...prev.items, newItem] }));
      toast.success(`تمت إضافة ${product.name}`);
    }
    
    setSelectedProduct('');
    setQuantity(1);
  };

  const removeItem = (index) => {
    const newItems = form.items.filter((_, i) => i !== index);
    setForm(prev => ({ ...prev, items: newItems }));
  };

  const updateItemQuantity = (index, delta) => {
    const newItems = [...form.items];
    const newQty = newItems[index].quantity + delta;
    if (newQty > 0) {
      newItems[index].quantity = newQty;
      setForm(prev => ({ ...prev, items: newItems }));
    }
  };

  const handleSubmit = async () => {
    if (!form.to_branch_id || form.items.length === 0) {
      toast.error('الرجاء اختيار الفرع وإضافة منتجات');
      return;
    }

    try {
      await axios.post(`${API}/branch-orders`, {
        ...form,
        from_branch_id: 'warehouse', // من المخزن الرئيسي
        items: form.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
      });
      toast.success('تم إرسال الطلب بنجاح');
      setShowAddDialog(false);
      setForm({ to_branch_id: '', items: [], notes: '', priority: 'normal' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إرسال الطلب');
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.patch(`${API}/branch-orders/${orderId}/status`, { status });
      toast.success('تم تحديث الحالة');
      fetchData();
    } catch (error) {
      toast.error('فشل في تحديث الحالة');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-500';
      case 'approved': return 'bg-blue-500/20 text-blue-500';
      case 'shipped': return 'bg-purple-500/20 text-purple-500';
      case 'delivered': return 'bg-green-500/20 text-green-500';
      case 'cancelled': return 'bg-red-500/20 text-red-500';
      default: return 'bg-gray-500/20 text-gray-500';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'قيد الانتظار';
      case 'approved': return 'تمت الموافقة';
      case 'shipped': return 'تم الشحن';
      case 'delivered': return 'تم التسليم';
      case 'cancelled': return 'ملغي';
      default: return status;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/20 text-red-500';
      case 'high': return 'bg-orange-500/20 text-orange-500';
      case 'normal': return 'bg-blue-500/20 text-blue-500';
      case 'low': return 'bg-gray-500/20 text-gray-500';
      default: return 'bg-gray-500/20 text-gray-500';
    }
  };

  const totalOrderValue = form.items.reduce((sum, item) => sum + (item.quantity * (item.cost_per_unit || 0)), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
                طلبات الفروع
              </h1>
              <p className="text-xs text-muted-foreground">إدارة طلبات المنتجات بين الفروع والمخزن</p>
            </div>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="gap-2 bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            طلب جديد
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="outgoing" className="gap-2">
              <Send className="h-4 w-4" />
              الطلبات الصادرة
            </TabsTrigger>
            <TabsTrigger value="incoming" className="gap-2">
              <Package className="h-4 w-4" />
              الطلبات الواردة
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filter */}
        <div className="flex gap-2 items-center">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="pending">قيد الانتظار</SelectItem>
              <SelectItem value="approved">تمت الموافقة</SelectItem>
              <SelectItem value="shipped">تم الشحن</SelectItem>
              <SelectItem value="delivered">تم التسليم</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Orders List */}
        <div className="space-y-3">
          {orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>لا توجد طلبات</p>
              </CardContent>
            </Card>
          ) : (
            orders
              .filter(order => filterStatus === 'all' || order.status === filterStatus)
              .map(order => (
                <Card key={order.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-lg">#{order.order_number}</span>
                          <Badge className={getStatusColor(order.status)}>
                            {getStatusLabel(order.status)}
                          </Badge>
                          <Badge className={getPriorityColor(order.priority)}>
                            {order.priority === 'urgent' ? 'عاجل' : order.priority === 'high' ? 'مهم' : 'عادي'}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            من: {order.from_branch?.name}
                          </span>
                          <span>←</span>
                          <span className="flex items-center gap-1">
                            <Truck className="h-4 w-4" />
                            إلى: {order.to_branch?.name}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          {order.items?.map((item, idx) => (
                            <div key={idx} className="text-sm flex items-center gap-2">
                              <Package className="h-3 w-3 text-primary" />
                              <span>{item.product_name}</span>
                              <span className="text-muted-foreground">({item.quantity} {item.unit})</span>
                            </div>
                          ))}
                        </div>
                        
                        {order.notes && (
                          <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded">
                            {order.notes}
                          </p>
                        )}
                      </div>
                      
                      {order.status === 'pending' && selectedTab === 'incoming' && (
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            className="bg-green-500 hover:bg-green-600"
                            onClick={() => updateOrderStatus(order.id, 'approved')}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => updateOrderStatus(order.id, 'cancelled')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      
                      {order.status === 'approved' && selectedTab === 'incoming' && (
                        <Button 
                          size="sm"
                          onClick={() => updateOrderStatus(order.id, 'shipped')}
                        >
                          <Truck className="h-4 w-4 ml-1" />
                          شحن
                        </Button>
                      )}
                      
                      {order.status === 'shipped' && selectedTab === 'outgoing' && (
                        <Button 
                          size="sm" 
                          className="bg-green-500 hover:bg-green-600"
                          onClick={() => updateOrderStatus(order.id, 'delivered')}
                        >
                          <CheckCircle className="h-4 w-4 ml-1" />
                          تم الاستلام
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </div>
      </main>

      {/* Add Order Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              طلب جديد بين الفروع
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* To Branch */}
            <div>
              <Label>إلى الفرع / المخزن *</Label>
              <Select 
                value={form.to_branch_id} 
                onValueChange={(value) => setForm(prev => ({ ...prev, to_branch_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الوجهة" />
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

            {/* Priority */}
            <div>
              <Label>الأولوية</Label>
              <Select 
                value={form.priority} 
                onValueChange={(value) => setForm(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">🔴 عاجل</SelectItem>
                  <SelectItem value="high">🟠 مهم</SelectItem>
                  <SelectItem value="normal">🔵 عادي</SelectItem>
                  <SelectItem value="low">⚪ منخفض</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Add Product */}
            <div className="p-4 bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-orange-500" />
                <Label className="font-bold text-foreground">اختر منتج نهائي</Label>
              </div>
              
              <div className="flex gap-2">
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger className="flex-1 bg-background">
                    <SelectValue placeholder="اختر منتج..." />
                  </SelectTrigger>
                  <SelectContent>
                    {finishedProducts.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">لا توجد منتجات نهائية</p>
                      </div>
                    ) : (
                      finishedProducts.map(product => (
                        <SelectItem key={product.id} value={product.id}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <span className="font-medium">{product.name}</span>
                            <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                              متوفر: {product.quantity} {product.unit}
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
            </div>

            {/* Items List */}
            {form.items.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 font-medium text-sm">
                  المنتجات المطلوبة ({form.items.length})
                </div>
                <div className="divide-y">
                  {form.items.map((item, index) => (
                    <div key={index} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <span className="font-medium">{item.product_name}</span>
                        <span className="text-muted-foreground text-sm mr-2">
                          ({item.quantity} {item.unit})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateItemQuantity(index, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-bold">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateItemQuantity(index, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeItem(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {totalOrderValue > 0 && (
                  <div className="bg-primary/10 px-3 py-2 flex justify-between items-center">
                    <span className="text-sm">إجمالي التكلفة:</span>
                    <span className="font-bold text-primary">{totalOrderValue.toLocaleString()} د.ع</span>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <Label>ملاحظات</Label>
              <Textarea
                placeholder="ملاحظات إضافية (اختياري)"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.to_branch_id || form.items.length === 0}
              className="bg-primary hover:bg-primary/90"
            >
              <Send className="h-4 w-4 ml-2" />
              إرسال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
