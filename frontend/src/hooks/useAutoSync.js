import { useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { t } from '../utils/translations';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const AGENT_URL = 'http://localhost:9999';
const SYNC_INTERVAL = 60 * 1000; // كل دقيقة
const PHOTO_SYNC_INTERVAL = 5 * 60 * 1000; // كل 5 دقائق للصور

// حدث مخصص لتحديث البيانات في أي صفحة
export const SYNC_DATA_UPDATED = 'biometric-sync-data-updated';

export function dispatchSyncUpdate() {
  window.dispatchEvent(new CustomEvent(SYNC_DATA_UPDATED));
}

export function useAutoSync() {
  const intervalRef = useRef(null);
  const photoIntervalRef = useRef(null);
  const runningRef = useRef(false);
  const photoRunningRef = useRef(false);

  // مزامنة الحضور
  const runSync = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // تحقق من حالة المزامنة التلقائية في السيرفر
      const statusRes = await axios.get(`${API}/biometric/auto-sync`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 5000
      });
      if (!statusRes.data?.enabled) return;

      // تحقق من الوكيل المحلي
      let agentOk = false;
      try {
        const agentRes = await axios.get(`${AGENT_URL}/status`, { timeout: 3000 });
        agentOk = agentRes.data?.status === 'running' && agentRes.data?.zk_support === true;
      } catch { return; }
      if (!agentOk) return;

      // جلب أجهزة البصمة
      const devicesRes = await axios.get(`${API}/biometric/devices`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 5000
      });
      const devices = devicesRes.data || [];
      if (devices.length === 0) return;

      let totalNewRecords = 0;
      for (const device of devices) {
        try {
          const agentRes = await axios.post(`${AGENT_URL}/zk-sync`, {
            ip: device.ip_address, port: device.port || 4370, timeout: 150000
          }, { timeout: 180000 });
          if (!agentRes.data?.success || !agentRes.data?.records?.length) continue;

          const syncRes = await axios.post(`${API}/biometric/devices/${device.id}/sync-from-agent`, {
            records: agentRes.data.records
          }, { headers: { Authorization: `Bearer ${token}` } });
          totalNewRecords += syncRes.data?.records_count || 0;
        } catch {}
      }

      // معالجة تلقائية
      const processRes = await axios.post(`${API}/attendance/auto-process`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const processed = processRes.data?.processed || 0;

      if (totalNewRecords > 0 || processed > 0) {
        toast.success(
          `${t('مزامنة تلقائية')}: ${totalNewRecords > 0 ? totalNewRecords + ' ' + t('بصمة جديدة') : ''} ${processed > 0 ? processed + ' ' + t('سجل حضور') : ''}`,
          { duration: 4000 }
        );
        // إرسال حدث تحديث لكل الصفحات
        dispatchSyncUpdate();
      }
    } catch {} finally {
      runningRef.current = false;
    }
  }, []);

  // مزامنة الصور تلقائياً - جلب صور الوجه من الجهاز للموظفين بدون صورة
  const runPhotoSync = useCallback(async () => {
    if (photoRunningRef.current) return;
    photoRunningRef.current = true;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // تحقق من الوكيل المحلي
      let agentOk = false;
      try {
        const agentRes = await axios.get(`${AGENT_URL}/status`, { timeout: 3000 });
        agentOk = agentRes.data?.status === 'running' && agentRes.data?.zk_support === true;
      } catch { return; }
      if (!agentOk) return;

      // جلب الأجهزة
      const devicesRes = await axios.get(`${API}/biometric/devices`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 5000
      });
      const devices = devicesRes.data || [];
      if (devices.length === 0) return;

      // جلب الموظفين بدون صورة ولديهم biometric_uid
      const empRes = await axios.get(`${API}/employees`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 5000
      });
      const employees = (empRes.data || []).filter(e => e.biometric_uid && !e.face_photo);
      if (employees.length === 0) return;

      const device = devices[0]; // أول جهاز
      let photosSaved = 0;

      for (const emp of employees.slice(0, 5)) { // حد أقصى 5 موظفين لكل دورة
        try {
          const res = await axios.post(`${AGENT_URL}/zk-face-photo`, {
            ip: device.ip_address,
            port: device.port || 4370,
            timeout: 45000,
            uid: parseInt(emp.biometric_uid)
          }, { timeout: 60000 });

          if (res.data?.success && res.data?.photo) {
            await axios.post(`${API}/employees/${emp.id}/face-photo`, {
              face_photo: res.data.photo
            }, { headers: { Authorization: `Bearer ${token}` } });
            photosSaved++;
          }
        } catch {}
      }

      if (photosSaved > 0) {
        toast.success(`${t('مزامنة تلقائية')}: ${photosSaved} ${t('صورة وجه جديدة')}`, { duration: 4000 });
        dispatchSyncUpdate();
      }
    } catch {} finally {
      photoRunningRef.current = false;
    }
  }, []);

  useEffect(() => {
    // تشغيل أول مزامنة بعد 5 ثواني من تحميل التطبيق
    const startTimer = setTimeout(() => {
      runSync();
      intervalRef.current = setInterval(runSync, SYNC_INTERVAL);
    }, 5000);

    // تشغيل مزامنة الصور بعد 30 ثانية
    const photoStartTimer = setTimeout(() => {
      runPhotoSync();
      photoIntervalRef.current = setInterval(runPhotoSync, PHOTO_SYNC_INTERVAL);
    }, 30000);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(photoStartTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (photoIntervalRef.current) clearInterval(photoIntervalRef.current);
    };
  }, [runSync, runPhotoSync]);
}
