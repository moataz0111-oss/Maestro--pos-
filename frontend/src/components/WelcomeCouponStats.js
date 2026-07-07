import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Gift, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { API_URL } from '../utils/api';
import { useTranslation } from '../hooks/useTranslation';

export const WelcomeCouponStats = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    axios.get(`${API_URL}/welcome-discount/stats`)
      .then(res => setStats(res.data))
      .catch(() => setStats(null));
  }, []);

  if (!stats || stats.total_coupons === 0 && stats.pending_customers === 0 && stats.granted_customers === 0) return null;

  const items = [
    { icon: Clock, label: t('بانتظار الموافقة'), value: stats.pending_customers, color: 'text-amber-500 bg-amber-500/10' },
    { icon: Gift, label: t('كوبونات ممنوحة'), value: stats.total_coupons, color: 'text-primary bg-primary/10' },
    { icon: CheckCircle2, label: t('كوبونات مستخدمة'), value: stats.used_coupons, color: 'text-green-500 bg-green-500/10' },
    { icon: TrendingUp, label: t('نسبة الاستخدام'), value: `${stats.conversion_rate}%`, color: 'text-blue-500 bg-blue-500/10' },
  ];

  return (
    <div className="mb-4 p-3 rounded-lg border border-border bg-muted/20" data-testid="welcome-coupon-stats">
      <p className="text-xs font-bold text-muted-foreground mb-2">{t('إحصائيات الخصم الترحيبي')} 🎁</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className={`flex items-center gap-2 p-2 rounded-md ${color.split(' ')[1]}`}>
            <Icon className={`h-4 w-4 flex-shrink-0 ${color.split(' ')[0]}`} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground leading-tight">{value}</p>
              <p className="text-[10px] text-muted-foreground truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>
      {stats.total_discount_given > 0 && (
        <p className="text-xs text-muted-foreground mt-2" data-testid="welcome-total-discount">
          {t('إجمالي الخصومات الممنوحة')}: <span className="font-bold text-foreground">{Number(stats.total_discount_given).toLocaleString()} {t('د.ع')}</span>
        </p>
      )}
    </div>
  );
};
