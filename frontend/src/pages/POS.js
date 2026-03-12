import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useOffline } from '../context/OfflineContext';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { playClick, playSuccess } from '../utils/sound';
import { useOrderNotifications, sendOrderNotification } from '../utils/orderNotifications';
import offlineStorage from '../lib/offlineStorage';
import db, { STORES } from '../lib/offlineDB';
import { QRCodeSVG } from 'qrcode.react';
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
  Eye,
  Building2
} from 'lucide-react';
import { toast } from 'sonner';
import BranchSelector from '../components/BranchSelector';
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

// دالة للحصول على الاسم المترجم حسب اللغة الحالية
const getLocalizedName = (item, lang) => {
  if (!item) return '';
  if (lang === 'en' && item.name_en) return item.name_en;
  return item.name || '';
};

// دالة لاستخراج رسالة الخطأ من استجابة API
const getErrorMessage = (error, defaultMsg) => {
  const detail = error?.response?.data?.detail;
  if (!detail) return defaultMsg;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    // استخراج أول رسالة خطأ من مصفوفة أخطاء Pydantic
    const firstError = detail[0];
    if (firstError?.msg) return firstError.msg;
    if (typeof firstError === 'string') return firstError;
    return defaultMsg;
  }
  if (detail?.msg) return detail.msg;
  return defaultMsg;
};

