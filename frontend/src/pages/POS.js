import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/currency';
import { playClick, playSuccess } from '../utils/sound';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  ArrowRight,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Banknote,
  Clock,
  User,
  Phone,
  MapPin,
  Truck,
  UtensilsCrossed,
  Package,
  Printer,
  Check,
  X,
  ChefHat,
  Save,
  Send,
  History,
  UserCheck,
  Edit,
  Receipt,
  List,
  RefreshCw,
  AlertCircle,
  Bell,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

export default function POS() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState('dine_in');
  const [selectedTable, setSelectedTable] = useState(null);
  const [tables, setTables] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [buzzerNumber, setBuzzerNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState(0);
  const [deliveryApp, setDeliveryApp] = useState('');
  const [deliveryApps, setDeliveryApps] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);
  const [kitchenDialogOpen, setKitchenDialogOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  
  // حالات جديدة للطلبات المعلقة والعملاء
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingOrdersDialogOpen, setPendingOrdersDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null); // الطلب الحالي الذي يتم تعديله
  const [customerSearchPhone, setCustomerSearchPhone] = useState('');
  const [customerData, setCustomerData] = useState(null);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  
  // إشعارات الطلبات الجديدة
  const prevOrdersCount = useRef(0);

  useEffect(() => {
    fetchData();
    // تحديث الطلبات المعلقة كل 30 ثانية
    const interval = setInterval(fetchPendingOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  // قراءة الطاولة من URL
  useEffect(() => {
    const tableId = searchParams.get('table');
    if (tableId && tables.length > 0) {
      const table = tables.find(t => t.id === tableId);
      if (table) {
        setSelectedTable(tableId);
        setOrderType('dine_in');
        // إذا كانت الطاولة مشغولة، جلب طلبها
        if (table.status === 'occupied' && table.current_order_id) {
          loadOrderForEditing(table.current_order_id);
        }
      }
    }
  }, [searchParams, tables]);

  // قراءة بيانات المكالمة من URL (للكول سنتر)
  useEffect(() => {
    const phone = searchParams.get('phone');
    const name = searchParams.get('name');
    const fromCall = searchParams.get('from_call');
    
    if (phone) {
      // تعيين نوع الطلب إلى توصيل
      setOrderType('delivery');
      
      // تعيين رقم الهاتف
      setCustomerPhone(phone);
      setCustomerSearchPhone(phone);
      
      // تعيين اسم العميل إذا موجود
      if (name) {
        setCustomerName(decodeURIComponent(name));
      }
      
      // البحث عن بيانات العميل بعد تأخير قصير للتأكد من جاهزية axios
      const searchWithDelay = async () => {
        // انتظار قصير للتأكد من إعداد axios headers
        await new Promise(resolve => setTimeout(resolve, 500));
        await searchCustomerByPhone(phone);
      };
      searchWithDelay();
      
      // إظهار رسالة
      if (fromCall === 'true') {
        toast.success(`تم استلام مكالمة من: ${phone}`, {
          description: 'تم تعيين نوع الطلب إلى توصيل'
        });
      }
    }
  }, [searchParams]);

  const fetchData = async () => {
    try {
      const [catRes, prodRes, appsRes, shiftRes] = await Promise.all([
        axios.get(`${API}/categories`),
        axios.get(`${API}/products`),
        axios.get(`${API}/delivery-apps`),
        axios.get(`${API}/shifts/current`).catch(() => ({ data: null }))
      ]);

      setCategories(catRes.data);
      setProducts(prodRes.data);
      setDeliveryApps(appsRes.data);
      setCurrentShift(shiftRes.data);

      // جلب الطاولات
      let tablesData = [];
      if (user?.branch_id) {
        const tablesRes = await axios.get(`${API}/tables`, { params: { branch_id: user.branch_id } });
        tablesData = tablesRes.data;
      }
      if (tablesData.length === 0) {
        const allTablesRes = await axios.get(`${API}/tables`);
        tablesData = allTablesRes.data;
      }
      setTables(tablesData);

      // جلب السائقين
      const driversParams = user?.branch_id ? { branch_id: user.branch_id } : {};
      const driversRes = await axios.get(`${API}/drivers`, { params: driversParams });
      setDrivers(driversRes.data);

      if (catRes.data.length > 0) {
        setSelectedCategory(catRes.data[0].id);
      }

      // جلب الطلبات المعلقة
      await fetchPendingOrders();
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingOrders = async () => {
    try {
      // جلب جميع الطلبات غير المكتملة:
      // 1. طلبات بحالة pending أو preparing أو ready
      // 2. طلبات غير مدفوعة (payment_status = pending) لأي نوع
      const [activeRes, unpaidRes] = await Promise.all([
        axios.get(`${API}/orders`, { params: { status: 'pending,preparing,ready' } }),
        axios.get(`${API}/orders`, { params: { payment_status: 'pending' } })
      ]);
      
      // دمج الطلبات وإزالة التكرارات
      const ordersMap = new Map();
      
      // إضافة الطلبات النشطة
      for (const order of activeRes.data) {
        if (order.status !== 'cancelled') {
          ordersMap.set(order.id, order);
        }
      }
      
      // إضافة الطلبات غير المدفوعة (التي لم تُسلم ولم تُلغَ)
      for (const order of unpaidRes.data) {
        if (order.status !== 'delivered' && order.status !== 'cancelled') {
          ordersMap.set(order.id, order);
        }
      }
      
      const allOrders = Array.from(ordersMap.values());
      
      // ترتيب حسب تاريخ الإنشاء (الأحدث أولاً)
      allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      // إشعار صوتي للطلبات الجديدة
      if (prevOrdersCount.current > 0 && allOrders.length > prevOrdersCount.current) {
        playSuccess();
        toast.success('طلب جديد!', { duration: 5000 });
      }
      prevOrdersCount.current = allOrders.length;
      
      setPendingOrders(allOrders);
    } catch (error) {
      console.error('Failed to fetch pending orders:', error);
    }
  };

  // تحميل طلب موجود للتعديل
  const loadOrderForEditing = async (orderId) => {
    try {
      const res = await axios.get(`${API}/orders/${orderId}`);
      const order = res.data;
      
      setEditingOrder(order);
      setOrderType(order.order_type);
      setSelectedTable(order.table_id);
      setCustomerName(order.customer_name || '');
      setCustomerPhone(order.customer_phone || '');
      setDeliveryAddress(order.delivery_address || '');
      setBuzzerNumber(order.buzzer_number || '');
      setDiscount(order.discount || 0);
      setDeliveryApp(order.delivery_app || '');
      setOrderNotes(order.notes || '');
      
      // تحويل عناصر الطلب إلى سلة
      const cartItems = order.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        notes: item.notes || ''
      }));
      setCart(cartItems);
      
      toast.info(`تم تحميل الطلب #${order.order_number} للتعديل`);
    } catch (error) {
      console.error('Failed to load order:', error);
      toast.error('فشل في تحميل الطلب');
    }
  };

  // البحث التلقائي عن عميل بالهاتف (للكول سنتر)
  const searchCustomerByPhone = async (phone) => {
    if (!phone || phone.length < 4) return;
    
    try {
      const res = await axios.get(`${API}/customers/by-phone/${phone}`);
      if (res.data && res.data.found && res.data.customer) {
        const customer = res.data.customer;
        setCustomerData(customer);
        setCustomerName(customer.name || '');
        setDeliveryAddress(customer.address || '');
        setCustomerHistory(res.data.orders || []);
        setShowCustomerInfo(true);
        toast.success(`عميل موجود: ${customer.name}`, {
          description: customer.address ? `العنوان: ${customer.address}` : 'لا يوجد عنوان محفوظ'
        });
      } else {
        // عميل جديد
        setCustomerData(null);
        setShowCustomerInfo(false);
        toast.info('عميل جديد - يمكنك إضافة بياناته');
      }
    } catch (error) {
      console.error('Error searching customer:', error);
      setCustomerData(null);
      setShowCustomerInfo(false);
    }
  };

  // البحث عن عميل بالهاتف (يدوي)
  const handleSearchCustomer = async () => {
    if (!customerSearchPhone || customerSearchPhone.length < 4) {
      toast.error('أدخل رقم هاتف صحيح');
      return;
    }
    
    try {
      const res = await axios.get(`${API}/customers/by-phone/${customerSearchPhone}`);
      if (res.data && res.data.found && res.data.customer) {
        const customer = res.data.customer;
        setCustomerData(customer);
        setCustomerName(customer.name || '');
        setCustomerPhone(customer.phone || customerSearchPhone);
        setDeliveryAddress(customer.address || '');
        setCustomerHistory(res.data.orders || []);
        setShowCustomerInfo(true);
        toast.success(`تم العثور على العميل: ${customer.name}`);
      } else {
        toast.info('عميل جديد - يمكنك إضافة بياناته');
        setCustomerPhone(customerSearchPhone);
        setCustomerData(null);
        setShowCustomerInfo(false);
      }
    } catch (error) {
      console.error('Error searching customer:', error);
      toast.error('فشل في البحث عن العميل');
      setCustomerPhone(customerSearchPhone);
      setCustomerData(null);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name_en?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch && p.is_available;
  });

  const addToCart = useCallback((product) => {
    playClick();
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        quantity: 1,
        notes: ''
      }];
    });
  }, []);

  const updateQuantity = useCallback((productId, delta) => {
    playClick();
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  }, []);

  const removeFromCart = useCallback((productId) => {
    playClick();
    setCart(prev => prev.filter(item => item.product_id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    playClick();
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setBuzzerNumber('');
    setDiscount(0);
    setSelectedTable(null);
    setDeliveryApp('');
    setSelectedDriver('');
    setOrderNotes('');
    setEditingOrder(null);
    setCustomerData(null);
    setCustomerSearchPhone('');
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // حساب عمولة شركة التوصيل
  const selectedDeliveryApp = deliveryApps.find(a => a.id === deliveryApp);
  const commissionRate = selectedDeliveryApp?.commission_rate || 0;
  const commissionAmount = subtotal * (commissionRate / 100);
  
  // المجموع بعد الخصم والعمولة
  const totalBeforeCommission = subtotal - discount;
  const netTotal = totalBeforeCommission - commissionAmount;

  // حفظ الطلب وإرسال للمطبخ (بدون دفع)
  const handleSaveAndSendToKitchen = async () => {
    if (cart.length === 0) {
      toast.error('السلة فارغة');
      return;
    }

    if (orderType === 'dine_in' && !selectedTable) {
      toast.error('يرجى اختيار طاولة');
      return;
    }

    if (orderType === 'delivery' && !deliveryAddress) {
      toast.error('يرجى إدخال عنوان التوصيل');
      return;
    }

    setSubmitting(true);
    try {
      // إذا كنا نعدل طلب موجود - إضافة العناصر الجديدة فقط
      if (editingOrder) {
        const existingProductIds = editingOrder.items.map(i => i.product_id);
        const newItems = cart.filter(item => !existingProductIds.includes(item.product_id));
        
        // تحقق إذا كانت هناك عناصر جديدة
        if (newItems.length > 0) {
          await axios.put(`${API}/orders/${editingOrder.id}/add-items`, newItems);
        }
        
        toast.success('تم تحديث الطلب وإرساله للمطبخ');
      } else {
        // طلب جديد - معلق للسفري والطاولات، جاهز للتوصيل
        const isDeliveryOrder = orderType === 'delivery';
        const orderData = {
          order_type: orderType,
          table_id: orderType === 'dine_in' ? selectedTable : null,
          customer_name: customerName,
          customer_phone: customerPhone,
          delivery_address: orderType === 'delivery' ? deliveryAddress : null,
          buzzer_number: orderType === 'takeaway' ? buzzerNumber : null,
          items: cart,
          branch_id: user?.branch_id || (await axios.get(`${API}/branches`)).data[0]?.id,
          payment_method: 'pending',
          discount: discount,
          delivery_app: orderType === 'delivery' ? deliveryApp : null,
          driver_id: orderType === 'delivery' ? selectedDriver : null,
          notes: orderNotes,
          auto_ready: isDeliveryOrder  // معلق للسفري والطاولات، جاهز للتوصيل فقط
        };
        
        const res = await axios.post(`${API}/orders`, orderData);
        playSuccess();
        
        // إذا كان طلب توصيل مع سائق، نعين السائق مباشرة
        if (orderType === 'delivery' && selectedDriver) {
          await axios.put(`${API}/drivers/${selectedDriver}/assign?order_id=${res.data.id}`);
          toast.success(`تم إنشاء الطلب #${res.data.order_number} وتحويله للسائق`);
        } else {
          toast.success(`تم إنشاء الطلب #${res.data.order_number}`);
        }
      }
      
      setKitchenDialogOpen(false);
      clearCart();
      await fetchPendingOrders();
      
      // تحديث الطاولات إذا كان طلب داخلي
      if (orderType === 'dine_in') {
        const tablesRes = await axios.get(`${API}/tables`);
        setTables(tablesRes.data);
      }
    } catch (error) {
      console.error('Failed to save order:', error);
      toast.error(error.response?.data?.detail || 'فشل في حفظ الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  // تأكيد الطلب مع الدفع
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      toast.error('السلة فارغة');
      return;
    }

    if (orderType === 'dine_in' && !selectedTable && !editingOrder) {
      toast.error('يرجى اختيار طاولة');
      return;
    }

    if (orderType === 'delivery' && !deliveryAddress) {
      toast.error('يرجى إدخال عنوان التوصيل');
      return;
    }

    setSubmitting(true);
    try {
      if (editingOrder) {
        // تحديث الطلب الموجود مع الدفع
        // أولاً: إضافة أي عناصر جديدة
        const existingProductIds = editingOrder.items.map(i => i.product_id);
        const newItems = cart.filter(item => !existingProductIds.includes(item.product_id));
        
        if (newItems.length > 0) {
          await axios.put(`${API}/orders/${editingOrder.id}/add-items`, newItems);
        }
        
        // ثانياً: تحديث طريقة الدفع والحالة
        await axios.put(`${API}/orders/${editingOrder.id}/payment?payment_method=${paymentMethod}`);
        await axios.put(`${API}/orders/${editingOrder.id}/status?status=delivered`);
        
        playSuccess();
        toast.success(`تم إتمام الطلب #${editingOrder.order_number}`);
      } else {
        // طلب جديد مع دفع مباشر
        const orderData = {
          order_type: orderType,
          table_id: orderType === 'dine_in' ? selectedTable : null,
          customer_name: customerName,
          customer_phone: customerPhone,
          delivery_address: orderType === 'delivery' ? deliveryAddress : null,
          buzzer_number: orderType === 'takeaway' ? buzzerNumber : null,
          items: cart,
          branch_id: user?.branch_id || (await axios.get(`${API}/branches`)).data[0]?.id,
          payment_method: paymentMethod,
          discount: discount,
          delivery_app: orderType === 'delivery' ? deliveryApp : null,
          driver_id: selectedDriver || null,
          notes: orderNotes
        };
        
        const res = await axios.post(`${API}/orders`, orderData);
        playSuccess();
        toast.success(`تم إنشاء الطلب #${res.data.order_number} بنجاح`);
      }
      
      clearCart();
      await fetchPendingOrders();
      
      // تحديث الطاولات
      const tablesRes = await axios.get(`${API}/tables`);
      setTables(tablesRes.data);
    } catch (error) {
      console.error('Failed to submit order:', error);
      toast.error(error.response?.data?.detail || 'فشل في إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  // فلترة الطلبات المعلقة حسب النوع
  const pendingTakeawayOrders = pendingOrders.filter(o => o.order_type === 'takeaway');
  const pendingDeliveryOrders = pendingOrders.filter(o => o.order_type === 'delivery');
  const pendingDineInOrders = pendingOrders.filter(o => o.order_type === 'dine_in');

  // طباعة الفاتورة (معاينة)
  const handlePrintBill = () => {
    if (cart.length === 0) {
      toast.error('السلة فارغة');
      return;
    }
    setPrintDialogOpen(true);
  };

  // إلغاء تعديل الطلب
  const cancelEditing = () => {
    clearCart();
    navigate('/pos');
  };

  // إلغاء الطلب بالكامل
  const handleCancelOrder = async () => {
    if (!editingOrder) return;
    
    if (!confirm('هل أنت متأكد من إلغاء هذا الطلب؟')) return;
    
    setSubmitting(true);
    try {
      const res = await axios.put(`${API}/orders/${editingOrder.id}/cancel`);
      playSuccess();
      toast.success(res.data.was_quick_cancel 
        ? 'تم إلغاء الطلب (إلغاء سريع)' 
        : 'تم إلغاء الطلب'
      );
      clearCart();
      await fetchPendingOrders();
      
      // تحديث الطاولات
      const tablesRes = await axios.get(`${API}/tables`);
      setTables(tablesRes.data);
    } catch (error) {
      console.error('Failed to cancel order:', error);
      toast.error(error.response?.data?.detail || 'فشل في إلغاء الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Categories Sidebar - Right */}
      <div className="w-56 border-l border-border bg-card flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">الفئات</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); playClick(); }}
                className={`w-full rounded-xl overflow-hidden transition-all ${
                  selectedCategory === cat.id 
                    ? 'ring-2 ring-primary ring-offset-2 scale-105' 
                    : 'hover:scale-102 hover:shadow-md'
                }`}
                data-testid={`category-${cat.id}`}
              >
                <div className="relative">
                  {cat.image ? (
                    <img 
                      src={cat.image} 
                      alt={cat.name}
                      className="w-full h-20 object-cover"
                    />
                  ) : (
                    <div className="w-full h-20 bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                      <span className="text-3xl">{cat.icon || '📦'}</span>
                    </div>
                  )}
                  <div className={`absolute inset-0 flex items-end ${
                    selectedCategory === cat.id 
                      ? 'bg-gradient-to-t from-primary/90 to-transparent' 
                      : 'bg-gradient-to-t from-black/70 to-transparent'
                  }`}>
                    <div className="p-2 w-full">
                      <span className="text-white font-bold text-sm drop-shadow-lg flex items-center gap-1">
                        <span>{cat.icon}</span>
                        {cat.name}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content - Products */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold font-cairo text-foreground">نقاط البيع</h1>
            
            {/* مؤشر الطلبات المعلقة */}
            <Button 
              variant="outline" 
              className="relative"
              onClick={() => setPendingOrdersDialogOpen(true)}
              data-testid="pending-orders-btn"
            >
              <List className="h-4 w-4 ml-2" />
              الطلبات المعلقة
              {pendingOrders.length > 0 && (
                <span className="absolute -top-2 -left-2 w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {pendingOrders.length}
                </span>
              )}
            </Button>
          </div>
          
          <div className="flex items-center gap-4">
            {/* حالة التعديل */}
            {editingOrder && (
              <div className="flex items-center gap-2 bg-amber-500/10 px-3 py-1.5 rounded-lg">
                <Edit className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-500 font-medium">
                  تعديل طلب #{editingOrder.order_number}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-6 w-6 p-0 text-amber-500 hover:bg-amber-500/20"
                  onClick={cancelEditing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            {/* البحث عن عميل */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="رقم هاتف العميل..."
                value={customerSearchPhone}
                onChange={(e) => setCustomerSearchPhone(e.target.value)}
                className="w-40 h-9"
                onKeyDown={(e) => e.key === 'Enter' && handleSearchCustomer()}
                data-testid="customer-search-input"
              />
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSearchCustomer}
                data-testid="customer-search-btn"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            
            {currentShift ? (
              <div className="text-sm text-muted-foreground">
                <span className="text-green-500">● </span>
                وردية مفتوحة
              </div>
            ) : (
              <div className="text-sm text-red-500">
                <span>● </span>
                لا يوجد وردية
              </div>
            )}
          </div>
        </header>

        {/* Search */}
        <div className="p-4 bg-card/30 border-b border-border">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث عن منتج..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 bg-background"
              data-testid="product-search"
            />
          </div>
        </div>

        {/* Products Grid */}
        <ScrollArea className="flex-1 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredProducts.map(product => (
              <Card
                key={product.id}
                className="cursor-pointer transition-all hover:scale-105 hover:shadow-lg border-border/50 bg-card overflow-hidden"
                onClick={() => addToCart(product)}
                data-testid={`product-${product.id}`}
              >
                <CardContent className="p-3">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-24 object-cover rounded-lg mb-2"
                    />
                  ) : (
                    <div className="w-full h-24 bg-muted rounded-lg mb-2 flex items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <h3 className="font-medium text-sm text-foreground line-clamp-2">{product.name}</h3>
                  <p className="text-primary font-bold mt-1 tabular-nums">{formatPrice(product.price)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Cart Sidebar */}
      <div className="w-96 border-r border-border bg-card flex flex-col">
        {/* Order Type Tabs */}
        <div className="p-4 border-b border-border">
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'dine_in', label: 'محلي', icon: UtensilsCrossed },
              { id: 'takeaway', label: 'سفري', icon: Package },
              { id: 'delivery', label: 'توصيل', icon: Truck },
            ].map(type => (
              <Button
                key={type.id}
                variant={orderType === type.id ? 'default' : 'outline'}
                className={`h-12 ${orderType === type.id ? 'bg-primary text-primary-foreground' : ''}`}
                onClick={() => { 
                  setOrderType(type.id); 
                  playClick();
                  if (type.id !== 'dine_in') setSelectedTable(null);
                }}
                disabled={editingOrder && editingOrder.order_type !== type.id}
                data-testid={`order-type-${type.id}`}
              >
                <type.icon className="h-5 w-5 ml-2" />
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Table/Customer Info */}
        <div className="p-4 border-b border-border space-y-3">
          {/* معلومات العميل */}
          {customerData && (
            <div className="bg-green-500/10 p-3 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-green-600">{customerData.name}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowCustomerInfo(!showCustomerInfo)}
                >
                  <History className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {customerData.total_orders} طلب سابق | {formatPrice(customerData.total_spent)}
              </p>
              {customerData.is_blocked && (
                <div className="flex items-center gap-1 text-red-500 text-xs">
                  <AlertCircle className="h-3 w-3" />
                  عميل محظور
                </div>
              )}
            </div>
          )}
          
          {orderType === 'dine_in' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-2">اختر طاولة:</p>
              <div className="grid grid-cols-5 gap-2">
                {tables.map(table => {
                  const isOccupied = table.status === 'occupied';
                  const isReserved = table.status === 'reserved';
                  const isAvailable = table.status === 'available';
                  const isSelected = selectedTable === table.id;
                  
                  return (
                    <button
                      key={table.id}
                      onClick={async () => {
                        playClick();
                        if (isOccupied && table.current_order_id) {
                          // فتح الطلب المرتبط بالطاولة المشغولة
                          await loadOrderForEditing(table.current_order_id);
                          toast.success(`تم فتح طلب الطاولة ${table.number}`);
                        } else if (isAvailable || isSelected) {
                          setSelectedTable(table.id);
                        }
                      }}
                      style={{
                        backgroundColor: isSelected ? '#8b5cf6' : isOccupied ? '#ef4444' : isReserved ? '#f59e0b' : '#22c55e',
                        color: 'white'
                      }}
                      className={`
                        aspect-square rounded-lg font-bold text-lg transition-all flex items-center justify-center
                        ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}
                        ${isAvailable && !isSelected ? 'hover:opacity-80' : ''}
                        ${isOccupied ? 'hover:ring-2 hover:ring-red-400 cursor-pointer' : ''}
                        ${isReserved ? 'cursor-not-allowed opacity-90' : ''}
                      `}
                      data-testid={`table-btn-${table.number}`}
                    >
                      {table.number}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-4 text-xs mt-2">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{backgroundColor: '#22c55e'}}></span>
                  متاحة
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{backgroundColor: '#ef4444'}}></span>
                  مشغولة
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{backgroundColor: '#f59e0b'}}></span>
                  محجوزة
                </span>
              </div>
              {selectedTable && (
                <p className="text-xs text-primary mt-2">
                  ✓ تم اختيار طاولة {tables.find(t => t.id === selectedTable)?.number}
                </p>
              )}
            </div>
          )}

          {orderType === 'takeaway' && (
            <div className="space-y-2">
              <Input
                placeholder="اسم العميل"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="customer-name"
              />
              <Input
                placeholder="رقم الهاتف"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                data-testid="customer-phone"
              />
              <Input
                placeholder="رقم جهاز التنبيه (اختياري)"
                value={buzzerNumber}
                onChange={(e) => setBuzzerNumber(e.target.value)}
                data-testid="buzzer-number"
              />
            </div>
          )}

          {orderType === 'delivery' && (
            <div className="space-y-2">
              <Input
                placeholder="اسم العميل"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="delivery-name"
              />
              <Input
                placeholder="رقم الهاتف"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                data-testid="delivery-phone"
              />
              <Input
                placeholder="عنوان التوصيل"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                data-testid="delivery-address"
              />
              
              {/* اختيار السائق أولاً */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">اختر السائق: <span className="text-red-500">*</span></p>
                <div className="grid grid-cols-2 gap-2">
                  {drivers.filter(d => d.is_available).map(driver => (
                    <button
                      key={driver.id}
                      onClick={() => { setSelectedDriver(driver.id); playClick(); }}
                      className={`p-3 rounded-lg text-sm transition-all flex items-center gap-2 ${
                        selectedDriver === driver.id 
                          ? 'bg-green-500 text-white ring-2 ring-green-300' 
                          : 'bg-muted/50 text-foreground hover:bg-muted border border-border'
                      }`}
                    >
                      <Truck className="h-4 w-4" />
                      <span>{driver.name}</span>
                    </button>
                  ))}
                  {drivers.filter(d => d.is_available).length === 0 && (
                    <p className="text-sm text-red-500 col-span-2 text-center py-2">لا يوجد سائقين متاحين</p>
                  )}
                </div>
                {selectedDriver && (
                  <p className="text-xs text-green-500 mt-1">
                    ✓ سيتم تحويل الطلب مباشرة للسائق
                  </p>
                )}
              </div>
              
              {/* شركة التوصيل */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">شركة التوصيل:</p>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => { setDeliveryApp(''); playClick(); }}
                    className={`p-2 rounded-lg text-xs transition-all ${
                      deliveryApp === '' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    بدون
                  </button>
                  {deliveryApps.map(app => (
                    <button
                      key={app.id}
                      onClick={() => { setDeliveryApp(app.id); playClick(); }}
                      className={`p-2 rounded-lg text-xs transition-all ${
                        deliveryApp === app.id 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted/50 text-foreground hover:bg-muted'
                      }`}
                    >
                      {app.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>السلة فارغة</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={`${item.product_id}-${index}`}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{item.product_name}</p>
                    <p className="text-primary text-sm tabular-nums">{formatPrice(item.price * item.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(item.product_id, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center font-bold text-foreground">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(item.product_id, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => removeFromCart(item.product_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Totals & Payment */}
        <div className="p-4 border-t border-border bg-muted/30 space-y-4">
          {/* Discount */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">خصم:</span>
            <Input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              className="flex-1 h-9 text-sm"
              min="0"
              data-testid="discount-input"
            />
          </div>

          {/* Subtotal & Total */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">المجموع الفرعي:</span>
              <span className="tabular-nums text-foreground">{formatPrice(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>الخصم:</span>
                <span className="tabular-nums">-{formatPrice(discount)}</span>
              </div>
            )}
            {commissionAmount > 0 && (
              <div className="flex justify-between text-sm text-amber-500">
                <span>عمولة {selectedDeliveryApp?.name} ({commissionRate}%):</span>
                <span className="tabular-nums">-{formatPrice(commissionAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
              <span className="text-foreground">الإجمالي:</span>
              <span className="text-primary tabular-nums">{formatPrice(totalBeforeCommission)}</span>
            </div>
            {commissionAmount > 0 && (
              <div className="flex justify-between text-base font-bold bg-green-500/10 p-2 rounded-lg">
                <span className="text-green-600">الصافي بعد العمولة:</span>
                <span className="text-green-600 tabular-nums">{formatPrice(netTotal)}</span>
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="flex gap-2">
            {[
              { id: 'cash', label: 'نقدي', icon: Banknote },
              { id: 'card', label: 'بطاقة', icon: CreditCard },
              { id: 'credit', label: 'آجل', icon: Clock },
            ].map(method => (
              <Button
                key={method.id}
                variant={paymentMethod === method.id ? 'default' : 'outline'}
                className={`flex-1 h-10 ${paymentMethod === method.id ? 'bg-secondary text-secondary-foreground' : ''}`}
                onClick={() => { setPaymentMethod(method.id); playClick(); }}
                data-testid={`payment-${method.id}`}
              >
                <method.icon className="h-4 w-4 ml-1" />
                {method.label}
              </Button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className={`grid gap-2 ${editingOrder ? 'grid-cols-5' : 'grid-cols-4'}`}>
            <Button
              variant="outline"
              className="h-12"
              onClick={clearCart}
              disabled={cart.length === 0}
              data-testid="clear-cart"
            >
              <X className="h-5 w-5" />
            </Button>
            
            {/* زر إلغاء الطلب - يظهر فقط عند التعديل */}
            {editingOrder && (
              <Button
                variant="outline"
                className="h-12 border-red-500 text-red-500 hover:bg-red-500/10"
                onClick={handleCancelOrder}
                disabled={submitting}
                data-testid="cancel-order-btn"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
            
            {/* زر طباعة الفاتورة */}
            <Button
              variant="outline"
              className="h-12 border-blue-500 text-blue-500 hover:bg-blue-500/10"
              onClick={handlePrintBill}
              disabled={cart.length === 0}
              data-testid="print-bill-btn"
            >
              <Printer className="h-5 w-5" />
            </Button>
            
            {/* حفظ وإرسال للمطبخ */}
            <Button
              variant="outline"
              className="h-12 border-orange-500 text-orange-500 hover:bg-orange-500/10"
              onClick={() => setKitchenDialogOpen(true)}
              disabled={cart.length === 0}
              data-testid="save-to-kitchen"
            >
              <ChefHat className="h-5 w-5" />
            </Button>
            
            {/* تأكيد مع الدفع */}
            <Button
              className="h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              onClick={handleSubmitOrder}
              disabled={cart.length === 0 || submitting}
              data-testid="submit-order"
            >
              {submitting ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <Check className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Pending Orders Dialog */}
      <Dialog open={pendingOrdersDialogOpen} onOpenChange={setPendingOrdersDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <List className="h-5 w-5 text-primary" />
              الطلبات المعلقة ({pendingOrders.length})
              <Button variant="ghost" size="sm" onClick={fetchPendingOrders}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="takeaway" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="takeaway" className="relative">
                سفري
                {pendingTakeawayOrders.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {pendingTakeawayOrders.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="delivery" className="relative">
                توصيل
                {pendingDeliveryOrders.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {pendingDeliveryOrders.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="dine_in" className="relative">
                محلي
                {pendingDineInOrders.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {pendingDineInOrders.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            
            <ScrollArea className="h-[50vh] mt-4">
              <TabsContent value="takeaway" className="mt-0">
                {pendingTakeawayOrders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد طلبات سفري معلقة</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingTakeawayOrders.map(order => (
                      <OrderCard 
                        key={order.id} 
                        order={order} 
                        onSelect={() => {
                          loadOrderForEditing(order.id);
                          setPendingOrdersDialogOpen(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="delivery" className="mt-0">
                {pendingDeliveryOrders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد طلبات توصيل معلقة</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingDeliveryOrders.map(order => (
                      <OrderCard 
                        key={order.id} 
                        order={order} 
                        onSelect={() => {
                          loadOrderForEditing(order.id);
                          setPendingOrdersDialogOpen(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="dine_in" className="mt-0">
                {pendingDineInOrders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <UtensilsCrossed className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد طلبات محلية معلقة</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingDineInOrders.map(order => (
                      <OrderCard 
                        key={order.id} 
                        order={order} 
                        onSelect={() => {
                          loadOrderForEditing(order.id);
                          setPendingOrdersDialogOpen(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Kitchen Dialog - حفظ وإرسال للمطبخ */}
      <Dialog open={kitchenDialogOpen} onOpenChange={setKitchenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <ChefHat className="h-5 w-5 text-orange-500" />
              {editingOrder ? 'تحديث الطلب وإرسال للمطبخ' : 'حفظ وإرسال للمطبخ'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">عدد العناصر:</span>
                <span className="font-bold text-foreground">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الإجمالي:</span>
                <span className="font-bold text-primary">{formatPrice(totalBeforeCommission)}</span>
              </div>
              {commissionAmount > 0 && (
                <div className="flex justify-between text-amber-500">
                  <span>عمولة التوصيل:</span>
                  <span className="font-bold">-{formatPrice(commissionAmount)}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">ملاحظات للمطبخ:</label>
              <Input
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="ملاحظات خاصة..."
                className="h-12"
              />
            </div>

            <div className="bg-orange-500/10 p-3 rounded-lg text-sm text-orange-600">
              <p>سيتم حفظ الطلب وإرساله للمطبخ للتحضير</p>
              <p>الدفع سيتم لاحقاً عند التسليم</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setKitchenDialogOpen(false)} className="flex-1">
                إلغاء
              </Button>
              <Button
                onClick={handleSaveAndSendToKitchen}
                disabled={submitting}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {submitting ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <>
                    <Send className="h-4 w-4 ml-2" />
                    حفظ وإرسال
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Bill Dialog - معاينة الفاتورة */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Receipt className="h-5 w-5 text-blue-500" />
              معاينة الفاتورة
            </DialogTitle>
          </DialogHeader>
          
          <div className="bg-white text-black p-4 rounded-lg font-mono text-sm" dir="rtl">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold">Maestro EGP</h2>
              <p className="text-xs text-gray-500">
                {new Date().toLocaleDateString('ar-IQ')} {new Date().toLocaleTimeString('ar-IQ')}
              </p>
              {editingOrder && (
                <p className="text-xs">طلب #{editingOrder.order_number}</p>
              )}
            </div>
            
            <div className="border-t border-dashed border-gray-300 pt-2 mb-2">
              {orderType === 'dine_in' && selectedTable && (
                <p className="text-xs">طاولة: {tables.find(t => t.id === selectedTable)?.number}</p>
              )}
              {customerName && <p className="text-xs">العميل: {customerName}</p>}
              {customerPhone && <p className="text-xs">الهاتف: {customerPhone}</p>}
              {buzzerNumber && <p className="text-xs">رقم التنبيه: {buzzerNumber}</p>}
            </div>
            
            <div className="border-t border-dashed border-gray-300 py-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-right py-1">الصنف</th>
                    <th className="text-center py-1">الكمية</th>
                    <th className="text-left py-1">السعر</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, i) => (
                    <tr key={i}>
                      <td className="py-1">{item.product_name}</td>
                      <td className="text-center">{item.quantity}</td>
                      <td className="text-left tabular-nums">{formatPrice(item.price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
              <div className="flex justify-between">
                <span>المجموع الفرعي:</span>
                <span className="tabular-nums">{formatPrice(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>الخصم:</span>
                  <span className="tabular-nums">-{formatPrice(discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-300 pt-1">
                <span>الإجمالي:</span>
                <span className="tabular-nums">{formatPrice(totalBeforeCommission)}</span>
              </div>
            </div>
            
            <div className="text-center mt-4 text-xs text-gray-500">
              <p>شكراً لزيارتكم</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)} className="flex-1">
              إغلاق
            </Button>
            <Button 
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              onClick={() => {
                window.print();
                toast.info('جاري الطباعة...');
              }}
            >
              <Printer className="h-4 w-4 ml-2" />
              طباعة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer History Dialog */}
      <Dialog open={showCustomerInfo} onOpenChange={setShowCustomerInfo}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <History className="h-5 w-5 text-primary" />
              سجل العميل
            </DialogTitle>
          </DialogHeader>
          
          {customerData && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{customerData.name}</h3>
                    <p className="text-sm text-muted-foreground">{customerData.phone}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-background p-2 rounded">
                    <p className="text-muted-foreground">إجمالي الطلبات</p>
                    <p className="font-bold text-foreground">{customerData.total_orders}</p>
                  </div>
                  <div className="bg-background p-2 rounded">
                    <p className="text-muted-foreground">إجمالي المصروف</p>
                    <p className="font-bold text-primary">{formatPrice(customerData.total_spent)}</p>
                  </div>
                </div>
                
                {customerData.address && (
                  <div className="mt-3 flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <p className="text-sm text-foreground">{customerData.address}</p>
                  </div>
                )}
                
                {customerData.notes && (
                  <div className="mt-2 p-2 bg-amber-500/10 rounded text-sm text-amber-600">
                    ملاحظات: {customerData.notes}
                  </div>
                )}
              </div>
              
              {customerHistory.length > 0 && (
                <div>
                  <h4 className="font-medium text-foreground mb-2">آخر الطلبات:</h4>
                  <ScrollArea className="h-40">
                    <div className="space-y-2">
                      {customerHistory.map((order, i) => (
                        <div key={i} className="p-2 bg-muted/30 rounded text-sm">
                          <div className="flex justify-between">
                            <span>#{order.order_number}</span>
                            <span className="text-primary tabular-nums">{formatPrice(order.total)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{order.created_at}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// مكون بطاقة الطلب المعلق
function OrderCard({ order, onSelect }) {
  const getOrderTypeIcon = (type) => {
    switch (type) {
      case 'takeaway': return <Package className="h-4 w-4" />;
      case 'delivery': return <Truck className="h-4 w-4" />;
      default: return <UtensilsCrossed className="h-4 w-4" />;
    }
  };
  
  const getOrderTypeLabel = (type) => {
    switch (type) {
      case 'takeaway': return 'سفري';
      case 'delivery': return 'توصيل';
      default: return 'محلي';
    }
  };
  
  const timeAgo = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    return `منذ ${Math.floor(diffHours / 24)} يوم`;
  };

  return (
    <Card 
      className="cursor-pointer hover:bg-muted/50 transition-colors border-border/50"
      onClick={onSelect}
      data-testid={`pending-order-${order.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              {getOrderTypeIcon(order.order_type)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">#{order.order_number}</span>
                <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded">
                  {getOrderTypeLabel(order.order_type)}
                </span>
              </div>
              {order.customer_name && (
                <p className="text-sm text-muted-foreground">{order.customer_name}</p>
              )}
              {order.buzzer_number && (
                <p className="text-xs text-blue-500 flex items-center gap-1">
                  <Bell className="h-3 w-3" />
                  جهاز #{order.buzzer_number}
                </p>
              )}
            </div>
          </div>
          
          <div className="text-left">
            <p className="font-bold text-primary tabular-nums">{formatPrice(order.total)}</p>
            <p className="text-xs text-muted-foreground">{timeAgo(order.created_at)}</p>
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex flex-wrap gap-1">
            {order.items.slice(0, 3).map((item, i) => (
              <span key={i} className="text-xs bg-muted px-2 py-1 rounded">
                {item.product_name} x{item.quantity}
              </span>
            ))}
            {order.items.length > 3 && (
              <span className="text-xs bg-muted px-2 py-1 rounded">
                +{order.items.length - 3} أخرى
              </span>
            )}
          </div>
        </div>
        
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="outline" className="h-8">
            <Eye className="h-3 w-3 ml-1" />
            فتح للتعديل
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
