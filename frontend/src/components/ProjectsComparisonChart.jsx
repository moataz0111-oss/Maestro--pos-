import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const SERIES = [
  { key: 'revenue', name: 'المبيعات', color: '#16a34a' },
  { key: 'purchases', name: 'المشتريات', color: '#f59e0b' },
  { key: 'expenses', name: 'المصاريف', color: '#dc2626' },
  { key: 'net_profit', name: 'صافي الربح', color: '#7c3aed' },
];

const Chart = ({ data, series, height = 'h-80' }) => (
  <div className={height} dir="ltr">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" interval={0} angle={-30} textAnchor="end" height={60} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={(v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v)} />
        <Tooltip formatter={(v) => Number(v).toLocaleString('en-US')} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
        {!series.some(s => s.perProject) && <Legend />}
        {series.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]}>
            {s.perProject && data.map(d => <Cell key={d.id} fill={d.color || s.color} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export const ProjectsComparisonChart = ({ projects }) => {
  if (!projects?.length) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <Card className="lg:col-span-2" data-testid="projects-comparison-chart">
      <CardHeader className="pb-2"><CardTitle className="text-base">مقارنة المشاريع جنباً إلى جنب</CardTitle></CardHeader>
      <CardContent><Chart data={projects} series={SERIES} /></CardContent>
    </Card>
    <Card data-testid="projects-inventory-chart">
      <CardHeader className="pb-2"><CardTitle className="text-base">قيمة المخزون لكل مشروع</CardTitle></CardHeader>
      <CardContent><Chart data={projects} series={[{ key: 'inventory_value', name: 'قيمة المخزون', color: '#2563eb', perProject: true }]} /></CardContent>
    </Card>
    </div>
  );
};
