import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Printer, Filter, ShoppingCart, Truck, Wallet, CreditCard, Package, Clock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const channelIcon = (key) => {
  if (key === 'cash') return <Wallet className="h-4 w-4" />;
  if (key === 'card') return <CreditCard className="h-4 w-4" />;
  if (key === 'credit') return <Clock className="h-4 w-4" />;
  if (key === 'pending') return <Package className="h-4 w-4" />;
  if (key === 'takeaway') return <ShoppingCart className="h-4 w-4" />;
  if (key === 'delivery_driver') return <Truck className="h-4 w-4" />;
  if (key && key.startsWith('delivery_app__')) return <Truck className="h-4 w-4" />;
  return <Filter className="h-4 w-4" />;
};

const channelColor = (key) => {
  if (key === 'cash') return 'border-green-500/40 bg-green-500/5';
  if (key === 'card') return 'border-blue-500/40 bg-blue-500/5';
  if (key === 'credit') return 'border-amber-500/40 bg-amber-500/5';
  if (key === 'pending') return 'border-gray-500/40 bg-gray-500/5';
  if (key === 'takeaway') return 'border-purple-500/40 bg-purple-500/5';
  if (key === 'delivery_driver') return 'border-cyan-500/40 bg-cyan-500/5';
  if (key && key.startsWith('delivery_app__')) return 'border-pink-500/40 bg-pink-500/5';
  return 'border-border';
};

