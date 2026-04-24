/**
 * Maestro POS - Agent Update Checker v6
 * يفحص إصدار وسيط الطباعة ويظهر إشعار للمالك فقط
 * - يظهر مرة واحدة فقط للمالك (admin) عند إطلاق نسخة جديدة
 * - يُخفى تلقائياً بعد ضغط "تحديث" أو "إغلاق"
 * - يُخفى للكاشير وبقية المستخدمين تماماً
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../components/ui/button';
import { API_URL } from './api';
import { Download, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

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

/** قراءة المستخدم الحالي من localStorage */
function getCurrentUserRole() {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    const u = JSON.parse(userStr);
    return u?.role || null;
  } catch {
    return null;
  }
}

export function AgentUpdateBanner({ t = (s) => s }) {
  const [show, setShow] = useState(false);
  const [requiredVer, setRequiredVer] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    // نعرض الإشعار فقط للمالك (admin / super_admin)
    const role = getCurrentUserRole();
    const isOwner = role === 'admin' || role === 'super_admin';
    if (!isOwner) return;
    if (checkedRef.current) return;
    checkedRef.current = true;

    const checkOnce = async () => {
      try {
        const r = await fetch(`${API_URL}/print-agent-version`);
        const d = await r.json();
        const reqV = d.version;
        if (!reqV) return;
        setRequiredVer(reqV);

        // هل سبق وأخفى المالك إشعار هذه النسخة؟
        const dismissedKey = `agent_update_dismissed_${reqV}`;
        if (localStorage.getItem(dismissedKey)) return;

        setShow(true);
      } catch {}
    };
    checkOnce();
  }, []);

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
      // إخفاء فوري + تذكر لهذه النسخة
      if (requiredVer) localStorage.setItem(`agent_update_dismissed_${requiredVer}`, '1');
      setShow(false);
    } catch {
      toast.error(t('فشل التحميل'));
    }
    setDownloading(false);
  };

  const handleDismiss = () => {
    if (requiredVer) localStorage.setItem(`agent_update_dismissed_${requiredVer}`, '1');
    setShow(false);
  };

  if (!show || !requiredVer) return null;

  return (
    <div data-testid="agent-update-banner" dir="rtl"
      className="flex items-center gap-3 bg-amber-50 border-2 border-amber-400 rounded-lg px-4 py-3 mb-3 shadow-sm">
      <Download className="w-5 h-5 text-amber-600 shrink-0" />
      <span className="text-sm font-semibold text-amber-800 flex-1">
        {t('تحديث وسيط الطباعة متاح')} (v{requiredVer})
      </span>
      <Button data-testid="update-agent-btn" size="sm"
        className="bg-amber-500 hover:bg-amber-600 text-white font-bold"
        onClick={handleDownload} disabled={downloading}>
        {downloading
          ? <><RefreshCw className="w-4 h-4 ml-1 animate-spin" />{t('جاري...')}</>
          : <><Download className="w-4 h-4 ml-1" />{t('تحديث')}</>}
      </Button>
      <Button data-testid="dismiss-update-btn" size="sm" variant="ghost"
        className="text-amber-700 hover:bg-amber-100"
        onClick={handleDismiss} aria-label={t('إغلاق')}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
