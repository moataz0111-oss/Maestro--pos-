import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';
import { Bell, CalendarClock, X, ChevronDown, ChevronUp, ShoppingBag } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { formatPrice } from '../utils/currency';
import { useNavigate } from 'react-router-dom';

const API = API_URL;
const DISMISS_KEY = 'supplier_dues_dismiss_until_v1'; // timestamp ms

/**
 * SupplierDuesBanner — تنبيه استحقاق دفعات الموردين.
 * يظهر كسطر علوي مرة واحدة، وعند الإغلاق يستقر كجرس عائم أسفل يسار الصفحة.
 * يظهر فقط للمالك / السوبر أدمن.
 */
export default function SupplierDuesBanner({ user }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState({ dues: [], total_count: 0, overdue_count: 0, total_remaining: 0 });
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // يظهر فقط للمالك والمدراء — ولا يظهر لمسؤول المشتريات (purchasing) أو الكاشير أو غيرهم
  const isOwner = user && ['admin', 'general_manager', 'super_admin', 'manager', 'branch_manager'].includes(user.role);

  useEffect(() => {
    if (!isOwner) return;
    const dismissUntil = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    if (dismissUntil && Date.now() < dismissUntil) {
      setDismissed(true);
    }
    const fetchDues = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API}/supplier-payment-dues`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(res.data || { dues: [], total_count: 0, overdue_count: 0, total_remaining: 0 });
      } catch {
        // صامت
      }
    };
    fetchDues();
    const interval = setInterval(fetchDues, 60000);
    return () => clearInterval(interval);
  }, [isOwner]);

  const handleDismiss = (e) => {
    e?.stopPropagation();
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 3600 * 1000));
    setDismissed(true);
  };

  const handleRevive = () => {
    localStorage.removeItem(DISMISS_KEY);
    setDismissed(false);
  };

  if (!isOwner) return null;
  if (data.total_count === 0) return null;

  const hasOverdue = data.overdue_count > 0;

  // أيقونة جرس عائمة أسفل اليسار عند الإخفاء — تستقر بعد ظهور الإشعار العلوي
  if (dismissed) {
    return (
      <button
        onClick={handleRevive}
        className={`fixed bottom-24 left-6 z-[60] rounded-full p-3 shadow-2xl text-white transition-all hover:scale-110 ${
          hasOverdue ? 'bg-rose-600 hover:bg-rose-700 animate-pulse' : 'bg-amber-500 hover:bg-amber-600'
        }`}
        title={t('استحقاق دفعات الموردين')}
        data-testid="supplier-dues-revive-btn"
      >
        <div className="relative">
          <CalendarClock className="h-5 w-5" />
          <span className="absolute -top-2 -right-2 bg-white text-rose-600 text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow">
            {data.total_count}
          </span>
        </div>
      </button>
    );
  }

  const bannerBg = hasOverdue
    ? 'bg-gradient-to-r from-rose-600 via-red-500 to-rose-600 text-white'
    : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white';

  return (
    <div className={`${bannerBg} sticky top-0 z-50 shadow-lg`} data-testid="supplier-dues-banner" role="alert">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <CalendarClock className="h-6 w-6 animate-pulse" />
              <span className="absolute -top-1 -right-1 bg-white text-rose-600 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow">
                {data.total_count}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm sm:text-base flex items-center gap-2 flex-wrap" data-testid="supplier-dues-headline">
                <span>⏰ {t('استحقاق دفعات الموردين')}</span>
                {hasOverdue && (
                  <Badge className="bg-white/95 text-rose-700 border-0 text-[11px]">
                    {data.overdue_count} {t('متأخرة')}
                  </Badge>
                )}
                <Badge className="bg-amber-200/95 text-amber-900 border-0 text-[11px]">
                  {t('المتبقي')}: {formatPrice(data.total_remaining)}
                </Badge>
              </div>
              {!expanded && (
                <p className="text-xs opacity-90 truncate">
                  {data.dues.slice(0, 3).map((d) => d.supplier_name).join(' • ')}
                  {data.dues.length > 3 && ` … +${data.dues.length - 3}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-white hover:bg-white/20 h-8 px-2 text-xs"
              data-testid="supplier-dues-toggle-btn"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">{expanded ? t('إخفاء') : t('التفاصيل')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/external-purchases-report')}
              className="bg-white/15 text-white hover:bg-white/25 h-8 px-3 text-xs font-bold"
              data-testid="supplier-dues-goto-btn"
            >
              <ShoppingBag className="h-3.5 w-3.5 ml-1" />
              {t('فتح التقرير')}
            </Button>
            <button
              onClick={handleDismiss}
              className="text-white/90 hover:text-white hover:bg-white/20 rounded p-1 transition-colors"
              title={t('إخفاء وتثبيت في الجرس')}
              data-testid="supplier-dues-dismiss-btn"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="pb-3 max-h-72 overflow-y-auto" data-testid="supplier-dues-expanded-list">
            <div className="bg-white/95 dark:bg-black/30 backdrop-blur-sm rounded-lg p-2 text-foreground">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {data.dues.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${
                      d.is_overdue
                        ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800'
                        : 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800'
                    }`}
                    data-testid={`supplier-due-item-${d.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Bell className={`h-4 w-4 shrink-0 ${d.is_overdue ? 'text-rose-600' : 'text-amber-600'}`} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{d.supplier_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t('فاتورة')} #{d.purchase_number} • {t('الاستحقاق')}: {d.due_date}
                          {d.estimated && ` • ${t('تقديري')}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <p className={`font-bold text-sm tabular-nums ${d.is_overdue ? 'text-rose-600' : 'text-amber-700 dark:text-amber-400'}`}>
                        {formatPrice(d.remaining_amount)}
                      </p>
                      {d.is_overdue ? (
                        <p className="text-[11px] text-rose-600/80">
                          {t('متأخرة')} {d.days_overdue} {t('يوم')}
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-600/80">
                          {t('خلال')} {Math.abs(d.days_overdue)} {t('يوم')}
                        </p>
                      )}
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
