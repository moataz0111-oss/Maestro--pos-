import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  AlertTriangle, Activity, Clock, RefreshCw, TrendingDown,
  PackageX, CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, Cell, ReferenceLine,
} from 'recharts';
import { useTranslation } from '../hooks/useTranslation';
import { API_URL } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const API = API_URL;

const STATUS_META = {
  out_of_stock: { label: '⛔ نفد', cls: 'bg-gray-900 text-white', bar: '#1f2937' },
  critical: { label: '🔴 حرج', cls: 'bg-red-500/20 text-red-700 dark:text-red-400', bar: '#ef4444' },
  warning: { label: '🟡 تحذير', cls: 'bg-amber-500/20 text-amber-700', bar: '#f59e0b' },
  safe: { label: '🟢 آمن', cls: 'bg-emerald-500/20 text-emerald-700', bar: '#10b981' },
  no_consumption: { label: '⏸ بدون استهلاك', cls: 'bg-muted text-muted-foreground', bar: '#9ca3af' },
};

export function StockoutPredictionBanner({ onOpenDetails }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canView = hasRole(['admin', 'super_admin', 'manager', 'branch_manager', 'warehouse', 'warehouse_keeper', 'stock_keeper']);
  const [summary, setSummary] = useState(null);
  const [criticalItems, setCriticalItems] = useState([]);

  const fetchData = async () => {
    if (!canView) return;
    try {
      const res = await axios.get(`${API}/raw-materials/stockout-predictions`);
      setSummary(res.data?.summary || null);
      setCriticalItems((res.data?.predictions || []).filter(p => p.status === 'critical' || p.status === 'out_of_stock').slice(0, 3));
    } catch (_e) { /* ignore */ }
  };

  useEffect(() => { fetchData(); }, [canView]); // eslint-disable-line

  if (!canView || !summary) return null;
  const hasUrgent = (summary.out_of_stock || 0) + (summary.critical || 0) > 0;
  const hasWarning = (summary.warning || 0) > 0;
  if (!hasUrgent && !hasWarning) return null;

  return (
    <div
      className={`rounded-lg border-2 p-3 cursor-pointer transition-all hover:shadow-md ${
        hasUrgent ? 'border-red-500/50 bg-red-500/5' : 'border-amber-500/50 bg-amber-500/5'
      }`}
      onClick={onOpenDetails}
      data-testid="stockout-banner"
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${hasUrgent ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
            <Activity className={`h-5 w-5 ${hasUrgent ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div>
            <p className="font-bold text-sm">
              {hasUrgent
                ? t('🚨 تنبؤ ذكي: مواد على وشك النفاد!')
                : t('⚠️ تنبؤ ذكي: مواد تحتاج متابعة')}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.out_of_stock > 0 && <span className="text-red-600 font-bold ml-2">{summary.out_of_stock} نفدت</span>}
              {summary.critical > 0 && <span className="text-red-600 font-bold ml-2">{summary.critical} حرج</span>}
              {summary.warning > 0 && <span className="text-amber-600 ml-2">{summary.warning} تحذير</span>}
              <span className="text-muted-foreground">— {t('اضغط للتفاصيل')}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {criticalItems.map(it => (
            <Badge key={it.material_id} className="bg-red-500/15 text-red-700 dark:text-red-400 text-[11px]">
              {it.name} —{' '}
              {it.days_remaining != null
                ? <span>{t('سينفد بعد')} <strong>{it.days_remaining.toFixed(1)}</strong> {t('يوم')}</span>
                : <span>{t('نفد')}</span>}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StockoutPredictionDialog({ open, onOpenChange }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ predictions: [], summary: null });
  const [filter, setFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/raw-materials/stockout-predictions`);
      setData({
        predictions: res.data?.predictions || [],
        summary: res.data?.summary || null,
      });
    } catch (_e) {
      setData({ predictions: [], summary: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) fetchData(); }, [open]);

  const filtered = useMemo(() => {
    if (filter === 'all') return data.predictions;
    if (filter === 'urgent') return data.predictions.filter(p => ['out_of_stock', 'critical'].includes(p.status));
    return data.predictions.filter(p => p.status === filter);
  }, [data.predictions, filter]);

  const chartData = useMemo(() => {
    return data.predictions
      .filter(p => p.days_remaining != null)
      .slice(0, 15) // top 15 most urgent
      .map(p => ({
        name: p.name?.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
        days: p.days_remaining,
        status: p.status,
      }));
  }, [data.predictions]);

  const s = data.summary || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" data-testid="stockout-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-orange-500" />
            {t('التنبؤ الذكي بنفاد المخزون')}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t('تحليل تلقائي بناءً على آخر')} {s.lookback_days || 30} {t('يوماً من حركات الخروج. يُظهر متى سينفد كل صنف وفق الاستهلاك الحالي.')}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* بطاقات الملخص */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { key: 'urgent', label: 'يحتاج تدخل فوراً', count: (s.out_of_stock || 0) + (s.critical || 0), cls: 'bg-red-500/10 border-red-500/30 text-red-700', icon: PackageX },
                { key: 'warning', label: 'تحذير', count: s.warning || 0, cls: 'bg-amber-500/10 border-amber-500/30 text-amber-700', icon: AlertTriangle },
                { key: 'safe', label: 'آمن', count: s.safe || 0, cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700', icon: CheckCircle2 },
                { key: 'no_consumption', label: 'بدون استهلاك', count: s.no_consumption || 0, cls: 'bg-muted border-border text-muted-foreground', icon: Clock },
                { key: 'all', label: 'إجمالي', count: s.total || 0, cls: 'bg-primary/10 border-primary/30 text-primary', icon: Activity },
              ].map(card => {
                const Icon = card.icon;
                const active = filter === card.key;
                return (
                  <button
                    key={card.key}
                    onClick={() => setFilter(card.key)}
                    className={`p-3 rounded-lg border-2 text-right transition-all ${card.cls} ${active ? 'ring-2 ring-offset-1 ring-current' : 'opacity-80 hover:opacity-100'}`}
                    data-testid={`filter-${card.key}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Icon className="h-4 w-4" />
                      <span className="text-2xl font-bold tabular-nums">{card.count}</span>
                    </div>
                    <p className="text-xs">{t(card.label)}</p>
                  </button>
                );
              })}
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
              <Card>
                <CardContent className="p-3">
                  <p className="font-bold mb-2 flex items-center gap-2 text-sm">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    {t('الأيام المتبقية لأكثر 15 مادة عُرضة للنفاد')}
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={70} interval={0} />
                      <YAxis tick={{ fontSize: 11 }} label={{ value: t('الأيام'), angle: -90, position: 'insideLeft' }} />
                      <ChartTooltip formatter={(v) => `${v} ${t('يوم')}`} />
                      <ReferenceLine y={3} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '3 أيام (حرج)', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                      <ReferenceLine y={7} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '7 أيام (تحذير)', fill: '#f59e0b', fontSize: 10, position: 'right' }} />
                      <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={STATUS_META[entry.status]?.bar || '#6b7280'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Table */}
            <Card>
              <CardContent className="p-3">
                <p className="font-bold mb-2 text-sm">{t('التفاصيل')} ({filtered.length})</p>
                {filtered.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {t('لا توجد بيانات في هذه الفئة')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="predictions-table">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-2 py-2 text-right">{t('المادة')}</th>
                          <th className="px-2 py-2 text-center">{t('الحالة')}</th>
                          <th className="px-2 py-2 text-center">{t('المتوفر')}</th>
                          <th className="px-2 py-2 text-center">{t('الاستهلاك اليومي')}</th>
                          <th className="px-2 py-2 text-center">{t('أيام متبقية')}</th>
                          <th className="px-2 py-2 text-center">{t('تاريخ النفاد المتوقع')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(p => {
                          const meta = STATUS_META[p.status] || STATUS_META.no_consumption;
                          return (
                            <tr key={p.material_id} className="border-t border-border hover:bg-muted/20" data-testid={`pred-row-${p.material_id}`}>
                              <td className="px-2 py-2 font-medium">{p.name}</td>
                              <td className="px-2 py-2 text-center">
                                <Badge className={meta.cls}>{meta.label}</Badge>
                              </td>
                              <td className="px-2 py-2 text-center tabular-nums">
                                {p.current_stock.toLocaleString()} <span className="text-[10px] text-muted-foreground">{p.unit}</span>
                                {p.below_min && <span className="block text-[10px] text-red-500">{t('≤ الحد الأدنى')}</span>}
                              </td>
                              <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">
                                {p.daily_avg > 0 ? `${p.daily_avg} ${p.unit}` : '—'}
                              </td>
                              <td className="px-2 py-2 text-center font-bold tabular-nums">
                                {p.days_remaining != null ? (
                                  <span className={p.days_remaining <= 3 ? 'text-red-600' : p.days_remaining <= 7 ? 'text-amber-600' : 'text-emerald-600'}>
                                    {p.days_remaining.toFixed(1)} {t('يوم')}
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-2 py-2 text-center text-xs">
                                {p.stockout_date ? (
                                  <span className={p.status === 'critical' || p.status === 'out_of_stock' ? 'text-red-600 font-bold' : 'text-muted-foreground'}>
                                    {p.stockout_date}
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
            {t('تحديث')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('إغلاق')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
