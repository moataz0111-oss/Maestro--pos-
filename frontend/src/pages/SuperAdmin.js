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
  Receipt
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
    max_users: 5
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
      const res = await axios.post(`${API}/super-admin/tenants`, newTenantForm);
      toast.success('تم إنشاء العميل بنجاح');
      
      setCopiedCredentials(res.data.admin_credentials);
      fetchData();
      
      // Reset form
      setNewTenantForm({
        name: '',
        slug: '',
        owner_name: '',
        owner_email: '',
        owner_phone: '',
        subscription_type: 'trial',
        max_branches: 1,
        max_users: 5
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
      </div>
    );
  };

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
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleLiveView(tenant)}
            className="hover:bg-gray-600"
            title="عرض مباشر"
          >
            <Activity className="h-4 w-4 text-green-400" />
          </Button>
          {/* التفاصيل */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleViewDetails(tenant)}
            className="hover:bg-gray-600"
            title="عرض التفاصيل"
          >
            <Eye className="h-4 w-4" />
          </Button>
          {/* التعديل */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleEditTenant(tenant)}
            className="hover:bg-gray-600"
            title="تعديل"
          >
            <Edit className="h-4 w-4 text-blue-400" />
          </Button>
          {/* الميزات */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleManageFeatures(tenant)}
            className="hover:bg-gray-600"
            title="إدارة الميزات"
          >
            <Layers className="h-4 w-4 text-purple-400" />
          </Button>
          {/* إعادة تعيين كلمة المرور */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => { setSelectedTenant(tenant); setShowResetPassword(true); }}
            className="hover:bg-gray-600"
            title="إعادة تعيين كلمة المرور"
          >
            <Key className="h-4 w-4 text-yellow-400" />
          </Button>
          {/* تفعيل/تعطيل */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleToggleActive(tenant)}
            className="hover:bg-gray-600"
            title={tenant.is_active ? 'تعطيل' : 'تفعيل'}
          >
            {tenant.is_active ? (
              <PowerOff className="h-4 w-4 text-red-400" />
            ) : (
              <Power className="h-4 w-4 text-green-400" />
            )}
          </Button>
          {/* الحذف */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => { setSelectedTenant(tenant); setShowDeleteConfirm(true); }}
            className="hover:bg-red-600"
            title="حذف"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return renderDashboard();
}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="h-4 w-4 ml-1" />
                        إزالة
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              
              {/* الأسماء */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">اسم النظام (يظهر في Dashboard)</Label>
                  <Input
                    placeholder="مثال: Maestro"
                    value={systemBranding.name}
                    onChange={(e) => setSystemBranding({...systemBranding, name: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">الاسم بالعربي (اختياري)</Label>
                  <Input
                    placeholder="مثال: مايسترو"
                    value={systemBranding.name_ar}
                    onChange={(e) => setSystemBranding({...systemBranding, name_ar: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">الاسم بالإنجليزي (اختياري)</Label>
                  <Input
                    placeholder="e.g. Maestro"
                    value={systemBranding.name_en}
                    onChange={(e) => setSystemBranding({...systemBranding, name_en: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Settings Section - إعدادات الفاتورة */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center">
                <Receipt className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <CardTitle className="text-lg">إعدادات الفاتورة</CardTitle>
                <p className="text-sm text-gray-400">تحكم في مظهر الفواتير المطبوعة لجميع العملاء</p>
              </div>
            </div>
            <Button 
              onClick={saveInvoiceSettings} 
              className="bg-green-600 hover:bg-green-700 gap-2"
              disabled={loading}
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              حفظ الإعدادات
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* شعار النظام */}
            <div className="p-4 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/30">
              <Label className="text-sm font-bold text-orange-400 mb-4 flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                شعار النظام (يظهر في جميع الفواتير)
              </Label>
              <div className="flex items-center gap-4 mt-4">
                {/* عرض الشعار الحالي */}
                <div className="w-24 h-24 border-2 border-dashed border-orange-500/50 rounded-lg flex items-center justify-center bg-gray-900/50 overflow-hidden">
                  {invoiceSettings.system_logo_url ? (
                    <img 
                      src={invoiceSettings.system_logo_url.startsWith('/') 
                        ? `${API}${invoiceSettings.system_logo_url}` 
                        : invoiceSettings.system_logo_url}
                      alt="شعار النظام"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-gray-500" />
                  )}
                </div>
                
                {/* أزرار التحكم */}
                <div className="flex-1">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        try {
                          toast.loading('جاري رفع الشعار...');
                          const res = await axios.post(`${API}/upload/image`, formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          });
                          setInvoiceSettings(prev => ({...prev, system_logo_url: res.data.url}));
                          toast.dismiss();
                          toast.success('تم رفع شعار النظام بنجاح');
                        } catch (error) {
                          toast.dismiss();
                          toast.error('فشل في رفع الشعار');
                        }
                      }}
                    />
                    <Button variant="outline" className="w-full border-orange-500/50 text-orange-400 hover:bg-orange-500/10" asChild>
                      <span>
                        <Upload className="h-4 w-4 ml-2" />
                        رفع شعار النظام
                      </span>
                    </Button>
                  </label>
                  <p className="text-xs text-gray-400 mt-2">
                    سيظهر هذا الشعار في جميع فواتير العملاء
                  </p>
                  {invoiceSettings.system_logo_url && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-400 mt-2 hover:bg-red-500/10"
                      onClick={() => setInvoiceSettings(prev => ({...prev, system_logo_url: ''}))}
                    >
                      <X className="h-4 w-4 ml-1" />
                      إزالة الشعار
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* اسم النظام ورسالة الشكر */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">اسم النظام</Label>
                  <Input
                    placeholder="مثال: Maestro EGP"
                    value={invoiceSettings.system_name || ''}
                    onChange={(e) => setInvoiceSettings({...invoiceSettings, system_name: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">رسالة الشكر (أسفل الفاتورة)</Label>
                  <Input
                    placeholder="شكراً لزيارتكم"
                    value={invoiceSettings.thank_you_message}
                    onChange={(e) => setInvoiceSettings({...invoiceSettings, thank_you_message: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">نص إضافي في التذييل</Label>
                  <Input
                    placeholder="مثال: تابعونا على مواقع التواصل"
                    value={invoiceSettings.footer_text || ''}
                    onChange={(e) => setInvoiceSettings({...invoiceSettings, footer_text: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                    dir="rtl"
                  />
                </div>
              </div>
              
              {/* بيانات التواصل */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">هاتف النظام 1</Label>
                    <Input
                      placeholder="07xxxxxxxxx"
                      value={invoiceSettings.system_phone || ''}
                      onChange={(e) => setInvoiceSettings({...invoiceSettings, system_phone: e.target.value})}
                      className="bg-gray-700/50 border-gray-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">هاتف النظام 2</Label>
                    <Input
                      placeholder="07xxxxxxxxx"
                      value={invoiceSettings.system_phone2 || ''}
                      onChange={(e) => setInvoiceSettings({...invoiceSettings, system_phone2: e.target.value})}
                      className="bg-gray-700/50 border-gray-600"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">البريد الإلكتروني</Label>
                  <Input
                    type="email"
                    placeholder="info@example.com"
                    value={invoiceSettings.system_email || ''}
                    onChange={(e) => setInvoiceSettings({...invoiceSettings, system_email: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">الموقع الإلكتروني</Label>
                  <Input
                    placeholder="www.example.com"
                    value={invoiceSettings.system_website || ''}
                    onChange={(e) => setInvoiceSettings({...invoiceSettings, system_website: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                  />
                </div>
              </div>
            </div>
            
            {/* إظهار شعار النظام */}
            <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
              <div>
                <Label className="text-sm font-medium">إظهار شعار وبيانات النظام في الفواتير</Label>
                <p className="text-xs text-gray-400">سيظهر شعار النظام ورسالة الشكر وبيانات التواصل في كل فاتورة</p>
              </div>
              <Switch
                checked={invoiceSettings.show_system_branding}
                onCheckedChange={(v) => setInvoiceSettings({...invoiceSettings, show_system_branding: v})}
              />
            </div>
            
            {/* معاينة */}
            <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
              <Label className="text-sm font-medium mb-4 block">معاينة الفاتورة:</Label>
              <div className="bg-white text-black p-4 rounded-lg text-sm font-mono max-w-xs mx-auto">
                {/* أعلى الفاتورة - معلومات المطعم */}
                <div className="text-center border-b border-gray-300 pb-2 mb-2">
                  <div className="font-bold text-lg">[اسم المطعم]</div>
                  <div className="text-xs text-gray-600">[عنوان المطعم]</div>
                  <div className="text-xs">📞 [أرقام المطعم]</div>
                </div>
                
                {/* محتوى الفاتورة */}
                <div className="py-2 border-b border-gray-300 mb-2">
                  <div className="text-xs text-gray-500">... الأصناف والأسعار ...</div>
                  <div className="text-xs text-gray-500">... المجموع والإجمالي ...</div>
                </div>
                
                {/* أسفل الفاتورة - معلومات النظام */}
                <div className="text-center pt-2 border-t border-dashed border-gray-400">
                  {invoiceSettings.system_logo_url && (
                    <div className="mb-2">
                      <img 
                        src={invoiceSettings.system_logo_url.startsWith('/') 
                          ? `${API}${invoiceSettings.system_logo_url}` 
                          : invoiceSettings.system_logo_url}
                        alt="شعار النظام"
                        className="h-8 mx-auto object-contain"
                      />
                    </div>
                  )}
                  <div className="font-bold text-sm">{invoiceSettings.thank_you_message || 'شكراً لزيارتكم'}</div>
                  {invoiceSettings.footer_text && <div className="text-xs mt-1">{invoiceSettings.footer_text}</div>}
                  {invoiceSettings.system_phone && <div className="text-xs mt-1">📞 {invoiceSettings.system_phone}</div>}
                  {invoiceSettings.system_email && <div className="text-xs">✉️ {invoiceSettings.system_email}</div>}
                  {invoiceSettings.system_website && <div className="text-xs">🌐 {invoiceSettings.system_website}</div>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Login Backgrounds Section */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-xl flex items-center justify-center">
                <Image className="h-5 w-5 text-pink-400" />
              </div>
              <div>
                <CardTitle className="text-lg">خلفيات صفحة الدخول</CardTitle>
                <p className="text-sm text-gray-400">تحكم في مظهر صفحة تسجيل الدخول</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                onClick={saveBackgroundSettings} 
                className="bg-green-600 hover:bg-green-700 gap-2"
                disabled={backgroundsLoading}
              >
                {backgroundsLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                حفظ التغييرات
              </Button>
              <Button 
                onClick={() => setShowAddBackground(true)} 
                className="bg-purple-600 hover:bg-purple-700 gap-2"
              >
                <Plus className="h-4 w-4" />
                إضافة خلفية
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Animation Toggle */}
              <div className="p-4 bg-gray-700/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">تفعيل الحركة</Label>
                  <Switch
                    checked={backgroundSettings.animation_enabled}
                    onCheckedChange={(checked) => 
                      setBackgroundSettings(prev => ({...prev, animation_enabled: checked}))
                    }
                  />
                </div>
              </div>
              
              {/* Auto Play */}
              <div className="p-4 bg-gray-700/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">تبديل تلقائي</Label>
                  <Switch
                    checked={backgroundSettings.auto_play}
                    onCheckedChange={(checked) => 
                      setBackgroundSettings(prev => ({...prev, auto_play: checked}))
                    }
                  />
                </div>
              </div>
              
              {/* Transition Type */}
              <div className="p-4 bg-gray-700/30 rounded-lg space-y-2">
                <Label className="text-sm">نوع الانتقال</Label>
                <Select
                  value={backgroundSettings.transition_type}
                  onValueChange={(v) => 
                    setBackgroundSettings(prev => ({...prev, transition_type: v}))
                  }
                >
                  <SelectTrigger className="bg-gray-700/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="fade">تلاشي (Fade)</SelectItem>
                    <SelectItem value="slide">انزلاق (Slide)</SelectItem>
                    <SelectItem value="crossfade">تقاطع (Crossfade)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Logo Animation */}
              <div className="p-4 bg-gray-700/30 rounded-lg space-y-2">
                <Label className="text-sm">حركة الشعار</Label>
                <Select
                  value={backgroundSettings.logo_animation}
                  onValueChange={(v) => 
                    setBackgroundSettings(prev => ({...prev, logo_animation: v}))
                  }
                >
                  <SelectTrigger className="bg-gray-700/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="pulse">نبض (Pulse)</SelectItem>
                    <SelectItem value="bounce">ارتداد (Bounce)</SelectItem>
                    <SelectItem value="glow">توهج (Glow)</SelectItem>
                    <SelectItem value="none">بدون حركة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom Logo */}
            <div className="p-4 bg-gray-700/30 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-yellow-500/20 to-amber-500/20 rounded-lg flex items-center justify-center">
                    <Crown className="h-4 w-4 text-yellow-400" />
                  </div>
                  <Label className="text-base font-medium">شعار صفحة تسجيل الدخول</Label>
                </div>
                <Switch
                  checked={backgroundSettings.show_logo}
                  onCheckedChange={(checked) => 
                    setBackgroundSettings(prev => ({...prev, show_logo: checked}))
                  }
                />
              </div>
              
              {backgroundSettings.show_logo && (
                <div className="space-y-4">
                  {/* معاينة الشعار الحالي */}
                  {(backgroundSettings.logo_url || loginLogoPreview) && (
                    <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                      <div className="w-20 h-20 bg-gradient-to-br from-primary to-yellow-600 rounded-xl flex items-center justify-center">
                        <img 
                          src={loginLogoPreview || (backgroundSettings.logo_url?.startsWith('/api') 
                            ? `${API}${backgroundSettings.logo_url.replace('/api', '')}` 
                            : backgroundSettings.logo_url)}
                          alt="الشعار الحالي" 
                          className="w-14 h-14 object-contain"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-300">الشعار الحالي</p>
                        <p className="text-xs text-gray-500 truncate max-w-xs">
                          {backgroundSettings.logo_url || 'ملف محلي'}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={deleteLoginLogo}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {/* خيارات إضافة الشعار */}
                  <div className="flex gap-2 mb-3">
                    <Button
                      variant={loginLogoMode === 'upload' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setLoginLogoMode('upload')}
                      className={loginLogoMode === 'upload' ? 'bg-primary text-black' : 'border-gray-600'}
                    >
                      <Upload className="h-4 w-4 ml-2" />
                      رفع من الجهاز
                    </Button>
                    <Button
                      variant={loginLogoMode === 'url' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setLoginLogoMode('url')}
                      className={loginLogoMode === 'url' ? 'bg-primary text-black' : 'border-gray-600'}
                    >
                      <Globe className="h-4 w-4 ml-2" />
                      رابط خارجي
                    </Button>
                  </div>

                  {loginLogoMode === 'upload' ? (
                    <div className="space-y-3">
                      <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLoginLogoFileChange}
                          className="hidden"
                          id="login-logo-upload"
                        />
                        <label htmlFor="login-logo-upload" className="cursor-pointer">
                          <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                          <p className="text-sm text-gray-300">انقر لاختيار صورة الشعار</p>
                          <p className="text-xs text-gray-500 mt-1">PNG, JPG, SVG, WebP</p>
                        </label>
                      </div>
                      
                      {loginLogoPreview && (
                        <div className="flex items-center gap-3">
                          <img src={loginLogoPreview} alt="معاينة" className="w-16 h-16 object-contain rounded-lg bg-gray-700" />
                          <Button
                            onClick={() => uploadLoginLogo(loginLogoFile)}
                            disabled={loginLogoUploading}
                            className="bg-green-600 hover:bg-green-700 gap-2"
                          >
                            {loginLogoUploading ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                جاري الرفع...
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4" />
                                رفع الشعار
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Input
                      placeholder="رابط الشعار (PNG أو SVG)"
                      value={backgroundSettings.logo_url || ''}
                      onChange={(e) => 
                        setBackgroundSettings(prev => ({...prev, logo_url: e.target.value}))
                      }
                      className="bg-gray-700/50 border-gray-600"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Overlay Color */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-700/30 rounded-lg space-y-3">
                <Label>لون التعتيم</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value="#000000"
                    onChange={(e) => {
                      const hex = e.target.value;
                      setBackgroundSettings(prev => ({
                        ...prev, 
                        overlay_color: `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},0.5)`
                      }));
                    }}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <Input
                    value={backgroundSettings.overlay_color}
                    onChange={(e) => 
                      setBackgroundSettings(prev => ({...prev, overlay_color: e.target.value}))
                    }
                    className="bg-gray-700/50 border-gray-600 flex-1"
                    placeholder="rgba(0,0,0,0.5)"
                  />
                </div>
              </div>
              
              <div className="p-4 bg-gray-700/30 rounded-lg space-y-3">
                <Label>مدة الانتقال (ثواني)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="5"
                  value={backgroundSettings.transition_duration}
                  onChange={(e) => 
                    setBackgroundSettings(prev => ({...prev, transition_duration: parseFloat(e.target.value)}))
                  }
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
            </div>

            {/* Backgrounds Grid */}
            <div>
              <Label className="text-lg mb-4 block">الخلفيات ({backgroundSettings.backgrounds?.length || 0})</Label>
              
              {(!backgroundSettings.backgrounds || backgroundSettings.backgrounds.length === 0) ? (
                <div className="text-center py-12 bg-gray-700/20 rounded-lg border-2 border-dashed border-gray-600">
                  <Image className="h-12 w-12 mx-auto text-gray-500 mb-3" />
                  <p className="text-gray-400">لا توجد خلفيات</p>
                  <p className="text-sm text-gray-500 mt-1">أضف خلفيات لتظهر في صفحة تسجيل الدخول</p>
                  <Button 
                    onClick={() => setShowAddBackground(true)}
                    variant="outline" 
                    className="mt-4 border-gray-600"
                  >
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة خلفية
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {backgroundSettings.backgrounds.map((bg, index) => (
                    <div 
                      key={bg.id || index} 
                      className={`relative group rounded-lg overflow-hidden border-2 ${
                        bg.is_active ? 'border-green-500' : 'border-gray-600'
                      }`}
                    >
                      {/* Preview Image */}
                      <div className="aspect-video bg-gray-700 relative">
                        <img 
                          src={bg.image_url} 
                          alt={bg.title || `خلفية ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = 'https://via.placeholder.com/400x225?text=Image+Error';
                          }}
                        />
                        
                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleBackgroundActive(bg.id)}
                            className={bg.is_active ? 'text-green-400 hover:text-green-300' : 'text-gray-400 hover:text-white'}
                          >
                            {bg.is_active ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteBackground(bg.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </div>
                        
                        {/* Status Badge */}
                        <div className="absolute top-2 right-2">
                          <Badge className={bg.is_active ? 'bg-green-500/80' : 'bg-gray-500/80'}>
                            {bg.is_active ? 'مفعّل' : 'معطّل'}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Info */}
                      <div className="p-3 bg-gray-800">
                        <p className="font-medium text-sm truncate">{bg.title || `خلفية ${index + 1}`}</p>
                        <div className="flex items-center justify-between mt-2">
                          <Select
                            value={bg.animation_type}
                            onValueChange={(v) => updateBackgroundAnimation(bg.id, v)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-gray-700/50 border-gray-600 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700">
                              <SelectItem value="fade">تلاشي</SelectItem>
                              <SelectItem value="zoom">تكبير</SelectItem>
                              <SelectItem value="kenburns">Ken Burns</SelectItem>
                              <SelectItem value="slide">انزلاق</SelectItem>
                              <SelectItem value="parallax">Parallax</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-gray-500">#{index + 1}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Add Background Modal */}
      <Dialog open={showAddBackground} onOpenChange={setShowAddBackground}>
        <DialogContent className="max-w-md bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="h-5 w-5 text-pink-400" />
              إضافة خلفية جديدة
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Toggle between URL and Device upload */}
            <div className="flex gap-2 p-1 bg-gray-700/50 rounded-lg">
              <Button
                variant={backgroundUploadMode === 'url' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setBackgroundUploadMode('url')}
                className={`flex-1 ${backgroundUploadMode === 'url' ? 'bg-purple-600' : ''}`}
              >
                <Globe className="h-4 w-4 ml-2" />
                رابط URL
              </Button>
              <Button
                variant={backgroundUploadMode === 'device' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setBackgroundUploadMode('device')}
                className={`flex-1 ${backgroundUploadMode === 'device' ? 'bg-purple-600' : ''}`}
              >
                <Upload className="h-4 w-4 ml-2" />
                من الجهاز
              </Button>
            </div>

            {backgroundUploadMode === 'url' ? (
              <div className="space-y-2">
                <Label>رابط الصورة *</Label>
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={newBackgroundUrl}
                  onChange={(e) => setNewBackgroundUrl(e.target.value)}
                  className="bg-gray-700/50 border-gray-600"
                />
                <p className="text-xs text-gray-500">يفضل استخدام صور بدقة عالية (1920x1080 أو أعلى)</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>اختر صورة من الجهاز *</Label>
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-purple-500 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBackgroundFileChange}
                    className="hidden"
                    id="background-file-input"
                  />
                  <label htmlFor="background-file-input" className="cursor-pointer">
                    <Upload className="h-10 w-10 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-400">
                      {selectedBackgroundFile ? selectedBackgroundFile.name : 'اضغط لاختيار صورة أو اسحب وأفلت'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      الأنواع المدعومة: JPEG, PNG, GIF, WEBP, HEIC, BMP, TIFF
                    </p>
                  </label>
                </div>
                <p className="text-xs text-gray-500">سيتم تحويل الصورة تلقائياً للحجم والصيغة المناسبة</p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>عنوان الخلفية (اختياري)</Label>
              <Input
                placeholder="مثال: خلفية المطعم الرئيسية"
                value={newBackgroundTitle}
                onChange={(e) => setNewBackgroundTitle(e.target.value)}
                className="bg-gray-700/50 border-gray-600"
              />
            </div>
            
            <div className="space-y-2">
              <Label>نوع الحركة</Label>
              <Select
                value={newBackgroundAnimation}
                onValueChange={setNewBackgroundAnimation}
              >
                <SelectTrigger className="bg-gray-700/50 border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="fade">تلاشي (Fade)</SelectItem>
                  <SelectItem value="zoom">تكبير بطيء (Zoom)</SelectItem>
                  <SelectItem value="kenburns">Ken Burns Effect</SelectItem>
                  <SelectItem value="slide">انزلاق (Slide)</SelectItem>
                  <SelectItem value="parallax">Parallax</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preview */}
            {(newBackgroundUrl || backgroundPreviewUrl) && (
              <div className="space-y-2">
                <Label>معاينة</Label>
                <div className="aspect-video rounded-lg overflow-hidden bg-gray-700">
                  <img 
                    src={backgroundUploadMode === 'url' ? newBackgroundUrl : backgroundPreviewUrl} 
                    alt="معاينة"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/400x225?text=Invalid+URL';
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddBackground(false);
              setSelectedBackgroundFile(null);
              setBackgroundPreviewUrl('');
            }} className="border-gray-600">
              إلغاء
            </Button>
            <Button 
              onClick={() => {
                if (backgroundUploadMode === 'device' && selectedBackgroundFile) {
                  uploadBackgroundFromDevice(selectedBackgroundFile);
                } else {
                  addNewBackground();
                }
              }} 
              className="bg-purple-600 hover:bg-purple-700"
              disabled={backgroundsLoading || (backgroundUploadMode === 'url' && !newBackgroundUrl) || (backgroundUploadMode === 'device' && !selectedBackgroundFile)}
            >
              {backgroundsLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Plus className="h-4 w-4 ml-2" />
              )}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showNewTenant} onOpenChange={setShowNewTenant}>
        <DialogContent className="max-w-lg bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>إنشاء عميل جديد</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم المطعم/الكافيه</Label>
                <Input
                  value={newTenantForm.name}
                  onChange={(e) => setNewTenantForm({...newTenantForm, name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                  placeholder="مطعم البيت"
                />
              </div>
              <div className="space-y-2">
                <Label>الرابط المختصر (slug)</Label>
                <Input
                  value={newTenantForm.slug}
                  onChange={(e) => setNewTenantForm({...newTenantForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                  className="bg-gray-700/50 border-gray-600"
                  placeholder="al-bait"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم المالك</Label>
                <Input
                  value={newTenantForm.owner_name}
                  onChange={(e) => setNewTenantForm({...newTenantForm, owner_name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>هاتف المالك</Label>
                <Input
                  value={newTenantForm.owner_phone}
                  onChange={(e) => setNewTenantForm({...newTenantForm, owner_phone: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                  placeholder="+964 xxx"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>بريد المالك الإلكتروني</Label>
              <Input
                type="email"
                value={newTenantForm.owner_email}
                onChange={(e) => setNewTenantForm({...newTenantForm, owner_email: e.target.value})}
                className="bg-gray-700/50 border-gray-600"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>نوع الاشتراك</Label>
                <Select 
                  value={newTenantForm.subscription_type}
                  onValueChange={(v) => setNewTenantForm({...newTenantForm, subscription_type: v})}
                >
                  <SelectTrigger className="bg-gray-700/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="trial">تجريبي (14 يوم)</SelectItem>
                    <SelectItem value="basic">أساسي</SelectItem>
                    <SelectItem value="premium">مميز</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>أقصى عدد فروع</Label>
                <Input
                  type="number"
                  min="1"
                  value={newTenantForm.max_branches}
                  onChange={(e) => setNewTenantForm({...newTenantForm, max_branches: parseInt(e.target.value)})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>أقصى عدد مستخدمين</Label>
                <Input
                  type="number"
                  min="1"
                  value={newTenantForm.max_users}
                  onChange={(e) => setNewTenantForm({...newTenantForm, max_users: parseInt(e.target.value)})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTenant(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={createTenant} className="bg-purple-600 hover:bg-purple-700" disabled={loading}>
              {loading ? 'جاري الإنشاء...' : 'إنشاء العميل'}
            </Button>
          </DialogFooter>
          
          {/* Credentials Display */}
          {copiedCredentials && (
            <div className="mt-4 p-4 bg-green-500/20 rounded-lg border border-green-500/50">
              <h4 className="font-bold text-green-400 mb-2">بيانات الدخول للعميل:</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>البريد: {copiedCredentials.email}</span>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(copiedCredentials.email)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span>كلمة المرور: {copiedCredentials.password}</span>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(copiedCredentials.password)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Live View Modal */}
      <Dialog open={showLiveView} onOpenChange={setShowLiveView}>
        <DialogContent className="max-w-4xl bg-gray-800 border-gray-700 text-white max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-400 animate-pulse" />
              عرض مباشر: {selectedTenant?.name}
            </DialogTitle>
          </DialogHeader>
          
          {liveStats ? (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-4">
                {/* Today Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-green-500/10 rounded-lg text-center">
                    <p className="text-xs text-gray-400">مبيعات اليوم</p>
                    <p className="text-xl font-bold text-green-400">{formatPrice(liveStats.today?.total_sales || 0)}</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-lg text-center">
                    <p className="text-xs text-gray-400">طلبات اليوم</p>
                    <p className="text-xl font-bold text-blue-400">{liveStats.today?.total_orders || 0}</p>
                  </div>
                  <div className="p-3 bg-yellow-500/10 rounded-lg text-center">
                    <p className="text-xs text-gray-400">قيد الانتظار</p>
                    <p className="text-xl font-bold text-yellow-400">{liveStats.today?.pending_orders || 0}</p>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-lg text-center">
                    <p className="text-xs text-gray-400">ورديات نشطة</p>
                    <p className="text-xl font-bold text-purple-400">{liveStats.active_shifts || 0}</p>
                  </div>
                </div>

                {/* Order Status Breakdown */}
                <div className="p-4 bg-gray-700/30 rounded-lg">
                  <h4 className="font-bold mb-3 flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    حالة الطلبات
                  </h4>
                  <div className="grid grid-cols-5 gap-2 text-sm">
                    <div className="text-center p-2 bg-yellow-500/20 rounded">
                      <p className="text-yellow-400">{liveStats.today?.pending_orders || 0}</p>
                      <p className="text-xs text-gray-400">انتظار</p>
                    </div>
                    <div className="text-center p-2 bg-blue-500/20 rounded">
                      <p className="text-blue-400">{liveStats.today?.preparing_orders || 0}</p>
                      <p className="text-xs text-gray-400">تحضير</p>
                    </div>
                    <div className="text-center p-2 bg-green-500/20 rounded">
                      <p className="text-green-400">{liveStats.today?.delivered_orders || 0}</p>
                      <p className="text-xs text-gray-400">مسلّم</p>
                    </div>
                    <div className="text-center p-2 bg-red-500/20 rounded">
                      <p className="text-red-400">{liveStats.today?.cancelled_orders || 0}</p>
                      <p className="text-xs text-gray-400">ملغي</p>
                    </div>
                    <div className="text-center p-2 bg-gray-500/20 rounded">
                      <p>{liveStats.today?.total_orders || 0}</p>
                      <p className="text-xs text-gray-400">إجمالي</p>
                    </div>
                  </div>
                </div>

                {/* Top Products */}
                {liveStats.top_products?.length > 0 && (
                  <div className="p-4 bg-gray-700/30 rounded-lg">
                    <h4 className="font-bold mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      الأكثر مبيعاً اليوم
                    </h4>
                    <div className="space-y-2">
                      {liveStats.top_products.map((product, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-600/30 rounded">
                          <span>{product.name}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-400">{product.quantity} قطعة</span>
                            <span className="font-bold text-green-400">{formatPrice(product.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Orders */}
                {liveStats.recent_orders?.length > 0 && (
                  <div className="p-4 bg-gray-700/30 rounded-lg">
                    <h4 className="font-bold mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      آخر الطلبات
                    </h4>
                    <div className="space-y-2">
                      {liveStats.recent_orders.slice(0, 5).map((order, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-600/30 rounded">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm">#{order.order_number}</span>
                            <span className="text-sm text-gray-400">
                              {order.customer_name || 'زبون'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {getStatusBadge(order.status)}
                            <span className="font-bold">{formatPrice(order.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => impersonateTenant(selectedTenant)}
              className="border-blue-500 text-blue-400 hover:bg-blue-500/10 gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              الدخول للنظام
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tenant Details Modal */}
      <Dialog open={showTenantDetails} onOpenChange={setShowTenantDetails}>
        <DialogContent className="max-w-2xl bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>تفاصيل العميل: {selectedTenant?.name}</DialogTitle>
          </DialogHeader>
          
          {tenantDetails ? (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center p-3 bg-gray-700/30 rounded-lg">
                    <p className="text-2xl font-bold">{tenantDetails.stats.users_count}</p>
                    <p className="text-xs text-gray-400">مستخدمين</p>
                  </div>
                  <div className="text-center p-3 bg-gray-700/30 rounded-lg">
                    <p className="text-2xl font-bold">{tenantDetails.stats.branches_count}</p>
                    <p className="text-xs text-gray-400">فروع</p>
                  </div>
                  <div className="text-center p-3 bg-gray-700/30 rounded-lg">
                    <p className="text-2xl font-bold">{tenantDetails.stats.orders_today}</p>
                    <p className="text-xs text-gray-400">طلبات اليوم</p>
                  </div>
                  <div className="text-center p-3 bg-green-500/20 rounded-lg">
                    <p className="text-lg font-bold text-green-400">{formatPrice(tenantDetails.stats.total_sales)}</p>
                    <p className="text-xs text-gray-400">إجمالي المبيعات</p>
                  </div>
                </div>
                
                {/* Tenant Info */}
                <div className="p-4 bg-gray-700/30 rounded-lg space-y-2">
                  <h4 className="font-bold mb-3">معلومات العميل</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>الاسم: <strong>{tenantDetails.tenant.name}</strong></div>
                    <div>الرابط: <strong>/{tenantDetails.tenant.slug}</strong></div>
                    <div>المالك: <strong>{tenantDetails.tenant.owner_name}</strong></div>
                    <div>الهاتف: <strong>{tenantDetails.tenant.owner_phone}</strong></div>
                    <div>البريد: <strong>{tenantDetails.tenant.owner_email}</strong></div>
                    <div>الاشتراك: {getSubscriptionBadge(tenantDetails.tenant.subscription_type)}</div>
                    <div>تاريخ الإنشاء: <strong>{new Date(tenantDetails.tenant.created_at).toLocaleDateString('ar-IQ')}</strong></div>
                    <div>تاريخ الانتهاء: <strong>{new Date(tenantDetails.tenant.expires_at).toLocaleDateString('ar-IQ')}</strong></div>
                  </div>
                </div>
                
                {/* Users */}
                <div className="p-4 bg-gray-700/30 rounded-lg">
                  <h4 className="font-bold mb-3">المستخدمين</h4>
                  <div className="space-y-2">
                    {tenantDetails.users.map(user => (
                      <div key={user.id} className="flex items-center justify-between p-2 bg-gray-600/30 rounded">
                        <div>
                          <span className="font-medium">{user.full_name}</span>
                          <span className="text-xs text-gray-400 mr-2">({user.email})</span>
                        </div>
                        <Badge className="bg-blue-500/20 text-blue-400">{user.role}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Branches */}
                <div className="p-4 bg-gray-700/30 rounded-lg">
                  <h4 className="font-bold mb-3">الفروع</h4>
                  <div className="space-y-2">
                    {tenantDetails.branches.map(branch => (
                      <div key={branch.id} className="flex items-center justify-between p-2 bg-gray-600/30 rounded">
                        <span>{branch.name}</span>
                        <span className="text-sm text-gray-400">{branch.phone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent className="max-w-sm bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              إعادة تعيين كلمة مرور مدير: <strong>{selectedTenant?.name}</strong>
            </p>
            <div className="space-y-2">
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-gray-700/50 border-gray-600"
                placeholder="6 أحرف على الأقل"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPassword(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={resetPassword} className="bg-purple-600 hover:bg-purple-700">
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              تأكيد الحذف النهائي
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              هل أنت متأكد من حذف <strong className="text-white">{selectedTenant?.name}</strong> نهائياً؟
            </p>
            <p className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">
              ⚠️ سيتم حذف جميع البيانات المرتبطة: المستخدمين، الفروع، الطلبات، المنتجات، المخزون، والعملاء. هذا الإجراء لا يمكن التراجع عنه!
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={deleteTenant} className="bg-red-600 hover:bg-red-700">
              حذف نهائياً
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Sales Confirmation Modal */}
      <Dialog open={showResetSalesConfirm} onOpenChange={setShowResetSalesConfirm}>
        <DialogContent className="max-w-sm bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400">
              <RotateCcw className="h-5 w-5" />
              تصفير المبيعات
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              هل أنت متأكد من تصفير مبيعات <strong className="text-white">{selectedTenant?.name}</strong>؟
            </p>
            <p className="text-sm text-orange-400 bg-orange-500/10 p-3 rounded-lg">
              ⚠️ سيتم حذف جميع الطلبات والورديات وإعادة تعيين إحصائيات العملاء. هذا الإجراء لا يمكن التراجع عنه!
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetSalesConfirm(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={resetTenantSales} className="bg-orange-600 hover:bg-orange-700">
              تصفير المبيعات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Inventory Confirmation Modal */}
      <Dialog open={showResetInventoryConfirm} onOpenChange={setShowResetInventoryConfirm}>
        <DialogContent className="max-w-sm bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-400">
              <Package className="h-5 w-5" />
              تصفير المخزون والمشتريات
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              هل أنت متأكد من تصفير بيانات المخزون لـ <strong className="text-white">{selectedTenant?.name}</strong>؟
            </p>
            <div className="text-sm text-purple-400 bg-purple-500/10 p-3 rounded-lg space-y-2">
              <p className="font-bold">⚠️ سيتم حذف:</p>
              <ul className="list-disc list-inside text-xs space-y-1">
                <li>طلبات الفروع</li>
                <li>فواتير الشراء</li>
                <li>سجلات التصنيع</li>
                <li>كميات المواد الخام</li>
                <li>كميات المنتجات المصنعة</li>
                <li>مخزون الفروع</li>
              </ul>
              <p className="text-red-400 mt-2">هذا الإجراء لا يمكن التراجع عنه!</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetInventoryConfirm(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={resetTenantInventory} className="bg-purple-600 hover:bg-purple-700">
              تصفير المخزون
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Modal */}
      <Dialog open={showEditTenant} onOpenChange={setShowEditTenant}>
        <DialogContent className="max-w-2xl bg-gray-800 border-gray-700 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-yellow-400" />
              تعديل بيانات العميل
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* هوية المطعم - شعار واسم */}
            <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30 space-y-4">
              <h3 className="text-sm font-bold text-yellow-400 flex items-center gap-2">
                <Image className="h-4 w-4" />
                هوية المطعم (تظهر للعميل)
              </h3>
              
              {/* شعار المطعم */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <Label className="text-xs text-gray-400 block mb-2">شعار المطعم</Label>
                  <div className="w-24 h-24 bg-gray-700/50 rounded-xl border-2 border-dashed border-gray-600 flex items-center justify-center overflow-hidden">
                    {logoPreviewUrl ? (
                      <img 
                        src={logoPreviewUrl} 
                        alt="شعار" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Upload className="h-8 w-8 text-gray-500" />
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setLogoFile(file);
                        setLogoPreviewUrl(URL.createObjectURL(file));
                      }
                    }}
                    className="hidden"
                    id="logo-file-input"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('logo-file-input').click()}
                    className="border-gray-600 text-gray-300"
                  >
                    <Upload className="h-4 w-4 ml-2" />
                    رفع من الجهاز
                  </Button>
                  <p className="text-xs text-gray-500">PNG, JPG (أقصى 5MB)</p>
                </div>
              </div>

              {/* اسم المطعم بالعربي والإنجليزي */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>اسم المطعم (عربي)</Label>
                  <Input
                    placeholder="مثال: مطعم الشرق"
                    value={editTenantForm.name_ar}
                    onChange={(e) => setEditTenantForm({...editTenantForm, name_ar: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>اسم المطعم (إنجليزي)</Label>
                  <Input
                    placeholder="e.g. Al Sharq Restaurant"
                    value={editTenantForm.name_en}
                    onChange={(e) => setEditTenantForm({...editTenantForm, name_en: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* بيانات المالك والاشتراك */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم المطعم/الكافيه (للنظام)</Label>
                <Input
                  value={editTenantForm.name}
                  onChange={(e) => setEditTenantForm({...editTenantForm, name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>اسم المالك</Label>
                <Input
                  value={editTenantForm.owner_name}
                  onChange={(e) => setEditTenantForm({...editTenantForm, owner_name: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={editTenantForm.owner_email}
                  onChange={(e) => setEditTenantForm({...editTenantForm, owner_email: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>الهاتف</Label>
                <Input
                  value={editTenantForm.owner_phone}
                  onChange={(e) => setEditTenantForm({...editTenantForm, owner_phone: e.target.value})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>نوع الاشتراك</Label>
                <Select 
                  value={editTenantForm.subscription_type}
                  onValueChange={(v) => setEditTenantForm({...editTenantForm, subscription_type: v})}
                >
                  <SelectTrigger className="bg-gray-700/50 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="trial">تجريبي</SelectItem>
                    <SelectItem value="basic">أساسي</SelectItem>
                    <SelectItem value="premium">مميز</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>أقصى عدد فروع</Label>
                <Input
                  type="number"
                  min="1"
                  value={editTenantForm.max_branches}
                  onChange={(e) => setEditTenantForm({...editTenantForm, max_branches: parseInt(e.target.value)})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label>أقصى عدد مستخدمين</Label>
                <Input
                  type="number"
                  min="1"
                  value={editTenantForm.max_users}
                  onChange={(e) => setEditTenantForm({...editTenantForm, max_users: parseInt(e.target.value)})}
                  className="bg-gray-700/50 border-gray-600"
                />
              </div>
            </div>

            {/* Email Section */}
            <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={editTenantForm.send_welcome_email}
                  onChange={(e) => setEditTenantForm({...editTenantForm, send_welcome_email: e.target.checked})}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500"
                />
                <Label htmlFor="sendEmail" className="flex items-center gap-2 cursor-pointer">
                  <Mail className="h-4 w-4 text-blue-400" />
                  إرسال بريد ترحيبي للعميل
                </Label>
              </div>
              
              {editTenantForm.send_welcome_email && (
                <div className="space-y-2 pt-2">
                  <Label className="text-sm text-gray-400">كلمة مرور مؤقتة (اختياري)</Label>
                  <Input
                    type="text"
                    value={editTenantForm.temp_password}
                    onChange={(e) => setEditTenantForm({...editTenantForm, temp_password: e.target.value})}
                    className="bg-gray-700/50 border-gray-600"
                    placeholder="اتركها فارغة لاستخدام كلمة المرور الافتراضية"
                  />
                  <p className="text-xs text-gray-500">
                    سيتم إرسال رسالة تحتوي على: الرابط، اسم المستخدم، كلمة المرور، وشرح طريقة الدخول
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditTenant(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button onClick={updateTenant} className="bg-yellow-600 hover:bg-yellow-700" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tenant Features Modal */}
      <Dialog open={showFeaturesModal} onOpenChange={setShowFeaturesModal}>
        <DialogContent className="max-w-3xl bg-gray-800 border-gray-700 text-white max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-400" />
              صلاحيات الميزات - {selectedTenant?.name}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[65vh]">
            <div className="space-y-6 p-1">
              {/* Quick Actions */}
              <div className="flex gap-3">
                <Button 
                  onClick={enableAllFeatures}
                  className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                >
                  <Check className="h-4 w-4" />
                  تفعيل الكل
                </Button>
                <Button 
                  onClick={disableAllFeatures}
                  variant="outline"
                  className="flex-1 border-gray-600 gap-2"
                >
                  <X className="h-4 w-4" />
                  تعطيل الكل
                </Button>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* الميزات الأساسية */}
                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-gray-400 mb-2">الميزات الأساسية</h4>
                  
                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">💳</span>
                      <span>نقاط البيع</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showPOS}
                      onCheckedChange={() => toggleFeature('showPOS')}
                      disabled={true}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">🪑</span>
                      <span>الطاولات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showTables}
                      onCheckedChange={() => toggleFeature('showTables')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">📋</span>
                      <span>الطلبات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showOrders}
                      onCheckedChange={() => toggleFeature('showOrders')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">📊</span>
                      <span>التقارير</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showReports}
                      onCheckedChange={() => toggleFeature('showReports')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">💸</span>
                      <span>المصاريف</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showExpenses}
                      onCheckedChange={() => toggleFeature('showExpenses')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">📦</span>
                      <span>المخزون</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showInventory}
                      onCheckedChange={() => toggleFeature('showInventory')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">🚚</span>
                      <span>التوصيل</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showDelivery}
                      onCheckedChange={() => toggleFeature('showDelivery')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">👨‍🍳</span>
                      <span>شاشة المطبخ</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showKitchen}
                      onCheckedChange={() => toggleFeature('showKitchen')}
                    />
                  </label>
                </div>

                {/* الميزات المتقدمة */}
                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-gray-400 mb-2">الميزات المتقدمة</h4>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">👥</span>
                      <span>الموارد البشرية</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showHR}
                      onCheckedChange={() => toggleFeature('showHR')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">🔄</span>
                      <span>التحويلات (المخازن)</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showWarehouse}
                      onCheckedChange={() => toggleFeature('showWarehouse')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">📞</span>
                      <span>الكول سنتر</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showCallCenter}
                      onCheckedChange={() => toggleFeature('showCallCenter')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">📝</span>
                      <span>سجل المكالمات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showCallLogs}
                      onCheckedChange={() => toggleFeature('showCallLogs')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-pink-500/20 rounded-lg flex items-center justify-center">🎁</span>
                      <span>برنامج الولاء</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showLoyalty}
                      onCheckedChange={() => toggleFeature('showLoyalty')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-violet-500/20 rounded-lg flex items-center justify-center">🏷️</span>
                      <span>الكوبونات والعروض</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showCoupons}
                      onCheckedChange={() => toggleFeature('showCoupons')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-teal-500/20 rounded-lg flex items-center justify-center">📒</span>
                      <span>الوصفات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showRecipes}
                      onCheckedChange={() => toggleFeature('showRecipes')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-rose-500/20 rounded-lg flex items-center justify-center">📅</span>
                      <span>حجوزات الطاولات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showReservations}
                      onCheckedChange={() => toggleFeature('showReservations')}
                    />
                  </label>
                </div>
              </div>

              {/* الميزات الإضافية */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-gray-400 mb-2">ميزات إضافية</h4>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">⭐</span>
                      <span>تقييمات العملاء</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showReviews}
                      onCheckedChange={() => toggleFeature('showReviews')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">📈</span>
                      <span>التقارير الذكية</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showSmartReports}
                      onCheckedChange={() => toggleFeature('showSmartReports')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">🛒</span>
                      <span>المشتريات والموردين</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showPurchasing}
                      onCheckedChange={() => toggleFeature('showPurchasing')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-lime-500/20 rounded-lg flex items-center justify-center">🏪</span>
                      <span>طلبات الفروع</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showBranchOrders}
                      onCheckedChange={() => toggleFeature('showBranchOrders')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-gray-500/20 rounded-lg flex items-center justify-center">⚙️</span>
                      <span>الإعدادات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.showSettings}
                      onCheckedChange={() => toggleFeature('showSettings')}
                      disabled={true}
                    />
                  </label>
                </div>
              </div>

              {/* خيارات الإعدادات */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-gray-400 mb-2">خيارات الإعدادات (تحكم في ما يظهر داخل الإعدادات)</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">👤</span>
                      <span>المستخدمين</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.settingsUsers}
                      onCheckedChange={() => toggleFeature('settingsUsers')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">👥</span>
                      <span>العملاء</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.settingsCustomers}
                      onCheckedChange={() => toggleFeature('settingsCustomers')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">🏢</span>
                      <span>الفروع</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.settingsBranches}
                      onCheckedChange={() => toggleFeature('settingsBranches')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">📂</span>
                      <span>الفئات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.settingsCategories}
                      onCheckedChange={() => toggleFeature('settingsCategories')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">📦</span>
                      <span>المنتجات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.settingsProducts}
                      onCheckedChange={() => toggleFeature('settingsProducts')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-gray-600/20 rounded-lg flex items-center justify-center">🖨️</span>
                      <span>الطابعات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.settingsPrinters}
                      onCheckedChange={() => toggleFeature('settingsPrinters')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">🚚</span>
                      <span>شركات التوصيل</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.settingsDeliveryCompanies}
                      onCheckedChange={() => toggleFeature('settingsDeliveryCompanies')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">📞</span>
                      <span>الكول سنتر</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.settingsCallCenter}
                      onCheckedChange={() => toggleFeature('settingsCallCenter')}
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700">
                    <span className="flex items-center gap-2">
                      <span className="w-8 h-8 bg-pink-500/20 rounded-lg flex items-center justify-center">🔔</span>
                      <span>الإشعارات</span>
                    </span>
                    <Switch
                      checked={tenantFeatures.settingsNotifications}
                      onCheckedChange={() => toggleFeature('settingsNotifications')}
                    />
                  </label>
                </div>
              </div>

              {/* Info Note */}
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                <p className="text-sm text-blue-300">
                  💡 الميزات المعطلة لن تظهر في لوحة تحكم العميل. نقاط البيع والإعدادات دائماً مفعّلة.
                </p>
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFeaturesModal(false)} className="border-gray-600">
              إلغاء
            </Button>
            <Button 
              onClick={saveTenantFeatures} 
              className="bg-purple-600 hover:bg-purple-700"
              disabled={featuresLoading}
            >
              {featuresLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Check className="h-4 w-4 ml-2" />
              )}
              حفظ الصلاحيات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
