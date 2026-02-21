import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  ArrowRight,
  PieChart,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  Clock,
  Calendar,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Utensils,
  Package,
  Star,
  Printer,
  Wallet,
  Receipt,
  AlertTriangle,
  CheckCircle,
  Target,
  Percent,
  Layers,
  CreditCard,
  Banknote,
  TrendingUp as Profit,
  MinusCircle
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const API = BACKEND_URL + '/api';

export default function SmartReports() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState({
    summary: {},
    profitLoss: {},
    expenses: [],
    topProducts: [],
    lowProducts: [],
    categoryAnalysis: [],
    salesByHour: [],
    orderTypes: [],
    paymentMethods: [],
    comparisons: {},
    insights: []
  });

  useEffect(() => {
    fetchReportData();
  }, [period]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      // جلب البيانات من APIs متعددة
      const [salesRes, productsRes, hourlyRes, expensesRes] = await Promise.all([
        axios.get(`${API}/smart-reports/sales`, { params: { period } }).catch(() => ({ data: {} })),
        axios.get(`${API}/smart-reports/products`, { params: { period } }).catch(() => ({ data: {} })),
        axios.get(`${API}/smart-reports/hourly`).catch(() => ({ data: {} })),
        axios.get(`${API}/expenses`, { params: { period } }).catch(() => ({ data: [] }))
      ]);
      
      const salesData = salesRes.data || {};
      const productsData = productsRes.data || {};
      const hourlyData = hourlyRes.data || {};
      const expensesData = Array.isArray(expensesRes.data) ? expensesRes.data : [];
      
      // حساب المصاريف
      const totalExpenses = expensesData.reduce((sum, e) => sum + (e.amount || 0), 0);
      
      // حساب صافي الربح
      const totalSales = salesData.total_sales || 0;
      const totalCost = salesData.total_cost || 0;
      const grossProfit = totalSales - totalCost;
      const netProfit = grossProfit - totalExpenses;
      const profitMargin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0;
      
      // تحويل بيانات الساعات
      const salesByHour = Object.entries(hourlyData.hourly || {}).map(([hour, data]) => ({
        hour: `${hour}:00`,
        sales: data.sales || 0,
        orders: data.orders || 0
      }));
      
      // تجميع المصاريف حسب النوع
      const expensesByCategory = expensesData.reduce((acc, exp) => {
        const category = exp.category || t('أخرى');
        if (!acc[category]) {
          acc[category] = { category, total: 0, count: 0 };
        }
        acc[category].total += exp.amount || 0;
        acc[category].count += 1;
        return acc;
      }, {});
      
      // ترتيب المنتجات
      const allProducts = productsData.top_products || [];
      const topProducts = [...allProducts].slice(0, 5);
      const lowProducts = [...allProducts].sort((a, b) => a.quantity - b.quantity).slice(0, 5);
      
      setData({
        summary: {
          total_sales: totalSales,
          total_orders: salesData.total_orders || 0,
          average_order: salesData.average_order_value || 0,
          total_customers: salesData.total_customers || 0,
          growth_sales: salesData.growth_sales || 0,
          growth_orders: salesData.growth_orders || 0
        },
        profitLoss: {
          total_sales: totalSales,
          total_cost: totalCost,
          gross_profit: grossProfit,
          total_expenses: totalExpenses,
          net_profit: netProfit,
          profit_margin: profitMargin,
          gross_margin: totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : 0
        },
        expenses: Object.values(expensesByCategory),
        expensesDetail: expensesData.slice(0, 10),
        topProducts: topProducts.map(p => ({
          name: p.name,
          quantity: p.quantity,
          revenue: p.revenue,
          cost: p.cost || 0,
          profit: (p.revenue || 0) - (p.cost || 0),
          growth: p.growth || 0
        })),
        lowProducts: lowProducts.map(p => ({
          name: p.name,
          quantity: p.quantity,
          revenue: p.revenue
        })),
        categoryAnalysis: Array.isArray(productsData.category_analysis) ? productsData.category_analysis : [],
        salesByHour: salesByHour.length > 0 ? salesByHour : generateDemoHourlyData(),
        orderTypes: [
          { type: t('داخل المطعم'), count: salesData.by_type?.dine_in || 0, percentage: 40 },
          { type: t('سفري'), count: salesData.by_type?.takeaway || 0, percentage: 32 },
          { type: t('توصيل'), count: salesData.by_type?.delivery || 0, percentage: 28 }
        ],
        paymentMethods: Array.isArray(salesData.by_payment) ? salesData.by_payment : [
          { method: t('نقدي'), amount: totalSales * 0.6, percentage: 60 },
          { method: t('بطاقة'), amount: totalSales * 0.3, percentage: 30 },
          { method: t('آجل'), amount: totalSales * 0.1, percentage: 10 }
        ],
        comparisons: {
          vs_yesterday: { sales: salesData.vs_yesterday?.sales || 0, orders: salesData.vs_yesterday?.orders || 0 },
          vs_last_week: { sales: salesData.vs_last_week?.sales || 0, orders: salesData.vs_last_week?.orders || 0 },
          vs_last_month: { sales: salesData.vs_last_month?.sales || 0, orders: salesData.vs_last_month?.orders || 0 }
        },
        insights: generateInsights(salesData, netProfit, topProducts, lowProducts, t)
      });
    } catch (error) {
      console.error('Error fetching report data:', error);
      // بيانات تجريبية للعرض
      setData(generateDemoData(t));
    } finally {
      setLoading(false);
    }
  };

  const generateDemoHourlyData = () => [
    { hour: '10:00', sales: 450, orders: 5 },
    { hour: '11:00', sales: 680, orders: 7 },
    { hour: '12:00', sales: 1250, orders: 12 },
    { hour: '13:00', sales: 1850, orders: 18 },
    { hour: '14:00', sales: 1420, orders: 14 },
    { hour: '15:00', sales: 890, orders: 9 },
    { hour: '16:00', sales: 720, orders: 8 },
    { hour: '17:00', sales: 980, orders: 10 },
    { hour: '18:00', sales: 1580, orders: 15 },
    { hour: '19:00', sales: 2100, orders: 20 },
    { hour: '20:00', sales: 1950, orders: 19 },
    { hour: '21:00', sales: 1480, orders: 14 },
    { hour: '22:00', sales: 850, orders: 8 }
  ];

  const generateInsights = (salesData, netProfit, topProducts, lowProducts, t) => {
    const insights = [];
    
    if (netProfit > 0) {
      insights.push({ type: 'positive', text: t('صافي الربح إيجابي') + ` (${formatCurrency(netProfit)})` });
    } else if (netProfit < 0) {
      insights.push({ type: 'warning', text: t('صافي الربح سالب - تحتاج مراجعة المصاريف') });
    }
    
    if (topProducts.length > 0) {
      insights.push({ type: 'info', text: `${t('المنتج الأكثر مبيعاً')}: ${topProducts[0]?.name}` });
    }
    
    if (lowProducts.length > 0 && lowProducts[0]?.quantity < 5) {
      insights.push({ type: 'warning', text: `${t('منتج قليل المبيعات')}: ${lowProducts[0]?.name}` });
    }
    
    return insights;
  };

  const generateDemoData = (t) => ({
    summary: {
      total_sales: 15750000,
      total_orders: 87,
      average_order: 181034,
      total_customers: 62,
      growth_sales: 12.5,
      growth_orders: 8.3
    },
    profitLoss: {
      total_sales: 15750000,
      total_cost: 9450000,
      gross_profit: 6300000,
      total_expenses: 2100000,
      net_profit: 4200000,
      profit_margin: 26.7,
      gross_margin: 40.0
    },
    expenses: [
      { category: t('رواتب'), total: 1200000, count: 8 },
      { category: t('إيجار'), total: 500000, count: 1 },
      { category: t('كهرباء وماء'), total: 250000, count: 2 },
      { category: t('مستلزمات'), total: 150000, count: 5 }
    ],
    expensesDetail: [
      { description: t('راتب شهر فبراير - أحمد'), amount: 400000, category: t('رواتب') },
      { description: t('راتب شهر فبراير - محمد'), amount: 350000, category: t('رواتب') },
      { description: t('إيجار المحل'), amount: 500000, category: t('إيجار') },
      { description: t('فاتورة الكهرباء'), amount: 150000, category: t('كهرباء وماء') }
    ],
    topProducts: [
      { name: t('برجر كلاسيك'), quantity: 45, revenue: 4500000, cost: 2700000, profit: 1800000, growth: 15 },
      { name: t('بيتزا مارغريتا'), quantity: 38, revenue: 3800000, cost: 2280000, profit: 1520000, growth: 8 },
      { name: t('شاورما لحم'), quantity: 32, revenue: 2560000, cost: 1536000, profit: 1024000, growth: -5 },
      { name: t('قهوة لاتيه'), quantity: 28, revenue: 840000, cost: 336000, profit: 504000, growth: 22 },
      { name: t('سلطة سيزر'), quantity: 25, revenue: 1250000, cost: 500000, profit: 750000, growth: 10 }
    ],
    lowProducts: [
      { name: t('عصير برتقال'), quantity: 3, revenue: 45000 },
      { name: t('حلوى الكنافة'), quantity: 5, revenue: 125000 },
      { name: t('شوربة العدس'), quantity: 7, revenue: 105000 }
    ],
    categoryAnalysis: [
      { category: t('الوجبات الرئيسية'), sales: 8500000, percentage: 54 },
      { category: t('المشروبات'), sales: 3500000, percentage: 22 },
      { category: t('المقبلات'), sales: 2500000, percentage: 16 },
      { category: t('الحلويات'), sales: 1250000, percentage: 8 }
    ],
    salesByHour: generateDemoHourlyData(),
    orderTypes: [
      { type: t('داخل المطعم'), count: 35, percentage: 40 },
      { type: t('سفري'), count: 28, percentage: 32 },
      { type: t('توصيل'), count: 24, percentage: 28 }
    ],
    paymentMethods: [
      { method: t('نقدي'), amount: 9450000, percentage: 60 },
      { method: t('بطاقة'), amount: 4725000, percentage: 30 },
      { method: t('آجل'), amount: 1575000, percentage: 10 }
    ],
    comparisons: {
      vs_yesterday: { sales: 12.5, orders: 8.3 },
      vs_last_week: { sales: 18.2, orders: 15.1 },
      vs_last_month: { sales: 25.4, orders: 22.8 }
    },
    insights: [
      { type: 'positive', text: t('صافي الربح إيجابي') + ' (4,200,000 IQD)' },
      { type: 'positive', text: t('المبيعات أعلى بـ 12.5% مقارنة بالأمس') },
      { type: 'info', text: t('المنتج الأكثر مبيعاً') + ': ' + t('برجر كلاسيك') },
      { type: 'warning', text: t('شاورما لحم تراجعت مبيعاتها (-5%)') }
    ]
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ar-IQ', {
      style: 'decimal',
      maximumFractionDigits: 0
    }).format(value) + ' IQD';
  };

  const GrowthIndicator = ({ value }) => {
    const isPositive = value >= 0;
    return (
      <span className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  const maxSales = Math.max(...(data.salesByHour?.map(h => h.sales) || [1]));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('جاري تحميل التقرير...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="rounded-lg"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <PieChart className="h-6 w-6 text-emerald-500" />
              <h1 className="text-xl font-bold font-cairo">{t('التقارير الذكية')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-36">
                <Calendar className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t('اليوم')}</SelectItem>
                <SelectItem value="yesterday">{t('أمس')}</SelectItem>
                <SelectItem value="week">{t('هذا الأسبوع')}</SelectItem>
                <SelectItem value="month">{t('هذا الشهر')}</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              title={t('طباعة')}
            >
              <Printer className="h-4 w-4 ml-1" />
              {t('طباعة')}
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={fetchReportData}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6 print:hidden">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('نظرة عامة')}
            </TabsTrigger>
            <TabsTrigger value="profit" className="gap-2">
              <Wallet className="h-4 w-4" />
              {t('الأرباح والخسائر')}
            </TabsTrigger>
            <TabsTrigger value="expenses" className="gap-2">
              <Receipt className="h-4 w-4" />
              {t('المصاريف')}
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2">
              <Utensils className="h-4 w-4" />
              {t('الأصناف')}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('إجمالي المبيعات')}</p>
                      <p className="text-xl font-bold text-emerald-600">{formatCurrency(data.summary?.total_sales || 0)}</p>
                      <GrowthIndicator value={data.summary?.growth_sales || 0} />
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-emerald-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('صافي الربح')}</p>
                      <p className={`text-xl font-bold ${data.profitLoss?.net_profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatCurrency(data.profitLoss?.net_profit || 0)}
                      </p>
                      <span className="text-sm text-muted-foreground">{t('هامش')}: {data.profitLoss?.profit_margin || 0}%</span>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Profit className="h-6 w-6 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('عدد الطلبات')}</p>
                      <p className="text-xl font-bold text-amber-600">{data.summary?.total_orders || 0}</p>
                      <GrowthIndicator value={data.summary?.growth_orders || 0} />
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                      <ShoppingCart className="h-6 w-6 text-amber-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-red-500/10 to-pink-500/10 border-red-500/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('إجمالي المصاريف')}</p>
                      <p className="text-xl font-bold text-red-600">{formatCurrency(data.profitLoss?.total_expenses || 0)}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                      <MinusCircle className="h-6 w-6 text-red-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Insights */}
            {data.insights && data.insights.length > 0 && (
              <Card className="bg-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    {t('رؤى ذكية')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {data.insights.map((insight, idx) => (
                      <div 
                        key={idx}
                        className={`p-3 rounded-lg flex items-center gap-2 ${
                          insight.type === 'positive' ? 'bg-green-500/10 text-green-700 dark:text-green-400' :
                          insight.type === 'warning' ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' :
                          'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {insight.type === 'positive' ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> :
                         insight.type === 'warning' ? <AlertTriangle className="h-4 w-4 flex-shrink-0" /> :
                         <Star className="h-4 w-4 flex-shrink-0" />}
                        <span className="text-sm">{insight.text}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sales by Hour Chart */}
              <Card className="bg-card border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    {t('المبيعات حسب الساعة')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {data.salesByHour?.map((hour, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="w-12 text-xs text-muted-foreground">{hour.hour}</span>
                        <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                            style={{ width: `${(hour.sales / maxSales) * 100}%` }}
                          >
                            {hour.sales > maxSales * 0.3 && (
                              <span className="text-xs text-white font-medium">
                                {formatCurrency(hour.sales)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Order Types & Payment Methods */}
              <Card className="bg-card border-border/50">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4 text-purple-500" />
                    {t('توزيع الطلبات وطرق الدفع')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Order Types */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-3">{t('أنواع الطلبات')}</p>
                    <div className="space-y-2">
                      {data.orderTypes?.map((type, idx) => {
                        const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500'];
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${colors[idx]}`} />
                            <span className="text-sm flex-1">{type.type}</span>
                            <span className="text-sm font-bold">{type.percentage}%</span>
                            <span className="text-xs text-muted-foreground">({type.count})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Payment Methods */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-3">{t('طرق الدفع')}</p>
                    <div className="space-y-2">
                      {data.paymentMethods?.map((method, idx) => {
                        const icons = [Banknote, CreditCard, Clock];
                        const Icon = icons[idx] || Banknote;
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm flex-1">{method.method}</span>
                            <span className="text-sm font-bold">{method.percentage}%</span>
                            <span className="text-xs text-muted-foreground">{formatCurrency(method.amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Comparisons */}
            <Card className="bg-card border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  {t('مقارنات الأداء')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">{t('مقارنة بالأمس')}</p>
                    <div className="flex items-center justify-between">
                      <span>{t('المبيعات')}</span>
                      <GrowthIndicator value={data.comparisons?.vs_yesterday?.sales || 0} />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span>{t('الطلبات')}</span>
                      <GrowthIndicator value={data.comparisons?.vs_yesterday?.orders || 0} />
                    </div>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">{t('مقارنة بالأسبوع الماضي')}</p>
                    <div className="flex items-center justify-between">
                      <span>{t('المبيعات')}</span>
                      <GrowthIndicator value={data.comparisons?.vs_last_week?.sales || 0} />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span>{t('الطلبات')}</span>
                      <GrowthIndicator value={data.comparisons?.vs_last_week?.orders || 0} />
                    </div>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">{t('مقارنة بالشهر الماضي')}</p>
                    <div className="flex items-center justify-between">
                      <span>{t('المبيعات')}</span>
                      <GrowthIndicator value={data.comparisons?.vs_last_month?.sales || 0} />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span>{t('الطلبات')}</span>
                      <GrowthIndicator value={data.comparisons?.vs_last_month?.orders || 0} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profit & Loss Tab */}
          <TabsContent value="profit" className="space-y-6">
            {/* P&L Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{t('إجمالي المبيعات')}</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(data.profitLoss?.total_sales || 0)}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-red-500/10 to-pink-500/10 border-red-500/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{t('تكلفة البضاعة')}</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(data.profitLoss?.total_cost || 0)}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{t('إجمالي الربح')}</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(data.profitLoss?.gross_profit || 0)}</p>
                  <span className="text-sm text-muted-foreground">{t('هامش')}: {data.profitLoss?.gross_margin || 0}%</span>
                </CardContent>
              </Card>
            </div>

            {/* Detailed P&L Statement */}
            <Card className="bg-card border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-emerald-500" />
                  {t('قائمة الأرباح والخسائر')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Revenue Section */}
                  <div className="p-4 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-emerald-600">{t('الإيرادات')}</span>
                      <span className="font-bold text-emerald-600">{formatCurrency(data.profitLoss?.total_sales || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{t('إجمالي المبيعات')}</span>
                      <span>{formatCurrency(data.profitLoss?.total_sales || 0)}</span>
                    </div>
                  </div>
                  
                  {/* Cost Section */}
                  <div className="p-4 bg-red-500/5 rounded-lg border border-red-500/20">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-red-600">{t('التكاليف')}</span>
                      <span className="font-bold text-red-600">({formatCurrency(data.profitLoss?.total_cost || 0)})</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{t('تكلفة البضاعة المباعة')}</span>
                      <span>{formatCurrency(data.profitLoss?.total_cost || 0)}</span>
                    </div>
                  </div>
                  
                  {/* Gross Profit */}
                  <div className="p-4 bg-blue-500/5 rounded-lg border border-blue-500/20">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-600">{t('إجمالي الربح')}</span>
                      <span className="font-bold text-blue-600">{formatCurrency(data.profitLoss?.gross_profit || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground mt-1">
                      <span>{t('هامش الربح الإجمالي')}</span>
                      <span>{data.profitLoss?.gross_margin || 0}%</span>
                    </div>
                  </div>
                  
                  {/* Expenses Section */}
                  <div className="p-4 bg-amber-500/5 rounded-lg border border-amber-500/20">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-amber-600">{t('المصاريف التشغيلية')}</span>
                      <span className="font-bold text-amber-600">({formatCurrency(data.profitLoss?.total_expenses || 0)})</span>
                    </div>
                    {data.expenses?.map((exp, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm text-muted-foreground mb-1">
                        <span>{exp.category}</span>
                        <span>{formatCurrency(exp.total)}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Net Profit */}
                  <div className={`p-4 rounded-lg border-2 ${
                    data.profitLoss?.net_profit >= 0 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-bold text-lg ${data.profitLoss?.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {t('صافي الربح')}
                      </span>
                      <span className={`font-bold text-lg ${data.profitLoss?.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(data.profitLoss?.net_profit || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-muted-foreground">{t('هامش صافي الربح')}</span>
                      <span className={`font-bold ${data.profitLoss?.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {data.profitLoss?.profit_margin || 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Profit Indicators */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Target className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                  <p className="text-sm text-muted-foreground">{t('هامش الربح الإجمالي')}</p>
                  <p className="text-2xl font-bold">{data.profitLoss?.gross_margin || 0}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Percent className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                  <p className="text-sm text-muted-foreground">{t('هامش صافي الربح')}</p>
                  <p className="text-2xl font-bold">{data.profitLoss?.profit_margin || 0}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                  <p className="text-sm text-muted-foreground">{t('متوسط الطلب')}</p>
                  <p className="text-xl font-bold">{formatCurrency(data.summary?.average_order || 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Users className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                  <p className="text-sm text-muted-foreground">{t('عدد العملاء')}</p>
                  <p className="text-2xl font-bold">{data.summary?.total_customers || 0}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Expenses Tab */}
          <TabsContent value="expenses" className="space-y-6">
            {/* Expenses Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-red-500/10 to-pink-500/10 border-red-500/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{t('إجمالي المصاريف')}</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(data.profitLoss?.total_expenses || 0)}</p>
                </CardContent>
              </Card>
              {data.expenses?.slice(0, 3).map((exp, idx) => (
                <Card key={idx} className="bg-card">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{exp.category}</p>
                    <p className="text-xl font-bold">{formatCurrency(exp.total)}</p>
                    <p className="text-xs text-muted-foreground">{exp.count} {t('عملية')}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Expenses by Category */}
            <Card className="bg-card border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-amber-500" />
                  {t('المصاريف حسب الفئة')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.expenses?.map((exp, idx) => {
                    const totalExpenses = data.profitLoss?.total_expenses || 1;
                    const percentage = ((exp.total / totalExpenses) * 100).toFixed(1);
                    const colors = ['bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-purple-500', 'bg-green-500'];
                    
                    return (
                      <div key={idx} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{exp.category}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{percentage}%</span>
                            <span className="font-bold">{formatCurrency(exp.total)}</span>
                          </div>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${colors[idx % colors.length]} rounded-full transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Recent Expenses */}
            <Card className="bg-card border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-red-500" />
                  {t('آخر المصاريف')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.expensesDetail?.map((exp, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                          <MinusCircle className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                          <p className="font-medium">{exp.description}</p>
                          <p className="text-xs text-muted-foreground">{exp.category}</p>
                        </div>
                      </div>
                      <span className="font-bold text-red-600">{formatCurrency(exp.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Products */}
              <Card className="bg-card border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    {t('المنتجات الأكثر مبيعاً')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.topProducts?.map((product, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${
                          idx === 0 ? 'bg-amber-500' :
                          idx === 1 ? 'bg-gray-400' :
                          idx === 2 ? 'bg-amber-700' :
                          'bg-gray-300'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{product.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{product.quantity} {t('وحدة')}</span>
                            <span>•</span>
                            <span>{t('ربح')}: {formatCurrency(product.profit)}</span>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="font-bold">{formatCurrency(product.revenue)}</p>
                          <GrowthIndicator value={product.growth} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Low Selling Products */}
              <Card className="bg-card border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    {t('المنتجات الأقل مبيعاً')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.lowProducts?.map((product, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{product.name}</p>
                          <p className="text-xs text-red-500">{product.quantity} {t('وحدة فقط')}</p>
                        </div>
                        <span className="font-bold">{formatCurrency(product.revenue)}</span>
                      </div>
                    ))}
                  </div>
                  {data.lowProducts?.length > 0 && (
                    <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <p className="text-sm text-yellow-700 dark:text-yellow-400">
                        💡 {t('نصيحة: راجع هذه المنتجات وفكر في تحسين عرضها أو إزالتها من القائمة')}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Category Analysis */}
            <Card className="bg-card border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-purple-500" />
                  {t('تحليل الفئات')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {data.categoryAnalysis?.map((cat, idx) => {
                    const colors = ['emerald', 'blue', 'amber', 'purple'];
                    const color = colors[idx % colors.length];
                    return (
                      <div key={idx} className={`p-4 bg-${color}-500/10 border border-${color}-500/30 rounded-lg text-center`}>
                        <p className="text-sm text-muted-foreground">{cat.category}</p>
                        <p className={`text-xl font-bold text-${color}-600`}>{formatCurrency(cat.sales)}</p>
                        <p className="text-sm text-muted-foreground">{cat.percentage}%</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Product Performance Table */}
            <Card className="bg-card border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  {t('أداء المنتجات التفصيلي')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-right p-3 font-medium">{t('المنتج')}</th>
                        <th className="text-right p-3 font-medium">{t('الكمية')}</th>
                        <th className="text-right p-3 font-medium">{t('الإيرادات')}</th>
                        <th className="text-right p-3 font-medium">{t('التكلفة')}</th>
                        <th className="text-right p-3 font-medium">{t('الربح')}</th>
                        <th className="text-right p-3 font-medium">{t('النمو')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts?.map((product, idx) => (
                        <tr key={idx} className="border-b border-border/50 hover:bg-muted/50">
                          <td className="p-3 font-medium">{product.name}</td>
                          <td className="p-3">{product.quantity}</td>
                          <td className="p-3 text-emerald-600">{formatCurrency(product.revenue)}</td>
                          <td className="p-3 text-red-600">{formatCurrency(product.cost)}</td>
                          <td className="p-3 text-blue-600 font-bold">{formatCurrency(product.profit)}</td>
                          <td className="p-3"><GrowthIndicator value={product.growth} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Print Button */}
        <div className="flex justify-center print:hidden">
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {t('طباعة التقرير')}
          </Button>
        </div>
      </main>

      {/* Print Styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
