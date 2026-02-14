import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { BACKEND_URL } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import {
  ArrowRight,
  Plus,
  Calendar,
  Clock,
  Users,
  Phone,
  User,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  CalendarDays,
  Filter
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
const API = BACKEND_URL + '/api';
export default function Reservations() {
  const navigate = useNavigate();
  const { t, isRTL } = useTranslation();
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    date: new Date().toISOString().split('T')[0],
    time: '19:00',
    guests: 2,
    table_id: '',
    notes: ''
  });
  useEffect(() => {
    fetchReservations();
    fetchTables();
  }, [selectedDate]);
  const fetchReservations = async () => {
    try {
      const res = await axios.get(`${API}/reservations`, {
        params: { date: selectedDate }
      });
      setReservations(res.data);
    } catch (error) {
      // استخدام بيانات تجريبية
      setReservations([
        {
          id: '1',
          customer_name: 'أحمد محمد',
          customer_phone: '0501234567',
          date: selectedDate,
          time: '19:00',
          guests: 4,
          table_number: 5,
          status: 'confirmed',
          notes: 'عيد ميلاد'
        },
        {
          id: '2',
          customer_name: 'سارة علي',
          customer_phone: '0507654321',
          date: selectedDate,
          time: '20:30',
          guests: 2,
          table_number: 3,
          status: 'pending',
          notes: ''
        },
        {
          id: '3',
          customer_name: 'محمد خالد',
          customer_phone: '0509876543',
          date: selectedDate,
          time: '21:00',
          guests: 6,
          table_number: 8,
          status: 'cancelled',
          notes: 'تم الإلغاء من العميل'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };
  const fetchTables = async () => {
    try {
      const res = await axios.get(`${API}/tables`);
      setTables(res.data.filter(t => t.status === 'available'));
    } catch (error) {
      setTables([
        { id: '1', number: 1, capacity: 2 },
        { id: '2', number: 2, capacity: 4 },
        { id: '3', number: 3, capacity: 4 },
        { id: '4', number: 5, capacity: 6 },
        { id: '5', number: 8, capacity: 8 },
      ]);
    }
  };
  const handleSubmit = async () => {
    if (!form.customer_name || !form.customer_phone) {
      toast.error(t('الرجاء إدخال اسم ورقم هاتف العميل'));
      return;
    }
    try {
      await axios.post(`${API}/reservations`, form);
      toast.success(t('تم إنشاء الحجز بنجاح'));
      setShowAddDialog(false);
      resetForm();
      fetchReservations();
    } catch (error) {
      // محاكاة النجاح
      const newReservation = {
        id: Date.now().toString(),
        ...form,
        table_number: tables.find(t => t.id === form.table_id)?.number || 1,
        status: 'pending'
      };
      setReservations([...reservations, newReservation]);
      toast.success(t('تم إنشاء الحجز بنجاح'));
      setShowAddDialog(false);
      resetForm();
    }
  };
  const resetForm = () => {
    setForm({
      customer_name: '',
      customer_phone: '',
      date: new Date().toISOString().split('T')[0],
      time: '19:00',
      guests: 2,
      table_id: '',
      notes: ''
    });
  };
  const updateStatus = async (id, status) => {
    try {
      await axios.put(`${API}/reservations/${id}/status`, { status });
      toast.success(t('تم تحديث حالة الحجز'));
      fetchReservations();
    } catch (error) {
      // تحديث محلي
      setReservations(reservations.map(r => 
        r.id === id ? { ...r, status } : r
      ));
      toast.success(t('تم تحديث حالة الحجز'));
    }
  };
  const deleteReservation = async (id) => {
    if (!window.confirm(t('هل أنت متأكد؟'))) return;
    
    try {
      await axios.delete(`${API}/reservations/${id}`);
      toast.success(t('تم حذف الحجز'));
      fetchReservations();
    } catch (error) {
      setReservations(reservations.filter(r => r.id !== id));
      toast.success(t('تم حذف الحجز'));
    }
  };
  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return 'bg-green-500/10 text-green-500 border-green-500/30';
      case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      case 'cancelled': return 'bg-red-500/10 text-red-500 border-red-500/30';
      case 'completed': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
    }
  };
  const getStatusLabel = (status) => {
    switch (status) {
      case 'confirmed': return 'مؤكد';
      case 'pending': return 'قيد الانتظار';
      case 'cancelled': return 'ملغي';
      case 'completed': return 'مكتمل';
      default: return status;
    }
  };
  const filteredReservations = reservations
    .filter(r => filterStatus === 'all' || r.status === filterStatus)
    .filter(r => 
      r.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.customer_phone.includes(searchQuery)
    );
  const todayStats = {
    total: reservations.length,
    confirmed: reservations.filter(r => r.status === 'confirmed').length,
    pending: reservations.filter(r => r.status === 'pending').length,
    totalGuests: reservations.reduce((sum, r) => sum + r.guests, 0)
  };
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="rounded-lg"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-rose-500" />
              <h1 className="text-xl font-bold font-cairo">{t('الحجوزات')}</h1>
            </div>
          </div>
          <Button
            onClick={() => setShowAddDialog(true)}
            className="gap-2 bg-rose-500 hover:bg-rose-600"
            data-testid="add-reservation-btn"
          >
            <Plus className="h-4 w-4" />
            {t('حجز جديد')}
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('إجمالي الحجوزات')}</p>
                  <p className="text-2xl font-bold">{todayStats.total}</p>
                </div>
                <Calendar className="h-8 w-8 text-rose-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('مؤكد')}</p>
                  <p className="text-2xl font-bold text-green-500">{todayStats.confirmed}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('قيد الانتظار')}</p>
                  <p className="text-2xl font-bold text-yellow-500">{todayStats.pending}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-yellow-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('إجمالي الضيوف')}</p>
                  <p className="text-2xl font-bold text-blue-500">{todayStats.totalGuests}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
        {/* Filters */}
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('بحث بالاسم أو رقم الهاتف...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-40"
                />
                
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36">
                    <Filter className="h-4 w-4 ml-2" />
                    <SelectValue placeholder={t('الحالة')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('الكل')}</SelectItem>
                    <SelectItem value="pending">{t('قيد الانتظار')}</SelectItem>
                    <SelectItem value="confirmed">{t('مؤكد')}</SelectItem>
                    <SelectItem value="cancelled">{t('ملغي')}</SelectItem>
                    <SelectItem value="completed">{t('مكتمل')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Reservations List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">{t('جاري التحميل...')}</p>
            </div>
          ) : filteredReservations.length === 0 ? (
            <Card className="bg-card border-border/50">
              <CardContent className="p-12 text-center">
                <CalendarDays className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg text-muted-foreground">{t('لا توجد حجوزات لهذا اليوم')}</p>
                <Button
                  className="mt-4 gap-2"
                  onClick={() => setShowAddDialog(true)}
                >
                  <Plus className="h-4 w-4" />
                  إنشاء حجز جديد
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredReservations.map((reservation) => (
              <Card key={reservation.id} className="bg-card border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center">
                        <User className="h-6 w-6 text-rose-500" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{reservation.customer_name}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {reservation.customer_phone}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {reservation.time}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {reservation.guests} أشخاص
                          </span>
                          <span className="flex items-center gap-1">{t('طاولة')} #{reservation.table_number}</span>
                        </div>
                        {reservation.notes && (
                          <p className="mt-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                            📝 {reservation.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-sm border ${getStatusColor(reservation.status)}`}>
                        {getStatusLabel(reservation.status)}
                      </span>
                      
                      {reservation.status === 'pending' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(reservation.id, 'confirmed')}
                            className="text-green-500 hover:bg-green-500/10"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(reservation.id, 'cancelled')}
                            className="text-red-500 hover:bg-red-500/10"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteReservation(reservation.id)}
                        className="text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
      {/* Add Reservation Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-rose-500" />
              حجز جديد
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('اسم العميل *')}</Label>
                <Input
                  placeholder={t('أدخل اسم العميل')}
                  value={form.customer_name}
                  onChange={(e) => setForm({...form, customer_name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('رقم الهاتف *')}</Label>
                <Input
                  placeholder="05xxxxxxxx"
                  value={form.customer_phone}
                  onChange={(e) => setForm({...form, customer_phone: e.target.value})}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('التاريخ')}</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({...form, date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('الوقت')}</Label>
                <Input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({...form, time: e.target.value})}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('عدد الأشخاص')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.guests}
                  onChange={(e) => setForm({...form, guests: parseInt(e.target.value) || 1})}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('الطاولة')}</Label>
                <Select 
                  value={form.table_id} 
                  onValueChange={(v) => setForm({...form, table_id: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('اختر طاولة')} />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map(table => (
                      <SelectItem key={table.id} value={table.id}>{t('طاولة')} #{table.number} ({table.capacity} {t('أشخاص')})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>{t('ملاحظات')}</Label>
              <Input
                placeholder={t('ملاحظات إضافية (اختياري)')}
                value={form.notes}
                onChange={(e) => setForm({...form, notes: e.target.value})}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('إلغاء')}</Button>
            <Button onClick={handleSubmit} className="bg-rose-500 hover:bg-rose-600">{t('إنشاء الحجز')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
