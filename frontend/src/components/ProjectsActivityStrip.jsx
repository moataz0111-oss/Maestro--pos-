import React from 'react';
import { Briefcase } from 'lucide-react';
import { resolveImageUrl } from './ProjectLogoUpload';
import { useTranslation } from '../hooks/useTranslation';

export const ProjectsActivityStrip = ({ activity, formatPrice, onSelect }) => {
  const { t } = useTranslation();
  if (!activity?.length) return null;
  const sorted = [...activity].sort((a, b) => (b.sales || 0) - (a.sales || 0));
  return (
    <div className="flex flex-wrap gap-2" data-testid="projects-activity-strip">
      {sorted.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect?.(p.id)}
          data-testid={`project-activity-${p.id}`}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-colors hover:bg-primary/10 ${p.has_data ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5 opacity-80'}`}
        >
          {p.logo_url ? (
            <img src={resolveImageUrl(p.logo_url)} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="font-medium">{p.name}</span>
          {p.has_data ? (
            <span className="text-emerald-400">{formatPrice ? formatPrice(p.sales) : Math.round(p.sales).toLocaleString()} · {p.orders}</span>
          ) : (
            <span className="flex items-center gap-1 text-red-400" data-testid={`project-no-data-${p.id}`}>
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {t('لا توجد بيانات')}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};
