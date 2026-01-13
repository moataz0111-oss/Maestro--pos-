import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice, formatPriceCompact } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
  FileText
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Reports() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('all');
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

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    fetchReports();
  }, [selectedBranch, startDate, endDate, activeTab]);

  const fetchBranches = async () => {
    try {
      const res = await axios.get(`${API}/branches`);
      setBranches(res.data);
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    const params = {
      start_date: startDate,
      end_date: endDate,
      ...(selectedBranch !== 'all' && { branch_id: selectedBranch })
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
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[180px] mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الفروع</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <TabsList className="grid grid-cols-7 mb-6">
            <TabsTrigger value="sales">المبيعات</TabsTrigger>
            <TabsTrigger value="purchases">المشتريات</TabsTrigger>
            <TabsTrigger value="inventory">المخزون</TabsTrigger>
            <TabsTrigger value="expenses">المصاريف</TabsTrigger>
            <TabsTrigger value="profit">الأرباح</TabsTrigger>
            <TabsTrigger value="products">الأصناف</TabsTrigger>
            <TabsTrigger value="delivery">شركات التوصيل</TabsTrigger>
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

          {/* Inventory Report */}
          <TabsContent value="inventory">
            {inventoryReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title="إجمالي الأصناف"
                    value={inventoryReport.total_items}
                    icon={Package}
                    color="blue-500"
                  />
                  <StatCard
                    title="المواد الخام"
                    value={inventoryReport.raw_materials_count}
                    subtitle={formatPrice(inventoryReport.raw_materials_value)}
                    icon={Package}
                    color="purple-500"
                  />
                  <StatCard
                    title="المنتجات النهائية"
                    value={inventoryReport.finished_products_count}
                    subtitle={formatPrice(inventoryReport.finished_products_value)}
                    icon={Package}
                    color="green-500"
                  />
                  <StatCard
                    title="قيمة المخزون"
                    value={formatPrice(inventoryReport.total_inventory_value)}
                    icon={DollarSign}
                    color="primary"
                  />
                </div>

                {inventoryReport.low_stock_count > 0 && (
                  <Card className="border-destructive/50 bg-destructive/5">
                    <CardHeader>
                      <CardTitle className="text-lg text-destructive">تنبيه نقص المخزون ({inventoryReport.low_stock_count})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {inventoryReport.low_stock_items?.map(item => (
                          <div key={item.id} className="p-3 bg-destructive/10 rounded-lg">
                            <p className="font-medium text-foreground">{item.name}</p>
                            <p className="text-sm text-destructive">
                              {item.quantity} / {item.min_quantity} {item.unit}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
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
        </Tabs>
      </main>
    </div>
  );
}
