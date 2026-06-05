import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../utils/api';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction,
} from '../components/ui/alert-dialog';
import {
  ArrowLeft, RefreshCw, Users, ClipboardList, HandCoins,
  CheckCircle2, Link2, Unlink, TrendingUp, Wallet, AlertCircle, Bike
} from 'lucide-react';
import { toast } from 'sonner';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const ORDER_TYPE_LABELS = { dine_in: 'داخلي', takeaway: 'سفري', delivery: 'توصيل' };

export default function CaptainsManagement() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ shift_id: null, captains: [], totals: { sold: 0, handed: 0, pending: 0 } });
  const [availableCaptains, setAvailableCaptains] = useState([]);
  const [collectingId, setCollectingId] = useState(null);
  const [linkingId, setLinkingId] = useState(null);
  const [collectTarget, setCollectTarget] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, capRes] = await Promise.all([
        axios.get(`${API_URL}/captains/shift-summary`, { headers: authHeaders() }).catch(() => ({ data: { shift_id: null, captains: [], totals: { sold: 0, handed: 0, pending: 0 } } })),
        axios.get(`${API_URL}/shifts/available-captains`, { headers: authHeaders() }).catch(() => ({ data: [] })),
      ]);
      setSummary(sumRes.data || { shift_id: null, captains: [], totals: { sold: 0, handed: 0, pending: 0 } });
      setAvailableCaptains(Array.isArray(capRes.data) ? capRes.data : []);
    } catch (e) {
      toast.error(t('فشل تحميل البيانات'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const shiftId = summary.shift_id;

  const handleCollect = async (captain) => {
    if (!shiftId || !captain) return;
    setCollectingId(captain.captain_id);
    try {
      const res = await axios.post(`${API_URL}/captains/collect`, { shift_id: shiftId, captain_id: captain.captain_id }, { headers: authHeaders() });
      toast.success(res.data?.message || t('تم تأكيد الاستلام'));
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('فشل تأكيد الاستلام'));
    } finally {
      setCollectingId(null);
      setCollectTarget(null);
    }
  };

  const handleLink = async (captain) => {
    if (!shiftId) { toast.error(t('لا توجد وردية كاشير مفتوحة — افتح وردية أولاً')); return; }
    setLinkingId(captain.id);
    try {
      const res = await axios.post(`${API_URL}/shifts/${shiftId}/link-captain`, { captain_id: captain.id }, { headers: authHeaders() });
      toast.success(res.data?.message || t('تم الربط'));
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('فشل الربط'));
    } finally {
      setLinkingId(null);
    }
  };

  const handleUnlink = async (captain) => {
    if (!captain.linked_shift_id) return;
    setLinkingId(captain.id);
    try {
      await axios.post(`${API_URL}/shifts/${captain.linked_shift_id}/unlink-captain`, { captain_id: captain.id }, { headers: authHeaders() });
      toast.success(t('تم فصل الكابتن'));
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('فشل الفصل'));
    } finally {
      setLinkingId(null);
    }
  };

  const allOrders = summary.captains.flatMap(c => (c.orders || []).map(o => ({ ...o, captain_name: c.captain_name })));

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6" dir="rtl" data-testid="captains-management-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} data-testid="captains-back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Bike className="h-7 w-7 text-orange-500" />
              {t('إدارة الطلبات والكابتن')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('متابعة مبيعات الكباتن وتحصيل النقد على وردية الكاشير')}</p>
          </div>
        </div>
        <Button onClick={fetchAll} variant="outline" disabled={loading} data-testid="captains-refresh-btn">
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
          {t('تحديث')}
        </Button>
      </div>

      {!shiftId && !loading && (
        <Card className="border-amber-500/40 bg-amber-500/5" data-testid="no-open-shift-warning">
          <CardContent className="flex items-center gap-3 py-4 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            <span>{t('لا توجد وردية كاشير مفتوحة حالياً. افتح وردية لربط الكباتن وتتبع مبيعاتهم.')}</span>
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-blue-500/30" data-testid="total-sold-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">{t('إجمالي مبيعات الكباتن')}</p>
              <p className="text-2xl font-bold text-blue-500">{formatPrice(summary.totals.sold)}</p></div>
            <TrendingUp className="h-8 w-8 text-blue-500/60" />
          </CardContent>
        </Card>
        <Card className="border-green-500/30" data-testid="total-handed-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">{t('المُسلَّم للكاشير')}</p>
              <p className="text-2xl font-bold text-green-500">{formatPrice(summary.totals.handed)}</p></div>
            <CheckCircle2 className="h-8 w-8 text-green-500/60" />
          </CardContent>
        </Card>
        <Card className="border-red-500/30" data-testid="total-pending-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">{t('المتبقي مع الكباتن')}</p>
              <p className="text-2xl font-bold text-red-500">{formatPrice(summary.totals.pending)}</p></div>
            <Wallet className="h-8 w-8 text-red-500/60" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="captains" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2" data-testid="captains-tabs">
          <TabsTrigger value="captains" data-testid="tab-captains"><Users className="h-4 w-4 ml-2" />{t('الكباتن')}</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders"><ClipboardList className="h-4 w-4 ml-2" />{t('الطلبات')}</TabsTrigger>
        </TabsList>

        {/* ===== Captains tab ===== */}
        <TabsContent value="captains" className="space-y-6 mt-4">
          {/* Linked captains with settlement */}
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><HandCoins className="h-5 w-5" />{t('الكباتن العاملون على الوردية')}</CardTitle></CardHeader>
            <CardContent>
              {summary.captains.length === 0 ? (
                <p className="text-center text-muted-foreground py-6" data-testid="no-captains">{t('لا يوجد كباتن لديهم طلبات على هذه الوردية بعد')}</p>
              ) : (
                <div className="space-y-3">
                  {summary.captains.map(c => (
                    <div key={c.captain_id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30 flex-wrap" data-testid={`captain-row-${c.captain_id}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-orange-500/15 flex items-center justify-center"><Bike className="h-5 w-5 text-orange-500" /></div>
                        <div>
                          <p className="font-semibold" data-testid={`captain-name-${c.captain_id}`}>{c.captain_name}</p>
                          <p className="text-xs text-muted-foreground">{c.orders_count} {t('طلب')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <div className="text-center"><p className="text-muted-foreground text-xs">{t('باع')}</p><p className="font-bold text-blue-500">{formatPrice(c.sold)}</p></div>
                        <div className="text-center"><p className="text-muted-foreground text-xs">{t('سلّم')}</p><p className="font-bold text-green-500">{formatPrice(c.handed)}</p></div>
                        <div className="text-center"><p className="text-muted-foreground text-xs">{t('متبقٍ معه')}</p><p className="font-bold text-red-500" data-testid={`captain-pending-${c.captain_id}`}>{formatPrice(c.pending)}</p></div>
                        <Button size="sm" disabled={c.pending <= 0 || collectingId === c.captain_id} onClick={() => setCollectTarget(c)}
                          className="bg-green-600 hover:bg-green-700" data-testid={`collect-btn-${c.captain_id}`}>
                          {collectingId === c.captain_id ? <RefreshCw className="h-4 w-4 ml-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 ml-1" />}
                          {t('تأكيد الاستلام')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Link captains to shift */}
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Link2 className="h-5 w-5" />{t('ربط الكباتن بالوردية')}</CardTitle></CardHeader>
            <CardContent>
              {availableCaptains.length === 0 ? (
                <p className="text-center text-muted-foreground py-6" data-testid="no-available-captains">{t('لا يوجد مستخدمون بدور كابتن')}</p>
              ) : (
                <div className="space-y-2">
                  {availableCaptains.map(cap => {
                    const linkedHere = cap.linked_shift_id && cap.linked_shift_id === shiftId;
                    const linkedElsewhere = cap.linked_shift_id && cap.linked_shift_id !== shiftId;
                    return (
                      <div key={cap.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border flex-wrap" data-testid={`available-captain-${cap.id}`}>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{cap.full_name || cap.username}</span>
                          {linkedHere && <Badge className="bg-green-600">{t('مرتبط بورديتك')}</Badge>}
                          {linkedElsewhere && <Badge variant="outline" className="text-amber-600 border-amber-500/50">{t('مرتبط بـ')} {cap.linked_cashier_name}</Badge>}
                        </div>
                        {linkedHere ? (
                          <Button size="sm" variant="outline" className="text-red-500 border-red-500/40" disabled={linkingId === cap.id} onClick={() => handleUnlink(cap)} data-testid={`unlink-btn-${cap.id}`}>
                            <Unlink className="h-4 w-4 ml-1" />{t('فصل')}
                          </Button>
                        ) : (
                          <Button size="sm" disabled={linkingId === cap.id || !shiftId} onClick={() => handleLink(cap)} className="bg-blue-600 hover:bg-blue-700" data-testid={`link-btn-${cap.id}`}>
                            {linkingId === cap.id ? <RefreshCw className="h-4 w-4 ml-1 animate-spin" /> : <Link2 className="h-4 w-4 ml-1" />}
                            {linkedElsewhere ? t('نقل لورديتك') : t('ربط')}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Orders tab ===== */}
        <TabsContent value="orders" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ClipboardList className="h-5 w-5" />{t('طلبات الكباتن على الوردية')}</CardTitle></CardHeader>
            <CardContent>
              {allOrders.length === 0 ? (
                <p className="text-center text-muted-foreground py-6" data-testid="no-captain-orders">{t('لا توجد طلبات للكباتن على هذه الوردية')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="captain-orders-table">
                    <thead>
                      <tr className="border-b text-muted-foreground text-right">
                        <th className="py-2 px-2">{t('رقم الطلب')}</th>
                        <th className="py-2 px-2">{t('الكابتن')}</th>
                        <th className="py-2 px-2">{t('النوع')}</th>
                        <th className="py-2 px-2">{t('المبلغ')}</th>
                        <th className="py-2 px-2">{t('الدفع')}</th>
                        <th className="py-2 px-2">{t('حالة النقد')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allOrders.map((o, i) => (
                        <tr key={`${o.order_number}-${i}`} className="border-b hover:bg-muted/30" data-testid={`captain-order-${o.order_number}`}>
                          <td className="py-2 px-2 font-medium">#{o.order_number}</td>
                          <td className="py-2 px-2">{o.captain_name}</td>
                          <td className="py-2 px-2">{t(ORDER_TYPE_LABELS[o.order_type] || o.order_type)}</td>
                          <td className="py-2 px-2 font-bold">{formatPrice(o.total)}</td>
                          <td className="py-2 px-2">{o.payment_method === 'cash' ? t('نقدي') : t(o.payment_method)}</td>
                          <td className="py-2 px-2">
                            {o.payment_method !== 'cash' ? <Badge variant="outline">{t('غير نقدي')}</Badge>
                              : o.captain_cash_status === 'collected' ? <Badge className="bg-green-600">{t('مُحصّل')}</Badge>
                              : <Badge className="bg-red-600">{t('بحوزة الكابتن')}</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* تأكيد استلام النقد */}
      <AlertDialog open={!!collectTarget} onOpenChange={(o) => { if (!o) setCollectTarget(null); }}>
        <AlertDialogContent dir="rtl" data-testid="collect-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('تأكيد استلام النقد')}</AlertDialogTitle>
            <AlertDialogDescription>
              {collectTarget && (
                <>{t('هل تؤكّد استلام مبلغ')} <span className="font-bold text-green-600">{formatPrice(collectTarget.pending)}</span> {t('من الكابتن')} <span className="font-bold">{collectTarget.captain_name}</span>؟ {t('سيُحتسب ضمن درج الكاشير وتُعلَّم طلباته مُحصّلة.')}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="collect-cancel-btn">{t('إلغاء')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleCollect(collectTarget)} className="bg-green-600 hover:bg-green-700" data-testid="collect-confirm-btn">
              {t('تأكيد الاستلام')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
