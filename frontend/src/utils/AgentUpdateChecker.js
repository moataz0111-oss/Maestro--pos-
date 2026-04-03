/**
 * Maestro POS - Agent Update Checker
 * يفحص إصدار وسيط الطباعة ويظهر زر تحديث عند توفر نسخة جديدة
 */
import { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { API_URL } from './api';
import { Download, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const PRINT_AGENT_URL = 'http://localhost:9999';
const CHECK_INTERVAL = 60000; // فحص كل 60 ثانية

export function useAgentUpdateChecker() {
  const [agentVersion, setAgentVersion] = useState(null);
  const [serverVersion, setServerVersion] = useState(null);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);

  const checkVersions = useCallback(async () => {
    try {
      // فحص إصدار الوسيط المحلي
      let localVer = null;
      let isOnline = false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const agentRes = await fetch(`${PRINT_AGENT_URL}/status`, { signal: controller.signal });
        clearTimeout(timeout);
        const agentData = await agentRes.json();
        localVer = agentData.version || null;
        isOnline = agentData.status === 'running';
        setAgentVersion(localVer);
        setAgentOnline(isOnline);
      } catch {
        setAgentOnline(false);
        setAgentVersion(null);
        return; // الوسيط مش شغال - لا نعرض شيء
      }

      // فحص آخر إصدار على السيرفر
      try {
        const token = localStorage.getItem('token');
        const serverRes = await fetch(`${API_URL}/print-agent-version`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const serverData = await serverRes.json();
        const srvVer = serverData.version || null;
        setServerVersion(srvVer);

        // الوسيط شغال لكن بدون إصدار = نسخة قديمة جداً = يحتاج تحديث
        // أو الإصدار مختلف عن السيرفر = يحتاج تحديث
        if (isOnline && srvVer) {
          if (!localVer || localVer !== srvVer) {
            setNeedsUpdate(true);
          } else {
            setNeedsUpdate(false);
          }
        }
      } catch {
        setServerVersion(null);
      }
    } catch {
      // تجاهل
    }
  }, []);

  useEffect(() => {
    checkVersions();
    const interval = setInterval(checkVersions, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkVersions]);

  const triggerUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      // تحميل الملف الجديد عبر المتصفح
      const token = localStorage.getItem('token');
      const downloadUrl = `${API_URL}/download-print-agent`;
      
      const res = await fetch(downloadUrl, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MaestroPrintAgent_Setup.bat';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success('تم تحميل ملف التحديث - شغّله على جهاز الكاشير');
      
      // إعادة فحص بعد 30 ثانية
      setTimeout(() => {
        checkVersions();
        setIsUpdating(false);
      }, 30000);
    } catch (err) {
      console.error('[AgentUpdate] Download failed:', err);
      toast.error('فشل تحميل التحديث: ' + err.message);
      setIsUpdating(false);
    }
  }, [checkVersions]);

  return {
    agentVersion,
    serverVersion,
    needsUpdate,
    isUpdating,
    agentOnline,
    triggerUpdate,
    checkVersions
  };
}

/**
 * مكوّن زر التحديث - يظهر فقط عند توفر تحديث جديد
 */
export function AgentUpdateBanner({ t = (s) => s }) {
  const { needsUpdate, isUpdating, agentOnline, agentVersion, serverVersion, triggerUpdate } = useAgentUpdateChecker();

  // لا يظهر شيء إذا لا يوجد تحديث
  if (!needsUpdate) return null;

  return (
    <div 
      data-testid="agent-update-banner"
      className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 mb-2"
      dir="rtl"
    >
      <Download className="w-5 h-5 text-amber-600 flex-shrink-0" />
      <span className="text-sm text-amber-800 flex-1">
        تحديث وسيط الطباعة متاح ({agentVersion || 'قديم'} → {serverVersion})
      </span>
      <Button
        data-testid="update-agent-btn"
        size="sm"
        variant="outline"
        className="border-amber-500 text-amber-700 hover:bg-amber-100"
        onClick={triggerUpdate}
        disabled={isUpdating}
      >
        {isUpdating ? (
          <><RefreshCw className="w-4 h-4 ml-2 animate-spin" /> جاري التحديث...</>
        ) : (
          <><Download className="w-4 h-4 ml-2" /> تحديث الوسيط</>
        )}
      </Button>
    </div>
  );
}

/**
 * مكوّن حالة الوسيط المختصر - للعرض في شريط الأدوات
 */
export function AgentStatusBadge() {
  const { agentOnline, needsUpdate, agentVersion } = useAgentUpdateChecker();

  if (!agentOnline) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500" data-testid="agent-status-offline">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        الوسيط غير متصل
      </span>
    );
  }

  if (needsUpdate) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600" data-testid="agent-status-update">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        تحديث متاح
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600" data-testid="agent-status-online">
      <CheckCircle2 className="w-3 h-3" />
      الوسيط v{agentVersion}
    </span>
  );
}
