import React, { useState, useEffect } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { formatPrice } from '../utils/currency';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import BranchSelector from '../components/BranchSelector';
import {
  Users,
  UserPlus,
  Calendar,
  DollarSign,
  Clock,
  Award,
  AlertTriangle,
  FileText,
  Plus,
  Edit,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Printer,
  Download,
  Building,
  Phone,
  Mail,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Banknote,
  CalendarDays,
  ClipboardList,
  UserCheck,
  UserX,
  Timer,
  Gift,
  Minus,
  ArrowRight,
  Home,
  Fingerprint,
  FileSpreadsheet,
  BarChart3
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import BiometricDevices from '../components/BiometricDevices';

const API = API_URL;

export default function HR() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { selectedBranchId, branches: contextBranches, getBranchIdForApi } = useBranch();
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [payrollSummary, setPayrollSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Dialogs
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [deductionDialogOpen, setDeductionDialogOpen] = useState(false);
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);
  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);

  // Forms
  const [employeeForm, setEmployeeForm] = useState({
    name: '', phone: '', email: '', national_id: '', position: '', department: '',
    branch_id: '', hire_date: '', salary: '', salary_type: 'monthly', work_hours_per_day: 8
  });
  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: '', date: new Date().toISOString().slice(0, 10), check_in: '', check_out: '', status: 'present', notes: ''
  });
  const [advanceForm, setAdvanceForm] = useState({
    employee_id: '', amount: '', reason: '', deduction_months: 1
  });
  const [deductionForm, setDeductionForm] = useState({
    employee_id: '', deduction_type: 'absence', amount: '', hours: '', days: '', reason: '', date: new Date().toISOString().slice(0, 10)
  });
  const [bonusForm, setBonusForm] = useState({
    employee_id: '', bonus_type: 'performance', amount: '', hours: '', reason: '', date: new Date().toISOString().slice(0, 10)
  });

  const [editingEmployee, setEditingEmployee] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [payrollPreview, setPayrollPreview] = useState(null);

  useEffect(() => {
    fetchData();
  }, [selectedBranchId, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const branchId = getBranchIdForApi();
      
      const [empRes, branchRes, attRes, advRes, dedRes, bonRes, payRes, summaryRes] = await Promise.all([
        axios.get(`${API}/employees${branchId ? `?branch_id=${branchId}` : ''}`, { headers }),
        axios.get(`${API}/branches`, { headers }),
        axios.get(`${API}/attendance?start_date=${selectedMonth}-01&end_date=${selectedMonth}-31`, { headers }),
        axios.get(`${API}/advances`, { headers }),
        axios.get(`${API}/deductions?start_date=${selectedMonth}-01&end_date=${selectedMonth}-31`, { headers }),
        axios.get(`${API}/bonuses?start_date=${selectedMonth}-01&end_date=${selectedMonth}-31`, { headers }),
        axios.get(`${API}/payroll?month=${selectedMonth}`, { headers }),
        axios.get(`${API}/reports/payroll-summary?month=${selectedMonth}${branchId ? `&branch_id=${branchId}` : ''}`, { headers }).catch(() => ({ data: null }))
      ]);
      
      setEmployees(empRes.data);
      setBranches(branchRes.data);
      setAttendance(attRes.data);
      setAdvances(advRes.data);
      setDeductions(dedRes.data);
      setBonuses(bonRes.data);
      setPayrolls(payRes.data);
      setPayrollSummary(summaryRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  // Employee handlers
  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/employees`, {
        ...employeeForm,
        salary: parseFloat(employeeForm.salary),
        work_hours_per_day: parseFloat(employeeForm.work_hours_per_day)
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم إضافة الموظف');
      setEmployeeDialogOpen(false);
      resetEmployeeForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة الموظف');
    }
  };

  const handleUpdateEmployee = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/employees/${editingEmployee.id}`, {
        ...employeeForm,
        salary: parseFloat(employeeForm.salary),
        work_hours_per_day: parseFloat(employeeForm.work_hours_per_day)
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم تحديث الموظف');
      setEditingEmployee(null);
      setEmployeeDialogOpen(false);
      resetEmployeeForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تحديث الموظف');
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/employees/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم تعطيل الموظف');
      fetchData();
    } catch (error) {
      toast.error('فشل في حذف الموظف');
    }
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({
      name: '', phone: '', email: '', national_id: '', position: '', department: '',
      branch_id: '', hire_date: '', salary: '', salary_type: 'monthly', work_hours_per_day: 8
    });
  };

  // Attendance handlers
  const handleCreateAttendance = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/attendance`, attendanceForm, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم تسجيل الحضور');
      setAttendanceDialogOpen(false);
      setAttendanceForm({ employee_id: '', date: new Date().toISOString().slice(0, 10), check_in: '', check_out: '', status: 'present', notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تسجيل الحضور');
    }
  };

  // Advance handlers
  const handleCreateAdvance = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/advances`, {
        ...advanceForm,
        amount: parseFloat(advanceForm.amount),
        deduction_months: parseInt(advanceForm.deduction_months)
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم تسجيل السلفة');
      setAdvanceDialogOpen(false);
      setAdvanceForm({ employee_id: '', amount: '', reason: '', deduction_months: 1 });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تسجيل السلفة');
    }
  };

  // Deduction handlers
  const handleCreateDeduction = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/deductions`, {
        ...deductionForm,
        amount: deductionForm.amount ? parseFloat(deductionForm.amount) : null,
        hours: deductionForm.hours ? parseFloat(deductionForm.hours) : null,
        days: deductionForm.days ? parseFloat(deductionForm.days) : null
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم تسجيل الخصم');
      setDeductionDialogOpen(false);
      setDeductionForm({ employee_id: '', deduction_type: 'absence', amount: '', hours: '', days: '', reason: '', date: new Date().toISOString().slice(0, 10) });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تسجيل الخصم');
    }
  };

  // Bonus handlers
  const handleCreateBonus = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/bonuses`, {
        ...bonusForm,
        amount: bonusForm.amount ? parseFloat(bonusForm.amount) : null,
        hours: bonusForm.hours ? parseFloat(bonusForm.hours) : null
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم تسجيل المكافأة');
      setBonusDialogOpen(false);
      setBonusForm({ employee_id: '', bonus_type: 'performance', amount: '', hours: '', reason: '', date: new Date().toISOString().slice(0, 10) });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في تسجيل المكافأة');
    }
  };

  // Payroll handlers
  const calculatePayroll = async (employeeId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/payroll/calculate?employee_id=${employeeId}&month=${selectedMonth}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setPayrollPreview(res.data);
      setPayrollDialogOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في حساب الراتب');
    }
  };

  const createPayroll = async () => {
    if (!payrollPreview) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/payroll`, {
        employee_id: payrollPreview.employee_id,
        month: payrollPreview.month,
        basic_salary: payrollPreview.basic_salary,
        total_deductions: payrollPreview.total_deductions,
        total_bonuses: payrollPreview.total_bonuses,
        advance_deduction: payrollPreview.advance_deduction,
        net_salary: payrollPreview.net_salary
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم إنشاء كشف الراتب');
      setPayrollDialogOpen(false);
      setPayrollPreview(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء كشف الراتب');
    }
  };

  const payPayroll = async (payrollId) => {
    if (!window.confirm('هل أنت متأكد من صرف هذا الراتب؟')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/payroll/${payrollId}/pay`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('تم صرف الراتب');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في صرف الراتب');
    }
  };

  // تصدير تقرير الرواتب الشامل
  const exportPayrollReport = async (format = 'excel') => {
    try {
      toast.loading('جاري تحضير الملف...');
      const token = localStorage.getItem('token');
      const branchId = getBranchIdForApi();
      
      const response = await axios.get(
        `${API}/reports/payroll/export/excel?month=${selectedMonth}${branchId ? `&branch_id=${branchId}` : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payroll_report_${selectedMonth}.xlsx`);
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

  // تصدير مفردات مرتب موظف
  const exportEmployeeSalarySlip = async (employeeId, employeeName, format = 'excel') => {
    try {
      toast.loading('جاري تحضير الملف...');
      const token = localStorage.getItem('token');
      
      const response = await axios.get(
        `${API}/reports/employee-salary-slip/${employeeId}/export/excel?month=${selectedMonth}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `salary_slip_${employeeName}_${selectedMonth}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.dismiss();
      toast.success('تم تحميل مفردات المرتب بنجاح');
    } catch (error) {
      toast.dismiss();
      toast.error('فشل في تصدير مفردات المرتب');
    }
  };

  // تصدير تقرير الرواتب PDF
  const exportPayrollPDF = async () => {
    try {
      toast.loading('جاري تحضير ملف PDF...');
      const token = localStorage.getItem('token');
      const branchId = getBranchIdForApi();
      
      const response = await axios.get(
        `${API}/reports/payroll/export/pdf?month=${selectedMonth}${branchId ? `&branch_id=${branchId}` : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payroll_report_${selectedMonth}.pdf`);
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

  // تصدير مفردات مرتب PDF
  const exportEmployeeSalarySlipPDF = async (employeeId, employeeName) => {
    try {
      toast.loading('جاري تحضير ملف PDF...');
      const token = localStorage.getItem('token');
      
      const response = await axios.get(
        `${API}/reports/employee-salary-slip/${employeeId}/export/pdf?month=${selectedMonth}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `salary_slip_${employeeName}_${selectedMonth}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.dismiss();
      toast.success('تم تحميل مفردات المرتب PDF بنجاح');
    } catch (error) {
      toast.dismiss();
      toast.error('فشل في تصدير مفردات المرتب');
    }
  };

  // Stats
  const stats = {
    totalEmployees: employees.filter(e => e.is_active).length,
    totalSalaries: employees.filter(e => e.is_active).reduce((sum, e) => sum + (e.salary || 0), 0),
    pendingAdvances: advances.filter(a => a.status === 'approved' && a.remaining_amount > 0).reduce((sum, a) => sum + a.remaining_amount, 0),
    monthlyDeductions: deductions.reduce((sum, d) => sum + d.amount, 0),
    monthlyBonuses: bonuses.reduce((sum, b) => sum + b.amount, 0),
    netPayable: payrollSummary?.totals?.net_payable || 0
  };

  const filteredEmployees = employees.filter(e => 
    e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.phone?.includes(searchTerm) ||
    e.position?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status) => {
    const statusConfig = {
      present: { label: 'حاضر', color: 'bg-green-500' },
      absent: { label: 'غائب', color: 'bg-red-500' },
      late: { label: 'متأخر', color: 'bg-yellow-500' },
      early_leave: { label: 'انصراف مبكر', color: 'bg-orange-500' },
      holiday: { label: 'إجازة', color: 'bg-blue-500' }
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-500' };
    return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
  };

  const getPayrollStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: 'مسودة', color: 'bg-gray-500' },
      approved: { label: 'معتمد', color: 'bg-blue-500' },
      paid: { label: 'تم الصرف', color: 'bg-green-500' }
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-500' };
    return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* زر الرجوع */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/')}
                className="h-10 w-10"
                data-testid="back-btn"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
              
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">إدارة الموارد البشرية</h1>
                  <p className="text-sm text-muted-foreground">إدارة الموظفين والرواتب والحضور</p>
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
              <BranchSelector />
              
              {/* زر تصدير التقرير */}
              <Button
                variant="outline"
                onClick={() => exportPayrollReport('excel')}
                className="h-10"
                title="تصدير تقرير الرواتب"
              >
                <FileSpreadsheet className="h-5 w-5 ml-2" />
                تصدير Excel
              </Button>
              
              {/* زر الصفحة الرئيسية */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/')}
                className="h-10 w-10"
                title="الصفحة الرئيسية"
              >
                <Home className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-4 text-center">
              <Users className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-500">{stats.totalEmployees}</p>
              <p className="text-sm text-muted-foreground">موظف نشط</p>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4 text-center">
              <Banknote className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-green-500">{formatPrice(stats.totalSalaries)}</p>
              <p className="text-sm text-muted-foreground">إجمالي الرواتب</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-4 text-center">
              <CreditCard className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-yellow-500">{formatPrice(stats.pendingAdvances)}</p>
              <p className="text-sm text-muted-foreground">سلف معلقة</p>
            </CardContent>
          </Card>
          <Card className="bg-red-500/10 border-red-500/20">
            <CardContent className="p-4 text-center">
              <TrendingDown className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-red-500">{formatPrice(stats.monthlyDeductions)}</p>
              <p className="text-sm text-muted-foreground">خصومات الشهر</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-500/10 border-purple-500/20">
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-8 w-8 text-purple-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-purple-500">{formatPrice(stats.monthlyBonuses)}</p>
              <p className="text-sm text-muted-foreground">مكافآت الشهر</p>
            </CardContent>
          </Card>
          <Card className="bg-cyan-500/10 border-cyan-500/20">
            <CardContent className="p-4 text-center">
              <DollarSign className="h-8 w-8 text-cyan-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-cyan-500">{formatPrice(stats.netPayable)}</p>
              <p className="text-sm text-muted-foreground">المستحقات</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="employees" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> الموظفين
            </TabsTrigger>
            <TabsTrigger value="salary-report" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> تقرير الرواتب
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> الحضور
            </TabsTrigger>
            <TabsTrigger value="advances" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> السلف
            </TabsTrigger>
            <TabsTrigger value="deductions" className="flex items-center gap-2">
              <Minus className="h-4 w-4" /> الخصومات
            </TabsTrigger>
            <TabsTrigger value="bonuses" className="flex items-center gap-2">
              <Gift className="h-4 w-4" /> المكافآت
            </TabsTrigger>
            <TabsTrigger value="payroll" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> كشوفات الرواتب
            </TabsTrigger>
            <TabsTrigger value="biometric" className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4" /> أجهزة البصمة
            </TabsTrigger>
          </TabsList>

          {/* Employees Tab */}
          <TabsContent value="employees">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>قائمة الموظفين</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-9 w-60"
                    />
                  </div>
                  <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => { setEditingEmployee(null); resetEmployeeForm(); }}>
                        <UserPlus className="h-4 w-4 ml-2" /> إضافة موظف
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{editingEmployee ? 'تعديل موظف' : 'إضافة موظف جديد'}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={editingEmployee ? handleUpdateEmployee : handleCreateEmployee} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>الاسم الكامل *</Label>
                            <Input value={employeeForm.name} onChange={(e) => setEmployeeForm({...employeeForm, name: e.target.value})} required />
                          </div>
                          <div>
                            <Label>رقم الهاتف *</Label>
                            <Input value={employeeForm.phone} onChange={(e) => setEmployeeForm({...employeeForm, phone: e.target.value})} required />
                          </div>
                          <div>
                            <Label>البريد الإلكتروني</Label>
                            <Input type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm({...employeeForm, email: e.target.value})} />
                          </div>
                          <div>
                            <Label>رقم الهوية</Label>
                            <Input value={employeeForm.national_id} onChange={(e) => setEmployeeForm({...employeeForm, national_id: e.target.value})} />
                          </div>
                          <div>
                            <Label>المسمى الوظيفي *</Label>
                            <Input value={employeeForm.position} onChange={(e) => setEmployeeForm({...employeeForm, position: e.target.value})} required />
                          </div>
                          <div>
                            <Label>القسم</Label>
                            <Input value={employeeForm.department} onChange={(e) => setEmployeeForm({...employeeForm, department: e.target.value})} />
                          </div>
                          <div>
                            <Label>الفرع *</Label>
                            <Select value={employeeForm.branch_id} onValueChange={(v) => setEmployeeForm({...employeeForm, branch_id: v})}>
                              <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                              <SelectContent>
                                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>تاريخ التعيين *</Label>
                            <Input type="date" value={employeeForm.hire_date} onChange={(e) => setEmployeeForm({...employeeForm, hire_date: e.target.value})} required />
                          </div>
                          <div>
                            <Label>الراتب الأساسي *</Label>
                            <Input type="number" value={employeeForm.salary} onChange={(e) => setEmployeeForm({...employeeForm, salary: e.target.value})} required />
                          </div>
                          <div>
                            <Label>نوع الراتب</Label>
                            <Select value={employeeForm.salary_type} onValueChange={(v) => setEmployeeForm({...employeeForm, salary_type: v})}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="monthly">شهري</SelectItem>
                                <SelectItem value="daily">يومي</SelectItem>
                                <SelectItem value="hourly">بالساعة</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>ساعات العمل اليومية</Label>
                            <Input type="number" value={employeeForm.work_hours_per_day} onChange={(e) => setEmployeeForm({...employeeForm, work_hours_per_day: e.target.value})} />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={() => setEmployeeDialogOpen(false)}>إلغاء</Button>
                          <Button type="submit">{editingEmployee ? 'تحديث' : 'إضافة'}</Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">الاسم</th>
                        <th className="text-right p-3">الهاتف</th>
                        <th className="text-right p-3">المسمى</th>
                        <th className="text-right p-3">الفرع</th>
                        <th className="text-right p-3">الراتب</th>
                        <th className="text-right p-3">الحالة</th>
                        <th className="text-right p-3">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map(emp => (
                        <tr key={emp.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{emp.name}</td>
                          <td className="p-3">{emp.phone}</td>
                          <td className="p-3">{emp.position}</td>
                          <td className="p-3">{branches.find(b => b.id === emp.branch_id)?.name || '-'}</td>
                          <td className="p-3">{formatPrice(emp.salary)}</td>
                          <td className="p-3">
                            <Badge className={emp.is_active ? 'bg-green-500' : 'bg-red-500'}>
                              {emp.is_active ? 'نشط' : 'معطل'}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => exportEmployeeSalarySlip(emp.id, emp.name, 'excel')} title="تصدير مفردات المرتب">
                                <FileSpreadsheet className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => calculatePayroll(emp.id)} title="إنشاء كشف راتب">
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => {
                                setEditingEmployee(emp);
                                setEmployeeForm({
                                  name: emp.name, phone: emp.phone, email: emp.email || '', national_id: emp.national_id || '',
                                  position: emp.position, department: emp.department || '', branch_id: emp.branch_id,
                                  hire_date: emp.hire_date, salary: emp.salary, salary_type: emp.salary_type,
                                  work_hours_per_day: emp.work_hours_per_day
                                });
                                setEmployeeDialogOpen(true);
                              }} title="تعديل">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteEmployee(emp.id)} title="حذف">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Salary Report Tab - تقرير الرواتب الشامل */}
          <TabsContent value="salary-report">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  تقرير الرواتب الشامل - {selectedMonth}
                </CardTitle>
                <div className="flex gap-2">
                  <Button onClick={() => exportPayrollReport('excel')}>
                    <FileSpreadsheet className="h-4 w-4 ml-2" /> Excel
                  </Button>
                  <Button variant="outline" onClick={() => exportPayrollPDF()}>
                    <FileText className="h-4 w-4 ml-2" /> PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {payrollSummary ? (
                  <>
                    {/* ملخص الإجماليات */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                      <Card className="bg-blue-500/10">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">الرواتب الأساسية</p>
                          <p className="text-xl font-bold text-blue-500">{formatPrice(payrollSummary.totals?.basic_salary || 0)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-green-500/10">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">المكافآت</p>
                          <p className="text-xl font-bold text-green-500">{formatPrice(payrollSummary.totals?.total_bonuses || 0)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-red-500/10">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">الخصومات</p>
                          <p className="text-xl font-bold text-red-500">{formatPrice(payrollSummary.totals?.total_deductions || 0)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-yellow-500/10">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">السلف</p>
                          <p className="text-xl font-bold text-yellow-500">{formatPrice(payrollSummary.totals?.total_advances || 0)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-cyan-500/10">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">صافي المستحقات</p>
                          <p className="text-xl font-bold text-cyan-500">{formatPrice(payrollSummary.totals?.net_payable || 0)}</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* جدول تفصيلي */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="p-3 text-right">#</th>
                            <th className="p-3 text-right">الموظف</th>
                            <th className="p-3 text-right">الفرع</th>
                            <th className="p-3 text-right">الوظيفة</th>
                            <th className="p-3 text-right">الراتب الأساسي</th>
                            <th className="p-3 text-right">المكافآت</th>
                            <th className="p-3 text-right">الخصومات</th>
                            <th className="p-3 text-right">السلف</th>
                            <th className="p-3 text-right">صافي الراتب</th>
                            <th className="p-3 text-right">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payrollSummary.employees?.map((emp, idx) => (
                            <tr key={emp.id} className="border-b hover:bg-muted/30">
                              <td className="p-3">{idx + 1}</td>
                              <td className="p-3 font-medium">{emp.name}</td>
                              <td className="p-3">{emp.branch_name}</td>
                              <td className="p-3">{emp.position}</td>
                              <td className="p-3">{formatPrice(emp.basic_salary)}</td>
                              <td className="p-3 text-green-600">{formatPrice(emp.bonuses)}</td>
                              <td className="p-3 text-red-600">{formatPrice(emp.deductions)}</td>
                              <td className="p-3 text-yellow-600">{formatPrice(emp.advances_deduction)}</td>
                              <td className="p-3 font-bold text-cyan-600">{formatPrice(emp.net_payable)}</td>
                              <td className="p-3">
                                <div className="flex gap-1">
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => exportEmployeeSalarySlip(emp.id, emp.name, 'excel')}
                                    title="Excel"
                                  >
                                    <FileSpreadsheet className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => exportEmployeeSalarySlipPDF(emp.id, emp.name)}
                                    title="PDF"
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-muted/50 font-bold">
                          <tr>
                            <td colSpan="4" className="p-3">الإجمالي</td>
                            <td className="p-3">{formatPrice(payrollSummary.totals?.basic_salary || 0)}</td>
                            <td className="p-3 text-green-600">{formatPrice(payrollSummary.totals?.total_bonuses || 0)}</td>
                            <td className="p-3 text-red-600">{formatPrice(payrollSummary.totals?.total_deductions || 0)}</td>
                            <td className="p-3 text-yellow-600">{formatPrice(payrollSummary.totals?.total_advances || 0)}</td>
                            <td className="p-3 text-cyan-600">{formatPrice(payrollSummary.totals?.net_payable || 0)}</td>
                            <td className="p-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد بيانات رواتب لهذا الشهر</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Attendance Tab */}
          <TabsContent value="attendance">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>سجل الحضور - {selectedMonth}</CardTitle>
                <Dialog open={attendanceDialogOpen} onOpenChange={setAttendanceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 ml-2" /> تسجيل حضور</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>تسجيل حضور/انصراف</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateAttendance} className="space-y-4">
                      <div>
                        <Label>الموظف *</Label>
                        <Select value={attendanceForm.employee_id} onValueChange={(v) => setAttendanceForm({...attendanceForm, employee_id: v})}>
                          <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                          <SelectContent>
                            {employees.filter(e => e.is_active).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>التاريخ *</Label>
                        <Input type="date" value={attendanceForm.date} onChange={(e) => setAttendanceForm({...attendanceForm, date: e.target.value})} required />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>وقت الحضور</Label>
                          <Input type="time" value={attendanceForm.check_in} onChange={(e) => setAttendanceForm({...attendanceForm, check_in: e.target.value})} />
                        </div>
                        <div>
                          <Label>وقت الانصراف</Label>
                          <Input type="time" value={attendanceForm.check_out} onChange={(e) => setAttendanceForm({...attendanceForm, check_out: e.target.value})} />
                        </div>
                      </div>
                      <div>
                        <Label>الحالة</Label>
                        <Select value={attendanceForm.status} onValueChange={(v) => setAttendanceForm({...attendanceForm, status: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">حاضر</SelectItem>
                            <SelectItem value="absent">غائب</SelectItem>
                            <SelectItem value="late">متأخر</SelectItem>
                            <SelectItem value="early_leave">انصراف مبكر</SelectItem>
                            <SelectItem value="holiday">إجازة</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>ملاحظات</Label>
                        <Textarea value={attendanceForm.notes} onChange={(e) => setAttendanceForm({...attendanceForm, notes: e.target.value})} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setAttendanceDialogOpen(false)}>إلغاء</Button>
                        <Button type="submit">تسجيل</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">الموظف</th>
                        <th className="text-right p-3">التاريخ</th>
                        <th className="text-right p-3">الحضور</th>
                        <th className="text-right p-3">الانصراف</th>
                        <th className="text-right p-3">الساعات</th>
                        <th className="text-right p-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map(att => (
                        <tr key={att.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{att.employee_name}</td>
                          <td className="p-3">{att.date}</td>
                          <td className="p-3">{att.check_in || '-'}</td>
                          <td className="p-3">{att.check_out || '-'}</td>
                          <td className="p-3">{att.worked_hours?.toFixed(1) || '-'}</td>
                          <td className="p-3">{getStatusBadge(att.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advances Tab */}
          <TabsContent value="advances">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>السلف</CardTitle>
                <Dialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 ml-2" /> سلفة جديدة</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>تسجيل سلفة</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateAdvance} className="space-y-4">
                      <div>
                        <Label>الموظف *</Label>
                        <Select value={advanceForm.employee_id} onValueChange={(v) => setAdvanceForm({...advanceForm, employee_id: v})}>
                          <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                          <SelectContent>
                            {employees.filter(e => e.is_active).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>المبلغ *</Label>
                        <Input type="number" value={advanceForm.amount} onChange={(e) => setAdvanceForm({...advanceForm, amount: e.target.value})} required />
                      </div>
                      <div>
                        <Label>عدد أشهر الاستقطاع</Label>
                        <Input type="number" min="1" value={advanceForm.deduction_months} onChange={(e) => setAdvanceForm({...advanceForm, deduction_months: e.target.value})} />
                      </div>
                      <div>
                        <Label>السبب</Label>
                        <Textarea value={advanceForm.reason} onChange={(e) => setAdvanceForm({...advanceForm, reason: e.target.value})} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setAdvanceDialogOpen(false)}>إلغاء</Button>
                        <Button type="submit">تسجيل</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">الموظف</th>
                        <th className="text-right p-3">المبلغ</th>
                        <th className="text-right p-3">المتبقي</th>
                        <th className="text-right p-3">الاستقطاع الشهري</th>
                        <th className="text-right p-3">التاريخ</th>
                        <th className="text-right p-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advances.map(adv => (
                        <tr key={adv.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{adv.employee_name}</td>
                          <td className="p-3">{formatPrice(adv.amount)}</td>
                          <td className="p-3 text-red-500">{formatPrice(adv.remaining_amount)}</td>
                          <td className="p-3">{formatPrice(adv.monthly_deduction)}</td>
                          <td className="p-3">{adv.date}</td>
                          <td className="p-3">
                            <Badge className={adv.status === 'paid' ? 'bg-green-500' : 'bg-yellow-500'}>
                              {adv.status === 'paid' ? 'مسددة' : 'قيد السداد'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Deductions Tab */}
          <TabsContent value="deductions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>الخصومات - {selectedMonth}</CardTitle>
                <Dialog open={deductionDialogOpen} onOpenChange={setDeductionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive"><Plus className="h-4 w-4 ml-2" /> خصم جديد</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>تسجيل خصم</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateDeduction} className="space-y-4">
                      <div>
                        <Label>الموظف *</Label>
                        <Select value={deductionForm.employee_id} onValueChange={(v) => setDeductionForm({...deductionForm, employee_id: v})}>
                          <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                          <SelectContent>
                            {employees.filter(e => e.is_active).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>نوع الخصم</Label>
                        <Select value={deductionForm.deduction_type} onValueChange={(v) => setDeductionForm({...deductionForm, deduction_type: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="absence">غياب</SelectItem>
                            <SelectItem value="late">تأخير</SelectItem>
                            <SelectItem value="early_leave">انصراف مبكر</SelectItem>
                            <SelectItem value="violation">مخالفة</SelectItem>
                            <SelectItem value="other">أخرى</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>مبلغ ثابت</Label>
                          <Input type="number" value={deductionForm.amount} onChange={(e) => setDeductionForm({...deductionForm, amount: e.target.value})} />
                        </div>
                        <div>
                          <Label>ساعات</Label>
                          <Input type="number" step="0.5" value={deductionForm.hours} onChange={(e) => setDeductionForm({...deductionForm, hours: e.target.value})} />
                        </div>
                        <div>
                          <Label>أيام</Label>
                          <Input type="number" step="0.5" value={deductionForm.days} onChange={(e) => setDeductionForm({...deductionForm, days: e.target.value})} />
                        </div>
                      </div>
                      <div>
                        <Label>التاريخ</Label>
                        <Input type="date" value={deductionForm.date} onChange={(e) => setDeductionForm({...deductionForm, date: e.target.value})} />
                      </div>
                      <div>
                        <Label>السبب *</Label>
                        <Textarea value={deductionForm.reason} onChange={(e) => setDeductionForm({...deductionForm, reason: e.target.value})} required />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setDeductionDialogOpen(false)}>إلغاء</Button>
                        <Button type="submit" variant="destructive">تسجيل الخصم</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">الموظف</th>
                        <th className="text-right p-3">النوع</th>
                        <th className="text-right p-3">المبلغ</th>
                        <th className="text-right p-3">السبب</th>
                        <th className="text-right p-3">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductions.map(ded => (
                        <tr key={ded.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{ded.employee_name}</td>
                          <td className="p-3">
                            <Badge variant="destructive">
                              {ded.deduction_type === 'absence' ? 'غياب' :
                               ded.deduction_type === 'late' ? 'تأخير' :
                               ded.deduction_type === 'early_leave' ? 'انصراف مبكر' :
                               ded.deduction_type === 'violation' ? 'مخالفة' : 'أخرى'}
                            </Badge>
                          </td>
                          <td className="p-3 text-red-500">{formatPrice(ded.amount)}</td>
                          <td className="p-3">{ded.reason}</td>
                          <td className="p-3">{ded.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bonuses Tab */}
          <TabsContent value="bonuses">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>المكافآت - {selectedMonth}</CardTitle>
                <Dialog open={bonusDialogOpen} onOpenChange={setBonusDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-green-600 hover:bg-green-700"><Plus className="h-4 w-4 ml-2" /> مكافأة جديدة</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>تسجيل مكافأة</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateBonus} className="space-y-4">
                      <div>
                        <Label>الموظف *</Label>
                        <Select value={bonusForm.employee_id} onValueChange={(v) => setBonusForm({...bonusForm, employee_id: v})}>
                          <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                          <SelectContent>
                            {employees.filter(e => e.is_active).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>نوع المكافأة</Label>
                        <Select value={bonusForm.bonus_type} onValueChange={(v) => setBonusForm({...bonusForm, bonus_type: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="performance">أداء</SelectItem>
                            <SelectItem value="overtime">وقت إضافي</SelectItem>
                            <SelectItem value="holiday">عمل في عطلة</SelectItem>
                            <SelectItem value="other">أخرى</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>مبلغ ثابت</Label>
                          <Input type="number" value={bonusForm.amount} onChange={(e) => setBonusForm({...bonusForm, amount: e.target.value})} />
                        </div>
                        <div>
                          <Label>ساعات إضافية</Label>
                          <Input type="number" step="0.5" value={bonusForm.hours} onChange={(e) => setBonusForm({...bonusForm, hours: e.target.value})} />
                        </div>
                      </div>
                      <div>
                        <Label>التاريخ</Label>
                        <Input type="date" value={bonusForm.date} onChange={(e) => setBonusForm({...bonusForm, date: e.target.value})} />
                      </div>
                      <div>
                        <Label>السبب *</Label>
                        <Textarea value={bonusForm.reason} onChange={(e) => setBonusForm({...bonusForm, reason: e.target.value})} required />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setBonusDialogOpen(false)}>إلغاء</Button>
                        <Button type="submit" className="bg-green-600 hover:bg-green-700">تسجيل المكافأة</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">الموظف</th>
                        <th className="text-right p-3">النوع</th>
                        <th className="text-right p-3">المبلغ</th>
                        <th className="text-right p-3">السبب</th>
                        <th className="text-right p-3">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonuses.map(bon => (
                        <tr key={bon.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{bon.employee_name}</td>
                          <td className="p-3">
                            <Badge className="bg-green-500">
                              {bon.bonus_type === 'performance' ? 'أداء' :
                               bon.bonus_type === 'overtime' ? 'وقت إضافي' :
                               bon.bonus_type === 'holiday' ? 'عطلة' : 'أخرى'}
                            </Badge>
                          </td>
                          <td className="p-3 text-green-500">{formatPrice(bon.amount)}</td>
                          <td className="p-3">{bon.reason}</td>
                          <td className="p-3">{bon.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payroll Tab */}
          <TabsContent value="payroll">
            <Card>
              <CardHeader>
                <CardTitle>كشوفات الرواتب - {selectedMonth}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">الموظف</th>
                        <th className="text-right p-3">الراتب الأساسي</th>
                        <th className="text-right p-3">الخصومات</th>
                        <th className="text-right p-3">المكافآت</th>
                        <th className="text-right p-3">استقطاع السلف</th>
                        <th className="text-right p-3">صافي الراتب</th>
                        <th className="text-right p-3">الحالة</th>
                        <th className="text-right p-3">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrolls.map(pay => (
                        <tr key={pay.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{pay.employee_name}</td>
                          <td className="p-3">{formatPrice(pay.basic_salary)}</td>
                          <td className="p-3 text-red-500">-{formatPrice(pay.total_deductions)}</td>
                          <td className="p-3 text-green-500">+{formatPrice(pay.total_bonuses)}</td>
                          <td className="p-3 text-yellow-500">-{formatPrice(pay.advance_deduction)}</td>
                          <td className="p-3 font-bold">{formatPrice(pay.net_salary)}</td>
                          <td className="p-3">{getPayrollStatusBadge(pay.status)}</td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              {pay.status !== 'paid' && (
                                <Button size="sm" onClick={() => payPayroll(pay.id)}>
                                  <Banknote className="h-4 w-4 ml-2" /> صرف
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => window.open(`/payroll/print/${pay.id}`, '_blank')}
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Biometric Devices Tab */}
          <TabsContent value="biometric">
            <Card>
              <CardContent className="p-6">
                <BiometricDevices branches={branches} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Payroll Preview Dialog */}
        <Dialog open={payrollDialogOpen} onOpenChange={setPayrollDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>معاينة كشف الراتب</DialogTitle>
            </DialogHeader>
            {payrollPreview && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="font-bold text-lg mb-2">{payrollPreview.employee_name}</h3>
                  <p className="text-muted-foreground">شهر: {payrollPreview.month}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card border rounded-lg p-4">
                    <p className="text-muted-foreground">الراتب الأساسي</p>
                    <p className="text-2xl font-bold">{formatPrice(payrollPreview.basic_salary)}</p>
                  </div>
                  <div className="bg-card border rounded-lg p-4">
                    <p className="text-muted-foreground">أيام العمل</p>
                    <p className="text-2xl font-bold">{payrollPreview.worked_days}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>الخصومات</span>
                    <span className="text-red-500">-{formatPrice(payrollPreview.total_deductions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>المكافآت</span>
                    <span className="text-green-500">+{formatPrice(payrollPreview.total_bonuses)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>استقطاع السلف</span>
                    <span className="text-yellow-500">-{formatPrice(payrollPreview.advance_deduction)}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between text-lg font-bold">
                    <span>صافي الراتب</span>
                    <span className="text-primary">{formatPrice(payrollPreview.net_salary)}</span>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setPayrollDialogOpen(false)}>إلغاء</Button>
                  <Button onClick={createPayroll}>إنشاء كشف الراتب</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
