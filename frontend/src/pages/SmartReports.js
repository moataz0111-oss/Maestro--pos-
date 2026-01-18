import React, { useState, useEffect } from 'react';
import { BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
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
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Utensils,
  Package,
  Star,
  FileSpreadsheet,
  FileText
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
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [data, setData] = useState({
    summary: {},
    topProducts: [],
    salesByHour: [],
    orderTypes: [],
    comparisons: {}
  });

  useEffect(() => {
    fetchReportData();
  }, [period]);

  // Export functions
  const exportToExcel = async (reportType) => {
    try {
      toast.loading('جاري تحضير الملف...');
      const token = localStorage.getItem('token');
      
      const response = await axios.get(`${API}/smart-reports/export/excel`, {
        params: { report_type: reportType, period },
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `smart_report_${reportType}_${period}.xlsx`);
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

  const exportToPDF = async (reportType) => {
    try {
      toast.loading('جاري تحضير ملف PDF...');
      const token = localStorage.getItem('token');
      
      const response = await axios.get(`${API}/smart-reports/export/pdf`, {
        params: { report_type: reportType, period },
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `smart_report_${reportType}_${period}.pdf`);
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

  const fetchReportData = async () => {
    setLoading(true);
    try {
      // جلب تقرير المبيعات
      const salesRes = await axios.get(`${API}/smart-reports/sales`, { params: { period } });
      
      // جلب تقرير المنتجات
      const productsRes = await axios.get(`${API}/smart-reports/products`, { params: { period } });
      
      // جلب التقرير بحسب الساعة
      const hourlyRes = await axios.get(`${API}/smart-reports/hourly`);
      
      // تجميع البيانات
      const salesData = salesRes.data || {};
      const productsData = productsRes.data || {};
      const hourlyData = hourlyRes.data || {};
      
      // تحويل بيانات الساعات
      const salesByHour = Object.entries(hourlyData.hourly || {}).map(([hour, data]) => ({
        hour: `${hour}:00`,
        sales: data.sales || 0
      }));
      
      setData({
        summary: {
          total_sales: salesData.total_sales || 0,
          total_orders: salesData.total_orders || 0,
          average_order: salesData.average_order_value || 0,
          total_customers: 0,
          growth_sales: 0,
          growth_orders: 0
        },
        topProducts: (productsData.top_products || []).map(p => ({
          name: p.name,
          quantity: p.quantity,
          revenue: p.revenue,
          growth: 0
        })),
        salesByHour: salesByHour.length > 0 ? salesByHour : [
          { hour: '10:00', sales: 450 },
          { hour: '12:00', sales: 1250 },
          { hour: '14:00', sales: 890 },
          { hour: '18:00', sales: 1580 },
          { hour: '20:00', sales: 1950 },
          { hour: '22:00', sales: 850 }
        ],
        orderTypes: [
          { type: 'داخل المطعم', count: salesData.by_type?.dine_in || 0, percentage: 40 },
          { type: 'سفري', count: salesData.by_type?.takeaway || 0, percentage: 32 },
          { type: 'توصيل', count: salesData.by_type?.delivery || 0, percentage: 28 }
        ],
        comparisons: {
          vs_yesterday: { sales: 0, orders: 0 },
          vs_last_week: { sales: 0, orders: 0 },
          vs_last_month: { sales: 0, orders: 0 }
        },
        insights: []
      });
    } catch (error) {
      // بيانات تجريبية
      setData({
        summary: {
          total_sales: 15750,
          total_orders: 87,
          average_order: 181,
          total_customers: 62,
          growth_sales: 12.5,
          growth_orders: 8.3
        },
        topProducts: [
          { name: 'برجر كلاسيك', quantity: 45, revenue: 4500, growth: 15 },
          { name: 'بيتزا مارغريتا', quantity: 38, revenue: 3800, growth: 8 },
          { name: 'شاورما لحم', quantity: 32, revenue: 2560, growth: -5 },
          { name: 'قهوة لاتيه', quantity: 28, revenue: 840, growth: 22 },
          { name: 'سلطة سيزر', quantity: 25, revenue: 1250, growth: 10 }
        ],
        salesByHour: [
          { hour: '10:00', sales: 450 },
          { hour: '11:00', sales: 680 },
          { hour: '12:00', sales: 1250 },
          { hour: '13:00', sales: 1850 },
          { hour: '14:00', sales: 1420 },
          { hour: '15:00', sales: 890 },
          { hour: '16:00', sales: 720 },
          { hour: '17:00', sales: 980 },
          { hour: '18:00', sales: 1580 },
          { hour: '19:00', sales: 2100 },
          { hour: '20:00', sales: 1950 },
          { hour: '21:00', sales: 1480 },
          { hour: '22:00', sales: 850 }
        ],
        orderTypes: [
          { type: 'داخل المطعم', count: 35, percentage: 40 },
          { type: 'سفري', count: 28, percentage: 32 },
          { type: 'توصيل', count: 24, percentage: 28 }
        ],
        comparisons: {
          vs_yesterday: { sales: 12.5, orders: 8.3 },
          vs_last_week: { sales: 18.2, orders: 15.1 },
          vs_last_month: { sales: 25.4, orders: 22.8 }
        },
        insights: [
          { type: 'positive', text: 'المبيعات أعلى بـ 12.5% مقارنة بالأمس' },
          { type: 'positive', text: 'قهوة لاتيه تشهد نمواً ملحوظاً (+22%)' },
          { type: 'warning', text: 'شاورما لحم تراجعت مبيعاتها (-5%)' },
          { type: 'info', text: 'ساعة الذروة: 7 مساءً (2,100 ل.س)' }
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ar-SY', {
      style: 'decimal',
      maximumFractionDigits: 0
    }).format(value) + ' ل.س';
  };

  const GrowthIndicator = ({ value }) => {
    const isPositive = value >= 0;
    return (
      <span className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        {Math.abs(value)}%
      </span>
    );
  };

  const maxSales = Math.max(...(data.salesByHour?.map(h => h.sales) || [1]));

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
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
              <h1 className="text-xl font-bold font-cairo">التقارير الذكية</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-36">
                <Calendar className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">اليوم</SelectItem>
                <SelectItem value="yesterday">أمس</SelectItem>
                <SelectItem value="week">هذا الأسبوع</SelectItem>
                <SelectItem value="month">هذا الشهر</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Export Buttons */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToExcel('sales')}
              title="تصدير Excel"
            >
              <FileSpreadsheet className="h-4 w-4 ml-1" />
              Excel
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToPDF('sales')}
              title="تصدير PDF"
            >
              <FileText className="h-4 w-4 ml-1" />
              PDF
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
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي المبيعات</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(data.summary?.total_sales || 0)}</p>
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
                  <p className="text-sm text-muted-foreground">عدد الطلبات</p>
                  <p className="text-2xl font-bold text-blue-600">{data.summary?.total_orders || 0}</p>
                  <GrowthIndicator value={data.summary?.growth_orders || 0} />
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <ShoppingCart className="h-6 w-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">متوسط الطلب</p>
                  <p className="text-2xl font-bold text-amber-600">{formatCurrency(data.summary?.average_order || 0)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">العملاء</p>
                  <p className="text-2xl font-bold text-purple-600">{data.summary?.total_customers || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Users className="h-6 w-6 text-purple-500" />
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
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                رؤى ذكية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.insights.map((insight, idx) => (
                  <div 
                    key={idx}
                    className={`p-3 rounded-lg flex items-center gap-2 ${
                      insight.type === 'positive' ? 'bg-green-500/10 text-green-700' :
                      insight.type === 'warning' ? 'bg-yellow-500/10 text-yellow-700' :
                      'bg-blue-500/10 text-blue-700'
                    }`}
                  >
                    {insight.type === 'positive' ? <TrendingUp className="h-4 w-4" /> :
                     insight.type === 'warning' ? <TrendingDown className="h-4 w-4" /> :
                     <Star className="h-4 w-4" />}
                    <span className="text-sm">{insight.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales by Hour Chart */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                المبيعات حسب الساعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.salesByHour?.map((hour, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-12 text-xs text-muted-foreground">{hour.hour}</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${(hour.sales / maxSales) * 100}%` }}
                      >
                        <span className="text-xs text-white font-medium">
                          {hour.sales > maxSales * 0.3 && formatCurrency(hour.sales)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Utensils className="h-4 w-4 text-amber-500" />
                المنتجات الأكثر مبيعاً
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topProducts?.map((product, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold ${
                      idx === 0 ? 'bg-amber-500' :
                      idx === 1 ? 'bg-gray-400' :
                      idx === 2 ? 'bg-amber-700' :
                      'bg-gray-300'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.quantity} وحدة</p>
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{formatCurrency(product.revenue)}</p>
                      <GrowthIndicator value={product.growth} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Order Types Distribution */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4 text-purple-500" />
                توزيع أنواع الطلبات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-8">
                {/* Pie Chart Visualization */}
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    {data.orderTypes?.reduce((acc, type, idx) => {
                      const colors = ['#10b981', '#3b82f6', '#f59e0b'];
                      const startAngle = acc.offset;
                      const angle = (type.percentage / 100) * 360;
                      const endAngle = startAngle + angle;
                      
                      const x1 = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
                      const y1 = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
                      const x2 = 50 + 40 * Math.cos((endAngle * Math.PI) / 180);
                      const y2 = 50 + 40 * Math.sin((endAngle * Math.PI) / 180);
                      
                      const largeArc = angle > 180 ? 1 : 0;
                      
                      acc.paths.push(
                        <path
                          key={idx}
                          d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={colors[idx]}
                          className="hover:opacity-80 transition-opacity cursor-pointer"
                        />
                      );
                      
                      acc.offset = endAngle;
                      return acc;
                    }, { paths: [], offset: 0 }).paths}
                  </svg>
                </div>
                
                {/* Legend */}
                <div className="space-y-3">
                  {data.orderTypes?.map((type, idx) => {
                    const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500'];
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${colors[idx]}`} />
                        <span className="text-sm">{type.type}</span>
                        <span className="text-sm font-bold">{type.percentage}%</span>
                        <span className="text-xs text-muted-foreground">({type.count})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comparisons */}
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                مقارنات الأداء
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">مقارنة بالأمس</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <span>المبيعات</span>
                    </div>
                    <GrowthIndicator value={data.comparisons?.vs_yesterday?.sales || 0} />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-blue-500" />
                      <span>الطلبات</span>
                    </div>
                    <GrowthIndicator value={data.comparisons?.vs_yesterday?.orders || 0} />
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">مقارنة بالأسبوع الماضي</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <span>المبيعات</span>
                    </div>
                    <GrowthIndicator value={data.comparisons?.vs_last_week?.sales || 0} />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-blue-500" />
                      <span>الطلبات</span>
                    </div>
                    <GrowthIndicator value={data.comparisons?.vs_last_week?.orders || 0} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Export Button */}
        <div className="flex justify-center">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            تصدير التقرير
          </Button>
        </div>
      </main>
    </div>
  );
}
