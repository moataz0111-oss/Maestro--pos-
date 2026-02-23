import React, { useState, useEffect } from 'react';
import { API_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import BranchSelector from '../components/BranchSelector';
import {
  ArrowRight,
  Target,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  DollarSign,
  Users,
  Home,
  Zap,
  Droplets,
  Settings,
  Calendar,
  RefreshCw,
  Building2,
  Percent,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Wallet
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible';

const API = API_URL;

export default function BreakEvenReport() {
  const { user } = useAuth();
  const { selectedBranchId, getBranchIdForApi } = useBranch();
  const { t, isRTL } = useTranslation();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [expandedBranches, setExpandedBranches] = useState({});
  const [viewMode, setViewMode] = useState('daily'); // daily or monthly
  
  useEffect(() => {
    fetchData();
  }, [selectedBranchId, selectedDate, selectedMonth, viewMode]);
  
  const fetchData = async () => {
    setLoading(true);
    try {
      const branchId = getBranchIdForApi();
      
      if (viewMode === 'daily') {
        const res = await axios.get(`${API}/break-even/daily`, {
          params: {
            branch_id: branchId || undefined,
            date: selectedDate
          }
        });
        setDailyData(res.data);
      } else {
        const res = await axios.get(`${API}/break-even/monthly-summary`, {
          params: {
            branch_id: branchId || undefined,
            month: selectedMonth
          }
        });
        setMonthlyData(res.data);
      }
    } catch (error) {
      console.error('Failed to fetch break-even data:', error);
      toast.error(t('فشل في تحميل البيانات'));
    } finally {
      setLoading(false);
    }
  };
  
  const toggleBranchExpand = (branchId) => {
    setExpandedBranches(prev => ({
      ...prev,
      [branchId]: !prev[branchId]
    }));
  };
  
  const getCoverageColor = (percentage) => {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-yellow-500';
    if (percentage >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };
  
  const getCoverageTextColor = (percentage) => {
    if (percentage >= 100) return 'text-green-600';
    if (percentage >= 75) return 'text-yellow-600';
    if (percentage >= 50) return 'text-orange-600';
    return 'text-red-600';
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('جاري التحميل...')}</p>
        </div>
      </div>
    );
  }
  
  const data = viewMode === 'daily' ? dailyData : monthlyData;
  
  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/reports')}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground flex items-center gap-2">
                <Target className="h-6 w-6 text-primary" />
                {t('تقرير تحليل التكاليف والأرباح')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('تحليل شامل للتكاليف التشغيلية وصافي الأرباح')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* اختيار الفرع */}
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <BranchSelector />
            </div>
            
            {/* تبديل الوضع */}
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === 'daily' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('daily')}
              >
                {t('يومي')}
              </Button>
              <Button
                variant={viewMode === 'monthly' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('monthly')}
              >
                {t('شهري')}
              </Button>
            </div>
            
            {/* اختيار التاريخ */}
            {viewMode === 'daily' ? (
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-40"
              />
            ) : (
              <Input
                type="month"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-40"
              />
            )}
            
            <Button variant="outline" size="icon" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ملخص إجمالي */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className={`border-2 ${data?.is_break_even_reached ? 'border-green-500 bg-green-500/5' : 'border-orange-500 bg-orange-500/5'}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('الهدف')} {viewMode === 'daily' ? t('اليومي') : t('الشهري')}</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatPrice(viewMode === 'daily' ? data?.total_daily_target : data?.total_monthly_target)}
                  </p>
                </div>
                <Target className="h-10 w-10 text-primary opacity-80" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('الربح الإجمالي')}</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatPrice(viewMode === 'daily' ? data?.total_daily_profit : data?.total_monthly_profit)}
                  </p>
                </div>
                <TrendingUp className="h-10 w-10 text-green-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('نسبة التغطية')}</p>
                  <p className={`text-2xl font-bold ${getCoverageTextColor(data?.total_coverage_percentage)}`}>
                    {data?.total_coverage_percentage}%
                  </p>
                </div>
                <Percent className="h-10 w-10 text-blue-500 opacity-80" />
              </div>
              <Progress 
                value={Math.min(data?.total_coverage_percentage || 0, 100)} 
                className="mt-3 h-2"
              />
            </CardContent>
          </Card>
          
          <Card className="bg-blue-500/10 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('إجمالي التحصيل')}</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatPrice(viewMode === 'daily' ? data?.total_daily_profit : data?.total_monthly_profit)}
                  </p>
                </div>
                <Wallet className="h-10 w-10 text-blue-500 opacity-80" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('مجموع المبيعات المحصّلة')} {viewMode === 'daily' ? t('لهذا اليوم') : t('لهذا الشهر')}
              </p>
            </CardContent>
          </Card>
          
          <Card className={data?.is_break_even_reached ? 'bg-green-500/10' : 'bg-red-500/10'}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {data?.is_break_even_reached ? t('الربح الصافي') : t('المتبقي للتغطية')}
                  </p>
                  <p className={`text-2xl font-bold ${data?.is_break_even_reached ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPrice(data?.is_break_even_reached 
                      ? (viewMode === 'daily' ? data?.net_profit_after_break_even : data?.net_profit_after_costs)
                      : Math.abs((viewMode === 'daily' ? data?.total_daily_target : data?.total_monthly_target) - (viewMode === 'daily' ? data?.total_daily_profit : data?.total_monthly_profit))
                    )}
                  </p>
                </div>
                {data?.is_break_even_reached ? (
                  <CheckCircle className="h-10 w-10 text-green-500" />
                ) : (
                  <AlertTriangle className="h-10 w-10 text-red-500" />
                )}
              </div>
              {data?.is_break_even_reached && (
                <Badge className="mt-2 bg-green-500">{t('تم الوصول لنقطة التعادل')} ✓</Badge>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* تفاصيل الفروع */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {t('تفاصيل الفروع')}
          </h2>
          
          {data?.branches?.length === 0 ? (
            <Card className="p-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('لا توجد فروع أو لم يتم إعداد التكاليف الثابتة بعد')}</p>
              <Button className="mt-4" onClick={() => navigate('/settings')}>
                <Settings className="h-4 w-4 ml-2" />
                {t('إعداد التكاليف في الإعدادات')}
              </Button>
            </Card>
          ) : (
            data?.branches?.map((branch) => (
              <Collapsible
                key={branch.branch_id}
                open={expandedBranches[branch.branch_id]}
                onOpenChange={() => toggleBranchExpand(branch.branch_id)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-3 h-3 rounded-full ${branch.is_break_even_reached ? 'bg-green-500' : 'bg-orange-500'}`} />
                          <div>
                            <CardTitle className="text-foreground">{branch.branch_name}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {branch.orders_count} {t('طلب')} | {t('الهدف')}: {formatPrice(viewMode === 'daily' ? branch.daily_target : branch.monthly_target)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          {/* شريط التقدم المصغر */}
                          <div className="w-32">
                            <div className="flex justify-between text-xs mb-1">
                              <span className={getCoverageTextColor(branch.coverage_percentage)}>
                                {branch.coverage_percentage}%
                              </span>
                            </div>
                            <Progress 
                              value={Math.min(branch.coverage_percentage, 100)} 
                              className="h-2"
                            />
                          </div>
                          
                          {/* الربح/المتبقي */}
                          <div className="text-left min-w-[120px]">
                            {branch.is_break_even_reached ? (
                              <div className="text-green-600">
                                <p className="text-xs text-muted-foreground">{t('الربح الصافي')}</p>
                                <p className="font-bold">{formatPrice(viewMode === 'daily' ? branch.net_profit_after_break_even : branch.net_profit_after_costs)}</p>
                              </div>
                            ) : (
                              <div className="text-orange-600">
                                <p className="text-xs text-muted-foreground">{t('المتبقي')}</p>
                                <p className="font-bold">{formatPrice(branch.remaining_to_break_even)}</p>
                              </div>
                            )}
                          </div>
                          
                          {expandedBranches[branch.branch_id] ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="border-t border-border pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* التكاليف الثابتة */}
                        <div>
                          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-primary" />
                            {t('التكاليف الثابتة')}
                          </h3>
                          <div className="space-y-3">
                            {/* الإيجار */}
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Home className="h-5 w-5 text-blue-500" />
                                <div>
                                  <p className="font-medium text-foreground">{t('الإيجار')}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {viewMode === 'daily' 
                                      ? `${t('يومي')}: ${formatPrice(branch.fixed_costs?.rent?.daily)}`
                                      : `${t('شهري')}: ${formatPrice(branch.fixed_costs?.rent)}`
                                    }
                                  </p>
                                </div>
                              </div>
                              {viewMode === 'daily' && (
                                <div className="text-left">
                                  <p className="text-green-600 text-sm">{t('مغطى')}: {formatPrice(branch.fixed_costs?.rent?.covered)}</p>
                                  <p className="text-orange-600 text-sm">{t('متبقي')}: {formatPrice(branch.fixed_costs?.rent?.remaining)}</p>
                                </div>
                              )}
                            </div>
                            
                            {/* الكهرباء */}
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Zap className="h-5 w-5 text-yellow-500" />
                                <div>
                                  <p className="font-medium text-foreground">{t('الكهرباء')}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {viewMode === 'daily' 
                                      ? `${t('يومي')}: ${formatPrice(branch.fixed_costs?.electricity?.daily)}`
                                      : `${t('شهري')}: ${formatPrice(branch.fixed_costs?.electricity)}`
                                    }
                                  </p>
                                </div>
                              </div>
                              {viewMode === 'daily' && (
                                <div className="text-left">
                                  <p className="text-green-600 text-sm">{t('مغطى')}: {formatPrice(branch.fixed_costs?.electricity?.covered)}</p>
                                  <p className="text-orange-600 text-sm">{t('متبقي')}: {formatPrice(branch.fixed_costs?.electricity?.remaining)}</p>
                                </div>
                              )}
                            </div>
                            
                            {/* الماء */}
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Droplets className="h-5 w-5 text-cyan-500" />
                                <div>
                                  <p className="font-medium text-foreground">{t('الماء')}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {viewMode === 'daily' 
                                      ? `${t('يومي')}: ${formatPrice(branch.fixed_costs?.water?.daily)}`
                                      : `${t('شهري')}: ${formatPrice(branch.fixed_costs?.water)}`
                                    }
                                  </p>
                                </div>
                              </div>
                              {viewMode === 'daily' && (
                                <div className="text-left">
                                  <p className="text-green-600 text-sm">{t('مغطى')}: {formatPrice(branch.fixed_costs?.water?.covered)}</p>
                                  <p className="text-orange-600 text-sm">{t('متبقي')}: {formatPrice(branch.fixed_costs?.water?.remaining)}</p>
                                </div>
                              )}
                            </div>
                            
                            {/* المولدة */}
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Settings className="h-5 w-5 text-gray-500" />
                                <div>
                                  <p className="font-medium text-foreground">{t('المولدة')}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {viewMode === 'daily' 
                                      ? `${t('يومي')}: ${formatPrice(branch.fixed_costs?.generator?.daily)}`
                                      : `${t('شهري')}: ${formatPrice(branch.fixed_costs?.generator)}`
                                    }
                                  </p>
                                </div>
                              </div>
                              {viewMode === 'daily' && (
                                <div className="text-left">
                                  <p className="text-green-600 text-sm">{t('مغطى')}: {formatPrice(branch.fixed_costs?.generator?.covered)}</p>
                                  <p className="text-orange-600 text-sm">{t('متبقي')}: {formatPrice(branch.fixed_costs?.generator?.remaining)}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* الرواتب والملخص */}
                        <div className="space-y-4">
                          {/* الرواتب */}
                          <div>
                            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              {t('الرواتب')} ({branch.salaries?.employees_count} {t('موظف')})
                            </h3>
                            <div className="p-4 bg-muted/30 rounded-lg">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-muted-foreground">{t('الإجمالي الشهري')}</span>
                                <span className="font-bold text-foreground">
                                  {formatPrice(viewMode === 'daily' ? branch.salaries?.monthly_total : branch.salaries?.total)}
                                </span>
                              </div>
                              {viewMode === 'daily' && (
                                <>
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-muted-foreground">{t('اليومي')}</span>
                                    <span className="text-foreground">{formatPrice(branch.salaries?.daily)}</span>
                                  </div>
                                  <div className="flex justify-between items-center text-green-600">
                                    <span>{t('مغطى')}</span>
                                    <span>{formatPrice(branch.salaries?.covered)}</span>
                                  </div>
                                  <div className="flex justify-between items-center text-orange-600">
                                    <span>{t('متبقي')}</span>
                                    <span>{formatPrice(branch.salaries?.remaining)}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          
                          {/* ملخص المبيعات */}
                          <div>
                            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-primary" />
                              {t('ملخص المبيعات')}
                            </h3>
                            <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">{t('إجمالي المبيعات')}</span>
                                  <span className="font-bold text-foreground">
                                    {formatPrice(viewMode === 'daily' ? branch.daily_sales : branch.monthly_sales)}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">{t('تكلفة المواد')}</span>
                                  <span className="text-red-600">
                                    -{formatPrice(viewMode === 'daily' ? branch.daily_material_cost : branch.monthly_material_cost)}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-border">
                                  <span className="text-muted-foreground">{t('الربح الإجمالي')}</span>
                                  <span className="font-bold text-primary">
                                    {formatPrice(viewMode === 'daily' ? branch.daily_gross_profit : branch.monthly_gross_profit)}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">{t('الهدف')}</span>
                                  <span className="text-foreground">
                                    {formatPrice(viewMode === 'daily' ? branch.daily_target : branch.monthly_target)}
                                  </span>
                                </div>
                                <div className={`flex justify-between items-center pt-2 border-t border-border ${branch.is_break_even_reached ? 'text-green-600' : 'text-orange-600'}`}>
                                  <span className="font-bold">
                                    {branch.is_break_even_reached ? t('الربح الصافي') : t('المتبقي')}
                                  </span>
                                  <span className="font-bold text-lg">
                                    {formatPrice(branch.is_break_even_reached 
                                      ? (viewMode === 'daily' ? branch.net_profit_after_break_even : branch.net_profit_after_costs)
                                      : branch.remaining_to_break_even
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
        </div>
        
        {/* ملخص إجمالي التكاليف - جديد */}
        {data?.branches?.length > 0 && (
          <Card className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 border-purple-500/20">
            <CardHeader>
              <CardTitle className="text-lg text-foreground flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-purple-500" />
                {t('ملخص إجمالي التكاليف')} {viewMode === 'daily' ? t('اليومية') : t('الشهرية')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {/* الإيجار */}
                <div className="p-4 bg-background/50 rounded-lg text-center">
                  <Home className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('الإيجار')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatPrice(
                      data.branches.reduce((sum, b) => sum + (viewMode === 'daily' ? (b.fixed_costs?.rent?.daily || 0) : (b.fixed_costs?.rent || 0)), 0)
                    )}
                  </p>
                </div>
                
                {/* الكهرباء */}
                <div className="p-4 bg-background/50 rounded-lg text-center">
                  <Zap className="h-6 w-6 text-yellow-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('الكهرباء')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatPrice(
                      data.branches.reduce((sum, b) => sum + (viewMode === 'daily' ? (b.fixed_costs?.electricity?.daily || 0) : (b.fixed_costs?.electricity || 0)), 0)
                    )}
                  </p>
                </div>
                
                {/* الماء */}
                <div className="p-4 bg-background/50 rounded-lg text-center">
                  <Droplets className="h-6 w-6 text-cyan-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('الماء')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatPrice(
                      data.branches.reduce((sum, b) => sum + (viewMode === 'daily' ? (b.fixed_costs?.water?.daily || 0) : (b.fixed_costs?.water || 0)), 0)
                    )}
                  </p>
                </div>
                
                {/* المولدة */}
                <div className="p-4 bg-background/50 rounded-lg text-center">
                  <Settings className="h-6 w-6 text-gray-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('المولدة')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatPrice(
                      data.branches.reduce((sum, b) => sum + (viewMode === 'daily' ? (b.fixed_costs?.generator?.daily || 0) : (b.fixed_costs?.generator || 0)), 0)
                    )}
                  </p>
                </div>
                
                {/* الرواتب */}
                <div className="p-4 bg-background/50 rounded-lg text-center">
                  <Users className="h-6 w-6 text-indigo-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('الرواتب')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatPrice(
                      data.branches.reduce((sum, b) => sum + (viewMode === 'daily' ? (b.salaries?.daily || 0) : (b.salaries?.total || b.salaries?.monthly_total || 0)), 0)
                    )}
                  </p>
                </div>
                
                {/* الإجمالي */}
                <div className="p-4 bg-red-500/10 rounded-lg text-center border border-red-500/20">
                  <DollarSign className="h-6 w-6 text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('الإجمالي')}</p>
                  <p className="text-xl font-bold text-red-600">
                    {formatPrice(viewMode === 'daily' ? data.total_daily_target : data.total_monthly_target)}
                  </p>
                </div>
              </div>
              
              {/* صافي الربح الإجمالي */}
              <div className={`mt-6 p-4 rounded-lg border-2 ${
                data?.is_break_even_reached 
                  ? 'bg-green-500/10 border-green-500/30' 
                  : 'bg-orange-500/10 border-orange-500/30'
              }`}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('صافي الربح بعد جميع التكاليف')}</p>
                    <p className={`text-3xl font-bold ${data?.is_break_even_reached ? 'text-green-600' : 'text-orange-600'}`}>
                      {formatPrice(viewMode === 'daily' ? data?.net_profit_after_break_even : data?.net_profit_after_costs)}
                    </p>
                  </div>
                  {data?.is_break_even_reached ? (
                    <CheckCircle className="h-12 w-12 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-12 w-12 text-orange-500" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* ملاحظة توضيحية */}
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Target className="h-8 w-8 text-blue-500 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-foreground mb-2">{t('كيف تعمل نقطة التعادل؟')}</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t('يتم تقسيم التكاليف الثابتة الشهرية (إيجار + كهرباء + ماء + مولدة) على 30 يوم')}</li>
                  <li>• {t('يتم إضافة رواتب الموظفين في الفرع مقسومة على 30 يوم')}</li>
                  <li>• {t('المجموع = الهدف اليومي الذي يجب تحقيقه من الأرباح')}</li>
                  <li>• {t('بعد تغطية الهدف، كل ربح إضافي يُحسب كربح صافي 100%')}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
