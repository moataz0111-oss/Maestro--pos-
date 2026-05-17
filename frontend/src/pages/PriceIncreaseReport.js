import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  ArrowRight, TrendingUp, AlertTriangle, RefreshCw, Filter, Building2, Package, Calendar,
} from 'lucide-react';
import { showApiError } from '../utils/apiError';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PriceIncreaseReport = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ rows: [], total_rows: 0, total_cost_impact: 0, by_supplier: [], by_material: [] });
  const [days, setDays] = useState(30);
  const [minPct, setMinPct] = useState(10);
  const [supplierId, setSupplierId] = useState('all');
  const [materialId, setMaterialId] = useState('all');
  const [suppliers, setSuppliers] = useState([]);
  const [materials, setMaterials] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days), min_pct: String(minPct) });
      if (supplierId !== 'all') params.append('supplier_id', supplierId);
      if (materialId !== 'all') params.append('material_id', materialId);
      const res = await axios.get(`${API}/reports/price-increases?${params.toString()}`, { headers });
      setData(res.data || { rows: [], total_rows: 0, total_cost_impact: 0, by_supplier: [], by_material: [] });
    } catch (err) {
      showApiError(err, t('فشل تحميل التقرير'));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, minPct, supplierId, materialId]);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [sRes, mRes] = await Promise.all([
          axios.get(`${API}/suppliers`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${API}/raw-materials`, { headers }).catch(() => ({ data: [] })),
        ]);
        setSuppliers(sRes.data || []);
        setMaterials(mRes.data || []);
      } catch (_) { /* ignored */ }
    };
    loadFilters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalImpact = data.total_cost_impact || 0;
  const rowsCount = data.total_rows || 0;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6" dir="rtl" data-testid="price-increase-report-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="back-btn">
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-red-500" />
              {t('تقرير زيادة أسعار الشراء')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('مراجعة قرارات قسم المشتريات ومحاسبة الموردين على الأسعار المرتفعة')}</p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading} data-testid="refresh-btn">
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
          {t('تحديث')}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" />{t('الفلاتر')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">{t('الفترة (يوم)')}</Label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger data-testid="days-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('آخر 7 أيام')}</SelectItem>
                <SelectItem value="30">{t('آخر 30 يوم')}</SelectItem>
                <SelectItem value="60">{t('آخر 60 يوم')}</SelectItem>
                <SelectItem value="90">{t('آخر 90 يوم')}</SelectItem>
                <SelectItem value="365">{t('آخر سنة')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t('الحد الأدنى لنسبة الزيادة')}</Label>
            <Input type="number" min="0" max="100" value={minPct} onChange={(e) => setMinPct(Number(e.target.value) || 0)} data-testid="min-pct-filter" />
          </div>
          <div>
            <Label className="text-xs">{t('المورد')}</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger data-testid="supplier-filter"><SelectValue placeholder={t('الكل')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الموردين')}</SelectItem>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t('الصنف')}</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger data-testid="material-filter"><SelectValue placeholder={t('الكل')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('كل الأصناف')}</SelectItem>
                {materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('عدد زيادات الأسعار')}</p>
                <p className="text-2xl font-bold text-red-600" data-testid="kpi-count">{rowsCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('إجمالي الأثر المالي')}</p>
                <p className="text-2xl font-bold text-amber-700" data-testid="kpi-impact">{formatPrice(totalImpact)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/40 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('عدد الموردين المُتأثرين')}</p>
                <p className="text-2xl font-bold text-blue-700" data-testid="kpi-suppliers">{data.by_supplier?.length || 0}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top suppliers / materials */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />{t('أكثر الموردين رفعاً للأسعار')}</CardTitle></CardHeader>
          <CardContent>
            {(data.by_supplier || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">{t('لا توجد بيانات')}</p>
            ) : (
              <div className="space-y-2">
                {data.by_supplier.slice(0, 5).map((s) => (
                  <div key={s.supplier_id} className="flex items-center justify-between p-2 rounded border bg-muted/30" data-testid={`top-supplier-${s.supplier_id}`}>
                    <div>
                      <div className="font-medium">{s.supplier_name}</div>
                      <div className="text-xs text-muted-foreground">{t('عدد المرات')}: {s.count} · {t('متوسط الزيادة')}: {s.avg_pct.toFixed(1)}%</div>
                    </div>
                    <Badge className="bg-red-500/20 text-red-600 border border-red-500/40">{formatPrice(s.total_impact)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />{t('أكثر الأصناف ارتفاعاً')}</CardTitle></CardHeader>
          <CardContent>
            {(data.by_material || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">{t('لا توجد بيانات')}</p>
            ) : (
              <div className="space-y-2">
                {data.by_material.slice(0, 5).map((m, idx) => (
                  <div key={m.raw_material_id || m.material_name || idx} className="flex items-center justify-between p-2 rounded border bg-muted/30" data-testid={`top-material-${idx}`}>
                    <div>
                      <div className="font-medium">{m.material_name}</div>
                      <div className="text-xs text-muted-foreground">{t('مرات')}: {m.count} · {t('أعلى زيادة')}: {m.max_pct.toFixed(1)}%</div>
                    </div>
                    <Badge className="bg-red-500/20 text-red-600 border border-red-500/40">{formatPrice(m.total_impact)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed rows */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('السجلات التفصيلية')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8"><RefreshCw className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : (data.rows || []).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
              {t('لا توجد زيادات أسعار تطابق الفلاتر')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="text-right p-2">{t('التاريخ')}</th>
                    <th className="text-right p-2">{t('الصنف')}</th>
                    <th className="text-center p-2">{t('السعر القديم')}</th>
                    <th className="text-center p-2">{t('السعر الجديد')}</th>
                    <th className="text-center p-2">{t('الفرق %')}</th>
                    <th className="text-center p-2">{t('الكمية')}</th>
                    <th className="text-center p-2">{t('الأثر المالي')}</th>
                    <th className="text-right p-2">{t('المورد')}</th>
                    <th className="text-right p-2">{t('السبب')}</th>
                    <th className="text-right p-2">{t('الفاتورة')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, idx) => (
                    <tr key={`${r.invoice_id}-${r.raw_material_id || r.material_name}-${idx}`} className="border-b hover:bg-muted/20" data-testid={`report-row-${idx}`}>
                      <td className="p-2 whitespace-nowrap">{r.invoice_date ? new Date(r.invoice_date).toLocaleDateString('ar-EG') : '-'}</td>
                      <td className="p-2 font-medium">{r.material_name}</td>
                      <td className="p-2 text-center">{formatPrice(r.old_cost)}</td>
                      <td className="p-2 text-center font-bold text-red-600">{formatPrice(r.new_cost)}</td>
                      <td className="p-2 text-center">
                        <Badge className="bg-red-500/20 text-red-600 border border-red-500/40">↑ {r.diff_pct.toFixed(1)}%</Badge>
                      </td>
                      <td className="p-2 text-center">{r.quantity}</td>
                      <td className="p-2 text-center font-bold text-amber-700">{formatPrice(r.cost_impact)}</td>
                      <td className="p-2">{r.supplier_name || '-'}</td>
                      <td className="p-2 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                      <td className="p-2 text-xs text-muted-foreground">{r.invoice_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PriceIncreaseReport;
