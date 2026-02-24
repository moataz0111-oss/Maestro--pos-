import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useTranslation } from '../utils/useTranslation';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  User, Clock, Calendar, MapPin, Truck, ShoppingCart,
  ArrowLeft, Search, RefreshCw, Plus, History,
  Building2, Package, Check, X, AlertCircle
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function CallCenterDashboard() {
  const { user, token } = useAuth();
  const { branches, selectedBranchId } = useBranch();
  const { t, isRTL } = useTranslation();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [searchPhone, setSearchPhone] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    answered: 0,
    missed: 0,
    ongoing: 0
  });

  // جلب بيانات المكالمات
  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/call-logs`);
      const callsData = res.data || [];
      setCalls(callsData);
      
      // حساب الإحصائيات
      setStats({
        total: callsData.length,
        answered: callsData.filter(c => c.status === 'answered' || c.status === 'completed').length,
        missed: callsData.filter(c => c.status === 'missed').length,
        ongoing: callsData.filter(c => c.status === 'ongoing').length
      });
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // جلب بيانات العميل
  const fetchCustomerData = async (phone) => {
    try {
      const res = await axios.get(`${API}/customers/search?phone=${phone}`);
      if (res.data && res.data.length > 0) {
        setCustomerData(res.data[0]);
        // جلب طلبات العميل
        fetchCustomerOrders(res.data[0].id);
      } else {
        setCustomerData(null);
        setCustomerOrders([]);
      }
    } catch (error) {
      console.error('Error fetching customer:', error);
      setCustomerData(null);
      setCustomerOrders([]);
    }
  };

  // جلب طلبات العميل
  const fetchCustomerOrders = async (customerId) => {
    try {
      const res = await axios.get(`${API}/orders?customer_id=${customerId}&limit=10`);
      setCustomerOrders(res.data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setCustomerOrders([]);
    }
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchCalls();
    }
  }, [token, fetchCalls]);

  // عند اختيار مكالمة
  const handleSelectCall = (call) => {
    setSelectedCall(call);
    if (call.phone) {
      fetchCustomerData(call.phone);
    }
  };

  // البحث عن عميل برقم الهاتف
  const handleSearchCustomer = async () => {
    if (searchPhone) {
      await fetchCustomerData(searchPhone);
    }
  };

  // إنشاء طلب جديد
  const handleCreateOrder = (phone, name) => {
    navigate(`/pos?phone=${phone}&name=${encodeURIComponent(name || '')}&from_call=true`);
  };

  // فلترة المكالمات
  const filteredCalls = calls.filter(call => {
    if (filterStatus === 'all') return true;
    return call.status === filterStatus;
  });

  // تنسيق التاريخ
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-IQ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // تنسيق السعر
  const formatPrice = (amount) => {
    return new Intl.NumberFormat('ar-IQ').format(amount || 0) + ' IQD';
  };

  // الحصول على لون الحالة
  const getStatusColor = (status) => {
    switch (status) {
      case 'answered':
      case 'completed':
        return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'missed':
        return 'bg-red-500/10 text-red-600 border-red-500/30';
      case 'ongoing':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      default:
        return 'bg-gray-500/10 text-gray-600 border-gray-500/30';
    }
  };

  // الحصول على أيقونة الحالة
  const getStatusIcon = (status) => {
    switch (status) {
      case 'answered':
      case 'completed':
        return <PhoneIncoming className="h-4 w-4" />;
      case 'missed':
        return <PhoneMissed className="h-4 w-4" />;
      case 'ongoing':
        return <Phone className="h-4 w-4 animate-pulse" />;
      default:
        return <Phone className="h-4 w-4" />;
    }
  };

  return (
    <div className={`min-h-screen bg-background p-4 ${isRTL ? 'rtl' : 'ltr'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('لوحة كول سنتر')}</h1>
            <p className="text-sm text-muted-foreground">{t('إدارة المكالمات والعملاء')}</p>
          </div>
        </div>
        <Button onClick={fetchCalls} variant="outline" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('تحديث')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('إجمالي المكالمات')}</p>
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
              </div>
              <Phone className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/10 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('مكالمات مكتملة')}</p>
                <p className="text-2xl font-bold text-green-600">{stats.answered}</p>
              </div>
              <PhoneIncoming className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/10 border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('مكالمات فائتة')}</p>
                <p className="text-2xl font-bold text-red-600">{stats.missed}</p>
              </div>
              <PhoneMissed className="h-8 w-8 text-red-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/10 border-cyan-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('مكالمات جارية')}</p>
                <p className="text-2xl font-bold text-cyan-600">{stats.ongoing}</p>
              </div>
              <Phone className="h-8 w-8 text-cyan-500 opacity-80 animate-pulse" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Calls List */}
        <Card className="col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t('المكالمات الواردة')}</CardTitle>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('الكل')}</SelectItem>
                  <SelectItem value="ongoing">{t('جارية')}</SelectItem>
                  <SelectItem value="answered">{t('مكتملة')}</SelectItem>
                  <SelectItem value="missed">{t('فائتة')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCalls.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{t('لا توجد مكالمات')}</p>
              </div>
            ) : (
              filteredCalls.map((call) => (
                <div
                  key={call.id}
                  onClick={() => handleSelectCall(call)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedCall?.id === call.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-muted/30 hover:bg-muted/50 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(call.status)}
                      <span className="font-medium">{call.phone || t('غير معروف')}</span>
                    </div>
                    <Badge variant="outline" className={getStatusColor(call.status)}>
                      {call.status === 'answered' ? t('مكتملة') :
                       call.status === 'missed' ? t('فائتة') :
                       call.status === 'ongoing' ? t('جارية') : call.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(call.created_at)}
                    </span>
                    {call.duration && (
                      <span>{call.duration} {t('ثانية')}</span>
                    )}
                  </div>
                  {call.customer_name && (
                    <p className="text-xs text-primary mt-1">{call.customer_name}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Customer Info & Orders */}
        <Card className="col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t('بيانات العميل')}</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t('البحث برقم الهاتف...')}
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  className="w-48 h-8"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchCustomer()}
                />
                <Button size="sm" onClick={handleSearchCustomer}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {customerData ? (
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="info" className="gap-2">
                    <User className="h-4 w-4" />
                    {t('المعلومات')}
                  </TabsTrigger>
                  <TabsTrigger value="orders" className="gap-2">
                    <History className="h-4 w-4" />
                    {t('الطلبات السابقة')} ({customerOrders.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Customer Details */}
                    <div className="space-y-4">
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-lg">{customerData.name || t('عميل غير مسجل')}</p>
                            <p className="text-sm text-muted-foreground">{customerData.phone}</p>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          {customerData.address && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{customerData.address}</span>
                            </div>
                          )}
                          {customerData.notes && (
                            <div className="p-2 bg-yellow-500/10 rounded text-yellow-700">
                              <AlertCircle className="h-4 w-4 inline mr-1" />
                              {customerData.notes}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <Button 
                        className="w-full gap-2" 
                        onClick={() => handleCreateOrder(customerData.phone, customerData.name)}
                      >
                        <Plus className="h-4 w-4" />
                        {t('إنشاء طلب جديد')}
                      </Button>
                    </div>

                    {/* Customer Stats */}
                    <div className="space-y-3">
                      <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                        <p className="text-xs text-muted-foreground">{t('إجمالي الطلبات')}</p>
                        <p className="text-xl font-bold text-green-600">{customerOrders.length}</p>
                      </div>
                      <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                        <p className="text-xs text-muted-foreground">{t('إجمالي المشتريات')}</p>
                        <p className="text-xl font-bold text-blue-600">
                          {formatPrice(customerOrders.reduce((sum, o) => sum + (o.total || 0), 0))}
                        </p>
                      </div>
                      {customerData.loyalty_points > 0 && (
                        <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
                          <p className="text-xs text-muted-foreground">{t('نقاط الولاء')}</p>
                          <p className="text-xl font-bold text-purple-600">{customerData.loyalty_points}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="orders">
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {customerOrders.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>{t('لا توجد طلبات سابقة')}</p>
                      </div>
                    ) : (
                      customerOrders.map((order) => (
                        <div key={order.id} className="p-4 bg-muted/30 rounded-lg border">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className={
                                order.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                                order.status === 'cancelled' ? 'bg-red-500/10 text-red-600' :
                                'bg-blue-500/10 text-blue-600'
                              }>
                                #{order.order_number || order.id?.slice(-6)}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {formatDate(order.created_at)}
                              </span>
                            </div>
                            <span className="font-bold text-primary">{formatPrice(order.total)}</span>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            {/* الفرع */}
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span>{order.branch_name || branches.find(b => b.id === order.branch_id)?.name || t('غير محدد')}</span>
                            </div>
                            
                            {/* نوع الطلب */}
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {order.order_type === 'delivery' ? t('توصيل') :
                                 order.order_type === 'dine_in' ? t('داخل') : t('سفري')}
                              </span>
                            </div>
                            
                            {/* السائق */}
                            {order.order_type === 'delivery' && (
                              <div className="flex items-center gap-2">
                                <Truck className="h-4 w-4 text-muted-foreground" />
                                <span>{order.driver_name || t('لم يُعيّن')}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* المنتجات */}
                          {order.items && order.items.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <p className="text-xs text-muted-foreground mb-2">{t('المنتجات')}:</p>
                              <div className="flex flex-wrap gap-1">
                                {order.items.slice(0, 4).map((item, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {item.name || item.product_name} x{item.quantity}
                                  </Badge>
                                ))}
                                {order.items.length > 4 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{order.items.length - 4}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : selectedCall ? (
              <div className="text-center py-12">
                <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">{t('لم يتم العثور على بيانات للعميل')}</p>
                <p className="text-lg font-medium mb-4">{selectedCall.phone}</p>
                <Button 
                  className="gap-2"
                  onClick={() => handleCreateOrder(selectedCall.phone, '')}
                >
                  <Plus className="h-4 w-4" />
                  {t('إنشاء طلب جديد')}
                </Button>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Phone className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>{t('اختر مكالمة من القائمة أو ابحث عن عميل')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
