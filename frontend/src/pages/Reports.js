import React, { useState, useEffect } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { formatPrice, formatPriceCompact } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
  Calendar,
  Download,
  RefreshCw,
  PieChart,
  FileText,
  XCircle,
  Percent,
  CreditCard,
  Clock,
  FileSpreadsheet
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

const API = API_URL;

export default function Reports() {
  const { user, hasRole } = useAuth();
  const { selectedBranchId, branches, getBranchIdForApi, canSelectAllBranches } = useBranch();
  const navigate = useNavigate();
  
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sales');
  
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
      toast.error('فشل في تحميل التقرير');
    } finally {
      setLoading(false);
    }
  };

  // Export to Excel
  const exportToExcel = async (reportType) => {
    try {
      toast.loading('جاري تحضير الملف...');
      
      const branchId = getBranchIdForApi();
      const params = {
        report_type: reportType,
        start_date: startDate,
        end_date: endDate
      };
      
      if (branchId) {
        params.branch_id = branchId;
      }
      
      const response = await axios.get(`${API}/reports/export/excel`, {
        params,
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${reportType}_${startDate}_to_${endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.dismiss();
      toast.success('تم تحميل الملف بنجاح');
    } catch (error) {
      toast.dismiss();
      toast.error('فشل في تصدير الملف');
    }
  };

  // Export to PDF
  const exportToPDF = async (reportType) => {
    try {
      toast.loading('جاري تحضير ملف PDF...');
      
      const branchId = getBranchIdForApi();
      const params = {
        report_type: reportType,
        start_date: startDate,
        end_date: endDate
      };
      
      if (branchId) {
        params.branch_id = branchId;
      }
      
      const response = await axios.get(`${API}/reports/export/pdf`, {
        params,
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${reportType}_${startDate}_to_${endDate}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.dismiss();
      toast.success('تم تحميل ملف PDF بنجاح');
    } catch (error) {
      toast.dismiss();
      toast.error('فشل في تصدير الملف');
    }
  };

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
              <h1 className="text-xl font-bold font-cairo text-foreground">التقارير</h1>
              <p className="text-sm text-muted-foreground">تقارير شاملة للمبيعات والمصاريف والأرباح</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Export Button */}
            <div className="relative group">
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => exportToExcel(activeTab === 'sales' ? 'sales' : activeTab === 'products' ? 'products' : 'expenses')}
              >
                <Download className="h-4 w-4" />
                تصدير Excel
              </Button>
            </div>
            
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
            <Label className="text-xs text-muted-foreground">الفرع</Label>
            <div className="mt-1">
              <BranchSelector />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">من تاريخ</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-[150px]"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
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
          <TabsList className="grid grid-cols-5 md:grid-cols-10 mb-6">
            <TabsTrigger value="sales">المبيعات</TabsTrigger>
            <TabsTrigger value="purchases">المشتريات</TabsTrigger>
            <TabsTrigger value="expenses">المصاريف</TabsTrigger>
            <TabsTrigger value="profit">الأرباح</TabsTrigger>
            <TabsTrigger value="products">الأصناف</TabsTrigger>
            <TabsTrigger value="delivery">التوصيل</TabsTrigger>
            <TabsTrigger value="cancellations" className="text-red-500">الإلغاءات</TabsTrigger>
            <TabsTrigger value="discounts" className="text-orange-500">الخصومات</TabsTrigger>
            <TabsTrigger value="refunds" className="text-purple-500">الإرجاعات</TabsTrigger>
            <TabsTrigger value="credit" className="text-blue-500">الآجل</TabsTrigger>
          </TabsList>

          {/* Sales Report */}
          <TabsContent value="sales">
            {salesReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title="إجمالي المبيعات"
                    value={formatPrice(salesReport.total_sales)}
                    icon={DollarSign}
                    color="green-500"
                  />
                  <StatCard
                    title="إجمالي التكاليف"
                    value={formatPrice(salesReport.total_cost)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                  <StatCard
                    title="إجمالي الأرباح"
                    value={formatPrice(salesReport.total_profit)}
                    subtitle={`هامش الربح: ${salesReport.profit_margin?.toFixed(1)}%`}
                    icon={TrendingUp}
                    color="primary"
                  />
                  <StatCard
                    title="عدد الطلبات"
                    value={salesReport.total_orders}
                    subtitle={`متوسط: ${formatPrice(salesReport.average_order_value)}`}
                    icon={ShoppingCart}
                    color="blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* By Payment Method */}
                  <Card className="border-border/50 bg-card">
                    <CardHeader>
                      <CardTitle className="text-lg text-foreground">حسب طريقة الدفع</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(salesReport.by_payment_method || {}).map(([method, amount]) => (
                          <div key={method} className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              {method === 'cash' ? 'نقدي' : method === 'card' ? 'بطاقة' : method === 'credit' ? 'آجل' : method}
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
                      <CardTitle className="text-lg text-foreground">حسب نوع الطلب</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(salesReport.by_order_type || {}).map(([type, amount]) => (
                          <div key={type} className="flex justify-between items-center">
                            <span className="text-muted-foreground">
                              {type === 'dine_in' ? 'داخلي' : type === 'takeaway' ? 'سفري' : 'توصيل'}
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
                    <CardTitle className="text-lg text-foreground">أكثر المنتجات مبيعاً</CardTitle>
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
                            <p className="text-xs text-muted-foreground">{data.quantity} وحدة</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => exportToExcel('sales')}>
                    <FileSpreadsheet className="h-4 w-4 ml-2" />
                    تصدير Excel
                  </Button>
                  <Button variant="outline" onClick={() => exportToPDF('sales')}>
                    <FileText className="h-4 w-4 ml-2" />
                    تصدير PDF
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
                    title="إجمالي المشتريات"
                    value={formatPrice(purchasesReport.total_purchases)}
                    icon={Package}
                    color="purple-500"
                  />
                  <StatCard
                    title="عدد الفواتير"
                    value={purchasesReport.total_transactions}
                    icon={FileText}
                    color="blue-500"
                  />
                  <StatCard
                    title="مستحقات غير مدفوعة"
                    value={formatPrice(purchasesReport.by_payment_status?.pending || 0)}
                    icon={DollarSign}
                    color="orange-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">حسب المورد</CardTitle>
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
              </div>
            )}
          </TabsContent>

          {/* Expenses Report */}
          <TabsContent value="expenses">
            {expensesReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <StatCard
                    title="إجمالي المصاريف"
                    value={formatPrice(expensesReport.total_expenses)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                  <StatCard
                    title="عدد المعاملات"
                    value={expensesReport.total_transactions}
                    icon={FileText}
                    color="blue-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">حسب التصنيف</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(expensesReport.by_category || {}).map(([cat, amount]) => {
                        const catNames = {
                          rent: 'إيجار',
                          utilities: 'كهرباء وماء',
                          salaries: 'رواتب',
                          maintenance: 'صيانة',
                          supplies: 'مستلزمات',
                          marketing: 'تسويق',
                          transport: 'نقل',
                          other: 'أخرى'
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
                  <Button variant="outline" onClick={() => exportToExcel('expenses')}>
                    <FileSpreadsheet className="h-4 w-4 ml-2" />
                    تصدير Excel
                  </Button>
                  <Button variant="outline" onClick={() => exportToPDF('expenses')}>
                    <FileText className="h-4 w-4 ml-2" />
                    تصدير PDF
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
                    <CardTitle className="text-lg text-foreground">تقرير الأرباح والخسائر</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Revenue */}
                      <div className="p-4 bg-green-500/10 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-green-600 font-medium">الإيرادات</span>
                          <span className="text-2xl font-bold text-green-600 tabular-nums">
                            {formatPrice(profitLossReport.revenue?.total_sales || 0)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {profitLossReport.revenue?.order_count || 0} طلب
                        </p>
                      </div>

                      {/* Cost of Goods */}
                      <div className="p-4 bg-red-500/10 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-red-600 font-medium">تكلفة البضاعة المباعة</span>
                          <span className="text-xl font-bold text-red-600 tabular-nums">
                            -{formatPrice(profitLossReport.cost_of_goods_sold?.total || 0)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {profitLossReport.cost_of_goods_sold?.percentage?.toFixed(1)}% من الإيرادات
                        </p>
                      </div>

                      {/* Delivery Commissions */}
                      <div className="p-4 bg-orange-500/10 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-orange-600 font-medium">عمولات التوصيل</span>
                          <span className="text-lg font-bold text-orange-600 tabular-nums">
                            -{formatPrice(profitLossReport.delivery_commissions || 0)}
                          </span>
                        </div>
                      </div>

                      {/* Gross Profit */}
                      <div className="p-4 bg-blue-500/10 rounded-lg border-2 border-blue-500/30">
                        <div className="flex justify-between items-center">
                          <span className="text-blue-600 font-bold">الربح الإجمالي</span>
                          <span className="text-2xl font-bold text-blue-600 tabular-nums">
                            {formatPrice(profitLossReport.gross_profit?.amount || 0)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          هامش الربح: {profitLossReport.gross_profit?.margin?.toFixed(1)}%
                        </p>
                      </div>

                      {/* Operating Expenses */}
                      <div className="p-4 bg-red-500/10 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-red-600 font-medium">المصاريف التشغيلية</span>
                          <span className="text-lg font-bold text-red-600 tabular-nums">
                            -{formatPrice(profitLossReport.operating_expenses?.total || 0)}
                          </span>
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
                            صافي الربح
                          </span>
                          <span className={`text-3xl font-bold tabular-nums ${
                            (profitLossReport.net_profit?.amount || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatPrice(profitLossReport.net_profit?.amount || 0)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          هامش الربح الصافي: {profitLossReport.net_profit?.margin?.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Products Report */}
          <TabsContent value="products">
            {productsReport && (
              <div className="space-y-6">
                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">تقرير الأصناف</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-right p-3 text-muted-foreground">الصنف</th>
                            <th className="text-right p-3 text-muted-foreground">السعر</th>
                            <th className="text-right p-3 text-muted-foreground">التكلفة</th>
                            <th className="text-right p-3 text-muted-foreground">الربح/وحدة</th>
                            <th className="text-right p-3 text-muted-foreground">الكمية المباعة</th>
                            <th className="text-right p-3 text-muted-foreground">إجمالي الإيرادات</th>
                            <th className="text-right p-3 text-muted-foreground">إجمالي الربح</th>
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
              </div>
            )}
          </TabsContent>

          {/* Delivery Credits Report */}
          <TabsContent value="delivery">
            {deliveryCreditsReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title="إجمالي المبيعات"
                    value={formatPrice(deliveryCreditsReport.total_sales || deliveryCreditsReport.total_credit)}
                    icon={DollarSign}
                    color="blue-500"
                  />
                  <StatCard
                    title="إجمالي العمولات"
                    value={formatPrice(deliveryCreditsReport.total_commission)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                  <StatCard
                    title="صافي المستحق"
                    value={formatPrice(deliveryCreditsReport.net_receivable)}
                    icon={TrendingUp}
                    color="green-500"
                  />
                  <StatCard
                    title="عدد الطلبات"
                    value={deliveryCreditsReport.total_orders}
                    icon={Truck}
                    color="purple-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">تفاصيل كل شركة توصيل</CardTitle>
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
                                نسبة العمولة: {data.commission_rate || 0}%
                              </p>
                            </div>
                            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-bold">
                              {data.count} طلب
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-3 bg-background rounded-lg">
                              <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
                              <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(data.total)}</p>
                            </div>
                            <div className="text-center p-3 bg-red-500/10 rounded-lg">
                              <p className="text-xs text-red-500">العمولة المستقطعة</p>
                              <p className="text-lg font-bold text-red-500 tabular-nums">-{formatPrice(data.commission)}</p>
                            </div>
                            <div className="text-center p-3 bg-green-500/10 rounded-lg">
                              <p className="text-xs text-green-500">الصافي</p>
                              <p className="text-lg font-bold text-green-500 tabular-nums">{formatPrice(data.net_amount)}</p>
                            </div>
                            <div className="text-center p-3 bg-background rounded-lg">
                              <p className="text-xs text-muted-foreground">مدفوع / آجل</p>
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
                          <p>لا توجد طلبات توصيل في هذه الفترة</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Cancellations Report */}
          <TabsContent value="cancellations">
            {cancellationsReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title="إجمالي الإلغاءات"
                    value={cancellationsReport.total_cancelled}
                    icon={XCircle}
                    color="red-500"
                  />
                  <StatCard
                    title="قيمة الإلغاءات"
                    value={formatPrice(cancellationsReport.total_value)}
                    icon={DollarSign}
                    color="red-500"
                  />
                  <StatCard
                    title="نسبة الإلغاء"
                    value={`${cancellationsReport.cancellation_rate?.toFixed(1) || 0}%`}
                    icon={Percent}
                    color="orange-500"
                  />
                  <StatCard
                    title="إلغاءات اليوم"
                    value={cancellationsReport.today_cancelled || 0}
                    icon={Clock}
                    color="blue-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-500" />
                      الطلبات الملغاة
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-right p-3 text-muted-foreground">#</th>
                            <th className="text-right p-3 text-muted-foreground">التاريخ</th>
                            <th className="text-right p-3 text-muted-foreground">النوع</th>
                            <th className="text-right p-3 text-muted-foreground">العميل</th>
                            <th className="text-right p-3 text-muted-foreground">القيمة</th>
                            <th className="text-right p-3 text-muted-foreground">سبب الإلغاء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cancellationsReport.orders?.map(order => (
                            <tr key={order.id} className="border-b border-border/50 hover:bg-red-500/5">
                              <td className="p-3 font-medium text-foreground">#{order.order_number}</td>
                              <td className="p-3 text-muted-foreground">
                                {new Date(order.cancelled_at || order.created_at).toLocaleDateString('ar-IQ')}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  order.order_type === 'dine_in' ? 'bg-blue-500/10 text-blue-500' :
                                  order.order_type === 'takeaway' ? 'bg-green-500/10 text-green-500' :
                                  'bg-orange-500/10 text-orange-500'
                                }`}>
                                  {order.order_type === 'dine_in' ? 'محلي' : order.order_type === 'takeaway' ? 'سفري' : 'توصيل'}
                                </span>
                              </td>
                              <td className="p-3 text-foreground">{order.customer_name || '-'}</td>
                              <td className="p-3 tabular-nums text-red-500">{formatPrice(order.total)}</td>
                              <td className="p-3 text-muted-foreground">{order.cancellation_reason || 'غير محدد'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!cancellationsReport.orders || cancellationsReport.orders.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground">
                          <XCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>لا توجد طلبات ملغاة في هذه الفترة</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Discounts Report */}
          <TabsContent value="discounts">
            {discountsReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title="إجمالي الخصومات"
                    value={formatPrice(discountsReport.total_discounts)}
                    icon={Percent}
                    color="orange-500"
                  />
                  <StatCard
                    title="عدد الطلبات"
                    value={discountsReport.orders_with_discount}
                    icon={ShoppingCart}
                    color="blue-500"
                  />
                  <StatCard
                    title="متوسط الخصم"
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
                      الطلبات مع خصومات
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-right p-3 text-muted-foreground">#</th>
                            <th className="text-right p-3 text-muted-foreground">التاريخ</th>
                            <th className="text-right p-3 text-muted-foreground">العميل</th>
                            <th className="text-right p-3 text-muted-foreground">المبلغ الأصلي</th>
                            <th className="text-right p-3 text-muted-foreground">الخصم</th>
                            <th className="text-right p-3 text-muted-foreground">المبلغ النهائي</th>
                            <th className="text-right p-3 text-muted-foreground">الكاشير</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discountsReport.orders?.map(order => (
                            <tr key={order.id} className="border-b border-border/50 hover:bg-orange-500/5">
                              <td className="p-3 font-medium text-foreground">#{order.order_number}</td>
                              <td className="p-3 text-muted-foreground">
                                {new Date(order.created_at).toLocaleDateString('ar-IQ')}
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
                          <p>لا توجد طلبات بخصومات في هذه الفترة</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Refunds Report (الإرجاعات) */}
          <TabsContent value="refunds">
            {refundsReport ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title="إجمالي الإرجاعات"
                    value={formatPrice(refundsReport.total_amount)}
                    icon={RefreshCw}
                    color="purple-500"
                  />
                  <StatCard
                    title="عدد الإرجاعات"
                    value={refundsReport.total_count}
                    icon={FileText}
                    color="orange-500"
                  />
                  <StatCard
                    title="متوسط الإرجاع"
                    value={formatPrice(refundsReport.total_count > 0 ? refundsReport.total_amount / refundsReport.total_count : 0)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                  <StatCard
                    title="طلبات مسترجعة"
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
                      تفاصيل الإرجاعات
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="py-3 px-4 text-right text-foreground font-medium">#</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">رقم الفاتورة</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">نوع الطلب</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">القيمة الأصلية</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">قيمة الإرجاع</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">سبب الإرجاع</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">بواسطة</th>
                            <th className="py-3 px-4 text-right text-foreground font-medium">التاريخ</th>
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
                                    {refund.order_type === 'dine_in' ? 'محلي' : refund.order_type === 'takeaway' ? 'سفري' : 'توصيل'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-muted-foreground">{formatPrice(refund.original_total)}</td>
                                <td className="py-3 px-4 text-red-500 font-bold">{formatPrice(refund.refund_amount)}</td>
                                <td className="py-3 px-4 text-foreground max-w-xs truncate" title={refund.reason}>{refund.reason}</td>
                                <td className="py-3 px-4 text-muted-foreground">{refund.refunded_by_name}</td>
                                <td className="py-3 px-4 text-muted-foreground text-sm">
                                  {new Date(refund.created_at).toLocaleString('ar-IQ')}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="8" className="py-8 text-center text-muted-foreground">
                                لا توجد إرجاعات في هذه الفترة
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                جاري تحميل بيانات الإرجاعات...
              </div>
            )}
          </TabsContent>

          {/* Credit Report (الآجل) */}
          <TabsContent value="credit">
            {creditReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title="إجمالي الآجل"
                    value={formatPrice(creditReport.total_credit)}
                    icon={CreditCard}
                    color="blue-500"
                  />
                  <StatCard
                    title="عدد الطلبات"
                    value={creditReport.total_orders}
                    icon={ShoppingCart}
                    color="purple-500"
                  />
                  <StatCard
                    title="تم التحصيل"
                    value={formatPrice(creditReport.collected_amount)}
                    icon={TrendingUp}
                    color="green-500"
                  />
                  <StatCard
                    title="المتبقي"
                    value={formatPrice(creditReport.remaining_amount)}
                    icon={TrendingDown}
                    color="red-500"
                  />
                </div>

                <Card className="border-border/50 bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-blue-500" />
                      الطلبات الآجلة
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-right p-3 text-muted-foreground">#</th>
                            <th className="text-right p-3 text-muted-foreground">التاريخ</th>
                            <th className="text-right p-3 text-muted-foreground">العميل</th>
                            <th className="text-right p-3 text-muted-foreground">الهاتف</th>
                            <th className="text-right p-3 text-muted-foreground">المبلغ</th>
                            <th className="text-right p-3 text-muted-foreground">الحالة</th>
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
                              <td className="p-3 tabular-nums text-blue-500">{formatPrice(order.total)}</td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  order.credit_collected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                }`}>
                                  {order.credit_collected ? 'تم التحصيل' : 'لم يحصل'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(!creditReport.orders || creditReport.orders.length === 0) && (
                        <div className="text-center py-8 text-muted-foreground">
                          <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>لا توجد طلبات آجلة في هذه الفترة</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
