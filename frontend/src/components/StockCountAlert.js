import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { BellRing, ClipboardCheck, X } from 'lucide-react';
import { API_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';

const API = API_URL;
const POLL_MS = 60000;

/**
 * تنبيه الجرد المعلّق لمسؤول المطبخ/الكاشير.
 * - يستطلع الفروع التي بها شفت نشط وتحتاج جرداً ولم يُسجَّل بعد.
 * - يعرض تنبيهاً مرئياً نابضاً + صوتياً (Web Audio) خلال الشفت قبل الإغلاق.
 * - النقر يفتح الجرد (عبر onOpenCount) أو يوجّه لشاشة طلبات الفروع.
 *
 * props:
 *   onOpenCount?: (branch) => void   // إن وُجد، يُستدعى عند النقر بدل التوجيه
 */
export const StockCountAlert = ({ onOpenCount }) => {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const { getBranchIdForApi } = useBranch();
  const [pending, setPending] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const audioCtxRef = useRef(null);
  const lastBeepRef = useRef(0);

  // تهيئة سياق الصوت بعد أول تفاعل للمستخدم (سياسات المتصفح)
  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioCtxRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) audioCtxRef.current = new Ctx();
        }
        if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      } catch (e) { /* تجاهل */ }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const playBeep = useCallback(() => {
    const now = Date.now();
    if (now - lastBeepRef.current < 4000) return; // لا تكرر الصوت بسرعة
    lastBeepRef.current = now;
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      // نغمتان متتاليتان للفت الانتباه
      [0, 0.28].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 880 : 1180;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.24);
      });
    } catch (e) { /* تجاهل */ }
  }, []);

  const poll = useCallback(async () => {
    try {
      // 🔒 خصوصية الجرد لكل فرع: مرّر الفرع المختار (المالك) — والباكند يحصر موظف الفرع بفرعه
      const bid = getBranchIdForApi ? getBranchIdForApi() : null;
      const res = await axios.get(`${API}/branch-stock-count/pending-alerts`, {
        params: bid ? { branch_id: bid } : {}
      });
      const list = res.data?.pending || [];
      setPending(list);
      if (list.length > 0) {
        setDismissed(false);
        playBeep();
      }
    } catch (e) { /* صامت */ }
  }, [playBeep, getBranchIdForApi]);

  useEffect(() => {
    if (!isAuthenticated || user?.role === 'delivery') return;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll, isAuthenticated, user]);

  if (!isAuthenticated || !pending.length || dismissed) return null;

  const first = pending[0];
  const handleClick = () => {
    if (onOpenCount) { onOpenCount(first); return; }
    // سلوك افتراضي: افتح الجرد في شاشة طلبات الفروع
    try { sessionStorage.setItem('open_stock_count_branch', first.branch_id); } catch (e) { /* */ }
    const onBranchOrders = window.location.pathname.replace(/\/$/, '').endsWith('branch-orders');
    if (onBranchOrders) {
      window.dispatchEvent(new CustomEvent('emergent:open-stock-count', { detail: first }));
    } else {
      window.location.assign('/branch-orders');
    }
  };

  return (
    <div
      className="fixed bottom-6 left-6 z-[9999] max-w-sm"
      data-testid="stock-count-alert"
    >
      <div className="relative rounded-xl border-2 border-red-500 bg-red-600 text-white shadow-2xl shadow-red-900/40 overflow-hidden">
        <span className="absolute inset-0 animate-ping rounded-xl bg-red-500/40 pointer-events-none" />
        <button
          onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          className="absolute top-1.5 left-1.5 z-10 p-1 rounded-md hover:bg-white/20 transition-colors"
          data-testid="stock-count-alert-dismiss"
          aria-label={t('إخفاء')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleClick}
          className="relative w-full text-right p-4 pr-12 flex items-start gap-3 hover:bg-red-700 transition-colors"
          data-testid="stock-count-alert-open"
        >
          <span className="shrink-0 mt-0.5">
            <BellRing className="h-6 w-6 animate-bounce" />
          </span>
          <span className="flex-1">
            <span className="block font-bold text-base leading-tight">
              {t('مطلوب جرد المخزون الآن')}
            </span>
            <span className="block text-xs text-red-100 mt-1 leading-relaxed">
              {pending.length === 1
                ? `${t('الفرع')}: ${first.branch_name} — ${t('يجب إدخال الجرد قبل إغلاق الصندوق')}`
                : `${pending.length} ${t('فروع بحاجة لجرد قبل الإغلاق')}`}
            </span>
            <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold bg-white text-red-700 px-2.5 py-1 rounded-full">
              <ClipboardCheck className="h-3.5 w-3.5" />
              {t('ابدأ الجرد')}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};

export default StockCountAlert;