export default function ProductsByChannelTab({ productsReport, t, formatPrice, handlePrintProductsReport, getBranchIdForApi, startDate, endDate }) {
  const [view, setView] = useState('all'); // 'all' | 'by-channel'
  const [channelData, setChannelData] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      const bid = getBranchIdForApi?.();
      if (bid) params.branch_id = bid;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await axios.get(`${API}/reports/products-by-channel`, { params, headers });
      setChannelData(res.data);
      const channels = res.data?.channels || [];
      if (channels.length > 0) {
        // إذا القناة المختارة حالياً لم تعد موجودة (مثلاً حُذف السفري) → اختر الأولى
        const stillExists = channels.some(c => c.channel_key === selectedChannel);
        if (!stillExists) {
          setSelectedChannel(channels[0].channel_key);
        }
      } else {
        setSelectedChannel(null);
      }
    } catch (e) {
      console.warn('products-by-channel failed:', e.message);
      setError(e.message || 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [getBranchIdForApi, startDate, endDate, selectedChannel]);

  useEffect(() => {
    if (view === 'by-channel') fetchChannels();
  }, [view, fetchChannels]);

  const activeChannel = channelData?.channels?.find(c => c.channel_key === selectedChannel);

  return (
    <div className="space-y-6">
      {/* أزرار التبديل بين العرض الكلي والفرز حسب القناة */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={view === 'all' ? 'default' : 'outline'}
          onClick={() => setView('all')}
          className="gap-2"
          data-testid="products-view-all"
        >
          <Package className="h-4 w-4" />
          {t('عرض كلي')}
        </Button>
        <Button
          variant={view === 'by-channel' ? 'default' : 'outline'}
          onClick={() => setView('by-channel')}
          className="gap-2"
          data-testid="products-view-by-channel"
        >
          <Filter className="h-4 w-4" />
          {t('تفصيل حسب طريقة الدفع/التوصيل')}
        </Button>
      </div>

      {/* ===== العرض الكلي (السلوك القديم) ===== */}
      {view === 'all' && (
        <>
          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">{t('تقرير الأصناف')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-right p-3 text-muted-foreground">{t('الصنف')}</th>
                      <th className="text-right p-3 text-muted-foreground">{t('السعر')}</th>
                      <th className="text-right p-3 text-muted-foreground">{t('التكلفة')}</th>
                      <th className="text-right p-3 text-muted-foreground">{t('الربح/وحدة')}</th>
                      <th className="text-right p-3 text-muted-foreground">{t('الكمية المباعة')}</th>
                      <th className="text-right p-3 text-muted-foreground">{t('إجمالي الإيرادات')}</th>
                      <th className="text-right p-3 text-muted-foreground">{t('إجمالي الربح')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsReport.products?.map(p => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="p-3 font-medium text-foreground">{p.name}</td>
                        <td className="p-3 tabular-nums text-foreground">{formatPrice(p.price)}</td>
                        <td className="p-3 tabular-nums text-foreground">{formatPrice(p.cost + p.operating_cost)}</td>
                        <td className="p-3 tabular-nums text-green-500">{formatPrice(p.profit_per_unit)}</td>
                        <td className="p-3 tabular-nums text-foreground">{p.quantity_sold}</td>
                        <td className="p-3 tabular-nums text-foreground">{formatPrice(p.total_revenue)}</td>
                        <td className="p-3 tabular-nums text-green-500">{formatPrice(p.total_profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={handlePrintProductsReport} className="gap-2">
              <Printer className="h-4 w-4" />
              {t('طباعة التقرير')}
            </Button>
          </div>
        </>
      )}

      {/* ===== العرض حسب القناة ===== */}
      {view === 'by-channel' && (
        <>
          {loading && (
            <div className="text-center text-muted-foreground py-8">{t('جاري التحميل...')}</div>
          )}

          {!loading && error && (
            <div className="text-center py-8 space-y-3">
              <div className="text-destructive">{t('تعذر تحميل البيانات')}: {error}</div>
              <Button variant="outline" onClick={fetchChannels}>{t('إعادة المحاولة')}</Button>
            </div>
          )}

          {!loading && !error && channelData?.channels?.length === 0 && (
            <div className="text-center text-muted-foreground py-8">{t('لا توجد بيانات')}</div>
          )}

          {!loading && !error && channelData?.channels?.length > 0 && (
            <>
              {/* بطاقات القنوات (أزرار التحديد) */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="channel-cards">
                {channelData.channels.map((c) => {
                  const isActive = selectedChannel === c.channel_key;
                  return (
                    <button
                      key={c.channel_key}
                      onClick={() => setSelectedChannel(c.channel_key)}
                      className={`p-3 rounded-lg border-2 text-right transition-all hover:scale-[1.02] ${channelColor(c.channel_key)} ${isActive ? 'ring-2 ring-primary shadow-md' : ''}`}
                      data-testid={`channel-card-${c.channel_key}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-foreground/80">{channelIcon(c.channel_key)}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{c.orders_count} {t('طلب')}</span>
                      </div>
                      <div className="font-bold text-sm text-foreground mb-1">{c.channel_label}</div>
                      <div className="text-xs text-muted-foreground">{c.products_count} {t('صنف')}</div>
                      <div className="text-lg font-bold tabular-nums text-primary mt-1">{formatPrice(c.total_revenue)}</div>
                    </button>
                  );
                })}
              </div>

              {/* جدول الأصناف للقناة المختارة */}
              {activeChannel && (
                <Card className={`${channelColor(activeChannel.channel_key)} border-2`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                      {channelIcon(activeChannel.channel_key)}
                      {activeChannel.channel_label}
                      <span className="text-sm text-muted-foreground font-normal">
                        ({activeChannel.orders_count} {t('طلب')} • {activeChannel.products_count} {t('صنف')} • {formatPrice(activeChannel.total_revenue)})
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-right p-3 text-muted-foreground w-12">#</th>
                            <th className="text-right p-3 text-muted-foreground">{t('الصنف')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('الكمية المباعة')}</th>
                            <th className="text-right p-3 text-muted-foreground">{t('الإيرادات')}</th>
                          </tr>
                        </thead>
                        <tbody data-testid={`channel-products-${activeChannel.channel_key}`}>
                          {activeChannel.products.map((p, idx) => (
                            <tr key={p.product_id} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="p-3 tabular-nums text-muted-foreground font-bold">{idx + 1}</td>
                              <td className="p-3 font-medium text-foreground">{p.name || '—'}</td>
                              <td className="p-3 tabular-nums">
                                <span className={`font-bold ${idx === 0 ? 'text-green-500 text-base' : 'text-foreground'}`}>
                                  {p.quantity_sold}
                                </span>
                              </td>
                              <td className="p-3 tabular-nums text-foreground">{formatPrice(p.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
