import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { API_URL, BACKEND_URL } from '../utils/api';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import {
  Ticket,
  Plus,
  Trash2,
  Edit,
  Tag,
  Gift,
  Clock,
  Calendar,
  Percent,
  DollarSign,
  Users,
  ShoppingCart,
  Copy,
  Check,
  AlertCircle,
  Sparkles,
  Crown,
  Home,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
const API = API_URL;
export default function Coupons() {
  const navigate = useNavigate();
  const { t, isRTL } = useTranslation();
  const [activeTab, setActiveTab] = useState('coupons');
  const [coupons, setCoupons] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [couponDialogOpen, setCouponDialogOpen] = useState(false);
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [couponForm, setCouponForm] = useState({
    code: '',
    name: '',
    description: '',
    discount_type: 'percentage',
    discount_value: 10,
    min_order_amount: 0,
    max_discount: null,
    usage_limit: null,
    usage_per_customer: 1,
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
    is_active: true,
    loyalty_tier_required: 'all',
    first_order_only: false,
    // الحقول الجديدة
    branch_ids: [],
    daily_start_time: '',
    daily_end_time: '',
    customer_name: ''
  });
  const [branches, setBranches] = useState([]);
  const [promotionForm, setPromotionForm] = useState({
    name: '',
    description: '',
    promotion_type: 'buy_x_get_y',
    buy_quantity: 2,
    get_quantity: 1,
    discount_percent: 100,
    bundle_price: null,
    start_time: '',
    end_time: '',
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
    is_active: true,
    loyalty_tier_required: 'all'
  });
  useEffect(() => {
    fetchData();
  }, []);
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [couponsRes, promotionsRes, branchesRes] = await Promise.all([
        axios.get(`${API}/coupons`, { headers }),
        axios.get(`${API}/promotions`, { headers }),
        axios.get(`${API}/branches`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setCoupons(couponsRes.data);
      setPromotions(promotionsRes.data);
      setBranches(branchesRes.data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  const handleSaveCoupon = async (e) => {
    e.preventDefault();
    
    if (!couponForm.code || !couponForm.name) {
      toast.error(t('الكود والاسم مطلوبان'));
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const data = {
        ...couponForm,
        max_discount: couponForm.max_discount || null,
        usage_limit: couponForm.usage_limit || null,
        loyalty_tier_required: couponForm.loyalty_tier_required || null,
        daily_start_time: couponForm.daily_start_time || null,
        daily_end_time: couponForm.daily_end_time || null,
        customer_name: (couponForm.customer_name || '').trim() || null,
        branch_ids: couponForm.branch_ids || []
      };
      
      if (editingCoupon) {
        await axios.put(`${API}/coupons/${editingCoupon.id}`, data, { headers });
        toast.success(t('تم تحديث الكوبون'));
      } else {
        await axios.post(`${API}/coupons`, data, { headers });
        toast.success(t('تم إنشاء الكوبون'));
      }
      
      setCouponDialogOpen(false);
      resetCouponForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ الكوبون'));
    }
  };
  const handleDeleteCoupon = async (id) => {
    if (!window.confirm(t('هل أنت متأكد؟'))) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/coupons/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(t('تم الحذف'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في الحذف'));
    }
  };
  const handleSavePromotion = async (e) => {
    e.preventDefault();
    
    if (!promotionForm.name) {
      toast.error(t('اسم العرض مطلوب'));
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const data = {
        ...promotionForm,
        loyalty_tier_required: promotionForm.loyalty_tier_required || null
      };
      
      if (editingPromotion) {
        await axios.put(`${API}/promotions/${editingPromotion.id}`, data, { headers });
        toast.success(t('تم تحديث العرض'));
      } else {
        await axios.post(`${API}/promotions`, data, { headers });
        toast.success(t('تم إنشاء العرض'));
      }
      
      setPromotionDialogOpen(false);
      resetPromotionForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('فشل في حفظ العرض'));
    }
  };
  const handleDeletePromotion = async (id) => {
    if (!window.confirm(t('هل أنت متأكد؟'))) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/promotions/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(t('تم الحذف'));
      fetchData();
    } catch (error) {
      toast.error(t('فشل في الحذف'));
    }
  };
  const resetCouponForm = () => {
    setCouponForm({
      code: '', name: '', description: '', discount_type: 'percentage',
      discount_value: 10, min_order_amount: 0, max_discount: null,
      usage_limit: null, usage_per_customer: 1,
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      is_active: true, loyalty_tier_required: 'all', first_order_only: false,
      branch_ids: [], daily_start_time: '', daily_end_time: '', customer_name: ''
    });
    setEditingCoupon(null);
  };
  const resetPromotionForm = () => {
    setPromotionForm({
      name: '', description: '', promotion_type: 'buy_x_get_y',
      buy_quantity: 2, get_quantity: 1, discount_percent: 100,
      bundle_price: null, start_time: '', end_time: '',
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      is_active: true, loyalty_tier_required: 'all'
    });
    setEditingPromotion(null);
  };
  const editCoupon = (coupon) => {
    setEditingCoupon(coupon);
    setCouponForm({
      ...coupon,
      valid_from: coupon.valid_from?.split('T')[0] || '',
      valid_until: coupon.valid_until?.split('T')[0] || '',
      branch_ids: coupon.branch_ids || [],
      daily_start_time: coupon.daily_start_time || '',
      daily_end_time: coupon.daily_end_time || '',
      customer_name: coupon.customer_name || ''
    });
    setCouponDialogOpen(true);
  };
  const editPromotion = (promo) => {
    setEditingPromotion(promo);
    setPromotionForm({
      ...promo,
      valid_from: promo.valid_from?.split('T')[0] || '',
      valid_until: promo.valid_until?.split('T')[0] || ''
    });
    setPromotionDialogOpen(true);
  };
  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(t('تم نسخ الكود'));
    setTimeout(() => setCopiedCode(null), 2000);
  };
  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCouponForm({ ...couponForm, code });
  };
  const isExpired = (date) => new Date(date) < new Date();
  const isActive = (coupon) => coupon.is_active && !isExpired(coupon.valid_until);
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <Home className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Ticket className="h-6 w-6 text-primary" />
              {t('الكوبونات والعروض')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('إدارة أكواد الخصم والعروض الترويجية')}</p>
          </div>
        </div>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <Ticket className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('الكوبونات')}</p>
                <p className="text-2xl font-bold text-foreground">{coupons.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('نشطة')}</p>
                <p className="text-2xl font-bold text-foreground">{coupons.filter(c => isActive(c)).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                <Zap className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('العروض')}</p>
                <p className="text-2xl font-bold text-foreground">{promotions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('إجمالي الخصومات')}</p>
                <p className="text-2xl font-bold text-foreground">
                  {coupons.reduce((sum, c) => sum + (c.total_discount_given || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="coupons" className="gap-2">
            <Ticket className="h-4 w-4" /> {t('الكوبونات')}
          </TabsTrigger>
          <TabsTrigger value="promotions" className="gap-2">
            <Sparkles className="h-4 w-4" /> {t('العروض')}
          </TabsTrigger>
        </TabsList>
        {/* Coupons Tab */}
        <TabsContent value="coupons">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { resetCouponForm(); setCouponDialogOpen(true); }}>
              <Plus className="h-4 w-4 ml-2" /> {t('كوبون جديد')}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coupons.map((coupon) => (
              <Card key={coupon.id} className={`border-border/50 ${!isActive(coupon) ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-lg font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                          {coupon.code}
                        </code>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => copyCode(coupon.code)}
                        >
                          {copiedCode === coupon.code ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <h3 className="font-medium text-foreground">{coupon.name}</h3>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => editCoupon(coupon)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteCoupon(coupon.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm mb-3">
                    <div className="flex items-center gap-2">
                      {coupon.discount_type === 'percentage' ? (
                        <Badge className="bg-green-500/10 text-green-500">
                          <Percent className="h-3 w-3 ml-1" />
                          {coupon.discount_value}%
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-500/10 text-blue-500">
                          <DollarSign className="h-3 w-3 ml-1" />
                          {coupon.discount_value} د.ع
                        </Badge>
                      )}
                      {coupon.loyalty_tier_required && (
                        <Badge className="bg-purple-500/10 text-purple-500">
                          <Crown className="h-3 w-3 ml-1" />
                          {coupon.loyalty_tier_required}
                        </Badge>
                      )}
                    </div>
                    
                    {coupon.min_order_amount > 0 && (
                      <p className="text-muted-foreground">{t('الحد الأدنى: {coupon.min_order_amount.toLocaleString()} د.ع')}</p>
                    )}
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t('استخدم')} {coupon.used_count || 0} {t('مرة')}</span>
                      <span>{t('حتى')} {new Date(coupon.valid_until).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>
                  <Badge className={isActive(coupon) ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}>
                    {isActive(coupon) ? t('نشط') : isExpired(coupon.valid_until) ? t('منتهي') : t('معطل')}
                  </Badge>
                </CardContent>
              </Card>
            ))}
            {coupons.length === 0 && (
              <Card className="col-span-full border-border/50">
                <CardContent className="py-12 text-center">
                  <Ticket className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground">{t('لا توجد كوبونات')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        {/* Promotions Tab */}
        <TabsContent value="promotions">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { resetPromotionForm(); setPromotionDialogOpen(true); }}>
              <Plus className="h-4 w-4 ml-2" /> {t('عرض جديد')}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {promotions.map((promo) => (
              <Card key={promo.id} className={`border-border/50 ${!promo.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-foreground text-lg">{promo.name}</h3>
                      {promo.description && (
                        <p className="text-sm text-muted-foreground">{promo.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => editPromotion(promo)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeletePromotion(promo.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 mb-3">
                    {promo.promotion_type === 'buy_x_get_y' && (
                      <p className="text-center font-medium text-foreground">
                        {t('اشترِ')} {promo.buy_quantity} {t('واحصل على')} {promo.get_quantity} 
                        {promo.discount_percent === 100 ? t(' مجاناً') : ` ${t('بخصم')} ${promo.discount_percent}%`}
                      </p>
                    )}
                    {promo.promotion_type === 'happy_hour' && (
                      <p className="text-center font-medium text-foreground">
                        {t('ساعة السعادة')}: {promo.start_time} - {promo.end_time}
                        <br />
                        {t('خصم')} {promo.discount_percent}%
                      </p>
                    )}
                    {promo.promotion_type === 'bundle' && (
                      <p className="text-center font-medium text-foreground">{t('باقة بسعر {promo.bundle_price?.toLocaleString()} د.ع')}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <Badge className={promo.is_active ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}>
                      {promo.is_active ? t('نشط') : t('معطل')}
                    </Badge>
                    <span className="text-muted-foreground">{t('حتى')} {new Date(promo.valid_until).toLocaleDateString('en-GB')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {promotions.length === 0 && (
              <Card className="col-span-full border-border/50">
                <CardContent className="py-12 text-center">
                  <Sparkles className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground">{t('لا توجد عروض')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {/* Coupon Dialog */}
      <Dialog open={couponDialogOpen} onOpenChange={setCouponDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingCoupon ? t('تعديل كوبون') : t('إنشاء كوبون جديد')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveCoupon} className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>{t('كود الكوبون *')}</Label>
                <Input
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                  placeholder="SAVE20"
                  dir="ltr"
                  required
                />
              </div>
              <Button type="button" variant="outline" className="mt-6" onClick={generateCode}>{t('توليد')}</Button>
            </div>
            <div>
              <Label>{t('اسم الكوبون *')}</Label>
              <Input
                value={couponForm.name}
                onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })}
                placeholder={t('خصم 20% على الطلب')}
                required
              />
            </div>
            <div>
              <Label>{t('الوصف')}</Label>
              <Textarea
                value={couponForm.description}
                onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('نوع الخصم')}</Label>
                <Select
                  value={couponForm.discount_type}
                  onValueChange={(v) => setCouponForm({ ...couponForm, discount_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{t('نسبة مئوية %')}</SelectItem>
                    <SelectItem value="fixed">{t('مبلغ ثابت')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('قيمة الخصم')}</Label>
                <Input
                  type="number"
                  value={couponForm.discount_value}
                  onChange={(e) => setCouponForm({ ...couponForm, discount_value: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('الحد الأدنى للطلب')}</Label>
                <Input
                  type="number"
                  value={couponForm.min_order_amount}
                  onChange={(e) => setCouponForm({ ...couponForm, min_order_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>{t('أقصى خصم (للنسبة)')}</Label>
                <Input
                  type="number"
                  value={couponForm.max_discount || ''}
                  onChange={(e) => setCouponForm({ ...couponForm, max_discount: parseFloat(e.target.value) || null })}
                  placeholder={t('بدون حد')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('عدد الاستخدامات الكلي')}</Label>
                <Input
                  type="number"
                  value={couponForm.usage_limit || ''}
                  onChange={(e) => setCouponForm({ ...couponForm, usage_limit: parseInt(e.target.value) || null })}
                  placeholder={t('غير محدود')}
                />
              </div>
              <div>
                <Label>{t('لكل عميل')}</Label>
                <Input
                  type="number"
                  value={couponForm.usage_per_customer}
                  onChange={(e) => setCouponForm({ ...couponForm, usage_per_customer: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div>
              <Label>{t('اسم العميل المرتبط (اختياري)')}</Label>
              <Input
                value={couponForm.customer_name || ''}
                onChange={(e) => setCouponForm({ ...couponForm, customer_name: e.target.value })}
                placeholder={t('اتركه فارغاً ليطبق على جميع العملاء')}
                data-testid="coupon-customer-name"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('عند كتابة هذا الاسم في POS، يطبق الكوبون تلقائياً')}
              </p>
            </div>

            <div>
              <Label>{t('الفروع المسموح بها')}</Label>
              <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1" data-testid="coupon-branches-list">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="branch-all"
                    checked={(couponForm.branch_ids || []).length === 0}
                    onChange={(e) => {
                      if (e.target.checked) setCouponForm({ ...couponForm, branch_ids: [] });
                    }}
                    data-testid="coupon-branch-all"
                  />
                  <label htmlFor="branch-all" className="text-sm cursor-pointer">{t('جميع الفروع')}</label>
                </div>
                {branches.map((br) => {
                  const isSelected = (couponForm.branch_ids || []).includes(br.id);
                  return (
                    <div key={br.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`branch-${br.id}`}
                        checked={isSelected}
                        onChange={(e) => {
                          const list = couponForm.branch_ids || [];
                          if (e.target.checked) {
                            setCouponForm({ ...couponForm, branch_ids: [...list, br.id] });
                          } else {
                            setCouponForm({ ...couponForm, branch_ids: list.filter(x => x !== br.id) });
                          }
                        }}
                        data-testid={`coupon-branch-${br.id}`}
                      />
                      <label htmlFor={`branch-${br.id}`} className="text-sm cursor-pointer">{br.name}</label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('فعّال من الساعة (اختياري)')}</Label>
                <Input
                  type="time"
                  value={couponForm.daily_start_time || ''}
                  onChange={(e) => setCouponForm({ ...couponForm, daily_start_time: e.target.value })}
                  disabled={!couponForm.daily_start_time && !couponForm.daily_end_time && couponForm._allDay}
                  data-testid="coupon-daily-start"
                />
              </div>
              <div>
                <Label>{t('إلى الساعة')}</Label>
                <Input
                  type="time"
                  value={couponForm.daily_end_time || ''}
                  onChange={(e) => setCouponForm({ ...couponForm, daily_end_time: e.target.value })}
                  disabled={!couponForm.daily_start_time && !couponForm.daily_end_time && couponForm._allDay}
                  data-testid="coupon-daily-end"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 bg-emerald-500/5 p-2 rounded-md border border-emerald-500/20">
              <input
                type="checkbox"
                id="all-day-toggle"
                checked={!couponForm.daily_start_time && !couponForm.daily_end_time}
                onChange={(e) => {
                  if (e.target.checked) {
                    setCouponForm({ ...couponForm, daily_start_time: '', daily_end_time: '' });
                  } else {
                    setCouponForm({ ...couponForm, daily_start_time: '00:00', daily_end_time: '23:59' });
                  }
                }}
                data-testid="coupon-all-day"
                className="h-4 w-4 cursor-pointer"
              />
              <label htmlFor="all-day-toggle" className="text-sm cursor-pointer text-emerald-600 font-medium">
                {t('نشط على مدار اليوم (24 ساعة)')}
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('يبدأ من')}</Label>
                <Input
                  type="date"
                  value={couponForm.valid_from}
                  onChange={(e) => setCouponForm({ ...couponForm, valid_from: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('ينتهي في')}</Label>
                <Input
                  type="date"
                  value={couponForm.valid_until}
                  onChange={(e) => setCouponForm({ ...couponForm, valid_until: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>{t('مستوى الولاء المطلوب')}</Label>
              <Select
                value={couponForm.loyalty_tier_required}
                onValueChange={(v) => setCouponForm({ ...couponForm, loyalty_tier_required: v })}
              >
                <SelectTrigger><SelectValue placeholder={t('للجميع')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('للجميع')}</SelectItem>
                  <SelectItem value="bronze">{t('برونزي فأعلى')}</SelectItem>
                  <SelectItem value="silver">{t('فضي فأعلى')}</SelectItem>
                  <SelectItem value="gold">{t('ذهبي فأعلى')}</SelectItem>
                  <SelectItem value="platinum">{t('بلاتيني فقط')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={couponForm.is_active}
                  onCheckedChange={(v) => setCouponForm({ ...couponForm, is_active: v })}
                />
                <Label>{t('نشط')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={couponForm.first_order_only}
                  onCheckedChange={(v) => setCouponForm({ ...couponForm, first_order_only: v })}
                />
                <Label>{t('للطلب الأول فقط')}</Label>
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setCouponDialogOpen(false)} className="flex-1">
                {t('إلغاء')}
              </Button>
              <Button type="submit" className="flex-1">
                {editingCoupon ? t('تحديث') : t('إنشاء')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Promotion Dialog */}
      <Dialog open={promotionDialogOpen} onOpenChange={setPromotionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingPromotion ? t('تعديل عرض') : t('إنشاء عرض جديد')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePromotion} className="space-y-4">
            <div>
              <Label>{t('اسم العرض *')}</Label>
              <Input
                value={promotionForm.name}
                onChange={(e) => setPromotionForm({ ...promotionForm, name: e.target.value })}
                placeholder={t('اشترِ 2 واحصل على 1 مجاناً')}
                required
              />
            </div>
            <div>
              <Label>{t('الوصف')}</Label>
              <Textarea
                value={promotionForm.description}
                onChange={(e) => setPromotionForm({ ...promotionForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label>{t('نوع العرض')}</Label>
              <Select
                value={promotionForm.promotion_type}
                onValueChange={(v) => setPromotionForm({ ...promotionForm, promotion_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy_x_get_y">{t('اشترِ X واحصل على Y')}</SelectItem>
                  <SelectItem value="happy_hour">{t('ساعة السعادة')}</SelectItem>
                  <SelectItem value="bundle">{t('باقة بسعر ثابت')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {promotionForm.promotion_type === 'buy_x_get_y' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{t('اشترِ')}</Label>
                  <Input
                    type="number"
                    value={promotionForm.buy_quantity}
                    onChange={(e) => setPromotionForm({ ...promotionForm, buy_quantity: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label>{t('احصل على')}</Label>
                  <Input
                    type="number"
                    value={promotionForm.get_quantity}
                    onChange={(e) => setPromotionForm({ ...promotionForm, get_quantity: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label>{t('خصم %')}</Label>
                  <Input
                    type="number"
                    value={promotionForm.discount_percent}
                    onChange={(e) => setPromotionForm({ ...promotionForm, discount_percent: parseFloat(e.target.value) || 100 })}
                  />
                </div>
              </div>
            )}
            {promotionForm.promotion_type === 'happy_hour' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{t('من الساعة')}</Label>
                  <Input
                    type="time"
                    value={promotionForm.start_time}
                    onChange={(e) => setPromotionForm({ ...promotionForm, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('إلى الساعة')}</Label>
                  <Input
                    type="time"
                    value={promotionForm.end_time}
                    onChange={(e) => setPromotionForm({ ...promotionForm, end_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('خصم %')}</Label>
                  <Input
                    type="number"
                    value={promotionForm.discount_percent}
                    onChange={(e) => setPromotionForm({ ...promotionForm, discount_percent: parseFloat(e.target.value) || 10 })}
                  />
                </div>
              </div>
            )}
            {promotionForm.promotion_type === 'bundle' && (
              <div>
                <Label>{t('سعر الباقة')}</Label>
                <Input
                  type="number"
                  value={promotionForm.bundle_price || ''}
                  onChange={(e) => setPromotionForm({ ...promotionForm, bundle_price: parseFloat(e.target.value) || null })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('يبدأ من')}</Label>
                <Input
                  type="date"
                  value={promotionForm.valid_from}
                  onChange={(e) => setPromotionForm({ ...promotionForm, valid_from: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('ينتهي في')}</Label>
                <Input
                  type="date"
                  value={promotionForm.valid_until}
                  onChange={(e) => setPromotionForm({ ...promotionForm, valid_until: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={promotionForm.is_active}
                onCheckedChange={(v) => setPromotionForm({ ...promotionForm, is_active: v })}
              />
              <Label>{t('نشط')}</Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setPromotionDialogOpen(false)} className="flex-1">
                {t('إلغاء')}
              </Button>
              <Button type="submit" className="flex-1">
                {editingPromotion ? t('تحديث') : t('إنشاء')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
