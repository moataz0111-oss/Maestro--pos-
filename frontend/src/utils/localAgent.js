/**
 * localAgent.js — عميل axios موحّد للاتصال بالوكيل المحلي (localhost:9999)
 *
 * لماذا مطلوب؟
 * - axios.defaults.withCredentials = true (لأمان جلسة السيرفر)
 * - CORS يحجب أي طلب لـ localhost:9999 يحمل credentials
 * - هذا الإنستانس يفصل تلك السياسة تماماً (withCredentials:false + بدون Authorization)
 *
 * الاستخدام:
 *   import { localAgent, AGENT_URL } from '../utils/localAgent';
 *   const res = await localAgent.get('/status', { timeout: 3000 });
 */
import axios from 'axios';

export const AGENT_URL = 'http://localhost:9999';

// إنستانس منفصل لتفادي CORS blocking عند استدعاء الوكيل المحلي
export const localAgent = axios.create({
  baseURL: AGENT_URL,
  withCredentials: false,  // 🛡 حاسم: لا نرسل cookies السيرفر للوكيل المحلي
  headers: { 'Content-Type': 'application/json' },
});

// إزالة أي Authorization header قد يُضاف من axios.interceptors العالمية
localAgent.interceptors.request.use((config) => {
  if (config.headers && config.headers.Authorization) {
    delete config.headers.Authorization;
  }
  return config;
});

export default localAgent;
