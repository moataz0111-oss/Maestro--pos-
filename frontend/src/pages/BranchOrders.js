import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { formatPrice } from '../utils/currency';
import {
  ArrowRight,
  Plus,
  Package,
  Building2,
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
  Factory,
  Box
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
const API = API_URL;
export default function BranchOrders() {
  const navigate = useNavigate();
  const { t, isRTL } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [manufacturedProducts, setManufacturedProducts] = useState([]);
  const [branchInventory, setBranchInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showOrderDetails, setShowOrderDetails] = useState(null);
  const [selectedTab, setSelectedTab] = useState('orders');
  const [filterStatus, setFilterStatus] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');
  
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
  }, [selectedTab, selectedBranch]);
  const fetchData = async () => {
    setLoading(true);
    try {
      const [requestsRes, branchesRes, productsRes] = await Promise.all([
        axios.get(`${API}/branch-requests`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/branches`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/manufactured-products`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setOrders(requestsRes.data || []);
      setBranches(branchesRes.data || []);
      setManufacturedProducts(productsRes.data || []);
      
      // جلب مخزون الفرع المحدد
      if (selectedBranch) {
        const invRes = await axios.get(`${API}/branch-inventory/${selectedBranch}`, { headers }).catch(() => ({ data: [] }));
        setBranchInventory(invRes.data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };
  const addProductToOrder = () => {
    if (!selectedProduct || quantity <= 0) {
      toast.error(t('اختر منتج وحدد الكمية'));
      return;
    }
    
    const product = manufacturedProducts.find(p => p.id === selectedProduct);
    if (!product) return;
    
    if (product.quantity < quantity) {
      toast.error(`${t('الكمية غير كافية. متوفر:')} ${product.quantity} ${product.unit}`);
      return;
    }
    
    const existing = form.items.find(i => i.product_id === selectedProduct);
    if (existing) {
      toast.error(t('هذا المنتج موجود بالفعل'));
      return;
    }
    
    setForm(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: product.id,
        product_name: product.name,
        quantity: quantity,
        unit: product.unit,
        cost_per_unit: product.raw_material_cost,
        available: product.quantity
      }]
    }));
    
    setSelectedProduct('');
    setQuantity(1);
    toast.success(`${t('تمت إضافة')} ${product.name}`);
  };
  const removeProductFromOrder = (index) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };
  const calculateTotal = () => {
    return form.items.reduce((sum, item) => sum + (item.quantity * item.cost_per_unit), 0);
  };
  const handleSubmitOrder = async () => {
    if (!form.to_branch_id || form.items.length === 0) {
      toast.error(t('اختر الفرع وأضف منتجات'));
      return;
    }
    
    // جلب معلومات المستخدم
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/branch-requests`, {
        to_branch_id: form.to_branch_id,
        items: form.items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity
        })),
        priority: form.priority,
        notes: form.notes,
        requested_by: user.id || '',
        requested_by_name: user.name || user.full_name || user.email || ''
      }, { headers });
      
      toast.success(t('تم إرسال الطلب للتصنيع'));
      setShowAddDialog(false);
      setForm({
        to_branch_id: '',
        items: [],
        notes: '',
        priority: 'normal'
      });
      fetchData();
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.insufficient_products) {
        toast.error(`${t('منتجات غير كافية:')} ${detail.insufficient_products.map(p => p.name).join(', ')}`);
      } else {
        toast.error(detail || t('فشل في إنشاء الطلب'));
      }
    } finally {
      setSubmitting(false);
    }
  };
  const handleUpdateStatus = async (orderId, status) => {
    try {
      await axios.put(`${API}/branch-requests/${orderId}/status`, { status }, { headers });
      toast.success(t('تم تحديث الحالة'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحديث الحالة'));
    }
  };
  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      case 'approved': return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
      case 'shipped': return 'bg-purple-500/20 text-purple-500 border-purple-500/30';
      case 'delivered': return 'bg-green-500/20 text-green-500 border-green-500/30';
      case 'cancelled': return 'bg-red-500/20 text-red-500 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-500 border-gray-500/30';
    }
  };
  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return t('قيد الانتظار');
      case 'approved': return t('تمت الموافقة');
      case 'shipped': return t('تم الشحن');
      case 'delivered': return t('تم التسليم');
      case 'cancelled': return t('ملغي');
      default: return status;
    }
  };
  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'approved': return <CheckCircle className="h-4 w-4" />;
      case 'shipped': return <Truck className="h-4 w-4" />;
      case 'delivered': return <Check className="h-4 w-4" />;
      case 'cancelled': return <XCircle className="h-4 w-4" />;
      default: return null;
    }
  };
  const filteredOrders = orders.filter(o => filterStatus === 'all' || o.status === filterStatus);
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background" dir="rtl" data-testid="branch-orders-page">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                {t('طلبات الفروع')}
              </h1>
              <p className="text-xs text-muted-foreground">{t('طلب المنتجات من قسم التصنيع')}</p>
            </div>
          </div>
          
          <Button 
            onClick={() => setShowAddDialog(true)}
            className="bg-primary"
            data-testid="new-order-btn"
          >
            <Plus className="h-4 w-4 ml-2" />
            {t('طلب جديد')}
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="orders" className="gap-2" data-testid="tab-orders">
              <Truck className="h-4 w-4" />
              {t('الطلبات')}
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-2" data-testid="tab-inventory">
              <Box className="h-4 w-4" />
              {t('مخزون الفروع')}
            </TabsTrigger>
          </TabsList>
          {/* الطلبات */}
          <TabsContent value="orders" className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2 items-center flex-wrap">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('الحالة')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('جميع الطلبات')}</SelectItem>
                  <SelectItem value="pending">{t('قيد الانتظار')}</SelectItem>
                  <SelectItem value="approved">{t('تمت الموافقة')}</SelectItem>
                  <SelectItem value="shipped">{t('تم الشحن')}</SelectItem>
                  <SelectItem value="delivered">{t('تم التسليم')}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {/* Orders List */}
            <div className="space-y-3">
              {filteredOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد طلبات')}</p>
                    <Button variant="link" onClick={() => setShowAddDialog(true)}>
                      {t('إنشاء طلب جديد')}</Button>
                  </CardContent>
                </Card>
              ) : (
                filteredOrders.map(order => (
                  <Card key={order.id} className="hover:shadow-md transition-shadow" data-testid={`order-${order.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="font-bold text-lg">{t('طلب')} #{order.order_number}</span>
                            <Badge className={getStatusColor(order.status)}>
                              {getStatusIcon(order.status)}
                              <span className="mr-1">{getStatusLabel(order.status)}</span>
                            </Badge>
                            {order.priority === 'urgent' && (
                              <Badge className="bg-red-500/20 text-red-500">عاجل</Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              {order.to_branch_name}
                            </span>
                            <span className="flex items-center gap-1">
                              <Factory className="h-4 w-4" />
                              {order.items?.length || 0} منتج
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mb-2">
                            {order.items?.slice(0, 3).map((item, idx) => (
                              <span key={idx} className="px-2 py-1 bg-muted rounded text-sm">
                                {item.product_name}: {item.quantity} {item.unit}
                              </span>
                            ))}
                            {order.items?.length > 3 && (
                              <span className="px-2 py-1 text-sm text-muted-foreground">
                                +{order.items.length - 3}
                              </span>
                            )}
                          </div>
                          
                          <p className="font-bold text-primary">{t('الإجمالي: {formatPrice(order.total_cost)}')}</p>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowOrderDetails(order)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          
                          {order.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                className="bg-blue-500 hover:bg-blue-600"
                                onClick={() => handleUpdateStatus(order.id, 'approved')}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-500 border-red-500/30"
                                onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          
                          {order.status === 'approved' && (
                            <Button
                              size="sm"
                              className="bg-purple-500 hover:bg-purple-600"
                              onClick={() => handleUpdateStatus(order.id, 'shipped')}
                            >
                              <Truck className="h-4 w-4 ml-1" />
                              شحن
                            </Button>
                          )}
                          
                          {order.status === 'shipped' && (
                            <Button
                              size="sm"
                              className="bg-green-500 hover:bg-green-600"
                              onClick={() => handleUpdateStatus(order.id, 'delivered')}
                            >
                              <CheckCircle className="h-4 w-4 ml-1" />
                              تسليم
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
          {/* مخزون الفروع */}
          <TabsContent value="inventory" className="space-y-4">
            <div className="flex gap-2 items-center">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder={t('اختر الفرع')} />
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
            {!selectedBranch ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('اختر فرع لعرض مخزونه')}</p>
                </CardContent>
              </Card>
            ) : branchInventory.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Box className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('لا يوجد مخزون في هذا الفرع')}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {branchInventory.map(item => (
                  <Card key={item.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold">{item.product_name}</h3>
                          <p className="text-xs text-muted-foreground">{item.unit}</p>
                        </div>
                        <Badge className={item.quantity > 0 ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}>
                          {item.quantity > 0 ? t('متوفر') : t('نفد')}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                        <div className="text-center p-2 bg-blue-500/10 rounded">
                          <p className="text-xs text-blue-400">{t('الوارد')}</p>
                          <p className="text-lg font-bold text-blue-500">{item.received_quantity || item.quantity || 0}</p>
                        </div>
                        <div className="text-center p-2 bg-green-500/10 rounded">
                          <p className="text-xs text-green-400">{t('المتبقي')}</p>
                          <p className="text-lg font-bold text-green-500">{item.quantity || 0}</p>
                        </div>
                        <div className="text-center p-2 bg-orange-500/10 rounded">
                          <p className="text-xs text-orange-400">{t('المباع')}</p>
                          <p className="text-lg font-bold text-orange-500">{item.sold_quantity || 0}</p>
                        </div>
                      </div>
                      
                      {/* شريط التقدم */}
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                        <div 
                          className="bg-gradient-to-r from-green-500 to-orange-500 h-2 rounded-full transition-all"
                          style={{ width: `${((item.sold_quantity || 0) / (item.received_quantity || item.quantity || 1)) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        {t('نسبة البيع')}: {(((item.sold_quantity || 0) / (item.received_quantity || item.quantity || 1)) * 100).toFixed(1)}%
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
      {/* Dialog: إنشاء طلب جديد */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              طلب جديد من قسم التصنيع
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* اختيار الفرع */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('الفرع المستلم *')}</Label>
                <Select 
                  value={form.to_branch_id} 
                  onValueChange={(v) => setForm(prev => ({ ...prev, to_branch_id: v }))}
                >
                  <SelectTrigger data-testid="select-branch">
                    <SelectValue placeholder={t('اختر الفرع')} />
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
              <div>
                <Label>{t('الأولوية')}</Label>
                <Select 
                  value={form.priority} 
                  onValueChange={(v) => setForm(prev => ({ ...prev, priority: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('منخفضة')}</SelectItem>
                    <SelectItem value="normal">{t('عادية')}</SelectItem>
                    <SelectItem value="high">{t('عالية')}</SelectItem>
                    <SelectItem value="urgent">{t('عاجل')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* إضافة منتجات */}
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Factory className="h-5 w-5 text-green-500" />
                <Label className="font-bold">{t('إضافة منتج من التصنيع')}</Label>
              </div>
              
              {manufacturedProducts.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                  <p className="text-sm">{t('لا توجد منتجات مصنعة متوفرة')}</p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="flex-1 bg-background">
                      <SelectValue placeholder={t('اختر منتج...')} />
                    </SelectTrigger>
                    <SelectContent>
                      {manufacturedProducts.filter(p => p.quantity > 0).map(product => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} (متوفر: {product.quantity} {product.unit})
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
                    placeholder={t('الكمية')}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="bg-green-500 hover:bg-green-600"
                    onClick={addProductToOrder}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            
            {/* قائمة المنتجات المختارة */}
            {form.items.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 font-medium text-sm">
                  المنتجات المطلوبة ({form.items.length})
                </div>
                <div className="divide-y max-h-48 overflow-y-auto">
                  {form.items.map((item, index) => (
                    <div key={index} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <span className="font-medium">{item.product_name}</span>
                        <span className="text-muted-foreground text-sm mr-2">
                          ({item.quantity} {item.unit} × {formatPrice(item.cost_per_unit)})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">{formatPrice(item.quantity * item.cost_per_unit)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeProductFromOrder(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-primary/10 px-3 py-2 flex justify-between items-center">
                  <span className="font-medium">{t('الإجمالي:')}</span>
                  <span className="font-bold text-lg text-primary">{formatPrice(calculateTotal())}</span>
                </div>
              </div>
            )}
            
            {/* ملاحظات */}
            <div>
              <Label>{t('ملاحظات')}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={t('ملاحظات إضافية...')}
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('إلغاء')}</Button>
            <Button 
              onClick={handleSubmitOrder}
              disabled={!form.to_branch_id || form.items.length === 0 || submitting}
              className="bg-primary"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              إنشاء الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog: تفاصيل الطلب */}
      <Dialog open={!!showOrderDetails} onOpenChange={() => setShowOrderDetails(null)}>
        <DialogContent className="max-w-lg">
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
                  <span className="text-muted-foreground">{t('الفرع:')}</span>
                  <span className="font-medium mr-2">{showOrderDetails.to_branch_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('الحالة:')}</span>
                  <Badge className={`mr-2 ${getStatusColor(showOrderDetails.status)}`}>
                    {getStatusLabel(showOrderDetails.status)}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('الأولوية:')}</span>
                  <span className="font-medium mr-2">{showOrderDetails.priority}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('التاريخ:')}</span>
                  <span className="font-medium mr-2">
                    {new Date(showOrderDetails.created_at).toLocaleDateString('en-GB')}
                  </span>
                </div>
              </div>
              
              <div className="border rounded-lg">
                <div className="bg-muted/50 px-3 py-2 font-medium text-sm">
                  المنتجات ({showOrderDetails.items?.length || 0})
                </div>
                <div className="divide-y">
                  {showOrderDetails.items?.map((item, idx) => (
                    <div key={idx} className="px-3 py-2 flex justify-between items-center text-sm">
                      <div>
                        <span className="font-medium">{item.product_name}</span>
                        <span className="text-muted-foreground mr-2">
                          ({item.quantity} {item.unit})
                        </span>
                      </div>
                      <span className="text-primary">{formatPrice(item.total_cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-primary/10 p-3 rounded-lg flex justify-between items-center">
                <span className="font-medium">{t('الإجمالي:')}</span>
                <span className="font-bold text-lg text-primary">{formatPrice(showOrderDetails.total_cost)}</span>
              </div>
              
              {showOrderDetails.notes && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <span className="text-sm text-muted-foreground">{t('ملاحظات:')}</span>
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
