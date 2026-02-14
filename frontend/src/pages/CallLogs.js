import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/currency';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  ArrowRight,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  User,
  Clock,
  Search,
  Calendar,
  Filter,
  ShoppingCart,
  MapPin,
  RefreshCw,
  Download,
  Headphones
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
const API = API_URL;
export default function CallLogs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, isRTL } = useTranslation();
  
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    answered: 0,
    missed: 0,
    avgDuration: 0
  });
  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/callcenter/call-logs`, {
        params: { limit: 100 }
      });
      setLogs(res.data.logs || []);
      
      // حساب الإحصائيات
      const answered = res.data.logs?.filter(l => l.status === 'ended').length || 0;
      const missed = res.data.logs?.filter(l => l.status === 'missed').length || 0;
      setStats({
        total: res.data.total || 0,
        answered,
        missed,
        avgDuration: 0 // يمكن حسابها لاحقاً
      });
    } catch (error) {
      toast.error(t('فشل في تحميل سجل المكالمات'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchLogs();
  }, []);
  // فلترة السجلات
  const filteredLogs = logs.filter(log => {
    const matchesSearch = !searchQuery || 
      log.phone?.includes(searchQuery) || 
      log.caller_name?.includes(searchQuery);
    
    const matchesStatus = filterStatus === 'all' || log.status === filterStatus;
    
    const matchesDate = !filterDate || 
      log.timestamp?.startsWith(filterDate);
    
    return matchesSearch && matchesStatus && matchesDate;
  });
  const getStatusIcon = (status) => {
    switch (status) {
      case 'ended':
        return <PhoneIncoming className="h-4 w-4 text-green-500" />;
      case 'missed':
        return <PhoneMissed className="h-4 w-4 text-red-500" />;
      case 'outgoing':
        return <PhoneOutgoing className="h-4 w-4 text-blue-500" />;
      default:
        return <Phone className="h-4 w-4 text-gray-500" />;
    }
  };
  const getStatusText = (status) => {
    switch (status) {
      case 'ended':
        return t('مكتملة');
      case 'missed':
        return t('فائتة');
      case 'answered':
        return t('تم الرد');
      case 'ringing':
        return t('جارية');
      default:
        return status;
    }
  };
  const formatDuration = (start, end) => {
    if (!start || !end) return '-';
    const duration = new Date(end) - new Date(start);
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('ar-IQ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('سجل المكالمات')}</h1>
            <p className="text-sm text-muted-foreground">{t('جميع المكالمات الواردة والصادرة')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchLogs} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('تحديث')}
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            {t('تصدير')}
          </Button>
        </div>
      </div>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Headphones className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('إجمالي المكالمات')}</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <PhoneIncoming className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('مكالمات مكتملة')}</p>
                <p className="text-2xl font-bold text-foreground">{stats.answered}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <PhoneMissed className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('مكالمات فائتة')}</p>
                <p className="text-2xl font-bold text-foreground">{stats.missed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Clock className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('متوسط المدة')}</p>
                <p className="text-2xl font-bold text-foreground">2:30</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Filters */}
      <Card className="mb-6 bg-card border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('بحث بالرقم أو الاسم...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                />
              </div>
            </div>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t('الحالة')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('الكل')}</SelectItem>
                <SelectItem value="ended">{t('مكتملة')}</SelectItem>
                <SelectItem value="missed">{t('فائتة')}</SelectItem>
                <SelectItem value="answered">{t('تم الرد')}</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-[180px]"
            />
          </div>
        </CardContent>
      </Card>
      {/* Call Logs Table */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {t('سجل المكالمات')} ({filteredLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">{t('جاري التحميل...')}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-10">
              <Headphones className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">{t('لا توجد مكالمات')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => (
                <div
                  key={log.call_id}
                  className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Status Icon */}
                    <div className={`p-2 rounded-full ${
                      log.status === 'ended' ? 'bg-green-500/20' :
                      log.status === 'missed' ? 'bg-red-500/20' :
                      'bg-gray-500/20'
                    }`}>
                      {getStatusIcon(log.status)}
                    </div>
                    
                    {/* Call Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {log.caller_name || t('غير معروف')}
                        </span>
                        {log.is_new_customer && (
                          <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-500 rounded-full">{t('جديد')}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground font-mono" dir="ltr">
                        {log.phone}
                      </p>
                    </div>
                  </div>
                  
                  {/* Time & Duration */}
                  <div className="text-left">
                    <p className="text-sm text-foreground">
                      {formatTime(log.timestamp)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getStatusText(log.status)}
                      {log.answered_at && log.ended_at && (
                        <span className="mr-2">
                          • {formatDuration(log.answered_at, log.ended_at)}
                        </span>
                      )}
                    </p>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {log.customer && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/settings?tab=customers&search=${log.phone}`)}
                        className="gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <User className="h-4 w-4" />
                        {t('عرض العميل')}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/pos?phone=${log.phone}`)}
                      className="gap-1"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      {t('إنشاء طلب')}
                    </Button>
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
