import React, { useState, useEffect, useRef } from 'react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useOffline } from '../context/OfflineContext';
import offlineStorage from '../lib/offlineStorage';
import db, { STORES } from '../lib/offlineDB';
import { formatPrice } from '../utils/currency';

// تحويل الأسماء العربية للإنجليزية (للبصمة)
const arabicToEnglish = (name) => {
  if (!name) return '';
  const hasArabic = /[\u0600-\u06FF]/.test(name);
  if (!hasArabic) return name;
  const map = {
    'ا':'a','أ':'a','إ':'e','آ':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
    'د':'d','ذ':'th','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z',
    'ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w',
    'ي':'y','ى':'a','ة':'a','ئ':'e','ء':'a','ؤ':'o',' ':' ',
    'َ':'a','ُ':'u','ِ':'i','ّ':'','ً':'','ٌ':'','ٍ':''
  };
  return name.split('').map(c => map[c] !== undefined ? map[c] : c).join('');
};

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
  BarChart3,
  WifiOff,
  CloudOff,
  Cloud,
  Camera,
  Upload,
  RefreshCw,
  Calculator
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import BiometricDevices from '../components/BiometricDevices';
import { useTranslation } from '../hooks/useTranslation';

const API = API_URL;

// مكون اختيار الوقت 12 ساعة مع AM/PM
const TimePickerAmPm = ({ value, onChange, testId, placeholder }) => {
  // تحويل من 24h إلى 12h
  const parse24To12 = (val) => {
    if (!val) return { hours: '', minutes: '', period: 'AM' };
    const [h, m] = val.split(':').map(Number);
    if (isNaN(h)) return { hours: '', minutes: '', period: 'AM' };
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { hours: String(h12), minutes: String(m).padStart(2, '0'), period };
  };
  
  // تحويل من 12h إلى 24h
  const to24 = (hours, minutes, period) => {
    let h = parseInt(hours) || 0;
    const m = parseInt(minutes) || 0;
    if (period === 'AM') { if (h === 12) h = 0; }
    else { if (h !== 12) h += 12; }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  
  const parsed = parse24To12(value);
  
  return (
    <div className="flex gap-1 items-center" data-testid={testId}>
      <select 
        className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={parsed.hours}
        onChange={(e) => onChange(to24(e.target.value, parsed.minutes, parsed.period))}
      >
        <option value="">{placeholder || '--'}</option>
        {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-lg font-bold">:</span>
      <select 
        className="w-16 h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={parsed.minutes}
        onChange={(e) => onChange(to24(parsed.hours || '12', e.target.value, parsed.period))}
      >
        {['00','15','30','45'].map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select 
        className="w-16 h-9 rounded-md border border-input bg-background px-2 text-sm font-bold"
        value={parsed.period}
        onChange={(e) => onChange(to24(parsed.hours || '12', parsed.minutes || '00', e.target.value))}
      >
        <option value="AM">ص</option>
        <option value="PM">م</option>
      </select>
    </div>
  );
};

export default function HR() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { selectedBranchId, branches: contextBranches, getBranchIdForApi } = useBranch();
  const { t, isRTL } = useTranslation();
  const { isOnline, isOffline, syncStatus, updateSyncStatus } = useOffline();
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [payrollSummary, setPayrollSummary] = useState(null);
  const [overtimeRequests, setOvertimeRequests] = useState([]);
  const [employeeRatings, setEmployeeRatings] = useState({ ratings: [], summary: {} });
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [dateMode, setDateMode] = useState('month'); // month, year, custom
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 7) + '-31');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  // حساب تواريخ البداية والنهاية حسب وضع التاريخ
  const getDateRange = () => {
    if (dateMode === 'year') {
      return { start: `${selectedYear}-01-01`, end: `${selectedYear}-12-31`, monthParam: selectedYear };
    } else if (dateMode === 'custom') {
      return { start: startDate, end: endDate, monthParam: startDate.slice(0, 7) };
    } else {
      return { start: `${selectedMonth}-01`, end: `${selectedMonth}-31`, monthParam: selectedMonth };
    }
  };

  const dateLabel = dateMode === 'year' ? selectedYear : dateMode === 'custom' ? `${startDate} → ${endDate}` : selectedMonth;

  // Dialogs
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [deductionDialogOpen, setDeductionDialogOpen] = useState(false);
  const [resetDeductionsDialogOpen, setResetDeductionsDialogOpen] = useState(false);
  const [resetEligibility, setResetEligibility] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);
  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);

  // Forms
  const [employeeForm, setEmployeeForm] = useState({
    name: '', name_en: '', phone: '', email: '', national_id: '', position: '', department: '',
    branch_id: '', hire_date: '', salary: '', salary_type: 'monthly', work_hours_per_day: 8,
    shift_start: '09:00', shift_end: '17:00', break_start: '', break_end: '', work_days: [0, 1, 2, 3, 4, 5]
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

  // Biometric push states
  const [biometricDialogOpen, setBiometricDialogOpen] = useState(false);
  const [biometricDevices, setBiometricDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [pushingEmployee, setPushingEmployee] = useState(null);
  const [pushingAll, setPushingAll] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const AGENT_URL = 'http://localhost:9999';

  // Face photo states
  const [facePhotoDialogOpen, setFacePhotoDialogOpen] = useState(false);
  const [facePhotoEmployee, setFacePhotoEmployee] = useState(null);
  const [facePhotoData, setFacePhotoData] = useState(null);
  const [facePhotoLoading, setFacePhotoLoading] = useState(false);
  const [probeResult, setProbeResult] = useState(null);
  const [probeLoading, setProbeLoading] = useState(false);

  // فحص دوري لحالة الوسيط - heartbeat أولاً ثم localhost
  useEffect(() => {
    const checkAgent = async () => {
      // الطريقة 1: heartbeat عبر السيرفر (دائماً يعمل)
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API}/print-queue/agent-status`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000
        });
        if (res.data?.online === true) {
          setAgentConnected(true);
          return;
        }
      } catch {}
      
      // الطريقة 2: اتصال مباشر بـ localhost (قد يحظره Chrome)
      try {
        const res = await axios.get(`${AGENT_URL}/status`, { timeout: 3000 });
        if (res.data?.status === 'running') {
          setAgentConnected(true);
          return;
        }
      } catch {}
      
      setAgentConnected(false);
    };
    checkAgent();
    const interval = setInterval(checkAgent, 10000);
    return () => clearInterval(interval);
  }, []);

  // جلب أول جهاز بصمة تلقائياً
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API}/biometric/devices`, { headers: { Authorization: `Bearer ${token}` } });
        const devices = res.data || [];
        setBiometricDevices(devices);
        if (devices.length > 0 && !selectedDevice) {
          setSelectedDevice(devices[0]);
        }
      } catch {}
    };
    fetchDevices();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedBranchId, selectedMonth, dateMode, startDate, endDate, selectedYear, isOffline]);

  // تحديث تلقائي للبيانات كل دقيقة - بصمت بدون إظهار شاشة التحميل (silent refresh)
  useEffect(() => {
    const autoRefreshInterval = setInterval(() => {
      fetchData(true); // silent = true، لا نُظهر spinner عند التحديث الخلفي
    }, 60 * 1000);
    return () => clearInterval(autoRefreshInterval);
  }, [selectedBranchId, selectedMonth, dateMode, startDate, endDate, selectedYear]);

  // الاستماع لأحداث المزامنة التلقائية - تحديث فوري عند وصول بيانات جديدة (بصمت)
  useEffect(() => {
    const handleSyncUpdate = () => {
      fetchData(true); // silent refresh
    };
    window.addEventListener('biometric-sync-data-updated', handleSyncUpdate);
    return () => window.removeEventListener('biometric-sync-data-updated', handleSyncUpdate);
  }, [selectedBranchId, selectedMonth, dateMode, startDate, endDate, selectedYear]);

  // الجلب التلقائي للصور من الجهاز مُعطَّل - معظم أجهزة ZKTeco لا تدعم HTTP
  // المستخدم يستخدم webcam أو رفع الملفات بدلاً من ذلك
  // (الكود القديم محتفظ به في git history إذا أردنا تفعيله مستقبلاً مع أجهزة تدعمه)
  const [photoFetchProgress, setPhotoFetchProgress] = useState(null); // { current, total }

  // فلترة تلقائية حسب الفرع المختار في كل التبويبات
  // الموظفون يُفلتَرون على السيرفر (branch_id)، والبيانات المرتبطة نُفلتَرها client-side
  const filteredEmployeeIds = React.useMemo(() => {
    // إذا لم يكن هناك فرع محدد، أعد قائمة فارغة (المعنى: لا فلترة)
    if (!getBranchIdForApi()) return null;
    return new Set(employees.map(e => e.id));
  }, [employees, selectedBranchId]);
  
  const filterByBranch = React.useCallback((arr) => {
    if (!filteredEmployeeIds || !Array.isArray(arr)) return arr;
    return arr.filter(item => filteredEmployeeIds.has(item.employee_id));
  }, [filteredEmployeeIds]);
  
  // مشتقات مفلترة - تُستخدم في العرض بدلاً من المصفوفات الأصلية
  const filteredAttendance = React.useMemo(() => filterByBranch(attendance), [attendance, filterByBranch]);
  const filteredAdvances = React.useMemo(() => filterByBranch(advances), [advances, filterByBranch]);
  const filteredDeductions = React.useMemo(() => filterByBranch(deductions), [deductions, filterByBranch]);
  const filteredBonuses = React.useMemo(() => filterByBranch(bonuses), [bonuses, filterByBranch]);
  const filteredPayrolls = React.useMemo(() => filterByBranch(payrolls), [payrolls, filterByBranch]);
  const filteredOvertimeRequests = React.useMemo(() => filterByBranch(overtimeRequests), [overtimeRequests, filterByBranch]);

  const fetchData = async (silent = false) => {
    // في التحديث البصمت، لا نُظهر spinner الشاشة الكاملة (يمنع الوميض كل دقيقة)
    if (!silent) setLoading(true);
    try {
      // === وضع Offline ===
      if (isOffline) {
        try {
          const [localEmployees, localBranches] = await Promise.all([
            db.getAllItems(STORES.EMPLOYEES),
            db.getAllItems(STORES.BRANCHES)
          ]);
          
          setEmployees(localEmployees || []);
          setBranches(localBranches || []);
          setAttendance([]);  // لا يمكن عرض الحضور السابق Offline
          setAdvances([]);
          setDeductions([]);
          setBonuses([]);
          setPayrolls([]);
          setPayrollSummary(null);
          
          setLoading(false);
          return;
        } catch (offlineError) {
          console.error('Error loading offline HR data:', offlineError);
        }
      }
      
      // === وضع Online ===
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const branchId = getBranchIdForApi();
      
      const dateRange = getDateRange();
      const [empRes, branchRes, attRes, advRes, dedRes, bonRes, payRes, summaryRes, otRes] = await Promise.all([
        axios.get(`${API}/employees${branchId ? `?branch_id=${branchId}` : ''}`, { headers }),
        axios.get(`${API}/branches`, { headers }),
        axios.get(`${API}/attendance?start_date=${dateRange.start}&end_date=${dateRange.end}`, { headers }),
        axios.get(`${API}/advances`, { headers }),
        axios.get(`${API}/deductions?start_date=${dateRange.start}&end_date=${dateRange.end}`, { headers }),
        axios.get(`${API}/bonuses?start_date=${dateRange.start}&end_date=${dateRange.end}`, { headers }),
        axios.get(`${API}/payroll?month=${dateRange.monthParam}`, { headers }),
        axios.get(`${API}/reports/payroll-summary?month=${dateRange.monthParam}&start_date=${dateRange.start}&end_date=${dateRange.end}${branchId ? `&branch_id=${branchId}` : ''}`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/overtime-requests?month=${dateRange.monthParam}`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setEmployees(empRes.data);
      setBranches(branchRes.data);
      setAttendance(attRes.data);
      setAdvances(advRes.data);
      setDeductions(dedRes.data);
      setBonuses(bonRes.data);
      setPayrolls(payRes.data);
      setPayrollSummary(summaryRes.data);
      setOvertimeRequests(otRes.data || []);
      
      // حفظ البيانات محلياً للاستخدام Offline
      try {
        await db.addItems(STORES.EMPLOYEES, empRes.data || []);
        await db.addItems(STORES.BRANCHES, branchRes.data || []);
      } catch (cacheError) {
        console.log('Could not cache HR data:', cacheError);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      
      // إذا فشل الاتصال، حاول جلب من IndexedDB
      if (!error.response) {
        try {
          const [localEmployees, localBranches] = await Promise.all([
            db.getAllItems(STORES.EMPLOYEES),
            db.getAllItems(STORES.BRANCHES)
          ]);
          
          if (localEmployees.length > 0) {
            setEmployees(localEmployees);
            toast.warning(t('تم تحميل بيانات الموظفين المحلية'));
          }
          if (localBranches.length > 0) {
            setBranches(localBranches);
          }
        } catch (offlineError) {
          console.error('Error loading offline data:', offlineError);
        }
      }
      
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
  }, [activeTab, selectedMonth, dateMode, startDate, endDate, selectedYear, selectedBranchId]);

  // Employee handlers
  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/employees`, {
        ...employeeForm,
        salary: parseFloat(employeeForm.salary),
        work_hours_per_day: parseFloat(employeeForm.work_hours_per_day),
        shift_start: employeeForm.shift_start || null,
        shift_end: employeeForm.shift_end || null,
        break_start: employeeForm.break_start || null,
        break_end: employeeForm.break_end || null,
        work_days: employeeForm.work_days || [0,1,2,3,4,5],
        biometric_uid: employeeForm.biometric_uid || ''
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t('تم إضافة الموظف'));

      // تصدير تلقائي للبصمة إذا وكيل متصل وعنده biometric_uid
      const uid = employeeForm.biometric_uid;
      if (uid && selectedDevice) {
        try {
          const agentRes = await axios.get(`${AGENT_URL}/status`, { timeout: 3000 });
          if (agentRes.data?.status === 'running') {
            await axios.post(`${AGENT_URL}/zk-push-user`, {
              ip: selectedDevice.ip_address,
              port: selectedDevice.port || 4370,
              timeout: 45000,
              uid: parseInt(uid),
              name: employeeForm.name_en || arabicToEnglish(employeeForm.name),
              privilege: 0,
              user_id: uid.toString()
            }, { timeout: 60000 });
            toast.success(t('تم تصدير الموظف للبصمة') + ` UID#${uid}`);
          }
        } catch (pushErr) {
          console.warn('Auto-push failed:', pushErr);
        }
      }

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
      const updateData = {
        ...employeeForm,
        salary: parseFloat(employeeForm.salary),
        work_hours_per_day: parseFloat(employeeForm.work_hours_per_day),
        shift_start: employeeForm.shift_start || null,
        shift_end: employeeForm.shift_end || null,
        break_start: employeeForm.break_start || null,
        break_end: employeeForm.break_end || null,
        work_days: employeeForm.work_days || [0,1,2,3,4,5],
        biometric_uid: employeeForm.biometric_uid || editingEmployee.biometric_uid || ''
      };
      await axios.put(`${API}/employees/${editingEmployee.id}`, updateData, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t('تم تحديث الموظف'));

      // تصدير تلقائي للبصمة إذا الوكيل متصل وعنده biometric_uid
      const uid = employeeForm.biometric_uid || editingEmployee.biometric_uid;
      if (uid && selectedDevice) {
        try {
          const agentRes = await axios.get(`${AGENT_URL}/status`, { timeout: 3000 });
          if (agentRes.data?.status === 'running') {
            await axios.post(`${AGENT_URL}/zk-push-user`, {
              ip: selectedDevice.ip_address,
              port: selectedDevice.port || 4370,
              timeout: 45000,
              uid: parseInt(uid),
              name: employeeForm.name_en || arabicToEnglish(employeeForm.name),
              privilege: 0,
              user_id: uid.toString()
            }, { timeout: 60000 });
            toast.success(t('تم تصدير التعديلات للبصمة') + ` UID#${uid}`);
          }
        } catch (pushErr) {
          console.warn('Auto-push failed:', pushErr);
        }
      }

      setEditingEmployee(null);
      setEmployeeDialogOpen(false);
      resetEmployeeForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في تحديث الموظف'));
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (!window.confirm(t('هل أنت متأكد من حذف هذا الموظف نهائياً؟ سيتم حذفه من النظام والبصمة.'))) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(`${API}/employees/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      
      // حذف من البصمة إذا عنده biometric_uid
      const biometricUid = res.data?.biometric_uid;
      if (biometricUid && selectedDevice) {
        try {
          await axios.post(`${AGENT_URL}/zk-delete-user`, {
            ip: selectedDevice.ip_address,
            port: selectedDevice.port || 4370,
            timeout: 5000,
            uid: parseInt(biometricUid)
          }, { timeout: 10000 });
          toast.success(t('تم حذف الموظف من النظام والبصمة'));
        } catch {
          toast.success(t('تم حذف الموظف من النظام (البصمة غير متصلة - احذفه يدوياً)'));
        }
      } else {
        toast.success(t('تم حذف الموظف نهائياً'));
      }
      fetchData();
    } catch (error) {
      toast.error(t('فشل في حذف الموظف'));
    }
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({
      name: '', phone: '', email: '', national_id: '', position: '', department: '',
      branch_id: '', hire_date: '', salary: '', salary_type: 'monthly', work_hours_per_day: 8,
      shift_start: '09:00', shift_end: '17:00', break_start: '', break_end: '', work_days: [0, 1, 2, 3, 4, 5],
      biometric_uid: ''
    });
  };

  // Attendance handlers
  const handleCreateAttendance = async (e) => {
    e.preventDefault();
    try {
      // === وضع Offline ===
      if (isOffline) {
        await offlineStorage.saveOfflineAttendance({
          ...attendanceForm,
          branch_id: getBranchIdForApi()
        });
        
        toast.success(t('تم تسجيل الحضور') + ' (محلي)');
        await updateSyncStatus();
        setAttendanceDialogOpen(false);
        setAttendanceForm({ employee_id: '', date: new Date().toISOString().slice(0, 10), check_in: '', check_out: '', status: 'present', notes: '' });
        return;
      }
      
      // === وضع Online ===
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
  
  // Face Photo handlers
  const handleFetchFacePhoto = async (emp) => {
    if (!emp.biometric_uid) {
      toast.error(t('الموظف غير مسجل في البصمة'));
      return;
    }
    
    setFacePhotoEmployee(emp);
    setFacePhotoData(emp.face_photo || null);
    setFacePhotoDialogOpen(true);
    setFacePhotoLoading(true);
    
    // جلب الصورة من جهاز البصمة عبر الوكيل المحلي
    const device = biometricDevices.length > 0 ? (biometricDevices.find(d => d.id === (selectedDevice?.id || selectedDevice)) || biometricDevices[0]) : null;
    if (!device) {
      toast.error(t('لا يوجد جهاز بصمة مسجل'));
      setFacePhotoLoading(false);
      return;
    }
    
    try {
      const agentCheck = await axios.get(`${AGENT_URL}/status`, { timeout: 3000 });
      if (agentCheck.data?.status !== 'running') {
        toast.error(t('الوكيل المحلي غير متصل'));
        setFacePhotoLoading(false);
        return;
      }
      
      // timeout موسّع: الجهاز قد يحتاج وقتاً أطول لفحص عدة مسارات HTTP ومنافذ UDP
      const res = await axios.post(`${AGENT_URL}/zk-face-photo`, {
        ip: device.ip_address,
        port: device.port || 4370,
        timeout: 45000,
        uid: parseInt(emp.biometric_uid)
      }, { timeout: 60000 });
      
      if (res.data?.success && res.data?.photo) {
        setFacePhotoData(res.data.photo);
        
        // حفظ الصورة في قاعدة البيانات
        try {
          const token = localStorage.getItem('token');
          await axios.post(`${API}/employees/${emp.id}/face-photo`, {
            face_photo: res.data.photo
          }, { headers: { Authorization: `Bearer ${token}` } });
          toast.success(t('تم جلب وحفظ صورة الوجه') + ` (${res.data.source})`);
          fetchData();
        } catch (saveErr) {
          toast.warning(t('تم جلب الصورة لكن فشل الحفظ'));
        }
      } else {
        // لا توجد صورة على الجهاز - لا نعرض toast مزعج، فقط تحديث الحالة
        if (!emp.face_photo) {
          toast.info(t('لا توجد صورة في الجهاز - يمكنك رفعها يدوياً'), { duration: 3000 });
        }
      }
    } catch (err) {
      // تجاهل الأخطاء بصمت عندما يكون للموظف صورة بالفعل
      if (emp.face_photo) {
        // عرض الصورة المحفوظة ولا نزعج المستخدم
        return;
      }
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        toast.error(t('انتهت مهلة الاتصال بجهاز البصمة - جرّب رفع الصورة يدوياً'), { duration: 4000 });
      } else {
        toast.info(t('تعذر الاتصال - يمكنك رفع صورة يدوياً'), { duration: 3000 });
      }
    } finally {
      setFacePhotoLoading(false);
    }
  };

  // رفع صورة يدوياً
  const handleManualPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !facePhotoEmployee) return;
    
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result;
      setFacePhotoData(base64);
      try {
        const token = localStorage.getItem('token');
        await axios.post(`${API}/employees/${facePhotoEmployee.id}/face-photo`, {
          face_photo: base64
        }, { headers: { Authorization: `Bearer ${token}` } });
        toast.success(t('تم حفظ الصورة'));
        // تحديث الحالة المحلية فوراً
        setEmployees(prev => prev.map(emp => emp.id === facePhotoEmployee.id ? { ...emp, face_photo: base64 } : emp));
      } catch {
        toast.error(t('فشل في حفظ الصورة'));
      }
    };
    reader.readAsDataURL(file);
  };

  // رفع متعدد للصور - يطابق الصور بالموظفين حسب UID في اسم الملف
  // الأسماء المقبولة: "1.jpg", "5.png", "uid_3.jpg", "employee-7.jpeg"
  const [bulkUploadProgress, setBulkUploadProgress] = useState(null);
  const handleBulkPhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const token = localStorage.getItem('token');
    let matched = 0, saved = 0, skipped = 0;
    setBulkUploadProgress({ current: 0, total: files.length });
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBulkUploadProgress({ current: i + 1, total: files.length });
      
      // استخراج UID من اسم الملف (1.jpg, uid_5.png, emp-10.jpeg)
      const match = file.name.match(/(\d+)/);
      if (!match) { skipped++; continue; }
      const uid = parseInt(match[1]);
      const emp = employees.find(e => parseInt(e.biometric_uid) === uid);
      if (!emp) { skipped++; continue; }
      matched++;
      
      try {
        const base64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        await axios.post(`${API}/employees/${emp.id}/face-photo`, {
          face_photo: base64
        }, { headers: { Authorization: `Bearer ${token}` } });
        saved++;
        setEmployees(prev => prev.map(x => x.id === emp.id ? { ...x, face_photo: base64 } : x));
      } catch {}
    }
    
    setBulkUploadProgress(null);
    toast.success(t('اكتملت عملية الرفع') + ` — ${saved}/${matched} محفوظة، ${skipped} غير مطابقة`, { duration: 5000 });
  };

  // التقاط صورة بالكاميرا (webcam)
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
      });
      setCameraStream(stream);
      setCameraDialogOpen(true);
      // تأخير قصير للتأكد من تحميل video
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      toast.error(t('فشل الوصول للكاميرا - تحقق من الأذونات'));
    }
  };
  
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setCameraDialogOpen(false);
  };
  
  const captureCameraPhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !facePhotoEmployee) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // رسم الإطار الحالي من video إلى canvas
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    // قص مركزي للوجه
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;
    ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    
    setFacePhotoData(base64);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/employees/${facePhotoEmployee.id}/face-photo`, {
        face_photo: base64
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t('تم التقاط وحفظ الصورة'));
      setEmployees(prev => prev.map(x => x.id === facePhotoEmployee.id ? { ...x, face_photo: base64 } : x));
      stopCamera();
    } catch {
      toast.error(t('فشل في حفظ الصورة'));
    }
  };

  // تشخيص جهاز البصمة
  const handleProbeDevice = async () => {
    const device = biometricDevices.length > 0 ? (biometricDevices.find(d => d.id === (selectedDevice?.id || selectedDevice)) || biometricDevices[0]) : null;
    if (!device) {
      toast.error(t('لا يوجد جهاز بصمة مسجل'));
      return;
    }
    setProbeLoading(true);
    setProbeResult(null);
    try {
      const res = await axios.post(`${AGENT_URL}/zk-probe-device`, {
        ip: device.ip_address
      }, { timeout: 90000 });
      setProbeResult(res.data);
      if (res.data?.success) {
        toast.success(t('تم فحص الجهاز'));
      }
    } catch (err) {
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
      toast.error(
        isTimeout 
          ? t('الجهاز لا يستجيب خلال 90 ثانية - الشبكة بطيئة أو الجهاز غير متصل')
          : t('فشل في فحص الجهاز') + ': ' + (err.message || 'Network')
      );
      setProbeResult({ error: err.message, code: err.code });
    } finally {
      setProbeLoading(false);
    }
  };

  // Overtime handlers
  const handleApproveOvertime = async (requestId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/overtime-requests/${requestId}/approve`, null, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t('تمت الموافقة على الوقت الإضافي'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في الموافقة'));
    }
  };
  
  const handleRejectOvertime = async (requestId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/overtime-requests/${requestId}/reject`, null, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(t('تم رفض الوقت الإضافي'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في الرفض'));
    }
  };

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
  // فتح حوار تصفير الخصومات - يفحص الأهلية من السيرفر أولاً
  const handleOpenResetDeductions = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/deductions/reset-eligibility`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResetEligibility(res.data);
      setResetDeductionsDialogOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في فحص الأهلية'));
    }
  };

  // تنفيذ تصفير الخصومات (حذف نهائي)
  const handleConfirmResetDeductions = async () => {
    setResetting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/deductions/reset`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(res.data.message || t('تم التصفير بنجاح'));
      setResetDeductionsDialogOpen(false);
      setResetEligibility(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في التصفير'));
    } finally {
      setResetting(false);
    }
  };

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
      'absence': t('غياب'),
      'late': t('تأخير'),
      'early_leave': t('انصراف مبكر'),
      'violation': t('مخالفة'),
      'other': t('أخرى')
    };
    
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    
    // ترجمات للطباعة
    const labels = {
      employeeName: t('اسم الموظف:'),
      date: t('التاريخ:'),
      deductionType: t('نوع الخصم:'),
      deductionAmount: t('مبلغ الخصم:'),
      reason: t('السبب:'),
      notSpecified: t('غير محدد'),
      hours: t('عدد الساعات:'),
      hour: t('ساعة'),
      days: t('عدد الأيام:'),
      day: t('يوم'),
      employeeSignature: t('توقيع الموظف (علمت بالخصم):'),
      managerSignature: t('توقيع المسؤول:'),
      name: t('الاسم:'),
      deductionReceipt: t('إيصال خصم'),
      receiptNo: t('رقم:'),
      createdFromSystem: t('تم إنشاء هذا الإيصال من نظام Maestro EGP')
    };
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${labels.deductionReceipt}</title>
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
          <div class="title">🔴 ${labels.deductionReceipt}</div>
          <div class="receipt-no">${labels.receiptNo} ${deduction.id?.slice(0, 8) || 'N/A'}</div>
        </div>
        
        <div class="section">
          <div class="row">
            <span class="label">${labels.employeeName}</span>
            <span class="value">${deduction.employee_name || employee?.name || labels.notSpecified}</span>
          </div>
          <div class="row">
            <span class="label">${labels.date}</span>
            <span class="value">${deduction.date || new Date().toLocaleDateString('en-US')}</span>
          </div>
          <div class="row">
            <span class="label">${labels.deductionType}</span>
            <span class="value">${deductionTypeLabels[deduction.deduction_type] || deduction.deduction_type}</span>
          </div>
        </div>
        
        <div class="amount">
          ${labels.deductionAmount} ${formatPrice(deduction.amount)}
        </div>
        
        <div class="reason">
          <strong>${labels.reason}</strong><br/>
          ${deduction.reason || labels.notSpecified}
        </div>
        
        ${deduction.hours ? `<div class="row"><span class="label">${labels.hours}</span><span class="value">${deduction.hours} ${labels.hour}</span></div>` : ''}
        ${deduction.days ? `<div class="row"><span class="label">${labels.days}</span><span class="value">${deduction.days} ${labels.day}</span></div>` : ''}
        
        <div class="signature">
          <div>${labels.employeeSignature}</div>
          <div class="sig-line"></div>
          <div class="sig-label">${labels.date} _______________</div>
        </div>
        
        <div class="signature">
          <div>${labels.managerSignature}</div>
          <div class="sig-line"></div>
          <div class="sig-label">${labels.name} ${user?.full_name || '_______________'}</div>
        </div>
        
        <div class="footer">
          <p>${labels.createdFromSystem}</p>
          <p>${new Date().toLocaleString('en-GB')}</p>
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

  // احتساب رواتب جميع الموظفين بالجملة (Bulk Calculate Payroll)
  const [bulkCalculating, setBulkCalculating] = useState(false);
  const bulkCalculatePayroll = async () => {
    const pendingEmployees = (filteredEmployees || []).filter(
      emp => !payrolls.some(p => p.employee_id === emp.id && p.month === selectedMonth)
    );
    if (pendingEmployees.length === 0) {
      toast.info(t('لا يوجد موظفين بانتظار احتساب الراتب'));
      return;
    }
    if (!window.confirm(t(`سيتم احتساب وحفظ رواتب ${pendingEmployees.length} موظف لشهر ${selectedMonth}. هل أنت متأكد؟`))) return;
    
    setBulkCalculating(true);
    const token = localStorage.getItem('token');
    let successCount = 0;
    let failCount = 0;
    try {
      for (const emp of pendingEmployees) {
        try {
          const calcRes = await axios.post(
            `${API}/payroll/calculate?employee_id=${emp.id}&month=${selectedMonth}`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const preview = calcRes.data;
          await axios.post(
            `${API}/payroll`,
            {
              employee_id: preview.employee_id,
              month: preview.month,
              basic_salary: preview.basic_salary,
              total_deductions: preview.total_deductions,
              total_bonuses: preview.total_bonuses,
              advance_deduction: preview.advance_deduction,
              net_salary: preview.net_salary
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          successCount++;
        } catch (e) {
          failCount++;
        }
      }
      toast.success(t(`تم احتساب ${successCount} كشف راتب${failCount > 0 ? ` (${failCount} فشل)` : ''}`));
      fetchData();
    } finally {
      setBulkCalculating(false);
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
      present: { label: t('حاضر'), color: 'bg-green-500' },
      absent: { label: t('غائب'), color: 'bg-red-500' },
      late: { label: t('متأخر'), color: 'bg-yellow-500' },
      early_leave: { label: t('انصراف مبكر'), color: 'bg-orange-500' },
      holiday: { label: t('إجازة'), color: 'bg-blue-500' }
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-500' };
    return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
  };

  const getPayrollStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: t('مسودة'), color: 'bg-gray-500' },
      approved: { label: t('معتمد'), color: 'bg-blue-500' },
      paid: { label: t('تم الصرف'), color: 'bg-green-500' }
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


  // Fetch biometric devices
  const fetchBiometricDevices = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/biometric/devices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBiometricDevices(res.data || []);
    } catch { setBiometricDevices([]); }
  };

  // Open biometric push dialog for employee
  const openBiometricPush = (emp) => {
    setPushingEmployee(emp);
    fetchBiometricDevices();
    setBiometricDialogOpen(true);
  };

  // Generate next available UID - checks device users first
  const getNextBiometricUid = (deviceUsers = []) => {
    // Combine UIDs from database employees AND device users
    const dbUids = employees.filter(e => e.biometric_uid).map(e => parseInt(e.biometric_uid) || 0);
    const deviceUids = deviceUsers.map(u => parseInt(u.uid_num) || parseInt(u.uid) || 0);
    const allUids = [...dbUids, ...deviceUids];
    return allUids.length > 0 ? Math.max(...allUids) + 1 : 1;
  };

  // Fetch users from device via agent
  const fetchDeviceUsersForPush = async (device) => {
    try {
      const res = await axios.post(`${AGENT_URL}/zk-users`, {
        ip: device.ip_address,
        port: device.port || 4370,
        timeout: 45000
      }, { timeout: 60000 });
      if (res.data?.success) return res.data.users || [];
    } catch {}
    return [];
  };

  // Push single employee to device
  const handlePushToDevice = async () => {
    if (!pushingEmployee || !selectedDevice) return;
    const device = biometricDevices.find(d => d.id === selectedDevice);
    if (!device) return;

    try {
      // Check agent
      const agentRes = await axios.get(`${AGENT_URL}/status`, { timeout: 3000 });
      if (!agentRes.data?.zk_support) {
        toast.error(t('الوكيل المحلي لا يدعم البصمة - حدّث إلى v2.4'));
        return;
      }
    } catch {
      toast.error(t('الوكيل المحلي غير متصل! شغّل print_server.ps1 v2.4'));
      return;
    }

    const uid = pushingEmployee.biometric_uid ? parseInt(pushingEmployee.biometric_uid) : getNextBiometricUid(await fetchDeviceUsersForPush(device));
    
    try {
      const res = await axios.post(`${AGENT_URL}/zk-push-user`, {
        ip: device.ip_address,
        port: device.port || 4370,
        timeout: 5000,
        uid: uid,
        user_id: String(uid),
        name: pushingEmployee.name_en || arabicToEnglish(pushingEmployee.name),
        privilege: 0
      }, { timeout: 10000 });

      if (res.data.success) {
        // Update employee biometric_uid in backend
        const token = localStorage.getItem('token');
        await axios.put(`${API}/employees/${pushingEmployee.id}`, 
          { biometric_uid: String(uid) },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(
          <div>
            <p className="font-bold">{t('تم إصدار الموظف للبصمة!')}</p>
            <p className="text-sm">{pushingEmployee.name} → UID: {uid}</p>
          </div>
        );
        setBiometricDialogOpen(false);
        fetchData();
      } else {
        toast.error(res.data.message || t('فشل في إرسال الموظف للجهاز'));
      }
    } catch (error) {
      toast.error(t('فشل الاتصال بجهاز البصمة'));
    }
  };

  // Push ALL employees to device
  const handlePushAllToDevice = async () => {
    if (!selectedDevice) return;
    const device = biometricDevices.find(d => d.id === selectedDevice);
    if (!device) return;
    
    setPushingAll(true);
    let successCount = 0;
    let failCount = 0;

    try {
      await axios.get(`${AGENT_URL}/status`, { timeout: 3000 });
    } catch {
      toast.error(t('الوكيل المحلي غير متصل!'));
      setPushingAll(false);
      return;
    }

    const activeEmployees = employees.filter(e => e.is_active !== false);
    
    if (activeEmployees.length === 0) {
      toast.error(t('لا يوجد موظفين نشطين'));
      setPushingAll(false);
      return;
    }
    
    // === الخطوة 1: تعيين UIDs فريدة لكل موظف ===
    const usedUids = new Set();
    const employeesWithUids = [];
    
    // أولاً: الموظفين اللي عندهم UID صحيح وفريد
    for (const emp of activeEmployees) {
      const uid = emp.biometric_uid ? parseInt(emp.biometric_uid) : 0;
      if (uid > 0 && !usedUids.has(uid)) {
        usedUids.add(uid);
        employeesWithUids.push({ ...emp, assignedUid: uid });
      }
    }
    
    // ثانياً: الموظفين بدون UID أو UID مكرر - يحصلون على UID جديد فريد
    let nextUid = 1;
    for (const emp of activeEmployees) {
      const uid = emp.biometric_uid ? parseInt(emp.biometric_uid) : 0;
      const alreadyAssigned = employeesWithUids.some(e => e.id === emp.id);
      if (!alreadyAssigned) {
        // إيجاد UID فريد غير مستخدم
        while (usedUids.has(nextUid)) nextUid++;
        usedUids.add(nextUid);
        employeesWithUids.push({ ...emp, assignedUid: nextUid, uidChanged: true });
        nextUid++;
      }
    }
    
    // === الخطوة 2: تصدير كل موظف للبصمة ===
    for (const emp of employeesWithUids) {
      const uid = emp.assignedUid;
      try {
        const res = await axios.post(`${AGENT_URL}/zk-push-user`, {
          ip: device.ip_address,
          port: device.port || 4370,
          timeout: 5000,
          uid: uid,
          user_id: String(uid),
          name: emp.name_en || arabicToEnglish(emp.name),
          privilege: 0
        }, { timeout: 10000 });
        
        if (res.data.success) {
          // تحديث UID في النظام إذا تغير أو كان جديد
          if (emp.uidChanged || !emp.biometric_uid || parseInt(emp.biometric_uid) !== uid) {
            try {
              const token = localStorage.getItem('token');
              await axios.put(`${API}/employees/${emp.id}`, 
                { biometric_uid: String(uid) },
                { headers: { Authorization: `Bearer ${token}` } }
              );
            } catch (updateErr) {
              console.warn(`Failed to update UID for ${emp.name}:`, updateErr.message);
            }
          }
          successCount++;
        } else {
          failCount++;
        }
      } catch { failCount++; }
      // Small delay between pushes
      await new Promise(r => setTimeout(r, 500));
    }

    setPushingAll(false);
    toast.success(
      <div>
        <p className="font-bold">{t('تم إصدار الموظفين')}</p>
        <p className="text-sm">{t('نجح')}: {successCount} | {t('فشل')}: {failCount}</p>
      </div>
    );
    fetchData();
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Toaster position="top-center" richColors />
      
      {/* Offline Banner */}
      {isOffline && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm sticky top-0 z-50">
          <WifiOff className="h-4 w-4 animate-pulse" />
          <span className="font-medium">{t('وضع Offline')} - {t('الحضور يُحفظ محلياً')}</span>
          {syncStatus.pendingItems > 0 && (
            <span className="bg-white text-amber-600 px-2 py-0.5 rounded-full text-xs font-bold mr-2">
              {syncStatus.pendingItems} {t('في الانتظار')}
            </span>
          )}
        </div>
      )}
      
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-muted-foreground">{t('إدارة الموظفين والرواتب والحضور')}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${agentConnected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${agentConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                      {agentConnected ? t('الوسيط متصل') : t('الوسيط غير متصل')}
                    </span>
                    {photoFetchProgress && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-500" data-testid="photo-fetch-progress">
                        <Camera className="h-3 w-3 animate-pulse" />
                        {t('جلب الصور')}: {photoFetchProgress.current}/{photoFetchProgress.total}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* وضع التاريخ */}
              <Select value={dateMode} onValueChange={(v) => setDateMode(v)}>
                <SelectTrigger className="w-28 h-10" data-testid="date-mode-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">{t('شهر')}</SelectItem>
                  <SelectItem value="year">{t('سنة')}</SelectItem>
                  <SelectItem value="custom">{t('مخصص')}</SelectItem>
                </SelectContent>
              </Select>

              {dateMode === 'month' && (
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-40 h-10"
                  data-testid="month-picker"
                />
              )}

              {dateMode === 'year' && (
                <Select value={selectedYear} onValueChange={(v) => setSelectedYear(v)}>
                  <SelectTrigger className="w-28 h-10" data-testid="year-picker">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => {
                      const y = String(new Date().getFullYear() - 2 + i);
                      return <SelectItem key={y} value={y}>{y}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              )}

              {dateMode === 'custom' && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{t('من')}</span>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-36 h-10"
                      data-testid="start-date-picker"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{t('إلى')}</span>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-36 h-10"
                      data-testid="end-date-picker"
                    />
                  </div>
                </>
              )}

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
            <TabsTrigger value="overtime" className="flex items-center gap-2" data-testid="overtime-tab">
              <Timer className="h-4 w-4" /> {t('الأوقات الإضافية')}
              {filteredOvertimeRequests.filter(r => r.status === 'pending').length > 0 && (
                <Badge className="bg-orange-500/20 text-orange-500 text-xs">{filteredOvertimeRequests.filter(r => r.status === 'pending').length}</Badge>
              )}
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
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleBulkPhotoUpload} data-testid="bulk-photo-upload" />
                    <div className="inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm hover:bg-accent transition-colors">
                      <Upload className="h-4 w-4" />
                      {t('رفع صور جماعي')}
                      {bulkUploadProgress && (
                        <Badge className="bg-blue-500/20 text-blue-600">
                          {bulkUploadProgress.current}/{bulkUploadProgress.total}
                        </Badge>
                      )}
                    </div>
                  </label>
                  <Button variant="outline" size="sm" onClick={() => { 
                    setPushingEmployee(null); fetchBiometricDevices(); setBiometricDialogOpen(true); 
                  }} data-testid="push-all-biometric-btn">
                    <Fingerprint className="h-4 w-4 ml-1" /> {t('إصدار الكل للبصمة')}
                  </Button>
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
                            <Label>{t('الاسم بالإنجليزية')} ({t('للبصمة')})</Label>
                            <Input value={employeeForm.name_en} onChange={(e) => setEmployeeForm({...employeeForm, name_en: e.target.value})} placeholder="e.g. Ahmed Ali" dir="ltr" />
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
                          <div>
                            <Label>{t('رقم البصمة (UID)')}</Label>
                            <Input type="number" value={employeeForm.biometric_uid || ''} onChange={(e) => setEmployeeForm({...employeeForm, biometric_uid: e.target.value})} placeholder={t('يتم تعيينه تلقائياً عند التصدير')} data-testid="biometric-uid-input" />
                          </div>
                        </div>
                        {/* حقول الشفت مع AM/PM */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>{t('بداية الشفت')}</Label>
                            <TimePickerAmPm value={employeeForm.shift_start} onChange={(v) => setEmployeeForm({...employeeForm, shift_start: v})} testId="shift-start-input" />
                          </div>
                          <div>
                            <Label>{t('نهاية الشفت')}</Label>
                            <TimePickerAmPm value={employeeForm.shift_end} onChange={(v) => setEmployeeForm({...employeeForm, shift_end: v})} testId="shift-end-input" />
                          </div>
                        </div>
                        {/* حقول الاستراحة */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>{t('بداية الاستراحة')}</Label>
                            <TimePickerAmPm value={employeeForm.break_start} onChange={(v) => setEmployeeForm({...employeeForm, break_start: v})} testId="break-start-input" placeholder={t('اختياري')} />
                          </div>
                          <div>
                            <Label>{t('نهاية الاستراحة')}</Label>
                            <TimePickerAmPm value={employeeForm.break_end} onChange={(v) => setEmployeeForm({...employeeForm, break_end: v})} testId="break-end-input" placeholder={t('اختياري')} />
                          </div>
                        </div>
                        <div>
                          <Label className="mb-2 block">{t('أيام العمل')}</Label>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { day: 0, label: 'الأحد' }, { day: 1, label: 'الإثنين' }, { day: 2, label: 'الثلاثاء' },
                              { day: 3, label: 'الأربعاء' }, { day: 4, label: 'الخميس' }, { day: 5, label: 'الجمعة' }, { day: 6, label: 'السبت' }
                            ].map(({ day, label }) => (
                              <Button key={day} type="button" size="sm" variant={(employeeForm.work_days || []).includes(day) ? 'default' : 'outline'}
                                data-testid={`work-day-${day}`}
                                onClick={() => {
                                  const days = employeeForm.work_days || [];
                                  setEmployeeForm({...employeeForm, work_days: days.includes(day) ? days.filter(d => d !== day) : [...days, day]});
                                }}
                              >{t(label)}</Button>
                            ))}
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
                        <th className="text-right p-3">{t('البصمة')}</th>
                        <th className="text-right p-3">{t('الحالة')}</th>
                        <th className="text-right p-3">{t('الإجراءات')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map(emp => (
                        <tr key={emp.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              {emp.face_photo ? (
                                <img src={emp.face_photo} alt="" className="w-8 h-8 rounded-full object-cover border border-primary/30" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                                  {(emp.name || '?').charAt(0)}
                                </div>
                              )}
                              {emp.name}
                            </div>
                          </td>
                          <td className="p-3">{emp.phone}</td>
                          <td className="p-3">{emp.position}</td>
                          <td className="p-3">{branches.find(b => b.id === emp.branch_id)?.name || '-'}</td>
                          <td className="p-3">{formatPrice(emp.salary)}</td>
                          <td className="p-3">
                            {emp.biometric_uid ? (
                              <Badge className="bg-green-500/10 text-green-500">#{emp.biometric_uid}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">{t('غير مسجل')}</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge className={emp.is_active ? 'bg-green-500' : 'bg-red-500'}>
                              {emp.is_active ? t('نشط') : t('معطل')}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => openBiometricPush(emp)} title={t('إصدار للبصمة')}
                                className={emp.biometric_uid ? 'border-green-500 text-green-500' : ''} data-testid={`push-biometric-${emp.id}`}>
                                <Fingerprint className="h-4 w-4" />
                                {emp.biometric_uid && <span className="text-[10px] mr-1">#{emp.biometric_uid}</span>}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleFetchFacePhoto(emp)} 
                                title={t('صورة الوجه')}
                                className={emp.face_photo ? 'border-blue-500 text-blue-500' : ''}
                                data-testid={`face-photo-${emp.id}`}>
                                <Camera className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => window.open(`/payroll/print/${emp.id}`, '_blank')} title={t('طباعة مفردات المرتب')}>
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => calculatePayroll(emp.id)} title={t('إنشاء كشف راتب')}>
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => {
                                setEditingEmployee(emp);
                                setEmployeeForm({
                                  name: emp.name, name_en: emp.name_en || '', phone: emp.phone, email: emp.email || '', national_id: emp.national_id || '',
                                  position: emp.position, department: emp.department || '', branch_id: emp.branch_id,
                                  hire_date: emp.hire_date, salary: emp.salary, salary_type: emp.salary_type,
                                  work_hours_per_day: emp.work_hours_per_day,
                                  shift_start: emp.shift_start || '09:00', shift_end: emp.shift_end || '17:00',
                                  break_start: emp.break_start || '', break_end: emp.break_end || '',
                                  work_days: emp.work_days || [0,1,2,3,4,5],
                                  biometric_uid: emp.biometric_uid || ''
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
                  {t('تقرير الرواتب الشامل')} - {dateMode === 'year' ? selectedYear : dateMode === 'custom' ? `${startDate} → ${endDate}` : selectedMonth}
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
                <CardTitle>{t('سجل الحضور')} - {dateLabel}</CardTitle>
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
                        <th className="text-right p-3 text-amber-600 bg-amber-50/50" data-testid="col-break-out">
                          {t('ذهاب الاستراحة')}
                        </th>
                        <th className="text-right p-3 text-emerald-600 bg-emerald-50/50" data-testid="col-break-in">
                          {t('عودة من الاستراحة')}
                        </th>
                        <th className="text-right p-3">{t('الانصراف')}</th>
                        <th className="text-right p-3">{t('الساعات')}</th>
                        <th className="text-right p-3">{t('الحالة')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttendance.map(att => {
                        // تحويل الوقت إلى 12 ساعة
                        const formatTime12 = (t) => {
                          if (!t || t === '-') return '-';
                          const [h, m] = t.split(':').map(Number);
                          if (isNaN(h)) return t;
                          const period = h >= 12 ? 'م' : 'ص';
                          const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                          return `${h12}:${String(m).padStart(2, '0')} ${period}`;
                        };
                        return (
                        <tr key={att.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{att.employee_name}</td>
                          <td className="p-3">{att.date}</td>
                          <td className="p-3">{formatTime12(att.check_in)}</td>
                          <td className="p-3 text-amber-700 bg-amber-50/30" data-testid={`break-out-${att.id}`}>
                            {formatTime12(att.break_out)}
                          </td>
                          <td className="p-3 text-emerald-700 bg-emerald-50/30" data-testid={`break-in-${att.id}`}>
                            {formatTime12(att.break_in)}
                          </td>
                          <td className="p-3">{formatTime12(att.check_out)}</td>
                          <td className="p-3">{att.worked_hours?.toFixed(1) || '-'}</td>
                          <td className="p-3">{getStatusBadge(att.status)}</td>
                        </tr>
                        );
                      })}
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
                      {filteredAdvances.map(adv => (
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
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <CardTitle>{t('الخصومات')} - {dateLabel}</CardTitle>
                <div className="flex items-center gap-2">
                  {/* زر تصفير الخصومات - للمالك فقط */}
                  {hasRole(['admin', 'super_admin']) && (
                    <Button
                      variant="outline"
                      onClick={handleOpenResetDeductions}
                      data-testid="reset-deductions-btn"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <RefreshCw className="h-4 w-4 ml-2" /> {t('تصفير الخصومات')}
                    </Button>
                  )}
                  <Dialog open={deductionDialogOpen} onOpenChange={setDeductionDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" data-testid="new-deduction-btn"><Plus className="h-4 w-4 ml-2" /> {t('خصم جديد')}</Button>
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
                </div>
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
                      {filteredDeductions.map(ded => (
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

            {/* حوار تأكيد تصفير الخصومات */}
            <Dialog open={resetDeductionsDialogOpen} onOpenChange={setResetDeductionsDialogOpen}>
              <DialogContent data-testid="reset-deductions-dialog" className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-600">
                    <RefreshCw className="h-5 w-5" />
                    {t('تصفير جميع الخصومات')}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {resetEligibility && resetEligibility.can_reset ? (
                    <>
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800 font-semibold mb-2">
                          ⚠️ {t('تحذير: هذا الإجراء لا يمكن التراجع عنه')}
                        </p>
                        <p className="text-sm text-red-700">
                          {t('سيتم حذف جميع الخصومات نهائياً من قاعدة البيانات.')}
                        </p>
                        <ul className="text-xs text-red-600 mt-2 space-y-1 list-disc pr-4">
                          <li>{t('لن تظهر في التقارير بعد التصفير')}</li>
                          <li>{t('لن تخصم من الرواتب القادمة')}</li>
                          <li>{t('لا يمكن التصفير مرة أخرى إلا الشهر القادم (بعد يوم 15)')}</li>
                        </ul>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('تاريخ اليوم')}: {resetEligibility.today}
                        {resetEligibility.last_reset_date && (
                          <> • {t('آخر تصفير')}: {resetEligibility.last_reset_date}</>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800 font-semibold mb-1">
                        {t('التصفير غير متاح حالياً')}
                      </p>
                      <p className="text-sm text-amber-700">
                        {resetEligibility?.reason || t('جاري التحقق...')}
                      </p>
                      <ul className="text-xs text-amber-600 mt-2 space-y-1 list-disc pr-4">
                        <li>{t('متاح للمالك فقط')}</li>
                        <li>{t('مرة واحدة شهرياً')}</li>
                        <li>{t('بعد الـ 15 من الشهر فقط')}</li>
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setResetDeductionsDialogOpen(false)}
                    data-testid="cancel-reset-btn"
                  >
                    {t('إلغاء')}
                  </Button>
                  {resetEligibility && resetEligibility.can_reset && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleConfirmResetDeductions}
                      disabled={resetting}
                      data-testid="confirm-reset-btn"
                    >
                      {resetting
                        ? <><RefreshCw className="h-4 w-4 ml-2 animate-spin" />{t('جاري التصفير...')}</>
                        : <><RefreshCw className="h-4 w-4 ml-2" />{t('نعم، صفّر الآن')}</>}
                    </Button>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Bonuses Tab */}
          <TabsContent value="bonuses">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t('المكافآت')} - {dateLabel}</CardTitle>
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
                      {filteredBonuses.map(bon => (
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


          {/* Overtime Tab */}
          <TabsContent value="overtime">
            <Card>
              <CardHeader>
                <CardTitle>{t('طلبات الأوقات الإضافية')} - {dateLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredOvertimeRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Timer className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>{t('لا توجد طلبات أوقات إضافية')}</p>
                  </div>
                ) : (
                  <>
                    {/* ملخص الأوقات الإضافية لكل موظف */}
                    {(() => {
                      const summary = {};
                      filteredOvertimeRequests.forEach(ot => {
                        if (ot.status === 'approved') {
                          const key = ot.employee_id;
                          if (!summary[key]) {
                            summary[key] = {
                              name: employees.find(e => e.id === ot.employee_id)?.name || ot.employee_name,
                              total: 0,
                              count: 0
                            };
                          }
                          summary[key].total += ot.hours || 0;
                          summary[key].count += 1;
                        }
                      });
                      const summaryArr = Object.values(summary).sort((a, b) => b.total - a.total);
                      if (summaryArr.length === 0) return null;
                      const grandTotal = summaryArr.reduce((s, x) => s + x.total, 0);
                      return (
                        <div className="mb-4 p-4 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-2 border-amber-200 dark:border-amber-800 rounded-lg" data-testid="overtime-summary">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                              <Timer className="h-4 w-4" />
                              {t('ملخص الأوقات الإضافية المعتمدة')}
                            </h4>
                            <Badge className="bg-amber-600 text-white text-sm">
                              {t('إجمالي')}: {grandTotal.toFixed(1)} {t('ساعة')}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {summaryArr.map((s, i) => (
                              <div key={i} className="flex items-center justify-between p-2 bg-white/60 dark:bg-black/20 rounded-md">
                                <span className="text-sm font-medium truncate">{s.name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge variant="outline" className="text-xs">{s.count} {t('أيام')}</Badge>
                                  <span className="font-bold text-amber-700 dark:text-amber-300">{s.total.toFixed(1)}h</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    
                    <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-right p-3">{t('الموظف')}</th>
                          <th className="text-right p-3">{t('التاريخ')}</th>
                          <th className="text-right p-3">{t('الساعات')}</th>
                          <th className="text-right p-3">{t('الحالة')}</th>
                          <th className="text-right p-3">{t('ملاحظات')}</th>
                          <th className="text-right p-3">{t('الإجراءات')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOvertimeRequests.map(ot => {
                          const emp = employees.find(e => e.id === ot.employee_id);
                          // تحديد لون الصف حسب الحالة والتاريخ
                          const today = new Date().toISOString().slice(0, 10);
                          const isPast = ot.date < today;
                          const isApproved = ot.status === 'approved';
                          const isApprovedToday = isApproved && !isPast;
                          const isApprovedPast = isApproved && isPast;
                          
                          let rowClass = 'border-b hover:bg-muted/50 transition-all';
                          let badgeClass = '';
                          let badgeLabel = '';
                          if (ot.status === 'pending') {
                            rowClass += ' bg-orange-50/40 dark:bg-orange-950/10';
                            badgeClass = 'bg-orange-500/10 text-orange-500';
                            badgeLabel = t('بانتظار الموافقة');
                          } else if (isApprovedToday) {
                            // اليوم الحالي - أخضر صلب
                            rowClass += ' bg-green-500/15 dark:bg-green-900/20 border-green-500/30';
                            badgeClass = 'bg-green-500 text-white font-bold shadow-sm';
                            badgeLabel = t('تمت الموافقة - اليوم');
                          } else if (isApprovedPast) {
                            // أيام سابقة - أخضر فسفوري زاهي
                            rowClass += ' bg-gradient-to-r from-lime-300/40 via-green-300/40 to-lime-300/40 dark:from-lime-500/20 dark:via-green-500/20 dark:to-lime-500/20 border-l-4 border-lime-400';
                            badgeClass = 'bg-lime-400 text-lime-950 font-bold shadow-md shadow-lime-400/50';
                            badgeLabel = t('✓ تمت الموافقة (مُرحّلة)');
                          } else if (ot.status === 'rejected') {
                            rowClass += ' bg-red-50/40 dark:bg-red-950/10 opacity-60';
                            badgeClass = 'bg-red-500/10 text-red-500';
                            badgeLabel = t('مرفوض');
                          }
                          
                          return (
                            <tr key={ot.id} className={rowClass} data-testid={`overtime-row-${ot.id}`} data-status={ot.status} data-past={isPast ? 'true' : 'false'}>
                              <td className="p-3 font-medium">{emp?.name || ot.employee_name}</td>
                              <td className="p-3">
                                {ot.date}
                                {isApprovedPast && <span className="mr-2 text-[10px] text-lime-700 dark:text-lime-300 font-bold">●</span>}
                              </td>
                              <td className="p-3 font-bold">{ot.hours?.toFixed(1)}</td>
                              <td className="p-3">
                                <Badge className={badgeClass}>{badgeLabel}</Badge>
                              </td>
                              <td className="p-3 text-sm text-muted-foreground">{ot.notes || '-'}</td>
                              <td className="p-3">
                                {ot.status === 'pending' && (
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="text-green-500 border-green-500/30 hover:bg-green-500/10" onClick={() => handleApproveOvertime(ot.id)} data-testid={`approve-overtime-${ot.id}`}>
                                      <CheckCircle className="h-4 w-4 ml-1" /> {t('موافقة')}
                                    </Button>
                                    <Button size="sm" variant="outline" className="text-red-500 border-red-500/30 hover:bg-red-500/10" onClick={() => handleRejectOvertime(ot.id)} data-testid={`reject-overtime-${ot.id}`}>
                                      <XCircle className="h-4 w-4 ml-1" /> {t('رفض')}
                                    </Button>
                                  </div>
                                )}
                                {ot.status !== 'pending' && <span className="text-sm text-muted-foreground">-</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payroll Tab */}
          <TabsContent value="payroll">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <CardTitle>{t('كشوفات الرواتب')} - {dateLabel}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2"
                    onClick={bulkCalculatePayroll}
                    disabled={bulkCalculating}
                    data-testid="bulk-calculate-payroll-btn"
                  >
                    {bulkCalculating ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Calculator className="h-4 w-4" />
                    )}
                    {t('احتساب الرواتب بالجملة')}
                  </Button>
                  <Badge className="bg-primary/10 text-primary" data-testid="payroll-count-badge">
                    {filteredPayrolls.length} {t('كشف')} / {employees.length} {t('موظف')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {employees.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>{t('لا يوجد موظفون في هذا الفرع')}</p>
                  </div>
                ) : (
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
                      {employees.map(emp => {
                        // ابحث عن كشف راتب محفوظ لهذا الموظف في الشهر الحالي
                        const pay = filteredPayrolls.find(p => p.employee_id === emp.id);
                        if (pay) {
                          return (
                            <tr key={pay.id} className="border-b hover:bg-muted/50" data-testid={`payroll-row-${pay.id}`}>
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
                          );
                        }
                        // لم يُنشأ كشف راتب بعد — أظهر صفاً مع زر "حساب الراتب"
                        return (
                          <tr key={emp.id} className="border-b hover:bg-muted/50 bg-muted/20" data-testid={`payroll-pending-${emp.id}`}>
                            <td className="p-3 font-medium">{emp.name}</td>
                            <td className="p-3">{formatPrice(emp.salary || 0)}</td>
                            <td className="p-3 text-muted-foreground">-</td>
                            <td className="p-3 text-muted-foreground">-</td>
                            <td className="p-3 text-muted-foreground">-</td>
                            <td className="p-3 text-muted-foreground italic">{t('لم يُحسب')}</td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-muted-foreground">{t('بانتظار الإنشاء')}</Badge>
                            </td>
                            <td className="p-3">
                              <Button size="sm" variant="outline" onClick={() => calculatePayroll(emp.id)} data-testid={`calc-payroll-${emp.id}`}>
                                <Calculator className="h-4 w-4 ml-2" /> {t('حساب الراتب')}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Biometric Devices Tab */}
          <TabsContent value="biometric">
            <Card>
              <CardContent className="p-6">
                <BiometricDevices branches={branches} onDataRefresh={fetchData} />
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
                  <p className="text-muted-foreground">{t('شهر')}: {payrollPreview.month}</p>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-card border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{t('الراتب الأساسي')}</p>
                    <p className="text-lg font-bold">{formatPrice(payrollPreview.basic_salary)}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{t('السعر اليومي')}</p>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatPrice(payrollPreview.daily_rate || (payrollPreview.basic_salary/30))}</p>
                    <p className="text-[10px] text-muted-foreground">{t('= الأساسي ÷ 30')}</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{t('أيام العمل الفعلية')}</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{payrollPreview.worked_days}</p>
                    <p className="text-[10px] text-muted-foreground">{t('يوم')}</p>
                  </div>
                </div>
                
                {/* الراتب المستحق بعد التناسب */}
                <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{t('الراتب المستحق (pro-rata)')}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatPrice(payrollPreview.daily_rate || (payrollPreview.basic_salary/30))} × {payrollPreview.worked_days} {t('يوم')}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-primary" data-testid="earned-salary">
                    {formatPrice(payrollPreview.earned_salary)}
                  </p>
                </div>
                
                <div className="space-y-2 bg-muted/30 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span>+ {t('المكافآت')}</span>
                    <span className="text-green-600 font-semibold">+{formatPrice(payrollPreview.total_bonuses)}</span>
                  </div>
                  {payrollPreview.overtime_pay > 0 && (
                    <div className="flex justify-between">
                      <span>+ {t('وقت إضافي معتمد')}</span>
                      <span className="text-green-600 font-semibold">+{formatPrice(payrollPreview.overtime_pay)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>- {t('الخصومات')}</span>
                    <span className="text-red-600 font-semibold">-{formatPrice(payrollPreview.total_deductions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>- {t('استقطاع السلف')}</span>
                    <span className="text-orange-600 font-semibold">-{formatPrice(payrollPreview.advance_deduction)}</span>
                  </div>
                  <hr className="border-primary/30" />
                  <div className="flex justify-between text-xl font-bold">
                    <span>{t('صافي الراتب')}</span>
                    <span className={payrollPreview.net_salary < 0 ? 'text-red-600' : 'text-primary'} data-testid="net-salary">
                      {formatPrice(payrollPreview.net_salary)}
                    </span>
                  </div>
                  {payrollPreview.net_salary < 0 && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-400">
                      ⚠️ {t('صافي الراتب سالب - الموظف مدين للشركة بمبلغ')} {formatPrice(Math.abs(payrollPreview.net_salary))}
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setPayrollDialogOpen(false)}>{t('إلغاء')}</Button>
                  <Button onClick={createPayroll}>{t('إنشاء كشف الراتب')}</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Biometric Push Dialog */}
        <Dialog open={biometricDialogOpen} onOpenChange={setBiometricDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-blue-500" />
                {pushingEmployee ? t('إصدار موظف للبصمة') : t('إصدار جميع الموظفين للبصمة')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {pushingEmployee && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="font-bold">{pushingEmployee.name}</p>
                  <p className="text-sm text-muted-foreground">{pushingEmployee.position} - {branches.find(b => b.id === pushingEmployee.branch_id)?.name}</p>
                  {pushingEmployee.biometric_uid && (
                    <Badge className="mt-1 bg-green-500/10 text-green-500">{t('رقم البصمة الحالي')}: #{pushingEmployee.biometric_uid}</Badge>
                  )}
                </div>
              )}
              {!pushingEmployee && (
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <p className="text-sm">{t('سيتم إصدار جميع الموظفين النشطين للجهاز المختار')}</p>
                  <p className="text-sm font-bold mt-1">{t('عدد الموظفين')}: {employees.filter(e => e.is_active).length}</p>
                </div>
              )}
              <div>
                <Label>{t('جهاز البصمة')} *</Label>
                <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                  <SelectTrigger data-testid="select-biometric-device">
                    <SelectValue placeholder={t('اختر جهاز البصمة')} />
                  </SelectTrigger>
                  <SelectContent>
                    {biometricDevices.map(dev => (
                      <SelectItem key={dev.id} value={dev.id}>
                        {dev.name} ({dev.ip_address}:{dev.port || 4370})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {biometricDevices.length === 0 && (
                <p className="text-sm text-red-400">{t('لا توجد أجهزة بصمة. أضف جهاز من تبويب "أجهزة البصمة"')}</p>
              )}
              <div className="flex gap-2">
                {pushingEmployee ? (
                  <Button className="flex-1" onClick={handlePushToDevice} disabled={!selectedDevice} data-testid="confirm-push-btn">
                    <Fingerprint className="h-4 w-4 ml-2" /> {t('إصدار للجهاز')}
                  </Button>
                ) : (
                  <Button className="flex-1" onClick={handlePushAllToDevice} disabled={!selectedDevice || pushingAll} data-testid="confirm-push-all-btn">
                    <Fingerprint className="h-4 w-4 ml-2" /> 
                    {pushingAll ? t('جاري الإرسال...') : t('إصدار الكل للجهاز')}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Face Photo Dialog */}
        <Dialog open={facePhotoDialogOpen} onOpenChange={setFacePhotoDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                {t('صورة الوجه')} - {facePhotoEmployee?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4">
              {facePhotoLoading ? (
                <div className="w-48 h-48 rounded-full bg-muted flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : facePhotoData ? (
                <div className="relative">
                  <img
                    src={facePhotoData}
                    alt={facePhotoEmployee?.name}
                    className="w-48 h-48 rounded-full object-cover border-4 border-primary/30 shadow-lg"
                    data-testid="face-photo-image"
                  />
                  <Badge className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-green-500">
                    {t('محفوظة')}
                  </Badge>
                </div>
              ) : (
                <div className="w-48 h-48 rounded-full bg-muted/50 border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2">
                  <Camera className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground text-center px-4">{t('لا توجد صورة وجه')}</p>
                </div>
              )}
              
              <div className="text-center space-y-1">
                <p className="font-medium">{facePhotoEmployee?.name}</p>
                {facePhotoEmployee?.biometric_uid && (
                  <p className="text-sm text-muted-foreground">UID: #{facePhotoEmployee.biometric_uid}</p>
                )}
                {facePhotoEmployee?.position && (
                  <p className="text-sm text-muted-foreground">{facePhotoEmployee.position}</p>
                )}
              </div>
              
              {/* الطرق الموصى بها: كاميرا + رفع ملف (الأكثر موثوقية 100%) */}
              <div className="w-full space-y-2">
                <p className="text-xs font-semibold text-center text-primary">{t('الطرق الموصى بها')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={startCamera}
                    data-testid="webcam-capture-btn"
                    className="flex flex-col items-center justify-center gap-1 p-4 bg-primary/10 border-2 border-primary/30 rounded-lg hover:bg-primary/20 transition-all"
                  >
                    <Camera className="h-6 w-6 text-primary" />
                    <span className="text-sm font-semibold">{t('التقاط بالكاميرا')}</span>
                    <span className="text-[10px] text-muted-foreground">{t('أسرع وأضمن')}</span>
                  </button>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleManualPhotoUpload} data-testid="manual-photo-upload" />
                    <div className="flex flex-col items-center justify-center gap-1 p-4 bg-primary/10 border-2 border-primary/30 rounded-lg hover:bg-primary/20 transition-all">
                      <Upload className="h-6 w-6 text-primary" />
                      <span className="text-sm font-semibold">{t('رفع من الجهاز')}</span>
                      <span className="text-[10px] text-muted-foreground">{t('صورة جاهزة')}</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* زر الإغلاق الوحيد - بارز */}
              <div className="w-full">
                <Button className="w-full" variant="outline" onClick={() => setFacePhotoDialogOpen(false)}>
                  {t('إغلاق')}
                </Button>
              </div>
              
              {/* قسم متقدم مطوي - للمستخدمين المتقدمين فقط */}
              <details className="w-full">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors py-2 text-center select-none">
                  {t('⚙️ خيارات متقدمة (معظم الأجهزة لا تدعمها)')}
                </summary>
                <div className="pt-2 space-y-2">
                  {facePhotoEmployee?.biometric_uid && (
                    <Button 
                      className="w-full" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleFetchFacePhoto(facePhotoEmployee)} 
                      disabled={facePhotoLoading} 
                      data-testid="refresh-face-photo-btn"
                    >
                      <Camera className="h-4 w-4 ml-2" />
                      {facePhotoLoading ? t('جاري الجلب من جهاز البصمة...') : t('محاولة جلب من جهاز البصمة')}
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full text-xs text-muted-foreground"
                    onClick={handleProbeDevice} 
                    disabled={probeLoading}
                    data-testid="probe-device-btn"
                  >
                    {probeLoading ? t('جاري فحص الجهاز... (قد يستغرق حتى 90 ثانية)') : t('فحص اتصال الجهاز (تشخيص)')}
                  </Button>
                  {probeResult && (
                    <div className="mt-2 p-2 bg-muted rounded text-xs font-mono max-h-40 overflow-auto" data-testid="probe-result">
                      {probeResult.udp_4370 !== undefined && (
                        <p>UDP 4370: <span className={probeResult.udp_4370 ? 'text-green-500' : 'text-red-500'}>{probeResult.udp_4370 ? 'OK' : 'FAIL'}</span></p>
                      )}
                      {probeResult.http_probes?.map((p, i) => (
                        <p key={i}>
                          {p.port && `Port ${p.port}`} {p.cred && `[${p.cred}]`} {p.path || ''}: 
                          <span className={p.status === 200 ? 'text-green-500' : p.status === 401 ? 'text-yellow-500' : 'text-red-500'}>
                            {` ${p.status}`}
                          </span>
                        </p>
                      ))}
                      {probeResult.error && <p className="text-red-500">{probeResult.error}</p>}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground text-center italic">
                    {t('ملاحظة: معظم أجهزة ZKTeco لا تدعم تصدير الصور — استخدم الكاميرا أو رفع الملف')}
                  </p>
                </div>
              </details>
            </div>
          </DialogContent>
        </Dialog>

        {/* Camera Capture Dialog */}
        <Dialog open={cameraDialogOpen} onOpenChange={(open) => { if (!open) stopCamera(); }}>
          <DialogContent className="max-w-lg" data-testid="camera-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                {t('التقاط صورة')} - {facePhotoEmployee?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  data-testid="camera-video"
                />
                {/* إطار توجيه للوجه */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-56 h-56 rounded-full border-4 border-white/60 shadow-lg"></div>
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <p className="text-sm text-muted-foreground text-center">
                {t('ضع الوجه داخل الدائرة ثم اضغط "التقاط"')}
              </p>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={stopCamera} data-testid="camera-cancel-btn">
                  {t('إلغاء')}
                </Button>
                <Button className="flex-1" onClick={captureCameraPhoto} data-testid="camera-capture-btn">
                  <Camera className="h-4 w-4 ml-2" />
                  {t('التقاط')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
