import React, { useState, useEffect } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatPrice } from '../utils/currency';
import { useTranslation } from '../hooks/useTranslation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import {
  Building2,
  Users,
  ShoppingCart,
  DollarSign,
  Plus,
  Search,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  RefreshCw,
  Key,
  Power,
  PowerOff,
  Copy,
  Check,
  Crown,
  TrendingUp,
  Calendar,
  Mail,
  Phone,
  Globe,
  LogOut,
  Settings,
  BarChart3,
  ArrowLeft,
  Activity,
  Clock,
  Package,
  AlertTriangle,
  ExternalLink,
  UserCheck,
  Layers,
  RotateCcw,
  Image,
  Image as ImageIcon,
  Palette,
  Upload,
  Play,
  Pause,
  Move,
  Maximize,
  X,
  Receipt,
  Loader2,
  Crop,
  // Icons for features modal
  Monitor,
  LayoutGrid,
  FileText,
  Wallet,
  Truck,
  ChefHat,
  ArrowLeftRight,
  Headphones,
  Gift,
  Tag,
  UtensilsCrossed,
  CalendarDays,
  BrainCircuit,
  GitBranch,
  Star,
  User,
  FolderTree,
  Printer,
  Bell,
  Sparkles,
  QrCode,
  Save,
  Coins,
  Banknote,
  ArrowUpDown,
  Languages,
  AlertCircle
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import ImageCropper from '../components/ImageCropper';

const API = API_URL;

