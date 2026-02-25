import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { formatPrice, formatPriceCompact } from '../utils/currency';
import { useTranslation } from '../hooks/useTranslation';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import BranchSelector from '../components/BranchSelector';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Store, 
  ShoppingCart, 
  DollarSign, 
  Users, 
  TrendingUp,
  Package,
  Truck,
  Clock,
  ChevronLeft,
  Plus,
  Settings,
  LogOut,
  Sun,
  Moon,
  LayoutGrid,
  BarChart3,
  Receipt,
  Wallet,
  Calculator,
  Check,
  X,
  Printer,
  Download,
  AlertCircle,
  CheckCircle,
  XCircle,
  Banknote,
  Crown,
  Building2,
  Headphones,
  UserCog,
  ArrowLeftRight,
  ChefHat,
  Gift,
  Star,
  CalendarDays,
  PieChart,
  GripVertical,
  Move,
  Image,
  ShoppingBag,
  Warehouse,
  Mail,
  Share2,
  Copy,
  Link,
  QrCode,
  Smartphone,
  ClipboardList,
  Target,
  AlertTriangle,
  Bell,
  Phone
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';

const API = API_URL;

// فئات النقود العراقية
const DENOMINATIONS = [
  { value: 250, label: '250', color: 'bg-gray-400' },
  { value: 500, label: '500', color: 'bg-blue-400' },
  { value: 1000, label: '1,000', color: 'bg-green-400' },
  { value: 5000, label: '5,000', color: 'bg-yellow-400' },
  { value: 10000, label: '10,000', color: 'bg-orange-400' },
  { value: 25000, label: '25,000', color: 'bg-red-400' },
  { value: 50000, label: '50,000', color: 'bg-purple-400' },
];

