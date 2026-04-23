/**
 * Maestro POS - Agent Update Checker v5
 * يفحص إصدار وسيط الطباعة ويظهر زر تحديث عند توفر نسخة جديدة
 * يعتمد على النسخة المطلوبة من السيرفر (single source of truth)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../components/ui/button';
import { API_URL } from './api';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const PRINT_AGENT_URL = 'http://localhost:9999';

/** مقارنة مرنة للإصدارات: هل النسخة a >= النسخة b */
function compareVersions(a, b) {
  const clean = (v) => String(v || '0').replace(/^v/i, '').trim().split('.').map(n => parseInt(n, 10) || 0);
  const av = clean(a);
  const bv = clean(b);
  const maxLen = Math.max(av.length, bv.length);
  for (let i = 0; i < maxLen; i++) {
    const ai = av[i] || 0;
    const bi = bv[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

export function AgentUpdateBanner({ t = (s) => s }) {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [localVer, setLocalVer] = useState(null);
  const [requiredVer, setRequiredVer] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const intervalRef = useRef(null);
  const agentReachable = useRef(false);

  // جلب النسخة المطلوبة من السيرفر (مصدر الحقيقة الوحيد)
  useEffect(() => {
    const fetchRequiredVersion = async () => {
      try {
        const r = await fetch(`${API_URL}/print-agent-version`);
        const d = await r.json();
        if (d.version) setRequiredVer(d.version);
      } catch {}
    };
    fetchRequiredVersion();
    // إعادة فحص النسخة المطلوبة كل 10 دقائق (في حال ترقية السيرفر)
    const i = setInterval(fetchRequiredVersion, 10 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  const check = useCallback(async () => {
    if (!requiredVer) return; // ننتظر جلب النسخة المطلوبة أولاً
    try {
      // استخدام backend heartbeat بدل الاتصال المباشر بـ localhost:9999
      // (يتجنب Chrome Private Network Access block + CORS + بطء)
      const r = await fetch(`${API_URL}/print-queue/agent-status`);
      const d = await r.json();
      agentReachable.current = d.online === true;
      const v = d.version || null;
      setLocalVer(v);
      // إذا online والإصدار مطابق - لا حاجة للتحديث
      if (d.online && v) {
        const ok = compareVersions(v, requiredVer) >= 0;
        setNeedsUpdate(!ok);
      } else {
        // إذا offline - لا نعرض banner تحديث (الوسيط أصلاً غير متصل)
        setNeedsUpdate(false);
      }
    } catch {
      agentReachable.current = false;
      setNeedsUpdate(false);
    }
  }, [requiredVer]);

  useEffect(() => {
    check();
    intervalRef.current = setInterval(check, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [check]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/download-print-agent`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MaestroPrintAgent_Setup.bat';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(t('تم تحميل التحديث — شغّل الملف على الجهاز'));
      
      // فحص سريع كل 5 ثواني لمعرفة إذا تم التحديث
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(check, 5000);
    } catch {
      toast.error(t('فشل التحميل'));
    }
    setDownloading(false);
  };

  if (!needsUpdate) return null;

  return (
    <div data-testid="agent-update-banner" dir="rtl"
      className="flex items-center gap-3 bg-amber-50 border-2 border-amber-400 rounded-lg px-4 py-3 mb-3 shadow-sm">
      <Download className="w-5 h-5 text-amber-600 shrink-0" />
      <span className="text-sm font-semibold text-amber-800 flex-1">
        {t('تحديث وسيط الطباعة متاح')} ({localVer || t('قديم')} → {requiredVer})
      </span>
      <Button data-testid="update-agent-btn" size="sm"
        className="bg-amber-500 hover:bg-amber-600 text-white font-bold"
        onClick={handleDownload} disabled={downloading}>
        {downloading
          ? <><RefreshCw className="w-4 h-4 ml-1 animate-spin" />{t('جاري...')}</>
          : <><Download className="w-4 h-4 ml-1" />{t('تحديث')}</>}
      </Button>
    </div>
  );
}