export default function POS() {
  const { user } = useAuth();
  const { selectedBranchId, branches, getBranchIdForApi } = useBranch();
  const { isOnline, isOffline, syncStatus, updateSyncStatus } = useOffline();
  const { t, isRTL, lang } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // التحقق من دور المستخدم
  const isCallCenter = user?.role === 'call_center';
  const isCaptain = user?.role === 'captain';
  
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  // كول سنتر يبدأ بالتوصيل، كابتن يبدأ بداخل
  const [orderType, setOrderType] = useState(isCallCenter ? 'delivery' : 'dine_in');
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedTableSection, setSelectedTableSection] = useState(null); // القسم المختار للطاولات
  const [tables, setTables] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [buzzerNumber, setBuzzerNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('fixed'); // fixed or percentage
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
  const [lastOrderNumber, setLastOrderNumber] = useState(null); // آخر رقم فاتورة
  
  // إعدادات الفاتورة والمطعم والنظام
  const [invoiceSettings, setInvoiceSettings] = useState({});
  const [restaurantSettings, setRestaurantSettings] = useState({});
  const [systemInvoiceSettings, setSystemInvoiceSettings] = useState({});
  
  // حالات الإرجاع
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundOrderId, setRefundOrderId] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundOrderInfo, setRefundOrderInfo] = useState(null);
  
  // إشعارات الطلبات الجديدة
  const prevOrdersCount = useRef(0);
  
  // نظام إشعارات الطلبات في الوقت الفعلي (للكاشير)
  const currentBranchIdForNotifications = getBranchIdForApi() || user?.branch_id;
  const isCashierRole = user?.role === 'cashier' || user?.role === 'admin' || user?.role === 'owner';
  
  // تفعيل الإشعارات للكاشير فقط
  const { notifications: orderNotifications, unreadCount: unreadOrdersCount } = useOrderNotifications({
    branchId: isCashierRole ? currentBranchIdForNotifications : null,
    enabled: isCashierRole && !isCallCenter && !isCaptain,
    pollingInterval: 5000,
    playSound: true,
    autoPrint: false, // يمكن تفعيلها من الإعدادات
    onNewOrder: (notification) => {
      // تحديث قائمة الطلبات المعلقة
      fetchPendingOrders();
    }
  });

  // إعادة جلب البيانات عند تغيير الفرع المحدد
  useEffect(() => {
    fetchData();
    // تحديث الطلبات المعلقة كل 30 ثانية
    const interval = setInterval(fetchPendingOrders, 30000);
    return () => clearInterval(interval);
  }, [selectedBranchId]);

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

  // قراءة بيانات المكالمة من URL (للكول سنتر والمستخدمين الذين لديهم صلاحية استلام المكالمات)
  useEffect(() => {
    const phone = searchParams.get('phone');
    const name = searchParams.get('name');
    const fromCall = searchParams.get('from_call');
    
    // التحقق من صلاحية استلام المكالمات
    const canReceiveCalls = () => {
      // الكول سنتر يستلم المكالمات افتراضياً
      if (user?.role === 'call_center') return true;
      // المدير والأدمن يمكنهم استلام المكالمات
      if (['admin', 'manager', 'super_admin'].includes(user?.role)) return true;
      // التحقق من الصلاحية
      if (user?.permissions?.includes('receive_calls')) return true;
      return false;
    };
    
    if (phone) {
      // إذا لم يكن لديه صلاحية استلام المكالمات، لا تفعل شيء
      if (fromCall === 'true' && !canReceiveCalls()) {
        toast.error(t('ليس لديك صلاحية استلام المكالمات'));
        return;
      }
      
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
        toast.success(t('تم استلام مكالمة من:') + ` ${phone}`, {
          description: t('تم تعيين نوع الطلب إلى توصيل')
        });
      }
    }
  }, [searchParams, user]);

  const fetchData = async () => {
    try {
      // تحديد الفرع النشط للاستخدام في جميع الطلبات
      const activeBranchId = getBranchIdForApi() || user?.branch_id;
      
      // === وضع Offline - جلب من IndexedDB ===
      if (isOffline) {
        try {
          const [localCategories, localProducts, localTables] = await Promise.all([
            db.getAllItems(STORES.CATEGORIES),
            db.getAllItems(STORES.PRODUCTS),
            db.getAllItems(STORES.TABLES)
          ]);
          
          // ترتيب الفئات حسب الترتيب الأصلي (order أو sort_order)
          if (localCategories.length > 0) {
            const sortedCategories = [...localCategories].sort((a, b) => {
              const orderA = a.order ?? a.sort_order ?? 999;
              const orderB = b.order ?? b.sort_order ?? 999;
              return orderA - orderB;
            });
            setCategories(sortedCategories);
            setSelectedCategory(sortedCategories[0].id);
          }
          
          if (localProducts.length > 0) setProducts(localProducts);
          
          // فلترة الطاولات حسب الفرع المحدد
          if (localTables.length > 0) {
            let filteredTables = localTables;
            if (activeBranchId) {
              filteredTables = localTables.filter(t => 
                t.branch_id === activeBranchId || 
                t.branch === activeBranchId ||
                !t.branch_id
              );
            }
            setTables(filteredTables);
          }
          
          // جلب الطلبات المحلية
          const localOrders = await offlineStorage.getTodayOrders();
          const pendingLocal = localOrders.filter(o => 
            o.status === 'pending' || o.status === 'preparing' || o.status === 'ready' || !o.is_synced
          );
          setPendingOrders(pendingLocal);
          
          setLoading(false);
          return;
        } catch (offlineError) {
          console.error('Error loading offline data:', offlineError);
        }
      }
      
      // === وضع Online ===
      const [catRes, prodRes, appsRes, shiftRes, invoiceRes, restaurantRes, sysInvoiceRes, loginBgRes] = await Promise.all([
        axios.get(`${API}/categories`),
        axios.get(`${API}/products`),
        axios.get(`${API}/delivery-apps`),
        axios.get(`${API}/shifts/current`).catch(() => ({ data: null })),
        axios.get(`${API}/tenant/invoice-settings`).catch(() => ({ data: {} })),
        axios.get(`${API}/restaurant-settings`).catch(() => ({ data: {} })),
        axios.get(`${API}/system/invoice-settings`).catch(() => ({ data: {} })),
        axios.get(`${API}/login-backgrounds`).catch(() => ({ data: {} }))
      ]);

      setCategories(catRes.data);
      setProducts(prodRes.data);
      setDeliveryApps(appsRes.data);
      setInvoiceSettings(invoiceRes.data || {});
      setRestaurantSettings(restaurantRes.data || {});
      
      // حفظ البيانات محلياً للاستخدام Offline
      try {
        await db.addItems(STORES.CATEGORIES, catRes.data);
        await db.addItems(STORES.PRODUCTS, prodRes.data);
      } catch (cacheError) {
        console.log('Could not cache data locally:', cacheError);
      }
      
      // دمج شعار صفحة الدخول مع إعدادات الفاتورة للنظام
      const sysInvoice = sysInvoiceRes.data || {};
      const loginBg = loginBgRes.data || {};
      // إذا لم يوجد شعار مخصص للفاتورة، استخدم شعار صفحة الدخول
      if (!sysInvoice.system_logo_url && loginBg.logo_url) {
        sysInvoice.system_logo_url = loginBg.logo_url;
      }
      setSystemInvoiceSettings(sysInvoice);
      
      // إذا لم تكن هناك وردية مفتوحة، افتح واحدة تلقائياً
      if (!shiftRes.data) {
        try {
          const autoOpenRes = await axios.post(`${API}/shifts/auto-open`);
          setCurrentShift(autoOpenRes.data.shift);
          if (!autoOpenRes.data.was_existing) {
            toast.success(t('تم فتح وردية جديدة تلقائياً'));
          }
        } catch (autoOpenError) {
          console.log('Could not auto-open shift:', autoOpenError);
          setCurrentShift(null);
        }
      } else {
        setCurrentShift(shiftRes.data);
      }

      // جلب الطاولات حسب الفرع المحدد
      const tablesParams = activeBranchId ? { branch_id: activeBranchId } : {};
      const tablesRes = await axios.get(`${API}/tables`, { params: tablesParams });
      setTables(tablesRes.data);
      
      // حفظ الطاولات محلياً
      try {
        await db.addItems(STORES.TABLES, tablesRes.data);
      } catch (cacheError) {
        console.log('Could not cache tables:', cacheError);
      }

      // جلب السائقين حسب الفرع المحدد
      const driversParams = activeBranchId ? { branch_id: activeBranchId } : {};
      const driversRes = await axios.get(`${API}/drivers`, { params: driversParams });
      setDrivers(driversRes.data);

      if (catRes.data.length > 0) {
        setSelectedCategory(catRes.data[0].id);
      }

      // جلب الطلبات المعلقة
      await fetchPendingOrders();
    } catch (error) {
      console.error('Failed to fetch data:', error);
      
      // إذا فشل الاتصال، حاول جلب من IndexedDB
      if (!error.response) {
        try {
          const [localCategories, localProducts] = await Promise.all([
            db.getAllItems(STORES.CATEGORIES),
            db.getAllItems(STORES.PRODUCTS)
          ]);
          
          if (localCategories.length > 0) setCategories(localCategories);
          if (localProducts.length > 0) setProducts(localProducts);
          
          if (localCategories.length > 0) {
            setSelectedCategory(localCategories[0].id);
          }
          
          toast.warning(t('تم تحميل البيانات المحلية - لا يوجد اتصال'));
        } catch (offlineError) {
          toast.error(t('فشل في تحميل البيانات'));
        }
      } else {
        toast.error(t('فشل في تحميل البيانات'));
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingOrders = async () => {
    try {
      // تحديد الفرع النشط
      const activeBranchId = getBranchIdForApi() || user?.branch_id;
      const params = activeBranchId ? { branch_id: activeBranchId } : {};
      
      // جلب جميع الطلبات غير المكتملة:
      // 1. طلبات بحالة pending أو preparing أو ready
      // 2. طلبات غير مدفوعة (payment_status = pending) لأي نوع
      const [activeRes, unpaidRes] = await Promise.all([
        axios.get(`${API}/orders`, { params: { ...params, status: 'pending,preparing,ready' } }),
        axios.get(`${API}/orders`, { params: { ...params, payment_status: 'pending' } })
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
        toast.success(t('طلب جديد!'), { duration: 5000 });
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
        product_name: item.product_name || item.name || t('منتج غير معروف'),
        price: item.price,
        quantity: item.quantity,
        notes: item.notes || ''
      }));
      setCart(cartItems);
      
      toast.info(`${t('تم تحميل الطلب')} #${order.order_number} ${t('للتعديل')}`);
    } catch (error) {
      console.error('Failed to load order:', error);
      toast.error(t('فشل في تحميل الطلب'));
    }
  };

  // ========== دوال الإرجاع ==========
  
  // التحقق من صلاحية الإرجاع
  const canRefund = () => {
    if (!user) return false;
    const role = user.role;
    const permissions = user.permissions || [];
    return role === 'admin' || role === 'super_admin' || role === 'manager' || permissions.includes('can_refund');
  };

  // البحث عن طلب للإرجاع
  const searchOrderForRefund = async () => {
    if (!refundOrderId.trim()) {
      toast.error(t('أدخل رقم الفاتورة'));
      return;
    }
    
    setRefundLoading(true);
    try {
      const res = await axios.get(`${API}/orders/${refundOrderId}/refund-status`);
      setRefundOrderInfo(res.data);
      
      if (res.data.is_refunded) {
        toast.warning(t('هذا الطلب تم إرجاعه مسبقاً'));
      } else if (!res.data.can_refund) {
        toast.warning(t('لا يمكن إرجاع هذا الطلب'));
      }
    } catch (error) {
      console.error('Failed to search order:', error);
      toast.error(getErrorMessage(error, t('الطلب غير موجود')));
      setRefundOrderInfo(null);
    } finally {
      setRefundLoading(false);
    }
  };

  // تنفيذ الإرجاع
  const processRefund = async () => {
    // التحقق من كتابة السبب (شرط إلزامي)
    if (!refundReason.trim()) {
      toast.error(t('يجب كتابة سبب الإرجاع'));
      return;
    }
    
    if (refundReason.trim().length < 3) {
      toast.error(t('سبب الإرجاع قصير جداً'));
      return;
    }
    
    if (!refundOrderInfo || !refundOrderInfo.can_refund) {
      toast.error(refundOrderInfo?.refund_message || t('لا يمكن إرجاع هذا الطلب'));
      return;
    }
    
    setRefundLoading(true);
    try {
      await axios.post(`${API}/refunds`, {
        order_id: refundOrderInfo.order_id,
        reason: refundReason.trim(),
        refund_type: 'full'
      });
      
      playSuccess();
      toast.success(`✅ ${t('تم إرجاع الفاتورة')} #${refundOrderInfo.order_number} ${t('بنجاح')}`);
      
      // إعادة تعيين الحالة وإغلاق الحوار
      setRefundDialogOpen(false);
      setRefundOrderId('');
      setRefundReason('');
      setRefundOrderInfo(null);
      
      // تحديث الطلبات المعلقة
      await fetchPendingOrders();
    } catch (error) {
      console.error('Failed to process refund:', error);
      toast.error(getErrorMessage(error, t('فشل في إرجاع الطلب')));
    } finally {
      setRefundLoading(false);
    }
  };

  // فتح حوار الإرجاع
  const openRefundDialog = () => {
    if (!canRefund()) {
      toast.error(t('ليس لديك صلاحية إرجاع الطلبات'));
      return;
    }
    setRefundDialogOpen(true);
  };

  // إغلاق حوار الإرجاع
  const closeRefundDialog = () => {
    setRefundDialogOpen(false);
    setRefundOrderId('');
    setRefundReason('');
    setRefundOrderInfo(null);
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
        toast.success(`${t('عميل موجود')}: ${customer.name}`, {
          description: customer.address ? `${t('العنوان')}: ${customer.address}` : t('لا يوجد عنوان محفوظ')
        });
      } else {
        // عميل جديد
        setCustomerData(null);
        setShowCustomerInfo(false);
        toast.info(t('عميل جديد - يمكنك إضافة بياناته'));
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
      toast.error(t('أدخل رقم هاتف صحيح'));
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
        toast.success(`${t('تم العثور على العميل')}: ${customer.name}`);
      } else {
        toast.info(t('عميل جديد - يمكنك إضافة بياناته'));
        setCustomerPhone(customerSearchPhone);
        setCustomerData(null);
        setShowCustomerInfo(false);
      }
    } catch (error) {
      console.error('Error searching customer:', error);
      toast.error(t('فشل في البحث عن العميل'));
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
      toast.error(t('السلة فارغة'));
      return;
    }

    if (orderType === 'dine_in' && !selectedTable) {
      toast.error(t('يرجى اختيار طاولة'));
      return;
    }

    // العنوان مطلوب فقط إذا تم اختيار سائق (وليس شركة توصيل)
    if (orderType === 'delivery' && selectedDriver && !deliveryAddress) {
      toast.error(t('يرجى إدخال عنوان التوصيل'));
      return;
    }

    // تحديد الفرع النشط في بداية الدالة
    const currentBranchId = getBranchIdForApi() || user?.branch_id;

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
        
        toast.success(t('تم تحديث الطلب وإرساله للمطبخ'));
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
          branch_id: currentBranchId || (await axios.get(`${API}/branches`)).data[0]?.id,
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
          toast.success(`${t('تم إنشاء الطلب')} #${res.data.order_number} ${t('وتحويله للسائق')}`);
        } else {
          toast.success(`${t('تم إنشاء الطلب')} #${res.data.order_number}`);
        }
      }
      
      setKitchenDialogOpen(false);
      clearCart();
      await fetchPendingOrders();
      
      // تحديث الطاولات إذا كان طلب داخلي
      if (orderType === 'dine_in') {
        const tablesParams = currentBranchId ? { branch_id: currentBranchId } : {};
        const tablesRes = await axios.get(`${API}/tables`, { params: tablesParams });
        setTables(tablesRes.data);
      }
    } catch (error) {
      console.error('Failed to save order:', error);
      toast.error(getErrorMessage(error, t('فشل في حفظ الطلب')));
    } finally {
      setSubmitting(false);
    }
  };

  // تأكيد الطلب مع الدفع - كل شيء في خطوة واحدة
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      toast.error(t('السلة فارغة'));
      return;
    }

    if (orderType === 'dine_in' && !selectedTable && !editingOrder) {
      toast.error(t('يرجى اختيار طاولة'));
      return;
    }

    // العنوان مطلوب فقط إذا تم اختيار سائق (وليس شركة توصيل)
    if (orderType === 'delivery' && selectedDriver && !deliveryAddress) {
      toast.error(t('يرجى إدخال عنوان التوصيل'));
      return;
    }

    // تحديد الفرع النشط في بداية الدالة
    const currentBranchId = getBranchIdForApi() || user?.branch_id;

    setSubmitting(true);
    
    // === وضع Offline ===
    if (isOffline) {
      try {
        const offlineOrder = {
          order_type: orderType,
          table_id: orderType === 'dine_in' ? selectedTable : null,
          customer_name: customerName,
          customer_phone: customerPhone,
          delivery_address: orderType === 'delivery' ? deliveryAddress : null,
          buzzer_number: orderType === 'takeaway' ? buzzerNumber : null,
          items: cart.map(item => ({
            product_id: item.product_id || item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            notes: item.notes || ''
          })),
          subtotal: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
          total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) - discount,
          discount: discount,
          discount_type: discountType,
          discount_value: discount,
          tax: 0,
          branch_id: currentBranchId,
          payment_method: paymentMethod,
          delivery_app: orderType === 'delivery' ? deliveryApp : null,
          driver_id: selectedDriver || null,
          notes: orderNotes,
          status: 'delivered',
          cashier_id: user?.id,
          cashier_name: user?.name || user?.full_name
        };

        const savedOrder = await offlineStorage.saveOfflineOrder(offlineOrder);
        
        playSuccess();
        toast.success(
          <div>
            <div>✅ {t('تم حفظ الطلب محلياً')}</div>
            <div className="text-sm opacity-80">#{savedOrder.offline_id}</div>
            <div className="text-xs opacity-60">{t('سيتم رفعه عند عودة الاتصال')}</div>
          </div>,
          { duration: 5000 }
        );
        
        clearCart();
        setLastOrderNumber(savedOrder.offline_id);
        
        // تحديث حالة المزامنة
        await updateSyncStatus();
        
      } catch (error) {
        console.error('Failed to save offline order:', error);
        toast.error(t('فشل في حفظ الطلب محلياً'));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    
    // === وضع Online (الكود الأصلي) ===
    try {
      let orderNumber = '';
      let orderId = '';
      
      if (editingOrder) {
        // تحديث الطلب الموجود
        orderId = editingOrder.id;
        orderNumber = editingOrder.order_number;
        
        // إضافة أي عناصر جديدة
        const existingProductIds = editingOrder.items.map(i => i.product_id);
        const newItems = cart.filter(item => !existingProductIds.includes(item.product_id));
        
        if (newItems.length > 0) {
          await axios.put(`${API}/orders/${editingOrder.id}/add-items`, newItems);
        }
      } else {
        // إنشاء طلب جديد أولاً
        const orderData = {
          order_type: orderType,
          table_id: orderType === 'dine_in' ? selectedTable : null,
          customer_name: customerName,
          customer_phone: customerPhone,
          delivery_address: orderType === 'delivery' ? deliveryAddress : null,
          buzzer_number: orderType === 'takeaway' ? buzzerNumber : null,
          items: cart,
          branch_id: currentBranchId || (await axios.get(`${API}/branches`)).data[0]?.id,
          payment_method: paymentMethod,
          discount: discount,
          delivery_app: orderType === 'delivery' ? deliveryApp : null,
          driver_id: selectedDriver || null,
          notes: orderNotes
        };
        
        const res = await axios.post(`${API}/orders`, orderData);
        orderId = res.data.id;
        orderNumber = res.data.order_number;
        setLastOrderNumber(orderNumber); // حفظ رقم الفاتورة
        
        // إرسال إشعار للكاشير والسائق (فقط للطلبات الجديدة)
        await sendOrderNotification({
          id: orderId,
          order_number: orderNumber,
          branch_id: currentBranchId,
          order_type: orderType,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          delivery_address: deliveryAddress || null,
          driver_id: selectedDriver || null,
          total_amount: res.data.total_amount || cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
          items: cart,
          notes: orderNotes || null
        });
      }
      
      // تحديث طريقة الدفع وإغلاق الطلب
      await axios.put(`${API}/orders/${orderId}/payment?payment_method=${paymentMethod}`);
      await axios.put(`${API}/orders/${orderId}/status?status=delivered`);
      
      // إغلاق الطاولة تلقائياً إذا كان طلب داخل المطعم
      if (orderType === 'dine_in' && (selectedTable || editingOrder?.table_id)) {
        const tableId = selectedTable || editingOrder?.table_id;
        try {
          await axios.put(`${API}/tables/${tableId}/status?status=available`);
        } catch (err) {
          console.log('Table status update:', err);
        }
      }
      
      playSuccess();
      
      // رسالة مناسبة حسب نوع الطلب
      if (orderType === 'dine_in') {
        toast.success(`✅ ${t('تم إتمام الطلب')} #${orderNumber} ${t('وإغلاق الطاولة')}`);
      } else if (orderType === 'takeaway') {
        toast.success(`✅ ${t('تم إتمام الطلب السفري')} #${orderNumber}`);
      } else {
        toast.success(`✅ ${t('تم إتمام طلب التوصيل')} #${orderNumber}`);
      }
      
      // تنظيف وتحديث
      clearCart();
      await fetchPendingOrders();
      
      // تحديث الطاولات
      const tablesParams = currentBranchId ? { branch_id: currentBranchId } : {};
      const tablesRes = await axios.get(`${API}/tables`, { params: tablesParams });
      setTables(tablesRes.data);
    } catch (error) {
      console.error('Failed to submit order:', error);
      toast.error(getErrorMessage(error, t('فشل في إرسال الطلب')));
    } finally {
      setSubmitting(false);
    }
  };

  // فلترة الطلبات المعلقة حسب النوع
  const pendingTakeawayOrders = pendingOrders.filter(o => o.order_type === 'takeaway');
  const pendingDeliveryOrders = pendingOrders.filter(o => o.order_type === 'delivery');
  const pendingDineInOrders = pendingOrders.filter(o => o.order_type === 'dine_in');

  // طباعة الفاتورة (حفظ تلقائي + معاينة)
  const handlePrintBill = async () => {
    if (cart.length === 0) {
      toast.error(t('السلة فارغة'));
      return;
    }
    
    // إذا كان هناك طلب قيد التعديل، افتح المعاينة مباشرة
    if (editingOrder) {
      setPrintDialogOpen(true);
      return;
    }
    
    // التحقق من الشروط حسب نوع الطلب
    if (orderType === 'dine_in' && !selectedTable) {
      toast.error(t('يرجى اختيار طاولة'));
      return;
    }
    
    if (orderType === 'delivery' && selectedDriver && !deliveryAddress) {
      toast.error(t('يرجى إدخال عنوان التوصيل'));
      return;
    }
    
    // حفظ الطلب تلقائياً قبل الطباعة
    setSubmitting(true);
    try {
      const currentBranchId = getBranchIdForApi() || user?.branch_id;
      
      const orderData = {
        items: cart.map(item => ({
          product_id: item.product_id || item.id,
          product_name: item.product_name || item.name,
          price: item.price,
          quantity: item.quantity,
          cost: item.cost || 0,
          notes: item.notes || ''
        })),
        order_type: orderType,
        table_id: orderType === 'dine_in' ? selectedTable : null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        delivery_address: deliveryAddress || null,
        buzzer_number: buzzerNumber || null,
        driver_id: orderType === 'delivery' && selectedDriver ? selectedDriver : null,
        delivery_app: orderType === 'delivery' && deliveryApp ? deliveryApp : null,
        discount: discount || 0,
        branch_id: currentBranchId,
        payment_method: 'pending',
        auto_ready: true
      };
      
      const res = await axios.post(`${API}/orders`, orderData);
      const savedOrder = res.data;
      
      // تحديث رقم الطلب الأخير
      setLastOrderNumber(savedOrder.order_number);
      
      // إرسال إشعار للكاشير والسائق
      await sendOrderNotification({
        id: savedOrder.id,
        order_number: savedOrder.order_number,
        branch_id: currentBranchId,
        order_type: orderType,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        delivery_address: deliveryAddress || null,
        driver_id: selectedDriver || null,
        total_amount: savedOrder.total_amount || cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        items: cart,
        notes: orderNotes || null
      });
      
      // تحديث حالة الطاولة إذا كان طلب داخلي
      if (orderType === 'dine_in' && selectedTable) {
        try {
          await axios.put(`${API}/tables/${selectedTable}/status?status=available`);
        } catch (err) {
          console.error('Failed to update table status:', err);
        }
      }
      
      playSuccess();
      toast.success(`✅ ${t('تم حفظ الطلب')} #${savedOrder.order_number}`);
      
      // فتح نافذة الطباعة
      setPrintDialogOpen(true);
      
    } catch (error) {
      console.error('Failed to save order:', error);
      toast.error(getErrorMessage(error, t('فشل في حفظ الطلب')));
    } finally {
      setSubmitting(false);
    }
  };

  // إلغاء تعديل الطلب
  const cancelEditing = () => {
    clearCart();
    navigate('/pos');
  };

  // إلغاء الطلب بالكامل
  const handleCancelOrder = async () => {
    if (!editingOrder) return;
    
    if (!confirm(t('هل أنت متأكد؟'))) return;
    
    // تحديد الفرع النشط
    const currentBranchId = getBranchIdForApi() || user?.branch_id;
    
    setSubmitting(true);
    try {
      const res = await axios.put(`${API}/orders/${editingOrder.id}/cancel`);
      playSuccess();
      toast.success(res.data.was_quick_cancel 
        ? t('تم إلغاء الطلب (إلغاء سريع)') 
        : t('تم إلغاء الطلب')
      );
      clearCart();
      await fetchPendingOrders();
      
      // تحديث الطاولات
      const tablesParams = currentBranchId ? { branch_id: currentBranchId } : {};
      const tablesRes = await axios.get(`${API}/tables`, { params: tablesParams });
      setTables(tablesRes.data);
    } catch (error) {
      console.error('Failed to cancel order:', error);
      toast.error(getErrorMessage(error, t('فشل في إلغاء الطلب')));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('جاري التحميل...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Categories Sidebar - Right */}
      <div className="w-56 border-l border-border bg-card flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">{t('الفئات')}</h2>
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
                      src={cat.image.startsWith('/') ? `${API}${cat.image}` : cat.image} 
                      alt={cat.name}
                      className="w-full h-20 object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
                      }}
                    />
                  ) : null}
                  {!cat.image && (
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
                        {getLocalizedName(cat, lang)}
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
            <h1 className="text-xl font-bold font-cairo text-foreground">{t('نقطة البيع')}</h1>
            
            {/* اختيار الفرع */}
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <BranchSelector />
            </div>
            
            {/* مؤشر الطلبات المعلقة */}
            <Button 
              variant="outline" 
              className="relative"
              onClick={() => setPendingOrdersDialogOpen(true)}
              data-testid="pending-orders-btn"
            >
              <List className="h-4 w-4 ml-2" />
              {t('الطلبات المعلقة')}
              {pendingOrders.length > 0 && (
                <span className="absolute -top-2 -left-2 w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {pendingOrders.length}
                </span>
              )}
            </Button>
            
            {/* زر إرجاع الطلبات */}
            {canRefund() && (
              <Button 
                variant="outline" 
                className="border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
                onClick={openRefundDialog}
                data-testid="refund-btn"
              >
                <RefreshCw className="h-4 w-4 ml-2" />
                {t('إرجاع طلب')}
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {/* حالة التعديل */}
            {editingOrder && (
              <div className="flex items-center gap-2 bg-amber-500/10 px-3 py-1.5 rounded-lg">
                <Edit className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-500 font-medium">
                  {t('تعديل طلب')} #{editingOrder.order_number}
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
                placeholder={t('رقم هاتف العميل...')}
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
                {t('وردية مفتوحة')}
              </div>
            ) : (
              <div className="text-sm text-red-500">
                <span>● </span>
                {t('لا يوجد وردية')}
              </div>
            )}
          </div>
        </header>

        {/* Search */}
        <div className="p-4 bg-card/30 border-b border-border">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('بحث عن منتج...')}
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
                      src={product.image.startsWith('/') ? `${API}${product.image}` : product.image}
                      alt={product.name}
                      className="w-full h-24 object-cover rounded-lg mb-2"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  {!product.image && (
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
        <div className="p-3 border-b border-border">
          <div className="flex gap-1">
            {[
              { id: 'dine_in', label: t('داخل'), icon: UtensilsCrossed, hideForCallCenter: true, hideForCaptain: false },
              { id: 'takeaway', label: t('سفري'), icon: Package, hideForCallCenter: true, hideForCaptain: false },
              { id: 'delivery', label: t('توصيل'), icon: Truck, hideForCallCenter: false, hideForCaptain: true },
            ].filter(type => {
              // كول سنتر يرى فقط التوصيل
              if (isCallCenter && type.hideForCallCenter) return false;
              // كابتن يرى فقط داخل وسفري (بدون توصيل)
              if (isCaptain && type.hideForCaptain) return false;
              return true;
            }).map(type => (
              <Button
                key={type.id}
                variant={orderType === type.id ? 'default' : 'ghost'}
                size="sm"
                className={`flex-1 h-9 text-xs ${orderType === type.id ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => { 
                  setOrderType(type.id); 
                  playClick();
                  if (type.id !== 'dine_in') setSelectedTable(null);
                }}
                disabled={editingOrder && editingOrder.order_type !== type.id}
                data-testid={`order-type-${type.id}`}
              >
                <type.icon className="h-4 w-4 ml-1" />
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
                {customerData.total_orders} {t('طلب سابق')} | {formatPrice(customerData.total_spent)}
              </p>
              {customerData.is_blocked && (
                <div className="flex items-center gap-1 text-red-500 text-xs">
                  <AlertCircle className="h-3 w-3" />
                  {t('عميل محظور')}
                </div>
              )}
            </div>
          )}
          
          {orderType === 'dine_in' && (
            <div className="space-y-2">
              {/* تحقق من اختيار فرع */}
              {(!selectedBranchId || selectedBranchId === 'all') ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                  <AlertCircle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                  <p className="text-amber-600 font-medium">{t('اختر فرع أولاً')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('يجب اختيار فرع لعرض الطاولات المتاحة')}</p>
                </div>
              ) : (
                <>
                  {/* اختيار القسم */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      onClick={() => { playClick(); setSelectedTableSection(null); }}
                      className={`px-3 py-1 text-xs rounded-full transition-all ${
                        selectedTableSection === null 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {t('الكل')} ({tables.length})
                    </button>
                    {[...new Set(tables.map(tb => tb.section).filter(Boolean))].map(section => (
                      <button
                        key={section}
                        onClick={() => { playClick(); setSelectedTableSection(section); }}
                        className={`px-3 py-1 text-xs rounded-full transition-all ${
                          selectedTableSection === section 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {t(section)} ({tables.filter(tb => tb.section === section).length})
                      </button>
                    ))}
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-2">{t('اختر طاولة')}:</p>
                  <div className="max-h-48 overflow-y-auto border border-border/50 rounded-lg p-2 scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-muted/20">
                    <div className="grid grid-cols-5 gap-2">
                      {tables
                        .filter(table => !selectedTableSection || table.section === selectedTableSection)
                        .map(table => {
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
                            toast.success(t('تم فتح طلب الطاولة') + ` ${table.number}`);
                          } else if (isSelected) {
                            // إلغاء التحديد بالنقر مرة أخرى
                            setSelectedTable(null);
                          } else if (isAvailable) {
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
                        title={table.section || t('عام')}
                        data-testid={`table-btn-${table.number}`}
                      >
                        {table.number}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-4 text-xs mt-2">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{backgroundColor: '#22c55e'}}></span>
                  {t('متاحة')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{backgroundColor: '#ef4444'}}></span>
                  {t('مشغولة')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{backgroundColor: '#f59e0b'}}></span>
                  {t('محجوزة')}
                </span>
                <span className="text-muted-foreground mr-auto">
                  ({selectedTableSection ? tables.filter(tb => tb.section === selectedTableSection).length : tables.length} {t('طاولة')})
                </span>
              </div>
              {selectedTable && (
                <p className="text-xs text-primary mt-2">
                  ✓ {t('تم اختيار طاولة')} {tables.find(tb => tb.id === selectedTable)?.number} ({tables.find(tb => tb.id === selectedTable)?.section || t('عام')})
                </p>
              )}
                </>
              )}
            </div>
          )}

          {orderType === 'takeaway' && (
            <div className="space-y-2">
              <Input
                placeholder={t('اسم الزبون')}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="customer-name"
              />
              <Input
                placeholder={t('رقم الهاتف')}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                data-testid="customer-phone"
              />
              <Input
                placeholder={t('رقم جهاز التنبيه (اختياري)')}
                value={buzzerNumber}
                onChange={(e) => setBuzzerNumber(e.target.value)}
                data-testid="buzzer-number"
              />
            </div>
          )}

          {orderType === 'delivery' && (
            <div className="space-y-2">
              <Input
                placeholder={t('اسم العميل')}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="delivery-name"
              />
              <Input
                placeholder={t('رقم الهاتف')}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                data-testid="delivery-phone"
              />
              
              {/* اختيار السائق أولاً */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">{t('اختر السائق')}: <span className="text-red-500">*</span></p>
                <div className="grid grid-cols-2 gap-2">
                  {drivers.filter(d => d.is_available).map(driver => (
                    <button
                      key={driver.id}
                      onClick={() => { 
                        // إلغاء التحديد بالنقر مرة أخرى
                        if (selectedDriver === driver.id) {
                          setSelectedDriver('');
                        } else {
                          setSelectedDriver(driver.id); 
                          setDeliveryApp('');
                        }
                        playClick(); 
                      }}
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
                    <p className="text-sm text-red-500 col-span-2 text-center py-2">{t('لا يوجد سائقين متاحين')}</p>
                  )}
                </div>
                {selectedDriver && (
                  <p className="text-xs text-green-500 mt-1">
                    ✓ {t('سيتم تحويل الطلب مباشرة للسائق')}
                  </p>
                )}
              </div>
              
              {/* حقل العنوان - يظهر فقط إذا تم اختيار سائق */}
              {selectedDriver && (
                <Input
                  placeholder={t('عنوان التوصيل')}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  data-testid="delivery-address"
                  className="border-green-300 focus:border-green-500"
                />
              )}
              
              {/* شركة التوصيل */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">{t('أو اختر شركة التوصيل')}:</p>
                <div className="grid grid-cols-3 gap-1">
                  {deliveryApps.map(app => (
                    <button
                      key={app.id}
                      onClick={() => { 
                        // إلغاء التحديد بالنقر مرة أخرى
                        if (deliveryApp === app.id) {
                          setDeliveryApp('');
                        } else {
                          setDeliveryApp(app.id); 
                          setSelectedDriver(''); 
                          setDeliveryAddress('');
                        }
                        playClick(); 
                      }}
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
                {deliveryApp && (
                  <p className="text-xs text-blue-500 mt-1">
                    ℹ️ {t('شركة التوصيل ستستلم الطلب - لا حاجة للعنوان')}
                  </p>
                )}
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
                <p>{t('السلة فارغة')}</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={`${item.product_id}-${index}`}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{item.product_name || item.name || t('منتج')}</p>
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
            <span className="text-sm text-muted-foreground">{t('خصم')}:</span>
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
              <span className="text-muted-foreground">{t('المجموع الفرعي')}:</span>
              <span className="tabular-nums text-foreground">{formatPrice(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>{t('الخصم')}:</span>
                <span className="tabular-nums">-{formatPrice(discount)}</span>
              </div>
            )}
            {commissionAmount > 0 && (
              <div className="flex justify-between text-sm text-amber-500">
                <span>{t('عمولة')} {selectedDeliveryApp?.name} ({commissionRate}%):</span>
                <span className="tabular-nums">-{formatPrice(commissionAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
              <span className="text-foreground">{t('الإجمالي')}:</span>
              <span className="text-primary tabular-nums">{formatPrice(totalBeforeCommission)}</span>
            </div>
            {commissionAmount > 0 && (
              <div className="flex justify-between text-base font-bold bg-green-500/10 p-2 rounded-lg">
                <span className="text-green-600">{t('الصافي بعد العمولة')}:</span>
                <span className="text-green-600 tabular-nums">{formatPrice(netTotal)}</span>
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="flex gap-2">
            {[
              { id: 'cash', label: t('نقدي'), icon: Banknote },
              { id: 'card', label: t('بطاقة'), icon: CreditCard },
              { id: 'credit', label: t('آجل'), icon: Clock },
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
              {t('الطلبات المعلقة')} ({pendingOrders.length})
              <Button variant="ghost" size="sm" onClick={fetchPendingOrders}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="takeaway" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="takeaway" className="relative">
                {t('سفري')}
                {pendingTakeawayOrders.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {pendingTakeawayOrders.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="delivery" className="relative">
                {t('توصيل')}
                {pendingDeliveryOrders.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {pendingDeliveryOrders.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="dine_in" className="relative">
                {t('داخل المطعم')}
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
                    <p>{t('لا توجد طلبات سفري معلقة')}</p>
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
                    <p>{t('لا توجد طلبات توصيل معلقة')}</p>
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
                    <p>{t('لا توجد طلبات داخل المطعم معلقة')}</p>
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
              {editingOrder ? t('تحديث الطلب وإرسال للمطبخ') : t('حفظ وإرسال للمطبخ')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">{t('عدد العناصر')}:</span>
                <span className="font-bold text-foreground">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('الإجمالي')}:</span>
                <span className="font-bold text-primary">{formatPrice(totalBeforeCommission)}</span>
              </div>
              {commissionAmount > 0 && (
                <div className="flex justify-between text-amber-500">
                  <span>{t('عمولة التوصيل')}:</span>
                  <span className="font-bold">-{formatPrice(commissionAmount)}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">{t('ملاحظات للمطبخ')}:</label>
              <Input
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder={t('ملاحظات خاصة...')}
                className="h-12"
              />
            </div>

            <div className="bg-orange-500/10 p-3 rounded-lg text-sm text-orange-600">
              <p>{t('سيتم حفظ الطلب وإرساله للمطبخ للتحضير')}</p>
              <p>{t('الدفع سيتم لاحقاً عند التسليم')}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setKitchenDialogOpen(false)} className="flex-1">
                {t('إلغاء')}
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
                    {t('حفظ وإرسال')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Bill Dialog - معاينة الفاتورة */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-sm no-print print-dialog">
          <DialogHeader className="no-print">
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Receipt className="h-5 w-5 text-blue-500" />
              {t('معاينة الفاتورة')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="print-receipt bg-white text-black p-4 rounded-lg font-mono text-sm" dir={isRTL ? 'rtl' : 'ltr'} id="receipt-to-print">
            {/* ========== أعلى الفاتورة - شعار المطعم واسمه ========== */}
            <div className="text-center mb-3 border-b border-dashed border-gray-400 pb-3">
              {/* شعار المطعم (الخاص بالعميل) - دائري */}
              {invoiceSettings.invoice_logo && (
                <div className="mb-2">
                  <img 
                    src={(() => {
                      const logoUrl = invoiceSettings.invoice_logo;
                      if (logoUrl?.startsWith('/api')) {
                        return `${API}${logoUrl.replace('/api', '')}`;
                      }
                      if (logoUrl?.startsWith('/uploads')) {
                        return `${API}${logoUrl}`;
                      }
                      return logoUrl;
                    })()}
                    alt={t('شعار المطعم')} 
                    className="h-16 w-16 mx-auto object-cover rounded-full border-2 border-gray-300"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                </div>
              )}
              
              {/* اسم المطعم */}
              <h2 className="text-lg font-bold">{restaurantSettings.name || restaurantSettings.name_ar || t('اسم المطعم')}</h2>
              
              {/* عنوان المطعم */}
              {invoiceSettings.address && (
                <p className="text-xs text-gray-600 mt-1">{invoiceSettings.address}</p>
              )}
              
              {/* أرقام هاتف المطعم */}
              {(invoiceSettings.phone || invoiceSettings.phone2) && (
                <div className="text-xs mt-1" dir="ltr">
                  {invoiceSettings.phone && <span>📞 {invoiceSettings.phone}</span>}
                  {invoiceSettings.phone && invoiceSettings.phone2 && <span> - </span>}
                  {invoiceSettings.phone2 && <span>{invoiceSettings.phone2}</span>}
                </div>
              )}
              
              {/* الرقم الضريبي - إذا كان المستخدم يريد إظهاره */}
              {invoiceSettings.tax_number && invoiceSettings.show_tax !== false && (
                <p className="text-xs text-gray-500 mt-1">{t('الرقم الضريبي')}: <span dir="ltr">{invoiceSettings.tax_number}</span></p>
              )}
            </div>
            
            {/* معلومات الفاتورة - رقم الفاتورة ثم التاريخ والوقت */}
            <div className="text-center mb-2">
              {/* رقم الفاتورة أولاً */}
              {(editingOrder || lastOrderNumber) && (
                <p className="text-sm font-bold bg-gray-100 py-1 rounded mb-1">
                  {t('فاتورة رقم')}: <span dir="ltr">#{editingOrder?.order_number || lastOrderNumber}</span>
                </p>
              )}
              {/* التاريخ والوقت */}
              <p className="text-xs text-gray-500" dir="ltr">
                {new Date().toLocaleDateString('en-US')} - {new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true})}
              </p>
            </div>
            
            {/* معلومات الطلب - متغيرة حسب نوع الطلب */}
            <div className="border-t border-dashed border-gray-300 pt-2 mb-2 text-xs">
              {/* === طلب داخلي - الطاولة === */}
              {orderType === 'dine_in' && (
                <>
                  {selectedTable && (
                    <p className="font-medium">
                      🍽️ {t('طاولة')}: <span className="font-bold">{tables.find(t => t.id === selectedTable)?.number || selectedTable}</span>
                    </p>
                  )}
                </>
              )}
              
              {/* === طلب سفري - رقم الجهاز === */}
              {orderType === 'takeaway' && (
                <>
                  <p className="font-medium">🥡 {t('طلب سفري')}</p>
                  {buzzerNumber && (
                    <p>
                      <span className="font-medium">{t('رقم الجهاز')}:</span> <span dir="ltr" className="font-bold">{buzzerNumber}</span>
                    </p>
                  )}
                </>
              )}
              
              {/* === طلب توصيل - معلومات العميل والسائق/الشركة === */}
              {orderType === 'delivery' && (
                <>
                  <p className="font-medium">🚗 {t('طلب توصيل')}</p>
                  {customerName && <p><span className="font-medium">{t('العميل')}:</span> {customerName}</p>}
                  {customerPhone && <p><span className="font-medium">{t('الهاتف')}:</span> <span dir="ltr">{customerPhone}</span></p>}
                  {deliveryAddress && <p><span className="font-medium">{t('العنوان')}:</span> {deliveryAddress}</p>}
                  {/* السائق أو شركة التوصيل */}
                  {selectedDriver && drivers.length > 0 && (
                    <p><span className="font-medium">{t('السائق')}:</span> {drivers.find(d => d.id === selectedDriver)?.name || selectedDriver}</p>
                  )}
                  {deliveryApp && deliveryApps.length > 0 && (
                    <p><span className="font-medium">{t('شركة التوصيل')}:</span> {deliveryApps.find(a => a.id === deliveryApp)?.name || deliveryApp}</p>
                  )}
                </>
              )}
              
              {/* اسم الفرع - يظهر لجميع أنواع الطلبات */}
              {getBranchIdForApi() && branches.length > 0 && (
                <p>
                  <span className="font-medium">{t('الفرع')}:</span> {branches.find(b => b.id === getBranchIdForApi())?.name || t('الفرع الرئيسي')}
                </p>
              )}
              
              {/* اسم الموظف وصفته */}
              {user && (
                <p>
                  <span className="font-medium">{t('الكاشير')}:</span> {user.full_name || user.username} 
                  {user.role && <span className="text-gray-500"> ({t(user.role === 'admin' ? 'مدير' : user.role === 'cashier' ? 'كاشير' : user.role === 'captain' ? 'كابتن' : user.role)})</span>}
                </p>
              )}
            </div>
            
            {/* نص أعلى الفاتورة المخصص */}
            {invoiceSettings.custom_header && (
              <div className="text-center mb-2 text-xs">
                {invoiceSettings.custom_header}
              </div>
            )}
            
            {/* ========== الأصناف ========== */}
            <div className="border-t border-dashed border-gray-300 py-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className={`py-1 ${isRTL ? 'text-right' : 'text-left'}`}>{t('الصنف')}</th>
                    <th className="text-center py-1">{t('الكمية')}</th>
                    <th className={`py-1 ${isRTL ? 'text-left' : 'text-right'}`}>{t('السعر')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, i) => (
                    <tr key={i}>
                      <td className="py-1">{item.product_name || item.name || t('منتج')}</td>
                      <td className="text-center" dir="ltr">{item.quantity}</td>
                      <td className={`tabular-nums ${isRTL ? 'text-left' : 'text-right'}`} dir="ltr">{formatPrice(item.price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* ========== المجاميع ========== */}
            <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span>{t('المجموع الفرعي')}:</span>
                <span className="tabular-nums" dir="ltr">{formatPrice(subtotal)}</span>
              </div>
              {/* حقل الخصم - يظهر دائماً */}
              <div className={`flex justify-between text-xs p-1 rounded ${discount > 0 ? 'text-red-600 bg-red-50' : 'text-gray-500'}`}>
                <span>🏷️ {t('الخصم')}:</span>
                <span className="tabular-nums font-bold" dir="ltr">{discount > 0 ? `-${formatPrice(discount)}` : '0'}</span>
              </div>
              <div className="flex justify-between font-bold text-sm border-t-2 border-gray-400 pt-2 mt-2">
                <span>{t('الإجمالي النهائي')}:</span>
                <span className="tabular-nums" dir="ltr">{formatPrice(totalBeforeCommission)}</span>
              </div>
            </div>
            
            {/* نص أسفل الفاتورة المخصص من المطعم */}
            {invoiceSettings.custom_footer && (
              <div className="text-center text-xs mt-3 pt-2 border-t border-dashed">
                {invoiceSettings.custom_footer}
              </div>
            )}
            
            {/* ========== أسفل الفاتورة - شعار النظام وQR Code ========== */}
            <div className="text-center mt-4 pt-3 border-t-2 border-gray-400">
              {/* رسالة الشكر من المطعم */}
              <p className="text-xs font-bold mb-3">
                {invoiceSettings.thank_you_message || t('شكراً لزيارتكم') + ' ❤️'}
              </p>
              
              {/* خط فاصل */}
              <div className="border-t border-dashed border-gray-300 my-2"></div>
              
              {/* قسم النظام - شعار + اسم + QR */}
              <div className="flex flex-col items-center mt-2">
                {/* شعار النظام */}
                {systemInvoiceSettings.system_logo_url && (
                  <img 
                    src={(() => {
                      const logoUrl = systemInvoiceSettings.system_logo_url;
                      if (logoUrl?.startsWith('/api')) {
                        return `${API}${logoUrl.replace('/api', '')}`;
                      }
                      if (logoUrl?.startsWith('/uploads')) {
                        return `${API}${logoUrl}`;
                      }
                      return logoUrl;
                    })()}
                    alt={t('شعار النظام')} 
                    className="h-10 w-10 object-contain rounded-full mb-1"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                )}
                
                {/* اسم النظام */}
                <p className="text-xs font-bold text-gray-700">
                  {systemInvoiceSettings.system_name || 'Maestro EGP'}
                </p>
                
                {/* نص التواصل */}
                <p className="text-[10px] text-gray-500 mt-1">
                  {t('للتواصل معنا لشراء نسخة امسح الكود')}
                </p>
                
                {/* QR Code يفتح صفحة التواصل */}
                <div className="mt-2">
                  <QRCodeSVG 
                    value={`${window.location.origin}/contact`}
                    size={70}
                    level="L"
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 no-print">
            <Button variant="outline" onClick={() => {
              setPrintDialogOpen(false);
              // إذا تم حفظ الطلب، نظف السلة
              if (lastOrderNumber && !editingOrder) {
                clearCart();
                setLastOrderNumber(null);
              }
            }} className="flex-1">
              {t('إغلاق')}
            </Button>
            <Button 
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              onClick={() => {
                // طباعة باستخدام نافذة جديدة
                const printContent = document.getElementById('receipt-to-print');
                if (printContent) {
                  const printWindow = window.open('', '_blank', 'width=400,height=600');
                  printWindow.document.write(`
                    <!DOCTYPE html>
                    <html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${isRTL ? 'ar' : 'en'}">
                    <head>
                      <meta charset="UTF-8">
                      <title>${t('طباعة الفاتورة')}</title>
                      <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { 
                          font-family: 'Courier New', monospace; 
                          font-size: 12px; 
                          padding: 10px;
                          background: white;
                          color: black;
                          width: 80mm;
                          max-width: 80mm;
                        }
                        .text-center { text-align: center; }
                        .text-left { text-align: left; }
                        .text-right { text-align: right; }
                        .font-bold { font-weight: bold; }
                        .text-lg { font-size: 16px; }
                        .text-sm { font-size: 11px; }
                        .text-xs { font-size: 10px; }
                        .mb-2 { margin-bottom: 8px; }
                        .mb-3 { margin-bottom: 12px; }
                        .mt-1 { margin-top: 4px; }
                        .mt-2 { margin-top: 8px; }
                        .mt-3 { margin-top: 12px; }
                        .mt-4 { margin-top: 16px; }
                        .pt-2 { padding-top: 8px; }
                        .pt-3 { padding-top: 12px; }
                        .pb-3 { padding-bottom: 12px; }
                        .py-1 { padding-top: 4px; padding-bottom: 4px; }
                        .p-1 { padding: 4px; }
                        .border-t { border-top: 1px dashed #ccc; }
                        .border-b { border-bottom: 1px dashed #ccc; }
                        .border-t-2 { border-top: 2px solid #666; }
                        .border-dashed { border-style: dashed; }
                        .text-gray-500 { color: #666; }
                        .text-gray-600 { color: #555; }
                        .text-red-600 { color: #dc2626; }
                        .bg-red-50 { background: #fef2f2; }
                        .rounded { border-radius: 4px; }
                        .rounded-full { border-radius: 50%; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { padding: 4px 2px; }
                        img { max-width: 60px; height: auto; }
                        .flex { display: flex; }
                        .justify-between { justify-content: space-between; }
                        .space-y-1 > * + * { margin-top: 4px; }
                        @media print {
                          body { width: 80mm; }
                          @page { size: 80mm auto; margin: 2mm; }
                        }
                      </style>
                    </head>
                    <body>
                      ${printContent.innerHTML}
                      <script>
                        window.onload = function() {
                          window.print();
                          window.onafterprint = function() {
                            window.close();
                          };
                        };
                      </script>
                    </body>
                    </html>
                  `);
                  printWindow.document.close();
                  toast.success(t('تم فتح نافذة الطباعة'));
                  // إغلاق نافذة المعاينة وتنظيف السلة
                  setPrintDialogOpen(false);
                  if (lastOrderNumber && !editingOrder) {
                    clearCart();
                    setLastOrderNumber(null);
                  }
                } else {
                  toast.error(t('فشل في تحميل الفاتورة'));
                }
              }}
            >
              <Printer className="h-4 w-4 ml-2" />
              {t('طباعة')}
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
              {t('سجل العميل')}
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
                    <p className="text-muted-foreground">{t('إجمالي الطلبات')}</p>
                    <p className="font-bold text-foreground">{customerData.total_orders}</p>
                  </div>
                  <div className="bg-background p-2 rounded">
                    <p className="text-muted-foreground">{t('إجمالي المصروف')}</p>
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
                    {t('ملاحظات')}: {customerData.notes}
                  </div>
                )}
              </div>
              
              {customerHistory.length > 0 && (
                <div>
                  <h4 className="font-medium text-foreground mb-2">{t('آخر الطلبات')}:</h4>
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

      {/* حوار الإرجاع */}
      <Dialog open={refundDialogOpen} onOpenChange={closeRefundDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <RefreshCw className="h-5 w-5 text-orange-500" />
              {t('إرجاع طلب')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            {/* البحث برقم الفاتورة */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('رقم الفاتورة')}</label>
              <div className="flex gap-2">
                <Input
                  placeholder={t('أدخل رقم الفاتورة...')}
                  value={refundOrderId}
                  onChange={(e) => setRefundOrderId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchOrderForRefund()}
                  className="flex-1"
                  data-testid="refund-order-input"
                />
                <Button 
                  onClick={searchOrderForRefund}
                  disabled={refundLoading}
                  variant="outline"
                >
                  {refundLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            {/* معلومات الطلب */}
            {refundOrderInfo && (
              <div className={`p-4 rounded-lg border ${refundOrderInfo.can_refund ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-lg">{t('فاتورة')} #{refundOrderInfo.order_number}</span>
                  {refundOrderInfo.is_refunded ? (
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">{t('تم إرجاعه')}</span>
                  ) : refundOrderInfo.can_refund ? (
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">{t('قابل للإرجاع')}</span>
                  ) : !refundOrderInfo.is_today ? (
                    <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-full">{t('طلب قديم')}</span>
                  ) : (
                    <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">{t('غير مدفوع')}</span>
                  )}
                </div>
                
                {/* تفاصيل الطلب */}
                <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                  <div className="text-muted-foreground">{t('نوع الطلب')}:</div>
                  <div className="font-medium">
                    {refundOrderInfo.order_type === 'dine_in' ? t('داخل المطعم') : 
                     refundOrderInfo.order_type === 'takeaway' ? t('سفري') : t('توصيل')}
                  </div>
                  <div className="text-muted-foreground">{t('المبلغ')}:</div>
                  <div className="font-medium text-primary">{(refundOrderInfo.total || 0).toLocaleString('en-US')} IQD</div>
                  <div className="text-muted-foreground">{t('تاريخ الطلب')}:</div>
                  <div className={`font-medium ${refundOrderInfo.is_today ? 'text-green-500' : 'text-orange-500'}`}>
                    {refundOrderInfo.order_date} {refundOrderInfo.is_today ? `(${t('اليوم')})` : `(${t('يوم سابق')})`}
                  </div>
                  {refundOrderInfo.customer_name && (
                    <>
                      <div className="text-muted-foreground">{t('العميل')}:</div>
                      <div className="font-medium">{refundOrderInfo.customer_name}</div>
                    </>
                  )}
                </div>
                
                {/* رسالة تحذيرية إذا لم يكن قابل للإرجاع */}
                {refundOrderInfo.refund_message && (
                  <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                    ⚠️ {refundOrderInfo.refund_message}
                  </div>
                )}
                
                {refundOrderInfo.refunds && refundOrderInfo.refunds.length > 0 && (
                  <div className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border">
                    <p>{t('تم إرجاعه بتاريخ')}: {new Date(refundOrderInfo.refunds[0].created_at).toLocaleString('ar-IQ')}</p>
                    <p>{t('السبب')}: {refundOrderInfo.refunds[0].reason}</p>
                  </div>
                )}
              </div>
            )}
            
            {/* سبب الإرجاع */}
            {refundOrderInfo && refundOrderInfo.can_refund && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t('سبب الإرجاع')} <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder={t('أدخل سبب الإرجاع (مطلوب)...')}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full"
                  data-testid="refund-reason-input"
                />
                <p className="text-xs text-muted-foreground">
                  {t('يجب إدخال سبب الإرجاع (3 أحرف على الأقل)')}
                </p>
              </div>
            )}
            
            {/* أزرار الإجراءات */}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={closeRefundDialog}
                className="flex-1"
              >
                {t('إلغاء')}
              </Button>
              
              {refundOrderInfo && refundOrderInfo.can_refund && (
                <Button
                  onClick={processRefund}
                  disabled={refundLoading || !refundReason.trim()}
                  className="flex-1 bg-orange-500 hover:bg-orange-600"
                  data-testid="confirm-refund-btn"
                >
                  {refundLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                      {t('جاري الإرجاع...')}
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 ml-2" />
                      {t('تأكيد الإرجاع')}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// مكون بطاقة الطلب المعلق
function OrderCard({ order, onSelect }) {
  const { t } = useTranslation();
  
  const getOrderTypeIcon = (type) => {
    switch (type) {
      case 'takeaway': return <Package className="h-4 w-4" />;
      case 'delivery': return <Truck className="h-4 w-4" />;
      default: return <UtensilsCrossed className="h-4 w-4" />;
    }
  };
  
  const getOrderTypeLabel = (type) => {
    switch (type) {
      case 'takeaway': return t('سفري');
      case 'delivery': return t('توصيل');
      default: return t('داخل المطعم');
    }
  };
  
  const timeAgo = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return t('الآن');
    if (diffMins < 60) return `${t('منذ')} ${diffMins} ${t('دقيقة')}`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${t('منذ')} ${diffHours} ${t('ساعة')}`;
    return `${t('منذ')} ${Math.floor(diffHours / 24)} ${t('يوم')}`;
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
                  {t('جهاز')} #{order.buzzer_number}
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
                {item.product_name || item.name || t('منتج')} x{item.quantity}
              </span>
            ))}
            {order.items.length > 3 && (
              <span className="text-xs bg-muted px-2 py-1 rounded">
                +{order.items.length - 3} {t('أخرى')}
              </span>
            )}
          </div>
        </div>
        
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="outline" className="h-8">
            <Eye className="h-3 w-3 ml-1" />
            {t('فتح للتعديل')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
