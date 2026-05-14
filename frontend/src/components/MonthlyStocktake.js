import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  ClipboardCheck, CheckCircle2, RefreshCw, AlertTriangle,
  TrendingDown, TrendingUp, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { API_URL } from '../utils/api';

const API = API_URL;

const DEPT_META = {
  manufacturing: { label: 'قسم التصنيع', color: 'purple' },
  warehouse_raw: { label: 'المخزن (مواد خام)', color: 'blue' },
  packaging: { label: 'مخزن مواد التغليف', color: 'amber' },
};

/**
 * زر الجرد الشهري — يظهر تلقائياً في آخر 5 أيام من الشهر.
 * Props: department: 'manufacturing' | 'warehouse_raw' | 'packaging'
 */
export function MonthlyStocktakeButton({ department }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API}/department-stock-count/is-due`);
      setStatus(res.data);
    } catch (_e) { /* ignore */ }
  };

  useEffect(() => {
    fetchStatus();
    const t1 = setInterval(fetchStatus, 60_000 * 30); // refresh every 30min
    return () => clearInterval(t1);
  }, []);

  if (!status || !status.is_due) return null;
  const deptStatus = status.departments?.[department] || {};
  const meta = DEPT_META[department];
  const submitted = deptStatus.submitted;
  const colorBase = meta?.color || 'orange';

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className={`relative px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 border-2 ${
          submitted
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/15'
            : `bg-${colorBase}-500/10 border-${colorBase}-500/50 text-${colorBase}-700 hover:bg-${colorBase}-500/20 animate-pulse`
        }`}
        data-testid={`monthly-stocktake-btn-${department}`}
        style={!submitted ? { borderColor: '#f97316', color: '#c2410c', backgroundColor: 'rgba(249,115,22,0.08)' } : undefined}
      >
        {submitted ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
        {t('الجرد الشهري')}
        {!submitted && (
          <Badge className="bg-red-500 text-white text-[10px]">
            {status.days_remaining_in_month + 1} {t('يوم متبقي')}
          </Badge>
        )}
      </button>
      <MonthlyStocktakeDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        department={department}
        onSubmitted={fetchStatus}
      />
    </>
  );
}

function MonthlyStocktakeDialog({ open, onOpenChange, department, onSubmitted }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [actuals, setActuals] = useState({});
  const [notes, setNotes] = useState('');

  const fetchTemplate = async () => {
    if (!department) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/department-stock-count/template`, { params: { department } });
      setData(res.data);
      const map = {};
      (res.data.items || []).forEach(it => { map[it.item_id] = it.actual_qty != null ? it.actual_qty : ''; });
      setActuals(map);
      setNotes(res.data.notes || '');
    } catch (_e) {
      toast.error(t('فشل تحميل قالب الجرد'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) fetchTemplate(); /* eslint-disable-next-line */ }, [open, department]);

  const computed = useMemo(() => {
    if (!data) return { items: [], total_loss: 0, total_surplus: 0 };
    const items = (data.items || []).map(it => {
      const a = actuals[it.item_id];
      const actual = a === '' || a == null ? null : parseFloat(a);
      const variance = actual == null ? null : Math.max(0, it.system_qty - actual);
      const surplus = actual == null ? null : Math.max(0, actual - it.system_qty);
      const lossCost = variance != null ? variance * (it.unit_cost || 0) : null;
      return { ...it, _actual: actual, _variance: variance, _surplus: surplus, _lossCost: lossCost };
    });
    const total_loss = items.reduce((s, x) => s + (x._lossCost || 0), 0);
    const total_surplus = items.reduce((s, x) => s + (x._surplus || 0), 0);
    return { items, total_loss, total_surplus };
  }, [data, actuals]);

  const handleSubmit = async () => {
    const missing = computed.items.filter(it => it._actual == null);
    if (missing.length > 0) {
      toast.error(t(`أدخل الكميات الفعلية لجميع الأصناف (${missing.length} متبقي)`));
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/department-stock-count/submit`, {
        department,
        items: computed.items.map(it => ({ item_id: it.item_id, actual_qty: it._actual })),
        notes: notes || null,
      });
      toast.success(t('تم حفظ الجرد الشهري ✓'));
      if (onSubmitted) onSubmitted();
      onOpenChange(false);
    } catch (_e) {
      toast.error(t('فشل حفظ الجرد'));
    } finally {
      setSaving(false);
    }
  };

  const deptLabel = DEPT_META[department]?.label || department;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="monthly-stocktake-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-orange-500" />
            {t('الجرد الشهري')} — {deptLabel}
            {data?.period && (
              <Badge variant="outline" className="text-[11px]">
                <Calendar className="h-3 w-3 ml-1" />
                {data.period}
              </Badge>
            )}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t('أدخل الكمية الفعلية لكل صنف. النظام يقارنها بالكمية النظامية ويعرض الفقد/الفائض.')}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !data ? (
          <div className="text-center py-12 text-muted-foreground">—</div>
        ) : (
          <div className="space-y-3">
            {data.has_submitted && (
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="p-2 text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {t('تم تسجيل هذا الجرد بواسطة')} <strong>{data.submitted_by_name}</strong>
                  <span className="text-xs text-muted-foreground">— {new Date(data.submitted_at).toLocaleString('ar-EG')}</span>
                  <span className="mr-auto text-xs">{t('يمكنك إعادة الإدخال للتصحيح')}</span>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="p-2 rounded bg-muted/40">
                <p className="text-[11px] text-muted-foreground">{t('عدد الأصناف')}</p>
                <p className="text-lg font-bold">{computed.items.length}</p>
              </div>
              <div className="p-2 rounded bg-red-500/5 border border-red-500/20">
                <p className="text-[11px] text-muted-foreground">{t('قيمة الفقد')}</p>
                <p className="text-lg font-bold text-red-600 tabular-nums" data-testid="dept-total-loss">{formatPrice(computed.total_loss)}</p>
              </div>
              <div className="p-2 rounded bg-blue-500/5 border border-blue-500/20">
                <p className="text-[11px] text-muted-foreground">{t('فائض غير متوقع')}</p>
                <p className="text-lg font-bold text-blue-600 tabular-nums">{computed.total_surplus.toFixed(2)}</p>
              </div>
              <div className="p-2 rounded bg-muted/40">
                <p className="text-[11px] text-muted-foreground">{t('الفترة')}</p>
                <p className="text-lg font-bold tabular-nums">{data.period}</p>
              </div>
            </div>

            {computed.items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {t('لا توجد أصناف في هذا القسم لإجراء الجرد')}
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg max-h-[55vh]">
                <table className="w-full text-sm" data-testid="dept-stocktake-table">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-right">{t('الصنف')}</th>
                      <th className="px-2 py-2 text-center bg-emerald-500/10">{t('الكمية النظامية')}</th>
                      <th className="px-2 py-2 text-center bg-blue-500/10">{t('الكمية الفعلية *')}</th>
                      <th className="px-2 py-2 text-center bg-amber-500/10">{t('الفرق')}</th>
                      <th className="px-2 py-2 text-center bg-red-500/10">{t('قيمة الفقد')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computed.items.map(it => {
                      const hasLoss = (it._variance || 0) > 0;
                      const hasSurplus = (it._surplus || 0) > 0;
                      return (
                        <tr key={it.item_id} className="border-t border-border hover:bg-muted/20" data-testid={`dept-count-row-${it.item_id}`}>
                          <td className="px-2 py-2 font-medium">{it.item_name}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-emerald-700 bg-emerald-500/5">
                            {(it.system_qty || 0).toLocaleString()} <span className="text-[10px] text-muted-foreground">{it.unit}</span>
                          </td>
                          <td className="px-2 py-2 text-center bg-blue-500/5">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={actuals[it.item_id] ?? ''}
                              onChange={(e) => setActuals(p => ({ ...p, [it.item_id]: e.target.value }))}
                              className="w-24 mx-auto text-center font-bold"
                              data-testid={`dept-actual-${it.item_id}`}
                              placeholder="0"
                            />
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums">
                            {it._actual == null ? <span className="text-muted-foreground">—</span> :
                              hasLoss ? <span className="text-red-600 font-bold"><TrendingDown className="h-3 w-3 inline ml-1" />-{it._variance.toFixed(2)}</span> :
                              hasSurplus ? <span className="text-blue-600 font-bold"><TrendingUp className="h-3 w-3 inline ml-1" />+{it._surplus.toFixed(2)}</span> :
                              <span className="text-emerald-600">✓</span>}
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums">
                            {hasLoss ? <span className="text-red-600 font-bold">{formatPrice(it._lossCost)}</span> : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <Label className="text-xs">{t('ملاحظات (اختياري)')}</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('مثلاً: تالف، أو سبب الفقد...')} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('إلغاء')}</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || loading || !data || computed.items.length === 0}
            className="bg-emerald-500 hover:bg-emerald-600"
            data-testid="dept-submit-stocktake"
          >
            {saving ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <ClipboardCheck className="h-4 w-4 ml-2" />}
            {t('حفظ الجرد')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MonthlyStocktakeDialog;
