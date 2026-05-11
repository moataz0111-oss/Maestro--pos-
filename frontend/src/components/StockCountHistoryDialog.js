import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  ClipboardCheck,
  History,
  RefreshCw,
  Calendar,
  TrendingDown,
  User,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, Legend, LineChart, Line,
} from 'recharts';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { API_URL } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const API = API_URL;

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function isoDay(d) {
  return d.toISOString().split('T')[0];
}

export default function StockCountHistoryDialog({ open, onOpenChange, branchId, branchName }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const isAdmin = hasRole(['admin', 'super_admin', 'manager', 'branch_manager']);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDay(d);
  });
  const [endDate, setEndDate] = useState(isoDay(new Date()));

  const fetchHistory = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/branch-stock-count/history`, {
        params: { branch_id: branchId, start_date: startDate, end_date: endDate },
      });
      setRows(res.data?.counts || []);
    } catch (_e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && branchId) fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branchId, startDate, endDate]);

  // === التحليلات (للمالك فقط) ===
  const dayOfWeekStats = useMemo(() => {
    if (!isAdmin || rows.length === 0) return [];
    const buckets = DAYS_AR.map((name, idx) => ({ day_index: idx, name, total_loss: 0, count: 0, total_variance: 0 }));
    rows.forEach(r => {
      try {
        const d = new Date(r.business_date);
        const idx = d.getDay();
        buckets[idx].total_loss += r.total_loss_value || 0;
        buckets[idx].total_variance += r.total_variance || 0;
        buckets[idx].count += 1;
      } catch (_e) { /* ignore */ }
    });
    return buckets.map(b => ({
      ...b,
      avg_loss: b.count > 0 ? Math.round(b.total_loss / b.count) : 0,
    }));
  }, [rows, isAdmin]);

  const timelineStats = useMemo(() => {
    if (!isAdmin) return [];
    return [...rows].sort((a, b) => (a.business_date > b.business_date ? 1 : -1)).map(r => ({
      date: r.business_date,
      loss: r.total_loss_value || 0,
      variance: r.total_variance || 0,
    }));
  }, [rows, isAdmin]);

  const totalLoss = rows.reduce((s, r) => s + (r.total_loss_value || 0), 0);
  const totalVariance = rows.reduce((s, r) => s + (r.total_variance || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" data-testid="stock-count-history-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-500" />
            {t('سجل الجرود اليومية')} — {branchName}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {isAdmin ? t('عرض السجل التاريخي وتحليل أنماط الفقد حسب اليوم والفترة') : t('عرض الجرود السابقة الخاصة بك')}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {t('من تاريخ')}
                  </Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="history-start-date"
                  />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {t('إلى تاريخ')}
                  </Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    data-testid="history-end-date"
                  />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={fetchHistory} disabled={loading} className="w-full">
                    <RefreshCw className={`h-4 w-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
                    {t('تحديث')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary cards (admin only) */}
          {isAdmin && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/40">
                <p className="text-xs text-muted-foreground">{t('عدد الجرود')}</p>
                <p className="text-xl font-bold tabular-nums">{rows.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="text-xs text-muted-foreground">{t('إجمالي الوحدات المفقودة')}</p>
                <p className="text-xl font-bold text-amber-600 tabular-nums">{totalVariance.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-xs text-muted-foreground">{t('إجمالي قيمة الفقد')}</p>
                <p className="text-xl font-bold text-red-600 tabular-nums">{formatPrice(totalLoss)}</p>
              </div>
            </div>
          )}

          {/* Charts (admin only) */}
          {isAdmin && rows.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Day-of-week comparison */}
              <Card>
                <CardContent className="p-3">
                  <p className="font-bold mb-2 flex items-center gap-2 text-sm">
                    <BarChart3 className="h-4 w-4 text-purple-500" />
                    {t('متوسط الفقد حسب اليوم في الأسبوع')}
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dayOfWeekStats} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <ChartTooltip formatter={(v) => `${v.toLocaleString()} IQD`} />
                      <Bar dataKey="avg_loss" name={t('متوسط الفقد')} fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card>
                <CardContent className="p-3">
                  <p className="font-bold mb-2 flex items-center gap-2 text-sm">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    {t('تطور الفقد على مر الفترة')}
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={timelineStats} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <ChartTooltip formatter={(v) => `${v.toLocaleString()} IQD`} />
                      <Line type="monotone" dataKey="loss" name={t('قيمة الفقد')} stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* History list */}
          <Card>
            <CardContent className="p-3">
              <p className="font-bold mb-2 text-sm">{t('السجل التفصيلي')} ({rows.length})</p>
              {loading ? (
                <div className="flex justify-center py-6"><RefreshCw className="h-5 w-5 animate-spin" /></div>
              ) : rows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {t('لا توجد جرود سابقة في هذه الفترة')}
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map(r => {
                    const isExpanded = expandedId === r.id;
                    const lossItems = (r.items || []).filter(it => (it.variance || 0) > 0);
                    return (
                      <div key={r.id} className="border rounded-lg overflow-hidden" data-testid={`history-row-${r.id}`}>
                        <div
                          className="p-3 hover:bg-muted/30 cursor-pointer flex items-center justify-between flex-wrap gap-2"
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        >
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge className="bg-blue-500/15 text-blue-700">
                              <Calendar className="h-3 w-3 ml-1" />
                              {r.business_date}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {r.submitted_by_name || '—'}
                            </span>
                            {r.submitted_at && (
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(r.submitted_at).toLocaleString('ar-EG', {
                                  hour: '2-digit', minute: '2-digit', second: '2-digit'
                                })}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {isAdmin && (
                              <>
                                <span className="text-xs">
                                  <span className="text-muted-foreground">{t('الفقد')}:</span>{' '}
                                  <span className="font-bold text-amber-600">{(r.total_variance || 0).toLocaleString()}</span>
                                </span>
                                <span className="text-xs">
                                  <span className="text-muted-foreground">{t('القيمة')}:</span>{' '}
                                  <span className="font-bold text-red-600">{formatPrice(r.total_loss_value)}</span>
                                </span>
                              </>
                            )}
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="p-3 bg-muted/10 border-t">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-2 py-1 text-right">{t('المنتج')}</th>
                                    <th className="px-2 py-1 text-center">{t('افتتاحي')}</th>
                                    <th className="px-2 py-1 text-center">{t('وارد')}</th>
                                    <th className="px-2 py-1 text-center">{t('مباع')}</th>
                                    {isAdmin && <th className="px-2 py-1 text-center">{t('المتوقع')}</th>}
                                    <th className="px-2 py-1 text-center">{t('الفعلي')}</th>
                                    {isAdmin && (
                                      <>
                                        <th className="px-2 py-1 text-center">{t('الفرق')}</th>
                                        <th className="px-2 py-1 text-center">{t('قيمة الفقد')}</th>
                                      </>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(r.items || []).map((it, idx) => {
                                    const hasLoss = (it.variance || 0) > 0;
                                    return (
                                      <tr key={idx} className={`border-t ${hasLoss ? 'bg-red-500/5' : ''}`}>
                                        <td className="px-2 py-1 font-medium">{it.product_name}</td>
                                        <td className="px-2 py-1 text-center tabular-nums">{(it.opening_qty || 0).toLocaleString()}</td>
                                        <td className="px-2 py-1 text-center tabular-nums text-emerald-600">+{(it.received_qty || 0).toLocaleString()}</td>
                                        <td className="px-2 py-1 text-center tabular-nums text-red-500">-{(it.sold_qty || 0).toLocaleString()}</td>
                                        {isAdmin && <td className="px-2 py-1 text-center tabular-nums font-bold text-emerald-700">{(it.expected_qty || 0).toLocaleString()}</td>}
                                        <td className="px-2 py-1 text-center tabular-nums font-bold">{(it.actual_qty || 0).toLocaleString()}</td>
                                        {isAdmin && (
                                          <>
                                            <td className="px-2 py-1 text-center tabular-nums">
                                              {hasLoss ? <span className="text-red-600 font-bold">-{it.variance.toFixed(2)}</span> : <span className="text-muted-foreground">—</span>}
                                            </td>
                                            <td className="px-2 py-1 text-center tabular-nums">
                                              {hasLoss ? <span className="text-red-600 font-bold">{formatPrice(it.variance_cost)}</span> : <span className="text-muted-foreground">—</span>}
                                            </td>
                                          </>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {isAdmin && lossItems.length > 0 && (
                              <p className="text-[11px] text-muted-foreground mt-2">
                                ⚠️ {t('تم توزيع الفقد تلقائياً على')} {lossItems.length} {t('منتج/منتجات')} وتسجيله في تقرير كفاءة الهدر.
                              </p>
                            )}
                            {r.notes && (
                              <p className="text-xs mt-2 p-2 bg-yellow-500/5 border border-yellow-500/20 rounded">
                                <strong>{t('ملاحظات')}:</strong> {r.notes}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('إغلاق')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
