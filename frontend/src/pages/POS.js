import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { printOrderToAllPrinters, sendReceiptPrint } from '../utils/printService';
import { AgentUpdateBanner } from '../utils/AgentUpdateChecker';
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
  const { selectedBranchId, branches, getBranchIdForApi, refreshPendingCounts, updatePendingCount } = useBranch();
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
  const [paymentMethod, setPaymentMethod] = useState('');  // فارغ - يجب على المستخدم الاختيار
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('fixed'); // fixed or percentage
  const [deliveryApp, setDeliveryApp] = useState('');
  const [deliveryApps, setDeliveryApps] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  // Extras modal state
  const [extrasModalOpen, setExtrasModalOpen] = useState(false);
  const [selectedCartItem, setSelectedCartItem] = useState(null);
  const [tempNotes, setTempNotes] = useState('');
  const [tempSelectedExtras, setTempSelectedExtras] = useState([]);
  // لا نعرض شاشة التحميل إذا كانت البيانات محملة سابقاً
  const [loading, setLoading] = useState(() => {
    return sessionStorage.getItem('pos_data_loaded') !== 'true';
  });
  const [isInitialLoad, setIsInitialLoad] = useState(() => {
    return sessionStorage.getItem('pos_data_loaded') !== 'true';
  });
  const [dataLoaded, setDataLoaded] = useState(() => {
    // تحقق إذا تم تحميل البيانات من قبل في هذه الجلسة
    return sessionStorage.getItem('pos_data_loaded') === 'true';
  });
  const [submitting, setSubmitting] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);
  const [kitchenDialogOpen, setKitchenDialogOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [kitchenPrintStatus, setKitchenPrintStatus] = useState({}); // {itemIndex: 'pending'|'sending'|'success'|'error'}
  
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
  
  // الطابعات المتعددة
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [printAgentOnline, setPrintAgentOnline] = useState(false);
  
  // إعدادات الفاتورة والمطعم والنظام
  const [invoiceSettings, setInvoiceSettings] = useState({});
  const [restaurantSettings, setRestaurantSettings] = useState({});
  const [systemInvoiceSettings, setSystemInvoiceSettings] = useState({});
  const [logoBase64, setLogoBase64] = useState(null); // شعار المطعم بصيغة base64 للطباعة
  const [sysLogoBase64, setSysLogoBase64] = useState(null); // شعار النظام بصيغة base64 للطباعة
  
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
  const [incomingCustomerOrder, setIncomingCustomerOrder] = useState(null); // طلب قادم من تطبيق العميل
  
  const { notifications: orderNotifications, unreadCount: unreadOrdersCount } = useOrderNotifications({
    branchId: isCashierRole ? currentBranchIdForNotifications : null,
    enabled: isCashierRole && !isCallCenter && !isCaptain,
    pollingInterval: 5000,
    playSound: true,
    autoPrint: false,
    onNewOrder: (notification) => {
      fetchPendingOrders();
      // إذا كان الطلب من تطبيق العميل - عرض نافذة كبيرة
      if (notification.source === 'customer_app') {
        setIncomingCustomerOrder(notification);
      }
    }
  });

  // إعادة جلب البيانات عند تغيير الفرع المحدد
  useEffect(() => {
    fetchData();
    // تحديث الطلبات المعلقة كل 30 ثانية
    const interval = setInterval(fetchPendingOrders, 30000);
    return () => clearInterval(interval);
  }, []); // فقط عند التحميل الأولي

  // إعادة جلب البيانات عند العودة للصفحة (visibility change)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // إعادة جلب البيانات عند العودة للصفحة
        fetchDataSilently();
        fetchPendingOrders();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedBranchId]);
  
  // جلب البيانات عند تغيير الفرع (بدون إعادة عرض شاشة التحميل)
  useEffect(() => {
    if (!isInitialLoad && selectedBranchId) {
      fetchDataSilently();
    }
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
    // جلب الفرع المحدد من localStorage
    const savedBranchId = localStorage.getItem('selectedBranchId');
    const activeBranchId = getBranchIdForApi() || savedBranchId || user?.branch_id;
    
    console.log('🔄 fetchData starting - Branch:', activeBranchId, 'navigator.onLine:', navigator.onLine);
    
    // دالة مساعدة لجلب البيانات من IndexedDB
    const loadFromIndexedDB = async (showToast = true) => {
      console.log('📦 Loading from IndexedDB...');
      const [localCategories, localProducts, localTables] = await Promise.all([
        db.getAllItems(STORES.CATEGORIES),
        db.getAllItems(STORES.PRODUCTS),
        db.getAllItems(STORES.TABLES)
      ]);
      
      console.log('📦 IndexedDB:', { categories: localCategories.length, products: localProducts.length, tables: localTables.length });
      
      // جلب الوردية المحفوظة من localStorage
      try {
        const savedShift = localStorage.getItem('currentShift');
        if (savedShift) {
          const shiftData = JSON.parse(savedShift);
          setCurrentShift(shiftData);
          console.log('📦 Loaded shift from localStorage:', shiftData.id);
        }
      } catch (e) {
        console.log('Could not load shift from localStorage');
      }
      
      // الفئات
      if (localCategories.length > 0) {
        const sortedCategories = [...localCategories].sort((a, b) => (a.order ?? a.sort_order ?? 999) - (b.order ?? b.sort_order ?? 999));
        setCategories(sortedCategories);
        setSelectedCategory(sortedCategories[0].id);
      }
      
      if (localProducts.length > 0) setProducts(localProducts);
      
      // الطاولات مع الفلترة
      if (localTables.length > 0) {
        let filteredTables = localTables;
        
        if (activeBranchId && activeBranchId !== 'all') {
          filteredTables = localTables.filter(t => 
            t.branch_id === activeBranchId || String(t.branch_id) === String(activeBranchId)
          );
          console.log('🔍 Filtered tables:', filteredTables.length);
        }
        
        // ترتيب الطاولات حسب الرقم
        filteredTables = filteredTables.sort((a, b) => (a.number || 0) - (b.number || 0));
        
        // تحديث حالة الطاولات المشغولة - جلب كل الطلبات من IndexedDB
        const allStoredOrders = await db.getAllItems(STORES.ORDERS);
        console.log('📦 All stored orders for table status:', allStoredOrders.length);
        
        const occupiedTableIds = allStoredOrders
          .filter(o => o.table_id && ['pending', 'preparing', 'ready'].includes(o.status))
          .map(o => String(o.table_id));
        
        console.log('🔴 Occupied table IDs:', occupiedTableIds);
        
        filteredTables = filteredTables.map(table => {
          if (occupiedTableIds.includes(String(table.id))) {
            const order = allStoredOrders.find(o => String(o.table_id) === String(table.id) && ['pending', 'preparing', 'ready'].includes(o.status));
            console.log('🔴 Table', table.id, 'is occupied by order:', order?.id || order?.offline_id);
            return { ...table, status: 'occupied', current_order_id: order?.id || order?.offline_id };
          }
          return table;
        });
        
        setTables(filteredTables);
      }
      
      // الطلبات المعلقة - جلب كل الطلبات من IndexedDB
      const allLocalOrders = await db.getAllItems(STORES.ORDERS);
      console.log('📦 All orders in IndexedDB:', allLocalOrders.length);
      
      // إزالة التكرارات - الأولوية للطلبات ذات order_number (من الخادم)
      const uniqueOrdersMap = new Map();
      
      for (const order of allLocalOrders) {
        // المفتاح الأساسي: order_number إذا وُجد، وإلا id
        const key = order.order_number ? `num_${order.order_number}` : `id_${order.id}`;
        
        // إذا الطلب موجود بالفعل
        if (uniqueOrdersMap.has(key)) {
          const existing = uniqueOrdersMap.get(key);
          // احتفظ بالطلب من API (is_cached) بدلاً من المحلي
          if (order.is_cached && !existing.is_cached) {
            uniqueOrdersMap.set(key, order);
          }
        } else {
          uniqueOrdersMap.set(key, order);
        }
      }
      
      const deduplicatedOrders = Array.from(uniqueOrdersMap.values());
      console.log('📦 Orders after deduplication:', deduplicatedOrders.length);
      
      // فلترة الطلبات المعلقة
      let pendingLocal = deduplicatedOrders.filter(o => 
        ['pending', 'preparing', 'ready'].includes(o.status)
      );
      
      if (activeBranchId && activeBranchId !== 'all') {
        pendingLocal = pendingLocal.filter(o => !o.branch_id || String(o.branch_id) === String(activeBranchId));
      }
      
      console.log('📦 Pending orders:', pendingLocal.length);
      setPendingOrders(pendingLocal);
      
      if (showToast && (localCategories.length > 0 || localProducts.length > 0)) {
        // عرض الرسالة فقط إذا لم نكن متصلين
        if (!navigator.onLine) {
          toast.warning(t('تم تحميل البيانات المحلية - لا يوجد اتصال'));
        }
      }
      
      return localCategories.length > 0 || localProducts.length > 0;
    };
    
    try {
      // إذا لم يكن هناك اتصال حقيقي، اذهب مباشرة لـ IndexedDB
      if (!navigator.onLine) {
        await loadFromIndexedDB();
        setLoading(false);
        return;
      }
      const [catRes, prodRes, appsRes, shiftRes, invoiceRes, restaurantRes, sysInvoiceRes, loginBgRes, printersRes] = await Promise.all([
        axios.get(`${API}/categories`),
        axios.get(`${API}/products`),
        axios.get(`${API}/delivery-apps`),
        axios.get(`${API}/shifts/current`).catch(() => ({ data: null })),
        axios.get(`${API}/tenant/invoice-settings`).catch(() => ({ data: {} })),
        axios.get(`${API}/settings/restaurant`).catch(() => ({ data: {} })),
        axios.get(`${API}/system/invoice-settings`).catch(() => ({ data: {} })),
        axios.get(`${API}/login-backgrounds`).catch(() => ({ data: {} })),
        axios.get(`${API}/printers`).catch(err => { console.error('[POS] Failed to load printers:', err.message); return { data: [] }; })
      ]);

      setCategories(catRes.data);
      setProducts(prodRes.data);
      setDeliveryApps(appsRes.data);
      const loadedPrinters = printersRes.data || [];
      console.log('[POS] Loaded printers:', loadedPrinters.length, loadedPrinters.map(p => ({name: p.name, type: p.printer_type, conn: p.connection_type})));
      setAvailablePrinters(loadedPrinters);
      const invoiceData = invoiceRes.data || {};
      const restaurantData = restaurantRes.data || {};
      setInvoiceSettings(invoiceData);
      setRestaurantSettings(restaurantData);
      
      // تحويل شعار المطعم إلى base64 للطباعة المباشرة
      const logoUrl = invoiceData.invoice_logo || restaurantData.logo_url;
      if (logoUrl) {
        try {
          const fullUrl = logoUrl.startsWith('http') ? logoUrl 
            : logoUrl.startsWith('/api') ? `${API}${logoUrl.replace('/api', '')}`
            : logoUrl.startsWith('/uploads') ? `${API}${logoUrl}`
            : logoUrl;
          const imgResp = await fetch(fullUrl);
          const blob = await imgResp.blob();
          const reader = new FileReader();
          reader.onloadend = () => setLogoBase64(reader.result);
          reader.readAsDataURL(blob);
        } catch (e) { console.log('Could not preload logo'); }
      }
      
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
      // إذا لم يوجد شعار نظام مخصص، استخدم شعار صفحة الدخول (شعار النظام فقط - ليس المطعم)
      if (!sysInvoice.system_logo_url && loginBg.logo_url) {
        sysInvoice.system_logo_url = loginBg.logo_url;
      }
      setSystemInvoiceSettings(sysInvoice);

      // Pre-load system logo as base64
      if (sysInvoice.system_logo_url) {
        try {
          const sysLogoUrl = sysInvoice.system_logo_url;
          const fullSysUrl = sysLogoUrl.startsWith('http') ? sysLogoUrl
            : sysLogoUrl.startsWith('/api') ? `${API}${sysLogoUrl.replace('/api', '')}`
            : sysLogoUrl.startsWith('/uploads') ? `${API}${sysLogoUrl}`
            : sysLogoUrl;
          const sysImgResp = await fetch(fullSysUrl);
          const sysBlob = await sysImgResp.blob();
          const sysReader = new FileReader();
          sysReader.onloadend = () => setSysLogoBase64(sysReader.result);
          sysReader.readAsDataURL(sysBlob);
        } catch (e) { console.log('Could not preload system logo'); }
      }
      
      // إذا لم تكن هناك وردية مفتوحة، افتح واحدة تلقائياً
      if (!shiftRes.data) {
        try {
          const autoOpenRes = await axios.post(`${API}/shifts/auto-open`);
          setCurrentShift(autoOpenRes.data.shift);
          // حفظ الوردية في localStorage للعمل offline
          if (autoOpenRes.data.shift) {
            localStorage.setItem('currentShift', JSON.stringify(autoOpenRes.data.shift));
            console.log('💾 Saved shift to localStorage (auto-open):', autoOpenRes.data.shift.id);
          }
          if (!autoOpenRes.data.was_existing) {
            toast.success(t('تم فتح وردية جديدة تلقائياً'));
          }
        } catch (autoOpenError) {
          console.log('Could not auto-open shift:', autoOpenError);
          setCurrentShift(null);
        }
      } else {
        setCurrentShift(shiftRes.data);
        // حفظ الوردية في localStorage للعمل offline
        localStorage.setItem('currentShift', JSON.stringify(shiftRes.data));
        console.log('💾 Saved shift to localStorage:', shiftRes.data.id);
      }

      // جلب الطاولات حسب الفرع المحدد للعرض
      const tablesParams = activeBranchId ? { branch_id: activeBranchId } : {};
      const tablesRes = await axios.get(`${API}/tables`, { params: tablesParams });
      
      // جلب الطلبات المعلقة لتحديث حالة الطاولات
      const [pendingOrdersRes] = await Promise.all([
        axios.get(`${API}/orders`, { params: { ...tablesParams, status: 'pending,preparing,ready' } })
      ]);
      
      // تحديث حالة الطاولات بناءً على الطلبات
      const occupiedTableIds = pendingOrdersRes.data
        .filter(o => o.table_id && ['pending', 'preparing', 'ready'].includes(o.status))
        .map(o => String(o.table_id));
      
      console.log('🔴 Occupied table IDs from API:', occupiedTableIds);
      
      // ترتيب الطاولات حسب الرقم
      const sortedTables = [...tablesRes.data].sort((a, b) => (a.number || 0) - (b.number || 0));
      
      const tablesWithStatus = sortedTables.map(table => {
        if (occupiedTableIds.includes(String(table.id))) {
          const order = pendingOrdersRes.data.find(o => String(o.table_id) === String(table.id));
          console.log('🔴 Table', table.number, 'is occupied by order #', order?.order_number);
          return { ...table, status: 'occupied', current_order_id: order?.id };
        }
        return table;
      });
      
      setTables(tablesWithStatus);
      
      // حفظ جميع الطاولات محلياً (للعمل Offline)
      try {
        // جلب جميع الطاولات للتخزين المحلي
        const allTablesRes = await axios.get(`${API}/tables`);
        await db.addItems(STORES.TABLES, allTablesRes.data);
        console.log('✅ تم حفظ', allTablesRes.data.length, 'طاولة محلياً');
      } catch (cacheError) {
        console.log('Could not cache tables:', cacheError);
        // حاول حفظ الطاولات الحالية على الأقل
        try {
          await db.addItems(STORES.TABLES, tablesRes.data);
        } catch (e) {}
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
      const isNetworkError = !error.response || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error');
      
      if (isNetworkError) {
        console.log('🔄 Network error, loading from IndexedDB...');
        try {
          const loaded = await loadFromIndexedDB();
          if (!loaded) {
            toast.error(t('لا توجد بيانات محلية - يرجى الاتصال بالإنترنت'));
          }
        } catch (offlineError) {
          console.error('Failed to load offline data:', offlineError);
          toast.error(t('فشل في تحميل البيانات المحلية'));
        }
      } else {
        // خطأ من الخادم - لا نعرض رسالة إذا كان الخطأ بسيطاً
        console.log('❌ Server error:', error.response?.status, error.message);
        // فقط نعرض رسالة خطأ إذا كان الخطأ جدياً (500+)
        if (error.response?.status >= 500) {
          toast.error(t('خطأ في الخادم - يرجى المحاولة لاحقاً'));
        }
      }
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
      setDataLoaded(true);
      sessionStorage.setItem('pos_data_loaded', 'true');
    }
  };

  // جلب البيانات بدون إظهار شاشة التحميل (عند تغيير الفرع)
  const fetchDataSilently = async () => {
    try {
      const activeBranchId = getBranchIdForApi() || user?.branch_id;
      
      // في وضع Offline - جلب من IndexedDB مع فلترة الطاولات
      if (!navigator.onLine || isOffline) {
        console.log('📦 fetchDataSilently in Offline mode - Branch:', activeBranchId);
        
        const [localCategories, localProducts, localTables] = await Promise.all([
          db.getAllItems(STORES.CATEGORIES),
          db.getAllItems(STORES.PRODUCTS),
          db.getAllItems(STORES.TABLES)
        ]);
        
        if (localCategories.length > 0) {
          const sortedCategories = [...localCategories].sort((a, b) => (a.order ?? a.sort_order ?? 999) - (b.order ?? b.sort_order ?? 999));
          setCategories(sortedCategories);
        }
        
        if (localProducts.length > 0) setProducts(localProducts);
        
        // الطاولات مع الفلترة حسب الفرع
        if (localTables.length > 0) {
          let filteredTables = localTables;
          
          if (activeBranchId && activeBranchId !== 'all') {
            filteredTables = localTables.filter(t => 
              String(t.branch_id) === String(activeBranchId)
            );
            console.log('🔍 Offline filtered tables for branch', activeBranchId, ':', filteredTables.length);
          }
          
          // ترتيب الطاولات حسب الرقم
          filteredTables = filteredTables.sort((a, b) => (a.number || 0) - (b.number || 0));
          
          // تحديث حالة الطاولات المشغولة - جلب كل الطلبات من IndexedDB
          const allStoredOrders = await db.getAllItems(STORES.ORDERS);
          console.log('📦 All stored orders for table status (fetchDataSilently):', allStoredOrders.length);
          
          const occupiedTableIds = allStoredOrders
            .filter(o => o.table_id && ['pending', 'preparing', 'ready'].includes(o.status))
            .map(o => String(o.table_id));
          
          console.log('🔴 Occupied table IDs:', occupiedTableIds);
          
          filteredTables = filteredTables.map(table => {
            if (occupiedTableIds.includes(String(table.id))) {
              const order = allStoredOrders.find(o => String(o.table_id) === String(table.id) && ['pending', 'preparing', 'ready'].includes(o.status));
              return { ...table, status: 'occupied', current_order_id: order?.id || order?.offline_id };
            }
            return table;
          });
          
          setTables(filteredTables);
        } else {
          setTables([]);
        }
        
        // جلب الطلبات المعلقة
        await fetchPendingOrders();
        return;
      }
      
      // في وضع Online - جلب من API
      const [catRes, prodRes, tablesRes, printersRes] = await Promise.all([
        axios.get(`${API}/categories`),
        axios.get(`${API}/products`),
        axios.get(`${API}/tables`, { params: activeBranchId ? { branch_id: activeBranchId } : {} }).catch(() => ({ data: [] })),
        axios.get(`${API}/printers`).catch(err => { console.error('[POS] Failed to reload printers:', err.message); return { data: [] }; })
      ]);

      setCategories(catRes.data);
      setProducts(prodRes.data);
      setTables(tablesRes.data);
      const reloadedPrinters = printersRes.data || [];
      console.log('[POS] Reloaded printers:', reloadedPrinters.length, reloadedPrinters.map(p => ({name: p.name, type: p.printer_type, conn: p.connection_type})));
      setAvailablePrinters(reloadedPrinters);
      
      // جلب الطلبات المعلقة
      await fetchPendingOrders();
    } catch (error) {
      console.error('Failed to fetch data silently:', error);
    }
  };

  const fetchPendingOrders = async () => {
    try {
      // تحديد الفرع النشط
      const activeBranchId = getBranchIdForApi() || user?.branch_id;
      const params = activeBranchId ? { branch_id: activeBranchId } : {};
      
      // في وضع Offline، جلب الطلبات المحلية (المخزنة من API + غير المزامنة)
      if (isOffline || !navigator.onLine) {
        console.log('📦 fetchPendingOrders in Offline mode');
        
        // جلب كل الطلبات من IndexedDB
        const allStoredOrders = await db.getAllItems(STORES.ORDERS);
        console.log('📦 All stored orders in IndexedDB:', allStoredOrders.length);
        
        // دمج الطلبات بدون تكرار
        const ordersMap = new Map();
        for (const order of allStoredOrders) {
          const key = order.id || order.offline_id;
          if (!ordersMap.has(key)) {
            ordersMap.set(key, order);
          }
        }
        
        const allLocalOrders = Array.from(ordersMap.values());
        
        // فلترة الطلبات المعلقة
        const pendingLocal = allLocalOrders.filter(o => {
          // الطلبات المعلقة أو قيد التحضير أو جاهزة
          const statusMatch = ['pending', 'preparing', 'ready'].includes(o.status);
          // أو الطلبات غير المزامنة (محلية جديدة)
          const unsyncedMatch = o.is_synced === false;
          // فلترة حسب الفرع
          const branchMatch = !activeBranchId || activeBranchId === 'all' || String(o.branch_id) === String(activeBranchId);
          
          return (statusMatch || unsyncedMatch) && branchMatch;
        });
        
        console.log('📦 Pending local orders:', pendingLocal.length);
        
        // تحديث حالة الطاولات المشغولة
        const occupiedTableIds = pendingLocal
          .filter(o => o.table_id && ['pending', 'preparing', 'ready'].includes(o.status))
          .map(o => String(o.table_id));
        
        console.log('🔴 Occupied table IDs (offline):', occupiedTableIds);
        
        if (occupiedTableIds.length > 0) {
          setTables(prevTables => prevTables.map(table => {
            if (occupiedTableIds.includes(String(table.id))) {
              const order = pendingLocal.find(o => String(o.table_id) === String(table.id) && ['pending', 'preparing', 'ready'].includes(o.status));
              console.log('🔴 Table', table.number || table.id, 'is occupied by order:', order?.id || order?.offline_id);
              return { ...table, status: 'occupied', current_order_id: order?.id || order?.offline_id };
            }
            // إذا كانت الطاولة مشغولة سابقاً ولا يوجد عليها طلب الآن
            if (table.status === 'occupied' && !occupiedTableIds.includes(String(table.id))) {
              return { ...table, status: 'available', current_order_id: null };
            }
            return table;
          }));
        }
        
        setPendingOrders(pendingLocal);
        return;
      }
      
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
      
      // حفظ الطلبات من API للاستخدام offline
      const allApiOrders = [...activeRes.data, ...unpaidRes.data];
      try {
        await offlineStorage.cacheApiOrders(allApiOrders);
      } catch (cacheError) {
        console.log('Cache error:', cacheError);
      }
      
      // تنظيف الطلبات المزامنة من IndexedDB
      // حذف الطلبات المحلية التي تم مزامنتها بالفعل
      try {
        // استدعاء دالة التنظيف الشاملة
        await offlineStorage.cleanupSyncedOrders(allApiOrders);
      } catch (cleanupError) {
        console.log('Cleanup error:', cleanupError);
      }
      
      // إضافة الطلبات المحلية غير المتزامنة
      try {
        const localOrders = await offlineStorage.getUnsyncedOrders();
        
        // جلب جميع offline_ids و order_numbers من الطلبات في API
        const syncedOfflineIds = new Set();
        const apiOrderIds = new Set();
        const apiOrderNumbers = new Set();
        
        for (const [key, order] of ordersMap) {
          apiOrderIds.add(order.id);
          if (order.offline_id) {
            syncedOfflineIds.add(order.offline_id);
          }
          if (order.order_number) {
            apiOrderNumbers.add(order.order_number);
          }
        }
        
        console.log('🔍 API orders count:', ordersMap.size);
        console.log('🔍 Local unsynced orders:', localOrders.length);
        
        for (const order of localOrders) {
          // تجاهل الطلبات التي تم مزامنتها بالفعل
          const alreadySynced = 
            (order.offline_id && syncedOfflineIds.has(order.offline_id)) ||
            (order.id && apiOrderIds.has(order.id)) ||
            (order.order_number && apiOrderNumbers.has(order.order_number)) ||
            ordersMap.has(order.id) || 
            ordersMap.has(order.offline_id);
          
          // تجاهل الطلبات التي لها order_number (رُفعت سابقاً للخادم)
          const hasServerOrderNumber = order.order_number && !order.offline_id?.startsWith('OFF-');
          
          if (alreadySynced || hasServerOrderNumber) {
            console.log('⏭️ تخطي طلب مزامن:', order.offline_id || order.id, order.order_number);
            continue;
          }
          
          if (order.status !== 'cancelled') {
            // فلترة حسب الفرع - مقارنة كـ string
            const branchMatch = !activeBranchId || 
                               activeBranchId === 'all' || 
                               String(order.branch_id) === String(activeBranchId);
            if (branchMatch) {
              console.log('➕ إضافة طلب محلي:', order.offline_id || order.id);
              ordersMap.set(order.offline_id || order.id, order);
            }
          }
        }
      } catch (localError) {
        console.log('Could not fetch local orders:', localError);
      }
      
      const allOrders = Array.from(ordersMap.values());
      
      // ترتيب حسب تاريخ الإنشاء (الأحدث أولاً)
      allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      // تحديث حالة الطاولات المشغولة
      const occupiedTableIds = allOrders
        .filter(o => o.table_id && ['pending', 'preparing', 'ready'].includes(o.status))
        .map(o => String(o.table_id));
      
      if (occupiedTableIds.length > 0) {
        setTables(prevTables => prevTables.map(table => {
          if (occupiedTableIds.includes(String(table.id))) {
            const order = allOrders.find(o => String(o.table_id) === String(table.id) && ['pending', 'preparing', 'ready'].includes(o.status));
            if (table.status !== 'occupied') {
              console.log('🔴 Updating table', table.number, 'to occupied');
            }
            return { ...table, status: 'occupied', current_order_id: order?.id || order?.offline_id };
          }
          // إذا كانت الطاولة مشغولة سابقاً ولا يوجد عليها طلب الآن
          if (table.status === 'occupied' && !occupiedTableIds.includes(String(table.id))) {
            return { ...table, status: 'available', current_order_id: null };
          }
          return table;
        }));
      }
      
      // إشعار صوتي للطلبات الجديدة
      if (prevOrdersCount.current > 0 && allOrders.length > prevOrdersCount.current) {
        playSuccess();
        toast.success(t('طلب جديد!'), { duration: 5000 });
      }
      prevOrdersCount.current = allOrders.length;
      
      setPendingOrders(allOrders);
    } catch (error) {
      console.error('Failed to fetch pending orders:', error);
      
      // في حالة فشل الاتصال، جلب الطلبات المحلية
      try {
        const localOrders = await offlineStorage.getTodayOrders();
        const activeBranchId = getBranchIdForApi() || user?.branch_id;
        const pendingLocal = localOrders.filter(o => 
          (o.status === 'pending' || o.status === 'preparing' || o.status === 'ready' || !o.is_synced) &&
          (!activeBranchId || activeBranchId === 'all' || o.branch_id === activeBranchId)
        );
        setPendingOrders(pendingLocal);
      } catch (localError) {
        console.error('Failed to fetch local orders:', localError);
      }
    }
  };

  // تحميل طلب موجود للتعديل
  const loadOrderForEditing = async (orderIdOrOrder) => {
    try {
      let order = null;
      
      // إذا تم تمرير الطلب كـ object مباشرة، استخدمه
      if (typeof orderIdOrOrder === 'object' && orderIdOrOrder !== null) {
        order = orderIdOrOrder;
        console.log('✅ تم تحميل الطلب مباشرة:', order.id || order.offline_id);
      } else {
        // البحث عن الطلب بالـ ID
        const orderId = orderIdOrOrder;
        console.log('🔍 محاولة تحميل الطلب:', orderId);
        
        // البحث في الطلبات المعلقة الموجودة في الـ state أولاً
        const allPendingOrders = [...pendingDineInOrders, ...pendingTakeawayOrders, ...pendingDeliveryOrders];
        order = allPendingOrders.find(o => 
          o.id === orderId || 
          o.offline_id === orderId ||
          String(o.id) === String(orderId) ||
          String(o.offline_id) === String(orderId)
        );
        
        if (order) {
          console.log('✅ تم جلب الطلب من قائمة الطلبات المعلقة');
        }
        
        // حاول جلب الطلب من التخزين المحلي إذا لم يوجد في الـ state
        if (!order) {
          try {
            // جرب جلب كل الطلبات المحلية (ليس فقط اليوم)
            const localOrders = await offlineStorage.getTodayOrders();
            const unsyncedOrders = await offlineStorage.getUnsyncedOrders();
            const allLocalOrders = [...localOrders];
            
            // إضافة الطلبات غير المتزامنة إذا لم تكن موجودة
            for (const unsyncedOrder of unsyncedOrders) {
              if (!allLocalOrders.find(o => o.id === unsyncedOrder.id || o.offline_id === unsyncedOrder.offline_id)) {
                allLocalOrders.push(unsyncedOrder);
              }
            }
            
            console.log('📦 عدد الطلبات المحلية:', allLocalOrders.length);
            
            order = allLocalOrders.find(o => {
              const orderIdStr = String(orderId);
              const matchId = o.id === orderId || 
                o.offline_id === orderId ||
                String(o.id) === orderIdStr ||
                String(o.offline_id) === orderIdStr ||
                o.id?.toString() === orderIdStr ||
                o.offline_id?.toString() === orderIdStr;
              
              if (matchId) {
                console.log('✅ تم العثور على الطلب:', o);
              }
              return matchId;
            });
            
            if (order) {
              console.log('✅ تم جلب الطلب من التخزين المحلي');
            }
          } catch (localError) {
            console.error('Failed to fetch local order:', localError);
          }
        }
        
        // إذا لم نجد الطلب محلياً وليس في وضع Offline، حاول جلبه من الخادم
        if (!order && !isOffline) {
          try {
            const res = await axios.get(`${API}/orders/${orderId}`);
            order = res.data;
            console.log('✅ تم جلب الطلب من الخادم');
          } catch (apiError) {
            console.log('API failed:', apiError.message);
          }
        }
      }
      
      if (!order) {
        console.error('❌ الطلب غير موجود:', orderIdOrOrder);
        toast.error(t('الطلب غير موجود'));
        return;
      }
      
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
      const cartItems = (order.items || []).map(item => {
        // محاولة إيجاد اسم المنتج من قائمة المنتجات
        let productName = item.product_name || item.name;
        const product = products.find(p => p.id === item.product_id);
        
        if (!productName && item.product_id && products.length > 0) {
          productName = product?.name || product?.product_name;
        }
        
        return {
          product_id: item.product_id,
          product_name: productName || t('منتج غير معروف'),
          name: productName || t('منتج غير معروف'),
          price: item.price,
          quantity: item.quantity,
          notes: item.notes || '',
          selectedExtras: item.extras || [],
          extras: product?.extras || []
        };
      });
      setCart(cartItems);
      
      const orderNumber = order.order_number || order.offline_id || orderId;
      toast.info(`${t('تم تحميل الطلب')} #${orderNumber} ${t('للتعديل')}`);
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
      
      // طباعة أمر المرتجع للمطبخ
      try {
        const restaurantName = restaurantSettings?.name_ar || restaurantSettings?.name || '';
        const kitchenPrinters = availablePrinters.filter(p => 
          (p.print_mode === 'orders_only' || p.print_mode === 'selected_products') &&
          ((p.connection_type === 'usb' && p.usb_printer_name) || (p.connection_type !== 'usb' && p.ip_address))
        );
        if (kitchenPrinters.length > 0 && refundOrderInfo.items) {
          const refundPrintOrder = {
            order_number: refundOrderInfo.order_number,
            order_type: refundOrderInfo.order_type || 'dine_in',
            table_number: refundOrderInfo.table_number,
            is_refund: true,
            refund_label: '*** مرتجع - إلغاء ***',
            notes: `مرتجع: ${refundReason.trim()}`
          };
          const refundItems = (refundOrderInfo.items || []).map(item => ({
            ...item,
            name: `[مرتجع] ${item.product_name || item.name}`,
            product_name: `[مرتجع] ${item.product_name || item.name}`
          }));
          await printOrderToAllPrinters(refundPrintOrder, refundItems, products, kitchenPrinters, restaurantName);
        }
      } catch (printErr) {
        console.warn('Failed to print refund to kitchen:', printErr);
      }
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

  // Debug: طباعة معلومات الفلترة في console
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // مقارنة category_id بطريقة مرنة تتعامل مع أنواع البيانات المختلفة
      const matchesCategory = !selectedCategory || 
        String(p.category_id).trim() === String(selectedCategory).trim() || 
        p.category_id === selectedCategory;
      const matchesSearch = !searchQuery || 
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name_en?.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesCategory && matchesSearch && p.is_available !== false;
    });
  }, [products, selectedCategory, searchQuery]);

  const addToCart = useCallback((product) => {
    playClick();
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id && !item.selectedExtras?.length);
      if (existing) {
        return prev.map(item =>
          item.product_id === product.id && !item.selectedExtras?.length
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        product_name_en: product.name_en || product.name,
        price: product.price,
        quantity: 1,
        notes: '',
        extras: product.extras || [],
        selectedExtras: []
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

  const subtotal = cart.reduce((sum, item) => {
    const extrasTotal = (item.selectedExtras || []).reduce((extSum, ext) => extSum + (ext.price * (ext.quantity || 1)), 0);
    return sum + (item.price * item.quantity) + extrasTotal;
  }, 0);
  
  // حساب عمولة شركة التوصيل
  const selectedDeliveryApp = deliveryApps.find(a => a.id === deliveryApp);
  const commissionRate = selectedDeliveryApp?.commission_rate || 0;
  const commissionAmount = subtotal * (commissionRate / 100);
  
  // المجموع بعد الخصم والعمولة
  const totalBeforeCommission = subtotal - discount;
  const netTotal = totalBeforeCommission - commissionAmount;


  // دالة مساعدة لربط عناصر السلة بطابعاتها
  const getCartItemPrinterMap = () => {
    return cart.map((item) => {
      const product = products.find(p => p.id === item.product_id);
      const printerIds = Array.isArray(product?.printer_ids) ? product.printer_ids.filter(id => id) : [];
      const printerNames = printerIds
        .map(pid => availablePrinters.find(p => p.id === pid))
        .filter(Boolean)
        .map(p => ({ id: p.id, name: p.name }));
      // إذا لا يوجد طابعة مربوطة، استخدم الطابعة الافتراضية
      if (printerNames.length === 0) {
        const defaultKitchen = availablePrinters.find(p => p.print_mode === 'orders_only' || p.print_mode === 'selected_products');
        if (defaultKitchen) {
          printerNames.push({ id: defaultKitchen.id, name: defaultKitchen.name });
        }
      }
      return {
        ...item,
        printerNames
      };
    });
  };

  // دالة مساعدة لبناء بيانات الطباعة مع معلومات الفرع والتوصيل
  const buildPrintOrderData = (orderNumber) => {
    const currentBranch = branches?.find(b => b.id === (getBranchIdForApi() || localStorage.getItem('selectedBranchId') || user?.branch_id)) || (branches?.length ? branches[0] : null);
    const driverObj = selectedDriver ? drivers.find(d => d.id === selectedDriver) : null;
    const deliveryAppObj = deliveryApp ? deliveryApps.find(a => a.id === deliveryApp) : null;
    
    // Build logo URL for print
    const rawLogoUrl = invoiceSettings?.invoice_logo || restaurantSettings?.logo_url;
    let resolvedLogoUrl = null;
    if (rawLogoUrl) {
      if (rawLogoUrl.startsWith('http')) resolvedLogoUrl = rawLogoUrl;
      else if (rawLogoUrl.startsWith('/api')) resolvedLogoUrl = `${API}${rawLogoUrl.replace('/api', '')}`;
      else if (rawLogoUrl.startsWith('/uploads')) resolvedLogoUrl = `${API}${rawLogoUrl}`;
      else resolvedLogoUrl = rawLogoUrl;
    }

    // Build system logo URL
    const rawSysLogo = systemInvoiceSettings?.system_logo_url;
    let resolvedSysLogoUrl = null;
    if (rawSysLogo) {
      if (rawSysLogo.startsWith('http')) resolvedSysLogoUrl = rawSysLogo;
      else if (rawSysLogo.startsWith('/api')) resolvedSysLogoUrl = `${API}${rawSysLogo.replace('/api', '')}`;
      else if (rawSysLogo.startsWith('/uploads')) resolvedSysLogoUrl = `${API}${rawSysLogo}`;
      else resolvedSysLogoUrl = rawSysLogo;
    }

    return {
      restaurant_name: restaurantSettings?.name_ar || restaurantSettings?.name || '',
      branch_name: currentBranch?.name || user?.branch_name || '',
      order_number: orderNumber,
      order_type: orderType,
      customer_name: customerName || '',
      customer_phone: customerPhone || '',
      delivery_address: deliveryAddress || '',
      table_number: orderType === 'dine_in' ? (tables.find(t => t.id === selectedTable)?.number || selectedTable) : '',
      buzzer_number: buzzerNumber || '',
      discount: discount || 0,
      driver_name: driverObj?.name || '',
      delivery_company: deliveryAppObj?.name || '',
      language: localStorage.getItem('language') || 'ar',
      // Invoice settings
      phone: invoiceSettings?.phone || '',
      phone2: invoiceSettings?.phone2 || '',
      address: invoiceSettings?.address || '',
      tax_number: invoiceSettings?.tax_number || '',
      show_tax: invoiceSettings?.show_tax !== false,
      custom_header: invoiceSettings?.custom_header || '',
      custom_footer: invoiceSettings?.custom_footer || '',
      thank_you_message: invoiceSettings?.thank_you_message || '',
      system_name: systemInvoiceSettings?.system_name || 'Maestro EGP',
      contact_message: 'للتواصل معنا لشراء نسخة امسح الكود',
      qr_url: `${window.location.origin}/contact`,
      // Logo data for receipt bitmap
      logo_base64: logoBase64 || null,
      logo_url: resolvedLogoUrl,
      system_logo_base64: sysLogoBase64 || null,
      system_logo_url: resolvedSysLogoUrl,
      // ملاحظات الفاتورة (من نموذج الحفظ والإرسال)
      order_notes: orderNotes || '',
      cashier_name: user?.username || user?.name || '',
      payment_method: paymentMethod || ''
    };
  };

  // حفظ الطلب وإرسال للمطبخ (بدون دفع) - مع تحديث حالة الطباعة لكل منتج
  const handleSaveAndSendToKitchen = async () => {
    if (cart.length === 0) {
      toast.error(t('السلة فارغة'));
      return;
    }

    // إجبار اختيار طريقة الدفع
    if (!paymentMethod || paymentMethod === 'pending') {
      toast.error(t('يرجى تحديد طريقة الدفع (نقدي، آجل، أو بطاقة)'));
      return;
    }

    if (orderType === 'dine_in' && !selectedTable && !editingOrder) {
      toast.error(t('يرجى اختيار طاولة'));
      return;
    }

    // قواعد التوصيل
    if (orderType === 'delivery') {
      if (!deliveryApp && !selectedDriver) {
        toast.error(t('يرجى اختيار شركة توصيل أو سائق'));
        return;
      }
      if (selectedDriver) {
        if (!deliveryAddress) { toast.error(t('يرجى إدخال عنوان التوصيل')); return; }
        if (!customerName) { toast.error(t('يرجى إدخال اسم العميل')); return; }
        if (!customerPhone && user?.role !== 'call_center') { toast.error(t('يرجى إدخال رقم هاتف العميل')); return; }
      }
    }

    // السفري - إجبار إدخال رقم البزون
    if (orderType === 'takeaway' && !buzzerNumber) {
      toast.error(t('يرجى إدخال رقم جهاز البزون'));
      return;
    }

    // تحديد الفرع النشط في بداية الدالة (مع fallback لـ localStorage)
    const savedBranchIdForKitchen = localStorage.getItem('selectedBranchId');
    const currentBranchId = getBranchIdForApi() || savedBranchIdForKitchen || user?.branch_id;

    // تحديث حالة جميع العناصر لـ "إرسال"
    const initialStatus = {};
    cart.forEach((_, idx) => { initialStatus[idx] = 'sending'; });
    setKitchenPrintStatus(initialStatus);
    setSubmitting(true);

    try {
      // إذا كنا نعدل طلب موجود - تحديث جميع العناصر والملاحظات
      if (editingOrder) {
        const updatedItems = cart.map(item => ({
          product_id: item.product_id || item.id,
          product_name: item.product_name || item.name,
          price: item.price,
          quantity: item.quantity,
          cost: item.cost || 0,
          notes: item.notes || '',
          extras: item.selectedExtras || []
        }));
        
        await axios.put(`${API}/orders/${editingOrder.id}/update-items`, {
          items: updatedItems,
          notes: orderNotes || null,
          discount: discount || 0
        });
        
        // إرسال جميع العناصر لطابعات المطبخ (الجديدة والقديمة)
        try {
          const kitchenPrinters = availablePrinters.filter(p => 
            (p.print_mode === 'orders_only' || p.print_mode === 'selected_products') &&
            ((p.connection_type === 'usb' && p.usb_printer_name) || (p.connection_type !== 'usb' && p.ip_address))
          );
          if (kitchenPrinters.length > 0) {
            const restaurantName = restaurantSettings?.name_ar || restaurantSettings?.name || '';
            const orderForPrint = buildPrintOrderData(editingOrder.order_number);
            // إرسال جميع العناصر في السلة للمطبخ (ليس فقط الجديدة)
            const itemsForPrint = cart.map(item => ({
              product_id: item.product_id || item.id,
              product_name: item.product_name || item.name,
              name: item.product_name || item.name,
              price: item.price,
              quantity: item.quantity,
              notes: item.notes || '',
              extras: item.selectedExtras || []
            }));
            console.log('[Kitchen Print] Edit mode: sending ALL', itemsForPrint.length, 'items to', kitchenPrinters.length, 'printers');
            const result = await printOrderToAllPrinters(orderForPrint, itemsForPrint, products, kitchenPrinters, restaurantName);
            
            // تحديث حالة كل عنصر حسب نتيجة الطباعة الفعلية
            const updatedStatus = {};
            cart.forEach((item, idx) => {
              const product = products.find(p => p.id === item.product_id);
              const pIds = product?.printer_ids?.filter(id => id) || [];
              const hasPrinterResult = result.results?.some(r => pIds.includes(r.printer_id) && r.success);
              const allDefaultSuccess = pIds.length === 0 && result.results?.length > 0 && result.success;
              updatedStatus[idx] = (hasPrinterResult || allDefaultSuccess) ? 'success' : 'error';
            });
            setKitchenPrintStatus(updatedStatus);
            
            if (!result.success) {
              result.results?.filter(r => !r.success).forEach(f => {
                toast.error(`${f.printer_name}: ${f.message}`);
              });
            }
          } else {
            console.warn('[Kitchen Print] No kitchen printers configured!');
            toast.error(t('لا توجد طابعات مطبخ مفعّلة'));
            const errorStatus = {};
            cart.forEach((_, idx) => { errorStatus[idx] = 'error'; });
            setKitchenPrintStatus(errorStatus);
          }
        } catch (printErr) {
          console.error('Kitchen print error for edit:', printErr);
          const errorStatus = {};
          cart.forEach((_, idx) => { errorStatus[idx] = 'error'; });
          setKitchenPrintStatus(errorStatus);
          toast.error(t('خطأ في طباعة المطبخ: ') + printErr.message);
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
          items: cart.map(item => ({
            product_id: item.product_id || item.id,
            product_name: item.product_name || item.name,
            price: item.price,
            quantity: item.quantity,
            cost: item.cost || 0,
            notes: item.notes || '',
            extras: item.selectedExtras || []
          })),
          branch_id: currentBranchId || (await axios.get(`${API}/branches`)).data[0]?.id,
          payment_method: paymentMethod,  // حفظ طريقة الدفع المختارة
          discount: discount,
          delivery_app: orderType === 'delivery' ? deliveryApp : null,
          delivery_app_name: orderType === 'delivery' && deliveryApp ? (deliveryApps.find(a => a.id === deliveryApp)?.name || '') : null,
          driver_id: orderType === 'delivery' ? selectedDriver : null,
          notes: orderNotes,
          auto_ready: isDeliveryOrder  // معلق للسفري والطاولات، جاهز للتوصيل فقط
        };
        
        const res = await axios.post(`${API}/orders`, orderData);
        playSuccess();
        
        // === إرسال الطلبات لطابعات المطبخ مباشرة (بدون checkAgentStatus) ===
        try {
          const kitchenPrinters = availablePrinters.filter(p => 
            (p.print_mode === 'orders_only' || p.print_mode === 'selected_products') &&
            ((p.connection_type === 'usb' && p.usb_printer_name) || (p.connection_type !== 'usb' && p.ip_address))
          );
          if (kitchenPrinters.length > 0) {
            const restaurantName = restaurantSettings?.name_ar || restaurantSettings?.name || '';
            const orderForPrint = buildPrintOrderData(res.data.order_number);
            const itemsForPrint = cart.map(item => ({
              product_id: item.product_id || item.id,
              product_name: item.product_name || item.name,
              name: item.product_name || item.name,
              price: item.price,
              quantity: item.quantity,
              notes: item.notes || '',
              extras: item.selectedExtras || []
            }));
            console.log('[Kitchen Print] New order: sending', itemsForPrint.length, 'items to', kitchenPrinters.length, 'printers');
            const result = await printOrderToAllPrinters(orderForPrint, itemsForPrint, products, kitchenPrinters, restaurantName);
            
            // تحديث حالة كل عنصر حسب نتيجة الطباعة الفعلية
            const updatedStatus = {};
            cart.forEach((item, idx) => {
              const product = products.find(p => p.id === item.product_id);
              const pIds = product?.printer_ids?.filter(id => id) || [];
              const hasPrinterResult = result.results?.some(r => pIds.includes(r.printer_id) && r.success);
              const allDefaultSuccess = pIds.length === 0 && result.results?.length > 0 && result.success;
              updatedStatus[idx] = (hasPrinterResult || allDefaultSuccess) ? 'success' : 'error';
            });
            setKitchenPrintStatus(updatedStatus);
            
            if (!result.success) {
              result.results?.filter(r => !r.success).forEach(f => {
                toast.error(`${f.printer_name}: ${f.message}`);
              });
            }
          } else {
            console.warn('[Kitchen Print] No kitchen printers configured!');
            toast.error(t('لا توجد طابعات مطبخ مفعّلة'));
            const errorStatus = {};
            cart.forEach((_, idx) => { errorStatus[idx] = 'error'; });
            setKitchenPrintStatus(errorStatus);
          }
        } catch (printErr) {
          console.error('Kitchen print error:', printErr);
          const errorStatus = {};
          cart.forEach((_, idx) => { errorStatus[idx] = 'error'; });
          setKitchenPrintStatus(errorStatus);
          toast.error(t('خطأ في طباعة المطبخ: ') + printErr.message);
        }
        
        // إذا كان طلب توصيل مع سائق، نعين السائق مباشرة
        if (orderType === 'delivery' && selectedDriver) {
          await axios.put(`${API}/drivers/${selectedDriver}/assign?order_id=${res.data.id}`);
          toast.success(`${t('تم إنشاء الطلب')} #${res.data.order_number} ${t('وتحويله للسائق')}`);
        } else {
          toast.success(`${t('تم إنشاء الطلب')} #${res.data.order_number}`);
        }
        
        // طباعة فاتورة الكاشير USB مع حالة "غير مدفوعة"
        try {
          let cashierPrinter = availablePrinters.find(p => p.print_mode === 'full_receipt');
          if (!cashierPrinter) cashierPrinter = availablePrinters.find(p => p.connection_type === 'usb' && p.usb_printer_name);
          if (cashierPrinter) {
            const subtotalCalc = cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0);
            const orderForReceipt = buildPrintOrderData(res.data.order_number);
            const cashierOrderData = {
              ...orderForReceipt,
              items: cart.map(item => ({
                product_id: item.product_id || item.id,
                product_name: item.product_name || item.name,
                name: item.product_name || item.name,
                price: item.price,
                quantity: item.quantity,
                notes: item.notes || '',
                extras: item.selectedExtras || []
              })),
              total: subtotalCalc - (discount || 0),
              subtotal: subtotalCalc,
              payment_method: paymentMethod || '',
              cashier_name: user?.name || user?.full_name || '',
              is_paid: false
            };
            await sendReceiptPrint(cashierPrinter, cashierOrderData);
          }
        } catch (receiptErr) {
          console.error('Receipt print error:', receiptErr);
        }
      }
      
      setSubmitting(false);
      
      // إبقاء القائمة مفتوحة 30 ثانية لعرض حالة الطباعة ثم إغلاق
      setTimeout(() => {
        setKitchenDialogOpen(false);
        setKitchenPrintStatus({});
        clearCart();
      }, 30000);
      
      // تحديث في الخلفية
      fetchPendingOrders();
      
      // تحديث الطاولات إذا كان طلب داخلي
      if (orderType === 'dine_in') {
        const tablesParams = currentBranchId ? { branch_id: currentBranchId } : {};
        const tablesRes = await axios.get(`${API}/tables`, { params: tablesParams });
        setTables(tablesRes.data);
      }
    } catch (error) {
      console.error('Failed to save order:', error);
      
      // إذا كان خطأ شبكة، حفظ الطلب محلياً
      if (!error.response) {
        console.log('🔄 Network error, saving kitchen order offline...');
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
              notes: item.notes || '',
              extras: item.selectedExtras || []
            })),
            subtotal: cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0),
            total: cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0) - discount,
            discount: discount,
            branch_id: currentBranchId,
            payment_method: 'pending',
            delivery_app: orderType === 'delivery' ? deliveryApp : null,
            delivery_app_name: orderType === 'delivery' && deliveryApp ? (deliveryApps.find(a => a.id === deliveryApp)?.name || '') : null,
            driver_id: selectedDriver || null,
            notes: orderNotes,
            status: 'pending',
            cashier_id: user?.id,
            cashier_name: user?.name || user?.full_name
          };
          
          const savedOrder = await offlineStorage.saveOfflineOrder(offlineOrder);
          
          // تحديث حالة الطاولة محلياً إذا كان الطلب داخلي
          if (orderType === 'dine_in' && selectedTable) {
            try {
              await offlineStorage.saveOfflineTableUpdate(selectedTable, {
                status: 'occupied',
                current_order_id: savedOrder.id || savedOrder.offline_id
              });
              
              setTables(prevTables => prevTables.map(t => {
                if (String(t.id) === String(selectedTable)) {
                  return { ...t, status: 'occupied', current_order_id: savedOrder.id || savedOrder.offline_id };
                }
                return t;
              }));
            } catch (tableError) {
              console.error('Failed to update table:', tableError);
            }
          }
          
          playSuccess();
          toast.success(
            <div>
              <div>✅ {t('تم حفظ الطلب محلياً')}</div>
              <div className="text-sm opacity-80">#{savedOrder.offline_id}</div>
              <div className="text-xs opacity-60">{t('سيتم رفعه عند عودة الاتصال')}</div>
            </div>,
            { duration: 5000 }
          );
          
          setKitchenDialogOpen(false);
          clearCart();
          await updateSyncStatus();
          
          // تحديث عداد الفرع
          const branchId = getBranchIdForApi() || user?.branch_id;
          if (updatePendingCount && branchId) {
            updatePendingCount(branchId, 1);
          }
          
          // إضافة الطلب مباشرة للـ pendingOrders state
          setPendingOrders(prev => {
            const exists = prev.some(o => o.id === savedOrder.id || o.offline_id === savedOrder.offline_id);
            if (exists) return prev;
            return [savedOrder, ...prev];
          });
          
          return;
        } catch (offlineError) {
          console.error('Failed to save offline order:', offlineError);
        }
      }
      
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

    // ============ قواعد الدفع الجديدة ============
    
    // 0. إجبار اختيار الفرع للسفري والتوصيل
    const savedBranchIdCheck = localStorage.getItem('selectedBranchId');
    const currentBranchIdCheck = getBranchIdForApi() || savedBranchIdCheck || user?.branch_id;
    
    if ((orderType === 'takeaway' || orderType === 'delivery') && !currentBranchIdCheck) {
      toast.error(t('يرجى اختيار الفرع أولاً'));
      return;
    }
    
    // 1. إجبار تحديد طريقة الدفع
    if (!paymentMethod || paymentMethod === 'pending') {
      toast.error(t('يرجى تحديد طريقة الدفع (نقدي، آجل، أو بطاقة)'));
      return;
    }

    // 2. قواعد التوصيل - يجب اختيار شركة توصيل أو سائق
    if (orderType === 'delivery') {
      if (!deliveryApp && !selectedDriver) {
        toast.error(t('يرجى اختيار شركة توصيل أو سائق'));
        return;
      }
      
      // عند اختيار سائق - إجبار إدخال بيانات العميل
      if (selectedDriver) {
        if (!deliveryAddress) {
          toast.error(t('يرجى إدخال عنوان التوصيل'));
          return;
        }
        if (!customerName) {
          toast.error(t('يرجى إدخال اسم العميل'));
          return;
        }
        // الكاشير يجب أن يدخل رقم الهاتف (الكول سنتر يدخله تلقائياً)
        if (!customerPhone && user?.role !== 'call_center') {
          toast.error(t('يرجى إدخال رقم هاتف العميل'));
          return;
        }
      }
    }

    // 3. السفري - إجبار إدخال رقم البزون
    if (orderType === 'takeaway') {
      if (!buzzerNumber) {
        toast.error(t('يرجى إدخال رقم جهاز البزون'));
        return;
      }
    }

    // ============ نهاية قواعد الدفع ============

    // تحديد الفرع النشط في بداية الدالة (مع fallback لـ localStorage)
    const savedBranchIdForSubmit = localStorage.getItem('selectedBranchId');
    const currentBranchId = getBranchIdForApi() || savedBranchIdForSubmit || user?.branch_id;
    console.log('📍 Branch ID for order:', currentBranchId);

    setSubmitting(true);
    
    // دالة مساعدة لحفظ الطلب محلياً
    const saveOrderOffline = async () => {
      // جلب رقم الطاولة من قائمة الطاولات
      const selectedTableObj = tables.find(t => t.id === selectedTable);
      const tableNumber = selectedTableObj?.number;
      
      const offlineOrder = {
        order_type: orderType,
        table_id: orderType === 'dine_in' ? selectedTable : null,
        table_number: orderType === 'dine_in' ? tableNumber : null,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: orderType === 'delivery' ? deliveryAddress : null,
        buzzer_number: orderType === 'takeaway' ? buzzerNumber : null,
        items: cart.map(item => ({
          product_id: item.product_id || item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          notes: item.notes || '',
          extras: item.selectedExtras || []
        })),
        subtotal: cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0),
        total: cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0) - discount,
        discount: discount,
        discount_type: discountType,
        discount_value: discount,
        tax: 0,
        branch_id: currentBranchId,
        payment_method: paymentMethod,
        delivery_app: orderType === 'delivery' ? deliveryApp : null,
        delivery_app_name: orderType === 'delivery' && deliveryApp ? (deliveryApps.find(a => a.id === deliveryApp)?.name || '') : null,
        driver_id: selectedDriver || null,
        notes: orderNotes,
        status: 'pending',
        cashier_id: user?.id,
        cashier_name: user?.name || user?.full_name
      };

      const savedOrder = await offlineStorage.saveOfflineOrder(offlineOrder);
      
      // تحديث حالة الطاولة محلياً إذا كان الطلب داخلي
      if (orderType === 'dine_in' && selectedTable) {
        try {
          // تحديث الطاولة في IndexedDB
          await offlineStorage.saveOfflineTableUpdate(selectedTable, {
            status: 'occupied',
            current_order_id: savedOrder.id || savedOrder.offline_id
          });
          
          // تحديث الطاولة في الـ state المحلي مباشرة
          setTables(prevTables => prevTables.map(t => {
            const tableId = String(t.id);
            const targetId = String(selectedTable);
            if (tableId === targetId) {
              console.log('🔴 تحديث الطاولة للحالة مشغولة:', t.id);
              return { ...t, status: 'occupied', current_order_id: savedOrder.id || savedOrder.offline_id };
            }
            return t;
          }));
        } catch (tableError) {
          console.error('Failed to update table status locally:', tableError);
        }
      }
      
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
      
      // تحديث عداد الطلبات المعلقة على الفرع فوراً
      if (updatePendingCount && currentBranchId) {
        updatePendingCount(currentBranchId, 1);
      }
      refreshPendingCounts(); // تحديث شامل
      
      // إضافة الطلب مباشرة للـ pendingOrders state بدون انتظار fetchPendingOrders
      setPendingOrders(prev => {
        // تأكد من عدم التكرار
        const exists = prev.some(o => o.id === savedOrder.id || o.offline_id === savedOrder.offline_id);
        if (exists) return prev;
        console.log('📦 إضافة الطلب للطلبات المعلقة:', savedOrder.offline_id);
        return [savedOrder, ...prev];
      });
      
      // تحديث الطلبات المعلقة (كـ backup)
      setTimeout(() => fetchPendingOrders(), 500);
      
      return savedOrder;
    };
    
    // === التحقق من الاتصال وحفظ الطلب ===
    // إذا كنا في وضع Offline المعروف
    if (isOffline) {
      try {
        await saveOrderOffline();
      } catch (error) {
        console.error('Failed to save offline order:', error);
        toast.error(t('فشل في حفظ الطلب محلياً'));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    
    // === محاولة الإرسال Online مع fallback لـ Offline ===
    try {
      let orderNumber = '';
      let orderId = '';
      
      if (editingOrder) {
        // تحديث الطلب الموجود
        orderId = editingOrder.id;
        orderNumber = editingOrder.order_number;
        
        // تحديث جميع عناصر الطلب والملاحظات
        const updatedItems = cart.map(item => ({
          product_id: item.product_id || item.id,
          product_name: item.product_name || item.name,
          price: item.price,
          quantity: item.quantity,
          cost: item.cost || 0,
          notes: item.notes || '',
          extras: item.selectedExtras || []
        }));
        
        await axios.put(`${API}/orders/${editingOrder.id}/update-items`, {
          items: updatedItems,
          notes: orderNotes || null,
          discount: discount || 0
        });
      } else {
        // إنشاء طلب جديد أولاً
        const orderData = {
          order_type: orderType,
          table_id: orderType === 'dine_in' ? selectedTable : null,
          customer_name: customerName,
          customer_phone: customerPhone,
          delivery_address: orderType === 'delivery' ? deliveryAddress : null,
          buzzer_number: orderType === 'takeaway' ? buzzerNumber : null,
          items: cart.map(item => ({
            product_id: item.product_id || item.id,
            product_name: item.product_name || item.name,
            price: item.price,
            quantity: item.quantity,
            cost: item.cost || 0,
            notes: item.notes || '',
            extras: item.selectedExtras || []
          })),
          branch_id: currentBranchId || (await axios.get(`${API}/branches`)).data[0]?.id,
          payment_method: paymentMethod,
          discount: discount,
          delivery_app: orderType === 'delivery' ? deliveryApp : null,
          delivery_app_name: orderType === 'delivery' && deliveryApp ? (deliveryApps.find(a => a.id === deliveryApp)?.name || '') : null,
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
          total_amount: res.data.total_amount || cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0),
          items: cart.map(item => ({
            ...item,
            extras: item.selectedExtras || []
          })),
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
      
      // === طباعة الفاتورة على الكاشير وإرسال الطلبات للمطبخ ===
      try {
          const restaurantName = restaurantSettings?.name_ar || restaurantSettings?.name || '';
          const orderForPrint = buildPrintOrderData(orderNumber);
          const itemsForPrint = cart.map(item => ({
            product_id: item.product_id || item.id,
            product_name: item.product_name || item.name,
            name: item.product_name || item.name,
            price: item.price,
            quantity: item.quantity,
            notes: item.notes || '',
            extras: item.selectedExtras || []
          }));
          
          // 1. طباعة الفاتورة على طابعة الكاشير USB فقط
          let cashierPrinter = availablePrinters.find(p => p.print_mode === 'full_receipt');
          if (!cashierPrinter) cashierPrinter = availablePrinters.find(p => p.connection_type === 'usb' && p.usb_printer_name);
          console.log('[Submit] Cashier printer:', cashierPrinter?.name || 'NOT FOUND', 'Total printers:', availablePrinters.length);
          if (cashierPrinter) {
            const subtotalCalc = cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0);
            const cashierOrderData = {
              ...orderForPrint,
              items: itemsForPrint,
              total: subtotalCalc - (discount || 0),
              subtotal: subtotalCalc,
              payment_method: paymentMethod || '',
              cashier_name: user?.name || user?.full_name || '',
              is_paid: true
            };
            const cashierResult = await sendReceiptPrint(cashierPrinter, cashierOrderData);
            if (!cashierResult.success) {
              toast.error(t('فشل طباعة فاتورة الكاشير: ') + (cashierResult.message || ''));
            }
          }
          
          // 2. إرسال الطلبات لطابعات المطبخ حسب ربط المنتجات
          // فقط للطلبات الجديدة - لا نرسل للمطبخ مرة ثانية عند الدفع لطلب موجود
          if (!editingOrder) {
            const kitchenPrinters = availablePrinters.filter(p => 
              (p.print_mode === 'orders_only' || p.print_mode === 'selected_products') &&
              ((p.connection_type === 'usb' && p.usb_printer_name) || (p.connection_type !== 'usb' && p.ip_address))
            );
            if (kitchenPrinters.length > 0) {
              const kitchenResult = await printOrderToAllPrinters(orderForPrint, itemsForPrint, products, kitchenPrinters, restaurantName);
              if (!kitchenResult.success) {
                toast.error(t('فشل طباعة طلبات المطبخ'));
                kitchenResult.results?.filter(r => !r.success).forEach(f => {
                  toast.error(`${f.printer_name}: ${f.message}`);
                });
              }
            }
          }
      } catch (printErr) {
        console.error('Print error:', printErr);
        toast.error(t('خطأ في الطباعة: ') + printErr.message);
      }
      
      // رسالة مناسبة حسب نوع الطلب
      if (orderType === 'dine_in') {
        toast.success(`${t('تم إتمام الطلب')} #${orderNumber} ${t('وإغلاق الطاولة')}`);
      } else if (orderType === 'takeaway') {
        toast.success(`${t('تم إتمام الطلب السفري')} #${orderNumber}`);
      } else {
        toast.success(`${t('تم إتمام طلب التوصيل')} #${orderNumber}`);
      }
      
      // تنظيف وتحديث
      clearCart();
      await fetchPendingOrders();
      
      // تحديث عدد الطلبات المعلقة على dropdown الفروع فوراً
      refreshPendingCounts();
      
      // تحديث الطاولات
      const tablesParams = currentBranchId ? { branch_id: currentBranchId } : {};
      const tablesRes = await axios.get(`${API}/tables`, { params: tablesParams });
      setTables(tablesRes.data);
    } catch (error) {
      console.error('Failed to submit order:', error);
      
      // إذا كان خطأ شبكة (لا يوجد response)، حفظ الطلب محلياً
      if (!error.response) {
        console.log('🔄 Network error detected, saving order offline...');
        try {
          await saveOrderOffline();
          return; // تم الحفظ بنجاح محلياً
        } catch (offlineError) {
          console.error('Failed to save offline order:', offlineError);
          toast.error(t('فشل في حفظ الطلب محلياً'));
          return;
        }
      }
      
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
          notes: item.notes || '',
          extras: item.selectedExtras || []
        })),
        order_type: orderType,
        table_id: orderType === 'dine_in' ? selectedTable : null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        delivery_address: deliveryAddress || null,
        buzzer_number: buzzerNumber || null,
        driver_id: orderType === 'delivery' && selectedDriver ? selectedDriver : null,
        delivery_app: orderType === 'delivery' && deliveryApp ? deliveryApp : null,
        delivery_app_name: orderType === 'delivery' && deliveryApp ? (deliveryApps.find(a => a.id === deliveryApp)?.name || '') : null,
        discount: discount || 0,
        branch_id: currentBranchId,
        payment_method: paymentMethod || 'pending',
        notes: orderNotes || null,
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
        total_amount: savedOrder.total_amount || cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0),
        items: cart.map(item => ({
          ...item,
          extras: item.selectedExtras || []
        })),
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
      toast.success(`${t('تم حفظ الطلب')} #${savedOrder.order_number}`);
      
      // فتح معاينة الفاتورة
      setPrintDialogOpen(true);
      
      // === طباعة تلقائية فورية عند فتح المعاينة (قبل الدفع) ===
      try {
        // نطبع مباشرة بدون checkAgentStatus لسرعة أكبر
        let cashierPrinter = availablePrinters.find(p => p.print_mode === 'full_receipt');
        if (!cashierPrinter) cashierPrinter = availablePrinters.find(p => p.connection_type === 'usb' && p.usb_printer_name);
        if (!cashierPrinter && availablePrinters.length > 0) cashierPrinter = availablePrinters[0];
        
        if (cashierPrinter) {
          const printData = buildPrintOrderData(savedOrder.order_number);
          const subtotalCalc = cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0);
          const orderForPrint = {
            ...printData,
            items: cart.map(item => ({
              product_name: item.product_name || item.name,
              name: item.product_name || item.name,
              price: item.price,
              quantity: item.quantity,
              notes: item.notes || '',
              extras: item.selectedExtras || []
            })),
            total: subtotalCalc - (discount || 0),
            subtotal: subtotalCalc,
            payment_method: 'pending',
            cashier_name: user?.name || user?.full_name || ''
          };
          console.log('[AutoPrint] Printing receipt #' + savedOrder.order_number);
          const printResult = await sendReceiptPrint(cashierPrinter, orderForPrint);
          if (!printResult.success) {
            console.error('[AutoPrint] Failed:', printResult.message);
          }
        }
      } catch (autoPrintErr) {
        console.error('[AutoPrint] Error:', autoPrintErr);
      }
      
    } catch (error) {
      console.error('Failed to save order:', error);
      
      // إذا كان خطأ شبكة، حفظ الطلب محلياً
      if (!error.response) {
        console.log('🔄 Network error, saving order offline for printing...');
        try {
          const currentBranchId = getBranchIdForApi() || user?.branch_id;
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
              notes: item.notes || '',
              extras: item.selectedExtras || []
            })),
            subtotal: cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0),
            total: cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0) - discount,
            discount: discount,
            branch_id: currentBranchId,
            payment_method: 'pending',
            cashier_id: user?.id,
            cashier_name: user?.name || user?.full_name
          };
          
          const savedOrder = await offlineStorage.saveOfflineOrder(offlineOrder);
          setLastOrderNumber(savedOrder.offline_id);
          
          playSuccess();
          toast.success(
            <div>
              <div>✅ {t('تم حفظ الطلب محلياً')}</div>
              <div className="text-sm opacity-80">#{savedOrder.offline_id}</div>
            </div>,
            { duration: 3000 }
          );
          
          // فتح نافذة الطباعة
          setPrintDialogOpen(true);
          return;
        } catch (offlineError) {
          console.error('Failed to save offline order:', offlineError);
        }
      }
      
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
    const savedBranchId = localStorage.getItem('selectedBranchId');
    const effectiveBranchId = currentBranchId || savedBranchId;
    
    setSubmitting(true);
    try {
      // في وضع Offline أو إذا كان الطلب محلي
      const isLocalOrder = editingOrder.offline_id && !editingOrder.is_synced;
      
      if (isOffline || isLocalOrder) {
        // حذف الطلب من التخزين المحلي
        try {
          const orderId = editingOrder.id || editingOrder.offline_id;
          await offlineStorage.deleteOfflineOrder(orderId);
          
          // تحديث حالة الطاولة محلياً
          if (editingOrder.table_id) {
            await offlineStorage.saveOfflineTableUpdate(editingOrder.table_id, {
              status: 'available',
              current_order_id: null
            });
            
            // تحديث الطاولة في الـ state
            setTables(prevTables => prevTables.map(t => 
              t.id === editingOrder.table_id || String(t.id) === String(editingOrder.table_id)
                ? { ...t, status: 'available', current_order_id: null }
                : t
            ));
          }
          
          playSuccess();
          toast.success(t('تم إلغاء الطلب'));
          clearCart();
          
          // تحديث الطلبات المعلقة من IndexedDB مباشرة
          const localOrders = await offlineStorage.getTodayOrders();
          console.log('📦 الطلبات المحلية بعد الحذف:', localOrders.length);
          
          const pendingLocal = localOrders.filter(o => 
            ['pending', 'preparing', 'ready'].includes(o.status) &&
            String(o.id) !== String(orderId) && 
            String(o.offline_id) !== String(orderId)
          );
          console.log('📋 الطلبات المعلقة المتبقية:', pendingLocal.length);
          setPendingOrders(pendingLocal);
          
          // تحديث عداد الطلبات على الفرع فوراً (-1)
          if (updatePendingCount && editingOrder.branch_id) {
            updatePendingCount(editingOrder.branch_id, -1);
          }
          
          return;
        } catch (localError) {
          console.error('Failed to delete local order:', localError);
          toast.error(t('فشل في حذف الطلب المحلي'));
          return;
        }
      }
      
      // وضع Online
      const res = await axios.put(`${API}/orders/${editingOrder.id}/cancel`);
      playSuccess();
      toast.success(res.data.was_quick_cancel 
        ? t('تم إلغاء الطلب (إلغاء سريع)') 
        : t('تم إلغاء الطلب')
      );
      
      // طباعة أمر الحذف للمطبخ
      try {
        const restaurantName = restaurantSettings?.name_ar || restaurantSettings?.name || '';
        const kitchenPrinters = availablePrinters.filter(p => 
          (p.print_mode === 'orders_only' || p.print_mode === 'selected_products') &&
          ((p.connection_type === 'usb' && p.usb_printer_name) || (p.connection_type !== 'usb' && p.ip_address))
        );
        if (kitchenPrinters.length > 0 && editingOrder.items?.length > 0) {
          const cancelPrintOrder = {
            order_number: editingOrder.order_number,
            order_type: editingOrder.order_type || 'dine_in',
            table_number: editingOrder.table_number,
            is_cancel: true,
            notes: '*** تم إلغاء الطلب بالكامل ***'
          };
          const cancelItems = (editingOrder.items || []).map(item => ({
            ...item,
            name: `[تم حذف] ${item.product_name || item.name}`,
            product_name: `[تم حذف] ${item.product_name || item.name}`
          }));
          await printOrderToAllPrinters(cancelPrintOrder, cancelItems, products, kitchenPrinters, restaurantName);
        }
      } catch (printErr) {
        console.warn('Failed to print cancellation to kitchen:', printErr);
      }
      
      clearCart();
      
      // تحديث عداد الطلبات على الفرع فوراً (-1)
      if (updatePendingCount && editingOrder.branch_id) {
        updatePendingCount(editingOrder.branch_id, -1);
      }
      
      await fetchPendingOrders();
      
      // تحديث الطاولات
      const tablesParams = effectiveBranchId ? { branch_id: effectiveBranchId } : {};
      const tablesRes = await axios.get(`${API}/tables`, { params: tablesParams });
      setTables(tablesRes.data);
    } catch (error) {
      console.error('Failed to cancel order:', error);
      
      // إذا فشل الـ API، حاول الحذف محلياً
      if (!error.response) {
        try {
          const orderId = editingOrder.id || editingOrder.offline_id;
          await offlineStorage.deleteOfflineOrder(orderId);
          
          if (editingOrder.table_id) {
            setTables(prevTables => prevTables.map(t => 
              t.id === editingOrder.table_id || String(t.id) === String(editingOrder.table_id)
                ? { ...t, status: 'available', current_order_id: null }
                : t
            ));
          }
          
          playSuccess();
          toast.success(t('تم إلغاء الطلب محلياً'));
          clearCart();
          await fetchPendingOrders();
          return;
        } catch (localError) {
          console.error('Failed to delete local order:', localError);
        }
      }
      
      toast.error(getErrorMessage(error, t('فشل في إلغاء الطلب')));
    } finally {
      setSubmitting(false);
    }
  };

  // لا نعرض شاشة التحميل أبداً إذا كان المستخدم بالفعل على الصفحة
  // فقط نعرضها في التحميل الأولي جداً للتطبيق
  const isFirstEverLoad = !sessionStorage.getItem('pos_ever_loaded');
  
  if (loading && !dataLoaded && isFirstEverLoad && categories.length === 0) {
    // علّم أن الصفحة تم تحميلها
    sessionStorage.setItem('pos_ever_loaded', 'true');
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('جاري التحميل...')}</p>
        </div>
      </div>
    );
  }
  
  // علّم أن الصفحة تم تحميلها
  if (!sessionStorage.getItem('pos_ever_loaded')) {
    sessionStorage.setItem('pos_ever_loaded', 'true');
  }

  // التحقق من وضع المعاينة (انتحال حساب من Admin)
  const isImpersonatingUser = !!localStorage.getItem('original_token') || !!localStorage.getItem('original_super_admin_token');
  
  const exitImpersonationFromPOS = () => {
    const originalSuperAdminToken = localStorage.getItem('original_super_admin_token');
    if (originalSuperAdminToken) {
      localStorage.setItem('super_admin_token', originalSuperAdminToken);
      localStorage.removeItem('original_super_admin_token');
      localStorage.removeItem('token');
      localStorage.removeItem('cached_user');
      localStorage.removeItem('impersonated');
      localStorage.removeItem('impersonated_tenant');
      localStorage.removeItem('branches');
      sessionStorage.clear();
      window.location.href = '/super-admin';
      return;
    }
    const originalUser = localStorage.getItem('original_user');
    const originalToken = localStorage.getItem('original_token');
    if (originalUser && originalToken) {
      localStorage.setItem('cached_user', originalUser);
      localStorage.setItem('token', originalToken);
      localStorage.removeItem('original_user');
      localStorage.removeItem('original_token');
      localStorage.removeItem('branches');
      sessionStorage.removeItem('user_verified');
      window.location.href = '/settings';
    }
  };

  // قبول أو رفض طلب العميل الخارجي
  const handleAcceptCustomerOrder = async (orderId) => {
    try {
      await axios.post(`${API}/notifications/accept-order/${orderId}`);
      toast.success(t('تم قبول الطلب'));
      setIncomingCustomerOrder(null);
      fetchPendingOrders();
    } catch { toast.error(t('خطأ في قبول الطلب')); }
  };
  const handleRejectCustomerOrder = async (orderId) => {
    try {
      await axios.post(`${API}/notifications/reject-order/${orderId}`);
      toast.success(t('تم رفض الطلب'));
      setIncomingCustomerOrder(null);
    } catch { toast.error(t('خطأ في رفض الطلب')); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* نافذة الطلب الوارد من تطبيق العميل */}
      {incomingCustomerOrder && (
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center" data-testid="incoming-order-modal">
          <div className="bg-background border-2 border-primary rounded-2xl p-6 w-[400px] max-w-[95vw] shadow-2xl animate-pulse-once">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Phone className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground">{t('طلب جديد من العميل')}</h2>
              <p className="text-sm text-muted-foreground mt-1">#{incomingCustomerOrder.order_number}</p>
            </div>
            
            <div className="space-y-3 mb-4">
              {incomingCustomerOrder.customer_name && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('العميل')}:</span>
                  <span className="font-medium">{incomingCustomerOrder.customer_name}</span>
                </div>
              )}
              {incomingCustomerOrder.customer_phone && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('الهاتف')}:</span>
                  <span className="font-medium" dir="ltr">{incomingCustomerOrder.customer_phone}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('نوع الطلب')}:</span>
                <span className="font-medium">{incomingCustomerOrder.order_type === 'delivery' ? t('توصيل') : t('سفري')}</span>
              </div>
              {incomingCustomerOrder.delivery_address && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('العنوان')}:</span>
                  <span className="font-medium text-xs">{incomingCustomerOrder.delivery_address}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('عدد الأصناف')}:</span>
                <span className="font-medium">{incomingCustomerOrder.items_count}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('طريقة الدفع')}:</span>
                <span className="font-medium">{
                  incomingCustomerOrder.payment_method === 'cash' ? t('نقدي') :
                  incomingCustomerOrder.payment_method === 'card' ? t('بطاقة') : 
                  incomingCustomerOrder.payment_method === 'credit' ? t('آجل') :
                  incomingCustomerOrder.payment_method || t('نقدي')
                }</span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="font-bold text-lg">{t('المجموع')}:</span>
                <span className="font-bold text-lg text-primary">{formatPrice(incomingCustomerOrder.total_amount)}</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button 
                className="flex-1 bg-red-500 hover:bg-red-600 text-white h-12 text-lg"
                onClick={() => handleRejectCustomerOrder(incomingCustomerOrder.order_id)}
                data-testid="reject-customer-order-btn"
              >
                <X className="h-5 w-5 mr-1" />
                {t('رفض')}
              </Button>
              <Button 
                className="flex-1 bg-green-500 hover:bg-green-600 text-white h-12 text-lg"
                onClick={() => handleAcceptCustomerOrder(incomingCustomerOrder.order_id)}
                data-testid="accept-customer-order-btn"
              >
                <Check className="h-5 w-5 mr-1" />
                {t('قبول')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* شريط تنبيه وضع المعاينة */}
      {isImpersonatingUser && (
        <div className="bg-amber-500 text-black px-4 py-2 text-center font-medium flex items-center justify-center gap-4 sticky top-0 z-[100]" data-testid="impersonation-banner">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            {t('أنت في وضع المعاينة كـ')} <strong>{user?.full_name || user?.username}</strong>
          </span>
          <button
            onClick={exitImpersonationFromPOS}
            className="bg-black/20 hover:bg-black/30 text-black border-0 px-3 py-1 rounded text-sm font-medium"
          >
            {t('العودة لحسابي')}
          </button>
        </div>
      )}
      <AgentUpdateBanner t={t} />
      <div className="flex-1 flex">
      {/* Categories Sidebar - Right */}
      <div className="w-56 border-l border-border bg-card flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">{t('الفئات')}</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {/* زر عرض الكل */}
            <button
              onClick={() => { setSelectedCategory(null); playClick(); }}
              className={`w-full rounded-xl overflow-hidden transition-all ${
                !selectedCategory 
                  ? 'ring-2 ring-primary ring-offset-2 scale-105' 
                  : 'hover:scale-102 hover:shadow-md'
              }`}
              data-testid="category-all"
            >
              <div className="relative h-16 bg-gradient-to-br from-blue-500/30 to-blue-600/50 flex items-center justify-center">
                <span className="text-white font-bold text-sm flex items-center gap-2">
                  <span className="text-2xl">🏪</span>
                  {t('عرض الكل')} ({products.length})
                </span>
              </div>
            </button>
            
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
                <div className="relative h-20">
                  {/* خلفية بلون أساسي - تظهر فقط إذا لا توجد صورة */}
                  {!cat.image && (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/40"></div>
                  )}
                  {/* عرض الصورة إذا موجودة */}
                  {cat.image && (
                    <img 
                      src={cat.image.startsWith('http') ? cat.image : `${BACKEND_URL}${cat.image}`} 
                      alt={cat.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        // إظهار الخلفية البديلة عند فشل تحميل الصورة
                        const parent = e.target.parentElement;
                        if (parent) {
                          const fallback = parent.querySelector('.fallback-bg');
                          if (fallback) fallback.style.display = 'flex';
                        }
                      }}
                    />
                  )}
                  {/* خلفية بديلة عند فشل تحميل الصورة */}
                  <div className="fallback-bg absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/40 items-center justify-center" style={{ display: 'none' }}>
                    <span className="text-3xl drop-shadow-lg">{cat.icon || '📦'}</span>
                  </div>
                  {/* الأيقونة في المنتصف - تظهر فقط إذا لا توجد صورة */}
                  {!cat.image && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl drop-shadow-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                        {cat.icon || '📦'}
                      </span>
                    </div>
                  )}
                  {/* طبقة الاسم السفلية */}
                  <div className={`absolute inset-0 flex items-end ${
                    selectedCategory === cat.id 
                      ? 'bg-gradient-to-t from-primary/90 to-transparent' 
                      : 'bg-gradient-to-t from-black/70 to-transparent'
                  }`}>
                    <div className="p-2 w-full">
                      <span className="text-white font-bold text-sm drop-shadow-lg flex items-center gap-1">
                        <span>{cat.icon || '📦'}</span>
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
                  <div className="relative w-full h-24 rounded-lg mb-2 overflow-hidden">
                    {/* خلفية بديلة - تظهر فقط إذا لا توجد صورة */}
                    {!product.image && (
                      <div className="absolute inset-0 bg-muted flex items-center justify-center">
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    {/* الصورة */}
                    {product.image && (
                      <img
                        src={product.image.startsWith('http') ? product.image : `${BACKEND_URL}${product.image}`}
                        alt={product.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          // إظهار الخلفية البديلة عند فشل تحميل الصورة
                          const parent = e.target.parentElement;
                          if (parent) {
                            const fallback = parent.querySelector('.product-fallback');
                            if (fallback) fallback.style.display = 'flex';
                          }
                        }}
                      />
                    )}
                    {/* خلفية بديلة عند فشل التحميل */}
                    {product.image && (
                      <div className="product-fallback absolute inset-0 bg-muted items-center justify-center" style={{ display: 'none' }}>
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <h3 className="font-medium text-sm text-foreground line-clamp-2">{getLocalizedName(product, lang)}</h3>
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
                        .sort((a, b) => (a.number || 0) - (b.number || 0))
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
                  className="p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{lang === 'en' ? (item.product_name_en || item.product_name || item.name || t('منتج')) : (item.product_name || item.name || t('منتج'))}</p>
                      <p className="text-primary text-sm tabular-nums">{formatPrice((item.price * item.quantity) + (item.selectedExtras || []).reduce((sum, ext) => sum + (ext.price * (ext.quantity || 1)), 0))}</p>
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
                  {/* زر الإضافات والملاحظات */}
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-1 text-orange-500 border-orange-500/50 hover:bg-orange-500/10"
                      onClick={() => {
                        setSelectedCartItem({ ...item, cartIndex: index });
                        setTempNotes(item.notes || '');
                        setTempSelectedExtras(item.selectedExtras || []);
                        setExtrasModalOpen(true);
                      }}
                    >
                      <Edit className="h-3 w-3 ml-1" />
                      {t('ملاحظات وإضافات')}
                      {((item.selectedExtras || []).length > 0 || item.notes) && (
                        <span className="mr-1 bg-orange-500 text-white rounded-full px-1.5 text-xs">
                          {(item.selectedExtras || []).length + (item.notes ? 1 : 0)}
                        </span>
                      )}
                    </Button>
                  </div>
                  {/* عرض الإضافات المختارة */}
                  {(item.selectedExtras || []).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {item.selectedExtras.map((ext, extIdx) => (
                        <div key={extIdx} className="flex justify-between text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">
                          <span>+ {ext.name}{(ext.quantity || 1) > 1 ? ` ×${ext.quantity}` : ''}</span>
                          <span>+{formatPrice(ext.price * (ext.quantity || 1))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* عرض الملاحظات */}
                  {item.notes && (
                    <div className="mt-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                      📝 {item.notes}
                    </div>
                  )}
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
                className={`flex-1 h-10 transition-all ${paymentMethod === method.id ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500 shadow-lg shadow-orange-500/30' : 'hover:border-orange-500/50'}`}
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
              onClick={() => { setKitchenPrintStatus({}); setKitchenDialogOpen(true); }}
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
                          loadOrderForEditing(order);
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
                          loadOrderForEditing(order);
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
                          loadOrderForEditing(order);
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

      {/* Kitchen Dialog - حفظ وإرسال للمطبخ مع عرض المنتجات وطابعاتها */}
      <Dialog open={kitchenDialogOpen} onOpenChange={(open) => {
        if (!open && !submitting) {
          setKitchenDialogOpen(false);
          setKitchenPrintStatus({});
        }
      }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <ChefHat className="h-5 w-5 text-orange-500" />
              {editingOrder ? t('تحديث الطلب وإرسال للمطبخ') : t('حفظ وإرسال للمطبخ')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
            {/* قائمة المنتجات مع طابعاتها */}
            <div className="space-y-2">
              {getCartItemPrinterMap().map((item, idx) => {
                const status = kitchenPrintStatus[idx];
                return (
                  <div key={idx} data-testid={`kitchen-item-${idx}`}
                    className={`p-3 rounded-lg border transition-all duration-500 ${
                      status === 'success' ? 'border-green-500 bg-green-500/10' :
                      status === 'error' ? 'border-red-500 bg-red-500/10' :
                      status === 'sending' ? 'border-orange-400 bg-orange-500/10' :
                      'border-border bg-muted/30'
                    }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        {status === 'success' && <Check className="h-4 w-4 text-green-500 shrink-0" />}
                        {status === 'error' && <X className="h-4 w-4 text-red-500 shrink-0" />}
                        {status === 'sending' && (
                          <svg className="animate-spin h-4 w-4 text-orange-500 shrink-0" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        )}
                        <span className="font-bold text-foreground text-sm">{item.product_name || item.name}</span>
                      </div>
                      <span className="text-xs font-bold text-muted-foreground" dir="ltr">x{item.quantity}</span>
                    </div>
                    {/* اسم الطابعة المربوطة */}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.printerNames.length > 0 ? (
                        item.printerNames.map((p, pi) => (
                          <span key={pi} data-testid={`printer-badge-${idx}-${pi}`}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-all duration-500 ${
                              status === 'success' ? 'bg-green-500 text-white' :
                              status === 'error' ? 'bg-red-500 text-white' :
                              status === 'sending' ? 'bg-orange-400 text-white animate-pulse' :
                              'bg-muted text-muted-foreground'
                            }`}>
                            <Printer className="h-3 w-3" />
                            {p.name}
                          </span>
                        ))
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                          status === 'success' ? 'bg-green-500 text-white' :
                          status === 'error' ? 'bg-red-500 text-white' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <Printer className="h-3 w-3" />
                          {t('لا توجد طابعة')}
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* الإجمالي */}
            <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-center">
              <span className="text-muted-foreground text-sm">{t('الإجمالي')}:</span>
              <span className="font-bold text-primary">{formatPrice(totalBeforeCommission)}</span>
            </div>

            {/* ملاحظات المطبخ */}
            {!Object.values(kitchenPrintStatus).some(s => s === 'success' || s === 'error') && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">{t('ملاحظات للمطبخ')}:</label>
                <Input
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder={t('ملاحظات خاصة...')}
                  className="h-10"
                  data-testid="kitchen-notes-input"
                />
              </div>
            )}

            {/* رسالة الحالة */}
            {Object.values(kitchenPrintStatus).every(s => s === 'success') && Object.keys(kitchenPrintStatus).length > 0 && (
              <div className="bg-green-500/10 p-3 rounded-lg text-sm text-green-600 text-center font-bold">
                {t('تم إرسال جميع العناصر للمطبخ بنجاح')}
              </div>
            )}

            {!Object.keys(kitchenPrintStatus).length && (
              <div className="bg-orange-500/10 p-3 rounded-lg text-sm text-orange-600">
                <p>{t('سيتم حفظ الطلب وإرساله للمطبخ للتحضير')}</p>
                <p>{t('الدفع سيتم لاحقاً عند التسليم')}</p>
              </div>
            )}
          </div>

          {/* الأزرار */}
          <div className="flex gap-2 pt-2 shrink-0 border-t border-border">
            {Object.values(kitchenPrintStatus).some(s => s === 'success' || s === 'error') ? (
              <Button 
                onClick={() => {
                  setKitchenDialogOpen(false);
                  setKitchenPrintStatus({});
                  clearCart();
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                data-testid="kitchen-close-btn"
              >
                <Check className="h-4 w-4 ml-2" />
                {t('تم')}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setKitchenDialogOpen(false)} className="flex-1"
                  disabled={submitting} data-testid="kitchen-cancel-btn">
                  {t('إلغاء')}
                </Button>
                <Button
                  onClick={handleSaveAndSendToKitchen}
                  disabled={submitting}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  data-testid="kitchen-send-btn"
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
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Bill Dialog - معاينة الفاتورة */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-sm no-print print-dialog max-h-[90vh] flex flex-col">
          <DialogHeader className="no-print shrink-0">
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Receipt className="h-5 w-5 text-blue-500" />
              {t('معاينة الفاتورة')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="overflow-y-auto flex-1 min-h-0">
          <div className="print-receipt bg-white text-black p-4 rounded-lg font-mono text-base" dir={isRTL ? 'rtl' : 'ltr'} id="receipt-to-print">
            {/* ========== أعلى الفاتورة - شعار المطعم واسمه ========== */}
            <div className="text-center mb-3 border-b border-dashed border-gray-400 pb-3">
              {/* شعار المطعم (الخاص بالعميل) - دائري */}
              {(logoBase64 || invoiceSettings.invoice_logo || restaurantSettings.logo_url) && (
                <div className="mb-2">
                  <img 
                    src={logoBase64 || (() => {
                      const logoUrl = invoiceSettings.invoice_logo || restaurantSettings.logo_url;
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
              
              {/* اسم المطعم - يجلب تلقائياً من إعدادات المطعم */}
              <h2 className="text-xl font-bold">{restaurantSettings.name_ar || restaurantSettings.name || user?.tenant_name || t('اسم المطعم')}</h2>
              
              {/* أرقام هاتف المطعم - تظهر تحت اسم المطعم مباشرة */}
              {(invoiceSettings.phone || invoiceSettings.phone2) && (
                <div className="text-xs mt-0.5" dir="ltr">
                  {invoiceSettings.phone && <span>{invoiceSettings.phone}</span>}
                  {invoiceSettings.phone && invoiceSettings.phone2 && <span> - </span>}
                  {invoiceSettings.phone2 && <span>{invoiceSettings.phone2}</span>}
                </div>
              )}
              
              {/* عنوان المطعم */}
              {invoiceSettings.address && (
                <p className="text-xs text-gray-600 mt-0.5">{invoiceSettings.address}</p>
              )}
              
              {/* اسم الفرع */}
              {(() => {
                const branchId = getBranchIdForApi() || user?.branch_id;
                const branch = branches.find(b => b.id === branchId);
                return branch?.name ? (
                  <p className="text-xs text-gray-600 mt-0.5">{branch.name}</p>
                ) : null;
              })()}
              
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
              {/* التاريخ والوقت + اسم الكاشير */}
              <p className="text-xs text-gray-500" dir="ltr">
                {new Date().toLocaleDateString('en-US')} - {new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true})}
              </p>
              {(user?.name || user?.full_name) && (
                <p className="text-xs text-gray-500">{t('الكاشير')}: {user?.full_name || user?.name}</p>
              )}
            </div>
            
            {/* معلومات الطلب - متغيرة حسب نوع الطلب */}
            <div className="border-t border-dashed border-gray-300 pt-2 mb-2 text-base">
              {/* === اسم الفرع والأرقام أولاً === */}
              {(() => {
                const branchId = getBranchIdForApi() || user?.branch_id;
                const branch = branches.find(b => b.id === branchId);
                return branch?.name ? (
                  <div className="text-center mb-1">
                    <p className="font-bold text-lg">{branch.name}</p>
                    {branch.phone && <p className="text-sm" dir="ltr">{branch.phone}</p>}
                  </div>
                ) : null;
              })()}
              
              {/* === نوع الطلب === */}
              <p className="font-bold text-center text-lg mb-1">
                {orderType === 'dine_in' ? t('طلب داخلي') 
                  : orderType === 'takeaway' ? t('طلب سفري')
                  : orderType === 'delivery' ? (deliveryApp ? t('شركة توصيل') : t('طلب توصيل'))
                  : t('طلب')}
              </p>
              
              {/* === طلب داخلي - الطاولة === */}
              {orderType === 'dine_in' && selectedTable && (
                <p className="font-bold text-center text-base">
                  {t('طاولة')}: {tables.find(t => t.id === selectedTable)?.number || selectedTable}
                </p>
              )}
              
              {/* === طلب سفري === */}
              {orderType === 'takeaway' && buzzerNumber && (
                <p className="text-center">
                  <span className="font-medium">{t('رقم الجهاز')}:</span> <span dir="ltr" className="font-bold">{buzzerNumber}</span>
                </p>
              )}
              
              {/* === طلب توصيل === */}
              {orderType === 'delivery' && (
                <div className="space-y-0.5">
                  {customerName && <p><span className="font-medium">{t('العميل')}:</span> {customerName}</p>}
                  {customerPhone && <p><span className="font-medium">{t('الهاتف')}:</span> <span dir="ltr">{customerPhone}</span></p>}
                  {deliveryAddress && <p><span className="font-medium">{t('العنوان')}:</span> {deliveryAddress}</p>}
                  {selectedDriver && drivers.length > 0 && (
                    <p><span className="font-medium">{t('السائق')}:</span> {drivers.find(d => d.id === selectedDriver)?.name || selectedDriver}</p>
                  )}
                  {deliveryApp && deliveryApps.length > 0 && (
                    <p className="font-bold"><span className="font-medium">{t('شركة التوصيل')}:</span> {deliveryApps.find(a => a.id === deliveryApp)?.name || deliveryApp}</p>
                  )}
                </div>
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
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className={`py-1 font-bold ${isRTL ? 'text-right' : 'text-left'}`}>{t('الصنف')}</th>
                    <th className="text-center py-1 font-bold">{t('الكمية')}</th>
                    <th className={`py-1 font-bold ${isRTL ? 'text-left' : 'text-right'}`}>{t('السعر')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, i) => (
                    <tr key={i}>
                      <td className="py-1 font-medium">{item.product_name || item.name || t('منتج')}</td>
                      <td className="text-center font-bold" dir="ltr">{item.quantity}</td>
                      <td className={`tabular-nums font-bold ${isRTL ? 'text-left' : 'text-right'}`} dir="ltr">{formatPrice(item.price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* ========== المجاميع ========== */}
            <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
              <div className="flex justify-between text-base">
                <span>{t('المجموع الفرعي')}:</span>
                <span className="tabular-nums font-medium" dir="ltr">{formatPrice(subtotal)}</span>
              </div>
              {/* حقل الخصم */}
              {discount > 0 && (
                <div className="flex justify-between text-base p-1 rounded text-red-600 bg-red-50">
                  <span>{t('الخصم')}:</span>
                  <span className="tabular-nums font-bold" dir="ltr">-{formatPrice(discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t-2 border-gray-400 pt-2 mt-2">
                <span>{t('الإجمالي النهائي')}:</span>
                <span className="tabular-nums" dir="ltr">{formatPrice(totalBeforeCommission)}</span>
              </div>
              {/* طريقة الدفع */}
              {paymentMethod && paymentMethod !== 'pending' && (
                <div className="flex justify-between text-base font-bold bg-gray-100 p-1.5 rounded mt-1">
                  <span>{t('طريقة الدفع')}:</span>
                  <span>{paymentMethod === 'cash' ? t('نقدي') : paymentMethod === 'credit' ? t('آجل') : paymentMethod === 'card' ? t('بطاقة') : paymentMethod === 'delivery_company' ? t('شركة توصيل') : paymentMethod}</span>
                </div>
              )}
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
                {/* شعار النظام - ثابت ومميز */}
                {systemInvoiceSettings.system_logo_url ? (
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
                    alt="system-logo"
                    data-system-logo="true"
                    className="h-10 w-10 object-contain rounded-full mb-1"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                ) : (
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-black mb-1" style={{border: '2px solid #333'}}>
                    <span className="text-white font-bold text-sm" style={{fontFamily: 'Arial, sans-serif'}}>M</span>
                  </div>
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
          </div>{/* end overflow-y-auto */}
          
          <div className="flex gap-2 no-print shrink-0 pt-2 border-t border-border">
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
              data-testid="print-receipt-btn"
              onClick={async () => {
                // === طباعة فورية بدون فحص الاتصال (أسرع) ===
                try {
                  let cashierPrinter = availablePrinters.find(p => p.print_mode === 'full_receipt');
                  if (!cashierPrinter) cashierPrinter = availablePrinters.find(p => p.connection_type === 'usb' && p.usb_printer_name);
                  if (!cashierPrinter && availablePrinters.length > 0) cashierPrinter = availablePrinters[0];
                  if (!cashierPrinter) {
                    console.error('[Print] No printers at all! availablePrinters:', availablePrinters);
                    toast.error(t('لا توجد طابعات في الإعدادات - أضف طابعة من صفحة الإعدادات'));
                    return;
                  }
                  console.log('[Print] Using printer:', cashierPrinter.name, cashierPrinter.printer_type, cashierPrinter.connection_type);
                  const printData = buildPrintOrderData(editingOrder?.order_number || lastOrderNumber || '');
                  const subtotalCalc = cart.reduce((sum, item) => sum + ((item.price * item.quantity) + (item.selectedExtras || []).reduce((s, e) => s + (e.price * (e.quantity || 1)), 0)), 0);
                  const orderForPrint = {
                    ...printData,
                    items: cart.map(item => ({
                      product_name: item.product_name || item.name,
                      name: item.product_name || item.name,
                      price: item.price,
                      quantity: item.quantity,
                      notes: item.notes || '',
                      extras: item.selectedExtras || []
                    })),
                    total: subtotalCalc - (discount || 0),
                    subtotal: subtotalCalc,
                    payment_method: paymentMethod || '',
                    cashier_name: user?.name || user?.full_name || ''
                  };
                  const result = await sendReceiptPrint(cashierPrinter, orderForPrint);
                  if (result.success) {
                    toast.success(t('تم الطباعة بنجاح'));
                    // لا نغلق الحوار ولا نمسح السلة - المستخدم يحتاج يكمل الدفع
                  } else {
                    toast.error(t('فشل الطباعة: ') + (result.message || t('خطأ غير معروف')));
                  }
                } catch (e) {
                  console.error('Print error:', e);
                  toast.error(t('خطأ في الطباعة: ') + e.message);
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
      
      {/* Modal الملاحظات والإضافات */}
      <Dialog open={extrasModalOpen} onOpenChange={setExtrasModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-orange-500" />
              {t('ملاحظات وإضافات')}
            </DialogTitle>
          </DialogHeader>
          {selectedCartItem && (
            <div className="space-y-4">
              {/* اسم المنتج مع الكمية */}
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{selectedCartItem.product_name || selectedCartItem.name}</p>
                  {selectedCartItem.quantity > 1 && (
                    <span className="bg-primary text-primary-foreground text-sm font-bold px-2.5 py-0.5 rounded-full" data-testid="extras-product-qty">
                      ×{selectedCartItem.quantity}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{formatPrice(selectedCartItem.price)}</p>
              </div>
              
              {/* الملاحظات */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t('ملاحظات')}</label>
                <Input
                  placeholder={t('مثال: بدون بصل، حار جداً...')}
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                />
              </div>
              
              {/* الإضافات المتاحة مع عدّاد الكمية */}
              {(selectedCartItem.extras || []).length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">{t('الإضافات المتاحة')}</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(selectedCartItem.extras || []).map((extra, idx) => {
                      const selectedExtra = tempSelectedExtras.find(e => e.id === extra.id);
                      const extraQty = selectedExtra?.quantity || 0;
                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                            extraQty > 0
                              ? 'bg-green-500/20 border-green-500'
                              : 'bg-muted/30 border-border'
                          }`}
                          data-testid={`extra-item-${idx}`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                              extraQty > 0 ? 'bg-green-500 text-white' : 'bg-muted border'
                            }`}>
                              {extraQty > 0 && <Check className="h-3 w-3" />}
                            </div>
                            <span className="truncate">{extra.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-green-500 font-medium text-sm ml-2">+{formatPrice(extra.price)}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 rounded-full"
                              data-testid={`extra-minus-${idx}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (extraQty <= 1) {
                                  setTempSelectedExtras(tempSelectedExtras.filter(e => e.id !== extra.id));
                                } else {
                                  setTempSelectedExtras(tempSelectedExtras.map(e => 
                                    e.id === extra.id ? { ...e, quantity: e.quantity - 1 } : e
                                  ));
                                }
                              }}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center font-bold text-sm" data-testid={`extra-qty-${idx}`}>{extraQty}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 rounded-full"
                              data-testid={`extra-plus-${idx}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (extraQty === 0) {
                                  setTempSelectedExtras([...tempSelectedExtras, { ...extra, quantity: 1 }]);
                                } else {
                                  setTempSelectedExtras(tempSelectedExtras.map(e => 
                                    e.id === extra.id ? { ...e, quantity: e.quantity + 1 } : e
                                  ));
                                }
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* ملخص السعر */}
              <div className="p-3 bg-primary/10 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span>{t('سعر المنتج')}</span>
                  <span>{formatPrice(selectedCartItem.price)}</span>
                </div>
                {tempSelectedExtras.length > 0 && (
                  <>
                    {tempSelectedExtras.map((ext, idx) => (
                      <div key={idx} className="flex justify-between text-sm text-green-500">
                        <span>+ {ext.name}{(ext.quantity || 1) > 1 ? ` ×${ext.quantity}` : ''}</span>
                        <span>+{formatPrice(ext.price * (ext.quantity || 1))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                      <span>{t('الإجمالي')}</span>
                      <span>{formatPrice(selectedCartItem.price + tempSelectedExtras.reduce((sum, e) => sum + (e.price * (e.quantity || 1)), 0))}</span>
                    </div>
                  </>
                )}
              </div>
              
              {/* أزرار الحفظ */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setExtrasModalOpen(false);
                    setSelectedCartItem(null);
                  }}
                >
                  {t('إلغاء')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setCart(prev => prev.map((item, idx) => 
                      idx === selectedCartItem.cartIndex
                        ? { ...item, notes: tempNotes, selectedExtras: tempSelectedExtras }
                        : item
                    ));
                    setExtrasModalOpen(false);
                    setSelectedCartItem(null);
                    toast.success(t('تم حفظ الإضافات والملاحظات'));
                  }}
                >
                  {t('حفظ')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>{/* end flex-1 flex wrapper */}
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
                <span className="font-bold text-foreground">
                  {order.order_number ? `#${order.order_number}` : `#${order.offline_id || order.id}`}
                </span>
                <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded">
                  {getOrderTypeLabel(order.order_type)}
                </span>
                {/* إظهار رقم الطاولة للطلبات الداخلية */}
                {order.order_type === 'dine_in' && order.table_number && (
                  <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded font-medium">
                    {t('طاولة')} #{order.table_number}
                  </span>
                )}
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
              {/* إظهار حالة المزامنة للطلبات المحلية */}
              {!order.is_synced && order.offline_id && (
                <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" />
                  {t('محفوظ محلياً - في انتظار المزامنة')}
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
