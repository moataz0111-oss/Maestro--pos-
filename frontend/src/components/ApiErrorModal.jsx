import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { API_ERROR_EVENT } from '../utils/apiError';

/**
 * Modal تفصيلي يفتح عند الضغط على "عرض التفاصيل" في toast الأخطاء.
 * يعرض جدول: الحقل → الخطأ → النوع.
 */
export default function ApiErrorModal() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      setData(e.detail || null);
      setOpen(true);
      setCopied(false);
    };
    window.addEventListener(API_ERROR_EVENT, handler);
    return () => window.removeEventListener(API_ERROR_EVENT, handler);
  }, []);

  if (!data) return null;

  const { title, status, rows = [], rawDetail } = data;

  const copyRaw = () => {
    try {
      const text = typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail, null, 2);
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl" data-testid="api-error-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            {title || 'تفاصيل الخطأ'}
            {status ? (
              <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded font-mono">
                HTTP {status}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {rows.length > 0 ? (
            <table className="w-full text-sm border-collapse" dir="rtl" data-testid="api-error-table">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-right font-bold border-b">الحقل</th>
                  <th className="px-3 py-2 text-right font-bold border-b">الخطأ</th>
                  <th className="px-3 py-2 text-right font-bold border-b w-32">النوع</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-amber-700 dark:text-amber-400">{r.field}</td>
                    <td className="px-3 py-2">{r.msg}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground p-3 bg-muted/40 rounded">
              لا توجد تفاصيل إضافية.
            </p>
          )}

          {rawDetail && (
            <details className="text-xs bg-muted/30 rounded p-2">
              <summary className="cursor-pointer font-bold text-muted-foreground">عرض البيانات الخام (JSON)</summary>
              <pre className="mt-2 p-2 bg-background rounded text-[11px] overflow-auto max-h-48 ltr font-mono" dir="ltr">
                {typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail, null, 2)}
              </pre>
            </details>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          {rawDetail && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyRaw}
              className="gap-2"
              data-testid="api-error-copy-btn"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? 'تم النسخ' : 'نسخ التفاصيل'}
            </Button>
          )}
          <Button type="button" onClick={() => setOpen(false)} data-testid="api-error-close-btn">
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
