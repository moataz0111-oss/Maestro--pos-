import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from '../hooks/useTranslation';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Fingerprint,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  Settings,
  Users,
  Download,
  AlertCircle,
  Clock,
  Server,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

import { API_URL } from '../utils/api';
const API = API_URL;

export default function BiometricDevices({ branches = [] }) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [syncingDevice, setSyncingDevice] = useState(null);
  const [testingDevice, setTestingDevice] = useState(null);
  
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    ip_address: '',
    port: 4370,
    branch_id: '',
    device_type: 'fingerprint'
  });

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/biometric/devices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDevices(res.data);
    } catch (error) {
      console.error('Error fetching devices:', error);
      // Mock data for development
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDevice = async (e) => {
    e.preventDefault();
    
    if (!deviceForm.name || !deviceForm.ip_address || !deviceForm.branch_id) {
      toast.error(t('يرجى ملء جميع الحقول المطلوبة'));
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/biometric/devices`, deviceForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(t('تم إضافة الجهاز بنجاح'));
      setAddDialogOpen(false);
      setDeviceForm({ name: '', ip_address: '', port: 4370, branch_id: '', device_type: 'fingerprint' });
      fetchDevices();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في إضافة الجهاز'));
    }
  };

  const handleTestConnection = async (device) => {
    setTestingDevice(device.id);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/biometric/devices/${device.id}/test`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data.success) {
        toast.success(
          <div>
            <p className="font-bold">{t('تم الاتصال بنجاح!')}</p>
            <p className="text-sm">{t('الرقم التسلسلي')}: {res.data.device_info?.serial_number}</p>
            <p className="text-sm">{t('المستخدمين')}: {res.data.device_info?.users_count}</p>
          </div>
        );
      } else {
        toast.error(res.data.message || t('فشل الاتصال بالجهاز'));
      }
    } catch (error) {
      toast.error(t('فشل في اختبار الاتصال'));
    } finally {
      setTestingDevice(null);
    }
  };

  const handleSyncAttendance = async (device) => {
    setSyncingDevice(device.id);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/biometric/devices/${device.id}/sync`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(
        <div>
          <p className="font-bold">{t('تمت المزامنة بنجاح!')}</p>
          <p className="text-sm">{t('عدد السجلات')}: {res.data.records_count}</p>
        </div>
      );
      fetchDevices();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في المزامنة'));
    } finally {
      setSyncingDevice(null);
    }
  };

  const handleDeleteDevice = async (device) => {
    if (!window.confirm(t('هل أنت متأكد من حذف') + ` "${device.name}"؟`)) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/biometric/devices/${device.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(t('تم حذف الجهاز'));
      fetchDevices();
    } catch (error) {
      toast.error(t('فشل في حذف الجهاز'));
    }
  };

  const getBranchName = (branchId) => {
    const branch = branches.find(b => b.id === branchId);
    return branch?.name || t('غير محدد');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{t('أجهزة البصمة')}</h3>
          <p className="text-sm text-muted-foreground">{t('إدارة أجهزة تسجيل الحضور والانصراف')}</p>
        </div>
        
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2" data-testid="add-biometric-device-btn">
          <Plus className="h-4 w-4" />
          {t('إضافة جهاز')}
        </Button>
      </div>

      {/* Info Card */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-foreground">{t('تعليمات الربط')}</h4>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                <li>{t('تأكد من أن جهاز البصمة متصل بنفس الشبكة')}</li>
                <li>{t('استخدم عنوان IP الخاص بالجهاز')} ({t('مثال')}: 192.168.1.100)</li>
                <li>{t('المنفذ الافتراضي لأجهزة ZKTeco هو 4370')}</li>
                <li>{t('بعد إضافة الجهاز، اختبر الاتصال ثم قم بالمزامنة')}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Devices Grid */}
      {devices.length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-12 text-center">
            <Fingerprint className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-muted-foreground">{t('لا توجد أجهزة بصمة')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('أضف جهاز بصمة لبدء تسجيل الحضور')}</p>
            <Button className="mt-4" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 ml-2" />
              {t('إضافة جهاز')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <Card key={device.id} className="border-border/50 bg-card hover:shadow-lg transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      device.is_active ? 'bg-green-500/10' : 'bg-gray-500/10'
                    }`}>
                      <Fingerprint className={`h-6 w-6 ${device.is_active ? 'text-green-500' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">{device.name}</h4>
                      <p className="text-xs text-muted-foreground">{device.ip_address}:{device.port}</p>
                    </div>
                  </div>
                  <Badge className={device.is_active ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}>
                    {device.is_active ? 'نشط' : 'غير نشط'}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">الفرع:</span>
                    <span className="text-foreground">{getBranchName(device.branch_id)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">نوع الجهاز:</span>
                    <span className="text-foreground">
                      {device.device_type === 'fingerprint' ? 'بصمة' : 
                       device.device_type === 'face' ? 'وجه' : 'بطاقة'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">آخر مزامنة:</span>
                    <span className="text-foreground">
                      {device.last_sync ? new Date(device.last_sync).toLocaleDateString('ar-IQ') : 'لم تتم'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleTestConnection(device)}
                    disabled={testingDevice === device.id}
                  >
                    {testingDevice === device.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4 ml-1" />
                    )}
                    اختبار
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleSyncAttendance(device)}
                    disabled={syncingDevice === device.id}
                  >
                    {syncingDevice === device.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 ml-1" />
                    )}
                    مزامنة
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => handleDeleteDevice(device)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Device Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Fingerprint className="h-5 w-5 text-primary" />
              إضافة جهاز بصمة
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddDevice} className="space-y-4">
            <div>
              <Label className="text-foreground">اسم الجهاز *</Label>
              <Input
                value={deviceForm.name}
                onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                placeholder="مثال: جهاز بصمة الفرع الرئيسي"
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label className="text-foreground">عنوان IP *</Label>
              <Input
                value={deviceForm.ip_address}
                onChange={(e) => setDeviceForm({ ...deviceForm, ip_address: e.target.value })}
                placeholder="192.168.1.100"
                className="mt-1"
                dir="ltr"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-foreground">المنفذ</Label>
                <Input
                  type="number"
                  value={deviceForm.port}
                  onChange={(e) => setDeviceForm({ ...deviceForm, port: parseInt(e.target.value) || 4370 })}
                  className="mt-1"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-foreground">نوع الجهاز</Label>
                <Select
                  value={deviceForm.device_type}
                  onValueChange={(value) => setDeviceForm({ ...deviceForm, device_type: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fingerprint">بصمة</SelectItem>
                    <SelectItem value="face">تعرف على الوجه</SelectItem>
                    <SelectItem value="card">بطاقة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-foreground">الفرع *</Label>
              <Select
                value={deviceForm.branch_id}
                onValueChange={(value) => setDeviceForm({ ...deviceForm, branch_id: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} className="flex-1">
                إلغاء
              </Button>
              <Button type="submit" className="flex-1">
                إضافة الجهاز
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
