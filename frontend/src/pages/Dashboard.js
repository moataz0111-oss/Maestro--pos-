import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice, formatPriceCompact } from '../utils/currency';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
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
  Move
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
import PWAInstallButton from '../components/PWAInstallButton';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  const navigate = useNavigate();
  const printRef = useRef();
  
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardSettings, setDashboardSettings] = useState({
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
    showCallLogs: true
  });
  
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

  useEffect(() => {
    fetchData();
    fetchDashboardSettings();
  }, [selectedBranch]);

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
      // Fetch branches
      const branchesRes = await axios.get(`${API}/branches`);
      setBranches(branchesRes.data);
      
      if (!selectedBranch && branchesRes.data.length > 0) {
        setSelectedBranch(branchesRes.data[0].id);
      }

      // Fetch today's stats
      const today = new Date().toISOString().split('T')[0];
      const [salesRes, ordersRes] = await Promise.all([
        axios.get(`${API}/reports/sales`, { params: { branch_id: selectedBranch, start_date: today, end_date: today } }),
        axios.get(`${API}/orders`, { params: { branch_id: selectedBranch, date: today } })
      ]);

      setStats(salesRes.data);
      setRecentOrders(ordersRes.data.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  // فتح نافذة إغلاق الصندوق وجلب الملخص
  const openCashRegister = async () => {
    setCashRegisterOpen(true);
    setLoadingSummary(true);
    setClosingResult(null);
    setShowReport(false);
    
    try {
      const res = await axios.get(`${API}/cash-register/summary`);
      setCashSummary(res.data);
      // إعادة تعيين الجرد
      setDenominations({
        "250": 0, "500": 0, "1000": 0, "5000": 0, "10000": 0, "25000": 0, "50000": 0
      });
      setCloseNotes('');
    } catch (error) {
      if (error.response?.status === 404) {
        toast.error('لا يوجد وردية مفتوحة لك. يرجى فتح وردية أولاً من الإعدادات.');
        setCashRegisterOpen(false);
      } else {
        toast.error('فشل في جلب بيانات الصندوق');
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
      toast.error('يرجى إدخال جرد الصندوق');
      return;
    }
    
    setIsClosing(true);
    
    try {
      const res = await axios.post(`${API}/cash-register/close`, {
        denominations,
        notes: closeNotes
      });
      
      setClosingResult(res.data);
      setShowReport(true);
      toast.success('تم إغلاق الصندوق بنجاح!');
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إغلاق الصندوق');
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
          <p>Maestro EGP - ${new Date().toLocaleString('ar-IQ')}</p>
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
    { label: 'نقاط البيع', icon: ShoppingCart, path: '/pos', color: 'bg-primary', key: 'showPOS' },
    { label: 'الطاولات', icon: LayoutGrid, path: '/tables', color: 'bg-blue-500', key: 'showTables' },
    { label: 'شاشة المطبخ', icon: ChefHat, path: '/kitchen', color: 'bg-yellow-500', key: 'showKitchen' },
    { label: 'التقارير', icon: BarChart3, path: '/reports', color: 'bg-amber-500', key: 'showReports' },
    { label: 'المصاريف', icon: Receipt, path: '/expenses', color: 'bg-red-500', key: 'showExpenses' },
    { label: 'المخزون', icon: Package, path: '/inventory', color: 'bg-purple-500', key: 'showInventory' },
    { label: 'التوصيل', icon: Truck, path: '/delivery', color: 'bg-orange-500', key: 'showDelivery' },
    { label: 'الموارد البشرية', icon: UserCog, path: '/hr', color: 'bg-green-500', key: 'showHR' },
    { label: 'التحويلات', icon: ArrowLeftRight, path: '/warehouse', color: 'bg-indigo-500', key: 'showWarehouse' },
    { label: 'سجل المكالمات', icon: Headphones, path: '/call-logs', color: 'bg-cyan-500', key: 'showCallLogs' },
    { label: 'برنامج الولاء', icon: Gift, path: '/loyalty', color: 'bg-pink-500', key: 'showLoyalty' },
    { label: 'الكوبونات', icon: Gift, path: '/coupons', color: 'bg-violet-500', key: 'showCoupons' },
    { label: 'الوصفات', icon: ChefHat, path: '/recipes', color: 'bg-teal-500', key: 'showRecipes' },
    { label: 'الإعدادات', icon: Settings, path: '/settings', color: 'bg-gray-500', key: 'showSettings' },
  ];
  
  // فلترة الأزرار حسب الإعدادات والصلاحيات
  const quickActions = allQuickActions.filter(action => {
    // التحقق من إعدادات الصفحة الرئيسية
    if (!dashboardSettings[action.key]) return false;
    
    // التحقق من صلاحيات الكاشير
    if (user?.role === 'cashier') {
      // الكاشير يرى فقط: نقاط البيع، الطاولات، المصاريف، التوصيل
      const allowedForCashier = ['showPOS', 'showTables', 'showExpenses', 'showDelivery'];
      return allowedForCashier.includes(action.key);
    }
    
    return true;
  });

  const statCards = [
    { 
      label: 'مبيعات اليوم', 
      value: formatPriceCompact(stats?.total_sales || 0), 
      icon: DollarSign,
      color: 'text-green-500',
      bg: 'bg-green-500/10'
    },
    { 
      label: 'عدد الطلبات', 
      value: stats?.total_orders || 0, 
      icon: ShoppingCart,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    { 
      label: 'متوسط الطلب', 
      value: formatPrice(stats?.average_order_value || 0), 
      icon: TrendingUp,
      color: 'text-primary',
      bg: 'bg-primary/10'
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
      pending: 'قيد الانتظار',
      preparing: 'قيد التحضير',
      ready: 'جاهز',
      delivered: 'تم التوصيل',
      cancelled: 'ملغي',
    };
    return texts[status] || status;
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
    <div className="min-h-screen bg-background" data-testid="dashboard">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-xl font-black text-primary-foreground font-cairo">M</span>
            </div>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">Maestro EGP</h1>
              <p className="text-sm text-muted-foreground">مرحباً، {user?.full_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Branch Selector */}
            <select
              value={selectedBranch || ''}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              data-testid="branch-selector"
            >
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>

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

            {/* Super Admin Button - للمالك فقط (بدون tenant_id) */}
            {user?.role === 'admin' && !user?.tenant_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/super-admin')}
                className="gap-2 border-purple-500 text-purple-500 hover:bg-purple-500/10"
                data-testid="super-admin-btn"
              >
                <Crown className="h-4 w-4" />
                إدارة العملاء
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
              إغلاق الصندوق
            </Button>

            {/* PWA Install Button */}
            <PWAInstallButton variant="outline" className="gap-2" />

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

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto">
        {/* Quick Actions */}
        <section>
          <h2 className="text-base md:text-lg font-bold font-cairo mb-3 text-foreground">الإجراءات السريعة</h2>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
            {quickActions.map((action) => (
              <Button
                key={action.path}
                variant="outline"
                className="h-auto py-3 md:py-4 flex flex-col items-center gap-2 bg-card hover:bg-card/80 border-border/50 hover:border-primary/50 transition-all hover:-translate-y-0.5"
                onClick={() => navigate(action.path)}
                data-testid={`quick-action-${action.path.slice(1)}`}
              >
                <div className={`w-10 h-10 md:w-11 md:h-11 ${action.color} rounded-xl flex items-center justify-center`}>
                  <action.icon className="h-5 w-5 md:h-5.5 md:w-5.5 text-white" />
                </div>
                <span className="text-xs md:text-sm font-medium text-foreground text-center leading-tight">{action.label}</span>
              </Button>
            ))}
          </div>
        </section>

        {/* Stats Cards */}
        <section>
          <h2 className="text-base md:text-lg font-bold font-cairo mb-3 text-foreground">إحصائيات اليوم</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

        {/* Recent Orders & Sales by Type */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <Card className="border-border/50 bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-cairo text-foreground">آخر الطلبات</CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/orders')}
                className="text-primary"
              >
                عرض الكل
                <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentOrders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد طلبات اليوم</p>
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
                          <p className="font-medium text-foreground">{order.customer_name || 'زبون'}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.items.length} عناصر
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
              <CardTitle className="text-lg font-cairo text-foreground">المبيعات حسب طريقة الدفع</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.by_payment_method && Object.entries(stats.by_payment_method).map(([method, amount]) => (
                  <div key={method} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {method === 'cash' ? 'نقدي' : method === 'card' ? 'بطاقة' : 'آجل'}
                      </span>
                      <span className="font-medium text-foreground">{formatPrice(amount)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${(amount / (stats?.total_sales || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(!stats?.by_payment_method || Object.keys(stats.by_payment_method).length === 0) && (
                  <p className="text-center text-muted-foreground py-8">لا توجد مبيعات اليوم</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Delivery Apps Stats */}
        {stats?.by_delivery_app && Object.keys(stats.by_delivery_app).length > 0 && (
          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-cairo text-foreground">مبيعات تطبيقات التوصيل</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.entries(stats.by_delivery_app).map(([app, amount]) => (
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
              إغلاق الصندوق
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
                    <h1 className="text-2xl font-bold">تقرير إغلاق الصندوق</h1>
                    <p className="text-muted-foreground">{closingResult.branch_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(closingResult.ended_at).toLocaleString('ar-IQ')}
                    </p>
                  </div>

                  {/* بيانات الكاشير */}
                  <div className="section mb-4 p-4 bg-muted/30 rounded-lg">
                    <div className="section-title font-bold mb-2">بيانات الوردية</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>الكاشير: <strong>{closingResult.cashier_name}</strong></div>
                      <div>الفرع: <strong>{closingResult.branch_name}</strong></div>
                      <div>وقت الدخول: <strong>{new Date(closingResult.started_at).toLocaleString('ar-IQ')}</strong></div>
                      <div>وقت الإغلاق: <strong>{new Date(closingResult.ended_at).toLocaleString('ar-IQ')}</strong></div>
                    </div>
                  </div>

                  {/* إجمالي المبيعات */}
                  <div className="section mb-4 p-4 bg-green-500/10 rounded-lg">
                    <div className="section-title font-bold mb-2 text-green-600">المبيعات</div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>إجمالي المبيعات:</span>
                        <strong className="text-green-600">{formatPrice(closingResult.total_sales)}</strong>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>نقدي:</span>
                        <span>{formatPrice(closingResult.cash_sales)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>بطاقات:</span>
                        <span>{formatPrice(closingResult.card_sales)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>آجل:</span>
                        <span>{formatPrice(closingResult.credit_sales)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>عدد الطلبات:</span>
                        <span>{closingResult.total_orders}</span>
                      </div>
                    </div>
                  </div>

                  {/* تطبيقات التوصيل */}
                  {closingResult.delivery_app_sales && Object.keys(closingResult.delivery_app_sales).length > 0 && (
                    <div className="section mb-4 p-4 bg-blue-500/10 rounded-lg">
                      <div className="section-title font-bold mb-2 text-blue-600">مبيعات التطبيقات</div>
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
                      <div className="section-title font-bold mb-2 text-orange-600">مبيعات السائقين</div>
                      <div className="flex justify-between">
                        <span>إجمالي السائقين:</span>
                        <strong>{formatPrice(closingResult.driver_sales)}</strong>
                      </div>
                    </div>
                  )}

                  {/* الخصومات والإلغاءات */}
                  <div className="section mb-4 p-4 bg-red-500/10 rounded-lg">
                    <div className="section-title font-bold mb-2 text-red-600">الخصومات والإلغاءات</div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>إجمالي الخصومات:</span>
                        <span className="text-red-600">{formatPrice(closingResult.discounts_total || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>الطلبات الملغاة ({closingResult.cancelled_orders || 0}):</span>
                        <span className="text-red-600">{formatPrice(closingResult.cancelled_amount || 0)}</span>
                      </div>
                      {closingResult.cancelled_by && closingResult.cancelled_by.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-red-200">
                          <div className="text-xs text-red-600 mb-1">تفاصيل الإلغاء:</div>
                          {closingResult.cancelled_by.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span>{item.user_name} ({item.count} طلب):</span>
                              <span>{formatPrice(item.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* المصاريف */}
                  <div className="section mb-4 p-4 bg-yellow-500/10 rounded-lg">
                    <div className="section-title font-bold mb-2 text-yellow-600">المصاريف</div>
                    <div className="flex justify-between">
                      <span>إجمالي المصاريف:</span>
                      <strong className="text-yellow-600">{formatPrice(closingResult.total_expenses)}</strong>
                    </div>
                  </div>

                  {/* جرد الصندوق */}
                  <div className="section mb-4 p-4 bg-purple-500/10 rounded-lg">
                    <div className="section-title font-bold mb-2 text-purple-600">جرد الصندوق</div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>الرصيد الافتتاحي:</span>
                        <span>{formatPrice(closingResult.opening_cash)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>المتوقع في الصندوق:</span>
                        <span>{formatPrice(closingResult.expected_cash)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>الجرد الفعلي:</span>
                        <span>{formatPrice(closingResult.closing_cash)}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className={`flex justify-between font-bold text-lg ${closingResult.cash_difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span>الفرق:</span>
                        <span className="flex items-center gap-1">
                          {closingResult.cash_difference >= 0 ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            <XCircle className="h-5 w-5" />
                          )}
                          {formatPrice(closingResult.cash_difference)}
                          {closingResult.cash_difference > 0 && ' (زيادة)'}
                          {closingResult.cash_difference < 0 && ' (نقص)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* صافي الربح */}
                  <div className="section p-4 bg-primary/10 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold">صافي الربح:</span>
                      <span className={`text-2xl font-bold ${closingResult.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPrice(closingResult.net_profit)}
                      </span>
                    </div>
                  </div>

                  {/* ملاحظات */}
                  {closingResult.notes && (
                    <div className="section mt-4 p-4 bg-muted/30 rounded-lg">
                      <div className="section-title font-bold mb-2">ملاحظات</div>
                      <p className="text-sm">{closingResult.notes}</p>
                    </div>
                  )}
                </div>

                {/* أزرار الإجراءات */}
                <div className="flex gap-3 mt-6">
                  <Button onClick={handlePrintReport} className="flex-1 gap-2">
                    <Printer className="h-4 w-4" />
                    طباعة التقرير
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
                {/* ملخص المبيعات */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-green-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
                    <p className="text-lg font-bold text-green-600">{formatPrice(cashSummary.total_sales)}</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">نقدي</p>
                    <p className="text-lg font-bold text-blue-600">{formatPrice(cashSummary.cash_sales)}</p>
                  </div>
                  <div className="p-3 bg-yellow-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">المصاريف</p>
                    <p className="text-lg font-bold text-yellow-600">{formatPrice(cashSummary.total_expenses)}</p>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">المتوقع</p>
                    <p className="text-lg font-bold text-purple-600">{formatPrice(cashSummary.expected_cash)}</p>
                  </div>
                </div>

                {/* جرد فئات النقود */}
                <div className="space-y-3">
                  <h3 className="font-bold flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-green-500" />
                    جرد الصندوق (فئات النقود)
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
                    <span className="font-bold">إجمالي الجرد:</span>
                    <span className="text-2xl font-bold text-primary">{formatPrice(calculateCountedCash())}</span>
                  </div>

                  {/* الفرق */}
                  {calculateCountedCash() > 0 && (
                    <div className={`flex items-center justify-between p-4 rounded-lg ${
                      calculateCountedCash() - cashSummary.expected_cash >= 0 
                        ? 'bg-green-500/10' 
                        : 'bg-red-500/10'
                    }`}>
                      <span className="font-bold">الفرق:</span>
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
                  <Label>ملاحظات (اختياري)</Label>
                  <Input
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="أضف ملاحظات إن وجدت..."
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
                      تأكيد إغلاق الصندوق
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
