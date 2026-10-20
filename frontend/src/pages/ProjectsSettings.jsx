import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ProjectColorBadge, ProjectColorPicker, nextFreeColor, projectColorOf } from '../components/ProjectColor';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../utils/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ProjectLogoUpload, resolveImageUrl } from '../components/ProjectLogoUpload';
import { Briefcase, Plus, Trash2, Edit, UserPlus, Store, Scissors, Stethoscope, ShoppingCart, Truck, Factory, Package, MoreHorizontal } from 'lucide-react';

const ACTIVITY_TYPES = [
  { value: 'restaurant', label: 'مطعم', icon: Store },
  { value: 'salon', label: 'صالون', icon: Scissors },
  { value: 'clinic', label: 'عيادة', icon: Stethoscope },
  { value: 'supermarket', label: 'سوبرماركت', icon: ShoppingCart },
  { value: 'distribution', label: 'توزيع', icon: Package },
  { value: 'delivery_company', label: 'شركة توصيل', icon: Truck },
  { value: 'manufacturing', label: 'تصنيع', icon: Factory },
  { value: 'retail', label: 'تجزئة', icon: Store },
  { value: 'other', label: 'أخرى', icon: MoreHorizontal },
];

// قائمة العملات الشائعة عالمياً (رمز + اسم عربي)
const CURRENCIES = [
  { code: 'IQD', label: 'دينار عراقي (IQD)' },
  { code: 'USD', label: 'دولار أمريكي (USD)' },
  { code: 'EUR', label: 'يورو (EUR)' },
  { code: 'GBP', label: 'جنيه إسترليني (GBP)' },
  { code: 'SAR', label: 'ريال سعودي (SAR)' },
  { code: 'AED', label: 'درهم إماراتي (AED)' },
  { code: 'KWD', label: 'دينار كويتي (KWD)' },
  { code: 'BHD', label: 'دينار بحريني (BHD)' },
  { code: 'OMR', label: 'ريال عماني (OMR)' },
  { code: 'QAR', label: 'ريال قطري (QAR)' },
  { code: 'JOD', label: 'دينار أردني (JOD)' },
  { code: 'EGP', label: 'جنيه مصري (EGP)' },
  { code: 'LBP', label: 'ليرة لبنانية (LBP)' },
  { code: 'SYP', label: 'ليرة سورية (SYP)' },
  { code: 'YER', label: 'ريال يمني (YER)' },
  { code: 'LYD', label: 'دينار ليبي (LYD)' },
  { code: 'DZD', label: 'دينار جزائري (DZD)' },
  { code: 'MAD', label: 'درهم مغربي (MAD)' },
  { code: 'TND', label: 'دينار تونسي (TND)' },
  { code: 'SDG', label: 'جنيه سوداني (SDG)' },
  { code: 'TRY', label: 'ليرة تركية (TRY)' },
  { code: 'IRR', label: 'ريال إيراني (IRR)' },
  { code: 'PKR', label: 'روبية باكستانية (PKR)' },
  { code: 'INR', label: 'روبية هندية (INR)' },
  { code: 'CNY', label: 'يوان صيني (CNY)' },
  { code: 'JPY', label: 'ين ياباني (JPY)' },
  { code: 'CAD', label: 'دولار كندي (CAD)' },
  { code: 'AUD', label: 'دولار أسترالي (AUD)' },
  { code: 'CHF', label: 'فرنك سويسري (CHF)' },
  { code: 'RUB', label: 'روبل روسي (RUB)' },
];

