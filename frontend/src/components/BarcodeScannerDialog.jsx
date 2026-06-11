import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ScanLine, CameraOff } from 'lucide-react';

const REGION_ID = 'barcode-scanner-region';

// نافذة مسح الباركود/QR بكاميرا الجهاز (للهاتف/التابلت كتطبيق PWA)
export const BarcodeScannerDialog = ({ open, onOpenChange, onScan, title = 'مسح باركود الطلب' }) => {
  const scannerRef = useRef(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setError(null);
      setStarting(true);
      try {
        const html5 = new Html5Qrcode(REGION_ID, { verbose: false });
        scannerRef.current = html5;
        await html5.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 160 } },
          (decodedText) => {
            if (cancelled) return;
            // مسح ناجح — أعد القيمة وأغلق
            onScan?.(String(decodedText).trim());
            stop().then(() => onOpenChange?.(false));
          },
          () => {} // تجاهل أخطاء الإطار الواحد
        );
      } catch (e) {
        if (!cancelled) setError('تعذّر تشغيل الكاميرا. تأكّد من منح إذن الكاميرا واستخدام اتصال آمن (HTTPS).');
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    const stop = async () => {
      try {
        if (scannerRef.current) {
          await scannerRef.current.stop();
          await scannerRef.current.clear();
          scannerRef.current = null;
        }
      } catch (e) { /* تجاهل */ }
    };

    if (open) {
      // تأخير بسيط لضمان وجود عنصر العرض في DOM
      const t = setTimeout(start, 150);
      return () => { cancelled = true; clearTimeout(t); stop(); };
    }
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="barcode-scanner-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ScanLine className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="py-8 text-center space-y-2" data-testid="barcode-scanner-error">
            <CameraOff className="h-10 w-10 mx-auto text-red-500" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div id={REGION_ID} className="w-full overflow-hidden rounded-lg bg-black/40" style={{ minHeight: 220 }} />
            <p className="text-xs text-center text-muted-foreground">
              {starting ? 'جارٍ تشغيل الكاميرا...' : 'وجّه الكاميرا نحو باركود/QR الطلب'}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScannerDialog;
