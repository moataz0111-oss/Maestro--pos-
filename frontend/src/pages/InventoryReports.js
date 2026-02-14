import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { API_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  ArrowRight,
  Package,
  Warehouse,
  Factory,
  Truck,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  PieChart,
  Calendar,
  RefreshCw,
  Download,
  Filter,
  Building2,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Boxes,
  Calculator
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
const API = API_URL;
export default function InventoryReports() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { t, isRTL } = useTranslation();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month');
  const [selectedBranch, setSelectedBranch] = useState('all');
  
  // Data states
  const [stats, setStats] = useState(null);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [manufacturedProducts, setManufacturedProducts] = useState([]);
  const [warehouseTransactions, setWarehouseTransactions] = useState([]);
  const [branchOrders, setBranchOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [purchases, setPurchases] = useState([]);
  
  // Calculated metrics
  const [metrics, setMetrics] = useState({
    totalRawMaterialValue: 0,
    totalManufacturedValue: 0,
    totalPurchasesAmount: 0,
    totalBranchOrdersValue: 0,
    avgProfitMargin: 0,
    lowStockItems: [],
    topProducts: [],
    branchComparison: []
  });
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  useEffect(() => {
    fetchData();
  }, [dateRange, selectedBranch]);
  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        statsRes,
        rawRes,
        productsRes,
        transactionsRes,
        ordersRes,
        branchesRes,
        purchasesRes
      ] = await Promise.all([
        axios.get(`${API}/inventory-stats`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/raw-materials-new`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/manufactured-products`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/warehouse-transactions`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/branch-orders-new`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/branches`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/purchases-new`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setStats(statsRes.data);
      setRawMaterials(rawRes.data || []);
      setManufacturedProducts(productsRes.data || []);
      setWarehouseTransactions(transactionsRes.data || []);
      setBranchOrders(ordersRes.data || []);
      setBranches(branchesRes.data || []);
      setPurchases(purchasesRes.data || []);
      
      // Calculate metrics
      calculateMetrics(
        rawRes.data || [],
        productsRes.data || [],
        ordersRes.data || [],
        purchasesRes.data || [],
        branchesRes.data || []
      );
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };
  const calculateMetrics = (raw, products, orders, purchases, branches) => {
    // إجمالي قيمة المواد الخام
    const totalRawMaterialValue = raw.reduce(
      (sum, m) => sum + (m.quantity || 0) * (m.cost_per_unit || 0), 0
    );
    
    // إجمالي قيمة المنتجات المصنعة
    const totalManufacturedValue = products.reduce(
      (sum, p) => sum + (p.quantity || 0) * (p.raw_material_cost || 0), 0
    );
    
    // إجمالي المشتريات
    const totalPurchasesAmount = purchases.reduce(
      (sum, p) => sum + (p.total_amount || 0), 0
    );
    
    // إجمالي طلبات الفروع
    const totalBranchOrdersValue = orders.reduce(
      (sum, o) => sum + (o.total_cost || 0), 0
    );
    
    // متوسط هامش الربح
    const margins = products
      .filter(p => p.selling_price > 0)
      .map(p => ((p.selling_price - p.raw_material_cost) / p.selling_price) * 100);
    const avgProfitMargin = margins.length > 0
      ? margins.reduce((a, b) => a + b, 0) / margins.length
      : 0;
    
    // المنتجات ذات المخزون المنخفض
    const lowStockItems = [
      ...raw.filter(m => m.quantity <= m.min_quantity).map(m => ({ ...m, type: 'raw' })),
      ...products.filter(p => p.quantity <= p.min_quantity).map(p => ({ ...p, type: 'manufactured' }))
    ];
    
    // أكثر المنتجات ربحية
    const topProducts = [...products]
      .sort((a, b) => (b.profit_margin || 0) - (a.profit_margin || 0))
      .slice(0, 5);
    
    // مقارنة الفروع
    const branchComparison = branches.map(branch => {
      const branchOrders = orders.filter(o => o.to_branch_id === branch.id);
      return {
        id: branch.id,
        name: branch.name,
        ordersCount: branchOrders.length,
        totalValue: branchOrders.reduce((sum, o) => sum + (o.total_cost || 0), 0),
        deliveredCount: branchOrders.filter(o => o.status === 'delivered').length
      };
    }).sort((a, b) => b.totalValue - a.totalValue);
    
    setMetrics({
      totalRawMaterialValue,
      totalManufacturedValue,
      totalPurchasesAmount,
      totalBranchOrdersValue,
      avgProfitMargin,
      lowStockItems,
      topProducts,
      branchComparison
    });
  };
  // تصدير التقرير
  const exportReport = () => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      period: dateRange,
      summary: {
        totalRawMaterialValue: metrics.totalRawMaterialValue,
        totalManufacturedValue: metrics.totalManufacturedValue,
        totalPurchasesAmount: metrics.totalPurchasesAmount,
        avgProfitMargin: metrics.avgProfitMargin
      },
      rawMaterials: rawMaterials.map(m => ({
        name: m.name,
        quantity: m.quantity,
        unit: m.unit,
        cost: m.cost_per_unit,
        value: m.quantity * m.cost_per_unit
      })),
      manufacturedProducts: manufacturedProducts.map(p => ({
        name: p.name,
        quantity: p.quantity,
        cost: p.raw_material_cost,
        sellingPrice: p.selling_price,
        profitMargin: p.profit_margin
      }))
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('تم تصدير التقرير'));
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'} data-testid="inventory-reports-page">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                {t('تقارير المخزون والتصنيع')}
              </h1>
              <p className="text-xs text-muted-foreground">{t('تحليل الأداء والتكاليف والأرباح')}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-32">
                <Calendar className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t('اليوم')}</SelectItem>
                <SelectItem value="week">{t('هذا الأسبوع')}</SelectItem>
                <SelectItem value="month">{t('هذا الشهر')}</SelectItem>
                <SelectItem value="year">{t('هذه السنة')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportReport}>
              <Download className="h-4 w-4 ml-2" />
              {t('تصدير')}
            </Button>
            <Button variant="outline" size="icon" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('قيمة المواد الخام')}</p>
                  <p className="text-2xl font-bold text-blue-500">{formatPrice(metrics.totalRawMaterialValue)}</p>
                  <p className="text-xs text-muted-foreground">{rawMaterials.length} {t('صنف')}</p>
                </div>
                <Package className="h-10 w-10 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/10 border-green-500/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('قيمة المنتجات المصنعة')}</p>
                  <p className="text-2xl font-bold text-green-500">{formatPrice(metrics.totalManufacturedValue)}</p>
                  <p className="text-xs text-muted-foreground">{manufacturedProducts.length} {t('منتج')}</p>
                </div>
                <Factory className="h-10 w-10 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 border-purple-500/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('إجمالي المشتريات')}</p>
                  <p className="text-2xl font-bold text-purple-500">{formatPrice(metrics.totalPurchasesAmount)}</p>
                  <p className="text-xs text-muted-foreground">{purchases.length} {t('فاتورة')}</p>
                </div>
                <DollarSign className="h-10 w-10 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/10 border-amber-500/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('متوسط هامش الربح')}</p>
                  <p className="text-2xl font-bold text-amber-500">{metrics.avgProfitMargin.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">{t('للمنتجات المصنعة')}</p>
                </div>
                <TrendingUp className="h-10 w-10 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="overview" className="gap-2" data-testid="tab-overview">
              <PieChart className="h-4 w-4" />
              {t('نظرة عامة')}
            </TabsTrigger>
            <TabsTrigger value="materials" className="gap-2" data-testid="tab-materials">
              <Package className="h-4 w-4" />
              {t('المواد الخام')}
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2" data-testid="tab-products">
              <Factory className="h-4 w-4" />
              {t('المنتجات')}
            </TabsTrigger>
            <TabsTrigger value="branches" className="gap-2" data-testid="tab-branches">
              <Building2 className="h-4 w-4" />
              {t('الفروع')}
            </TabsTrigger>
          </TabsList>
          {/* نظرة عامة */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* تنبيهات نقص المخزون */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-red-500">
                    <AlertTriangle className="h-5 w-5" />
                    {t('تنبيهات نقص المخزون')} ({metrics.lowStockItems.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics.lowStockItems.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p>{t('جميع الأصناف متوفرة بكميات كافية')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {metrics.lowStockItems.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg">
                          <div className="flex items-center gap-2">
                            {item.type === 'raw' ? (
                              <Package className="h-4 w-4 text-red-500" />
                            ) : (
                              <Factory className="h-4 w-4 text-red-500" />
                            )}
                            <span className="font-medium">{item.name}</span>
                          </div>
                          <div className="text-left">
                            <span className="text-red-500 font-bold">{item.quantity}</span>
                            <span className="text-muted-foreground text-sm mr-1">/ {item.min_quantity} {item.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              {/* أكثر المنتجات ربحية */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-green-500">
                    <TrendingUp className="h-5 w-5" />
                    {t('أكثر المنتجات ربحية')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics.topProducts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Factory className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>لا توجد منتجات مصنعة بعد</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {metrics.topProducts.map((product, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                              idx === 0 ? 'bg-yellow-500' :
                              idx === 1 ? 'bg-gray-400' :
                              idx === 2 ? 'bg-amber-700' :
                              'bg-gray-300'
                            }`}>
                              {idx + 1}
                            </span>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <p className="text-xs text-muted-foreground">
                                تكلفة: {formatPrice(product.raw_material_cost)} | بيع: {formatPrice(product.selling_price)}
                              </p>
                            </div>
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-green-500">{formatPrice(product.profit_margin)}</p>
                            <p className="text-xs text-muted-foreground">
                              {product.selling_price > 0 
                                ? `${((product.profit_margin / product.selling_price) * 100).toFixed(0)}% هامش`
                                : '0%'
                              }
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            {/* ملخص الحركات */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpCircle className="h-5 w-5 text-primary" />
                  آخر حركات المخزون
                </CardTitle>
              </CardHeader>
              <CardContent>
                {warehouseTransactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد حركات بعد</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {warehouseTransactions.slice(0, 10).map((txn, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {txn.type === 'incoming' ? (
                            <ArrowDownCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <ArrowUpCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <p className="font-medium">{txn.type === 'incoming' ? t('وارد') : t('صادر')}</p>
                            <p className="text-xs text-muted-foreground">
                              {txn.supplier_name || txn.source || t('غير محدد')}
                            </p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="font-bold">{formatPrice(txn.total_amount || 0)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(txn.created_at).toLocaleDateString('ar-IQ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* تقرير المواد الخام */}
          <TabsContent value="materials" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-500" />
                  تفاصيل المواد الخام
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rawMaterials.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد مواد خام</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-right p-3 font-medium">الاسم</th>
                          <th className="text-right p-3 font-medium">الكمية</th>
                          <th className="text-right p-3 font-medium">الحد الأدنى</th>
                          <th className="text-right p-3 font-medium">تكلفة/وحدة</th>
                          <th className="text-right p-3 font-medium">القيمة الإجمالية</th>
                          <th className="text-right p-3 font-medium">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rawMaterials.map(material => {
                          const totalValue = (material.quantity || 0) * (material.cost_per_unit || 0);
                          const isLow = material.quantity <= material.min_quantity;
                          return (
                            <tr key={material.id} className="border-b hover:bg-muted/30">
                              <td className="p-3 font-medium">{material.name}</td>
                              <td className="p-3">{material.quantity} {material.unit}</td>
                              <td className="p-3">{material.min_quantity} {material.unit}</td>
                              <td className="p-3">{formatPrice(material.cost_per_unit)}</td>
                              <td className="p-3 font-bold text-primary">{formatPrice(totalValue)}</td>
                              <td className="p-3">
                                <Badge className={isLow ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}>
                                  {isLow ? 'نقص' : 'متوفر'}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-primary/10">
                          <td className="p-3 font-bold" colSpan={4}>الإجمالي</td>
                          <td className="p-3 font-bold text-primary">{formatPrice(metrics.totalRawMaterialValue)}</td>
                          <td className="p-3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* تقرير المنتجات المصنعة */}
          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5 text-green-500" />
                  تحليل المنتجات المصنعة والأرباح
                </CardTitle>
              </CardHeader>
              <CardContent>
                {manufacturedProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Factory className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد منتجات مصنعة</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-right p-3 font-medium">المنتج</th>
                          <th className="text-right p-3 font-medium">الكمية</th>
                          <th className="text-right p-3 font-medium">تكلفة المواد</th>
                          <th className="text-right p-3 font-medium">سعر البيع</th>
                          <th className="text-right p-3 font-medium">هامش الربح</th>
                          <th className="text-right p-3 font-medium">نسبة الربح</th>
                          <th className="text-right p-3 font-medium">القيمة الإجمالية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manufacturedProducts.map(product => {
                          const profitPercentage = product.selling_price > 0
                            ? ((product.profit_margin / product.selling_price) * 100).toFixed(1)
                            : 0;
                          const totalValue = (product.quantity || 0) * (product.raw_material_cost || 0);
                          return (
                            <tr key={product.id} className="border-b hover:bg-muted/30">
                              <td className="p-3 font-medium">{product.name}</td>
                              <td className="p-3">{product.quantity} {product.unit}</td>
                              <td className="p-3 text-blue-500">{formatPrice(product.raw_material_cost)}</td>
                              <td className="p-3 text-green-500">{formatPrice(product.selling_price)}</td>
                              <td className="p-3 font-bold text-primary">{formatPrice(product.profit_margin)}</td>
                              <td className="p-3">
                                <Badge className={
                                  profitPercentage >= 50 ? 'bg-green-500/20 text-green-500' :
                                  profitPercentage >= 30 ? 'bg-yellow-500/20 text-yellow-500' :
                                  'bg-red-500/20 text-red-500'
                                }>
                                  {profitPercentage}%
                                </Badge>
                              </td>
                              <td className="p-3">{formatPrice(totalValue)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-primary/10">
                          <td className="p-3 font-bold" colSpan={4}>الإجمالي</td>
                          <td className="p-3 font-bold text-primary">
                            {formatPrice(manufacturedProducts.reduce((s, p) => s + (p.profit_margin || 0), 0))}
                          </td>
                          <td className="p-3 font-bold">{metrics.avgProfitMargin.toFixed(1)}%</td>
                          <td className="p-3 font-bold">{formatPrice(metrics.totalManufacturedValue)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* مقارنة الفروع */}
          <TabsContent value="branches" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-500" />
                  مقارنة استهلاك الفروع
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.branchComparison.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد بيانات للفروع</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {metrics.branchComparison.map((branch, idx) => {
                      const maxValue = metrics.branchComparison[0]?.totalValue || 1;
                      const percentage = (branch.totalValue / maxValue) * 100;
                      return (
                        <div key={branch.id} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                                idx === 0 ? 'bg-indigo-500' :
                                idx === 1 ? 'bg-indigo-400' :
                                'bg-indigo-300'
                              }`}>
                                {idx + 1}
                              </span>
                              <span className="font-bold">{branch.name}</span>
                            </div>
                            <span className="font-bold text-primary">{formatPrice(branch.totalValue)}</span>
                          </div>
                          
                          <div className="w-full bg-muted rounded-full h-3 mb-2">
                            <div 
                              className="bg-indigo-500 h-3 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>{branch.ordersCount} طلب</span>
                            <span>{branch.deliveredCount} تم تسليمه</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* إحصائيات طلبات الفروع */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-lime-500" />
                  إحصائيات طلبات الفروع
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-yellow-500/10 rounded-lg text-center">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                    <p className="text-2xl font-bold">{branchOrders.filter(o => o.status === 'pending').length}</p>
                    <p className="text-sm text-muted-foreground">قيد الانتظار</p>
                  </div>
                  <div className="p-4 bg-blue-500/10 rounded-lg text-center">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                    <p className="text-2xl font-bold">{branchOrders.filter(o => o.status === 'approved').length}</p>
                    <p className="text-sm text-muted-foreground">تمت الموافقة</p>
                  </div>
                  <div className="p-4 bg-purple-500/10 rounded-lg text-center">
                    <Truck className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                    <p className="text-2xl font-bold">{branchOrders.filter(o => o.status === 'shipped').length}</p>
                    <p className="text-sm text-muted-foreground">قيد الشحن</p>
                  </div>
                  <div className="p-4 bg-green-500/10 rounded-lg text-center">
                    <Boxes className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-2xl font-bold">{branchOrders.filter(o => o.status === 'delivered').length}</p>
                    <p className="text-sm text-muted-foreground">تم التسليم</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
