import React, { useState, useEffect } from 'react';
import { API_URL } from '../utils/api';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  ArrowLeft,
  Building2,
  Percent,
  Users,
  DollarSign,
  Package,
  Calendar,
  RefreshCw,
  Plus,
  Trash2,
  FileText,
  TrendingUp,
  Phone,
  Edit,
  Eye,
  CheckCircle2,
  AlertCircle,
  Banknote,
  Receipt,
  BarChart3,
  Store
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useNavigate } from 'react-router-dom';

const API = API_URL;

// دالة لتنسيق الشهر من YYYY-MM إلى DD/MM/YYYY (اليوم الحالي + الشهر + السنة)
const formatMonth = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const today = new Date().getDate().toString().padStart(2, '0');
  return `${today}/${month}/${year}`;
};

// دالة لتنسيق التاريخ الكامل
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function ExternalBranchesManagement() {
  const { user, hasRole } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [soldBranches, setSoldBranches] = useState([]);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  
  // Dialogs
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [branchSummary, setBranchSummary] = useState(null);
  const [branchPayments, setBranchPayments] = useState([]);
  
  // Form data
  const [newSoldBranch, setNewSoldBranch] = useState({
    branch_id: '',
    buyer_name: '',
    buyer_phone: '',
    owner_percentage: 0,
    monthly_fee: 0,
    notes: ''
  });
  
  const [newPayment, setNewPayment] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const selectedMonth = selectedDate.slice(0, 7); // استخراج YYYY-MM من التاريخ
      const [soldRes, branchesRes, statsRes, reportRes] = await Promise.all([
        axios.get(`${API}/external-branches/`),
        axios.get(`${API}/branches?include_inactive=false`),
        axios.get(`${API}/external-branches/dashboard/stats`),
        axios.get(`${API}/external-branches/reports/monthly?month=${selectedMonth}`)
      ]);
      
      setSoldBranches(soldRes.data);
      setDashboardStats(statsRes.data);
      setMonthlyReport(reportRes.data);
      
      // فلترة الفروع المتاحة (غير المباعة)
      const soldBranchIds = soldRes.data.map(sb => sb.branch_id);
      const available = branchesRes.data.filter(b => !soldBranchIds.includes(b.id));
      setAvailableBranches(available);
      
    } catch (error) {
      console.error('Failed to fetch data:', error);
      // إذا لم يكن هناك فروع مباعة، لا نعرض خطأ
      if (error.response?.status !== 404) {
        toast.error(t('فشل في جلب البيانات'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterBranch = async () => {
    if (!newSoldBranch.branch_id || !newSoldBranch.buyer_name) {
      toast.error(t('يرجى اختيار الفرع وإدخال اسم المشتري'));
      return;
    }
    
    try {
      await axios.post(`${API}/external-branches/register`, newSoldBranch);
      toast.success(t('تم تسجيل الفرع بنجاح'));
      setRegisterDialogOpen(false);
      setNewSoldBranch({
        branch_id: '',
        buyer_name: '',
        buyer_phone: '',
        owner_percentage: 0,
        monthly_fee: 0,
        notes: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تسجيل الفرع'));
    }
  };

  const handleViewDetails = async (soldBranch) => {
    setSelectedBranch(soldBranch);
    setDetailsDialogOpen(true);
    
    try {
      const selectedMonth = selectedDate.slice(0, 7); // استخراج YYYY-MM من التاريخ
      const [summaryRes, paymentsRes] = await Promise.all([
        axios.get(`${API}/external-branches/${soldBranch.id}/summary?month=${selectedMonth}`),
        axios.get(`${API}/external-branches/${soldBranch.id}/payments`)
      ]);
      
      setBranchSummary(summaryRes.data);
      setBranchPayments(paymentsRes.data);
    } catch (error) {
      console.error('Failed to fetch branch details:', error);
    }
  };

  const handleRecordPayment = async () => {
    if (!newPayment.amount || !selectedBranch) {
      toast.error(t('يرجى إدخال المبلغ'));
      return;
    }
    
    try {
      await axios.post(
        `${API}/external-branches/${selectedBranch.id}/payments`,
        null,
        {
          params: {
            amount: parseFloat(newPayment.amount),
            payment_date: newPayment.payment_date,
            notes: newPayment.notes
          }
        }
      );
      toast.success(t('تم تسجيل الدفعة بنجاح'));
      setPaymentDialogOpen(false);
      setNewPayment({ amount: '', payment_date: new Date().toISOString().split('T')[0], notes: '' });
      handleViewDetails(selectedBranch);
    } catch (error) {
      toast.error(t('فشل في تسجيل الدفعة'));
    }
  };

  const handleCancelBranch = async (soldBranchId) => {
    if (!window.confirm(t('هل أنت متأكد من إلغاء تسجيل هذا الفرع كمباع؟'))) return;
    
    try {
      await axios.delete(`${API}/external-branches/${soldBranchId}`);
      toast.success(t('تم إلغاء التسجيل'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في الإلغاء'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="external-branches-page">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <Store className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">{t('إدارة الفروع الخارجية')}</h1>
                  <p className="text-sm text-muted-foreground">{t('الفروع المباعة والعوائد')}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-40"
              />
              <Button onClick={fetchData} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats Cards */}
        {dashboardStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">{t('الفروع المباعة')}</p>
                    <p className="text-2xl font-bold mt-1">{dashboardStats.sold_branches_count}</p>
                    <p className="text-xs mt-1 opacity-80">{t('فرع نشط')}</p>
                  </div>
                  <Building2 className="h-10 w-10 opacity-40" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">{t('عوائد النسبة')}</p>
                    <p className="text-2xl font-bold mt-1">{formatPrice(dashboardStats.monthly_revenue)}</p>
                    <p className="text-xs mt-1 opacity-80">{formatMonth(selectedMonth)}</p>
                  </div>
                  <Percent className="h-10 w-10 opacity-40" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0 shadow-lg">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">{t('قيمة المواد المسحوبة')}</p>
                    <p className="text-2xl font-bold mt-1">{formatPrice(dashboardStats.monthly_materials)}</p>
                    <p className="text-xs mt-1 opacity-80">{t('هذا الشهر')}</p>
                  </div>
                  <Package className="h-10 w-10 opacity-40" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">{t('إجمالي المستحق')}</p>
                    <p className="text-2xl font-bold mt-1">{formatPrice(dashboardStats.total_monthly_due)}</p>
                    <p className="text-xs mt-1 opacity-80">{t('هذا الشهر')}</p>
                  </div>
                  <DollarSign className="h-10 w-10 opacity-40" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="branches">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="branches">{t('الفروع المباعة')}</TabsTrigger>
            <TabsTrigger value="report">{t('التقرير الشهري')}</TabsTrigger>
          </TabsList>

          {/* Sold Branches List */}
          <TabsContent value="branches" className="space-y-4">
            {soldBranches.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Store className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">{t('لا توجد فروع مباعة')}</h3>
                  <p className="text-muted-foreground mb-4">{t('لإضافة فرع مباع، قم بتعديل الفرع من الإعدادات وتفعيل خيار "فرع مباع"')}</p>
                  <Button onClick={() => navigate('/settings?tab=branches')} className="gap-2">
                    <Edit className="h-4 w-4" />
                    {t('الذهاب للإعدادات')}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {soldBranches.map((branch) => (
                  <Card key={branch.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{branch.branch_name}</CardTitle>
                            <CardDescription className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {branch.buyer_name}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500">
                          {branch.owner_percentage}%
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-muted-foreground text-xs">{t('المبيعات')}</p>
                          <p className="font-semibold">{formatPrice(branch.total_sales || 0)}</p>
                        </div>
                        <div className="p-2 bg-emerald-500/10 rounded">
                          <p className="text-muted-foreground text-xs">{t('عوائدك')}</p>
                          <p className="font-semibold text-emerald-600">{formatPrice(branch.total_revenue || 0)}</p>
                        </div>
                        <div className="p-2 bg-amber-500/10 rounded">
                          <p className="text-muted-foreground text-xs">{t('المواد المسحوبة')}</p>
                          <p className="font-semibold text-amber-600">{formatPrice(branch.total_materials_withdrawn || 0)}</p>
                        </div>
                        <div className="p-2 bg-purple-500/10 rounded">
                          <p className="text-muted-foreground text-xs">{t('المستحق')}</p>
                          <p className="font-semibold text-purple-600">{formatPrice(branch.pending_amount || 0)}</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 gap-1"
                          onClick={() => handleViewDetails(branch)}
                        >
                          <Eye className="h-3 w-3" />
                          {t('التفاصيل')}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={() => handleCancelBranch(branch.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Monthly Report */}
          <TabsContent value="report" className="space-y-4">
            {monthlyReport && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                    {t('تقرير العوائد الشهرية')} - {monthlyReport.month}
                  </CardTitle>
                  <CardDescription>
                    {t('من')} {monthlyReport.period_start} {t('إلى')} {monthlyReport.period_end}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {monthlyReport.branches.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p>{t('لا توجد بيانات لهذا الشهر')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-right py-3 px-2">{t('الفرع')}</th>
                              <th className="text-right py-3 px-2">{t('المشتري')}</th>
                              <th className="text-right py-3 px-2">{t('المبيعات')}</th>
                              <th className="text-right py-3 px-2">{t('النسبة')}</th>
                              <th className="text-right py-3 px-2">{t('العائد')}</th>
                              <th className="text-right py-3 px-2">{t('المواد')}</th>
                              <th className="text-right py-3 px-2">{t('المستحق')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthlyReport.branches.map((branch, idx) => (
                              <tr key={idx} className="border-b hover:bg-muted/50">
                                <td className="py-3 px-2 font-medium">{branch.branch_name}</td>
                                <td className="py-3 px-2 text-muted-foreground">{branch.buyer_name}</td>
                                <td className="py-3 px-2">{formatPrice(branch.total_sales)}</td>
                                <td className="py-3 px-2">
                                  <Badge variant="outline">{branch.owner_percentage}%</Badge>
                                </td>
                                <td className="py-3 px-2 text-emerald-600 font-medium">
                                  {formatPrice(branch.revenue_from_percentage)}
                                </td>
                                <td className="py-3 px-2 text-amber-600">
                                  {formatPrice(branch.materials_withdrawn)}
                                </td>
                                <td className="py-3 px-2 text-purple-600 font-bold">
                                  {formatPrice(branch.total_due)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-muted/30 font-bold">
                              <td colSpan="4" className="py-3 px-2">{t('الإجمالي')}</td>
                              <td className="py-3 px-2 text-emerald-600">{formatPrice(monthlyReport.total_revenue)}</td>
                              <td className="py-3 px-2 text-amber-600">{formatPrice(monthlyReport.total_materials)}</td>
                              <td className="py-3 px-2 text-purple-600">{formatPrice(monthlyReport.total_due)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Branch Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              {selectedBranch?.branch_name}
            </DialogTitle>
          </DialogHeader>
          
          {branchSummary && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{t('المبيعات')}</p>
                  <p className="text-lg font-bold">{formatPrice(branchSummary.total_sales)}</p>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{t('عائد النسبة')}</p>
                  <p className="text-lg font-bold text-emerald-600">{formatPrice(branchSummary.revenue_from_percentage)}</p>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{t('المواد')}</p>
                  <p className="text-lg font-bold text-amber-600">{formatPrice(branchSummary.materials_withdrawn)}</p>
                </div>
                <div className="p-3 bg-purple-500/10 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{t('المتبقي')}</p>
                  <p className="text-lg font-bold text-purple-600">{formatPrice(branchSummary.remaining_amount)}</p>
                </div>
              </div>
              
              {/* Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <p><span className="text-muted-foreground">{t('المشتري')}:</span> {selectedBranch?.buyer_name}</p>
                  <p><span className="text-muted-foreground">{t('النسبة')}:</span> {selectedBranch?.owner_percentage}%</p>
                  <p><span className="text-muted-foreground">{t('الرسوم الشهرية')}:</span> {formatPrice(selectedBranch?.monthly_fee || 0)}</p>
                </div>
                <div className="space-y-2">
                  <p><span className="text-muted-foreground">{t('عدد الطلبات')}:</span> {branchSummary.orders_count}</p>
                  <p><span className="text-muted-foreground">{t('إجمالي المستحق')}:</span> {formatPrice(branchSummary.total_due)}</p>
                  <p><span className="text-muted-foreground">{t('المدفوع')}:</span> {formatPrice(branchSummary.paid_amount)}</p>
                </div>
              </div>
              
              {/* Payments History */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">{t('سجل المدفوعات')}</h4>
                  <Button 
                    size="sm" 
                    className="gap-1"
                    onClick={() => setPaymentDialogOpen(true)}
                  >
                    <Plus className="h-3 w-3" />
                    {t('تسجيل دفعة')}
                  </Button>
                </div>
                
                {branchPayments.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">{t('لا توجد مدفوعات مسجلة')}</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {branchPayments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <div>
                            <p className="font-medium">{formatPrice(payment.amount)}</p>
                            <p className="text-xs text-muted-foreground">{payment.payment_date}</p>
                          </div>
                        </div>
                        {payment.notes && (
                          <span className="text-xs text-muted-foreground">{payment.notes}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('تسجيل دفعة جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('المبلغ')}</Label>
              <Input
                type="number"
                value={newPayment.amount}
                onChange={(e) => setNewPayment({...newPayment, amount: e.target.value})}
                placeholder="0"
              />
            </div>
            <div>
              <Label>{t('التاريخ')}</Label>
              <Input
                type="date"
                value={newPayment.payment_date}
                onChange={(e) => setNewPayment({...newPayment, payment_date: e.target.value})}
              />
            </div>
            <div>
              <Label>{t('ملاحظات')}</Label>
              <Input
                value={newPayment.notes}
                onChange={(e) => setNewPayment({...newPayment, notes: e.target.value})}
                placeholder={t('ملاحظات اختيارية')}
              />
            </div>
            <Button onClick={handleRecordPayment} className="w-full">
              {t('تسجيل الدفعة')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
