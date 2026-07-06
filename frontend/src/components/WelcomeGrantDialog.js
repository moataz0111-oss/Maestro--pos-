import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Gift, Loader2, Store } from 'lucide-react';
import { toast } from 'sonner';
import { showApiError } from '../utils/apiError';

const API = API_URL;

export default function WelcomeGrantDialog({ open, customer, onClose, onGranted }) {
  const { t } = useTranslation();
  const [branches, setBranches] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    usage_limit: 1,
    discount_type: 'percentage',
    discount_value: 10,
    min_order_amount: 0,
    valid_days: 7,
    branch_ids: []
  });

  useEffect(() => {
    if (!open) return;
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/welcome-discount/config`, { headers })
      .then(res => {
        const cfg = res.data || {};
        setForm(f => ({
          ...f,
          discount_type: cfg.discount_type || 'percentage',
          discount_value: cfg.discount_value ?? 10,
          min_order_amount: cfg.min_order_amount ?? 0,
          valid_days: cfg.valid_days ?? 7,
          usage_limit: 1,
          branch_ids: []
        }));
      }).catch(() => {});
    axios.get(`${API}/branches`, { headers })
      .then(res => setBranches(res.data || []))
      .catch(() => setBranches([]));
  }, [open]);

  const toggleBranch = (id) => {
    setForm(f => ({
      ...f,
      branch_ids: f.branch_ids.includes(id) ? f.branch_ids.filter(b => b !== id) : [...f.branch_ids, id]
    }));
  };

  const handleGrant = async () => {
    if (!customer) return;
    if (!form.usage_limit || Number(form.usage_limit) < 1) {
      toast.error(t('أدخل عدد مرات الاستخدام (1 على الأقل)'));
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/customers/${customer.id}/grant-welcome-discount`, {
        usage_limit: Number(form.usage_limit),
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_order_amount: Number(form.min_order_amount) || 0,
        valid_days: Number(form.valid_days) || 7,
        branch_ids: form.branch_ids
      }, { headers: { Authorization: `Bearer ${token}` } });
      const d = res.data || {};
      toast.success(`${d.message || t('تم منح الكوبون')} — ${d.coupon_code || ''}`);
      if (onGranted) onGranted(d);
    } catch (error) {
      showApiError(error, t('فشل منح خصم الترحيب'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && onClose) onClose(); }}>
      <DialogContent className="max-w-md" dir="rtl" data-testid="welcome-grant-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-green-600" />
            {t('منح كوبون ترحيبي باسم الزبون')}
          </DialogTitle>
        </DialogHeader>
        {customer && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/40 text-sm">
              <p className="font-bold" data-testid="welcome-grant-customer-name">{customer.name}</p>
              <p className="text-muted-foreground" dir="ltr">{customer.phone}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t('عدد مرات الاستخدام')} *</Label>
                <Input type="number" min="1" value={form.usage_limit}
                  onChange={e => setForm({ ...form, usage_limit: e.target.value })}
                  data-testid="welcome-usage-limit-input" />
              </div>
              <div>
                <Label className="text-xs">{t('صالح لمدة (أيام)')}</Label>
                <Input type="number" min="1" value={form.valid_days}
                  onChange={e => setForm({ ...form, valid_days: e.target.value })}
                  data-testid="welcome-valid-days-input" />
              </div>
              <div>
                <Label className="text-xs">{t('نوع الخصم')}</Label>
                <Select value={form.discount_type} onValueChange={v => setForm({ ...form, discount_type: v })}>
                  <SelectTrigger data-testid="welcome-discount-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{t('نسبة مئوية %')}</SelectItem>
                    <SelectItem value="fixed">{t('مبلغ ثابت (د.ع)')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t('قيمة الخصم')}</Label>
                <Input type="number" min="0" value={form.discount_value}
                  onChange={e => setForm({ ...form, discount_value: e.target.value })}
                  data-testid="welcome-discount-value-input" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">{t('الحد الأدنى للطلب (د.ع)')}</Label>
                <Input type="number" min="0" value={form.min_order_amount}
                  onChange={e => setForm({ ...form, min_order_amount: e.target.value })}
                  data-testid="welcome-min-order-input" />
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-1 mb-2 text-xs">
                <Store className="h-4 w-4" /> {t('الفروع المسموح الطلب منها بهذا الكوبون')}
              </Label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto border rounded-lg p-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('لا توجد فروع')}</p>
                ) : branches.map(b => (
                  <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1.5 py-1">
                    <input type="checkbox" checked={form.branch_ids.includes(b.id)}
                      onChange={() => toggleBranch(b.id)}
                      data-testid={`welcome-branch-${b.id}`} />
                    <span>{b.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {form.branch_ids.length === 0
                  ? t('لم تحدد فروعاً — الكوبون صالح في جميع الفروع')
                  : `${t('الكوبون صالح في')} ${form.branch_ids.length} ${t('فرع')}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGrant} disabled={submitting}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                data-testid="welcome-grant-confirm-btn">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Gift className="h-4 w-4 ml-2" />}
                {t('موافقة وإرسال الكوبون واتساب')}
              </Button>
              <Button variant="outline" onClick={onClose} disabled={submitting} data-testid="welcome-grant-cancel-btn">
                {t('إلغاء')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
