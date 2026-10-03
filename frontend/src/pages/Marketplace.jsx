import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { API_URL } from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Truck, Plus, Store, Percent, ArrowLeft, TrendingUp } from 'lucide-react';

export default function Marketplace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [partners, setPartners] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', address: '', category: '',
    commission_rate: 15, contact_person: '',
  });

  const load = () => {
    if (!projectId) return;
    axios.get(`${API_URL}/enterprise/marketplace/partners?project_id=${projectId}`)
      .then(r => setPartners(r.data || []))
      .catch(e => toast.error(e.response?.data?.detail || 'فشل التحميل'));
    axios.get(`${API_URL}/enterprise/marketplace/summary?project_id=${projectId}`)
      .then(r => setSummary(r.data))
      .catch(() => {});
  };
  useEffect(load, [projectId]);

  const handleAdd = async () => {
    if (!form.name || !form.phone) { toast.error('الاسم والهاتف مطلوبان'); return; }
    try {
      await axios.post(`${API_URL}/enterprise/marketplace/partners?project_id=${projectId}`, form);
      toast.success('تم إضافة التاجر الشريك');
      setDialogOpen(false);
      setForm({ name: '', phone: '', address: '', category: '', commission_rate: 15, contact_person: '' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإضافة');
    }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl" data-testid="marketplace-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} data-testid="marketplace-back-btn">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            Marketplace - التجار الشركاء
          </h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="add-partner-btn">
              <Plus className="h-4 w-4" />
              تاجر شريك جديد
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>إضافة تاجر شريك</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>اسم المتجر *</Label>
                <Input data-testid="partner-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div>
                <Label>الهاتف *</Label>
                <Input data-testid="partner-phone-input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              <div>
                <Label>العنوان</Label>
                <Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
              </div>
              <div>
                <Label>التصنيف</Label>
                <Input placeholder="مطاعم / بقالة / صيدلية..." value={form.category} onChange={e => setForm({...form, category: e.target.value})} />
              </div>
              <div>
                <Label>نسبة العمولة % *</Label>
                <Input data-testid="partner-commission-input" type="number" value={form.commission_rate} onChange={e => setForm({...form, commission_rate: Number(e.target.value)})} />
              </div>
              <div>
                <Label>الشخص المسؤول</Label>
                <Input value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button data-testid="save-partner-btn" onClick={handleAdd}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4">
          <Card><CardContent className="pt-4 flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">تجار شركاء</p>
              <p className="text-2xl font-bold">{summary.partners_count}</p>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">أعلى شريك</p>
              <p className="text-base font-bold">{summary.top_partners[0]?.name || '-'}</p>
            </div>
          </CardContent></Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {partners.length === 0 && (
          <p className="text-muted-foreground col-span-3 text-center py-8">لا يوجد تجار شركاء بعد</p>
        )}
        {partners.map(p => (
          <Card key={p.id} data-testid={`partner-card-${p.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <Badge variant="outline" className="gap-1">
                  <Percent className="h-3 w-3" />
                  {p.commission_rate}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="text-xs space-y-1 text-muted-foreground">
              <div>الهاتف: {p.phone}</div>
              {p.category && <div>التصنيف: {p.category}</div>}
              {p.address && <div>العنوان: {p.address}</div>}
              <div className="pt-2 border-t flex justify-between">
                <span>طلبات: {p.total_orders || 0}</span>
                <span>عمولات: {Number(p.total_commission || 0).toLocaleString()} IQD</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
