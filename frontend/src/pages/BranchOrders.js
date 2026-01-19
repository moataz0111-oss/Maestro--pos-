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
  Trash2,
  Beaker,
  Box,
  AlertTriangle
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
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showOrderDetails, setShowOrderDetails] = useState(null);
  const [selectedTab, setSelectedTab] = useState('outgoing');
  const [filterStatus, setFilterStatus] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  
  const [form, setForm] = useState({
    to_branch_id: '',
    items: [],
    notes: '',
    priority: 'normal'
  });
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchData();
  }, [selectedTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, branchesRes, productsRes] = await Promise.all([
        axios.get(`${API}/branch-orders`, { params: { type: selectedTab }, headers }),
        axios.get(`${API}/branches`, { headers }),
        axios.get(`${API}/finished-products`, { headers })
      ]);
      setOrders(ordersRes.data || []);
      setBranches(branchesRes.data || []);
      setFinishedProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('فشل في تحميل البيانات');
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
    
    // التحقق من وجود وصفة للمنتج
    if (!product.recipe || product.recipe.length === 0) {
      toast.error(`المنتج "${product.name}" ليس له وصفة محددة. قم بإضافة وصفة أولاً.`);
      return;
    }
    
    // التحقق من عدم التكرار
    const existingIndex = form.items.findIndex(item => item.product_id === product.id);
    if (existingIndex >= 0) {
      const newItems = [...form.items];
      newItems[existingIndex].quantity += quantity;
      setForm(prev => ({ ...prev, items: newItems }));
      toast.success(`تم تحديث كمية ${product.name}`);
    } else {
      const newItem = {
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        unit: product.unit || 'قطعة',
        cost_per_unit: product.cost_per_unit || 0,
        available: availableQty,
        recipe: product.recipe || []
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
    if (newQty > 0 && newQty <= newItems[index].available) {
      newItems[index].quantity = newQty;
      setForm(prev => ({ ...prev, items: newItems }));
    } else if (newQty > newItems[index].available) {
      toast.error('الكمية تتجاوز المتوفر');
    }
  };

  const handleSubmit = async () => {
    if (!form.to_branch_id || form.items.length === 0) {
      toast.error('الرجاء اختيار الفرع وإضافة منتجات');
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/branch-orders`, {
        to_branch_id: form.to_branch_id,
        items: form.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        })),
        priority: form.priority,
        notes: form.notes
      }, { headers });
      
      toast.success('تم إرسال الطلب بنجاح وتم خصم المواد الخام من المخزون');
      setShowAddDialog(false);
      setForm({ to_branch_id: '', items: [], notes: '', priority: 'normal' });
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object') {
        if (detail.insufficient_products) {
          toast.error(`منتجات غير كافية: ${detail.insufficient_products.map(p => `${p.name} (متوفر: ${p.available})`).join(', ')}`);
        } else if (detail.insufficient_materials) {
          toast.error(`مواد خام غير كافية: ${detail.insufficient_materials.map(m => `${m.name} (متوفر: ${m.available} ${m.unit || ''})`).join(', ')}`);
        } else {
          toast.error(detail.message || 'فشل في إرسال الطلب');
        }
      } else {
        toast.error(detail || 'فشل في إرسال الطلب');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.patch(`${API}/branch-orders/${orderId}/status`, { status }, { headers });
      toast.success('تم تحديث الحالة');
      fetchData();
    } catch (error) {
      toast.error('فشل في تحديث الحالة');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      case 'approved': return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
      case 'shipped': 
      case 'in_transit': return 'bg-purple-500/20 text-purple-500 border-purple-500/30';
      case 'delivered': return 'bg-green-500/20 text-green-500 border-green-500/30';
      case 'cancelled':
      case 'rejected': return 'bg-red-500/20 text-red-500 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-500 border-gray-500/30';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'قيد الانتظار';
      case 'approved': return 'تمت الموافقة';
      case 'shipped':
      case 'in_transit': return 'قيد الشحن';
      case 'delivered': return 'تم التسليم';
      case 'cancelled': return 'ملغي';
      case 'rejected': return 'مرفوض';
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

  // حساب إجمالي المواد الخام المطلوبة
  const calculateRawMaterialsNeeded = () => {
    const materials = {};
    form.items.forEach(item => {
      (item.recipe || []).forEach(ingredient => {
        const matId = ingredient.raw_material_id;
        const needed = ingredient.quantity * item.quantity;
        if (materials[matId]) {
          materials[matId].quantity += needed;
        } else {
          materials[matId] = {
            name: ingredient.raw_material_name,
            quantity: needed,
            unit: ingredient.unit
          };
        }
      });
    });
    return Object.values(materials);
  };

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
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-button">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
                طلبات الفروع
              </h1>
              <p className="text-xs text-muted-foreground">إدارة طلبات المنتجات النهائية من المخزن الرئيسي</p>
            </div>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="gap-2 bg-primary hover:bg-primary/90" data-testid="new-order-btn">
            <Plus className="h-4 w-4" />
            طلب جديد
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Info Banner */}
        <Card className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-500/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <Beaker className="h-5 w-5 text-blue-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-500">نظام الوصفات والخصم التلقائي</p>
                <p className="text-muted-foreground">عند إرسال طلب فرع، يتم خصم المواد الخام المكونة للمنتجات النهائية تلقائياً من المخزون الرئيسي</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="outgoing" className="gap-2" data-testid="tab-outgoing">
              <Send className="h-4 w-4" />
              الطلبات الصادرة
            </TabsTrigger>
            <TabsTrigger value="incoming" className="gap-2" data-testid="tab-incoming">
              <Package className="h-4 w-4" />
              الطلبات الواردة
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filter */}
        <div className="flex gap-2 items-center">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40" data-testid="filter-status">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="pending">قيد الانتظار</SelectItem>
              <SelectItem value="approved">تمت الموافقة</SelectItem>
              <SelectItem value="in_transit">قيد الشحن</SelectItem>
              <SelectItem value="delivered">تم التسليم</SelectItem>
              <SelectItem value="rejected">مرفوض</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData} data-testid="refresh-btn">
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
                <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow" data-testid={`order-card-${order.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="font-bold text-lg">#{order.order_number}</span>
                          <Badge className={getStatusColor(order.status)}>
                            {getStatusLabel(order.status)}
                          </Badge>
                          <Badge className={getPriorityColor(order.priority)}>
                            {order.priority === 'urgent' ? '🔴 عاجل' : order.priority === 'high' ? '🟠 مهم' : '🔵 عادي'}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Box className="h-4 w-4 text-primary" />
                            من: {order.from_branch?.name || 'المخزن الرئيسي'}
                          </span>
                          <span>←</span>
                          <span className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            إلى: {order.to_branch?.name}
                          </span>
                        </div>
                        
                        <div className="space-y-1 mb-2">
                          {order.items?.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="text-sm flex items-center gap-2">
                              <Package className="h-3 w-3 text-primary" />
                              <span>{item.product_name}</span>
                              <span className="text-muted-foreground">({item.quantity} {item.unit})</span>
                            </div>
                          ))}
                          {order.items?.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{order.items.length - 3} منتجات أخرى</span>
                          )}
                        </div>
                        
                        {order.total_cost > 0 && (
                          <div className="text-sm font-medium text-primary">
                            التكلفة: {order.total_cost.toLocaleString()} د.ع
                          </div>
                        )}
                        
                        {order.notes && (
                          <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded">
                            {order.notes}
                          </p>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-xs"
                          onClick={() => setShowOrderDetails(order)}
                          data-testid={`view-details-${order.id}`}
                        >
                          <Eye className="h-3 w-3 ml-1" />
                          عرض التفاصيل
                        </Button>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {order.status === 'pending' && selectedTab === 'incoming' && (
                          <>
                            <Button 
                              size="sm" 
                              className="bg-green-500 hover:bg-green-600"
                              onClick={() => updateOrderStatus(order.id, 'approved')}
                              data-testid={`approve-${order.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => updateOrderStatus(order.id, 'rejected')}
                              data-testid={`reject-${order.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        
                        {order.status === 'approved' && (
                          <Button 
                            size="sm"
                            onClick={() => updateOrderStatus(order.id, 'in_transit')}
                            data-testid={`ship-${order.id}`}
                          >
                            <Truck className="h-4 w-4 ml-1" />
                            شحن
                          </Button>
                        )}
                        
                        {order.status === 'in_transit' && selectedTab === 'outgoing' && (
                          <Button 
                            size="sm" 
                            className="bg-green-500 hover:bg-green-600"
                            onClick={() => updateOrderStatus(order.id, 'delivered')}
                            data-testid={`receive-${order.id}`}
                          >
                            <CheckCircle className="h-4 w-4 ml-1" />
                            استلام
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </div>
      </main>

      {/* Add Order Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              طلب جديد من المخزن الرئيسي
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* To Branch */}
            <div>
              <Label>إلى الفرع *</Label>
              <Select 
                value={form.to_branch_id} 
                onValueChange={(value) => setForm(prev => ({ ...prev, to_branch_id: value }))}
              >
                <SelectTrigger data-testid="select-branch">
                  <SelectValue placeholder="اختر الفرع المستلم" />
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
                <SelectTrigger data-testid="select-priority">
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
              
              {finishedProducts.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                  <p className="text-sm">لا توجد منتجات نهائية في المخزون</p>
                  <p className="text-xs">قم بإضافة منتجات نهائية أولاً من صفحة المخزون</p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="flex-1 bg-background" data-testid="select-product">
                      <SelectValue placeholder="اختر منتج..." />
                    </SelectTrigger>
                    <SelectContent>
                      {finishedProducts.map(product => (
                        <SelectItem 
                          key={product.id} 
                          value={product.id}
                          disabled={product.quantity <= 0}
                        >
                          <div className="flex items-center justify-between w-full gap-4">
                            <span className="font-medium">{product.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${product.quantity > 0 ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100'}`}>
                              متوفر: {product.quantity} {product.unit}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="w-24 bg-background"
                    placeholder="الكمية"
                    data-testid="input-quantity"
                  />
                  <Button 
                    onClick={addItemToOrder} 
                    size="icon" 
                    className="bg-green-500 hover:bg-green-600"
                    disabled={!selectedProduct}
                    data-testid="add-item-btn"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Items List */}
            {form.items.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 font-medium text-sm flex items-center justify-between">
                  <span>المنتجات المطلوبة ({form.items.length})</span>
                </div>
                <div className="divide-y">
                  {form.items.map((item, index) => (
                    <div key={index} className="px-3 py-2">
                      <div className="flex items-center justify-between">
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
                            data-testid={`remove-item-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {/* عرض المواد الخام للمنتج */}
                      {item.recipe && item.recipe.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                          <span className="font-medium">المواد الخام المطلوبة:</span>
                          <ul className="mt-1 space-y-0.5">
                            {item.recipe.map((ing, i) => (
                              <li key={i} className="flex items-center gap-1">
                                <Beaker className="h-3 w-3" />
                                {ing.raw_material_name}: {(ing.quantity * item.quantity).toFixed(2)} {ing.unit}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* إجمالي المواد الخام */}
                {calculateRawMaterialsNeeded().length > 0 && (
                  <div className="bg-blue-500/10 px-3 py-2 border-t">
                    <div className="text-sm font-medium text-blue-500 mb-1 flex items-center gap-1">
                      <Beaker className="h-4 w-4" />
                      إجمالي المواد الخام التي سيتم خصمها:
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {calculateRawMaterialsNeeded().map((mat, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          {mat.name}: {mat.quantity.toFixed(2)} {mat.unit}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {totalOrderValue > 0 && (
                  <div className="bg-primary/10 px-3 py-2 flex justify-between items-center border-t">
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
                data-testid="input-notes"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.to_branch_id || form.items.length === 0 || submitting}
              className="bg-primary hover:bg-primary/90"
              data-testid="submit-order-btn"
            >
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Send className="h-4 w-4 ml-2" />
              )}
              إرسال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={!!showOrderDetails} onOpenChange={() => setShowOrderDetails(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              تفاصيل الطلب #{showOrderDetails?.order_number}
            </DialogTitle>
          </DialogHeader>

          {showOrderDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">الحالة:</span>
                  <Badge className={`mr-2 ${getStatusColor(showOrderDetails.status)}`}>
                    {getStatusLabel(showOrderDetails.status)}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">الأولوية:</span>
                  <Badge className={`mr-2 ${getPriorityColor(showOrderDetails.priority)}`}>
                    {showOrderDetails.priority === 'urgent' ? 'عاجل' : showOrderDetails.priority === 'high' ? 'مهم' : 'عادي'}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">من:</span>
                  <span className="font-medium mr-2">{showOrderDetails.from_branch?.name || 'المخزن الرئيسي'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">إلى:</span>
                  <span className="font-medium mr-2">{showOrderDetails.to_branch?.name}</span>
                </div>
              </div>

              <div className="border rounded-lg">
                <div className="bg-muted/50 px-3 py-2 font-medium text-sm">
                  المنتجات النهائية ({showOrderDetails.items?.length || 0})
                </div>
                <div className="divide-y">
                  {showOrderDetails.items?.map((item, idx) => (
                    <div key={idx} className="px-3 py-2 flex justify-between items-center">
                      <div>
                        <span className="font-medium">{item.product_name}</span>
                        <span className="text-muted-foreground text-sm mr-2">
                          ({item.quantity} {item.unit})
                        </span>
                      </div>
                      <span className="text-sm text-primary">
                        {((item.quantity || 0) * (item.cost_per_unit || 0)).toLocaleString()} د.ع
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {showOrderDetails.raw_materials_deducted && showOrderDetails.raw_materials_deducted.length > 0 && (
                <div className="border border-blue-500/30 rounded-lg bg-blue-500/5">
                  <div className="bg-blue-500/10 px-3 py-2 font-medium text-sm text-blue-500 flex items-center gap-2">
                    <Beaker className="h-4 w-4" />
                    المواد الخام المخصومة
                  </div>
                  <div className="divide-y divide-blue-500/20">
                    {showOrderDetails.raw_materials_deducted.map((mat, idx) => (
                      <div key={idx} className="px-3 py-2 flex justify-between items-center text-sm">
                        <span>{mat.raw_material_name}</span>
                        <span className="text-blue-500">{mat.quantity_deducted} {mat.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showOrderDetails.total_cost > 0 && (
                <div className="bg-primary/10 p-3 rounded-lg flex justify-between items-center">
                  <span className="font-medium">إجمالي التكلفة:</span>
                  <span className="font-bold text-lg text-primary">{showOrderDetails.total_cost.toLocaleString()} د.ع</span>
                </div>
              )}

              {showOrderDetails.notes && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <span className="text-sm text-muted-foreground">ملاحظات:</span>
                  <p className="mt-1">{showOrderDetails.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