// قائمة المناطق الزمنية الشائعة (خصوصاً العربية)
const TIMEZONES = [
  { value: 'Asia/Baghdad', label: 'بغداد (GMT+3)' },
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Asia/Kuwait', label: 'الكويت (GMT+3)' },
  { value: 'Asia/Qatar', label: 'قطر (GMT+3)' },
  { value: 'Asia/Bahrain', label: 'البحرين (GMT+3)' },
  { value: 'Asia/Dubai', label: 'دبي / أبوظبي (GMT+4)' },
  { value: 'Asia/Muscat', label: 'مسقط (GMT+4)' },
  { value: 'Asia/Amman', label: 'عمّان (GMT+3)' },
  { value: 'Asia/Beirut', label: 'بيروت (GMT+3)' },
  { value: 'Asia/Damascus', label: 'دمشق (GMT+3)' },
  { value: 'Asia/Jerusalem', label: 'القدس (GMT+2)' },
  { value: 'Asia/Aden', label: 'صنعاء / عدن (GMT+3)' },
  { value: 'Asia/Tehran', label: 'طهران (GMT+3:30)' },
  { value: 'Asia/Istanbul', label: 'إسطنبول (GMT+3)' },
  { value: 'Asia/Karachi', label: 'كراتشي (GMT+5)' },
  { value: 'Asia/Kolkata', label: 'الهند (GMT+5:30)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+2)' },
  { value: 'Africa/Khartoum', label: 'الخرطوم (GMT+2)' },
  { value: 'Africa/Tripoli', label: 'طرابلس (GMT+2)' },
  { value: 'Africa/Tunis', label: 'تونس (GMT+1)' },
  { value: 'Africa/Algiers', label: 'الجزائر (GMT+1)' },
  { value: 'Africa/Casablanca', label: 'الدار البيضاء (GMT+1)' },
  { value: 'Europe/London', label: 'لندن (GMT+0)' },
  { value: 'Europe/Paris', label: 'باريس (GMT+1)' },
  { value: 'Europe/Berlin', label: 'برلين (GMT+1)' },
  { value: 'Europe/Moscow', label: 'موسكو (GMT+3)' },
  { value: 'America/New_York', label: 'نيويورك (GMT-5)' },
  { value: 'America/Los_Angeles', label: 'لوس أنجلوس (GMT-8)' },
  { value: 'UTC', label: 'التوقيت العالمي (UTC)' },
];

