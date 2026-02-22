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
import { useTranslation } from '../hooks/useTranslation';

const API = API_URL;

export default function HR() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { selectedBranchId, branches: contextBranches, getBranchIdForApi } = useBranch();
  const { t, isRTL } = useTranslation();
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [payrollSummary, setPayrollSummary] = useState(null);
  const [employeeRatings, setEmployeeRatings] = useState({ ratings: [], summary: {} });
  const [ratingsLoading, setRatingsLoading] = useState(false);
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
      toast.error(t('فشل في تحميل البيانات'));
    } finally {
      setLoading(false);
    }
  };

  // جلب تقييمات الموظفين
  const fetchEmployeeRatings = async () => {
    setRatingsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const branchId = getBranchIdForApi();
      const res = await axios.get(
        `${API}/employee-ratings?month=${selectedMonth}${branchId ? `&branch_id=${branchId}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEmployeeRatings(res.data);
    } catch (error) {
      console.error('Error fetching ratings:', error);
      toast.error(t('فشل في تحميل التقييمات'));
    } finally {
      setRatingsLoading(false);
    }
  };

  // جلب التقييمات عند فتح تبويب التقييمات
  useEffect(() => {
    if (activeTab === 'ratings') {
      fetchEmployeeRatings();
    }
  }, [activeTab, selectedMonth, selectedBranchId]);

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
      toast.success(t('تم إضافة الموظف'));
      setEmployeeDialogOpen(false);
      resetEmployeeForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة الموظف'));
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
      toast.success(t('تم تحديث الموظف'));
      setEditingEmployee(null);
      setEmployeeDialogOpen(false);
      resetEmployeeForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحديث الموظف'));
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (!window.confirm(t('هل أنت متأكد من حذف هذا الموظف؟'))) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/employees/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t('تم تعطيل الموظف'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في حذف الموظف'));
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
      toast.success(t('تم تسجيل الحضور'));
      setAttendanceDialogOpen(false);
      setAttendanceForm({ employee_id: '', date: new Date().toISOString().slice(0, 10), check_in: '', check_out: '', status: 'present', notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تسجيل الحضور'));
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
      toast.success(t('تم تسجيل السلفة'));
      setAdvanceDialogOpen(false);
      setAdvanceForm({ employee_id: '', amount: '', reason: '', deduction_months: 1 });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تسجيل السلفة'));
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
      toast.success(t('تم تسجيل الخصم'));
      setDeductionDialogOpen(false);
      setDeductionForm({ employee_id: '', deduction_type: 'absence', amount: '', hours: '', days: '', reason: '', date: new Date().toISOString().slice(0, 10) });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تسجيل الخصم'));
    }
  };

  // طباعة إيصال الخصم
  const printDeductionReceipt = (deduction) => {
    const employee = employees.find(e => e.id === deduction.employee_id);
    const deductionTypeLabels = {
      'absence': 'غياب',
      'late': 'تأخير',
      'early_leave': 'انصراف مبكر',
      'violation': 'مخالفة',
      'other': 'أخرى'
    };
    
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>إيصال خصم</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif; 
            padding: 20px;
            max-width: 350px;
            margin: 0 auto;
            direction: rtl;
          }
          .header { 
            text-align: center; 
            border-bottom: 2px dashed #333; 
            padding-bottom: 15px; 
            margin-bottom: 15px; 
          }
          .logo { font-size: 24px; font-weight: bold; color: #D4AF37; }
          .title { font-size: 16px; margin-top: 8px; color: #dc2626; }
          .receipt-no { font-size: 12px; color: #666; margin-top: 5px; }
          .section { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 8px; }
          .row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
          .label { color: #666; }
          .value { font-weight: bold; }
          .amount { 
            font-size: 24px; 
            text-align: center; 
            color: #dc2626; 
            padding: 15px; 
            margin: 15px 0;
            border: 2px solid #dc2626;
            border-radius: 8px;
          }
          .reason { 
            padding: 10px; 
            background: #fee2e2; 
            border-radius: 8px; 
            font-size: 13px; 
            margin: 10px 0; 
          }
          .signature { 
            margin-top: 30px; 
            padding-top: 15px; 
            border-top: 1px solid #ccc; 
          }
          .sig-line { 
            margin-top: 40px; 
            border-bottom: 1px solid #333; 
            width: 60%; 
          }
          .sig-label { font-size: 12px; color: #666; margin-top: 5px; }
          .footer { 
            text-align: center; 
            margin-top: 20px; 
            font-size: 11px; 
            color: #999; 
            border-top: 2px dashed #333;
            padding-top: 15px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Maestro EGP</div>
          <div class="title">🔴 إيصال خصم</div>
          <div class="receipt-no">رقم: ${deduction.id?.slice(0, 8) || 'N/A'}</div>
        </div>
        
        <div class="section">
          <div class="row">
            <span class="label">{t('اسم الموظف:')}</span>
            <span class="value">{t('${deduction.employee_name || employee?.name || 'غير محدد'}')}</span>
          </div>
          <div class="row">
            <span class="label">{t('التاريخ:')}</span>
            <span class="value">${deduction.date || new Date().toLocaleDateString('en-US')}</span>
          </div>
          <div class="row">
            <span class="label">{t('نوع الخصم:')}</span>
            <span class="value">${deductionTypeLabels[deduction.deduction_type] || deduction.deduction_type}</span>
          </div>
        </div>
        
        <div class="amount">
          مبلغ الخصم: ${formatPrice(deduction.amount)}
        </div>
        
        <div class="reason">
          <strong>السبب:</strong><br/>
          ${deduction.reason || 'غير محدد'}
        </div>
        
        ${deduction.hours ? `<div class="row"><span class="label">{t('عدد الساعات:')}</span><span class="value">{t('${deduction.hours} ساعة')}</span></div>` : ''}
        ${deduction.days ? `<div class="row"><span class="label">{t('عدد الأيام:')}</span><span class="value">{t('${deduction.days} يوم')}</span></div>` : ''}
        
        <div class="signature">
          <div>توقيع الموظف (علمت بالخصم):</div>
          <div class="sig-line"></div>
          <div class="sig-label">التاريخ: _______________</div>
        </div>
        
        <div class="signature">
          <div>توقيع المسؤول:</div>
          <div class="sig-line"></div>
          <div class="sig-label">الاسم: ${user?.full_name || '_______________'}</div>
        </div>
        
        <div class="footer">
          <p>{t('تم إنشاء هذا الإيصال من نظام Maestro EGP')}</p>
          <p>${new Date().toLocaleString('en-US')}</p>
        </div>
        
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
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
      toast.success(t('تم تسجيل المكافأة'));
      setBonusDialogOpen(false);
      setBonusForm({ employee_id: '', bonus_type: 'performance', amount: '', hours: '', reason: '', date: new Date().toISOString().slice(0, 10) });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تسجيل المكافأة'));
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
      toast.error(error.response?.data?.detail || t('فشل في حساب الراتب'));
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
      toast.success(t('تم إنشاء كشف الراتب'));
      setPayrollDialogOpen(false);
      setPayrollPreview(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إنشاء كشف الراتب'));
    }
  };

  const payPayroll = async (payrollId) => {
    if (!window.confirm(t('هل أنت متأكد من صرف هذا الراتب؟'))) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/payroll/${payrollId}/pay`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t('تم صرف الراتب'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في صرف الراتب'));
    }
  };

  // تصدير تقرير الرواتب الشامل
  const exportPayrollReport = async (format = 'excel') => {
    try {
      toast.loading(t('جاري تحضير الملف...'));
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
      toast.success(t('تم تحميل الملف بنجاح'));
    } catch (error) {
      toast.dismiss();
      toast.error(t('فشل في تصدير الملف'));
    }
  };

  // تصدير مفردات مرتب موظف
  const exportEmployeeSalarySlip = async (employeeId, employeeName, format = 'excel') => {
    try {
      toast.loading(t('جاري تحضير الملف...'));
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
      toast.success(t('تم تحميل مفردات المرتب بنجاح'));
    } catch (error) {
      toast.dismiss();
      toast.error(t('فشل في تصدير مفردات المرتب'));
    }
  };

  // تصدير تقرير الرواتب PDF
  const exportPayrollPDF = async () => {
    try {
      toast.loading(t('جاري تحضير ملف PDF...'));
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
      toast.success(t('تم تحميل ملف PDF بنجاح'));
    } catch (error) {
      toast.dismiss();
      toast.error(t('فشل في تصدير الملف'));
    }
  };

  // تصدير مفردات مرتب PDF
  const exportEmployeeSalarySlipPDF = async (employeeId, employeeName) => {
    try {
      toast.loading(t('جاري تحضير ملف PDF...'));
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
      toast.success(t('تم تحميل مفردات المرتب PDF بنجاح'));
    } catch (error) {
      toast.dismiss();
      toast.error(t('فشل في تصدير مفردات المرتب'));
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
          <p className="text-muted-foreground">{t('جاري التحميل...')}</p>
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
                  <h1 className="text-2xl font-bold text-foreground">{t('إدارة الموارد البشرية')}</h1>
                  <p className="text-sm text-muted-foreground">{t('إدارة الموظفين والرواتب والحضور')}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Input
                type="month"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-40"
              />
              <BranchSelector />
              
              {/* زر طباعة التقرير */}
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="h-10"
                title={t('طباعة تقرير الرواتب')}
              >
                <Printer className="h-5 w-5 ml-2" />
                {t('طباعة')}
              </Button>
              
              {/* زر الصفحة الرئيسية */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/')}
                className="h-10 w-10"
                title={t('الصفحة الرئيسية')}
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
              <p className="text-sm text-muted-foreground">{t('موظف نشط')}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-4 text-center">
              <Banknote className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-green-500">{formatPrice(stats.totalSalaries)}</p>
              <p className="text-sm text-muted-foreground">{t('إجمالي الرواتب')}</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-4 text-center">
              <CreditCard className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-yellow-500">{formatPrice(stats.pendingAdvances)}</p>
              <p className="text-sm text-muted-foreground">{t('سلف معلقة')}</p>
            </CardContent>
          </Card>
          <Card className="bg-red-500/10 border-red-500/20">
            <CardContent className="p-4 text-center">
              <TrendingDown className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-red-500">{formatPrice(stats.monthlyDeductions)}</p>
              <p className="text-sm text-muted-foreground">{t('خصومات الشهر')}</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-500/10 border-purple-500/20">
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-8 w-8 text-purple-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-purple-500">{formatPrice(stats.monthlyBonuses)}</p>
              <p className="text-sm text-muted-foreground">{t('مكافآت الشهر')}</p>
            </CardContent>
          </Card>
          <Card className="bg-cyan-500/10 border-cyan-500/20">
            <CardContent className="p-4 text-center">
              <DollarSign className="h-8 w-8 text-cyan-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-cyan-500">{formatPrice(stats.netPayable)}</p>
              <p className="text-sm text-muted-foreground">{t('المستحقات')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="employees" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> {t('الموظفين')}
            </TabsTrigger>
            <TabsTrigger value="salary-report" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> {t('تقرير الرواتب')}
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> {t('الحضور')}
            </TabsTrigger>
            <TabsTrigger value="advances" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> {t('السلف')}
            </TabsTrigger>
            <TabsTrigger value="deductions" className="flex items-center gap-2">
              <Minus className="h-4 w-4" /> {t('الخصومات')}
            </TabsTrigger>
            <TabsTrigger value="bonuses" className="flex items-center gap-2">
              <Gift className="h-4 w-4" /> {t('المكافآت')}
            </TabsTrigger>
            <TabsTrigger value="payroll" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> {t('كشوفات الرواتب')}
            </TabsTrigger>
            <TabsTrigger value="ratings" className="flex items-center gap-2">
              <Award className="h-4 w-4" /> {t('تقييم الموظفين')}
            </TabsTrigger>
            <TabsTrigger value="biometric" className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4" /> {t('أجهزة البصمة')}
            </TabsTrigger>
          </TabsList>

          {/* Employees Tab */}
          <TabsContent value="employees">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t('قائمة الموظفين')}</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t('بحث...')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-9 w-60"
                    />
                  </div>
                  <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => { setEditingEmployee(null); resetEmployeeForm(); }}>
                        <UserPlus className="h-4 w-4 ml-2" /> {t('إضافة موظف')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{editingEmployee ? t('تعديل موظف') : t('إضافة موظف جديد')}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={editingEmployee ? handleUpdateEmployee : handleCreateEmployee} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>{t('الاسم الكامل')} *</Label>
                            <Input value={employeeForm.name} onChange={(e) => setEmployeeForm({...employeeForm, name: e.target.value})} required />
                          </div>
                          <div>
                            <Label>{t('رقم الهاتف')} *</Label>
                            <Input value={employeeForm.phone} onChange={(e) => setEmployeeForm({...employeeForm, phone: e.target.value})} required />
                          </div>
                          <div>
                            <Label>{t('البريد الإلكتروني')}</Label>
                            <Input type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm({...employeeForm, email: e.target.value})} />
                          </div>
                          <div>
                            <Label>{t('رقم الهوية')}</Label>
                            <Input value={employeeForm.national_id} onChange={(e) => setEmployeeForm({...employeeForm, national_id: e.target.value})} />
                          </div>
                          <div>
                            <Label>{t('المسمى الوظيفي')} *</Label>
                            <Input value={employeeForm.position} onChange={(e) => setEmployeeForm({...employeeForm, position: e.target.value})} required />
                          </div>
                          <div>
                            <Label>{t('القسم')}</Label>
                            <Input value={employeeForm.department} onChange={(e) => setEmployeeForm({...employeeForm, department: e.target.value})} />
                          </div>
                          <div>
                            <Label>{t('الفرع')} *</Label>
                            <Select value={employeeForm.branch_id} onValueChange={(v) => setEmployeeForm({...employeeForm, branch_id: v})}>
                              <SelectTrigger><SelectValue placeholder={t('اختر الفرع')} /></SelectTrigger>
                              <SelectContent>
                                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>{t('تاريخ التعيين')} *</Label>
                            <Input type="date" value={employeeForm.hire_date} onChange={(e) => setEmployeeForm({...employeeForm, hire_date: e.target.value})} required />
                          </div>
                          <div>
                            <Label>{t('الراتب الأساسي')} *</Label>
                            <Input type="number" value={employeeForm.salary} onChange={(e) => setEmployeeForm({...employeeForm, salary: e.target.value})} required />
                          </div>
                          <div>
                            <Label>{t('نوع الراتب')}</Label>
                            <Select value={employeeForm.salary_type} onValueChange={(v) => setEmployeeForm({...employeeForm, salary_type: v})}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="monthly">{t('شهري')}</SelectItem>
                                <SelectItem value="daily">{t('يومي')}</SelectItem>
                                <SelectItem value="hourly">{t('بالساعة')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>{t('ساعات العمل اليومية')}</Label>
                            <Input type="number" value={employeeForm.work_hours_per_day} onChange={(e) => setEmployeeForm({...employeeForm, work_hours_per_day: e.target.value})} />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={() => setEmployeeDialogOpen(false)}>{t('إلغاء')}</Button>
                          <Button type="submit">{editingEmployee ? t('تحديث') : t('إضافة')}</Button>
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
                        <th className="text-right p-3">{t('الاسم')}</th>
                        <th className="text-right p-3">{t('الهاتف')}</th>
                        <th className="text-right p-3">{t('المسمى')}</th>
                        <th className="text-right p-3">{t('الفرع')}</th>
                        <th className="text-right p-3">{t('الراتب')}</th>
                        <th className="text-right p-3">{t('الحالة')}</th>
                        <th className="text-right p-3">{t('الإجراءات')}</th>
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
                              {emp.is_active ? t('نشط') : t('معطل')}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => window.open(`/payroll/print/${emp.id}`, '_blank')} title={t('طباعة مفردات المرتب')}>
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => calculatePayroll(emp.id)} title={t('إنشاء كشف راتب')}>
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
                              }} title={t('تعديل')}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteEmployee(emp.id)} title={t('حذف')}>
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
                  {t('تقرير الرواتب الشامل')} - {selectedMonth}
                </CardTitle>
                <div className="flex gap-2">
                  <Button onClick={() => window.print()}>
                    <Printer className="h-4 w-4 ml-2" /> {t('طباعة')}
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
                          <p className="text-sm text-muted-foreground">{t('الرواتب الأساسية')}</p>
                          <p className="text-xl font-bold text-blue-500">{formatPrice(payrollSummary.totals?.basic_salary || 0)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-green-500/10">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">{t('المكافآت')}</p>
                          <p className="text-xl font-bold text-green-500">{formatPrice(payrollSummary.totals?.total_bonuses || 0)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-red-500/10">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">{t('الخصومات')}</p>
                          <p className="text-xl font-bold text-red-500">{formatPrice(payrollSummary.totals?.total_deductions || 0)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-yellow-500/10">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">{t('السلف')}</p>
                          <p className="text-xl font-bold text-yellow-500">{formatPrice(payrollSummary.totals?.total_advances || 0)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-cyan-500/10">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">{t('صافي المستحقات')}</p>
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
                            <th className="p-3 text-right">{t('الموظف')}</th>
                            <th className="p-3 text-right">{t('الفرع')}</th>
                            <th className="p-3 text-right">{t('الوظيفة')}</th>
                            <th className="p-3 text-right">{t('الراتب الأساسي')}</th>
                            <th className="p-3 text-right">{t('المكافآت')}</th>
                            <th className="p-3 text-right">{t('الخصومات')}</th>
                            <th className="p-3 text-right">{t('السلف')}</th>
                            <th className="p-3 text-right">{t('صافي الراتب')}</th>
                            <th className="p-3 text-right">{t('الإجراءات')}</th>
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
                                    onClick={() => window.print()}
                                    title={t('طباعة')}
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-muted/50 font-bold">
                          <tr>
                            <td colSpan="4" className="p-3">{t('الإجمالي')}</td>
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
                    <p>{t('لا توجد بيانات رواتب لهذا الشهر')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Attendance Tab */}
          <TabsContent value="attendance">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t('سجل الحضور')} - {selectedMonth}</CardTitle>
                <Dialog open={attendanceDialogOpen} onOpenChange={setAttendanceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 ml-2" /> {t('تسجيل حضور')}</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('تسجيل حضور/انصراف')}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateAttendance} className="space-y-4">
                      <div>
                        <Label>{t('الموظف')} *</Label>
                        <Select value={attendanceForm.employee_id} onValueChange={(v) => setAttendanceForm({...attendanceForm, employee_id: v})}>
                          <SelectTrigger><SelectValue placeholder={t('اختر الموظف')} /></SelectTrigger>
                          <SelectContent>
                            {employees.filter(e => e.is_active).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t('التاريخ')} *</Label>
                        <Input type="date" value={attendanceForm.date} onChange={(e) => setAttendanceForm({...attendanceForm, date: e.target.value})} required />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>{t('وقت الحضور')}</Label>
                          <Input type="time" value={attendanceForm.check_in} onChange={(e) => setAttendanceForm({...attendanceForm, check_in: e.target.value})} />
                        </div>
                        <div>
                          <Label>{t('وقت الانصراف')}</Label>
                          <Input type="time" value={attendanceForm.check_out} onChange={(e) => setAttendanceForm({...attendanceForm, check_out: e.target.value})} />
                        </div>
                      </div>
                      <div>
                        <Label>{t('الحالة')}</Label>
                        <Select value={attendanceForm.status} onValueChange={(v) => setAttendanceForm({...attendanceForm, status: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">{t('حاضر')}</SelectItem>
                            <SelectItem value="absent">{t('غائب')}</SelectItem>
                            <SelectItem value="late">{t('متأخر')}</SelectItem>
                            <SelectItem value="early_leave">{t('انصراف مبكر')}</SelectItem>
                            <SelectItem value="holiday">{t('إجازة')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t('ملاحظات')}</Label>
                        <Textarea value={attendanceForm.notes} onChange={(e) => setAttendanceForm({...attendanceForm, notes: e.target.value})} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setAttendanceDialogOpen(false)}>{t('إلغاء')}</Button>
                        <Button type="submit">{t('تسجيل')}</Button>
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
                        <th className="text-right p-3">{t('الموظف')}</th>
                        <th className="text-right p-3">{t('التاريخ')}</th>
                        <th className="text-right p-3">{t('الحضور')}</th>
                        <th className="text-right p-3">{t('الانصراف')}</th>
                        <th className="text-right p-3">{t('الساعات')}</th>
                        <th className="text-right p-3">{t('الحالة')}</th>
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
                <CardTitle>{t('السلف')}</CardTitle>
                <Dialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 ml-2" /> {t('سلفة جديدة')}</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('تسجيل سلفة')}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateAdvance} className="space-y-4">
                      <div>
                        <Label>{t('الموظف *')}</Label>
                        <Select value={advanceForm.employee_id} onValueChange={(v) => setAdvanceForm({...advanceForm, employee_id: v})}>
                          <SelectTrigger><SelectValue placeholder={t('اختر الموظف')} /></SelectTrigger>
                          <SelectContent>
                            {employees.filter(e => e.is_active).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t('المبلغ *')}</Label>
                        <Input type="number" value={advanceForm.amount} onChange={(e) => setAdvanceForm({...advanceForm, amount: e.target.value})} required />
                      </div>
                      <div>
                        <Label>{t('عدد أشهر الاستقطاع')}</Label>
                        <Input type="number" min="1" value={advanceForm.deduction_months} onChange={(e) => setAdvanceForm({...advanceForm, deduction_months: e.target.value})} />
                      </div>
                      <div>
                        <Label>{t('السبب')}</Label>
                        <Textarea value={advanceForm.reason} onChange={(e) => setAdvanceForm({...advanceForm, reason: e.target.value})} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setAdvanceDialogOpen(false)}>{t('إلغاء')}</Button>
                        <Button type="submit">{t('تسجيل')}</Button>
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
                        <th className="text-right p-3">{t('الموظف')}</th>
                        <th className="text-right p-3">{t('المبلغ')}</th>
                        <th className="text-right p-3">{t('المتبقي')}</th>
                        <th className="text-right p-3">{t('الاستقطاع الشهري')}</th>
                        <th className="text-right p-3">{t('التاريخ')}</th>
                        <th className="text-right p-3">{t('الحالة')}</th>
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
                <CardTitle>{t('الخصومات')} - {selectedMonth}</CardTitle>
                <Dialog open={deductionDialogOpen} onOpenChange={setDeductionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive"><Plus className="h-4 w-4 ml-2" /> {t('خصم جديد')}</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('تسجيل خصم')}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateDeduction} className="space-y-4">
                      <div>
                        <Label>{t('الموظف *')}</Label>
                        <Select value={deductionForm.employee_id} onValueChange={(v) => setDeductionForm({...deductionForm, employee_id: v})}>
                          <SelectTrigger><SelectValue placeholder={t('اختر الموظف')} /></SelectTrigger>
                          <SelectContent>
                            {employees.filter(e => e.is_active).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t('نوع الخصم')}</Label>
                        <Select value={deductionForm.deduction_type} onValueChange={(v) => setDeductionForm({...deductionForm, deduction_type: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="absence">{t('غياب')}</SelectItem>
                            <SelectItem value="late">{t('تأخير')}</SelectItem>
                            <SelectItem value="early_leave">{t('انصراف مبكر')}</SelectItem>
                            <SelectItem value="violation">{t('مخالفة')}</SelectItem>
                            <SelectItem value="other">{t('أخرى')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>{t('مبلغ ثابت')}</Label>
                          <Input type="number" value={deductionForm.amount} onChange={(e) => setDeductionForm({...deductionForm, amount: e.target.value})} />
                        </div>
                        <div>
                          <Label>{t('ساعات')}</Label>
                          <Input type="number" step="0.5" value={deductionForm.hours} onChange={(e) => setDeductionForm({...deductionForm, hours: e.target.value})} />
                        </div>
                        <div>
                          <Label>{t('أيام')}</Label>
                          <Input type="number" step="0.5" value={deductionForm.days} onChange={(e) => setDeductionForm({...deductionForm, days: e.target.value})} />
                        </div>
                      </div>
                      <div>
                        <Label>{t('التاريخ')}</Label>
                        <Input type="date" value={deductionForm.date} onChange={(e) => setDeductionForm({...deductionForm, date: e.target.value})} />
                      </div>
                      <div>
                        <Label>{t('السبب *')}</Label>
                        <Textarea value={deductionForm.reason} onChange={(e) => setDeductionForm({...deductionForm, reason: e.target.value})} required />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setDeductionDialogOpen(false)}>{t('إلغاء')}</Button>
                        <Button type="submit" variant="destructive">{t('تسجيل الخصم')}</Button>
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
                        <th className="text-right p-3">{t('الموظف')}</th>
                        <th className="text-right p-3">{t('النوع')}</th>
                        <th className="text-right p-3">{t('المبلغ')}</th>
                        <th className="text-right p-3">{t('السبب')}</th>
                        <th className="text-right p-3">{t('التاريخ')}</th>
                        <th className="text-right p-3">{t('إجراءات')}</th>
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
                          <td className="p-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => printDeductionReceipt(ded)}
                              className="gap-1"
                              data-testid={`print-deduction-${ded.id}`}
                            >
                              <Printer className="h-4 w-4" />
                              طباعة
                            </Button>
                          </td>
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
                <CardTitle>{t('المكافآت')} - {selectedMonth}</CardTitle>
                <Dialog open={bonusDialogOpen} onOpenChange={setBonusDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-green-600 hover:bg-green-700"><Plus className="h-4 w-4 ml-2" /> {t('مكافأة جديدة')}</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('تسجيل مكافأة')}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateBonus} className="space-y-4">
                      <div>
                        <Label>{t('الموظف *')}</Label>
                        <Select value={bonusForm.employee_id} onValueChange={(v) => setBonusForm({...bonusForm, employee_id: v})}>
                          <SelectTrigger><SelectValue placeholder={t('اختر الموظف')} /></SelectTrigger>
                          <SelectContent>
                            {employees.filter(e => e.is_active).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t('نوع المكافأة')}</Label>
                        <Select value={bonusForm.bonus_type} onValueChange={(v) => setBonusForm({...bonusForm, bonus_type: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="performance">{t('أداء')}</SelectItem>
                            <SelectItem value="overtime">{t('وقت إضافي')}</SelectItem>
                            <SelectItem value="holiday">{t('عمل في عطلة')}</SelectItem>
                            <SelectItem value="other">{t('أخرى')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>{t('مبلغ ثابت')}</Label>
                          <Input type="number" value={bonusForm.amount} onChange={(e) => setBonusForm({...bonusForm, amount: e.target.value})} />
                        </div>
                        <div>
                          <Label>{t('ساعات إضافية')}</Label>
                          <Input type="number" step="0.5" value={bonusForm.hours} onChange={(e) => setBonusForm({...bonusForm, hours: e.target.value})} />
                        </div>
                      </div>
                      <div>
                        <Label>{t('التاريخ')}</Label>
                        <Input type="date" value={bonusForm.date} onChange={(e) => setBonusForm({...bonusForm, date: e.target.value})} />
                      </div>
                      <div>
                        <Label>{t('السبب *')}</Label>
                        <Textarea value={bonusForm.reason} onChange={(e) => setBonusForm({...bonusForm, reason: e.target.value})} required />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setBonusDialogOpen(false)}>{t('إلغاء')}</Button>
                        <Button type="submit" className="bg-green-600 hover:bg-green-700">{t('تسجيل المكافأة')}</Button>
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
                        <th className="text-right p-3">{t('الموظف')}</th>
                        <th className="text-right p-3">{t('النوع')}</th>
                        <th className="text-right p-3">{t('المبلغ')}</th>
                        <th className="text-right p-3">{t('السبب')}</th>
                        <th className="text-right p-3">{t('التاريخ')}</th>
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
                <CardTitle>{t('كشوفات الرواتب')} - {selectedMonth}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3">{t('الموظف')}</th>
                        <th className="text-right p-3">{t('الراتب الأساسي')}</th>
                        <th className="text-right p-3">{t('الخصومات')}</th>
                        <th className="text-right p-3">{t('المكافآت')}</th>
                        <th className="text-right p-3">{t('استقطاع السلف')}</th>
                        <th className="text-right p-3">{t('صافي الراتب')}</th>
                        <th className="text-right p-3">{t('الحالة')}</th>
                        <th className="text-right p-3">{t('الإجراءات')}</th>
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
                                  <Banknote className="h-4 w-4 ml-2" /> {t('صرف')}
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

          {/* Employee Ratings Tab - تقييم الموظفين */}
          <TabsContent value="ratings">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-amber-500" />
                    {t('تقييم الموظفين التلقائي')}
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <Input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-40"
                    />
                    <Button onClick={fetchEmployeeRatings} variant="outline" size="sm">
                      <BarChart3 className="h-4 w-4 ml-1" />
                      {t('تحديث')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {ratingsLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <>
                    {/* ملخص التقييمات */}
                    {employeeRatings.summary && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                          <CardContent className="p-4 text-center">
                            <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                            <p className="text-2xl font-bold text-blue-700">{employeeRatings.summary.total_employees || 0}</p>
                            <p className="text-xs text-blue-600">{t('إجمالي الموظفين')}</p>
                          </CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                          <CardContent className="p-4 text-center">
                            <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-600" />
                            <p className="text-2xl font-bold text-green-700">{employeeRatings.summary.excellent_count || 0}</p>
                            <p className="text-xs text-green-600">{t('ممتاز (90+)')}</p>
                          </CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-sky-50 to-sky-100 border-sky-200">
                          <CardContent className="p-4 text-center">
                            <TrendingUp className="h-6 w-6 mx-auto mb-2 text-sky-600" />
                            <p className="text-2xl font-bold text-sky-700">{employeeRatings.summary.good_count || 0}</p>
                            <p className="text-xs text-sky-600">{t('جيد جداً (75-89)')}</p>
                          </CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                          <CardContent className="p-4 text-center">
                            <Timer className="h-6 w-6 mx-auto mb-2 text-amber-600" />
                            <p className="text-2xl font-bold text-amber-700">{employeeRatings.summary.average_count || 0}</p>
                            <p className="text-xs text-amber-600">{t('جيد/مقبول (50-74)')}</p>
                          </CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
                          <CardContent className="p-4 text-center">
                            <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-600" />
                            <p className="text-2xl font-bold text-red-700">{employeeRatings.summary.poor_count || 0}</p>
                            <p className="text-xs text-red-600">{t('ضعيف (<50)')}</p>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {/* معدل التقييم */}
                    {employeeRatings.summary?.average_score > 0 && (
                      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg p-4 mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Award className="h-8 w-8" />
                          <div>
                            <p className="text-sm opacity-90">{t('متوسط التقييم العام')}</p>
                            <p className="text-2xl font-bold">{employeeRatings.summary.average_score}/100</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-sm opacity-90">{t('شهر')}</p>
                          <p className="font-bold">{selectedMonth}</p>
                        </div>
                      </div>
                    )}

                    {/* جدول التقييمات */}
                    {employeeRatings.ratings?.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="p-3 text-right border">#</th>
                              <th className="p-3 text-right border">{t('الموظف')}</th>
                              <th className="p-3 text-right border">{t('الوظيفة')}</th>
                              <th className="p-3 text-center border">{t('الحضور')}</th>
                              <th className="p-3 text-center border">{t('التأخير')}</th>
                              <th className="p-3 text-center border">{t('الخصومات')}</th>
                              <th className="p-3 text-center border">{t('المكافآت')}</th>
                              <th className="p-3 text-center border">{t('التقييم')}</th>
                              <th className="p-3 text-center border">{t('المستوى')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {employeeRatings.ratings.map((rating, idx) => (
                              <tr key={rating.employee_id} className="hover:bg-muted/30">
                                <td className="p-3 border text-center font-bold">{idx + 1}</td>
                                <td className="p-3 border">
                                  <div className="font-medium">{rating.employee_name}</div>
                                </td>
                                <td className="p-3 border text-muted-foreground">{rating.position || '-'}</td>
                                <td className="p-3 border text-center">
                                  <div className="flex flex-col items-center">
                                    <span className="font-bold">{rating.attendance_days}/{rating.work_days_expected}</span>
                                    <span className="text-xs text-muted-foreground">({rating.attendance_percentage}%)</span>
                                  </div>
                                </td>
                                <td className="p-3 border text-center">
                                  <div className="flex flex-col items-center">
                                    {rating.late_count > 0 ? (
                                      <Badge variant="destructive" className="text-xs">{rating.late_count} {t('تأخير')}</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs text-green-600">{t('منتظم')}</Badge>
                                    )}
                                    {rating.early_leave_count > 0 && (
                                      <Badge variant="secondary" className="text-xs mt-1">{rating.early_leave_count} {t('خروج مبكر')}</Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 border text-center">
                                  {rating.deduction_count > 0 ? (
                                    <div className="flex flex-col items-center">
                                      <Badge variant="destructive">{rating.deduction_count}</Badge>
                                      <span className="text-xs text-red-500">{formatPrice(rating.total_deductions)}</span>
                                    </div>
                                  ) : (
                                    <Badge variant="outline" className="text-green-600">لا يوجد</Badge>
                                  )}
                                </td>
                                <td className="p-3 border text-center">
                                  {rating.bonus_count > 0 ? (
                                    <div className="flex flex-col items-center">
                                      <Badge className="bg-green-500">{rating.bonus_count}</Badge>
                                      <span className="text-xs text-green-600">{formatPrice(rating.total_bonuses)}</span>
                                    </div>
                                  ) : (
                                    <Badge variant="outline">-</Badge>
                                  )}
                                </td>
                                <td className="p-3 border text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-2xl font-bold" style={{
                                      color: rating.level_color === 'green' ? '#16a34a' :
                                             rating.level_color === 'blue' ? '#2563eb' :
                                             rating.level_color === 'yellow' ? '#ca8a04' :
                                             rating.level_color === 'orange' ? '#ea580c' : '#dc2626'
                                    }}>
                                      {rating.total_score}
                                    </span>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                                      <div 
                                        className="h-1.5 rounded-full transition-all"
                                        style={{
                                          width: `${rating.total_score}%`,
                                          backgroundColor: rating.level_color === 'green' ? '#16a34a' :
                                                           rating.level_color === 'blue' ? '#2563eb' :
                                                           rating.level_color === 'yellow' ? '#ca8a04' :
                                                           rating.level_color === 'orange' ? '#ea580c' : '#dc2626'
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3 border text-center">
                                  <Badge 
                                    className="text-white"
                                    style={{
                                      backgroundColor: rating.level_color === 'green' ? '#16a34a' :
                                                       rating.level_color === 'blue' ? '#2563eb' :
                                                       rating.level_color === 'yellow' ? '#ca8a04' :
                                                       rating.level_color === 'orange' ? '#ea580c' : '#dc2626'
                                    }}
                                  >
                                    {rating.level}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{t('لا توجد بيانات تقييم لهذا الشهر')}</p>
                        <p className="text-sm mt-2">{t('تأكد من وجود سجلات حضور للموظفين')}</p>
                      </div>
                    )}

                    {/* شرح معايير التقييم */}
                    <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                      <h4 className="font-bold mb-3 flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        {t('معايير التقييم التلقائي')}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                          <span>{t('الحضور: 40 نقطة')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                          <span>{t('الالتزام بالمواعيد: 30 نقطة')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                          <span>{t('عدم وجود خصومات: 20 نقطة')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500"></div>
                          <span>{t('المكافآت: 10 نقاط إضافية')}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Payroll Preview Dialog */}
        <Dialog open={payrollDialogOpen} onOpenChange={setPayrollDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('معاينة كشف الراتب')}</DialogTitle>
            </DialogHeader>
            {payrollPreview && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="font-bold text-lg mb-2">{payrollPreview.employee_name}</h3>
                  <p className="text-muted-foreground">{t('شهر: {payrollPreview.month}')}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card border rounded-lg p-4">
                    <p className="text-muted-foreground">{t('الراتب الأساسي')}</p>
                    <p className="text-2xl font-bold">{formatPrice(payrollPreview.basic_salary)}</p>
                  </div>
                  <div className="bg-card border rounded-lg p-4">
                    <p className="text-muted-foreground">{t('أيام العمل')}</p>
                    <p className="text-2xl font-bold">{payrollPreview.worked_days}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>{t('الخصومات')}</span>
                    <span className="text-red-500">-{formatPrice(payrollPreview.total_deductions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('المكافآت')}</span>
                    <span className="text-green-500">+{formatPrice(payrollPreview.total_bonuses)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('استقطاع السلف')}</span>
                    <span className="text-yellow-500">-{formatPrice(payrollPreview.advance_deduction)}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between text-lg font-bold">
                    <span>{t('صافي الراتب')}</span>
                    <span className="text-primary">{formatPrice(payrollPreview.net_salary)}</span>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setPayrollDialogOpen(false)}>{t('إلغاء')}</Button>
                  <Button onClick={createPayroll}>{t('إنشاء كشف الراتب')}</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
