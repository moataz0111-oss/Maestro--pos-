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
  Activity
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
  fetchAllReports
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
  const paymentChartData = salesReport?.by_payment_method ? [
    { label: t('نقدي'), value: salesReport.by_payment_method.cash || 0 },
    { label: t('بطاقة'), value: salesReport.by_payment_method.card || 0 },
    { label: t('آجل'), value: salesReport.by_payment_method.credit || 0 }
  ].filter(d => d.value > 0) : [];

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
      {/* العنوان والأزرار */}
      <div className="flex justify-between items-center bg-gradient-to-l from-primary/5 to-transparent p-4 rounded-xl">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {t('التقرير الشامل')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            <Badge variant="outline" className="mr-2">{branchName}</Badge>
            {dateRange.start} - {dateRange.end}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchAllReports} disabled={loading} variant="outline" size="sm" className="gap-2">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('تحديث')}
          </Button>
          <Button onClick={handlePrint} size="sm" className="gap-2 bg-primary hover:bg-primary/90">
            <Printer className="h-4 w-4" />
            {t('طباعة')}
          </Button>
        </div>
      </div>

      {/* الملخص الرئيسي - 3 بطاقات كبيرة */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

      {/* الإحصائيات التفصيلية */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBox 
          icon={Wallet} 
          label={t('المبيعات النقدية')} 
          value={formatPrice(salesReport?.by_payment_method?.cash || 0)} 
          color="green"
        />
        <StatBox 
          icon={CreditCard} 
          label={t('مبيعات البطاقة')} 
          value={formatPrice(salesReport?.by_payment_method?.card || 0)} 
          color="blue"
        />
        <StatBox 
          icon={Receipt} 
          label={t('المبيعات الآجلة')} 
          value={formatPrice(salesReport?.by_payment_method?.credit || 0)} 
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
                <Undo2 className="h-3 w-3" /> {t('الإرجاعات')}
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

  // الحصول على اسم الفرع المحدد
  const getSelectedBranchName = () => {
    if (!selectedBranchId || selectedBranchId === 'all') return t('جميع الفروع');
    const branch = branches?.find(b => b.id === selectedBranchId);
    return branch?.name || t('جميع الفروع');
  };

  useEffect(() => {
    fetchReports();
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

      // جلب الإرجاعات
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

      // جلب الإرجاعات والسلف
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

      {/* Filters */}
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

      {/* Report Tabs */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 md:grid-cols-11 mb-6">
            <TabsTrigger value="comprehensive" className="text-green-500 font-bold">{t('التقرير الشامل')}</TabsTrigger>
            <TabsTrigger value="sales">{t('المبيعات')}</TabsTrigger>
            <TabsTrigger value="purchases">{t('المشتريات')}</TabsTrigger>
            <TabsTrigger value="expenses">{t('المصاريف')}</TabsTrigger>
            <TabsTrigger value="profit">{t('الأرباح')}</TabsTrigger>
            <TabsTrigger value="products">{t('الأصناف')}</TabsTrigger>
            <TabsTrigger value="delivery">{t('التوصيل')}</TabsTrigger>
            <TabsTrigger value="cancellations" className="text-red-500">{t('الإلغاءات')}</TabsTrigger>
            <TabsTrigger value="discounts" className="text-orange-500">{t('الخصومات')}</TabsTrigger>
            <TabsTrigger value="refunds" className="text-purple-500">{t('الإرجاعات')}</TabsTrigger>
            <TabsTrigger value="credit" className="text-blue-500">{t('الآجل')}</TabsTrigger>
          </TabsList>

          {/* Comprehensive Report - التقرير الشامل */}
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
              loading={loading}
              fetchAllReports={fetchAllReportsForComprehensive}
            />
          </TabsContent>

          {/* Sales Report */}
          <TabsContent value="sales">
            {salesReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title={t('إجمالي المبيعات')}
                    value={formatPrice(salesReport.total_sales)}
                    icon={DollarSign}
                    color="green-500"
                  />
                  <StatCard
                    title={t('إجمالي التكاليف')}
                    value={formatPrice(salesReport.total_cost)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                  <StatCard
                    title={t('إجمالي الأرباح')}
                    value={formatPrice(salesReport.total_profit)}
                    subtitle={`${t('هامش الربح')}: ${salesReport.profit_margin?.toFixed(1)}%`}
                    icon={TrendingUp}
                    color="primary"
                  />
                  <StatCard
                    title={t('عدد الطلبات')}
                    value={salesReport.total_orders}
                    subtitle={`${t('متوسط')}: ${formatPrice(salesReport.average_order_value)}`}
                    icon={ShoppingCart}
                    color="blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* By Payment Method */}
                  <Card className="border-border/50 bg-card">
                    <CardHeader>
                      <CardTitle className="text-lg text-foreground">{t('حسب طريقة الدفع')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(salesReport.by_payment_method || {}).map(([method, amount]) => (
                          <div key={method} className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              {method === 'cash' ? t('نقدي') : method === 'card' ? t('بطاقة') : method === 'credit' ? t('آجل') : method}
                            </span>
                            <span className="font-bold text-foreground tabular-nums">{formatPrice(amount)}</span>
                          </div>
                        ))}
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

                      {/* التكاليف التشغيلية - القسم الجديد */}
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

                      {/* Net Profit */}
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
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-between items-center gap-2 mt-4">
                  <Button 
                    onClick={() => navigate('/cost-analysis')} 
                    className="bg-primary text-primary-foreground"
                  >
                    <Target className="h-4 w-4 ml-2" />
                    {t('تقرير تحليل التكاليف المفصل')}
                  </Button>
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
                    <FileText className="h-4 w-4 ml-2" />
                    {t('طباعة')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Delivery Credits Report */}
          <TabsContent value="delivery">
            {deliveryCreditsReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title={t('إجمالي المبيعات')}
                    value={formatPrice(deliveryCreditsReport.total_sales || deliveryCreditsReport.total_credit)}
                    icon={DollarSign}
                    color="blue-500"
                  />
                  <StatCard
                    title={t('إجمالي العمولات')}
                    value={formatPrice(deliveryCreditsReport.total_commission)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                  <StatCard
                    title={t('صافي المستحق')}
                    value={formatPrice(deliveryCreditsReport.net_receivable)}
                    icon={TrendingUp}
                    color="green-500"
                  />
                  <StatCard
                    title={t('عدد الطلبات')}
                    value={deliveryCreditsReport.total_orders}
                    icon={Truck}
                    color="purple-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">{t('تفاصيل كل شركة توصيل')}</CardTitle>
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
                            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-bold">
                              {data.count} {t('طلب')}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-3 bg-background rounded-lg">
                              <p className="text-xs text-muted-foreground">{t('إجمالي المبيعات')}</p>
                              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(data.total)}</p>
                            </div>
                            <div className="text-center p-3 bg-red-500/10 rounded-lg">
                              <p className="text-xs text-red-500">{t('العمولة المستقطعة')}</p>
                              <p className="text-lg font-bold text-red-500 tabular-nums">-{formatPrice(data.commission)}</p>
                            </div>
                            <div className="text-center p-3 bg-green-500/10 rounded-lg">
                              <p className="text-xs text-green-500">{t('الصافي')}</p>
                              <p className="text-lg font-bold text-green-500 tabular-nums">{formatPrice(data.net_amount)}</p>
                            </div>
                            <div className="text-center p-3 bg-background rounded-lg">
                              <p className="text-xs text-muted-foreground">{t('مدفوع / آجل')}</p>
                              <p className="text-sm font-bold">
                                <span className="text-green-500">{data.paid_count || 0}</span>
                                {' / '}
                                <span className="text-orange-500">{data.credit_count || 0}</span>
                              </p>
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
                  <Button variant="outline" onClick={handlePrintProductsReport} className="gap-2">
                    <FileText className="h-4 w-4 ml-2" />
                    {t('طباعة')}
                  </Button>
                </div>
              </div>
            )}
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
                    <FileText className="h-4 w-4 ml-2" />
                    {t('طباعة')}
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
                    title="نسبة من المبيعات"
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
                    <FileText className="h-4 w-4 ml-2" />
                    {t('طباعة')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Refunds Report (الإرجاعات) */}
          <TabsContent value="refunds">
            {refundsReport ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title={t('إجمالي الإرجاعات')}
                    value={formatPrice(refundsReport.total_amount)}
                    icon={RefreshCw}
                    color="purple-500"
                  />
                  <StatCard
                    title={t('عدد الإرجاعات')}
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

                {/* جدول الإرجاعات */}
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <RefreshCw className="h-5 w-5 text-purple-500" />
                      {t('تفاصيل الإرجاعات')}
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
                    <FileText className="h-4 w-4 ml-2" />
                    {t('طباعة')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('جاري تحميل بيانات الإرجاعات...')}
              </div>
            )}
          </TabsContent>

          {/* Credit Report (الآجل) */}
          <TabsContent value="credit">
            {creditReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title={t('إجمالي الآجل')}
                    value={formatPrice(creditReport.total_credit)}
                    icon={CreditCard}
                    color="blue-500"
                  />
                  <StatCard
                    title={t('عدد الطلبات')}
                    value={creditReport.total_orders}
                    icon={ShoppingCart}
                    color="purple-500"
                  />
                  <StatCard
                    title={t('تم التحصيل')}
                    value={formatPrice(creditReport.collected_amount)}
                    icon={TrendingUp}
                    color="green-500"
                  />
                  <StatCard
                    title={t('المتبقي')}
                    value={formatPrice(creditReport.remaining_amount)}
                    icon={TrendingDown}
                    color="red-500"
                  />
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
                            <th className="text-right p-3 text-muted-foreground">{t('الحالة')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {creditReport.orders?.map(order => (
                            <tr key={order.id} className="border-b border-border/50 hover:bg-blue-500/5">
                              <td className="p-3 font-medium text-foreground">#{order.order_number}</td>
                              <td className="p-3 text-muted-foreground">
                                {new Date(order.created_at).toLocaleDateString('en-US')}
                              </td>
                              <td className="p-3 text-foreground">{order.customer_name || '-'}</td>
                              <td className="p-3 text-muted-foreground">{order.customer_phone || '-'}</td>
                              <td className="p-3 tabular-nums text-blue-500">{formatPrice(order.total)}</td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  order.credit_collected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                }`}>
                                  {order.credit_collected ? t('تم التحصيل') : t('لم يحصل')}
                                </span>
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
                  <Button variant="outline" onClick={handlePrintProductsReport} className="gap-2">
                    <FileText className="h-4 w-4 ml-2" />
                    {t('طباعة')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
