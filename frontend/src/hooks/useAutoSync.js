import { useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { t } from '../utils/translations';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const AGENT_URL = 'http://localhost:9999';
const SYNC_INTERVAL = 60 * 1000; // كل دقيقة

export function useAutoSync() {
  const intervalRef = useRef(null);
  const runningRef = useRef(false);

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
            ip: device.ip_address, port: device.port || 4370, timeout: 15000
          }, { timeout: 30000 });
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
      }
    } catch {} finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    // تشغيل أول مزامنة بعد 5 ثواني من تحميل التطبيق
    const startTimer = setTimeout(() => {
      runSync();
      intervalRef.current = setInterval(runSync, SYNC_INTERVAL);
    }, 5000);

    return () => {
      clearTimeout(startTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runSync]);
}
