import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  ArrowRight, RefreshCw, ShoppingBag, Wallet, TrendingUp, TrendingDown,
  Banknote, FileText, Package, ChevronLeft, Image as ImageIcon, Trash2, Building2, Printer,
} from 'lucide-react';
import { API_URL, BACKEND_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';

const API = API_URL;

const PAY_STATUS = {
  unpaid: { label: 'غير مدفوع', cls: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-400/50' },
  partial: { label: 'مدفوع جزئياً', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/50' },
  paid: { label: 'مدفوع بالكامل', cls: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-400/50' },
};

const METHOD_LABELS = {
  cash: 'نقدي', card: 'بطاقة', bank_withdrawal: 'سحب بنكي', zain_cash: 'زين كاش',
  credit: 'آجل', transfer: 'تحويل',
};

const todayStr = () => new Date().toISOString().split('T')[0];
const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; };
const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n || 0));
const imgUrl = (u) => {
  if (!u) return null;
  if (u.startsWith('http')) return u;
  // توافق خلفي: الصور القديمة محفوظة بمسار /uploads/ بلا بادئة /api فلا تصل عبر الـ ingress
  const path = u.startsWith('/api/') ? u : (u.startsWith('/uploads/') ? `/api${u}` : u);
  return `${BACKEND_URL}${path}`;
};

export default function ExternalPurchasesReport() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const cur = lang === 'en' ? 'IQD' : 'د.ع';

  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(todayStr());
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [data, setData] = useState({ summary: {}, suppliers: [], invoices: [] });
  const [tab, setTab] = useState('invoices');
  const [detail, setDetail] = useState(null); // فاتورة مفتوحة
  const [payDialog, setPayDialog] = useState(null); // فاتورة للسداد
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [paying, setPaying] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { start, end };
      if (supplierFilter !== 'all') params.supplier_id = supplierFilter;
      const res = await axios.get(`${API}/purchases-report`, { headers, params });
      setData(res.data);
    } catch (e) {
      toast.error(t('فشل جلب التقرير'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, supplierFilter]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const summary = data.summary || {};

  const openPay = (inv) => {
    setPayDialog(inv);
    setPayAmount(String(Math.round(inv.remaining_amount || 0)));
    setPayMethod('cash');
  };

  const submitPay = async () => {
    if (!payDialog) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { toast.error(t('أدخل مبلغاً صحيحاً')); return; }
    setPaying(true);
    try {
      const res = await axios.post(`${API}/purchases-new/${payDialog.id}/pay`, { amount: amt, payment_method: payMethod }, { headers });
      toast.success(`${t('تم التسديد')}: ${fmt(amt)} ${cur} — ${t('المتبقي')}: ${fmt(res.data.remaining_amount)}`);
      setPayDialog(null);
      setDetail(null);
      fetchReport();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('فشل التسديد'));
    } finally {
      setPaying(false);
    }
  };

  const deletePayment = async (invId, paymentId) => {
    if (!window.confirm(t('إلغاء هذه الدفعة وإعادة المبلغ للخزينة؟'))) return;
    try {
      await axios.delete(`${API}/purchases-new/${invId}/payments/${paymentId}`, { headers });
      toast.success(t('تم إلغاء الدفعة'));
      setDetail(null);
      fetchReport();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('فشل الإلغاء'));
    }
  };

  // ===== طباعة A4 =====
  const STATUS_AR = { unpaid: 'غير مدفوع', partial: 'مدفوع جزئياً', paid: 'مدفوع بالكامل' };

  const printHtml = (title, inner) => {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) { toast.error(t('فشل فتح نافذة الطباعة')); return; }
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
      <title>${title}</title>
      <style>
        *{box-sizing:border-box;} body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:26px;color:#1a1a1a;}
        .head{text-align:center;border-bottom:3px solid #2563eb;padding-bottom:12px;margin-bottom:18px;}
        .logo{font-size:25px;font-weight:800;color:#2563eb;letter-spacing:1px;}
        .ttl{font-size:21px;font-weight:800;margin-top:6px;}
        .sub{font-size:12px;color:#555;margin-top:3px;}
        .info{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:14px 0;font-size:13px;}
        .info span{color:#64748b;}
        table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px;}
        th,td{border:1px solid #e2e8f0;padding:8px 9px;} th{background:#eff6ff;}
        td.r,th.r{text-align:right;} td.c{text-align:center;}
        tfoot td{font-weight:800;background:#eff6ff;}
        .sum{display:flex;gap:10px;margin-top:14px;}
        .sum div{flex:1;text-align:center;border-radius:10px;padding:10px;}
        .sum .a{background:#eff6ff;color:#2563eb;} .sum .b{background:#f0fdf4;color:#16a34a;} .sum .c{background:#fef2f2;color:#dc2626;}
        .sum b{display:block;font-size:17px;margin-top:3px;}
        .badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;}
        .sign{display:flex;justify-content:space-between;margin-top:40px;font-size:13px;}
        .sign div{text-align:center;width:40%;} .sign .ln{border-top:1px solid #333;margin-top:34px;padding-top:6px;}
        .foot{margin-top:22px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;}
        @media print{body{margin:12px;} th,tfoot td,.sum div,.logo{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style></head><body>
      <div class="head"><div class="logo">Maestro EGP</div><div class="ttl">${title}</div>
      <div class="sub">${t('نظام إدارة المشتريات والمخازن')} • ${new Date().toLocaleString('en-GB')}</div></div>
      ${inner}
      <div class="foot">${t('تم إنشاء هذا المستند آلياً من نظام Maestro EGP')}</div>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  };

  // طباعة فاتورة مفردة A4
  const printInvoiceA4 = (inv) => {
    const rows = (inv.items || []).map((it, i) => `
      <tr><td class="c">${i + 1}</td><td class="r">${it.name}</td>
      <td class="c">${it.quantity} ${it.unit || ''}</td><td class="c">${fmt(it.cost_per_unit)}</td>
      <td class="c">${fmt(it.total_cost || (it.quantity * it.cost_per_unit))}</td></tr>`).join('');
    const inner = `
      <div class="info">
        <div><span>${t('المورد')}:</span> <b>${inv.supplier_name}</b></div>
        <div><span>${t('رقم الفاتورة')}:</span> <b>#${inv.purchase_number}</b></div>
        <div><span>${t('رقم فاتورة المورد')}:</span> <b>${inv.invoice_number || '-'}</b></div>
        <div><span>${t('التاريخ')}:</span> <b>${(inv.created_at || '').slice(0, 10)}</b></div>
        <div><span>${t('مسؤول المشتريات')}:</span> <b>${inv.created_by}</b></div>
        <div><span>${t('حالة الدفع')}:</span> <b>${t(STATUS_AR[inv.pay_status] || '-')}</b></div>
      </div>
      <table><thead><tr><th>#</th><th class="r">${t('المادة')}</th><th>${t('الكمية')}</th><th>${t('سعر الوحدة')}</th><th>${t('الإجمالي')}</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4" class="r">${t('إجمالي الفاتورة')}</td><td class="c">${fmt(inv.total_amount)} ${cur}</td></tr></tfoot>
      </table>
      <div class="sum">
        <div class="a">${t('الإجمالي')}<b>${fmt(inv.total_amount)}</b></div>
        <div class="b">${t('المسدّد')}<b>${fmt(inv.paid_amount)}</b></div>
        <div class="c">${t('المتبقي')}<b>${fmt(inv.remaining_amount)}</b></div>
      </div>
      <div class="sign"><div><div class="ln">${t('توقيع المستلم')}</div></div><div><div class="ln">${t('توقيع المورد')}</div></div></div>`;
    printHtml(`${t('فاتورة شراء')} #${inv.purchase_number}`, inner);
  };

  // طباعة كشف حساب مورد A4
  const printSupplierStatementA4 = (sup) => {
    const sid = sup.supplier_id;
    const invs = data.invoices.filter((i) => (sid ? i.supplier_id === sid : i.supplier_name === sup.supplier_name));
    const rows = invs.map((i) => `
      <tr><td class="c">#${i.purchase_number}</td><td class="c">${(i.created_at || '').slice(0, 10)}</td>
      <td class="c">${i.items_count}</td><td class="c">${fmt(i.total_amount)}</td>
      <td class="c">${fmt(i.paid_amount)}</td><td class="c">${fmt(i.remaining_amount)}</td>
      <td class="c">${t(STATUS_AR[i.pay_status] || '-')}</td></tr>`).join('');
    const inner = `
      <div class="info">
        <div><span>${t('المورد')}:</span> <b>${sup.supplier_name}</b></div>
        <div><span>${t('الهاتف')}:</span> <b>${sup.phone || '-'}</b></div>
        <div><span>${t('عدد الفواتير')}:</span> <b>${sup.invoice_count}</b></div>
        <div><span>${t('الفترة')}:</span> <b>${start} ← ${end}</b></div>
      </div>
      <table><thead><tr><th>${t('الفاتورة')}</th><th>${t('التاريخ')}</th><th>${t('الأصناف')}</th><th>${t('الإجمالي')}</th><th>${t('المسدّد')}</th><th>${t('المتبقي')}</th><th>${t('الحالة')}</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3" class="r">${t('الإجمالي')}</td><td class="c">${fmt(sup.total_amount)}</td><td class="c">${fmt(sup.total_paid)}</td><td class="c">${fmt(sup.total_remaining)}</td><td></td></tr></tfoot>
      </table>
      <div class="sum">
        <div class="a">${t('إجمالي المشتريات (مدين)')}<b>${fmt(sup.total_amount)} ${cur}</b></div>
        <div class="b">${t('المسدّد (دائن)')}<b>${fmt(sup.total_paid)} ${cur}</b></div>
        <div class="c">${t('الرصيد المتبقي')}<b>${fmt(sup.total_remaining)} ${cur}</b></div>
      </div>
      <div class="sign"><div><div class="ln">${t('توقيع المحاسب')}</div></div><div><div class="ln">${t('توقيع المورد')}</div></div></div>`;
    printHtml(`${t('كشف حساب المورد')} - ${sup.supplier_name}`, inner);
  };


  const SUMMARY_COLORS = {
    blue: { text: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-500/15' },
    green: { text: 'text-green-700 dark:text-green-300', bg: 'bg-green-500/15' },
    red: { text: 'text-red-700 dark:text-red-300', bg: 'bg-red-500/15' },
    amber: { text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/15' },
  };

  const SummaryCard = ({ label, value, icon: Icon, tone, sub }) => {
    const c = SUMMARY_COLORS[tone] || SUMMARY_COLORS.blue;
    return (
      <Card className="p-4 flex items-center justify-between" data-testid={`pr-summary-${label}`}>
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className={`text-xl font-extrabold mt-1 ${c.text}`}>{fmt(value)} <span className="text-sm font-normal">{cur}</span></p>
          {sub ? <p className="text-[11px] text-muted-foreground mt-1">{sub}</p> : null}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.bg}`}>
          <Icon className={`h-5 w-5 ${c.text}`} />
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/40 dark:from-[#070E22] dark:to-[#070E22] text-foreground" dir="rtl">
      <Toaster position="top-center" richColors />

      {/* الترويسة */}
      <header className="bg-gradient-to-l from-blue-600 to-blue-700 text-white shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} data-testid="pr-back-btn" className="p-2 rounded-lg hover:bg-white/15 transition-colors">
              <ArrowRight className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-extrabold flex items-center gap-2">
                <ShoppingBag className="h-6 w-6" /> {t('تقرير المشتريات الخارجية')}
              </h1>
              <p className="text-xs text-white/80">{t('فواتير الموردين والمخازن والسداد من الخزينة')}</p>
            </div>
          </div>
          <button onClick={fetchReport} data-testid="pr-refresh-btn" className="p-2 rounded-lg hover:bg-white/15 transition-colors">
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">
        {/* الفلاتر */}
        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t('من تاريخ')}</label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="pr-start-date" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('إلى تاريخ')}</label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="pr-end-date" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('المورد')}</label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger data-testid="pr-supplier-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('جميع الموردين')}</SelectItem>
                  {data.suppliers.filter(s => s.supplier_id).map((s) => (
                    <SelectItem key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* البطاقات الإجمالية */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label={t('إجمالي المشتريات (مدين)')} value={summary.total_amount} icon={TrendingDown} tone="blue" sub={`${summary.invoice_count || 0} ${t('فاتورة')}`} />
          <SummaryCard label={t('المسدّد (دائن)')} value={summary.total_paid} icon={TrendingUp} tone="green" />
          <SummaryCard label={t('المتبقي على الموردين')} value={summary.total_remaining} icon={Banknote} tone="red" />
          <SummaryCard label={t('رصيد الخزينة')} value={summary.treasury_balance} icon={Wallet} tone="amber" sub={t('إجمالي كل الفروع')} />
        </div>

        {/* التبويبات */}
        <div className="flex gap-2">
          <Button variant={tab === 'invoices' ? 'default' : 'outline'} onClick={() => setTab('invoices')} data-testid="pr-tab-invoices">
            <FileText className="h-4 w-4 ml-1" /> {t('الفواتير')} ({data.invoices.length})
          </Button>
          <Button variant={tab === 'suppliers' ? 'default' : 'outline'} onClick={() => setTab('suppliers')} data-testid="pr-tab-suppliers">
            <Building2 className="h-4 w-4 ml-1" /> {t('الموردون')} ({data.suppliers.length})
          </Button>
        </div>

        {/* الفواتير */}
        {tab === 'invoices' && (
          <div className="space-y-3">
            {data.invoices.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">{t('لا توجد فواتير في هذه الفترة')}</Card>
            ) : data.invoices.map((inv) => {
              const st = PAY_STATUS[inv.pay_status] || PAY_STATUS.unpaid;
              return (
                <Card key={inv.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetail(inv)} data-testid={`pr-invoice-${inv.id}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-base">{t('فاتورة')} #{inv.purchase_number}</span>
                        <Badge variant="outline" className={st.cls} data-testid={`pr-status-${inv.id}`}>{t(st.label)}</Badge>
                        {inv.sent_to_warehouse_at && <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-300">{t('محوّلة للمخزن')}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" /> {inv.supplier_name}
                        <span className="mx-1">•</span> {t('بواسطة')}: {inv.created_by}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(inv.created_at || '').slice(0, 10)} • {inv.items_count} {t('صنف')} • {t('طريقة')}: {t(METHOD_LABELS[inv.payment_method] || inv.payment_method || '-')}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-extrabold text-blue-700 dark:text-blue-300">{fmt(inv.total_amount)} <span className="text-xs">{cur}</span></p>
                      {inv.remaining_amount > 0 ? (
                        <p className="text-xs text-red-600 dark:text-red-300">{t('المتبقي')}: {fmt(inv.remaining_amount)}</p>
                      ) : (
                        <p className="text-xs text-green-600 dark:text-green-300">{t('مسدّدة بالكامل')}</p>
                      )}
                      <div className="flex items-center gap-1 justify-end mt-1 text-muted-foreground">
                        <ChevronLeft className="h-4 w-4" /><span className="text-[11px]">{t('التفاصيل')}</span>
                      </div>
                    </div>
                  </div>
                  {inv.remaining_amount > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={(e) => { e.stopPropagation(); openPay(inv); }} data-testid={`pr-pay-btn-${inv.id}`}>
                        <Banknote className="h-4 w-4 ml-1" /> {t('تسديد للمورد')}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* الموردون */}
        {tab === 'suppliers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.suppliers.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground col-span-full">{t('لا يوجد موردون')}</Card>
            ) : data.suppliers.map((s, i) => (
              <Card key={s.supplier_id || i} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => { if (s.supplier_id) { setSupplierFilter(s.supplier_id); setTab('invoices'); } }} data-testid={`pr-supplier-${s.supplier_id || i}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-extrabold text-base flex items-center gap-1"><Building2 className="h-4 w-4 text-blue-700 dark:text-blue-300" /> {s.supplier_name}</p>
                    {s.phone ? <p className="text-xs text-muted-foreground mt-0.5">{s.phone}</p> : null}
                    {s.supplies ? <p className="text-xs text-muted-foreground">{t('يورّد')}: {s.supplies}</p> : null}
                  </div>
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300">{s.invoice_count} {t('فاتورة')}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-blue-500/10 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">{t('الإجمالي')}</p><p className="font-bold text-blue-700 dark:text-blue-300 text-sm">{fmt(s.total_amount)}</p></div>
                  <div className="bg-green-500/10 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">{t('المسدّد')}</p><p className="font-bold text-green-700 dark:text-green-300 text-sm">{fmt(s.total_paid)}</p></div>
                  <div className="bg-red-500/10 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">{t('المتبقي')}</p><p className="font-bold text-red-700 dark:text-red-300 text-sm">{fmt(s.total_remaining)}</p></div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {t('إجمالي الكميات المستلمة')}: {fmt(s.total_quantity)}</p>
                <Button size="sm" variant="outline" className="mt-3 w-full border-blue-500/60 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10" onClick={(e) => { e.stopPropagation(); printSupplierStatementA4(s); }} data-testid={`pr-print-statement-${s.supplier_id || i}`}>
                  <Printer className="h-4 w-4 ml-1" /> {t('كشف حساب A4')}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* نافذة تفاصيل الفاتورة */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" dir="rtl" data-testid="pr-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {t('فاتورة')} #{detail.purchase_number}
                  <Badge variant="outline" className={(PAY_STATUS[detail.pay_status] || PAY_STATUS.unpaid).cls}>{t((PAY_STATUS[detail.pay_status] || PAY_STATUS.unpaid).label)}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 bg-muted/40 rounded-lg p-3">
                  <p><span className="text-muted-foreground">{t('المورد')}:</span> <b>{detail.supplier_name}</b></p>
                  <p><span className="text-muted-foreground">{t('مسؤول المشتريات')}:</span> <b>{detail.created_by}</b></p>
                  <p><span className="text-muted-foreground">{t('التاريخ')}:</span> <b>{(detail.created_at || '').slice(0, 10)}</b></p>
                  <p><span className="text-muted-foreground">{t('رقم فاتورة المورد')}:</span> <b>{detail.invoice_number || '-'}</b></p>
                </div>

                {/* المواد */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted"><tr>
                      <th className="p-2 text-right">{t('المادة')}</th><th className="p-2">{t('الكمية')}</th>
                      <th className="p-2">{t('سعر الوحدة')}</th><th className="p-2">{t('الإجمالي')}</th>
                    </tr></thead>
                    <tbody>
                      {(detail.items || []).map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 text-right font-medium">{it.name}</td>
                          <td className="p-2 text-center">{it.quantity} {it.unit || ''}</td>
                          <td className="p-2 text-center">{fmt(it.cost_per_unit)}</td>
                          <td className="p-2 text-center font-bold">{fmt(it.total_cost || (it.quantity * it.cost_per_unit))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="bg-blue-500/10 font-extrabold"><td className="p-2 text-right" colSpan={3}>{t('إجمالي الفاتورة')}</td><td className="p-2 text-center text-blue-700 dark:text-blue-300">{fmt(detail.total_amount)} {cur}</td></tr></tfoot>
                  </table>
                </div>

                {/* حالة السداد */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-500/10 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">{t('الإجمالي')}</p><p className="font-bold text-blue-700 dark:text-blue-300">{fmt(detail.total_amount)}</p></div>
                  <div className="bg-green-500/10 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">{t('المسدّد')}</p><p className="font-bold text-green-700 dark:text-green-300">{fmt(detail.paid_amount)}</p></div>
                  <div className="bg-red-500/10 rounded-lg p-2"><p className="text-[10px] text-muted-foreground">{t('المتبقي')}</p><p className="font-bold text-red-700 dark:text-red-300">{fmt(detail.remaining_amount)}</p></div>
                </div>

                {/* سجل الدفعات */}
                {(detail.payments || []).length > 0 && (
                  <div className="space-y-1">
                    <p className="font-bold text-xs">{t('سجل الدفعات')}:</p>
                    {detail.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-2 text-xs">
                        <span>{fmt(p.amount)} {cur} • {t(METHOD_LABELS[p.payment_method] || p.payment_method)} • {(p.date || '').slice(0, 10)} • {p.paid_by}</span>
                        <button onClick={() => deletePayment(detail.id, p.id)} className="text-red-500 hover:text-red-700" data-testid={`pr-del-payment-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* صورة الفاتورة */}
                {imgUrl(detail.invoice_image_url) ? (
                  <a href={imgUrl(detail.invoice_image_url)} target="_blank" rel="noreferrer" className="block">
                    <img src={imgUrl(detail.invoice_image_url)} alt="invoice" className="w-full rounded-lg border max-h-72 object-contain bg-white" />
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><ImageIcon className="h-4 w-4" /> {t('لا توجد صورة للفاتورة')}</p>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" className="border-blue-500/60 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 w-full sm:w-auto" onClick={() => printInvoiceA4(detail)} data-testid="pr-print-invoice-btn">
                  <Printer className="h-4 w-4 ml-1" /> {t('طباعة الفاتورة A4')}
                </Button>
                {detail.remaining_amount > 0 && (
                  <Button className="bg-green-600 hover:bg-green-700 w-full sm:flex-1" onClick={() => openPay(detail)} data-testid="pr-detail-pay-btn">
                    <Banknote className="h-4 w-4 ml-1" /> {t('تسديد للمورد')} ({fmt(detail.remaining_amount)} {cur})
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* نافذة التسديد */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="max-w-md" dir="rtl" data-testid="pr-pay-dialog">
          {payDialog && (
            <>
              <DialogHeader><DialogTitle>{t('تسديد فاتورة')} #{payDialog.purchase_number}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm">
                  <p>{t('المورد')}: <b>{payDialog.supplier_name}</b></p>
                  <p>{t('المتبقي')}: <b className="text-red-700 dark:text-red-300">{fmt(payDialog.remaining_amount)} {cur}</b></p>
                  <p className="text-xs text-muted-foreground mt-1">{t('يُخصم من إجمالي رصيد الخزينة')}: {fmt(summary.treasury_balance)} {cur}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('المبلغ المراد تسديده')}</label>
                  <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} data-testid="pr-pay-amount" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('طريقة الدفع')}</label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger data-testid="pr-pay-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t('نقدي')}</SelectItem>
                      <SelectItem value="card">{t('بطاقة')}</SelectItem>
                      <SelectItem value="bank_withdrawal">{t('سحب بنكي')}</SelectItem>
                      <SelectItem value="zain_cash">{t('زين كاش')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayDialog(null)}>{t('إلغاء')}</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={submitPay} disabled={paying} data-testid="pr-pay-submit">
                  {paying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4 ml-1" />} {t('تأكيد التسديد')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
