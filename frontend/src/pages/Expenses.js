import React, { useState, useEffect } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import db, { STORES } from '../lib/offlineDB';
import { addToSyncQueue, generateUUID, generateOfflineId } from '../lib/offlineStorage';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  ArrowRight,
  Receipt,
  Plus,
  Calendar,
  DollarSign,
  Filter,
  Trash2,
  WifiOff,
  Cloud
} from 'lucide-react';
import { toast } from 'sonner';
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

const API = API_URL;

// التصنيفات الافتراضية
const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'rent', name: 'إيجار', icon: '🏠' },
  { id: 'utilities', name: 'كهرباء وماء', icon: '💡' },
  { id: 'gas', name: 'غاز', icon: '🔥' },
  { id: 'salaries', name: 'رواتب', icon: '💰' },
  { id: 'maintenance', name: 'صيانة', icon: '🔧' },
  { id: 'supplies', name: 'مستلزمات', icon: '📦' },
  { id: 'marketing', name: 'تسويق', icon: '📢' },
  { id: 'transport', name: 'نقل', icon: '🚗' },
  { id: 'other', name: 'أخرى', icon: '📋' },
];

export default function Expenses() {
  const { user, hasRole } = useAuth();
  const { t, isRTL } = useTranslation();
  const { isOnline, isOffline, updateSyncStatus } = useOffline();
  const navigate = useNavigate();
  
  const [expenses, setExpenses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // التصنيفات المخصصة (يتم جلبها من قاعدة البيانات)
  const [customCategories, setCustomCategories] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState(DEFAULT_EXPENSE_CATEGORIES);
  
  const [formData, setFormData] = useState({
    category: 'other',
    description: '',
    amount: '',
    payment_method: 'cash',
    reference_number: '',
    date: new Date().toISOString().split('T')[0],
    custom_category_name: '' // حقل جديد للتصنيف المخصص
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedBranch, selectedCategory, startDate, endDate]);

  // جلب التصنيفات المخصصة
  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${API}/expense-categories`);
      const custom = res.data || [];
      setCustomCategories(custom);
      // دمج التصنيفات الافتراضية مع المخصصة
      const allCategories = [
        ...DEFAULT_EXPENSE_CATEGORIES.filter(c => c.id !== 'other'),
        ...custom.map(c => ({ id: c.id, name: c.name, icon: c.icon || '🏷️' })),
        DEFAULT_EXPENSE_CATEGORIES.find(c => c.id === 'other') // "أخرى" في النهاية
      ];
      setExpenseCategories(allCategories);
    } catch (error) {
      console.log('Using default categories');
      setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES);
    }
  };

  const fetchData = async () => {
    try {
      // === وضع Offline - جلب من IndexedDB ===
      if (isOffline) {
        try {
          const [localExpenses, localBranches] = await Promise.all([
            db.getAllItems(STORES.EXPENSES),
            db.getAllItems(STORES.BRANCHES)
          ]);
          
          // تصفية المصاريف حسب التاريخ
          const filteredExpenses = localExpenses.filter(e => {
            const expenseDate = e.date;
            return expenseDate >= startDate && expenseDate <= endDate;
          });
          
          setExpenses(filteredExpenses);
          setBranches(localBranches);
          
          if (!selectedBranch && localBranches.length > 0) {
            setSelectedBranch(localBranches[0].id);
          }
          
          setLoading(false);
          return;
        } catch (offlineError) {
          console.error('Error loading offline expenses:', offlineError);
        }
      }
      
      // === وضع Online ===
      const [expensesRes, branchesRes] = await Promise.all([
        axios.get(`${API}/expenses`, {
          params: {
            branch_id: selectedBranch,
            category: selectedCategory !== 'all' ? selectedCategory : undefined,
            start_date: startDate,
            end_date: endDate
          }
        }),
        axios.get(`${API}/branches`)
      ]);

      setExpenses(expensesRes.data);
      setBranches(branchesRes.data);

      // حفظ البيانات محلياً للاستخدام offline
      try {
        await db.addItems(STORES.EXPENSES, expensesRes.data);
        await db.addItems(STORES.BRANCHES, branchesRes.data);
      } catch (cacheError) {
        console.log('Could not cache expenses locally:', cacheError);
      }

      if (!selectedBranch && branchesRes.data.length > 0) {
        setSelectedBranch(branchesRes.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
      
      // محاولة جلب من IndexedDB عند الخطأ
      if (!error.response) {
        try {
          const localExpenses = await db.getAllItems(STORES.EXPENSES);
          const localBranches = await db.getAllItems(STORES.BRANCHES);
          
          setExpenses(localExpenses);
          setBranches(localBranches);
          
          toast.warning(t('تم تحميل البيانات المحلية - لا يوجد اتصال'));
        } catch (offlineError) {
          toast.error(t('فشل في تحميل المصاريف'));
        }
      } else {
        toast.error(t('فشل في تحميل المصاريف'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let categoryToUse = formData.category;
      
      // إذا تم اختيار "أخرى" وكتب المستخدم اسم تصنيف جديد
      if (formData.category === 'other' && formData.custom_category_name.trim()) {
        // إنشاء تصنيف جديد
        const newCategoryId = formData.custom_category_name.toLowerCase().replace(/\s+/g, '_');
        const newCategory = {
          id: newCategoryId,
          name: formData.custom_category_name.trim(),
          icon: '🏷️'
        };
        
        // حفظ التصنيف الجديد في قاعدة البيانات (إذا online)
        if (isOnline) {
          try {
            await axios.post(`${API}/expense-categories`, newCategory);
            // تحديث قائمة التصنيفات
            fetchCategories();
            toast.success(`${t('تم إضافة تصنيف')} "${formData.custom_category_name}" ${t('للقائمة')}`);
          } catch (err) {
            // التصنيف موجود بالفعل - استخدمه
            console.log('Category may already exist');
          }
        }
        
        categoryToUse = newCategoryId;
      }
      
      const expenseData = {
        ...formData,
        category: categoryToUse,
        amount: parseFloat(formData.amount),
        branch_id: selectedBranch
      };
      
      // === وضع Offline - حفظ محلياً ===
      if (isOffline) {
        const offlineExpense = {
          ...expenseData,
          id: generateUUID(),
          offline_id: generateOfflineId('EXP'),
          is_synced: false,
          created_at: new Date().toISOString()
        };
        
        // حفظ في IndexedDB
        await db.addItem(STORES.EXPENSES, offlineExpense);
        
        // إضافة لقائمة المزامنة
        await addToSyncQueue({
          type: 'expense',
          action: 'create',
          data: expenseData,
          offline_id: offlineExpense.offline_id
        });
        
        // تحديث القائمة المحلية
        setExpenses(prev => [offlineExpense, ...prev]);
        
        toast.success(
          <div>
            <div>✅ {t('تم حفظ المصروف محلياً')}</div>
            <div className="text-xs opacity-60">{t('سيتم رفعه عند عودة الاتصال')}</div>
          </div>,
          { duration: 4000 }
        );
        
        // تحديث حالة المزامنة
        await updateSyncStatus();
        
        setDialogOpen(false);
        setFormData({
          category: 'other',
          description: '',
          amount: '',
          payment_method: 'cash',
          reference_number: '',
          date: new Date().toISOString().split('T')[0],
          custom_category_name: ''
        });
        return;
      }
      
      // === وضع Online ===
      await axios.post(`${API}/expenses`, expenseData);
      toast.success(t('تم إضافة المصروف'));
      setDialogOpen(false);
      setFormData({
        category: 'other',
        description: '',
        amount: '',
        payment_method: 'cash',
        reference_number: '',
        date: new Date().toISOString().split('T')[0],
        custom_category_name: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة المصروف'));
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expensesByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const getCategoryName = (catId) => {
    const cat = expenseCategories.find(c => c.id === catId);
    return cat ? t(cat.name) : catId;
  };

  const getCategoryIcon = (catId) => {
    const cat = expenseCategories.find(c => c.id === catId);
    return cat ? cat.icon : '🏷️';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('جاري التحميل...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="expenses-page">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold font-cairo text-foreground">{t('المصاريف اليومية')}</h1>
              <p className="text-sm text-muted-foreground">{t('تسجيل ومتابعة المصاريف')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedBranch || ''}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground"
            >
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>

            {hasRole(['admin', 'manager', 'supervisor']) && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground" data-testid="add-expense-btn">
                    <Plus className="h-4 w-4 ml-2" />
                    {t('إضافة مصروف')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">{t('إضافة مصروف جديد')}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label className="text-foreground">{t('التصنيف')}</Label>
                      <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {expenseCategories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.icon} {t(cat.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* حقل التصنيف المخصص - يظهر عند اختيار "أخرى" */}
                    {formData.category === 'other' && (
                      <div>
                        <Label className="text-foreground">{t('اسم التصنيف الجديد (اختياري)')}</Label>
                        <Input
                          value={formData.custom_category_name}
                          onChange={(e) => setFormData({ ...formData, custom_category_name: e.target.value })}
                          placeholder={t('مثال: إنترنت، هاتف، تأمين...')}
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">{t('اكتب اسم تصنيف جديد وسيُحفظ تلقائياً للاستخدام المستقبلي')}</p>
                      </div>
                    )}
                    
                    <div>
                      <Label className="text-foreground">{t('الوصف')}</Label>
                      <Input
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder={t('وصف المصروف...')}
                        required
                        className="mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-foreground">{t('المبلغ')}</Label>
                        <Input
                          type="number"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                          placeholder="0"
                          required
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-foreground">{t('التاريخ')}</Label>
                        <Input
                          type="date"
                          value={formData.date}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-foreground">{t('طريقة الدفع')}</Label>
                        <Select value={formData.payment_method} onValueChange={(v) => setFormData({ ...formData, payment_method: v })}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">{t('نقدي')}</SelectItem>
                            <SelectItem value="card">{t('بطاقة')}</SelectItem>
                            <SelectItem value="transfer">{t('تحويل')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-foreground">{t('رقم المرجع (اختياري)')}</Label>
                        <Input
                          value={formData.reference_number}
                          onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                          placeholder={t('رقم الفاتورة...')}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                        {t('إلغاء')}</Button>
                      <Button type="submit" className="flex-1 bg-primary text-primary-foreground">{t('حفظ')}</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-6 py-4 border-b border-border">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[140px]"
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[140px]"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder={t('التصنيف')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('جميع التصنيفات')}</SelectItem>
              {expenseCategories.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.icon} {t(cat.name)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-border/50 bg-card col-span-1 md:col-span-2">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-14 h-14 bg-red-500/10 rounded-xl flex items-center justify-center">
                <DollarSign className="h-7 w-7 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('إجمالي المصاريف')}</p>
                <p className="text-3xl font-bold text-foreground tabular-nums">{formatPrice(totalExpenses)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{t('عدد المعاملات')}</p>
              <p className="text-2xl font-bold text-foreground">{expenses.length}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{t('المتوسط')}</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">
                {formatPrice(expenses.length > 0 ? totalExpenses / expenses.length : 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* By Category */}
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">{t('حسب التصنيف')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(expensesByCategory).map(([cat, amount]) => (
                <div key={cat} className="p-4 bg-muted/30 rounded-lg text-center">
                  <span className="text-2xl">{getCategoryIcon(cat)}</span>
                  <p className="text-sm text-muted-foreground mt-2">{getCategoryName(cat)}</p>
                  <p className="text-lg font-bold text-foreground mt-1 tabular-nums">{formatPrice(amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expenses List */}
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">{t('سجل المصاريف')}</CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t('لا توجد مصاريف في هذه الفترة')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {expenses.map(expense => (
                  <div key={expense.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{getCategoryIcon(expense.category)}</span>
                      <div>
                        <p className="font-medium text-foreground">{expense.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {getCategoryName(expense.category)} • {expense.date}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-bold text-red-500 tabular-nums">-{formatPrice(expense.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {expense.payment_method === 'cash' ? t('نقدي') : expense.payment_method === 'card' ? t('بطاقة') : t('تحويل')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
