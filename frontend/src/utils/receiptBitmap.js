/**
 * Maestro POS - Receipt Bitmap Generator (Browser-side)
 * يولد صورة ESC/POS bitmap مباشرة في المتصفح
 * يدعم العربية أصلاً عبر Canvas API
 * يطابق تماماً معاينة الفاتورة في POS
 */

const PW = 384; // عرض الإيصال (48mm * 8 dots/mm)
const MARGIN = 10;
const CONTENT_W = PW - MARGIN * 2;
const FONT_AR = '"Cairo", "Noto Sans Arabic", "Segoe UI", "Tahoma", sans-serif';
const FONT_EN = '"Courier New", monospace';

function isArabic(text) {
  return /[\u0600-\u06FF\uFE70-\uFEFF]/.test(text);
}

function drawText(ctx, text, x, y, fontSize, align = 'right', bold = false) {
  const fontFamily = isArabic(text) ? FONT_AR : FONT_EN;
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (isArabic(text)) {
    ctx.direction = 'rtl';
  } else {
    ctx.direction = 'ltr';
  }
  ctx.fillText(text, x, y);
  ctx.direction = 'ltr';
  return fontSize + 4;
}

/** رسم نص مع التفاف تلقائي */
function drawWrappedText(ctx, text, x, y, maxWidth, fontSize, align = 'center', bold = false) {
  const fontFamily = isArabic(text) ? FONT_AR : FONT_EN;
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (isArabic(text)) ctx.direction = 'rtl';
  
  const words = text.split(' ');
  let line = '';
  let totalH = 0;
  const lineH = fontSize + 4;
  
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + totalH);
      totalH += lineH;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, y + totalH);
    totalH += lineH;
  }
  ctx.direction = 'ltr';
  return totalH;
}

function drawRow(ctx, rightText, leftText, y, fontSize = 14) {
  if (rightText) drawText(ctx, rightText, PW - MARGIN, y, fontSize, 'right');
  if (leftText) drawText(ctx, leftText, MARGIN, y, fontSize, 'left');
  return fontSize + 5;
}

function drawCenter(ctx, text, y, fontSize = 14, bold = false) {
  return drawWrappedText(ctx, text, PW / 2, y, CONTENT_W, fontSize, 'center', bold);
}

/** خط فاصل سميك مزدوج (=====) */
function drawDoubleSep(ctx, y) {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 2);
  ctx.lineTo(PW - MARGIN, y + 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 6);
  ctx.lineTo(PW - MARGIN, y + 6);
  ctx.stroke();
  return 14;
}

/** خط فاصل رفيع متقطع (-----) */
function drawDashedSep(ctx, y) {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 3);
  ctx.lineTo(PW - MARGIN, y + 3);
  ctx.stroke();
  ctx.setLineDash([]);
  return 10;
}

function formatNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function time12() {
  const now = new Date();
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ap}`;
}

function dateStr() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  return `${d}/${mo}/${now.getFullYear()}`;
}

/**
 * توليد صورة الإيصال كـ Canvas - يطابق معاينة POS بالضبط
 */
function renderReceiptCanvas(order, config = {}) {
  const showPrices = config.show_prices !== false;
  const isKitchen = config.printer_type === 'kitchen';
  
  const canvas = document.createElement('canvas');
  canvas.width = PW;
  canvas.height = 4000; // ارتفاع مؤقت كبير
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PW, 4000);
  ctx.fillStyle = '#000000';
  
  let y = 15;

  // ========== رأس الإيصال ==========
  
  // اسم المطعم
  const restName = order.restaurant_name || '';
  if (restName) {
    y += drawCenter(ctx, restName, y, isKitchen ? 22 : 20, true);
    y += 2;
  }

  // أرقام الهاتف (غير المطبخ)
  if (!isKitchen) {
    const phones = [];
    if (order.phone) phones.push(order.phone);
    if (order.phone2) phones.push(order.phone2);
    if (phones.length > 0) {
      y += drawCenter(ctx, phones.join(' - '), y, 11, false);
    }
    
    // عنوان المطعم
    if (order.address) {
      y += drawCenter(ctx, order.address, y, 11, false);
    }
  }

  // اسم الفرع
  if (order.branch_name) {
    y += drawCenter(ctx, order.branch_name, y, 13, true);
    y += 1;
  }

  // اسم القسم (للمطبخ فقط)
  if (isKitchen && order.section_name) {
    y += drawCenter(ctx, `[ ${order.section_name} ]`, y, 18, true);
    y += 2;
  }

  // الرقم الضريبي (غير المطبخ)
  if (!isKitchen && order.tax_number && order.show_tax !== false) {
    y += drawCenter(ctx, `الرقم الضريبي: ${order.tax_number}`, y, 10, false);
  }

  // فاصل متقطع
  y += drawDashedSep(ctx, y);

  // ========== معلومات الفاتورة ==========
  
  // رقم الفاتورة
  if (order.order_number) {
    const invoiceLabel = isKitchen ? `طلب #${order.order_number}` : `فاتورة رقم: #${order.order_number}`;
    y += drawCenter(ctx, invoiceLabel, y, 14, true);
    y += 2;
  }

  // التاريخ والوقت
  y += drawCenter(ctx, `${dateStr()} - ${time12()}`, y, 11, false);

  // اسم الكاشير (غير المطبخ)
  if (!isKitchen && order.cashier_name) {
    y += drawCenter(ctx, `الكاشير: ${order.cashier_name}`, y, 11, false);
  }

  // فاصل متقطع
  y += drawDashedSep(ctx, y);

  // ========== نوع الطلب ==========
  const orderTypes = {
    'dine_in': 'طلب داخلي',
    'takeaway': 'طلب سفري',
    'delivery': 'طلب توصيل',
    'delivery_company': 'شركة توصيل'
  };
  const orderTypeText = orderTypes[order.order_type] || order.order_type || '';
  if (orderTypeText) {
    y += drawCenter(ctx, orderTypeText, y, 16, true);
    y += 2;
  }

  // تفاصيل حسب نوع الطلب
  if (order.order_type === 'dine_in' && order.table_number) {
    y += drawCenter(ctx, `طاولة: ${order.table_number}`, y, 15, true);
  }

  if (order.order_type === 'takeaway') {
    if (order.buzzer_number) {
      y += drawCenter(ctx, `رقم الجهاز: ${order.buzzer_number}`, y, 14, true);
    }
    if (order.customer_name) {
      y += drawCenter(ctx, order.customer_name, y, 13, false);
    }
  }

  if (order.order_type === 'delivery') {
    if (order.customer_name) {
      y += drawRow(ctx, `العميل: ${order.customer_name}`, '', y, 13);
    }
    if (order.customer_phone) {
      y += drawRow(ctx, `الهاتف: ${order.customer_phone}`, '', y, 12);
    }
    if (order.delivery_address) {
      y += drawRow(ctx, `العنوان: ${order.delivery_address}`, '', y, 12);
    }
    if (order.driver_name) {
      y += drawRow(ctx, `السائق: ${order.driver_name}`, '', y, 13);
    }
    if (order.delivery_company) {
      y += drawRow(ctx, `شركة التوصيل: ${order.delivery_company}`, '', y, 13);
    }
  }

  // نص أعلى الفاتورة المخصص
  if (!isKitchen && order.custom_header) {
    y += 2;
    y += drawCenter(ctx, order.custom_header, y, 11, false);
  }

  // ========== فاصل سميك مزدوج ==========
  y += drawDoubleSep(ctx, y);

  // ========== عناوين جدول الأصناف ==========
  if (!isKitchen) {
    const headerFontSize = 12;
    ctx.font = `bold ${headerFontSize}px ${FONT_AR}`;
    ctx.textBaseline = 'top';
    
    // رأس الجدول: الصنف | الكمية | السعر
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillText('الصنف', PW - MARGIN, y);
    ctx.textAlign = 'center';
    ctx.fillText('الكمية', PW / 2, y);
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillText('السعر', MARGIN, y);
    ctx.direction = 'ltr';
    y += headerFontSize + 4;
    
    // خط تحت العناوين
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PW - MARGIN, y);
    ctx.stroke();
    y += 4;
  }

  // ========== الأصناف ==========
  const items = order.items || [];
  const itemFontSize = isKitchen ? 18 : 13;
  
  for (const item of items) {
    const name = item.product_name || item.name || '';
    const qty = item.quantity || 1;
    
    if (isKitchen) {
      // مطبخ: خط كبير، اسم + كمية
      drawText(ctx, name, PW - MARGIN, y, itemFontSize, 'right', true);
      drawText(ctx, `x${qty}`, MARGIN, y, itemFontSize, 'left', true);
      y += itemFontSize + 8;
    } else {
      // فاتورة: صنف | كمية | السعر
      const linePrice = (item.price || 0) * qty;
      
      // اسم الصنف يمين
      drawText(ctx, name, PW - MARGIN, y, itemFontSize, 'right');
      // الكمية وسط
      ctx.font = `bold ${itemFontSize}px ${FONT_EN}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.direction = 'ltr';
      ctx.fillText(`${qty}`, PW / 2, y);
      // السعر يسار
      drawText(ctx, formatNum(linePrice), MARGIN, y, itemFontSize, 'left');
      y += itemFontSize + 6;
    }
    
    // ملاحظات العنصر
    if (item.notes) {
      y += drawRow(ctx, `>> ${item.notes}`, '', y, 10);
    }
    
    // الإضافات
    const extras = item.extras || item.selectedExtras || [];
    if (extras.length > 0) {
      for (const extra of extras) {
        const extraName = extra.name || '';
        if (showPrices && extra.price) {
          y += drawRow(ctx, `  + ${extraName}`, `${formatNum(extra.price)}`, y, 10);
        } else if (extraName) {
          y += drawRow(ctx, `  + ${extraName}`, '', y, 10);
        }
      }
    }
  }

  // ========== فاصل سميك مزدوج ==========
  y += drawDoubleSep(ctx, y);

  // ========== المجاميع (فاتورة الكاشير فقط) ==========
  if (showPrices && !isKitchen) {
    // المجموع الفرعي
    if (order.subtotal !== undefined && order.subtotal !== order.total) {
      y += drawRow(ctx, 'المجموع الفرعي:', formatNum(order.subtotal), y, 13);
    }

    // الخصم
    const discount = order.discount || 0;
    if (discount > 0) {
      y += drawRow(ctx, 'الخصم:', `-${formatNum(discount)}`, y, 13);
    }

    // فاصل رفيع قبل الإجمالي
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y + 2);
    ctx.lineTo(PW - MARGIN, y + 2);
    ctx.stroke();
    y += 8;

    // الإجمالي النهائي - خط كبير وعريض
    const total = order.total || 0;
    drawText(ctx, 'الإجمالي النهائي:', PW - MARGIN, y, 18, 'right', true);
    drawText(ctx, formatNum(total), MARGIN, y, 18, 'left', true);
    y += 24;

    // طريقة الدفع
    const payMethods = {
      'cash': 'نقدي',
      'card': 'بطاقة',
      'credit': 'آجل',
      'delivery_company': 'شركة توصيل',
      'pending': ''
    };
    const payText = payMethods[order.payment_method] || order.payment_method || '';
    if (payText) {
      y += drawRow(ctx, 'طريقة الدفع:', payText, y, 13);
    }
  }

  // ========== نص أسفل الفاتورة المخصص ==========
  if (!isKitchen && order.custom_footer) {
    y += drawDashedSep(ctx, y);
    y += drawCenter(ctx, order.custom_footer, y, 11, false);
  }

  // ========== فاصل متقطع ==========
  y += drawDashedSep(ctx, y);

  // ========== التذييل ==========
  if (!isKitchen) {
    // رسالة الشكر
    const thankMsg = order.thank_you_message || 'شكراً لزيارتكم';
    y += drawCenter(ctx, thankMsg, y, 13, true);
    y += 4;
  }

  // وقت الطباعة
  y += drawCenter(ctx, `${dateStr()} ${time12()}`, y, 10, false);

  // اسم النظام
  const sysName = order.system_name || 'Maestro EGP';
  y += drawCenter(ctx, sysName, y, 10, true);
  y += 15;

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
 * يقسم الصورة لشرائح صغيرة (24 سطر) لتجنب تجاوز ذاكرة الطابعة
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
  // Set line spacing to 0 for seamless strips
  bytes.push(0x1B, 0x33, 0x00);
  
  const bytesPerRow = Math.ceil(w / 8);
  const STRIP_HEIGHT = 24;
  
  for (let stripStart = 0; stripStart < h; stripStart += STRIP_HEIGHT) {
    const stripEnd = Math.min(stripStart + STRIP_HEIGHT, h);
    const stripH = stripEnd - stripStart;
    
    // GS v 0 - Print raster bit image for this strip
    bytes.push(0x1D, 0x76, 0x30, 0x00);
    bytes.push(bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF);
    bytes.push(stripH & 0xFF, (stripH >> 8) & 0xFF);
    
    for (let row = stripStart; row < stripEnd; row++) {
      for (let colByte = 0; colByte < bytesPerRow; colByte++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const px = colByte * 8 + bit;
          if (px < w) {
            const idx = (row * w + px) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const gray = (r * 0.299 + g * 0.587 + b * 0.114);
            if (gray < 128) {
              byteVal |= (0x80 >> bit);
            }
          }
        }
        bytes.push(byteVal);
      }
    }
  }
  
  // Reset line spacing
  bytes.push(0x1B, 0x32);
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
    
    let binary = '';
    for (let i = 0; i < escposBytes.length; i++) {
      binary += String.fromCharCode(escposBytes[i]);
    }
    const base64 = btoa(binary);
    
    console.log(`[ReceiptBitmap] Rendered OK: ${canvas.width}x${canvas.height}px, ${escposBytes.length} bytes, kitchen=${config.printer_type === 'kitchen'}`);
    return { success: true, raw_data: base64, size: escposBytes.length };
  } catch (err) {
    console.error('[ReceiptBitmap] Render failed:', err);
    return { success: false, error: err.message };
  }
}
