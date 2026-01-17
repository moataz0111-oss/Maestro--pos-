import React, { useState, useEffect } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/currency';
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
  Trash2
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

const EXPENSE_CATEGORIES = [
  { id: 'rent', name: 'إيجار', icon: '🏠' },
  { id: 'utilities', name: 'كهرباء وماء', icon: '💡' },
  { id: 'salaries', name: 'رواتب', icon: '💰' },
  { id: 'maintenance', name: 'صيانة', icon: '🔧' },
  { id: 'supplies', name: 'مستلزمات', icon: '📦' },
  { id: 'marketing', name: 'تسويق', icon: '📢' },
  { id: 'transport', name: 'نقل', icon: '🚗' },
  { id: 'other', name: 'أخرى', icon: '📋' },
];

export default function Expenses() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  
  const [expenses, setExpenses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    category: 'other',
    description: '',
    amount: '',
    payment_method: 'cash',
    reference_number: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, [selectedBranch, selectedCategory, startDate, endDate]);

  const fetchData = async () => {
    try {
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

      if (!selectedBranch && branchesRes.data.length > 0) {
        setSelectedBranch(branchesRes.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
      toast.error('فشل في تحميل المصاريف');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/expenses`, {
        ...formData,
        amount: parseFloat(formData.amount),
        branch_id: selectedBranch
      });
      toast.success('تم إضافة المصروف');
      setDialogOpen(false);
      setFormData({
        category: 'other',
        description: '',
        amount: '',
        payment_method: 'cash',
        reference_number: '',
        date: new Date().toISOString().split('T')[0]
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة المصروف');
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expensesByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const getCategoryName = (catId) => {
    const cat = EXPENSE_CATEGORIES.find(c => c.id === catId);
    return cat ? cat.name : catId;
  };

  const getCategoryIcon = (catId) => {
    const cat = EXPENSE_CATEGORIES.find(c => c.id === catId);
    return cat ? cat.icon : '📋';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحميل...</p>
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
              <h1 className="text-xl font-bold font-cairo text-foreground">المصاريف اليومية</h1>
              <p className="text-sm text-muted-foreground">تسجيل ومتابعة المصاريف</p>
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
                    إضافة مصروف
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">إضافة مصروف جديد</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label className="text-foreground">التصنيف</Label>
                      <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.icon} {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-foreground">الوصف</Label>
                      <Input
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="وصف المصروف..."
                        required
                        className="mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-foreground">المبلغ</Label>
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
                        <Label className="text-foreground">التاريخ</Label>
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
                        <Label className="text-foreground">طريقة الدفع</Label>
                        <Select value={formData.payment_method} onValueChange={(v) => setFormData({ ...formData, payment_method: v })}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">نقدي</SelectItem>
                            <SelectItem value="card">بطاقة</SelectItem>
                            <SelectItem value="transfer">تحويل</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-foreground">رقم المرجع (اختياري)</Label>
                        <Input
                          value={formData.reference_number}
                          onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                          placeholder="رقم الفاتورة..."
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                        إلغاء
                      </Button>
                      <Button type="submit" className="flex-1 bg-primary text-primary-foreground">
                        حفظ
                      </Button>
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
              <SelectValue placeholder="التصنيف" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع التصنيفات</SelectItem>
              {EXPENSE_CATEGORIES.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
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
                <p className="text-sm text-muted-foreground">إجمالي المصاريف</p>
                <p className="text-3xl font-bold text-foreground tabular-nums">{formatPrice(totalExpenses)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">عدد المعاملات</p>
              <p className="text-2xl font-bold text-foreground">{expenses.length}</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">المتوسط</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">
                {formatPrice(expenses.length > 0 ? totalExpenses / expenses.length : 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* By Category */}
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">حسب التصنيف</CardTitle>
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
            <CardTitle className="text-lg text-foreground">سجل المصاريف</CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">لا توجد مصاريف في هذه الفترة</p>
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
                        {expense.payment_method === 'cash' ? 'نقدي' : expense.payment_method === 'card' ? 'بطاقة' : 'تحويل'}
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
