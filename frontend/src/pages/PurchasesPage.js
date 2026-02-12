import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { API_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  ArrowRight,
  Plus,
  Minus,
  ShoppingCart,
  Truck,
  Send,
  Search,
  Filter,
  Eye,
  Upload,
  Camera,
  Package,
  Building2,
  CheckCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  X,
  Edit,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
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
const API = API_URL;
export default function PurchasesPage() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  
  const [activeTab, setActiveTab] = useState('purchases');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Data states
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  
  // Dialog states
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(null);
  const [showUploadDialog, setShowUploadDialog] = useState(null);
  
  // Form states
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '',
    invoice_number: '',
    items: [],
    total_amount: 0,
    payment_method: 'cash',
    payment_status: 'paid',
    notes: ''
  });
  
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    company_name: '',
    notes: ''
  });
  
  const [newItem, setNewItem] = useState({
    name: '',
    quantity: 1,
    unit: 'كغم',
    cost_per_unit: 0
  });
  
  const [filterStatus, setFilterStatus] = useState('all');
  const [uploadFile, setUploadFile] = useState(null);
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  useEffect(() => {
    fetchData();
  }, [activeTab]);
  const fetchData = async () => {
    setLoading(true);
    try {
      const [purchasesRes, suppliersRes, requestsRes] = await Promise.all([
        axios.get(`${API}/purchases-new`, { headers }),
        axios.get(`${API}/suppliers`, { headers }),
        axios.get(`${API}/warehouse-purchase-requests`, { headers })
      ]);
      
      setPurchases(purchasesRes.data || []);
      setSuppliers(suppliersRes.data || []);
      setPurchaseRequests(requestsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      // إذا كان خطأ 404، هذا يعني أن الـ API لم يتم تحميله بعد
      if (error.response?.status !== 404) {
        toast.error('فشل في تحميل البيانات');
      }
    } finally {
      setLoading(false);
    }
  };
  // إضافة مورد جديد
  const handleAddSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name) {
      toast.error('الرجاء إدخال اسم المورد');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/suppliers`, supplierForm, { headers });
      toast.success('تم إضافة المورد بنجاح');
      setShowSupplierDialog(false);
      setSupplierForm({ name: '', phone: '', email: '', address: '', company_name: '', notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة المورد');
    } finally {
      setSubmitting(false);
    }
  };
  // إضافة صنف للفاتورة
  const addItemToPurchase = () => {
    if (!newItem.name || newItem.quantity <= 0 || newItem.cost_per_unit <= 0) {
      toast.error('الرجاء إدخال بيانات الصنف كاملة');
      return;
    }
    
    const item = {
      ...newItem,
      total_cost: newItem.quantity * newItem.cost_per_unit
    };
    
    setPurchaseForm(prev => ({
      ...prev,
      items: [...prev.items, item],
      total_amount: prev.total_amount + item.total_cost
    }));
    
    setNewItem({ name: '', quantity: 1, unit: 'كغم', cost_per_unit: 0 });
    toast.success(`تمت إضافة ${item.name}`);
  };
  // حذف صنف من الفاتورة
  const removeItemFromPurchase = (index) => {
    setPurchaseForm(prev => {
      const item = prev.items[index];
      return {
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
        total_amount: prev.total_amount - (item?.total_cost || 0)
      };
    });
  };
  // إنشاء فاتورة شراء
  const handleCreatePurchase = async () => {
    if (!purchaseForm.supplier_id || purchaseForm.items.length === 0) {
      toast.error('الرجاء اختيار المورد وإضافة أصناف');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/purchases-new`, purchaseForm, { headers });
      toast.success('تم إنشاء فاتورة الشراء بنجاح');
      setShowPurchaseDialog(false);
      setPurchaseForm({
        supplier_id: '',
        invoice_number: '',
        items: [],
        total_amount: 0,
        payment_method: 'cash',
        payment_status: 'paid',
        notes: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء الفاتورة');
    } finally {
      setSubmitting(false);
    }
  };
  // رفع صورة الفاتورة
  const handleUploadInvoice = async (purchaseId) => {
    if (!uploadFile) {
      toast.error('الرجاء اختيار صورة');
      return;
    }
    
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      
      await axios.post(`${API}/purchases-new/${purchaseId}/upload-invoice`, formData, {
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      toast.success('تم رفع صورة الفاتورة بنجاح');
      setShowUploadDialog(null);
      setUploadFile(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في رفع الصورة');
    } finally {
      setSubmitting(false);
    }
  };
  // إرسال للمخزن
  const handleSendToWarehouse = async (purchaseId) => {
    try {
      await axios.post(`${API}/purchases-new/${purchaseId}/send-to-warehouse`, {}, { headers });
      toast.success('تم إرسال المشتريات للمخزن بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في الإرسال للمخزن');
    }
  };
  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      case 'sent_to_warehouse': return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
      case 'received': return 'bg-green-500/20 text-green-500 border-green-500/30';
      default: return 'bg-gray-500/20 text-gray-500 border-gray-500/30';
    }
  };
  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'في انتظار الإرسال';
      case 'sent_to_warehouse': return 'تم الإرسال للمخزن';
      case 'received': return 'تم الاستلام';
      default: return status;
    }
  };
  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'paid': return 'bg-green-500/20 text-green-500';
      case 'pending': return 'bg-yellow-500/20 text-yellow-500';
      case 'partial': return 'bg-orange-500/20 text-orange-500';
      default: return 'bg-gray-500/20 text-gray-500';
    }
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background" dir="rtl" data-testid="purchases-page">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                إدارة المشتريات
              </h1>
              <p className="text-xs text-muted-foreground">{t('الشراء من الموردين وإرسال للمخزن')}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowSupplierDialog(true)}
              data-testid="add-supplier-btn"
            >
              <Building2 className="h-4 w-4 ml-2" />
              مورد جديد
            </Button>
            <Button 
              onClick={() => setShowPurchaseDialog(true)} 
              className="bg-primary hover:bg-primary/90"
              data-testid="new-purchase-btn"
            >
              <Plus className="h-4 w-4 ml-2" />
              فاتورة شراء
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-lg">
            <TabsTrigger value="purchases" className="gap-2" data-testid="tab-purchases">
              <FileText className="h-4 w-4" />
              الفواتير
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-2" data-testid="tab-suppliers">
              <Building2 className="h-4 w-4" />
              الموردين
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2" data-testid="tab-requests">
              <Package className="h-4 w-4" />
              طلبات المخزن
            </TabsTrigger>
          </TabsList>
          {/* الفواتير */}
          <TabsContent value="purchases" className="space-y-4">
            {/* Filter */}
            <div className="flex gap-2 items-center">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('الحالة')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('جميع الفواتير')}</SelectItem>
                  <SelectItem value="pending">{t('في انتظار الإرسال')}</SelectItem>
                  <SelectItem value="sent_to_warehouse">{t('تم الإرسال')}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {/* Purchases List */}
            <div className="space-y-3">
              {purchases.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد فواتير شراء')}</p>
                    <Button 
                      variant="link" 
                      className="mt-2"
                      onClick={() =>{t('setShowPurchaseDialog(true)}
                    >
                      إنشاء فاتورة جديدة')}</Button>
                  </CardContent>
                </Card>
              ) : (
                purchases
                  .filter(p => filterStatus === 'all' || p.status === filterStatus)
                  .map(purchase => (
                    <Card key={purchase.id} className="overflow-hidden hover:shadow-md transition-shadow" data-testid={`purchase-${purchase.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="font-bold text-lg">{t('فاتورة #{purchase.purchase_number}')}</span>
                              <Badge className={getStatusColor(purchase.status)}>
                                {getStatusLabel(purchase.status)}
                              </Badge>
                              <Badge className={getPaymentStatusColor(purchase.payment_status)}>
                                {purchase.payment_status === 'paid' ? 'مدفوع' : purchase.payment_status === 'pending' ? 'غير مدفوع' : 'جزئي'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                              <span className="flex items-center gap-1">
                                <Building2 className="h-4 w-4" />
                                {purchase.supplier_name || 'مورد غير معروف'}
                              </span>
                              {purchase.invoice_number && (
                                <span className="flex items-center gap-1">
                                  <FileText className="h-4 w-4" />
                                  رقم الفاتورة: {purchase.invoice_number}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm">
                              <span>{t('عدد الأصناف: {purchase.items?.length || 0}')}</span>
                              <span className="font-bold text-primary">{t('الإجمالي: {formatPrice(purchase.total_amount)}')}</span>
                            </div>
                            
                            {purchase.invoice_image_url ? (
                              <div className="flex items-center gap-2 mt-2 text-green-500 text-sm">
                                <CheckCircle className="h-4 w-4" />
                                <span>{t('صورة الفاتورة مرفقة')}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 mt-2 text-yellow-500 text-sm">
                                <AlertCircle className="h-4 w-4" />
                                <span>{t('لم يتم رفع صورة الفاتورة')}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowDetailsDialog(purchase)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            
                            {!purchase.invoice_image_url && purchase.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowUploadDialog(purchase)}
                                className="text-orange-500 border-orange-500/30"
                              >
                                <Camera className="h-4 w-4" />
                              </Button>
                            )}
                            
                            {purchase.status === 'pending' && purchase.invoice_image_url && (
                              <Button
                                size="sm"
                                onClick={() => handleSendToWarehouse(purchase.id)}
                                className="bg-green-500 hover:bg-green-600"
                              >
                                <Send className="h-4 w-4 ml-1" />
                                إرسال
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
          {/* الموردين */}
          <TabsContent value="suppliers" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.filter(s => s.is_active !== false).map(supplier => (
                <Card key={supplier.id} className="hover:shadow-md transition-shadow" data-testid={`supplier-${supplier.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-lg">{supplier.name}</h3>
                        {supplier.company_name && (
                          <p className="text-sm text-muted-foreground">{supplier.company_name}</p>
                        )}
                      </div>
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    
                    <div className="mt-3 space-y-1 text-sm">
                      {supplier.phone && (
                        <p className="text-muted-foreground">📞 {supplier.phone}</p>
                      )}
                      {supplier.address && (
                        <p className="text-muted-foreground">📍 {supplier.address}</p>
                      )}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{t('إجمالي المشتريات:')}</span>
                      <span className="font-bold text-primary">{formatPrice(supplier.total_purchases || 0)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {suppliers.filter(s => s.is_active !== false).length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا يوجد موردين')}</p>
                    <Button 
                      variant="link" 
                      className="mt-2"
                      onClick={() =>{t('setShowSupplierDialog(true)}
                    >
                      إضافة مورد جديد')}</Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
          {/* طلبات المخزن */}
          <TabsContent value="requests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  طلبات الشراء من المخزن
                </CardTitle>
              </CardHeader>
              <CardContent>
                {purchaseRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('لا توجد طلبات شراء من المخزن')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {purchaseRequests.map(request => (
                      <div 
                        key={request.id} 
                        className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold">{t('طلب #{request.request_number}')}</span>
                          <Badge className={
                            request.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                            request.status === 'approved' ? 'bg-blue-500/20 text-blue-500' :
                            request.status === 'purchased' ? 'bg-green-500/20 text-green-500' :
                            'bg-gray-500/20 text-gray-500'
                          }>
                            {request.status === 'pending' ? 'قيد الانتظار' :
                             request.status === 'approved' ? 'تمت الموافقة' :
                             request.status === 'purchased' ? 'تم الشراء' : request.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {request.items?.map((item, idx) => (
                            <span key={idx} className="ml-2">
                              {item.name} ({item.quantity} {item.unit})
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      {/* Dialog: إضافة مورد */}
      <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              إضافة مورد جديد
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleAddSupplier} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{t('اسم المورد *')}</Label>
                <Input
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('اسم المورد أو الشركة')}
                  required
                />
              </div>
              <div>
                <Label>{t('رقم الهاتف')}</Label>
                <Input
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="07XXXXXXXXX"
                />
              </div>
              <div>
                <Label>{t('البريد الإلكتروني')}</Label>
                <Input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
              <div className="col-span-2">
                <Label>{t('اسم الشركة')}</Label>
                <Input
                  value={supplierForm.company_name}
                  onChange={(e) => setSupplierForm(prev => ({ ...prev, company_name: e.target.value }))}
                  placeholder={t('اسم الشركة (اختياري)')}
                />
              </div>
              <div className="col-span-2">
                <Label>{t('العنوان')}</Label>
                <Input
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm(prev => ({ ...prev, address: e.target.value }))}
                  placeholder={t('العنوان الكامل')}
                />
              </div>
              <div className="col-span-2">
                <Label>{t('ملاحظات')}</Label>
                <Textarea
                  value={supplierForm.notes}
                  onChange={(e) => setSupplierForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={t('ملاحظات إضافية...')}
                  rows={2}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() =>{t('setShowSupplierDialog(false)}>
                {t('إلغاء')}</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
                إضافة المورد
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Dialog: إنشاء فاتورة شراء */}
      <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              إنشاء فاتورة شراء جديدة
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* اختيار المورد */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('المورد *')}</Label>
                <Select 
                  value={purchaseForm.supplier_id} 
                  onValueChange={(v) => setPurchaseForm(prev => ({ ...prev, supplier_id: v }))}
                >
                  <SelectTrigger data-testid="select-supplier">
                    <SelectValue placeholder={t('اختر المورد')} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.filter(s => s.is_active !== false).map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('رقم الفاتورة')}</Label>
                <Input
                  value={purchaseForm.invoice_number}
                  onChange={(e) => setPurchaseForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                  placeholder="INV-XXX"
                />
              </div>
            </div>
            
            {/* طريقة الدفع */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('طريقة الدفع')}</Label>
                <Select 
                  value={purchaseForm.payment_method} 
                  onValueChange={(v) => setPurchaseForm(prev => ({ ...prev, payment_method: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t('نقدي')}</SelectItem>
                    <SelectItem value="credit">{t('آجل')}</SelectItem>
                    <SelectItem value="transfer">{t('تحويل بنكي')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('حالة الدفع')}</Label>
                <Select 
                  value={purchaseForm.payment_status} 
                  onValueChange={(v) => setPurchaseForm(prev => ({ ...prev, payment_status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">{t('مدفوع')}</SelectItem>
                    <SelectItem value="pending">{t('غير مدفوع')}</SelectItem>
                    <SelectItem value="partial">{t('دفع جزئي')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* إضافة أصناف */}
            <div className="p-4 bg-muted/30 border rounded-lg space-y-3">
              <Label className="font-bold">{t('إضافة صنف')}</Label>
              <div className="grid grid-cols-12 gap-2">
                <Input
                  className="col-span-4"
                  placeholder={t('اسم الصنف')}
                  value={newItem.name}
                  onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                />
                <Input
                  className="col-span-2"
                  type="number"
                  placeholder={t('الكمية')}
                  value={newItem.quantity}
                  onChange={(e) => setNewItem(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                />
                <Select 
                  value={newItem.unit} 
                  onValueChange={(v) => setNewItem(prev => ({ ...prev, unit: v }))}
                >
                  <SelectTrigger className="col-span-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="كغم">{t('كغم')}</SelectItem>
                    <SelectItem value="غرام">{t('غرام')}</SelectItem>
                    <SelectItem value="لتر">{t('لتر')}</SelectItem>
                    <SelectItem value="قطعة">{t('قطعة')}</SelectItem>
                    <SelectItem value="علبة">{t('علبة')}</SelectItem>
                    <SelectItem value="كرتون">{t('كرتون')}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="col-span-3"
                  type="number"
                  placeholder={t('السعر/وحدة')}
                  value={newItem.cost_per_unit}
                  onChange={(e) => setNewItem(prev => ({ ...prev, cost_per_unit: parseFloat(e.target.value) || 0 }))}
                />
                <Button 
                  type="button" 
                  size="icon" 
                  className="col-span-1 bg-green-500 hover:bg-green-600"
                  onClick={addItemToPurchase}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* قائمة الأصناف */}
            {purchaseForm.items.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 font-medium text-sm">
                  الأصناف ({purchaseForm.items.length})
                </div>
                <div className="divide-y">
                  {purchaseForm.items.map((item, index) => (
                    <div key={index} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground text-sm mr-2">
                          ({item.quantity} {item.unit} × {formatPrice(item.cost_per_unit)})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">{formatPrice(item.total_cost)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeItemFromPurchase(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-primary/10 px-3 py-2 flex justify-between items-center">
                  <span className="font-medium">{t('الإجمالي:')}</span>
                  <span className="font-bold text-lg text-primary">{formatPrice(purchaseForm.total_amount)}</span>
                </div>
              </div>
            )}
            
            {/* ملاحظات */}
            <div>
              <Label>{t('ملاحظات')}</Label>
              <Textarea
                value={purchaseForm.notes}
                onChange={(e) => setPurchaseForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={t('ملاحظات إضافية...')}
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() =>{t('setShowPurchaseDialog(false)}>
              {t('إلغاء')}</Button>
            <Button 
              onClick={handleCreatePurchase}
              disabled={!purchaseForm.supplier_id || purchaseForm.items.length === 0 || submitting}
              className="bg-primary"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <FileText className="h-4 w-4 ml-2" />}
              إنشاء الفاتورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog: رفع صورة الفاتورة */}
      <Dialog open={!!showUploadDialog} onOpenChange={() => setShowUploadDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              رفع صورة الفاتورة
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="hidden"
                id="invoice-upload"
              />
              <label htmlFor="invoice-upload" className="cursor-pointer">
                {uploadFile ? (
                  <div className="space-y-2">
                    <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
                    <p className="font-medium">{uploadFile.name}</p>
                    <p className="text-sm text-muted-foreground">{t('انقر لتغيير الصورة')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">{t('انقر لاختيار صورة الفاتورة')}</p>
                    <p className="text-xs text-muted-foreground">{t('JPG, PNG - حد أقصى 5MB')}</p>
                  </div>
                )}
              </label>
            </div>
            
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-600">
              <AlertCircle className="h-4 w-4 inline ml-2" />
              يجب رفع صورة الفاتورة قبل إرسال المشتريات للمخزن
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadDialog(null); setUploadFile(null); }}>
              إلغاء
            </Button>
            <Button 
              onClick={() => handleUploadInvoice(showUploadDialog?.id)}
              disabled={!uploadFile || submitting}
              className="bg-green-500 hover:bg-green-600"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Upload className="h-4 w-4 ml-2" />}
              رفع الصورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog: تفاصيل الفاتورة */}
      <Dialog open={!!showDetailsDialog} onOpenChange={() => setShowDetailsDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              تفاصيل الفاتورة #{showDetailsDialog?.purchase_number}
            </DialogTitle>
          </DialogHeader>
          
          {showDetailsDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('المورد:')}</span>
                  <span className="font-medium mr-2">{showDetailsDialog.supplier_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('رقم الفاتورة:')}</span>
                  <span className="font-medium mr-2">{showDetailsDialog.invoice_number || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('الحالة:')}</span>
                  <Badge className={`mr-2 ${getStatusColor(showDetailsDialog.status)}`}>
                    {getStatusLabel(showDetailsDialog.status)}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('الدفع:')}</span>
                  <Badge className={`mr-2 ${getPaymentStatusColor(showDetailsDialog.payment_status)}`}>
                    {showDetailsDialog.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                  </Badge>
                </div>
              </div>
              
              <div className="border rounded-lg">
                <div className="bg-muted/50 px-3 py-2 font-medium text-sm">
                  الأصناف ({showDetailsDialog.items?.length || 0})
                </div>
                <div className="divide-y">
                  {showDetailsDialog.items?.map((item, idx) => (
                    <div key={idx} className="px-3 py-2 flex justify-between items-center text-sm">
                      <div>
                        <span className="font-medium">{item.name}</span>
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
                <span className="font-bold text-lg text-primary">{formatPrice(showDetailsDialog.total_amount)}</span>
              </div>
              
              {showDetailsDialog.invoice_image_url && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-3 py-2 font-medium text-sm flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    صورة الفاتورة
                  </div>
                  <img 
                    src={`${API.replace('/api', '')}${showDetailsDialog.invoice_image_url}`}
                    alt="صورة الفاتورة"
                    className="w-full max-h-64 object-contain"
                  />
                </div>
              )}
              
              {showDetailsDialog.notes && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <span className="text-sm text-muted-foreground">{t('ملاحظات:')}</span>
                  <p className="mt-1">{showDetailsDialog.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