// مفتاح Super Admin السري
const SUPER_ADMIN_SECRET = "271018";

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { t, lang, isRTL } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('super_admin_token'));
  const [user, setUser] = useState(null);
  
  // Login/Register states
  const [showRegister, setShowRegister] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '', secret_key: '' });
  const [registerForm, setRegisterForm] = useState({ email: '', password: '', full_name: '', secret_key: '' });
  const [loading, setLoading] = useState(false);
  
  // Data states
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantDetails, setTenantDetails] = useState(null);
  const [liveStats, setLiveStats] = useState(null);
  
  // Modal states
  const [showNewTenant, setShowNewTenant] = useState(false);
  const [showTenantDetails, setShowTenantDetails] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showLiveView, setShowLiveView] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetSalesConfirm, setShowResetSalesConfirm] = useState(false);
  const [showResetInventoryConfirm, setShowResetInventoryConfirm] = useState(false);
  const [showEditTenant, setShowEditTenant] = useState(false);
  const [showInvoiceSettings, setShowInvoiceSettings] = useState(false);
  
  // System logo upload states
  const [systemLogoFile, setSystemLogoFile] = useState(null);
  const [systemLogoPreview, setSystemLogoPreview] = useState('');
  const [uploadingSystemLogo, setUploadingSystemLogo] = useState(false);
  
  // Image Cropper states
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [cropperType, setCropperType] = useState('system'); // system, login, background, tenant
  const [cropperAspectRatio, setCropperAspectRatio] = useState(1);
  const [cropperTitle, setCropperTitle] = useState(t('تعديل الصورة'));
  
  // Invoice settings for system
  const [invoiceSettings, setInvoiceSettings] = useState({
    system_name: '',
    system_name_ar: '',
    system_name_en: '',
    system_logo_url: '',
    thank_you_message: 'شكراً لزيارتكم',
    system_phone: '',
    system_phone2: '',
    system_email: '',
    system_website: '',
    footer_text: '',
    show_system_branding: true
  });

  // Owner settings
  const [ownerSettings, setOwnerSettings] = useState(null);
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [confirmOwnerPassword, setConfirmOwnerPassword] = useState('');
  const [newOwnerSecretKey, setNewOwnerSecretKey] = useState('');
  const [savingOwnerSettings, setSavingOwnerSettings] = useState(false);

  // Login page settings
  const [loginPageSettings, setLoginPageSettings] = useState({
    enable_animation: true,
    transition_type: 'fade',
    transition_duration: 1.5,
    auto_change: true,
    logo_animation: 'pulse',
    backgrounds: [],
    login_logo_enabled: true,
    login_logo_url: '',
    accent_color: 'rgba(147, 51, 234, 0.5)'
  });
  
  // New tenant form
  const [newTenantForm, setNewTenantForm] = useState({
    name: '',
    slug: '',
    owner_name: '',
    owner_email: '',
    owner_phone: '',
    subscription_type: 'trial',
    subscription_duration: 1,
    max_branches: 1,
    max_users: 5,
    is_demo: false
  });
  
  // Edit tenant form
  const [editTenantForm, setEditTenantForm] = useState({
    name: '',
    name_ar: '',
    name_en: '',
    owner_name: '',
    owner_email: '',
    owner_phone: '',
    subscription_type: 'trial',
    max_branches: 1,
    max_users: 5,
    send_welcome_email: false,
    temp_password: '',
    logo_url: ''
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  
  // Tenant features
  const [showFeaturesModal, setShowFeaturesModal] = useState(false);
  const [tenantFeatures, setTenantFeatures] = useState({
    // الميزات الأساسية
    showPOS: true,
    showTables: true,
    showOrders: true,
    showExpenses: true,
    showInventory: true,
    showDelivery: true,
    showReports: true,
    showSettings: true,
    showHR: false,
    showWarehouse: false,
    showCallLogs: false,
    showCallCenter: false,
    showKitchen: false,
    showLoyalty: true,
    showCoupons: true,
    showRecipes: false,
    showReservations: true,
    showReviews: true,
    showSmartReports: true,
    showPurchasing: false,
    showBranchOrders: false,
    showCustomerMenu: true,
    // خيارات الإعدادات
    settingsUsers: true,
    settingsCustomers: true,
    settingsBranches: true,
    settingsCategories: true,
    settingsProducts: true,
    settingsPrinters: true,
    settingsDeliveryCompanies: true,
    settingsCallCenter: true,
    settingsNotifications: true
  });
  const [featuresLoading, setFeaturesLoading] = useState(false);
  
  // Notifications states
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({
    days_before_expiry: 15,
    email_notifications: false,
    push_notifications: true,
    notify_new_tenant: true,
    notify_tenant_status: true
  });
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [expiringSubscriptions, setExpiringSubscriptions] = useState({ expiring_soon: [], already_expired: [] });
  
  // لوحة معلومات الاشتراكات
  const [subscriptionsDashboard, setSubscriptionsDashboard] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  
  // أسعار الاشتراكات
  const [showPricesModal, setShowPricesModal] = useState(false);
  const [subscriptionPrices, setSubscriptionPrices] = useState({
    bronze: 15,
    silver: 30,
    gold: 50,
    basic: 25,
    premium: 50
  });
  const [savingPrices, setSavingPrices] = useState(false);
  
  // Currency Conversion States - حالات تحويل العملات
  const [currencySettings, setCurrencySettings] = useState({
    preferred_currency: 'USD',
    use_live_rates: false,
    custom_rates: {}
  });
  const [salesSummary, setSalesSummary] = useState(null);
  const [loadingSalesSummary, setLoadingSalesSummary] = useState(false);
  const [liveRates, setLiveRates] = useState(null);
  const [loadingLiveRates, setLoadingLiveRates] = useState(false);
  const [showCurrencySettingsModal, setShowCurrencySettingsModal] = useState(false);
  const [savingCurrencySettings, setSavingCurrencySettings] = useState(false);
  
  const [newPassword, setNewPassword] = useState('');
  const [copiedCredentials, setCopiedCredentials] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  
  // Background settings states
  const [backgroundSettings, setBackgroundSettings] = useState({
    backgrounds: [],
    animation_enabled: true,
    transition_type: 'fade',
    transition_duration: 1.5,
    auto_play: true,
    show_logo: true,
    logo_url: '',
    logo_animation: 'pulse',
    overlay_color: 'rgba(0,0,0,0.5)',
    text_color: '#ffffff'
  });
  const [showAddBackground, setShowAddBackground] = useState(false);
  const [newBackgroundUrl, setNewBackgroundUrl] = useState('');
  const [newBackgroundTitle, setNewBackgroundTitle] = useState('');
  const [newBackgroundAnimation, setNewBackgroundAnimation] = useState('fade');
  const [backgroundsLoading, setBackgroundsLoading] = useState(false);
  const [backgroundUploadMode, setBackgroundUploadMode] = useState('url'); // 'url' or 'device'
  const [selectedBackgroundFile, setSelectedBackgroundFile] = useState(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState('');
  
  // Login Logo States
  const [loginLogoFile, setLoginLogoFile] = useState(null);
  const [loginLogoPreview, setLoginLogoPreview] = useState('');
  const [loginLogoUploading, setLoginLogoUploading] = useState(false);
  const [loginLogoMode, setLoginLogoMode] = useState('url'); // 'url' or 'upload'
  
  // System Branding State
  const [systemBranding, setSystemBranding] = useState({
    name: 'Maestro',
    name_ar: 'Maestro',
    name_en: 'Maestro',
    logo_url: null
  });
  const [brandingLoading, setBrandingLoading] = useState(false);

  // للتعامل مع معاينة الملف المرفوع
  const handleBackgroundFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedBackgroundFile(file);
      const url = URL.createObjectURL(file);
      setBackgroundPreviewUrl(url);
    }
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      verifyToken();
    } else {
      // تحقق إذا كان هناك token قديم غير صالح
      localStorage.removeItem('super_admin_token');
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      fetchBackgroundSettings();
      fetchSystemBranding();
      fetchInvoiceSettings();
      fetchLoginPageSettings();
      fetchNotifications();
      fetchNotificationSettings();
      fetchExpiringSubscriptions();
      fetchSubscriptionsDashboard();
      fetchOwnerSettings();
      fetchCurrencySettings();
      fetchSalesSummary();
    }
  }, [isAuthenticated]);

  // Auto-refresh notifications every 30 seconds
  useEffect(() => {
    let interval;
    if (isAuthenticated) {
      interval = setInterval(() => {
        fetchNotifications();
        fetchExpiringSubscriptions();
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Auto-refresh live stats
  useEffect(() => {
    let interval;
    if (showLiveView && selectedTenant) {
      fetchLiveStats(selectedTenant.id);
      interval = setInterval(() => fetchLiveStats(selectedTenant.id), 10000);
    }
    return () => clearInterval(interval);
  }, [showLiveView, selectedTenant]);

  const verifyToken = async () => {
    try {
      const res = await axios.get(`${API}/auth/me`);
      if (res.data.role === 'super_admin') {
        setUser(res.data);
        setIsAuthenticated(true);
      } else {
        console.log('Not super admin, logging out');
        logout();
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      logout();
    }
  };

  const fetchData = async () => {
    try {
      console.log('Fetching data...');
      const [tenantsRes, statsRes] = await Promise.all([
        axios.get(`${API}/super-admin/tenants`),
        axios.get(`${API}/super-admin/stats`)
      ]);
      console.log('Tenants:', tenantsRes.data);
      setTenants(tenantsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error(t('فشل في جلب البيانات'));
    }
  };

  const fetchLiveStats = async (tenantId) => {
    try {
      const res = await axios.get(`${API}/super-admin/tenants/${tenantId}/live-stats`);
      setLiveStats(res.data);
    } catch (error) {
      console.error('Failed to fetch live stats:', error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await axios.post(`${API}/super-admin/login`, {
        email: loginForm.email,
        password: loginForm.password,
        secret_key: loginForm.secret_key
      });
      
      localStorage.setItem('super_admin_token', res.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      setToken(res.data.token);
      setUser(res.data.user);
      setIsAuthenticated(true);
      toast.success(t('تم تسجيل الدخول بنجاح'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل تسجيل الدخول'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await axios.post(`${API}/super-admin/register`, {
        email: registerForm.email,
        password: registerForm.password,
        full_name: registerForm.full_name,
        secret_key: registerForm.secret_key
      });
      
      localStorage.setItem('super_admin_token', res.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      setToken(res.data.token);
      setUser(res.data.user);
      setIsAuthenticated(true);
      toast.success(t('تم إنشاء الحساب بنجاح'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل إنشاء الحساب'));
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('super_admin_token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  // ==================== دوال الإشعارات ====================
  
  const fetchNotifications = async () => {
    try {
      const res = await axios.get(`${API}/super-admin/notifications`);
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const fetchNotificationSettings = async () => {
    try {
      const res = await axios.get(`${API}/super-admin/notification-settings`);
      setNotificationSettings(res.data);
    } catch (error) {
      console.error('Error fetching notification settings:', error);
    }
  };

  const saveNotificationSettings = async () => {
    try {
      await axios.put(`${API}/super-admin/notification-settings`, notificationSettings);
      toast.success(t('تم حفظ إعدادات الإشعارات'));
      setShowNotificationSettings(false);
    } catch (error) {
      toast.error(t('فشل في حفظ الإعدادات'));
    }
  };

  const fetchExpiringSubscriptions = async () => {
    try {
      const res = await axios.get(`${API}/super-admin/expiring-subscriptions`);
      setExpiringSubscriptions(res.data);
    } catch (error) {
      console.error('Error fetching expiring subscriptions:', error);
    }
  };

  const markNotificationAsRead = async (notificationId) => {
    try {
      await axios.put(`${API}/super-admin/notifications/${notificationId}/read`);
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllNotificationsAsRead = async () => {
    try {
      await axios.put(`${API}/super-admin/notifications/read-all`);
      fetchNotifications();
      toast.success(t('تم تعليم جميع الإشعارات كمقروءة'));
    } catch (error) {
      toast.error(t('فشل في تعليم الإشعارات'));
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await axios.delete(`${API}/super-admin/notifications/${notificationId}`);
      fetchNotifications();
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const clearAllNotifications = async () => {
    try {
      await axios.delete(`${API}/super-admin/notifications`);
      fetchNotifications();
      toast.success(t('تم حذف جميع الإشعارات'));
    } catch (error) {
      toast.error(t('فشل في حذف الإشعارات'));
    }
  };

  // تفعيل/تعطيل العميل مع إشعار
  const toggleTenantStatus = async (tenant) => {
    try {
      if (tenant.is_active) {
        await axios.put(`${API}/super-admin/tenants/${tenant.id}/deactivate`);
        toast.success('تم تعطيل العميل');
      } else {
        await axios.put(`${API}/super-admin/tenants/${tenant.id}/reactivate`);
        toast.success('تم تفعيل العميل');
      }
      fetchData();
      fetchNotifications();
      fetchSubscriptionsDashboard();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('حدث خطأ'));
    }
  };

  // جلب لوحة معلومات الاشتراكات
  const fetchSubscriptionsDashboard = async () => {
    setLoadingDashboard(true);
    try {
      const res = await axios.get(`${API}/super-admin/subscriptions-dashboard`);
      setSubscriptionsDashboard(res.data);
      
      // تحديث الأسعار من البيانات
      if (res.data.subscription_prices) {
        setSubscriptionPrices({
          basic: res.data.subscription_prices.basic?.monthly || 25,
          premium: res.data.subscription_prices.premium?.monthly || 50
        });
      }
    } catch (error) {
      console.error('Error fetching subscriptions dashboard:', error);
    } finally {
      setLoadingDashboard(false);
    }
  };

  // حفظ أسعار الاشتراكات
  const saveSubscriptionPrices = async () => {
    setSavingPrices(true);
    try {
      await axios.put(`${API}/super-admin/subscription-prices`, subscriptionPrices);
      toast.success(t('تم حفظ أسعار الاشتراكات'));
      setShowPricesModal(false);
      fetchSubscriptionsDashboard();
    } catch (error) {
      toast.error(t('فشل في حفظ الأسعار'));
    } finally {
      setSavingPrices(false);
    }
  };

  // ==================== Currency Functions ====================
  
  // جلب إعدادات العملة للمالك
  const fetchCurrencySettings = async () => {
    try {
      const res = await axios.get(`${API}/super-admin/currency-settings`);
      setCurrencySettings(res.data);
    } catch (error) {
      console.error('Error fetching currency settings:', error);
    }
  };

  // جلب ملخص المبيعات مع تحويل العملة
  const fetchSalesSummary = async (displayCurrency = currencySettings.preferred_currency) => {
    setLoadingSalesSummary(true);
    try {
      const res = await axios.get(`${API}/super-admin/sales-summary`, {
        params: { display_currency: displayCurrency }
      });
      setSalesSummary(res.data);
    } catch (error) {
      console.error('Error fetching sales summary:', error);
      toast.error(t('فشل في جلب ملخص المبيعات'));
    } finally {
      setLoadingSalesSummary(false);
    }
  };

  // جلب أسعار الصرف الحية
  const fetchLiveRates = async () => {
    setLoadingLiveRates(true);
    try {
      const res = await axios.get(`${API}/super-admin/live-exchange-rates`);
      setLiveRates(res.data);
      if (res.data.success) {
        toast.success(t('تم جلب أسعار الصرف الحية'));
      } else {
        toast.info(res.data.message || t('يتم استخدام الأسعار الثابتة'));
      }
    } catch (error) {
      console.error('Error fetching live rates:', error);
      toast.error(t('فشل في جلب أسعار الصرف'));
    } finally {
      setLoadingLiveRates(false);
    }
  };

  // حفظ إعدادات العملة
  const saveCurrencySettings = async () => {
    setSavingCurrencySettings(true);
    try {
      await axios.put(`${API}/super-admin/currency-settings`, currencySettings);
      toast.success(t('تم حفظ إعدادات العملة'));
      setShowCurrencySettingsModal(false);
      // تحديث ملخص المبيعات بالعملة الجديدة
      fetchSalesSummary(currencySettings.preferred_currency);
    } catch (error) {
      toast.error(t('فشل في حفظ إعدادات العملة'));
    } finally {
      setSavingCurrencySettings(false);
    }
  };

  // تحديث سعر صرف مخصص
  const updateCustomRate = async (fromCurrency, toCurrency, rate) => {
    try {
      await axios.put(`${API}/super-admin/custom-exchange-rate`, null, {
        params: { from_currency: fromCurrency, to_currency: toCurrency, rate }
      });
      toast.success(t('تم تحديث سعر صرف') + ` ${fromCurrency}`);
      fetchCurrencySettings();
    } catch (error) {
      toast.error(t('فشل في تحديث سعر الصرف'));
    }
  };

  // ==================== End Currency Functions ====================

  const createTenant = async () => {
    setLoading(true);
    
    try {
      const res = await axios.post(`${API}/super-admin/tenants`, {
        ...newTenantForm,
        is_demo: newTenantForm.is_demo
      });
      toast.success(t('تم إنشاء العميل بنجاح'));
      
      setCopiedCredentials(res.data.admin_credentials);
      fetchData();
      fetchNotifications(); // تحديث الإشعارات
      setShowNewTenant(false);
      
      // Reset form
      setNewTenantForm({
        name: '',
        slug: '',
        owner_name: '',
        owner_email: '',
        owner_phone: '',
        subscription_type: 'trial',
        subscription_duration: 1,
        max_branches: 1,
        max_users: 5,
        is_demo: false
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل إنشاء العميل'));
    } finally {
      setLoading(false);
    }
  };

  const viewTenantDetails = async (tenant) => {
    setSelectedTenant(tenant);
    setShowTenantDetails(true);
    
    try {
      const res = await axios.get(`${API}/super-admin/tenants/${tenant.id}`);
      setTenantDetails(res.data);
    } catch (error) {
      toast.error(t('فشل في جلب التفاصيل'));
    }
  };

  const openLiveView = async (tenant) => {
    setSelectedTenant(tenant);
    setShowLiveView(true);
    await fetchLiveStats(tenant.id);
  };

  const impersonateTenant = async (tenant) => {
    try {
      const res = await axios.post(`${API}/super-admin/impersonate/${tenant.id}`);
      
      // حفظ token الأصلي للرجوع
      localStorage.setItem('original_super_admin_token', token);
      
      // استخدام token العميل
      localStorage.setItem('token', res.data.token);
      
      toast.success(t('جاري الدخول كـ') + ` ${tenant.name}...`);
      
      // إعادة التوجيه للصفحة الرئيسية
      window.location.href = '/';
    } catch (error) {
      toast.error(t('فشل الدخول كعميل'));
    }
  };

  const deleteTenant = async () => {
    try {
      await axios.delete(`${API}/super-admin/tenants/${selectedTenant.id}?permanent=true`);
      toast.success(t('تم حذف العميل نهائياً'));
      setShowDeleteConfirm(false);
      setSelectedTenant(null);
      fetchData();
    } catch (error) {
      toast.error(t('فشل في حذف العميل'));
    }
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error(t('كلمة المرور يجب أن تكون 6 أحرف على الأقل'));
      return;
    }
    
    try {
      await axios.post(`${API}/super-admin/tenants/${selectedTenant.id}/reset-password`, null, {
        params: { new_password: newPassword }
      });
      toast.success(t('تم إعادة تعيين كلمة المرور'));
      setShowResetPassword(false);
      setNewPassword('');
    } catch (error) {
      toast.error(t('فشل في إعادة تعيين كلمة المرور'));
    }
  };

  const resetTenantSales = async () => {
    try {
      await axios.post(`${API}/super-admin/tenants/${selectedTenant.id}/reset-sales?confirm=true`);
      toast.success(t('تم تصفير المبيعات بنجاح'));
      setShowResetSalesConfirm(false);
      setSelectedTenant(null);
      fetchData();
    } catch (error) {
      toast.error(t('فشل في تصفير المبيعات'));
    }
  };

  const resetTenantInventory = async () => {
    try {
      await axios.post(`${API}/super-admin/tenants/${selectedTenant.id}/reset-inventory?confirm=true`);
      toast.success(t('تم تصفير بيانات المخزون بنجاح'));
      setShowResetInventoryConfirm(false);
      setSelectedTenant(null);
      fetchData();
    } catch (error) {
      toast.error(t('فشل في تصفير المخزون') + ': ' + (error.response?.data?.detail || error.message));
    }
  };

  const openEditTenant = (tenant) => {
    setSelectedTenant(tenant);
    setEditTenantForm({
      name: tenant.name || '',
      name_ar: tenant.name_ar || '',
      name_en: tenant.name_en || '',
      owner_name: tenant.owner_name || '',
      owner_email: tenant.owner_email || '',
      owner_phone: tenant.owner_phone || '',
      subscription_type: tenant.subscription_type || 'trial',
      max_branches: tenant.max_branches || 1,
      max_users: tenant.max_users || 5,
      send_welcome_email: false,
      temp_password: '',
      logo_url: tenant.logo_url || ''
    });
    // تحويل المسار النسبي إلى مطلق للمعاينة
    const logoUrl = tenant.logo_url || '';
    if (logoUrl.startsWith('/api')) {
      setLogoPreviewUrl(`${API}${logoUrl.replace('/api', '')}`);
    } else {
      setLogoPreviewUrl(logoUrl);
    }
    setLogoFile(null);
    setShowEditTenant(true);
  };

  const updateTenant = async () => {
    setLoading(true);
    try {
      // رفع الشعار أولاً إذا تم اختياره
      let logoUrl = editTenantForm.logo_url;
      
      if (logoFile) {
        const uploadedLogoUrl = await uploadTenantLogo(logoFile, selectedTenant.id);
        if (uploadedLogoUrl) {
          logoUrl = uploadedLogoUrl;
        }
      }

      const updateData = {
        name: editTenantForm.name,
        name_ar: editTenantForm.name_ar,
        name_en: editTenantForm.name_en,
        owner_name: editTenantForm.owner_name,
        owner_email: editTenantForm.owner_email,
        owner_phone: editTenantForm.owner_phone,
        subscription_type: editTenantForm.subscription_type,
        max_branches: editTenantForm.max_branches,
        max_users: editTenantForm.max_users,
        send_welcome_email: editTenantForm.send_welcome_email,
        temp_password: editTenantForm.temp_password,
        logo_url: logoUrl
      };
      
      await axios.put(`${API}/super-admin/tenants/${selectedTenant.id}`, updateData);
      
      if (editTenantForm.send_welcome_email) {
        toast.success(t('تم تحديث البيانات وإرسال البريد الإلكتروني'));
      } else {
        toast.success(t('تم تحديث بيانات العميل بنجاح'));
      }
      
      setShowEditTenant(false);
      setLogoFile(null);
      setLogoPreviewUrl('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحديث البيانات'));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success(t('تم النسخ'));
  };

  // ==================== Invoice Settings Functions ====================
  
  const fetchInvoiceSettings = async () => {
    try {
      const res = await axios.get(`${API}/system/invoice-settings`);
      setInvoiceSettings(res.data);
    } catch (error) {
      console.log('Error fetching invoice settings');
    }
  };
  
  const saveInvoiceSettings = async () => {
    setLoading(true);
    try {
      await axios.put(`${API}/system/invoice-settings`, invoiceSettings);
      toast.success(t('تم حفظ إعدادات الفاتورة بنجاح'));
      setShowInvoiceSettings(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ الإعدادات');
    } finally {
      setLoading(false);
    }
  };

  // فتح أداة قص الصور
  const openImageCropper = (type, aspectRatio = 1, title = t('تعديل الصورة')) => {
    setCropperType(type);
    setCropperAspectRatio(aspectRatio);
    setCropperTitle(title);
    setShowImageCropper(true);
  };

  // معالجة الصورة المقصوصة
  const handleCroppedImage = async (file) => {
    switch (cropperType) {
      case 'system':
        await uploadSystemLogo(file);
        break;
      case 'login':
        await uploadLoginLogo(file);
        break;
      case 'background':
        // رفع الخلفية مباشرة
        setBackgroundsLoading(true);
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('title', newBackgroundTitle || 'خلفية جديدة');
          formData.append('animation_type', newBackgroundAnimation);
          
          const token = localStorage.getItem('super_admin_token');
          
          const res = await axios.post(`${API}/upload/background`, formData, {
            headers: { 
              'Content-Type': 'multipart/form-data',
              'Authorization': `Bearer ${token}`
            }
          });
          
          setBackgroundSettings(prev => ({
            ...prev,
            backgrounds: [...prev.backgrounds, res.data.background]
          }));
          
          setShowAddBackground(false);
          setNewBackgroundUrl('');
          setNewBackgroundTitle('');
          setNewBackgroundAnimation('fade');
          setSelectedBackgroundFile(null);
          setBackgroundPreviewUrl('');
          toast.success(t('تم رفع الخلفية بنجاح'));
        } catch (error) {
          console.error('Upload background error:', error);
          toast.error(error.response?.data?.detail || t('فشل في رفع الخلفية'));
        } finally {
          setBackgroundsLoading(false);
        }
        break;
      case 'tenant':
        if (selectedTenant) {
          const logoUrl = await uploadTenantLogo(file, selectedTenant.id);
          if (logoUrl) {
            setSelectedTenant({...selectedTenant, logo_url: logoUrl});
            toast.success(t('تم رفع شعار العميل بنجاح'));
          }
        }
        break;
      default:
        break;
    }
  };

  // رفع شعار النظام
  const uploadSystemLogo = async (file) => {
    if (!file) return;
    
    setUploadingSystemLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // الحصول على الـ token من localStorage
      const token = localStorage.getItem('super_admin_token');
      
      const res = await axios.post(`${API}/upload/logo`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });
      
      const logoUrl = res.data.url || res.data.logo_url;
      setInvoiceSettings({...invoiceSettings, system_logo_url: logoUrl});
      setSystemBranding({...systemBranding, logo_url: logoUrl});
      setSystemLogoPreview('');
      setSystemLogoFile(null);
      toast.success(t('تم رفع الشعار بنجاح'));
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t('فشل في رفع الشعار') + ': ' + (error.response?.data?.detail || error.message));
    } finally {
      setUploadingSystemLogo(false);
    }
  };

  const fetchLoginPageSettings = async () => {
    try {
      const res = await axios.get(`${API}/system/login-page-settings`);
      if (res.data) {
        setLoginPageSettings(res.data);
      }
    } catch (error) {
      console.log('Error fetching login page settings');
    }
  };

  const saveLoginPageSettings = async () => {
    setLoading(true);
    try {
      await axios.put(`${API}/system/login-page-settings`, loginPageSettings);
      toast.success(t('تم حفظ إعدادات صفحة الدخول بنجاح'));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حفظ الإعدادات');
    } finally {
      setLoading(false);
    }
  };

  // ==================== System Branding Functions ====================
  
  const fetchSystemBranding = async () => {
    try {
      const res = await axios.get(`${API}/system/branding`);
      setSystemBranding(res.data);
      if (res.data.logo_url) {
        const logoUrl = res.data.logo_url;
        if (logoUrl.startsWith('/api')) {
          setSystemLogoPreview(`${API}${logoUrl.replace('/api', '')}`);
        } else {
          setSystemLogoPreview(logoUrl);
        }
      }
    } catch (error) {
      console.log('Error fetching system branding');
    }
  };

  // جلب إعدادات المالك
  const fetchOwnerSettings = async () => {
    try {
      const res = await axios.get(`${API}/super-admin/owner-settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOwnerSettings(res.data);
    } catch (error) {
      console.log('Error fetching owner settings');
    }
  };

  // تحديث إعدادات المالك
  const updateOwnerSettings = async () => {
    if (newOwnerPassword && newOwnerPassword !== confirmOwnerPassword) {
      toast.error(t('كلمات المرور غير متطابقة'));
      return;
    }
    
    setSavingOwnerSettings(true);
    try {
      const updateData = {};
      if (newOwnerPassword) {
        updateData.password = newOwnerPassword;
      }
      if (newOwnerSecretKey) {
        updateData.secret_key = newOwnerSecretKey;
      }
      
      if (Object.keys(updateData).length === 0) {
        toast.info(t('لم يتم إجراء أي تغييرات'));
        setSavingOwnerSettings(false);
        return;
      }
      
      await axios.put(`${API}/super-admin/owner-settings`, updateData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(t('تم تحديث إعدادات المالك بنجاح'));
      setNewOwnerPassword('');
      setConfirmOwnerPassword('');
      setNewOwnerSecretKey('');
    } catch (error) {
      console.error('Error updating owner settings:', error);
      const errorMsg = error.response?.data?.detail || t('فشل في تحديث إعدادات المالك');
      toast.error(errorMsg);
    } finally {
      setSavingOwnerSettings(false);
    }
  };

  const saveSystemBranding = async () => {
    setBrandingLoading(true);
    try {
      let logoUrl = systemBranding.logo_url;
      
      // رفع الشعار أولاً إذا تم اختياره
      if (systemLogoFile) {
        const formData = new FormData();
        formData.append('file', systemLogoFile);
        const uploadRes = await axios.post(`${API}/upload/logo`, formData);
        logoUrl = uploadRes.data.logo_url;
      }
      
      await axios.put(`${API}/system/branding`, {
        ...systemBranding,
        logo_url: logoUrl
      });
      
      setSystemBranding(prev => ({ ...prev, logo_url: logoUrl }));
      setSystemLogoFile(null);
      toast.success(t('تم حفظ هوية النظام بنجاح'));
    } catch (error) {
      toast.error(t('فشل في حفظ هوية النظام'));
    } finally {
      setBrandingLoading(false);
    }
  };

  // ==================== Background Management Functions ====================
  
  const fetchBackgroundSettings = async () => {
    try {
      const res = await axios.get(`${API}/login-backgrounds`);
      setBackgroundSettings(res.data);
    } catch (error) {
      console.log('Error fetching background settings');
    }
  };

  const saveBackgroundSettings = async () => {
    setBackgroundsLoading(true);
    try {
      await axios.put(`${API}/login-backgrounds`, backgroundSettings);
      toast.success('تم حفظ إعدادات الخلفيات');
    } catch (error) {
      toast.error(t('فشل في حفظ الإعدادات'));
    } finally {
      setBackgroundsLoading(false);
    }
  };

  // رفع خلفية من الجهاز
  const uploadBackgroundFromDevice = async (file) => {
    if (!file) return;
    
    setBackgroundsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', newBackgroundTitle || file.name);
      formData.append('animation_type', newBackgroundAnimation);
      
      const token = localStorage.getItem('super_admin_token');
      
      const res = await axios.post(`${API}/upload/background`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });
      
      setBackgroundSettings(prev => ({
        ...prev,
        backgrounds: [...prev.backgrounds, res.data.background]
      }));
      
      setShowAddBackground(false);
      setNewBackgroundUrl('');
      setNewBackgroundTitle('');
      setNewBackgroundAnimation('fade');
      setSelectedBackgroundFile(null);
      setBackgroundPreviewUrl('');
      toast.success('تم رفع الخلفية بنجاح');
    } catch (error) {
      console.error('Upload background error:', error);
      toast.error(error.response?.data?.detail || 'فشل في رفع الخلفية');
    } finally {
      setBackgroundsLoading(false);
    }
  };

  const addNewBackground = async () => {
    if (!newBackgroundUrl) {
      toast.error('الرجاء إدخال رابط الصورة');
      return;
    }
    
    setBackgroundsLoading(true);
    try {
      const token = localStorage.getItem('super_admin_token');
      
      const res = await axios.post(`${API}/login-backgrounds/upload`, null, {
        params: {
          file_url: newBackgroundUrl,
          title: newBackgroundTitle,
          animation_type: newBackgroundAnimation
        },
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setBackgroundSettings(prev => ({
        ...prev,
        backgrounds: [...prev.backgrounds, res.data.background]
      }));
      
      setShowAddBackground(false);
      setNewBackgroundUrl('');
      setNewBackgroundTitle('');
      setNewBackgroundAnimation('fade');
      toast.success(t('تم إضافة الخلفية'));
    } catch (error) {
      toast.error(t('فشل في إضافة الخلفية'));
    } finally {
      setBackgroundsLoading(false);
    }
  };

  // رفع شعار العميل
  const uploadTenantLogo = async (file, tenantId) => {
    if (!file) return null;
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (tenantId) formData.append('tenant_id', tenantId);
      
      const token = localStorage.getItem('super_admin_token');
      
      const res = await axios.post(`${API}/upload/logo`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });
      
      return res.data.logo_url;
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في رفع الشعار'));
      return null;
    }
  };

  // رفع شعار صفحة تسجيل الدخول
  const uploadLoginLogo = async (file) => {
    if (!file) return null;
    setLoginLogoUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('super_admin_token');
      
      const res = await axios.post(`${API}/login-backgrounds/upload-logo`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });
      
      // تحديث الشعار في الإعدادات
      setBackgroundSettings(prev => ({
        ...prev,
        logo_url: res.data.logo_url
      }));
      
      toast.success(t('تم رفع شعار صفحة تسجيل الدخول بنجاح'));
      setLoginLogoFile(null);
      setLoginLogoPreview('');
      return res.data.logo_url;
    } catch (error) {
      console.error('Upload login logo error:', error);
      toast.error(error.response?.data?.detail || t('فشل في رفع الشعار'));
      return null;
    } finally {
      setLoginLogoUploading(false);
    }
  };

  // حذف شعار صفحة تسجيل الدخول
  const deleteLoginLogo = async () => {
    try {
      await axios.delete(`${API}/login-backgrounds/logo`);
      setBackgroundSettings(prev => ({
        ...prev,
        logo_url: ''
      }));
      setLoginLogoPreview('');
      toast.success(t('تم حذف الشعار'));
    } catch (error) {
      toast.error(t('فشل في حذف الشعار'));
    }
  };

  // معاينة ملف شعار صفحة تسجيل الدخول
  const handleLoginLogoFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLoginLogoFile(file);
      const url = URL.createObjectURL(file);
      setLoginLogoPreview(url);
    }
  };

  const deleteBackground = async (bgId) => {
    try {
      await axios.delete(`${API}/login-backgrounds/${bgId}`);
      setBackgroundSettings(prev => ({
        ...prev,
        backgrounds: prev.backgrounds.filter(b => b.id !== bgId)
      }));
      toast.success(t('تم حذف الخلفية'));
    } catch (error) {
      toast.error(t('فشل في حذف الخلفية'));
    }
  };

  const toggleBackgroundActive = (bgId) => {
    setBackgroundSettings(prev => ({
      ...prev,
      backgrounds: prev.backgrounds.map(b => 
        b.id === bgId ? { ...b, is_active: !b.is_active } : b
      )
    }));
  };

  const updateBackgroundAnimation = (bgId, animationType) => {
    setBackgroundSettings(prev => ({
      ...prev,
      backgrounds: prev.backgrounds.map(b => 
        b.id === bgId ? { ...b, animation_type: animationType } : b
      )
    }));
  };

  // ==================== Tenant Features Functions ====================
  
  const openFeaturesModal = async (tenant) => {
    setSelectedTenant(tenant);
    setFeaturesLoading(true);
    
    try {
      const res = await axios.get(`${API}/super-admin/tenants/${tenant.id}/features`);
      setTenantFeatures(res.data.features);
    } catch (error) {
      // استخدام الافتراضي إذا لم تكن هناك ميزات محفوظة
      setTenantFeatures({
        showPOS: true,
        showTables: true,
        showOrders: true,
        showExpenses: true,
        showInventory: true,
        showDelivery: true,
        showReports: true,
        showSettings: true,
        showHR: false,
        showWarehouse: false,
        showCallLogs: false,
        showCallCenter: false,
        showKitchen: false,
        showLoyalty: true,
        showCoupons: true,
        showRecipes: false,
        showReservations: true,
        showReviews: true,
        showSmartReports: true,
        showPurchasing: false,
        showBranchOrders: false,
        settingsUsers: true,
        settingsCustomers: true,
        settingsBranches: true,
        settingsCategories: true,
        settingsProducts: true,
        settingsPrinters: true,
        settingsDeliveryCompanies: true,
        settingsCallCenter: true,
        settingsNotifications: true
      });
    } finally {
      setFeaturesLoading(false);
      setShowFeaturesModal(true);
    }
  };

  const saveTenantFeatures = async () => {
    setFeaturesLoading(true);
    try {
      await axios.put(`${API}/super-admin/tenants/${selectedTenant.id}/features`, tenantFeatures);
      toast.success('تم حفظ صلاحيات العميل');
      setShowFeaturesModal(false);
    } catch (error) {
      toast.error('فشل في حفظ الصلاحيات');
    } finally {
      setFeaturesLoading(false);
    }
  };

  const toggleFeature = (featureKey) => {
    setTenantFeatures(prev => ({
      ...prev,
      [featureKey]: !prev[featureKey]
    }));
  };

  const enableAllFeatures = () => {
    setTenantFeatures({
      showPOS: true,
      showTables: true,
      showOrders: true,
      showExpenses: true,
      showInventory: true,
      showDelivery: true,
      showReports: true,
      showSettings: true,
      showHR: true,
      showWarehouse: true,
      showCallLogs: true,
      showCallCenter: true,
      showKitchen: true,
      showLoyalty: true,
      showCoupons: true,
      showRecipes: true,
      showReservations: true,
      showReviews: true,
      showSmartReports: true,
      showPurchasing: true,
      showBranchOrders: true,
      settingsUsers: true,
      settingsCustomers: true,
      settingsBranches: true,
      settingsCategories: true,
      settingsProducts: true,
      settingsPrinters: true,
      settingsDeliveryCompanies: true,
      settingsCallCenter: true,
      settingsNotifications: true
    });
  };

  const disableAllFeatures = () => {
    setTenantFeatures({
      showPOS: true, // نقطة البيع إجبارية
      showTables: false,
      showOrders: false,
      showExpenses: false,
      showInventory: false,
      showDelivery: false,
      showReports: false,
      showSettings: true, // الإعدادات إجبارية
      showHR: false,
      showWarehouse: false,
      showCallLogs: false,
      showCallCenter: false,
      showKitchen: false,
      showLoyalty: false,
      showCoupons: false,
      showRecipes: false,
      showReservations: false,
      showReviews: false,
      showSmartReports: false,
      showPurchasing: false,
      showBranchOrders: false,
      settingsUsers: false,
      settingsCustomers: false,
      settingsBranches: false,
      settingsCategories: false,
      settingsProducts: false,
      settingsPrinters: false,
      settingsDeliveryCompanies: false,
      settingsCallCenter: false,
      settingsNotifications: false
    });
  };

  // ==================== End Tenant Features Functions ====================

  const filteredTenants = tenants.filter(t => 
    (t.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.owner_email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.slug || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSubscriptionBadge = (type) => {
    const styles = {
      trial: 'bg-yellow-500/20 text-yellow-400',
      demo: 'bg-gray-500/20 text-gray-400',
      bronze: 'bg-amber-600/20 text-amber-400',
      silver: 'bg-gray-400/20 text-gray-300',
      gold: 'bg-yellow-500/20 text-yellow-400',
      basic: 'bg-blue-500/20 text-blue-400',
      premium: 'bg-purple-500/20 text-purple-400'
    };
    const labels = { 
      trial: 'تجريبي', 
      demo: 'عرض',
      bronze: '🥉 برونزية', 
      silver: '🥈 فضية', 
      gold: '🥇 ذهبية',
      basic: 'أساسي', 
      premium: 'مميز' 
    };
    return <Badge className={styles[type] || 'bg-gray-500/20 text-gray-400'}>{labels[type] || type}</Badge>;
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      preparing: 'bg-blue-500/20 text-blue-400',
      ready: 'bg-green-500/20 text-green-400',
      delivered: 'bg-gray-500/20 text-gray-400',
      cancelled: 'bg-red-500/20 text-red-400'
    };
    const labels = {
      pending: 'قيد الانتظار',
      preparing: 'قيد التحضير',
      ready: 'جاهز',
      delivered: 'تم التسليم',
      cancelled: 'ملغي'
    };
    return <Badge className={styles[status]}>{labels[status] || status}</Badge>;
  };

  // Login/Register Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4" dir="rtl">
        <Toaster position="top-center" richColors />
        
        <Card className="w-full max-w-md bg-gray-800/50 border-gray-700 backdrop-blur">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Crown className="h-8 w-8 text-purple-400" />
            </div>
            <CardTitle className="text-2xl text-white">Maestro EGP</CardTitle>
            <CardDescription className="text-gray-400">
              {showRegister ? t('إنشاء حساب المالك') : t('لوحة تحكم المالك')}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {!showRegister ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">{t('البريد الإلكتروني')}</Label>
                  <Input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({...loginForm, email: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    placeholder="owner@maestroegp.com"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">{t('كلمة المرور')}</Label>
                  <Input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">{t('مفتاح السر')}</Label>
                  <Input
                    type="password"
                    value={loginForm.secret_key}
                    onChange={(e) => setLoginForm({...loginForm, secret_key: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    placeholder="••••••••••••"
                    required
                  />
                </div>
                
                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={loading}>
                  {loading ? t('جاري الدخول...') : t('تسجيل الدخول')}
                </Button>
                
                <p className="text-center text-sm text-gray-400">
                  {t('ليس لديك حساب؟')}{' '}
                  <button 
                    type="button"
                    onClick={() => setShowRegister(true)}
                    className="text-purple-400 hover:underline"
                  >
                    {t('إنشاء حساب')}
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">{t('الاسم الكامل')}</Label>
                  <Input
                    type="text"
                    value={registerForm.full_name}
                    onChange={(e) => setRegisterForm({...registerForm, full_name: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">{t('البريد الإلكتروني')}</Label>
                  <Input
                    type="email"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm({...registerForm, email: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">{t('كلمة المرور')}</Label>
                  <Input
                    type="password"
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm({...registerForm, password: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">{t('مفتاح السر')}</Label>
                  <Input
                    type="password"
                    value={registerForm.secret_key}
                    onChange={(e) => setRegisterForm({...registerForm, secret_key: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    placeholder={t('مفتاح السر للتسجيل')}
                    required
                  />
                </div>
                
                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={loading}>
                  {loading ? t('جاري الإنشاء...') : t('إنشاء الحساب')}
                </Button>
                
                <p className="text-center text-sm text-gray-400">
                  {t('لديك حساب؟')}{' '}
                  <button 
                    type="button"
                    onClick={() => setShowRegister(false)}
                    className="text-purple-400 hover:underline"
                  >
                    {t('تسجيل الدخول')}
                  </button>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // مكون بطاقة العميل
  const TenantCard = ({ tenant, isDemo = false }) => (
    <div 
      className={`flex items-center justify-between p-4 rounded-lg hover:bg-gray-700/50 transition-colors ${
        isDemo ? 'bg-yellow-900/20 border border-yellow-700/30' : 'bg-gray-700/30'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-3 h-3 rounded-full ${tenant.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold">{tenant.name || tenant.slug || t('بدون اسم')}</h3>
            {isDemo && (
              <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                {t('تجريبي')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {tenant.owner_email || '-'}
            </span>
            <span className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              /{tenant.slug || '-'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-sm text-gray-400">{t('المستخدمين')}</p>
          <p className="font-bold">{tenant.users_count || 0}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-400">{t('الفروع')}</p>
          <p className="font-bold">{tenant.branches_count || 0}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-400">الطلبات</p>
          <p className="font-bold">{tenant.orders_count || 0}</p>
        </div>
        
        {getSubscriptionBadge(tenant.subscription_type)}
        
        <div className="flex items-center gap-1">
          {/* عرض مباشر */}
          <Button variant="ghost" size="icon" onClick={() => openLiveView(tenant)} className="hover:bg-gray-600" title="عرض مباشر">
            <Activity className="h-4 w-4 text-green-400" />
          </Button>
          {/* الدخول كعميل */}
          <Button variant="ghost" size="icon" onClick={() => impersonateTenant(tenant)} className="hover:bg-gray-600" title="الدخول كعميل">
            <ExternalLink className="h-4 w-4 text-blue-400" />
          </Button>
          {/* تعديل */}
          <Button variant="ghost" size="icon" onClick={() => openEditTenant(tenant)} className="hover:bg-gray-600" title="تعديل">
            <Edit className="h-4 w-4 text-yellow-400" />
          </Button>
          {/* الميزات والصلاحيات */}
          <Button variant="ghost" size="icon" onClick={() => openFeaturesModal(tenant)} className="hover:bg-gray-600" title="الميزات والصلاحيات">
            <Settings className="h-4 w-4 text-purple-400" />
          </Button>
          {/* التفاصيل */}
          <Button variant="ghost" size="icon" onClick={() => viewTenantDetails(tenant)} className="hover:bg-gray-600" title="التفاصيل">
            <Eye className="h-4 w-4 text-gray-400" />
          </Button>
          {/* كلمة المرور */}
          <Button variant="ghost" size="icon" onClick={() => { setSelectedTenant(tenant); setShowResetPassword(true); }} className="hover:bg-gray-600" title="كلمة المرور">
            <Key className="h-4 w-4 text-gray-400" />
          </Button>
          {/* تفعيل/تعطيل */}
          <Button variant="ghost" size="icon" onClick={() => toggleTenantStatus(tenant)} className="hover:bg-gray-600" title={tenant.is_active ? 'تعطيل' : 'تفعيل'}>
            {tenant.is_active ? <Power className="h-4 w-4 text-green-400" /> : <PowerOff className="h-4 w-4 text-red-400" />}
          </Button>
          {/* تصفير المبيعات */}
          <Button variant="ghost" size="icon" onClick={() => { setSelectedTenant(tenant); setShowResetSalesConfirm(true); }} className="hover:bg-gray-600" title="تصفير المبيعات">
            <RotateCcw className="h-4 w-4 text-orange-400" />
          </Button>
          {/* تصفير المخزون */}
          <Button variant="ghost" size="icon" onClick={() => { setSelectedTenant(tenant); setShowResetInventoryConfirm(true); }} className="hover:bg-gray-600" title="تصفير المخزون">
            <Package className="h-4 w-4 text-purple-400" />
          </Button>
          {/* حذف */}
          <Button variant="ghost" size="icon" onClick={() => { setSelectedTenant(tenant); setShowDeleteConfirm(true); }} className="hover:bg-red-600" title="حذف">
            <Trash2 className="h-4 w-4 text-red-400" />
          </Button>
        </div>
      </div>
    </div>
  );

  // Main Dashboard
  return (
    <div className="min-h-screen bg-gray-900 text-white" dir="rtl">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Crown className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Maestro EGP</h1>
              <p className="text-sm text-gray-400">{t('لوحة تحكم المالك')}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* زر الإشعارات */}
            <div className="relative">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowNotifications(!showNotifications)}
                className="text-gray-400 hover:text-white relative"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
              
              {/* قائمة الإشعارات المنسدلة */}
              {showNotifications && (
                <div className="absolute left-0 top-12 w-96 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2">
                      <Bell className="h-4 w-4 text-purple-400" />
                      {t('الإشعارات')}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setShowNotificationSettings(true)} className="text-gray-400 hover:text-white">
                        <Settings className="h-4 w-4" />
                      </Button>
                      {unreadCount > 0 && (
                        <Button size="sm" variant="ghost" onClick={markAllNotificationsAsRead} className="text-xs text-purple-400">
                          {t('تعليم الكل كمقروء')}
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* تنبيه الاشتراكات المنتهية */}
                  {(expiringSubscriptions.expiring_soon.length > 0 || expiringSubscriptions.already_expired.length > 0) && (
                    <div className="p-3 bg-orange-500/10 border-b border-gray-700">
                      <p className="text-xs text-orange-400 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {expiringSubscriptions.already_expired.length > 0 && (
                          <span>{expiringSubscriptions.already_expired.length} {t('اشتراك منتهي')}</span>
                        )}
                        {expiringSubscriptions.expiring_soon.length > 0 && (
                          <span>{expiringSubscriptions.expiring_soon.length} {t('اشتراك قارب على الانتهاء')}</span>
                        )}
                      </p>
                    </div>
                  )}
                  
                  <ScrollArea className="max-h-80">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p>{t('لا توجد إشعارات')}</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-700">
                        {notifications.map((notification) => (
                          <div 
                            key={notification.id} 
                            className={`p-3 hover:bg-gray-700/50 cursor-pointer ${!notification.is_read ? 'bg-purple-500/5' : ''}`}
                            onClick={() => markNotificationAsRead(notification.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className={`text-sm ${!notification.is_read ? 'font-bold' : ''}`}>
                                  {notification.title}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">{notification.message}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(notification.created_at).toLocaleString('en-US')}
                                </p>
                              </div>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-6 w-6 text-gray-500 hover:text-red-400"
                                onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                  
                  {notifications.length > 0 && (
                    <div className="p-3 border-t border-gray-700">
                      <Button size="sm" variant="ghost" onClick={clearAllNotifications} className="w-full text-red-400 hover:text-red-300">
                        <Trash2 className="h-4 w-4 ml-2" />
                        حذف جميع الإشعارات
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowInvoiceSettings(true)}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              <Palette className="h-4 w-4 ml-2" />
              الهوية البصرية
            </Button>
            <span className="text-sm text-gray-400">{user?.full_name}</span>
            <Button variant="ghost" size="icon" onClick={logout} className="text-gray-400 hover:text-white">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{t('إجمالي العملاء')}</p>
                  <p className="text-3xl font-bold mt-1">{stats?.total_tenants || 0}</p>
                </div>
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{t('العملاء النشطون')}</p>
                  <p className="text-3xl font-bold mt-1 text-green-400">{stats?.active_tenants || 0}</p>
                </div>
                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <Power className="h-6 w-6 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{t('إجمالي المستخدمين')}</p>
                  <p className="text-3xl font-bold mt-1">{stats?.total_users || 0}</p>
                </div>
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{t('إجمالي المبيعات')}</p>
                  <p className="text-2xl font-bold mt-1 text-green-400">{formatPrice(stats?.total_sales || 0)}</p>
                </div>
                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscription Stats */}
        {stats?.subscription_stats && Object.keys(stats.subscription_stats).length > 0 && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg">{t('الاشتراكات')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-400">{stats.subscription_stats.trial || 0}</p>
                  <p className="text-sm text-gray-400">{t('تجريبي')}</p>
                </div>
                <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                  <p className="text-2xl font-bold text-blue-400">{stats.subscription_stats.basic || 0}</p>
                  <p className="text-sm text-gray-400">{t('أساسي')}</p>
                </div>
                <div className="text-center p-4 bg-purple-500/10 rounded-lg">
                  <p className="text-2xl font-bold text-purple-400">{stats.subscription_stats.premium || 0}</p>
                  <p className="text-sm text-gray-400">{t('مميز')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Currency Reports Card - تقارير العملات */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Coins className="h-5 w-5 text-yellow-400" />
              {t('تقارير العملات والمبيعات')}
            </CardTitle>
            <div className="flex items-center gap-3">
              <Select 
                value={currencySettings.preferred_currency} 
                onValueChange={(value) => {
                  setCurrencySettings({...currencySettings, preferred_currency: value});
                  fetchSalesSummary(value);
                }}
              >
                <SelectTrigger className="w-40 bg-gray-700/50 border-gray-600">
                  <SelectValue placeholder={t('اختر العملة')} />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="USD">🇺🇸 {t('دولار أمريكي')}</SelectItem>
                  <SelectItem value="IQD">🇮🇶 {t('دينار عراقي')}</SelectItem>
                  <SelectItem value="SAR">🇸🇦 {t('ريال سعودي')}</SelectItem>
                  <SelectItem value="AED">🇦🇪 {t('درهم إماراتي')}</SelectItem>
                  <SelectItem value="EGP">🇪🇬 {t('جنيه مصري')}</SelectItem>
                  <SelectItem value="EUR">🇪🇺 {t('يورو')}</SelectItem>
                  <SelectItem value="JOD">🇯🇴 {t('دينار أردني')}</SelectItem>
                  <SelectItem value="KWD">🇰🇼 {t('دينار كويتي')}</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={fetchLiveRates} 
                variant="outline" 
                size="sm" 
                className="border-gray-600 gap-2"
                disabled={loadingLiveRates}
              >
                {loadingLiveRates ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpDown className="h-4 w-4" />}
                {t('أسعار حية')}
              </Button>
              <Button 
                onClick={() => setShowCurrencySettingsModal(true)} 
                variant="outline" 
                size="icon" 
                className="border-gray-600"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingSalesSummary ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                <span className="mr-3 text-gray-400">{t('جاري تحميل البيانات...')}</span>
              </div>
            ) : salesSummary ? (
              <div className="space-y-6">
                {/* ملخص المبيعات الإجمالي */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl p-4 border border-green-500/20">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/20 rounded-lg">
                        <DollarSign className="h-5 w-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('إجمالي المبيعات')}</p>
                        <p className="text-2xl font-bold text-green-400">
                          {new Intl.NumberFormat('en-US', {maximumFractionDigits: 2}).format(salesSummary.total_sales_converted || 0)} {salesSummary.display_currency_symbol || '$'}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-xl p-4 border border-blue-500/20">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <ShoppingCart className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('إجمالي الطلبات')}</p>
                        <p className="text-2xl font-bold text-blue-400">
                          {new Intl.NumberFormat('en-US').format(salesSummary.total_orders || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl p-4 border border-purple-500/20">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Building2 className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">{t('العملاء النشطين')}</p>
                        <p className="text-2xl font-bold text-purple-400">
                          {salesSummary.active_tenants || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* تفاصيل المبيعات حسب العميل */}
                {salesSummary.tenant_sales && salesSummary.tenant_sales.length > 0 && (
                  <div className="bg-gray-700/30 rounded-xl p-4">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-blue-400" />
                      {t('المبيعات حسب العميل')} ({t('بـ')} {currencySettings.preferred_currency})
                    </h3>
                    <div className="space-y-2">
                      {salesSummary.tenant_sales.map((tenant, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400">{idx + 1}.</span>
                            <span className="font-medium">{tenant.name}</span>
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-green-400">
                              {new Intl.NumberFormat('en-US', {maximumFractionDigits: 2}).format(tenant.converted_sales || 0)} {salesSummary.display_currency_symbol}
                            </p>
                            <p className="text-xs text-gray-500">
                              {tenant.original_currency}: {new Intl.NumberFormat('en-US').format(tenant.original_sales || 0)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* أسعار الصرف الحية */}
                {liveRates && liveRates.rates && (
                  <div className="bg-gray-700/30 rounded-xl p-4">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                      <ArrowUpDown className="h-5 w-5 text-yellow-400" />
                      {t('أسعار الصرف')} {liveRates.success ? t('(حية)') : t('(ثابتة)')}
                      {liveRates.fetched_at && (
                        <span className="text-xs text-gray-500 mr-2">
                          {t('آخر تحديث')}: {new Date(liveRates.fetched_at).toLocaleTimeString('en-US')}
                        </span>
                      )}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(liveRates.rates).map(([code, rates]) => (
                        <div key={code} className="bg-gray-800/50 rounded-lg p-3 text-center">
                          <p className="text-lg font-bold">{code}</p>
                          <p className="text-sm text-gray-400">
                            1 USD = {rates.rate_from_usd?.toFixed(code === 'IQD' ? 0 : 4) || '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Coins className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('اختر عملة لعرض تقارير المبيعات المحولة')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tenants List */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t('إدارة العملاء')}</CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('بحث...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 bg-gray-700/50 border-gray-600 w-64"
                />
              </div>
              <Button onClick={() => fetchData()} variant="outline" size="icon" className="border-gray-600">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={() => setShowNewTenant(true)} className="bg-purple-600 hover:bg-purple-700 gap-2">
                <Plus className="h-4 w-4" />
                {t('عميل جديد')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* تبويبات لفصل العملاء الفعليين عن الحسابات التجريبية */}
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-4 bg-gray-700/50">
                <TabsTrigger value="active" className="data-[state=active]:bg-green-600">
                  <Users className="h-4 w-4 ml-2" />
                  {t('العملاء')} ({tenants.filter(t => !t.is_demo && t.subscription_type !== 'demo').length})
                </TabsTrigger>
                <TabsTrigger value="demo" className="data-[state=active]:bg-yellow-600">
                  <Play className="h-4 w-4 ml-2" />
                  {t('التجريبية')} ({tenants.filter(t => t.is_demo || t.subscription_type === 'demo').length})
                </TabsTrigger>
                <TabsTrigger value="subscriptions" className="data-[state=active]:bg-purple-600">
                  <Calendar className="h-4 w-4 ml-2" />
                  {t('الاشتراكات')}
                </TabsTrigger>
                <TabsTrigger value="all" className="data-[state=active]:bg-gray-600">
                  <Layers className="h-4 w-4 ml-2" />
                  {t('الكل')} ({tenants.length})
                </TabsTrigger>
              </TabsList>
              
              {/* العملاء الفعليين */}
              <TabsContent value="active">
                <div className="space-y-3">
                  {filteredTenants.filter(t => !t.is_demo && t.subscription_type !== 'demo').length === 0 ? (
                    <p className="text-center text-gray-400 py-8">{t('لا يوجد عملاء فعليين')}</p>
                  ) : (
                    filteredTenants.filter(t => !t.is_demo && t.subscription_type !== 'demo').map((tenant) => (
                      <TenantCard key={tenant.id} tenant={tenant} />
                    ))
                  )}
                </div>
              </TabsContent>
              
              {/* الحسابات التجريبية */}
              <TabsContent value="demo">
                <div className="space-y-3">
                  {filteredTenants.filter(t => t.is_demo || t.subscription_type === 'demo').length === 0 ? (
                    <p className="text-center text-gray-400 py-8">{t('لا توجد حسابات تجريبية')}</p>
                  ) : (
                    filteredTenants.filter(t => t.is_demo || t.subscription_type === 'demo').map((tenant) => (
                      <TenantCard key={tenant.id} tenant={tenant} isDemo />
                    ))
                  )}
                </div>
              </TabsContent>
              
              {/* لوحة معلومات الاشتراكات */}
              <TabsContent value="subscriptions">
                {loadingDashboard ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                    <span className="mr-3 text-gray-400">{t('جاري تحميل البيانات...')}</span>
                  </div>
                ) : subscriptionsDashboard ? (
                  <div className="space-y-6">
                    {/* ملخص الاشتراكات */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl p-4 border border-green-500/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-500/20 rounded-lg">
                            <Check className="h-5 w-5 text-green-400" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-green-400">{subscriptionsDashboard.summary.active_subscriptions}</p>
                            <p className="text-xs text-gray-400">{t('اشتراك نشط')}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 rounded-xl p-4 border border-orange-500/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-orange-500/20 rounded-lg">
                            <Clock className="h-5 w-5 text-orange-400" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-orange-400">{subscriptionsDashboard.summary.expiring_soon}</p>
                            <p className="text-xs text-gray-400">{t('قارب على الانتهاء')}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl p-4 border border-red-500/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-red-500/20 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-red-400" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-red-400">{subscriptionsDashboard.summary.already_expired}</p>
                            <p className="text-xs text-gray-400">{t('اشتراك منتهي')}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl p-4 border border-purple-500/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-500/20 rounded-lg">
                            <DollarSign className="h-5 w-5 text-purple-400" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-purple-400">
                              ${(subscriptionsDashboard.expected_revenue.total_monthly || 0).toLocaleString('en-US')}
                            </p>
                            <p className="text-xs text-gray-400">{t('إيراد شهري متوقع')}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* الاشتراكات القريبة من الانتهاء */}
                      <div className="bg-gray-700/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <Clock className="h-5 w-5 text-orange-400" />
                          <h3 className="font-bold">{t('قريبة من الانتهاء')}</h3>
                          <span className="text-xs text-gray-400">
                            ({t('خلال')} {subscriptionsDashboard.summary.days_before_alert} {t('أيام')})
                          </span>
                        </div>
                        
                        {subscriptionsDashboard.expiring_soon_list.length === 0 ? (
                          <p className="text-center text-gray-500 py-6">{t('لا توجد اشتراكات قريبة من الانتهاء')}</p>
                        ) : (
                          <div className="space-y-2">
                            {subscriptionsDashboard.expiring_soon_list.map((tenant) => (
                              <div key={tenant.id} className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{tenant.name}</p>
                                  <p className="text-xs text-gray-400">{tenant.owner_email}</p>
                                </div>
                                <div className="text-left">
                                  <span className={`text-sm px-2 py-1 rounded ${
                                    tenant.days_left <= 3 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                                  }`}>
                                    {tenant.days_left === 0 ? t('ينتهي اليوم!') : `${tenant.days_left} ${t('يوم')}`}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* الاشتراكات المنتهية */}
                      <div className="bg-gray-700/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <AlertTriangle className="h-5 w-5 text-red-400" />
                          <h3 className="font-bold">{t('اشتراكات منتهية')}</h3>
                        </div>
                        
                        {subscriptionsDashboard.expired_list.length === 0 ? (
                          <p className="text-center text-gray-500 py-6">{t('لا توجد اشتراكات منتهية')}</p>
                        ) : (
                          <div className="space-y-2">
                            {subscriptionsDashboard.expired_list.map((tenant) => (
                              <div key={tenant.id} className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{tenant.name}</p>
                                  <p className="text-xs text-gray-400">{tenant.owner_email}</p>
                                </div>
                                <div className="text-left">
                                  <span className="text-sm px-2 py-1 rounded bg-red-500/20 text-red-400">
                                    {t('منذ')} {tenant.days_expired} {t('يوم')}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* الإيرادات المتوقعة من التجديدات */}
                    {subscriptionsDashboard.expected_revenue.details.length > 0 && (
                      <div className="bg-gradient-to-br from-green-500/10 to-purple-500/10 rounded-xl p-4 border border-green-500/20">
                        <div className="flex items-center gap-2 mb-4">
                          <TrendingUp className="h-5 w-5 text-green-400" />
                          <h3 className="font-bold">{t('الإيرادات المتوقعة من التجديدات')}</h3>
                          <span className="mr-auto text-xl font-bold text-green-400">
                            ${subscriptionsDashboard.expected_revenue.from_expiring.toLocaleString('en-US')}
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          {subscriptionsDashboard.expected_revenue.details.map((item, idx) => (
                            <div key={idx} className="bg-gray-800/30 rounded-lg p-3 flex items-center justify-between">
                              <div>
                                <p className="font-medium">{item.tenant_name}</p>
                                <p className="text-xs text-gray-400">
                                  {item.subscription_type === 'basic' ? t('أساسي') : t('مميز')} - {item.duration_months} {t('شهر')}
                                </p>
                              </div>
                              <span className="text-green-400 font-medium">
                                ${item.expected_amount.toLocaleString('en-US')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* إحصائيات أنواع الاشتراكات وأسعارها */}
                    <div className="bg-gray-700/30 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-5 w-5 text-blue-400" />
                          <h3 className="font-bold">{t('توزيع أنواع الاشتراكات')}</h3>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setShowPricesModal(true)}
                          className="border-purple-500 text-purple-400 hover:bg-purple-500/20"
                        >
                          <DollarSign className="h-4 w-4 ml-1" />
                          {t('تعديل الأسعار')}
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.entries(subscriptionsDashboard.subscription_types).map(([type, data]) => (
                          <div key={type} className="bg-gray-800/50 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold">{data.count}</p>
                            <p className="text-xs text-gray-400">
                              {subscriptionsDashboard.subscription_prices[type]?.name || type}
                            </p>
                            <p className="text-sm text-purple-400 mt-1">
                              ${subscriptionsDashboard.subscription_prices[type]?.monthly || 0}/{t('شهر')}
                            </p>
                            <div className="flex justify-center gap-2 mt-2 text-xs">
                              <span className="text-green-400">{data.active} {t('نشط')}</span>
                              <span className="text-red-400">{data.expired} {t('منتهي')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-gray-400 py-8">{t('لا توجد بيانات')}</p>
                )}
              </TabsContent>
              
              {/* جميع العملاء */}
              <TabsContent value="all">
                <div className="space-y-3">
                  {filteredTenants.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">{t('لا يوجد عملاء')}</p>
                  ) : (
                    filteredTenants.map((tenant) => (
                      <TenantCard key={tenant.id} tenant={tenant} isDemo={tenant.is_demo || tenant.subscription_type === 'demo'} />
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      {/* Modal: إنشاء عميل جديد */}
      <Dialog open={showNewTenant} onOpenChange={setShowNewTenant}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{t('إنشاء عميل جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* اختيار نوع الحساب */}
            <div className="space-y-2">
              <Label className="text-base font-medium">{t('نوع الحساب')} *</Label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant={newTenantForm.is_demo ? "outline" : "default"}
                  className={`h-20 flex flex-col items-center justify-center gap-2 ${
                    !newTenantForm.is_demo ? 'bg-green-600 hover:bg-green-700 border-green-500' : 'border-gray-600 hover:bg-gray-700'
                  }`}
                  onClick={() => setNewTenantForm({...newTenantForm, is_demo: false, subscription_type: 'trial'})}
                >
                  <Building2 className="h-6 w-6" />
                  <span>{t('عميل فعلي')}</span>
                </Button>
                <Button
                  type="button"
                  variant={newTenantForm.is_demo ? "default" : "outline"}
                  className={`h-20 flex flex-col items-center justify-center gap-2 ${
                    newTenantForm.is_demo ? 'bg-yellow-600 hover:bg-yellow-700 border-yellow-500' : 'border-gray-600 hover:bg-gray-700'
                  }`}
                  onClick={() => setNewTenantForm({...newTenantForm, is_demo: true, subscription_type: 'demo'})}
                >
                  <Play className="h-6 w-6" />
                  <span>{t('حساب تجريبي')}</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('اسم المطعم')} *</Label>
                <Input
                  placeholder={t('مثال: مطعم السعادة')}
                  value={newTenantForm.name}
                  onChange={(e) => setNewTenantForm({...newTenantForm, name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('المعرف (Slug)')} *</Label>
                <Input
                  placeholder="saada-restaurant"
                  value={newTenantForm.slug}
                  onChange={(e) => setNewTenantForm({...newTenantForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                  className="bg-gray-700/50 border-gray-600"
                  dir="ltr"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('اسم المالك')} *</Label>
                <Input
                  placeholder={t('مثال: أحمد محمد')}
                  value={newTenantForm.owner_name}
                  onChange={(e) => setNewTenantForm({...newTenantForm, owner_name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('البريد الإلكتروني')} *</Label>
                <Input
                  type="email"
                  placeholder="example@email.com"
                  value={newTenantForm.owner_email}
                  onChange={(e) => setNewTenantForm({...newTenantForm, owner_email: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                  dir="ltr"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('رقم الهاتف')}</Label>
                <Input
                  placeholder="009647xxxxxxxxx"
                  value={newTenantForm.owner_phone}
                  onChange={(e) => setNewTenantForm({...newTenantForm, owner_phone: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('نوع الاشتراك')}</Label>
                <Select 
                  value={newTenantForm.subscription_type} 
                  onValueChange={(v) => setNewTenantForm({...newTenantForm, subscription_type: v})}
                >
                  <SelectTrigger className="bg-gray-700/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">{t('تجريبي')}</SelectItem>
                    <SelectItem value="trial">{t('فترة تجريبية')}</SelectItem>
                    <SelectItem value="bronze">{t('برونزية')}</SelectItem>
                    <SelectItem value="silver">{t('فضية')}</SelectItem>
                    <SelectItem value="gold">{t('ذهبية')}</SelectItem>
                    <SelectItem value="basic">{t('أساسي')}</SelectItem>
                    <SelectItem value="premium">{t('مميز')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* حقل مدة الاشتراك - يظهر فقط للاشتراكات غير التجريبية */}
            {newTenantForm.subscription_type !== 'trial' && newTenantForm.subscription_type !== 'demo' && (
              <div className="space-y-2">
                <Label>{t('مدة الاشتراك')}</Label>
                <Select 
                  value={String(newTenantForm.subscription_duration)} 
                  onValueChange={(v) => setNewTenantForm({...newTenantForm, subscription_duration: parseInt(v)})}
                >
                  <SelectTrigger className="bg-gray-700/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="1">{t('شهر واحد')}</SelectItem>
                    <SelectItem value="3">{t('3 أشهر')}</SelectItem>
                    <SelectItem value="6">{t('6 أشهر')}</SelectItem>
                    <SelectItem value="12">{t('سنة كاملة')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('الحد الأقصى للفروع')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={newTenantForm.max_branches}
                  onChange={(e) => setNewTenantForm({...newTenantForm, max_branches: parseInt(e.target.value) || 1})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('الحد الأقصى للمستخدمين')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={newTenantForm.max_users}
                  onChange={(e) => setNewTenantForm({...newTenantForm, max_users: parseInt(e.target.value) || 5})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTenant(false)} className="border-gray-600">
              {t('إلغاء')}
            </Button>
            <Button onClick={createTenant} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 ml-2" />
              {t('إنشاء العميل')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: تأكيد الحذف */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-400">{t('تأكيد الحذف النهائي')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-300">
              {t('هل أنت متأكد من حذف العميل')} <span className="font-bold text-white">{selectedTenant?.name}</span>؟
            </p>
            <p className="text-red-400 text-sm mt-2">
              {t('هذا الإجراء نهائي ولا يمكن التراجع عنه. سيتم حذف جميع بيانات العميل.')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="border-gray-600">
              {t('إلغاء')}
            </Button>
            <Button onClick={deleteTenant} className="bg-red-600 hover:bg-red-700">
              <Trash2 className="h-4 w-4 ml-2" />
              {t('حذف نهائي')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: إعادة تعيين كلمة المرور */}
      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">{t('إعادة تعيين كلمة المرور')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-gray-300">
              {t('إعادة تعيين كلمة المرور للعميل')}: <span className="font-bold text-white">{selectedTenant?.owner_email}</span>
            </p>
            <div className="space-y-2">
              <Label>{t('كلمة المرور الجديدة')}</Label>
              <Input
                type="password"
                placeholder={t('أدخل كلمة المرور الجديدة')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-gray-700/50 border-gray-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPassword(false)} className="border-gray-600">
              {t('إلغاء')}
            </Button>
            <Button onClick={resetPassword} className="bg-yellow-600 hover:bg-yellow-700">
              <Key className="h-4 w-4 ml-2" />
              {t('تغيير كلمة المرور')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: تعديل العميل */}
      <Dialog open={showEditTenant} onOpenChange={setShowEditTenant}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{t('تعديل بيانات العميل')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('اسم المطعم')}</Label>
                <Input
                  value={editTenantForm.name}
                  onChange={(e) => setEditTenantForm({...editTenantForm, name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('نوع الاشتراك')}</Label>
                <Select 
                  value={editTenantForm.subscription_type} 
                  onValueChange={(v) => setEditTenantForm({...editTenantForm, subscription_type: v})}
                >
                  <SelectTrigger className="bg-gray-700/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">{t('تجريبي')}</SelectItem>
                    <SelectItem value="trial">{t('فترة تجريبية')}</SelectItem>
                    <SelectItem value="bronze">{t('برونزية')}</SelectItem>
                    <SelectItem value="silver">{t('فضية')}</SelectItem>
                    <SelectItem value="gold">{t('ذهبية')}</SelectItem>
                    <SelectItem value="basic">{t('أساسي')}</SelectItem>
                    <SelectItem value="premium">{t('مميز')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('اسم المالك')}</Label>
                <Input
                  value={editTenantForm.owner_name}
                  onChange={(e) => setEditTenantForm({...editTenantForm, owner_name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('البريد الإلكتروني')}</Label>
                <Input
                  value={editTenantForm.owner_email}
                  onChange={(e) => setEditTenantForm({...editTenantForm, owner_email: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('رقم الهاتف')}</Label>
                <Input
                  value={editTenantForm.owner_phone}
                  onChange={(e) => setEditTenantForm({...editTenantForm, owner_phone: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('الحد الأقصى للفروع')}</Label>
                <Input
                  type="number"
                  value={editTenantForm.max_branches}
                  onChange={(e) => setEditTenantForm({...editTenantForm, max_branches: parseInt(e.target.value) || 1})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditTenant(false)} className="border-gray-600">
              {t('إلغاء')}
            </Button>
            <Button onClick={updateTenant} className="bg-blue-600 hover:bg-blue-700">
              <Check className="h-4 w-4 ml-2" />
              {t('حفظ التعديلات')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: العرض المباشر */}
      <Dialog open={showLiveView} onOpenChange={setShowLiveView}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-400" />
              {t('العرض المباشر')} - {selectedTenant?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card className="bg-gray-700/50 border-gray-600">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{liveStats?.orders_today || 0}</p>
                  <p className="text-sm text-gray-400">{t('طلبات اليوم')}</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-700/50 border-gray-600">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">{liveStats?.sales_today?.toFixed(2) || '0.00'}</p>
                  <p className="text-sm text-gray-400">{t('مبيعات اليوم')}</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-700/50 border-gray-600">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-400">{liveStats?.active_orders || 0}</p>
                  <p className="text-sm text-gray-400">{t('طلبات نشطة')}</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-700/50 border-gray-600">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-purple-400">{liveStats?.users_count || 0}</p>
                  <p className="text-sm text-gray-400">{t('المستخدمين')}</p>
                </CardContent>
              </Card>
            </div>
            <div className="text-center text-gray-400 text-sm">
              <RefreshCw className="inline h-4 w-4 ml-1 animate-spin" />
              {t('يتم التحديث تلقائياً كل 30 ثانية')}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLiveView(false)} className="border-gray-600">
              {t('إغلاق')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: إدارة الميزات والصلاحيات */}
      <Dialog open={showFeaturesModal} onOpenChange={setShowFeaturesModal}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-4xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Settings className="h-5 w-5 text-purple-400" />
                {t('صلاحيات الميزات')} - {selectedTenant?.name}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700 gap-1"
                  onClick={() => {
                    const allEnabled = {};
                    Object.keys(tenantFeatures).forEach(key => allEnabled[key] = true);
                    setTenantFeatures(allEnabled);
                  }}
                >
                  <Check className="h-4 w-4" />
                  {t('تفعيل الكل')}
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  className="gap-1"
                  onClick={() => {
                    const allDisabled = {};
                    Object.keys(tenantFeatures).forEach(key => allDisabled[key] = false);
                    setTenantFeatures(allDisabled);
                  }}
                >
                  <X className="h-4 w-4" />
                  {t('تعطيل الكل')}
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="py-4 space-y-6 overflow-y-auto max-h-[60vh] pr-2">
            {featuresLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
              </div>
            ) : (
              <>
                {/* الميزات الأساسية والمتقدمة */}
                <div className="grid grid-cols-2 gap-6">
                  {/* الميزات الأساسية */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-green-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                      <Layers className="h-4 w-4" />
                      {t('الميزات الأساسية')}
                    </h3>
                    <div className="space-y-2">
                      {[
                        { key: 'showPOS', label: t('نقاط البيع'), icon: Monitor },
                        { key: 'showTables', label: t('الطاولات'), icon: LayoutGrid },
                        { key: 'showOrders', label: t('الطلبات'), icon: FileText },
                        { key: 'showReports', label: t('التقارير'), icon: BarChart3 },
                        { key: 'showExpenses', label: t('المصاريف'), icon: Wallet },
                        { key: 'showInventory', label: t('المخزون'), icon: Package },
                        { key: 'showDelivery', label: t('التوصيل'), icon: Truck },
                        { key: 'showKitchen', label: t('شاشة المطبخ'), icon: ChefHat },
                      ].map(item => (
                        <label key={item.key} className="flex items-center justify-between p-2.5 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 text-gray-400" />
                            <span className="text-sm">{item.label}</span>
                          </div>
                          <Switch
                            checked={tenantFeatures[item.key] || false}
                            onCheckedChange={(checked) => setTenantFeatures({...tenantFeatures, [item.key]: checked})}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* الميزات المتقدمة */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-purple-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                      <Star className="h-4 w-4" />
                      {t('الميزات المتقدمة')}
                    </h3>
                    <div className="space-y-2">
                      {[
                        { key: 'showHR', label: t('الموارد البشرية'), icon: Users },
                        { key: 'showWarehouse', label: t('التحويلات (المخازن)'), icon: ArrowLeftRight },
                        { key: 'showCallCenter', label: t('كول سنتر'), icon: Headphones },
                        { key: 'showCallLogs', label: t('سجل المكالمات'), icon: Phone },
                        { key: 'showLoyalty', label: t('برامج الولاء'), icon: Gift },
                        { key: 'showCoupons', label: t('الكوبونات والعروض'), icon: Tag },
                        { key: 'showRecipes', label: t('الوصفات'), icon: UtensilsCrossed },
                        { key: 'showReservations', label: t('حجوزات الطاولات'), icon: CalendarDays },
                      ].map(item => (
                        <label key={item.key} className="flex items-center justify-between p-2.5 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 text-gray-400" />
                            <span className="text-sm">{item.label}</span>
                          </div>
                          <Switch
                            checked={tenantFeatures[item.key] || false}
                            onCheckedChange={(checked) => setTenantFeatures({...tenantFeatures, [item.key]: checked})}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ميزات إضافية */}
                <div className="space-y-3">
                  <h3 className="font-bold text-yellow-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                    <Sparkles className="h-4 w-4" />
                    {t('ميزات إضافية')}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'showSmartReports', label: t('التقارير الذكية'), icon: BrainCircuit },
                      { key: 'showBranchOrders', label: t('طلبات الفروع'), icon: GitBranch },
                      { key: 'showPurchasing', label: t('المشتريات'), icon: ShoppingCart },
                      { key: 'showReviews', label: t('التقييمات'), icon: Star },
                      { key: 'showCustomerMenu', label: t('قائمة الطعام للعملاء'), icon: QrCode },
                    ].map(item => (
                      <label key={item.key} className="flex items-center justify-between p-2.5 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">{item.label}</span>
                        </div>
                        <Switch
                          checked={tenantFeatures[item.key] || false}
                          onCheckedChange={(checked) => setTenantFeatures({...tenantFeatures, [item.key]: checked})}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* خيارات الإعدادات */}
                <div className="space-y-3">
                  <h3 className="font-bold text-blue-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                    <Settings className="h-4 w-4" />
                    {t('خيارات الإعدادات (تحكم في ما يظهر داخل الإعدادات)')}
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: 'settingsUsers', label: t('المستخدمين'), icon: User },
                      { key: 'settingsCustomers', label: t('العملاء'), icon: Users },
                      { key: 'settingsCategories', label: t('الفئات'), icon: FolderTree },
                      { key: 'settingsProducts', label: t('المنتجات'), icon: Package },
                      { key: 'settingsDeliveryCompanies', label: t('شركات التوصيل'), icon: Truck },
                      { key: 'settingsBranches', label: t('الفروع'), icon: Building2 },
                      { key: 'settingsPrinters', label: t('المطبوعات'), icon: Printer },
                      { key: 'settingsNotifications', label: t('الإشعارات'), icon: Bell },
                      { key: 'settingsCallCenter', label: t('كول سنتر'), icon: Headphones },
                    ].map(item => (
                      <label key={item.key} className="flex items-center justify-between p-2.5 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">{item.label}</span>
                        </div>
                        <Switch
                          checked={tenantFeatures[item.key] || false}
                          onCheckedChange={(checked) => setTenantFeatures({...tenantFeatures, [item.key]: checked})}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFeaturesModal(false)} className="border-gray-600">
              {t('إلغاء')}
            </Button>
            <Button onClick={saveTenantFeatures} className="bg-purple-600 hover:bg-purple-700">
              <Check className="h-4 w-4 ml-2" />
              {t('حفظ الميزات')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: تأكيد تصفير المبيعات */}
      <Dialog open={showResetSalesConfirm} onOpenChange={setShowResetSalesConfirm}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-orange-400">{t('تأكيد تصفير المبيعات')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-300">
              {t('هل أنت متأكد من تصفير مبيعات')} <span className="font-bold text-white">{selectedTenant?.name}</span>؟
            </p>
            <p className="text-orange-400 text-sm mt-2">
              {t('سيتم حذف جميع الطلبات والمبيعات. هذا الإجراء لا يمكن التراجع عنه.')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetSalesConfirm(false)} className="border-gray-600">
              {t('إلغاء')}
            </Button>
            <Button onClick={resetTenantSales} className="bg-orange-600 hover:bg-orange-700">
              <RotateCcw className="h-4 w-4 ml-2" />
              {t('تصفير المبيعات')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: تأكيد تصفير المخزون */}
      <Dialog open={showResetInventoryConfirm} onOpenChange={setShowResetInventoryConfirm}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-purple-400">{t('تأكيد تصفير المخزون')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-300">
              {t('هل أنت متأكد من تصفير مخزون')} <span className="font-bold text-white">{selectedTenant?.name}</span>؟
            </p>
            <p className="text-purple-400 text-sm mt-2">
              {t('سيتم حذف جميع بيانات المخزون والمشتريات. هذا الإجراء لا يمكن التراجع عنه.')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetInventoryConfirm(false)} className="border-gray-600">
              {t('إلغاء')}
            </Button>
            <Button onClick={resetTenantInventory} className="bg-purple-600 hover:bg-purple-700">
              <Package className="h-4 w-4 ml-2" />
              {t('تصفير المخزون')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: تفاصيل العميل */}
      <Dialog open={showTenantDetails} onOpenChange={setShowTenantDetails}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-400" />
              {t('تفاصيل العميل')} - {selectedTenant?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-6">
            {tenantDetails ? (
              <>
                {/* معلومات أساسية */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-bold text-green-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                      <Building2 className="h-4 w-4" />
                      {t('معلومات المطعم')}
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">{t('اسم المطعم')}</span>
                        <span className="font-medium">{tenantDetails.tenant?.name || selectedTenant?.name || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">{t('المعرف (Slug)')}</span>
                        <span className="font-medium text-blue-400" dir="ltr">/{tenantDetails.tenant?.slug || selectedTenant?.slug || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">{t('نوع الاشتراك')}</span>
                        <Badge className={
                          (tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'premium' ? 'bg-purple-500/20 text-purple-400' :
                          (tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'basic' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }>
                          {(tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'premium' ? t('مميز') : 
                           (tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'basic' ? t('أساسي') : 
                           (tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'demo' ? t('تجريبي') : t('فترة تجريبية')}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">{t('الحالة')}</span>
                        <Badge className={(tenantDetails.tenant?.is_active !== false && selectedTenant?.is_active !== false) ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                          {(tenantDetails.tenant?.is_active !== false && selectedTenant?.is_active !== false) ? t('نشط') : t('معطل')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-bold text-blue-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                      <User className="h-4 w-4" />
                      {t('معلومات المالك')}
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">{t('اسم المالك')}</span>
                        <span className="font-medium">{tenantDetails.tenant?.owner_name || selectedTenant?.owner_name || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">{t('البريد الإلكتروني')}</span>
                        <span className="font-medium text-blue-400" dir="ltr">{tenantDetails.tenant?.owner_email || selectedTenant?.owner_email || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">{t('رقم الهاتف')}</span>
                        <span className="font-medium" dir="ltr">{tenantDetails.tenant?.owner_phone || selectedTenant?.owner_phone || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">{t('تاريخ الإنشاء')}</span>
                        <span className="font-medium">
                          {(tenantDetails.tenant?.created_at || selectedTenant?.created_at) 
                            ? new Date(tenantDetails.tenant?.created_at || selectedTenant?.created_at).toLocaleDateString('en-US') 
                            : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* إحصائيات وحدود */}
                <div className="space-y-4">
                  <h3 className="font-bold text-yellow-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                    <BarChart3 className="h-4 w-4" />
                    {t('الحدود والإحصائيات')}
                  </h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                      <p className="text-2xl font-bold text-blue-400">{tenantDetails.stats?.branches_count || tenantDetails.branches?.length || 0}</p>
                      <p className="text-sm text-gray-400">{t('الفروع')}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('الحد')}: {tenantDetails.tenant?.max_branches || selectedTenant?.max_branches || '-'}</p>
                    </div>
                    <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                      <p className="text-2xl font-bold text-green-400">{tenantDetails.stats?.users_count || tenantDetails.users?.length || 0}</p>
                      <p className="text-sm text-gray-400">{t('المستخدمين')}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('الحد')}: {tenantDetails.tenant?.max_users || selectedTenant?.max_users || '-'}</p>
                    </div>
                    <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                      <p className="text-2xl font-bold text-purple-400">{tenantDetails.stats?.orders_today || 0}</p>
                      <p className="text-sm text-gray-400">{t('طلبات اليوم')}</p>
                    </div>
                    <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                      <p className="text-2xl font-bold text-yellow-400">{formatPrice(tenantDetails.stats?.total_sales || 0)}</p>
                      <p className="text-sm text-gray-400">{t('إجمالي المبيعات')}</p>
                    </div>
                  </div>
                </div>

                {/* قائمة المستخدمين */}
                {tenantDetails.users && tenantDetails.users.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-purple-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                      <Users className="h-4 w-4" />
                      {t('المستخدمين')} ({tenantDetails.users.length})
                    </h3>
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {tenantDetails.users.map((user, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-gray-700/30 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>{user.full_name || user.username}</span>
                          </div>
                          <Badge className="text-xs">
                            {user.role === 'admin' ? t('مدير') : 
                             user.role === 'manager' ? t('مشرف') : 
                             user.role === 'cashier' ? t('كاشير') : user.role}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* قائمة الفروع */}
                {tenantDetails.branches && tenantDetails.branches.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-green-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                      <Building2 className="h-4 w-4" />
                      {t('الفروع')} ({tenantDetails.branches.length})
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {tenantDetails.branches.map((branch, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-gray-700/30 rounded text-sm">
                          <div className={`w-2 h-2 rounded-full ${branch.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span>{branch.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* الشعار إن وجد */}
                {(tenantDetails.tenant?.logo_url || selectedTenant?.logo_url) && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-purple-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                      <ImageIcon className="h-4 w-4" />
                      {t('شعار المطعم')}
                    </h3>
                    <div className="flex justify-center">
                      <img 
                        src={(tenantDetails.tenant?.logo_url || selectedTenant?.logo_url).startsWith('/api') 
                          ? `${API}${(tenantDetails.tenant?.logo_url || selectedTenant?.logo_url).replace('/api', '')}` 
                          : (tenantDetails.tenant?.logo_url || selectedTenant?.logo_url)} 
                        alt="Logo" 
                        className="h-24 w-24 object-contain bg-gray-700/50 rounded-lg p-2"
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                <p className="text-gray-400 mt-2">{t('جاري تحميل البيانات...')}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTenantDetails(false)} className="border-gray-600">
              {t('إغلاق')}
            </Button>
            <Button onClick={() => { setShowTenantDetails(false); openEditTenant(selectedTenant); }} className="bg-blue-600 hover:bg-blue-700">
              <Edit className="h-4 w-4 ml-2" />
              {t('تعديل البيانات')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: إعدادات الفواتير */}
      <Dialog open={showInvoiceSettings} onOpenChange={setShowInvoiceSettings}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-400" />
              {t('إعدادات النظام الرئيسي')}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {t('تخصيص هوية النظام، إعدادات الفواتير، وصفحة الدخول')}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="identity" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-gray-700/50">
              <TabsTrigger value="identity" className="data-[state=active]:bg-purple-600">
                <Crown className="h-4 w-4 ml-2" />
                {t('هوية النظام')}
              </TabsTrigger>
              <TabsTrigger value="owner" className="data-[state=active]:bg-purple-600">
                <User className="h-4 w-4 ml-2" />
                {t('إعدادات المالك')}
              </TabsTrigger>
              <TabsTrigger value="invoice" className="data-[state=active]:bg-purple-600">
                <Receipt className="h-4 w-4 ml-2" />
                {t('إعدادات الفواتير')}
              </TabsTrigger>
              <TabsTrigger value="login" className="data-[state=active]:bg-purple-600">
                <Palette className="h-4 w-4 ml-2" />
                {t('صفحة الدخول')}
              </TabsTrigger>
            </TabsList>

            {/* تبويب هوية النظام */}
            <TabsContent value="identity" className="space-y-6 mt-4">
              <div className="space-y-4">
                <h3 className="font-bold text-purple-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <Crown className="h-4 w-4" />
                  {t('هوية النظام الرئيسي')}
                </h3>
                <p className="text-sm text-gray-400">{t('التحكم في اسم النظام وهوية لوحة التحكم')}</p>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">{t('اسم النظام (يظهر في Dashboard)')}</Label>
                    <Input
                      type="text"
                      placeholder="Maestro EGP"
                      value={invoiceSettings.system_name || ''}
                      onChange={(e) => setInvoiceSettings({...invoiceSettings, system_name: e.target.value})}
                      className="bg-gray-700/50 border-gray-600 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-gray-300">{t('الاسم بالعربي (اختياري)')}</Label>
                      <Input
                        type="text"
                        placeholder={t('نظام إدارة المطاعم')}
                        value={invoiceSettings.system_name_ar || ''}
                        onChange={(e) => setInvoiceSettings({...invoiceSettings, system_name_ar: e.target.value})}
                        className="bg-gray-700/50 border-gray-600 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-300">{t('الاسم بالإنجليزي (اختياري)')}</Label>
                      <Input
                        type="text"
                        placeholder="Restaurant Management System"
                        value={invoiceSettings.system_name_en || ''}
                        onChange={(e) => setInvoiceSettings({...invoiceSettings, system_name_en: e.target.value})}
                        className="bg-gray-700/50 border-gray-600 text-white"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mt-6">
                  <h4 className="font-medium text-green-400 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    شعار النظام
                  </h4>
                  <div className="flex items-center gap-4">
                    <div className="w-32 h-32 bg-gray-700/50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-600">
                      {invoiceSettings.system_logo_url ? (
                        <img 
                          src={invoiceSettings.system_logo_url.startsWith('/api') 
                            ? `${API}${invoiceSettings.system_logo_url.replace('/api', '')}` 
                            : invoiceSettings.system_logo_url} 
                          alt="Logo" 
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <div className="text-center">
                          <ImageIcon className="h-10 w-10 text-gray-500 mx-auto" />
                          <p className="text-xs text-gray-500 mt-1">لا يوجد شعار</p>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-3">
                      <Input
                        type="text"
                        placeholder="رابط الشعار (URL)"
                        value={invoiceSettings.system_logo_url || ''}
                        onChange={(e) => setInvoiceSettings({...invoiceSettings, system_logo_url: e.target.value})}
                        className="bg-gray-700/50 border-gray-600 text-white"
                        dir="ltr"
                      />
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="system-logo-upload-1"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              uploadSystemLogo(file);
                            }
                          }}
                        />
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            className="border-gray-600 flex-1"
                            disabled={uploadingSystemLogo}
                            onClick={() => document.getElementById('system-logo-upload-1').click()}
                          >
                            {uploadingSystemLogo ? (
                              <>
                                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                                جاري الرفع...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 ml-2" />
                                رفع مباشر
                              </>
                            )}
                          </Button>
                          <Button 
                            variant="default" 
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => openImageCropper('system', 1, 'قص شعار النظام')}
                          >
                            <Crop className="h-4 w-4 ml-2" />
                            قص وتعديل
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">أدخل رابط صورة الشعار أو قم برفع/قص صورة جديدة</p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* تبويب إعدادات المالك */}
            <TabsContent value="owner" className="space-y-6 mt-4">
              <div className="space-y-4">
                <h3 className="font-bold text-blue-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <User className="h-4 w-4" />
                  بيانات المالك (Super Admin)
                </h3>
                <p className="text-sm text-gray-400">تغيير بيانات تسجيل الدخول للمالك</p>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">البريد الإلكتروني الحالي</Label>
                    <Input
                      type="email"
                      value={ownerSettings?.email || ''}
                      disabled
                      className="bg-gray-700/30 border-gray-600 text-gray-400"
                      dir="ltr"
                    />
                    <p className="text-xs text-gray-500">لا يمكن تغيير البريد الإلكتروني</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300">كلمة المرور الجديدة</Label>
                    <Input
                      type="password"
                      placeholder="اترك فارغاً إذا لم ترغب بالتغيير"
                      value={newOwnerPassword}
                      onChange={(e) => setNewOwnerPassword(e.target.value)}
                      className="bg-gray-700/50 border-gray-600 text-white"
                      dir="ltr"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300">تأكيد كلمة المرور الجديدة</Label>
                    <Input
                      type="password"
                      placeholder="أعد كتابة كلمة المرور"
                      value={confirmOwnerPassword}
                      onChange={(e) => setConfirmOwnerPassword(e.target.value)}
                      className="bg-gray-700/50 border-gray-600 text-white"
                      dir="ltr"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300">المفتاح السري الجديد</Label>
                    <Input
                      type="text"
                      placeholder="اترك فارغاً إذا لم ترغب بالتغيير"
                      value={newOwnerSecretKey}
                      onChange={(e) => setNewOwnerSecretKey(e.target.value)}
                      className="bg-gray-700/50 border-gray-600 text-white"
                      dir="ltr"
                    />
                    <p className="text-xs text-gray-500">المفتاح السري يُستخدم لتسجيل الدخول كمالك</p>
                  </div>
                </div>
                
                <Button 
                  onClick={updateOwnerSettings}
                  disabled={savingOwnerSettings}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {savingOwnerSettings ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 ml-2" />
                      حفظ إعدادات المالك
                    </>
                  )}
                </Button>
              </div>

              {/* إعدادات عرض العملة للمالك */}
              <div className="space-y-4 mt-6 pt-6 border-t border-gray-700">
                <h3 className="font-bold text-green-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <DollarSign className="h-4 w-4" />
                  إعدادات عرض المبيعات
                </h3>
                <p className="text-sm text-gray-400">تحديد العملة التي تريد عرض المبيعات بها (سيتم تحويل جميع العملات تلقائياً)</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <Label className="text-gray-300 flex items-center gap-2 mb-3">
                      <Globe className="h-4 w-4 text-blue-400" />
                      عملة العرض الرئيسية
                    </Label>
                    <select
                      value={localStorage.getItem('owner_display_currency') || 'IQD'}
                      onChange={(e) => {
                        localStorage.setItem('owner_display_currency', e.target.value);
                        toast.success(`تم تغيير عملة العرض إلى ${e.target.value}`);
                      }}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    >
                      <option value="IQD">🇮🇶 دينار عراقي (د.ع)</option>
                      <option value="USD">🇺🇸 دولار أمريكي ($)</option>
                      <option value="SAR">🇸🇦 ريال سعودي (ر.س)</option>
                      <option value="AED">🇦🇪 درهم إماراتي (د.إ)</option>
                      <option value="EGP">🇪🇬 جنيه مصري (ج.م)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-2">جميع المبيعات ستُعرض بهذه العملة</p>
                  </div>
                  
                  <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <Label className="text-gray-300 flex items-center gap-2 mb-3">
                      <Languages className="h-4 w-4 text-purple-400" />
                      لغة لوحة التحكم
                    </Label>
                    <select
                      value={localStorage.getItem('owner_language') || 'ar'}
                      onChange={(e) => {
                        localStorage.setItem('owner_language', e.target.value);
                        toast.success('تم تغيير اللغة - سيتم تحديث الصفحة');
                        setTimeout(() => window.location.reload(), 1000);
                      }}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    >
                      <option value="ar">العربية</option>
                      <option value="en">English</option>
                      <option value="ku">کوردی</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-2">لغة واجهة لوحة التحكم</p>
                  </div>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-sm text-blue-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <strong>ملاحظة:</strong> عند استخدام عملاء بعملات مختلفة، سيتم تحويل جميع المبالغ تلقائياً إلى العملة المحددة أعلاه
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* تبويب إعدادات الفواتير */}
            <TabsContent value="invoice" className="space-y-6 mt-4">
              {/* شعار الفواتير */}
              <div className="space-y-4">
                <h3 className="font-bold text-green-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <ImageIcon className="h-4 w-4" />
                  شعار النظام (يظهر في جميع الفواتير)
                </h3>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-gray-700/50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-600">
                    {invoiceSettings.system_logo_url ? (
                      <img 
                        src={invoiceSettings.system_logo_url.startsWith('/api') 
                          ? `${API}${invoiceSettings.system_logo_url.replace('/api', '')}` 
                          : invoiceSettings.system_logo_url} 
                        alt="Logo" 
                        className="w-full h-full object-contain p-2"
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="system-logo-upload-2"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          uploadSystemLogo(file);
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        className="border-gray-600"
                        disabled={uploadingSystemLogo}
                        onClick={() => document.getElementById('system-logo-upload-2').click()}
                      >
                        {uploadingSystemLogo ? (
                          <>
                            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                            جاري الرفع...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 ml-2" />
                            رفع مباشر
                          </>
                        )}
                      </Button>
                      <Button 
                        variant="default" 
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => openImageCropper('system', 1, 'قص شعار الفواتير')}
                      >
                        <Crop className="h-4 w-4 ml-2" />
                        قص وتعديل
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">سيظهر هذا الشعار في جميع فواتير العملاء</p>
                  </div>
                </div>
              </div>

              {/* بيانات الاتصال */}
              <div className="space-y-4">
                <h3 className="font-bold text-blue-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <Phone className="h-4 w-4" />
                  بيانات الاتصال
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">هاتف النظام 1</Label>
                    <Input
                      type="text"
                      placeholder="01234567890"
                      value={invoiceSettings.system_phone || ''}
                      onChange={(e) => setInvoiceSettings({...invoiceSettings, system_phone: e.target.value})}
                      className="bg-gray-700/50 border-gray-600 text-white"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">هاتف النظام 2</Label>
                    <Input
                      type="text"
                      placeholder="01234567890"
                      value={invoiceSettings.system_phone2 || ''}
                      onChange={(e) => setInvoiceSettings({...invoiceSettings, system_phone2: e.target.value})}
                      className="bg-gray-700/50 border-gray-600 text-white"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">البريد الإلكتروني</Label>
                    <Input
                      type="email"
                      placeholder="info@example.com"
                      value={invoiceSettings.system_email || ''}
                      onChange={(e) => setInvoiceSettings({...invoiceSettings, system_email: e.target.value})}
                      className="bg-gray-700/50 border-gray-600 text-white"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">الموقع الإلكتروني</Label>
                    <Input
                      type="url"
                      placeholder="https://example.com"
                      value={invoiceSettings.system_website || ''}
                      onChange={(e) => setInvoiceSettings({...invoiceSettings, system_website: e.target.value})}
                      className="bg-gray-700/50 border-gray-600 text-white"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* محتوى الفاتورة */}
              <div className="space-y-4">
                <h3 className="font-bold text-yellow-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <FileText className="h-4 w-4" />
                  محتوى الفاتورة
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">رسالة الشكر (أسفل الفاتورة)</Label>
                    <Input
                      type="text"
                      placeholder="شكراً لزيارتكم"
                      value={invoiceSettings.thank_you_message || ''}
                      onChange={(e) => setInvoiceSettings({...invoiceSettings, thank_you_message: e.target.value})}
                      className="bg-gray-700/50 border-gray-600 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">نص إضافي في التذييل</Label>
                    <Input
                      type="text"
                      placeholder="مثال: تابعونا على مواقع التواصل"
                      value={invoiceSettings.footer_text || ''}
                      onChange={(e) => setInvoiceSettings({...invoiceSettings, footer_text: e.target.value})}
                      className="bg-gray-700/50 border-gray-600 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* خيارات العرض */}
              <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                <div>
                  <p className="font-medium">إظهار شعار وبيانات النظام في الفواتير</p>
                  <p className="text-sm text-gray-400">سيظهر الشعار وبيانات الاتصال في جميع فواتير العملاء</p>
                </div>
                <Switch
                  checked={invoiceSettings.show_system_branding}
                  onCheckedChange={(checked) => setInvoiceSettings({...invoiceSettings, show_system_branding: checked})}
                />
              </div>

              {/* معاينة الفاتورة */}
              <div className="space-y-4">
                <h3 className="font-bold text-green-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <Eye className="h-4 w-4" />
                  معاينة الفاتورة
                </h3>
                <div className="bg-white text-black p-4 rounded-lg text-center max-w-xs mx-auto" dir="rtl">
                  {invoiceSettings.show_system_branding && invoiceSettings.system_logo_url && (
                    <img 
                      src={invoiceSettings.system_logo_url.startsWith('/api') 
                        ? `${API}${invoiceSettings.system_logo_url.replace('/api', '')}` 
                        : invoiceSettings.system_logo_url}
                      alt="Logo" 
                      className="h-12 mx-auto mb-2"
                    />
                  )}
                  <p className="font-bold text-lg">[ اسم المطعم ]</p>
                  <p className="text-xs text-gray-600">[ عنوان المطعم ]</p>
                  <hr className="my-2" />
                  <p className="text-xs text-gray-500">... الأصناف والأسعار ...</p>
                  <hr className="my-2" />
                  <p className="text-xs text-gray-500">... المجموع الإجمالي ...</p>
                  <hr className="my-2" />
                  <p className="text-sm font-medium">{invoiceSettings.thank_you_message || 'شكراً لزيارتكم'}</p>
                  {invoiceSettings.footer_text && (
                    <p className="text-xs text-gray-500 mt-1">{invoiceSettings.footer_text}</p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* تبويب صفحة الدخول */}
            <TabsContent value="login" className="space-y-6 mt-4">
              <div className="space-y-4">
                <h3 className="font-bold text-blue-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <Palette className="h-4 w-4" />
                  خلفيات صفحة الدخول
                </h3>
                <p className="text-sm text-gray-400">التحكم في مظهر صفحة تسجيل الدخول</p>

                {/* خيارات الحركة */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                    <div>
                      <p className="font-medium">تفعيل الحركة</p>
                      <p className="text-xs text-gray-400">تفعيل حركة الخلفيات</p>
                    </div>
                    <Switch
                      checked={backgroundSettings.animation_enabled}
                      onCheckedChange={(checked) => setBackgroundSettings({...backgroundSettings, animation_enabled: checked})}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                    <div>
                      <p className="font-medium">تبديل تلقائي</p>
                      <p className="text-xs text-gray-400">تبديل الخلفيات تلقائياً</p>
                    </div>
                    <Switch
                      checked={backgroundSettings.auto_play}
                      onCheckedChange={(checked) => setBackgroundSettings({...backgroundSettings, auto_play: checked})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">نوع الانتقال</Label>
                    <Select 
                      value={backgroundSettings.transition_type} 
                      onValueChange={(value) => setBackgroundSettings({...backgroundSettings, transition_type: value})}
                    >
                      <SelectTrigger className="bg-gray-700/50 border-gray-600">
                        <SelectValue placeholder="اختر نوع الانتقال" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="fade">Fade (تلاشي)</SelectItem>
                        <SelectItem value="slide">Slide (انزلاق)</SelectItem>
                        <SelectItem value="zoom">Zoom (تكبير)</SelectItem>
                        <SelectItem value="kenburns">Ken Burns</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">مدة الانتقال (ثواني)</Label>
                    <Select 
                      value={String(backgroundSettings.transition_duration || 1.5)} 
                      onValueChange={(value) => setBackgroundSettings({...backgroundSettings, transition_duration: parseFloat(value)})}
                    >
                      <SelectTrigger className="bg-gray-700/50 border-gray-600">
                        <SelectValue placeholder="اختر مدة الانتقال" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="0.5">0.5 ثانية</SelectItem>
                        <SelectItem value="1">1 ثانية</SelectItem>
                        <SelectItem value="1.5">1.5 ثانية</SelectItem>
                        <SelectItem value="2">2 ثواني</SelectItem>
                        <SelectItem value="2.5">2.5 ثانية</SelectItem>
                        <SelectItem value="3">3 ثواني</SelectItem>
                        <SelectItem value="4">4 ثواني</SelectItem>
                        <SelectItem value="5">5 ثواني</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">حركة الشعار</Label>
                    <Select 
                      value={backgroundSettings.logo_animation} 
                      onValueChange={(value) => setBackgroundSettings({...backgroundSettings, logo_animation: value})}
                    >
                      <SelectTrigger className="bg-gray-700/50 border-gray-600">
                        <SelectValue placeholder="اختر حركة الشعار" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="none">بدون حركة</SelectItem>
                        <SelectItem value="pulse">Pulse (نبض)</SelectItem>
                        <SelectItem value="bounce">Bounce (ارتداد)</SelectItem>
                        <SelectItem value="fade">Fade (تلاشي)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* شعار صفحة الدخول */}
              <div className="space-y-4">
                <h3 className="font-bold text-green-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <ImageIcon className="h-4 w-4" />
                  شعار صفحة تسجيل الدخول
                </h3>
                <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                  <div>
                    <p className="font-medium">تفعيل شعار صفحة الدخول</p>
                    <p className="text-xs text-gray-400">إظهار شعار مخصص في صفحة تسجيل الدخول</p>
                  </div>
                  <Switch
                    checked={backgroundSettings.show_logo}
                    onCheckedChange={(checked) => setBackgroundSettings({...backgroundSettings, show_logo: checked})}
                  />
                </div>
                
                {backgroundSettings.show_logo && (
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 bg-gray-700/50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-600">
                      {backgroundSettings.logo_url ? (
                        <img 
                          src={backgroundSettings.logo_url.startsWith('/api') 
                            ? `${API}${backgroundSettings.logo_url.replace('/api', '')}` 
                            : backgroundSettings.logo_url} 
                          alt="Login Logo" 
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input
                        type="text"
                        placeholder="رابط خارجي للشعار"
                        value={backgroundSettings.logo_url || ''}
                        onChange={(e) => setBackgroundSettings({...backgroundSettings, logo_url: e.target.value})}
                        className="bg-gray-700/50 border-gray-600 text-white"
                        dir="ltr"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLoginLogoFileChange}
                        className="hidden"
                        id="login-logo-upload"
                      />
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          className="border-gray-600 flex-1"
                          onClick={() => document.getElementById('login-logo-upload').click()}
                          disabled={loginLogoUploading}
                        >
                          {loginLogoUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                              جاري الرفع...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 ml-2" />
                              رفع مباشر
                            </>
                          )}
                        </Button>
                        <Button 
                          variant="default" 
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={() => openImageCropper('login', 1, 'قص شعار صفحة الدخول')}
                        >
                          <Crop className="h-4 w-4 ml-2" />
                          قص وتعديل
                        </Button>
                      </div>
                      {loginLogoFile && (
                        <Button 
                          variant="default" 
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={() => uploadLoginLogo(loginLogoFile)}
                          disabled={loginLogoUploading}
                        >
                          تأكيد الرفع
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* لون التحكم */}
              <div className="space-y-4">
                <h3 className="font-bold text-purple-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <Palette className="h-4 w-4" />
                  ألوان صفحة الدخول
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">لون الغطاء (Overlay Color)</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="color"
                        value={backgroundSettings.overlay_color?.replace(/rgba?\([^)]+\)/, '#000000') || '#000000'}
                        onChange={(e) => {
                          const hex = e.target.value;
                          const r = parseInt(hex.slice(1, 3), 16);
                          const g = parseInt(hex.slice(3, 5), 16);
                          const b = parseInt(hex.slice(5, 7), 16);
                          setBackgroundSettings({...backgroundSettings, overlay_color: `rgba(${r},${g},${b},0.5)`});
                        }}
                        className="w-14 h-10 p-1 bg-gray-700/50 border-gray-600 cursor-pointer rounded"
                      />
                      <Input
                        type="text"
                        placeholder="rgba(0, 0, 0, 0.5)"
                        value={backgroundSettings.overlay_color || ''}
                        onChange={(e) => setBackgroundSettings({...backgroundSettings, overlay_color: e.target.value})}
                        className="bg-gray-700/50 border-gray-600 text-white flex-1"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300">لون النص</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="color"
                        value={backgroundSettings.text_color || '#ffffff'}
                        onChange={(e) => setBackgroundSettings({...backgroundSettings, text_color: e.target.value})}
                        className="w-14 h-10 p-1 bg-gray-700/50 border-gray-600 cursor-pointer rounded"
                      />
                      <Input
                        type="text"
                        placeholder="#ffffff"
                        value={backgroundSettings.text_color || ''}
                        onChange={(e) => setBackgroundSettings({...backgroundSettings, text_color: e.target.value})}
                        className="bg-gray-700/50 border-gray-600 text-white flex-1"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* الخلفيات */}
              <div className="space-y-4">
                <h3 className="font-bold text-yellow-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                  <ImageIcon className="h-4 w-4" />
                  الخلفيات ({backgroundSettings.backgrounds?.length || 0})
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  {(backgroundSettings.backgrounds || []).map((bg, idx) => {
                    const bgUrl = bg.image_url || bg.url;
                    const fullUrl = bgUrl?.startsWith('/api') 
                      ? `${API}${bgUrl.replace('/api', '')}` 
                      : bgUrl;
                    const animType = bg.animation_type || bg.animation || 'fade';
                    const isEnabled = bg.is_active !== false && bg.enabled !== false;
                    return (
                      <div key={bg.id || idx} className="relative group rounded-xl overflow-hidden bg-gray-700/30">
                        {/* صورة الخلفية الكاملة */}
                        <div className="aspect-video relative">
                          <img 
                            src={fullUrl} 
                            alt={bg.title || bg.name} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.src = 'https://via.placeholder.com/400x225?text=No+Image';
                            }}
                          />
                          {/* Overlay عند التحويم */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="border-white/50 text-white hover:bg-white/20"
                              onClick={() => {
                                setBackgroundSettings(prev => ({
                                  ...prev,
                                  backgrounds: prev.backgrounds.map((b, i) => 
                                    i === idx ? {...b, is_active: !isEnabled, enabled: !isEnabled} : b
                                  )
                                }));
                              }}
                            >
                              {isEnabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => {
                                if (window.confirm('هل تريد حذف هذه الخلفية؟')) {
                                  setBackgroundSettings(prev => ({
                                    ...prev,
                                    backgrounds: prev.backgrounds.filter((_, i) => i !== idx)
                                  }));
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {/* علامات الحالة */}
                          {isEnabled && (
                            <Badge className="absolute top-2 right-2 bg-green-500/90 text-white text-xs">مفعّل</Badge>
                          )}
                          {!isEnabled && (
                            <Badge className="absolute top-2 right-2 bg-red-500/90 text-white text-xs">معطّل</Badge>
                          )}
                          <Badge className="absolute top-2 left-2 bg-blue-500/90 text-white text-xs">{animType}</Badge>
                        </div>
                        {/* معلومات الخلفية */}
                        <div className="p-3 bg-gray-800/80">
                          <p className="text-sm font-medium text-white truncate">{bg.title || bg.name || 'خلفية'}</p>
                        </div>
                      </div>
                    );
                  })}
                  {/* زر إضافة خلفية */}
                  <div 
                    className="aspect-video bg-gray-700/30 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-gray-600 cursor-pointer hover:border-purple-500 hover:bg-gray-700/50 transition-all duration-300"
                    onClick={() => setShowAddBackground(true)}
                  >
                    <Plus className="h-10 w-10 text-gray-500 mb-2" />
                    <p className="text-sm text-gray-400">إضافة خلفية</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowInvoiceSettings(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={async () => { 
              await saveInvoiceSettings(); 
              try {
                await axios.put(`${API}/login-backgrounds`, backgroundSettings);
                toast.success('تم حفظ إعدادات الخلفيات');
              } catch (error) {
                toast.error('فشل في حفظ إعدادات الخلفيات');
              }
            }} className="bg-green-600 hover:bg-green-700">
              <Check className="h-4 w-4 ml-2" />
              حفظ جميع الإعدادات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog إعدادات الإشعارات */}
      <Dialog open={showNotificationSettings} onOpenChange={setShowNotificationSettings}>
        <DialogContent className="bg-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-purple-400" />
              إعدادات الإشعارات
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* التنبيه قبل انتهاء الاشتراك */}
            <div className="space-y-3">
              <Label className="text-gray-300">التنبيه قبل انتهاء الاشتراك</Label>
              <Select 
                value={String(notificationSettings.days_before_expiry)} 
                onValueChange={(v) => setNotificationSettings({...notificationSettings, days_before_expiry: parseInt(v)})}
              >
                <SelectTrigger className="bg-gray-700/50 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="3">قبل 3 أيام</SelectItem>
                  <SelectItem value="7">قبل أسبوع</SelectItem>
                  <SelectItem value="15">قبل 15 يوم</SelectItem>
                  <SelectItem value="30">قبل شهر</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* أنواع الإشعارات */}
            <div className="space-y-4">
              <Label className="text-gray-300">أنواع الإشعارات</Label>
              
              <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg opacity-50">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-400" />
                  <span className="text-sm">إشعارات البريد الإلكتروني</span>
                  <span className="text-xs text-gray-500">(غير مفعل)</span>
                </div>
                <Switch 
                  checked={notificationSettings.email_notifications}
                  onCheckedChange={(v) => setNotificationSettings({...notificationSettings, email_notifications: v})}
                  disabled
                />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-purple-400" />
                  <span className="text-sm">إشعارات المتصفح (Push)</span>
                </div>
                <Switch 
                  checked={notificationSettings.push_notifications}
                  onCheckedChange={(v) => setNotificationSettings({...notificationSettings, push_notifications: v})}
                />
              </div>
            </div>

            {/* أحداث الإشعارات */}
            <div className="space-y-4">
              <Label className="text-gray-300">أحداث الإشعارات</Label>
              
              <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-green-400" />
                  <span className="text-sm">إشعار عند إضافة عميل جديد</span>
                </div>
                <Switch 
                  checked={notificationSettings.notify_new_tenant}
                  onCheckedChange={(v) => setNotificationSettings({...notificationSettings, notify_new_tenant: v})}
                />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Power className="h-4 w-4 text-orange-400" />
                  <span className="text-sm">إشعار عند تفعيل/تعطيل عميل</span>
                </div>
                <Switch 
                  checked={notificationSettings.notify_tenant_status}
                  onCheckedChange={(v) => setNotificationSettings({...notificationSettings, notify_tenant_status: v})}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotificationSettings(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={saveNotificationSettings} className="bg-purple-600 hover:bg-purple-700">
              <Check className="h-4 w-4 ml-2" />
              حفظ الإعدادات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog تعديل أسعار الاشتراكات */}
      <Dialog open={showPricesModal} onOpenChange={setShowPricesModal}>
        <DialogContent className="bg-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-400" />
              أسعار الاشتراكات (بالدولار)
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* الباقات الجديدة */}
            <div className="grid grid-cols-3 gap-3">
              {/* باقة برونزية */}
              <div className="space-y-2 p-3 bg-amber-900/20 rounded-lg border border-amber-700/30">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-600"></div>
                  <Label className="text-amber-400 text-sm font-bold">برونزية</Label>
                </div>
                <div className="relative">
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400 text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={subscriptionPrices.bronze}
                    onChange={(e) => setSubscriptionPrices({...subscriptionPrices, bronze: parseFloat(e.target.value) || 0})}
                    className="bg-gray-700/50 border-gray-600 text-white pr-6 text-center"
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">/شهر</p>
              </div>

              {/* باقة فضية */}
              <div className="space-y-2 p-3 bg-gray-500/20 rounded-lg border border-gray-500/30">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                  <Label className="text-gray-300 text-sm font-bold">فضية</Label>
                </div>
                <div className="relative">
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400 text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={subscriptionPrices.silver}
                    onChange={(e) => setSubscriptionPrices({...subscriptionPrices, silver: parseFloat(e.target.value) || 0})}
                    className="bg-gray-700/50 border-gray-600 text-white pr-6 text-center"
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">/شهر</p>
              </div>

              {/* باقة ذهبية */}
              <div className="space-y-2 p-3 bg-yellow-900/20 rounded-lg border border-yellow-600/30">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <Label className="text-yellow-400 text-sm font-bold">ذهبية</Label>
                </div>
                <div className="relative">
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400 text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={subscriptionPrices.gold}
                    onChange={(e) => setSubscriptionPrices({...subscriptionPrices, gold: parseFloat(e.target.value) || 0})}
                    className="bg-gray-700/50 border-gray-600 text-white pr-6 text-center"
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">/شهر</p>
              </div>
            </div>

            <div className="border-t border-gray-700 pt-4">
              <p className="text-xs text-gray-500 mb-3">الباقات القديمة (للتوافق)</p>
              <div className="grid grid-cols-2 gap-3">
                {/* سعر الاشتراك الأساسي */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <Label className="text-gray-400 text-xs">أساسي</Label>
                  </div>
                  <div className="relative">
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400 text-sm">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={subscriptionPrices.basic}
                      onChange={(e) => setSubscriptionPrices({...subscriptionPrices, basic: parseFloat(e.target.value) || 0})}
                      className="bg-gray-700/50 border-gray-600 text-white pr-6 text-sm"
                    />
                  </div>
                </div>

                {/* سعر الاشتراك المميز */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <Label className="text-gray-400 text-xs">مميز</Label>
                  </div>
                  <div className="relative">
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400 text-sm">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={subscriptionPrices.premium}
                      onChange={(e) => setSubscriptionPrices({...subscriptionPrices, premium: parseFloat(e.target.value) || 0})}
                      className="bg-gray-700/50 border-gray-600 text-white pr-6 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ملخص الأسعار */}
            <div className="bg-gray-700/30 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-3">ملخص الأسعار السنوية:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-amber-400">برونزية</span>
                  <span className="text-green-400">${(subscriptionPrices.bronze * 12).toFixed(0)}/سنة</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">فضية</span>
                  <span className="text-green-400">${(subscriptionPrices.silver * 12).toFixed(0)}/سنة</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-400">ذهبية</span>
                  <span className="text-green-400">${(subscriptionPrices.gold * 12).toFixed(0)}/سنة</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-400">أساسي</span>
                  <span className="text-green-400">${(subscriptionPrices.basic * 12).toFixed(0)}/سنة</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPricesModal(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button 
              onClick={saveSubscriptionPrices} 
              disabled={savingPrices}
              className="bg-green-600 hover:bg-green-700"
            >
              {savingPrices ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 ml-2" />
                  حفظ الأسعار
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog إضافة خلفية جديدة */}
      <Dialog open={showAddBackground} onOpenChange={setShowAddBackground}>
        <DialogContent className="bg-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-purple-400" />
              إضافة خلفية جديدة
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* اختيار طريقة الإضافة */}
            <div className="flex gap-2 p-1 bg-gray-700/50 rounded-lg">
              <button
                onClick={() => setBackgroundUploadMode('url')}
                className={`flex-1 py-2 px-3 rounded-md text-sm transition-all ${
                  backgroundUploadMode === 'url' 
                    ? 'bg-purple-600 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                رابط URL
              </button>
              <button
                onClick={() => setBackgroundUploadMode('device')}
                className={`flex-1 py-2 px-3 rounded-md text-sm transition-all ${
                  backgroundUploadMode === 'device' 
                    ? 'bg-purple-600 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                رفع من الجهاز
              </button>
            </div>

            {/* إدخال URL */}
            {backgroundUploadMode === 'url' && (
              <div className="space-y-2">
                <Label className="text-gray-300">رابط الصورة</Label>
                <Input
                  value={newBackgroundUrl}
                  onChange={(e) => setNewBackgroundUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="bg-gray-700/50 border-gray-600 text-white"
                />
              </div>
            )}

            {/* رفع من الجهاز */}
            {backgroundUploadMode === 'device' && (
              <div className="space-y-3">
                <Label className="text-gray-300">اختر صورة</Label>
                <div 
                  className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                  onClick={() => document.getElementById('background-file-input').click()}
                >
                  {backgroundPreviewUrl ? (
                    <div className="space-y-2">
                      <img 
                        src={backgroundPreviewUrl} 
                        alt="معاينة" 
                        className="max-h-32 mx-auto rounded-lg object-cover"
                      />
                      <p className="text-sm text-gray-400">{selectedBackgroundFile?.name}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-10 w-10 text-gray-500 mx-auto" />
                      <p className="text-gray-400">اضغط لاختيار صورة</p>
                      <p className="text-xs text-gray-500">PNG, JPG, WEBP, GIF (حتى 5MB)</p>
                    </div>
                  )}
                </div>
                <input
                  id="background-file-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setSelectedBackgroundFile(file);
                      setBackgroundPreviewUrl(URL.createObjectURL(file));
                    }
                  }}
                />
                {/* زر قص وتعديل الخلفية */}
                <Button 
                  variant="default" 
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => openImageCropper('background', 16/9, 'قص خلفية صفحة الدخول')}
                >
                  <Crop className="h-4 w-4 ml-2" />
                  قص وتعديل صورة
                </Button>
                <p className="text-xs text-gray-500 text-center">استخدم أداة القص للحصول على أبعاد مثالية للخلفية</p>
              </div>
            )}

            {/* عنوان الخلفية */}
            <div className="space-y-2">
              <Label className="text-gray-300">عنوان الخلفية (اختياري)</Label>
              <Input
                value={newBackgroundTitle}
                onChange={(e) => setNewBackgroundTitle(e.target.value)}
                placeholder="مثال: خلفية المطعم"
                className="bg-gray-700/50 border-gray-600 text-white"
              />
            </div>

            {/* نوع الحركة */}
            <div className="space-y-2">
              <Label className="text-gray-300">نوع الحركة</Label>
              <Select value={newBackgroundAnimation} onValueChange={setNewBackgroundAnimation}>
                <SelectTrigger className="bg-gray-700/50 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="fade">تلاشي (Fade)</SelectItem>
                  <SelectItem value="zoom">تكبير (Zoom)</SelectItem>
                  <SelectItem value="kenburns">كين بيرنز (Ken Burns)</SelectItem>
                  <SelectItem value="slide">انزلاق (Slide)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowAddBackground(false);
                setNewBackgroundUrl('');
                setNewBackgroundTitle('');
                setSelectedBackgroundFile(null);
                setBackgroundPreviewUrl('');
              }} 
              className="border-gray-600"
            >
              إلغاء
            </Button>
            <Button 
              onClick={async () => {
                if (backgroundUploadMode === 'url') {
                  await addNewBackground();
                } else if (selectedBackgroundFile) {
                  await uploadBackgroundFromDevice(selectedBackgroundFile);
                  setSelectedBackgroundFile(null);
                  setBackgroundPreviewUrl('');
                } else {
                  toast.error('الرجاء اختيار صورة');
                }
              }}
              disabled={backgroundsLoading || (backgroundUploadMode === 'url' ? !newBackgroundUrl : !selectedBackgroundFile)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {backgroundsLoading ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الرفع...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة الخلفية
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Cropper Modal */}
      <ImageCropper
        open={showImageCropper}
        onClose={() => setShowImageCropper(false)}
        onCropComplete={handleCroppedImage}
        aspectRatio={cropperAspectRatio}
        title={cropperTitle}
        circularCrop={false}
        maxWidth={cropperType === 'background' ? 1920 : 512}
        maxHeight={cropperType === 'background' ? 1080 : 512}
        quality={0.9}
      />

      {/* Modal: إعدادات العملات */}
      <Dialog open={showCurrencySettingsModal} onOpenChange={setShowCurrencySettingsModal}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Coins className="h-5 w-5 text-yellow-400" />
              إعدادات تحويل العملات
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* العملة المفضلة */}
            <div className="space-y-2">
              <Label className="text-gray-300">العملة المفضلة للعرض</Label>
              <Select 
                value={currencySettings.preferred_currency} 
                onValueChange={(value) => setCurrencySettings({...currencySettings, preferred_currency: value})}
              >
                <SelectTrigger className="bg-gray-700/50 border-gray-600">
                  <SelectValue placeholder="اختر العملة" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="USD">🇺🇸 دولار أمريكي (USD)</SelectItem>
                  <SelectItem value="IQD">🇮🇶 دينار عراقي (IQD)</SelectItem>
                  <SelectItem value="SAR">🇸🇦 ريال سعودي (SAR)</SelectItem>
                  <SelectItem value="AED">🇦🇪 درهم إماراتي (AED)</SelectItem>
                  <SelectItem value="EGP">🇪🇬 جنيه مصري (EGP)</SelectItem>
                  <SelectItem value="EUR">🇪🇺 يورو (EUR)</SelectItem>
                  <SelectItem value="JOD">🇯🇴 دينار أردني (JOD)</SelectItem>
                  <SelectItem value="KWD">🇰🇼 دينار كويتي (KWD)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* نوع أسعار الصرف */}
            <div className="space-y-2">
              <Label className="text-gray-300">مصدر أسعار الصرف</Label>
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant={!currencySettings.use_live_rates ? "default" : "outline"}
                  className={`flex-1 ${!currencySettings.use_live_rates ? 'bg-blue-600' : 'border-gray-600'}`}
                  onClick={() => setCurrencySettings({...currencySettings, use_live_rates: false})}
                >
                  <Banknote className="h-4 w-4 ml-2" />
                  أسعار ثابتة
                </Button>
                <Button
                  type="button"
                  variant={currencySettings.use_live_rates ? "default" : "outline"}
                  className={`flex-1 ${currencySettings.use_live_rates ? 'bg-green-600' : 'border-gray-600'}`}
                  onClick={() => setCurrencySettings({...currencySettings, use_live_rates: true})}
                >
                  <ArrowUpDown className="h-4 w-4 ml-2" />
                  أسعار حية
                </Button>
              </div>
            </div>

            {/* أسعار الصرف المخصصة (فقط إذا اختار أسعار ثابتة) */}
            {!currencySettings.use_live_rates && (
              <div className="space-y-3 bg-gray-700/30 rounded-lg p-4">
                <Label className="text-gray-300">تعديل أسعار الصرف (مقابل الدولار)</Label>
                <p className="text-xs text-gray-500">أدخل كم وحدة من كل عملة تساوي 1 دولار</p>
                
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { code: 'IQD', name: 'دينار عراقي', defaultRate: 1460 },
                    { code: 'SAR', name: 'ريال سعودي', defaultRate: 3.75 },
                    { code: 'AED', name: 'درهم إماراتي', defaultRate: 3.67 },
                    { code: 'EGP', name: 'جنيه مصري', defaultRate: 48 },
                  ].map(({ code, name, defaultRate }) => (
                    <div key={code} className="space-y-1">
                      <Label className="text-xs text-gray-400">{name}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={currencySettings.custom_rates?.[`${code}_USD`] || defaultRate}
                        onChange={(e) => setCurrencySettings({
                          ...currencySettings,
                          custom_rates: {
                            ...currencySettings.custom_rates,
                            [`${code}_USD`]: parseFloat(e.target.value) || defaultRate
                          }
                        })}
                        className="bg-gray-700/50 border-gray-600"
                        placeholder={defaultRate.toString()}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currencySettings.use_live_rates && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-sm text-green-400 flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  سيتم جلب أسعار الصرف تلقائياً من الإنترنت
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  يتم تحديث الأسعار كل مرة تفتح فيها التقارير
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCurrencySettingsModal(false)} 
              className="border-gray-600"
            >
              إلغاء
            </Button>
            <Button 
              onClick={saveCurrencySettings}
              disabled={savingCurrencySettings}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {savingCurrencySettings ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 ml-2" />
                  حفظ الإعدادات
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper function for TenantCard - moved outside component
// Note: This is handled inline in the tabs above
