import React, { useState, useEffect } from 'react';
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
  Receipt
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Dashboard() {
  const { user, logout, hasRole } = useAuth();
  const { theme, setTheme, isDark } = useTheme();
  const navigate = useNavigate();
  
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [selectedBranch]);

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
        axios.get(`${API}/reports/sales`, { params: { branch_id: selectedBranch, start_date: today } }),
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

  const quickActions = [
    { label: 'نقاط البيع', icon: ShoppingCart, path: '/pos', color: 'bg-primary' },
    { label: 'الطاولات', icon: LayoutGrid, path: '/tables', color: 'bg-blue-500' },
    { label: 'الطلبات', icon: Package, path: '/orders', color: 'bg-green-500' },
    { label: 'المخزون', icon: Package, path: '/inventory', color: 'bg-purple-500' },
    { label: 'التوصيل', icon: Truck, path: '/delivery', color: 'bg-orange-500' },
    { label: 'الإعدادات', icon: Settings, path: '/settings', color: 'bg-gray-500' },
  ];

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

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Quick Actions */}
        <section>
          <h2 className="text-lg font-bold font-cairo mb-4 text-foreground">الإجراءات السريعة</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {quickActions.map((action) => (
              <Button
                key={action.path}
                variant="outline"
                className="h-auto py-6 flex flex-col items-center gap-3 bg-card hover:bg-card/80 border-border/50 hover:border-primary/50 transition-all hover:-translate-y-1"
                onClick={() => navigate(action.path)}
                data-testid={`quick-action-${action.path.slice(1)}`}
              >
                <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center`}>
                  <action.icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-sm font-medium text-foreground">{action.label}</span>
              </Button>
            ))}
          </div>
        </section>

        {/* Stats Cards */}
        <section>
          <h2 className="text-lg font-bold font-cairo mb-4 text-foreground">إحصائيات اليوم</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {statCards.map((stat, idx) => (
              <Card key={idx} className="border-border/50 bg-card" data-testid={`stat-card-${idx}`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                      <p className="text-2xl font-bold font-cairo tabular-nums text-foreground">{stat.value}</p>
                    </div>
                    <div className={`w-12 h-12 ${stat.bg} rounded-xl flex items-center justify-center`}>
                      <stat.icon className={`h-6 w-6 ${stat.color}`} />
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
    </div>
  );
}
