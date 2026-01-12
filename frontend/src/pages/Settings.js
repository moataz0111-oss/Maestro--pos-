import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import {
  ArrowRight,
  Settings as SettingsIcon,
  Users,
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
  X
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// قائمة الصلاحيات المتاحة
const AVAILABLE_PERMISSIONS = [
  { id: 'pos', name: 'نقاط البيع', description: 'إنشاء وإدارة الطلبات' },
  { id: 'orders', name: 'الطلبات', description: 'عرض وتعديل الطلبات' },
  { id: 'tables', name: 'الطاولات', description: 'إدارة الطاولات' },
  { id: 'inventory', name: 'المخزون', description: 'إدارة المخزون' },
  { id: 'reports', name: 'التقارير', description: 'عرض التقارير' },
  { id: 'expenses', name: 'المصاريف', description: 'إدارة المصاريف' },
  { id: 'delivery', name: 'التوصيل', description: 'إدارة التوصيل' },
  { id: 'products', name: 'المنتجات', description: 'إضافة وتعديل المنتجات' },
  { id: 'categories', name: 'الفئات', description: 'إدارة الفئات' },
  { id: 'users', name: 'المستخدمين', description: 'إدارة المستخدمين' },
  { id: 'settings', name: 'الإعدادات', description: 'الوصول للإعدادات' },
];

export default function Settings() {
  const { user, hasRole, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [emailRecipients, setEmailRecipients] = useState([]);
  const [deliveryApps, setDeliveryApps] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editProductDialogOpen, setEditProductDialogOpen] = useState(false);
  
  // Form data
  const [userForm, setUserForm] = useState({
    username: '', email: '', password: '', full_name: '', role: 'cashier', branch_id: '', permissions: []
  });
  const [editUserForm, setEditUserForm] = useState(null);
  const [branchForm, setBranchForm] = useState({
    name: '', address: '', phone: '', email: ''
  });
  const [printerForm, setPrinterForm] = useState({
    name: '', ip_address: '', port: 9100, branch_id: '', printer_type: 'receipt'
  });
  const [categoryForm, setCategoryForm] = useState({
    name: '', name_en: '', icon: '', color: '#D4AF37', sort_order: 0
  });
  const [productForm, setProductForm] = useState({
    name: '', name_en: '', category_id: '', price: '', cost: '', operating_cost: '', image: '', description: '', barcode: ''
  });
  const [editProductForm, setEditProductForm] = useState(null);

  useEffect(() => {
    if (hasRole(['admin', 'manager'])) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, branchesRes, printersRes, settingsRes, appsRes, categoriesRes, productsRes] = await Promise.all([
        axios.get(`${API}/users`),
        axios.get(`${API}/branches`),
        axios.get(`${API}/printers`),
        axios.get(`${API}/settings`),
        axios.get(`${API}/delivery-apps`),
        axios.get(`${API}/categories`),
        axios.get(`${API}/products`)
      ]);

      setUsers(usersRes.data);
      setBranches(branchesRes.data);
      setPrinters(printersRes.data);
      setEmailRecipients(settingsRes.data.email_recipients?.emails || []);
      setDeliveryApps(appsRes.data);
      setCategories(categoriesRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/auth/register`, userForm);
      toast.success('تم إنشاء المستخدم');
      setUserDialogOpen(false);
      setUserForm({ username: '', email: '', password: '', full_name: '', role: 'cashier', branch_id: '', permissions: [] });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء المستخدم');
    }
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/branches`, branchForm);
      toast.success('تم إنشاء الفرع');
      setBranchDialogOpen(false);
      setBranchForm({ name: '', address: '', phone: '', email: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء الفرع');
    }
  };

  const handleCreatePrinter = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/printers`, printerForm);
      toast.success('تم إضافة الطابعة');
      setPrinterDialogOpen(false);
      setPrinterForm({ name: '', ip_address: '', port: 9100, branch_id: '', printer_type: 'receipt' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الطابعة');
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }
    try {
      const updated = [...emailRecipients, newEmail];
      await axios.post(`${API}/settings/email-recipients`, updated);
      setEmailRecipients(updated);
      setNewEmail('');
      toast.success('تم إضافة البريد');
    } catch (error) {
      toast.error('فشل في إضافة البريد');
    }
  };

  const handleRemoveEmail = async (email) => {
    try {
      const updated = emailRecipients.filter(e => e !== email);
      await axios.post(`${API}/settings/email-recipients`, updated);
      setEmailRecipients(updated);
      toast.success('تم حذف البريد');
    } catch (error) {
      toast.error('فشل في حذف البريد');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
    try {
      await axios.delete(`${API}/users/${userId}`);
      toast.success('تم حذف المستخدم');
      fetchData();
    } catch (error) {
      toast.error('فشل في حذف المستخدم');
    }
  };

  const handleEditUser = (u) => {
    setEditUserForm({
      id: u.id,
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
      await axios.put(`${API}/users/${editUserForm.id}`, {
        full_name: editUserForm.full_name,
        role: editUserForm.role,
        branch_id: editUserForm.branch_id || null,
        permissions: editUserForm.permissions,
        is_active: editUserForm.is_active
      });
      toast.success('تم تحديث المستخدم');
      setEditUserDialogOpen(false);
      setEditUserForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث المستخدم');
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
      toast.success('تم إنشاء الفئة');
      setCategoryDialogOpen(false);
      setCategoryForm({ name: '', name_en: '', icon: '', color: '#D4AF37', sort_order: 0 });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء الفئة');
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('هل أنت متأكد من حذف هذه الفئة؟')) return;
    try {
      await axios.delete(`${API}/categories/${categoryId}`);
      toast.success('تم حذف الفئة');
      fetchData();
    } catch (error) {
      toast.error('فشل في حذف الفئة');
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
        operating_cost: parseFloat(productForm.operating_cost) || 0
      });
      toast.success('تم إنشاء المنتج');
      setProductDialogOpen(false);
      setProductForm({ name: '', name_en: '', category_id: '', price: '', cost: '', operating_cost: '', image: '', description: '', barcode: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء المنتج');
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
      image: p.image || '',
      description: p.description || '',
      barcode: p.barcode || '',
      is_available: p.is_available !== false
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
        operating_cost: parseFloat(editProductForm.operating_cost) || 0
      });
      toast.success('تم تحديث المنتج');
      setEditProductDialogOpen(false);
      setEditProductForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث المنتج');
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    try {
      await axios.delete(`${API}/products/${productId}`);
      toast.success('تم حذف المنتج');
      fetchData();
    } catch (error) {
      toast.error('فشل في حذف المنتج');
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
      toast.success('تم تحديث نسبة العمولة');
      fetchData();
    } catch (error) {
      toast.error('فشل في التحديث');
    }
  };

  const getRoleText = (role) => {
    const roles = {
      admin: 'مدير النظام',
      manager: 'مدير',
      supervisor: 'مشرف',
      cashier: 'كاشير'
    };
    return roles[role] || role;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحميل...</p>
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
              <h1 className="text-xl font-bold font-cairo text-foreground">الإعدادات</h1>
              <p className="text-sm text-muted-foreground">إدارة النظام والمستخدمين</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <Tabs defaultValue="appearance" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
            <TabsTrigger value="appearance">المظهر</TabsTrigger>
            {hasRole(['admin', 'manager']) && <TabsTrigger value="users">المستخدمين</TabsTrigger>}
            {hasRole(['admin']) && <TabsTrigger value="branches">الفروع</TabsTrigger>}
            {hasRole(['admin', 'manager']) && <TabsTrigger value="categories">الفئات</TabsTrigger>}
            {hasRole(['admin', 'manager']) && <TabsTrigger value="products">المنتجات</TabsTrigger>}
            {hasRole(['admin', 'manager']) && <TabsTrigger value="printers">الطابعات</TabsTrigger>}
            {hasRole(['admin']) && <TabsTrigger value="delivery">شركات التوصيل</TabsTrigger>}
            {hasRole(['admin']) && <TabsTrigger value="notifications">الإشعارات</TabsTrigger>}
          </TabsList>

          {/* Appearance */}
          <TabsContent value="appearance">
            <Card className="border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Sun className="h-5 w-5" />
                  المظهر والسمة
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-foreground mb-3 block">وضع العرض</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'light', label: 'فاتح', icon: Sun },
                      { value: 'dark', label: 'داكن', icon: Moon },
                      { value: 'system', label: 'تلقائي', icon: Monitor },
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
                    الوضع التلقائي يتبدل بين الفاتح (6 صباحاً - 6 مساءً) والداكن
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users */}
          {hasRole(['admin', 'manager']) && (
            <TabsContent value="users">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Users className="h-5 w-5" />
                    إدارة المستخدمين
                  </CardTitle>
                  <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة مستخدم
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-foreground">إضافة مستخدم جديد</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateUser} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">اسم المستخدم</Label>
                            <Input
                              value={userForm.username}
                              onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">الاسم الكامل</Label>
                            <Input
                              value={userForm.full_name}
                              onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                              required
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-foreground">البريد الإلكتروني</Label>
                          <Input
                            type="email"
                            value={userForm.email}
                            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">كلمة المرور</Label>
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
                            <Label className="text-foreground">الصلاحية</Label>
                            <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">مدير النظام</SelectItem>
                                <SelectItem value="manager">مدير</SelectItem>
                                <SelectItem value="supervisor">مشرف</SelectItem>
                                <SelectItem value="cashier">كاشير</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-foreground">الفرع</Label>
                            <Select value={userForm.branch_id} onValueChange={(v) => setUserForm({ ...userForm, branch_id: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="اختر فرع" />
                              </SelectTrigger>
                              <SelectContent>
                                {branches.map(branch => (
                                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setUserDialogOpen(false)} className="flex-1">
                            إلغاء
                          </Button>
                          <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                            إنشاء
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {users.map(u => (
                      <div key={u.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="font-bold text-primary">{u.full_name[0]}</span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{u.full_name}</p>
                            <p className="text-sm text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            u.role === 'admin' ? 'bg-primary/10 text-primary' :
                            u.role === 'manager' ? 'bg-blue-500/10 text-blue-500' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {getRoleText(u.role)}
                          </span>
                          {u.id !== user.id && hasRole(['admin']) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteUser(u.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Branches */}
          {hasRole(['admin']) && (
            <TabsContent value="branches">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Store className="h-5 w-5" />
                    إدارة الفروع
                  </CardTitle>
                  <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة فرع
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-foreground">إضافة فرع جديد</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateBranch} className="space-y-4">
                        <div>
                          <Label className="text-foreground">اسم الفرع</Label>
                          <Input
                            value={branchForm.name}
                            onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">العنوان</Label>
                          <Input
                            value={branchForm.address}
                            onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">الهاتف</Label>
                            <Input
                              value={branchForm.phone}
                              onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">البريد الإلكتروني</Label>
                            <Input
                              type="email"
                              value={branchForm.email}
                              onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setBranchDialogOpen(false)} className="flex-1">
                            إلغاء
                          </Button>
                          <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                            إنشاء
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {branches.map(branch => (
                      <div key={branch.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                        <div>
                          <p className="font-medium text-foreground">{branch.name}</p>
                          <p className="text-sm text-muted-foreground">{branch.address}</p>
                          <p className="text-sm text-muted-foreground">{branch.phone}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          branch.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {branch.is_active ? 'نشط' : 'معطل'}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Printers */}
          {hasRole(['admin', 'manager']) && (
            <TabsContent value="printers">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Printer className="h-5 w-5" />
                    إدارة الطابعات
                  </CardTitle>
                  <Dialog open={printerDialogOpen} onOpenChange={setPrinterDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة طابعة
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-foreground">إضافة طابعة جديدة</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreatePrinter} className="space-y-4">
                        <div>
                          <Label className="text-foreground">اسم الطابعة</Label>
                          <Input
                            value={printerForm.name}
                            onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">عنوان IP</Label>
                            <Input
                              value={printerForm.ip_address}
                              onChange={(e) => setPrinterForm({ ...printerForm, ip_address: e.target.value })}
                              placeholder="192.168.1.100"
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">المنفذ</Label>
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
                            <Label className="text-foreground">الفرع</Label>
                            <Select value={printerForm.branch_id} onValueChange={(v) => setPrinterForm({ ...printerForm, branch_id: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="اختر فرع" />
                              </SelectTrigger>
                              <SelectContent>
                                {branches.map(branch => (
                                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-foreground">النوع</Label>
                            <Select value={printerForm.printer_type} onValueChange={(v) => setPrinterForm({ ...printerForm, printer_type: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="receipt">إيصالات</SelectItem>
                                <SelectItem value="kitchen">مطبخ</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setPrinterDialogOpen(false)} className="flex-1">
                            إلغاء
                          </Button>
                          <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                            إضافة
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {printers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد طابعات مضافة</p>
                  ) : (
                    <div className="space-y-3">
                      {printers.map(printer => (
                        <div key={printer.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-4">
                            <Printer className="h-8 w-8 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-foreground">{printer.name}</p>
                              <p className="text-sm text-muted-foreground">{printer.ip_address}:{printer.port}</p>
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            printer.printer_type === 'receipt' ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500'
                          }`}>
                            {printer.printer_type === 'receipt' ? 'إيصالات' : 'مطبخ'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Delivery Apps */}
          {hasRole(['admin']) && (
            <TabsContent value="delivery">
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Truck className="h-5 w-5" />
                    إعدادات شركات التوصيل
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    تحكم في نسب الاستقطاع لكل شركة توصيل
                  </p>
                  <div className="space-y-4">
                    {deliveryApps.map(app => (
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
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            app.is_active !== false ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {app.is_active !== false ? 'مفعل' : 'معطل'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Label className="text-sm text-muted-foreground whitespace-nowrap">نسبة العمولة:</Label>
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
                          <p className="text-sm text-muted-foreground">
                            (حالياً: {app.commission_rate || 0}%)
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Notifications */}
          {hasRole(['admin']) && (
            <TabsContent value="notifications">
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Mail className="h-5 w-5" />
                    إشعارات البريد الإلكتروني
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    يتم إرسال تقارير إغلاق الصندوق تلقائياً لهذه العناوين
                  </p>
                  
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="أدخل بريد إلكتروني"
                      className="flex-1"
                    />
                    <Button onClick={handleAddEmail} className="bg-primary text-primary-foreground">
                      <Plus className="h-4 w-4 ml-2" />
                      إضافة
                    </Button>
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
                      <p className="text-center text-muted-foreground py-4">لم يتم إضافة عناوين بريد</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
