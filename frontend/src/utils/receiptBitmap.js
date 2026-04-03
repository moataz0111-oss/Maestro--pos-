/**
 * Maestro POS - Receipt Bitmap Generator (Browser-side)
 * يولد صورة ESC/POS bitmap مباشرة في المتصفح
 * يدعم العربية أصلاً عبر Canvas API
 */

const PW = 384; // عرض الإيصال (48mm * 8 dots/mm)
const MARGIN = 10;
const FONT_AR = '"Cairo", "Noto Sans Arabic", "Segoe UI", "Tahoma", sans-serif';
const FONT_EN = '"Courier New", monospace';

/**
 * تحقق إذا النص يحتوي على عربي
 */
function isArabic(text) {
  return /[\u0600-\u06FF\uFE70-\uFEFF]/.test(text);
}

/**
 * رسم نص على الكانفس مع دعم RTL
 */
function drawText(ctx, text, x, y, fontSize, align = 'right', bold = false) {
  const fontFamily = isArabic(text) ? FONT_AR : FONT_EN;
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  
  // للعربي - نستخدم direction RTL
  if (isArabic(text)) {
    ctx.direction = 'rtl';
  } else {
    ctx.direction = 'ltr';
  }
  
  ctx.fillText(text, x, y);
  ctx.direction = 'ltr'; // reset
  return fontSize + 4;
}

/**
 * رسم صف بعمودين (يمين ويسار)
 */
function drawRow(ctx, rightText, leftText, y, fontSize = 14) {
  if (rightText) {
    drawText(ctx, rightText, PW - MARGIN, y, fontSize, 'right');
  }
  if (leftText) {
    drawText(ctx, leftText, MARGIN, y, fontSize, 'left');
  }
  return fontSize + 5;
}

/**
 * رسم نص في المنتصف
 */
function drawCenter(ctx, text, y, fontSize = 14, bold = false) {
  drawText(ctx, text, PW / 2, y, fontSize, 'center', bold);
  return fontSize + 5;
}

/**
 * خط فاصل سميك (مزدوج)
 */
function drawThickSep(ctx, y) {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(PW - MARGIN, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 4);
  ctx.lineTo(PW - MARGIN, y + 4);
  ctx.stroke();
  return 12;
}

/**
 * خط فاصل رفيع متقطع
 */
function drawThinSep(ctx, y) {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 1);
  ctx.lineTo(PW - MARGIN, y + 1);
  ctx.stroke();
  ctx.setLineDash([]);
  return 7;
}

/**
 * تنسيق الرقم بالفاصلة
 */
function formatNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

/**
 * وقت 12 ساعة
 */
function time12() {
  const now = new Date();
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m}:${s} ${ap}`;
}

function dateStr() {
  const now = new Date();
  return `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
}

/**
 * توليد صورة الإيصال كـ Canvas
 */
