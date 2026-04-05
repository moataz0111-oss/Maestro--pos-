import React, { useState, useEffect, useRef } from 'react';
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

  const AGENT_URL = 'http://localhost:9999';
  const [agentOnline, setAgentOnline] = useState(null);
  const [autoSyncActive, setAutoSyncActive] = useState(false);
  const [lastAutoSync, setLastAutoSync] = useState(null);
  const autoSyncRef = useRef(null);

  // Check if local agent is running
  const checkAgent = async () => {
    try {
      const res = await axios.get(`${AGENT_URL}/status`, { timeout: 3000 });
      const isOnline = res.data?.status === 'running' && res.data?.zk_support === true;
      setAgentOnline(isOnline);
      return isOnline;
    } catch {
      setAgentOnline(false);
      return false;
    }
  };

  useEffect(() => {
    fetchDevices();
    checkAgent();
  }, []);

  // Auto-sync polling - كل 5 دقائق
  useEffect(() => {
    if (!autoSyncActive) {
      if (autoSyncRef.current) clearInterval(autoSyncRef.current);
      return;
    }
    const runAutoSync = async () => {
      try {
        const agentOk = await checkAgent();
        if (!agentOk || devices.length === 0) return;
        const token = localStorage.getItem('token');
        
        for (const device of devices) {
          try {
            // 1. جلب البيانات من الجهاز عبر الوكيل
            const agentRes = await axios.post(`${AGENT_URL}/zk-sync`, {
              ip: device.ip_address, port: device.port || 4370, timeout: 15000
            }, { timeout: 30000 });
            
            if (!agentRes.data.success || !agentRes.data.records?.length) continue;
            
            // 2. إرسال للسيرفر
            await axios.post(`${API}/biometric/devices/${device.id}/sync-from-agent`, {
              records: agentRes.data.records
            }, { headers: { Authorization: `Bearer ${token}` } });
          } catch {}
        }
        
        // 3. معالجة تلقائية - تحويل بصمات → حضور + خصومات
        await axios.post(`${API}/attendance/auto-process`, null, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setLastAutoSync(new Date().toLocaleTimeString('ar'));
      } catch {}
    };
    
    runAutoSync(); // First run immediately
    autoSyncRef.current = setInterval(runAutoSync, 5 * 60 * 1000); // Every 5 min
    return () => { if (autoSyncRef.current) clearInterval(autoSyncRef.current); };
  }, [autoSyncActive, devices]);

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
      // Route through local agent (same network as ZKTeco device)
      const agentOk = await checkAgent();
      if (!agentOk) {
        toast.error(
          <div>
            <p className="font-bold">{t('الوكيل المحلي غير متصل!')}</p>
            <p className="text-sm">{t('يجب تشغيل وكيل Maestro v2.4+ على جهاز الكمبيوتر')}</p>
          </div>
        );
        return;
      }

      const res = await axios.post(`${AGENT_URL}/zk-test`, {
        ip: device.ip_address,
        port: device.port || 4370,
        timeout: 5000
      }, { timeout: 10000 });
      
      if (res.data.success) {
        toast.success(
          <div>
            <p className="font-bold">{t('تم الاتصال بنجاح!')}</p>
            {res.data.serial_number && <p className="text-sm">{t('الرقم التسلسلي')}: {res.data.serial_number}</p>}
            {res.data.device_name && <p className="text-sm">{t('الجهاز')}: {res.data.device_name}</p>}
          </div>
        );
      } else {
        toast.error(res.data.message || t('فشل الاتصال بالجهاز'));
      }
    } catch (error) {
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network')) {
        toast.error(
          <div>
            <p className="font-bold">{t('الوكيل المحلي غير متصل!')}</p>
            <p className="text-sm">{t('شغّل ملف print_server.ps1 الإصدار 2.4')}</p>
          </div>
        );
      } else {
        toast.error(t('فشل في اختبار الاتصال'));
      }
    } finally {
      setTestingDevice(null);
    }
  };

  const handleSyncAttendance = async (device) => {
    setSyncingDevice(device.id);
    try {
      // Route through local agent
      const agentOk = await checkAgent();
      if (!agentOk) {
        toast.error(
          <div>
            <p className="font-bold">{t('الوكيل المحلي غير متصل!')}</p>
            <p className="text-sm">{t('يجب تشغيل وكيل Maestro v2.4+ على جهاز الكمبيوتر')}</p>
          </div>
        );
        return;
      }

      // 1. Get attendance data from local agent (connects to ZKTeco device)
      const agentRes = await axios.post(`${AGENT_URL}/zk-sync`, {
        ip: device.ip_address,
        port: device.port || 4370,
        timeout: 15000
      }, { timeout: 30000 });

      if (!agentRes.data.success) {
        toast.error(agentRes.data.message || t('فشل في جلب البيانات من الجهاز'));
        return;
      }

      // 2. Send synced records to backend for storage
      const token = localStorage.getItem('token');
      const backendRes = await axios.post(`${API}/biometric/devices/${device.id}/sync-from-agent`, {
        records: agentRes.data.records || []
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(
        <div>
          <p className="font-bold">{t('تمت المزامنة بنجاح!')}</p>
          <p className="text-sm">{t('عدد السجلات')}: {backendRes.data.records_count || agentRes.data.count || 0}</p>
        </div>
      );
      fetchDevices();
    } catch (error) {
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network')) {
        toast.error(
          <div>
            <p className="font-bold">{t('الوكيل المحلي غير متصل!')}</p>
            <p className="text-sm">{t('شغّل ملف print_server.ps1 الإصدار 2.4')}</p>
          </div>
        );
      } else {
        toast.error(error.response?.data?.detail || t('فشل في المزامنة'));
      }
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

      {/* Agent Status */}
      <Card className={`border-${agentOnline ? 'green' : 'red'}-500/30 bg-${agentOnline ? 'green' : 'red'}-500/5`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agentOnline ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              <Wifi className={`h-5 w-5 ${agentOnline ? 'text-green-500' : 'text-red-500'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-foreground">{t('وكيل Maestro المحلي')}</h4>
                <Badge className={agentOnline ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>
                  {agentOnline ? t('متصل v2.4') : t('غير متصل')}
                </Badge>
              </div>
              {!agentOnline && (
                <p className="text-sm text-red-400 mt-1">{t('يجب تشغيل ملف print_server.ps1 (الإصدار 2.4+) على جهاز الكمبيوتر للتواصل مع أجهزة البصمة')}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={checkAgent} data-testid="check-agent-btn">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Sync Control */}
      <Card className={`border-${autoSyncActive ? 'blue' : 'orange'}-500/30 bg-${autoSyncActive ? 'blue' : 'orange'}-500/5`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${autoSyncActive ? 'bg-blue-500/20 animate-pulse' : 'bg-orange-500/20'}`}>
              <RefreshCw className={`h-5 w-5 ${autoSyncActive ? 'text-blue-500' : 'text-orange-500'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{t('المزامنة التلقائية')}</h4>
                <Badge className={autoSyncActive ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500'}>
                  {autoSyncActive ? t('مفعّلة - كل 5 دقائق') : t('متوقفة')}
                </Badge>
              </div>
              {lastAutoSync && (
                <p className="text-sm text-muted-foreground mt-1">{t('آخر مزامنة')}: {lastAutoSync}</p>
              )}
              {autoSyncActive && (
                <p className="text-sm text-blue-400 mt-1">{t('يتم جلب سجلات الحضور من البصمة ومعالجتها تلقائياً')}</p>
              )}
            </div>
            <Button 
              variant={autoSyncActive ? 'destructive' : 'default'} 
              size="sm" 
              onClick={() => setAutoSyncActive(!autoSyncActive)}
              disabled={!agentOnline}
              data-testid="auto-sync-toggle"
            >
              {autoSyncActive ? t('إيقاف') : t('تشغيل')}
            </Button>
          </div>
        </CardContent>
      </Card>

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
                <li>{t('تأكد من أن جهاز البصمة متصل بنفس الشبكة المحلية')}</li>
                <li>{t('استخدم عنوان IP الخاص بالجهاز')} ({t('مثال')}: 192.168.1.100)</li>
                <li>{t('المنفذ الافتراضي لأجهزة ZKTeco هو 4370')}</li>
                <li>{t('شغّل وكيل Maestro v2.4+ على نفس جهاز الكمبيوتر المتصل بالشبكة')}</li>
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
                    {device.is_active ? t('نشط') : t('غير نشط')}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('الفرع')}:</span>
                    <span className="text-foreground">{getBranchName(device.branch_id)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('نوع الجهاز')}:</span>
                    <span className="text-foreground">
                      {device.device_type === 'fingerprint' ? t('بصمة') : 
                       device.device_type === 'face' ? t('وجه') : t('بطاقة')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('آخر مزامنة')}:</span>
                    <span className="text-foreground">
                      {device.last_sync ? new Date(device.last_sync).toLocaleDateString('en-US') : t('لم تتم')}
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
                    {t('اختبار')}
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
                    {t('مزامنة')}
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
              {t('إضافة جهاز بصمة')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddDevice} className="space-y-4">
            <div>
              <Label className="text-foreground">{t('اسم الجهاز')} *</Label>
              <Input
                value={deviceForm.name}
                onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                placeholder={t('مثال: جهاز بصمة الفرع الرئيسي')}
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label className="text-foreground">{t('عنوان IP')} *</Label>
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
                <Label className="text-foreground">{t('المنفذ')}</Label>
                <Input
                  type="number"
                  value={deviceForm.port}
                  onChange={(e) => setDeviceForm({ ...deviceForm, port: parseInt(e.target.value) || 4370 })}
                  className="mt-1"
                  dir="ltr"
                />
              </div>
              <div>
                <Label className="text-foreground">{t('نوع الجهاز')}</Label>
                <Select
                  value={deviceForm.device_type}
                  onValueChange={(value) => setDeviceForm({ ...deviceForm, device_type: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fingerprint">{t('بصمة')}</SelectItem>
                    <SelectItem value="face">{t('تعرف على الوجه')}</SelectItem>
                    <SelectItem value="card">{t('بطاقة')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-foreground">{t('الفرع')} *</Label>
              <Select
                value={deviceForm.branch_id}
                onValueChange={(value) => setDeviceForm({ ...deviceForm, branch_id: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('اختر الفرع')} />
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
                {t('إلغاء')}
              </Button>
              <Button type="submit" className="flex-1">
                {t('إضافة الجهاز')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
