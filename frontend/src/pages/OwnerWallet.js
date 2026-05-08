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
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend } from 'recharts';
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

// دالة لتنسيق التاريخ DD/MM/YYYY
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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
    total_profit_transferred: 0,
    total_profit_withdrawn: 0,
    deposits_count: 0,
    transfers_count: 0,
    remaining_transfers: 0,
    can_transfer: false,
    recent_transactions: []
  });
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [profitTransfers, setProfitTransfers] = useState([]);
  const [profitWithdrawals, setProfitWithdrawals] = useState([]);
  const [monthlyClosings, setMonthlyClosings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  
  // الحد الأدنى للخزينة
  const SAFE_MIN_BALANCE = 50000; // 50,000 IQD
  
  // نماذج
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [profitDialogOpen, setProfitDialogOpen] = useState(false);
  const [closingDialogOpen, setClosingDialogOpen] = useState(false);
  
  // بيانات النماذج
  const [newDeposit, setNewDeposit] = useState({ amount: '', date: new Date().toISOString().split('T')[0], description: '', source: 'cash_sales', branch_id: '', external_source: '' });
  const [newWithdrawal, setNewWithdrawal] = useState({ amount: '', date: new Date().toISOString().split('T')[0], beneficiary: '', description: '', category: 'transfer', branch_id: '', external_source: '' });
  const [newProfitTransfer, setNewProfitTransfer] = useState({ amount: '', month: selectedDate, description: '', branch_id: '', external_source: '' });
  const [newClosing, setNewClosing] = useState({ month: selectedDate, total_sales: '', total_expenses: '', net_profit: '', notes: '' });
  // الفروع المتاحة + الخيار "أخرى"
  const [branches, setBranches] = useState([]);
  // 📊 تفاصيل فرع/مصدر (Dialog مع رسم بياني)
  const [detailDialog, setDetailDialog] = useState(null); // {branch_id, branch_name, external_source}
  const [detailMode, setDetailMode] = useState('month'); // day | month | custom
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const [detailRange, setDetailRange] = useState({ start: monthStart, end: today });
  const [detailData, setDetailData] = useState({ deposits: [], withdrawals: [], loading: false });
  
  // سحب الأرباح من الخزينة
  const [profitWithdrawAmount, setProfitWithdrawAmount] = useState('');
  const [profitWithdrawReason, setProfitWithdrawReason] = useState('');
  const [isWithdrawingProfit, setIsWithdrawingProfit] = useState(false);

  // 📊 جلب تفاصيل فرع/مصدر مع نطاق تاريخ
  const fetchBranchDetails = async () => {
    if (!detailDialog) return;
    setDetailData(prev => ({ ...prev, loading: true }));
    try {
      const params = new URLSearchParams();
      params.append('start_date', detailRange.start);
      params.append('end_date', detailRange.end);
      if (detailDialog.branch_id) params.append('branch_id', detailDialog.branch_id);
      if (detailDialog.external_source) params.append('external_source', detailDialog.external_source);
      const [depRes, wdRes] = await Promise.all([
        axios.get(`${API}/owner-wallet/deposits?${params.toString()}`),
        axios.get(`${API}/owner-wallet/withdrawals?${params.toString()}`),
      ]);
      setDetailData({ deposits: depRes.data || [], withdrawals: wdRes.data || [], loading: false });
    } catch (err) {
      setDetailData({ deposits: [], withdrawals: [], loading: false });
      toast.error(t('فشل تحميل التفاصيل'));
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // إعادة الجلب عند تغيّر النطاق أو فتح/تغيير الفرع
  useEffect(() => {
    if (detailDialog) fetchBranchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailDialog, detailRange.start, detailRange.end]);

  // ضبط تلقائي للنطاق عند تبديل الوضع
  const applyDetailMode = (mode) => {
    setDetailMode(mode);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (mode === 'day') {
      setDetailRange({ start: todayStr, end: todayStr });
    } else if (mode === 'month') {
      setDetailRange({ start: todayStr.slice(0, 7) + '-01', end: todayStr });
    }
    // custom: يبقي القيم الحالية
  };

  // تحويل البيانات إلى نقاط للرسم البياني (مجمَّعة حسب التاريخ)
  const buildChartSeries = () => {
    const map = {};
    (detailData.deposits || []).forEach(d => {
      const k = d.date;
      if (!map[k]) map[k] = { date: k, deposits: 0, withdrawals: 0 };
      map[k].deposits += (d.amount || 0);
    });
    (detailData.withdrawals || []).forEach(w => {
      const k = w.date;
      if (!map[k]) map[k] = { date: k, deposits: 0, withdrawals: 0 };
      map[k].withdrawals += (w.amount || 0);
    });
    const arr = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    arr.forEach(p => {
      running += (p.deposits - p.withdrawals);
      p.balance = running;
    });
    return arr;
  };


  // جلب الفروع مرة واحدة
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/branches`);
        setBranches(Array.isArray(data) ? data : (data?.branches || []));
      } catch (e) {
        // تجاهل — قد لا يكون للمستخدم صلاحية
      }
    })();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, depositsRes, withdrawalsRes, transfersRes, profitWithdrawalsRes, closingsRes] = await Promise.all([
        axios.get(`${API}/owner-wallet/summary`),
        axios.get(`${API}/owner-wallet/deposits?month=${selectedDate.slice(0, 7)}`),
        axios.get(`${API}/owner-wallet/withdrawals?month=${selectedDate.slice(0, 7)}`),
        axios.get(`${API}/owner-wallet/profit-transfers`),
        axios.get(`${API}/owner-wallet/profit-withdrawals`),
        axios.get(`${API}/owner-wallet/monthly-closings`)
      ]);
      
      setSummary(summaryRes.data);
      setDeposits(depositsRes.data);
      setWithdrawals(withdrawalsRes.data);
      setProfitTransfers(transfersRes.data);
      setProfitWithdrawals(profitWithdrawalsRes.data);
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
    if (!newDeposit.branch_id) {
      toast.error(t('يرجى اختيار الفرع'));
      return;
    }
    if (newDeposit.branch_id === 'other' && !newDeposit.external_source?.trim()) {
      toast.error(t('يرجى إدخال مصدر الأموال'));
      return;
    }
    try {
      const payload = {
        amount: parseFloat(newDeposit.amount),
        date: newDeposit.date,
        description: newDeposit.description,
        source: newDeposit.source,
      };
      if (newDeposit.branch_id === 'other') {
        payload.external_source = newDeposit.external_source.trim();
      } else {
        payload.branch_id = newDeposit.branch_id;
      }
      await axios.post(`${API}/owner-wallet/deposits`, payload);
      toast.success(t('تم إضافة الإيداع بنجاح'));
      setDepositDialogOpen(false);
      setNewDeposit({ amount: '', date: new Date().toISOString().split('T')[0], description: '', source: 'cash_sales', branch_id: '', external_source: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة الإيداع'));
    }
  };

  const handleCreateWithdrawal = async () => {
    if (!newWithdrawal.amount || !newWithdrawal.date || !newWithdrawal.beneficiary) {
      toast.error(t('يرجى إدخال جميع البيانات المطلوبة'));
      return;
    }
    if (!newWithdrawal.branch_id) {
      toast.error(t('يرجى اختيار الفرع'));
      return;
    }
    if (newWithdrawal.branch_id === 'other' && !newWithdrawal.external_source?.trim()) {
      toast.error(t('يرجى إدخال مصدر الأموال'));
      return;
    }
    try {
      const payload = {
        amount: parseFloat(newWithdrawal.amount),
        date: newWithdrawal.date,
        beneficiary: newWithdrawal.beneficiary,
        description: newWithdrawal.description,
        category: newWithdrawal.category,
      };
      if (newWithdrawal.branch_id === 'other') {
        payload.external_source = newWithdrawal.external_source.trim();
      } else {
        payload.branch_id = newWithdrawal.branch_id;
      }
      await axios.post(`${API}/owner-wallet/withdrawals`, payload);
      toast.success(t('تم إضافة السحب بنجاح'));
      setWithdrawalDialogOpen(false);
      setNewWithdrawal({ amount: '', date: new Date().toISOString().split('T')[0], beneficiary: '', description: '', category: 'transfer', branch_id: '', external_source: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة السحب'));
    }
  };

  const handleCreateProfitTransfer = async () => {
    if (!newProfitTransfer.amount || !newProfitTransfer.month) {
      toast.error(t('يرجى إدخال المبلغ والتاريخ'));
      return;
    }
    if (!newProfitTransfer.branch_id) {
      toast.error(t('يرجى اختيار الفرع'));
      return;
    }
    if (newProfitTransfer.branch_id === 'other' && !newProfitTransfer.external_source?.trim()) {
      toast.error(t('يرجى إدخال مصدر الأموال'));
      return;
    }
    try {
      const payload = {
        amount: parseFloat(newProfitTransfer.amount),
        month: newProfitTransfer.month,
        description: newProfitTransfer.description,
      };
      if (newProfitTransfer.branch_id === 'other') {
        payload.external_source = newProfitTransfer.external_source.trim();
      } else {
        payload.branch_id = newProfitTransfer.branch_id;
      }
      await axios.post(`${API}/owner-wallet/profit-transfers`, payload);
      toast.success(t('تم تحويل الأرباح للخزينة بنجاح'));
      setProfitDialogOpen(false);
      setNewProfitTransfer({ amount: '', month: selectedDate, description: '', branch_id: '', external_source: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحويل الأرباح'));
    }
  };

  // سحب الأرباح من الخزينة الشخصية
  const handleWithdrawProfit = async () => {
    if (!profitWithdrawAmount || parseFloat(profitWithdrawAmount) <= 0) {
      toast.error(t('يرجى إدخال مبلغ صحيح'));
      return;
    }
    if (parseFloat(profitWithdrawAmount) > summary.safe_balance) {
      toast.error(t('المبلغ أكبر من الرصيد المتاح في الخزينة'));
      return;
    }
    
    setIsWithdrawingProfit(true);
    try {
      await axios.post(`${API}/owner-wallet/profit-withdrawals`, {
        amount: parseFloat(profitWithdrawAmount),
        reason: profitWithdrawReason || ''
      });
      toast.success(t('تم سحب الأرباح بنجاح'));
      setProfitWithdrawAmount('');
      setProfitWithdrawReason('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في سحب الأرباح'));
    } finally {
      setIsWithdrawingProfit(false);
    }
  };

  const handleDeleteDeposit = async (id) => {
    if (!window.confirm(t('هل تريد حذف هذا الإيداع؟'))) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(`${API}/owner-wallet/deposits/${id}`, { headers });
      toast.success(t('تم الحذف'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في الحذف'));
    }
  };

  const handleDeleteWithdrawal = async (id) => {
    if (!window.confirm(t('هل تريد حذف هذا السحب؟'))) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(`${API}/owner-wallet/withdrawals/${id}`, { headers });
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
    salary_payment: t('دفعة راتب موظف'),
    other: t('أخرى')
  };

  // ترجمة أنواع المعاملات
  const transactionTypeLabels = {
    deposit: t('إيداع'),
    withdrawal: t('سحب'),
    profit_transfer: t('تحويل ربح'),
    profit_withdrawal: t('سحب أرباح')
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
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-44"
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

        {/* 🏪 بطاقات الفروع - رصيد كل فرع منفصلاً */}
        {(() => {
          // حساب رصيد كل فرع
          const branchBalances = {};
          (deposits || []).forEach(d => {
            const key = d.branch_id || (d.external_source ? `ext:${d.external_source}` : '__none__');
            if (!branchBalances[key]) {
              branchBalances[key] = {
                key,
                branch_id: d.branch_id,
                branch_name: d.branch_name,
                external_source: d.external_source,
                deposits: 0, withdrawals: 0,
                deposit_count: 0, withdrawal_count: 0,
              };
            }
            branchBalances[key].deposits += (d.amount || 0);
            branchBalances[key].deposit_count++;
          });
          (withdrawals || []).forEach(w => {
            const key = w.branch_id || (w.external_source ? `ext:${w.external_source}` : '__none__');
            if (!branchBalances[key]) {
              branchBalances[key] = {
                key,
                branch_id: w.branch_id,
                branch_name: w.branch_name,
                external_source: w.external_source,
                deposits: 0, withdrawals: 0,
                deposit_count: 0, withdrawal_count: 0,
              };
            }
            branchBalances[key].withdrawals += (w.amount || 0);
            branchBalances[key].withdrawal_count++;
          });
          const branchCards = Object.values(branchBalances).filter(b => b.key !== '__none__');
          if (branchCards.length === 0) return null;
          // ترتيب: الفروع أولاً، ثم المصادر الخارجية
          branchCards.sort((a, b) => {
            if (a.external_source && !b.external_source) return 1;
            if (!a.external_source && b.external_source) return -1;
            return (b.deposits - b.withdrawals) - (a.deposits - a.withdrawals);
          });
          return (
            <div data-testid="branch-balances-section">
              <h3 className="text-base font-semibold mb-3 flex items-center gap-2 text-foreground">
                <span className="text-xl">🏪</span>
                {t('أرصدة الفروع / المصادر')}
                <Badge variant="outline" className="ml-2">{branchCards.length}</Badge>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {branchCards.map(b => {
                  const balance = b.deposits - b.withdrawals;
                  const pct = b.deposits > 0 ? Math.min(100, Math.max(0, (balance / b.deposits) * 100)) : 0;
                  const isExternal = !!b.external_source;
                  const isLow = b.deposits > 0 && balance < b.deposits * 0.2;
                  const isNegative = balance < 0;
                  return (
                    <Card
                      key={b.key}
                      className={`border-2 cursor-pointer hover:shadow-lg transition-all ${isNegative ? 'border-red-500 bg-red-50 dark:bg-red-950/20' : isLow ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : isExternal ? 'border-orange-300 bg-orange-50/40 dark:bg-orange-950/10' : 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/10'}`}
                      data-testid={`branch-card-${b.branch_id || b.external_source}`}
                      onClick={() => {
                        setDetailDialog({
                          branch_id: b.branch_id,
                          branch_name: b.branch_name,
                          external_source: b.external_source,
                        });
                        applyDetailMode('month');
                      }}
                    >
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{isExternal ? '📦' : '🏪'}</span>
                            <div>
                              <p className="font-bold text-sm">{b.branch_name || b.external_source || t('غير محدد')}</p>
                              <p className="text-xs text-muted-foreground">{isExternal ? t('مصدر خارجي') : t('فرع')}</p>
                            </div>
                          </div>
                          {isNegative && <Badge variant="destructive" className="text-xs">{t('سالب!')}</Badge>}
                          {!isNegative && isLow && <Badge className="text-xs bg-amber-500 text-white">{t('منخفض')}</Badge>}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-emerald-600 font-medium">↓ {t('إيداعات')}</p>
                            <p className="font-bold tabular-nums">{formatPrice(b.deposits)}</p>
                            <p className="text-[10px] text-muted-foreground">{b.deposit_count} {t('عملية')}</p>
                          </div>
                          <div>
                            <p className="text-rose-600 font-medium">↑ {t('سحوبات')}</p>
                            <p className="font-bold tabular-nums">{formatPrice(b.withdrawals)}</p>
                            <p className="text-[10px] text-muted-foreground">{b.withdrawal_count} {t('عملية')}</p>
                          </div>
                        </div>
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground">{t('الرصيد المتاح')}</p>
                          <p className={`text-lg font-bold tabular-nums ${isNegative ? 'text-red-600' : 'text-emerald-600'}`}>
                            {formatPrice(balance)}
                          </p>
                          {b.deposits > 0 && (
                            <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${isNegative ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })()}

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
                  <Label>{t('الفرع / المصدر')} <span className="text-red-500">*</span></Label>
                  <Select value={newDeposit.branch_id} onValueChange={(v) => setNewDeposit({...newDeposit, branch_id: v})}>
                    <SelectTrigger data-testid="deposit-branch-select"><SelectValue placeholder={t('اختر الفرع أو "أخرى"')} /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>🏪 {b.name}</SelectItem>
                      ))}
                      <SelectItem value="other">📦 {t('أخرى (مشروع/مصدر خارجي)')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newDeposit.branch_id === 'other' && (
                  <div>
                    <Label>{t('مصدر الأموال')} <span className="text-red-500">*</span></Label>
                    <Input
                      value={newDeposit.external_source}
                      onChange={(e) => setNewDeposit({...newDeposit, external_source: e.target.value})}
                      placeholder={t('مثال: مشروع آخر، حساب بنكي، قرض شخصي...')}
                      data-testid="deposit-external-source"
                    />
                  </div>
                )}
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
                  <Label>{t('الفرع / المصدر')} <span className="text-red-500">*</span></Label>
                  <Select value={newWithdrawal.branch_id} onValueChange={(v) => setNewWithdrawal({...newWithdrawal, branch_id: v})}>
                    <SelectTrigger data-testid="withdrawal-branch-select"><SelectValue placeholder={t('اختر الفرع المخصوم منه')} /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>🏪 {b.name}</SelectItem>
                      ))}
                      <SelectItem value="other">📦 {t('أخرى (مصدر خارجي)')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newWithdrawal.branch_id === 'other' && (
                  <div>
                    <Label>{t('مصدر الأموال')} <span className="text-red-500">*</span></Label>
                    <Input
                      value={newWithdrawal.external_source}
                      onChange={(e) => setNewWithdrawal({...newWithdrawal, external_source: e.target.value})}
                      placeholder={t('مثال: مشروع آخر، حساب بنكي، قرض شخصي...')}
                      data-testid="withdrawal-external-source"
                    />
                  </div>
                )}
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
              <Button 
                className="bg-amber-600 hover:bg-amber-700 gap-2"
                disabled={!summary.can_transfer}
                title={!summary.can_transfer ? t('يجب إضافة عملية إيداع جديدة أولاً') : ''}
              >
                <LockOpen className="h-4 w-4" />
                {t('تحويل للخزينة')}
                {summary.remaining_transfers > 0 && (
                  <Badge variant="secondary" className="mr-1 bg-white text-amber-700">
                    {summary.remaining_transfers}
                  </Badge>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('تحويل أرباح للخزينة الشخصية')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg text-amber-800 dark:text-amber-200 text-sm">
                  {t('هذا المبلغ سيُضاف لخزينتك الشخصية كأرباح صافية بعد سداد جميع الالتزامات')}
                  <div className="mt-2 font-medium">
                    {t('التحويلات المتبقية')}: {summary.remaining_transfers} {t('من')} {summary.deposits_count}
                  </div>
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
                  <Label>{t('التاريخ')}</Label>
                  <Input
                    type="date"
                    value={newProfitTransfer.month}
                    onChange={(e) => setNewProfitTransfer({...newProfitTransfer, month: e.target.value})}
                  />
                </div>
                <div>
                  <Label>{t('الفرع / المصدر')} <span className="text-red-500">*</span></Label>
                  <Select value={newProfitTransfer.branch_id} onValueChange={(v) => setNewProfitTransfer({...newProfitTransfer, branch_id: v})}>
                    <SelectTrigger data-testid="profit-transfer-branch-select"><SelectValue placeholder={t('اختر الفرع')} /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>🏪 {b.name}</SelectItem>
                      ))}
                      <SelectItem value="other">📦 {t('أخرى (مصدر خارجي)')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newProfitTransfer.branch_id === 'other' && (
                  <div>
                    <Label>{t('مصدر الأموال')} <span className="text-red-500">*</span></Label>
                    <Input
                      value={newProfitTransfer.external_source}
                      onChange={(e) => setNewProfitTransfer({...newProfitTransfer, external_source: e.target.value})}
                      placeholder={t('مثال: مشروع آخر، حساب بنكي...')}
                      data-testid="profit-transfer-external-source"
                    />
                  </div>
                )}
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
                    {t('الإيداعات')} ({formatDate(selectedDate)})
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
                      {deposits.map((deposit) => {
                        // حساب الخصومات المرتبطة بنفس الفرع/المصدر الخارجي
                        const linkedWithdrawals = withdrawals.filter(w => {
                          if (deposit.branch_id) return w.branch_id === deposit.branch_id;
                          if (deposit.external_source) return w.external_source === deposit.external_source;
                          return false;
                        });
                        const totalDeducted = linkedWithdrawals.reduce((s, w) => s + (w.amount || 0), 0);
                        const remaining = (deposit.amount || 0) - totalDeducted;
                        return (
                          <div key={deposit.id} className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                  <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-emerald-700 dark:text-emerald-400">{formatPrice(deposit.amount)}</p>
                                  <p className="text-xs text-muted-foreground">{sourceLabels[deposit.source]} • {formatDate(deposit.date)}</p>
                                  {deposit.description && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">📝 {deposit.description}</p>}
                                  {deposit.branch_name && <p className="text-xs text-purple-600 dark:text-purple-400">🏪 {t('الفرع')}: {deposit.branch_name}</p>}
                                  {deposit.external_source && <p className="text-xs text-orange-600 dark:text-orange-400">📦 {t('مصدر خارجي')}: {deposit.external_source}</p>}
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteDeposit(deposit.id)}>
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                            {/* الخصومات من هذا الإيداع */}
                            {linkedWithdrawals.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-rose-600 font-medium">⬆️ {t('مخصوم من هذا الإيداع')}: {linkedWithdrawals.length} {t('عملية')}</span>
                                  <span className="font-bold text-rose-700">−{formatPrice(totalDeducted)}</span>
                                </div>
                                <div className="space-y-1 max-h-24 overflow-y-auto">
                                  {linkedWithdrawals.slice(0, 5).map(w => (
                                    <div key={w.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/20">
                                      <span className="text-muted-foreground">{w.beneficiary} ({categoryLabels[w.category]})</span>
                                      <span className="text-rose-600 font-medium">−{formatPrice(w.amount)}</span>
                                    </div>
                                  ))}
                                  {linkedWithdrawals.length > 5 && (
                                    <p className="text-xs text-muted-foreground text-center">+{linkedWithdrawals.length - 5} {t('أخرى')}</p>
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-emerald-200 dark:border-emerald-800 text-xs">
                                  <span className="font-medium">{t('المتبقي من الإيداع')}:</span>
                                  <span className={`font-bold ${remaining < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatPrice(remaining)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* السحوبات */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowUpCircle className="h-5 w-5 text-rose-500" />
                    {t('السحوبات')} ({formatDate(selectedDate)})
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
                              {withdrawal.branch_name && <p className="text-xs text-purple-600 dark:text-purple-400">🏪 {t('الفرع')}: {withdrawal.branch_name}</p>}
                              {withdrawal.external_source && <p className="text-xs text-orange-600 dark:text-orange-400">📦 {t('مصدر خارجي')}: {withdrawal.external_source}</p>}
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
                
                {/* إشعار الحد الأدنى */}
                {summary.safe_balance <= SAFE_MIN_BALANCE && summary.safe_balance > 0 && (
                  <div className="mb-4 p-3 bg-orange-100 dark:bg-orange-950/50 border border-orange-300 dark:border-orange-700 rounded-lg">
                    <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">{t('تنبيه: الخزينة وصلت للحد الأدنى')}</span>
                    </div>
                    <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                      {t('الرصيد الحالي')}: {formatPrice(summary.safe_balance)} | {t('الحد الأدنى')}: {formatPrice(SAFE_MIN_BALANCE)}
                    </p>
                  </div>
                )}
                
                {/* نموذج سحب الأرباح */}
                {summary.safe_balance > 0 && (
                  <div className="mt-6 p-4 bg-amber-100/50 dark:bg-amber-900/50 rounded-lg border border-amber-300/50">
                    <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2">
                      <ArrowUpCircle className="h-4 w-4" />
                      {t('سحب الأرباح')}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-amber-700 dark:text-amber-300">{t('المبلغ')}</Label>
                        <Input
                          type="number"
                          value={profitWithdrawAmount}
                          onChange={(e) => setProfitWithdrawAmount(e.target.value)}
                          placeholder={t('أدخل المبلغ')}
                          max={summary.safe_balance}
                          className="bg-white dark:bg-amber-950"
                          data-testid="profit-withdraw-amount"
                        />
                      </div>
                      <div>
                        <Label className="text-amber-700 dark:text-amber-300">{t('سبب السحب')}</Label>
                        <Input
                          value={profitWithdrawReason}
                          onChange={(e) => setProfitWithdrawReason(e.target.value)}
                          placeholder={t('اختياري - سبب السحب')}
                          className="bg-white dark:bg-amber-950"
                          data-testid="profit-withdraw-reason"
                        />
                      </div>
                      <Button 
                        onClick={handleWithdrawProfit}
                        disabled={isWithdrawingProfit || !profitWithdrawAmount}
                        className="w-full bg-amber-600 hover:bg-amber-700 gap-2"
                        data-testid="profit-withdraw-btn"
                      >
                        {isWithdrawingProfit ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowUpCircle className="h-4 w-4" />
                        )}
                        {t('سحب الأرباح')}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('سجل تحويلات الأرباح والسحب')}</CardTitle>
              </CardHeader>
              <CardContent>
                {profitTransfers.length === 0 && profitWithdrawals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('لا توجد تحويلات أو سحوبات أرباح')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* عرض كل العمليات مرتبة حسب التاريخ */}
                    {[
                      ...profitTransfers.map(t => ({...t, opType: 'transfer'})),
                      ...profitWithdrawals.map(w => ({...w, opType: 'withdrawal'}))
                    ]
                      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                      .map((item, idx) => (
                        <div key={idx} className={`flex items-center justify-between p-4 rounded-lg ${
                          item.opType === 'transfer' ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-rose-50 dark:bg-rose-950/30'
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              item.opType === 'transfer' ? 'bg-amber-500/20' : 'bg-rose-500/20'
                            }`}>
                              {item.opType === 'transfer' ? (
                                <CheckCircle2 className="h-5 w-5 text-amber-600" />
                              ) : (
                                <ArrowUpCircle className="h-5 w-5 text-rose-600" />
                              )}
                            </div>
                            <div>
                              <p className={`font-bold ${item.opType === 'transfer' ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                {item.opType === 'withdrawal' ? '-' : '+'}{formatPrice(item.amount)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {item.opType === 'transfer' ? formatDate(item.month) : formatDate(item.date)}
                              </p>
                              {item.description && <p className="text-xs text-muted-foreground">📝 {item.description}</p>}
                              {item.reason && <p className="text-xs text-muted-foreground">📝 {item.reason}</p>}
                            </div>
                          </div>
                          <Badge className={item.opType === 'transfer' ? 'bg-amber-500' : 'bg-rose-500'}>
                            {item.opType === 'transfer' ? t('تحويل') : t('سحب')}
                          </Badge>
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
                            <p className="text-xs text-muted-foreground">{transactionTypeLabels[transaction.type] || transaction.type}</p>
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

        {/* 📊 Dialog: تفاصيل الفرع/المصدر مع رسم بياني */}
        <Dialog open={!!detailDialog} onOpenChange={(o) => !o && setDetailDialog(null)}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="branch-detail-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span className="text-2xl">{detailDialog?.external_source ? '📦' : '🏪'}</span>
                {t('تفاصيل')} — <span className="text-emerald-600">{detailDialog?.branch_name || detailDialog?.external_source}</span>
                <Badge variant="outline" className="ml-2 text-xs">{detailDialog?.external_source ? t('مصدر خارجي') : t('فرع')}</Badge>
              </DialogTitle>
            </DialogHeader>
            {detailDialog && (
              <div className="space-y-4">
                {/* Mode tabs + date pickers */}
                <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant={detailMode === 'day' ? 'default' : 'outline'} onClick={() => applyDetailMode('day')} data-testid="mode-day">{t('يومي')}</Button>
                    <Button size="sm" variant={detailMode === 'month' ? 'default' : 'outline'} onClick={() => applyDetailMode('month')} data-testid="mode-month">{t('شهري')}</Button>
                    <Button size="sm" variant={detailMode === 'custom' ? 'default' : 'outline'} onClick={() => applyDetailMode('custom')} data-testid="mode-custom">{t('مخصص')}</Button>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Label className="text-xs text-muted-foreground">{t('من')}</Label>
                    <Input
                      type="date"
                      value={detailRange.start}
                      onChange={(e) => { setDetailMode('custom'); setDetailRange({ ...detailRange, start: e.target.value }); }}
                      className="w-40 h-8 text-xs"
                      data-testid="detail-start-date"
                    />
                    <Label className="text-xs text-muted-foreground">{t('إلى')}</Label>
                    <Input
                      type="date"
                      value={detailRange.end}
                      onChange={(e) => { setDetailMode('custom'); setDetailRange({ ...detailRange, end: e.target.value }); }}
                      className="w-40 h-8 text-xs"
                      data-testid="detail-end-date"
                    />
                  </div>
                </div>

                {detailData.loading ? (
                  <div className="text-center py-12"><RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
                ) : (
                  <>
                    {(() => {
                      const totalDep = (detailData.deposits || []).reduce((s, d) => s + (d.amount || 0), 0);
                      const totalWd = (detailData.withdrawals || []).reduce((s, w) => s + (w.amount || 0), 0);
                      const balance = totalDep - totalWd;
                      const series = buildChartSeries();
                      return (
                        <>
                          {/* KPI strip */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="rounded-lg p-3 bg-emerald-500/10 border border-emerald-500/30">
                              <p className="text-xs text-muted-foreground">↓ {t('إيداعات')}</p>
                              <p className="text-lg font-bold text-emerald-600 tabular-nums">{formatPrice(totalDep)}</p>
                              <p className="text-[10px] text-muted-foreground">{(detailData.deposits || []).length} {t('عملية')}</p>
                            </div>
                            <div className="rounded-lg p-3 bg-rose-500/10 border border-rose-500/30">
                              <p className="text-xs text-muted-foreground">↑ {t('سحوبات')}</p>
                              <p className="text-lg font-bold text-rose-600 tabular-nums">{formatPrice(totalWd)}</p>
                              <p className="text-[10px] text-muted-foreground">{(detailData.withdrawals || []).length} {t('عملية')}</p>
                            </div>
                            <div className={`rounded-lg p-3 border ${balance < 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-cyan-500/10 border-cyan-500/30'}`}>
                              <p className="text-xs text-muted-foreground">{t('الرصيد للفترة')}</p>
                              <p className={`text-lg font-bold tabular-nums ${balance < 0 ? 'text-red-600' : 'text-cyan-600'}`} data-testid="detail-balance">
                                {formatPrice(balance)}
                              </p>
                            </div>
                            <div className="rounded-lg p-3 bg-purple-500/10 border border-purple-500/30">
                              <p className="text-xs text-muted-foreground">{t('عدد الأيام النشطة')}</p>
                              <p className="text-lg font-bold text-purple-600 tabular-nums">{series.length}</p>
                            </div>
                          </div>

                          {/* Chart */}
                          {series.length > 0 ? (
                            <Card>
                              <CardHeader className="pb-2"><CardTitle className="text-sm">{t('تدفق الأموال خلال الفترة')}</CardTitle></CardHeader>
                              <CardContent>
                                <div style={{ width: '100%', height: 280 }}>
                                  <ResponsiveContainer>
                                    <ComposedChart data={series}>
                                      <CartesianGrid stroke="#3331" strokeDasharray="3 3" />
                                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                                      <ChartTooltip formatter={(v) => formatPrice(v)} />
                                      <Legend wrapperStyle={{ fontSize: 12 }} />
                                      <Bar dataKey="deposits" fill="#10b981" name={t('إيداعات')} />
                                      <Bar dataKey="withdrawals" fill="#ef4444" name={t('سحوبات')} />
                                      <Line type="monotone" dataKey="balance" stroke="#06b6d4" strokeWidth={2} name={t('الرصيد التراكمي')} dot={{ r: 3 }} />
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>
                              </CardContent>
                            </Card>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                              <Calendar className="h-10 w-10 mx-auto mb-2 opacity-40" />
                              {t('لا توجد عمليات في هذه الفترة')}
                            </div>
                          )}

                          {/* Transactions list */}
                          {((detailData.deposits || []).length + (detailData.withdrawals || []).length) > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-emerald-600">↓ {t('الإيداعات')} ({(detailData.deposits || []).length})</CardTitle></CardHeader>
                                <CardContent className="max-h-64 overflow-y-auto space-y-1.5">
                                  {(detailData.deposits || []).map(d => (
                                    <div key={d.id} className="text-xs flex items-start justify-between p-2 rounded bg-emerald-50 dark:bg-emerald-950/20">
                                      <div>
                                        <p className="font-medium">{formatPrice(d.amount)}</p>
                                        <p className="text-[10px] text-muted-foreground">{d.date} • {d.description || sourceLabels[d.source] || '-'}</p>
                                      </div>
                                    </div>
                                  ))}
                                  {(detailData.deposits || []).length === 0 && <p className="text-center py-4 text-muted-foreground text-xs">{t('لا توجد إيداعات')}</p>}
                                </CardContent>
                              </Card>
                              <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-rose-600">↑ {t('السحوبات')} ({(detailData.withdrawals || []).length})</CardTitle></CardHeader>
                                <CardContent className="max-h-64 overflow-y-auto space-y-1.5">
                                  {(detailData.withdrawals || []).map(w => (
                                    <div key={w.id} className="text-xs flex items-start justify-between p-2 rounded bg-rose-50 dark:bg-rose-950/20">
                                      <div>
                                        <p className="font-medium">{formatPrice(w.amount)} <span className="text-muted-foreground">— {w.beneficiary}</span></p>
                                        <p className="text-[10px] text-muted-foreground">{w.date} • {categoryLabels[w.category]}</p>
                                      </div>
                                    </div>
                                  ))}
                                  {(detailData.withdrawals || []).length === 0 && <p className="text-center py-4 text-muted-foreground text-xs">{t('لا توجد سحوبات')}</p>}
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}
