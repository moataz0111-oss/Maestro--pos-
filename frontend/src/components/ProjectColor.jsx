import React from 'react';
import { Check, Palette } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

export const PROJECT_PALETTE = [
  { hex: '#F97316', name: 'برتقالي' }, { hex: '#10B981', name: 'زمردي' },
  { hex: '#3B82F6', name: 'أزرق' }, { hex: '#EC4899', name: 'وردي' },
  { hex: '#A855F7', name: 'بنفسجي' }, { hex: '#EAB308', name: 'ذهبي' },
  { hex: '#06B6D4', name: 'سماوي' }, { hex: '#EF4444', name: 'أحمر' },
  { hex: '#84CC16', name: 'ليموني' }, { hex: '#14B8A6', name: 'فيروزي' },
  { hex: '#F43F5E', name: 'قرمزي' }, { hex: '#6366F1', name: 'نيلي' },
];

export const ACTIVITY_LABELS = {
  restaurant: 'مطعم', salon: 'صالون', clinic: 'عيادة', supermarket: 'سوبرماركت', distribution: 'توزيع',
  delivery_company: 'شركة توصيل', manufacturing: 'تصنيع', retail: 'تجزئة', other: 'أخرى',
};

const assignColors = (list) => {
  const used = new Set(list.filter(p => p.color).map(p => p.color.toUpperCase()));
  const out = {};
  let cursor = 0;
  list.forEach(p => {
    if (p.color) { out[p.id] = p.color; return; }
    const free = PROJECT_PALETTE.slice(cursor).concat(PROJECT_PALETTE.slice(0, cursor)).find(c => !used.has(c.hex));
    const hex = (free || PROJECT_PALETTE[cursor % PROJECT_PALETTE.length]).hex;
    used.add(hex);
    cursor = (PROJECT_PALETTE.findIndex(c => c.hex === hex) + 1) % PROJECT_PALETTE.length;
    out[p.id] = hex;
  });
  return out;
};

export const projectColorOf = (projects, id) => assignColors(projects || [])[id] || '#64748B';

export const nextFreeColor = (projects) => {
  const used = new Set(Object.values(assignColors(projects || [])).map(c => c.toUpperCase()));
  return (PROJECT_PALETTE.find(c => !used.has(c.hex)) || PROJECT_PALETTE[(projects || []).length % PROJECT_PALETTE.length]).hex;
};

export const useProjectColor = () => {
  const { projects } = useProject();
  return (id) => projectColorOf(projects, id);
};

export const ProjectColorDot = ({ color, size = 10, className = '' }) => (
  <span
    className={`inline-block rounded-full shrink-0 ${className}`}
    style={{ width: size, height: size, background: color, boxShadow: `0 0 0 3px ${color}33, 0 0 10px ${color}66` }}
  />
);

export const ProjectColorBadge = ({ projectId, name, className = '', testId }) => {
  const { projects } = useProject();
  const p = (projects || []).find(x => x.id === projectId);
  const color = projectColorOf(projects, projectId);
  const label = name || p?.name || 'بدون مشروع';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap border shrink-0 text-foreground transition-transform duration-200 hover:scale-105 ${className}`}
      style={{ background: `${color}1F`, borderColor: `${color}73` }}
      data-testid={testId || `project-color-badge-${projectId || 'none'}`}
    >
      <ProjectColorDot color={color} size={7} />
      {label}
    </span>
  );
};

export const ProjectColorPicker = ({ value, onChange }) => (
  <div className="space-y-2" data-testid="project-color-picker">
    <div className="flex items-center gap-2 text-sm font-medium">
      <Palette className="h-4 w-4" style={{ color: value }} /> لون المشروع
      <span className="text-xs text-muted-foreground font-normal">(يميّز المشروع في البطاقات والتقارير والفلاتر)</span>
    </div>
    <div className="flex flex-wrap gap-2 p-3 rounded-xl border bg-muted/30">
      {PROJECT_PALETTE.map(c => {
        const active = (value || '').toLowerCase() === c.hex.toLowerCase();
        return (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            onClick={() => onChange(c.hex)}
            data-testid={`project-color-swatch-${c.hex.slice(1)}`}
            className={`h-8 w-8 rounded-full flex items-center justify-center transition-transform duration-200 hover:scale-110 ${active ? 'scale-110' : ''}`}
            style={{ background: c.hex, boxShadow: active ? `0 0 0 3px hsl(var(--background)), 0 0 0 5px ${c.hex}` : 'none' }}
          >
            {active && <Check className="h-4 w-4 text-white drop-shadow" />}
          </button>
        );
      })}
      <label
        className="h-8 w-8 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center cursor-pointer overflow-hidden relative hover:scale-110 transition-transform duration-200"
        title="لون مخصص"
        style={!PROJECT_PALETTE.some(c => c.hex.toLowerCase() === (value || '').toLowerCase()) && value ? { background: value, borderStyle: 'solid', borderColor: value } : {}}
      >
        <Palette className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="color"
          className="absolute inset-0 opacity-0 cursor-pointer"
          value={value || '#F97316'}
          onChange={e => onChange(e.target.value.toUpperCase())}
          data-testid="project-color-custom-input"
        />
      </label>
    </div>
  </div>
);
