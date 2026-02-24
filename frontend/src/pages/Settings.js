import React, { useState, useEffect } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { formatPrice, setCurrency } from '../utils/currency';
import { useTranslation } from '../hooks/useTranslation';
import { 
  playClick, 
  playSuccess, 
  playNewOrderNotification, 
  playIncomingCall,
  getSoundSettings,
  saveSoundSettings
} from '../utils/sound';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  ArrowRight,
  Settings as SettingsIcon,
  Users,
  User,
  UserCog,
  Store,
  Printer,
  Mail,
  DollarSign,
  Shield,
  Plus,
  Edit,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Truck,
  Percent,
  Save,
  Package,
  Image,
  Tag,
  Check,
  X,
  ChefHat,
  Utensils,
  UserCheck,
  Phone,
  MapPin,
  Ban,
  Search,
  LayoutGrid,
  Eye,
  EyeOff,
  Upload,
  ImageIcon,
  BarChart,
  ShoppingCart,
  Key,
  Volume2,
  VolumeX,
  Bell,
  Headphones,
  Webhook,
  Link,
  TestTube,
  Copy,
  RefreshCw,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Globe,
  CreditCard,
  Wallet,
  Banknote,
  Smartphone,
  Receipt,
  CheckCircle,
  Factory,
  Warehouse,
  Loader2,
  AlertCircle,
  AlertTriangle,
  PieChart,
  Star,
  ShoppingBag,
  Calendar,
  Gift,
  Ticket,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import ImageUploader from '../components/ImageUploader';

const API = API_URL;

// Permissions are now defined below in the component with the new comprehensive structure

// PERMISSION_GROUPS is now defined above with the new permissions structure

