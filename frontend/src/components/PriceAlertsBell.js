import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';
import { Bell, TrendingUp, TrendingDown, X, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';

const API = API_URL;

export default function PriceAlertsBell({ user }) {
  const { t } = useTranslation();
  const [data, setData] = useState({ alerts: [], unread_count: 0, total_count: 0 });
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const isOwner = user && (user.role === 'admin' || user.role === 'super_admin');

  const fetchAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/price-alerts?limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data || { alerts: [], unread_count: 0, total_count: 0 });
    } catch {
      // silent — no spam
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // كل دقيقة
    return () => clearInterval(interval);
  }, [isOwner]);

  // إغلاق عند النقر خارج اللوحة
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMarkRead = async (alertId, e) => {
    e?.stopPropagation();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/price-alerts/${alertId}/mark-read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAlerts();
    } catch {
      toast.error(t('فشل في تحديث الحالة'));
    }
  };

  const handleDismiss = async (alertId, e) => {
    e?.stopPropagation();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/price-alerts/${alertId}/dismiss`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAlerts();
    } catch {
      toast.error(t('فشل في تجاهل التنبيه'));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/price-alerts/mark-all-read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(t('تم تعليم الكل كمقروء'));
      fetchAlerts();
    } catch {
      toast.error(t('فشل في تحديث الكل'));
    }
  };

  if (!isOwner) return null;

  const unread = data.unread_count || 0;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="rounded-lg relative"
        data-testid="price-alerts-bell"
        title={t('تنبيهات تغير الأسعار')}
      >
        <Bell className={`h-5 w-5 ${unread > 0 ? 'text-amber-500' : ''}`} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow" data-testid="price-alerts-unread-badge">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div
          className="absolute left-0 mt-2 w-[380px] sm:w-[420px] max-h-[70vh] bg-card border rounded-lg shadow-2xl overflow-hidden z-[60]"
          data-testid="price-alerts-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-500" />
              <h3 className="font-bold text-sm">{t('تنبيهات تغير الأسعار')}</h3>
              {unread > 0 && (
                <Badge className="bg-red-500 text-white text-[10px]">{unread} {t('غير مقروء')}</Badge>
              )}
            </div>
            {unread > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleMarkAllRead}
                className="text-xs h-7 px-2"
                data-testid="price-alerts-mark-all-read"
              >
                <CheckCircle2 className="h-3.5 w-3.5 ml-1" />
                {t('قراءة الكل')}
              </Button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[58vh]">
            {data.alerts.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Bell className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>{t('لا توجد تنبيهات أسعار')}</p>
                <p className="text-xs mt-1 opacity-70">{t('سيظهر هنا أي تغير ≥ 1%')}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.alerts.map((a) => {
                  const isUnread = a.status === 'unread';
                  const isIncrease = a.direction === 'increase';
                  const accent = isIncrease
                    ? (a.severity === 'critical' ? 'border-r-4 border-red-500' : 'border-r-4 border-amber-500')
                    : 'border-r-4 border-emerald-500';
                  return (
                    <li
                      key={a.id}
                      className={`px-4 py-3 ${accent} ${isUnread ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''} hover:bg-muted/40 transition-colors`}
                      data-testid={`price-alert-${a.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          {isIncrease ? (
                            <TrendingUp className={`h-4 w-4 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                          ) : (
                            <TrendingDown className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm truncate">{a.material_name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              <span className="line-through opacity-70 tabular-nums">
                                {Number(a.old_cost).toLocaleString()}
                              </span>
                              <span>→</span>
                              <span className={`font-bold tabular-nums ${isIncrease ? 'text-red-600' : 'text-emerald-600'}`}>
                                {Number(a.new_cost).toLocaleString()}
                              </span>
                              <Badge
                                className={`text-[10px] ${
                                  isIncrease
                                    ? a.severity === 'critical'
                                      ? 'bg-red-500/15 text-red-600'
                                      : 'bg-amber-500/15 text-amber-600'
                                    : 'bg-emerald-500/15 text-emerald-600'
                                }`}
                                variant="outline"
                              >
                                {isIncrease ? '+' : ''}{a.percent_change}%
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                              <span>{t('الكمية')}: {a.quantity} {a.unit}</span>
                              {a.purchase_number && <span>• {t('فاتورة')} #{a.purchase_number}</span>}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {a.triggered_at?.slice(0, 16).replace('T', ' ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {isUnread && (
                            <button
                              onClick={(e) => handleMarkRead(a.id, e)}
                              className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25"
                              data-testid={`price-alert-mark-read-${a.id}`}
                            >
                              {t('قراءة')}
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDismiss(a.id, e)}
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                            title={t('تجاهل')}
                            data-testid={`price-alert-dismiss-${a.id}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground text-center">
            {t('عتبة التنبيه')}: ≥ 1% • {t('تحديث كل دقيقة')}
          </div>
        </div>
      )}
    </div>
  );
}
