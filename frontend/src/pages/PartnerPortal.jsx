import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Store, Package, DollarSign, TrendingUp, Percent } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

export default function PartnerPortal() {
  const { partnerId } = useParams();
  const [accessCode, setAccessCode] = useState(localStorage.getItem(`partner_code_${partnerId}`) || '');
  const [authed, setAuthed] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);

  const doLogin = async () => {
    try {
      await axios.post(`${API_URL}/partner-portal/login`, {
        partner_id: partnerId, access_code: accessCode,
      });
      localStorage.setItem(`partner_code_${partnerId}`, accessCode);
      setAuthed(true);
      loadDashboard();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'كود دخول غير صحيح');
    }
  };

  const loadDashboard = async () => {
    try {
      const [d, o] = await Promise.all([
        axios.get(`${API_URL}/partner-portal/${partnerId}/dashboard`, { params: { access_code: accessCode } }),
        axios.get(`${API_URL}/partner-portal/${partnerId}/orders`, { params: { access_code: accessCode } }),
      ]);
      setDashboard(d.data);
      setOrders(o.data);
    } catch (e) {
      toast.error('فشل تحميل البيانات');
      setAuthed(false);
    }
  };

  useEffect(() => {
    if (accessCode && !authed) doLogin();
    // eslint-disable-next-line
  }, []);

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-sm" data-testid="partner-login-card">
          <CardHeader className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Store className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>بوابة التاجر الشريك</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>كود الدخول</Label>
              <Input
                data-testid="partner-access-code-input"
                type="password"
                placeholder="أدخل كود الوصول"
                value={accessCode}
                onChange={e => setAccessCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doLogin()}
              />
            </div>
            <Button className="w-full" onClick={doLogin} data-testid="partner-login-btn">
              دخول
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-6" dir="rtl" data-testid="partner-portal-page">
      <div className="max-w-5xl mx-auto space-y-6">
        {dashboard && (
          <>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Store className="h-6 w-6 text-primary" />
                {dashboard.partner.name}
              </h1>
              <Badge variant="outline" className="mt-1 gap-1">
                <Percent className="h-3 w-3" />
                عمولة {dashboard.partner.commission_rate}%
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card data-testid="stat-orders">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
                      <p className="text-2xl font-bold">{dashboard.total_orders}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="stat-completed">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">مكتملة</p>
                      <p className="text-2xl font-bold text-green-700">{dashboard.completed_orders}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="stat-revenue">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
                      <p className="text-lg font-bold text-blue-700">{fmt(dashboard.total_revenue)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="stat-net">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-purple-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">صافي بعد العمولة</p>
                      <p className="text-lg font-bold text-purple-700">{fmt(dashboard.net_to_partner)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-lg">آخر الطلبات</CardTitle></CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">لا توجد طلبات بعد</p>
                ) : (
                  <div className="space-y-2">
                    {orders.map(o => (
                      <div key={o.id} className="flex justify-between items-center p-3 border rounded" data-testid={`order-${o.id}`}>
                        <div>
                          <p className="font-medium text-sm">طلب #{(o.id || '').substring(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">{o.created_at?.substring(0, 10)}</p>
                        </div>
                        <div className="text-left">
                          <p className="font-bold">{fmt(o.total)}</p>
                          <p className="text-xs text-muted-foreground">عمولة: {fmt(o.commission_amount)}</p>
                          <Badge variant={o.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                            {o.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