export default function Settings() {
  const { user, hasRole, logout, hasPermission } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, lang, changeLanguage, isRTL } = useTranslation();
  const navigate = useNavigate();
  
  // دالة للتحقق من صلاحيات الإعدادات
  const hasSettingsPermission = (permissionId) => {
    // المدير (admin) لديه جميع الصلاحيات
    if (user?.role === 'admin' || user?.role === 'super_admin') return true;
    // مدير الفرع لديه معظم الصلاحيات
    if (user?.role === 'branch_manager') return true;
    // التحقق من صلاحيات الموظف
    if (user?.permissions && user.permissions.length > 0) {
      return user.permissions.includes(permissionId);
    }
    return false;
  };
  
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [tenantLimits, setTenantLimits] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [emailRecipients, setEmailRecipients] = useState([]);
  const [deliveryApps, setDeliveryApps] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [kitchenSections, setKitchenSections] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  
  // حالة إضافة شركة توصيل جديدة
  const [showAddDeliveryApp, setShowAddDeliveryApp] = useState(false);
  const [newDeliveryApp, setNewDeliveryApp] = useState({
    name: '',
    name_en: '',
    commission_rate: 0,
    is_active: true
  });
  const [savingDeliveryApp, setSavingDeliveryApp] = useState(false);
  
  // إعدادات المطعم (الاسم والشعار)
  const [restaurantSettings, setRestaurantSettings] = useState({
    name: '',
    name_ar: '',
    logo_url: ''
  });
  const [restaurantLogoFile, setRestaurantLogoFile] = useState(null);
  const [restaurantLogoPreview, setRestaurantLogoPreview] = useState('');
  const [savingRestaurant, setSavingRestaurant] = useState(false);
  
  // إعدادات المنطقة والعملة
  const [regionalSettings, setRegionalSettings] = useState({
    country: 'IQ',
    currency: 'IQD',
    language: 'ar',
    secondary_currency: 'USD',
    show_secondary_currency: false
  });
  const [savingRegionalSettings, setSavingRegionalSettings] = useState(false);
  const [supportedCurrencies, setSupportedCurrencies] = useState({});
  const [supportedLanguages, setSupportedLanguages] = useState({});
  const [supportedCountries, setSupportedCountries] = useState({});
  
  // Payment Settings States - إعدادات الدفع
  const [paymentSettings, setPaymentSettings] = useState({
    stripe_enabled: true,
    stripe_publishable_key: '',
    stripe_secret_key: '',
    stripe_currency: 'USD',
    stripe_mode: 'test',
    zaincash_enabled: true,
    zaincash_phone: '',
    zaincash_name: '',
    zaincash_qr_image: '',
    cash_enabled: true,
    delivery_fee: 5000,
    min_order_amount: 10000
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  
  // إعدادات المخزون
  const [inventorySettings, setInventorySettings] = useState({
    inventory_mode: 'centralized',  // centralized or per_branch
    auto_deduct_on_sale: true,
    low_stock_notifications: true
  });
  const [savingInventorySettings, setSavingInventorySettings] = useState(false);
  
  // إعدادات الفاتورة للعميل (صاحب المطعم)
  const [invoiceSettings, setInvoiceSettings] = useState({
    show_logo: true,
    phone: '',
    phone2: '',
    address: '',
    tax_number: '',
    custom_header: '',
    custom_footer: ''
  });
  const [savingInvoiceSettings, setSavingInvoiceSettings] = useState(false);
  
  // صلاحيات الميزات المتاحة للعميل
  const [settingsPermissions, setSettingsPermissions] = useState({
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
  
  // Call Center States
  const [callCenterConfig, setCallCenterConfig] = useState({
    enabled: false,
    provider: '',
    api_url: '',
    api_key: '',
    api_secret: '',
    webhook_secret: '',
    auto_popup: true,
    auto_save_new_callers: true,
    play_sound: true
  });
  
  // Sound Settings States
  const [soundSettings, setSoundSettings] = useState({
    enabled: true,
    buttonSounds: true,
    orderNotifications: true,
    callRingtone: true,
    driverNotifications: true,
    volume: 0.7
  });
  const [callCenterTestStatus, setCallCenterTestStatus] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  
  // Staff Management States - إدارة الموظفين
  const [staffList, setStaffList] = useState([]);
  const [staffRoles, setStaffRoles] = useState({});
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [editStaffDialogOpen, setEditStaffDialogOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({
    full_name: '', email: '', phone: '', password: '', role: 'cashier', branch_id: '', job_title: '', permissions: []
  });
  const [editStaffForm, setEditStaffForm] = useState(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffFilter, setStaffFilter] = useState({ branch_id: '', role: '' });
  
  // فلتر المستخدمين حسب الدور
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  
  // تعديل شركة التوصيل
  const [editDeliveryApp, setEditDeliveryApp] = useState(null);
  const [editDeliveryAppDialogOpen, setEditDeliveryAppDialogOpen] = useState(false);
  
  // مجموعات الصلاحيات
  const PERMISSION_GROUPS = ['الصفحات الرئيسية', 'عمليات نقطة البيع', 'التقارير والتحليلات', 'الميزات الخاصة', 'عرض المبيعات', 'الإعدادات'];
  
  // جميع الصلاحيات المتاحة في النظام
  const ALL_PERMISSIONS = [
    // صلاحيات الصفحات الرئيسية (الإجراءات السريعة)
    { id: 'pos', name: 'نقطة البيع', description: 'الوصول لنقطة البيع', group: 'الإجراءات السريعة', featureKey: 'showPOS' },
    { id: 'tables', name: 'الطاولات', description: 'إدارة الطاولات', group: 'الإجراءات السريعة', featureKey: 'showTables' },
    { id: 'orders', name: 'الطلبات', description: 'عرض الطلبات', group: 'الإجراءات السريعة', featureKey: 'showOrders' },
    { id: 'kitchen', name: 'شاشة المطبخ', description: 'عرض طلبات المطبخ', group: 'الإجراءات السريعة', featureKey: 'showKitchen' },
    { id: 'reports', name: 'التقارير', description: 'عرض التقارير', group: 'الإجراءات السريعة', featureKey: 'showReports' },
    { id: 'reviews', name: 'التقييمات', description: 'عرض تقييمات العملاء', group: 'الإجراءات السريعة', featureKey: 'showReviews' },
    { id: 'expenses', name: 'المصاريف', description: 'عرض وإضافة المصاريف', group: 'الإجراءات السريعة', featureKey: 'showExpenses' },
    { id: 'purchasing', name: 'المشتريات', description: 'إدارة طلبات الشراء', group: 'الإجراءات السريعة', featureKey: 'showPurchasing' },
    { id: 'inventory', name: 'المخزن والتصنيع', description: 'إدارة المخزون والتصنيع', group: 'الإجراءات السريعة', featureKey: 'showInventory' },
    { id: 'branch_orders', name: 'طلبات الفروع', description: 'إدارة طلبات الفروع', group: 'الإجراءات السريعة', featureKey: 'showBranchOrders' },
    { id: 'inventory_reports', name: 'تقارير المخزون', description: 'عرض تقارير المخزون', group: 'الإجراءات السريعة', featureKey: 'showInventoryReports' },
    { id: 'delivery', name: 'التوصيل', description: 'إدارة التوصيل', group: 'الإجراءات السريعة', featureKey: 'showDelivery' },
    { id: 'owner_wallet', name: 'خزينة المالك', description: 'الوصول لخزينة المالك الشخصية', group: 'الإجراءات السريعة', featureKey: 'showOwnerWallet' },
    { id: 'coupons', name: 'الكوبونات', description: 'إدارة الكوبونات والعروض', group: 'الإجراءات السريعة', featureKey: 'showCoupons' },
    { id: 'loyalty', name: 'برنامج الولاء', description: 'إدارة نقاط الولاء', group: 'الإجراءات السريعة', featureKey: 'showLoyalty' },
    { id: 'call_logs', name: 'سجل المكالمات', description: 'عرض سجل المكالمات', group: 'الإجراءات السريعة', featureKey: 'showCallLogs' },
    { id: 'hr', name: 'الموارد البشرية', description: 'إدارة الموظفين والرواتب', group: 'الإجراءات السريعة', featureKey: 'showHR' },
    { id: 'reservations', name: 'الحجوزات', description: 'إدارة حجوزات الطاولات', group: 'الإجراءات السريعة', featureKey: 'showReservations' },
    { id: 'settings', name: 'الإعدادات', description: 'الوصول للإعدادات', group: 'الإجراءات السريعة', featureKey: 'showSettings' },
    { id: 'external_branches', name: 'الفروع الخارجية', description: 'إدارة الفروع المباعة/الخارجية', group: 'الإجراءات السريعة', featureKey: 'showExternalBranches' },
    
    // صلاحيات التقارير والتحليلات
    { id: 'comprehensive_report', name: 'التقرير الشامل', description: 'عرض التقرير الشامل المطبوع', group: 'التقارير والتحليلات', featureKey: 'showComprehensiveReport' },
    { id: 'smart_reports', name: 'التقرير الذكي', description: 'عرض التقرير الذكي بالذكاء الاصطناعي', group: 'التقارير والتحليلات', featureKey: 'showSmartReports' },
    { id: 'break_even_report', name: 'تقرير تحليل الكلف المفصل', description: 'عرض تقرير تحليل التكاليف والأرباح', group: 'التقارير والتحليلات', featureKey: 'showBreakEvenReport' },
    
    // صلاحيات عمليات نقطة البيع
    { id: 'pos_discount', name: 'إعطاء خصومات', description: 'السماح بإعطاء خصومات على الطلبات', group: 'عمليات نقطة البيع' },
    { id: 'pos_cancel', name: 'إلغاء الطلبات', description: 'السماح بإلغاء الطلبات', group: 'عمليات نقطة البيع' },
    { id: 'pos_refund', name: 'المرتجعات', description: 'السماح بعمل مرتجعات', group: 'عمليات نقطة البيع' },
    { id: 'pos_transfer_table', name: 'نقل الطاولة', description: 'نقل طلب من طاولة لأخرى', group: 'عمليات نقطة البيع' },
    { id: 'pos_day_management', name: 'إدارة اليوم', description: 'إدارة يوم المبيعات', group: 'عمليات نقطة البيع' },
    { id: 'shifts_close', name: 'إغلاق الصندوق', description: 'إغلاق صندوق الوردية', group: 'عمليات نقطة البيع' },
    
    // صلاحيات عرض المبيعات (فلاتر الوقت)
    { id: 'sales_view_today', name: 'عرض اليوم', description: 'عرض مبيعات اليوم فقط', group: 'عرض المبيعات' },
    { id: 'sales_view_week', name: 'عرض الأسبوع', description: 'عرض مبيعات الأسبوع', group: 'عرض المبيعات' },
    { id: 'sales_view_month', name: 'عرض الشهر', description: 'عرض مبيعات الشهر', group: 'عرض المبيعات' },
    { id: 'sales_view_all', name: 'عرض الكل', description: 'عرض جميع المبيعات', group: 'عرض المبيعات' },
    
    // صلاحيات الإعدادات
    { id: 'settings_notifications', name: 'الإشعارات', description: 'إعدادات الإشعارات', group: 'الإعدادات', featureKey: 'settingsNotifications' },
    { id: 'settings_call_center', name: 'كول سنتر', description: 'إعدادات مركز الاتصال', group: 'الإعدادات', featureKey: 'settingsCallCenter' },
    { id: 'settings_delivery', name: 'شركات التوصيل', description: 'إدارة شركات التوصيل', group: 'الإعدادات', featureKey: 'settingsDeliveryCompanies' },
    { id: 'settings_printers', name: 'الطابعات', description: 'إدارة الطابعات', group: 'الإعدادات', featureKey: 'settingsPrinters' },
    { id: 'settings_products', name: 'المنتجات', description: 'إدارة المنتجات', group: 'الإعدادات', featureKey: 'settingsProducts' },
    { id: 'settings_categories', name: 'الفئات', description: 'إدارة فئات المنتجات', group: 'الإعدادات', featureKey: 'settingsCategories' },
    { id: 'settings_branches', name: 'الفروع', description: 'إدارة الفروع', group: 'الإعدادات', featureKey: 'settingsBranches' },
    { id: 'settings_customers', name: 'العملاء', description: 'إدارة العملاء', group: 'الإعدادات', featureKey: 'settingsCustomers' },
    { id: 'settings_users', name: 'المستخدمين', description: 'إدارة المستخدمين والصلاحيات', group: 'الإعدادات', featureKey: 'settingsUsers' },
    { id: 'settings_restaurant', name: 'المطعم', description: 'إعدادات المطعم الأساسية', group: 'الإعدادات', featureKey: 'settingsRestaurant' },
    { id: 'settings_appearance', name: 'المظهر', description: 'تغيير مظهر التطبيق', group: 'الإعدادات', featureKey: 'settingsAppearance' },
    { id: 'settings_invoice', name: 'إعدادات الفاتورة', description: 'تخصيص شكل الفاتورة', group: 'الإعدادات', featureKey: 'settingsInvoice' },
    { id: 'settings_system', name: 'إعدادات النظام', description: 'إعدادات النظام العامة', group: 'الإعدادات', featureKey: 'settingsSystem' },
    { id: 'settings_inventory', name: 'إعدادات المخزون', description: 'إعدادات إدارة المخزون', group: 'الإعدادات', featureKey: 'settingsInventory' },
    { id: 'settings_payment', name: 'الدفع الإلكتروني', description: 'إعدادات الدفع الإلكتروني', group: 'الإعدادات', featureKey: 'settingsPayment' },
    { id: 'settings_kitchen', name: 'أقسام المطبخ', description: 'إدارة أقسام المطبخ', group: 'الإعدادات', featureKey: 'settingsKitchenSections' },
  ];
  
  // فلترة الصلاحيات حسب ميزات العميل المفعلة
  const getAvailablePermissions = () => {
    return ALL_PERMISSIONS.filter(perm => {
      // إذا لم يكن للصلاحية featureKey، اعرضها دائماً
      if (!perm.featureKey) return true;
      // إذا كانت الميزة مفعلة للعميل، اعرض الصلاحية
      return dashboardSettings[perm.featureKey] !== false;
    });
  };
  
  // للتوافق مع الكود القديم
  const AVAILABLE_PERMISSIONS = ALL_PERMISSIONS;
  
  // صلاحيات الموظفين المبسطة (للتوافق مع الكود القديم)
  const STAFF_PERMISSIONS = ALL_PERMISSIONS;
  
  // Dialog states
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [editBranchDialogOpen, setEditBranchDialogOpen] = useState(false);
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editProductDialogOpen, setEditProductDialogOpen] = useState(false);
  const [kitchenSectionDialogOpen, setKitchenSectionDialogOpen] = useState(false);
  const [editKitchenSectionDialogOpen, setEditKitchenSectionDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editCustomerDialogOpen, setEditCustomerDialogOpen] = useState(false);
  
  // Form data
  const [userForm, setUserForm] = useState({
    username: '', email: '', password: '', full_name: '', role: 'cashier', branch_id: '', permissions: []
  });
  const [editUserForm, setEditUserForm] = useState(null);
  const [branchForm, setBranchForm] = useState({
    name: '', address: '', phone: '', email: ''
  });
  const [editBranchForm, setEditBranchForm] = useState(null);
  const [printerForm, setPrinterForm] = useState({
    name: '', ip_address: '', port: 9100, branch_id: '', printer_type: 'receipt',
    print_mode: 'full_receipt', show_prices: true, print_individual_items: false, auto_print_on_order: true
  });
  const [editPrinterForm, setEditPrinterForm] = useState(null);
  const [editPrinterDialogOpen, setEditPrinterDialogOpen] = useState(false);
  const [printerTestStatus, setPrinterTestStatus] = useState({}); // حالة اختبار الطابعات
  const [printerTypes, setPrinterTypes] = useState([]);
  const [categoryForm, setCategoryForm] = useState({
    name: '', name_en: '', icon: '', image: '', color: '#D4AF37', sort_order: 0, kitchen_section_id: ''
  });
  const [editCategoryForm, setEditCategoryForm] = useState(null);
  const [editCategoryDialogOpen, setEditCategoryDialogOpen] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '', name_en: '', category_id: '', price: '', cost: '', operating_cost: '', packaging_cost: '', image: '', description: '', barcode: '', manufactured_product_id: '', printer_ids: []
  });
  const [editProductForm, setEditProductForm] = useState(null);
  const [manufacturedProducts, setManufacturedProducts] = useState([]);
  const [kitchenSectionForm, setKitchenSectionForm] = useState({
    name: '', name_en: '', color: '#D4AF37', icon: '🍳', printer_id: '', branch_id: '', sort_order: 0
  });
  const [editKitchenSectionForm, setEditKitchenSectionForm] = useState(null);
  const [customerForm, setCustomerForm] = useState({
    name: '', phone: '', phone2: '', address: '', area: '', notes: '', is_blocked: false
  });
  const [editCustomerForm, setEditCustomerForm] = useState(null);
  const [dashboardSettings, setDashboardSettings] = useState({
    // الإجراءات السريعة
    showPOS: true,
    showTables: true,
    showOrders: true,
    showKitchen: true,
    showReports: true,
    showReviews: true,
    showExpenses: true,
    showPurchasing: true,
    showWarehouse: true,
    showInventory: true,
    showBranchOrders: true,
    showInventoryReports: true,
    showDelivery: true,
    showOwnerWallet: true,
    showCoupons: true,
    showLoyalty: true,
    showCallLogs: true,
    showHR: true,
    showReservations: true,
    showSettings: true,
    showExternalBranches: true,
    // التقارير
    showSmartReports: true,
    showComprehensiveReport: true,
    showBreakEvenReport: true,
    // الإعدادات
    settingsNotifications: true,
    settingsCallCenter: true,
    settingsDeliveryCompanies: true,
    settingsPrinters: true,
    settingsProducts: true,
    settingsCategories: true,
    settingsBranches: true,
    settingsCustomers: true,
    settingsUsers: true,
    settingsRestaurant: true,
    settingsAppearance: true,
    settingsInvoice: true,
    settingsSystem: true,
    settingsInventory: true,
    settingsPayment: true,
    settingsKitchenSections: true,
  });

  useEffect(() => {
    if (hasRole(['admin', 'super_admin', 'manager', 'branch_manager'])) {
      fetchData();
      fetchSettingsPermissions();
    } else {
      setLoading(false);
    }
    // تحميل إعدادات الصوت
    const savedSoundSettings = getSoundSettings();
    setSoundSettings(savedSoundSettings);
  }, []);

  // جلب صلاحيات الإعدادات المتاحة للعميل
  const fetchSettingsPermissions = async () => {
    try {
      const res = await axios.get(`${API}/settings/dashboard`);
      if (res.data) {
        setSettingsPermissions({
          settingsUsers: res.data.settingsUsers !== false,
          settingsCustomers: res.data.settingsCustomers !== false,
          settingsBranches: res.data.settingsBranches !== false,
          settingsCategories: res.data.settingsCategories !== false,
          settingsProducts: res.data.settingsProducts !== false,
          settingsPrinters: res.data.settingsPrinters !== false,
          settingsDeliveryCompanies: res.data.settingsDeliveryCompanies !== false,
          settingsCallCenter: res.data.settingsCallCenter !== false,
          settingsNotifications: res.data.settingsNotifications !== false,
          settingsRestaurant: res.data.settingsRestaurant !== false,
          settingsAppearance: res.data.settingsAppearance !== false,
          settingsInvoice: res.data.settingsInvoice !== false,
          settingsSystem: res.data.settingsSystem !== false,
          settingsInventory: res.data.settingsInventory !== false,
          settingsPayment: res.data.settingsPayment !== false,
          settingsKitchenSections: res.data.settingsKitchenSections !== false,
        });
      }
    } catch (error) {
      console.log('Using default settings permissions');
    }
  };

  const fetchData = async () => {
    try {
      const [usersRes, branchesRes, printersRes, settingsRes, appsRes, categoriesRes, productsRes, sectionsRes, customersRes, mfgProductsRes, printerTypesRes, limitsRes] = await Promise.all([
        axios.get(`${API}/users`),
        axios.get(`${API}/branches`),
        axios.get(`${API}/printers`),
        axios.get(`${API}/settings`),
        axios.get(`${API}/delivery-apps`),
        axios.get(`${API}/categories`),
        axios.get(`${API}/products`),
        axios.get(`${API}/kitchen-sections`),
        axios.get(`${API}/customers`),
        axios.get(`${API}/manufactured-products`).catch(() => ({ data: [] })),
        axios.get(`${API}/printer-types`).catch(() => ({ data: { default: [], custom: [] } })),
        axios.get(`${API}/tenant/limits`).catch(() => ({ data: null }))
      ]);

      setUsers(usersRes.data);
      setBranches(branchesRes.data);
      setTenantLimits(limitsRes.data);
      setPrinters(printersRes.data);
      setEmailRecipients(settingsRes.data.email_recipients?.emails || []);
      setDeliveryApps(appsRes.data);
      setCategories(categoriesRes.data);
      setProducts(productsRes.data);
      setKitchenSections(sectionsRes.data);
      setCustomers(customersRes.data);
      setManufacturedProducts(mfgProductsRes.data || []);
      setPrinterTypes([...(printerTypesRes.data?.default || []), ...(printerTypesRes.data?.custom || [])]);
      
      // تعيين الفرع الافتراضي لنموذج المستخدم الجديد
      if (branchesRes.data.length > 0) {
        setUserForm(prev => ({...prev, branch_id: prev.branch_id || branchesRes.data[0].id}));
        setStaffForm(prev => ({...prev, branch_id: prev.branch_id || branchesRes.data[0].id}));
      }
      
      // جلب إعدادات الصفحة الرئيسية من API منفصل
      try {
        const dashboardRes = await axios.get(`${API}/settings/dashboard`);
        if (dashboardRes.data) {
          setDashboardSettings(prev => ({...prev, ...dashboardRes.data}));
        }
      } catch (err) {
        console.log('Using default dashboard settings');
      }
      
      // جلب الموظفين والأدوار
      fetchStaffData();
      
      // جلب إعدادات الدفع
      fetchPaymentSettings();
      
      // جلب إعدادات المخزون
      fetchInventorySettings();
      
      // جلب إعدادات الفاتورة للعميل
      fetchInvoiceSettings();
      
      // جلب إعدادات المنطقة والعملة
      fetchRegionalSettings();
      
      // جلب إعدادات المطعم
      fetchRestaurantSettings();
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // جلب إعدادات المطعم
  const fetchRestaurantSettings = async () => {
    try {
      const res = await axios.get(`${API}/settings/restaurant`);
      setRestaurantSettings(res.data);
      if (res.data.logo_url) {
        const logoUrl = res.data.logo_url;
        if (logoUrl.startsWith('/api')) {
          setRestaurantLogoPreview(`${API}${logoUrl.replace('/api', '')}`);
        } else {
          setRestaurantLogoPreview(logoUrl);
        }
      }
    } catch (error) {
      console.error('Failed to fetch restaurant settings:', error);
    }
  };

  // جلب إعدادات المخزون
  const fetchInventorySettings = async () => {
    try {
      const res = await axios.get(`${API}/inventory-settings`);
      setInventorySettings(prev => ({ ...prev, ...res.data }));
    } catch (error) {
      console.error('Failed to fetch inventory settings:', error);
    }
  };

  // حفظ إعدادات المخزون
  const saveInventorySettings = async () => {
    setSavingInventorySettings(true);
    try {
      await axios.put(`${API}/inventory-settings`, inventorySettings);
      toast.success(t('تم الحفظ بنجاح'));
    } catch (error) {
      toast.error(t('فشل في حفظ الإعدادات'));
    } finally {
      setSavingInventorySettings(false);
    }
  };

  // جلب إعدادات الفاتورة للعميل
  const fetchInvoiceSettings = async () => {
    try {
      const res = await axios.get(`${API}/tenant/invoice-settings`);
      setInvoiceSettings(prev => ({ ...prev, ...res.data }));
    } catch (error) {
      console.error('Failed to fetch invoice settings:', error);
    }
  };

  // حفظ إعدادات الفاتورة للعميل
  const saveInvoiceSettings = async () => {
    setSavingInvoiceSettings(true);
    try {
      await axios.put(`${API}/tenant/invoice-settings`, invoiceSettings);
      toast.success(t('تم الحفظ بنجاح'));
    } catch (error) {
      toast.error(t('فشل في حفظ الإعدادات'));
    } finally {
      setSavingInvoiceSettings(false);
    }
  };

  // جلب إعدادات المنطقة والعملة
  const fetchRegionalSettings = async () => {
    try {
      const [regionalRes, currenciesRes, languagesRes, countriesRes] = await Promise.all([
        axios.get(`${API}/tenant/regional-settings`),
        axios.get(`${API}/system/currencies`),
        axios.get(`${API}/system/languages`),
        axios.get(`${API}/system/countries`)
      ]);
      
      const settings = regionalRes.data;
      setRegionalSettings(prev => ({ ...prev, ...settings }));
      setSupportedCurrencies(currenciesRes.data.currencies);
      setSupportedLanguages(languagesRes.data.languages);
      setSupportedCountries(countriesRes.data.countries);
      
      // حفظ في localStorage للاستخدام في كل النظام
      if (settings.currency) localStorage.setItem('app_currency', settings.currency);
      // لا نكتب فوق اختيار اللغة من localStorage - المستخدم يختار اللغة بنفسه
      // if (settings.language) localStorage.setItem('app_language', settings.language);
      if (settings.country) localStorage.setItem('app_country', settings.country);
    } catch (error) {
      console.error('Failed to fetch regional settings:', error);
    }
  };

  // حفظ إعدادات المنطقة والعملة
  const saveRegionalSettings = async () => {
    setSavingRegionalSettings(true);
    try {
      await axios.put(`${API}/tenant/regional-settings`, regionalSettings);
      
      // تحديث العملة باستخدام setCurrency من currency.js
      setCurrency(regionalSettings.currency);
      localStorage.setItem('app_country', regionalSettings.country);
      
      // إرسال حدث تغيير العملة
      window.dispatchEvent(new CustomEvent('currencyChanged', { detail: regionalSettings.currency }));
      
      // تغيير اللغة باستخدام changeLanguage من useTranslation
      // هذا سيحدث localStorage ويعيد تحميل الصفحة تلقائياً
      if (regionalSettings.language !== lang) {
        toast.success(t('تم الحفظ بنجاح') + ' - ' + t('جاري التحميل...'));
        setTimeout(() => {
          changeLanguage(regionalSettings.language);
        }, 1000);
      } else {
        toast.success(t('تم الحفظ بنجاح'));
        // إعادة تحميل الصفحة لتطبيق تغييرات العملة
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error) {
      toast.error(t('حدث خطأ'));
    } finally {
      setSavingRegionalSettings(false);
    }
  };

  // تغيير البلد يغير العملة واللغة تلقائياً
  const handleCountryChange = (countryCode) => {
    const country = supportedCountries[countryCode];
    if (country) {
      setRegionalSettings(prev => ({
        ...prev,
        country: countryCode,
        currency: country.currency,
        language: country.language
      }));
    }
  };

  // جلب إعدادات الدفع
  const fetchPaymentSettings = async () => {
    try {
      const res = await axios.get(`${API}/payment-settings`);
      setPaymentSettings(prev => ({ ...prev, ...res.data }));
    } catch (error) {
      console.error('Failed to fetch payment settings:', error);
    }
  };

  // حفظ إعدادات Stripe
  const saveStripeSettings = async () => {
    try {
      setPaymentSaving(true);
      await axios.post(`${API}/payment-settings`, {
        stripe_enabled: paymentSettings.stripe_enabled,
        stripe_publishable_key: paymentSettings.stripe_publishable_key,
        stripe_secret_key: paymentSettings.stripe_secret_key,
        stripe_currency: paymentSettings.stripe_currency,
        stripe_mode: paymentSettings.stripe_mode
      });
      toast.success(t('تم الحفظ بنجاح'));
    } catch (error) {
      toast.error(t('فشل في حفظ الإعدادات'));
    } finally {
      setPaymentSaving(false);
    }
  };

  // حفظ إعدادات زين كاش
  const saveZainCashSettings = async () => {
    try {
      setPaymentSaving(true);
      await axios.post(`${API}/payment-settings`, {
        zaincash_enabled: paymentSettings.zaincash_enabled,
        zaincash_phone: paymentSettings.zaincash_phone,
        zaincash_name: paymentSettings.zaincash_name
      });
      toast.success(t('تم الحفظ بنجاح'));
    } catch (error) {
      toast.error(t('فشل في حفظ الإعدادات'));
    } finally {
      setPaymentSaving(false);
    }
  };

  // حفظ رسوم التوصيل
  const saveDeliverySettings = async () => {
    try {
      setPaymentSaving(true);
      await axios.post(`${API}/payment-settings`, {
        delivery_fee: paymentSettings.delivery_fee,
        min_order_amount: paymentSettings.min_order_amount
      });
      toast.success(t('تم الحفظ بنجاح'));
    } catch (error) {
      toast.error(t('فشل في حفظ الإعدادات'));
    } finally {
      setPaymentSaving(false);
    }
  };

  // رفع صورة QR لزين كاش
  const uploadZainCashQR = async (file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/payment-settings/zaincash-qr`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });
      setPaymentSettings(prev => ({ ...prev, zaincash_qr_image: res.data.image_url }));
      toast.success(t('تم الحفظ بنجاح'));
    } catch (error) {
      console.error('Upload ZainCash QR error:', error);
      toast.error(t('فشل في رفع الصورة') + ': ' +  + (error.response?.data?.detail || error.message));
    }
  };

  // دوال إدارة الموظفين
  const fetchStaffData = async () => {
    try {
      setStaffLoading(true);
      const [staffRes, rolesRes] = await Promise.all([
        axios.get(`${API}/staff`),
        axios.get(`${API}/staff/roles`)
      ]);
      setStaffList(staffRes.data);
      setStaffRoles(rolesRes.data);
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    } finally {
      setStaffLoading(false);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/staff`, staffForm);
      toast.success(t('تم الحفظ بنجاح'));
      setStaffDialogOpen(false);
      setStaffForm({ full_name: '', email: '', phone: '', password: '', role: 'cashier', branch_id: branches[0]?.id || '', job_title: '', permissions: [] });
      fetchStaffData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ البيانات'));
    }
  };

  const handleUpdateStaff = async (e) => {
    e.preventDefault();
    if (!editStaffForm) return;
    try {
      await axios.put(`${API}/staff/${editStaffForm.id}`, {
        full_name: editStaffForm.full_name,
        phone: editStaffForm.phone,
        role: editStaffForm.role,
        branch_id: editStaffForm.branch_id,
        job_title: editStaffForm.job_title,
        is_active: editStaffForm.is_active,
        permissions: editStaffForm.permissions || []
      });
      toast.success(t('تم التحديث بنجاح'));
      setEditStaffDialogOpen(false);
      setEditStaffForm(null);
      fetchStaffData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ البيانات'));
    }
  };

  const handleDeleteStaff = async (staffId) => {
    if (!window.confirm('هل أنت متأكد من تعطيل هذا الموظف؟')) return;
    try {
      await axios.delete(`${API}/staff/${staffId}`);
      toast.success(t('تم الحفظ بنجاح'));
      fetchStaffData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ البيانات'));
    }
  };

  const handleEditStaff = (staff) => {
    setEditStaffForm({
      ...staff,
      permissions: staff.permissions || []
    });
    setEditStaffDialogOpen(true);
  };

  const handleResetStaffPassword = async (staffId) => {
    const newPassword = window.prompt('أدخل كلمة المرور الجديدة:');
    if (!newPassword) return;
    try {
      await axios.post(`${API}/staff/${staffId}/reset-password`, { new_password: newPassword });
      toast.success(t('تم الحفظ بنجاح'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ البيانات'));
    }
  };

  const getFilteredStaff = () => {
    return staffList.filter(staff => {
      if (staffFilter.branch_id && staff.branch_id !== staffFilter.branch_id) return false;
      if (staffFilter.role && staff.role !== staffFilter.role) return false;
      return true;
    });
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      // استخدام endpoint جديد يضيف tenant_id تلقائياً
      await axios.post(`${API}/users`, userForm);
      toast.success(t('تم الحفظ بنجاح'));
      setUserDialogOpen(false);
      setUserForm({ username: '', email: '', password: '', full_name: '', role: 'cashier', branch_id: '', permissions: [] });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ البيانات'));
    }
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/branches`, branchForm);
      toast.success(t('تم الحفظ بنجاح'));
      setBranchDialogOpen(false);
      setBranchForm({ name: '', address: '', phone: '', email: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ البيانات'));
    }
  };

  const handleEditBranch = (b) => {
    setEditBranchForm({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      email: b.email || '',
      is_active: b.is_active !== false,
      // التكاليف الثابتة الشهرية
      rent_cost: b.rent_cost || 0,
      water_cost: b.water_cost || 0,
      electricity_cost: b.electricity_cost || 0,
      generator_cost: b.generator_cost || 0
    });
    setEditBranchDialogOpen(true);
  };

  const handleUpdateBranch = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/branches/${editBranchForm.id}`, {
        name: editBranchForm.name,
        address: editBranchForm.address,
        phone: editBranchForm.phone,
        email: editBranchForm.email || null,
        // التكاليف الثابتة الشهرية
        rent_cost: parseFloat(editBranchForm.rent_cost) || 0,
        water_cost: parseFloat(editBranchForm.water_cost) || 0,
        electricity_cost: parseFloat(editBranchForm.electricity_cost) || 0,
        generator_cost: parseFloat(editBranchForm.generator_cost) || 0,
        // إعدادات الفرع المباع
        is_sold_branch: editBranchForm.is_sold_branch || false,
        buyer_name: editBranchForm.buyer_name || null,
        buyer_phone: editBranchForm.buyer_phone || null,
        owner_percentage: parseFloat(editBranchForm.owner_percentage) || 0,
        monthly_fee: parseFloat(editBranchForm.monthly_fee) || 0
      });
      toast.success(t('تم التحديث بنجاح'));
      setEditBranchDialogOpen(false);
      setEditBranchForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ البيانات'));
    }
  };

  const handleDeleteBranch = async (branchId) => {
    if (!confirm(t('هل أنت متأكد؟'))) return;
    try {
      await axios.delete(`${API}/branches/${branchId}`);
      toast.success(t('تم الحفظ بنجاح'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حذف الفرع'));
    }
  };

  const handleResetPassword = async (u) => {
    const newPassword = prompt(t('أدخل كلمة المرور الجديدة للمستخدم') + ` "${u.full_name}":`, '');
    if (!newPassword) return;
    
    if (newPassword.length < 4) {
      toast.error(t('كلمة المرور يجب أن تكون 4 أحرف على الأقل'));
      return;
    }
    
    try {
      await axios.put(`${API}/users/${u.id}/reset-password`, { new_password: newPassword });
      toast.success(t('تم تغيير كلمة المرور للمستخدم') + ` ${u.full_name}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ البيانات'));
    }
  };

  const handleCreatePrinter = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/printers`, printerForm);
      toast.success(t('تم إضافة الطابعة'));
      setPrinterDialogOpen(false);
      setPrinterForm({ 
        name: '', ip_address: '', port: 9100, branch_id: '', printer_type: 'receipt',
        print_mode: 'full_receipt', show_prices: true, print_individual_items: false, auto_print_on_order: true
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة الطابعة'));
    }
  };

  const handleEditPrinter = (printer) => {
    setEditPrinterForm({
      id: printer.id,
      name: printer.name,
      ip_address: printer.ip_address,
      port: printer.port || 9100,
      branch_id: printer.branch_id,
      printer_type: printer.printer_type || 'receipt',
      print_mode: printer.print_mode || 'full_receipt',
      show_prices: printer.show_prices !== false,
      print_individual_items: printer.print_individual_items || false,
      auto_print_on_order: printer.auto_print_on_order !== false
    });
    setEditPrinterDialogOpen(true);
  };

  const handleUpdatePrinter = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/printers/${editPrinterForm.id}`, {
        name: editPrinterForm.name,
        ip_address: editPrinterForm.ip_address,
        port: editPrinterForm.port,
        branch_id: editPrinterForm.branch_id,
        printer_type: editPrinterForm.printer_type,
        print_mode: editPrinterForm.print_mode,
        show_prices: editPrinterForm.show_prices,
        print_individual_items: editPrinterForm.print_individual_items,
        auto_print_on_order: editPrinterForm.auto_print_on_order
      });
      toast.success(t('تم تحديث الطابعة'));
      setEditPrinterDialogOpen(false);
      setEditPrinterForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحديث الطابعة'));
    }
  };

  const handleDeletePrinter = async (printerId) => {
    if (!window.confirm(t('هل أنت متأكد؟'))) return;
    try {
      await axios.delete(`${API}/printers/${printerId}`);
      toast.success(t('تم حذف الطابعة'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حذف الطابعة'));
    }
  };

  const handleTestPrinter = async (printerId) => {
    setPrinterTestStatus(prev => ({ ...prev, [printerId]: 'testing' }));
    try {
      const res = await axios.post(`${API}/printers/${printerId}/test`);
      setPrinterTestStatus(prev => ({ ...prev, [printerId]: res.data.status }));
      if (res.data.status === 'online') {
        toast.success(t('الطابعة متصلة'));
      } else {
        toast.error(t('الطابعة غير متصلة'));
      }
      // تحديث البيانات بعد 3 ثواني
      setTimeout(() => {
        setPrinterTestStatus(prev => ({ ...prev, [printerId]: null }));
      }, 5000);
    } catch (error) {
      setPrinterTestStatus(prev => ({ ...prev, [printerId]: 'error' }));
      toast.error(t('فشل اختبار الاتصال'));
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error(t('يرجى إدخال بريد إلكتروني صحيح'));
      return;
    }
    try {
      const updated = [...emailRecipients, newEmail];
      await axios.post(`${API}/settings/email-recipients`, updated);
      setEmailRecipients(updated);
      setNewEmail('');
      toast.success(t('تم إضافة البريد'));
    } catch (error) {
      toast.error(t('فشل في إضافة البريد'));
    }
  };

  const handleRemoveEmail = async (email) => {
    try {
      const updated = emailRecipients.filter(e => e !== email);
      await axios.post(`${API}/settings/email-recipients`, updated);
      setEmailRecipients(updated);
      toast.success(t('تم حذف البريد'));
    } catch (error) {
      toast.error(t('فشل في حذف البريد'));
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm(t('هل أنت متأكد؟'))) return;
    try {
      await axios.delete(`${API}/users/${userId}`);
      toast.success(t('تم حذف المستخدم'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في حذف المستخدم'));
    }
  };

  const handleEditUser = (u) => {
    setEditUserForm({
      id: u.id,
      username: u.username,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      branch_id: u.branch_id || '',
      permissions: u.permissions || [],
      is_active: u.is_active !== false
    });
    setEditUserDialogOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      // تحديث بيانات المستخدم
      await axios.put(`${API}/users/${editUserForm.id}`, {
        username: editUserForm.username,
        email: editUserForm.email,
        full_name: editUserForm.full_name,
        role: editUserForm.role,
        branch_id: editUserForm.branch_id || null,
        permissions: editUserForm.permissions,
        is_active: editUserForm.is_active
      });
      
      // تغيير كلمة المرور إذا تم إدخالها
      if (editUserForm.new_password && editUserForm.new_password.length >= 4) {
        await axios.put(`${API}/users/${editUserForm.id}/reset-password`, {
          new_password: editUserForm.new_password
        });
        toast.success(t('تم تحديث المستخدم وكلمة المرور'));
      } else {
        toast.success(t('تم تحديث المستخدم'));
      }
      
      setEditUserDialogOpen(false);
      setEditUserForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحديث المستخدم'));
    }
  };

  const toggleUserPermission = (permId) => {
    if (!editUserForm) return;
    const perms = editUserForm.permissions || [];
    if (perms.includes(permId)) {
      setEditUserForm({ ...editUserForm, permissions: perms.filter(p => p !== permId) });
    } else {
      setEditUserForm({ ...editUserForm, permissions: [...perms, permId] });
    }
  };

  // Category handlers
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/categories`, categoryForm);
      toast.success(t('تم إنشاء الفئة'));
      setCategoryDialogOpen(false);
      setCategoryForm({ name: '', name_en: '', icon: '', image: '', color: '#D4AF37', sort_order: 0 });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إنشاء الفئة'));
    }
  };

  const handleUpdateCategory = async (e) => {
    e.preventDefault();
    if (!editCategoryForm) return;
    try {
      await axios.put(`${API}/categories/${editCategoryForm.id}`, {
        name: editCategoryForm.name,
        name_en: editCategoryForm.name_en,
        icon: editCategoryForm.icon,
        image: editCategoryForm.image,
        color: editCategoryForm.color,
        sort_order: editCategoryForm.sort_order
      });
      toast.success(t('تم تحديث الفئة'));
      setEditCategoryDialogOpen(false);
      setEditCategoryForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحديث الفئة'));
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm(t('هل أنت متأكد؟'))) return;
    try {
      await axios.delete(`${API}/categories/${categoryId}`);
      toast.success(t('تم حذف الفئة'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في حذف الفئة'));
    }
  };

  // حفظ إعدادات الصفحة الرئيسية
  const handleSaveDashboardSettings = async () => {
    try {
      await axios.put(`${API}/settings/dashboard`, dashboardSettings);
      toast.success(t('تم حفظ إعدادات الصفحة الرئيسية'));
    } catch (error) {
      toast.error(t('فشل في حفظ الإعدادات'));
    }
  };

  // Product handlers
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/products`, {
        ...productForm,
        price: parseFloat(productForm.price) || 0,
        cost: parseFloat(productForm.cost) || 0,
        operating_cost: parseFloat(productForm.operating_cost) || 0,
        packaging_cost: parseFloat(productForm.packaging_cost) || 0,
        manufactured_product_id: productForm.manufactured_product_id || null
      });
      toast.success(t('تم إنشاء المنتج'));
      setProductDialogOpen(false);
      setProductForm({ name: '', name_en: '', category_id: '', price: '', cost: '', operating_cost: '', packaging_cost: '', image: '', description: '', barcode: '', manufactured_product_id: '', printer_ids: [] });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إنشاء المنتج'));
    }
  };

  const handleEditProduct = (p) => {
    setEditProductForm({
      id: p.id,
      name: p.name,
      name_en: p.name_en || '',
      category_id: p.category_id,
      price: p.price,
      cost: p.cost || 0,
      operating_cost: p.operating_cost || 0,
      packaging_cost: p.packaging_cost || 0,
      image: p.image || '',
      description: p.description || '',
      barcode: p.barcode || '',
      is_available: p.is_available !== false,
      manufactured_product_id: p.manufactured_product_id || ''
    });
    setEditProductDialogOpen(true);
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/products/${editProductForm.id}`, {
        ...editProductForm,
        price: parseFloat(editProductForm.price) || 0,
        cost: parseFloat(editProductForm.cost) || 0,
        operating_cost: parseFloat(editProductForm.operating_cost) || 0,
        packaging_cost: parseFloat(editProductForm.packaging_cost) || 0,
        manufactured_product_id: editProductForm.manufactured_product_id || null
      });
      toast.success(t('تم تحديث المنتج'));
      setEditProductDialogOpen(false);
      setEditProductForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحديث المنتج'));
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!confirm(t('هل أنت متأكد؟'))) return;
    try {
      await axios.delete(`${API}/products/${productId}`);
      toast.success(t('تم حذف المنتج'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في حذف المنتج'));
    }
  };

  // Kitchen Section handlers
  const handleCreateKitchenSection = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/kitchen-sections`, kitchenSectionForm);
      toast.success(t('تم إنشاء قسم المطبخ'));
      setKitchenSectionDialogOpen(false);
      setKitchenSectionForm({ name: '', name_en: '', color: '#D4AF37', icon: '🍳', printer_id: '', branch_id: '', sort_order: 0 });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إنشاء قسم المطبخ'));
    }
  };

  const handleEditKitchenSection = (s) => {
    setEditKitchenSectionForm({
      id: s.id,
      name: s.name,
      name_en: s.name_en || '',
      color: s.color || '#D4AF37',
      icon: s.icon || '🍳',
      printer_id: s.printer_id || '',
      branch_id: s.branch_id || '',
      sort_order: s.sort_order || 0
    });
    setEditKitchenSectionDialogOpen(true);
  };

  const handleUpdateKitchenSection = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/kitchen-sections/${editKitchenSectionForm.id}`, editKitchenSectionForm);
      toast.success(t('تم تحديث قسم المطبخ'));
      setEditKitchenSectionDialogOpen(false);
      setEditKitchenSectionForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحديث قسم المطبخ'));
    }
  };

  const handleDeleteKitchenSection = async (sectionId) => {
    if (!confirm(t('هل أنت متأكد؟'))) return;
    try {
      await axios.delete(`${API}/kitchen-sections/${sectionId}`);
      toast.success(t('تم حذف قسم المطبخ'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في حذف قسم المطبخ'));
    }
  };

  const handleAssignCategoryToSection = async (categoryId, sectionId) => {
    try {
      await axios.put(`${API}/categories/${categoryId}/kitchen-section`, { kitchen_section_id: sectionId });
      toast.success(t('تم تحديث قسم المطبخ للفئة'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في التحديث'));
    }
  };

  const handleUpdateDeliveryApp = async (appId, commissionRate) => {
    try {
      const app = deliveryApps.find(a => a.id === appId);
      await axios.post(`${API}/delivery-app-settings`, {
        app_id: appId,
        name: app.name,
        name_en: app.name_en,
        commission_type: 'percentage',
        commission_rate: parseFloat(commissionRate),
        is_active: app.is_active !== false,
        payment_terms: 'weekly'
      });
      toast.success(t('تم تحديث نسبة العمولة'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في التحديث'));
    }
  };

  // إضافة شركة توصيل جديدة
  const handleAddDeliveryApp = async () => {
    if (!newDeliveryApp.name) {
      toast.error(t('يرجى إدخال اسم الشركة'));
      return;
    }
    
    setSavingDeliveryApp(true);
    try {
      await axios.post(`${API}/delivery-app-settings`, {
        app_id: `custom_${Date.now()}`,
        name: newDeliveryApp.name,
        name_en: newDeliveryApp.name_en || newDeliveryApp.name,
        commission_type: 'percentage',
        commission_rate: parseFloat(newDeliveryApp.commission_rate) || 0,
        is_active: newDeliveryApp.is_active,
        payment_terms: 'weekly'
      });
      toast.success(t('تم إضافة شركة التوصيل بنجاح'));
      setShowAddDeliveryApp(false);
      setNewDeliveryApp({ name: '', name_en: '', commission_rate: 0, is_active: true });
      fetchData();
    } catch (error) {
      toast.error(t('فشل في إضافة شركة التوصيل'));
    } finally {
      setSavingDeliveryApp(false);
    }
  };

  // حذف شركة توصيل
  const handleDeleteDeliveryApp = async (appId) => {
    if (!window.confirm(t('هل أنت متأكد؟'))) return;
    
    try {
      await axios.delete(`${API}/delivery-app-settings/${appId}`);
      toast.success(t('تم حذف شركة التوصيل'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في حذف شركة التوصيل'));
    }
  };

  // تفعيل/تعطيل شركة توصيل
  const handleToggleDeliveryApp = async (app) => {
    try {
      await axios.post(`${API}/delivery-app-settings`, {
        app_id: app.id,
        name: app.name,
        name_en: app.name_en,
        commission_type: 'percentage',
        commission_rate: app.commission_rate || 0,
        is_active: !app.is_active,
        payment_terms: 'weekly'
      });
      toast.success(app.is_active ? t('تم تعطيل الشركة') : t('تم تفعيل الشركة'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في التحديث'));
    }
  };

  // تعديل اسم شركة التوصيل
  const handleEditDeliveryAppName = async () => {
    if (!editDeliveryApp || !editDeliveryApp.name) {
      toast.error(t('يرجى إدخال اسم الشركة'));
      return;
    }
    
    try {
      await axios.post(`${API}/delivery-app-settings`, {
        app_id: editDeliveryApp.id,
        name: editDeliveryApp.name,
        name_en: editDeliveryApp.name_en || editDeliveryApp.name,
        commission_type: 'percentage',
        commission_rate: editDeliveryApp.commission_rate || 0,
        is_active: editDeliveryApp.is_active !== false,
        payment_terms: 'weekly'
      });
      toast.success(t('تم تحديث بيانات الشركة'));
      setEditDeliveryAppDialogOpen(false);
      setEditDeliveryApp(null);
      fetchData();
    } catch (error) {
      toast.error(t('فشل في تحديث بيانات الشركة'));
    }
  };

  const getRoleText = (role) => {
    const roles = {
      admin: t('مدير النظام'),
      manager: t('مدير'),
      supervisor: t('مشرف'),
      cashier: t('كاشير'),
      captain: t('كابتن'),
      delivery: t('سائق توصيل'),
      call_center: t('كول سنتر')
    };
    return roles[role] || role;
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

  return (
    <div className="min-h-screen bg-background" data-testid="settings-page">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">{t('الإعدادات')}</h1>
              <p className="text-sm text-muted-foreground">{t('إدارة النظام والمستخدمين')}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <Tabs defaultValue="appearance" className="space-y-6">
          {/* شريط التبويبات المحسن */}
          <div className="bg-card border rounded-xl p-2 overflow-x-auto">
            <TabsList className="flex flex-wrap gap-2 w-full h-auto bg-transparent p-0">
              <TabsTrigger 
                value="appearance" 
                className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {t('المظهر')}
              </TabsTrigger>
              {hasRole(['admin', 'super_admin']) && (
                <TabsTrigger 
                  value="restaurant"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('المطعم')}
                </TabsTrigger>
              )}
              {/* super_admin يدير المستخدمين من لوحة تحكم المالك فقط */}
              {hasRole(['admin', 'super_admin']) && (
                <TabsTrigger 
                  value="staff"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Users className="h-4 w-4 ml-1" />
                  {t('المستخدمين')}
                </TabsTrigger>
              )}
              {(hasRole(['admin', 'super_admin', 'manager', 'branch_manager']) || hasSettingsPermission('settings_customers')) && settingsPermissions.settingsCustomers && (
                <TabsTrigger 
                  value="customers"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('العملاء')}
                </TabsTrigger>
              )}
              {hasRole(['admin', 'super_admin']) && settingsPermissions.settingsBranches && (
                <TabsTrigger 
                  value="branches"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('الفروع')}
                </TabsTrigger>
              )}
              {(hasRole(['admin', 'super_admin', 'manager', 'branch_manager']) || hasSettingsPermission('settings_categories')) && settingsPermissions.settingsCategories && (
                <TabsTrigger 
                  value="categories"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('الفئات')}
                </TabsTrigger>
              )}
              {(hasRole(['admin', 'super_admin', 'manager', 'branch_manager']) || hasSettingsPermission('settings_products')) && settingsPermissions.settingsProducts && (
                <TabsTrigger 
                  value="products"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('المنتجات')}
                </TabsTrigger>
              )}
              {(hasRole(['admin', 'super_admin', 'manager', 'branch_manager']) || hasSettingsPermission('settings_printers')) && settingsPermissions.settingsPrinters && (
                <TabsTrigger 
                  value="printers"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('الطابعات')}
                </TabsTrigger>
              )}
              {(hasRole(['admin', 'super_admin']) || hasSettingsPermission('settings_delivery')) && settingsPermissions.settingsDeliveryCompanies && (
                <TabsTrigger 
                  value="delivery"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('شركات التوصيل')}
                </TabsTrigger>
              )}
              {hasRole(['admin', 'super_admin']) && settingsPermissions.settingsCallCenter && (
                <TabsTrigger 
                  value="callcenter"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('الكول سنتر')}
                </TabsTrigger>
              )}
              {(hasRole(['admin', 'super_admin']) || hasSettingsPermission('settings_notifications')) && settingsPermissions.settingsNotifications && (
                <TabsTrigger 
                  value="notifications"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('الإشعارات')}
                </TabsTrigger>
              )}
              {hasRole(['admin', 'super_admin']) && (
                <TabsTrigger 
                  value="payments"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('الدفع الإلكتروني')}
                </TabsTrigger>
              )}
              {hasRole(['admin', 'super_admin']) && (
                <TabsTrigger 
                  value="inventory-settings"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('إعدادات المخزون')}
                </TabsTrigger>
              )}
              {hasRole(['admin', 'super_admin']) && (
                <TabsTrigger 
                  value="system-settings"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('إعدادات النظام')}
                </TabsTrigger>
              )}
              {hasRole(['admin', 'super_admin', 'manager']) && (
                <TabsTrigger 
                  value="invoice-settings"
                  className="flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t('إعدادات الفاتورة')}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Appearance */}
          <TabsContent value="appearance">
            <Card className="border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Sun className="h-5 w-5" />
                  {t('المظهر والسمة')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-foreground mb-3 block">{t('وضع العرض')}</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'light', label: t('فاتح'), icon: Sun },
                      { value: 'dark', label: t('داكن'), icon: Moon },
                      { value: 'system', label: t('تلقائي'), icon: Monitor },
                    ].map(option => (
                      <Button
                        key={option.value}
                        variant={theme === option.value ? 'default' : 'outline'}
                        className={`h-auto py-4 flex flex-col items-center gap-2 ${theme === option.value ? 'bg-primary text-primary-foreground' : ''}`}
                        onClick={() => setTheme(option.value)}
                      >
                        <option.icon className="h-6 w-6" />
                        <span>{option.label}</span>
                      </Button>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('الوضع التلقائي يتبدل بين الفاتح والداكن')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Restaurant Settings - إعدادات المطعم */}
          {hasRole(['admin', 'super_admin']) && (
            <TabsContent value="restaurant">
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Store className="h-5 w-5" />
                    {t('إعدادات المطعم')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t('تظهر هذه البيانات في تطبيق العملاء')}
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* اسم المطعم */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-foreground">{t('اسم المطعم (عربي)')}</Label>
                      <Input
                        value={restaurantSettings.name_ar || restaurantSettings.name || ''}
                        onChange={(e) => setRestaurantSettings({...restaurantSettings, name_ar: e.target.value, name: e.target.value})}
                        placeholder={t('مثال: مطعم الشام')}
                        className="mt-1"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-foreground">{t('اسم المطعم (إنجليزي)')}</Label>
                      <Input
                        value={restaurantSettings.name || ''}
                        onChange={(e) => setRestaurantSettings({...restaurantSettings, name: e.target.value})}
                        placeholder="Example: Al Sham Restaurant"
                        className="mt-1"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* شعار المطعم */}
                  <div className="space-y-3">
                    <Label className="text-foreground">{t('شعار المطعم')}</Label>
                    <div className="flex items-start gap-4">
                      <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center overflow-hidden border-2 border-border/50">
                        {(restaurantLogoPreview || restaurantSettings.logo_url) ? (
                          <img 
                            src={restaurantLogoPreview || 
                              (restaurantSettings.logo_url?.startsWith('http') 
                                ? restaurantSettings.logo_url 
                                : restaurantSettings.logo_url?.startsWith('/api') 
                                  ? `${API}${restaurantSettings.logo_url.replace('/api', '')}` 
                                  : `${API}/uploads/logos/${restaurantSettings.logo_url}`)} 
                            alt={t('شعار المطعم')} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error('Logo load error:', e.target.src);
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-black text-4xl font-bold">M</span>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              setRestaurantLogoFile(file);
                              setRestaurantLogoPreview(URL.createObjectURL(file));
                            }
                          }}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('يفضل صورة مربعة بحجم 512×512 بكسل')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* زر الحفظ */}
                  <Button
                    onClick={async () => {
                      setSavingRestaurant(true);
                      try {
                        let logoUrl = restaurantSettings.logo_url;
                        
                        // رفع الشعار إذا تم اختياره
                        if (restaurantLogoFile) {
                          const formData = new FormData();
                          formData.append('file', restaurantLogoFile);
                          const token = localStorage.getItem('token');
                          const uploadRes = await axios.post(`${API}/upload/restaurant-logo`, formData, {
                            headers: { 
                              'Content-Type': 'multipart/form-data',
                              'Authorization': `Bearer ${token}`
                            }
                          });
                          logoUrl = uploadRes.data.url || uploadRes.data.logo_url;
                        }
                        
                        // حفظ إعدادات المطعم
                        await axios.put(`${API}/settings/restaurant`, {
                          name: restaurantSettings.name,
                          name_ar: restaurantSettings.name_ar,
                          logo_url: logoUrl
                        });
                        
                        // تحديث الإعدادات مع الشعار الجديد
                        setRestaurantSettings({...restaurantSettings, logo_url: logoUrl});
                        
                        // تحديث معاينة الشعار بالـ URL الصحيح
                        if (logoUrl) {
                          if (logoUrl.startsWith('/api')) {
                            setRestaurantLogoPreview(`${API}${logoUrl.replace('/api', '')}`);
                          } else {
                            setRestaurantLogoPreview(logoUrl);
                          }
                        }
                        
                        setRestaurantLogoFile(null);
                        toast.success(t('تم حفظ إعدادات المطعم بنجاح'));
                      } catch (error) {
                        console.error('Save restaurant settings error:', error);
                        toast.error(t('فشل في حفظ الإعدادات'));
                      } finally {
                        setSavingRestaurant(false);
                      }
                    }}
                    disabled={savingRestaurant}
                    className="w-full"
                  >
                    {savingRestaurant ? t('جارِ الحفظ...') : t('حفظ إعدادات المطعم')}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Dashboard Settings - إعدادات الصفحة الرئيسية */}
          {hasRole(['admin', 'super_admin', 'manager', 'branch_manager']) && (
            <TabsContent value="dashboard">
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <LayoutGrid className="h-5 w-5" />
                    {t('إعدادات الصفحة الرئيسية')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <p className="text-sm text-muted-foreground">
                    {t('تحكم في الصفحات والأقسام التي تظهر في الصفحة الرئيسية')}
                  </p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {/* نقاط البيع */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
                          <ShoppingCart className="h-4 w-4 text-orange-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('نقاط البيع')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showPOS !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showPOS: checked})}
                      />
                    </div>
                    
                    {/* الطاولات */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                          <LayoutGrid className="h-4 w-4 text-blue-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('الطاولات')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showTables !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showTables: checked})}
                      />
                    </div>
                    
                    {/* إدارة الطلبات */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                          <Package className="h-4 w-4 text-amber-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('إدارة الطلبات')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showOrders !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showOrders: checked})}
                      />
                    </div>
                    
                    {/* شاشة المطبخ */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                          <ChefHat className="h-4 w-4 text-yellow-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('شاشة المطبخ')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showKitchen !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showKitchen: checked})}
                      />
                    </div>
                    
                    {/* التقارير */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                          <BarChart className="h-4 w-4 text-amber-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('التقارير')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showReports !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showReports: checked})}
                      />
                    </div>
                    
                    {/* التقارير الذكية */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                          <PieChart className="h-4 w-4 text-emerald-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('التقارير الذكية')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showSmartReports !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showSmartReports: checked})}
                      />
                    </div>
                    
                    {/* التقييمات */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                          <Star className="h-4 w-4 text-yellow-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('التقييمات')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showRatings !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showRatings: checked})}
                      />
                    </div>
                    
                    {/* المصاريف */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                          <DollarSign className="h-4 w-4 text-red-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('المصاريف')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showExpenses !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showExpenses: checked})}
                      />
                    </div>
                    
                    {/* المشتريات */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600/10 rounded-lg flex items-center justify-center">
                          <ShoppingBag className="h-4 w-4 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('المشتريات')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showPurchasing !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showPurchasing: checked})}
                      />
                    </div>
                    
                    {/* المخزن والتصنيع */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                          <Warehouse className="h-4 w-4 text-indigo-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('المخزن والتصنيع')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showWarehouse !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showWarehouse: checked})}
                      />
                    </div>
                    
                    {/* طلبات الفروع */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-lime-500/10 rounded-lg flex items-center justify-center">
                          <Truck className="h-4 w-4 text-lime-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('طلبات الفروع')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showBranchOrders !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showBranchOrders: checked})}
                      />
                    </div>
                    
                    {/* تقارير المخزون */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                          <Package className="h-4 w-4 text-purple-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('تقارير المخزون')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showInventoryReports !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showInventoryReports: checked})}
                      />
                    </div>
                    
                    {/* التوصيل */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-orange-600/10 rounded-lg flex items-center justify-center">
                          <Truck className="h-4 w-4 text-orange-600" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('التوصيل')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showDelivery !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showDelivery: checked})}
                      />
                    </div>
                    
                    {/* الحجوزات */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-rose-500/10 rounded-lg flex items-center justify-center">
                          <Calendar className="h-4 w-4 text-rose-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('الحجوزات')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showReservations !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showReservations: checked})}
                      />
                    </div>
                    
                    {/* الموارد البشرية */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                          <Users className="h-4 w-4 text-green-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('الموارد البشرية')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showHR !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showHR: checked})}
                      />
                    </div>
                    
                    {/* سجل المكالمات */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                          <Phone className="h-4 w-4 text-cyan-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('سجل المكالمات')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showCallLogs !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showCallLogs: checked})}
                      />
                    </div>
                    
                    {/* برنامج الولاء */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-pink-500/10 rounded-lg flex items-center justify-center">
                          <Gift className="h-4 w-4 text-pink-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('برنامج الولاء')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showLoyalty !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showLoyalty: checked})}
                      />
                    </div>
                    
                    {/* الكوبونات */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center">
                          <Ticket className="h-4 w-4 text-violet-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('الكوبونات')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showCoupons !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showCoupons: checked})}
                      />
                    </div>
                    
                    {/* الإعدادات */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-500/10 rounded-lg flex items-center justify-center">
                          <SettingsIcon className="h-4 w-4 text-gray-500" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{t('الإعدادات')}</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showSettings !== false}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showSettings: checked})}
                      />
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handleSaveDashboardSettings}
                    className="w-full bg-primary text-primary-foreground"
                  >
                    <Save className="h-4 w-4 ml-2" />{t('حفظ الإعدادات')}</Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Staff & Users Management - إدارة الموظفين والمستخدمين */}
          {/* super_admin يدير المستخدمين من لوحة تحكم المالك فقط */}
          {hasRole(['admin', 'super_admin']) && (
            <TabsContent value="staff">
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Users className="h-5 w-5" />{t('إدارة المستخدمين')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* قسم مستخدمي النظام */}
                  <div className="space-y-4">
                      {/* تنبيه الحد الأقصى للمستخدمين */}
                      {tenantLimits && tenantLimits.users_remaining <= 0 && (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-red-500">{t('تم الوصول للحد الأقصى من المستخدمين')}</p>
                            <p className="text-xs text-muted-foreground">{t('يرجى مراجعة مسؤول النظام لرفع الحد لتتمكن من إضافة مستخدمين جدد')}</p>
                          </div>
                        </div>
                      )}
                      {tenantLimits && tenantLimits.users_remaining > 0 && tenantLimits.users_remaining <= 2 && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          <p className="text-xs text-amber-600">{t('تبقى لديك')} {tenantLimits.users_remaining} {t('مستخدمين من الحد الأقصى المسموح')} ({tenantLimits.max_users})</p>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">{t('إدارة حسابات الدخول للنظام وصلاحياتهم')}</p>
                        <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
                          <DialogTrigger asChild>
                            <Button 
                              className="bg-primary text-primary-foreground"
                              disabled={tenantLimits && tenantLimits.users_remaining <= 0}
                            >
                              <Plus className="h-4 w-4 ml-2" />{t('إضافة مستخدم')}</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle className="text-foreground">{t('إضافة مستخدم جديد')}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleCreateUser} className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-foreground">{t('اسم المستخدم')}</Label>
                                  <Input
                                    value={userForm.username}
                                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                                    required
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-foreground">{t('الاسم الكامل')}</Label>
                                  <Input
                                    value={userForm.full_name}
                                    onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                                    required
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                              <div>
                                <Label className="text-foreground">{t('البريد الإلكتروني')}</Label>
                                <Input
                                  type="email"
                                  value={userForm.email}
                                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                                  required
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-foreground">{t('كلمة المرور')}</Label>
                                <Input
                                  type="password"
                                  value={userForm.password}
                                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                                  required
                                  className="mt-1"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-foreground">{t('الصلاحية')}</Label>
                                  <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="cashier">{t('كاشير')}</SelectItem>
                                      <SelectItem value="captain">{t('كابتن')}</SelectItem>
                                      <SelectItem value="kitchen">{t('مطبخ')}</SelectItem>
                                      <SelectItem value="call_center">{t('كول سنتر')}</SelectItem>
                                      <SelectItem value="manager">{t('مدير')}</SelectItem>
                                      <SelectItem value="admin">{t('مدير عام')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-foreground">{t('الفرع')}</Label>
                                  <Select value={userForm.branch_id} onValueChange={(v) => setUserForm({ ...userForm, branch_id: v })}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder={t('اختر الفرع')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {branches.map(branch => (
                                        <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <Button type="submit" className="w-full bg-primary text-primary-foreground">{t('إنشاء المستخدم')}</Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </div>
                      
                      {/* جدول المستخدمين */}
                      {/* فلتر حسب الدور */}
                      <div className="flex items-center gap-4 mb-4 p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{t('فلترة حسب الدور')}:</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant={userRoleFilter === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setUserRoleFilter('all')}
                            className="h-8"
                          >
                            {t('الكل')} ({users.length})
                          </Button>
                          <Button
                            variant={userRoleFilter === 'admin' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setUserRoleFilter('admin')}
                            className="h-8"
                          >
                            {t('مدير عام')} ({users.filter(u => u.role === 'admin').length})
                          </Button>
                          <Button
                            variant={userRoleFilter === 'manager' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setUserRoleFilter('manager')}
                            className="h-8"
                          >
                            {t('مدير')} ({users.filter(u => u.role === 'manager').length})
                          </Button>
                          <Button
                            variant={userRoleFilter === 'cashier' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setUserRoleFilter('cashier')}
                            className="h-8"
                          >
                            {t('كاشير')} ({users.filter(u => u.role === 'cashier').length})
                          </Button>
                          <Button
                            variant={userRoleFilter === 'captain' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setUserRoleFilter('captain')}
                            className="h-8"
                          >
                            {t('كابتن')} ({users.filter(u => u.role === 'captain').length})
                          </Button>
                          <Button
                            variant={userRoleFilter === 'kitchen' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setUserRoleFilter('kitchen')}
                            className="h-8"
                          >
                            {t('مطبخ')} ({users.filter(u => u.role === 'kitchen').length})
                          </Button>
                          <Button
                            variant={userRoleFilter === 'call_center' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setUserRoleFilter('call_center')}
                            className="h-8"
                          >
                            {t('كول سنتر')} ({users.filter(u => u.role === 'call_center').length})
                          </Button>
                        </div>
                      </div>
                      
                      <div className="border border-border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-right">{t('المستخدم')}</TableHead>
                              <TableHead className="text-right">{t('البريد')}</TableHead>
                              <TableHead className="text-right">{t('الصلاحية')}</TableHead>
                              <TableHead className="text-right">{t('الفرع')}</TableHead>
                              <TableHead className="text-right">{t('الإجراءات')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {users.filter(u => userRoleFilter === 'all' || u.role === userRoleFilter).map(u => (
                              <TableRow key={u.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                      <User className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                      <p className="font-medium">{u.full_name || u.username}</p>
                                      <p className="text-xs text-muted-foreground">@{u.username}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>{u.email}</TableCell>
                                <TableCell>
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    u.role === 'admin' ? 'bg-red-500/20 text-red-400' :
                                    u.role === 'manager' ? 'bg-blue-500/20 text-blue-400' :
                                    u.role === 'cashier' ? 'bg-green-500/20 text-green-400' :
                                    u.role === 'call_center' ? 'bg-cyan-500/20 text-cyan-400' :
                                    'bg-gray-500/20 text-gray-400'
                                  }`}>
                                    {u.role === 'admin' ? t('مدير عام') : u.role === 'manager' ? t('مدير') : u.role === 'cashier' ? t('كاشير') : u.role === 'captain' ? t('كابتن') : u.role === 'kitchen' ? t('مطبخ') : u.role === 'call_center' ? t('كول سنتر') : u.role}
                                  </span>
                                </TableCell>
                                <TableCell>{branches.find(b => b.id === u.branch_id)?.name || '-'}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => handleEditUser(u)}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDeleteUser(u.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    
                    {/* نافذة تعديل المستخدم */}
                    <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
                      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="text-foreground">{t('تعديل بيانات المستخدم')}</DialogTitle>
                        </DialogHeader>
                        {editUserForm && (
                          <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label className="text-foreground">{t('اسم المستخدم')}</Label>
                                <Input
                                  value={editUserForm.username}
                                  onChange={(e) => setEditUserForm({ ...editUserForm, username: e.target.value })}
                                  className="bg-background border-input"
                                />
                              </div>
                              <div>
                                <Label className="text-foreground">{t('الاسم الكامل')}</Label>
                                <Input
                                  value={editUserForm.full_name}
                                  onChange={(e) => setEditUserForm({ ...editUserForm, full_name: e.target.value })}
                                  className="bg-background border-input"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-foreground">{t('البريد الإلكتروني')}</Label>
                              <Input
                                type="email"
                                value={editUserForm.email}
                                onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                                className="bg-background border-input"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label className="text-foreground">{t('الدور')}</Label>
                                <Select value={editUserForm.role} onValueChange={(val) => setEditUserForm({...editUserForm, role: val})}>
                                  <SelectTrigger className="bg-background border-input">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">{t('مدير عام')}</SelectItem>
                                    <SelectItem value="manager">{t('مدير')}</SelectItem>
                                    <SelectItem value="cashier">{t('كاشير')}</SelectItem>
                                    <SelectItem value="captain">{t('كابتن')}</SelectItem>
                                    <SelectItem value="kitchen">{t('مطبخ')}</SelectItem>
                                    <SelectItem value="call_center">{t('كول سنتر')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-foreground">{t('الفرع')}</Label>
                                <Select value={editUserForm.branch_id || 'all'} onValueChange={(val) => setEditUserForm({...editUserForm, branch_id: val === 'all' ? '' : val})}>
                                  <SelectTrigger className="bg-background border-input">
                                    <SelectValue placeholder={t('جميع الفروع')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">{t('جميع الفروع')}</SelectItem>
                                    {branches.map(branch => (
                                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div>
                              <Label className="text-foreground">{t('كلمة المرور الجديدة (اختياري)')}</Label>
                              <Input
                                type="password"
                                placeholder={t('اتركها فارغة للإبقاء على كلمة المرور الحالية')}
                                value={editUserForm.new_password || ''}
                                onChange={(e) => setEditUserForm({ ...editUserForm, new_password: e.target.value })}
                                className="bg-background border-input"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={editUserForm.is_active !== false}
                                onCheckedChange={(checked) => setEditUserForm({ ...editUserForm, is_active: checked })}
                              />
                              <Label className="text-foreground">{t('الحساب نشط')}</Label>
                            </div>
                            
                            {/* الصلاحيات المخصصة - تُعرض فقط الصلاحيات المفعلة للعميل */}
                            <div>
                              <Label className="text-foreground mb-3 block">{t('صلاحيات المستخدم')}</Label>
                              <div className="max-h-[350px] overflow-y-auto space-y-4 pr-2 border rounded-lg p-3 bg-muted/30">
                                {PERMISSION_GROUPS.map(group => {
                                  const groupPermissions = getAvailablePermissions().filter(p => p.group === group);
                                  if (groupPermissions.length === 0) return null;
                                  return (
                                    <div key={group}>
                                      <p className="text-sm font-medium text-muted-foreground mb-2 border-b pb-1 sticky top-0 bg-muted/30">{t(group)}</p>
                                      <div className="grid grid-cols-2 gap-2">
                                        {groupPermissions.map(perm => (
                                          <div key={perm.id} className="flex items-center gap-2">
                                            <Switch
                                              checked={editUserForm.permissions?.includes(perm.id)}
                                              onCheckedChange={(checked) => {
                                                const newPerms = checked 
                                                  ? [...(editUserForm.permissions || []), perm.id]
                                                  : (editUserForm.permissions || []).filter(p => p !== perm.id);
                                                setEditUserForm({ ...editUserForm, permissions: newPerms });
                                              }}
                                            />
                                            <span className="text-sm text-foreground">{t(perm.name)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">{t('يتم عرض الصلاحيات المفعلة للعميل فقط')}</p>
                            </div>
                            
                            <div className="flex gap-2 pt-4">
                              <Button type="button" variant="outline" onClick={() => setEditUserDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                              <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('حفظ التعديلات')}</Button>
                            </div>
                          </form>
                        )}
                      </DialogContent>
                    </Dialog>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Branches */}
          {hasRole(['admin', 'super_admin']) && settingsPermissions.settingsBranches && (
            <TabsContent value="branches">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-col gap-4">
                  {/* تنبيه الحد الأقصى للفروع */}
                  {tenantLimits && tenantLimits.branches_remaining <= 0 && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-500">{t('تم الوصول للحد الأقصى من الفروع')}</p>
                        <p className="text-xs text-muted-foreground">{t('يرجى مراجعة مسؤول النظام لرفع الحد لتتمكن من إضافة فروع جديدة')}</p>
                      </div>
                    </div>
                  )}
                  {tenantLimits && tenantLimits.branches_remaining > 0 && tenantLimits.branches_remaining <= 1 && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-amber-600">{t('تبقى لديك')} {tenantLimits.branches_remaining} {t('فرع من الحد الأقصى المسموح')} ({tenantLimits.max_branches})</p>
                    </div>
                  )}
                  <div className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Store className="h-5 w-5" />{t('إدارة الفروع')}</CardTitle>
                    <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          className="bg-primary text-primary-foreground"
                          disabled={tenantLimits && tenantLimits.branches_remaining <= 0}
                        >
                          <Plus className="h-4 w-4 ml-2" />{t('إضافة فرع')}</Button>
                      </DialogTrigger>
                      <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-foreground">{t('إضافة فرع جديد')}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateBranch} className="space-y-4">
                        <div>
                          <Label className="text-foreground">{t('اسم الفرع')}</Label>
                          <Input
                            value={branchForm.name}
                            onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('العنوان')}</Label>
                          <Input
                            value={branchForm.address}
                            onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">{t('الهاتف')}</Label>
                            <Input
                              value={branchForm.phone}
                              onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('البريد الإلكتروني')}</Label>
                            <Input
                              type="email"
                              value={branchForm.email}
                              onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setBranchDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                          <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('إنشاء')}</Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {branches.map(branch => (
                      <div key={branch.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                        <div>
                          <p className="font-medium text-foreground">{branch.name}</p>
                          <p className="text-sm text-muted-foreground">{branch.address}</p>
                          <p className="text-sm text-muted-foreground">{branch.phone}</p>
                          {branch.is_sold_branch && branch.buyer_name && (
                            <p className="text-sm text-blue-600 mt-1">
                              👤 {t('المشتري')}: {branch.buyer_name}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {branch.is_sold_branch && branch.owner_percentage > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 font-medium">
                              {branch.owner_percentage}%
                            </span>
                          )}
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            branch.is_active !== false ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {branch.is_active !== false ? t('نشط') : t('معطل')}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-blue-500 hover:bg-blue-500/10"
                            onClick={() => handleEditBranch(branch)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteBranch(branch.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Edit Branch Dialog */}
              <Dialog open={editBranchDialogOpen} onOpenChange={setEditBranchDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">{t('تعديل الفرع')}</DialogTitle>
                  </DialogHeader>
                  {editBranchForm && (
                    <form onSubmit={handleUpdateBranch} className="space-y-4">
                      <div>
                        <Label className="text-foreground">{t('اسم الفرع')}</Label>
                        <Input
                          value={editBranchForm.name}
                          onChange={(e) => setEditBranchForm({ ...editBranchForm, name: e.target.value })}
                          required
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">{t('العنوان')}</Label>
                        <Input
                          value={editBranchForm.address}
                          onChange={(e) => setEditBranchForm({ ...editBranchForm, address: e.target.value })}
                          required
                          className="mt-1"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">{t('الهاتف')}</Label>
                          <Input
                            value={editBranchForm.phone}
                            onChange={(e) => setEditBranchForm({ ...editBranchForm, phone: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('البريد الإلكتروني')}</Label>
                          <Input
                            type="email"
                            value={editBranchForm.email}
                            onChange={(e) => setEditBranchForm({ ...editBranchForm, email: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      
                      {/* التكاليف الثابتة الشهرية */}
                      <div className="pt-4 border-t border-border">
                        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-primary" />
                          {t('التكاليف الثابتة الشهرية')}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          {t('أدخل التكاليف الثابتة الشهرية للفرع لحساب نقطة التعادل اليومية')}
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">{t('الإيجار الشهري')}</Label>
                            <Input
                              type="number"
                              value={editBranchForm.rent_cost || 0}
                              onChange={(e) => setEditBranchForm({ ...editBranchForm, rent_cost: e.target.value })}
                              className="mt-1"
                              min="0"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('فاتورة الكهرباء الشهرية')}</Label>
                            <Input
                              type="number"
                              value={editBranchForm.electricity_cost || 0}
                              onChange={(e) => setEditBranchForm({ ...editBranchForm, electricity_cost: e.target.value })}
                              className="mt-1"
                              min="0"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('فاتورة الماء الشهرية')}</Label>
                            <Input
                              type="number"
                              value={editBranchForm.water_cost || 0}
                              onChange={(e) => setEditBranchForm({ ...editBranchForm, water_cost: e.target.value })}
                              className="mt-1"
                              min="0"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('تكلفة المولدة الشهرية')}</Label>
                            <Input
                              type="number"
                              value={editBranchForm.generator_cost || 0}
                              onChange={(e) => setEditBranchForm({ ...editBranchForm, generator_cost: e.target.value })}
                              className="mt-1"
                              min="0"
                              placeholder="0"
                            />
                          </div>
                        </div>
                        
                        {/* ملخص التكاليف */}
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">{t('إجمالي التكاليف الثابتة الشهرية')}:</span>
                            <span className="font-bold text-primary">
                              {formatPrice(
                                (parseFloat(editBranchForm.rent_cost) || 0) +
                                (parseFloat(editBranchForm.electricity_cost) || 0) +
                                (parseFloat(editBranchForm.water_cost) || 0) +
                                (parseFloat(editBranchForm.generator_cost) || 0)
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-sm text-muted-foreground">{t('المعدل اليومي')}:</span>
                            <span className="font-medium text-foreground">
                              {formatPrice(
                                ((parseFloat(editBranchForm.rent_cost) || 0) +
                                (parseFloat(editBranchForm.electricity_cost) || 0) +
                                (parseFloat(editBranchForm.water_cost) || 0) +
                                (parseFloat(editBranchForm.generator_cost) || 0)) / 30
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* قسم الفرع المباع */}
                      <div className="pt-4 border-t border-border">
                        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                          <Store className="h-5 w-5 text-blue-500" />
                          {t('إعدادات الفرع الخارجي')}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          {t('إذا كان هذا الفرع مباعاً لمستفيد آخر، يمكنك تفعيل هذا الخيار وتحديد النسبة الشهرية')}
                        </p>
                        
                        <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                              <Store className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium">{t('فرع مباع')}</p>
                              <p className="text-xs text-muted-foreground">{t('تفعيل هذا الخيار يجعل الفرع يظهر في إدارة الفروع الخارجية')}</p>
                            </div>
                          </div>
                          <Switch
                            checked={editBranchForm.is_sold_branch || false}
                            onCheckedChange={(checked) => setEditBranchForm({ 
                              ...editBranchForm, 
                              is_sold_branch: checked,
                              owner_percentage: checked ? (editBranchForm.owner_percentage || 0) : 0
                            })}
                          />
                        </div>
                        
                        {editBranchForm.is_sold_branch && (
                          <div className="space-y-4 animate-in slide-in-from-top-2">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label className="text-foreground">{t('اسم المشتري/المستفيد')}</Label>
                                <Input
                                  type="text"
                                  value={editBranchForm.buyer_name || ''}
                                  onChange={(e) => setEditBranchForm({ ...editBranchForm, buyer_name: e.target.value })}
                                  className="mt-1"
                                  placeholder={t('اسم صاحب الفرع الجديد')}
                                />
                              </div>
                              <div>
                                <Label className="text-foreground">{t('هاتف المشتري')}</Label>
                                <Input
                                  type="text"
                                  value={editBranchForm.buyer_phone || ''}
                                  onChange={(e) => setEditBranchForm({ ...editBranchForm, buyer_phone: e.target.value })}
                                  className="mt-1"
                                  placeholder="07XX..."
                                />
                              </div>
                            </div>
                            
                            <div>
                              <Label className="text-foreground">{t('نسبتك من المبيعات')} (%)</Label>
                              <div className="flex items-center gap-4 mt-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  value={editBranchForm.owner_percentage || 0}
                                  onChange={(e) => setEditBranchForm({ ...editBranchForm, owner_percentage: parseFloat(e.target.value) || 0 })}
                                  className="flex-1"
                                  placeholder="0"
                                />
                                <span className="text-2xl font-bold text-blue-600">%</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('هذه النسبة ستُحسب تلقائياً من مبيعات الفرع الشهرية')}
                              </p>
                            </div>
                            
                            <div>
                              <Label className="text-foreground">{t('رسوم شهرية ثابتة')} ({t('اختياري')})</Label>
                              <Input
                                type="number"
                                min="0"
                                value={editBranchForm.monthly_fee || 0}
                                onChange={(e) => setEditBranchForm({ ...editBranchForm, monthly_fee: parseFloat(e.target.value) || 0 })}
                                className="mt-1"
                                placeholder="0"
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('رسوم إضافية ثابتة كل شهر (مثل رسوم العلامة التجارية)')}
                              </p>
                            </div>
                            
                            <div className="p-3 bg-blue-100 dark:bg-blue-950/50 rounded-lg">
                              <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                {t('سيتم حساب المستحقات تلقائياً من:')}
                              </p>
                              <ul className="text-xs text-blue-700 dark:text-blue-300 mt-2 mr-6 space-y-1 list-disc">
                                <li>{t('نسبة المبيعات الشهرية')}</li>
                                <li>{t('قيمة المواد المسحوبة من المخازن')}</li>
                                <li>{t('الرسوم الشهرية الثابتة')}</li>
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditBranchDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('حفظ التعديلات')}</Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          )}

          {/* Categories */}
          {hasRole(['admin', 'super_admin', 'manager', 'branch_manager']) && (
            <TabsContent value="categories">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Tag className="h-5 w-5" />{t('إدارة الفئات')}</CardTitle>
                  <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />{t('إضافة فئة')}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-foreground">{t('إضافة فئة جديدة')}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateCategory} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">{t('اسم الفئة (عربي)')}</Label>
                            <Input
                              value={categoryForm.name}
                              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                              placeholder={t('مشروبات ساخنة')}
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('اسم الفئة (إنجليزي)')}</Label>
                            <Input
                              value={categoryForm.name_en}
                              onChange={(e) => setCategoryForm({ ...categoryForm, name_en: e.target.value })}
                              placeholder="Hot Drinks"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div>
                          <ImageUploader
                            value={categoryForm.image}
                            onChange={(url) => setCategoryForm({ ...categoryForm, image: url })}
                            type="category"
                            label={t('صورة الفئة')}
                            placeholder="https://example.com/image.jpg"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-foreground">{t('الأيقونة')}</Label>
                            <Input
                              value={categoryForm.icon}
                              onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                              placeholder="☕"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('اللون')}</Label>
                            <Input
                              type="color"
                              value={categoryForm.color}
                              onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                              className="mt-1 h-10"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('الترتيب')}</Label>
                            <Input
                              type="number"
                              value={categoryForm.sort_order}
                              onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: parseInt(e.target.value) || 0 })}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                          <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('إنشاء')}</Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {categories.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">{t('لا توجد فئات. قم بإضافة فئة جديدة')}</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {categories.map(cat => (
                        <div key={cat.id} className="relative p-4 bg-muted/30 rounded-lg border border-border/50">
                          <div className="flex items-center gap-3">
                            {cat.image ? (
                              <img src={cat.image} alt={cat.name} className="w-12 h-12 rounded-lg object-cover" />
                            ) : (
                              <div 
                                className="w-12 h-12 rounded-lg flex items-center justify-center text-xl"
                                style={{ backgroundColor: `${cat.color}20` }}
                              >
                                {cat.icon || '📦'}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-foreground">{cat.name}</p>
                              {cat.name_en && <p className="text-xs text-muted-foreground">{cat.name_en}</p>}
                            </div>
                          </div>
                          <div className="absolute top-2 left-2 flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-blue-500 hover:bg-blue-500/10"
                              onClick={() => {
                                setEditCategoryForm({
                                  id: cat.id,
                                  name: cat.name,
                                  name_en: cat.name_en || '',
                                  icon: cat.icon || '',
                                  image: cat.image || '',
                                  color: cat.color || '#D4AF37',
                                  sort_order: cat.sort_order || 0
                                });
                                setEditCategoryDialogOpen(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteCategory(cat.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {products.filter(p => p.category_id === cat.id).length} {t('منتج')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Edit Category Dialog */}
              <Dialog open={editCategoryDialogOpen} onOpenChange={setEditCategoryDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">{t('تعديل الفئة')}</DialogTitle>
                  </DialogHeader>
                  {editCategoryForm && (
                    <form onSubmit={handleUpdateCategory} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">{t('اسم الفئة (عربي)')}</Label>
                          <Input
                            value={editCategoryForm.name}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('اسم الفئة (إنجليزي)')}</Label>
                          <Input
                            value={editCategoryForm.name_en}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, name_en: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <ImageUploader
                          value={editCategoryForm.image}
                          onChange={(url) => setEditCategoryForm({ ...editCategoryForm, image: url })}
                          type="category"
                          label={t('صورة الفئة')}
                          placeholder="https://example.com/image.jpg"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label className="text-foreground">{t('الأيقونة')}</Label>
                          <Input
                            value={editCategoryForm.icon}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, icon: e.target.value })}
                            placeholder="☕"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('اللون')}</Label>
                          <Input
                            type="color"
                            value={editCategoryForm.color}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, color: e.target.value })}
                            className="mt-1 h-10"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('الترتيب')}</Label>
                          <Input
                            type="number"
                            value={editCategoryForm.sort_order}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, sort_order: parseInt(e.target.value) || 0 })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditCategoryDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('حفظ التغييرات')}</Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          )}

          {/* Products */}
          {hasRole(['admin', 'super_admin', 'manager', 'branch_manager']) && (
            <TabsContent value="products">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Package className="h-5 w-5" />{t('إدارة المنتجات')}</CardTitle>
                  <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />{t('إضافة منتج')}</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle className="text-foreground">{t('إضافة منتج جديد')}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateProduct} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">{t('اسم المنتج (عربي)')}</Label>
                            <Input
                              value={productForm.name}
                              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                              placeholder={t('قهوة أمريكية')}
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('اسم المنتج (إنجليزي)')}</Label>
                            <Input
                              value={productForm.name_en}
                              onChange={(e) => setProductForm({ ...productForm, name_en: e.target.value })}
                              placeholder="Americano"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">{t('الفئة')}</Label>
                            <Select value={productForm.category_id} onValueChange={(v) => setProductForm({ ...productForm, category_id: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder={t('اختر فئة')} />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map(cat => (
                                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-foreground">{t('الباركود')}</Label>
                            <Input
                              value={productForm.barcode}
                              onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                              placeholder={t('اختياري')}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-foreground">{t('سعر البيع (د.ع)')}</Label>
                            <Input
                              type="number"
                              value={productForm.price}
                              onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                              placeholder="5000"
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('تكلفة المواد الخام')}</Label>
                            <Input
                              type="number"
                              value={productForm.cost}
                              onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}
                              placeholder="2000"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground text-xs">{t('تكلفة التغليف')}</Label>
                            <Input
                              type="number"
                              value={productForm.packaging_cost}
                              onChange={(e) => setProductForm({ ...productForm, packaging_cost: e.target.value })}
                              placeholder="250"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        
                        {/* ربط بالمنتج المصنع */}
                        {manufacturedProducts.length > 0 && (
                          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                            <Label className="text-foreground font-medium mb-2 flex items-center gap-2">
                              <Factory className="h-4 w-4 text-purple-500" />{t('ربط بمنتج مصنع (للخصم التلقائي)')}</Label>
                            <Select 
                              value={productForm.manufactured_product_id || 'none'} 
                              onValueChange={(v) => setProductForm({ ...productForm, manufactured_product_id: v === 'none' ? null : v })}
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder={t('اختر المنتج المصنع (اختياري)')} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{t('بدون ربط')}</SelectItem>
                                {manufacturedProducts.map(mp => (
                                  <SelectItem key={mp.id} value={mp.id}>
                                    {mp.name} ({mp.quantity} {mp.unit})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-2">{t('عند ربط المنتج، سيتم خصم الكمية تلقائياً من مخزون الفرع عند البيع')}</p>
                          </div>
                        )}
                        
                        <div>
                          <ImageUploader
                            value={productForm.image}
                            onChange={(url) => setProductForm({ ...productForm, image: url })}
                            type="product"
                            label={t('صورة المنتج')}
                            placeholder="https://example.com/image.jpg"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('الوصف')}</Label>
                          <Textarea
                            value={productForm.description}
                            onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                            placeholder={t('وصف المنتج...')}
                            className="mt-1"
                            rows={2}
                          />
                        </div>
                        
                        {/* اختيار الطابعات للمنتج الجديد */}
                        {printers.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-foreground">{t('وجهة الطباعة (الطابعات)')}</Label>
                            <div className="flex flex-wrap gap-2">
                              {printers.map(printer => {
                                const isSelected = (productForm.printer_ids || []).includes(printer.id);
                                return (
                                  <button
                                    key={printer.id}
                                    type="button"
                                    onClick={() => {
                                      const currentIds = productForm.printer_ids || [];
                                      const newIds = isSelected 
                                        ? currentIds.filter(id => id !== printer.id)
                                        : [...currentIds, printer.id];
                                      setProductForm({ ...productForm, printer_ids: newIds });
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-sm transition-all border ${
                                      isSelected 
                                        ? 'bg-green-500/20 border-green-500 text-green-400' 
                                        : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                                    }`}
                                  >
                                    <Printer className="h-3 w-3 inline ml-1" />
                                    {t(printer.name)}
                                    {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                                  </button>
                                );
                              })}
                            </div>
                            {(productForm.printer_ids || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                <span className="text-xs text-muted-foreground">{t('الطابعات المحددة:')}</span>
                                {(productForm.printer_ids || []).map(printerId => {
                                  const printer = printers.find(p => p.id === printerId);
                                  return printer ? (
                                    <span key={printerId} className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                                      {t(printer.name)}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">{t('اختر الطابعات التي سيُرسل إليها هذا المنتج عند الطلب')}</p>
                          </div>
                        )}
                        
                        {productForm.price && productForm.cost && (
                          <div className="p-3 bg-green-500/10 rounded-lg">
                            <p className="text-sm text-green-600">
                              {t('ربح المواد الخام')}: {formatPrice((parseFloat(productForm.price) || 0) - (parseFloat(productForm.cost) || 0))} {t('لكل وحدة')}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('التكاليف التشغيلية تُحسب تلقائياً من إعدادات الفرع')}
                            </p>
                          </div>
                        )}
                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                          <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('إنشاء')}</Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {products.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">{t('لا توجد منتجات. قم بإضافة منتج جديد')}</p>
                  ) : (
                    <div className="space-y-3">
                      {products.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-4">
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="w-12 h-12 rounded-lg object-cover" />
                            ) : (
                              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                                <Package className="h-6 w-6 text-primary" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-foreground">{p.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {categories.find(c => c.id === p.category_id)?.name || '-'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-left">
                              <p className="font-bold text-foreground tabular-nums">{formatPrice(p.price)}</p>
                              <p className="text-xs text-green-500">{t('ربح المواد')}: {formatPrice(p.price - (p.cost || 0))}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-blue-500 hover:bg-blue-500/10"
                                onClick={() => handleEditProduct(p)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteProduct(p.id)}
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

              {/* Edit Product Dialog */}
              <Dialog open={editProductDialogOpen} onOpenChange={setEditProductDialogOpen}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">{t('تعديل المنتج')}</DialogTitle>
                  </DialogHeader>
                  {editProductForm && (
                    <form onSubmit={handleUpdateProduct} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">{t('اسم المنتج (عربي)')}</Label>
                          <Input
                            value={editProductForm.name}
                            onChange={(e) => setEditProductForm({ ...editProductForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('اسم المنتج (إنجليزي)')}</Label>
                          <Input
                            value={editProductForm.name_en}
                            onChange={(e) => setEditProductForm({ ...editProductForm, name_en: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">{t('الفئة')}</Label>
                          <Select value={editProductForm.category_id} onValueChange={(v) => setEditProductForm({ ...editProductForm, category_id: v })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder={t('اختر فئة')} />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map(cat => (
                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-foreground">{t('الباركود')}</Label>
                          <Input
                            value={editProductForm.barcode}
                            onChange={(e) => setEditProductForm({ ...editProductForm, barcode: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label className="text-foreground">{t('سعر البيع (د.ع)')}</Label>
                          <Input
                            type="number"
                            value={editProductForm.price}
                            onChange={(e) => setEditProductForm({ ...editProductForm, price: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('تكلفة المواد الخام')}</Label>
                          <Input
                            type="number"
                            value={editProductForm.cost}
                            onChange={(e) => setEditProductForm({ ...editProductForm, cost: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('تكلفة التغليف (للسفري/التوصيل)')}</Label>
                          <Input
                            type="number"
                            value={editProductForm.packaging_cost}
                            onChange={(e) => setEditProductForm({ ...editProductForm, packaging_cost: e.target.value })}
                            className="mt-1"
                            placeholder={t('تُحسب فقط للطلبات السفرية والتوصيل')}
                          />
                        </div>
                      </div>
                      <div>
                        <ImageUploader
                          value={editProductForm.image}
                          onChange={(url) => setEditProductForm({ ...editProductForm, image: url })}
                          type="product"
                          label={t('صورة المنتج')}
                        />
                      </div>
                      {/* ربط بمنتج مصنع */}
                      {manufacturedProducts.length > 0 && (
                        <div>
                          <Label className="text-foreground font-medium mb-2 flex items-center gap-2">
                            <Factory className="h-4 w-4 text-purple-500" />{t('ربط بمنتج مصنع (للخصم التلقائي)')}</Label>
                          <Select 
                            value={editProductForm.manufactured_product_id || 'none'} 
                            onValueChange={(v) => setEditProductForm({ ...editProductForm, manufactured_product_id: v === 'none' ? null : v })}
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder={t('اختر المنتج المصنع (اختياري)')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{t('بدون ربط')}</SelectItem>
                              {manufacturedProducts.map(mp => (
                                <SelectItem key={mp.id} value={mp.id}>
                                  {mp.name} ({mp.quantity} {mp.unit})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-2">{t('عند ربط المنتج، سيتم خصم المكونات تلقائياً من المخزون عند البيع')}</p>
                        </div>
                      )}
                      <div>
                        <Label className="text-foreground">{t('الوصف')}</Label>
                        <Textarea
                          value={editProductForm.description}
                          onChange={(e) => setEditProductForm({ ...editProductForm, description: e.target.value })}
                          className="mt-1"
                          rows={2}
                        />
                      </div>
                      
                      {/* اختيار الطابعات */}
                      <div className="space-y-2">
                        <Label className="text-foreground">{t('وجهة الطباعة (الطابعات)')}</Label>
                        <div className="flex flex-wrap gap-2">
                          {printers.map(printer => {
                            const isSelected = (editProductForm.printer_ids || []).includes(printer.id);
                            return (
                              <button
                                key={printer.id}
                                type="button"
                                onClick={() => {
                                  const currentIds = editProductForm.printer_ids || [];
                                  const newIds = isSelected 
                                    ? currentIds.filter(id => id !== printer.id)
                                    : [...currentIds, printer.id];
                                  setEditProductForm({ ...editProductForm, printer_ids: newIds });
                                }}
                                className={`px-3 py-1.5 rounded-full text-sm transition-all border ${
                                  isSelected 
                                    ? 'bg-green-500/20 border-green-500 text-green-400' 
                                    : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                                }`}
                              >
                                <Printer className="h-3 w-3 inline ml-1" />
                                {t(printer.name)}
                                {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                              </button>
                            );
                          })}
                        </div>
                        {(editProductForm.printer_ids || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            <span className="text-xs text-muted-foreground">{t('الطابعات المحددة:')}</span>
                            {(editProductForm.printer_ids || []).map(printerId => {
                              const printer = printers.find(p => p.id === printerId);
                              return printer ? (
                                <span key={printerId} className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                                  {t(printer.name)}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">{t('اختر الطابعات التي سيُرسل إليها هذا المنتج عند الطلب')}</p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={editProductForm.is_available !== false}
                          onCheckedChange={(checked) => setEditProductForm({ ...editProductForm, is_available: checked })}
                        />
                        <Label className="text-foreground">{t('متاح للبيع')}</Label>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditProductDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('حفظ التعديلات')}</Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          )}

          {/* Printers */}
          {hasRole(['admin', 'super_admin', 'manager', 'branch_manager']) && (
            <TabsContent value="printers">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Printer className="h-5 w-5" />{t('إدارة الطابعات')}</CardTitle>
                  <Dialog open={printerDialogOpen} onOpenChange={setPrinterDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />{t('إضافة طابعة')}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-foreground">{t('إضافة طابعة جديدة')}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreatePrinter} className="space-y-4">
                        <div>
                          <Label className="text-foreground">{t('اسم الطابعة')}</Label>
                          <Input
                            value={printerForm.name}
                            onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">{t('عنوان IP')}</Label>
                            <Input
                              value={printerForm.ip_address}
                              onChange={(e) => setPrinterForm({ ...printerForm, ip_address: e.target.value })}
                              placeholder="192.168.1.100"
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('المنفذ')}</Label>
                            <Input
                              type="number"
                              value={printerForm.port}
                              onChange={(e) => setPrinterForm({ ...printerForm, port: parseInt(e.target.value) })}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">{t('الفرع')}</Label>
                            <Select value={printerForm.branch_id} onValueChange={(v) => setPrinterForm({ ...printerForm, branch_id: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder={t('اختر فرع')} />
                              </SelectTrigger>
                              <SelectContent>
                                {branches.map(branch => (
                                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-foreground">{t('نوع/قسم الطابعة')}</Label>
                            <Input
                              value={printerForm.printer_type}
                              onChange={(e) => setPrinterForm({ ...printerForm, printer_type: e.target.value })}
                              placeholder={t('مثال: مطبخ، بار، تغليف، كاشير...')}
                              className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">{t('اكتب اسم القسم أو نوع الطابعة حسب احتياجك')}</p>
                          </div>
                        </div>
                        
                        {/* صلاحيات الطباعة */}
                        <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                          <Label className="text-foreground font-medium">{t('صلاحيات الطباعة')}</Label>
                          
                          <div>
                            <Label className="text-sm text-muted-foreground">{t('وضع الطباعة')}</Label>
                            <Select value={printerForm.print_mode} onValueChange={(v) => setPrinterForm({ ...printerForm, print_mode: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full_receipt">{t('فاتورة كاملة (مع الأسعار)')}</SelectItem>
                                <SelectItem value="orders_only">{t('طلبات فقط (بدون أسعار)')}</SelectItem>
                                <SelectItem value="selected_products">{t('المنتجات المحددة فقط')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">{t('عرض الأسعار')}</Label>
                            <Switch 
                              checked={printerForm.show_prices} 
                              onCheckedChange={(v) => setPrinterForm({ ...printerForm, show_prices: v })}
                            />
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="text-sm">{t('طباعة جميع الطلبات')}</Label>
                              <p className="text-xs text-muted-foreground">{t('لمتابعة جميع الأصناف مع الأقسام')}</p>
                            </div>
                            <Switch 
                              checked={printerForm.print_individual_items} 
                              onCheckedChange={(v) => setPrinterForm({ ...printerForm, print_individual_items: v })}
                            />
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">{t('طباعة تلقائية عند الطلب')}</Label>
                            <Switch 
                              checked={printerForm.auto_print_on_order} 
                              onCheckedChange={(v) => setPrinterForm({ ...printerForm, auto_print_on_order: v })}
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setPrinterDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                          <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('إضافة')}</Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {printers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">{t('لا توجد طابعات مضافة')}</p>
                  ) : (
                    <div className="space-y-3">
                      {printers.map(printer => (
                        <div key={printer.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <Printer className="h-8 w-8 text-muted-foreground" />
                              {/* حالة الاتصال */}
                              {printerTestStatus[printer.id] === 'online' || printer.is_online ? (
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background" title={t('متصلة')}></span>
                              ) : printerTestStatus[printer.id] === 'offline' || printer.is_online === false ? (
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-background" title={t('غير متصلة')}></span>
                              ) : null}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{t(printer.name)}</p>
                              <p className="text-sm text-muted-foreground">{printer.ip_address}:{printer.port}</p>
                              {/* عرض صلاحيات الطباعة */}
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {printer.print_mode === 'full_receipt' ? `📄 ${t('فاتورة كاملة')}` : 
                                   printer.print_mode === 'orders_only' ? `📋 ${t('طلبات فقط')}` : 
                                   printer.print_mode === 'selected_products' ? `🎯 ${t('منتجات محددة')}` : `📄 ${t('فاتورة')}`}
                                </span>
                                {!printer.show_prices && <span className="text-xs text-orange-400">{t('• بدون أسعار')}</span>}
                                {printer.print_individual_items && <span className="text-xs text-purple-400">{t('• جميع الطلبات')}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* حالة الاتصال النصية */}
                            {printerTestStatus[printer.id] === 'testing' ? (
                              <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-500 flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />{t('جاري الاختبار')}</span>
                            ) : printerTestStatus[printer.id] === 'online' ? (
                              <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-500">{t('متصلة ✓')}</span>
                            ) : printerTestStatus[printer.id] === 'offline' ? (
                              <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-500">{t('غير متصلة')}</span>
                            ) : null}
                            
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                              {t(printer.printer_type) || t('عام')}
                            </span>
                            
                            {/* زر اختبار الاتصال */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-green-500 hover:bg-green-500/10"
                              onClick={() => handleTestPrinter(printer.id)}
                              disabled={printerTestStatus[printer.id] === 'testing'}
                              title={t('اختبار الاتصال')}
                            >
                              <RefreshCw className={`h-4 w-4 ${printerTestStatus[printer.id] === 'testing' ? 'animate-spin' : ''}`} />
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-blue-500 hover:bg-blue-500/10"
                              onClick={() => handleEditPrinter(printer)}
                              data-testid={`edit-printer-${printer.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeletePrinter(printer.id)}
                              data-testid={`delete-printer-${printer.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Edit Printer Dialog */}
              <Dialog open={editPrinterDialogOpen} onOpenChange={setEditPrinterDialogOpen}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">{t('تعديل الطابعة')}</DialogTitle>
                  </DialogHeader>
                  {editPrinterForm && (
                    <form onSubmit={handleUpdatePrinter} className="space-y-4">
                      <div>
                        <Label className="text-foreground">{t('اسم الطابعة')}</Label>
                        <Input
                          value={editPrinterForm.name}
                          onChange={(e) => setEditPrinterForm({ ...editPrinterForm, name: e.target.value })}
                          required
                          className="mt-1"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">{t('عنوان IP')}</Label>
                          <Input
                            value={editPrinterForm.ip_address}
                            onChange={(e) => setEditPrinterForm({ ...editPrinterForm, ip_address: e.target.value })}
                            placeholder="192.168.1.100"
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('المنفذ')}</Label>
                          <Input
                            type="number"
                            value={editPrinterForm.port}
                            onChange={(e) => setEditPrinterForm({ ...editPrinterForm, port: parseInt(e.target.value) || 9100 })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-foreground">{t('الفرع')}</Label>
                        <Select value={editPrinterForm.branch_id} onValueChange={(v) => setEditPrinterForm({ ...editPrinterForm, branch_id: v })}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder={t('اختر الفرع')} />
                          </SelectTrigger>
                          <SelectContent>
                            {branches.map(b => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-foreground">{t('نوع/قسم الطابعة')}</Label>
                        <Input
                          value={editPrinterForm.printer_type}
                          onChange={(e) => setEditPrinterForm({ ...editPrinterForm, printer_type: e.target.value })}
                          placeholder={t('مثال: مطبخ، بار، تغليف، كاشير...')}
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">{t('اكتب اسم القسم أو نوع الطابعة حسب احتياجك')}</p>
                      </div>
                      
                      {/* صلاحيات الطباعة */}
                      <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                        <Label className="text-foreground font-medium">{t('صلاحيات الطباعة')}</Label>
                        
                        <div>
                          <Label className="text-sm text-muted-foreground">{t('وضع الطباعة')}</Label>
                          <Select value={editPrinterForm.print_mode || 'full_receipt'} onValueChange={(v) => setEditPrinterForm({ ...editPrinterForm, print_mode: v })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full_receipt">{t('فاتورة كاملة (مع الأسعار)')}</SelectItem>
                              <SelectItem value="orders_only">{t('طلبات فقط (بدون أسعار)')}</SelectItem>
                              <SelectItem value="selected_products">{t('المنتجات المحددة فقط')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">{t('عرض الأسعار')}</Label>
                          <Switch 
                            checked={editPrinterForm.show_prices !== false} 
                            onCheckedChange={(v) => setEditPrinterForm({ ...editPrinterForm, show_prices: v })}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm">{t('طباعة جميع الطلبات')}</Label>
                            <p className="text-xs text-muted-foreground">{t('لمتابعة جميع الأصناف مع الأقسام')}</p>
                          </div>
                          <Switch 
                            checked={editPrinterForm.print_individual_items || false} 
                            onCheckedChange={(v) => setEditPrinterForm({ ...editPrinterForm, print_individual_items: v })}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">{t('طباعة تلقائية عند الطلب')}</Label>
                          <Switch 
                            checked={editPrinterForm.auto_print_on_order !== false} 
                            onCheckedChange={(v) => setEditPrinterForm({ ...editPrinterForm, auto_print_on_order: v })}
                          />
                        </div>
                      </div>
                      
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditPrinterDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('تحديث')}</Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          )}

          {/* Delivery Apps */}
          {hasRole(['admin', 'super_admin']) && (
            <TabsContent value="delivery">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Truck className="h-5 w-5" />{t('إعدادات شركات التوصيل')}</CardTitle>
                  <Button 
                    onClick={() => setShowAddDeliveryApp(true)}
                    className="gap-2"
                    data-testid="add-delivery-app-btn"
                  >
                    <Plus className="h-4 w-4" />{t('إضافة شركة')}</Button>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">{t('تحكم في نسب الاستقطاع لكل شركة توصيل')}</p>
                  
                  {/* نموذج إضافة شركة جديدة */}
                  {showAddDeliveryApp && (
                    <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                      <h4 className="font-medium text-foreground mb-4 flex items-center gap-2">
                        <Plus className="h-4 w-4" />{t('إضافة شركة توصيل جديدة')}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">{t('اسم الشركة (عربي)')}</Label>
                          <Input
                            value={newDeliveryApp.name}
                            onChange={(e) => setNewDeliveryApp({...newDeliveryApp, name: e.target.value})}
                            placeholder={t('مثال: طلبات')}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('اسم الشركة (إنجليزي)')}</Label>
                          <Input
                            value={newDeliveryApp.name_en}
                            onChange={(e) => setNewDeliveryApp({...newDeliveryApp, name_en: e.target.value})}
                            placeholder="Example: Talabat"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('نسبة العمولة (%)')}</Label>
                          <Input
                            type="number"
                            value={newDeliveryApp.commission_rate}
                            onChange={(e) => setNewDeliveryApp({...newDeliveryApp, commission_rate: parseFloat(e.target.value) || 0})}
                            min="0"
                            max="100"
                            step="0.5"
                            placeholder="0"
                            className="mt-1"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="delivery-app-active"
                              checked={newDeliveryApp.is_active}
                              onChange={(e) => setNewDeliveryApp({...newDeliveryApp, is_active: e.target.checked})}
                              className="w-4 h-4"
                            />
                            <Label htmlFor="delivery-app-active" className="text-foreground">{t('تفعيل الشركة')}</Label>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button 
                          onClick={handleAddDeliveryApp} 
                          disabled={savingDeliveryApp}
                          className="gap-2"
                        >
                          {savingDeliveryApp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          حفظ
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setShowAddDeliveryApp(false);
                            setNewDeliveryApp({ name: '', name_en: '', commission_rate: 0, is_active: true });
                          }}
                        >{t('إلغاء')}</Button>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    {deliveryApps.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>{t('لا توجد شركات توصيل')}</p>
                        <p className="text-sm">{t('اضغط على &quot;إضافة شركة&quot; لإضافة شركة جديدة')}</p>
                      </div>
                    ) : (
                      deliveryApps.map(app => (
                        <div key={app.id} className="p-4 bg-muted/30 rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                <Truck className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{app.name}</p>
                                <p className="text-xs text-muted-foreground">{app.name_en}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleDeliveryApp(app)}
                                className={app.is_active !== false ? 'text-green-500' : 'text-red-500'}
                              >
                                {app.is_active !== false ? t('مفعل') : t('معطل')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditDeliveryApp({...app});
                                  setEditDeliveryAppDialogOpen(true);
                                }}
                                className="text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteDeliveryApp(app.id)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Label className="text-sm text-muted-foreground whitespace-nowrap">{t('نسبة العمولة:')}</Label>
                            <div className="flex items-center gap-2 flex-1">
                              <Input
                                type="number"
                                defaultValue={app.commission_rate || 0}
                                min="0"
                                max="100"
                                step="0.5"
                                className="w-24"
                                onBlur={(e) => handleUpdateDeliveryApp(app.id, e.target.value)}
                              />
                              <Percent className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground">({t('حالياً')}: {app.commission_rate || 0}%)</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
              
              {/* نافذة تعديل شركة التوصيل */}
              <Dialog open={editDeliveryAppDialogOpen} onOpenChange={setEditDeliveryAppDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{t('تعديل بيانات شركة التوصيل')}</DialogTitle>
                  </DialogHeader>
                  {editDeliveryApp && (
                    <div className="space-y-4">
                      <div>
                        <Label>{t('اسم الشركة (عربي)')}</Label>
                        <Input
                          value={editDeliveryApp.name || ''}
                          onChange={(e) => setEditDeliveryApp({...editDeliveryApp, name: e.target.value})}
                          placeholder={t('مثال: طلبات')}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>{t('اسم الشركة (إنجليزي)')}</Label>
                        <Input
                          value={editDeliveryApp.name_en || ''}
                          onChange={(e) => setEditDeliveryApp({...editDeliveryApp, name_en: e.target.value})}
                          placeholder="Example: Talabat"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>{t('نسبة العمولة (%)')}</Label>
                        <Input
                          type="number"
                          value={editDeliveryApp.commission_rate || 0}
                          onChange={(e) => setEditDeliveryApp({...editDeliveryApp, commission_rate: parseFloat(e.target.value) || 0})}
                          min="0"
                          max="100"
                          step="0.5"
                          className="mt-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="edit-delivery-app-active"
                          checked={editDeliveryApp.is_active !== false}
                          onChange={(e) => setEditDeliveryApp({...editDeliveryApp, is_active: e.target.checked})}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="edit-delivery-app-active">{t('تفعيل الشركة')}</Label>
                      </div>
                      <div className="flex gap-2 justify-end pt-4">
                        <Button variant="outline" onClick={() => setEditDeliveryAppDialogOpen(false)}>
                          {t('إلغاء')}
                        </Button>
                        <Button onClick={handleEditDeliveryAppName}>
                          <Save className="h-4 w-4 mr-2" />
                          {t('حفظ التغييرات')}
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          )}

          {/* Call Center - إعدادات الكول سنتر */}
          {hasRole(['admin', 'super_admin']) && (
            <TabsContent value="callcenter">
              <div className="space-y-6">
                {/* بطاقة التفعيل والمزود */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Headphones className="h-5 w-5" />{t('إعدادات الكول سنتر (Caller ID)')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* تفعيل الكول سنتر */}
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div>
                        <h4 className="font-medium text-foreground">{t('تفعيل نظام الكول سنتر')}</h4>
                        <p className="text-sm text-muted-foreground">{t('عند التفعيل، سيظهر رقم المتصل تلقائياً عند ورود مكالمة')}</p>
                      </div>
                      <Switch 
                        checked={callCenterConfig.enabled}
                        onCheckedChange={(checked) => setCallCenterConfig(prev => ({...prev, enabled: checked}))}
                      />
                    </div>

                    {/* اختيار المزود */}
                    <div className="space-y-2">
                      <Label>{t('مزود الخدمة')}</Label>
                      <Select 
                        value={callCenterConfig.provider} 
                        onValueChange={(value) => setCallCenterConfig(prev => ({...prev, provider: value}))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('اختر نظام الكول سنتر')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3cx">3CX</SelectItem>
                          <SelectItem value="ringcentral">RingCentral</SelectItem>
                          <SelectItem value="zoiper">Zoiper</SelectItem>
                          <SelectItem value="cloudtalk">CloudTalk</SelectItem>
                          <SelectItem value="freshdesk">Freshdesk Contact Center</SelectItem>
                          <SelectItem value="asterisk">Asterisk / FreePBX</SelectItem>
                          <SelectItem value="twilio">Twilio</SelectItem>
                          <SelectItem value="custom">{t('نظام مخصص (Custom API)')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* بيانات API */}
                    {callCenterConfig.provider && (
                      <div className="grid grid-cols-2 gap-4 p-4 border border-border rounded-lg">
                        <div className="col-span-2">
                          <Label>{t('رابط API')}</Label>
                          <Input 
                            value={callCenterConfig.api_url}
                            onChange={(e) => setCallCenterConfig(prev => ({...prev, api_url: e.target.value}))}
                            placeholder="https://api.yourprovider.com/v1"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <Label>API Key / Client ID</Label>
                          <Input 
                            value={callCenterConfig.api_key}
                            onChange={(e) => setCallCenterConfig(prev => ({...prev, api_key: e.target.value}))}
                            placeholder="your-api-key"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <Label>API Secret / Token</Label>
                          <Input 
                            type="password"
                            value={callCenterConfig.api_secret}
                            onChange={(e) => setCallCenterConfig(prev => ({...prev, api_secret: e.target.value}))}
                            placeholder="your-api-secret"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* بطاقة Webhook */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Globe className="h-5 w-5" />{t('إعداد Webhook')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{t('قم بإضافة هذا الرابط في إعدادات نظام الكول سنتر الخاص بك لاستقبال المكالمات الواردة')}</p>
                    
                    <div className="flex gap-2">
                      <Input 
                        value={`${API}/callcenter/webhook`}
                        readOnly
                        dir="ltr"
                        className="font-mono text-sm"
                      />
                      <Button 
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(`${API}/callcenter/webhook`);
                          toast.success(t('تم نسخ الرابط'));
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('Webhook Secret (اختياري)')}</Label>
                      <Input 
                        value={callCenterConfig.webhook_secret}
                        onChange={(e) => setCallCenterConfig(prev => ({...prev, webhook_secret: e.target.value}))}
                        placeholder={t('للتحقق من صحة الطلبات')}
                        dir="ltr"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* بطاقة الخيارات */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <SettingsIcon className="h-5 w-5" />{t('خيارات العرض')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">{t('نافذة منبثقة تلقائية')}</h4>
                        <p className="text-sm text-muted-foreground">{t('عرض نافذة المتصل تلقائياً عند ورود مكالمة')}</p>
                      </div>
                      <Switch 
                        checked={callCenterConfig.auto_popup}
                        onCheckedChange={(checked) => setCallCenterConfig(prev => ({...prev, auto_popup: checked}))}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">{t('حفظ الأرقام الجديدة تلقائياً')}</h4>
                        <p className="text-sm text-muted-foreground">{t('حفظ أرقام المتصلين الجدد في قاعدة العملاء')}</p>
                      </div>
                      <Switch 
                        checked={callCenterConfig.auto_save_new_callers}
                        onCheckedChange={(checked) => setCallCenterConfig(prev => ({...prev, auto_save_new_callers: checked}))}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">{t('صوت التنبيه')}</h4>
                        <p className="text-sm text-muted-foreground">{t('تشغيل صوت عند ورود مكالمة جديدة')}</p>
                      </div>
                      <Switch 
                        checked={callCenterConfig.play_sound}
                        onCheckedChange={(checked) => setCallCenterConfig(prev => ({...prev, play_sound: checked}))}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* بطاقة الاختبار والحفظ */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <TestTube className="h-5 w-5" />{t('اختبار الاتصال')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={async () => {
                          try {
                            setCallCenterTestStatus('testing');
                            const res = await axios.post(`${API}/callcenter/test`, callCenterConfig);
                            setCallCenterTestStatus(res.data.success ? 'success' : 'failed');
                            toast.success(t('تم الاتصال بنجاح!'));
                          } catch (error) {
                            setCallCenterTestStatus('failed');
                            toast.error(t('فشل الاتصال') + ': ' + (error.response?.data?.detail || t('خطأ غير معروف')));
                          }
                        }}
                        disabled={!callCenterConfig.provider || callCenterTestStatus === 'testing'}
                        className="gap-2"
                      >
                        {callCenterTestStatus === 'testing' ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                        {t('اختبار الاتصال')}
                      </Button>
                      
                      <Button 
                        variant="outline"
                        onClick={async () => {
                          try {
                            await axios.post(`${API}/callcenter/simulate`, { phone: '07801234567' });
                            toast.success(t('تم إرسال مكالمة تجريبية!'));
                          } catch (error) {
                            toast.error(t('فشل إرسال المكالمة التجريبية'));
                          }
                        }}
                        className="gap-2"
                      >
                        <PhoneIncoming className="h-4 w-4" />{t('محاكاة مكالمة واردة')}</Button>
                      
                      {callCenterTestStatus === 'success' && (
                        <span className="flex items-center gap-1 text-green-500">
                          <Check className="h-4 w-4" />{t('متصل')}</span>
                      )}
                      {callCenterTestStatus === 'failed' && (
                        <span className="flex items-center gap-1 text-red-500">
                          <X className="h-4 w-4" />{t('فشل الاتصال')}</span>
                      )}
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button 
                        onClick={async () => {
                          try {
                            await axios.post(`${API}/callcenter/config`, callCenterConfig);
                            toast.success(t('تم حفظ الإعدادات'));
                          } catch (error) {
                            toast.error(t('فشل حفظ الإعدادات'));
                          }
                        }}
                        className="gap-2 bg-primary"
                      >
                        <Save className="h-4 w-4" />{t('حفظ الإعدادات')}</Button>
                    </div>
                  </CardContent>
                </Card>

                {/* دليل الإعداد */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <BarChart className="h-5 w-5" />{t('دليل الإعداد السريع')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 text-sm">
                      <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                        <h5 className="font-medium text-blue-400 mb-2">3CX</h5>
                        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                          <li>{t('اذهب إلى Settings → Integrations → CRM')}</li>
                          <li>{t('اختر &quot;Custom CRM&quot; وأضف رابط Webhook')}</li>
                          <li>{t('انسخ API Key من إعدادات 3CX')}</li>
                        </ol>
                      </div>
                      
                      <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                        <h5 className="font-medium text-purple-400 mb-2">RingCentral</h5>
                        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                          <li>{t('اذهب إلى Developer Console')}</li>
                          <li>{t('أنشئ تطبيق جديد واحصل على Client ID و Secret')}</li>
                          <li>{t('أضف Webhook URL في إعدادات التطبيق')}</li>
                        </ol>
                      </div>
                      
                      <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                        <h5 className="font-medium text-green-400 mb-2">Asterisk / FreePBX</h5>
                        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                          <li>{t('قم بتثبيت AGI Script للاتصال بالنظام')}</li>
                          <li>{t('أضف الـ Script في extensions.conf')}</li>
                          <li>{t('استخدم AMI للاتصال بـ API')}</li>
                        </ol>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {/* Notifications */}
          {hasRole(['admin', 'super_admin']) && (
            <TabsContent value="notifications">
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Mail className="h-5 w-5" />{t('إشعارات البريد الإلكتروني')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{t('يتم إرسال تقارير إغلاق الصندوق تلقائياً لهذه العناوين')}</p>
                  
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder={t('أدخل بريد إلكتروني')}
                      className="flex-1"
                    />
                    <Button onClick={handleAddEmail} className="bg-primary text-primary-foreground">
                      <Plus className="h-4 w-4 ml-2" />{t('إضافة')}</Button>
                  </div>

                  <div className="space-y-2">
                    {emailRecipients.map(email => (
                      <div key={email} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <span className="text-foreground">{email}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveEmail(email)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {emailRecipients.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">{t('لم يتم إضافة عناوين بريد')}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              {/* قسم إعدادات الأصوات */}
              <Card className="border-border/50 bg-card mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Volume2 className="h-5 w-5" />{t('إعدادات الأصوات والتنبيهات')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* التحكم الرئيسي */}
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
                    <div className="flex items-center gap-3">
                      {soundSettings.enabled ? (
                        <Volume2 className="h-6 w-6 text-primary" />
                      ) : (
                        <VolumeX className="h-6 w-6 text-muted-foreground" />
                      )}
                      <div>
                        <h4 className="font-medium text-foreground">{t('تفعيل الأصوات')}</h4>
                        <p className="text-sm text-muted-foreground">{t('تشغيل/إيقاف جميع الأصوات في التطبيق')}</p>
                      </div>
                    </div>
                    <Switch
                      checked={soundSettings.enabled}
                      onCheckedChange={(checked) => {
                        const newSettings = {...soundSettings, enabled: checked};
                        setSoundSettings(newSettings);
                        saveSoundSettings(newSettings);
                        toast.success(checked ? t('تم تفعيل الأصوات') : t('تم إيقاف الأصوات'));
                      }}
                    />
                  </div>
                  
                  {/* مستوى الصوت */}
                  <div className="p-4 bg-muted/20 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-foreground">{t('مستوى الصوت')}</Label>
                      <span className="text-sm text-muted-foreground">{Math.round(soundSettings.volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={soundSettings.volume}
                      onChange={(e) => {
                        const newSettings = {...soundSettings, volume: parseFloat(e.target.value)};
                        setSoundSettings(newSettings);
                        saveSoundSettings(newSettings);
                      }}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                      disabled={!soundSettings.enabled}
                    />
                  </div>
                  
                  {/* أنواع الأصوات */}
                  <div className="grid gap-4">
                    <h4 className="font-medium text-foreground border-b border-border pb-2">{t('أنواع التنبيهات')}</h4>
                    
                    {/* أصوات الأزرار */}
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                          <Bell className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                          <h5 className="font-medium text-foreground">{t('أصوات الأزرار')}</h5>
                          <p className="text-xs text-muted-foreground">{t('صوت عند الضغط على الأزرار والعناصر')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => playClick()}
                          disabled={!soundSettings.enabled || !soundSettings.buttonSounds}
                          className="text-xs"
                        >{t('تجربة')}</Button>
                        <Switch
                          checked={soundSettings.buttonSounds}
                          disabled={!soundSettings.enabled}
                          onCheckedChange={(checked) => {
                            const newSettings = {...soundSettings, buttonSounds: checked};
                            setSoundSettings(newSettings);
                            saveSoundSettings(newSettings);
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* إشعارات الطلبات */}
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                          <ShoppingCart className="h-4 w-4 text-green-400" />
                        </div>
                        <div>
                          <h5 className="font-medium text-foreground">{t('إشعارات الطلبات الجديدة')}</h5>
                          <p className="text-xs text-muted-foreground">{t('صوت عند ورود طلب جديد')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => playNewOrderNotification()}
                          disabled={!soundSettings.enabled || !soundSettings.orderNotifications}
                          className="text-xs"
                        >{t('تجربة')}</Button>
                        <Switch
                          checked={soundSettings.orderNotifications}
                          disabled={!soundSettings.enabled}
                          onCheckedChange={(checked) => {
                            const newSettings = {...soundSettings, orderNotifications: checked};
                            setSoundSettings(newSettings);
                            saveSoundSettings(newSettings);
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* رنين المكالمات */}
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-500/20 rounded-lg">
                          <PhoneIncoming className="h-4 w-4 text-yellow-400" />
                        </div>
                        <div>
                          <h5 className="font-medium text-foreground">{t('رنين المكالمات الواردة')}</h5>
                          <p className="text-xs text-muted-foreground">{t('صوت رنين عند ورود مكالمة من الكول سنتر')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => playIncomingCall()}
                          disabled={!soundSettings.enabled || !soundSettings.callRingtone}
                          className="text-xs"
                        >{t('تجربة')}</Button>
                        <Switch
                          checked={soundSettings.callRingtone}
                          disabled={!soundSettings.enabled}
                          onCheckedChange={(checked) => {
                            const newSettings = {...soundSettings, callRingtone: checked};
                            setSoundSettings(newSettings);
                            saveSoundSettings(newSettings);
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* إشعارات السائقين */}
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                          <Truck className="h-4 w-4 text-purple-400" />
                        </div>
                        <div>
                          <h5 className="font-medium text-foreground">{t('إشعارات السائقين')}</h5>
                          <p className="text-xs text-muted-foreground">{t('صوت عند تعيين طلب للسائق')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => playSuccess()}
                          disabled={!soundSettings.enabled || !soundSettings.driverNotifications}
                          className="text-xs"
                        >{t('تجربة')}</Button>
                        <Switch
                          checked={soundSettings.driverNotifications}
                          disabled={!soundSettings.enabled}
                          onCheckedChange={(checked) => {
                            const newSettings = {...soundSettings, driverNotifications: checked};
                            setSoundSettings(newSettings);
                            saveSoundSettings(newSettings);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Payment Settings - إعدادات الدفع الإلكتروني */}
          {hasRole(['admin', 'super_admin']) && (
            <TabsContent value="payments">
              <div className="space-y-6">
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <CreditCard className="h-5 w-5" />{t('إعدادات الدفع الإلكتروني')}</CardTitle>
                    <p className="text-sm text-muted-foreground">{t('إعداد بوابات الدفع لاستقبال المدفوعات من العملاء')}</p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Stripe Settings */}
                    <div className="p-4 border rounded-lg bg-gradient-to-br from-purple-500/10 to-blue-500/10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                          <CreditCard className="h-5 w-5 text-purple-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-foreground">{t('Stripe - بطاقات الائتمان')}</h4>
                          <p className="text-xs text-muted-foreground">{t('قبول بطاقات Visa, Mastercard والمزيد')}</p>
                        </div>
                        <Switch 
                          checked={paymentSettings.stripe_enabled}
                          onCheckedChange={(checked) => setPaymentSettings(prev => ({...prev, stripe_enabled: checked}))}
                        />
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <Label className="text-foreground mb-2 block">{t('المفتاح العام (Publishable Key)')}</Label>
                          <Input 
                            placeholder="pk_live_xxxxxxxxxxxx"
                            className="bg-muted/30 font-mono text-sm"
                            value={paymentSettings.stripe_publishable_key}
                            onChange={(e) => setPaymentSettings(prev => ({...prev, stripe_publishable_key: e.target.value}))}
                          />
                        </div>
                        
                        <div>
                          <Label className="text-foreground mb-2 block">{t('المفتاح السري (Secret Key)')}</Label>
                          <Input 
                            type="password"
                            placeholder={paymentSettings.stripe_secret_key_set ? "••••••••••••••••" : "sk_live_xxxxxxxxxxxx"}
                            className="bg-muted/30 font-mono text-sm"
                            value={paymentSettings.stripe_secret_key}
                            onChange={(e) => setPaymentSettings(prev => ({...prev, stripe_secret_key: e.target.value}))}
                          />
                          <p className="text-xs text-muted-foreground mt-1">{t('يمكنك الحصول على المفاتيح من')}<a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{t('لوحة تحكم Stripe')}</a>
                          </p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground">{t('العملة')}</p>
                            <select 
                              className="w-full bg-transparent text-foreground font-bold mt-1"
                              value={paymentSettings.stripe_currency}
                              onChange={(e) => setPaymentSettings(prev => ({...prev, stripe_currency: e.target.value}))}
                            >
                              <option value="USD">{t('USD (دولار أمريكي)')}</option>
                              <option value="IQD">{t('IQD (دينار عراقي)')}</option>
                            </select>
                          </div>
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground">{t('الوضع')}</p>
                            <select 
                              className="w-full bg-transparent text-foreground font-bold mt-1"
                              value={paymentSettings.stripe_mode}
                              onChange={(e) => setPaymentSettings(prev => ({...prev, stripe_mode: e.target.value}))}
                            >
                              <option value="test">{t('وضع الاختبار')}</option>
                              <option value="live">{t('وضع الإنتاج')}</option>
                            </select>
                          </div>
                        </div>

                        <Button 
                          className="w-full bg-purple-500 hover:bg-purple-600"
                          onClick={saveStripeSettings}
                          disabled={paymentSaving}
                        >
                          {paymentSaving ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
                          {t('حفظ إعدادات Stripe')}
                        </Button>
                      </div>
                    </div>

                    {/* Zain Cash Settings */}
                    <div className="p-4 border rounded-lg bg-gradient-to-br from-pink-500/10 to-purple-500/10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-pink-500/20 rounded-lg">
                          <Smartphone className="h-5 w-5 text-pink-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-foreground">{t('زين كاش - Zain Cash')}</h4>
                          <p className="text-xs text-muted-foreground">{t('المحفظة الإلكترونية الأكثر انتشاراً في العراق')}</p>
                        </div>
                        <Switch 
                          checked={paymentSettings.zaincash_enabled}
                          onCheckedChange={(checked) => setPaymentSettings(prev => ({...prev, zaincash_enabled: checked}))}
                        />
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <Label className="text-foreground mb-2 block">{t('رقم محفظة زين كاش')}</Label>
                          <Input 
                            placeholder="07xx xxx xxxx"
                            type="tel"
                            className="bg-muted/30 text-lg tracking-wider"
                            value={paymentSettings.zaincash_phone}
                            onChange={(e) => setPaymentSettings(prev => ({...prev, zaincash_phone: e.target.value}))}
                          />
                        </div>
                        
                        <div>
                          <Label className="text-foreground mb-2 block">{t('اسم صاحب المحفظة')}</Label>
                          <Input 
                            placeholder={t('مثال: أحمد محمد')}
                            className="bg-muted/30"
                            value={paymentSettings.zaincash_name}
                            onChange={(e) => setPaymentSettings(prev => ({...prev, zaincash_name: e.target.value}))}
                          />
                        </div>
                        
                        <div>
                          <Label className="text-foreground mb-2 block">{t('رمز QR الخاص بمحفظتك (اختياري)')}</Label>
                          <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center">
                            {paymentSettings.zaincash_qr_image ? (
                              <div className="relative">
                                <img 
                                  src={paymentSettings.zaincash_qr_image} 
                                  alt="QR Code" 
                                  className="w-32 h-32 mx-auto object-contain"
                                />
                                <Button 
                                  variant="destructive" 
                                  size="sm" 
                                  className="mt-2"
                                  onClick={() => setPaymentSettings(prev => ({...prev, zaincash_qr_image: ''}))}
                                >
                                  <Trash2 className="h-4 w-4 ml-1" />{t('حذف')}</Button>
                              </div>
                            ) : (
                              <>
                                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">{t('اسحب صورة QR Code هنا أو')}</p>
                                <label className="cursor-pointer">
                                  <Button variant="outline" size="sm" className="mt-2" asChild>
                                    <span>{t('اختر صورة')}</span>
                                  </Button>
                                  <input 
                                    type="file" 
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      if (e.target.files?.[0]) {
                                        uploadZainCashQR(e.target.files[0]);
                                      }
                                    }}
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                          <p className="text-sm text-yellow-400">
                            ⚠️ <strong>{t('تنبيه:')}</strong>{t('سيظهر رقم محفظتك ورمز QR للعملاء عند اختيار الدفع بزين كاش')}</p>
                        </div>

                        <Button 
                          className="w-full bg-pink-500 hover:bg-pink-600"
                          onClick={saveZainCashSettings}
                          disabled={paymentSaving}
                        >
                          {paymentSaving ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
                          {t('حفظ إعدادات زين كاش')}
                        </Button>
                      </div>
                    </div>

                    {/* Delivery Fee Settings */}
                    <div className="p-4 border rounded-lg bg-muted/20">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-orange-500/20 rounded-lg">
                          <Truck className="h-5 w-5 text-orange-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-foreground">{t('رسوم التوصيل')}</h4>
                          <p className="text-xs text-muted-foreground">{t('تحديد رسوم التوصيل للطلبات')}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground mb-2 block">{t('رسوم التوصيل (د.ع)')}</Label>
                          <Input 
                            type="number" 
                            placeholder="0"
                            value={paymentSettings.delivery_fee}
                            onChange={(e) => setPaymentSettings(prev => ({...prev, delivery_fee: parseInt(e.target.value) || 0}))}
                            className="bg-muted/30"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground mb-2 block">{t('الحد الأدنى للطلب (د.ع)')}</Label>
                          <Input 
                            type="number" 
                            placeholder="0"
                            value={paymentSettings.min_order_amount}
                            onChange={(e) => setPaymentSettings(prev => ({...prev, min_order_amount: parseInt(e.target.value) || 0}))}
                            className="bg-muted/30"
                          />
                        </div>
                      </div>
                      
                      <Button 
                        className="w-full mt-4 bg-orange-500 hover:bg-orange-600"
                        onClick={saveDeliverySettings}
                        disabled={paymentSaving}
                      >
                        {paymentSaving ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
                        {t('حفظ رسوم التوصيل')}
                      </Button>
                    </div>

                    {/* Payment Methods Summary */}
                    <div className="p-4 border rounded-lg bg-muted/20">
                      <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <Wallet className="h-5 w-5" />{t('ملخص طرق الدفع المتاحة للعملاء')}</h4>
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                          <div className="flex items-center gap-3">
                            <Banknote className="h-5 w-5 text-green-400" />
                            <span className="text-foreground">{t('الدفع نقداً عند الاستلام')}</span>
                          </div>
                          <Badge className="bg-green-500/20 text-green-400">{t('مُفعّل')}</Badge>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                          <div className="flex items-center gap-3">
                            <CreditCard className="h-5 w-5 text-blue-400" />
                            <span className="text-foreground">{t('بطاقة ائتمان (Stripe)')}</span>
                          </div>
                          <Badge className="bg-blue-500/20 text-blue-400">{t('مُفعّل')}</Badge>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
                          <div className="flex items-center gap-3">
                            <Smartphone className="h-5 w-5 text-purple-400" />
                            <span className="text-foreground">{t('زين كاش')}</span>
                          </div>
                          <Badge className="bg-purple-500/20 text-purple-400">{t('مُفعّل')}</Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Transaction History */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Receipt className="h-5 w-5" />{t('آخر المعاملات المالية')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>{t('لا توجد معاملات مالية بعد')}</p>
                      <p className="text-xs mt-1">{t('ستظهر هنا المعاملات عند استلام مدفوعات من العملاء')}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {/* إعدادات المخزون */}
          {hasRole(['admin', 'super_admin']) && (
            <TabsContent value="inventory-settings">
              <div className="space-y-6">
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Package className="h-5 w-5" />{t('إعدادات نظام المخزون')}</CardTitle>
                    <p className="text-sm text-muted-foreground">{t('التحكم في طريقة عمل المخزون والخصم التلقائي')}</p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* نوع المخزون */}
                    <div className="p-4 border rounded-lg bg-blue-500/10">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        <Store className="h-5 w-5 text-blue-500" />{t('نوع المخزون')}</Label>
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div 
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            inventorySettings.inventory_mode === 'centralized' 
                              ? 'border-primary bg-primary/10' 
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => setInventorySettings(prev => ({...prev, inventory_mode: 'centralized'}))}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-4 h-4 rounded-full border-2 ${
                              inventorySettings.inventory_mode === 'centralized' 
                                ? 'border-primary bg-primary' 
                                : 'border-muted-foreground'
                            }`}>
                              {inventorySettings.inventory_mode === 'centralized' && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </div>
                            <span className="font-bold">{t('مخزون مركزي')}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{t('مخزون واحد مركزي يوزع على جميع الفروع. الخصم يتم من المخزون المركزي عند البيع.')}</p>
                        </div>
                        <div 
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            inventorySettings.inventory_mode === 'per_branch' 
                              ? 'border-primary bg-primary/10' 
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => setInventorySettings(prev => ({...prev, inventory_mode: 'per_branch'}))}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-4 h-4 rounded-full border-2 ${
                              inventorySettings.inventory_mode === 'per_branch' 
                                ? 'border-primary bg-primary' 
                                : 'border-muted-foreground'
                            }`}>
                              {inventorySettings.inventory_mode === 'per_branch' && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </div>
                            <span className="font-bold">{t('مخزون منفصل لكل فرع')}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{t('كل فرع له مخزونه الخاص. الخصم يتم من مخزون الفرع المحدد عند البيع.')}</p>
                        </div>
                      </div>
                    </div>

                    {/* خيارات إضافية */}
                    <div className="p-4 border rounded-lg">
                      <Label className="text-foreground font-bold mb-4 block">{t('خيارات إضافية')}</Label>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <ShoppingCart className="h-5 w-5 text-green-500" />
                            <div>
                              <p className="font-medium">{t('الخصم التلقائي عند البيع')}</p>
                              <p className="text-xs text-muted-foreground">{t('خصم الكميات تلقائياً من المخزون عند إتمام البيع')}</p>
                            </div>
                          </div>
                          <Switch 
                            checked={inventorySettings.auto_deduct_on_sale}
                            onCheckedChange={(checked) => setInventorySettings(prev => ({...prev, auto_deduct_on_sale: checked}))}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Bell className="h-5 w-5 text-yellow-500" />
                            <div>
                              <p className="font-medium">{t('تنبيهات نقص المخزون')}</p>
                              <p className="text-xs text-muted-foreground">{t('إرسال تنبيه عند وصول المخزون للحد الأدنى')}</p>
                            </div>
                          </div>
                          <Switch 
                            checked={inventorySettings.low_stock_notifications}
                            onCheckedChange={(checked) => setInventorySettings(prev => ({...prev, low_stock_notifications: checked}))}
                          />
                        </div>
                      </div>
                    </div>

                    <Button 
                      className="w-full bg-blue-500 hover:bg-blue-600"
                      onClick={saveInventorySettings}
                      disabled={savingInventorySettings}
                    >
                      {savingInventorySettings ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
                      {t('حفظ إعدادات المخزون')}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {/* System Settings - إعدادات النظام */}
          {hasRole(['admin', 'super_admin']) && (
            <TabsContent value="system-settings">
              <div className="space-y-6">
                {/* قسم إعدادات المنطقة والعملة */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Globe className="h-5 w-5" />{t('إعدادات النظام العامة')}</CardTitle>
                    <p className="text-sm text-muted-foreground">{t('اختر البلد والعملة واللغة للنظام بالكامل')}</p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* البلد */}
                    <div className="p-4 border rounded-lg bg-blue-500/10">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        <Globe className="h-5 w-5 text-blue-500" />{t('بلد النظام')}</Label>
                      <select
                        value={regionalSettings.country}
                        onChange={(e) => handleCountryChange(e.target.value)}
                        className="w-full mt-2 px-3 py-2 border rounded-lg bg-background text-foreground"
                      >
                        {Object.entries(supportedCountries).map(([code, country]) => (
                          <option key={code} value={code}>
                            {country.name} ({country.name_en})
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground mt-2">{t('* تغيير البلد سيعدل العملة واللغة تلقائياً للنظام بالكامل')}</p>
                    </div>

                    {/* العملة */}
                    <div className="p-4 border rounded-lg bg-green-500/10">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        <Banknote className="h-5 w-5 text-green-500" />{t('عملة النظام الرئيسية')}</Label>
                      <select
                        value={regionalSettings.currency}
                        onChange={(e) => setRegionalSettings(prev => ({...prev, currency: e.target.value}))}
                        className="w-full mt-2 px-3 py-2 border rounded-lg bg-background text-foreground"
                      >
                        {Object.entries(supportedCurrencies).map(([code, currency]) => (
                          <option key={code} value={code}>
                            {currency.name} ({currency.symbol}) - {currency.name_en}
                          </option>
                        ))}
                      </select>
                      
                      {/* العملة الثانوية */}
                      <div className="mt-4 flex items-center justify-between">
                        <Label className="text-sm text-muted-foreground">{t('عرض السعر بعملة ثانوية')}</Label>
                        <Switch
                          checked={regionalSettings.show_secondary_currency}
                          onCheckedChange={(checked) => setRegionalSettings(prev => ({...prev, show_secondary_currency: checked}))}
                        />
                      </div>
                      
                      {regionalSettings.show_secondary_currency && (
                        <div className="mt-3">
                          <Label className="text-xs text-muted-foreground">{t('العملة الثانوية')}</Label>
                          <select
                            value={regionalSettings.secondary_currency}
                            onChange={(e) => setRegionalSettings(prev => ({...prev, secondary_currency: e.target.value}))}
                            className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-foreground text-sm"
                          >
                            {Object.entries(supportedCurrencies).map(([code, currency]) => (
                              <option key={code} value={code}>
                                {currency.name} ({currency.symbol})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* اللغة */}
                    <div className="p-4 border rounded-lg bg-purple-500/10">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        🌐 {t('لغة النظام')}
                      </Label>
                      <select
                        value={regionalSettings.language}
                        onChange={(e) => setRegionalSettings(prev => ({...prev, language: e.target.value}))}
                        className="w-full mt-2 px-3 py-2 border rounded-lg bg-background text-foreground"
                        data-testid="language-select"
                      >
                        {Object.entries(supportedLanguages).map(([code, lang]) => (
                          <option key={code} value={code}>
                            {lang.name} ({lang.name_en})
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-amber-500 mt-2">
                        ⚠️ {t('الترجمة الكاملة للواجهة قيد التطوير')}
                      </p>
                    </div>

                    {/* زر الحفظ */}
                    <Button
                      onClick={saveRegionalSettings}
                      disabled={savingRegionalSettings}
                      className="w-full"
                    >
                      {savingRegionalSettings ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin ml-2" />{t('جاري الحفظ...')}</>
                      ) : (
                        <>
                          <Save className="h-4 w-4 ml-2" />{t('حفظ إعدادات النظام')}</>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* إعدادات الإشعارات العامة */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Bell className="h-5 w-5" />{t('إشعارات النظام')}</CardTitle>
                    <p className="text-sm text-muted-foreground">{t('إعدادات الإشعارات والتنبيهات العامة')}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-foreground">{t('إشعارات الطلبات الجديدة')}</p>
                        <p className="text-xs text-muted-foreground">{t('إشعار صوتي عند وصول طلب جديد')}</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-foreground">{t('إشعارات المخزون المنخفض')}</p>
                        <p className="text-xs text-muted-foreground">{t('تنبيه عند انخفاض المخزون عن الحد الأدنى')}</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {/* Invoice Settings - إعدادات الفاتورة للعميل */}
          {hasRole(['admin', 'super_admin', 'manager']) && (
            <TabsContent value="invoice-settings">
              <div className="space-y-6">
                {/* إعدادات الفاتورة */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Receipt className="h-5 w-5" />{t('إعدادات الفاتورة')}</CardTitle>
                    <p className="text-sm text-muted-foreground">{t('تخصيص معلومات المطعم التي تظهر على الفواتير المطبوعة')}</p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* شعار المطعم للفاتورة */}
                    <div className="p-4 border rounded-lg bg-amber-500/10 border-amber-500/30">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-amber-500" />{t('شعار المطعم (يظهر أعلى الفاتورة)')}
                      </Label>
                      <div className="flex items-start gap-4 mt-4">
                        <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center overflow-hidden border-2 border-border/50">
                          {invoiceSettings.invoice_logo ? (
                            <img 
                              src={invoiceSettings.invoice_logo?.startsWith('/api') 
                                ? `${API}${invoiceSettings.invoice_logo.replace('/api', '')}` 
                                : invoiceSettings.invoice_logo?.startsWith('/uploads')
                                  ? `${API}${invoiceSettings.invoice_logo}`
                                  : invoiceSettings.invoice_logo}
                              alt={t('شعار المطعم')} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Store className="h-8 w-8 text-black/50" />
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const formData = new FormData();
                                formData.append('file', file);
                                try {
                                  const res = await axios.post(`${API}/upload/restaurant-logo`, formData, {
                                    headers: { 'Content-Type': 'multipart/form-data' }
                                  });
                                  setInvoiceSettings(prev => ({...prev, invoice_logo: res.data.url || res.data.logo_url}));
                                  toast.success(t('تم رفع الشعار بنجاح'));
                                } catch (err) {
                                  toast.error(t('فشل في رفع الشعار'));
                                }
                              }
                            }}
                            className="cursor-pointer"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('يفضل صورة مربعة بحجم 200×200 بكسل')}
                          </p>
                          {invoiceSettings.invoice_logo && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-red-500 border-red-500/50"
                              onClick={() => setInvoiceSettings(prev => ({...prev, invoice_logo: null}))}
                            >
                              <Trash2 className="h-4 w-4 ml-1" />{t('إزالة الشعار')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ملاحظة عن شعار النظام */}
                    <div className="p-4 border rounded-lg bg-blue-500/10 border-blue-500/30">
                      <div className="flex items-center gap-3">
                        <ImageIcon className="h-6 w-6 text-blue-500" />
                        <div>
                          <p className="font-medium text-foreground">{t('شعار النظام')}</p>
                          <p className="text-xs text-muted-foreground">{t('يظهر شعار النظام ومعلومات التواصل تلقائياً في أسفل الفاتورة مع QR Code')}</p>
                        </div>
                      </div>
                    </div>

                    {/* معلومات الاتصال */}
                    <div className="p-4 border rounded-lg bg-green-500/10">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        <Phone className="h-5 w-5 text-green-500" />{t('معلومات الاتصال')}</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">{t('رقم الهاتف الأول')}</Label>
                          <Input
                            value={invoiceSettings.phone}
                            onChange={(e) => setInvoiceSettings(prev => ({...prev, phone: e.target.value}))}
                            placeholder={t('مثال: 07701234567')}
                            className="mt-1"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">{t('رقم الهاتف الثاني (اختياري)')}</Label>
                          <Input
                            value={invoiceSettings.phone2}
                            onChange={(e) => setInvoiceSettings(prev => ({...prev, phone2: e.target.value}))}
                            placeholder={t('مثال: 07809876543')}
                            className="mt-1"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    </div>

                    {/* العنوان */}
                    <div className="p-4 border rounded-lg bg-blue-500/10">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-blue-500" />{t('العنوان')}</Label>
                      <div className="mt-4">
                        <Label className="text-sm text-muted-foreground">{t('عنوان المطعم')}</Label>
                        <Input
                          value={invoiceSettings.address}
                          onChange={(e) => setInvoiceSettings(prev => ({...prev, address: e.target.value}))}
                          placeholder={t('مثال: بغداد - الكرادة - شارع الريحان')}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    {/* الرقم الضريبي */}
                    <div className="p-4 border rounded-lg bg-yellow-500/10">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-yellow-500" />{t('المعلومات الضريبية')}</Label>
                      <div className="mt-4">
                        <Label className="text-sm text-muted-foreground">{t('الرقم الضريبي (اختياري)')}</Label>
                        <Input
                          value={invoiceSettings.tax_number}
                          onChange={(e) => setInvoiceSettings(prev => ({...prev, tax_number: e.target.value}))}
                          placeholder={t('مثال: 123456789')}
                          className="mt-1"
                          dir="ltr"
                        />
                        {/* خيار إظهار/إخفاء الرقم الضريبي */}
                        <div className="flex items-center gap-2 mt-3">
                          <Switch 
                            checked={invoiceSettings.show_tax !== false}
                            onCheckedChange={(checked) => setInvoiceSettings(prev => ({...prev, show_tax: checked}))}
                          />
                          <span className="text-sm text-muted-foreground">{t('إظهار الرقم الضريبي في الفاتورة')}</span>
                        </div>
                      </div>
                    </div>

                    {/* نصوص مخصصة */}
                    <div className="p-4 border rounded-lg bg-purple-500/10">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        <Edit className="h-5 w-5 text-purple-500" />{t('نصوص مخصصة')}</Label>
                      <div className="space-y-4 mt-4">
                        <div>
                          <Label className="text-sm text-muted-foreground">{t('نص أعلى الفاتورة (اختياري)')}</Label>
                          <Textarea
                            value={invoiceSettings.custom_header}
                            onChange={(e) => setInvoiceSettings(prev => ({...prev, custom_header: e.target.value}))}
                            placeholder={t('مثال: أهلاً بكم في مطعمنا')}
                            className="mt-1"
                            rows={2}
                          />
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">{t('نص أسفل الفاتورة (اختياري)')}</Label>
                          <Textarea
                            value={invoiceSettings.custom_footer}
                            onChange={(e) => setInvoiceSettings(prev => ({...prev, custom_footer: e.target.value}))}
                            placeholder={t('مثال: نتمنى لكم وجبة شهية!')}
                            className="mt-1"
                            rows={2}
                          />
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">{t('رسالة الشكر (تظهر في نهاية الفاتورة)')}</Label>
                          <Input
                            value={invoiceSettings.thank_you_message || ''}
                            onChange={(e) => setInvoiceSettings(prev => ({...prev, thank_you_message: e.target.value}))}
                            placeholder={t('مثال: شكراً لزيارتكم ❤️')}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>

                    <Button 
                      className="w-full bg-green-500 hover:bg-green-600"
                      onClick={saveInvoiceSettings}
                      disabled={savingInvoiceSettings}
                    >
                      {savingInvoiceSettings ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
                      {t('حفظ إعدادات الفاتورة')}
                    </Button>

                    {/* معاينة الفاتورة */}
                    <div className="mt-6 p-4 border-2 border-dashed border-primary/50 rounded-lg">
                      <Label className="text-foreground font-bold mb-4 flex items-center gap-2">
                        <Eye className="h-5 w-5 text-primary" />{t('معاينة الفاتورة')}</Label>
                      <div className="mt-4 bg-white text-black p-6 rounded-lg shadow-lg max-w-sm mx-auto" style={{fontFamily: 'monospace'}}>
                        {/* أعلى الفاتورة - معلومات المطعم */}
                        <div className="text-center border-b border-dashed border-gray-400 pb-3 mb-3">
                          <h2 className="text-lg font-bold">{restaurantSettings.name || restaurantSettings.name_ar || t('اسم المطعم')}</h2>
                          {invoiceSettings.address && (
                            <p className="text-xs text-gray-600">{invoiceSettings.address}</p>
                          )}
                          {(invoiceSettings.phone || invoiceSettings.phone2) && (
                            <div className="text-xs mt-1">
                              {invoiceSettings.phone && <span>📞 {invoiceSettings.phone}</span>}
                              {invoiceSettings.phone && invoiceSettings.phone2 && <span> - </span>}
                              {invoiceSettings.phone2 && <span>{invoiceSettings.phone2}</span>}
                            </div>
                          )}
                          {invoiceSettings.tax_number && invoiceSettings.show_tax !== false && (
                            <p className="text-xs text-gray-500 mt-1">{t('الرقم الضريبي: {invoiceSettings.tax_number}')}</p>
                          )}
                        </div>
                        
                        {/* نص أعلى الفاتورة */}
                        {invoiceSettings.custom_header && (
                          <div className="text-center mb-2 text-xs">
                            {invoiceSettings.custom_header}
                          </div>
                        )}
                        
                        {/* معلومات الفاتورة */}
                        <div className="py-2 mb-2 text-xs">
                          <div className="flex justify-between">
                            <span>{t('رقم الفاتورة:')}</span>
                            <span>#001234</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t('التاريخ:')}</span>
                            <span>{new Date().toLocaleDateString('en-US')}</span>
                          </div>
                        </div>
                        
                        {/* الأصناف */}
                        <div className="mb-2 text-xs border-t border-b border-dashed py-2">
                          <div className="flex justify-between font-bold border-b pb-1 mb-1">
                            <span>{t('الصنف')}</span>
                            <span>{t('المبلغ')}</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span>{t('برجر لحم x2')}</span>
                            <span>30,000</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span>{t('بطاطس x1')}</span>
                            <span>5,000</span>
                          </div>
                        </div>
                        
                        {/* الإجمالي */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs">
                            <span>{t('المجموع:')}</span>
                            <span>35,000</span>
                          </div>
                          <div className="flex justify-between font-bold text-sm mt-1">
                            <span>{t('الإجمالي:')}</span>
                            <span>{t('35,000 د.ع')}</span>
                          </div>
                        </div>
                        
                        {/* نص أسفل من المطعم */}
                        {invoiceSettings.custom_footer && (
                          <div className="text-center text-xs mb-2 border-t border-dashed pt-2">
                            {invoiceSettings.custom_footer}
                          </div>
                        )}
                        
                        {/* معلومات النظام - أسفل الفاتورة */}
                        <div className="text-center border-t-2 border-gray-400 pt-3 mt-3">
                          <div className="text-xs text-gray-600 mb-1">{t('[شعار النظام]')}</div>
                          <p className="text-xs font-bold">{t('شكراً لزيارتكم ❤️')}</p>
                          <p className="text-xs text-gray-500 mt-1">{t('[أرقام التواصل مع النظام]')}</p>
                        </div>
                      </div>
                      <p className="text-center text-xs text-muted-foreground mt-3">{t('هذه معاينة تقريبية لشكل الفاتورة المطبوعة')}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {/* Customers - إدارة العملاء */}
          {hasRole(['admin', 'super_admin', 'manager', 'branch_manager']) && (
            <TabsContent value="customers">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <UserCheck className="h-5 w-5" />{t('إدارة العملاء')}</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('بحث بالاسم أو الهاتف...')}
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                        className="w-48 pr-9"
                        data-testid="customer-search-settings"
                      />
                    </div>
                    <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
                      <Button className="bg-primary text-primary-foreground" onClick={() => setCustomerDialogOpen(true)}>
                        <Plus className="h-4 w-4 ml-2" />{t('إضافة عميل')}</Button>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle className="text-foreground">{t('إضافة عميل جديد')}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await axios.post(`${API}/customers`, customerForm);
                            toast.success(t('تم إضافة العميل'));
                            setCustomerDialogOpen(false);
                            setCustomerForm({ name: '', phone: '', phone2: '', address: '', area: '', notes: '', is_blocked: false });
                            fetchData();
                          } catch (error) {
                            toast.error(error.response?.data?.detail || t('فشل في إضافة العميل'));
                          }
                        }} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-foreground">{t('اسم العميل *')}</Label>
                              <Input
                                value={customerForm.name}
                                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                                placeholder={t('أحمد محمد')}
                                required
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-foreground">{t('رقم الهاتف *')}</Label>
                              <Input
                                value={customerForm.phone}
                                onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                                placeholder="07xxxxxxxxx"
                                required
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-foreground">{t('رقم هاتف إضافي')}</Label>
                              <Input
                                value={customerForm.phone2}
                                onChange={(e) => setCustomerForm({ ...customerForm, phone2: e.target.value })}
                                placeholder={t('اختياري')}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-foreground">{t('المنطقة')}</Label>
                              <Input
                                value={customerForm.area}
                                onChange={(e) => setCustomerForm({ ...customerForm, area: e.target.value })}
                                placeholder={t('المنصور، الكرادة...')}
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-foreground">{t('العنوان الكامل')}</Label>
                            <Input
                              value={customerForm.address}
                              onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                              placeholder={t('العنوان بالتفصيل...')}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">{t('ملاحظات')}</Label>
                            <Textarea
                              value={customerForm.notes}
                              onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                              placeholder={t('ملاحظات خاصة بالعميل...')}
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                          <div className="flex gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => setCustomerDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                            <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('إضافة')}</Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {customers.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t('لا يوجد عملاء مسجلين')}</p>
                      <p className="text-sm">{t('يتم إضافة العملاء تلقائياً عند إنشاء الطلبات')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customers
                        .filter(c => 
                          !customerSearchQuery || 
                          c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                          c.phone.includes(customerSearchQuery) ||
                          (c.phone2 && c.phone2.includes(customerSearchQuery))
                        )
                        .map(customer => (
                        <div key={customer.id} className={`flex items-center justify-between p-4 rounded-lg ${customer.is_blocked ? 'bg-red-500/10 border border-red-500/30' : 'bg-muted/30'}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${customer.is_blocked ? 'bg-red-500/20' : 'bg-primary/10'}`}>
                              {customer.is_blocked ? (
                                <Ban className="h-6 w-6 text-red-500" />
                              ) : (
                                <UserCheck className="h-6 w-6 text-primary" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-foreground">{customer.name}</p>
                                {customer.is_blocked && (
                                  <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-500 rounded">{t('محظور')}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {customer.phone}
                                </span>
                                {customer.area && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {customer.area}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {customer.total_orders || 0} طلب | إجمالي: {(customer.total_spent || 0).toLocaleString()} د.ع
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-blue-500 hover:bg-blue-500/10"
                              onClick={() => {
                                setEditCustomerForm({
                                  id: customer.id,
                                  name: customer.name,
                                  phone: customer.phone,
                                  phone2: customer.phone2 || '',
                                  address: customer.address || '',
                                  area: customer.area || '',
                                  notes: customer.notes || '',
                                  is_blocked: customer.is_blocked || false
                                });
                                setEditCustomerDialogOpen(true);
                              }}
                              data-testid={`edit-customer-${customer.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={async () => {
                                if (!confirm(t('هل أنت متأكد؟'))) return;
                                try {
                                  await axios.delete(`${API}/customers/${customer.id}`);
                                  toast.success(t('تم حذف العميل'));
                                  fetchData();
                                } catch (error) {
                                  toast.error(t('فشل في حذف العميل'));
                                }
                              }}
                              data-testid={`delete-customer-${customer.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Edit Customer Dialog */}
              <Dialog open={editCustomerDialogOpen} onOpenChange={setEditCustomerDialogOpen}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">{t('تعديل بيانات العميل')}</DialogTitle>
                  </DialogHeader>
                  {editCustomerForm && (
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await axios.put(`${API}/customers/${editCustomerForm.id}`, {
                          name: editCustomerForm.name,
                          phone: editCustomerForm.phone,
                          phone2: editCustomerForm.phone2 || null,
                          address: editCustomerForm.address || null,
                          area: editCustomerForm.area || null,
                          notes: editCustomerForm.notes || null,
                          is_blocked: editCustomerForm.is_blocked
                        });
                        toast.success(t('تم تحديث بيانات العميل'));
                        setEditCustomerDialogOpen(false);
                        setEditCustomerForm(null);
                        fetchData();
                      } catch (error) {
                        toast.error(error.response?.data?.detail || t('فشل في تحديث العميل'));
                      }
                    }} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">{t('اسم العميل *')}</Label>
                          <Input
                            value={editCustomerForm.name}
                            onChange={(e) => setEditCustomerForm({ ...editCustomerForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('رقم الهاتف *')}</Label>
                          <Input
                            value={editCustomerForm.phone}
                            onChange={(e) => setEditCustomerForm({ ...editCustomerForm, phone: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">{t('رقم هاتف إضافي')}</Label>
                          <Input
                            value={editCustomerForm.phone2}
                            onChange={(e) => setEditCustomerForm({ ...editCustomerForm, phone2: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">{t('المنطقة')}</Label>
                          <Input
                            value={editCustomerForm.area}
                            onChange={(e) => setEditCustomerForm({ ...editCustomerForm, area: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-foreground">{t('العنوان الكامل')}</Label>
                        <Input
                          value={editCustomerForm.address}
                          onChange={(e) => setEditCustomerForm({ ...editCustomerForm, address: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">{t('ملاحظات')}</Label>
                        <Textarea
                          value={editCustomerForm.notes}
                          onChange={(e) => setEditCustomerForm({ ...editCustomerForm, notes: e.target.value })}
                          className="mt-1"
                          rows={2}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                          <Label className="text-foreground">{t('حظر العميل')}</Label>
                          <p className="text-xs text-muted-foreground">{t('منع العميل من الطلب')}</p>
                        </div>
                        <Switch
                          checked={editCustomerForm.is_blocked}
                          onCheckedChange={(checked) => setEditCustomerForm({ ...editCustomerForm, is_blocked: checked })}
                        />
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditCustomerDialogOpen(false)} className="flex-1">{t('إلغاء')}</Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('حفظ التغييرات')}</Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
