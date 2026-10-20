const KIND = { raw: 'مادة خام', manufactured: 'منتج مصنّع', packaging: 'مادة تغليف' };
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// طباعة مباشرة عبر iframe مخفي (بدون فتح نافذة جديدة)
export const printTransferLog = (rows, { projectName, start, end }) => {
  const total = rows.reduce((s, r) => s + (r.quantity != null && r.cost_per_unit != null ? r.quantity * r.cost_per_unit : 0), 0);
  const body = rows.map(r => `<tr>
    <td>${esc(new Date(r.created_at).toLocaleString('ar-IQ'))}</td>
    <td>${r.type === 'move' ? 'نقل نهائي' : 'تحويل كمية'} - ${esc(KIND[r.kind])}</td>
    <td>${esc(r.item_name)}</td>
    <td>${r.quantity != null ? `${fmt(r.quantity)} ${esc(r.unit || '')}` : 'كامل الكمية'}</td>
    <td>${r.cost_per_unit != null ? fmt(r.cost_per_unit) : '—'}</td>
    <td>${r.quantity != null && r.cost_per_unit != null ? fmt(r.quantity * r.cost_per_unit) : '—'}</td>
    <td>${esc(r.from_project_name || '—')}</td><td>${esc(r.target_project_name)}</td><td>${esc(r.user_name || '—')}</td>
  </tr>`).join('');
  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>سجل التحويلات</title>
  <style>body{font-family:Tahoma,Arial,sans-serif;margin:16px;color:#000}h2{margin:0 0 4px}p{margin:0 0 12px;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #444;padding:5px;text-align:right}
  th{background:#eee}tfoot td{font-weight:bold}@page{size:A4 landscape;margin:10mm}</style></head><body>
  <h2>سجل التحويلات بين المشاريع</h2>
  <p>المشروع: ${esc(projectName)} | الفترة: ${esc(start || 'البداية')} — ${esc(end || 'اليوم')} | عدد العمليات: ${rows.length}</p>
  <table><thead><tr><th>التاريخ</th><th>النوع</th><th>المادة</th><th>الكمية</th><th>تكلفة الوحدة</th><th>الإجمالي</th><th>من المشروع</th><th>إلى المشروع</th><th>المنفّذ</th></tr></thead>
  <tbody>${body}</tbody><tfoot><tr><td colspan="5">إجمالي قيمة التحويلات</td><td colspan="4">${fmt(total)}</td></tr></tfoot></table>
  </body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 300);
};
