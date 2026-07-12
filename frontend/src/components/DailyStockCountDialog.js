import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
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
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Beaker,
  ChevronDown,
  ChevronUp,
  Package,
  Boxes,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { API_URL } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const API = API_URL;

export default function DailyStockCountDialog({ open, onOpenChange, branchId, branchName, onSubmitted }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const isAdmin = hasRole(['admin', 'general_manager', 'super_admin', 'manager', 'branch_manager']);

  // التبويب النشط: المنتجات أو التغليف
  const [view, setView] = useState('products');

  // ── حالة جرد المنتجات ──
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [actuals, setActuals] = useState({}); // product_id -> actual_qty
  const [notes, setNotes] = useState('');
  const [expandedRecipes, setExpandedRecipes] = useState({});

  // ── حالة جرد التغليف ──
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgSaving, setPkgSaving] = useState(false);
  const [pkgData, setPkgData] = useState(null);
  const [pkgActuals, setPkgActuals] = useState({}); // packaging_material_id -> actual_qty
  const [pkgNotes, setPkgNotes] = useState('');

  const fetchTemplate = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/branch-stock-count/today`, { params: { branch_id: branchId } });
      setData(res.data);
      const initial = {};
      (res.data.items || []).forEach(it => {
        initial[it.product_id] = it.actual_qty != null ? it.actual_qty : '';
      });
      setActuals(initial);
      setNotes(res.data.notes || '');
    } catch (e) {
      toast.error(t('فشل تحميل قالب الجرد'));
    } finally {
      setLoading(false);
    }
  };

  const fetchPackaging = async () => {
    if (!branchId) return;
    setPkgLoading(true);
    try {
      const res = await axios.get(`${API}/branch-stock-count/packaging-today`, { params: { branch_id: branchId } });
      setPkgData(res.data);
      const initial = {};
      (res.data.items || []).forEach(it => {
        initial[it.packaging_material_id] = it.actual_qty != null ? it.actual_qty : '';
      });
      setPkgActuals(initial);
    } catch (e) {
      toast.error(t('فشل تحميل جرد التغليف'));
    } finally {
      setPkgLoading(false);
    }
  };

  useEffect(() => {
    if (open && branchId) {
      setView('products');
      fetchTemplate();
      fetchPackaging();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branchId]);

  // حساب الفرق وقيمة الفقد لكل منتج فور الإدخال
  const computed = useMemo(() => {
    if (!data) return { items: [], total_variance: 0, total_loss: 0 };
    const out = (data.items || []).map(it => {
      const actualRaw = actuals[it.product_id];
      const actual = actualRaw === '' || actualRaw == null ? null : parseFloat(actualRaw);
      const variance = actual == null ? null : Math.max(0, it.expected_qty - actual);
      const surplus = actual == null ? null : Math.max(0, actual - it.expected_qty);
      const lossCost = variance != null ? variance * (it.unit_cost || 0) : null;
      return { ...it, _actual: actual, _variance: variance, _surplus: surplus, _lossCost: lossCost };
    });
    const total_variance = out.reduce((s, x) => s + (x._variance || 0), 0);
    const total_loss = out.reduce((s, x) => s + (x._lossCost || 0), 0);
    const total_surplus = out.reduce((s, x) => s + (x._surplus || 0), 0);
    return { items: out, total_variance, total_loss, total_surplus };
  }, [data, actuals]);

  // حساب جرد التغليف فور الإدخال
  const pkgComputed = useMemo(() => {
    if (!pkgData) return { items: [], total_variance: 0, total_loss: 0, total_surplus: 0 };
    const out = (pkgData.items || []).map(it => {
      const actualRaw = pkgActuals[it.packaging_material_id];
      const actual = actualRaw === '' || actualRaw == null ? null : parseFloat(actualRaw);
      const variance = actual == null ? null : Math.max(0, it.expected_qty - actual);
      const surplus = actual == null ? null : Math.max(0, actual - it.expected_qty);
      const lossCost = variance != null ? variance * (it.unit_cost || 0) : null;
      return { ...it, _actual: actual, _variance: variance, _surplus: surplus, _lossCost: lossCost };
    });
    const total_variance = out.reduce((s, x) => s + (x._variance || 0), 0);
    const total_loss = out.reduce((s, x) => s + (x._lossCost || 0), 0);
    const total_surplus = out.reduce((s, x) => s + (x._surplus || 0), 0);
    return { items: out, total_variance, total_loss, total_surplus };
  }, [pkgData, pkgActuals]);

  const handleSubmit = async () => {
    if (!data || !branchId) return;
    const missing = computed.items.filter(it => it._actual == null);
    if (missing.length > 0) {
      toast.error(t(`يجب إدخال الكمية الفعلية لجميع المنتجات (${missing.length} متبقي)`));
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/branch-stock-count/submit`, {
        branch_id: branchId,
        business_date: data.business_date,
        items: computed.items.map(it => ({
          product_id: it.product_id,
          actual_qty: it._actual,
        })),
        notes: notes || null,
      });
      toast.success(t('تم حفظ الجرد اليومي بنجاح'));
      if (onSubmitted) onSubmitted();
      fetchTemplate();
    } catch (e) {
      toast.error(t('فشل حفظ الجرد'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitPackaging = async () => {
    if (!pkgData || !branchId) return;
    const missing = pkgComputed.items.filter(it => it._actual == null);
    if (missing.length > 0) {
      toast.error(t(`يجب إدخال الكمية الفعلية لجميع مواد التغليف (${missing.length} متبقي)`));
      return;
    }
    setPkgSaving(true);
    try {
      await axios.post(`${API}/branch-stock-count/submit-packaging`, {
        branch_id: branchId,
        business_date: pkgData.business_date,
        items: pkgComputed.items.map(it => ({
          packaging_material_id: it.packaging_material_id,
          actual_qty: it._actual,
        })),
        notes: pkgNotes || null,
      });
      toast.success(t('تم حفظ جرد التغليف بنجاح'));
      if (onSubmitted) onSubmitted();
      fetchPackaging();
    } catch (e) {
      toast.error(t('فشل حفظ جرد التغليف'));
    } finally {
      setPkgSaving(false);
    }
  };

  const toggleRecipe = (pid) => setExpandedRecipes(prev => ({ ...prev, [pid]: !prev[pid] }));

  const isPackaging = view === 'packaging';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="daily-stock-count-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-emerald-500" />
            {t('الجرد اليومي للفرع')} — {branchName}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {isPackaging
              ? t('أدخل الكمية الفعلية المتبقية من كل مادة تغليف بنهاية اليوم. النظام سيحسب الفقد تلقائياً.')
              : t('أدخل الكمية الفعلية المتبقية لكل منتج بنهاية اليوم. النظام سيحسب الفقد ويوزعه على مكونات الوصفة تلقائياً.')}
          </p>
        </DialogHeader>

        {/* أزرار التبديل بين الجردين */}
        <div className="flex items-center gap-2 p-1 bg-muted/40 rounded-lg w-fit" data-testid="count-view-toggle">
          <Button
            type="button"
            size="sm"
            variant={view === 'products' ? 'default' : 'ghost'}
            className={view === 'products' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            onClick={() => setView('products')}
            data-testid="toggle-products-count"
          >
            <Boxes className="h-4 w-4 ml-1" />
            {t('جرد المنتجات')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === 'packaging' ? 'default' : 'ghost'}
            className={view === 'packaging' ? 'bg-amber-500 hover:bg-amber-600' : ''}
            onClick={() => setView('packaging')}
            data-testid="toggle-packaging-count"
          >
            <Package className="h-4 w-4 ml-1" />
            {t('جرد التغليف')}
          </Button>
        </div>

        {/* ════════════ جرد المنتجات ════════════ */}
        {!isPackaging && (
          loading ? (
            <div className="flex justify-center items-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !data ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>{t('اختر الفرع لعرض الجرد')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* تاريخ + حالة */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">{t('تاريخ العمل')}:</span>{' '}
                  <span className="font-bold">{data.business_date}</span>
                </div>
                {data.has_submitted_today ? (
                  <Badge className="bg-emerald-500/20 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 ml-1" />
                    {t('تم التسجيل')} — {data.submitted_by_name}
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-700">
                    {t('بانتظار التسجيل')}
                  </Badge>
                )}
              </div>

              {/* ملخص حي */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-xs text-muted-foreground">{t('عدد المنتجات')}</p>
                  <p className="text-xl font-bold tabular-nums">{computed.items.length}</p>
                </div>
                {isAdmin && (
                  <>
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <p className="text-xs text-muted-foreground">{t('إجمالي الفقد')}</p>
                      <p className="text-xl font-bold text-amber-600 tabular-nums" data-testid="total-variance">{computed.total_variance.toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      <p className="text-xs text-muted-foreground">{t('قيمة الفقد')}</p>
                      <p className="text-xl font-bold text-red-600 tabular-nums" data-testid="total-loss-value">{formatPrice(computed.total_loss)}</p>
                    </div>
                    {computed.total_surplus > 0 && (
                      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <p className="text-xs text-muted-foreground">{t('فائض غير متوقع')}</p>
                        <p className="text-xl font-bold text-blue-600 tabular-nums">{computed.total_surplus.toLocaleString()}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {computed.items.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="no-products">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>{t('لا توجد منتجات مصنّعة في مخزن هذا الفرع لإجراء الجرد')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm" data-testid="stock-count-table">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-right">{t('المنتج')}</th>
                        <th className="px-2 py-2 text-center">{t('افتتاحي')}</th>
                        <th className="px-2 py-2 text-center">{t('وارد')}</th>
                        <th className="px-2 py-2 text-center">{t('مباع')}</th>
                        {isAdmin && (
                          <th className="px-2 py-2 text-center bg-emerald-500/10">{t('المتوقع')}</th>
                        )}
                        <th className="px-2 py-2 text-center bg-blue-500/10">{t('الفعلي *')}</th>
                        {isAdmin && (
                          <>
                            <th className="px-2 py-2 text-center bg-amber-500/10">{t('الفرق')}</th>
                            <th className="px-2 py-2 text-center bg-red-500/10">{t('قيمة الفقد')}</th>
                          </>
                        )}
                        <th className="px-2 py-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {computed.items.map(it => {
                        const hasLoss = (it._variance || 0) > 0;
                        const hasSurplus = (it._surplus || 0) > 0;
                        return (
                          <React.Fragment key={it.product_id}>
                            <tr className="border-t border-border hover:bg-muted/20" data-testid={`count-row-${it.product_id}`}>
                              <td className="px-3 py-2 font-medium">{it.product_name}</td>
                              <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{(it.opening_qty || 0).toLocaleString()}</td>
                              <td className="px-2 py-2 text-center tabular-nums text-emerald-600">+{(it.received_qty || 0).toLocaleString()}</td>
                              <td className="px-2 py-2 text-center tabular-nums text-red-500">-{(it.sold_qty || 0).toLocaleString()}</td>
                              {isAdmin && (
                                <td className="px-2 py-2 text-center tabular-nums font-bold text-emerald-700 bg-emerald-500/5">
                                  {(it.expected_qty || 0).toLocaleString()}
                                  <span className="text-[10px] text-muted-foreground mr-1">{it.unit}</span>
                                </td>
                              )}
                              <td className="px-2 py-2 text-center bg-blue-500/5">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={actuals[it.product_id] ?? ''}
                                  onChange={(e) => setActuals(prev => ({ ...prev, [it.product_id]: e.target.value }))}
                                  placeholder="0"
                                  className="w-20 mx-auto text-center font-bold"
                                  data-testid={`actual-input-${it.product_id}`}
                                />
                              </td>
                              {isAdmin && (
                                <>
                                  <td className="px-2 py-2 text-center tabular-nums">
                                    {it._actual == null ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : hasLoss ? (
                                      <span className="text-red-600 font-bold">
                                        <TrendingDown className="h-3 w-3 inline ml-1" />
                                        -{it._variance.toFixed(2)}
                                      </span>
                                    ) : hasSurplus ? (
                                      <span className="text-blue-600 font-bold">+{it._surplus.toFixed(2)}</span>
                                    ) : (
                                      <span className="text-emerald-600">✓ مطابق</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 text-center tabular-nums">
                                    {hasLoss ? (
                                      <span className="text-red-600 font-bold">{formatPrice(it._lossCost)}</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </>
                              )}
                              <td className="px-2 py-2 text-center">
                                {isAdmin && (it.recipe && it.recipe.length > 0) && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => toggleRecipe(it.product_id)}
                                    data-testid={`expand-recipe-${it.product_id}`}
                                  >
                                    {expandedRecipes[it.product_id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </Button>
                                )}
                              </td>
                            </tr>
                            {isAdmin && expandedRecipes[it.product_id] && it.recipe && it.recipe.length > 0 && (
                              <tr className="bg-muted/10">
                                <td colSpan={9} className="px-3 py-2">
                                  <p className="text-xs font-bold mb-1 flex items-center gap-1">
                                    <Beaker className="h-3 w-3 text-purple-500" />
                                    {t('توزيع الفقد على مكونات الوصفة')}
                                    {hasLoss && (
                                      <span className="text-red-600">({t('فقد')} {it._variance.toFixed(2)} {it.unit})</span>
                                    )}
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                                    {it.recipe.map((ing, idx) => {
                                      const qtyLost = (it._variance || 0) * (ing.quantity || 0);
                                      const wastePct = ing.waste_percentage || 0;
                                      const baseCost = ing.cost_per_unit || 0;
                                      const effCost = wastePct > 0 && wastePct < 100 ? baseCost / (1 - wastePct / 100) : baseCost;
                                      return (
                                        <div key={idx} className="flex items-center justify-between text-xs p-1.5 bg-background rounded">
                                          <span>{ing.raw_material_name}</span>
                                          <div className="flex gap-2 items-center">
                                            <span className="text-muted-foreground">{ing.quantity} {ing.unit}/منتج</span>
                                            {hasLoss && (
                                              <>
                                                <Badge className="bg-red-500/15 text-red-700">
                                                  {qtyLost.toFixed(2)} {ing.unit}
                                                </Badge>
                                                <span className="text-red-600 tabular-nums font-medium">
                                                  {formatPrice(qtyLost * effCost)}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ملاحظات */}
              <div>
                <Label className="text-xs">{t('ملاحظات (اختياري)')}</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('مثلاً: تالف طبيعي، أو سبب الفقد...')}
                  data-testid="stock-count-notes"
                />
              </div>
            </div>
          )
        )}

        {/* ════════════ جرد التغليف ════════════ */}
        {isPackaging && (
          pkgLoading ? (
            <div className="flex justify-center items-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !pkgData ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>{t('اختر الفرع لعرض جرد التغليف')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">{t('تاريخ العمل')}:</span>{' '}
                  <span className="font-bold">{pkgData.business_date}</span>
                </div>
                {pkgData.already_submitted ? (
                  <Badge className="bg-emerald-500/20 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 ml-1" />
                    {t('تم التسجيل')}
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-700">
                    {t('بانتظار التسجيل')}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-xs text-muted-foreground">{t('عدد مواد التغليف')}</p>
                  <p className="text-xl font-bold tabular-nums">{pkgComputed.items.length}</p>
                </div>
                {isAdmin && (
                  <>
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <p className="text-xs text-muted-foreground">{t('إجمالي الفقد')}</p>
                      <p className="text-xl font-bold text-amber-600 tabular-nums" data-testid="pkg-total-variance">{pkgComputed.total_variance.toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      <p className="text-xs text-muted-foreground">{t('قيمة الفقد')}</p>
                      <p className="text-xl font-bold text-red-600 tabular-nums" data-testid="pkg-total-loss-value">{formatPrice(pkgComputed.total_loss)}</p>
                    </div>
                    {pkgComputed.total_surplus > 0 && (
                      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <p className="text-xs text-muted-foreground">{t('فائض غير متوقع')}</p>
                        <p className="text-xl font-bold text-blue-600 tabular-nums">{pkgComputed.total_surplus.toLocaleString()}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {pkgComputed.items.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="no-packaging">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>{t('لا توجد مواد تغليف في مخزن هذا الفرع لإجراء الجرد')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm" data-testid="packaging-count-table">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-right">{t('مادة التغليف')}</th>
                        <th className="px-2 py-2 text-center">{t('المُستلم')}</th>
                        <th className="px-2 py-2 text-center">{t('المُستخدم')}</th>
                        {isAdmin && (
                          <th className="px-2 py-2 text-center bg-emerald-500/10">{t('المتوقع')}</th>
                        )}
                        <th className="px-2 py-2 text-center bg-blue-500/10">{t('الفعلي *')}</th>
                        {isAdmin && (
                          <>
                            <th className="px-2 py-2 text-center bg-amber-500/10">{t('الفرق')}</th>
                            <th className="px-2 py-2 text-center bg-red-500/10">{t('قيمة الفقد')}</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {pkgComputed.items.map(it => {
                        const hasLoss = (it._variance || 0) > 0;
                        const hasSurplus = (it._surplus || 0) > 0;
                        return (
                          <tr key={it.packaging_material_id} className="border-t border-border hover:bg-muted/20" data-testid={`pkg-count-row-${it.packaging_material_id}`}>
                            <td className="px-3 py-2 font-medium">{it.name}</td>
                            <td className="px-2 py-2 text-center tabular-nums text-emerald-600">+{(it.received_qty || 0).toLocaleString()}</td>
                            <td className="px-2 py-2 text-center tabular-nums text-red-500">-{(it.used_qty || 0).toLocaleString()}</td>
                            {isAdmin && (
                              <td className="px-2 py-2 text-center tabular-nums font-bold text-emerald-700 bg-emerald-500/5">
                                {(it.expected_qty || 0).toLocaleString()}
                                <span className="text-[10px] text-muted-foreground mr-1">{it.unit}</span>
                              </td>
                            )}
                            <td className="px-2 py-2 text-center bg-blue-500/5">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={pkgActuals[it.packaging_material_id] ?? ''}
                                onChange={(e) => setPkgActuals(prev => ({ ...prev, [it.packaging_material_id]: e.target.value }))}
                                placeholder="0"
                                className="w-20 mx-auto text-center font-bold"
                                data-testid={`pkg-actual-input-${it.packaging_material_id}`}
                              />
                            </td>
                            {isAdmin && (
                              <>
                                <td className="px-2 py-2 text-center tabular-nums">
                                  {it._actual == null ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : hasLoss ? (
                                    <span className="text-red-600 font-bold">
                                      <TrendingDown className="h-3 w-3 inline ml-1" />
                                      -{it._variance.toFixed(2)}
                                    </span>
                                  ) : hasSurplus ? (
                                    <span className="text-blue-600 font-bold">+{it._surplus.toFixed(2)}</span>
                                  ) : (
                                    <span className="text-emerald-600">✓ مطابق</span>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-center tabular-nums">
                                  {hasLoss ? (
                                    <span className="text-red-600 font-bold">{formatPrice(it._lossCost)}</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ملاحظات التغليف */}
              <div>
                <Label className="text-xs">{t('ملاحظات (اختياري)')}</Label>
                <Input
                  value={pkgNotes}
                  onChange={(e) => setPkgNotes(e.target.value)}
                  placeholder={t('مثلاً: تالف طبيعي، أو سبب الفقد...')}
                  data-testid="pkg-stock-count-notes"
                />
              </div>
            </div>
          )
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || pkgSaving}>
            {t('إلغاء')}
          </Button>
          {isPackaging ? (
            <Button
              onClick={handleSubmitPackaging}
              disabled={pkgSaving || pkgLoading || !pkgData || pkgComputed.items.length === 0}
              className="bg-amber-500 hover:bg-amber-600"
              data-testid="submit-packaging-count"
            >
              {pkgSaving ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <Package className="h-4 w-4 ml-2" />}
              {t('حفظ جرد التغليف')}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={saving || loading || !data || computed.items.length === 0}
              className="bg-emerald-500 hover:bg-emerald-600"
              data-testid="submit-stock-count"
            >
              {saving ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <ClipboardCheck className="h-4 w-4 ml-2" />}
              {t('حفظ الجرد')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
