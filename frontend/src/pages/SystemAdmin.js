import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { 
  Database, 
  HardDrive, 
  Server, 
  Download, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle,
  XCircle,
  Activity,
  Shield,
  Clock
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// إعداد axios مع token
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function SystemAdmin() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);

  useEffect(() => {
    fetchData();
    // تحديث كل دقيقة
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchHealth(), fetchStats(), fetchBackups()]);
    setLoading(false);
  };

  const fetchHealth = async () => {
    try {
      const res = await axios.get(`${API}/system/health`);
      setHealth(res.data);
    } catch (error) {
      console.error('Failed to fetch health:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/system/stats`, { headers: getAuthHeaders() });
      setStats(res.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await axios.get(`${API}/system/backup/list`, { headers: getAuthHeaders() });
      setBackups(res.data.backups || []);
    } catch (error) {
      console.error('Failed to fetch backups:', error);
    }
  };

  const createBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await axios.post(`${API}/system/backup`, {}, { headers: getAuthHeaders() });
      toast.success(res.data.message);
      fetchBackups();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إنشاء النسخة الاحتياطية');
    } finally {
      setBackupLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
      case 'unhealthy': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return <Activity className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      healthy: 'bg-green-500/10 text-green-500 border-green-500/30',
      warning: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
      critical: 'bg-red-500/10 text-red-500 border-red-500/30',
      unhealthy: 'bg-red-500/10 text-red-500 border-red-500/30'
    };
    return variants[status] || 'bg-muted text-muted-foreground';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="system-admin-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-cairo">إدارة النظام</h1>
          <p className="text-muted-foreground">مراقبة صحة النظام والنسخ الاحتياطي</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
          <Button onClick={createBackup} disabled={backupLoading} className="gap-2">
            {backupLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            نسخ احتياطي
          </Button>
        </div>
      </div>

      {/* Health Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Database Health */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              قاعدة البيانات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              {getStatusIcon(health?.database?.status)}
              <Badge className={getStatusBadge(health?.database?.status)}>
                {health?.database?.status === 'healthy' ? 'سليم' : 'مشكلة'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {health?.database?.collections_count} مجموعة
            </p>
            {stats?.database && (
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>حجم البيانات:</span>
                  <span className="font-medium">{stats.database.database_size}</span>
                </div>
                <div className="flex justify-between">
                  <span>حجم الفهارس:</span>
                  <span className="font-medium">{stats.database.indexes_size}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Disk Health */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-blue-500" />
              مساحة التخزين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              {getStatusIcon(health?.disk?.status)}
              <Badge className={getStatusBadge(health?.disk?.status)}>
                {health?.disk?.free_percent?.toFixed(0)}% متاح
              </Badge>
            </div>
            <Progress 
              value={100 - (health?.disk?.free_percent || 0)} 
              className="h-2 mb-2" 
            />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">مستخدم:</span>
                <span className="font-medium mr-1">{health?.disk?.used_gb} GB</span>
              </div>
              <div>
                <span className="text-muted-foreground">متاح:</span>
                <span className="font-medium mr-1">{health?.disk?.free_gb} GB</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Capacity Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-5 w-5 text-purple-500" />
              سعة النظام
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              {getStatusIcon(stats?.capacity?.status)}
              <Badge className={getStatusBadge(stats?.capacity?.status)}>
                {stats?.capacity?.status === 'healthy' ? 'جيد' : 'تحذير'}
              </Badge>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <div className="flex justify-between mb-1">
                  <span>الطلبات</span>
                  <span>{stats?.business?.total_orders?.toLocaleString()} / {stats?.capacity?.orders_limit?.toLocaleString()}</span>
                </div>
                <Progress 
                  value={(stats?.business?.total_orders / stats?.capacity?.orders_limit) * 100} 
                  className="h-1.5" 
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span>المنتجات</span>
                  <span>{stats?.business?.total_products?.toLocaleString()} / {stats?.capacity?.products_limit?.toLocaleString()}</span>
                </div>
                <Progress 
                  value={(stats?.business?.total_products / stats?.capacity?.products_limit) * 100} 
                  className="h-1.5" 
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Business Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            إحصائيات العمل
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[
              { label: 'الطلبات', value: stats?.business?.total_orders, icon: '📦' },
              { label: 'المنتجات', value: stats?.business?.total_products, icon: '🍔' },
              { label: 'العملاء', value: stats?.business?.total_customers, icon: '👥' },
              { label: 'الموظفين', value: stats?.business?.total_employees, icon: '👨‍💼' },
              { label: 'الفروع', value: stats?.business?.total_branches, icon: '🏪' },
              { label: 'الورديات النشطة', value: stats?.business?.active_shifts, icon: '⏰' }
            ].map((item, idx) => (
              <div key={idx} className="text-center p-4 bg-muted/30 rounded-lg">
                <div className="text-2xl mb-1">{item.icon}</div>
                <p className="text-2xl font-bold">{item.value?.toLocaleString() || 0}</p>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Collections Stats */}
      {stats?.database?.collections && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              تفاصيل المجموعات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {Object.entries(stats.database.collections)
                .sort(([,a], [,b]) => b - a)
                .map(([name, count]) => (
                  <div key={name} className="p-2 bg-muted/30 rounded text-sm">
                    <p className="font-medium truncate">{name}</p>
                    <p className="text-muted-foreground">{count} سجل</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-500" />
            النسخ الاحتياطية
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Download className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>لا توجد نسخ احتياطية</p>
              <p className="text-sm">انقر على "نسخ احتياطي" لإنشاء نسخة جديدة</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {backups.map((backup, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Download className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{backup.filename}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(backup.created_at).toLocaleString('ar-IQ')}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">{backup.size_mb} MB</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last Updated */}
      <p className="text-center text-sm text-muted-foreground">
        آخر تحديث: {health?.timestamp ? new Date(health.timestamp).toLocaleString('ar-IQ') : 'غير متاح'}
      </p>
    </div>
  );
}
