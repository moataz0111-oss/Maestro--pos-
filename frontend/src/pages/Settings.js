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
  Key
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

// قائمة الصلاحيات المتاحة - موسعة
const AVAILABLE_PERMISSIONS = [
  { id: 'pos', name: 'نقاط البيع', description: 'إنشاء وإدارة الطلبات', group: 'المبيعات' },
  { id: 'pos_discount', name: 'إعطاء خصومات', description: 'السماح بإعطاء خصومات على الطلبات', group: 'المبيعات' },
  { id: 'pos_cancel', name: 'إلغاء الطلبات', description: 'إلغاء الطلبات المعلقة', group: 'المبيعات' },
  { id: 'orders', name: 'الطلبات', description: 'عرض وتعديل الطلبات', group: 'المبيعات' },
  { id: 'orders_edit', name: 'تعديل الطلبات', description: 'تعديل الطلبات بعد الإنشاء', group: 'المبيعات' },
  { id: 'tables', name: 'الطاولات', description: 'إدارة الطاولات', group: 'المبيعات' },
  { id: 'kitchen', name: 'شاشة المطبخ', description: 'عرض وإدارة طلبات المطبخ', group: 'المطبخ' },
  { id: 'inventory', name: 'المخزون', description: 'عرض المخزون', group: 'المخزون' },
  { id: 'inventory_edit', name: 'تعديل المخزون', description: 'إضافة وتعديل المخزون', group: 'المخزون' },
  { id: 'inventory_transfer', name: 'نقل المخزون', description: 'نقل بين الفروع', group: 'المخزون' },
  { id: 'reports', name: 'التقارير', description: 'عرض التقارير الأساسية', group: 'التقارير' },
  { id: 'reports_financial', name: 'التقارير المالية', description: 'عرض التقارير المالية التفصيلية', group: 'التقارير' },
  { id: 'reports_export', name: 'تصدير التقارير', description: 'تصدير التقارير', group: 'التقارير' },
  { id: 'expenses', name: 'المصاريف', description: 'عرض المصاريف', group: 'المالية' },
  { id: 'expenses_add', name: 'إضافة مصاريف', description: 'إضافة مصاريف جديدة', group: 'المالية' },
  { id: 'purchases', name: 'المشتريات', description: 'إدارة المشتريات', group: 'المالية' },
  { id: 'delivery', name: 'التوصيل', description: 'إدارة التوصيل', group: 'التوصيل' },
  { id: 'drivers', name: 'السائقين', description: 'إدارة السائقين', group: 'التوصيل' },
  { id: 'products', name: 'المنتجات', description: 'عرض المنتجات', group: 'الإعدادات' },
  { id: 'products_edit', name: 'تعديل المنتجات', description: 'إضافة وتعديل المنتجات', group: 'الإعدادات' },
  { id: 'products_prices', name: 'تعديل الأسعار', description: 'تعديل أسعار المنتجات', group: 'الإعدادات' },
  { id: 'categories', name: 'الفئات', description: 'إدارة الفئات', group: 'الإعدادات' },
  { id: 'users', name: 'المستخدمين', description: 'إدارة المستخدمين', group: 'الإدارة' },
  { id: 'branches', name: 'الفروع', description: 'إدارة الفروع', group: 'الإدارة' },
  { id: 'settings', name: 'الإعدادات', description: 'الوصول للإعدادات', group: 'الإدارة' },
  { id: 'shifts', name: 'الورديات', description: 'إدارة الورديات', group: 'الإدارة' },
  { id: 'shifts_close', name: 'إغلاق الصندوق', description: 'إغلاق صندوق الوردية', group: 'الإدارة' },
];

