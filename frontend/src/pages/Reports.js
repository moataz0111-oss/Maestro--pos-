import React, { useState, useEffect } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice, formatPriceCompact } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import BranchSelector from '../components/BranchSelector';
import {
  ArrowRight,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  Truck,
  RefreshCw,
  PieChart,
  FileText,
  XCircle,
  Percent,
  CreditCard,
  Clock,
  Search,
  Target,
  Printer,
  FileSpreadsheet,
  Wallet,
  Receipt,
  Ban,
  Undo2,
  Users,
  Building2,
  Calculator,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  CheckCircle,
  CircleDollarSign,
  ChevronDown,
  User
} from 'lucide-react';
import { toast } from 'sonner';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { 
  printComprehensiveReport, 
  printSalesReport, 
  printProfitLossReport,
  printPurchasesReport,
  printExpensesReport,
  printProductsReport,
  printDeliveryReport,
  printCancellationsReport,
  printDiscountsReport,
  printRefundsReport,
  printCreditReport
} from '../utils/printReport';

const API = API_URL;

// مكون الرسم البياني الدائري البسيط
const SimplePieChart = ({ data, colors, size = 120 }) => {
  if (!data || data.length === 0) return null;
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return null;
  
  let currentAngle = 0;
  const segments = data.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    
    const x1 = 50 + 40 * Math.cos((startAngle - 90) * Math.PI / 180);
    const y1 = 50 + 40 * Math.sin((startAngle - 90) * Math.PI / 180);
    const x2 = 50 + 40 * Math.cos((startAngle + angle - 90) * Math.PI / 180);
    const y2 = 50 + 40 * Math.sin((startAngle + angle - 90) * Math.PI / 180);
    const largeArc = angle > 180 ? 1 : 0;
    
    return {
      ...item,
      percentage,
      path: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: colors[index % colors.length]
    };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100">
        {segments.map((seg, i) => (
          <path key={i} d={seg.path} fill={seg.color} stroke="white" strokeWidth="1" />
        ))}
        <circle cx="50" cy="50" r="20" fill="white" />
      </svg>
      <div className="space-y-1 text-xs">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }}></div>
            <span>{seg.label}: {seg.percentage.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// مكون شريط التقدم
const ProgressBar = ({ value, max, color = 'bg-primary', label }) => {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="font-medium">{percentage.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
};

// مكون بطاقة الإحصائية المحسنة
const StatBox = ({ icon: Icon, label, value, subValue, trend, color = 'primary' }) => {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    green: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
    red: 'bg-red-500/10 text-red-600 border-red-200',
    orange: 'bg-amber-500/10 text-amber-600 border-amber-200',
    blue: 'bg-blue-500/10 text-blue-600 border-blue-200',
    purple: 'bg-violet-500/10 text-violet-600 border-violet-200',
    gray: 'bg-slate-500/10 text-slate-600 border-slate-200'
  };
  
  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium opacity-80">{label}</p>
          <p className="text-xl font-bold mt-1">{value}</p>
          {subValue && <p className="text-xs opacity-70 mt-0.5">{subValue}</p>}
        </div>
        <Icon className="h-5 w-5 opacity-60" />
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          <span>{Math.abs(trend).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
};

// مكون التقرير الشامل المحسن
const ComprehensiveReportTab = ({ 
  salesReport, 
  purchasesReport,
  expensesReport, 
  profitLossReport, 
  productsReport,
  deliveryCreditsReport,
  cancellationsReport,
  discountsReport,
  creditReport,
  refundsReport,
  branchName,
  dateRange,
  t,
  formatPrice,
  loading,
  fetchAllReports,
  showBreakEvenReport,
  branches,
  selectedBranchId,
  onBranchChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange
}) => {
  const handlePrint = () => {
    printComprehensiveReport(
      {
        salesReport,
        purchasesReport,
        productsReport,
        expensesReport,
        profitLossReport,
        deliveryCreditsReport,
        cancellationsReport,
        discountsReport,
        creditReport,
        refundsReport
      },
      branchName,
      dateRange,
      t
    );
  };

  // بيانات الرسم البياني الدائري للمبيعات
  const paymentChartData = salesReport?.by_payment_method ? 
    Object.entries(salesReport.by_payment_method)
      .filter(([_, value]) => value > 0)
      .map(([label, value]) => ({ label, value }))
    : [];

  // بيانات الرسم البياني لنوع الطلب
  const orderTypeChartData = salesReport?.by_order_type ? [
    { label: t('داخلي'), value: salesReport.by_order_type.dine_in || 0 },
    { label: t('سفري'), value: salesReport.by_order_type.takeaway || 0 },
    { label: t('توصيل'), value: salesReport.by_order_type.delivery || 0 }
  ].filter(d => d.value > 0) : [];

  const totalIncome = salesReport?.total_sales || 0;
  const totalOutcome = (purchasesReport?.total_purchases || 0) + (expensesReport?.total_expenses || 0);
  const netProfit = profitLossReport?.net_profit?.amount || 0;
  const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* العنوان والأزرار والفلاتر */}
      <div className="bg-gradient-to-l from-primary/5 to-transparent p-4 rounded-xl space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              {t('التقرير الشامل')}
            </h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchAllReports} disabled={loading} variant="outline" size="sm" className="gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('تحديث')}
            </Button>
            <Button onClick={handlePrint} size="sm" className="gap-2 bg-primary hover:bg-primary/90">
              <Printer className="h-4 w-4" />
              {t('طباعة التقرير')}
            </Button>
          </div>
        </div>
        
        {/* فلاتر التاريخ والفرع */}
        <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-border/30">
          <div>
            <Label className="text-xs text-muted-foreground">{t('من تاريخ')}</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                onStartDateChange(e.target.value);
                // جلب البيانات بعد التغيير
                setTimeout(() => fetchAllReports(), 100);
              }}
              className="mt-1 w-[150px]"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t('إلى تاريخ')}</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                onEndDateChange(e.target.value);
                // جلب البيانات بعد التغيير
                setTimeout(() => fetchAllReports(), 100);
              }}
              className="mt-1 w-[150px]"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t('الفرع')}</Label>
            <Select value={selectedBranchId || 'all'} onValueChange={(val) => {
              onBranchChange(val);
              // جلب البيانات بعد التغيير
              setTimeout(() => fetchAllReports(), 100);
            }}>
              <SelectTrigger className="mt-1 w-[180px]">
                <Building2 className="h-4 w-4 ml-2" />
                <SelectValue placeholder={t('اختر الفرع')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('جميع الفروع')}</SelectItem>
                {branches?.map(branch => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* الملخص الرئيسي - 2 أو 3 بطاقات حسب الصلاحية */}
      <div className={`grid grid-cols-1 ${showBreakEvenReport !== false ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">{t('إجمالي الإيرادات')}</p>
                <p className="text-3xl font-bold mt-1">{formatPrice(totalIncome)}</p>
                <p className="text-xs mt-2 opacity-80">{salesReport?.total_orders || 0} {t('طلب')}</p>
              </div>
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                <TrendingUp className="h-7 w-7" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-rose-500 to-rose-600 text-white border-0 shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">{t('إجمالي المصروفات')}</p>
                <p className="text-3xl font-bold mt-1">{formatPrice(totalOutcome)}</p>
                <p className="text-xs mt-2 opacity-80">{t('مشتريات + مصاريف')}</p>
              </div>
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                <TrendingDown className="h-7 w-7" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* بطاقة صافي الربح - تظهر فقط إذا كانت صلاحية تقرير التحليل مفعلة */}
        {showBreakEvenReport !== false && (
          <Card className={`bg-gradient-to-br ${netProfit >= 0 ? 'from-blue-500 to-blue-600' : 'from-gray-600 to-gray-700'} text-white border-0 shadow-lg`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">{t('صافي الربح')}</p>
                  <p className="text-3xl font-bold mt-1">{formatPrice(netProfit)}</p>
                  <p className="text-xs mt-2 opacity-80">{t('هامش الربح')}: {profitMargin.toFixed(1)}%</p>
                </div>
                <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                  <Calculator className="h-7 w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* الإحصائيات التفصيلية */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBox 
          icon={Wallet} 
          label={t('المبيعات النقدية')} 
          value={formatPrice(salesReport?.by_payment_method?.['نقدي'] || 0)} 
          color="green"
        />
        <StatBox 
          icon={CreditCard} 
          label={t('مبيعات البطاقة')} 
          value={formatPrice(salesReport?.by_payment_method?.['بطاقة'] || 0)} 
          color="blue"
        />
        <StatBox 
          icon={Receipt} 
          label={t('المبيعات الآجلة')} 
          value={formatPrice(salesReport?.by_payment_method?.['آجل'] || 0)} 
          color="orange"
        />
        <StatBox 
          icon={ShoppingCart} 
          label={t('المشتريات')} 
          value={formatPrice(purchasesReport?.total_purchases || 0)} 
          color="red"
        />
        <StatBox 
          icon={Banknote} 
          label={t('المصاريف')} 
          value={formatPrice(expensesReport?.total_expenses || 0)} 
          color="orange"
        />
        <StatBox 
          icon={Truck} 
          label={t('عمولات التوصيل')} 
          value={formatPrice(deliveryCreditsReport?.total_commission || 0)} 
          color="purple"
        />
      </div>

      {/* الرسوم البيانية والتفاصيل */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* رسم بياني - توزيع المبيعات */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              {t('توزيع المبيعات حسب طريقة الدفع')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimplePieChart 
              data={paymentChartData} 
              colors={['#10b981', '#3b82f6', '#f59e0b']} 
              size={140}
            />
          </CardContent>
        </Card>

        {/* رسم بياني - توزيع نوع الطلب */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {t('توزيع المبيعات حسب نوع الطلب')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimplePieChart 
              data={orderTypeChartData} 
              colors={['#6366f1', '#22c55e', '#f97316']} 
              size={140}
            />
          </CardContent>
        </Card>
      </div>

      {/* التفاصيل في 3 أعمدة */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* الآجل */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('حسابات الآجل')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('الإجمالي')}</span>
              <span className="font-bold">{formatPrice(creditReport?.total_credit || 0)}</span>
            </div>
            <ProgressBar 
              value={creditReport?.total_paid || 0} 
              max={creditReport?.total_credit || 1} 
              color="bg-emerald-500" 
              label={t('المدفوع')} 
            />
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium text-red-600">{t('المتبقي')}</span>
              <span className="font-bold text-red-600">{formatPrice(creditReport?.total_remaining || 0)}</span>
            </div>
          </CardContent>
        </Card>

        {/* شركات التوصيل */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('شركات التوصيل')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('المبيعات')}</span>
              <span className="font-bold">{formatPrice(deliveryCreditsReport?.total_sales || deliveryCreditsReport?.total_credit || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('العمولات')}</span>
              <span className="font-medium text-red-500">-{formatPrice(deliveryCreditsReport?.total_commission || 0)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium text-emerald-600">{t('المستحق')}</span>
              <span className="font-bold text-emerald-600">{formatPrice(deliveryCreditsReport?.net_receivable || 0)}</span>
            </div>
          </CardContent>
        </Card>

        {/* الإلغاءات والخصومات */}
        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('الإلغاءات والخصومات')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Ban className="h-3 w-3" /> {t('الإلغاءات')}
              </span>
              <span className="font-medium text-red-500">{cancellationsReport?.total_cancelled || 0} ({formatPrice(cancellationsReport?.total_value || 0)})</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Percent className="h-3 w-3" /> {t('الخصومات')}
              </span>
              <span className="font-medium text-amber-500">{formatPrice(discountsReport?.total_discounts || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Undo2 className="h-3 w-3" /> {t('المرتجعات')}
              </span>
              <span className="font-medium text-purple-500">{refundsReport?.total_count || 0} ({formatPrice(refundsReport?.total_amount || 0)})</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* أكثر المنتجات مبيعاً */}
      {productsReport?.products?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              {t('أكثر الأصناف مبيعاً')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {productsReport.products.slice(0, 5).map((product, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                  <span className="w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.quantity_sold} {t('وحدة')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// مكون التقرير الذكي
const SmartReportTab = ({ t, formatPrice, selectedBranchId, branches, getBranchIdForApi }) => {
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('today');
  const [smartBranchId, setSmartBranchId] = useState(selectedBranchId || 'all');
  const [data, setData] = useState({
    summary: { total_sales: 0, total_orders: 0, average_order: 0 },
    topProducts: [],
    salesByHour: [],
    orderTypes: [],
    insights: []
  });

  const fetchSmartReport = async () => {
    setLoading(true);
    try {
      const branchParam = smartBranchId && smartBranchId !== 'all' ? `&branch_id=${smartBranchId}` : '';
      const [salesRes, productsRes, hourlyRes] = await Promise.all([
        axios.get(`${API}/smart-reports/sales?period=${period}${branchParam}`),
        axios.get(`${API}/smart-reports/products?period=${period}${branchParam}`),
        axios.get(`${API}/smart-reports/hourly?${branchParam.slice(1)}`)
      ]);

      const salesData = salesRes.data || {};
      const productsData = productsRes.data || {};
      const hourlyData = hourlyRes.data || {};

      const salesByHour = Object.entries(hourlyData.hourly || {}).map(([hour, d]) => ({
        hour: `${hour}:00`,
        sales: d.sales || 0
      }));

      setData({
        summary: {
          total_sales: salesData.total_sales || 0,
          total_orders: salesData.total_orders || 0,
          average_order: salesData.average_order_value || 0,
          growth_sales: 0,
          growth_orders: 0
        },
        topProducts: (productsData.top_products || []).slice(0, 5).map(p => ({
          name: p.name,
          quantity: p.quantity,
          revenue: p.revenue
        })),
        salesByHour: salesByHour.length > 0 ? salesByHour : [],
        orderTypes: [
          { type: t('داخلي'), count: salesData.by_type?.dine_in || 0 },
          { type: t('سفري'), count: salesData.by_type?.takeaway || 0 },
          { type: t('توصيل'), count: salesData.by_type?.delivery || 0 }
        ],
        insights: []
      });
    } catch (error) {
      console.error('Smart report error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSmartReport();
  }, [period, smartBranchId]);

  const maxSales = Math.max(...(data.salesByHour?.map(h => h.sales) || [1]));
  const totalOrders = data.orderTypes.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="space-y-6">
      {/* العنوان والفلاتر */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-l from-emerald-500/5 to-transparent p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-emerald-500" />
          <h2 className="text-xl font-bold">{t('التقرير الذكي')}</h2>
        </div>
        <div className="flex items-center gap-3">
          {/* اختيار الفرع */}
          <Select value={smartBranchId} onValueChange={setSmartBranchId}>
            <SelectTrigger className="w-40">
              <Building2 className="h-4 w-4 ml-2" />
              <SelectValue placeholder={t('الفرع')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('جميع الفروع')}</SelectItem>
              {branches?.map(branch => (
                <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* اختيار الفترة */}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36">
              <Clock className="h-4 w-4 ml-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t('اليوم')}</SelectItem>
              <SelectItem value="yesterday">{t('أمس')}</SelectItem>
              <SelectItem value="week">{t('هذا الأسبوع')}</SelectItem>
              <SelectItem value="month">{t('هذا الشهر')}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchSmartReport} disabled={loading} variant="outline" size="sm">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* الملخص */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0">
          <CardContent className="p-5">
            <p className="text-sm opacity-90">{t('إجمالي المبيعات')}</p>
            <p className="text-3xl font-bold mt-1">{formatPrice(data.summary.total_sales)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-5">
            <p className="text-sm opacity-90">{t('عدد الطلبات')}</p>
            <p className="text-3xl font-bold mt-1">{data.summary.total_orders}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-500 to-violet-600 text-white border-0">
          <CardContent className="p-5">
            <p className="text-sm opacity-90">{t('متوسط الطلب')}</p>
            <p className="text-3xl font-bold mt-1">{formatPrice(data.summary.average_order)}</p>
          </CardContent>
        </Card>
      </div>

      {/* المخططات */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* مخطط المبيعات بالساعة */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {t('المبيعات حسب الساعة')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.salesByHour.length > 0 ? (
              <div className="space-y-2">
                {data.salesByHour.slice(0, 8).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-xs w-12 text-muted-foreground">{item.hour}</span>
                    <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-l from-emerald-500 to-emerald-400 rounded-full transition-all"
                        style={{ width: `${(item.sales / maxSales) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-20 text-left">{formatPrice(item.sales)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('لا توجد بيانات')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* توزيع الطلبات */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              {t('توزيع الطلبات')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.orderTypes.map((item, idx) => {
                const percentage = totalOrders > 0 ? ((item.count / totalOrders) * 100).toFixed(0) : 0;
                const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500'];
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{item.type}</span>
                      <span className="font-medium">{item.count} ({percentage}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${colors[idx]} transition-all`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* الأصناف الأكثر مبيعاً */}
      {data.topProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              {t('الأصناف الأكثر مبيعاً')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {data.topProducts.map((product, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.quantity} × {formatPrice(product.revenue / (product.quantity || 1))}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ===================== Credit Report Tab (تبويب الآجل) =====================
const CreditReportTab = ({ creditReport, t, formatPrice, fetchReports, handlePrintCreditReport }) => {
  const [showCollectDialog, setShowCollectDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [collectForm, setCollectForm] = useState({
    amount: '',
    collected_by: '',
    notes: ''
  });
  const [collecting, setCollecting] = useState(false);

  const handleOpenCollect = (order) => {
    setSelectedOrder(order);
    setCollectForm({
      amount: order.remaining_amount || order.total,
      collected_by: '',
      notes: ''
    });
    setShowCollectDialog(true);
  };

  const handleCollect = async () => {
    if (!collectForm.amount || !collectForm.collected_by) {
      toast.error(t('يرجى إدخال المبلغ واسم المستلم'));
      return;
    }
    
    setCollecting(true);
    try {
      await axios.post(`${API}/reports/credit/collect`, {
        order_id: selectedOrder.id,
        amount: parseFloat(collectForm.amount),
        collected_by: collectForm.collected_by,
        notes: collectForm.notes
      });
      toast.success(t('تم تسجيل التحصيل بنجاح'));
      setShowCollectDialog(false);
      fetchReports();
    } catch (error) {
      console.error('Collection error:', error);
      toast.error(t('فشل في تسجيل التحصيل'));
    } finally {
      setCollecting(false);
    }
  };

  if (!creditReport) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('إجمالي الآجل')}</p>
                <p className="text-2xl font-bold text-blue-600">{formatPrice(creditReport.total_credit)}</p>
              </div>
              <CreditCard className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('عدد الطلبات')}</p>
                <p className="text-2xl font-bold text-purple-600">{creditReport.total_orders}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('تم التحصيل')}</p>
                <p className="text-2xl font-bold text-green-600">{formatPrice(creditReport.collected_amount)}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('المتبقي')}</p>
                <p className="text-2xl font-bold text-red-600">{formatPrice(creditReport.remaining_amount)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-500" />
            {t('الطلبات الآجلة')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right p-3 text-muted-foreground">#</th>
                  <th className="text-right p-3 text-muted-foreground">{t('التاريخ')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('العميل')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('الهاتف')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('المبلغ')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('المحصل')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('المتبقي')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('الحالة')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('إجراء')}</th>
                </tr>
              </thead>
              <tbody>
                {creditReport.orders?.map(order => (
                  <tr key={order.id} className="border-b border-border/50 hover:bg-blue-500/5">
                    <td className="p-3 font-medium text-foreground">#{order.order_number}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString('ar-IQ')}
                    </td>
                    <td className="p-3 text-foreground">{order.customer_name || '-'}</td>
                    <td className="p-3 text-muted-foreground">{order.customer_phone || '-'}</td>
                    <td className="p-3 tabular-nums text-blue-500 font-medium">{formatPrice(order.total)}</td>
                    <td className="p-3 tabular-nums text-green-500">{formatPrice(order.collected_amount || 0)}</td>
                    <td className="p-3 tabular-nums text-red-500">{formatPrice(order.remaining_amount || order.total)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        order.is_fully_collected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                      }`}>
                        {order.is_fully_collected ? t('تم التحصيل') : t('لم يحصل')}
                      </span>
                    </td>
                    <td className="p-3">
                      {!order.is_fully_collected && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenCollect(order)}
                          className="gap-1 text-green-600 border-green-600 hover:bg-green-50"
                          data-testid={`collect-btn-${order.order_number}`}
                        >
                          <CircleDollarSign className="h-4 w-4" />
                          {t('تحصيل')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!creditReport.orders || creditReport.orders.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('لا توجد طلبات آجلة في هذه الفترة')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={handlePrintCreditReport} className="gap-2">
          <Printer className="h-4 w-4" />
          {t('طباعة التقرير')}
        </Button>
      </div>

      {/* Dialog تحصيل الآجل */}
      <Dialog open={showCollectDialog} onOpenChange={setShowCollectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-green-500" />
              {t('تحصيل مبلغ آجل')}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">{t('الطلب')}: <span className="font-bold">#{selectedOrder.order_number}</span></p>
                <p className="text-sm text-muted-foreground">{t('العميل')}: <span className="font-medium">{selectedOrder.customer_name || '-'}</span></p>
                <p className="text-sm text-muted-foreground">{t('المبلغ الكلي')}: <span className="font-bold text-blue-600">{formatPrice(selectedOrder.total)}</span></p>
                <p className="text-sm text-muted-foreground">{t('المتبقي للتحصيل')}: <span className="font-bold text-red-600">{formatPrice(selectedOrder.remaining_amount || selectedOrder.total)}</span></p>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label>{t('المبلغ المحصل')}</Label>
                  <Input
                    type="number"
                    value={collectForm.amount}
                    onChange={(e) => setCollectForm({...collectForm, amount: e.target.value})}
                    placeholder={t('أدخل المبلغ')}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t('اسم المستلم')}</Label>
                  <Input
                    value={collectForm.collected_by}
                    onChange={(e) => setCollectForm({...collectForm, collected_by: e.target.value})}
                    placeholder={t('من استلم المبلغ')}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t('ملاحظات')} ({t('اختياري')})</Label>
                  <Input
                    value={collectForm.notes}
                    onChange={(e) => setCollectForm({...collectForm, notes: e.target.value})}
                    placeholder={t('أي ملاحظات إضافية')}
                    className="mt-1"
                  />
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm">
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t('التاريخ والوقت')}: {new Date().toLocaleString('ar-IQ')}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCollectDialog(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={handleCollect} disabled={collecting} className="bg-green-600 hover:bg-green-700">
              {collecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              <span className="mr-2">{t('تأكيد التحصيل')}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ===================== Cash Register Closing Report Tab (تبويب إغلاق الصندوق) =====================
const CashRegisterClosingTab = ({ t, formatPrice, selectedBranchId, branches, getBranchIdForApi }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  // فلاتر التاريخ الخاصة بتقرير إغلاق الصندوق
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [closingsHistory, setClosingsHistory] = useState([]);
  const [localBranchId, setLocalBranchId] = useState(selectedBranchId || '');
  const [viewMode, setViewMode] = useState('individual'); // 'individual' = كل شفت لوحده، 'all' = مجمّع
  const [expandedShift, setExpandedShift] = useState(null); // شفت مفتوح للتفاصيل

  // حساب النقد المعدود والفرق من الإغلاقات
  const totalCountedCash = closingsHistory.reduce((sum, c) => sum + (c.closing_cash || c.counted_cash || 0), 0);
  const totalExpectedCash = closingsHistory.reduce((sum, c) => sum + (c.expected_cash || 0), 0);
  const expectedCash = totalExpectedCash || report?.summary?.cash_sales || 0;
  const cashDifference = totalCountedCash - expectedCash;
  const isOverCash = cashDifference > 0;
  const isShortCash = cashDifference < 0;

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('start_date', dateRange.start);
      params.append('end_date', dateRange.end + 'T23:59:59');
      const branchId = localBranchId || getBranchIdForApi();
      if (branchId && branchId !== 'all') params.append('branch_id', branchId);
      
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const [reportRes, historyRes, shiftsRes, activeShiftsRes] = await Promise.all([
        axios.get(`${API_URL}/reports/cash-register-closing?${params}`, { headers }),
        axios.get(`${API_URL}/reports/cash-register-closings?${params}&limit=50`, { headers }),
        axios.get(`${API_URL}/shifts?status=closed${branchId && branchId !== 'all' ? '&branch_id=' + branchId : ''}`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/shifts?status=open${branchId && branchId !== 'all' ? '&branch_id=' + branchId : ''}`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setReport(reportRes.data);
      
      // دمج بيانات الإغلاقات: أولوية للشفتات (فيها تفاصيل أكثر)
      const closingsFromHistory = historyRes.data.closings || [];
      const closedShifts = (shiftsRes.data || []).filter(s => {
        // فلتر حسب التاريخ
        const closedAt = s.ended_at || s.closed_at || s.started_at || '';
        return closedAt >= dateRange.start && closedAt <= dateRange.end + 'T23:59:59';
      });
      
      // الشفتات النشطة (المفتوحة)
      const activeShifts = (activeShiftsRes.data || []).filter(s => {
        const startedAt = s.started_at || '';
        return startedAt >= dateRange.start && startedAt <= dateRange.end + 'T23:59:59';
      }).map(s => ({
        ...s,
        is_active: true,
        closed_at: null,
        status: 'open'
      }));
      
      // دمج الشفتات المغلقة والنشطة
      const allShifts = [...closedShifts, ...activeShifts];
      
      // استخدام الشفتات المغلقة كمصدر أساسي (فيها تفاصيل أكثر: denominations, delivery_app_sales, etc.)
      if (allShifts.length > 0) {
        setClosingsHistory(allShifts.map(s => ({
          ...s,
          closed_at: s.ended_at || s.closed_at || s.updated_at,
          actual_cash: s.closing_cash || s.actual_cash || 0,
          difference: (s.closing_cash || 0) - (s.expected_cash || 0),
          difference_type: ((s.closing_cash || 0) - (s.expected_cash || 0)) > 0 ? 'surplus' : ((s.closing_cash || 0) - (s.expected_cash || 0)) < 0 ? 'shortage' : 'exact'
        })));
      } else {
        setClosingsHistory(closingsFromHistory);
      }
    } catch (error) {
      console.error('Error fetching cash register report:', error);
      // لا نظهر رسالة خطأ إذا لم تكن هناك بيانات
      if (error.response?.status !== 404) {
        toast.error(t('فشل في جلب تقرير الصندوق'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [dateRange, localBranchId]);

  const getDifferenceColor = (diff) => {
    if (diff > 0) return 'text-emerald-400';
    if (diff < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getDifferenceLabel = (type) => {
    if (type === 'surplus') return t('زيادة');
    if (type === 'shortage') return t('نقص');
    return t('مطابق');
  };

  // طباعة التقرير
  const handlePrintReport = () => {
    const printContent = document.getElementById('cash-register-print-area');
    if (!printContent) return;
    
    const printWindow = window.open('', '_blank');
    const branch = branches.find(b => b.id === getBranchIdForApi());
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>تقرير إغلاق الصندوق</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Arial', sans-serif; }
          body { padding: 20px; background: white; color: black; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .header h1 { font-size: 24px; margin-bottom: 5px; }
          .header p { color: #666; font-size: 14px; }
          .section { margin: 15px 0; }
          .section-title { font-size: 16px; font-weight: bold; background: #f5f5f5; padding: 8px; margin-bottom: 10px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .row-label { color: #666; }
          .row-value { font-weight: bold; }
          .total-row { background: #f0f0f0; padding: 10px; font-size: 18px; margin-top: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          th { background: #f5f5f5; }
          .green { color: green; }
          .red { color: red; }
          .blue { color: blue; }
          .orange { color: orange; }
          .purple { color: purple; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>تقرير إغلاق الصندوق</h1>
          <p>${branch?.name || 'الفرع'} - ${dateRange.start} إلى ${dateRange.end}</p>
        </div>
        
        <div class="section">
          <div class="section-title">ملخص عام</div>
          <div class="row"><span class="row-label">إجمالي المبيعات</span><span class="row-value">${formatPrice(report?.summary?.total_sales || 0)}</span></div>
          <div class="row"><span class="row-label">عدد الطلبات</span><span class="row-value">${report?.summary?.total_orders || 0}</span></div>
          <div class="row"><span class="row-label">المصروفات</span><span class="row-value red">- ${formatPrice(report?.summary?.total_expenses || 0)}</span></div>
          <div class="total-row"><span>المتوقع في الصندوق:</span> <span class="green">${formatPrice(report?.summary?.expected_cash_in_drawer || 0)}</span></div>
        </div>
        
        <div class="section">
          <div class="section-title">حسب نوع الطلب</div>
          <div class="row"><span class="row-label">داخلي</span><span class="row-value">${formatPrice(report?.by_order_type?.dine_in?.total || 0)}</span></div>
          <div class="row"><span class="row-label">سفري</span><span class="row-value">${formatPrice(report?.by_order_type?.takeaway?.total || 0)}</span></div>
          <div class="row"><span class="row-label">توصيل</span><span class="row-value">${formatPrice(report?.by_order_type?.delivery?.total || 0)}</span></div>
        </div>
        
        <div class="section">
          <div class="section-title">حسب طريقة الدفع</div>
          <div class="row"><span class="row-label">نقدي</span><span class="row-value green">${formatPrice(report?.by_payment_method?.cash?.total || 0)}</span></div>
          <div class="row"><span class="row-label">بطاقة</span><span class="row-value blue">${formatPrice(report?.by_payment_method?.card?.total || 0)}</span></div>
          <div class="row"><span class="row-label">آجل</span><span class="row-value orange">${formatPrice(report?.by_payment_method?.credit?.total || 0)}</span></div>
          ${Object.entries(report?.delivery_apps || {}).map(([name, data]) => 
            `<div class="row"><span class="row-label">${name}</span><span class="row-value purple">${formatPrice(data.total || 0)}</span></div>`
          ).join('')}
        </div>
        
        ${report?.by_cashier && report.by_cashier.length > 0 ? `
        <div class="section">
          <div class="section-title">حسب الكاشير</div>
          <table>
            <thead><tr><th>الكاشير</th><th>الطلبات</th><th>الإجمالي</th><th>نقدي</th><th>بطاقة</th><th>آجل</th><th>توصيل</th></tr></thead>
            <tbody>
              ${report.by_cashier.map(c => `
                <tr>
                  <td>${c.cashier_name}</td>
                  <td>${c.orders_count}</td>
                  <td><strong>${formatPrice(c.total_sales)}</strong></td>
                  <td class="green">${formatPrice(c.cash)}</td>
                  <td class="blue">${formatPrice(c.card)}</td>
                  <td class="orange">${formatPrice(c.credit)}</td>
                  <td class="purple">${formatPrice(c.delivery)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}
        
        ${report?.expenses && report.expenses.items?.length > 0 ? `
        <div class="section">
          <div class="section-title">المصروفات (${formatPrice(report.expenses.total)})</div>
          <table>
            <thead><tr><th>الوصف</th><th>الكاشير</th><th>المبلغ</th></tr></thead>
            <tbody>
              ${report.expenses.items.map(e => `
                <tr>
                  <td>${e.description}</td>
                  <td>${e.created_by || '-'}</td>
                  <td class="red">${formatPrice(e.amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}
        
        <div style="margin-top: 30px; text-align: center; color: #999; font-size: 12px;">
          تم الطباعة: ${new Date().toLocaleString('ar-IQ')}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6" id="cash-register-print-area">
      {/* الفلاتر الخاصة بإغلاق الصندوق */}
      <div className="flex flex-wrap gap-4 items-end bg-gradient-to-r from-emerald-900/30 to-teal-900/30 p-4 rounded-xl border border-emerald-700/30">
        <div>
          <Label className="text-emerald-300">{t('من تاريخ')}</Label>
          <Input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="bg-gray-900/50 border-emerald-700/50 text-white w-40"
          />
        </div>
        <div>
          <Label className="text-emerald-300">{t('إلى تاريخ')}</Label>
          <Input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="bg-gray-900/50 border-emerald-700/50 text-white w-40"
          />
        </div>
        <div>
          <Label className="text-emerald-300">{t('الفرع')}</Label>
          <select
            value={localBranchId}
            onChange={(e) => setLocalBranchId(e.target.value)}
            className="bg-gray-900/50 border border-emerald-700/50 text-white rounded-md px-3 py-2 w-44"
          >
            <option value="">{t('جميع الفروع')}</option>
            {branches?.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
        <Button onClick={fetchReport} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
          {t('تحديث')}
        </Button>
        <Button onClick={handlePrintReport} className="bg-teal-600 hover:bg-teal-700">
          <Printer className="h-4 w-4 ml-2" />
          {t('طباعة')}
        </Button>
      </div>

      {/* زر التبديل بين العرض المجمّع والفردي */}
      {closingsHistory.length > 0 && (
        <div className="flex items-center gap-3 bg-gray-900/40 border border-emerald-700/30 rounded-lg p-3">
          <span className="text-sm text-emerald-300 font-medium">{t('طريقة العرض')}:</span>
          <div className="flex bg-gray-800/60 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('individual')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'individual' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              data-testid="view-individual-shifts"
            >
              {t('كل شفت بمفرده')} ({closingsHistory.length})
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'all' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              data-testid="view-all-shifts"
            >
              {t('مجمّع')}
            </button>
          </div>
        </div>
      )}

      {/* حقل النقد المعدود ومربعات Over/Short */}
      {report && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* النقد المعدود (الفعلي) - من الإغلاقات */}
          <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-700/30">
            <CardContent className="p-4">
              <Label className="text-blue-300 mb-2 block">{t('النقد المعدود (الفعلي)')}</Label>
              <p className="text-3xl font-bold text-white">{formatPrice(totalCountedCash)}</p>
              <p className="text-blue-300 text-sm mt-2">
                {t('النقدي المتوقع')}: <span className="font-bold text-white">{formatPrice(expectedCash)}</span>
              </p>
              {closingsHistory.length > 0 && (
                <p className="text-blue-400 text-xs mt-1">
                  {t('من')} {closingsHistory.length} {t('إغلاق')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Over Cash - زيادة */}
          <Card className={`bg-gradient-to-br ${isOverCash ? 'from-emerald-900/60 to-emerald-800/40 border-emerald-500' : 'from-emerald-900/20 to-emerald-800/10 border-emerald-700/30'} border-2 transition-all`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${isOverCash ? 'bg-emerald-500/30' : 'bg-emerald-500/10'}`}>
                  <TrendingUp className={`h-6 w-6 ${isOverCash ? 'text-emerald-400' : 'text-emerald-600'}`} />
                </div>
                <div>
                  <p className="text-sm text-emerald-300">{t('زيادة (Over Cash)')}</p>
                  <p className={`text-2xl font-bold ${isOverCash ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    {isOverCash ? '+' + formatPrice(cashDifference) : formatPrice(0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Short Cash - نقص */}
          <Card className={`bg-gradient-to-br ${isShortCash ? 'from-red-900/60 to-red-800/40 border-red-500' : 'from-red-900/20 to-red-800/10 border-red-700/30'} border-2 transition-all`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${isShortCash ? 'bg-red-500/30' : 'bg-red-500/10'}`}>
                  <TrendingDown className={`h-6 w-6 ${isShortCash ? 'text-red-400' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className="text-sm text-red-300">{t('نقص (Short Cash)')}</p>
                  <p className={`text-2xl font-bold ${isShortCash ? 'text-red-400' : 'text-red-600'}`}>
                    {isShortCash ? formatPrice(Math.abs(cashDifference)) : formatPrice(0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      ) : viewMode === 'individual' && closingsHistory.length > 0 ? (
        /* ========== عرض كل شفت بمفرده ========== */
        <div className="space-y-4">
          {closingsHistory.map((closing, idx) => {
            const isExpanded = expandedShift === idx;
            const diff = (closing.closing_cash || closing.actual_cash || 0) - (closing.expected_cash || 0);
            const diffType = diff > 0 ? 'surplus' : diff < 0 ? 'shortage' : 'exact';
            const shiftSales = closing.total_sales || 0;
            const shiftCash = closing.cash_sales || 0;
            const shiftCard = closing.card_sales || 0;
            const shiftCredit = closing.credit_sales || 0;
            const shiftExpenses = closing.total_expenses || 0;
            const shiftOrders = closing.total_orders || closing.orders_count || 0;
            
            return (
              <Card key={idx} className={`border transition-all cursor-pointer ${isExpanded ? 'border-emerald-500 bg-gray-900/60' : 'border-gray-700/40 bg-gray-900/30 hover:border-emerald-700/50'}`}>
                {/* رأس الشفت - يُضغط للفتح/الإغلاق */}
                <div
                  className="flex items-center justify-between p-4"
                  onClick={() => setExpandedShift(isExpanded ? null : idx)}
                  data-testid={`shift-header-${idx}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${diffType === 'surplus' ? 'bg-emerald-500/20 text-emerald-400' : diffType === 'shortage' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-bold text-white">{closing.cashier_name || t('كاشير')}</p>
                      <p className="text-sm text-gray-400">{closing.closed_at ? new Date(closing.closed_at).toLocaleString('ar-IQ') : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-left">
                      <p className="text-xs text-gray-400">{t('المبيعات')}</p>
                      <p className="font-bold text-white">{formatPrice(shiftSales)}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-gray-400">{t('الطلبات')}</p>
                      <p className="font-bold text-white">{shiftOrders}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-gray-400">{t('الفرق')}</p>
                      <p className={`font-bold ${diffType === 'surplus' ? 'text-emerald-400' : diffType === 'shortage' ? 'text-red-400' : 'text-gray-400'}`}>
                        {diff > 0 ? '+' : ''}{formatPrice(diff)}
                      </p>
                    </div>
                    <Badge className={diffType === 'surplus' ? 'bg-emerald-500/20 text-emerald-400' : diffType === 'shortage' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}>
                      {diffType === 'surplus' ? t('زيادة') : diffType === 'shortage' ? t('نقص') : t('مطابق')}
                    </Badge>
                    {closing.is_active && (
                      <Badge className="bg-green-500/30 text-green-400 animate-pulse">{t('نشط')}</Badge>
                    )}
                    <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>
                
                {/* تفاصيل الشفت الكاملة */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-700/30 pt-4">
                    {/* ملخص سريع */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-emerald-900/20 rounded-lg p-3 text-center">
                        <p className="text-xs text-emerald-300">{t('إجمالي المبيعات')}</p>
                        <p className="text-lg font-bold text-white">{formatPrice(shiftSales)}</p>
                      </div>
                      <div className="bg-teal-900/20 rounded-lg p-3 text-center">
                        <p className="text-xs text-teal-300">{t('المتوقع')}</p>
                        <p className="text-lg font-bold text-white">{formatPrice(closing.expected_cash || 0)}</p>
                      </div>
                      <div className="bg-blue-900/20 rounded-lg p-3 text-center">
                        <p className="text-xs text-blue-300">{t('الفعلي')}</p>
                        <p className="text-lg font-bold text-white">{formatPrice(closing.closing_cash || closing.actual_cash || 0)}</p>
                      </div>
                      <div className="bg-red-900/20 rounded-lg p-3 text-center">
                        <p className="text-xs text-red-300">{t('المصروفات')}</p>
                        <p className="text-lg font-bold text-white">{formatPrice(shiftExpenses)}</p>
                      </div>
                    </div>
                    
                    {/* طريقة الدفع + نوع الطلب */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-gray-800/30 rounded-lg p-3 space-y-2">
                        <p className="text-sm font-bold text-emerald-300 mb-2">{t('حسب طريقة الدفع')}</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{t('نقدي')}</span>
                          <span className="text-white font-medium">{formatPrice(shiftCash)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{t('بطاقة')}</span>
                          <span className="text-white font-medium">{formatPrice(shiftCard)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{t('آجل')}</span>
                          <span className="text-white font-medium">{formatPrice(shiftCredit)}</span>
                        </div>
                        {closing.delivery_app_sales && Object.entries(closing.delivery_app_sales).map(([app, amount]) => (
                          <div key={app} className="flex justify-between text-sm">
                            <span className="text-gray-300">{app}</span>
                            <span className="text-white font-medium">{formatPrice(typeof amount === 'object' ? amount : amount)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-gray-800/30 rounded-lg p-3 space-y-2">
                        <p className="text-sm font-bold text-teal-300 mb-2">{t('تفاصيل إضافية')}</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{t('الخصومات')}</span>
                          <span className="text-white font-medium">{formatPrice(closing.discounts_total || 0)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{t('الإلغاءات')}</span>
                          <span className="text-white font-medium">{closing.cancelled_orders || 0} ({formatPrice(closing.cancelled_amount || 0)})</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{t('المرتجعات')}</span>
                          <span className="text-white font-medium">{closing.refund_count || 0} ({formatPrice(closing.total_refunds || 0)})</span>
                        </div>
                        {closing.notes && (
                          <div className="mt-2 p-2 bg-gray-700/30 rounded text-sm text-gray-300">
                            {t('ملاحظات')}: {closing.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* فئات النقود */}
                    {closing.denominations && Object.keys(closing.denominations).length > 0 && (
                      <div className="bg-gray-800/30 rounded-lg p-3">
                        <p className="text-sm font-bold text-cyan-300 mb-2">{t('فئات النقود')}</p>
                        <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                          {Object.entries(closing.denominations).sort((a,b) => Number(a[0]) - Number(b[0])).map(([denom, count]) => (
                            count > 0 && (
                              <div key={denom} className="bg-gray-700/30 rounded p-2 text-center">
                                <p className="text-xs text-gray-400">{Number(denom).toLocaleString()}</p>
                                <p className="text-white font-bold">{count}</p>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    {/* تفاصيل المرتجعات */}
                    {closing.cancelled_by && closing.cancelled_by.length > 0 && (
                      <div className="bg-red-900/10 border border-red-700/20 rounded-lg p-3">
                        <p className="text-sm font-bold text-red-400 mb-2">{t('تفاصيل الإلغاءات')}</p>
                        <div className="space-y-2">
                          {closing.cancelled_by.map((item, ci) => (
                            <div key={ci} className="flex justify-between items-center text-sm bg-red-900/10 rounded p-2">
                              <div>
                                <p className="text-white font-medium">#{item.order_number || '?'}</p>
                                <p className="text-xs text-gray-400">{item.cancelled_by_name || item.cashier_name || ''}</p>
                              </div>
                              <p className="text-red-400 font-bold">{formatPrice(item.total || item.amount || 0)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(closing.refund_count > 0 || closing.total_refunds > 0) && (
                      <div className="bg-orange-900/10 border border-orange-700/20 rounded-lg p-3">
                        <p className="text-sm font-bold text-orange-400 mb-2">
                          {t('المرتجعات')}: {closing.refund_count || 0} ({formatPrice(closing.total_refunds || 0)})
                        </p>
                        <p className="text-xs text-gray-400">{t('المرتجعات تُخصم من إجمالي المبيعات ولا تحتسب في المصاريف')}</p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : report ? (
        <>
          {/* ملخص عام */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border-emerald-700/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <DollarSign className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-emerald-300">{t('إجمالي المبيعات')}</p>
                    <p className="text-xl font-bold text-white">{formatPrice(report.summary?.total_sales || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-teal-900/40 to-teal-800/20 border-teal-700/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-500/20 rounded-lg">
                    <ShoppingCart className="h-5 w-5 text-teal-400" />
                  </div>
                  <div>
                    <p className="text-sm text-teal-300">{t('عدد الطلبات')}</p>
                    <p className="text-xl font-bold text-white">{report.summary?.total_orders || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-900/40 to-red-800/20 border-red-700/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <Receipt className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-red-300">{t('المصروفات')}</p>
                    <p className="text-xl font-bold text-white">{formatPrice(report.summary?.total_expenses || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/20 border-cyan-700/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/20 rounded-lg">
                    <Wallet className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm text-cyan-300">{t('المتوقع في الصندوق')}</p>
                    <p className="text-xl font-bold text-white">{formatPrice(report.summary?.expected_cash_in_drawer || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* حسب نوع الطلب وطريقة الدفع */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* حسب نوع الطلب */}
            <Card className="bg-gradient-to-br from-gray-900/60 to-emerald-900/20 border-emerald-700/20">
              <CardHeader>
                <CardTitle className="text-lg text-emerald-300">{t('حسب نوع الطلب')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-2 rounded bg-gray-800/30">
                  <span className="text-gray-300 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-400" /> {t('داخلي')}
                  </span>
                  <span className="font-bold text-white">{formatPrice(report.by_order_type?.dine_in?.total || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-gray-800/30">
                  <span className="text-gray-300 flex items-center gap-2">
                    <Package className="h-4 w-4 text-teal-400" /> {t('سفري')}
                  </span>
                  <span className="font-bold text-white">{formatPrice(report.by_order_type?.takeaway?.total || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-gray-800/30">
                  <span className="text-gray-300 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-cyan-400" /> {t('توصيل')}
                  </span>
                  <span className="font-bold text-white">{formatPrice(report.by_order_type?.delivery?.total || 0)}</span>
                </div>
              </CardContent>
            </Card>

            {/* حسب طريقة الدفع */}
            <Card className="bg-gradient-to-br from-gray-900/60 to-teal-900/20 border-teal-700/20">
              <CardHeader>
                <CardTitle className="text-lg text-teal-300">{t('حسب طريقة الدفع')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-2 rounded bg-gray-800/30">
                  <span className="text-gray-300 flex items-center gap-2">
                    <Banknote className="h-4 w-4" /> {t('نقدي')}
                  </span>
                  <span className="font-bold text-emerald-400">{formatPrice(report.by_payment_method?.cash?.total || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-gray-800/30">
                  <span className="text-gray-300 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> {t('بطاقة')}
                  </span>
                  <span className="font-bold text-blue-400">{formatPrice(report.by_payment_method?.card?.total || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-gray-800/30">
                  <span className="text-gray-300 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> {t('آجل')}
                  </span>
                  <span className="font-bold text-orange-400">{formatPrice(report.by_payment_method?.credit?.total || 0)}</span>
                </div>
                {/* شركات التوصيل */}
                {Object.entries(report.delivery_apps || {}).map(([appName, data]) => (
                  <div key={appName} className="flex justify-between items-center p-2 rounded bg-gray-800/30">
                    <span className="text-gray-300 flex items-center gap-2">
                      <Truck className="h-4 w-4" /> {appName}
                    </span>
                    <span className="font-bold text-purple-400">{formatPrice(data.total || 0)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* حسب الكاشير */}
          {report.by_cashier && report.by_cashier.length > 0 && (
            <Card className="bg-gradient-to-br from-gray-900/60 to-cyan-900/20 border-cyan-700/20">
              <CardHeader>
                <CardTitle className="text-lg text-cyan-300 flex items-center gap-2">
                  <User className="h-5 w-5" /> {t('حسب الكاشير')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-cyan-300 border-b border-cyan-700/30">
                        <th className="text-right py-3">{t('الكاشير')}</th>
                        <th className="text-right py-3">{t('الطلبات')}</th>
                        <th className="text-right py-3">{t('الإجمالي')}</th>
                        <th className="text-right py-3">{t('نقدي')}</th>
                        <th className="text-right py-3">{t('بطاقة')}</th>
                        <th className="text-right py-3">{t('آجل')}</th>
                        <th className="text-right py-3">{t('توصيل')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_cashier.map((cashier, idx) => (
                        <tr key={idx} className="border-b border-gray-700/30 text-white hover:bg-gray-800/30">
                          <td className="py-3">{cashier.cashier_name}</td>
                          <td className="py-3">{cashier.orders_count}</td>
                          <td className="py-3 font-bold text-emerald-400">{formatPrice(cashier.total_sales)}</td>
                          <td className="py-3 text-green-400">{formatPrice(cashier.cash)}</td>
                          <td className="py-3 text-blue-400">{formatPrice(cashier.card)}</td>
                          <td className="py-3 text-orange-400">{formatPrice(cashier.credit)}</td>
                          <td className="py-3 text-purple-400">{formatPrice(cashier.delivery)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* المصروفات */}
          <Card className="bg-gradient-to-br from-gray-900/60 to-red-900/20 border-red-700/20">
            <CardHeader>
              <CardTitle className="text-lg text-red-300 flex items-center gap-2">
                <Receipt className="h-5 w-5" /> {t('المصروفات')} ({formatPrice(report?.expenses?.total || 0)})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report?.expenses?.items && report.expenses.items.length > 0 ? (
                <div className="space-y-2">
                  {report.expenses.items.map((expense, idx) => (
                    <div key={idx} className="flex justify-between items-center py-3 px-3 rounded bg-gray-800/30 border-b border-gray-700/30">
                      <div>
                        <span className="text-white">{expense.description}</span>
                        <span className="text-gray-500 text-sm mr-2">({expense.created_by || 'غير محدد'})</span>
                      </div>
                      <span className="text-red-400 font-bold">{formatPrice(expense.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">{t('لا توجد مصروفات')}</div>
              )}
            </CardContent>
          </Card>

          {/* سجل الإغلاقات السابقة */}
          {closingsHistory.length > 0 && (
            <Card className="bg-gradient-to-br from-gray-900/60 to-emerald-900/20 border-emerald-700/20">
              <CardHeader>
                <CardTitle className="text-lg text-emerald-300">{t('سجل إغلاقات الصندوق السابقة')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-emerald-300 border-b border-emerald-700/30">
                        <th className="text-right py-3">{t('التاريخ')}</th>
                        <th className="text-right py-3">{t('الكاشير')}</th>
                        <th className="text-right py-3">{t('المبيعات')}</th>
                        <th className="text-right py-3">{t('المتوقع')}</th>
                        <th className="text-right py-3">{t('الفعلي')}</th>
                        <th className="text-right py-3">{t('الفرق')}</th>
                        <th className="text-right py-3">{t('الحالة')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closingsHistory.map((closing, idx) => (
                        <tr key={idx} className="border-b border-gray-700/30 text-white hover:bg-gray-800/30">
                          <td className="py-3">{new Date(closing.closed_at).toLocaleString('ar-IQ')}</td>
                          <td className="py-3">{closing.cashier_name}</td>
                          <td className="py-3">{formatPrice(closing.total_sales)}</td>
                          <td className="py-3">{formatPrice(closing.expected_cash)}</td>
                          <td className="py-3">{formatPrice(closing.actual_cash)}</td>
                          <td className={`py-3 font-bold ${getDifferenceColor(closing.difference)}`}>
                            {closing.difference > 0 ? '+' : ''}{formatPrice(closing.difference)}
                          </td>
                          <td className="py-3">
                            <Badge className={
                              closing.difference_type === 'surplus' ? 'bg-emerald-500/20 text-emerald-400' :
                              closing.difference_type === 'shortage' ? 'bg-red-500/20 text-red-400' :
                              'bg-gray-500/20 text-gray-400'
                            }>
                              {getDifferenceLabel(closing.difference_type)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-gray-400">{t('لا توجد بيانات')}</div>
      )}
    </div>
  );
};

// ===================== Card Report Tab (تبويب البطاقة) =====================
const CardReportTab = ({ cardReport, t, formatPrice, fetchReports }) => {
  const [showCollectDialog, setShowCollectDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [collectForm, setCollectForm] = useState({
    amount: '',
    collected_by: '',
    notes: ''
  });
  const [collecting, setCollecting] = useState(false);

  const handleOpenCollect = (order) => {
    setSelectedOrder(order);
    setCollectForm({
      amount: order.remaining_amount || order.total,
      collected_by: '',
      notes: ''
    });
    setShowCollectDialog(true);
  };

  const handleCollect = async () => {
    if (!collectForm.amount || !collectForm.collected_by) {
      toast.error(t('يرجى إدخال المبلغ واسم المستلم'));
      return;
    }
    
    setCollecting(true);
    try {
      await axios.post(`${API}/reports/card/collect`, {
        order_id: selectedOrder.id,
        amount: parseFloat(collectForm.amount),
        collected_by: collectForm.collected_by,
        notes: collectForm.notes
      });
      toast.success(t('تم تسجيل التحصيل بنجاح'));
      setShowCollectDialog(false);
      fetchReports();
    } catch (error) {
      console.error('Collection error:', error);
      toast.error(t('فشل في تسجيل التحصيل'));
    } finally {
      setCollecting(false);
    }
  };

  if (!cardReport) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('إجمالي البطاقة')}</p>
                <p className="text-2xl font-bold text-cyan-600">{formatPrice(cardReport.total_card)}</p>
              </div>
              <CreditCard className="h-8 w-8 text-cyan-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('عدد الطلبات')}</p>
                <p className="text-2xl font-bold text-purple-600">{cardReport.total_orders}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('تم التحصيل')}</p>
                <p className="text-2xl font-bold text-green-600">{formatPrice(cardReport.collected_amount)}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('المتبقي')}</p>
                <p className="text-2xl font-bold text-red-600">{formatPrice(cardReport.remaining_amount)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-cyan-500" />
            {t('مبيعات البطاقة')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right p-3 text-muted-foreground">#</th>
                  <th className="text-right p-3 text-muted-foreground">{t('التاريخ')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('العميل')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('النوع')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('المبلغ')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('المحصل')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('المتبقي')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('الحالة')}</th>
                  <th className="text-right p-3 text-muted-foreground">{t('إجراء')}</th>
                </tr>
              </thead>
              <tbody>
                {cardReport.orders?.map(order => (
                  <tr key={order.id} className="border-b border-border/50 hover:bg-cyan-500/5">
                    <td className="p-3 font-medium text-foreground">#{order.order_number}</td>
                    <td className="p-3 text-muted-foreground">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString('ar-IQ') : '-'}
                    </td>
                    <td className="p-3 text-foreground">{order.customer_name || t('زبون')}</td>
                    <td className="p-3 text-muted-foreground">
                      {order.order_type === 'dine_in' ? t('داخلي') : 
                       order.order_type === 'takeaway' ? t('سفري') : t('توصيل')}
                    </td>
                    <td className="p-3 font-bold text-cyan-600">{formatPrice(order.total)}</td>
                    <td className="p-3 text-green-600">{formatPrice(order.collected_amount || 0)}</td>
                    <td className="p-3 text-red-600">{formatPrice(order.remaining_amount || order.total)}</td>
                    <td className="p-3">
                      {order.is_collected ? (
                        <Badge className="bg-green-500">{t('مُحصّل')}</Badge>
                      ) : (
                        <Badge variant="outline" className="border-orange-500 text-orange-500">{t('غير مُحصّل')}</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      {!order.is_collected && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-white"
                          onClick={() => handleOpenCollect(order)}
                        >
                          <DollarSign className="h-4 w-4 ml-1" />
                          {t('تحصيل')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!cardReport.orders || cardReport.orders.length === 0) && (
              <p className="text-center text-muted-foreground py-8">{t('لا توجد مبيعات بالبطاقة في هذه الفترة')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* نافذة التحصيل */}
      <Dialog open={showCollectDialog} onOpenChange={setShowCollectDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-cyan-500" />
              {t('تحصيل مبيعات البطاقة')}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="bg-cyan-50 dark:bg-cyan-900/20 p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">{t('الطلب')}: <span className="font-bold">#{selectedOrder.order_number}</span></p>
                <p className="text-sm text-muted-foreground">{t('العميل')}: <span className="font-medium">{selectedOrder.customer_name || '-'}</span></p>
                <p className="text-sm text-muted-foreground">{t('المبلغ الكلي')}: <span className="font-bold text-cyan-600">{formatPrice(selectedOrder.total)}</span></p>
                <p className="text-sm text-muted-foreground">{t('المتبقي للتحصيل')}: <span className="font-bold text-red-600">{formatPrice(selectedOrder.remaining_amount || selectedOrder.total)}</span></p>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label>{t('المبلغ المحصل')}</Label>
                  <Input
                    type="number"
                    value={collectForm.amount}
                    onChange={(e) => setCollectForm({...collectForm, amount: e.target.value})}
                    placeholder={t('أدخل المبلغ')}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t('اسم المستلم')}</Label>
                  <Input
                    value={collectForm.collected_by}
                    onChange={(e) => setCollectForm({...collectForm, collected_by: e.target.value})}
                    placeholder={t('من استلم المبلغ')}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t('ملاحظات')} ({t('اختياري')})</Label>
                  <Input
                    value={collectForm.notes}
                    onChange={(e) => setCollectForm({...collectForm, notes: e.target.value})}
                    placeholder={t('أي ملاحظات إضافية')}
                    className="mt-1"
                  />
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm">
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t('التاريخ والوقت')}: {new Date().toLocaleString('ar-IQ')}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCollectDialog(false)}>
              {t('إلغاء')}
            </Button>
            <Button 
              onClick={handleCollect} 
              disabled={collecting}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {collecting ? t('جاري التحصيل...') : t('تأكيد التحصيل')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ===================== Delivery Report Tab (تبويب التوصيل) =====================
const DeliveryReportTab = ({ deliveryCreditsReport, t, formatPrice, fetchReports, handlePrintDeliveryReport }) => {
  const [showCollectDialog, setShowCollectDialog] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [collectForm, setCollectForm] = useState({
    amount: '',
    collected_by: '',
    notes: ''
  });
  const [collecting, setCollecting] = useState(false);

  const handleOpenCollect = (appName, data) => {
    setSelectedApp({ name: appName, ...data });
    setCollectForm({
      amount: data.remaining_amount || data.net_amount,
      collected_by: '',
      notes: ''
    });
    setShowCollectDialog(true);
  };

  const handleCollect = async () => {
    if (!collectForm.amount || !collectForm.collected_by) {
      toast.error(t('يرجى إدخال المبلغ واسم المستلم'));
      return;
    }
    
    setCollecting(true);
    try {
      await axios.post(`${API}/reports/delivery/collect`, {
        delivery_app_id: selectedApp.id,
        delivery_app_name: selectedApp.name,
        amount: parseFloat(collectForm.amount),
        collected_by: collectForm.collected_by,
        notes: collectForm.notes
      });
      toast.success(t('تم تسجيل التحصيل بنجاح'));
      setShowCollectDialog(false);
      fetchReports();
    } catch (error) {
      console.error('Collection error:', error);
      toast.error(t('فشل في تسجيل التحصيل'));
    } finally {
      setCollecting(false);
    }
  };

  if (!deliveryCreditsReport) return null;

  return (
    <div className="space-y-6">
      {/* البطاقات الإحصائية */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('إجمالي المبيعات')}</p>
                <p className="text-xl font-bold text-blue-600">{formatPrice(deliveryCreditsReport.total_sales)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('قبل الاستقطاع')}</p>
              </div>
              <DollarSign className="h-7 w-7 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('العمولات المستقطعة')}</p>
                <p className="text-xl font-bold text-red-600">-{formatPrice(deliveryCreditsReport.total_commission)}</p>
              </div>
              <TrendingDown className="h-7 w-7 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('صافي المستحق')}</p>
                <p className="text-xl font-bold text-amber-600">{formatPrice(deliveryCreditsReport.net_receivable)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('بعد الاستقطاع')}</p>
              </div>
              <Target className="h-7 w-7 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('تم التحصيل')}</p>
                <p className="text-xl font-bold text-green-600">{formatPrice(deliveryCreditsReport.total_collected || 0)}</p>
              </div>
              <CheckCircle className="h-7 w-7 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('المتبقي للتحصيل')}</p>
                <p className="text-xl font-bold text-purple-600">{formatPrice(deliveryCreditsReport.total_remaining || deliveryCreditsReport.net_receivable)}</p>
              </div>
              <Truck className="h-7 w-7 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* تفاصيل كل شركة */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            {t('تفاصيل كل شركة توصيل')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(deliveryCreditsReport.by_delivery_app || {}).map(([appName, data]) => (
              <div key={appName} className="p-4 bg-muted/30 rounded-lg border border-border/50">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-bold text-lg text-foreground flex items-center gap-2">
                      <Truck className="h-5 w-5 text-primary" />
                      {appName}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t('نسبة العمولة')}: {data.commission_rate || 0}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-bold">
                      {data.count} {t('طلب')}
                    </span>
                    {(data.remaining_amount || data.net_amount) > 0 && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenCollect(appName, data)}
                        className="gap-1 bg-green-600 hover:bg-green-700"
                        data-testid={`collect-delivery-${appName}`}
                      >
                        <CircleDollarSign className="h-4 w-4" />
                        {t('تحصيل')}
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                    <p className="text-xs text-blue-600">{t('المبيعات (قبل الاستقطاع)')}</p>
                    <p className="text-lg font-bold text-blue-600 tabular-nums">{formatPrice(data.total)}</p>
                  </div>
                  <div className="text-center p-3 bg-red-500/10 rounded-lg">
                    <p className="text-xs text-red-500">{t('العمولة المستقطعة')}</p>
                    <p className="text-lg font-bold text-red-500 tabular-nums">-{formatPrice(data.commission)}</p>
                  </div>
                  <div className="text-center p-3 bg-amber-500/10 rounded-lg">
                    <p className="text-xs text-amber-600">{t('الصافي (بعد الاستقطاع)')}</p>
                    <p className="text-lg font-bold text-amber-600 tabular-nums">{formatPrice(data.net_amount)}</p>
                  </div>
                  <div className="text-center p-3 bg-green-500/10 rounded-lg">
                    <p className="text-xs text-green-600">{t('تم التحصيل')}</p>
                    <p className="text-lg font-bold text-green-600 tabular-nums">{formatPrice(data.collected_amount || 0)}</p>
                  </div>
                  <div className="text-center p-3 bg-purple-500/10 rounded-lg">
                    <p className="text-xs text-purple-600">{t('المتبقي')}</p>
                    <p className="text-lg font-bold text-purple-600 tabular-nums">{formatPrice(data.remaining_amount || data.net_amount)}</p>
                  </div>
                </div>
              </div>
            ))}
            
            {Object.keys(deliveryCreditsReport.by_delivery_app || {}).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('لا توجد طلبات توصيل في هذه الفترة')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={handlePrintDeliveryReport} className="gap-2">
          <Printer className="h-4 w-4" />
          {t('طباعة التقرير')}
        </Button>
      </div>

      {/* Dialog تحصيل التوصيل */}
      <Dialog open={showCollectDialog} onOpenChange={setShowCollectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-green-500" />
              {t('تحصيل من شركة التوصيل')}
            </DialogTitle>
          </DialogHeader>
          {selectedApp && (
            <div className="space-y-4 py-4">
              <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                <p className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  {selectedApp.name}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('المبيعات')}:</span>
                    <span className="font-bold text-blue-600 mr-1">{formatPrice(selectedApp.total)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('العمولة')}:</span>
                    <span className="font-bold text-red-500 mr-1">-{formatPrice(selectedApp.commission)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('الصافي')}:</span>
                    <span className="font-bold text-amber-600 mr-1">{formatPrice(selectedApp.net_amount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('المتبقي')}:</span>
                    <span className="font-bold text-purple-600 mr-1">{formatPrice(selectedApp.remaining_amount || selectedApp.net_amount)}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label>{t('المبلغ المحصل')}</Label>
                  <Input
                    type="number"
                    value={collectForm.amount}
                    onChange={(e) => setCollectForm({...collectForm, amount: e.target.value})}
                    placeholder={t('أدخل المبلغ')}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t('اسم المستلم')}</Label>
                  <Input
                    value={collectForm.collected_by}
                    onChange={(e) => setCollectForm({...collectForm, collected_by: e.target.value})}
                    placeholder={t('من استلم المبلغ')}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t('ملاحظات')} ({t('اختياري')})</Label>
                  <Input
                    value={collectForm.notes}
                    onChange={(e) => setCollectForm({...collectForm, notes: e.target.value})}
                    placeholder={t('أي ملاحظات إضافية')}
                    className="mt-1"
                  />
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm">
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t('التاريخ والوقت')}: {new Date().toLocaleString('ar-IQ')}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCollectDialog(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={handleCollect} disabled={collecting} className="bg-green-600 hover:bg-green-700">
              {collecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              <span className="mr-2">{t('تأكيد التحصيل')}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default function Reports() {
  const { user, hasRole } = useAuth();
  const { selectedBranchId, branches, getBranchIdForApi, canSelectAllBranches } = useBranch();
  const { t, isRTL } = useTranslation();
  const navigate = useNavigate();
  
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sales');
  const [loadingComprehensive, setLoadingComprehensive] = useState(false);
  const [dashboardSettings, setDashboardSettings] = useState({ 
    showSmartReports: true, 
    showComprehensiveReport: true,
    showBreakEvenReport: true
  });
  
  // تغيير التبويب الافتراضي إذا كان التقرير الشامل معطلاً
  useEffect(() => {
    if (dashboardSettings.showComprehensiveReport === false && activeTab === 'comprehensive') {
      setActiveTab('sales');
    }
  }, [dashboardSettings.showComprehensiveReport]);
  
  // Report Data
  const [salesReport, setSalesReport] = useState(null);
  const [purchasesReport, setPurchasesReport] = useState(null);
  const [inventoryReport, setInventoryReport] = useState(null);
  const [expensesReport, setExpensesReport] = useState(null);
  const [profitLossReport, setProfitLossReport] = useState(null);
  const [productsReport, setProductsReport] = useState(null);
  const [deliveryCreditsReport, setDeliveryCreditsReport] = useState(null);
  const [cancellationsReport, setCancellationsReport] = useState(null);
  const [discountsReport, setDiscountsReport] = useState(null);
  const [creditReport, setCreditReport] = useState(null);
  const [refundsReport, setRefundsReport] = useState(null);
  const [cardReport, setCardReport] = useState(null);

  // جلب إعدادات لوحة المعلومات للتحقق من الصلاحيات
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get(`${API}/settings/dashboard`);
        if (res.data) setDashboardSettings(res.data);
      } catch (error) {
        console.error('Failed to fetch dashboard settings');
      }
    };
    fetchSettings();
  }, []);

  // جلب بيانات التقرير الشامل عند تغيير التاريخ أو الفرع
  useEffect(() => {
    if (activeTab === 'comprehensive') {
      fetchAllReportsForComprehensive();
    }
  }, [startDate, endDate, selectedBranchId]);

  // الحصول على اسم الفرع المحدد
  const getSelectedBranchName = () => {
    if (!selectedBranchId || selectedBranchId === 'all') return t('جميع الفروع');
    const branch = branches?.find(b => b.id === selectedBranchId);
    return branch?.name || t('جميع الفروع');
  };

  useEffect(() => {
    fetchReports();
  }, [selectedBranchId, startDate, endDate, activeTab]);

  // إعادة جلب البيانات عند العودة للصفحة (visibility change)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchReports();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedBranchId, startDate, endDate, activeTab]);

  const fetchReports = async () => {
    setLoading(true);
    const branchId = getBranchIdForApi();
    const params = {
      start_date: startDate,
      end_date: endDate,
      ...(branchId && { branch_id: branchId })
    };

    try {
      switch (activeTab) {
        case 'sales':
          const salesRes = await axios.get(`${API}/reports/sales`, { params });
          setSalesReport(salesRes.data);
          break;
        case 'purchases':
          const purchasesRes = await axios.get(`${API}/reports/purchases`, { params });
          setPurchasesReport(purchasesRes.data);
          break;
        case 'inventory':
          const invRes = await axios.get(`${API}/reports/inventory`, { params });
          setInventoryReport(invRes.data);
          break;
        case 'expenses':
          const expRes = await axios.get(`${API}/reports/expenses`, { params });
          setExpensesReport(expRes.data);
          break;
        case 'profit':
          const profitRes = await axios.get(`${API}/reports/profit-loss`, { params });
          setProfitLossReport(profitRes.data);
          break;
        case 'products':
          const prodRes = await axios.get(`${API}/reports/products`, { params });
          setProductsReport(prodRes.data);
          break;
        case 'delivery':
          const delRes = await axios.get(`${API}/reports/delivery-credits`, { params });
          setDeliveryCreditsReport(delRes.data);
          break;
        case 'cancellations':
          const cancelRes = await axios.get(`${API}/reports/cancellations`, { params });
          setCancellationsReport(cancelRes.data);
          break;
        case 'discounts':
          const discRes = await axios.get(`${API}/reports/discounts`, { params });
          setDiscountsReport(discRes.data);
          break;
        case 'refunds':
          const refundsRes = await axios.get(`${API}/refunds`, { params: { date_from: startDate, date_to: endDate, ...(branchId && { branch_id: branchId }) } });
          const refundsList = refundsRes.data;
          setRefundsReport({
            refunds: refundsList,
            total_count: refundsList.length,
            total_amount: refundsList.reduce((sum, r) => sum + (r.refund_amount || 0), 0),
            orders_affected: new Set(refundsList.map(r => r.order_id)).size
          });
          break;
        case 'credit':
          const creditRes = await axios.get(`${API}/reports/credit`, { params });
          setCreditReport(creditRes.data);
          break;
        case 'card':
          const cardRes = await axios.get(`${API}/reports/card`, { params });
          setCardReport(cardRes.data);
          break;
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      toast.error(t('فشل في تحميل التقرير'));
    } finally {
      setLoading(false);
    }
  };

  // جلب وطباعة التقرير الشامل
  const fetchAndPrintComprehensiveReport = async () => {
    setLoadingComprehensive(true);
    const branchId = getBranchIdForApi();
    const params = {
      start_date: startDate,
      end_date: endDate,
      ...(branchId && { branch_id: branchId })
    };

    try {
      // جلب جميع التقارير بالتوازي
      const [
        salesRes,
        productsRes,
        expensesRes,
        profitRes,
        deliveryRes,
        cancelRes,
        discountRes,
        creditRes
      ] = await Promise.all([
        axios.get(`${API}/reports/sales`, { params }),
        axios.get(`${API}/reports/products`, { params }),
        axios.get(`${API}/reports/expenses`, { params }),
        axios.get(`${API}/reports/profit-loss`, { params }),
        axios.get(`${API}/reports/delivery-credits`, { params }),
        axios.get(`${API}/reports/cancellations`, { params }),
        axios.get(`${API}/reports/discounts`, { params }),
        axios.get(`${API}/reports/credit`, { params })
      ]);

      // جلب المرتجعات
      const refundsRes = await axios.get(`${API}/refunds`, { 
        params: { date_from: startDate, date_to: endDate, ...(branchId && { branch_id: branchId }) } 
      });

      const allData = {
        salesReport: salesRes.data,
        productsReport: productsRes.data,
        expensesReport: expensesRes.data,
        profitLossReport: profitRes.data,
        deliveryCreditsReport: deliveryRes.data,
        cancellationsReport: cancelRes.data,
        discountsReport: discountRes.data,
        creditReport: creditRes.data,
        refundsReport: {
          refunds: refundsRes.data,
          total_count: refundsRes.data.length,
          total_amount: refundsRes.data.reduce((sum, r) => sum + (r.refund_amount || 0), 0),
          orders_affected: new Set(refundsRes.data.map(r => r.order_id)).size
        }
      };

      // طباعة التقرير الشامل
      printComprehensiveReport(
        allData,
        getSelectedBranchName(),
        { start: startDate, end: endDate },
        t
      );

      toast.success(t('تم فتح نافذة الطباعة'));
    } catch (error) {
      console.error('Failed to fetch comprehensive report:', error);
      toast.error(t('فشل في جلب التقرير الشامل'));
    } finally {
      setLoadingComprehensive(false);
    }
  };

  // جلب كل التقارير للتقرير الشامل (للعرض في التبويب)
  const fetchAllReportsForComprehensive = async () => {
    setLoadingComprehensive(true);
    const branchId = getBranchIdForApi();
    const params = {
      start_date: startDate,
      end_date: endDate,
      ...(branchId && { branch_id: branchId })
    };

    try {
      const [
        salesRes,
        purchasesRes,
        productsRes,
        expensesRes,
        profitRes,
        deliveryRes,
        cancelRes,
        discountRes,
        creditRes
      ] = await Promise.all([
        axios.get(`${API}/reports/sales`, { params }),
        axios.get(`${API}/reports/purchases`, { params }),
        axios.get(`${API}/reports/products`, { params }),
        axios.get(`${API}/reports/expenses`, { params }),
        axios.get(`${API}/reports/profit-loss`, { params }),
        axios.get(`${API}/reports/delivery-credits`, { params }),
        axios.get(`${API}/reports/cancellations`, { params }),
        axios.get(`${API}/reports/discounts`, { params }),
        axios.get(`${API}/reports/credit`, { params })
      ]);

      // جلب المرتجعات والسلف
      const [refundsRes, advancesRes] = await Promise.all([
        axios.get(`${API}/refunds`, { 
          params: { date_from: startDate, date_to: endDate, ...(branchId && { branch_id: branchId }) } 
        }),
        axios.get(`${API}/hr/advances`, { 
          params: { ...(branchId && { branch_id: branchId }) } 
        }).catch(() => ({ data: [] }))
      ]);

      // تحديث جميع البيانات
      setSalesReport(salesRes.data);
      setPurchasesReport(purchasesRes.data);
      setProductsReport(productsRes.data);
      setExpensesReport(expensesRes.data);
      setProfitLossReport(profitRes.data);
      setDeliveryCreditsReport(deliveryRes.data);
      setCancellationsReport(cancelRes.data);
      setDiscountsReport(discountRes.data);
      setCreditReport(creditRes.data);
      setRefundsReport({
        refunds: refundsRes.data,
        total_count: refundsRes.data.length,
        total_amount: refundsRes.data.reduce((sum, r) => sum + (r.refund_amount || 0), 0),
        orders_affected: new Set(refundsRes.data.map(r => r.order_id)).size
      });

      toast.success(t('تم تحديث جميع التقارير'));
    } catch (error) {
      console.error('Failed to fetch all reports:', error);
      toast.error(t('فشل في جلب التقارير'));
    } finally {
      setLoadingComprehensive(false);
    }
  };

  // دوال الطباعة لجميع التقارير
  const dateRangeObj = { start: startDate, end: endDate };
  const branchNameForPrint = getSelectedBranchName();

  const handlePrintSalesReport = () => salesReport && printSalesReport(salesReport, branchNameForPrint, dateRangeObj);
  const handlePrintProfitLossReport = () => profitLossReport && printProfitLossReport(profitLossReport, branchNameForPrint, dateRangeObj);
  const handlePrintPurchasesReport = () => purchasesReport && printPurchasesReport(purchasesReport, branchNameForPrint, dateRangeObj);
  const handlePrintExpensesReport = () => expensesReport && printExpensesReport(expensesReport, branchNameForPrint, dateRangeObj);
  const handlePrintProductsReport = () => productsReport && printProductsReport(productsReport, branchNameForPrint, dateRangeObj);
  const handlePrintDeliveryReport = () => deliveryCreditsReport && printDeliveryReport(deliveryCreditsReport, branchNameForPrint, dateRangeObj);
  const handlePrintCancellationsReport = () => cancellationsReport && printCancellationsReport(cancellationsReport, branchNameForPrint, dateRangeObj);
  const handlePrintDiscountsReport = () => discountsReport && printDiscountsReport(discountsReport, branchNameForPrint, dateRangeObj);
  const handlePrintRefundsReport = () => refundsReport && printRefundsReport(refundsReport, branchNameForPrint, dateRangeObj);
  const handlePrintCreditReport = () => creditReport && printCreditReport(creditReport, branchNameForPrint, dateRangeObj);

  const StatCard = ({ title, value, subtitle, icon: Icon, color = 'primary', trend }) => (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1 text-foreground tabular-nums">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${color}/10`}>
            <Icon className={`h-5 w-5 text-${color}`} />
          </div>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center mt-2 text-sm ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background" data-testid="reports-page">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">{t('التقارير')}</h1>
              <p className="text-sm text-muted-foreground">{t('تقارير شاملة للمبيعات والمصاريف والأرباح')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={fetchReports} data-testid="refresh-btn">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* Filters - تظهر فقط للتبويبات التي تحتاجها (تختفي عند إغلاق الصندوق لأنه له فلاتره الخاصة) */}
      {activeTab !== 'comprehensive' && activeTab !== 'cash-register' && (
        <div className="max-w-7xl mx-auto px-6 py-4 border-b border-border">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">{t('الفرع')}</Label>
              <div className="mt-1">
                <BranchSelector />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('من تاريخ')}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-[150px]"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('إلى تاريخ')}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-[150px]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Report Tabs */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap justify-center gap-2 h-auto p-3 mb-6 bg-muted/50 rounded-xl w-full">
            {dashboardSettings.showComprehensiveReport !== false && (
              <TabsTrigger value="comprehensive" className="text-green-500 font-bold">{t('التقرير الشامل')}</TabsTrigger>
            )}
            <TabsTrigger value="sales">{t('المبيعات')}</TabsTrigger>
            <TabsTrigger value="purchases">{t('المشتريات')}</TabsTrigger>
            <TabsTrigger value="expenses">{t('المصاريف')}</TabsTrigger>
            <TabsTrigger value="profit">{t('الأرباح')}</TabsTrigger>
            <TabsTrigger value="products">{t('الأصناف')}</TabsTrigger>
            <TabsTrigger value="delivery">{t('التوصيل')}</TabsTrigger>
            <TabsTrigger value="cash-register" className="bg-emerald-600/20 text-emerald-400 font-bold">{t('إغلاق الصندوق')}</TabsTrigger>
            <TabsTrigger value="cancellations" className="text-red-500">{t('الإلغاءات')}</TabsTrigger>
            <TabsTrigger value="discounts" className="text-orange-500">{t('الخصومات')}</TabsTrigger>
            <TabsTrigger value="refunds" className="text-purple-500">{t('المرتجعات')}</TabsTrigger>
            <TabsTrigger value="credit" className="text-blue-500">{t('الآجل')}</TabsTrigger>
            <TabsTrigger value="card" className="text-cyan-500">{t('البطاقة')}</TabsTrigger>
            {dashboardSettings.showSmartReports !== false && (
              <TabsTrigger value="smart" className="text-emerald-500">{t('التقرير الذكي')}</TabsTrigger>
            )}
          </TabsList>

          {/* Comprehensive Report - التقرير الشامل */}
          {dashboardSettings.showComprehensiveReport !== false && (
            <TabsContent value="comprehensive">
              <ComprehensiveReportTab 
                salesReport={salesReport}
                purchasesReport={purchasesReport}
                expensesReport={expensesReport}
                profitLossReport={profitLossReport}
                productsReport={productsReport}
                deliveryCreditsReport={deliveryCreditsReport}
                cancellationsReport={cancellationsReport}
                discountsReport={discountsReport}
                creditReport={creditReport}
                refundsReport={refundsReport}
                branchName={getSelectedBranchName()}
                dateRange={{ start: startDate, end: endDate }}
                t={t}
                formatPrice={formatPrice}
                loading={loadingComprehensive}
                fetchAllReports={fetchAllReportsForComprehensive}
                showBreakEvenReport={dashboardSettings.showBreakEvenReport}
                branches={branches}
                selectedBranchId={selectedBranchId}
                onBranchChange={async (val) => {
                  // تغيير الفرع
                  if (val === 'all') {
                    setSelectedBranchId(null);
                  } else {
                    setSelectedBranchId(val);
                  }
                }}
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            </TabsContent>
          )}

          {/* Sales Report */}
          <TabsContent value="sales">
            {salesReport && (
              <div className="space-y-6">
                {/* الصف الأول: المبيعات والطلبات */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title={t('إجمالي المبيعات')}
                    value={formatPrice(salesReport.total_sales)}
                    icon={DollarSign}
                    color="green-500"
                  />
                  <StatCard
                    title={t('عدد الطلبات')}
                    value={salesReport.total_orders}
                    subtitle={`${t('متوسط')}: ${formatPrice(salesReport.average_order_value)}`}
                    icon={ShoppingCart}
                    color="blue-500"
                  />
                  <StatCard
                    title={t('إجمالي الأرباح')}
                    value={formatPrice(salesReport.total_profit)}
                    subtitle={`${t('هامش الربح')}: ${salesReport.profit_margin?.toFixed(1)}%`}
                    icon={TrendingUp}
                    color="primary"
                  />
                  <StatCard
                    title={t('إجمالي التكاليف')}
                    value={formatPrice(salesReport.total_cost)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                </div>

                {/* الصف الثاني: تفاصيل التكاليف (تكلفة المواد + التغليف) - تظهر دائماً */}
                <div className={`grid grid-cols-1 ${dashboardSettings.showBreakEvenReport !== false ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                  <Card className="border-l-4 border-l-orange-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('تكلفة المواد')}</p>
                          <p className="text-2xl font-bold text-orange-600">{formatPrice(salesReport.total_materials_cost || 0)}</p>
                        </div>
                        <Package className="h-8 w-8 text-orange-500 opacity-50" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('تكلفة التغليف')}</p>
                          <p className="text-2xl font-bold text-amber-600">{formatPrice(salesReport.total_packaging_cost || 0)}</p>
                        </div>
                        <Receipt className="h-8 w-8 text-amber-500 opacity-50" />
                      </div>
                    </CardContent>
                  </Card>
                  {/* صافي الربح - يظهر فقط إذا كانت صلاحية تقرير التحليل مفعلة */}
                  {dashboardSettings.showBreakEvenReport !== false && (
                  <Card className="border-l-4 border-l-emerald-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('صافي الربح')}</p>
                          <p className="text-2xl font-bold text-emerald-600">{formatPrice(salesReport.total_profit)}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('بعد خصم التكاليف')}
                          </p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-emerald-500 opacity-50" />
                      </div>
                    </CardContent>
                  </Card>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* By Payment Method */}
                  <Card className="border-border/50 bg-card">
                    <CardHeader>
                      <CardTitle className="text-lg text-foreground">{t('حسب طريقة الدفع')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(salesReport.by_payment_method || {}).map(([method, amount]) => {
                          // ترجمة أسماء طرق الدفع
                          const translatedMethod = 
                            method === 'credit' ? t('آجل') :
                            method === 'cash' ? t('نقدي') :
                            method === 'card' ? t('بطاقة') :
                            method; // إبقاء اسم شركة التوصيل كما هو
                          return (
                            <div key={method} className="flex justify-between items-center">
                              <span className="text-muted-foreground">
                                {translatedMethod}
                              </span>
                              <span className="font-bold text-foreground tabular-nums">{formatPrice(amount)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* By Order Type */}
                  <Card className="border-border/50 bg-card">
                    <CardHeader>
                      <CardTitle className="text-lg text-foreground">{t('حسب نوع الطلب')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(salesReport.by_order_type || {}).map(([type, amount]) => (
                          <div key={type} className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              {type === 'dine_in' ? t('داخلي') : type === 'takeaway' ? t('سفري') : t('توصيل')}
                            </span>
                            <span className="font-bold text-foreground tabular-nums">{formatPrice(amount)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Top Products */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">{t('أكثر المنتجات مبيعاً')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(salesReport.top_products || {}).map(([name, data], idx) => (
                        <div key={name} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-primary">
                              {idx + 1}
                            </span>
                            <span className="text-foreground">{name}</span>
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-foreground tabular-nums">{formatPrice(data.revenue)}</p>
                            <p className="text-xs text-muted-foreground">{data.quantity} {t('وحدة')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={handlePrintSalesReport} className="gap-2">
                    <Printer className="h-4 w-4" />
                    {t('طباعة التقرير')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Purchases Report */}
          <TabsContent value="purchases">
            {purchasesReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard
                    title={t('إجمالي المشتريات')}
                    value={formatPrice(purchasesReport.total_purchases)}
                    icon={Package}
                    color="purple-500"
                  />
                  <StatCard
                    title={t('عدد الفواتير')}
                    value={purchasesReport.total_transactions}
                    icon={FileText}
                    color="blue-500"
                  />
                  <StatCard
                    title={t('مستحقات غير مدفوعة')}
                    value={formatPrice(purchasesReport.by_payment_status?.pending || 0)}
                    icon={DollarSign}
                    color="orange-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">{t('حسب المورد')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(purchasesReport.by_supplier || {}).map(([supplier, amount]) => (
                        <div key={supplier} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                          <span className="text-foreground">{supplier}</span>
                          <span className="font-bold text-foreground tabular-nums">{formatPrice(amount)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={handlePrintPurchasesReport} className="gap-2">
                    <Printer className="h-4 w-4" />
                    {t('طباعة التقرير')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Expenses Report */}
          <TabsContent value="expenses">
            {expensesReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <StatCard
                    title={t('إجمالي المصاريف')}
                    value={formatPrice(expensesReport.total_expenses)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                  <StatCard
                    title={t('عدد المعاملات')}
                    value={expensesReport.total_transactions}
                    icon={FileText}
                    color="blue-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">{t('حسب التصنيف')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(expensesReport.by_category || {}).map(([cat, amount]) => {
                        const catNames = {
                          rent: t('إيجار'),
                          utilities: t('كهرباء وماء'),
                          salaries: t('رواتب'),
                          maintenance: t('صيانة'),
                          supplies: t('مستلزمات'),
                          marketing: t('تسويق'),
                          transport: t('نقل'),
                          other: t('أخرى')
                        };
                        return (
                          <div key={cat} className="p-4 bg-muted/30 rounded-lg text-center">
                            <p className="text-sm text-muted-foreground">{catNames[cat] || cat}</p>
                            <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{formatPrice(amount)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={handlePrintExpensesReport} className="gap-2">
                    <Printer className="h-4 w-4" />
                    {t('طباعة التقرير')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Profit & Loss Report */}
          <TabsContent value="profit">
            {profitLossReport && (
              <div className="space-y-6">
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">{t('تقرير الأرباح والخسائر')}</CardTitle>
                    {profitLossReport.period_days && (
                      <p className="text-sm text-muted-foreground">
                        {t('فترة التقرير')}: {profitLossReport.period_days} {t('يوم')}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Revenue */}
                      <div className="p-4 bg-green-500/10 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-green-600 font-medium">{t('الإيرادات')}</span>
                          <span className="text-2xl font-bold text-green-600 tabular-nums">
                            {formatPrice(profitLossReport.revenue?.total_sales || 0)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {profitLossReport.revenue?.order_count || 0} {t('طلب')}
                        </p>
                      </div>

                      {/* Cost of Goods */}
                      <div className="p-4 bg-red-500/10 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-red-600 font-medium">{t('تكلفة البضاعة المباعة')}</span>
                          <span className="text-xl font-bold text-red-600 tabular-nums">
                            -{formatPrice(profitLossReport.cost_of_goods_sold?.total || 0)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {profitLossReport.cost_of_goods_sold?.percentage?.toFixed(1)}% {t('من الإيرادات')}
                        </p>
                      </div>

                      {/* Delivery Commissions */}
                      <div className="p-4 bg-orange-500/10 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-orange-600 font-medium">{t('عمولات التوصيل')}</span>
                          <span className="text-lg font-bold text-orange-600 tabular-nums">
                            -{formatPrice(profitLossReport.delivery_commissions || 0)}
                          </span>
                        </div>
                      </div>

                      {/* Gross Profit */}
                      <div className="p-4 bg-blue-500/10 rounded-lg border-2 border-blue-500/30">
                        <div className="flex justify-between items-center">
                          <span className="text-blue-600 font-bold">{t('الربح الإجمالي')}</span>
                          <span className="text-2xl font-bold text-blue-600 tabular-nums">
                            {formatPrice(profitLossReport.gross_profit?.amount || 0)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t('هامش الربح')}: {profitLossReport.gross_profit?.margin?.toFixed(1)}%
                        </p>
                      </div>

                      {/* التكاليف التشغيلية - القسم الجديد - يظهر فقط إذا كانت الصلاحية مفعلة */}
                      {dashboardSettings.showBreakEvenReport !== false && (
                        <div className="p-4 bg-purple-500/5 rounded-lg border border-purple-500/20">
                          <h3 className="text-purple-600 font-bold mb-3">{t('التكاليف التشغيلية')}</h3>
                          
                          {/* التكاليف الثابتة */}
                          {profitLossReport.fixed_costs && (
                            <div className="space-y-2 mb-3">
                              <p className="text-sm font-medium text-muted-foreground">{t('التكاليف الثابتة')}:</p>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t('الإيجار')}</span>
                                  <span className="text-red-600">-{formatPrice(profitLossReport.fixed_costs.rent?.period || 0)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t('الكهرباء')}</span>
                                  <span className="text-red-600">-{formatPrice(profitLossReport.fixed_costs.electricity?.period || 0)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t('الماء')}</span>
                                  <span className="text-red-600">-{formatPrice(profitLossReport.fixed_costs.water?.period || 0)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t('المولدة')}</span>
                                  <span className="text-red-600">-{formatPrice(profitLossReport.fixed_costs.generator?.period || 0)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* الرواتب */}
                          {profitLossReport.salaries && (
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-muted-foreground">
                                {t('الرواتب')} ({profitLossReport.salaries.employees_count} {t('موظف')})
                              </span>
                              <span className="text-red-600">-{formatPrice(profitLossReport.salaries.total_period || 0)}</span>
                            </div>
                          )}
                          
                          {/* المصاريف الأخرى */}
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-muted-foreground">{t('مصاريف أخرى')}</span>
                            <span className="text-red-600">-{formatPrice(profitLossReport.operating_expenses?.total || 0)}</span>
                          </div>
                          
                          {/* إجمالي التكاليف التشغيلية */}
                          <div className="pt-2 border-t border-purple-500/20">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-purple-600">{t('إجمالي التكاليف التشغيلية')}</span>
                              <span className="text-lg font-bold text-red-600 tabular-nums">
                                -{formatPrice(profitLossReport.total_operating_costs?.total || 0)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Net Profit - يظهر فقط إذا كانت الصلاحية مفعلة */}
                      {dashboardSettings.showBreakEvenReport !== false && (
                        <div className={`p-4 rounded-lg border-2 ${
                          (profitLossReport.net_profit?.amount || 0) >= 0 
                            ? 'bg-green-500/10 border-green-500/30' 
                            : 'bg-red-500/10 border-red-500/30'
                        }`}>
                          <div className="flex justify-between items-center">
                            <span className={`font-bold ${
                              (profitLossReport.net_profit?.amount || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {t('صافي الربح')}
                            </span>
                            <span className={`text-3xl font-bold tabular-nums ${
                              (profitLossReport.net_profit?.amount || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatPrice(profitLossReport.net_profit?.amount || 0)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {t('هامش الربح الصافي')}: {profitLossReport.net_profit?.margin?.toFixed(1)}%
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-between items-center gap-2 mt-4">
                  {dashboardSettings.showBreakEvenReport !== false && (
                    <Button 
                      onClick={() => navigate('/cost-analysis')} 
                      className="bg-primary text-primary-foreground"
                    >
                      <Target className="h-4 w-4 ml-2" />
                      {t('تقرير تحليل الربح الصافي والتكاليف')}
                    </Button>
                  )}
                  <Button variant="outline" onClick={handlePrintProfitLossReport} className="gap-2">
                    <Printer className="h-4 w-4" />
                    {t('طباعة التقرير')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Products Report */}
          <TabsContent value="products">
            {productsReport && (
              <div className="space-y-6">
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">{t('تقرير الأصناف')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-right p-3 text-muted-foreground">{t('الصنف')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('السعر')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('التكلفة')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('الربح/وحدة')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('الكمية المباعة')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('إجمالي الإيرادات')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('إجمالي الربح')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productsReport.products?.map(p => (
                            <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="p-3 font-medium text-foreground">{p.name}</td>
                              <td className="p-3 tabular-nums text-foreground">{formatPrice(p.price)}</td>
                              <td className="p-3 tabular-nums text-foreground">{formatPrice(p.cost + p.operating_cost)}</td>
                              <td className="p-3 tabular-nums text-green-500">{formatPrice(p.profit_per_unit)}</td>
                              <td className="p-3 tabular-nums text-foreground">{p.quantity_sold}</td>
                              <td className="p-3 tabular-nums text-foreground">{formatPrice(p.total_revenue)}</td>
                              <td className="p-3 tabular-nums text-green-500">{formatPrice(p.total_profit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={handlePrintProductsReport} className="gap-2">
                    <Printer className="h-4 w-4" />
                    {t('طباعة التقرير')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Delivery Credits Report */}
          <TabsContent value="delivery">
            <DeliveryReportTab
              deliveryCreditsReport={deliveryCreditsReport}
              t={t}
              formatPrice={formatPrice}
              fetchReports={fetchReports}
              handlePrintDeliveryReport={handlePrintDeliveryReport}
            />
          </TabsContent>

          {/* Cash Register Closing Report */}
          <TabsContent value="cash-register">
            <CashRegisterClosingTab
              t={t}
              formatPrice={formatPrice}
              selectedBranchId={selectedBranchId}
              branches={branches}
              getBranchIdForApi={getBranchIdForApi}
            />
          </TabsContent>

          {/* Cancellations Report */}
          <TabsContent value="cancellations">
            {cancellationsReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title={t('إجمالي الإلغاءات')}
                    value={cancellationsReport.total_cancelled}
                    icon={XCircle}
                    color="red-500"
                  />
                  <StatCard
                    title={t('قيمة الإلغاءات')}
                    value={formatPrice(cancellationsReport.total_value)}
                    icon={DollarSign}
                    color="red-500"
                  />
                  <StatCard
                    title={t('نسبة الإلغاء')}
                    value={`${cancellationsReport.cancellation_rate?.toFixed(1) || 0}%`}
                    icon={Percent}
                    color="orange-500"
                  />
                  <StatCard
                    title={t('إلغاءات اليوم')}
                    value={cancellationsReport.today_cancelled || 0}
                    icon={Clock}
                    color="blue-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-500" />
                      {t('الطلبات الملغاة')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-right p-3 text-muted-foreground">#</th>
                            <th className="text-right p-3 text-muted-foreground">{t('التاريخ')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('النوع')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('العميل')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('القيمة')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('سبب الإلغاء')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cancellationsReport.orders?.map(order => (
                            <tr key={order.id} className="border-b border-border/50 hover:bg-red-500/5">
                              <td className="p-3 font-medium text-foreground">#{order.order_number}</td>
                              <td className="p-3 text-muted-foreground">
                                {new Date(order.cancelled_at || order.created_at).toLocaleDateString('en-US')}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  order.order_type === 'dine_in' ? 'bg-blue-500/10 text-blue-500' :
                                  order.order_type === 'takeaway' ? 'bg-green-500/10 text-green-500' :
                                  'bg-orange-500/10 text-orange-500'
                                }`}>
                                  {order.order_type === 'dine_in' ? t('محلي') : order.order_type === 'takeaway' ? t('سفري') : t('توصيل')}
                                </span>
                              </td>
                              <td className="p-3 text-foreground">{order.customer_name || '-'}</td>
                              <td className="p-3 tabular-nums text-red-500">{formatPrice(order.total)}</td>
                              <td className="p-3 text-muted-foreground">{order.cancellation_reason || t('غير محدد')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!cancellationsReport.orders || cancellationsReport.orders.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground">
                          <XCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>{t('لا توجد طلبات ملغاة في هذه الفترة')}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={handlePrintProductsReport} className="gap-2">
                    <Printer className="h-4 w-4" />
                    {t('طباعة التقرير')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Discounts Report */}
          <TabsContent value="discounts">
            {discountsReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title={t('إجمالي الخصومات')}
                    value={formatPrice(discountsReport.total_discounts)}
                    icon={Percent}
                    color="orange-500"
                  />
                  <StatCard
                    title={t('عدد الطلبات')}
                    value={discountsReport.orders_with_discount}
                    icon={ShoppingCart}
                    color="blue-500"
                  />
                  <StatCard
                    title={t('متوسط الخصم')}
                    value={formatPrice(discountsReport.average_discount)}
                    icon={TrendingDown}
                    color="purple-500"
                  />
                  <StatCard
                    title={t("نسبة من المبيعات")}
                    value={`${discountsReport.discount_percentage?.toFixed(1) || 0}%`}
                    icon={PieChart}
                    color="red-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground flex items-center gap-2">
                      <Percent className="h-5 w-5 text-orange-500" />
                      {t('الطلبات مع خصومات')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-right p-3 text-muted-foreground">#</th>
                            <th className="text-right p-3 text-muted-foreground">{t('التاريخ')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('العميل')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('المبلغ الأصلي')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('الخصم')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('المبلغ النهائي')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('الكاشير')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discountsReport.orders?.map(order => (
                            <tr key={order.id} className="border-b border-border/50 hover:bg-orange-500/5">
                              <td className="p-3 font-medium text-foreground">#{order.order_number}</td>
                              <td className="p-3 text-muted-foreground">
                                {new Date(order.created_at).toLocaleDateString('en-US')}
                              </td>
                              <td className="p-3 text-foreground">{order.customer_name || '-'}</td>
                              <td className="p-3 tabular-nums text-foreground">{formatPrice(order.subtotal)}</td>
                              <td className="p-3 tabular-nums text-orange-500">-{formatPrice(order.discount)}</td>
                              <td className="p-3 tabular-nums text-green-500">{formatPrice(order.total)}</td>
                              <td className="p-3 text-muted-foreground">{order.cashier_name || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!discountsReport.orders || discountsReport.orders.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Percent className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>{t('لا توجد طلبات بخصومات في هذه الفترة')}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={handlePrintProductsReport} className="gap-2">
                    <Printer className="h-4 w-4" />
                    {t('طباعة التقرير')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Refunds Report (المرتجعات) */}
          <TabsContent value="refunds">
            {refundsReport ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title={t('إجمالي المرتجعات')}
                    value={formatPrice(refundsReport.total_amount)}
                    icon={RefreshCw}
                    color="purple-500"
                  />
                  <StatCard
                    title={t('عدد المرتجعات')}
                    value={refundsReport.total_count}
                    icon={FileText}
                    color="orange-500"
                  />
                  <StatCard
                    title={t('متوسط الإرجاع')}
                    value={formatPrice(refundsReport.total_count > 0 ? refundsReport.total_amount / refundsReport.total_count : 0)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                  <StatCard
                    title={t('طلبات مسترجعة')}
                    value={refundsReport.orders_affected || 0}
                    icon={XCircle}
                    color="gray-500"
                  />
                </div>

                {/* جدول المرتجعات */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <RefreshCw className="h-5 w-5 text-purple-500" />
                      {t('تفاصيل المرتجعات')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="py-3 px-4 text-right text-foreground font-medium">#</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">{t('رقم الفاتورة')}</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">{t('نوع الطلب')}</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">{t('القيمة الأصلية')}</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">{t('قيمة الإرجاع')}</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">{t('سبب الإرجاع')}</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">{t('بواسطة')}</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">{t('التاريخ')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {refundsReport.refunds && refundsReport.refunds.length > 0 ? (
                            refundsReport.refunds.map((refund, idx) => (
                              <tr key={refund.id || idx} className="border-b border-border/50 hover:bg-muted/50">
                                <td className="py-3 px-4 text-muted-foreground">{refund.refund_number}</td>
                                <td className="py-3 px-4 font-medium text-foreground">#{refund.order_number}</td>
                                <td className="py-3 px-4">
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    refund.order_type === 'dine_in' ? 'bg-blue-500/20 text-blue-400' :
                                    refund.order_type === 'takeaway' ? 'bg-green-500/20 text-green-400' :
                                    'bg-orange-500/20 text-orange-400'
                                  }`}>
                                    {refund.order_type === 'dine_in' ? t('محلي') : refund.order_type === 'takeaway' ? t('سفري') : t('توصيل')}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-muted-foreground">{formatPrice(refund.original_total)}</td>
                                <td className="py-3 px-4 text-red-500 font-bold">{formatPrice(refund.refund_amount)}</td>
                                <td className="py-3 px-4 text-foreground max-w-xs truncate" title={refund.reason}>{refund.reason}</td>
                                <td className="py-3 px-4 text-muted-foreground">{refund.refunded_by_name}</td>
                                <td className="py-3 px-4 text-muted-foreground text-sm">
                                  {new Date(refund.created_at).toLocaleString('en-US')}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="8" className="py-8 text-center text-muted-foreground">
                                {t('لا توجد إرجاعات في هذه الفترة')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={handlePrintProductsReport} className="gap-2">
                    <Printer className="h-4 w-4" />
                    {t('طباعة التقرير')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('جاري تحميل بيانات المرتجعات...')}
              </div>
            )}
          </TabsContent>

          {/* Credit Report (الآجل) */}
          <TabsContent value="credit">
            <CreditReportTab
              creditReport={creditReport}
              t={t}
              formatPrice={formatPrice}
              fetchReports={fetchReports}
              handlePrintCreditReport={handlePrintCreditReport}
            />
          </TabsContent>
          
          {/* Card Report (البطاقة) */}
          <TabsContent value="card">
            <CardReportTab
              cardReport={cardReport}
              t={t}
              formatPrice={formatPrice}
              fetchReports={fetchReports}
            />
          </TabsContent>
        {/* Smart Report (التقرير الذكي) */}
          <TabsContent value="smart">
            <SmartReportTab 
              t={t} 
              formatPrice={formatPrice}
              selectedBranchId={selectedBranchId}
              branches={branches}
              getBranchIdForApi={getBranchIdForApi}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