function renderReceiptCanvas(order, config = {}) {
  const showPrices = config.show_prices !== false;
  const isKitchen = config.printer_type === 'kitchen';
  
  // كانفس مؤقت طويل
  const canvas = document.createElement('canvas');
  canvas.width = PW;
  canvas.height = 3000;
  const ctx = canvas.getContext('2d');
  
  // خلفية بيضاء
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PW, 3000);
  ctx.fillStyle = '#000000';
  
  let y = 10;
  
  // === اسم المطعم ===
  const restName = order.restaurant_name || '';
  if (restName) {
    y += drawCenter(ctx, restName, y, isKitchen ? 20 : 18, true);
    y += 2;
  }
  
  // === اسم القسم (للمطبخ) ===
  const sectionName = order.section_name || '';
  if (sectionName && isKitchen) {
    y += drawCenter(ctx, sectionName, y, 16, true);
    y += 2;
  }
  
  // === فاصل سميك ===
  y += drawThickSep(ctx, y);
  
  // === رقم الطلب + نوع الطلب ===
  const orderNum = `#${order.order_number || ''}`;
  const orderTypes = {
    'dine_in': 'طلب داخلي',
    'takeaway': 'طلب سفري',
    'delivery': 'توصيل',
    'delivery_company': 'توصيل شركة'
  };
  const orderTypeText = orderTypes[order.order_type] || order.order_type || '';
  y += drawRow(ctx, orderTypeText, orderNum, y, 14);
  
  // === الكاشير + التاريخ ===
  const cashierName = order.cashier_name || '';
  if (cashierName && !isKitchen) {
    y += drawRow(ctx, `الكاشير: ${cashierName}`, '', y, 12);
  }
  y += drawRow(ctx, time12(), dateStr(), y, 12);
  
  // === طاولة / جهاز / سائق ===
  if (order.order_type === 'dine_in' && order.table_number) {
    y += drawRow(ctx, `طاولة: ${order.table_number}`, '', y, 14);
  } else if (order.order_type === 'takeaway') {
    if (order.buzzer_number) {
      y += drawRow(ctx, `الجهاز: ${order.buzzer_number}`, '', y, 14);
    }
    if (order.customer_name) {
      y += drawRow(ctx, order.customer_name, '', y, 14);
    }
  } else if (order.order_type === 'delivery') {
    if (order.driver_name) {
      y += drawRow(ctx, `السائق: ${order.driver_name}`, '', y, 14);
    }
  } else if (order.order_type === 'delivery_company') {
    if (order.delivery_company) {
      y += drawRow(ctx, `شركة التوصيل: ${order.delivery_company}`, '', y, 14);
    }
    if (order.customer_name) {
      y += drawRow(ctx, order.customer_name, '', y, 14);
    }
  }
  
  // === فاصل سميك ===
  y += drawThickSep(ctx, y);
  
  // === العناصر ===
  const items = order.items || [];
  const itemFontSize = isKitchen ? 18 : 13;
  
  for (const item of items) {
    const name = item.product_name || item.name || '';
    const qty = item.quantity || 1;
    
    if (showPrices && item.price) {
      // مع أسعار: الاسم يمين، الكمية والسعر يسار
      const priceText = `${formatNum(item.price)}`;
      const qtyText = `x${qty}`;
      
      // رسم الاسم يمين
      drawText(ctx, name, PW - MARGIN, y, itemFontSize, 'right');
      // رسم الكمية والسعر يسار
      drawText(ctx, `${qtyText}  ${priceText}`, MARGIN, y, itemFontSize, 'left');
      y += itemFontSize + 6;
    } else {
      // بدون أسعار (مطبخ): الاسم يمين، الكمية يسار
      drawText(ctx, name, PW - MARGIN, y, itemFontSize, 'right', isKitchen);
      drawText(ctx, `x${qty}`, MARGIN, y, itemFontSize, 'left', isKitchen);
      y += itemFontSize + 6;
    }
    
    // ملاحظات
    const notes = item.notes || '';
    if (notes) {
      y += drawRow(ctx, `>> ${notes}`, '', y, 11);
    }
  }
  
  // === فاصل سميك ===
  y += drawThickSep(ctx, y);
  
  // === المجموع والدفع (فقط لفاتورة الكاشير) ===
  if (showPrices && !isKitchen) {
    const discount = order.discount || 0;
    if (discount > 0) {
      y += drawRow(ctx, 'خصم', `-${formatNum(discount)}`, y, 14);
    }
    
    const total = order.total || 0;
    // المجموع بخط أكبر
    const totalLabel = 'المجموع';
    const totalValue = `${formatNum(total)} IQD`;
    drawText(ctx, totalLabel, PW - MARGIN, y, 18, 'right', true);
    drawText(ctx, totalValue, MARGIN, y, 18, 'left', true);
    y += 24;
    
    const payMethods = {
      'cash': 'نقدي',
      'card': 'بطاقة',
      'credit': 'آجل'
    };
    const payText = payMethods[order.payment_method] || order.payment_method || '';
    if (payText) {
      y += drawRow(ctx, 'الدفع', payText, y, 14);
    }
  }
  
  // === فاصل رفيع ===
  y += drawThinSep(ctx, y);
  
  // === تذييل ===
  if (!isKitchen) {
    y += drawCenter(ctx, 'شكرا لزيارتكم', y, 14);
  }
  y += drawCenter(ctx, `طلب #${order.order_number || ''}`, y, 12);
  
  const now = new Date();
  const printTime = `Printed On ${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()} ${time12()}`;
  y += drawCenter(ctx, printTime, y, 10);
  y += drawCenter(ctx, 'Maestro EGP', y, 10);
  y += 10;
  
  // قص الكانفس للحجم الفعلي
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = PW;
  finalCanvas.height = y;
  const fctx = finalCanvas.getContext('2d');
  fctx.drawImage(canvas, 0, 0);
  
  return finalCanvas;
}

/**
 * تحويل Canvas إلى ESC/POS bitmap bytes
 */
function canvasToEscPos(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const pixels = imgData.data;
  
  const bytes = [];
  // ESC @ - Initialize printer
  bytes.push(0x1B, 0x40);
  
  // GS v 0 - Print raster bit image
  const bytesPerRow = Math.ceil(w / 8);
  bytes.push(0x1D, 0x76, 0x30, 0x00);
  bytes.push(bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF);
  bytes.push(h & 0xFF, (h >> 8) & 0xFF);
  
  for (let row = 0; row < h; row++) {
    for (let colByte = 0; colByte < bytesPerRow; colByte++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        const px = colByte * 8 + bit;
        if (px < w) {
          const idx = (row * w + px) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          // أسود إذا كان الـ pixel أغمق من 128
          const gray = (r * 0.299 + g * 0.587 + b * 0.114);
          if (gray < 128) {
            byteVal |= (0x80 >> bit);
          }
        }
      }
      bytes.push(byteVal);
    }
  }
  
  // تغذية ورق + قطع
  bytes.push(0x0A, 0x0A, 0x0A, 0x0A);
  bytes.push(0x1D, 0x56, 0x42, 0x00); // GS V B - Partial cut
  
  return new Uint8Array(bytes);
}

/**
 * توليد بيانات ESC/POS جاهزة للطباعة كـ base64
 */
export function renderReceiptBitmap(order, config = {}) {
  try {
    const canvas = renderReceiptCanvas(order, config);
    const escposBytes = canvasToEscPos(canvas);
    
    // تحويل لـ base64
    let binary = '';
    for (let i = 0; i < escposBytes.length; i++) {
      binary += String.fromCharCode(escposBytes[i]);
    }
    const base64 = btoa(binary);
    
    console.log(`[ReceiptBitmap] Rendered OK: ${canvas.width}x${canvas.height}px, ${escposBytes.length} bytes`);
    return { success: true, raw_data: base64, size: escposBytes.length };
  } catch (err) {
    console.error('[ReceiptBitmap] Render failed:', err);
    return { success: false, error: err.message };
  }
}