// تجميع الصلاحيات حسب المجموعة
const PERMISSION_GROUPS = [...new Set(AVAILABLE_PERMISSIONS.map(p => p.group))];

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
  const [kitchenSections, setKitchenSections] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  
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
    name: '', ip_address: '', port: 9100, branch_id: '', printer_type: 'receipt'
  });
  const [categoryForm, setCategoryForm] = useState({
    name: '', name_en: '', icon: '', image: '', color: '#D4AF37', sort_order: 0, kitchen_section_id: ''
  });
  const [editCategoryForm, setEditCategoryForm] = useState(null);
  const [editCategoryDialogOpen, setEditCategoryDialogOpen] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '', name_en: '', category_id: '', price: '', cost: '', operating_cost: '', image: '', description: '', barcode: ''
  });
  const [editProductForm, setEditProductForm] = useState(null);
  const [kitchenSectionForm, setKitchenSectionForm] = useState({
    name: '', name_en: '', color: '#D4AF37', icon: '🍳', printer_id: '', branch_id: '', sort_order: 0
  });
  const [editKitchenSectionForm, setEditKitchenSectionForm] = useState(null);
  const [customerForm, setCustomerForm] = useState({
    name: '', phone: '', phone2: '', address: '', area: '', notes: '', is_blocked: false
  });
  const [editCustomerForm, setEditCustomerForm] = useState(null);
  const [dashboardSettings, setDashboardSettings] = useState({
    showPOS: true,
    showTables: true,
    showOrders: true,
    showExpenses: true,
    showInventory: true,
    showDelivery: true,
    showReports: true,
    showSettings: true
  });

  useEffect(() => {
    if (hasRole(['admin', 'manager'])) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, branchesRes, printersRes, settingsRes, appsRes, categoriesRes, productsRes, sectionsRes, customersRes] = await Promise.all([
        axios.get(`${API}/users`),
        axios.get(`${API}/branches`),
        axios.get(`${API}/printers`),
        axios.get(`${API}/settings`),
        axios.get(`${API}/delivery-apps`),
        axios.get(`${API}/categories`),
        axios.get(`${API}/products`),
        axios.get(`${API}/kitchen-sections`),
        axios.get(`${API}/customers`)
      ]);

      setUsers(usersRes.data);
      setBranches(branchesRes.data);
      setPrinters(printersRes.data);
      setEmailRecipients(settingsRes.data.email_recipients?.emails || []);
      setDeliveryApps(appsRes.data);
      setCategories(categoriesRes.data);
      setProducts(productsRes.data);
      setKitchenSections(sectionsRes.data);
      setCustomers(customersRes.data);
      
      // تعيين الفرع الافتراضي لنموذج المستخدم الجديد
      if (branchesRes.data.length > 0) {
        setUserForm(prev => ({...prev, branch_id: prev.branch_id || branchesRes.data[0].id}));
      }
      
      // جلب إعدادات الصفحة الرئيسية
      if (settingsRes.data.dashboard_settings) {
        setDashboardSettings(settingsRes.data.dashboard_settings);
      }
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

  const handleEditBranch = (b) => {
    setEditBranchForm({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      email: b.email || '',
      is_active: b.is_active !== false
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
        email: editBranchForm.email || null
      });
      toast.success('تم تحديث الفرع');
      setEditBranchDialogOpen(false);
      setEditBranchForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث الفرع');
    }
  };

  const handleDeleteBranch = async (branchId) => {
    if (!confirm('هل أنت متأكد من حذف هذا الفرع؟')) return;
    try {
      await axios.delete(`${API}/branches/${branchId}`);
      toast.success('تم تعطيل الفرع');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حذف الفرع');
    }
  };

  const handleResetPassword = async (u) => {
    const newPassword = prompt(`أدخل كلمة المرور الجديدة للمستخدم "${u.full_name}":`, '');
    if (!newPassword) return;
    
    if (newPassword.length < 4) {
      toast.error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      return;
    }
    
    try {
      await axios.put(`${API}/users/${u.id}/reset-password`, { new_password: newPassword });
      toast.success(`تم تغيير كلمة المرور للمستخدم ${u.full_name}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تغيير كلمة المرور');
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
      setCategoryForm({ name: '', name_en: '', icon: '', image: '', color: '#D4AF37', sort_order: 0 });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء الفئة');
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
      toast.success('تم تحديث الفئة');
      setEditCategoryDialogOpen(false);
      setEditCategoryForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث الفئة');
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

  // حفظ إعدادات الصفحة الرئيسية
  const handleSaveDashboardSettings = async () => {
    try {
      await axios.put(`${API}/settings/dashboard`, dashboardSettings);
      toast.success('تم حفظ إعدادات الصفحة الرئيسية');
    } catch (error) {
      toast.error('فشل في حفظ الإعدادات');
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

  // Kitchen Section handlers
  const handleCreateKitchenSection = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/kitchen-sections`, kitchenSectionForm);
      toast.success('تم إنشاء قسم المطبخ');
      setKitchenSectionDialogOpen(false);
      setKitchenSectionForm({ name: '', name_en: '', color: '#D4AF37', icon: '🍳', printer_id: '', branch_id: '', sort_order: 0 });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء قسم المطبخ');
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
      toast.success('تم تحديث قسم المطبخ');
      setEditKitchenSectionDialogOpen(false);
      setEditKitchenSectionForm(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث قسم المطبخ');
    }
  };

  const handleDeleteKitchenSection = async (sectionId) => {
    if (!confirm('هل أنت متأكد من حذف هذا القسم؟')) return;
    try {
      await axios.delete(`${API}/kitchen-sections/${sectionId}`);
      toast.success('تم حذف قسم المطبخ');
      fetchData();
    } catch (error) {
      toast.error('فشل في حذف قسم المطبخ');
    }
  };

  const handleAssignCategoryToSection = async (categoryId, sectionId) => {
    try {
      await axios.put(`${API}/categories/${categoryId}/kitchen-section`, { kitchen_section_id: sectionId });
      toast.success('تم تحديث قسم المطبخ للفئة');
      fetchData();
    } catch (error) {
      toast.error('فشل في التحديث');
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
      cashier: 'كاشير',
      delivery: 'سائق توصيل'
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
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-10">
            <TabsTrigger value="appearance">المظهر</TabsTrigger>
            {hasRole(['admin', 'manager']) && <TabsTrigger value="dashboard">الرئيسية</TabsTrigger>}
            {hasRole(['admin', 'manager']) && <TabsTrigger value="users">المستخدمين</TabsTrigger>}
            {hasRole(['admin', 'manager']) && <TabsTrigger value="customers">العملاء</TabsTrigger>}
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

          {/* Dashboard Settings - إعدادات الصفحة الرئيسية */}
          {hasRole(['admin', 'manager']) && (
            <TabsContent value="dashboard">
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <LayoutGrid className="h-5 w-5" />
                    إعدادات الصفحة الرئيسية
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <p className="text-sm text-muted-foreground">
                    تحكم في الصفحات والأقسام التي تظهر في الصفحة الرئيسية للمستخدمين
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                          <ShoppingCart className="h-5 w-5 text-blue-500" />
                        </div>
                        <span className="font-medium text-foreground">نقاط البيع</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showPOS}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showPOS: checked})}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                          <LayoutGrid className="h-5 w-5 text-green-500" />
                        </div>
                        <span className="font-medium text-foreground">الطاولات</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showTables}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showTables: checked})}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                          <Package className="h-5 w-5 text-purple-500" />
                        </div>
                        <span className="font-medium text-foreground">الطلبات</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showOrders}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showOrders: checked})}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                          <DollarSign className="h-5 w-5 text-red-500" />
                        </div>
                        <span className="font-medium text-foreground">المصاريف</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showExpenses}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showExpenses: checked})}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                          <Package className="h-5 w-5 text-amber-500" />
                        </div>
                        <span className="font-medium text-foreground">المخزون</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showInventory}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showInventory: checked})}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                          <Truck className="h-5 w-5 text-cyan-500" />
                        </div>
                        <span className="font-medium text-foreground">التوصيل</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showDelivery}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showDelivery: checked})}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                          <BarChart className="h-5 w-5 text-indigo-500" />
                        </div>
                        <span className="font-medium text-foreground">التقارير</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showReports}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showReports: checked})}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-500/10 rounded-lg flex items-center justify-center">
                          <SettingsIcon className="h-5 w-5 text-gray-500" />
                        </div>
                        <span className="font-medium text-foreground">الإعدادات</span>
                      </div>
                      <Switch
                        checked={dashboardSettings.showSettings}
                        onCheckedChange={(checked) => setDashboardSettings({...dashboardSettings, showSettings: checked})}
                      />
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handleSaveDashboardSettings}
                    className="w-full bg-primary text-primary-foreground"
                  >
                    <Save className="h-4 w-4 ml-2" />
                    حفظ الإعدادات
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

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
                                <SelectItem value="delivery">سائق توصيل</SelectItem>
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
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${u.is_active !== false ? 'bg-primary/10' : 'bg-red-500/10'}`}>
                            <span className={`font-bold ${u.is_active !== false ? 'text-primary' : 'text-red-500'}`}>{u.full_name[0]}</span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{u.full_name}</p>
                            <p className="text-sm text-muted-foreground">{u.email}</p>
                            {u.branch_id && (
                              <p className="text-xs text-muted-foreground">
                                فرع: {branches.find(b => b.id === u.branch_id)?.name || '-'}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            u.role === 'admin' ? 'bg-primary/10 text-primary' :
                            u.role === 'manager' ? 'bg-blue-500/10 text-blue-500' :
                            u.role === 'supervisor' ? 'bg-purple-500/10 text-purple-500' :
                            u.role === 'delivery' ? 'bg-green-500/10 text-green-500' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {getRoleText(u.role)}
                          </span>
                          {u.is_active === false && (
                            <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-500">معطل</span>
                          )}
                          {hasRole(['admin']) && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-blue-500 hover:bg-blue-500/10"
                                onClick={() => handleEditUser(u)}
                                title="تعديل"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-orange-500 hover:bg-orange-500/10"
                                onClick={() => handleResetPassword(u)}
                                title="إعادة تعيين كلمة المرور"
                              >
                                <Key className="h-4 w-4" />
                              </Button>
                              {u.id !== user.id && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteUser(u.id)}
                                  title="حذف"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Edit User Dialog */}
              <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">تعديل المستخدم</DialogTitle>
                  </DialogHeader>
                  {editUserForm && (
                    <form onSubmit={handleUpdateUser} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">الاسم الكامل</Label>
                          <Input
                            value={editUserForm.full_name}
                            onChange={(e) => setEditUserForm({ ...editUserForm, full_name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">الصلاحية</Label>
                          <Select value={editUserForm.role} onValueChange={(v) => setEditUserForm({ ...editUserForm, role: v })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">مدير النظام</SelectItem>
                              <SelectItem value="manager">مدير</SelectItem>
                              <SelectItem value="supervisor">مشرف</SelectItem>
                              <SelectItem value="cashier">كاشير</SelectItem>
                              <SelectItem value="delivery">سائق توصيل</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">الفرع</Label>
                          <Select value={editUserForm.branch_id || 'none'} onValueChange={(v) => setEditUserForm({ ...editUserForm, branch_id: v === 'none' ? '' : v })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="اختر فرع" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">بدون فرع</SelectItem>
                              {branches.map(branch => (
                                <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-3 mt-6">
                          <Switch
                            checked={editUserForm.is_active}
                            onCheckedChange={(checked) => setEditUserForm({ ...editUserForm, is_active: checked })}
                          />
                          <Label className="text-foreground">الحساب مفعل</Label>
                        </div>
                      </div>

                      {/* Permissions - Grouped */}
                      <div>
                        <Label className="text-foreground mb-3 block">الصلاحيات المخصصة</Label>
                        <div className="max-h-[300px] overflow-y-auto space-y-4 pr-2">
                          {PERMISSION_GROUPS.map(group => (
                            <div key={group}>
                              <p className="text-sm font-medium text-muted-foreground mb-2">{group}</p>
                              <div className="grid grid-cols-2 gap-2">
                                {AVAILABLE_PERMISSIONS.filter(p => p.group === group).map(perm => (
                                  <div
                                    key={perm.id}
                                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                                      editUserForm.permissions?.includes(perm.id)
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border hover:border-primary/50'
                                    }`}
                                    onClick={() => toggleUserPermission(perm.id)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium text-xs text-foreground">{perm.name}</span>
                                      {editUserForm.permissions?.includes(perm.id) && (
                                        <Check className="h-3 w-3 text-primary" />
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">{perm.description}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditUserForm({ ...editUserForm, permissions: AVAILABLE_PERMISSIONS.map(p => p.id) })}
                          >
                            تحديد الكل
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditUserForm({ ...editUserForm, permissions: [] })}
                          >
                            إلغاء التحديد
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditUserDialogOpen(false)} className="flex-1">
                          إلغاء
                        </Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                          حفظ التعديلات
                        </Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
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
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            branch.is_active !== false ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {branch.is_active !== false ? 'نشط' : 'معطل'}
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
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">تعديل الفرع</DialogTitle>
                  </DialogHeader>
                  {editBranchForm && (
                    <form onSubmit={handleUpdateBranch} className="space-y-4">
                      <div>
                        <Label className="text-foreground">اسم الفرع</Label>
                        <Input
                          value={editBranchForm.name}
                          onChange={(e) => setEditBranchForm({ ...editBranchForm, name: e.target.value })}
                          required
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">العنوان</Label>
                        <Input
                          value={editBranchForm.address}
                          onChange={(e) => setEditBranchForm({ ...editBranchForm, address: e.target.value })}
                          required
                          className="mt-1"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">الهاتف</Label>
                          <Input
                            value={editBranchForm.phone}
                            onChange={(e) => setEditBranchForm({ ...editBranchForm, phone: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">البريد الإلكتروني</Label>
                          <Input
                            type="email"
                            value={editBranchForm.email}
                            onChange={(e) => setEditBranchForm({ ...editBranchForm, email: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditBranchDialogOpen(false)} className="flex-1">
                          إلغاء
                        </Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                          حفظ التعديلات
                        </Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          )}

          {/* Categories */}
          {hasRole(['admin', 'manager']) && (
            <TabsContent value="categories">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Tag className="h-5 w-5" />
                    إدارة الفئات
                  </CardTitle>
                  <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة فئة
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-foreground">إضافة فئة جديدة</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateCategory} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">اسم الفئة (عربي)</Label>
                            <Input
                              value={categoryForm.name}
                              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                              placeholder="مشروبات ساخنة"
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">اسم الفئة (إنجليزي)</Label>
                            <Input
                              value={categoryForm.name_en}
                              onChange={(e) => setCategoryForm({ ...categoryForm, name_en: e.target.value })}
                              placeholder="Hot Drinks"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-foreground">رابط الصورة</Label>
                          <Input
                            value={categoryForm.image}
                            onChange={(e) => setCategoryForm({ ...categoryForm, image: e.target.value })}
                            placeholder="https://example.com/image.jpg"
                            className="mt-1"
                          />
                          {categoryForm.image && (
                            <img src={categoryForm.image} alt="معاينة" className="mt-2 h-20 w-20 object-cover rounded-lg" />
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-foreground">الأيقونة</Label>
                            <Input
                              value={categoryForm.icon}
                              onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                              placeholder="☕"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">اللون</Label>
                            <Input
                              type="color"
                              value={categoryForm.color}
                              onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                              className="mt-1 h-10"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">الترتيب</Label>
                            <Input
                              type="number"
                              value={categoryForm.sort_order}
                              onChange={(e) => setCategoryForm({ ...categoryForm, sort_order: parseInt(e.target.value) || 0 })}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)} className="flex-1">
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
                  {categories.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد فئات. قم بإضافة فئة جديدة</p>
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
                            {products.filter(p => p.category_id === cat.id).length} منتج
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
                    <DialogTitle className="text-foreground">تعديل الفئة</DialogTitle>
                  </DialogHeader>
                  {editCategoryForm && (
                    <form onSubmit={handleUpdateCategory} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">اسم الفئة (عربي)</Label>
                          <Input
                            value={editCategoryForm.name}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">اسم الفئة (إنجليزي)</Label>
                          <Input
                            value={editCategoryForm.name_en}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, name_en: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-foreground">رابط الصورة</Label>
                        <Input
                          value={editCategoryForm.image}
                          onChange={(e) => setEditCategoryForm({ ...editCategoryForm, image: e.target.value })}
                          placeholder="https://example.com/image.jpg"
                          className="mt-1"
                        />
                        {editCategoryForm.image && (
                          <img src={editCategoryForm.image} alt="معاينة" className="mt-2 h-20 w-20 object-cover rounded-lg" />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label className="text-foreground">الأيقونة</Label>
                          <Input
                            value={editCategoryForm.icon}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, icon: e.target.value })}
                            placeholder="☕"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">اللون</Label>
                          <Input
                            type="color"
                            value={editCategoryForm.color}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, color: e.target.value })}
                            className="mt-1 h-10"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">الترتيب</Label>
                          <Input
                            type="number"
                            value={editCategoryForm.sort_order}
                            onChange={(e) => setEditCategoryForm({ ...editCategoryForm, sort_order: parseInt(e.target.value) || 0 })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditCategoryDialogOpen(false)} className="flex-1">
                          إلغاء
                        </Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                          حفظ التغييرات
                        </Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>
          )}

          {/* Products */}
          {hasRole(['admin', 'manager']) && (
            <TabsContent value="products">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Package className="h-5 w-5" />
                    إدارة المنتجات
                  </CardTitle>
                  <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-primary text-primary-foreground">
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة منتج
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle className="text-foreground">إضافة منتج جديد</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateProduct} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-foreground">اسم المنتج (عربي)</Label>
                            <Input
                              value={productForm.name}
                              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                              placeholder="قهوة أمريكية"
                              required
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">اسم المنتج (إنجليزي)</Label>
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
                            <Label className="text-foreground">الفئة</Label>
                            <Select value={productForm.category_id} onValueChange={(v) => setProductForm({ ...productForm, category_id: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="اختر فئة" />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map(cat => (
                                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-foreground">الباركود</Label>
                            <Input
                              value={productForm.barcode}
                              onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                              placeholder="اختياري"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-foreground">سعر البيع (د.ع)</Label>
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
                            <Label className="text-foreground">تكلفة المواد الخام</Label>
                            <Input
                              type="number"
                              value={productForm.cost}
                              onChange={(e) => setProductForm({ ...productForm, cost: e.target.value })}
                              placeholder="2000"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">التكلفة التشغيلية</Label>
                            <Input
                              type="number"
                              value={productForm.operating_cost}
                              onChange={(e) => setProductForm({ ...productForm, operating_cost: e.target.value })}
                              placeholder="500"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-foreground">رابط الصورة</Label>
                          <Input
                            value={productForm.image}
                            onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                            placeholder="https://example.com/image.jpg"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">الوصف</Label>
                          <Textarea
                            value={productForm.description}
                            onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                            placeholder="وصف المنتج..."
                            className="mt-1"
                            rows={2}
                          />
                        </div>
                        {productForm.price && productForm.cost && (
                          <div className="p-3 bg-green-500/10 rounded-lg">
                            <p className="text-sm text-green-600">
                              الربح المتوقع: {formatPrice((parseFloat(productForm.price) || 0) - (parseFloat(productForm.cost) || 0) - (parseFloat(productForm.operating_cost) || 0))} لكل وحدة
                            </p>
                          </div>
                        )}
                        <div className="flex gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)} className="flex-1">
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
                  {products.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد منتجات. قم بإضافة منتج جديد</p>
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
                              <p className="text-xs text-green-500">ربح: {formatPrice(p.profit || (p.price - p.cost - (p.operating_cost || 0)))}</p>
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
                    <DialogTitle className="text-foreground">تعديل المنتج</DialogTitle>
                  </DialogHeader>
                  {editProductForm && (
                    <form onSubmit={handleUpdateProduct} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">اسم المنتج (عربي)</Label>
                          <Input
                            value={editProductForm.name}
                            onChange={(e) => setEditProductForm({ ...editProductForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">اسم المنتج (إنجليزي)</Label>
                          <Input
                            value={editProductForm.name_en}
                            onChange={(e) => setEditProductForm({ ...editProductForm, name_en: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">الفئة</Label>
                          <Select value={editProductForm.category_id} onValueChange={(v) => setEditProductForm({ ...editProductForm, category_id: v })}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="اختر فئة" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map(cat => (
                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-foreground">الباركود</Label>
                          <Input
                            value={editProductForm.barcode}
                            onChange={(e) => setEditProductForm({ ...editProductForm, barcode: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label className="text-foreground">سعر البيع (د.ع)</Label>
                          <Input
                            type="number"
                            value={editProductForm.price}
                            onChange={(e) => setEditProductForm({ ...editProductForm, price: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">تكلفة المواد الخام</Label>
                          <Input
                            type="number"
                            value={editProductForm.cost}
                            onChange={(e) => setEditProductForm({ ...editProductForm, cost: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">التكلفة التشغيلية</Label>
                          <Input
                            type="number"
                            value={editProductForm.operating_cost}
                            onChange={(e) => setEditProductForm({ ...editProductForm, operating_cost: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-foreground">رابط الصورة</Label>
                        <Input
                          value={editProductForm.image}
                          onChange={(e) => setEditProductForm({ ...editProductForm, image: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">الوصف</Label>
                        <Textarea
                          value={editProductForm.description}
                          onChange={(e) => setEditProductForm({ ...editProductForm, description: e.target.value })}
                          className="mt-1"
                          rows={2}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={editProductForm.is_available !== false}
                          onCheckedChange={(checked) => setEditProductForm({ ...editProductForm, is_available: checked })}
                        />
                        <Label className="text-foreground">متاح للبيع</Label>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditProductDialogOpen(false)} className="flex-1">
                          إلغاء
                        </Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                          حفظ التعديلات
                        </Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
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

          {/* Customers - إدارة العملاء */}
          {hasRole(['admin', 'manager']) && (
            <TabsContent value="customers">
              <Card className="border-border/50 bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <UserCheck className="h-5 w-5" />
                    إدارة العملاء
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="بحث بالاسم أو الهاتف..."
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                        className="w-48 pr-9"
                        data-testid="customer-search-settings"
                      />
                    </div>
                    <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
                      <Button className="bg-primary text-primary-foreground" onClick={() => setCustomerDialogOpen(true)}>
                        <Plus className="h-4 w-4 ml-2" />
                        إضافة عميل
                      </Button>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle className="text-foreground">إضافة عميل جديد</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await axios.post(`${API}/customers`, customerForm);
                            toast.success('تم إضافة العميل');
                            setCustomerDialogOpen(false);
                            setCustomerForm({ name: '', phone: '', phone2: '', address: '', area: '', notes: '', is_blocked: false });
                            fetchData();
                          } catch (error) {
                            toast.error(error.response?.data?.detail || 'فشل في إضافة العميل');
                          }
                        }} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-foreground">اسم العميل *</Label>
                              <Input
                                value={customerForm.name}
                                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                                placeholder="أحمد محمد"
                                required
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-foreground">رقم الهاتف *</Label>
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
                              <Label className="text-foreground">رقم هاتف إضافي</Label>
                              <Input
                                value={customerForm.phone2}
                                onChange={(e) => setCustomerForm({ ...customerForm, phone2: e.target.value })}
                                placeholder="اختياري"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-foreground">المنطقة</Label>
                              <Input
                                value={customerForm.area}
                                onChange={(e) => setCustomerForm({ ...customerForm, area: e.target.value })}
                                placeholder="المنصور، الكرادة..."
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-foreground">العنوان الكامل</Label>
                            <Input
                              value={customerForm.address}
                              onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                              placeholder="العنوان بالتفصيل..."
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-foreground">ملاحظات</Label>
                            <Textarea
                              value={customerForm.notes}
                              onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                              placeholder="ملاحظات خاصة بالعميل..."
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                          <div className="flex gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => setCustomerDialogOpen(false)} className="flex-1">
                              إلغاء
                            </Button>
                            <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                              إضافة
                            </Button>
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
                      <p>لا يوجد عملاء مسجلين</p>
                      <p className="text-sm">يتم إضافة العملاء تلقائياً عند إنشاء الطلبات</p>
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
                                  <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-500 rounded">محظور</span>
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
                                if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
                                try {
                                  await axios.delete(`${API}/customers/${customer.id}`);
                                  toast.success('تم حذف العميل');
                                  fetchData();
                                } catch (error) {
                                  toast.error('فشل في حذف العميل');
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
                    <DialogTitle className="text-foreground">تعديل بيانات العميل</DialogTitle>
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
                        toast.success('تم تحديث بيانات العميل');
                        setEditCustomerDialogOpen(false);
                        setEditCustomerForm(null);
                        fetchData();
                      } catch (error) {
                        toast.error(error.response?.data?.detail || 'فشل في تحديث العميل');
                      }
                    }} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-foreground">اسم العميل *</Label>
                          <Input
                            value={editCustomerForm.name}
                            onChange={(e) => setEditCustomerForm({ ...editCustomerForm, name: e.target.value })}
                            required
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">رقم الهاتف *</Label>
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
                          <Label className="text-foreground">رقم هاتف إضافي</Label>
                          <Input
                            value={editCustomerForm.phone2}
                            onChange={(e) => setEditCustomerForm({ ...editCustomerForm, phone2: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground">المنطقة</Label>
                          <Input
                            value={editCustomerForm.area}
                            onChange={(e) => setEditCustomerForm({ ...editCustomerForm, area: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-foreground">العنوان الكامل</Label>
                        <Input
                          value={editCustomerForm.address}
                          onChange={(e) => setEditCustomerForm({ ...editCustomerForm, address: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">ملاحظات</Label>
                        <Textarea
                          value={editCustomerForm.notes}
                          onChange={(e) => setEditCustomerForm({ ...editCustomerForm, notes: e.target.value })}
                          className="mt-1"
                          rows={2}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                          <Label className="text-foreground">حظر العميل</Label>
                          <p className="text-xs text-muted-foreground">منع العميل من الطلب</p>
                        </div>
                        <Switch
                          checked={editCustomerForm.is_blocked}
                          onCheckedChange={(checked) => setEditCustomerForm({ ...editCustomerForm, is_blocked: checked })}
                        />
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditCustomerDialogOpen(false)} className="flex-1">
                          إلغاء
                        </Button>
                        <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                          حفظ التغييرات
                        </Button>
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
