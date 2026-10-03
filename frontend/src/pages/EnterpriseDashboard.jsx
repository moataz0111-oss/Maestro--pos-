import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Briefcase, TrendingUp, TrendingDown, Users, Building2, DollarSign, ShoppingCart, ArrowLeft, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const fmt = (n, cur = 'IQD') => `${Number(n || 0).toLocaleString('en-US')} ${cur}`;

export default function EnterpriseDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);

  const isOwner = ['super_admin', 'admin', 'general_manager', 'enterprise_owner'].includes(user?.role);

  const reload = () => {
    axios.get(`${API_URL}/enterprise/dashboard?period_days=${period}`)
      .then(r => setData(r.data))
      .catch(e => toast.error(e.response?.data?.detail || 'فشل التحميل'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOwner) return;
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, isOwner]);

  useEffect(() => {
    if (!isOwner || !user?.tenant_id) return;
    const socket = io(API_URL.replace('/api', ''), { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      setLiveConnected(true);
      socket.emit('join_enterprise', { tenant_id: user.tenant_id });
    });
    socket.on('disconnect', () => setLiveConnected(false));
    socket.on('enterprise_update', (payload) => {
      setLastEvent({ ...payload, at: new Date().toLocaleTimeString('ar-EG') });
      // إعادة تحميل خفيفة بعد ثانية لتجميع التحديثات المتتالية
      setTimeout(reload, 1200);
    });
    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, user?.tenant_id]);

  if (!isOwner) {
    return (
      <div className="p-6" dir="rtl" data-testid="enterprise-dashboard-restricted">
        <Card>
          <CardContent className="pt-6">
            <p>هذه الصفحة للمالك (Enterprise Owner) فقط.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl" data-testid="enterprise-dashboard-page">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} data-testid="back-btn">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-primary" />
              لوحة المؤسسة
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            مقارنة أدائية لجميع مشاريعك في مكان واحد
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={liveConnected ? 'default' : 'secondary'} className="gap-1" data-testid="live-status">
            <Radio className={`h-3 w-3 ${liveConnected ? 'text-green-400' : 'text-muted-foreground'} animate-pulse`} />
            {liveConnected ? 'مباشر' : 'غير متصل'}
          </Badge>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]" data-testid="period-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">آخر 7 أيام</SelectItem>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
              <SelectItem value="90">آخر 90 يوم</SelectItem>
              <SelectItem value="365">آخر سنة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {lastEvent && (
        <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2" data-testid="last-event">
          🔔 آخر حدث: <b>{lastEvent.type}</b> — {lastEvent.at}
        </div>
      )}

      {loading && <p className="text-muted-foreground">جاري التحميل...</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="stat-projects">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">المشاريع</p>
                    <p className="text-2xl font-bold">{data.totals.projects_count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-revenue">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">الإيرادات الإجمالية</p>
                    <p className="text-xl font-bold text-green-700">{fmt(data.totals.revenue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-expenses">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">إجمالي المصاريف</p>
                    <p className="text-xl font-bold text-red-700">{fmt(data.totals.expenses)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-net">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <DollarSign className={`h-5 w-5 ${data.totals.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">صافي الربح</p>
                    <p className={`text-xl font-bold ${data.totals.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {fmt(data.totals.net_profit)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.projects.map(p => (
              <Card key={p.id} className="hover:shadow-md transition" data-testid={`project-stats-${p.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {p.logo_url ? (
                        <img src={p.logo_url} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                          <Briefcase className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <CardDescription className="text-xs">{p.activity_type}</CardDescription>
                      </div>
                    </div>
                    {p.is_default && <Badge variant="secondary" className="text-xs">افتراضي</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-green-50 rounded">
                      <p className="text-muted-foreground">إيرادات</p>
                      <p className="font-bold text-green-700">{fmt(p.revenue, p.currency)}</p>
                    </div>
                    <div className="p-2 bg-red-50 rounded">
                      <p className="text-muted-foreground">مصاريف</p>
                      <p className="font-bold text-red-700">{fmt(p.expenses, p.currency)}</p>
                    </div>
                    <div className="p-2 bg-blue-50 rounded">
                      <p className="text-muted-foreground">صافي</p>
                      <p className={`font-bold ${p.net_profit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                        {fmt(p.net_profit, p.currency)}
                      </p>
                    </div>
                    <div className="p-2 bg-purple-50 rounded">
                      <p className="text-muted-foreground">طلبات</p>
                      <p className="font-bold text-purple-700">{p.orders_count.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {p.branches_count} فرع
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {p.employees_count} موظف
                    </span>
                    <span className="flex items-center gap-1">
                      <ShoppingCart className="h-3 w-3" /> {p.expenses_count} مصروف
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
