import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Gift,
  Users,
  Trophy,
  Star,
  Settings,
  Plus,
  Search,
  TrendingUp,
  Award,
  Coins,
  ArrowUp,
  ArrowDown,
  Crown,
  Sparkles,
  Phone,
  Mail,
  Calendar,
  History,
  Home
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const API = API_URL;

const TIER_ICONS = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '💎'
};

const TIER_COLORS = {
  bronze: 'bg-amber-700/20 text-amber-600 border-amber-600/30',
  silver: 'bg-gray-400/20 text-gray-400 border-gray-400/30',
  gold: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  platinum: 'bg-purple-400/20 text-purple-400 border-purple-400/30'
};

export default function Loyalty() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  const [memberForm, setMemberForm] = useState({
    customer_id: '',
    customer_name: '',
    phone: '',
    email: '',
    birthday: '',
    referred_by: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [membersRes, settingsRes] = await Promise.all([
        axios.get(`${API}/loyalty/members`, { headers }),
        axios.get(`${API}/loyalty/settings`, { headers })
      ]);
      
      setMembers(membersRes.data);
      setSettings(settingsRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    
    if (!memberForm.customer_name || !memberForm.phone) {
      toast.error('الاسم ورقم الهاتف مطلوبان');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/loyalty/members`, {
        ...memberForm,
        customer_id: memberForm.customer_id || `cust_${Date.now()}`
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('تم إضافة العضو بنجاح');
      setAddMemberOpen(false);
      setMemberForm({ customer_id: '', customer_name: '', phone: '', email: '', birthday: '', referred_by: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل في إضافة العضو');
    }
  };

  const handleSaveSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/loyalty/settings`, settings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('تم حفظ الإعدادات');
      setSettingsOpen(false);
    } catch (error) {
      toast.error('فشل في حفظ الإعدادات');
    }
  };

  const viewMemberDetails = async (member) => {
    try {
      const token = localStorage.getItem('token');
      const transRes = await axios.get(`${API}/loyalty/transactions/${member.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedMember({ ...member, transactions: transRes.data });
    } catch (error) {
      setSelectedMember({ ...member, transactions: [] });
    }
  };

  const filteredMembers = members.filter(m => 
    m.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.phone?.includes(searchTerm)
  );

  const stats = {
    totalMembers: members.length,
    totalPoints: members.reduce((sum, m) => sum + (m.total_points || 0), 0),
    avgPoints: members.length > 0 ? Math.round(members.reduce((sum, m) => sum + (m.total_points || 0), 0) / members.length) : 0,
    goldMembers: members.filter(m => m.current_tier === 'gold' || m.current_tier === 'platinum').length
  };

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
              <Gift className="h-6 w-6 text-primary" />
              برنامج الولاء
            </h1>
            <p className="text-sm text-muted-foreground">إدارة العملاء والمكافآت</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4 ml-2" />
            الإعدادات
          </Button>
          <Button onClick={() => setAddMemberOpen(true)}>
            <Plus className="h-4 w-4 ml-2" />
            عضو جديد
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الأعضاء</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                <Coins className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي النقاط</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalPoints.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">متوسط النقاط</p>
                <p className="text-2xl font-bold text-foreground">{stats.avgPoints}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <Crown className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">أعضاء مميزين</p>
                <p className="text-2xl font-bold text-foreground">{stats.goldMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tiers Display */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {settings?.tiers?.map((tier) => (
          <Card key={tier.name_en} className="border-border/50">
            <CardContent className="p-3 text-center">
              <span className="text-2xl">{TIER_ICONS[tier.name_en?.toLowerCase()]}</span>
              <p className="font-bold text-foreground mt-1">{tier.name}</p>
              <p className="text-xs text-muted-foreground">{tier.min_points}+ نقطة</p>
              <Badge className="mt-2" variant="outline">{tier.discount_percent}% خصم</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث عن عضو..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMembers.map((member) => (
          <Card 
            key={member.id} 
            className="border-border/50 hover:shadow-lg transition-all cursor-pointer"
            onClick={() => viewMemberDetails(member)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl
                    ${TIER_COLORS[member.current_tier] || 'bg-gray-500/20'}`}>
                    {TIER_ICONS[member.current_tier] || '🎖️'}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{member.customer_name}</h3>
                    <p className="text-xs text-muted-foreground">{member.phone}</p>
                  </div>
                </div>
                <Badge className={TIER_COLORS[member.current_tier]}>
                  {member.current_tier}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <p className="text-muted-foreground text-xs">النقاط المتاحة</p>
                  <p className="font-bold text-primary text-lg">{member.available_points || 0}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <p className="text-muted-foreground text-xs">الطلبات</p>
                  <p className="font-bold text-foreground text-lg">{member.total_orders || 0}</p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                <span>إجمالي الإنفاق: {(member.lifetime_spending || 0).toLocaleString()} د.ع</span>
                <span>كود الإحالة: {member.referral_code}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Plus className="h-5 w-5 text-primary" />
              إضافة عضو جديد
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddMember} className="space-y-4">
            <div>
              <Label>اسم العميل *</Label>
              <Input
                value={memberForm.customer_name}
                onChange={(e) => setMemberForm({ ...memberForm, customer_name: e.target.value })}
                placeholder="اسم العميل"
                required
              />
            </div>

            <div>
              <Label>رقم الهاتف *</Label>
              <Input
                value={memberForm.phone}
                onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                placeholder="07xxxxxxxxx"
                dir="ltr"
                required
              />
            </div>

            <div>
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={memberForm.email}
                onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                placeholder="email@example.com"
                dir="ltr"
              />
            </div>

            <div>
              <Label>تاريخ الميلاد</Label>
              <Input
                type="date"
                value={memberForm.birthday}
                onChange={(e) => setMemberForm({ ...memberForm, birthday: e.target.value })}
              />
            </div>

            <div>
              <Label>كود الإحالة (اختياري)</Label>
              <Input
                value={memberForm.referred_by}
                onChange={(e) => setMemberForm({ ...memberForm, referred_by: e.target.value.toUpperCase() })}
                placeholder="XXXXXXXX"
                dir="ltr"
                maxLength={8}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setAddMemberOpen(false)} className="flex-1">
                إلغاء
              </Button>
              <Button type="submit" className="flex-1">
                إضافة العضو
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Member Details Dialog */}
      <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Award className="h-5 w-5 text-primary" />
              تفاصيل العضو
            </DialogTitle>
          </DialogHeader>

          {selectedMember && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl
                  ${TIER_COLORS[selectedMember.current_tier]}`}>
                  {TIER_ICONS[selectedMember.current_tier]}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">{selectedMember.customer_name}</h3>
                  <p className="text-muted-foreground">{selectedMember.phone}</p>
                  <Badge className={TIER_COLORS[selectedMember.current_tier]}>
                    {selectedMember.current_tier}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <Coins className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">متاح</p>
                  <p className="text-xl font-bold text-primary">{selectedMember.available_points}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <Star className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">إجمالي</p>
                  <p className="text-xl font-bold text-foreground">{selectedMember.total_points}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <Gift className="h-5 w-5 text-green-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">مستبدل</p>
                  <p className="text-xl font-bold text-foreground">{selectedMember.redeemed_points}</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  سجل المعاملات
                </h4>
                <ScrollArea className="h-[200px]">
                  {selectedMember.transactions?.length > 0 ? (
                    <div className="space-y-2">
                      {selectedMember.transactions.map((trans) => (
                        <div key={trans.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            {trans.points > 0 ? (
                              <ArrowUp className="h-4 w-4 text-green-500" />
                            ) : (
                              <ArrowDown className="h-4 w-4 text-red-500" />
                            )}
                            <div>
                              <p className="text-sm text-foreground">{trans.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(trans.created_at).toLocaleDateString('ar-IQ')}
                              </p>
                            </div>
                          </div>
                          <span className={`font-bold ${trans.points > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {trans.points > 0 ? '+' : ''}{trans.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">لا توجد معاملات</p>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Settings className="h-5 w-5 text-primary" />
              إعدادات برنامج الولاء
            </DialogTitle>
          </DialogHeader>

          {settings && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>نقاط لكل دينار</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.points_per_currency}
                    onChange={(e) => setSettings({ ...settings, points_per_currency: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>قيمة النقطة (دينار)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={settings.currency_per_point}
                    onChange={(e) => setSettings({ ...settings, currency_per_point: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>الحد الأدنى للاستبدال</Label>
                  <Input
                    type="number"
                    value={settings.min_redeem_points}
                    onChange={(e) => setSettings({ ...settings, min_redeem_points: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>أقصى نسبة خصم %</Label>
                  <Input
                    type="number"
                    value={settings.max_redeem_percent}
                    onChange={(e) => setSettings({ ...settings, max_redeem_percent: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>نقاط الترحيب</Label>
                  <Input
                    type="number"
                    value={settings.welcome_bonus}
                    onChange={(e) => setSettings({ ...settings, welcome_bonus: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>نقاط عيد الميلاد</Label>
                  <Input
                    type="number"
                    value={settings.birthday_bonus}
                    onChange={(e) => setSettings({ ...settings, birthday_bonus: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>نقاط الإحالة</Label>
                  <Input
                    type="number"
                    value={settings.referral_bonus}
                    onChange={(e) => setSettings({ ...settings, referral_bonus: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <Button onClick={handleSaveSettings} className="w-full">
                حفظ الإعدادات
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
