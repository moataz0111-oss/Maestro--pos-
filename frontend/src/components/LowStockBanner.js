import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';
import { Bell, AlertTriangle, X, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { playUrgentAlert } from '../utils/sound';
import { useNavigate } from 'react-router-dom';

const API = API_URL;
const DISMISS_KEY = 'lowstock_dismiss_until_v1'; // timestamp ms

export default function LowStockBanner({ user }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState({ alerts: [], critical_count: 0, warning_count: 0, total_count: 0 });
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const playedRef = useRef(false);

  // فقط للمالك / السوبر أدمن
  const isOwner = user && (user.role === 'admin' || user.role === 'super_admin');

  useEffect(() => {
    if (!isOwner) return;
    // التحقق من الإخفاء المؤقت (24 ساعة)
    const dismissUntil = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    if (dismissUntil && Date.now() < dismissUntil) {
      setDismissed(true);
    }

    const fetchAlerts = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API}/raw-materials-new/alerts/low-stock`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data || { alerts: [], total_count: 0, critical_count: 0, warning_count: 0 });

        // تشغيل الصوت مرة واحدة فقط عند فتح Dashboard وكان هناك نقص
        if (!playedRef.current && (res.data?.total_count || 0) > 0) {
          playedRef.current = true;
          // تأخير بسيط لكي تكون هناك تفاعل من المستخدم (بعض المتصفحات تتطلب)
          setTimeout(() => {
            try { playUrgentAlert(); } catch { /* silent */ }
          }, 800);
        }
      } catch (err) {
        // صامت — لا نُزعج المالك بأخطاء التنبيهات
      }
    };

    fetchAlerts();
    // تحديث كل دقيقة بدون إعادة تشغيل الصوت
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [isOwner]);

  const handleDismiss = (e) => {
    e?.stopPropagation();
    // إخفاء لمدة 24 ساعة
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 3600 * 1000));
    setDismissed(true);
  };

  const handleRevive = () => {
    localStorage.removeItem(DISMISS_KEY);
    setDismissed(false);
  };

  if (!isOwner) return null;
  if (data.total_count === 0) return null;

  const hasCritical = data.critical_count > 0;
  // ألوان حسب الخطورة
  const bannerBg = hasCritical
    ? 'bg-gradient-to-r from-red-600 via-red-500 to-red-600 text-white'
    : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white';

  // أيقونة عائمة فقط عند الإخفاء — تشبه إشعار الهاتف
  if (dismissed) {
    return (
      <button
        onClick={handleRevive}
        className="fixed bottom-6 left-6 z-[60] rounded-full p-3 shadow-2xl bg-red-500 hover:bg-red-600 text-white transition-all hover:scale-110 animate-pulse"
        title={t('عرض تنبيهات المخزون')}
        data-testid="lowstock-revive-btn"
      >
        <div className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute -top-2 -right-2 bg-white text-red-600 text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow">
            {data.total_count}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className={`${bannerBg} sticky top-0 z-50 shadow-lg`} data-testid="lowstock-banner" role="alert">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between gap-3 py-2.5">
          {/* الجهة اليمنى - الأيقونة والعنوان */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              {hasCritical ? (
                <AlertTriangle className="h-6 w-6 animate-pulse" />
              ) : (
                <Bell className="h-6 w-6 animate-pulse" />
              )}
              <span className="absolute -top-1 -right-1 bg-white text-red-600 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow">
                {data.total_count}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm sm:text-base flex items-center gap-2 flex-wrap" data-testid="lowstock-headline">
                {hasCritical ? (
                  <>
                    <span>🚨 {t('تنبيه عاجل: مواد نفدت من المخزون')}</span>
                    <Badge className="bg-white/95 text-red-700 border-0 text-[11px]">
                      {data.critical_count} {t('نافدة')}
                    </Badge>
                    {data.warning_count > 0 && (
                      <Badge className="bg-amber-200/95 text-amber-900 border-0 text-[11px]">
                        {data.warning_count} {t('منخفضة')}
                      </Badge>
                    )}
                  </>
                ) : (
                  <>
                    <span>⚠️ {t('تنبيه: مواد خام منخفضة تحت الحد الأدنى')}</span>
                    <Badge className="bg-white/95 text-amber-700 border-0 text-[11px]">
                      {data.total_count} {t('مادة')}
                    </Badge>
                  </>
                )}
              </div>
              {!expanded && (
                <p className="text-xs opacity-90 truncate">
                  {data.alerts.slice(0, 3).map(a => a.material_name).join(' • ')}
                  {data.alerts.length > 3 && ` … +${data.alerts.length - 3}`}
                </p>
              )}
            </div>
          </div>

          {/* الجهة اليسرى - الأزرار */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-white hover:bg-white/20 h-8 px-2 text-xs"
              data-testid="lowstock-toggle-btn"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">{expanded ? t('إخفاء') : t('التفاصيل')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/warehouse-manufacturing')}
              className="bg-white/15 text-white hover:bg-white/25 h-8 px-3 text-xs font-bold"
              data-testid="lowstock-goto-warehouse-btn"
            >
              <Package className="h-3.5 w-3.5 ml-1" />
              {t('فتح المخزن')}
            </Button>
            <button
              onClick={handleDismiss}
              className="text-white/90 hover:text-white hover:bg-white/20 rounded p-1 transition-colors"
              title={t('إخفاء لمدة 24 ساعة')}
              data-testid="lowstock-dismiss-btn"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* قائمة موسّعة */}
        {expanded && (
          <div className="pb-3 max-h-72 overflow-y-auto" data-testid="lowstock-expanded-list">
            <div className="bg-white/95 dark:bg-black/30 backdrop-blur-sm rounded-lg p-2 text-foreground">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {data.alerts.map((a) => (
                  <div
                    key={a.material_id}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${
                      a.severity === 'critical'
                        ? 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800'
                        : 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800'
                    }`}
                    data-testid={`lowstock-item-${a.material_id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {a.severity === 'critical' ? (
                        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                      ) : (
                        <Package className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{a.material_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t('الحد الأدنى')}: {a.min_quantity} {a.unit}
                        </p>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <p className={`font-bold text-sm tabular-nums ${a.severity === 'critical' ? 'text-red-600' : 'text-amber-700 dark:text-amber-400'}`}>
                        {a.quantity} {a.unit}
                      </p>
                      <p className="text-[11px] text-red-600/80 tabular-nums">
                        - {a.shortage} {a.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
