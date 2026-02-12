import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { API_URL, BACKEND_URL } from '../utils/api';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import {
  Printer,
  Plus,
  Trash2,
  Edit,
  FileText,
  Settings,
  Eye,
  Home,
  Wifi,
  WifiOff,
  Check,
  QrCode,
  Image as ImageIcon,
  Type,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
const API = API_URL;
export default function Invoices() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('templates');
  const [templates, setTemplates] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  
  const [templateForm, setTemplateForm] = useState({
    name: '',
    template_type: 'receipt',
    show_logo: true,
    logo_url: '',
    business_name: '',
    business_name_en: '',
    address: '',
    phone: '',
    tax_number: '',
    footer_text: 'شكراً لزيارتكم',
    footer_text_en: 'Thank you for your visit',
    show_qr_code: false,
    paper_width: 80,
    branch_id: '',
    is_default: false
  });
  
  const [printerForm, setPrinterForm] = useState({
    name: '',
    printer_type: 'thermal',
    paper_width: 80,
    connection_type: 'network',
    ip_address: '',
    port: 9100,
    branch_id: '',
    is_default: false
  });
  useEffect(() => {
    fetchData();
  }, []);
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [templatesRes, printersRes, branchesRes] = await Promise.all([
        axios.get(`${API}/invoices/templates`, { headers }),
        axios.get(`${API}/invoices/printers`, { headers }),
        axios.get(`${API}/branches`, { headers })
      ]);
      
      setTemplates(templatesRes.data);
      setPrinters(printersRes.data);
      setBranches(branchesRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    
    if (!templateForm.name || !templateForm.business_name) {
      toast.error('الاسم واسم المنشأة مطلوبان');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      if (editingTemplate) {
        await axios.put(`${API}/invoices/templates/${editingTemplate.id}`, templateForm, { headers });
        toast.success('تم تحديث القالب');
      } else {
        await axios.post(`${API}/invoices/templates`, templateForm, { headers });
        toast.success('تم إنشاء القالب');
      }
      
      setTemplateDialogOpen(false);
      resetTemplateForm();
      fetchData();
    } catch (error) {
      toast.error('فشل في حفظ القالب');
    }
  };
  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القالب؟')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/invoices/templates/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('تم الحذف');
      fetchData();
    } catch (error) {
      toast.error(t('فشل في الحذف'));
    }
  };
  const handleSavePrinter = async (e) => {
    e.preventDefault();
    
    if (!printerForm.name || !printerForm.branch_id) {
      toast.error('الاسم والفرع مطلوبان');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/invoices/printers`, printerForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('تم إضافة الطابعة');
      setPrinterDialogOpen(false);
      resetPrinterForm();
      fetchData();
    } catch (error) {
      toast.error('فشل في إضافة الطابعة');
    }
  };
  const handleDeletePrinter = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الطابعة؟')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/invoices/printers/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('تم الحذف');
      fetchData();
    } catch (error) {
      toast.error(t('فشل في الحذف'));
    }
  };
  const resetTemplateForm = () => {
    setTemplateForm({
      name: '', template_type: 'receipt', show_logo: true, logo_url: '',
      business_name: '', business_name_en: '', address: '', phone: '',
      tax_number: '', footer_text: 'شكراً لزيارتكم',
      footer_text_en: 'Thank you for your visit', show_qr_code: false,
      paper_width: 80, branch_id: '', is_default: false
    });
    setEditingTemplate(null);
  };
  const resetPrinterForm = () => {
    setPrinterForm({
      name: '', printer_type: 'thermal', paper_width: 80,
      connection_type: 'network', ip_address: '', port: 9100,
      branch_id: '', is_default: false
    });
  };
  const editTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateForm(template);
    setTemplateDialogOpen(true);
  };
  const previewTemplate = (template) => {
    setEditingTemplate(template);
    setPreviewDialogOpen(true);
  };
  const getBranchName = (branchId) => branches.find(b => b.id === branchId)?.name || 'الكل';
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <Home className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              الفواتير والطباعة
            </h1>
            <p className="text-sm text-muted-foreground">{t('تخصيص الفواتير وإدارة الطابعات')}</p>
          </div>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" /> قوالب الفواتير
          </TabsTrigger>
          <TabsTrigger value="printers" className="gap-2">
            <Printer className="h-4 w-4" /> الطابعات
          </TabsTrigger>
        </TabsList>
        {/* Templates Tab */}
        <TabsContent value="templates">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { resetTemplateForm(); setTemplateDialogOpen(true); }}>
              <Plus className="h-4 w-4 ml-2" /> قالب جديد
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-foreground">{template.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {template.template_type === 'receipt' ? 'فاتورة عميل' : 
                         template.template_type === 'kitchen' ? 'تذكرة مطبخ' : 'فاتورة توصيل'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => previewTemplate(template)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => editTemplate(template)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteTemplate(template.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-foreground">{template.business_name}</p>
                    {template.address && (
                      <p className="text-muted-foreground text-xs">{template.address}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {template.show_logo && <Badge variant="outline" className="text-xs">شعار</Badge>}
                    {template.show_qr_code && <Badge variant="outline" className="text-xs">QR</Badge>}
                    <Badge variant="outline" className="text-xs">{template.paper_width}mm</Badge>
                    {template.is_default && <Badge className="bg-primary/10 text-primary text-xs">افتراضي</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {templates.length === 0 && (
              <Card className="col-span-full border-border/50">
                <CardContent className="py-12 text-center">
                  <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground">{t('لا توجد قوالب')}</p>
                  <p className="text-sm text-muted-foreground">{t('أنشئ قالباً لتخصيص فواتيرك')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        {/* Printers Tab */}
        <TabsContent value="printers">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { resetPrinterForm(); setPrinterDialogOpen(true); }}>
              <Plus className="h-4 w-4 ml-2" /> إضافة طابعة
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {printers.map((printer) => (
              <Card key={printer.id} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                        <Printer className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground">{printer.name}</h3>
                        <p className="text-xs text-muted-foreground">{getBranchName(printer.branch_id)}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeletePrinter(printer.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t('النوع:')}</span>
                      <span className="text-foreground">
                        {printer.printer_type === 'thermal' ? 'حرارية' : 
                         printer.printer_type === 'laser' ? 'ليزر' : 'حبر'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t('العرض:')}</span>
                      <span className="text-foreground">{printer.paper_width}mm</span>
                    </div>
                    {printer.ip_address && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">IP:</span>
                        <span className="text-foreground font-mono text-xs">{printer.ip_address}:{printer.port}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {printer.is_active ? (
                      <Badge className="bg-green-500/10 text-green-500">
                        <Wifi className="h-3 w-3 ml-1" /> متصل
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/10 text-red-500">
                        <WifiOff className="h-3 w-3 ml-1" /> غير متصل
                      </Badge>
                    )}
                    {printer.is_default && <Badge className="bg-primary/10 text-primary">افتراضي</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {printers.length === 0 && (
              <Card className="col-span-full border-border/50">
                <CardContent className="py-12 text-center">
                  <Printer className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground">{t('لا توجد طابعات')}</p>
                  <p className="text-sm text-muted-foreground">{t('أضف طابعة للبدء بالطباعة')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingTemplate ? 'تعديل قالب الفاتورة' : 'إنشاء قالب فاتورة'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveTemplate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('اسم القالب *')}</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>{t('نوع القالب')}</Label>
                <Select
                  value={templateForm.template_type}
                  onValueChange={(v) => setTemplateForm({ ...templateForm, template_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receipt">{t('فاتورة عميل')}</SelectItem>
                    <SelectItem value="kitchen">{t('تذكرة مطبخ')}</SelectItem>
                    <SelectItem value="delivery">{t('فاتورة توصيل')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t('اسم المنشأة (عربي) *')}</Label>
              <Input
                value={templateForm.business_name}
                onChange={(e) => setTemplateForm({ ...templateForm, business_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>{t('اسم المنشأة (إنجليزي)')}</Label>
              <Input
                value={templateForm.business_name_en}
                onChange={(e) => setTemplateForm({ ...templateForm, business_name_en: e.target.value })}
                dir="ltr"
              />
            </div>
            <div>
              <Label>{t('العنوان')}</Label>
              <Input
                value={templateForm.address}
                onChange={(e) => setTemplateForm({ ...templateForm, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('رقم الهاتف')}</Label>
                <Input
                  value={templateForm.phone}
                  onChange={(e) => setTemplateForm({ ...templateForm, phone: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div>
                <Label>{t('الرقم الضريبي')}</Label>
                <Input
                  value={templateForm.tax_number}
                  onChange={(e) => setTemplateForm({ ...templateForm, tax_number: e.target.value })}
                  dir="ltr"
                />
              </div>
            </div>
            <div>
              <Label>{t('رابط الشعار')}</Label>
              <Input
                value={templateForm.logo_url}
                onChange={(e) => setTemplateForm({ ...templateForm, logo_url: e.target.value })}
                placeholder="https://..."
                dir="ltr"
              />
            </div>
            <div>
              <Label>{t('نص التذييل (عربي)')}</Label>
              <Textarea
                value={templateForm.footer_text}
                onChange={(e) => setTemplateForm({ ...templateForm, footer_text: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label>{t('نص التذييل (إنجليزي)')}</Label>
              <Textarea
                value={templateForm.footer_text_en}
                onChange={(e) => setTemplateForm({ ...templateForm, footer_text_en: e.target.value })}
                rows={2}
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('عرض الورق')}</Label>
                <Select
                  value={templateForm.paper_width.toString()}
                  onValueChange={(v) => setTemplateForm({ ...templateForm, paper_width: parseInt(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58">58mm</SelectItem>
                    <SelectItem value="80">80mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('الفرع')}</Label>
                <Select
                  value={templateForm.branch_id}
                  onValueChange={(v) => setTemplateForm({ ...templateForm, branch_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder={t('الكل')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('الكل')}</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={templateForm.show_logo}
                  onCheckedChange={(v) => setTemplateForm({ ...templateForm, show_logo: v })}
                />
                <Label>{t('إظهار الشعار')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={templateForm.show_qr_code}
                  onCheckedChange={(v) => setTemplateForm({ ...templateForm, show_qr_code: v })}
                />
                <Label>{t('إظهار QR Code')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={templateForm.is_default}
                  onCheckedChange={(v) => setTemplateForm({ ...templateForm, is_default: v })}
                />
                <Label>{t('افتراضي')}</Label>
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)} className="flex-1">
                {t('إلغاء')}</Button>
              <Button type="submit" className="flex-1">
                <Save className="h-4 w-4 ml-2" />
                {editingTemplate ? 'تحديث' : 'إنشاء'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Printer Dialog */}
      <Dialog open={printerDialogOpen} onOpenChange={setPrinterDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t('إضافة طابعة')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePrinter} className="space-y-4">
            <div>
              <Label>{t('اسم الطابعة *')}</Label>
              <Input
                value={printerForm.name}
                onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
                placeholder={t('طابعة الكاشير')}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('نوع الطابعة')}</Label>
                <Select
                  value={printerForm.printer_type}
                  onValueChange={(v) => setPrinterForm({ ...printerForm, printer_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thermal">{t('حرارية')}</SelectItem>
                    <SelectItem value="laser">{t('ليزر')}</SelectItem>
                    <SelectItem value="inkjet">{t('حبر')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('عرض الورق')}</Label>
                <Select
                  value={printerForm.paper_width.toString()}
                  onValueChange={(v) => setPrinterForm({ ...printerForm, paper_width: parseInt(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58">58mm</SelectItem>
                    <SelectItem value="80">80mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t('طريقة الاتصال')}</Label>
              <Select
                value={printerForm.connection_type}
                onValueChange={(v) => setPrinterForm({ ...printerForm, connection_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="network">{t('شبكة (Network)')}</SelectItem>
                  <SelectItem value="usb">USB</SelectItem>
                  <SelectItem value="bluetooth">Bluetooth</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {printerForm.connection_type === 'network' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('عنوان IP')}</Label>
                  <Input
                    value={printerForm.ip_address}
                    onChange={(e) => setPrinterForm({ ...printerForm, ip_address: e.target.value })}
                    placeholder="192.168.1.100"
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label>{t('المنفذ')}</Label>
                  <Input
                    type="number"
                    value={printerForm.port}
                    onChange={(e) => setPrinterForm({ ...printerForm, port: parseInt(e.target.value) || 9100 })}
                    dir="ltr"
                  />
                </div>
              </div>
            )}
            <div>
              <Label>{t('الفرع *')}</Label>
              <Select
                value={printerForm.branch_id}
                onValueChange={(v) => setPrinterForm({ ...printerForm, branch_id: v })}
              >
                <SelectTrigger><SelectValue placeholder={t('اختر الفرع')} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={printerForm.is_default}
                onCheckedChange={(v) => setPrinterForm({ ...printerForm, is_default: v })}
              />
              <Label>{t('طابعة افتراضية')}</Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setPrinterDialogOpen(false)} className="flex-1">
                {t('إلغاء')}</Button>
              <Button type="submit" className="flex-1">{t('إضافة')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t('معاينة الفاتورة')}</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="bg-white text-black p-4 rounded-lg text-center font-mono text-sm" style={{ direction: 'rtl' }}>
              {editingTemplate.show_logo && editingTemplate.logo_url && (
                <img src={editingTemplate.logo_url} alt="Logo" className="h-12 mx-auto mb-2" />
              )}
              <h2 className="font-bold text-lg">{editingTemplate.business_name}</h2>
              {editingTemplate.business_name_en && (
                <p className="text-xs">{editingTemplate.business_name_en}</p>
              )}
              {editingTemplate.address && <p className="text-xs mt-1">{editingTemplate.address}</p>}
              {editingTemplate.phone && <p className="text-xs">{t('هاتف: {editingTemplate.phone}')}</p>}
              {editingTemplate.tax_number && <p className="text-xs">{t('الرقم الضريبي: {editingTemplate.tax_number}')}</p>}
              
              <div className="border-t border-dashed border-gray-400 my-3"></div>
              
              <div className="text-right">
                <p>{t('رقم الطلب: #12345')}</p>
                <p>{t('التاريخ: {new Date().toLocaleDateString('ar-IQ')}')}</p>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-3"></div>
              
              <div className="text-right space-y-1">
                <div className="flex justify-between">
                  <span>{t('2x برجر كلاسيك')}</span>
                  <span>10,000</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('1x بطاطس كبير')}</span>
                  <span>3,000</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('2x بيبسي')}</span>
                  <span>2,000</span>
                </div>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-3"></div>
              
              <div className="flex justify-between font-bold">
                <span>{t('الإجمالي:')}</span>
                <span>{t('15,000 د.ع')}</span>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-3"></div>
              
              {editingTemplate.footer_text && (
                <p className="text-xs">{editingTemplate.footer_text}</p>
              )}
              {editingTemplate.footer_text_en && (
                <p className="text-xs">{editingTemplate.footer_text_en}</p>
              )}
              
              {editingTemplate.show_qr_code && (
                <div className="mt-3">
                  <QrCode className="h-16 w-16 mx-auto text-gray-600" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
