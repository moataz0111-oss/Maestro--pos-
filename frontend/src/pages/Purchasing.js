import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
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
  Search,
  FileText,
  RefreshCw,
  Eye,
  Trash2,
  DollarSign,
  Camera,
  Upload,
  Send,
  Phone,
  MapPin,
  Calendar,
  Image as ImageIcon,
  X,
  Truck
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

export default function Purchasing() {
  const navigate = useNavigate();
  const { t, isRTL } = useTranslation();
  
  // States
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('invoices');
  
  // Data states
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouseRequests, setWarehouseRequests] = useState([]);
  
  // Dialog states
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(null);
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const [cameraStream, setCameraStream] = useState(null);
  
  // Form states
  const [invoiceForm, setInvoiceForm] = useState({
    supplier_id: '',
    invoice_number: '',
    items: [],
    notes: '',
    total_amount: 0,
    image: null,
    imagePreview: null
  });
  
  const [newItem, setNewItem] = useState({
    name: '',
    quantity: 1,
    unit: 'كغم',
    unit_price: 0
  });
  
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    company_name: '',
    phone: '',
    address: '',
    products: '',
    notes: ''
  });

  const headers = {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ar-IQ', { 
      minimumFractionDigits: 0,
      maximumFractionDigits: 0 
    }).format(price || 0) + ' د.ع';
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [invoicesRes, suppliersRes, requestsRes] = await Promise.all([
        axios.get(`${API}/purchase-invoices`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/purchase-suppliers`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/warehouse-purchase-requests`, { headers, params: { status: 'approved_by_owner' } }).catch(() => ({ data: [] }))
      ]);
      
      setInvoices(invoicesRes.data || []);
      setSuppliers(suppliersRes.data || []);
      setWarehouseRequests(requestsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // حساب إجمالي الفاتورة
  const calculateTotal = () => {
    return invoiceForm.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  // إضافة صنف للفاتورة
  const addItemToInvoice = () => {
    if (!newItem.name || newItem.quantity <= 0 || newItem.unit_price <= 0) {
      toast.error(t('يرجى ملء جميع حقول الصنف'));
      return;
    }
    
    setInvoiceForm(prev => ({
      ...prev,
      items: [...prev.items, { ...newItem, total: newItem.quantity * newItem.unit_price }]
    }));
    
    setNewItem({ name: '', quantity: 1, unit: 'كغم', unit_price: 0 });
  };

  // حذف صنف من الفاتورة
  const removeItemFromInvoice = (index) => {
    setInvoiceForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // رفع صورة الفاتورة
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('حجم الصورة يجب أن يكون أقل من 5 ميجابايت'));
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setInvoiceForm(prev => ({
          ...prev,
          image: file,
          imagePreview: reader.result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // فتح الكاميرا
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // الكاميرا الخلفية
      });
      setCameraStream(stream);
      setShowCameraDialog(true);
      // سيتم ربط الـ stream بالـ video في useEffect
    } catch (error) {
      console.error('Camera error:', error);
      toast.error(t('لم نتمكن من الوصول للكاميرا. تأكد من السماح بالوصول.'));
    }
  };

  // التقاط صورة من الكاميرا
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setInvoiceForm(prev => ({
        ...prev,
        imagePreview: imageData
      }));
      
      closeCamera();
      toast.success(t('تم التقاط الصورة بنجاح'));
    }
  };

  // استخراج بيانات الفاتورة من الصورة (OCR)
  const extractInvoiceData = async (imageData) => {
    if (!imageData) {
      toast.error(t('يرجى تحميل صورة أولاً'));
      return;
    }
    
    setOcrLoading(true);
    try {
      const response = await axios.post(`${API}/purchase-invoices/ocr`, {
        image_data: imageData
      }, { headers });
      
      if (response.data.success) {
        const data = response.data.data;
        
        // تحديث النموذج بالبيانات المستخرجة
        setInvoiceForm(prev => ({
          ...prev,
          invoice_number: data.invoice_number || prev.invoice_number,
          notes: data.notes || prev.notes,
          items: data.items && data.items.length > 0 ? data.items.map(item => ({
            name: item.name || '',
            quantity: item.quantity || 1,
            unit: item.unit || 'كغم',
            unit_price: item.unit_price || 0,
            total: (item.quantity || 1) * (item.unit_price || 0)
          })) : prev.items
        }));
        
        toast.success(t('تم استخراج بيانات الفاتورة بنجاح! راجع البيانات وعدّلها إذا لزم الأمر.'));
      } else {
        toast.warning(t('لم نتمكن من استخراج البيانات تلقائياً. يرجى إدخالها يدوياً.'));
      }
    } catch (error) {
      console.error('OCR Error:', error);
      toast.error(t('فشل في تحليل الصورة. يرجى إدخال البيانات يدوياً.'));
    } finally {
      setOcrLoading(false);
    }
  };

  // إغلاق الكاميرا
  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCameraDialog(false);
  };

  // ربط الـ stream بالـ video عند فتح الـ dialog
  React.useEffect(() => {
    if (showCameraDialog && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [showCameraDialog, cameraStream]);

  // تنظيف الكاميرا عند unmount
  React.useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // حفظ الفاتورة
  const handleSaveInvoice = async () => {
    if (invoiceForm.items.length === 0) {
      toast.error(t('يرجى إضافة أصناف للفاتورة'));
      return;
    }
    
    setSubmitting(true);
    try {
      const formData = {
        supplier_id: invoiceForm.supplier_id,
        invoice_number: invoiceForm.invoice_number,
        items: invoiceForm.items.map(it => ({
          name: it.name,
          quantity: parseFloat(it.quantity) || 0,
          unit: it.unit,
          cost_per_unit: parseFloat(it.unit_price) || 0,
        })),
        notes: invoiceForm.notes,
        total_amount: calculateTotal(),
        image_data: invoiceForm.imagePreview,
        payment_method: 'cash',
        payment_status: 'paid',
      };
      
      // إذا كان مرتبطاً بطلب من المخزن → استخدم الـ endpoint الجديد
      if (invoiceForm.request_id) {
        await axios.post(
          `${API}/warehouse-purchase-requests/${invoiceForm.request_id}/price-and-create-invoice`,
          formData,
          { headers }
        );
        toast.success(t('تم تسعير الطلب وإنشاء الفاتورة. أرسلها للمخزن.'));
      } else {
        // فاتورة شراء مباشرة (بدون طلب من المخزن)
        await axios.post(`${API}/purchase-invoices`, formData, { headers });
        toast.success(t('تم حفظ الفاتورة بنجاح'));
      }
      
      setShowInvoiceDialog(false);
      setInvoiceForm({
        supplier_id: '',
        invoice_number: '',
        items: [],
        notes: '',
        total_amount: 0,
        image: null,
        imagePreview: null,
        request_id: null
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ الفاتورة'));
    } finally {
      setSubmitting(false);
    }
  };

  // حفظ المورد
  const handleSaveSupplier = async () => {
    if (!supplierForm.name || !supplierForm.phone) {
      toast.error(t('يرجى ملء الحقول المطلوبة'));
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/purchase-suppliers`, supplierForm, { headers });
      
      toast.success(t('تم حفظ المورد بنجاح'));
      setShowSupplierDialog(false);
      setSupplierForm({
        name: '',
        company_name: '',
        phone: '',
        address: '',
        products: '',
        notes: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ المورد'));
    } finally {
      setSubmitting(false);
    }
  };

  // تحويل الطلب للمخزن (مرحلة الاستلام)
  const handleTransferToWarehouse = async (requestId) => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/warehouse-purchase-requests/${requestId}/confirm-receipt`, {}, { headers });
      toast.success(t('تم إرسال الطلب للمخزن — الكميات ستُضاف للمخزون'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في التحويل'));
    } finally {
      setSubmitting(false);
    }
  };

  // حذف فاتورة
  const handleDeleteInvoice = async (invoiceId) => {
    if (!confirm(t('هل أنت متأكد من حذف الفاتورة؟'))) return;
    
    try {
      await axios.delete(`${API}/purchase-invoices/${invoiceId}`, { headers });
      toast.success(t('تم حذف الفاتورة'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في حذف الفاتورة'));
    }
  };

  // إرسال الفاتورة للمخزن (دخول المواد للمخزون كطبقات FIFO)
  const [sendingToWarehouseId, setSendingToWarehouseId] = React.useState(null);
  const handleSendToWarehouse = async (invoice) => {
    if (!confirm(t('هل تريد إرسال هذه الفاتورة للمخزن؟ سيتم إضافة المواد للمخزون.'))) return;
    setSendingToWarehouseId(invoice.id);
    try {
      await axios.post(`${API}/purchase-invoices/${invoice.id}/send-to-warehouse`, {}, { headers });
      toast.success(t('تم إرسال الفاتورة للمخزن بنجاح'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إرسال الفاتورة للمخزن'));
    } finally {
      setSendingToWarehouseId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate(-1)} size="icon">
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-primary" />
              {t('إدارة المشتريات')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('الشراء من الموردين وإرسال للمخزن')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSupplierDialog(true)}>
            <Building2 className="h-4 w-4 ml-2" />
            {t('مورد جديد')}
          </Button>
          <Button onClick={() => setShowInvoiceDialog(true)} className="bg-primary">
            <Plus className="h-4 w-4 ml-2" />
            {t('فاتورة شراء')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" />
            {t('الفواتير')}
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-2">
            <Building2 className="h-4 w-4" />
            {t('الموردين')}
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2 relative">
            <Package className="h-4 w-4" />
            {t('طلبات المخزن')}
            {warehouseRequests.filter(r => r.status === 'approved_by_owner').length > 0 && (
              <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {warehouseRequests.filter(r => r.status === 'approved_by_owner').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* تاب الفواتير */}
        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  {t('فواتير الشراء')}
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  {t('الإجمالي')}: {formatPrice(invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('لا توجد فواتير شراء')}</p>
                  <Button variant="link" onClick={() => setShowInvoiceDialog(true)}>
                    {t('إنشاء فاتورة جديدة')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {invoices.map(invoice => (
                    <div key={invoice.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-lg">{t('فاتورة')} #{invoice.invoice_number || invoice.id?.slice(0, 8)}</span>
                            <Badge className={invoice.status === 'transferred' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'}>
                              {invoice.status === 'transferred' ? t('محولة للمخزن') : t('جديدة')}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span>{invoice.supplier_name || t('غير محدد')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span>{new Date(invoice.created_at).toLocaleDateString('ar-EG', {
                                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <span>{invoice.items?.length || 0} {t('أصناف')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-primary" />
                              <span className="font-bold text-primary">{formatPrice(invoice.total_amount)}</span>
                            </div>
                          </div>
                          
                          {/* الأصناف */}
                          <div className="bg-muted/30 rounded-lg p-3 mb-3">
                            <p className="text-sm font-medium mb-2">{t('الأصناف')}:</p>
                            <div className="space-y-1">
                              {invoice.items?.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                  <span>{item.name}</span>
                                  <span>{item.quantity} {item.unit} × {formatPrice(item.unit_price)}</span>
                                </div>
                              ))}
                              {invoice.items?.length > 3 && (
                                <p className="text-xs text-muted-foreground">+{invoice.items.length - 3} {t('أصناف أخرى')}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* صورة الفاتورة + الإجراءات */}
                        <div className="flex flex-col gap-2 mr-4">
                          {invoice.image_data ? (
                            <button
                              onClick={() => setShowImageDialog(invoice)}
                              className="w-20 h-20 rounded-lg border overflow-hidden hover:opacity-80 transition-opacity"
                            >
                              <img src={invoice.image_data} alt="فاتورة" className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="w-20 h-20 rounded-lg border flex items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-8 w-8" />
                            </div>
                          )}
                          {/* إرسال للمخزن — يظهر فقط للفواتير غير المُحوّلة */}
                          {invoice.status !== 'transferred' && (
                            <Button
                              size="sm"
                              onClick={() => handleSendToWarehouse(invoice)}
                              disabled={sendingToWarehouseId === invoice.id}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
                              data-testid={`send-to-warehouse-${invoice.id}`}
                            >
                              <Send className="h-3.5 w-3.5 ml-1" />
                              {sendingToWarehouseId === invoice.id ? t('جارٍ الإرسال...') : t('إرسال للمخزن')}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteInvoice(invoice.id)}
                            className="text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* تاب الموردين */}
        <TabsContent value="suppliers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {t('الموردين')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {suppliers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('لا يوجد موردين')}</p>
                  <Button variant="link" onClick={() => setShowSupplierDialog(true)}>
                    {t('إضافة مورد جديد')}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {suppliers.map(supplier => (
                    <Card key={supplier.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-bold text-lg">{supplier.name}</h3>
                            {supplier.company_name && (
                              <p className="text-sm text-muted-foreground">{supplier.company_name}</p>
                            )}
                          </div>
                          <Building2 className="h-8 w-8 text-primary/30" />
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span dir="ltr">{supplier.phone}</span>
                          </div>
                          {supplier.address && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{supplier.address}</span>
                            </div>
                          )}
                          {supplier.products && (
                            <div className="mt-2 p-2 bg-muted/30 rounded">
                              <p className="text-xs text-muted-foreground mb-1">{t('المنتجات')}:</p>
                              <p className="text-sm">{supplier.products}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* تاب طلبات المخزن */}
        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-orange-500" />
                {t('طلبات المخزن')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('الطلبات الواردة من قسم المخزن')}
              </p>
            </CardHeader>
            <CardContent>
              {warehouseRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('لا توجد طلبات من المخزن')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {warehouseRequests.map(request => (
                    <div key={request.id} className={`p-4 border rounded-lg ${request.status === 'approved_by_owner' ? 'border-orange-500 bg-orange-500/5' : request.status === 'priced_by_purchasing' ? 'border-blue-500 bg-blue-500/5' : request.status === 'received_by_warehouse' ? 'border-green-500 bg-green-500/5' : ''}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg">{t('طلب')} #{request.request_number}</span>
                          <Badge className={
                            request.status === 'approved_by_owner' ? 'bg-orange-500/20 text-orange-500' :
                            request.status === 'priced_by_purchasing' ? 'bg-blue-500/20 text-blue-500' :
                            request.status === 'received_by_warehouse' ? 'bg-green-500/20 text-green-500' :
                            'bg-gray-500/20 text-gray-500'
                          }>
                            {request.status === 'approved_by_owner' ? t('معتمد — جاهز للتسعير') :
                             request.status === 'priced_by_purchasing' ? t('تم التسعير — جاهز للاستلام') :
                             request.status === 'received_by_warehouse' ? t('تم الاستلام نهائياً') : request.status}
                          </Badge>
                          {request.priority === 'urgent' && (
                            <Badge className="bg-red-500 text-white">{t('مستعجل')}</Badge>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(request.created_at).toLocaleDateString('ar-EG', {
                            year: 'numeric', month: 'short', day: 'numeric'
                          })}
                        </span>
                      </div>
                      
                      {/* المواد المطلوبة */}
                      <div className="bg-muted/30 rounded-lg p-3 mb-3">
                        <p className="text-sm font-medium mb-2">{t('المواد المطلوبة')}:</p>
                        <div className="space-y-1">
                          {request.items?.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span>{item.material_name || item.name}</span>
                              <span className="font-medium">{item.quantity} {item.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {request.notes && (
                        <p className="text-sm text-muted-foreground mb-3">
                          <span className="font-medium">{t('ملاحظات')}: </span>{request.notes}
                        </p>
                      )}
                      
                      {request.owner_approved_by_name && (
                        <p className="text-xs text-emerald-600 mb-2">
                          ✓ {t('معتمد من')}: {request.owner_approved_by_name}
                        </p>
                      )}
                      
                      {/* أزرار الإجراءات */}
                      <div className="flex gap-2">
                        {request.status === 'approved_by_owner' && (
                          <Button
                            onClick={() => {
                              // فتح نافذة الفاتورة مع ملء المواد
                              setInvoiceForm(prev => ({
                                ...prev,
                                items: request.items?.map(item => ({
                                  name: item.material_name || item.name,
                                  quantity: item.quantity,
                                  unit: item.unit || 'كغم',
                                  unit_price: 0,
                                  total: 0
                                })) || [],
                                request_id: request.id
                              }));
                              setShowInvoiceDialog(true);
                            }}
                            className="bg-blue-500 hover:bg-blue-600"
                            data-testid={`price-request-${request.id}`}
                          >
                            <DollarSign className="h-4 w-4 ml-2" />
                            {t('تسعير وإنشاء فاتورة')}
                          </Button>
                        )}
                        {request.status === 'priced_by_purchasing' && (
                          <Button
                            onClick={() => handleTransferToWarehouse(request.id)}
                            className="bg-green-500 hover:bg-green-600"
                            disabled={submitting}
                          >
                            {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Truck className="h-4 w-4 ml-2" />}
                            {t('تحويل للمخزن')}
                          </Button>
                        )}
                        {request.status === 'received_by_warehouse' && (
                          <Badge className="bg-green-500 text-white px-4 py-2">
                            <CheckCircle className="h-4 w-4 ml-2" />
                            {t('تم التحويل')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: إنشاء فاتورة */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {t('إنشاء فاتورة شراء')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* رفع صورة الفاتورة */}
            <div className="border-2 border-dashed rounded-lg p-4">
              <Label className="mb-2 block">{t('صورة الفاتورة')}</Label>
              {invoiceForm.imagePreview ? (
                <div className="space-y-3">
                  <div className="relative">
                    <img src={invoiceForm.imagePreview} alt="فاتورة" className="w-full max-h-48 object-contain rounded-lg" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => setInvoiceForm(prev => ({ ...prev, image: null, imagePreview: null }))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* زر استخراج البيانات */}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 border-0"
                    onClick={() => extractInvoiceData(invoiceForm.imagePreview)}
                    disabled={ocrLoading}
                  >
                    {ocrLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                        {t('جاري تحليل الصورة...')}
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 ml-2" />
                        {t('استخراج البيانات تلقائياً (AI)')}
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-4 justify-center">
                  {/* زر فتح الكاميرا */}
                  <button
                    type="button"
                    onClick={openCamera}
                    className="flex flex-col items-center justify-center p-6 cursor-pointer hover:bg-primary/10 rounded-lg border-2 border-primary/30 hover:border-primary transition-all"
                  >
                    <Camera className="h-12 w-12 text-primary mb-2" />
                    <p className="text-sm font-medium text-primary">{t('التقاط صورة')}</p>
                  </button>
                  
                  {/* زر رفع من الجهاز */}
                  <label className="flex flex-col items-center justify-center p-6 cursor-pointer hover:bg-muted/50 rounded-lg border-2 border-dashed hover:border-muted-foreground transition-all">
                    <Upload className="h-12 w-12 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">{t('رفع من الجهاز')}</p>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </label>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('المورد')}</Label>
                <Select value={invoiceForm.supplier_id} onValueChange={(v) => setInvoiceForm(prev => ({ ...prev, supplier_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('اختر المورد')} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('رقم الفاتورة')}</Label>
                <Input
                  value={invoiceForm.invoice_number}
                  onChange={(e) => setInvoiceForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                  placeholder={t('رقم الفاتورة')}
                />
              </div>
            </div>
            
            {/* إضافة صنف */}
            <div className="border rounded-lg p-3">
              <Label className="mb-2 block">{t('إضافة صنف')}</Label>
              <div className="grid grid-cols-5 gap-2">
                <Input
                  placeholder={t('اسم الصنف')}
                  value={newItem.name}
                  onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                  className="col-span-2"
                />
                <Input
                  type="number"
                  placeholder={t('الكمية')}
                  value={newItem.quantity}
                  onChange={(e) => setNewItem(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                />
                <Input
                  type="number"
                  placeholder={t('السعر')}
                  value={newItem.unit_price}
                  onChange={(e) => setNewItem(prev => ({ ...prev, unit_price: parseFloat(e.target.value) || 0 }))}
                />
                <Button onClick={addItemToInvoice} type="button">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* قائمة الأصناف */}
            {invoiceForm.items.length > 0 && (
              <div className="border rounded-lg p-3">
                <Label className="mb-2 block">{t('الأصناف')} ({invoiceForm.items.length})</Label>
                <div className="space-y-2">
                  {invoiceForm.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <div className="flex items-center gap-4">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-sm text-muted-foreground">{item.quantity} {item.unit}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium">{formatPrice(item.quantity * item.unit_price)}</span>
                        <Button variant="ghost" size="icon" onClick={() => removeItemFromInvoice(idx)}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t font-bold">
                    <span>{t('الإجمالي')}</span>
                    <span className="text-primary">{formatPrice(calculateTotal())}</span>
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <Label>{t('ملاحظات')}</Label>
              <Textarea
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={t('ملاحظات إضافية')}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={handleSaveInvoice} disabled={submitting}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <CheckCircle className="h-4 w-4 ml-2" />}
              {t('حفظ الفاتورة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: إضافة مورد */}
      <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {t('إضافة مورد جديد')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('اسم المورد')} *</Label>
              <Input
                value={supplierForm.name}
                onChange={(e) => setSupplierForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('اسم المورد')}
              />
            </div>
            <div>
              <Label>{t('اسم الشركة')}</Label>
              <Input
                value={supplierForm.company_name}
                onChange={(e) => setSupplierForm(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder={t('اسم الشركة')}
              />
            </div>
            <div>
              <Label>{t('رقم الهاتف')} *</Label>
              <Input
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder={t('رقم الهاتف')}
                dir="ltr"
              />
            </div>
            <div>
              <Label>{t('العنوان')}</Label>
              <Input
                value={supplierForm.address}
                onChange={(e) => setSupplierForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder={t('العنوان')}
              />
            </div>
            <div>
              <Label>{t('المنتجات التي يوردها')}</Label>
              <Textarea
                value={supplierForm.products}
                onChange={(e) => setSupplierForm(prev => ({ ...prev, products: e.target.value }))}
                placeholder={t('مثال: لحوم، دجاج، خضروات...')}
              />
            </div>
            <div>
              <Label>{t('ملاحظات')}</Label>
              <Textarea
                value={supplierForm.notes}
                onChange={(e) => setSupplierForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={t('ملاحظات إضافية')}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSupplierDialog(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={handleSaveSupplier} disabled={submitting}>
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
              {t('حفظ المورد')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: عرض صورة الفاتورة */}
      <Dialog open={!!showImageDialog} onOpenChange={() => setShowImageDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {t('صورة الفاتورة')} #{showImageDialog?.invoice_number || showImageDialog?.id?.slice(0, 8)}
            </DialogTitle>
          </DialogHeader>
          {showImageDialog?.image_data && (
            <img src={showImageDialog.image_data} alt="فاتورة" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: الكاميرا */}
      <Dialog open={showCameraDialog} onOpenChange={closeCamera}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              {t('التقاط صورة الفاتورة')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* عرض الكاميرا */}
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto"
                style={{ maxHeight: '400px' }}
              />
            </div>
            
            {/* Canvas مخفي لالتقاط الصورة */}
            <canvas ref={canvasRef} className="hidden" />
            
            <p className="text-center text-sm text-muted-foreground">
              {t('وجّه الكاميرا نحو الفاتورة ثم اضغط زر الالتقاط')}
            </p>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={closeCamera}>
              <X className="h-4 w-4 ml-2" />
              {t('إلغاء')}
            </Button>
            <Button onClick={capturePhoto} className="bg-primary">
              <Camera className="h-4 w-4 ml-2" />
              {t('التقاط الصورة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
