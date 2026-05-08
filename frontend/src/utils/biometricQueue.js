/**
 * Biometric Job Queue Helper
 *
 * يحاول تنفيذ عملية البصمة عبر:
 *   1. اتصال مباشر بالوكيل المحلي (localhost:9999) — أسرع لو مفتوح بـ HTTP أو من نفس الشبكة
 *   2. عبر Job Queue على السيرفر — fallback عند Mixed Content blocking في HTTPS
 *
 * يعيد نتيجة العملية أو يرمي خطأ عند الفشل/التايم آوت.
 */
import axios from 'axios';
import { API_URL } from './api';

const API = API_URL;
const AGENT_URL = 'http://localhost:9999';

/**
 * تنفيذ عملية بصمة مع fallback تلقائي إلى Job Queue.
 *
 * @param {string} jobType - نوع العملية: zk-sync | zk-push-user | zk-users | zk-test | zk-face-photo | zk-delete-user | zk-probe-device
 * @param {object} params - معاملات العملية ({ ip, port, ...})
 * @param {object} options - { branchId, directTimeout=10000, queueTimeout=180000, pollInterval=1500 }
 * @returns {Promise<object>} نتيجة العملية
 */
export async function executeBiometricOp(jobType, params, options = {}) {
  const {
    branchId = null,
    directTimeout = 10000,
    queueTimeout = 180000,
    pollInterval = 1500,
  } = options;

  const token = localStorage.getItem('token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 1) محاولة اتصال مباشر — يعمل لو الوكيل مفتوح من نفس الشبكة عبر HTTP
  try {
    const res = await axios.post(`${AGENT_URL}/${jobType}`, params, { timeout: directTimeout });
    if (res?.data && res.data.success !== false) {
      return res.data;
    }
    // success === false: ارمي error من الوكيل
    if (res?.data?.success === false) {
      throw new Error(res.data.message || res.data.error || 'فشل العملية على الوكيل');
    }
  } catch (err) {
    const isNetworkErr = err?.code === 'ERR_NETWORK' || err?.message?.includes('Network');
    if (!isNetworkErr) throw err;
    // Network error → fallback to queue
  }

  // 2) Fallback: Job Queue
  const { data: job } = await axios.post(
    `${API}/biometric-queue`,
    { type: jobType, params, branch_id: branchId },
    { headers: authHeaders }
  );

  // Polling حتى تظهر النتيجة أو تنتهي المهلة
  const start = Date.now();
  while (Date.now() - start < queueTimeout) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const { data: status } = await axios.get(`${API}/biometric-queue/${job.id}`, {
        headers: authHeaders,
      });
      if (status.status === 'completed') {
        return status.result || { success: true };
      }
      if (status.status === 'failed') {
        throw new Error(status.error || 'فشل تنفيذ الجوب على الوكيل');
      }
    } catch (e) {
      if (e?.message?.startsWith('فشل')) throw e;
      // 404 أو network glitch — استمر بالانتظار
    }
  }
  throw new Error('انتهت مهلة انتظار الوكيل (لم يستجب). تأكد من تشغيل print_server.ps1 v2.5+');
}

export default executeBiometricOp;
