import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';
import { Gift, Phone } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import WelcomeGrantDialog from './WelcomeGrantDialog';

const API = API_URL;

export default function WelcomeApprovalsBell({ user }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState([]);
  const [open, setOpen] = useState(false);
  const [grantCustomer, setGrantCustomer] = useState(null);
  const panelRef = useRef(null);

  const canApprove = user && ['admin', 'general_manager', 'manager', 'branch_manager', 'super_admin', 'owner'].includes(user.role);

  const fetchPending = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/welcome-approvals`, { headers: { Authorization: `Bearer ${token}` } });
      setPending(res.data?.pending || []);
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!canApprove) return;
    fetchPending();
    const interval = setInterval(fetchPending, 45000);
    return () => clearInterval(interval);
  }, [canApprove]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!canApprove) return null;

  const count = pending.length;

  return (
    <div className="relative" ref={panelRef}>
      <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}
        className="rounded-lg relative" data-testid="welcome-approvals-bell"
        title={t('طلبات خصم الترحيب')}>
        <Gift className={`h-5 w-5 ${count > 0 ? 'text-green-600' : ''}`} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow" data-testid="welcome-approvals-badge">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute left-0 mt-2 w-[360px] sm:w-[400px] max-h-[70vh] bg-card border rounded-lg shadow-2xl overflow-hidden z-[60]" data-testid="welcome-approvals-panel">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
            <Gift className="h-4 w-4 text-green-600" />
            <h3 className="font-bold text-sm">{t('زبائن جدد — بانتظار كوبون الترحيب')}</h3>
            {count > 0 && <Badge className="bg-green-600 text-white text-[10px]">{count}</Badge>}
          </div>
          <div className="overflow-y-auto max-h-[58vh]">
            {count === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Gift className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>{t('لا توجد طلبات موافقة حالياً')}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {pending.map((c) => (
                  <li key={c.id} className="px-4 py-3 hover:bg-muted/40 transition-colors" data-testid={`welcome-pending-item-${c.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t('أول طلب')}: {(c.total_spent || 0).toLocaleString()} د.ع
                        </p>
                      </div>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs shrink-0"
                        onClick={() => { setGrantCustomer(c); setOpen(false); }}
                        data-testid={`welcome-approve-btn-${c.id}`}>
                        <Gift className="h-3.5 w-3.5 ml-1" /> {t('موافقة')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <WelcomeGrantDialog
        open={!!grantCustomer}
        customer={grantCustomer}
        onClose={() => setGrantCustomer(null)}
        onGranted={() => { setGrantCustomer(null); fetchPending(); }}
      />
    </div>
  );
}
