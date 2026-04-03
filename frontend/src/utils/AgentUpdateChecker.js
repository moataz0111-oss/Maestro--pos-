/**
 * Maestro POS - Agent Update Checker v3
 * يفحص إصدار وسيط الطباعة ويظهر زر تحديث عند توفر نسخة جديدة
 * يختفي تلقائياً بعد التحديث
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../components/ui/button';
import { API_URL } from './api';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const PRINT_AGENT_URL = 'http://localhost:9999';
const REQUIRED_VERSION = '2.2.0';

export function AgentUpdateBanner({ t = (s) => s }) {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [localVer, setLocalVer] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const intervalRef = useRef(null);

  const check = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(`${PRINT_AGENT_URL}/status`, { signal: ctrl.signal });
      const d = await r.json();
      if (d.status === 'running') {
        const v = d.version || null;
        setLocalVer(v);
        const upToDate = v === REQUIRED_VERSION;
        setNeedsUpdate(!upToDate);
        // إذا تم التحديث — نوقف الفحص السريع
        if (upToDate && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = setInterval(check, 120000); // فحص عادي كل دقيقتين
        }
      }
    } catch {
      setNeedsUpdate(false);
    }
  }, []);

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
        {t('تحديث وسيط الطباعة متاح')} ({localVer || t('قديم')} → {REQUIRED_VERSION})
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
