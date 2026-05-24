/**
 * 🚦 Weekly Low-Profit Alert Banner
 *
 * يظهر تنبيهاً عائماً (top-right) إذا كانت هناك منتجات في الأسبوع الماضي بهامش
 * ربح منخفض (< threshold). عند الضغط يفتح dialog بقائمة المنتجات. بعد الإغلاق،
 * يُحفظ معرّف الأسبوع (ISO week) في localStorage فلا يظهر مجدداً حتى الأسبوع
 * التالي.
 *
 * Usage:
 *   <WeeklyLowProfitAlert />
 *
 * Backend: GET /api/reports/weekly-low-profit
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { AlertTriangle, X, TrendingDown } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const STORAGE_KEY = 'maestro_low_profit_dismissed_week';

const formatPriceLocal = (v) => {
  const n = Number(v) || 0;
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} IQD`;
};

export default function WeeklyLowProfitAlert() {
  const [data, setData] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const fetchAlert = async () => {
      try {
        const res = await axios.get(`${API}/reports/weekly-low-profit?threshold=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = res.data || {};
        if ((payload.total_count || 0) === 0) {
          setData(null);
          return;
        }
        // تحقّق إن كان هذا الأسبوع قد تم إغلاقه سابقاً
        const dismissedWeek = localStorage.getItem(STORAGE_KEY);
        if (dismissedWeek === payload.week_id) {
          setDismissed(true);
          setData(payload);
        } else {
          setData(payload);
        }
      } catch (err) {
        // فشل صامت — لا نزعج المستخدم بتنبيه خطأ
        console.warn('Weekly low-profit alert fetch failed:', err?.message);
      }
    };

    fetchAlert();
    // أعد المحاولة كل 12 ساعة في الجلسة الطويلة
    const id = setInterval(fetchAlert, 12 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const handleDismiss = () => {
    if (data?.week_id) {
      localStorage.setItem(STORAGE_KEY, data.week_id);
    }
    setDismissed(true);
    setShowDialog(false);
  };

  if (!data || dismissed) return null;

  return (
    <>
      {/* Banner عائم في top-right */}
      <div
        className="fixed top-20 left-4 z-40 max-w-sm bg-red-600 dark:bg-red-700 text-white rounded-lg shadow-2xl border-2 border-red-800 animate-pulse-slow cursor-pointer hover:scale-105 transition-transform"
        onClick={() => setShowDialog(true)}
        role="button"
        data-testid="low-profit-alert-banner"
      >
        <div className="flex items-start gap-3 p-3">
          <AlertTriangle className="h-6 w-6 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-sm" data-testid="low-profit-alert-title">
              تنبيه ربحية أسبوعي
            </div>
            <div className="text-xs opacity-95 mt-0.5" data-testid="low-profit-alert-count">
              {data.total_count} منتج بهامش ربح أقل من {data.threshold}%
            </div>
            <div className="text-[10px] opacity-80 mt-0.5">
              اضغط لعرض التفاصيل · {data.from_date} → {data.to_date}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="text-white/80 hover:text-white"
            aria-label="إغلاق"
            data-testid="low-profit-alert-dismiss-banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Dialog بالتفاصيل */}
      <Dialog open={showDialog} onOpenChange={(open) => !open && setShowDialog(false)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="low-profit-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              المنتجات ذات الربحية المنخفضة (آخر 7 أيام)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground">عدد المنتجات</p>
                <p className="text-2xl font-bold text-red-600 tabular-nums">{data.total_count}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground">الفترة</p>
                <p className="text-xs font-semibold tabular-nums">{data.from_date} → {data.to_date}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] text-muted-foreground">الحد الأدنى</p>
                <p className="text-lg font-bold">{data.threshold}%</p>
              </div>
              {data.total_loss > 0 && (
                <div className="rounded-lg border bg-red-500/10 border-red-500/40 p-3">
                  <p className="text-[10px] text-muted-foreground">إجمالي الخسارة</p>
                  <p className="text-lg font-bold text-red-700 tabular-nums">
                    {formatPriceLocal(data.total_loss)}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm" data-testid="low-profit-table">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="p-2 text-right">المنتج</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-left">الإيراد</th>
                    <th className="p-2 text-left">التكلفة</th>
                    <th className="p-2 text-left">الربح</th>
                    <th className="p-2 text-left">الهامش</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.products || []).map((p, idx) => {
                    const losing = (p.profit || 0) < 0;
                    return (
                      <tr
                        key={idx}
                        className={`border-t ${losing ? 'bg-red-500/10' : 'bg-amber-500/5'}`}
                        data-testid={`low-profit-row-${idx}`}
                      >
                        <td className="p-2 font-medium">
                          {losing ? '🔴 ' : '⚠️ '}
                          {p.name}
                        </td>
                        <td className="p-2 text-center tabular-nums">{p.quantity}</td>
                        <td className="p-2 text-left tabular-nums">{formatPriceLocal(p.revenue)}</td>
                        <td className="p-2 text-left tabular-nums">{formatPriceLocal(p.total_cost)}</td>
                        <td className={`p-2 text-left tabular-nums font-bold ${losing ? 'text-red-700' : 'text-amber-700'}`}>
                          {formatPriceLocal(p.profit)}
                        </td>
                        <td className={`p-2 text-left tabular-nums font-bold ${losing ? 'text-red-700' : 'text-amber-700'}`}>
                          {Number(p.profit_margin).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-muted-foreground p-2 rounded bg-muted/30 border">
              💡 <strong>نصيحة</strong>: راجع أسعار البيع أو تكاليف المواد لهذه المنتجات قبل أن تتراكم الخسارة.
              بعد إغلاق هذا التنبيه، لن يظهر مرة أخرى حتى الأسبوع التالي.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleDismiss}
              data-testid="low-profit-dismiss-btn"
            >
              فهمت — إغلاق حتى الأسبوع القادم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
