/**
 * Maestro POS - Agent Update Checker v2
 * يفحص إصدار وسيط الطباعة ويظهر زر تحديث عند توفر نسخة جديدة
 * الإصدار المطلوب مخزّن في الفرونتند مباشرة - لا يعتمد على endpoint
 */
import { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { API_URL } from './api';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const PRINT_AGENT_URL = 'http://localhost:9999';
const REQUIRED_AGENT_VERSION = '2.2.0';

export function AgentUpdateBanner({ t = (s) => s }) {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [agentVersion, setAgentVersion] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [checked, setChecked] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${PRINT_AGENT_URL}/status`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      
      if (data.status === 'running') {
        const ver = data.version || null;
        setAgentVersion(ver);
        // إذا لا يوجد إصدار أو الإصدار مختلف = يحتاج تحديث
        setNeedsUpdate(!ver || ver !== REQUIRED_AGENT_VERSION);
      }
      setChecked(true);
    } catch {
      // الوسيط غير متصل - لا نعرض شيء
      setNeedsUpdate(false);
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    checkVersion();
    const interval = setInterval(checkVersion, 60000);
    return () => clearInterval(interval);
  }, [checkVersion]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/download-print-agent`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MaestroPrintAgent_Setup.bat';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success(t('تم تحميل ملف التحديث - شغّله على جهاز الكاشير'));
      setTimeout(checkVersion, 30000);
    } catch (err) {
      toast.error(t('فشل تحميل التحديث'));
    }
    setIsUpdating(false);
  };

  if (!checked || !needsUpdate) return null;

  return (
    <div 
      data-testid="agent-update-banner"
      className="flex items-center gap-3 bg-amber-50 border-2 border-amber-400 rounded-lg px-4 py-3 mb-3"
      dir="rtl"
    >
      <Download className="w-5 h-5 text-amber-600 flex-shrink-0" />
      <span className="text-sm font-medium text-amber-800 flex-1">
        {t('تحديث وسيط الطباعة متاح')} ({agentVersion || t('قديم')} → {REQUIRED_AGENT_VERSION})
      </span>
      <Button
        data-testid="update-agent-btn"
        size="sm"
        className="bg-amber-500 hover:bg-amber-600 text-white"
        onClick={handleUpdate}
        disabled={isUpdating}
      >
        {isUpdating ? (
          <><RefreshCw className="w-4 h-4 ml-2 animate-spin" />{t('جاري التحميل...')}</>
        ) : (
          <><Download className="w-4 h-4 ml-2" />{t('تحديث الوسيط')}</>
        )}
      </Button>
    </div>
  );
}
