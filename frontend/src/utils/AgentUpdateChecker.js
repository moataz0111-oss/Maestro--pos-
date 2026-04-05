/**
 * Maestro POS - Agent Update Checker v4
 * يفحص إصدار وسيط الطباعة ويظهر زر تحديث عند توفر نسخة جديدة
 * يختفي تلقائياً بعد التحديث - مقارنة مرنة للإصدارات
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../components/ui/button';
import { API_URL } from './api';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const PRINT_AGENT_URL = 'http://localhost:9999';
const REQUIRED_MAJOR = 2;
const REQUIRED_MINOR = 5;

/** مقارنة مرنة للإصدارات: هل الإصدار المحلي يساوي أو أحدث من المطلوب */
function isVersionOk(version) {
  if (!version) return false;
  const clean = String(version).replace(/^v/i, '').trim();
  const parts = clean.split('.').map(Number);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  return (major > REQUIRED_MAJOR) || (major === REQUIRED_MAJOR && minor >= REQUIRED_MINOR);
}

export function AgentUpdateBanner({ t = (s) => s }) {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [localVer, setLocalVer] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const intervalRef = useRef(null);
  const agentReachable = useRef(false);

  const check = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(`${PRINT_AGENT_URL}/status`, { signal: ctrl.signal });
      const d = await r.json();
      agentReachable.current = true;
      if (d.status === 'running') {
        const v = d.version || d.agent_version || null;
        setLocalVer(v);
        const ok = isVersionOk(v);
        setNeedsUpdate(!ok);
        if (ok && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = setInterval(check, 120000);
        }
      }
    } catch {
      agentReachable.current = false;
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

  const requiredStr = `${REQUIRED_MAJOR}.${REQUIRED_MINOR}`;

  return (
    <div data-testid="agent-update-banner" dir="rtl"
      className="flex items-center gap-3 bg-amber-50 border-2 border-amber-400 rounded-lg px-4 py-3 mb-3 shadow-sm">
      <Download className="w-5 h-5 text-amber-600 shrink-0" />
      <span className="text-sm font-semibold text-amber-800 flex-1">
        {t('تحديث وسيط الطباعة متاح')} ({localVer || t('قديم')} → {requiredStr})
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