export default function Dashboard() {
  const { user, logout, hasRole } = useAuth();
  const { theme, setTheme, isDark } = useTheme();
  const { selectedBranchId, branches, getBranchIdForApi } = useBranch();
  const { t, lang, isRTL } = useTranslation();
  const navigate = useNavigate();
  const printRef = useRef();
  
  // دالة للتحقق من صلاحيات لوحة التحكم
  const hasDashboardPermission = (permissionId) => {
    // المدير والسوبر أدمن لديهم جميع الصلاحيات
    if (user?.role === 'admin' || user?.role === 'super_admin') return true;
    // مدير الفرع لديه معظم الصلاحيات
    if (user?.role === 'branch_manager') return true;
    
    // الإجراءات السريعة تُعرض لجميع المستخدمين المسجلين
    if (permissionId === 'dashboard_quick_actions') {
      return true;
    }
    
    // الإحصائيات: تتحقق من صلاحية view_statistics
    if (permissionId === 'dashboard_statistics') {
      // الكول سنتر والكابتن لا يرون الإحصائيات افتراضياً
      if (user?.role === 'call_center' || user?.role === 'captain') {
        // إلا إذا كانت مضافة في صلاحياتهم
        return user?.permissions?.includes('view_statistics') || false;
      }
      // باقي المستخدمين: تحقق من الصلاحية أو اسمح افتراضياً
      if (user?.permissions && user.permissions.length > 0) {
        return user.permissions.includes('view_statistics');
      }
      return true;
    }
    
    // التحقق من صلاحيات الموظف
    if (user?.permissions && user.permissions.length > 0) {
      return user.permissions.includes(permissionId);
    }
    // افتراضياً: نسمح برؤية معظم الخيارات إذا كان مسجل الدخول
    return !!user;
  };
  
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tenantInfo, setTenantInfo] = useState(null); // معلومات العميل (الشعار والاسم)
  const [statsPeriod, setStatsPeriod] = useState('today'); // today, week, month, all_time
  const [dayStatus, setDayStatus] = useState(null); // حالة اليوم
  const [showDayCloseDialog, setShowDayCloseDialog] = useState(false);
  const [closingDay, setClosingDay] = useState(false);
  const [showMenuLinkDialog, setShowMenuLinkDialog] = useState(false);
  const [menuLink, setMenuLink] = useState('');
  const [dashboardSettings, setDashboardSettings] = useState({
    showPOS: true,
    showTables: true,
    showOrders: true,
    showExpenses: true,
    showInventory: true,
    showDelivery: true,
    showReports: true,
    showRatings: true,
    showSettings: true,
    showHR: true,
    showWarehouse: true,
    showCallLogs: true,
    showKitchen: true,
    showLoyalty: true,
    showCoupons: true,
    showRecipes: true,
    showReservations: true,
    showSmartReports: true,
    showPurchasing: true,
    showBranchOrders: true,
    showInventoryReports: true,
    showCustomerMenu: true,
    // الميزات الجديدة
    showOwnerWallet: true,
    showExternalBranches: true,
    showComprehensiveReport: true
  });
  
  // حالات السحب والإفلات
  const [isReordering, setIsReordering] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [actionsOrder, setActionsOrder] = useState([]);
  const longPressTimerRef = useRef(null);
  const [touchStartPos, setTouchStartPos] = useState({ x: 0, y: 0 });
  
  // حالات إغلاق الصندوق
  const [cashRegisterOpen, setCashRegisterOpen] = useState(false);
  const [cashSummary, setCashSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [denominations, setDenominations] = useState({
    "250": 0, "500": 0, "1000": 0, "5000": 0, "10000": 0, "25000": 0, "50000": 0
  });
  const [closeNotes, setCloseNotes] = useState('');
  const [closingResult, setClosingResult] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  
  // إشعارات الطلبات الجديدة من تطبيق العملاء
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [pendingCustomerOrders, setPendingCustomerOrders] = useState([]);
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(null);
  
  // تنبيهات نقطة التعادل
  const [breakEvenAlerts, setBreakEvenAlerts] = useState([]);
  const [hasBreakEvenPermission, setHasBreakEvenPermission] = useState(false);
  const notificationAudioRef = useRef(null);
  
  // إشعارات الطلبات المتأخرة
  const [delayedOrders, setDelayedOrders] = useState([]);
  const [delayedStats, setDelayedStats] = useState(null);
  const [showDelayedAlert, setShowDelayedAlert] = useState(false);
  const delayedAudioRef = useRef(null);
  
  // حالات خلفية Dashboard
  const [showBackgroundDialog, setShowBackgroundDialog] = useState(false);
  const [dashboardBackgrounds, setDashboardBackgrounds] = useState([]);
  const [selectedBackground, setSelectedBackground] = useState(null);
  const [uploadingBg, setUploadingBg] = useState(false);

  useEffect(() => {
    fetchData();
    fetchDashboardSettings();
    fetchTenantInfo();
    fetchDashboardBackgrounds();
    fetchDayStatus();
    autoOpenShift(); // فتح الوردية تلقائياً
  }, [selectedBranchId]);

  // تحديد الفترة الافتراضية بناءً على صلاحيات المستخدم
  useEffect(() => {
    // المدير والأدمن يرى كل الفترات
    if (['admin', 'manager', 'owner'].includes(user?.role)) {
      setStatsPeriod('today');
      return;
    }
    
    // تحديد أول فترة متاحة للمستخدم
    const periodPermissions = [
      { key: 'today', permission: 'sales_view_today' },
      { key: 'week', permission: 'sales_view_week' },
      { key: 'month', permission: 'sales_view_month' },
      { key: 'all_time', permission: 'sales_view_all' }
    ];
    
    if (user?.permissions && Array.isArray(user.permissions)) {
      const availablePeriod = periodPermissions.find(p => user.permissions.includes(p.permission));
      if (availablePeriod) {
        setStatsPeriod(availablePeriod.key);
      }
    }
  }, [user]);

  // التحقق من الطلبات الجديدة كل 10 ثواني
  useEffect(() => {
    checkNewOrders();
    const interval = setInterval(checkNewOrders, 10000);
    return () => clearInterval(interval);
  }, [selectedBranchId]);

  // التحقق من الطلبات المتأخرة كل 30 ثانية
  useEffect(() => {
    checkDelayedOrders();
    const interval = setInterval(checkDelayedOrders, 30000);
    return () => clearInterval(interval);
  }, [selectedBranchId]);

  // التحقق من الطلبات المتأخرة
  const checkDelayedOrders = async () => {
    try {
      const params = { delay_minutes: 15 };
      if (selectedBranchId && selectedBranchId !== 'all') {
        params.branch_id = selectedBranchId;
      }
      
      const res = await axios.get(`${API}/notifications/delayed-orders`, { params });
      
      // Handle both array response and object response with stats
      const data = res.data;
      const stats = data?.stats;
      const delayedOrdersList = data?.delayed_orders || (Array.isArray(data) ? data : []);
      
      if (stats?.total_delayed > 0) {
        setDelayedOrders(delayedOrdersList);
        setDelayedStats(stats);
        
        // إظهار تنبيه إذا كان هناك طلبات حرجة أو عالية
        if (stats.critical_count > 0 || stats.high_count > 0) {
          setShowDelayedAlert(true);
          playDelayedSound();
        }
      } else {
        setDelayedOrders([]);
        setDelayedStats(null);
        setShowDelayedAlert(false);
      }
    } catch (error) {
      console.error('Failed to check delayed orders:', error);
    }
  };

  // تشغيل صوت تنبيه التأخير
  const playDelayedSound = () => {
    try {
      if (!delayedAudioRef.current) {
        // صوت تنبيه مختلف للتأخير
        delayedAudioRef.current = new Audio('data:audio/wav;base64,UklGRl4EAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToEAAAAAAEBAgIDAwQEBQUGBgcHCAgJCQoKCwsMDA0NDg4PDxAQEREMDAcHAgL+//r69/fz8/Dw7e3q6ujo5eXi4uDg3d3b29nZ19fV1dTU0tLS0dHR0NDQ0NDQ0dHR0tLS09PU1NXV1tbX19jY2dna2tvb3Nzd3d7e39/g4OHh4uLj4+Tk5eXm5ufn6Ojp6erq6+vs7O3t7u7v7/Dw8fHy8vPz9PT19fb29/f4+Pn5+vr7+/z8/f3+/v//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAAAAAAAA');
        delayedAudioRef.current.volume = 0.3;
      }
      delayedAudioRef.current.play().catch(() => {/* ignore */});
    } catch (e) {
      // تجاهل أخطاء الصوت
    }
  };

  // التحقق من الطلبات الجديدة من تطبيق العملاء
  const checkNewOrders = async () => {
    try {
      const params = lastCheckTime ? { last_check: lastCheckTime } : {};
      if (selectedBranchId && selectedBranchId !== 'all') {
        params.branch_id = selectedBranchId;
      }
      
      const res = await axios.get(`${API}/notifications/sound-alert`, { params });
      
      if (res.data.has_new_orders && res.data.new_orders_count > 0) {
        setNewOrdersCount(res.data.new_orders_count);
        setShowNewOrderAlert(true);
        playNotificationSound();
        
        // جلب تفاصيل الطلبات الجديدة
        const ordersRes = await axios.get(`${API}/notifications/pending-orders`, { params });
        setPendingCustomerOrders(ordersRes.data.orders);
      }
      
      setLastCheckTime(res.data.check_time);
    } catch (error) {
      console.error('Failed to check new orders:', error);
    }
  };

  // تشغيل صوت الإشعار
  const playNotificationSound = () => {
    try {
      if (!notificationAudioRef.current) {
        notificationAudioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleAkFfrzT3MNqIgRfs9PduXYPCnCv0NzAZxQMSrbU38ZjGAZbtNXexWkKDF+z1N7FaQ4NV7TV38dpCw1dtdTfxWkNDFu11N/FaQsNXbXU38VpDQ1ctNXfxWkMDV211N/GaAwNXLTU38VpDA1dtdTfxWkMDVy01N/FaQ0NW7TU38VpDA1ctNXfxWkMDVy01d/FaQwNXbXU38VpDAxctNXfxWkMDV211N/FaQwNXLTV38VpDA1dtdTfxWgNDVy01N/FaQwNXbXU38VpDQxctNXfxWkMDVy01N/FaQ0MXLTV38VpDA1dtNTfxWkMDF201N/FaAwNXLTV38VpDQxdtNTfxWkMDVy01d/FaQ0MXbTU38VpDAxctNXfxWkNDF201N/FaAwNXbTU38VpDQxctNXfxWkMDVy01d/FaQ0MXLTU38VpDAxdtNXfxWkNDFy01N/FaQwNXbTU38VpDA1ctNTfxWkNDF201N/FaQwNXbTU38VoDA1ctNTfxWkMDV201N/FaA0NXLTU38VpDA1dtNTfxWkMDVy01N/FaQ0MXLTU38VoDQ1ctNTfxWkMDV201N/FaQwNXLTU38VoDQ1ctNTfxWkNDFy01N/FaAwNXbTU38VoDQ1ctNXfxWgNDFy01d/FaAwNXbTU38VpDQxctNTfxWgMDV201d/FaAwNXLTU38VpDA1dtNTfxWgMDV201d/FaA0MXLTU38VoDA1dtNXfxWgNDFy01d/FaAwNXbTU38VoDA1ctNXfxWgMDV201N/FaA0NXLTU38VoDA1ctNXfxWgNDFy01N/FaAwNXbTV38VoDA1ctNXfxWgNDFy01N/FaAwNXLTV38VoDA1ctNXfxWgNDFy01d/FaA0MXLTV38VoDA1ctNXfxWgNDFy01d/FaAwNXLTU38VoDQ1ctNXfxWgMDV201d/FaA0MXLTU38VoDA1ctNXfxWgNDFy01d/FaAwNXLTV38VoDQ1ctNXfxWgMDV201d/FaA0MXLTU38VoDA1ctNXfxWgMDV201N/FaA0NXLTU38VoDA1dtNTfxWgMDV201d/FaAwNXLTV38VoDQ1ctNTfxWgMDV201d/FaA0MXLTU38VoDA1ctNXfxWgMDV201d/FaA0MXLTU38VoDA1ctNXfxWgNDFy01d/FaAwNXLTU38VoDQ1ctNXfxWgMDV201N/FaA0NXLTU38VoDA1ctNXfxWgNDFy01d/FaAwNXLTU38VoDA1ctNXfxWgNDFy01d/FaAwNXLTU38VoDQ1ctNXfxWgMDVy01d/FaA0MXLTU38VoDA1ctNXfxWgMDV201N/FaA0NXLTU38VoDA1ctNXfxWgNDFy01d/FaAwNXLTU38VoDA1ctNXfxWgNDFy01d/FaAwAA');
        notificationAudioRef.current.volume = 0.5;
      }
      notificationAudioRef.current.play().catch(() => {/* ignore */});
    } catch (e) {
      // تجاهل أخطاء الصوت
    }
  };

  // تحديد الطلبات كمشاهدة
  const markOrdersAsSeen = async (orderIds) => {
    try {
      await axios.post(`${API}/notifications/mark-seen`, orderIds);
      setShowNewOrderAlert(false);
      setNewOrdersCount(0);
    } catch (error) {
      console.error('Failed to mark orders as seen:', error);
    }
  };

  // فتح الوردية تلقائياً عند الدخول
  const autoOpenShift = async () => {
    try {
      // التحقق من وجود وردية مفتوحة للفرع المحدد
      const branchId = getBranchIdForApi();
      const params = branchId ? { branch_id: branchId } : {};
      const checkRes = await axios.get(`${API}/shifts/current`, { params });
      if (!checkRes.data || checkRes.data.message === 'لا توجد وردية مفتوحة') {
        // فتح وردية جديدة
        await axios.post(`${API}/shifts/open`, {
          opening_cash: 0,
          branch_id: branchId
        });
        console.log('تم فتح الوردية تلقائياً');
      }
    } catch (error) {
      // إذا لم تكن هناك وردية، نفتح واحدة جديدة
      if (error.response?.status === 404) {
        try {
          const branchId = getBranchIdForApi();
          await axios.post(`${API}/shifts/open`, {
            opening_cash: 0,
            branch_id: branchId
          });
          console.log('تم فتح الوردية تلقائياً');
        } catch (openError) {
          console.log('الوردية مفتوحة بالفعل أو حدث خطأ');
        }
      }
    }
  };

  // تحميل ترتيب الأيقونات المحفوظ
  useEffect(() => {
    const savedOrder = localStorage.getItem(`dashboard_order_${user?.id}`);
    if (savedOrder) {
      try {
        setActionsOrder(JSON.parse(savedOrder));
      } catch (e) {
        console.log('Error loading saved order');
      }
    }
  }, [user?.id]);

  // جلب معلومات العميل (الشعار والاسم)
  const fetchTenantInfo = async () => {
    try {
      const res = await axios.get(`${API}/tenant/info`);
      setTenantInfo(res.data);
    } catch (error) {
      console.log('No tenant info available');
    }
  };

  // جلب خلفيات Dashboard المتاحة للعميل
  const fetchDashboardBackgrounds = async () => {
    try {
      const res = await axios.get(`${API}/dashboard-backgrounds`);
      setDashboardBackgrounds(res.data.backgrounds || []);
      setSelectedBackground(res.data.selected || null);
    } catch (error) {
      console.log('No dashboard backgrounds available');
    }
  };

  // رفع خلفية جديدة
  const handleUploadBackground = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'dashboard');
    
    setUploadingBg(true);
    try {
      await axios.post(`${API}/upload-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(t('تم رفع الخلفية بنجاح'));
      fetchDashboardBackgrounds();
    } catch (error) {
      toast.error(t('فشل رفع الخلفية'));
    } finally {
      setUploadingBg(false);
    }
  };

  // اختيار خلفية Dashboard
  const handleSelectBackground = async (backgroundUrl) => {
    try {
      await axios.put(`${API}/dashboard-backgrounds/select`, { background_url: backgroundUrl });
      setSelectedBackground(backgroundUrl);
      toast.success(t('تم تحديث الخلفية'));
    } catch (error) {
      toast.error(t('فشل تحديث الخلفية'));
    }
  };

  // إزالة خلفية Dashboard
  const handleRemoveBackground = async () => {
    try {
      await axios.put(`${API}/dashboard-backgrounds/select`, { background_url: null });
      setSelectedBackground(null);
      toast.success(t('تم إزالة الخلفية'));
    } catch (error) {
      toast.error(t('فشل إزالة الخلفية'));
    }
  };

  // جلب رابط قائمة العملاء
  const fetchMenuLink = async () => {
    try {
      const res = await axios.get(`${API}/customer/menu-link`);
      setMenuLink(res.data.menu_url);
      setShowMenuLinkDialog(true);
    } catch (error) {
      // إذا فشل، نستخدم الرابط الافتراضي
      setMenuLink(`${BACKEND_URL}/menu/default`);
      setShowMenuLinkDialog(true);
    }
  };

  // نسخ رابط القائمة
  const copyMenuLink = async () => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(menuLink);
        toast.success(t('تم نسخ الرابط!'));
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = menuLink;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          toast.success(t('تم نسخ الرابط!'));
        } catch (err) {
          toast.error(t('فشل في نسخ الرابط'));
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      // Final fallback - show the link for manual copy
      toast.info(t('الرابط:') + ` ${menuLink}`);
    }
  };

  const fetchDashboardSettings = async () => {
    try {
      const res = await axios.get(`${API}/settings/dashboard`);
      if (res.data && Object.keys(res.data).length > 0) {
        setDashboardSettings(res.data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard settings:', error);
    }
  };

  const fetchData = async () => {
    try {
      // استخدام الفرع من Context
      const branchIdParam = getBranchIdForApi();
      const params = {};
      if (branchIdParam) {
        params.branch_id = branchIdParam;
      }
      
      // استخدام API الإحصائيات الشاملة الجديد
      const statsRes = await axios.get(`${API}/dashboard/stats`, { params });
      
      setStats(statsRes.data);
      setRecentOrders(statsRes.data.recent_orders || []);
      
      // جلب تنبيهات نقطة التعادل (للمدير والأدمن فقط)
      try {
        const alertsRes = await axios.get(`${API}/break-even/alerts`);
        if (alertsRes.data.has_permission) {
          setBreakEvenAlerts(alertsRes.data.alerts || []);
          setHasBreakEvenPermission(true);
        }
      } catch (alertErr) {
        console.log('Break-even alerts not available');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      // Fallback للطريقة القديمة
      try {
        const today = new Date().toISOString().split('T')[0];
        const params = { start_date: today, end_date: today };
        if (getBranchIdForApi()) {
          params.branch_id = getBranchIdForApi();
        }
        const [salesRes, ordersRes] = await Promise.all([
          axios.get(`${API}/reports/sales`, { params }),
          axios.get(`${API}/orders`, { params: { ...params, date: today } })
        ]);
        setStats({ today: salesRes.data });
        setRecentOrders(ordersRes.data.slice(0, 5));
      } catch (e) {
        console.error('Fallback also failed:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  // جلب حالة اليوم
  const fetchDayStatus = async () => {
    try {
      const branchIdParam = getBranchIdForApi();
      const params = {};
      if (branchIdParam) {
        params.branch_id = branchIdParam;
      }
      const res = await axios.get(`${API}/day-management/status`, { params });
      setDayStatus(res.data);
      
      // إظهار تنبيه إذا مر أكثر من 24 ساعة
      if (res.data.should_close && res.data.open_shifts_count > 0) {
        toast.warning(t('تنبيه: مر أكثر من 24 ساعة على فتح الوردية'));
      }
      
      // تنبيه الطلبات المعلقة
      if (res.data.pending_orders_count > 0 && res.data.oldest_shift_hours >= 20) {
        toast.info(t('يوجد طلبات معلقة يجب إغلاقها'));
      }
    } catch (error) {
      console.log('Day status not available');
    }
  };

  // إغلاق اليوم وترحيل البيانات
  const handleCloseDay = async (force = false) => {
    setClosingDay(true);
    try {
      const branchIdParam = getBranchIdForApi();
      const params = {};
      if (branchIdParam) {
        params.branch_id = branchIdParam;
      }
      
      const res = await axios.post(`${API}/day-management/close`, { force }, { params });
      
      if (res.data.success) {
        toast.success(t('تم إغلاق اليوم بنجاح'));
        setShowDayCloseDialog(false);
        fetchData();
        fetchDayStatus();
        autoOpenShift(); // فتح وردية جديدة تلقائياً
      } else {
        toast.error(t('فشل في إغلاق اليوم'));
      }
    } catch (error) {
      toast.error(t('فشل في إغلاق اليوم'));
    } finally {
      setClosingDay(false);
    }
  };

  // فتح نافذة إغلاق الصندوق وجلب الملخص
  const openCashRegister = async () => {
    setCashRegisterOpen(true);
    setLoadingSummary(true);
    setClosingResult(null);
    setShowReport(false);
    
    try {
      // إرسال branch_id المحدد للحصول على بيانات الفرع الصحيح
      const branchId = getBranchIdForApi();
      const params = branchId ? { branch_id: branchId } : {};
      const res = await axios.get(`${API}/cash-register/summary`, { params });
      setCashSummary(res.data);
      // إعادة تعيين الجرد
      setDenominations({
        "250": 0, "500": 0, "1000": 0, "5000": 0, "10000": 0, "25000": 0, "50000": 0
      });
      setCloseNotes('');
    } catch (error) {
      if (error.response?.status === 404) {
        toast.error(t('لا يوجد وردية مفتوحة'));
        setCashRegisterOpen(false);
      } else {
        toast.error(t('فشل في جلب بيانات الصندوق'));
      }
    } finally {
      setLoadingSummary(false);
    }
  };

  // حساب إجمالي الجرد
  const calculateCountedCash = () => {
    return Object.entries(denominations).reduce((total, [denom, count]) => {
      return total + (parseInt(denom) * count);
    }, 0);
  };

  // تحديث عدد فئة معينة
  const updateDenomination = (denom, value) => {
    const numValue = Math.max(0, parseInt(value) || 0);
    setDenominations(prev => ({ ...prev, [denom]: numValue }));
  };

  // إغلاق الصندوق
  const handleCloseRegister = async () => {
    const countedCash = calculateCountedCash();
    
    if (countedCash === 0) {
      toast.error(t('يرجى إدخال جرد الصندوق'));
      return;
    }
    
    setIsClosing(true);
    
    try {
      const branchId = getBranchIdForApi();
      const res = await axios.post(`${API}/cash-register/close`, {
        denominations,
        notes: closeNotes,
        branch_id: branchId
      });
      
      setClosingResult(res.data);
      setShowReport(true);
      toast.success(t('تم إغلاق الصندوق والوردية بنجاح!'));
      
      // تحديث حالة اليوم
      fetchDayStatus();
      
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إغلاق الصندوق'));
    } finally {
      setIsClosing(false);
    }
  };

  // طباعة التقرير
  const handlePrintReport = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>تقرير إغلاق الصندوق</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; direction: rtl; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h1 { font-size: 24px; margin: 0; }
          .header p { color: #666; margin: 5px 0; }
          .section { margin-bottom: 15px; }
          .section-title { font-weight: bold; font-size: 14px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
          .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted #eee; }
          .row:last-child { border-bottom: none; }
          .label { color: #666; }
          .value { font-weight: bold; }
          .positive { color: #10B981; }
          .negative { color: #EF4444; }
          .total-row { background: #f5f5f5; padding: 10px; margin: 10px 0; font-size: 16px; }
          .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
        <div class="footer">
          <p>Maestro EGP - ${new Date().toLocaleString('en-GB')}</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  // إغلاق وتسجيل الخروج
  const handleCloseAndLogout = () => {
    setCashRegisterOpen(false);
    setClosingResult(null);
    setShowReport(false);
    logout();
  };

  // الأزرار السريعة مع التحكم بالظهور
  const allQuickActions = [
    { label: t('نقطة البيع'), icon: ShoppingCart, path: '/pos', color: 'bg-gradient-to-br from-orange-400 to-orange-600', key: 'showPOS', id: 'pos' },
    { label: t('الطاولات'), icon: LayoutGrid, path: '/tables', color: 'bg-gradient-to-br from-blue-400 to-blue-600', key: 'showTables', id: 'tables' },
    { label: t('الطلبات'), icon: ClipboardList, path: '/orders', color: 'bg-gradient-to-br from-amber-400 to-amber-600', key: 'showOrders', id: 'orders' },
    { label: t('شاشة المطبخ'), icon: ChefHat, path: '/kitchen', color: 'bg-gradient-to-br from-yellow-400 to-yellow-600', key: 'showKitchen', id: 'kitchen' },
    { label: t('التقارير'), icon: BarChart3, path: '/reports', color: 'bg-gradient-to-br from-amber-400 to-amber-600', key: 'showReports', id: 'reports' },
    { label: t('التقييمات'), icon: Star, path: '/ratings', color: 'bg-gradient-to-br from-yellow-400 to-yellow-500', key: 'showRatings', id: 'ratings' },
    { label: t('المصاريف'), icon: Receipt, path: '/expenses', color: 'bg-gradient-to-br from-red-400 to-red-600', key: 'showExpenses', id: 'expenses' },
    { label: t('المشتريات'), icon: ShoppingBag, path: '/purchases-new', color: 'bg-gradient-to-br from-blue-500 to-blue-700', key: 'showPurchasing', id: 'purchasing' },
    { label: t('المخزن والتصنيع'), icon: Warehouse, path: '/warehouse-manufacturing', color: 'bg-gradient-to-br from-indigo-500 to-indigo-700', key: 'showWarehouse', id: 'warehouse-manufacturing' },
    { label: t('طلبات الفروع'), icon: Truck, path: '/branch-orders', color: 'bg-gradient-to-br from-lime-400 to-lime-600', key: 'showBranchOrders', id: 'branch-orders' },
    { label: t('تقارير المخزون'), icon: Package, path: '/inventory-reports', color: 'bg-gradient-to-br from-purple-500 to-purple-700', key: 'showInventoryReports', id: 'inventory-reports' },
    { label: t('التوصيل'), icon: Truck, path: '/delivery', color: 'bg-gradient-to-br from-orange-500 to-orange-700', key: 'showDelivery', id: 'delivery' },
    { label: t('الحجوزات'), icon: CalendarDays, path: '/reservations', color: 'bg-gradient-to-br from-rose-400 to-rose-600', key: 'showReservations', id: 'reservations' },
    { label: t('الموارد البشرية'), icon: UserCog, path: '/hr', color: 'bg-gradient-to-br from-green-400 to-green-600', key: 'showHR', id: 'hr' },
    { label: t('لوحة كول سنتر'), icon: Headphones, path: '/call-center', color: 'bg-gradient-to-br from-cyan-400 to-cyan-600', key: 'showCallCenter', id: 'call-center', forRole: 'call_center' },
    { label: t('سجل المكالمات'), icon: Phone, path: '/call-logs', color: 'bg-gradient-to-br from-teal-400 to-teal-600', key: 'showCallLogs', id: 'call-logs' },
    { label: t('برنامج الولاء'), icon: Gift, path: '/loyalty', color: 'bg-gradient-to-br from-pink-400 to-pink-600', key: 'showLoyalty', id: 'loyalty' },
    { label: t('الكوبونات'), icon: Gift, path: '/coupons', color: 'bg-gradient-to-br from-violet-400 to-violet-600', key: 'showCoupons', id: 'coupons' },
    { label: t('خزينة المالك'), icon: Wallet, path: '/owner-wallet', color: 'bg-gradient-to-br from-amber-400 to-amber-600', key: 'showOwnerWallet', id: 'owner-wallet' },
    { label: t('الفروع الخارجية'), icon: Store, path: '/external-branches', color: 'bg-gradient-to-br from-blue-400 to-blue-600', key: 'showExternalBranches', id: 'external-branches' },
    { label: t('الإعدادات'), icon: Settings, path: '/settings', color: 'bg-gradient-to-br from-gray-400 to-gray-600', key: 'showSettings', id: 'settings' },
  ];
  
  // فلترة الأزرار حسب الإعدادات والصلاحيات
  const filteredActions = allQuickActions.filter(action => {
    // التحقق من إعدادات الصفحة الرئيسية (إذا كان القيمة undefined أو true، نعرض الأيقونة)
    // فقط نخفيها إذا كانت القيمة === false بشكل صريح
    if (dashboardSettings[action.key] === false) return false;
    
    // المدير (admin) يرى كل شيء
    if (user?.role === 'admin' || user?.role === 'super_admin') return true;
    
    // مدير الفرع يرى كل شيء
    if (user?.role === 'branch_manager') return true;
    
    // التحقق من صلاحيات الموظف
    const permissionMap = {
      'showPOS': 'pos',
      'showTables': 'tables',
      'showOrders': 'orders',
      'showKitchen': 'kitchen',
      'showReports': 'reports',
      'showSmartReports': 'reports',
      'showRatings': 'reports',
      'showExpenses': 'expenses',
      'showPurchasing': 'inventory',
      'showWarehouse': 'inventory',
      'showBranchOrders': 'inventory',
      'showInventoryReports': 'inventory',
      'showDelivery': 'delivery',
      'showReservations': 'reservations',
      'showHR': 'hr',
      'showCallLogs': 'call_logs',
      'showLoyalty': 'loyalty',
      'showCoupons': 'coupons',
      'showSettings': 'settings',
      'showOwnerWallet': 'owner_wallet',
      'showExternalBranches': 'external_branches',
    };
    
    const requiredPermission = permissionMap[action.key];
    
    // إذا كان لديه صلاحيات محددة - استخدمها
    if (user?.permissions && Array.isArray(user.permissions) && user.permissions.length > 0) {
      // إذا كانت الصلاحية المطلوبة موجودة في قائمة صلاحيات المستخدم
      return user.permissions.includes(requiredPermission);
    }
    
    // الصلاحيات الافتراضية حسب الدور
    const defaultPermissionsByRole = {
      'cashier': ['pos', 'tables', 'orders', 'view_statistics'],
      'supervisor': ['pos', 'tables', 'orders', 'kitchen', 'reports', 'expenses', 'delivery', 'view_statistics'],
      'captain': ['pos', 'tables', 'orders'],  // كابتن: نقاط البيع (طاولات + سفري فقط)
      'kitchen': ['kitchen', 'orders'],
      'call_center': ['pos', 'delivery', 'call_logs', 'receive_calls']  // كول سنتر: نقاط البيع (توصيل فقط)، التوصيل، سجل المكالمات، استلام المكالمات
    };
    
    const rolePermissions = defaultPermissionsByRole[user?.role];
    if (rolePermissions) {
      return rolePermissions.includes(requiredPermission);
    }
    
    return true;
  });

  // ترتيب الأزرار حسب الترتيب المحفوظ
  const quickActions = actionsOrder.length > 0
    ? actionsOrder
        .map(id => filteredActions.find(a => a.id === id))
        .filter(Boolean)
        .concat(filteredActions.filter(a => !actionsOrder.includes(a.id)))
    : filteredActions;

  // معالجات السحب والإفلات
  const handleLongPressStart = (e, action) => {
    const touch = e.touches ? e.touches[0] : e;
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    
    longPressTimerRef.current = setTimeout(() => {
      setIsReordering(true);
      setDraggedItem(action.id);
      // اهتزاز خفيف للتنبيه (إذا كان مدعوماً)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500); // 500ms للضغطة المطولة
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDragStart = (e, action) => {
    setDraggedItem(action.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, action) => {
    e.preventDefault();
    if (draggedItem && draggedItem !== action.id) {
      const newOrder = [...(actionsOrder.length > 0 ? actionsOrder : quickActions.map(a => a.id))];
      const draggedIndex = newOrder.indexOf(draggedItem);
      const targetIndex = newOrder.indexOf(action.id);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, draggedItem);
        setActionsOrder(newOrder);
      }
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    // حفظ الترتيب الجديد
    if (actionsOrder.length > 0) {
      localStorage.setItem(`dashboard_order_${user?.id}`, JSON.stringify(actionsOrder));
      toast.success(t('تم حفظ الترتيب الجديد'));
    }
  };

  const handleTouchMove = (e, action) => {
    if (!isReordering || !draggedItem) return;
    
    const touch = e.touches[0];
    const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
    const targetButton = elements.find(el => el.dataset?.actionId);
    
    if (targetButton && targetButton.dataset.actionId !== draggedItem) {
      const newOrder = [...(actionsOrder.length > 0 ? actionsOrder : quickActions.map(a => a.id))];
      const draggedIndex = newOrder.indexOf(draggedItem);
      const targetIndex = newOrder.indexOf(targetButton.dataset.actionId);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, draggedItem);
        setActionsOrder(newOrder);
      }
    }
  };

  const handleTouchEnd = () => {
    handleLongPressEnd();
    if (isReordering && actionsOrder.length > 0) {
      localStorage.setItem(`dashboard_order_${user?.id}`, JSON.stringify(actionsOrder));
      toast.success(t('تم حفظ الترتيب الجديد'));
    }
    setDraggedItem(null);
  };

  const exitReorderMode = () => {
    setIsReordering(false);
    setDraggedItem(null);
  };

  // الحصول على إحصائيات الفترة المحددة
  const getCurrentPeriodStats = () => {
    if (!stats) return { total_sales: 0, total_orders: 0, average_order_value: 0, total_profit: 0 };
    return stats[statsPeriod] || stats.today || { total_sales: 0, total_orders: 0, average_order_value: 0, total_profit: 0 };
  };

  const periodStats = getCurrentPeriodStats();
  
  const periodLabels = {
    today: t('اليوم'),
    week: t('هذا الأسبوع'),
    month: t('هذا الشهر'),
    all_time: t('الإجمالي')
  };

  const statCards = [
    { 
      label: t('إجمالي المبيعات'), 
      value: formatPriceCompact(periodStats?.total_sales || 0), 
      icon: DollarSign,
      color: 'text-green-500',
      bg: 'bg-green-500/10'
    },
    { 
      label: t('عدد الطلبات'), 
      value: periodStats?.total_orders || 0, 
      icon: ShoppingCart,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    { 
      label: t('متوسط الطلب'), 
      value: formatPrice(periodStats?.average_order_value || 0), 
      icon: TrendingUp,
      color: 'text-primary',
      bg: 'bg-primary/10'
    },
    { 
      label: t('صافي الربح'), 
      value: formatPriceCompact(periodStats?.total_profit || 0), 
      icon: Wallet,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10'
    },
  ];

  const getOrderStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-500/10 text-yellow-500',
      preparing: 'bg-blue-500/10 text-blue-500',
      ready: 'bg-green-500/10 text-green-500',
      delivered: 'bg-gray-500/10 text-gray-500',
      cancelled: 'bg-red-500/10 text-red-500',
    };
    return colors[status] || colors.pending;
  };

  const getOrderStatusText = (status) => {
    const texts = {
      pending: t('قيد الانتظار'),
      preparing: t('قيد التحضير'),
      ready: t('جاهز'),
      delivered: t('تم التوصيل'),
      cancelled: t('ملغي'),
    };
    return texts[status] || status;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('جاري التحميل...')}</p>
        </div>
      </div>
    );
  }

  // التحقق من وضع المعاينة (انتحال الحساب)
  const isImpersonating = user?.impersonated === true;
  const originalUserName = user?.original_user_name;
  
  // العودة للحساب الأصلي
  const exitImpersonation = () => {
    const originalUser = localStorage.getItem('original_user');
    const originalToken = localStorage.getItem('original_token');
    
    if (originalUser && originalToken) {
      localStorage.setItem('user', originalUser);
      localStorage.setItem('token', originalToken);
      localStorage.removeItem('original_user');
      localStorage.removeItem('original_token');
      toast.success(t('تم العودة للحساب الأصلي'));
      window.location.href = '/settings';
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="dashboard">
      {/* شريط تنبيه وضع المعاينة */}
      {isImpersonating && (
        <div className="bg-amber-500 text-black px-4 py-2 text-center font-medium flex items-center justify-center gap-4 sticky top-0 z-[100]">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t('أنت في وضع المعاينة كـ')} <strong>{user?.full_name || user?.username}</strong>
            {originalUserName && <span className="text-sm opacity-75">({t('بواسطة')} {originalUserName})</span>}
          </span>
          <Button 
            size="sm" 
            variant="secondary" 
            onClick={exitImpersonation}
            className="bg-black/20 hover:bg-black/30 text-black border-0"
          >
            {t('العودة لحسابي')}
          </Button>
        </div>
      )}
      
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo - يعرض شعار العميل إذا وجد */}
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center overflow-hidden shadow-lg">
              {tenantInfo?.logo_url ? (
                <img 
                  src={tenantInfo.logo_url.startsWith('/') ? `${API}${tenantInfo.logo_url.replace('/api', '')}` : tenantInfo.logo_url} 
                  alt="Logo" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-black text-primary-foreground font-cairo">M</span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">
                {tenantInfo?.name || tenantInfo?.name_en || 'Maestro'}
              </h1>
              <p className="text-sm text-muted-foreground">{t('مرحباً')}، {user?.full_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Branch Selector - مكون اختيار الفرع العام */}
            <BranchSelector />

            {/* Language Switcher - تبديل اللغة السريع */}
            <LanguageSwitcher variant="ghost" />

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="rounded-lg"
              data-testid="theme-toggle"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            {/* Dashboard Background Button - لجميع المستخدمين */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBackgroundDialog(true)}
              className="gap-2 border-pink-500 text-pink-500 hover:bg-pink-500/10"
              data-testid="backgrounds-btn"
            >
              <Image className="h-4 w-4" />
              {t('الخلفيات')}
            </Button>

            {/* Super Admin Button - للمالك فقط */}
            {(user?.role === 'super_admin' || (user?.role === 'admin' && !user?.tenant_id)) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/super-admin')}
                className="gap-2 border-purple-500 text-purple-500 hover:bg-purple-500/10"
                data-testid="super-admin-btn"
              >
                <Crown className="h-4 w-4" />
                {t('لوحة تحكم المالك')}
              </Button>
            )}

            {/* Close Cash Register Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={openCashRegister}
              className="gap-2 border-orange-500 text-orange-500 hover:bg-orange-500/10"
              data-testid="close-register-btn"
            >
              <Calculator className="h-4 w-4" />
              {t('إغلاق الصندوق')}
            </Button>

            {/* Share Menu Link Button */}
            {/* قائمة العملاء - يظهر فقط إذا كانت الميزة مفعلة */}
            {dashboardSettings.showCustomerMenu && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchMenuLink}
                className="gap-2 border-green-500 text-green-500 hover:bg-green-500/10"
                data-testid="share-menu-btn"
              >
                <Share2 className="h-4 w-4" />
                {t('قائمة العملاء')}
              </Button>
            )}

            {/* Logout */}
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="rounded-lg text-destructive hover:bg-destructive/10"
              data-testid="logout-btn"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* تنبيه الطلبات الجديدة من تطبيق العملاء */}
      {showNewOrderAlert && newOrdersCount > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4">
            <div className="relative">
              <ShoppingBag className="h-8 w-8" />
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                {newOrdersCount}
              </span>
            </div>
            <div>
              <p className="font-bold text-lg">{t('طلب جديد من تطبيق العملاء!')}</p>
              <p className="text-sm text-green-100">{t('اضغط لعرض التفاصيل')}</p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="secondary" 
                size="sm"
                onClick={() => {
                  markOrdersAsSeen(pendingCustomerOrders.map(o => o.id));
                  navigate('/orders');
                }}
              >
                {t('عرض الطلبات')}
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => {
                  markOrdersAsSeen(pendingCustomerOrders.map(o => o.id));
                }}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto">
        {/* Quick Actions with Background - يظهر فقط لمن لديه صلاحية */}
        {hasDashboardPermission('dashboard_quick_actions') && (
        <section 
          className="relative rounded-2xl overflow-hidden"
          style={{
            backgroundImage: selectedBackground ? `url(${selectedBackground})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {/* Overlay for better readability */}
          {selectedBackground && (
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          )}
          
          <div className={`relative z-10 ${selectedBackground ? 'p-4 md:p-6' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base md:text-lg font-bold font-cairo text-foreground">{t('الإجراءات السريعة')}</h2>
              {isReordering && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exitReorderMode}
                  className="gap-2 text-green-500 border-green-500 hover:bg-green-500/10"
                >
                  <Check className="h-4 w-4" />
                  {t('تم')}
                </Button>
              )}
            </div>
            
            {/* تعليمات إعادة الترتيب */}
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
              <Move className="h-3 w-3" />
              {t('اضغط مطولاً لإعادة ترتيب')}
            </p>

            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
            {quickActions.map((action) => (
              <div
                key={action.id}
                data-action-id={action.id}
                draggable={isReordering}
                onDragStart={(e) => handleDragStart(e, action)}
                onDragOver={(e) => handleDragOver(e, action)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleLongPressStart(e, action)}
                onTouchMove={(e) => handleTouchMove(e, action)}
                onTouchEnd={handleTouchEnd}
                onMouseDown={(e) => handleLongPressStart(e, action)}
                onMouseUp={handleLongPressEnd}
                onMouseLeave={handleLongPressEnd}
                className={`
                  relative cursor-pointer select-none
                  ${draggedItem === action.id ? 'opacity-50 scale-95' : ''}
                  ${isReordering ? 'animate-pulse' : ''}
                  transition-all duration-200
                `}
              >
                <Button
                  variant="outline"
                  className={`
                    h-auto py-3 md:py-4 flex flex-col items-center gap-2 w-full
                    bg-card hover:bg-card/80 border-border/50 hover:border-primary/50 
                    transition-all hover:-translate-y-0.5
                    ${isReordering ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background' : ''}
                  `}
                  onClick={() => !isReordering && navigate(action.path)}
                  data-testid={`quick-action-${action.id}`}
                >
                  {isReordering && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                      <GripVertical className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className={`w-10 h-10 md:w-11 md:h-11 ${action.color} rounded-xl flex items-center justify-center shadow-lg`}>
                    <action.icon className="h-5 w-5 md:h-5.5 md:w-5.5 text-white" />
                  </div>
                  <span className="text-xs md:text-sm font-medium text-foreground text-center leading-tight">{action.label}</span>
                </Button>
              </div>
            ))}
          </div>
          </div>
        </section>
        )}

        {/* تنبيهات نقطة التعادل - للمدير والأدمن فقط */}
        {hasBreakEvenPermission && breakEvenAlerts.length > 0 && (
          <section className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold font-cairo text-foreground flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                {t('تنبيهات نقطة التعادل')}
              </h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/cost-analysis')}
                className="text-xs"
              >
                {t('عرض التفاصيل')}
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {breakEvenAlerts.map((alert, idx) => (
                <Card 
                  key={idx} 
                  className={`border-2 ${
                    alert.type === 'success' ? 'border-green-500 bg-green-500/5' :
                    alert.type === 'warning' ? 'border-yellow-500 bg-yellow-500/5' :
                    alert.type === 'info' ? 'border-blue-500 bg-blue-500/5' :
                    'border-red-500 bg-red-500/5'
                  }`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${
                        alert.type === 'success' ? 'bg-green-500/20' :
                        alert.type === 'warning' ? 'bg-yellow-500/20' :
                        alert.type === 'info' ? 'bg-blue-500/20' :
                        'bg-red-500/20'
                      }`}>
                        {alert.type === 'success' ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : alert.type === 'warning' ? (
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        ) : alert.type === 'info' ? (
                          <TrendingUp className="h-5 w-5 text-blue-500" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm ${
                          alert.type === 'success' ? 'text-green-600' :
                          alert.type === 'warning' ? 'text-yellow-600' :
                          alert.type === 'info' ? 'text-blue-600' :
                          'text-red-600'
                        }`}>
                          {t(alert.title)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {alert.branch_name}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground">
                            {t('نسبة التغطية')}: {alert.coverage}%
                          </span>
                          {alert.net_profit !== undefined && alert.net_profit > 0 && (
                            <span className="text-xs font-bold text-green-600">
                              +{formatPriceCompact(alert.net_profit)}
                            </span>
                          )}
                          {alert.remaining !== undefined && alert.remaining > 0 && (
                            <span className="text-xs font-bold text-orange-600">
                              -{formatPriceCompact(alert.remaining)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Stats Cards - يظهر فقط لمن لديه صلاحية */}
        {hasDashboardPermission('dashboard_statistics') && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base md:text-lg font-bold font-cairo text-foreground">{t('الإحصائيات')}</h2>
            <div className="flex items-center gap-2">
              {/* فلتر الفترة الزمنية - يظهر فقط الأزرار التي لدى المستخدم صلاحية لعرضها */}
              {hasDashboardPermission('dashboard_stats_filters') && (
                <div className="flex bg-muted rounded-lg p-1 gap-1">
                  {[
                    { key: 'today', label: t('اليوم'), permission: 'sales_view_today' },
                    { key: 'week', label: t('الأسبوع'), permission: 'sales_view_week' },
                    { key: 'month', label: t('الشهر'), permission: 'sales_view_month' },
                    { key: 'all_time', label: t('الكل'), permission: 'sales_view_all' }
                  ].filter(period => {
                    // المدير والأدمن يرى كل الأزرار
                    if (['admin', 'manager', 'owner'].includes(user?.role)) return true;
                    // باقي المستخدمين يتم فحص صلاحياتهم
                    if (user?.permissions && Array.isArray(user.permissions)) {
                      return user.permissions.includes(period.permission);
                    }
                    return true;
                  }).map(period => (
                    <Button
                      key={period.key}
                      variant={statsPeriod === period.key ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setStatsPeriod(period.key)}
                      className={`h-7 px-2 text-xs ${statsPeriod === period.key ? 'bg-primary text-primary-foreground' : ''}`}
                      data-testid={`period-${period.key}`}
                    >
                      {period.label}
                    </Button>
                  ))}
                </div>
              )}
              
              {/* زر إدارة اليوم - يظهر فقط لمن لديه صلاحية */}
              {(hasDashboardPermission('dashboard_day_management') || 
                (user?.permissions && user.permissions.includes('pos_day_management')) ||
                ['admin', 'manager', 'owner'].includes(user?.role)) && dayStatus && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDayCloseDialog(true)}
                  className={`gap-1 ${dayStatus.should_close ? 'border-orange-500 text-orange-500 animate-pulse' : ''}`}
                  data-testid="day-management-btn"
                >
                  <CalendarDays className="h-4 w-4" />
                  {t('إدارة اليوم')}
                  {dayStatus.pending_orders_count > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 mr-1">
                      {dayStatus.pending_orders_count}
                    </span>
                  )}
                </Button>
              )}
            </div>
          </div>
          
          {/* تنبيه الورديات المفتوحة - يظهر فقط لمن لديه صلاحية */}
          {hasDashboardPermission('dashboard_day_management') && dayStatus?.should_close && (
            <div className="mb-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-orange-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-600">{t('تنبيه')}: {t('مر أكثر من 24 ساعة على فتح الوردية')}</p>
                <p className="text-xs text-muted-foreground">{t('يُنصح بإغلاق اليوم وترحيل البيانات لبدء يوم جديد')}</p>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white"
                onClick={() => setShowDayCloseDialog(true)}
              >
                {t('إغلاق الآن')}
              </Button>
            </div>
          )}
          
          {/* تنبيه الطلبات المتأخرة */}
          {delayedStats && delayedStats.total_delayed > 0 && (
            <div 
              className={`mb-3 p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-all
                ${delayedStats.critical_count > 0 
                  ? 'bg-red-500/10 border border-red-500/30 animate-pulse' 
                  : delayedStats.high_count > 0 
                    ? 'bg-orange-500/10 border border-orange-500/30' 
                    : 'bg-yellow-500/10 border border-yellow-500/30'
                }`}
              onClick={() => navigate('/orders')}
              data-testid="delayed-orders-alert"
            >
              <Clock className={`h-5 w-5 flex-shrink-0 ${
                delayedStats.critical_count > 0 ? 'text-red-500' : 
                delayedStats.high_count > 0 ? 'text-orange-500' : 'text-yellow-500'
              }`} />
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  delayedStats.critical_count > 0 ? 'text-red-600' : 
                  delayedStats.high_count > 0 ? 'text-orange-600' : 'text-yellow-600'
                }`}>
                  ⏰ {delayedStats.total_delayed} {t('طلب متأخر')}
                  {delayedStats.critical_count > 0 && (
                    <span className="mr-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                      {delayedStats.critical_count} {t('حرج')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('أقصى تأخير')}: {delayedStats.max_delay_minutes} {t('دقيقة')} | {t('متوسط')}: {delayedStats.avg_delay_minutes} {t('دقيقة')}
                </p>
              </div>
              <div className="flex gap-2">
                {delayedStats.critical_count > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {delayedStats.critical_count} {t('حرج')} (+45{t('د')})
                  </Badge>
                )}
                {delayedStats.high_count > 0 && (
                  <Badge variant="outline" className="text-xs border-orange-500 text-orange-500">
                    {delayedStats.high_count} {t('عالي')} (+30{t('د')})
                  </Badge>
                )}
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className={`${
                  delayedStats.critical_count > 0 
                    ? 'border-red-500 text-red-500 hover:bg-red-500 hover:text-white' 
                    : 'border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/orders');
                }}
              >
                {t('عرض الطلبات')}
              </Button>
            </div>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCards.map((stat, idx) => (
              <Card key={idx} className="border-border/50 bg-card" data-testid={`stat-card-${idx}`}>
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs md:text-sm text-muted-foreground mb-1">{stat.label}</p>
                      <p className="text-xl md:text-2xl font-bold font-cairo tabular-nums text-foreground">{stat.value}</p>
                    </div>
                    <div className={`w-10 h-10 md:w-11 md:h-11 ${stat.bg} rounded-xl flex items-center justify-center`}>
                      <stat.icon className={`h-5 w-5 md:h-5.5 md:w-5.5 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
        )}

        {/* Recent Orders & Sales by Type */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <Card className="border-border/50 bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-cairo text-foreground">{t('آخر الطلبات')}</CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/orders')}
                className="text-primary"
              >
                {t('عرض الكل')}
                <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentOrders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{t('لا توجد طلبات اليوم')}</p>
              ) : (
                <div className="space-y-3">
                  {recentOrders.map((order) => (
                    <div 
                      key={order.id} 
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      data-testid={`order-${order.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">#{order.order_number}</span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{order.customer_name || t('زبون')}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.items.length} {t('عناصر')}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="font-bold tabular-nums text-foreground">{formatPrice(order.total)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getOrderStatusColor(order.status)}`}>
                          {getOrderStatusText(order.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sales by Payment Method */}
          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-cairo text-foreground">{t('المبيعات حسب طريقة الدفع')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {periodStats?.by_payment_method && Object.entries(periodStats.by_payment_method).map(([method, amount]) => (
                  <div key={method} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {method === 'cash' ? t('نقدي') : method === 'card' ? t('بطاقة') : t('آجل')}
                      </span>
                      <span className="font-medium text-foreground">{formatPrice(amount)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${(amount / (periodStats?.total_sales || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(!periodStats?.by_payment_method || Object.keys(periodStats.by_payment_method).length === 0) && (
                  <p className="text-center text-muted-foreground py-8">{t('لا توجد مبيعات في هذه الفترة')}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Delivery Apps Stats */}
        {periodStats?.by_delivery_app && Object.keys(periodStats.by_delivery_app).length > 0 && (
          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-cairo text-foreground">{t('مبيعات تطبيقات التوصيل')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.entries(periodStats.by_delivery_app).map(([app, amount]) => (
                  <div key={app} className="text-center p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1 capitalize">{app}</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">{formatPrice(amount)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Cash Register Close Dialog */}
      <Dialog open={cashRegisterOpen} onOpenChange={setCashRegisterOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Calculator className="h-6 w-6 text-orange-500" />
              {t('إغلاق الصندوق')}
              {cashSummary?.branch_name && (
                <Badge variant="outline" className="mr-2 text-sm bg-primary/10">
                  <Building2 className="h-4 w-4 ml-1" />
                  {cashSummary.branch_name}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh]">
            {loadingSummary ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : showReport && closingResult ? (
              /* تقرير إغلاق الصندوق للطباعة */
              <div className="p-4">
                <div ref={printRef}>
                  <div className="header text-center mb-6">
                    <h1 className="text-2xl font-bold">{t('تقرير إغلاق الصندوق')}</h1>
                    <p className="text-muted-foreground">{closingResult.branch_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(closingResult.ended_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>

                  {/* بيانات الكاشير */}
                  <div className="section mb-4 p-4 bg-muted/30 rounded-lg">
                    <div className="section-title font-bold mb-2">{t('بيانات الوردية')}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>{t('الكاشير')}: <strong>{closingResult.cashier_name}</strong></div>
                      <div>{t('الفرع')}: <strong>{closingResult.branch_name}</strong></div>
                      <div>{t('وقت الدخول')}: <strong>{new Date(closingResult.started_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong></div>
                      <div>{t('وقت الإغلاق')}: <strong>{new Date(closingResult.ended_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong></div>
                    </div>
                  </div>

                  {/* إجمالي المبيعات */}
                  <div className="section mb-4 p-4 bg-green-500/10 rounded-lg">
                    <div className="section-title font-bold mb-2 text-green-600">{t('المبيعات')}</div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>{t('إجمالي المبيعات')}:</span>
                        <strong className="text-green-600">{formatPrice(closingResult.total_sales)}</strong>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>{t('نقدي')}:</span>
                        <span>{formatPrice(closingResult.cash_sales)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>{t('بطاقات')}:</span>
                        <span>{formatPrice(closingResult.card_sales)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>{t('آجل')}:</span>
                        <span>{formatPrice(closingResult.credit_sales)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>{t('عدد الطلبات')}:</span>
                        <span>{closingResult.total_orders}</span>
                      </div>
                    </div>
                  </div>

                  {/* تطبيقات التوصيل */}
                  {closingResult.delivery_app_sales && Object.keys(closingResult.delivery_app_sales).length > 0 && (
                    <div className="section mb-4 p-4 bg-blue-500/10 rounded-lg">
                      <div className="section-title font-bold mb-2 text-blue-600">{t('مبيعات التطبيقات')}</div>
                      <div className="space-y-1">
                        {Object.entries(closingResult.delivery_app_sales).map(([app, amount]) => (
                          <div key={app} className="flex justify-between text-sm">
                            <span className="capitalize">{app}:</span>
                            <span>{formatPrice(amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* مبيعات السائقين */}
                  {closingResult.driver_sales > 0 && (
                    <div className="section mb-4 p-4 bg-orange-500/10 rounded-lg">
                      <div className="section-title font-bold mb-2 text-orange-600">{t('مبيعات السائقين')}</div>
                      <div className="flex justify-between">
                        <span>{t('إجمالي السائقين')}:</span>
                        <strong>{formatPrice(closingResult.driver_sales)}</strong>
                      </div>
                    </div>
                  )}

                  {/* الخصومات والإلغاءات */}
                  <div className="section mb-4 p-4 bg-red-500/10 rounded-lg">
                    <div className="section-title font-bold mb-2 text-red-600">{t('الخصومات والإلغاءات')}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>{t('إجمالي الخصومات')}:</span>
                        <span className="text-red-600">{formatPrice(closingResult.discounts_total || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('الطلبات الملغاة')} ({closingResult.cancelled_orders || 0}):</span>
                        <span className="text-red-600">{formatPrice(closingResult.cancelled_amount || 0)}</span>
                      </div>
                      {closingResult.cancelled_by && closingResult.cancelled_by.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-red-200">
                          <div className="text-xs text-red-600 mb-1">{t('تفاصيل الإلغاء')}:</div>
                          {closingResult.cancelled_by.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span>{item.user_name} ({item.count} {t('طلب')}):</span>
                              <span>{formatPrice(item.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* المصاريف */}
                  <div className="section mb-4 p-4 bg-yellow-500/10 rounded-lg">
                    <div className="section-title font-bold mb-2 text-yellow-600">{t('المصاريف')}</div>
                    <div className="flex justify-between">
                      <span>{t('إجمالي المصاريف')}:</span>
                      <strong className="text-yellow-600">{formatPrice(closingResult.total_expenses)}</strong>
                    </div>
                  </div>

                  {/* جرد الصندوق */}
                  <div className="section mb-4 p-4 bg-purple-500/10 rounded-lg">
                    <div className="section-title font-bold mb-2 text-purple-600">{t('جرد الصندوق')}</div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>{t('الرصيد الافتتاحي')}:</span>
                        <span>{formatPrice(closingResult.opening_cash)}</span>
                      </div>
                      <div className="flex justify-between text-green-600">
                        <span>+ {t('المبيعات النقدية')}:</span>
                        <span>{formatPrice(closingResult.cash_sales)}</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>- {t('المصاريف')}:</span>
                        <span>{formatPrice(closingResult.total_expenses)}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-bold">
                        <span>{t('المتوقع في الصندوق')} ({t('نقداً')}):</span>
                        <span>{formatPrice(closingResult.expected_cash)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>{t('الجرد الفعلي')}:</span>
                        <span>{formatPrice(closingResult.closing_cash)}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className={`flex justify-between font-bold text-lg ${closingResult.cash_difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span>{t('الفرق')}:</span>
                        <span className="flex items-center gap-1">
                          {closingResult.cash_difference >= 0 ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            <XCircle className="h-5 w-5" />
                          )}
                          {formatPrice(Math.abs(closingResult.cash_difference))}
                          {closingResult.cash_difference >= 0 ? ` ${t('زيادة')}` : ` ${t('نقص')}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* المبالغ غير النقدية - للتوضيح */}
                  {(closingResult.card_sales > 0 || closingResult.credit_sales > 0) && (
                    <div className="section mb-4 p-4 bg-gray-500/10 rounded-lg">
                      <div className="section-title font-bold mb-2 text-gray-600">{t('مبالغ غير نقدية')} ({t('خارج الصندوق')})</div>
                      <p className="text-xs text-muted-foreground mb-2">{t('هذه المبالغ لا تحتسب في جرد الصندوق لأنها ليست نقداً')}</p>
                      <div className="space-y-1">
                        {closingResult.card_sales > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>💳 {t('بطاقات')}:</span>
                            <span className="text-blue-600">{formatPrice(closingResult.card_sales)}</span>
                          </div>
                        )}
                        {closingResult.credit_sales > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>📝 {t('آجل')}:</span>
                            <span className="text-orange-600">{formatPrice(closingResult.credit_sales)}</span>
                          </div>
                        )}
                        <Separator className="my-2" />
                        <div className="flex justify-between font-medium">
                          <span>{t('إجمالي غير نقدي')}:</span>
                          <span>{formatPrice((closingResult.card_sales || 0) + (closingResult.credit_sales || 0))}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* صافي الربح */}
                  <div className="section p-4 bg-primary/10 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold">{t('صافي الربح')}:</span>
                      <span className={`text-2xl font-bold ${closingResult.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPrice(closingResult.net_profit)}
                      </span>
                    </div>
                  </div>

                  {/* ملاحظات */}
                  {closingResult.notes && (
                    <div className="section mt-4 p-4 bg-muted/30 rounded-lg">
                      <div className="section-title font-bold mb-2">{t('ملاحظات')}</div>
                      <p className="text-sm">{closingResult.notes}</p>
                    </div>
                  )}
                </div>

                {/* أزرار الإجراءات */}
                <div className="flex gap-3 mt-6">
                  <Button onClick={handlePrintReport} className="flex-1 gap-2">
                    <Printer className="h-4 w-4" />
                    {t('طباعة التقرير')}
                  </Button>
                  <Button variant="destructive" onClick={handleCloseAndLogout} className="flex-1 gap-2">
                    <LogOut className="h-4 w-4" />
                    تسجيل الخروج
                  </Button>
                </div>
              </div>
            ) : cashSummary ? (
              /* نموذج إغلاق الصندوق */
              <div className="p-4 space-y-6">
                {/* معلومات الفرع والوردية */}
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{cashSummary.branch_name || t('الفرع')}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t('الكاشير')}: {cashSummary.cashier_name || user?.full_name || user?.username}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">{t('بداية الوردية')}</p>
                      <p className="text-sm font-medium">
                        {cashSummary.started_at ? new Date(cashSummary.started_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ملخص المبيعات */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-green-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">{t('إجمالي المبيعات')}</p>
                    <p className="text-lg font-bold text-green-600">{formatPrice(cashSummary.total_sales)}</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">{t('نقدي')}</p>
                    <p className="text-lg font-bold text-blue-600">{formatPrice(cashSummary.cash_sales)}</p>
                  </div>
                  <div className="p-3 bg-yellow-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">{t('المصاريف')}</p>
                    <p className="text-lg font-bold text-yellow-600">{formatPrice(cashSummary.total_expenses)}</p>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">{t('المتوقع')}</p>
                    <p className="text-lg font-bold text-purple-600">{formatPrice(cashSummary.expected_cash)}</p>
                  </div>
                </div>

                {/* جرد فئات النقود */}
                <div className="space-y-3">
                  <h3 className="font-bold flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-green-500" />
                    {t('جرد الصندوق')} ({t('فئات النقود')})
                  </h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {DENOMINATIONS.map((denom) => (
                      <div key={denom.value} className="flex items-center gap-2 p-2 border rounded-lg">
                        <div className={`w-12 h-8 ${denom.color} rounded flex items-center justify-center text-white text-xs font-bold`}>
                          {denom.label}
                        </div>
                        <span className="text-sm">×</span>
                        <Input
                          type="number"
                          min="0"
                          value={denominations[denom.value.toString()]}
                          onChange={(e) => updateDenomination(denom.value.toString(), e.target.value)}
                          className="w-20 h-8 text-center"
                          data-testid={`denom-${denom.value}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          = {formatPrice(denom.value * denominations[denom.value.toString()])}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* إجمالي الجرد */}
                  <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg">
                    <span className="font-bold">{t('إجمالي الجرد')}:</span>
                    <span className="text-2xl font-bold text-primary">{formatPrice(calculateCountedCash())}</span>
                  </div>

                  {/* الفرق */}
                  {calculateCountedCash() > 0 && (
                    <div className={`flex items-center justify-between p-4 rounded-lg ${
                      calculateCountedCash() - cashSummary.expected_cash >= 0 
                        ? 'bg-green-500/10' 
                        : 'bg-red-500/10'
                    }`}>
                      <span className="font-bold">{t('الفرق')}:</span>
                      <span className={`text-xl font-bold flex items-center gap-2 ${
                        calculateCountedCash() - cashSummary.expected_cash >= 0 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        {calculateCountedCash() - cashSummary.expected_cash >= 0 ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <AlertCircle className="h-5 w-5" />
                        )}
                        {formatPrice(calculateCountedCash() - cashSummary.expected_cash)}
                      </span>
                    </div>
                  )}
                </div>

                {/* ملاحظات */}
                <div className="space-y-2">
                  <Label>{t('ملاحظات')} ({t('اختياري')})</Label>
                  <Input
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder={t('أضف ملاحظات إن وجدت')}
                    data-testid="close-notes"
                  />
                </div>

                {/* زر الإغلاق */}
                <Button 
                  onClick={handleCloseRegister} 
                  className="w-full h-12 text-lg gap-2"
                  disabled={isClosing || calculateCountedCash() === 0}
                  data-testid="confirm-close-btn"
                >
                  {isClosing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      جاري الإغلاق...
                    </>
                  ) : (
                    <>
                      <Check className="h-5 w-5" />
                      {t('تأكيد إغلاق الصندوق والوردية')}
                    </>
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  * {t('سيتم إغلاق الوردية الحالية تلقائياً عند إغلاق الصندوق')}
                </p>
              </div>
            ) : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Dashboard Background Dialog */}
      <Dialog open={showBackgroundDialog} onOpenChange={setShowBackgroundDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="h-5 w-5 text-pink-500" />
              خلفية لوحة التحكم
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
              {/* رفع خلفية جديدة */}
              <div className="p-4 border-2 border-dashed border-border rounded-lg text-center">
                <label className="cursor-pointer block">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadBackground}
                    disabled={uploadingBg}
                  />
                  {uploadingBg ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      {t('جاري الرفع')}...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Plus className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t('اضغط لرفع صورة جديدة')}</p>
                    </div>
                  )}
                </label>
              </div>

              {/* زر إزالة الخلفية */}
              {selectedBackground && (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-red-500 text-red-500 hover:bg-red-500/10"
                  onClick={handleRemoveBackground}
                >
                  <X className="h-4 w-4" />
                  {t('إزالة الخلفية الحالية')}
                </Button>
              )}

              {/* الخلفيات المتاحة */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {dashboardBackgrounds.map((bg, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectBackground(bg)}
                    className={`relative cursor-pointer rounded-lg overflow-hidden aspect-video border-2 transition-all ${
                      selectedBackground === bg
                        ? 'border-pink-500 ring-2 ring-pink-500/30'
                        : 'border-transparent hover:border-pink-500/50'
                    }`}
                  >
                    <img
                      src={bg}
                      alt={`Background ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {selectedBackground === bg && (
                      <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                        <Check className="h-8 w-8 text-white drop-shadow-lg" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {dashboardBackgrounds.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('لا توجد خلفيات متاحة')}</p>
                  <p className="text-sm">{t('قم برفع صورة جديدة')}</p>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBackgroundDialog(false)}>
              {t('إغلاق')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day Management Dialog - إدارة اليوم */}
      <Dialog open={showDayCloseDialog} onOpenChange={setShowDayCloseDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {t('إدارة اليوم وترحيل البيانات')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* معلومات الحالة */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('الورديات المفتوحة')}</p>
                      <p className="text-2xl font-bold">{dayStatus?.open_shifts_count || 0}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      dayStatus?.open_shifts_count > 0 ? 'bg-green-500/10' : 'bg-muted'
                    }`}>
                      <Clock className={`h-5 w-5 ${dayStatus?.open_shifts_count > 0 ? 'text-green-500' : 'text-muted-foreground'}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('الطلبات المعلقة')}</p>
                      <p className="text-2xl font-bold">{dayStatus?.pending_orders_count || 0}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      dayStatus?.pending_orders_count > 0 ? 'bg-orange-500/10' : 'bg-muted'
                    }`}>
                      <ShoppingCart className={`h-5 w-5 ${dayStatus?.pending_orders_count > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* مدة الوردية */}
            {dayStatus?.oldest_shift_hours > 0 && (
              <div className={`p-3 rounded-lg border ${
                dayStatus.oldest_shift_hours >= 24 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-blue-500/10 border-blue-500/30'
              }`}>
                <p className="text-sm">
                  <strong>{t('مدة أقدم وردية')}:</strong> {Math.floor(dayStatus.oldest_shift_hours)} {t('ساعة')} {t('و')} {Math.floor((dayStatus.oldest_shift_hours % 1) * 60)} {t('دقيقة')}
                </p>
              </div>
            )}

            {/* قائمة الطلبات المعلقة */}
            {dayStatus?.pending_orders?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">{t('الطلبات المعلقة التي تحتاج إغلاق')}:</h4>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {dayStatus.pending_orders.map(order => (
                    <div key={order.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">#{order.order_number}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          order.status === 'pending' ? 'bg-yellow-500/20 text-yellow-600' :
                          order.status === 'preparing' ? 'bg-blue-500/20 text-blue-600' :
                          'bg-green-500/20 text-green-600'
                        }`}>
                          {order.status === 'pending' ? t('قيد الانتظار') : order.status === 'preparing' ? t('قيد التحضير') : t('جاهز')}
                        </span>
                      </div>
                      <span className="font-bold">{formatPrice(order.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* آخر إغلاق */}
            {dayStatus?.last_day_close && (
              <div className="p-3 bg-muted/30 rounded-lg text-sm">
                <p className="text-muted-foreground">
                  {t('آخر إغلاق')}: {new Date(dayStatus.last_day_close.closed_at).toLocaleDateString('en-GB')} - 
                  {t('بواسطة')}: {dayStatus.last_day_close.closed_by}
                </p>
              </div>
            )}

            {/* تحذير */}
            {dayStatus?.pending_orders_count > 0 && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-600">{t('تحذير')}: {t('يوجد طلبات معلقة')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('يُفضل إغلاق جميع الطلبات قبل ترحيل اليوم')}
                  </p>
                </div>
              </div>
            )}

          </div>

          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowDayCloseDialog(false)}>
              {t('إلغاء')}
            </Button>
            
            {/* زر إرسال التقرير بالبريد */}
            <Button 
              variant="outline"
              onClick={async () => {
                try {
                  const branchIdParam = getBranchIdForApi();
                  const params = {};
                  if (branchIdParam) params.branch_id = branchIdParam;
                  
                  const res = await axios.post(`${API}/day-management/send-report`, {
                    recipient_emails: [user?.email],
                    include_all_branches: true
                  }, { params });
                  
                  if (res.data.success) {
                    toast.success(t('تم إرسال التقرير إلى بريدك الإلكتروني'));
                  } else {
                    toast.info(t('تم إنشاء التقرير - خدمة البريد غير متاحة'));
                  }
                } catch (error) {
                  toast.error(t('فشل في إرسال التقرير'));
                }
              }}
              className="gap-1"
              data-testid="send-report-email-btn"
            >
              <Mail className="h-4 w-4" />
              {t('إرسال تقرير بالبريد')}
            </Button>
            
            {dayStatus?.pending_orders_count > 0 ? (
              <>
                <Button 
                  variant="outline"
                  onClick={() => navigate('/orders')}
                  className="gap-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  معالجة الطلبات
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => handleCloseDay(true)}
                  disabled={closingDay}
                  className="gap-2"
                >
                  {closingDay ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  إغلاق إجباري
                </Button>
              </>
            ) : (
              <Button 
                onClick={() => handleCloseDay(false)}
                disabled={closingDay || dayStatus?.open_shifts_count === 0}
                className="gap-2"
              >
                {closingDay ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {t('إغلاق اليوم وترحيل')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Menu Link Dialog - رابط قائمة العملاء */}
      <Dialog open={showMenuLinkDialog} onOpenChange={setShowMenuLinkDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 justify-center">
              <Share2 className="h-5 w-5 text-orange-500" />
              {t('رمز QR للقائمة')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* QR Code للقائمة - يوجه للرابط الجديد menu.html */}
            <div className="bg-white rounded-xl p-6 text-center">
              <div id="qr-code-container" className="bg-white p-4 rounded-xl inline-block border-4 border-orange-100">
                <QRCodeSVG 
                  value={`${window.location.origin}/menu.html${menuLink ? '?r=' + menuLink.split('/').pop() : ''}`} 
                  size={200}
                  level="H"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <p className="text-sm font-medium mt-4 text-gray-600">{t('امسح الكود للوصول للقائمة')}</p>
              <p className="text-xs text-orange-500 mt-2">
                💡 {t('يمكن للزبائن تثبيت التطبيق من هذا الرابط')}
              </p>
            </div>
            
            {/* زر تنزيل فقط */}
            <Button 
              className="w-full gap-2 bg-orange-500 hover:bg-orange-600" 
              onClick={() => {
                const svg = document.querySelector('#qr-code-container svg');
                if (svg) {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  const svgData = new XMLSerializer().serializeToString(svg);
                  const img = new window.Image();
                  
                  canvas.width = 300;
                  canvas.height = 300;
                  
                  img.onload = () => {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 50, 50, 200, 200);
                    
                    const link = document.createElement('a');
                    link.download = 'menu-qr-code.png';
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    toast.success(t('تم تنزيل QR Code!'));
                  };
                  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                }
              }}
            >
              <Download className="h-4 w-4" />
              {t('تنزيل QR Code')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