export default function ProjectsSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects, refreshProjects } = useProject();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ exchange_rate: '', reason: '' });
  const [rateHistory, setRateHistory] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    name: '', name_en: '', activity_type: 'restaurant',
    logo_url: '', currency: 'IQD', timezone: 'Asia/Baghdad', description: '',
    exchange_rate: '', color: '',
  });

  const [adminForm, setAdminForm] = useState({
    username: '', email: '', password: '', full_name: '', phone: '',
  });

  const isOwner = ['super_admin', 'admin', 'general_manager', 'enterprise_owner'].includes(user?.role);

  // العملة الرئيسية للمؤسسة = عملة المشروع الافتراضي
  const mainCurrency = React.useMemo(() => {
    const def = (projects || []).find(p => p.is_default);
    return def?.currency || 'IQD';
  }, [projects]);

  // معلومة العملة المختارة (رمز → اسم عربي)
  const currencyLabel = (code) => (CURRENCIES.find(c => c.code === code) || { label: code }).label;

  const resetForm = () => {
    setForm({
      name: '', name_en: '', activity_type: 'restaurant',
      logo_url: '', currency: 'IQD', timezone: 'Asia/Baghdad', description: '',
      exchange_rate: '', owner_name: '', owner_phone: '',
      color: nextFreeColor(projects),
    });
    setLogoFile(null);
    setEditingProject(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (p) => {
    setEditingProject(p);
    setLogoFile(null);
    setForm({
      name: p.name || '', name_en: p.name_en || '', activity_type: p.activity_type || 'restaurant',
      logo_url: p.logo_url || '', currency: p.currency || 'IQD', timezone: p.timezone || 'Asia/Baghdad',
      description: p.description || '', exchange_rate: p.exchange_rate ? String(p.exchange_rate) : '',
      owner_name: p.owner_name || '', owner_phone: p.owner_phone || '',
      color: projectColorOf(projects, p.id),
    });
    setDialogOpen(true);
  };

  const logoPreview = React.useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : form.logo_url),
    [logoFile, form.logo_url]
  );

  const uploadLogo = async (projectId) => {
    if (!logoFile) return;
    const fd = new FormData();
    fd.append('file', logoFile);
    await axios.post(`${API_URL}/projects/${projectId}/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  };

  const handleUpdate = async () => {
    if (!form.name.trim()) { toast.error('الاسم مطلوب'); return; }
    setSaving(true);
    try {
      const { exchange_rate, ...rest } = form;
      await axios.put(`${API_URL}/projects/${editingProject.id}`, { ...rest, name: form.name.trim() });
      try { await uploadLogo(editingProject.id); } catch (e) {
        toast.error(e.response?.data?.detail || 'تم حفظ البيانات لكن فشل رفع الصورة');
        refreshProjects();
        return;
      }
      toast.success('تم تحديث بيانات المشروع');
      resetForm();
      setDialogOpen(false);
      refreshProjects();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تحديث المشروع');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('الاسم مطلوب'); return; }
    // إذا العملة تختلف عن الرئيسية → سعر الصرف مطلوب وأكبر من صفر
    if (form.currency !== mainCurrency) {
      const rate = parseFloat(form.exchange_rate);
      if (!rate || rate <= 0) {
        toast.error(`أدخل سعر صرف صحيح لتحويل ${currencyLabel(form.currency)} إلى ${currencyLabel(mainCurrency)}`);
        return;
      }
    }
    try {
      const payload = {
        ...form,
        color: form.color || undefined,
        exchange_rate: form.currency === mainCurrency ? 1.0 : parseFloat(form.exchange_rate),
      };
      setSaving(true);
      const res = await axios.post(`${API_URL}/projects`, payload);
      try { await uploadLogo(res.data?.project?.id); } catch (e) {
        toast.error(e.response?.data?.detail || 'تم إنشاء المشروع لكن فشل رفع الصورة');
        resetForm();
        setDialogOpen(false);
        refreshProjects();
        return;
      }
      toast.success('تم إنشاء المشروع بنجاح');
      resetForm();
      setDialogOpen(false);
      refreshProjects();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل إنشاء المشروع');
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (p) => {
    if (p.is_default) { toast.error('لا يمكن حذف المشروع الرئيسي'); return; }
    setDeleteTarget(p);
    setDeleteConfirm('');
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/projects/${deleteTarget.id}`);
      toast.success(`تم حذف مشروع "${deleteTarget.name}" وكل بياناته نهائياً`);
      setDeleteTarget(null);
      refreshProjects();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحذف');
    } finally {
      setDeleting(false);
    }
  };

  const handleAssignAdmin = async () => {
    if (!adminForm.email || !adminForm.password) { toast.error('البريد وكلمة المرور مطلوبان'); return; }
    try {
      const res = await axios.post(`${API_URL}/projects/${selectedProject.id}/assign-admin`, adminForm);
      toast.success('تم تعيين مدير المشروع بنجاح');
      if (res.data?.whatsapp_sent) toast.success('📲 أُرسلت رسالة تجريبية ببيانات الدخول إلى واتساب المدير');
      else if (adminForm.phone) toast.warning(`لم تصل رسالة الواتساب: ${res.data?.whatsapp_error || 'تحقق من ربط الواتساب'}`);
      setAdminDialogOpen(false);
      setAdminForm({ username: '', email: '', password: '', full_name: '', phone: '' });
      refreshProjects();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تعيين المدير');
    }
  };

  const openRateDialog = (p) => {
    setSelectedProject(p);
    setRateForm({ exchange_rate: String(p.exchange_rate || ''), reason: '' });
    setRateDialogOpen(true);
  };

  const handleUpdateRate = async () => {
    const rate = parseFloat(rateForm.exchange_rate);
    if (!rate || rate <= 0) { toast.error('أدخل سعر صرف صحيح'); return; }
    try {
      await axios.patch(`${API_URL}/projects/${selectedProject.id}/exchange-rate`, {
        exchange_rate: rate,
        reason: rateForm.reason || null,
      });
      toast.success('تم تحديث سعر الصرف وحفظه في السجل التاريخي');
      setRateDialogOpen(false);
      refreshProjects();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تحديث سعر الصرف');
    }
  };

  const openHistoryDialog = async (p) => {
    setSelectedProject(p);
    setHistoryDialogOpen(true);
    try {
      const res = await axios.get(`${API_URL}/projects/${p.id}/exchange-rate-history`);
      setRateHistory(res.data.history || []);
    } catch (e) {
      setRateHistory([]);
      toast.error('فشل جلب السجل التاريخي');
    }
  };

  const getActivityMeta = (type) => ACTIVITY_TYPES.find(a => a.value === type) || ACTIVITY_TYPES[0];

  if (!isOwner) {
    return (
      <div className="p-6" data-testid="projects-settings-restricted">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">هذه الصفحة متاحة لمالك المؤسسة فقط.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="projects-settings-page" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            إدارة المشاريع
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            كل مشروع = كيان مستقل تماماً (خزينة، موارد بشرية، مخزون، تقارير)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button data-testid="add-project-btn" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          مشروع جديد
        </Button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl" data-testid="project-form-dialog">
            <DialogHeader>
              <DialogTitle>{editingProject ? `تعديل المشروع: ${editingProject.name}` : 'إنشاء مشروع جديد'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>شعار المشروع (يظهر في الفواتير والرسائل)</Label>
                <div className="mt-2">
                  <ProjectLogoUpload
                    preview={logoPreview}
                    onSelect={setLogoFile}
                    onClear={() => { setLogoFile(null); setForm(f => ({ ...f, logo_url: '' })); }}
                  />
                </div>
              </div>
              <div>
                <Label>اسم المشروع *</Label>
                <Input
                  data-testid="project-name-input"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: مطعم GRaffiti"
                />
              </div>
              <div>
                <Label>الاسم بالإنجليزية</Label>
                <Input
                  data-testid="project-name-en-input"
                  value={form.name_en}
                  onChange={e => setForm({ ...form, name_en: e.target.value })}
                  placeholder="GRaffiti Restaurant"
                />
              </div>
              <div>
                <Label>نوع النشاط *</Label>
                <Select value={form.activity_type} onValueChange={v => setForm({ ...form, activity_type: v })}>
                  <SelectTrigger data-testid="project-activity-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map(a => (
                      <SelectItem key={a.value} value={a.value} data-testid={`activity-${a.value}`}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>العملة</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(v) => setForm({ ...form, currency: v, exchange_rate: v === mainCurrency ? '' : form.exchange_rate })}
                  >
                    <SelectTrigger data-testid="project-currency-select">
                      <SelectValue placeholder="اختر العملة" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {CURRENCIES.map(c => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المنطقة الزمنية</Label>
                  <Select
                    value={form.timezone}
                    onValueChange={(v) => setForm({ ...form, timezone: v })}
                  >
                    <SelectTrigger data-testid="project-timezone-select">
                      <SelectValue placeholder="اختر المنطقة الزمنية" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {TIMEZONES.map(tz => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* 💱 سعر الصرف — يظهر فقط عند اختيار عملة مختلفة عن العملة الرئيسية للمؤسسة */}
              {!editingProject && form.currency !== mainCurrency && (
                <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/5 space-y-2" data-testid="exchange-rate-box">
                  <Label className="text-amber-500 flex items-center gap-2">
                    💱 سعر الصرف مقارنة بعملة المؤسسة الرئيسية
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    عملة المؤسسة الرئيسية: <span className="font-bold">{currencyLabel(mainCurrency)}</span> — عملة المشروع: <span className="font-bold">{currencyLabel(form.currency)}</span>
                    <br />
                    ملاحظة: النظام سيحوّل كل مبيعات/مصاريف هذا المشروع تلقائياً إلى {mainCurrency} في تقارير المؤسسة المجمّعة.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm whitespace-nowrap">1 {form.currency} =</span>
                    <Input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={form.exchange_rate}
                      onChange={e => setForm({ ...form, exchange_rate: e.target.value })}
                      placeholder="مثال: 1460"
                      className="max-w-[160px]"
                      data-testid="project-exchange-rate-input"
                    />
                    <span className="text-sm whitespace-nowrap">{mainCurrency}</span>
                  </div>
                </div>
              )}
              <ProjectColorPicker value={form.color} onChange={(c) => setForm(f => ({ ...f, color: c }))} />
              <div>
                <Label>وصف (اختياري)</Label>
                <Textarea data-testid="project-description-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2 p-2 rounded-lg border border-dashed">
                <p className="col-span-2 text-xs text-muted-foreground">مالك المشروع (إن كان المشروع مملوكاً أو مباعاً لشخص آخر) — يستلم تقارير الورديات وتنبيهات المخزون على واتساب</p>
                <div><Label>اسم المالك</Label><Input data-testid="project-owner-name-input" value={form.owner_name || ''} onChange={e => setForm({ ...form, owner_name: e.target.value })} /></div>
                <div><Label>هاتف المالك (واتساب)</Label><Input data-testid="project-owner-phone-input" dir="ltr" placeholder="07xxxxxxxxx" value={form.owner_phone || ''} onChange={e => setForm({ ...form, owner_phone: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button data-testid="save-project-btn" disabled={saving} onClick={editingProject ? handleUpdate : handleCreate}>
                {saving ? 'جارٍ الحفظ...' : (editingProject ? 'حفظ التعديلات' : 'إنشاء')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => {
          const meta = getActivityMeta(p.activity_type);
          const Icon = meta.icon;
          return (
            <Card key={p.id} className="relative overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition-[transform,box-shadow] duration-300" style={{ borderColor: `${projectColorOf(projects, p.id)}59`, backgroundImage: `radial-gradient(120% 60% at 100% 0%, ${projectColorOf(projects, p.id)}14, transparent 60%)` }} data-testid={`project-card-${p.id}`}>
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${projectColorOf(projects, p.id)}, ${projectColorOf(projects, p.id)}33)` }} data-testid={`project-color-bar-${p.id}`} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {p.logo_url ? (
                      <img
                        src={resolveImageUrl(p.logo_url)}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover border-2" style={{ borderColor: projectColorOf(projects, p.id) }}
                        data-testid={`project-logo-${p.id}`}
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${projectColorOf(projects, p.id)}26` }}>
                        <Icon className="h-5 w-5" style={{ color: projectColorOf(projects, p.id) }} />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <div className="mt-1"><ProjectColorBadge projectId={p.id} name={meta.label} testId={`project-card-badge-${p.id}`} /></div>
                    </div>
                  </div>
                  {p.is_default && <Badge variant="outline" className="text-[10px] opacity-60">تجريبي</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>العملة: <span className="font-bold text-foreground">{p.currency}</span> {p.currency !== mainCurrency && (<span className="text-amber-500">(المؤسسة: {mainCurrency})</span>)}</div>
                  {p.currency !== mainCurrency && p.exchange_rate && p.exchange_rate > 0 && (
                    <div className="text-amber-500 flex items-center gap-2 flex-wrap">
                      💱 <span>1 {p.currency} = {p.exchange_rate.toLocaleString()} {mainCurrency}</span>
                      <button
                        onClick={() => openRateDialog(p)}
                        className="underline hover:text-amber-400 text-[11px]"
                        data-testid={`update-rate-btn-${p.id}`}
                      >
                        تحديث السعر
                      </button>
                      <button
                        onClick={() => openHistoryDialog(p)}
                        className="underline hover:text-amber-400 text-[11px]"
                        data-testid={`rate-history-btn-${p.id}`}
                      >
                        السجل التاريخي
                      </button>
                    </div>
                  )}
                  <div>المنطقة الزمنية: {p.timezone}</div>
                  {p.admin_user_id && <Badge variant="outline" className="text-xs">مدير مُعيّن</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1"
                    onClick={() => openEdit(p)}
                    data-testid={`edit-project-btn-${p.id}`}
                  >
                    <Edit className="h-3.5 w-3.5" />
                    تعديل المشروع
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1"
                    onClick={() => { setSelectedProject(p); setAdminDialogOpen(true); }}
                    data-testid={`assign-admin-btn-${p.id}`}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    تعيين مدير
                  </Button>
                  {!p.is_default && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => openDelete(p)}
                      data-testid={`delete-project-btn-${p.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 🗑️ Dialog الحذف النهائي */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md" dir="rtl" data-testid="delete-project-dialog">
          <DialogHeader>
            <DialogTitle className="text-destructive">حذف المشروع نهائياً: {deleteTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
              سيتم حذف المشروع مع كل بياناته نهائياً (الفروع، الطلبات، المصاريف، المخزون، الموظفين، الورديات...). لا يمكن التراجع عن هذه العملية.
            </p>
            <Label>للتأكيد اكتب اسم المشروع: <b>{deleteTarget?.name}</b></Label>
            <Input
              data-testid="delete-project-confirm-input"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={deleteTarget?.name}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              data-testid="confirm-delete-project-btn"
              disabled={deleting || deleteConfirm.trim() !== (deleteTarget?.name || '').trim()}
              onClick={handleDelete}
            >
              {deleting ? 'جارٍ الحذف...' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog تعيين مدير */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعيين مدير للمشروع: {selectedProject?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم الكامل *</Label>
              <Input
                data-testid="admin-fullname-input"
                value={adminForm.full_name}
                onChange={e => setAdminForm({ ...adminForm, full_name: e.target.value })}
              />
            </div>
            <div>
              <Label>اسم المستخدم *</Label>
              <Input
                data-testid="admin-username-input"
                value={adminForm.username}
                onChange={e => setAdminForm({ ...adminForm, username: e.target.value })}
              />
            </div>
            <div>
              <Label>البريد الإلكتروني *</Label>
              <Input
                data-testid="admin-email-input"
                type="email"
                value={adminForm.email}
                onChange={e => setAdminForm({ ...adminForm, email: e.target.value })}
              />
            </div>
            <div>
              <Label>كلمة المرور *</Label>
              <Input
                data-testid="admin-password-input"
                type="password"
                value={adminForm.password}
                onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
              />
            </div>
            <div>
              <Label>الهاتف</Label>
              <Input
                data-testid="admin-phone-input"
                value={adminForm.phone}
                onChange={e => setAdminForm({ ...adminForm, phone: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground bg-yellow-50 border border-yellow-200 p-2 rounded">
              ⚠️ هذا المدير سيرى/يدير مشروع "{selectedProject?.name}" <b>فقط</b> — معزول تماماً عن باقي المشاريع.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialogOpen(false)}>إلغاء</Button>
            <Button data-testid="save-admin-btn" onClick={handleAssignAdmin}>تعيين</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 💱 Dialog تحديث سعر الصرف */}
      <Dialog open={rateDialogOpen} onOpenChange={setRateDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl" data-testid="update-rate-dialog">
          <DialogHeader>
            <DialogTitle>💱 تحديث سعر الصرف: {selectedProject?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
              <div>عملة المشروع: <span className="font-bold">{selectedProject?.currency}</span></div>
              <div>عملة المؤسسة الرئيسية: <span className="font-bold">{mainCurrency}</span></div>
              <div>السعر الحالي: <span className="font-bold">1 {selectedProject?.currency} = {selectedProject?.exchange_rate?.toLocaleString()} {mainCurrency}</span></div>
            </div>
            <div>
              <Label>السعر الجديد (1 {selectedProject?.currency} = ؟ {mainCurrency})</Label>
              <Input
                type="number"
                step="0.000001"
                min="0"
                value={rateForm.exchange_rate}
                onChange={e => setRateForm({ ...rateForm, exchange_rate: e.target.value })}
                data-testid="new-rate-input"
              />
            </div>
            <div>
              <Label>سبب التغيير (اختياري)</Label>
              <Textarea
                value={rateForm.reason}
                onChange={e => setRateForm({ ...rateForm, reason: e.target.value })}
                placeholder="مثال: ارتفاع الدولار في السوق المحلي"
                data-testid="rate-reason-input"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              🕓 سيتم تسجيل هذا التغيير في السجل التاريخي مع التاريخ والوقت واسمك، لضمان دقة التقارير التاريخية.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateDialogOpen(false)}>إلغاء</Button>
            <Button data-testid="save-rate-btn" onClick={handleUpdateRate}>حفظ السعر الجديد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 🕓 Dialog السجل التاريخي لسعر الصرف */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl" data-testid="rate-history-dialog">
          <DialogHeader>
            <DialogTitle>🕓 السجل التاريخي لأسعار الصرف: {selectedProject?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {rateHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد تغييرات مسجّلة بعد</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-right">التاريخ والوقت</th>
                    <th className="p-2 text-right">السعر القديم</th>
                    <th className="p-2 text-right">السعر الجديد</th>
                    <th className="p-2 text-right">التغيير %</th>
                    <th className="p-2 text-right">بواسطة</th>
                    <th className="p-2 text-right">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {rateHistory.map(h => {
                    const pct = h.old_rate ? ((h.new_rate - h.old_rate) / h.old_rate * 100).toFixed(2) : '—';
                    const dir = h.new_rate > h.old_rate ? 'text-red-500' : 'text-green-500';
                    return (
                      <tr key={h.id} className="border-t">
                        <td className="p-2 text-xs">{new Date(h.changed_at).toLocaleString('ar-IQ')}</td>
                        <td className="p-2 font-mono">{h.old_rate?.toLocaleString()}</td>
                        <td className="p-2 font-mono font-bold">{h.new_rate?.toLocaleString()}</td>
                        <td className={`p-2 font-bold ${dir}`}>{pct !== '—' ? `${pct > 0 ? '+' : ''}${pct}%` : '—'}</td>
                        <td className="p-2 text-xs">{h.changed_by_name || '—'}</td>
                        <td className="p-2 text-xs">{h.reason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
