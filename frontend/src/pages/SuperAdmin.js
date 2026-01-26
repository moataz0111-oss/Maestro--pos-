import React, { useState, useEffect } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatPrice } from '../utils/currency';
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
  Sparkles
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

const API = API_URL;

// مفتاح Super Admin السري
const SUPER_ADMIN_SECRET = "271018";

export default function SuperAdmin() {
  const navigate = useNavigate();
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
  
  // Invoice settings for system
  const [invoiceSettings, setInvoiceSettings] = useState({
    system_name: '',
    system_logo_url: '',
    thank_you_message: 'شكراً لزيارتكم',
    system_phone: '',
    system_phone2: '',
    system_email: '',
    system_website: '',
    footer_text: '',
    show_system_branding: true
  });
  
  // New tenant form
  const [newTenantForm, setNewTenantForm] = useState({
    name: '',
    slug: '',
    owner_name: '',
    owner_email: '',
    owner_phone: '',
    subscription_type: 'trial',
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
  const [systemLogoFile, setSystemLogoFile] = useState(null);
  const [systemLogoPreview, setSystemLogoPreview] = useState('');
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
    }
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
      toast.error('فشل في جلب البيانات');
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
      toast.success('تم تسجيل الدخول بنجاح');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تسجيل الدخول');
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
      toast.success('تم إنشاء الحساب بنجاح');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إنشاء الحساب');
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

  const createTenant = async () => {
    setLoading(true);
    
    try {
      const res = await axios.post(`${API}/super-admin/tenants`, {
        ...newTenantForm,
        is_demo: newTenantForm.is_demo
      });
      toast.success('تم إنشاء العميل بنجاح');
      
      setCopiedCredentials(res.data.admin_credentials);
      fetchData();
      setShowNewTenant(false);
      
      // Reset form
      setNewTenantForm({
        name: '',
        slug: '',
        owner_name: '',
        owner_email: '',
        owner_phone: '',
        subscription_type: 'trial',
        max_branches: 1,
        max_users: 5,
        is_demo: false
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إنشاء العميل');
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
      toast.error('فشل في جلب التفاصيل');
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
      
      toast.success(`جاري الدخول كـ ${tenant.name}...`);
      
      // إعادة التوجيه للصفحة الرئيسية
      window.location.href = '/';
    } catch (error) {
      toast.error('فشل الدخول كعميل');
    }
  };

  const toggleTenantStatus = async (tenant) => {
    try {
      await axios.put(`${API}/super-admin/tenants/${tenant.id}`, {
        is_active: !tenant.is_active
      });
      toast.success(tenant.is_active ? 'تم تعطيل العميل' : 'تم تفعيل العميل');
      fetchData();
    } catch (error) {
      toast.error('فشل في تحديث الحالة');
    }
  };

  const deleteTenant = async () => {
    try {
      await axios.delete(`${API}/super-admin/tenants/${selectedTenant.id}?permanent=true`);
      toast.success('تم حذف العميل نهائياً');
      setShowDeleteConfirm(false);
      setSelectedTenant(null);
      fetchData();
    } catch (error) {
      toast.error('فشل في حذف العميل');
    }
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    
    try {
      await axios.post(`${API}/super-admin/tenants/${selectedTenant.id}/reset-password`, null, {
        params: { new_password: newPassword }
      });
      toast.success('تم إعادة تعيين كلمة المرور');
      setShowResetPassword(false);
      setNewPassword('');
    } catch (error) {
      toast.error('فشل في إعادة تعيين كلمة المرور');
    }
  };

  const resetTenantSales = async () => {
    try {
      await axios.post(`${API}/super-admin/tenants/${selectedTenant.id}/reset-sales?confirm=true`);
      toast.success('تم تصفير المبيعات بنجاح');
      setShowResetSalesConfirm(false);
      setSelectedTenant(null);
      fetchData();
    } catch (error) {
      toast.error('فشل في تصفير المبيعات');
    }
  };

  const resetTenantInventory = async () => {
    try {
      await axios.post(`${API}/super-admin/tenants/${selectedTenant.id}/reset-inventory?confirm=true`);
      toast.success('تم تصفير بيانات المخزون بنجاح');
      setShowResetInventoryConfirm(false);
      setSelectedTenant(null);
      fetchData();
    } catch (error) {
      toast.error('فشل في تصفير المخزون: ' + (error.response?.data?.detail || error.message));
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
        toast.success('تم تحديث البيانات وإرسال البريد الإلكتروني');
      } else {
        toast.success('تم تحديث بيانات العميل بنجاح');
      }
      
      setShowEditTenant(false);
      setLogoFile(null);
      setLogoPreviewUrl('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث البيانات');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('تم النسخ');
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
      toast.success('تم حفظ إعدادات الفاتورة بنجاح');
      setShowInvoiceSettings(false);
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
      toast.success('تم حفظ هوية النظام بنجاح');
    } catch (error) {
      toast.error('فشل في حفظ هوية النظام');
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
      toast.error('فشل في حفظ الإعدادات');
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
      
      const res = await axios.post(`${API}/upload/background`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setBackgroundSettings(prev => ({
        ...prev,
        backgrounds: [...prev.backgrounds, res.data.background]
      }));
      
      setShowAddBackground(false);
      setNewBackgroundUrl('');
      setNewBackgroundTitle('');
      setNewBackgroundAnimation('fade');
      toast.success('تم رفع الخلفية بنجاح');
    } catch (error) {
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
      const res = await axios.post(`${API}/login-backgrounds/upload`, null, {
        params: {
          file_url: newBackgroundUrl,
          title: newBackgroundTitle,
          animation_type: newBackgroundAnimation
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
      toast.success('تم إضافة الخلفية');
    } catch (error) {
      toast.error('فشل في إضافة الخلفية');
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
      
      // لا نحتاج لتحديد Content-Type يدوياً - axios سيضيفه تلقائياً مع الـ boundary الصحيح
      const res = await axios.post(`${API}/upload/logo`, formData);
      
      return res.data.logo_url;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في رفع الشعار');
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
      
      const res = await axios.post(`${API}/login-backgrounds/upload-logo`, formData);
      
      // تحديث الشعار في الإعدادات
      setBackgroundSettings(prev => ({
        ...prev,
        logo_url: res.data.logo_url
      }));
      
      toast.success('تم رفع شعار صفحة تسجيل الدخول بنجاح');
      setLoginLogoFile(null);
      setLoginLogoPreview('');
      return res.data.logo_url;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في رفع الشعار');
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
      toast.success('تم حذف الشعار');
    } catch (error) {
      toast.error('فشل في حذف الشعار');
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
      toast.success('تم حذف الخلفية');
    } catch (error) {
      toast.error('فشل في حذف الخلفية');
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
      basic: 'bg-blue-500/20 text-blue-400',
      premium: 'bg-purple-500/20 text-purple-400'
    };
    const labels = { trial: 'تجريبي', basic: 'أساسي', premium: 'مميز' };
    return <Badge className={styles[type]}>{labels[type]}</Badge>;
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
              {showRegister ? 'إنشاء حساب المالك' : 'لوحة تحكم المالك'}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {!showRegister ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">البريد الإلكتروني</Label>
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
                  <Label className="text-gray-300">كلمة المرور</Label>
                  <Input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">مفتاح السر</Label>
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
                  {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
                </Button>
                
                <p className="text-center text-sm text-gray-400">
                  ليس لديك حساب؟{' '}
                  <button 
                    type="button"
                    onClick={() => setShowRegister(true)}
                    className="text-purple-400 hover:underline"
                  >
                    إنشاء حساب
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">الاسم الكامل</Label>
                  <Input
                    type="text"
                    value={registerForm.full_name}
                    onChange={(e) => setRegisterForm({...registerForm, full_name: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">البريد الإلكتروني</Label>
                  <Input
                    type="email"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm({...registerForm, email: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">كلمة المرور</Label>
                  <Input
                    type="password"
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm({...registerForm, password: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-gray-300">مفتاح السر</Label>
                  <Input
                    type="password"
                    value={registerForm.secret_key}
                    onChange={(e) => setRegisterForm({...registerForm, secret_key: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                    placeholder="مفتاح السر للتسجيل"
                    required
                  />
                </div>
                
                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={loading}>
                  {loading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
                </Button>
                
                <p className="text-center text-sm text-gray-400">
                  لديك حساب؟{' '}
                  <button 
                    type="button"
                    onClick={() => setShowRegister(false)}
                    className="text-purple-400 hover:underline"
                  >
                    تسجيل الدخول
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
            <h3 className="font-bold">{tenant.name || tenant.slug || 'بدون اسم'}</h3>
            {isDemo && (
              <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                تجريبي
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
          <p className="text-sm text-gray-400">المستخدمين</p>
          <p className="font-bold">{tenant.users_count || 0}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-400">الفروع</p>
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
              <p className="text-sm text-gray-400">لوحة تحكم المالك</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowInvoiceSettings(true)}
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              <Receipt className="h-4 w-4 ml-2" />
              إعدادات الفواتير
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
                  <p className="text-sm text-gray-400">إجمالي العملاء</p>
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
                  <p className="text-sm text-gray-400">العملاء النشطون</p>
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
                  <p className="text-sm text-gray-400">إجمالي المستخدمين</p>
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
                  <p className="text-sm text-gray-400">إجمالي المبيعات</p>
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
              <CardTitle className="text-lg">الاشتراكات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-400">{stats.subscription_stats.trial || 0}</p>
                  <p className="text-sm text-gray-400">تجريبي</p>
                </div>
                <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                  <p className="text-2xl font-bold text-blue-400">{stats.subscription_stats.basic || 0}</p>
                  <p className="text-sm text-gray-400">أساسي</p>
                </div>
                <div className="text-center p-4 bg-purple-500/10 rounded-lg">
                  <p className="text-2xl font-bold text-purple-400">{stats.subscription_stats.premium || 0}</p>
                  <p className="text-sm text-gray-400">مميز</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tenants List */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">إدارة العملاء</CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="بحث..."
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
                عميل جديد
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* تبويبات لفصل العملاء الفعليين عن الحسابات التجريبية */}
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4 bg-gray-700/50">
                <TabsTrigger value="active" className="data-[state=active]:bg-green-600">
                  <Users className="h-4 w-4 ml-2" />
                  العملاء الفعليين ({tenants.filter(t => !t.is_demo && t.subscription_type !== 'demo').length})
                </TabsTrigger>
                <TabsTrigger value="demo" className="data-[state=active]:bg-yellow-600">
                  <Play className="h-4 w-4 ml-2" />
                  الحسابات التجريبية ({tenants.filter(t => t.is_demo || t.subscription_type === 'demo').length})
                </TabsTrigger>
                <TabsTrigger value="all" className="data-[state=active]:bg-purple-600">
                  <Layers className="h-4 w-4 ml-2" />
                  الكل ({tenants.length})
                </TabsTrigger>
              </TabsList>
              
              {/* العملاء الفعليين */}
              <TabsContent value="active">
                <div className="space-y-3">
                  {filteredTenants.filter(t => !t.is_demo && t.subscription_type !== 'demo').length === 0 ? (
                    <p className="text-center text-gray-400 py-8">لا يوجد عملاء فعليين</p>
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
                    <p className="text-center text-gray-400 py-8">لا توجد حسابات تجريبية</p>
                  ) : (
                    filteredTenants.filter(t => t.is_demo || t.subscription_type === 'demo').map((tenant) => (
                      <TenantCard key={tenant.id} tenant={tenant} isDemo />
                    ))
                  )}
                </div>
              </TabsContent>
              
              {/* جميع العملاء */}
              <TabsContent value="all">
                <div className="space-y-3">
                  {filteredTenants.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">لا يوجد عملاء</p>
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
            <DialogTitle className="text-xl">إنشاء عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* اختيار نوع الحساب */}
            <div className="space-y-2">
              <Label className="text-base font-medium">نوع الحساب *</Label>
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
                  <span>عميل فعلي</span>
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
                  <span>حساب تجريبي</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم المطعم *</Label>
                <Input
                  placeholder="مثال: مطعم السعادة"
                  value={newTenantForm.name}
                  onChange={(e) => setNewTenantForm({...newTenantForm, name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>المعرف (Slug) *</Label>
                <Input
                  placeholder="مثال: saada-restaurant"
                  value={newTenantForm.slug}
                  onChange={(e) => setNewTenantForm({...newTenantForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                  className="bg-gray-700/50 border-gray-600"
                  dir="ltr"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم المالك *</Label>
                <Input
                  placeholder="مثال: أحمد محمد"
                  value={newTenantForm.owner_name}
                  onChange={(e) => setNewTenantForm({...newTenantForm, owner_name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني *</Label>
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
                <Label>رقم الهاتف</Label>
                <Input
                  placeholder="009647xxxxxxxxx"
                  value={newTenantForm.owner_phone}
                  onChange={(e) => setNewTenantForm({...newTenantForm, owner_phone: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>نوع الاشتراك</Label>
                <Select 
                  value={newTenantForm.subscription_type} 
                  onValueChange={(v) => setNewTenantForm({...newTenantForm, subscription_type: v})}
                >
                  <SelectTrigger className="bg-gray-700/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">تجريبي</SelectItem>
                    <SelectItem value="trial">فترة تجريبية</SelectItem>
                    <SelectItem value="basic">أساسي</SelectItem>
                    <SelectItem value="premium">مميز</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الحد الأقصى للفروع</Label>
                <Input
                  type="number"
                  min="1"
                  value={newTenantForm.max_branches}
                  onChange={(e) => setNewTenantForm({...newTenantForm, max_branches: parseInt(e.target.value) || 1})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>الحد الأقصى للمستخدمين</Label>
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
              إلغاء
            </Button>
            <Button onClick={createTenant} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 ml-2" />
              إنشاء العميل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: تأكيد الحذف */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-400">تأكيد الحذف النهائي</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-300">
              هل أنت متأكد من حذف العميل <span className="font-bold text-white">{selectedTenant?.name}</span>؟
            </p>
            <p className="text-red-400 text-sm mt-2">
              ⚠️ هذا الإجراء نهائي ولا يمكن التراجع عنه. سيتم حذف جميع بيانات العميل.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={deleteTenant} className="bg-red-600 hover:bg-red-700">
              <Trash2 className="h-4 w-4 ml-2" />
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: إعادة تعيين كلمة المرور */}
      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">إعادة تعيين كلمة المرور</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-gray-300">
              إعادة تعيين كلمة المرور للعميل: <span className="font-bold text-white">{selectedTenant?.owner_email}</span>
            </p>
            <div className="space-y-2">
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                placeholder="أدخل كلمة المرور الجديدة"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-gray-700/50 border-gray-600"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPassword(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={resetPassword} className="bg-yellow-600 hover:bg-yellow-700">
              <Key className="h-4 w-4 ml-2" />
              تغيير كلمة المرور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: تعديل العميل */}
      <Dialog open={showEditTenant} onOpenChange={setShowEditTenant}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">تعديل بيانات العميل</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم المطعم</Label>
                <Input
                  value={editTenantForm.name}
                  onChange={(e) => setEditTenantForm({...editTenantForm, name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>نوع الاشتراك</Label>
                <Select 
                  value={editTenantForm.subscription_type} 
                  onValueChange={(v) => setEditTenantForm({...editTenantForm, subscription_type: v})}
                >
                  <SelectTrigger className="bg-gray-700/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">تجريبي</SelectItem>
                    <SelectItem value="trial">فترة تجريبية</SelectItem>
                    <SelectItem value="basic">أساسي</SelectItem>
                    <SelectItem value="premium">مميز</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم المالك</Label>
                <Input
                  value={editTenantForm.owner_name}
                  onChange={(e) => setEditTenantForm({...editTenantForm, owner_name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
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
                <Label>رقم الهاتف</Label>
                <Input
                  value={editTenantForm.owner_phone}
                  onChange={(e) => setEditTenantForm({...editTenantForm, owner_phone: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>الحد الأقصى للفروع</Label>
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
              إلغاء
            </Button>
            <Button onClick={updateTenant} className="bg-blue-600 hover:bg-blue-700">
              <Check className="h-4 w-4 ml-2" />
              حفظ التعديلات
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
              العرض المباشر - {selectedTenant?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card className="bg-gray-700/50 border-gray-600">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{liveStats?.orders_today || 0}</p>
                  <p className="text-sm text-gray-400">طلبات اليوم</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-700/50 border-gray-600">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">{liveStats?.sales_today?.toFixed(2) || '0.00'}</p>
                  <p className="text-sm text-gray-400">مبيعات اليوم</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-700/50 border-gray-600">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-400">{liveStats?.active_orders || 0}</p>
                  <p className="text-sm text-gray-400">طلبات نشطة</p>
                </CardContent>
              </Card>
              <Card className="bg-gray-700/50 border-gray-600">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-purple-400">{liveStats?.users_count || 0}</p>
                  <p className="text-sm text-gray-400">المستخدمين</p>
                </CardContent>
              </Card>
            </div>
            <div className="text-center text-gray-400 text-sm">
              <RefreshCw className="inline h-4 w-4 ml-1 animate-spin" />
              يتم التحديث تلقائياً كل 30 ثانية
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLiveView(false)} className="border-gray-600">
              إغلاق
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
                صلاحيات الميزات - {selectedTenant?.name}
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
                  تفعيل الكل
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
                  تعطيل الكل
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
                      الميزات الأساسية
                    </h3>
                    <div className="space-y-2">
                      {[
                        { key: 'showPOS', label: 'نقاط البيع', icon: Monitor },
                        { key: 'showTables', label: 'الطاولات', icon: LayoutGrid },
                        { key: 'showOrders', label: 'الطلبات', icon: FileText },
                        { key: 'showReports', label: 'التقارير', icon: BarChart3 },
                        { key: 'showExpenses', label: 'المصاريف', icon: Wallet },
                        { key: 'showInventory', label: 'المخزون', icon: Package },
                        { key: 'showDelivery', label: 'التوصيل', icon: Truck },
                        { key: 'showKitchen', label: 'شاشة المطبخ', icon: ChefHat },
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
                      الميزات المتقدمة
                    </h3>
                    <div className="space-y-2">
                      {[
                        { key: 'showHR', label: 'الموارد البشرية', icon: Users },
                        { key: 'showWarehouse', label: 'التحويلات (المخازن)', icon: ArrowLeftRight },
                        { key: 'showCallCenter', label: 'كول سنتر', icon: Headphones },
                        { key: 'showCallLogs', label: 'سجل المكالمات', icon: Phone },
                        { key: 'showLoyalty', label: 'برامج الولاء', icon: Gift },
                        { key: 'showCoupons', label: 'الكوبونات والعروض', icon: Tag },
                        { key: 'showRecipes', label: 'الوصفات', icon: UtensilsCrossed },
                        { key: 'showReservations', label: 'حجوزات الطاولات', icon: CalendarDays },
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
                    ميزات إضافية
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'showSmartReports', label: 'التقارير الذكية', icon: BrainCircuit },
                      { key: 'showBranchOrders', label: 'طلبات الفروع', icon: GitBranch },
                      { key: 'showPurchasing', label: 'المشتريات', icon: ShoppingCart },
                      { key: 'showReviews', label: 'التقييمات', icon: Star },
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
                    خيارات الإعدادات (تحكم في ما يظهر داخل الإعدادات)
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: 'settingsUsers', label: 'المستخدمين', icon: User },
                      { key: 'settingsCustomers', label: 'العملاء', icon: Users },
                      { key: 'settingsCategories', label: 'الفئات', icon: FolderTree },
                      { key: 'settingsProducts', label: 'المنتجات', icon: Package },
                      { key: 'settingsDeliveryCompanies', label: 'شركات التوصيل', icon: Truck },
                      { key: 'settingsBranches', label: 'الفروع', icon: Building2 },
                      { key: 'settingsPrinters', label: 'المطبوعات', icon: Printer },
                      { key: 'settingsNotifications', label: 'الإشعارات', icon: Bell },
                      { key: 'settingsCallCenter', label: 'كول سنتر', icon: Headphones },
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
              إلغاء
            </Button>
            <Button onClick={saveTenantFeatures} className="bg-purple-600 hover:bg-purple-700">
              <Check className="h-4 w-4 ml-2" />
              حفظ الميزات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: تأكيد تصفير المبيعات */}
      <Dialog open={showResetSalesConfirm} onOpenChange={setShowResetSalesConfirm}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-orange-400">تأكيد تصفير المبيعات</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-300">
              هل أنت متأكد من تصفير مبيعات <span className="font-bold text-white">{selectedTenant?.name}</span>؟
            </p>
            <p className="text-orange-400 text-sm mt-2">
              ⚠️ سيتم حذف جميع الطلبات والمبيعات. هذا الإجراء لا يمكن التراجع عنه.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetSalesConfirm(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={resetTenantSales} className="bg-orange-600 hover:bg-orange-700">
              <RotateCcw className="h-4 w-4 ml-2" />
              تصفير المبيعات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: تأكيد تصفير المخزون */}
      <Dialog open={showResetInventoryConfirm} onOpenChange={setShowResetInventoryConfirm}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-purple-400">تأكيد تصفير المخزون</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-300">
              هل أنت متأكد من تصفير مخزون <span className="font-bold text-white">{selectedTenant?.name}</span>؟
            </p>
            <p className="text-purple-400 text-sm mt-2">
              ⚠️ سيتم حذف جميع بيانات المخزون والمشتريات. هذا الإجراء لا يمكن التراجع عنه.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetInventoryConfirm(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={resetTenantInventory} className="bg-purple-600 hover:bg-purple-700">
              <Package className="h-4 w-4 ml-2" />
              تصفير المخزون
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
              تفاصيل العميل - {selectedTenant?.name}
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
                      معلومات المطعم
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">اسم المطعم</span>
                        <span className="font-medium">{tenantDetails.tenant?.name || selectedTenant?.name || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">المعرف (Slug)</span>
                        <span className="font-medium text-blue-400" dir="ltr">/{tenantDetails.tenant?.slug || selectedTenant?.slug || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">نوع الاشتراك</span>
                        <Badge className={
                          (tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'premium' ? 'bg-purple-500/20 text-purple-400' :
                          (tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'basic' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }>
                          {(tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'premium' ? 'مميز' : 
                           (tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'basic' ? 'أساسي' : 
                           (tenantDetails.tenant?.subscription_type || selectedTenant?.subscription_type) === 'demo' ? 'تجريبي' : 'فترة تجريبية'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">الحالة</span>
                        <Badge className={(tenantDetails.tenant?.is_active !== false && selectedTenant?.is_active !== false) ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                          {(tenantDetails.tenant?.is_active !== false && selectedTenant?.is_active !== false) ? 'نشط' : 'معطل'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-bold text-blue-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                      <User className="h-4 w-4" />
                      معلومات المالك
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">اسم المالك</span>
                        <span className="font-medium">{tenantDetails.tenant?.owner_name || selectedTenant?.owner_name || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">البريد الإلكتروني</span>
                        <span className="font-medium text-blue-400" dir="ltr">{tenantDetails.tenant?.owner_email || selectedTenant?.owner_email || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">رقم الهاتف</span>
                        <span className="font-medium" dir="ltr">{tenantDetails.tenant?.owner_phone || selectedTenant?.owner_phone || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                        <span className="text-gray-400">تاريخ الإنشاء</span>
                        <span className="font-medium">
                          {(tenantDetails.tenant?.created_at || selectedTenant?.created_at) 
                            ? new Date(tenantDetails.tenant?.created_at || selectedTenant?.created_at).toLocaleDateString('ar-EG') 
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
                    الحدود والإحصائيات
                  </h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                      <p className="text-2xl font-bold text-blue-400">{tenantDetails.stats?.branches_count || tenantDetails.branches?.length || 0}</p>
                      <p className="text-sm text-gray-400">الفروع</p>
                      <p className="text-xs text-gray-500 mt-1">الحد: {tenantDetails.tenant?.max_branches || selectedTenant?.max_branches || '-'}</p>
                    </div>
                    <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                      <p className="text-2xl font-bold text-green-400">{tenantDetails.stats?.users_count || tenantDetails.users?.length || 0}</p>
                      <p className="text-sm text-gray-400">المستخدمين</p>
                      <p className="text-xs text-gray-500 mt-1">الحد: {tenantDetails.tenant?.max_users || selectedTenant?.max_users || '-'}</p>
                    </div>
                    <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                      <p className="text-2xl font-bold text-purple-400">{tenantDetails.stats?.orders_today || 0}</p>
                      <p className="text-sm text-gray-400">طلبات اليوم</p>
                    </div>
                    <div className="text-center p-4 bg-gray-700/30 rounded-lg">
                      <p className="text-2xl font-bold text-yellow-400">{formatPrice(tenantDetails.stats?.total_sales || 0)}</p>
                      <p className="text-sm text-gray-400">إجمالي المبيعات</p>
                    </div>
                  </div>
                </div>

                {/* قائمة المستخدمين */}
                {tenantDetails.users && tenantDetails.users.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-bold text-purple-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                      <Users className="h-4 w-4" />
                      المستخدمين ({tenantDetails.users.length})
                    </h3>
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {tenantDetails.users.map((user, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-gray-700/30 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span>{user.full_name || user.username}</span>
                          </div>
                          <Badge className="text-xs">
                            {user.role === 'admin' ? 'مدير' : 
                             user.role === 'manager' ? 'مشرف' : 
                             user.role === 'cashier' ? 'كاشير' : user.role}
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
                      الفروع ({tenantDetails.branches.length})
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
                      شعار المطعم
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
                <p className="text-gray-400 mt-2">جاري تحميل البيانات...</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTenantDetails(false)} className="border-gray-600">
              إغلاق
            </Button>
            <Button onClick={() => { setShowTenantDetails(false); openEditTenant(selectedTenant); }} className="bg-blue-600 hover:bg-blue-700">
              <Edit className="h-4 w-4 ml-2" />
              تعديل البيانات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: إعدادات الفواتير */}
      <Dialog open={showInvoiceSettings} onOpenChange={setShowInvoiceSettings}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Receipt className="h-5 w-5 text-purple-400" />
              إعدادات الفواتير
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              تخصيص مظهر ومحتوى الفواتير لجميع العملاء
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-6">
            {/* شعار النظام */}
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
                  <Input
                    type="text"
                    placeholder="رابط الشعار (URL)"
                    value={invoiceSettings.system_logo_url || ''}
                    onChange={(e) => setInvoiceSettings({...invoiceSettings, system_logo_url: e.target.value})}
                    className="bg-gray-700/50 border-gray-600 text-white"
                  />
                  <p className="text-xs text-gray-500">أدخل رابط صورة الشعار أو قم برفع صورة</p>
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
            <div className="space-y-4">
              <h3 className="font-bold text-purple-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                <Settings className="h-4 w-4" />
                خيارات العرض
              </h3>
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
            </div>

            {/* معاينة الفاتورة */}
            <div className="space-y-4">
              <h3 className="font-bold text-green-400 flex items-center gap-2 border-b border-gray-700 pb-2">
                <Eye className="h-4 w-4" />
                معاينة الفاتورة
              </h3>
              <div className="bg-white text-black p-4 rounded-lg text-center" dir="rtl">
                {invoiceSettings.show_system_branding && (
                  <>
                    {invoiceSettings.system_logo_url && (
                      <img 
                        src={invoiceSettings.system_logo_url.startsWith('/api') 
                          ? `${API}${invoiceSettings.system_logo_url.replace('/api', '')}` 
                          : invoiceSettings.system_logo_url}
                        alt="Logo" 
                        className="h-12 mx-auto mb-2"
                      />
                    )}
                    <p className="font-bold text-lg">اسم المطعم</p>
                    <p className="text-sm text-gray-600">العنوان: شارع المثال، المدينة</p>
                    {(invoiceSettings.system_phone || invoiceSettings.system_phone2) && (
                      <p className="text-sm text-gray-600">
                        هاتف: {invoiceSettings.system_phone || '-'} 
                        {invoiceSettings.system_phone2 && ` / ${invoiceSettings.system_phone2}`}
                      </p>
                    )}
                  </>
                )}
                <hr className="my-2" />
                <div className="text-right text-sm">
                  <div className="flex justify-between">
                    <span>2x</span>
                    <span>برجر لحم</span>
                    <span>120 ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1x</span>
                    <span>بطاطس</span>
                    <span>30 ج.م</span>
                  </div>
                </div>
                <hr className="my-2" />
                <div className="flex justify-between font-bold">
                  <span>الإجمالي:</span>
                  <span>150 ج.م</span>
                </div>
                <hr className="my-2" />
                <p className="text-sm font-medium">{invoiceSettings.thank_you_message || 'شكراً لزيارتكم'}</p>
                {invoiceSettings.footer_text && (
                  <p className="text-xs text-gray-500 mt-1">{invoiceSettings.footer_text}</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceSettings(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={saveInvoiceSettings} className="bg-green-600 hover:bg-green-700">
              <Check className="h-4 w-4 ml-2" />
              حفظ الإعدادات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper function for TenantCard - moved outside component
// Note: This is handled inline in the tabs above
