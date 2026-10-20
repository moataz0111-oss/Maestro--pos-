import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Printer, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useProject } from '../context/ProjectContext';
import { API_URL } from '../utils/api';
import { printTransferLog } from '../utils/printTransferLog';

const KIND = { raw: 'مادة خام', manufactured: 'منتج مصنّع', packaging: 'مادة تغليف' };
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export const flattenLogs = (logs, pid) => logs.flatMap(l => (l.type === 'move'
  ? (l.items || []).filter(it => !pid || pid === 'all' || l.target_project_id === pid || it.from_project_id === pid).map(it => ({ ...l, item_name: it.name, from_project_name: it.from_project_name, quantity: null, cost_per_unit: null }))
  : [l]));

export default function ProjectTransfersLog() {
  const navigate = useNavigate();
  const { projects } = useProject();
  const [projectId, setProjectId] = useState('all');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/projects/inventory/log`, {
        params: { project_id: projectId, start_date: start || undefined, end_date: end || undefined },
      });
      setRows(flattenLogs(res.data || [], projectId));
    } catch (_) { setRows([]); } finally { setLoading(false); }
  }, [projectId, start, end]);

  useEffect(() => { load(); }, [load]);

  const projectName = projectId === 'all' ? 'كل المشاريع' : (projects.find(p => p.id === projectId)?.name || '');

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl" data-testid="transfers-log-page">
      <div className="container mx-auto p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)} data-testid="back-btn"><ArrowRight className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowLeftRight className="h-6 w-6 text-primary" /> سجل التحويلات بين المشاريع</h1>
              <p className="text-sm text-muted-foreground">كل عمليات النقل النهائي وتحويل الكميات بين مخازن المشاريع</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading} data-testid="refresh-btn"><RefreshCw className={`h-4 w-4 ml-2 ${loading ? 'animate-spin' : ''}`} />تحديث</Button>
            <Button onClick={() => printTransferLog(rows, { projectName, start, end })} disabled={!rows.length} data-testid="print-log-btn"><Printer className="h-4 w-4 ml-2" />طباعة</Button>
          </div>
        </div>

        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>المشروع</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="mt-1" data-testid="log-project-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المشاريع</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>من تاريخ</Label><Input type="date" className="mt-1 dark:[color-scheme:dark]" value={start} onChange={e => setStart(e.target.value)} data-testid="log-start-date" /></div>
          <div><Label>إلى تاريخ</Label><Input type="date" className="mt-1 dark:[color-scheme:dark]" value={end} onChange={e => setEnd(e.target.value)} data-testid="log-end-date" /></div>
        </CardContent></Card>

        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="transfers-log-table">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>{['التاريخ', 'النوع', 'المادة', 'الكمية', 'تكلفة الوحدة', 'الإجمالي', 'من المشروع', 'إلى المشروع', 'المنفّذ'].map(h => <th key={h} className="p-3 text-right font-medium whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{loading ? 'جارٍ التحميل...' : 'لا توجد تحويلات'}</td></tr>}
              {rows.map((r, i) => (
                <tr key={`${r.id}-${i}`} className="border-t hover:bg-muted/30" data-testid={`log-row-${i}`}>
                  <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString('ar-IQ')}</td>
                  <td className="p-3"><Badge variant={r.type === 'move' ? 'secondary' : 'default'}>{r.type === 'move' ? 'نقل نهائي' : 'تحويل كمية'}</Badge> <span className="text-xs text-muted-foreground">{KIND[r.kind]}</span></td>
                  <td className="p-3 font-medium">{r.item_name}</td>
                  <td className="p-3">{r.quantity != null ? `${fmt(r.quantity)} ${r.unit || ''}` : 'كامل الكمية'}</td>
                  <td className="p-3">{r.cost_per_unit != null ? fmt(r.cost_per_unit) : '—'}</td>
                  <td className="p-3 font-medium">{r.quantity != null && r.cost_per_unit != null ? fmt(r.quantity * r.cost_per_unit) : '—'}</td>
                  <td className="p-3">{r.from_project_name || '—'}</td>
                  <td className="p-3">{r.target_project_name}</td>
                  <td className="p-3">{r.user_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      </div>
    </div>
  );
}
