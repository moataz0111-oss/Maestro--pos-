import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './ui/tabs';
import {
  TrendingDown,
  TrendingUp,
  Percent,
  Factory,
  Beaker,
  Calendar,
  Building2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { API_URL } from '../utils/api';

const API = API_URL;

// إعدادات الفترات السريعة
const QUICK_RANGES = [
  { key: 'today', label: 'اليوم', days: 0 },
  { key: 'week', label: 'الأسبوع', days: 6 },
  { key: 'month', label: 'الشهر', days: 29 },
  { key: 'custom', label: 'مخصص', days: null },
];

function isoDay(d) {
  return d.toISOString().split('T')[0];
}

export default function WasteEfficiencyReport({ branches = [] }) {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState('product'); // 'product' | 'raw_material'
  const [rangeKey, setRangeKey] = useState('month');
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDay(d);
  });
  const [endDate, setEndDate] = useState(isoDay(today));
  const [branchId, setBranchId] = useState('all'); // فرع المطبخ
  const [receivingBranchId, setReceivingBranchId] = useState('all'); // الفرع المستلم
  const [data, setData] = useState({ rows: [], summary: null });
  const [loading, setLoading] = useState(false);

  const applyQuickRange = (key) => {
    setRangeKey(key);
    if (key === 'custom') return;
    const end = new Date();
    const start = new Date();
    const cfg = QUICK_RANGES.find(r => r.key === key);
    if (cfg && cfg.days != null) {
      start.setDate(end.getDate() - cfg.days);
    }
    setStartDate(isoDay(start));
    setEndDate(isoDay(end));
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = {
        start_date: startDate,
        end_date: endDate,
        group_by: groupBy,
      };
      if (branchId !== 'all') params.branch_id = branchId;
      if (receivingBranchId !== 'all') params.receiving_branch_id = receivingBranchId;
      const res = await axios.get(`${API}/reports/waste-efficiency`, { params });
      setData({
        rows: res.data?.rows || [],
        summary: res.data?.summary || null,
      });
    } catch (_e) {
      setData({ rows: [], summary: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, branchId, receivingBranchId, groupBy]);

  const summary = data.summary;
  const wastePct = summary?.total_waste_percentage || 0;
  const wasteValue = summary?.total_waste_value || 0;
  const efficiency = Math.max(0, 100 - wastePct);

  return (
    <div className="space-y-4" data-testid="waste-efficiency-report">
      {/* رأس التقرير + الفلاتر */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-orange-500" />
              <div>
                <h3 className="font-bold text-lg">{t('تقرير كفاءة الهدر')}</h3>
                <p className="text-xs text-muted-foreground">{t('مقارنة الكلفة قبل وبعد الهدر — لتقييم كفاءة المطابخ')}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchReport} disabled={loading} data-testid="refresh-waste-report">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* فلاتر الفترة السريعة */}
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_RANGES.map(r => (
              <Button
                key={r.key}
                variant={rangeKey === r.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickRange(r.key)}
                data-testid={`range-${r.key}`}
              >
                <Calendar className="h-3 w-3 ml-1" />
                {t(r.label)}
              </Button>
            ))}
          </div>

          {/* فلاتر مخصصة */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">{t('من تاريخ')}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setRangeKey('custom'); }}
                data-testid="waste-start-date"
              />
            </div>
            <div>
              <Label className="text-xs">{t('إلى تاريخ')}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setRangeKey('custom'); }}
                data-testid="waste-end-date"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {t('فرع المطبخ (التصنيع)')}
              </Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger data-testid="waste-kitchen-branch">
                  <SelectValue placeholder={t('كل المطابخ')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('كل المطابخ')}</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {t('الفرع المستلم')}
              </Label>
              <Select value={receivingBranchId} onValueChange={setReceivingBranchId}>
                <SelectTrigger data-testid="waste-receiving-branch">
                  <SelectValue placeholder={t('كل الفروع')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('كل الفروع')}</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('إجمالي الكلفة قبل الهدر')}</p>
            <p className="text-xl font-bold text-blue-600 tabular-nums" data-testid="total-cost-before">
              {formatPrice(summary?.total_cost_before_waste || 0)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{t('للمقارنة مع فواتير الموردين')}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('إجمالي الكلفة بعد الهدر')}</p>
            <p className="text-xl font-bold text-emerald-600 tabular-nums" data-testid="total-cost-after">
              {formatPrice(summary?.total_cost_after_waste || 0)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{t('الكلفة الفعلية المستهلكة')}</p>
          </CardContent>
        </Card>
        <Card className={`${wasteValue > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-muted'}`}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-red-500" />
              {t('قيمة الفاقد')}
            </p>
            <p className="text-xl font-bold text-red-600 tabular-nums" data-testid="total-waste-value">
              {formatPrice(wasteValue)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{t('الفرق المستهلك بسبب الهدر')}</p>
          </CardContent>
        </Card>
        <Card className={`${wastePct > 10 ? 'border-red-500/30 bg-red-500/5' : wastePct > 5 ? 'border-orange-500/30 bg-orange-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Percent className="h-3 w-3" />
              {t('نسبة الهدر')}
            </p>
            <p className={`text-xl font-bold tabular-nums ${wastePct > 10 ? 'text-red-600' : wastePct > 5 ? 'text-orange-600' : 'text-emerald-600'}`} data-testid="total-waste-pct">
              {wastePct.toFixed(2)}%
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('كفاءة الاستهلاك')}: {efficiency.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* اختيار التجميع */}
      <Tabs value={groupBy} onValueChange={setGroupBy}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="product" className="gap-2" data-testid="tab-by-product">
            <Factory className="h-4 w-4" />
            {t('حسب المنتج')}
          </TabsTrigger>
          <TabsTrigger value="raw_material" className="gap-2" data-testid="tab-by-raw">
            <Beaker className="h-4 w-4" />
            {t('حسب المادة الخام')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={groupBy} className="space-y-2">
          <Card>
            <CardContent className="p-4">
              {data.rows.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="waste-empty">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>{t('لا توجد بيانات لهذه الفترة')}</p>
                  <p className="text-xs mt-1">{t('سيظهر التقرير بعد إنتاج منتجات مصنّعة في الفترة المحددة')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="waste-table">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-right">{groupBy === 'product' ? t('المنتج') : t('المادة الخام')}</th>
                        <th className="px-3 py-2 text-center">{t('الكمية المُنتجة/المستهلكة')}</th>
                        <th className="px-3 py-2 text-center">{t('الكلفة قبل الهدر')}</th>
                        <th className="px-3 py-2 text-center">{t('الكلفة بعد الهدر')}</th>
                        <th className="px-3 py-2 text-center">{t('قيمة الفاقد')}</th>
                        <th className="px-3 py-2 text-center">{t('نسبة الهدر')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map(r => {
                        const pctColor = r.waste_percentage > 10 ? 'text-red-600 bg-red-100 dark:bg-red-950/40' :
                                         r.waste_percentage > 5 ? 'text-orange-600 bg-orange-100 dark:bg-orange-950/40' :
                                         'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40';
                        return (
                          <tr key={r.id} className="border-t border-border hover:bg-muted/30" data-testid={`waste-row-${r.id}`}>
                            <td className="px-3 py-2 font-medium">{r.name}</td>
                            <td className="px-3 py-2 text-center tabular-nums">
                              {(r.quantity || 0).toLocaleString()} <span className="text-[10px] text-muted-foreground">{r.unit}</span>
                            </td>
                            <td className="px-3 py-2 text-center text-blue-600 tabular-nums">{formatPrice(r.cost_before_waste)}</td>
                            <td className="px-3 py-2 text-center text-emerald-600 tabular-nums">{formatPrice(r.cost_after_waste)}</td>
                            <td className="px-3 py-2 text-center text-red-600 tabular-nums">
                              {r.waste_value > 0 && <TrendingUp className="h-3 w-3 inline ml-1 text-red-500" />}
                              {formatPrice(r.waste_value)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge className={pctColor}>
                                {r.waste_percentage.toFixed(2)}%
                              </Badge>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
