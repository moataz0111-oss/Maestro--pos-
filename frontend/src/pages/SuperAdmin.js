import React, { useState, useEffect } from 'react';
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
import {
  Building2,
  Users,
  ShoppingCart,
  DollarSign,
  Plus,
  Search,
  Eye,
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
  Layers
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  
  const [newPassword, setNewPassword] = useState('');
  const [copiedCredentials, setCopiedCredentials] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

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
      const res = await axios.post(`${API}/super-admin/login`, null, {
        params: {
          email: loginForm.email,
          password: loginForm.password,
          secret_key: loginForm.secret_key
        }
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
      const res = await axios.post(`${API}/super-admin/register`, null, {
        params: {
          email: registerForm.email,
          password: registerForm.password,
          full_name: registerForm.full_name,
          secret_key: registerForm.secret_key
        }
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
      await axios.delete(`${API}/super-admin/tenants/${selectedTenant.id}/permanent?confirm=true`);
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('تم النسخ');
  };

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.owner_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.slug.toLowerCase().includes(searchQuery.toLowerCase())
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
            <CardTitle className="text-lg">العملاء</CardTitle>
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
            <div className="space-y-3">
              {filteredTenants.length === 0 ? (
                <p className="text-center text-gray-400 py-8">لا يوجد عملاء</p>
              ) : (
                filteredTenants.map((tenant) => (
                  <div 
                    key={tenant.id} 
                    className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${tenant.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <h3 className="font-bold">{tenant.name}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {tenant.owner_email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            /{tenant.slug}
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
                          onClick={() => openLiveView(tenant)}
                          className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                          title="عرض مباشر"
                        >
                          <Activity className="h-4 w-4" />
                        </Button>
                        
                        {/* الدخول كعميل */}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => impersonateTenant(tenant)}
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                          title="الدخول كعميل"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        
                        {/* التفاصيل */}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => viewTenantDetails(tenant)}
                          className="text-gray-400 hover:text-white"
                          title="التفاصيل"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        
                        {/* إعادة تعيين كلمة المرور */}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            setSelectedTenant(tenant);
                            setShowResetPassword(true);
                          }}
                          className="text-gray-400 hover:text-white"
                          title="إعادة تعيين كلمة المرور"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        
                        {/* تفعيل/تعطيل */}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => toggleTenantStatus(tenant)}
                          className={tenant.is_active ? 'text-green-400 hover:text-red-400' : 'text-red-400 hover:text-green-400'}
                          title={tenant.is_active ? 'تعطيل' : 'تفعيل'}
                        >
                          {tenant.is_active ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                        </Button>
                        
                        {/* حذف */}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            setSelectedTenant(tenant);
                            setShowDeleteConfirm(true);
                          }}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          title="حذف نهائي"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* New Tenant Modal */}
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
    </div>
  );
}
