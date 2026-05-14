import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  ClipboardCheck, Calendar, User, ChevronDown, ChevronUp,
  RefreshCw, TrendingDown, TrendingUp, Factory, Box, Package,
} from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { API_URL } from '../utils/api';

const API = API_URL;

const DEPT_META = {
  manufacturing: { label: 'قسم التصنيع', icon: Factory, color: 'purple', bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-700' },
  warehouse_raw: { label: 'المخزن (مواد خام)', icon: Box, color: 'blue', bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-700' },
  packaging: { label: 'مخزن مواد التغليف', icon: Package, color: 'amber', bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-700' },
};

export default function MonthlyStocktakeHistory() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/department-stock-count/history`, { params: { limit: 50 } });
      setCounts(res.data?.counts || []);
    } catch (_e) {
      setCounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = filter === 'all' ? counts : counts.filter(c => c.department === filter);

  // ملخص لكل قسم
  const summaryByDept = {};
  counts.forEach(c => {
    if (!summaryByDept[c.department]) summaryByDept[c.department] = { count: 0, total_loss: 0 };
    summaryByDept[c.department].count += 1;
    summaryByDept[c.department].total_loss += c.total_loss_value || 0;
  });

  return (
    <div className="space-y-4" data-testid="monthly-stocktake-history">
      {/* رأس */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-orange-500" />
            <div>
              <h3 className="font-bold">{t('سجل الجرود الشهرية')}</h3>
              <p className="text-xs text-muted-foreground">{t('تفاصيل جميع جرود الأقسام (تصنيع / مخزن خام / تغليف)')}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardContent>
      </Card>

      {/* بطاقات ملخص الأقسام */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`p-3 rounded-lg border-2 text-right transition-all ${filter === 'all' ? 'bg-primary/10 border-primary' : 'bg-muted/30 border-muted hover:bg-muted/50'}`}
          data-testid="dept-filter-all"
        >
          <p className="text-xs text-muted-foreground">{t('الكل')}</p>
          <p className="text-xl font-bold">{counts.length}</p>
        </button>
        {Object.entries(DEPT_META).map(([dept, meta]) => {
          const Icon = meta.icon;
          const s = summaryByDept[dept] || { count: 0, total_loss: 0 };
          return (
            <button
              key={dept}
              onClick={() => setFilter(dept)}
              className={`p-3 rounded-lg border-2 text-right transition-all ${filter === dept ? `${meta.bg} border-${meta.color}-500` : `bg-muted/20 border-muted hover:${meta.bg}`}`}
              data-testid={`dept-filter-${dept}`}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon className={`h-4 w-4 ${meta.text}`} />
                <span className="text-xl font-bold tabular-nums">{s.count}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t(meta.label)}</p>
              {s.total_loss > 0 && (
                <p className="text-[10px] text-red-600 mt-1">{t('فقد')}: {formatPrice(s.total_loss)}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* قائمة الجرود */}
      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
          {t('لا توجد جرود مسجلة بعد')}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const meta = DEPT_META[c.department] || DEPT_META.manufacturing;
            const Icon = meta.icon;
            const isExpanded = expandedId === c.id;
            return (
              <div key={c.id} className={`rounded-lg border-2 overflow-hidden ${meta.border} ${meta.bg}`} data-testid={`history-row-${c.id}`}>
                <div
                  className="p-3 cursor-pointer flex items-center justify-between flex-wrap gap-2 hover:bg-muted/20"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <Icon className={`h-5 w-5 ${meta.text}`} />
                    <div>
                      <p className="font-bold text-sm">{c.department_label || meta.label}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          <Calendar className="h-2.5 w-2.5 ml-1" />
                          {c.period}
                        </Badge>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {c.submitted_by_name}
                        </span>
                        {c.submitted_at && (
                          <span className="text-[10px]">
                            {new Date(c.submitted_at).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs">
                      <span className="text-muted-foreground">{t('عدد الأصناف')}:</span>{' '}
                      <span className="font-bold">{(c.items || []).length}</span>
                    </div>
                    {(c.total_loss_value || 0) > 0 && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">{t('قيمة الفقد')}:</span>{' '}
                        <span className="font-bold text-red-600">{formatPrice(c.total_loss_value)}</span>
                      </div>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
                {isExpanded && (
                  <div className="p-3 bg-background border-t">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-2 py-1 text-right">{t('الصنف')}</th>
                            <th className="px-2 py-1 text-center">{t('النظامي')}</th>
                            <th className="px-2 py-1 text-center">{t('الفعلي')}</th>
                            <th className="px-2 py-1 text-center">{t('الفرق')}</th>
                            <th className="px-2 py-1 text-center">{t('قيمة الفقد')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(c.items || []).map((it, idx) => {
                            const hasLoss = (it.variance || 0) > 0;
                            const hasSurplus = (it.variance || 0) < 0;
                            return (
                              <tr key={idx} className={`border-t ${hasLoss ? 'bg-red-500/5' : hasSurplus ? 'bg-blue-500/5' : ''}`}>
                                <td className="px-2 py-1 font-medium">{it.item_name}</td>
                                <td className="px-2 py-1 text-center tabular-nums">{(it.system_qty || 0).toLocaleString()} <span className="text-[9px] text-muted-foreground">{it.unit}</span></td>
                                <td className="px-2 py-1 text-center tabular-nums font-bold">{(it.actual_qty || 0).toLocaleString()}</td>
                                <td className="px-2 py-1 text-center tabular-nums">
                                  {hasLoss ? <span className="text-red-600 font-bold"><TrendingDown className="h-2.5 w-2.5 inline ml-1" />-{it.variance.toFixed(2)}</span> :
                                   hasSurplus ? <span className="text-blue-600 font-bold"><TrendingUp className="h-2.5 w-2.5 inline ml-1" />+{Math.abs(it.variance).toFixed(2)}</span> :
                                   <span className="text-emerald-600">✓</span>}
                                </td>
                                <td className="px-2 py-1 text-center tabular-nums">
                                  {hasLoss ? <span className="text-red-600 font-bold">{formatPrice(it.variance_cost)}</span> : <span className="text-muted-foreground">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {c.notes && (
                      <p className="text-xs mt-2 p-2 bg-yellow-500/5 border border-yellow-500/20 rounded">
                        <strong>{t('ملاحظات')}:</strong> {c.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
