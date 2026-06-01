import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  RefreshCw,
  Trophy,
  TrendingDown,
  AlertTriangle,
  Crown,
  Medal,
  Package,
} from 'lucide-react';
import { API_URL } from '../utils/api';
import { formatPrice } from '../utils/currency';
import { useTranslation } from '../hooks/useTranslation';

const API = API_URL;

const RANGES = [
  { key: 'week', label: 'هذا الأسبوع', days: 7 },
  { key: 'month', label: 'هذا الشهر', days: 30 },
  { key: 'quarter', label: '3 أشهر', days: 90 },
];

/**
 * لوحة مقارنة الفروع: نسبة الفقد + تكلفة المواد لكل فرع جنباً إلى جنب،
 * مرتّبة من الأعلى هدراً للأقل مع تمييز بصري.
 */
export default function BranchComparisonReport() {
  const { t } = useTranslation();
  const [data, setData] = useState({ rows: [], summary: null, packaging_ranking: [] });
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [rangeKey, setRangeKey] = useState('month');
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(today);

  const applyRange = (r) => {
    setRangeKey(r.key);
    setStartDate(new Date(Date.now() - r.days * 86400000).toISOString().slice(0, 10));
    setEndDate(today);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reports/branch-comparison`, {
        params: { start_date: startDate, end_date: endDate },
      });
      setData({ rows: res.data?.rows || [], summary: res.data?.summary || null, packaging_ranking: res.data?.packaging_ranking || [] });
    } catch (_e) {
      setData({ rows: [], summary: null, packaging_ranking: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const { rows, summary, packaging_ranking = [] } = data;
  const maxLoss = Math.max(1, ...rows.map(r => r.total_loss || 0));
  const maxPkgLoss = Math.max(1, ...packaging_ranking.map(r => r.packaging_loss || 0));

  const rankIcon = (rank) => {
    if (rank === 1) return <Crown className="h-4 w-4 text-amber-500" />;
    if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
    if (rank === 3) return <Medal className="h-4 w-4 text-orange-600" />;
    return <span className="text-xs text-muted-foreground w-4 text-center">{rank}</span>;
  };

  const pctColor = (pct) =>
    pct > 10 ? 'text-red-600' : pct > 5 ? 'text-orange-600' : 'text-emerald-600';
  const barColor = (pct) =>
    pct > 10 ? 'bg-red-500' : pct > 5 ? 'bg-orange-500' : 'bg-emerald-500';

  return (
    <div className="space-y-4" data-testid="branch-comparison-report">
      {/* رأس + فلاتر */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <div>
                <h3 className="font-bold text-lg">{t('مقارنة الفروع — الفقد والهدر')}</h3>
                <p className="text-xs text-muted-foreground">{t('مرتّبة من الأعلى هدراً للأقل — لكشف الفرع الأكثر فقداً')}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} data-testid="branch-comp-refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {RANGES.map(r => (
              <Button
                key={r.key}
                size="sm"
                variant={rangeKey === r.key ? 'default' : 'outline'}
                onClick={() => applyRange(r)}
                data-testid={`branch-comp-range-${r.key}`}
              >
                {t(r.label)}
              </Button>
            ))}
            <div className="flex items-center gap-2 mr-auto">
              <div>
                <Label className="text-[10px]">{t('من')}</Label>
                <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setRangeKey('custom'); }} className="h-8 w-36" data-testid="branch-comp-start" />
              </div>
              <div>
                <Label className="text-[10px]">{t('إلى')}</Label>
                <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setRangeKey('custom'); }} className="h-8 w-36" data-testid="branch-comp-end" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* بطاقات الملخّص */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('عدد الفروع')}</p>
            <p className="text-xl font-bold text-blue-600 tabular-nums" data-testid="comp-branches-count">{summary?.branches_count || 0}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('إجمالي تكلفة المواد (بعد الهدر)')}</p>
            <p className="text-xl font-bold text-emerald-600 tabular-nums" data-testid="comp-total-cost">{formatPrice(summary?.total_cost_after_waste || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-red-500" />
              {t('إجمالي الفقد (هدر + جرد)')}
            </p>
            <p className="text-xl font-bold text-red-600 tabular-nums" data-testid="comp-total-loss">{formatPrice(summary?.total_loss || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Package className="h-3 w-3 text-amber-500" />
              {t('إجمالي فقد التغليف')}
            </p>
            <p className="text-xl font-bold text-amber-600 tabular-nums" data-testid="comp-total-packaging-loss">{formatPrice(summary?.total_packaging_loss || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* قائمة الفروع المرتّبة */}
      <Card>
        <CardContent className="p-4">
          {rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="branch-comp-empty">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>{t('لا توجد بيانات لهذه الفترة')}</p>
              <p className="text-xs mt-1">{t('سيظهر بعد بيع منتجات في الفروع')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map(r => (
                <div
                  key={r.branch_id}
                  className={`p-3 rounded-lg border ${r.rank === 1 && r.total_loss > 0 ? 'border-red-500/40 bg-red-500/5' : 'border-border'}`}
                  data-testid={`branch-comp-row-${r.branch_id}`}
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {rankIcon(r.rank)}
                      <span className="font-bold">{r.branch_name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground">{t('تكلفة المواد')}: <span className="font-medium text-emerald-600 tabular-nums">{formatPrice(r.cost_after_waste)}</span></span>
                      <span className="text-muted-foreground">{t('الفقد')}: <span className="font-bold text-red-600 tabular-nums">{formatPrice(r.total_loss)}</span></span>
                      <span className={`font-bold tabular-nums ${pctColor(r.loss_percentage)}`} data-testid={`branch-comp-pct-${r.branch_id}`}>
                        {r.loss_percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {/* شريط نسبة الفقد */}
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(r.loss_percentage)}`}
                      style={{ width: `${Math.min(100, (r.total_loss / maxLoss) * 100)}%` }}
                    />
                  </div>
                  {(r.loss_value > 0 || r.waste_value > 0 || r.packaging_loss > 0) && (
                    <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                      {r.waste_value > 0 && <span>{t('هدر نظري')}: {formatPrice(r.waste_value)}</span>}
                      {r.loss_value > 0 && <span className="text-red-500">{t('فقد فعلي (جرد)')}: {formatPrice(r.loss_value)}</span>}
                      {r.packaging_loss > 0 && <span className="text-amber-600">{t('فقد تغليف')}: {formatPrice(r.packaging_loss)}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════ ترتيب الفروع حسب فقد التغليف ════════ */}
      <Card data-testid="packaging-comparison-section">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-amber-500" />
            <div>
              <h3 className="font-bold text-base">{t('ترتيب الفروع حسب فقد التغليف')}</h3>
              <p className="text-xs text-muted-foreground">{t('الفروع الأكثر هدراً للعلب والأكياس أولاً')}</p>
            </div>
          </div>

          {packaging_ranking.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="packaging-comp-empty">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{t('لا يوجد فقد تغليف مسجّل لهذه الفترة')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {packaging_ranking.map(r => (
                <div
                  key={r.branch_id}
                  className={`p-3 rounded-lg border ${r.rank === 1 ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}`}
                  data-testid={`packaging-comp-row-${r.branch_id}`}
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {rankIcon(r.rank)}
                      <span className="font-bold">{r.branch_name}</span>
                    </div>
                    <span className="font-bold text-amber-600 tabular-nums" data-testid={`packaging-comp-value-${r.branch_id}`}>
                      {formatPrice(r.packaging_loss)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all bg-amber-500"
                      style={{ width: `${Math.min(100, (r.packaging_loss / maxPkgLoss) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
