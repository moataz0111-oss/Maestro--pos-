import React, { useState, useEffect } from 'react';
import { API_URL } from '../utils/api';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  ArrowLeft,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Vault,
  LockOpen,
  Lock,
  Calendar,
  RefreshCw,
  Plus,
  Trash2,
  FileText,
  TrendingUp,
  TrendingDown,
  Building2,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Banknote,
  CreditCard,
  Landmark,
  Target,
  CircleDollarSign
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

export default function OwnerWallet() {
  const { user, hasRole } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    total_deposits: 0,
    total_withdrawals: 0,
    available_balance: 0,
    safe_balance: 0,
    recent_transactions: []
  });
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [profitTransfers, setProfitTransfers] = useState([]);
  const [monthlyClosings, setMonthlyClosings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  
  // نماذج
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [profitDialogOpen, setProfitDialogOpen] = useState(false);
  const [closingDialogOpen, setClosingDialogOpen] = useState(false);
  
  // بيانات النماذج
  const [newDeposit, setNewDeposit] = useState({ amount: '', date: new Date().toISOString().split('T')[0], description: '', source: 'cash_sales' });
  const [newWithdrawal, setNewWithdrawal] = useState({ amount: '', date: new Date().toISOString().split('T')[0], beneficiary: '', description: '', category: 'transfer' });
  const [newProfitTransfer, setNewProfitTransfer] = useState({ amount: '', month: selectedMonth, description: '' });
  const [newClosing, setNewClosing] = useState({ month: selectedMonth, total_sales: '', total_expenses: '', net_profit: '', notes: '' });

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, depositsRes, withdrawalsRes, transfersRes, closingsRes] = await Promise.all([
        axios.get(`${API}/owner-wallet/summary`),
        axios.get(`${API}/owner-wallet/deposits?month=${selectedMonth}`),
        axios.get(`${API}/owner-wallet/withdrawals?month=${selectedMonth}`),
        axios.get(`${API}/owner-wallet/profit-transfers`),
        axios.get(`${API}/owner-wallet/monthly-closings`)
      ]);
      
      setSummary(summaryRes.data);
      setDeposits(depositsRes.data);
      setWithdrawals(withdrawalsRes.data);
      setProfitTransfers(transfersRes.data);
      setMonthlyClosings(closingsRes.data);
    } catch (error) {
      console.error('Failed to fetch wallet data:', error);
      toast.error(t('فشل في جلب البيانات'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeposit = async () => {
    if (!newDeposit.amount || !newDeposit.date) {
      toast.error(t('يرجى إدخال المبلغ والتاريخ'));
      return;
    }
    try {
      await axios.post(`${API}/owner-wallet/deposits`, {
        ...newDeposit,
        amount: parseFloat(newDeposit.amount)
      });
      toast.success(t('تم إضافة الإيداع بنجاح'));
      setDepositDialogOpen(false);
      setNewDeposit({ amount: '', date: new Date().toISOString().split('T')[0], description: '', source: 'cash_sales' });
      fetchData();
    } catch (error) {
      toast.error(t('فشل في إضافة الإيداع'));
    }
  };

  const handleCreateWithdrawal = async () => {
    if (!newWithdrawal.amount || !newWithdrawal.date || !newWithdrawal.beneficiary) {
      toast.error(t('يرجى إدخال جميع البيانات المطلوبة'));
      return;
    }
    try {
      await axios.post(`${API}/owner-wallet/withdrawals`, {
        ...newWithdrawal,
        amount: parseFloat(newWithdrawal.amount)
      });
      toast.success(t('تم إضافة السحب بنجاح'));
      setWithdrawalDialogOpen(false);
      setNewWithdrawal({ amount: '', date: new Date().toISOString().split('T')[0], beneficiary: '', description: '', category: 'transfer' });
      fetchData();
    } catch (error) {
      toast.error(t('فشل في إضافة السحب'));
    }
  };

  const handleCreateProfitTransfer = async () => {
    if (!newProfitTransfer.amount || !newProfitTransfer.month) {
      toast.error(t('يرجى إدخال المبلغ والشهر'));
      return;
    }
    try {
      await axios.post(`${API}/owner-wallet/profit-transfers`, {
        ...newProfitTransfer,
        amount: parseFloat(newProfitTransfer.amount)
      });
      toast.success(t('تم تحويل الأرباح للخزينة بنجاح'));
      setProfitDialogOpen(false);
      setNewProfitTransfer({ amount: '', month: selectedMonth, description: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحويل الأرباح'));
    }
  };

  const handleDeleteDeposit = async (id) => {
    if (!window.confirm(t('هل تريد حذف هذا الإيداع؟'))) return;
    try {
      await axios.delete(`${API}/owner-wallet/deposits/${id}`);
      toast.success(t('تم الحذف'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في الحذف'));
    }
  };

  const handleDeleteWithdrawal = async (id) => {
    if (!window.confirm(t('هل تريد حذف هذا السحب؟'))) return;
    try {
      await axios.delete(`${API}/owner-wallet/withdrawals/${id}`);
      toast.success(t('تم الحذف'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في الحذف'));
    }
  };

  const sourceLabels = {
    cash_sales: t('مبيعات نقدية'),
    card_sales: t('مبيعات بطاقة'),
    other: t('أخرى')
  };

  const categoryLabels = {
    transfer: t('تحويل بنكي'),
    payment: t('سداد دين'),
    personal: t('سحب شخصي'),
    supplier: t('دفع مورد'),
    salary: t('رواتب'),
    other: t('أخرى')
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="owner-wallet-page">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">{t('خزينة المالك')}</h1>
                  <p className="text-sm text-muted-foreground">{t('إدارة الحساب الشخصي')}</p>
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
        {/* الملخص الرئيسي */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">{t('إجمالي الإيداعات')}</p>
                  <p className="text-2xl font-bold mt-1">{formatPrice(summary.total_deposits)}</p>
                  <p className="text-xs mt-1 opacity-80">{summary.deposits_count} {t('عملية')}</p>
                </div>
                <ArrowDownCircle className="h-10 w-10 opacity-40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-rose-500 to-rose-600 text-white border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">{t('إجمالي السحوبات')}</p>
                  <p className="text-2xl font-bold mt-1">{formatPrice(summary.total_withdrawals)}</p>
                  <p className="text-xs mt-1 opacity-80">{summary.withdrawals_count} {t('عملية')}</p>
                </div>
                <ArrowUpCircle className="h-10 w-10 opacity-40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">{t('الرصيد المتاح')}</p>
                  <p className="text-2xl font-bold mt-1">{formatPrice(summary.available_balance)}</p>
                  <p className="text-xs mt-1 opacity-80">{t('للسحب أو التحويل')}</p>
                </div>
                <Landmark className="h-10 w-10 opacity-40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">{t('الخزينة الشخصية')}</p>
                  <p className="text-2xl font-bold mt-1">{formatPrice(summary.safe_balance)}</p>
                  <p className="text-xs mt-1 opacity-80">{t('صافي الأرباح المحولة')}</p>
                </div>
                {summary.safe_balance > 0 ? 
                  <Lock className="h-10 w-10 opacity-40" /> : 
                  <LockOpen className="h-10 w-10 opacity-40" />
                }
              </div>
            </CardContent>
          </Card>
        </div>

        {/* أزرار الإجراءات السريعة */}
        <div className="flex flex-wrap gap-3">
          <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                <ArrowDownCircle className="h-4 w-4" />
                {t('إيداع جديد')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('إيداع جديد')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>{t('المبلغ')}</Label>
                  <Input
                    type="number"
                    value={newDeposit.amount}
                    onChange={(e) => setNewDeposit({...newDeposit, amount: e.target.value})}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>{t('التاريخ')}</Label>
                  <Input
                    type="date"
                    value={newDeposit.date}
                    onChange={(e) => setNewDeposit({...newDeposit, date: e.target.value})}
                  />
                </div>
                <div>
                  <Label>{t('المصدر')}</Label>
                  <Select value={newDeposit.source} onValueChange={(v) => setNewDeposit({...newDeposit, source: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash_sales">{t('مبيعات نقدية')}</SelectItem>
                      <SelectItem value="card_sales">{t('مبيعات بطاقة')}</SelectItem>
                      <SelectItem value="other">{t('أخرى')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('الوصف')}</Label>
                  <Input
                    value={newDeposit.description}
                    onChange={(e) => setNewDeposit({...newDeposit, description: e.target.value})}
                    placeholder={t('وصف اختياري')}
                  />
                </div>
                <Button onClick={handleCreateDeposit} className="w-full bg-emerald-600">
                  {t('حفظ الإيداع')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <ArrowUpCircle className="h-4 w-4" />
                {t('سحب / تحويل')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('سحب أو تحويل')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>{t('المبلغ')}</Label>
                  <Input
                    type="number"
                    value={newWithdrawal.amount}
                    onChange={(e) => setNewWithdrawal({...newWithdrawal, amount: e.target.value})}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>{t('اسم المستفيد')}</Label>
                  <Input
                    value={newWithdrawal.beneficiary}
                    onChange={(e) => setNewWithdrawal({...newWithdrawal, beneficiary: e.target.value})}
                    placeholder={t('اسم الشخص أو الجهة')}
                  />
                </div>
                <div>
                  <Label>{t('التاريخ')}</Label>
                  <Input
                    type="date"
                    value={newWithdrawal.date}
                    onChange={(e) => setNewWithdrawal({...newWithdrawal, date: e.target.value})}
                  />
                </div>
                <div>
                  <Label>{t('نوع العملية')}</Label>
                  <Select value={newWithdrawal.category} onValueChange={(v) => setNewWithdrawal({...newWithdrawal, category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transfer">{t('تحويل بنكي')}</SelectItem>
                      <SelectItem value="payment">{t('سداد دين')}</SelectItem>
                      <SelectItem value="supplier">{t('دفع مورد')}</SelectItem>
                      <SelectItem value="salary">{t('رواتب')}</SelectItem>
                      <SelectItem value="personal">{t('سحب شخصي')}</SelectItem>
                      <SelectItem value="other">{t('أخرى')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('الوصف')}</Label>
                  <Input
                    value={newWithdrawal.description}
                    onChange={(e) => setNewWithdrawal({...newWithdrawal, description: e.target.value})}
                    placeholder={t('وصف اختياري')}
                  />
                </div>
                <Button onClick={handleCreateWithdrawal} className="w-full" variant="destructive">
                  {t('تأكيد السحب')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={profitDialogOpen} onOpenChange={setProfitDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-600 hover:bg-amber-700 gap-2">
                <LockOpen className="h-4 w-4" />
                {t('تحويل للخزينة')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('تحويل أرباح للخزينة الشخصية')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg text-amber-800 dark:text-amber-200 text-sm">
                  {t('هذا المبلغ سيُضاف لخزينتك الشخصية كأرباح صافية بعد سداد جميع الالتزامات')}
                </div>
                <div>
                  <Label>{t('المبلغ')}</Label>
                  <Input
                    type="number"
                    value={newProfitTransfer.amount}
                    onChange={(e) => setNewProfitTransfer({...newProfitTransfer, amount: e.target.value})}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>{t('الشهر')}</Label>
                  <Input
                    type="month"
                    value={newProfitTransfer.month}
                    onChange={(e) => setNewProfitTransfer({...newProfitTransfer, month: e.target.value})}
                  />
                </div>
                <div>
                  <Label>{t('ملاحظات')}</Label>
                  <Input
                    value={newProfitTransfer.description}
                    onChange={(e) => setNewProfitTransfer({...newProfitTransfer, description: e.target.value})}
                    placeholder={t('ملاحظات اختيارية')}
                  />
                </div>
                <Button onClick={handleCreateProfitTransfer} className="w-full bg-amber-600">
                  {t('تحويل للخزينة')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* التبويبات */}
        <Tabs defaultValue="transactions">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="transactions">{t('المعاملات')}</TabsTrigger>
            <TabsTrigger value="safe">{t('الخزينة')}</TabsTrigger>
            <TabsTrigger value="history">{t('السجل')}</TabsTrigger>
          </TabsList>

          {/* المعاملات */}
          <TabsContent value="transactions" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* الإيداعات */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowDownCircle className="h-5 w-5 text-emerald-500" />
                    {t('الإيداعات')} ({formatMonth(selectedMonth)})
                  </CardTitle>
                  <Badge variant="secondary">{formatPrice(deposits.reduce((s, d) => s + d.amount, 0))}</Badge>
                </CardHeader>
                <CardContent>
                  {deposits.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Banknote className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('لا توجد إيداعات')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {deposits.map((deposit) => (
                        <div key={deposit.id} className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
                              <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div>
                              <p className="font-medium text-emerald-700 dark:text-emerald-400">{formatPrice(deposit.amount)}</p>
                              <p className="text-xs text-muted-foreground">{sourceLabels[deposit.source]} • {formatDate(deposit.date)}</p>
                              {deposit.description && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">📝 {deposit.description}</p>}
                              {deposit.branch_name && <p className="text-xs text-purple-600 dark:text-purple-400">🏪 {deposit.branch_name}</p>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteDeposit(deposit.id)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* السحوبات */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowUpCircle className="h-5 w-5 text-rose-500" />
                    {t('السحوبات')} ({formatMonth(selectedMonth)})
                  </CardTitle>
                  <Badge variant="destructive">{formatPrice(withdrawals.reduce((s, w) => s + w.amount, 0))}</Badge>
                </CardHeader>
                <CardContent>
                  {withdrawals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('لا توجد سحوبات')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {withdrawals.map((withdrawal) => (
                        <div key={withdrawal.id} className="flex items-center justify-between p-3 bg-rose-50 dark:bg-rose-950/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-rose-500/20 rounded-full flex items-center justify-center">
                              <ArrowUpCircle className="h-4 w-4 text-rose-600" />
                            </div>
                            <div>
                              <p className="font-medium text-rose-700 dark:text-rose-400">{formatPrice(withdrawal.amount)}</p>
                              <p className="text-xs text-muted-foreground">{withdrawal.beneficiary} • {categoryLabels[withdrawal.category]}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(withdrawal.date)}</p>
                              {withdrawal.description && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">📝 {withdrawal.description}</p>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteWithdrawal(withdrawal.id)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* الخزينة */}
          <TabsContent value="safe" className="space-y-6">
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <Vault className="h-6 w-6" />
                  {t('الخزينة الشخصية')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6">
                  <p className="text-4xl font-bold text-amber-700 dark:text-amber-300">{formatPrice(summary.safe_balance)}</p>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">{t('صافي الأرباح المحولة')}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('سجل تحويلات الأرباح')}</CardTitle>
              </CardHeader>
              <CardContent>
                {profitTransfers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('لا توجد تحويلات أرباح')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {profitTransfers.map((transfer) => (
                      <div key={transfer.id} className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <p className="font-bold text-amber-700 dark:text-amber-400">{formatPrice(transfer.amount)}</p>
                            <p className="text-sm text-muted-foreground">{t('شهر')} {transfer.month}</p>
                            {transfer.description && <p className="text-xs text-muted-foreground">{transfer.description}</p>}
                          </div>
                        </div>
                        <Badge className="bg-amber-500">{t('محول')}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* السجل */}
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('آخر المعاملات')}</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.recent_transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('لا توجد معاملات')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {summary.recent_transactions.map((transaction, idx) => (
                      <div key={idx} className={`flex items-center justify-between p-3 rounded-lg ${
                        transaction.type === 'deposit' ? 'bg-emerald-50 dark:bg-emerald-950/30' :
                        transaction.type === 'withdrawal' ? 'bg-rose-50 dark:bg-rose-950/30' :
                        'bg-amber-50 dark:bg-amber-950/30'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            transaction.type === 'deposit' ? 'bg-emerald-500/20' :
                            transaction.type === 'withdrawal' ? 'bg-rose-500/20' :
                            'bg-amber-500/20'
                          }`}>
                            {transaction.type === 'deposit' ? <ArrowDownCircle className="h-4 w-4 text-emerald-600" /> :
                             transaction.type === 'withdrawal' ? <ArrowUpCircle className="h-4 w-4 text-rose-600" /> :
                             <Lock className="h-4 w-4 text-amber-600" />}
                          </div>
                          <div>
                            <p className="font-medium">{formatPrice(transaction.amount)}</p>
                            <p className="text-xs text-muted-foreground">{transaction.display_type}</p>
                            {transaction.description && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">📝 {transaction.description}</p>}
                            {transaction.branch_name && <p className="text-xs text-purple-600 dark:text-purple-400">🏪 {t('الفرع')}: {transaction.branch_name}</p>}
                            {transaction.source && <p className="text-xs text-green-600 dark:text-green-400">💰 {t('المصدر')}: {sourceLabels[transaction.source] || transaction.source}</p>}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(transaction.created_at).toLocaleDateString('en-GB').replace(/\//g, '/')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
