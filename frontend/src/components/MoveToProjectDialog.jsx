import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import API_URL from '../utils/api';

const KINDS = [
  { id: 'raw', label: 'مواد خام', key: 'rawMaterials' },
  { id: 'manufactured', label: 'منتجات مصنّعة', key: 'manufacturedProducts' },
  { id: 'packaging', label: 'مواد تغليف', key: 'packagingMaterials' },
];

export const MoveToProjectDialog = ({ rawMaterials, manufacturedProducts, packagingMaterials, onDone }) => {
  const { enterpriseEnabled, projects, selectedProjectId } = useProject();
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('move');
  const [kind, setKind] = useState('raw');
  const [target, setTarget] = useState('');
  const [selected, setSelected] = useState([]);
  const [qty, setQty] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const lists = { rawMaterials, manufacturedProducts, packagingMaterials };
  const items = useMemo(() => {
    const k = KINDS.find(x => x.id === kind).key;
    return (lists[k] || []).filter(i => i.project_id !== target && (!search || (i.name || '').includes(search)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, target, search, rawMaterials, manufacturedProducts, packagingMaterials]);
  if (!enterpriseEnabled || (projects || []).length < 2 || !hasRole(['admin', 'super_admin', 'general_manager'])) return null;

  const projName = (id) => projects.find(p => p.id === id)?.name || '—';
  const toggle = (id) => setSelected(s => (mode === 'transfer' ? [id] : (s.includes(id) ? s.filter(x => x !== id) : [...s, id])));

  const submit = async () => {
    setBusy(true);
    try {
      const res = mode === 'move'
        ? await axios.post(`${API_URL}/projects/inventory/move`, { target_project_id: target, kind, item_ids: selected })
        : await axios.post(`${API_URL}/projects/inventory/transfer`, { target_project_id: target, kind, item_id: selected[0], quantity: parseFloat(qty) });
      toast.success(res.data?.message || 'تم');
      setSelected([]); setQty('');
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشلت العملية');
    } finally {
      setBusy(false);
    }
  };

  const ready = target && selected.length && (mode === 'move' || parseFloat(qty) > 0);
  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)} data-testid="move-to-project-btn">
        <ArrowLeftRight className="h-4 w-4" /> نقل / تحويل بين المشاريع
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl" data-testid="move-to-project-dialog">
          <DialogHeader><DialogTitle>نقل أو تحويل مواد بين المشاريع</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button variant={mode === 'move' ? 'default' : 'outline'} onClick={() => { setMode('move'); setSelected([]); }} data-testid="mode-move-btn">نقل نهائي للمادة</Button>
              <Button variant={mode === 'transfer' ? 'default' : 'outline'} onClick={() => { setMode('transfer'); setSelected([]); }} data-testid="mode-transfer-btn">تحويل كمية</Button>
            </div>
            <p className="text-xs text-muted-foreground p-2 rounded bg-muted/40">
              {mode === 'move'
                ? 'تنتقل المادة بكل كميتها وتكلفتها إلى المشروع الآخر، ولا تعود تظهر في مشروعها القديم.'
                : 'تُخصم الكمية من مخزن المشروع الحالي وتُضاف لنفس المادة في المشروع الآخر، ويُسجَّل التحويل في حركات المشروعين.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>النوع</Label>
                <Select value={kind} onValueChange={(v) => { setKind(v); setSelected([]); }}>
                  <SelectTrigger className="mt-1" data-testid="move-kind-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map(k => <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>إلى المشروع</Label>
                <Select value={target} onValueChange={(v) => { setTarget(v); setSelected([]); }}>
                  <SelectTrigger className="mt-1" data-testid="move-target-select"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{projects.filter(p => p.id !== selectedProjectId).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} data-testid="move-search-input" />
            <div className="max-h-56 overflow-y-auto border rounded-lg divide-y" data-testid="move-items-list">
              {items.length === 0 && <p className="p-3 text-xs text-muted-foreground text-center">لا توجد مواد</p>}
              {items.map(i => (
                <label key={i.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/40">
                  <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} data-testid={`move-item-${i.id}`} />
                  <span className="flex-1">{i.name}</span>
                  <span className="text-xs text-muted-foreground">{i.quantity ?? 0} {i.unit || ''} · {projName(i.project_id)}</span>
                </label>
              ))}
            </div>
            {mode === 'transfer' && (
              <div>
                <Label>الكمية المحوّلة</Label>
                <Input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} data-testid="transfer-qty-input" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button disabled={!ready || busy} onClick={submit} data-testid="move-submit-btn">
              {busy ? 'جارٍ التنفيذ...' : (mode === 'move' ? `نقل (${selected.length})` : 'تحويل')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
