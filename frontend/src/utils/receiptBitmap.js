/**
 * Maestro POS - Receipt Bitmap Generator (Browser-side)
 * 80mm thermal receipt (576px width at 8 dots/mm)
 * Supports Arabic natively via Canvas API
 */

const PW = 576; // 80mm printer = 72mm print area = 576 dots at 8dpi
const MARGIN = 12;
const CONTENT_W = PW - MARGIN * 2;
const FONT_AR = '"Cairo", "Noto Sans Arabic", "Segoe UI", "Tahoma", sans-serif';

function isArabic(text) {
  return /[\u0600-\u06FF\uFE70-\uFEFF]/.test(text);
}

function getFont(size, bold, text) {
  const family = isArabic(text) ? FONT_AR : '"Courier New", monospace';
  return `${bold ? 'bold ' : ''}${size}px ${family}`;
}

function drawText(ctx, text, x, y, fontSize, align = 'right', bold = false) {
  ctx.font = getFont(fontSize, bold, text);
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.direction = isArabic(text) ? 'rtl' : 'ltr';
  ctx.fillText(text, x, y);
  ctx.direction = 'ltr';
  return fontSize + 4;
}

function drawCenter(ctx, text, y, fontSize = 18, bold = false) {
  if (!text) return 0;
  ctx.font = getFont(fontSize, bold, text);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.direction = isArabic(text) ? 'rtl' : 'ltr';

  // Word wrap
  const words = text.split(' ');
  let line = '';
  let totalH = 0;
  const lineH = fontSize + 5;

  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > CONTENT_W && line) {
      ctx.fillText(line, PW / 2, y + totalH);
      totalH += lineH;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, PW / 2, y + totalH);
    totalH += lineH;
  }
  ctx.direction = 'ltr';
  return totalH;
}

function drawRow(ctx, rightText, leftText, y, fontSize = 18) {
  if (rightText) drawText(ctx, rightText, PW - MARGIN, y, fontSize, 'right');
  if (leftText) drawText(ctx, leftText, MARGIN, y, fontSize, 'left');
  return fontSize + 6;
}

/** Separator line */
function drawSep(ctx, y, thick = false) {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = thick ? 3 : 1;
  if (!thick) ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 4);
  ctx.lineTo(PW - MARGIN, y + 4);
  ctx.stroke();
  ctx.setLineDash([]);
  if (thick) {
    ctx.beginPath();
    ctx.moveTo(MARGIN, y + 9);
    ctx.lineTo(PW - MARGIN, y + 9);
    ctx.stroke();
    return 16;
  }
  return 12;
}

/** Inverse header - black bg with white text */
function drawInverseHeader(ctx, text, y, fontSize = 26) {
  ctx.font = getFont(fontSize, true, text);
  const padH = 16, padV = 8;
  const textW = ctx.measureText(text).width;
  const boxW = Math.min(textW + padH * 2, CONTENT_W);
  const boxH = fontSize + padV * 2;
  const boxX = (PW - boxW) / 2;

  ctx.fillStyle = '#000';
  ctx.fillRect(boxX, y, boxW, boxH);
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.direction = isArabic(text) ? 'rtl' : 'ltr';
  ctx.fillText(text, PW / 2, y + padV);
  ctx.direction = 'ltr';
  ctx.fillStyle = '#000';
  return boxH + 8;
}

function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }

function nowDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function nowTime() {
  const d = new Date();
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2,'0');
  const ap = h < 12 ? 'AM' : 'PM';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${m} ${ap}`;
}

function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // Timeout after 3 seconds to prevent hanging
    setTimeout(() => resolve(null), 3000);
    img.src = src;
  });
}

/**
 * Draw item name with word wrap in a bounded area
 */
function drawItemName(ctx, name, x, y, maxWidth, fontSize, bold = false) {
  ctx.font = getFont(fontSize, bold, name);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.direction = 'rtl';

  const words = name.split(' ');
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

// ============================================================
// CUSTOMER RECEIPT (full receipt with logo, prices, etc.)
// ============================================================
async function renderCustomerReceipt(order, config = {}) {
  // Load logos (with 3s timeout each)
  const [logoImg, sysLogoImg] = await Promise.all([
    loadImage(order.logo_base64 || order.logo_url),
    loadImage(order.system_logo_base64 || order.system_logo_url)
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = PW;
  canvas.height = 8000;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFF';
  ctx.fillRect(0, 0, PW, 8000);
  ctx.fillStyle = '#000';

  let y = 24;

  // === LOGO (big and clear) ===
  if (logoImg) {
    const logoSize = 140;
    const lx = (PW - logoSize) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx + logoSize/2, y + logoSize/2, logoSize/2, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logoImg, lx, y, logoSize, logoSize);
    ctx.restore();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx + logoSize/2, y + logoSize/2, logoSize/2, 0, Math.PI*2);
    ctx.stroke();
    y += logoSize + 12;
  }

  // === RESTAURANT NAME (large) ===
  if (order.restaurant_name) {
    y += drawCenter(ctx, order.restaurant_name, y, 32, true);
    y += 4;
  }

  // Phone
  const phones = [order.phone, order.phone2].filter(Boolean);
  if (phones.length) y += drawCenter(ctx, phones.join(' - '), y, 18);

  // Address
  if (order.address) y += drawCenter(ctx, order.address, y, 17);

  // Branch
  if (order.branch_name) {
    y += 2;
    y += drawCenter(ctx, order.branch_name, y, 20, true);
  }

  // Tax number
  if (order.tax_number && order.show_tax !== false) {
    y += drawCenter(ctx, `${order.tax_number} :TIN`, y, 15);
  }

  y += drawSep(ctx, y);

  // === INVOICE NUMBER (inverse header - big) ===
  if (order.order_number) {
    y += drawInverseHeader(ctx, `#${order.order_number} :فاتورة`, y, 28);
  }

  // Date & Time
  y += drawCenter(ctx, `${nowDate()}  -  ${nowTime()}`, y, 18);

  // Cashier
  if (order.cashier_name) {
    y += drawCenter(ctx, `${order.cashier_name} :الكاشير`, y, 17);
  }

  y += drawSep(ctx, y);

  // === ORDER TYPE (big bold) ===
  const typeMap = {
    'dine_in': 'طلب داخلي',
    'takeaway': 'طلب سفري',
    'delivery': 'طلب توصيل',
    'delivery_company': 'شركة توصيل'
  };
  const typeText = typeMap[order.order_type] || order.order_type || '';
  if (typeText) {
    y += drawCenter(ctx, typeText, y, 26, true);
    y += 4;
  }

  // Table / Buzzer / Delivery details
  if (order.order_type === 'dine_in' && order.table_number) {
    y += drawCenter(ctx, `${order.table_number} :الطاولة`, y, 22, true);
  }
  if (order.order_type === 'takeaway') {
    if (order.buzzer_number) y += drawCenter(ctx, `${order.buzzer_number} :رقم الجهاز`, y, 20, true);
    if (order.customer_name) y += drawCenter(ctx, order.customer_name, y, 19);
  }
  if (order.order_type === 'delivery') {
    if (order.customer_name) y += drawRow(ctx, `${order.customer_name} :العميل`, '', y, 19);
    if (order.customer_phone) y += drawRow(ctx, `${order.customer_phone} :الهاتف`, '', y, 18);
    if (order.delivery_address) y += drawRow(ctx, `${order.delivery_address} :العنوان`, '', y, 18);
    if (order.driver_name) y += drawRow(ctx, `${order.driver_name} :السائق`, '', y, 19);
    if (order.delivery_company) y += drawRow(ctx, `${order.delivery_company} :شركة التوصيل`, '', y, 19);
  }

  // Custom header
  if (order.custom_header) {
    y += 4;
    y += drawCenter(ctx, order.custom_header, y, 16);
  }

  // === DOUBLE LINE ===
  y += drawSep(ctx, y, true);

  // === TABLE HEADER ===
  const HDR_FONT = 20;
  ctx.font = getFont(HDR_FONT, true, 'الصنف');
  ctx.textBaseline = 'top';

  // Column positions: Name (right 70%), Qty (center), Price (left)
  const COL_NAME_X = PW - MARGIN;           // right edge for name
  const COL_QTY_X = 180;                    // center area for quantity
  const COL_PRICE_X = MARGIN;               // left edge for price
  const NAME_MAX_W = PW - MARGIN - COL_QTY_X - 20; // max width for name ~370px

  ctx.direction = 'rtl'; ctx.textAlign = 'right';
  ctx.fillText('الصنف', COL_NAME_X, y);
  ctx.direction = 'ltr'; ctx.textAlign = 'center';
  ctx.fillText('الكمية', COL_QTY_X, y);
  ctx.textAlign = 'left';
  ctx.fillText('السعر', COL_PRICE_X, y);
  y += HDR_FONT + 4;

  // Header underline
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(PW-MARGIN, y); ctx.stroke();
  y += 8;

  // === ITEMS ===
  const ITEM_FONT = 20;
  const items = order.items || [];

  for (const item of items) {
    const name = item.product_name || item.name || '';
    const qty = item.quantity || 1;
    const linePrice = (item.price || 0) * qty;

    // Item name (right-aligned, wraps if needed)
    const nameH = drawItemName(ctx, name, COL_NAME_X, y, NAME_MAX_W, ITEM_FONT, false);

    // Quantity (centered)
    ctx.font = getFont(ITEM_FONT, true, `${qty}`);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.direction = 'ltr';
    ctx.fillText(`${qty}`, COL_QTY_X, y);

    // Price (left-aligned)
    ctx.textAlign = 'left';
    ctx.fillText(fmtNum(linePrice), COL_PRICE_X, y);

    y += Math.max(nameH, ITEM_FONT + 4) + 6;

    // Notes
    if (item.notes) {
      y += drawRow(ctx, `>> ${item.notes}`, '', y, 16);
    }

    // Extras
    const extras = item.extras || item.selectedExtras || [];
    for (const extra of extras) {
      if (extra.name) {
        if (extra.price) {
          y += drawRow(ctx, `  + ${extra.name}`, fmtNum(extra.price), y, 16);
        } else {
          y += drawRow(ctx, `  + ${extra.name}`, '', y, 16);
        }
      }
    }
  }

  // === DOUBLE LINE ===
  y += drawSep(ctx, y, true);

  // === TOTALS ===
  if (order.subtotal !== undefined && order.subtotal !== order.total) {
    y += drawRow(ctx, 'المجموع الفرعي:', fmtNum(order.subtotal), y, 20);
  }
  if (order.discount > 0) {
    y += drawRow(ctx, 'الخصم:', `-${fmtNum(order.discount)}`, y, 20);
  }

  // Thick line before total
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(MARGIN, y+2); ctx.lineTo(PW-MARGIN, y+2); ctx.stroke();
  y += 12;

  // GRAND TOTAL (very large)
  drawText(ctx, 'الإجمالي النهائي:', PW - MARGIN, y, 28, 'right', true);
  drawText(ctx, fmtNum(order.total || 0), MARGIN, y, 28, 'left', true);
  y += 36;

  // Payment method
  const payMap = {'cash':'نقدي','card':'بطاقة','credit':'آجل','delivery_company':'شركة توصيل'};
  const payText = payMap[order.payment_method] || order.payment_method || '';
  if (payText && payText !== 'pending') {
    y += drawRow(ctx, 'طريقة الدفع:', payText, y, 20);
  }

  // Custom footer
  if (order.custom_footer) {
    y += drawSep(ctx, y);
    y += drawCenter(ctx, order.custom_footer, y, 16);
  }

  y += drawSep(ctx, y);

  // Thank you
  const thankMsg = order.thank_you_message || 'شكراً لزيارتكم';
  y += drawCenter(ctx, thankMsg, y, 22, true);
  y += 8;

  // Date/time at bottom
  y += drawCenter(ctx, `${nowDate()} ${nowTime()}`, y, 15);
  y += 8;

  // System logo
  if (sysLogoImg) {
    const sSize = 60;
    ctx.drawImage(sysLogoImg, (PW - sSize)/2, y, sSize, sSize);
    y += sSize + 4;
  }

  // System name
  y += drawCenter(ctx, order.system_name || 'Maestro EGP', y, 16, true);
  y += 30;

  // Trim canvas
  const final = document.createElement('canvas');
  final.width = PW;
  final.height = y;
  final.getContext('2d').drawImage(canvas, 0, 0);
  return final;
}

// ============================================================
// KITCHEN TICKET (fast, no logos, bigger text for readability)
// ============================================================
function renderKitchenTicket(order) {
  const canvas = document.createElement('canvas');
  canvas.width = PW;
  canvas.height = 4000;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFF';
  ctx.fillRect(0, 0, PW, 4000);
  ctx.fillStyle = '#000';

  let y = 16;

  // Section/Printer name
  if (order.section_name) {
    y += drawInverseHeader(ctx, order.section_name, y, 30);
    y += 4;
  }

  // Order number (big)
  if (order.order_number) {
    y += drawInverseHeader(ctx, `#${order.order_number} :طلب`, y, 32);
  }

  // Order type
  const typeMap = {'dine_in':'داخلي','takeaway':'سفري','delivery':'توصيل','delivery_company':'شركة توصيل'};
  const typeText = typeMap[order.order_type] || '';
  if (typeText) y += drawCenter(ctx, typeText, y, 26, true);

  // Table number
  if (order.table_number) {
    y += drawCenter(ctx, `${order.table_number} :الطاولة`, y, 26, true);
  }

  // Date/time
  y += drawCenter(ctx, `${nowDate()} - ${nowTime()}`, y, 18);

  y += drawSep(ctx, y, true);

  // === ITEMS (large, bold, easy to read) ===
  const items = order.items || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = item.product_name || item.name || '';
    const qty = item.quantity || 1;

    // Item name (right, large)
    const nameH = drawItemName(ctx, name, PW - MARGIN, y, CONTENT_W - 80, 28, true);
    // Quantity (left, large)
    drawText(ctx, `x${qty}`, MARGIN, y, 28, 'left', true);
    y += Math.max(nameH, 32) + 4;

    // Notes
    if (item.notes) {
      y += drawCenter(ctx, `** ${item.notes} **`, y, 20, true);
    }

    // Extras
    const extras = item.extras || item.selectedExtras || [];
    for (const extra of extras) {
      if (extra.name) {
        y += drawRow(ctx, `  + ${extra.name}`, '', y, 20);
      }
    }

    // Separator between items
    if (i < items.length - 1) {
      y += 2;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(MARGIN + 20, y); ctx.lineTo(PW - MARGIN - 20, y); ctx.stroke();
      ctx.setLineDash([]);
      y += 6;
    }
  }

  y += drawSep(ctx, y, true);

  // Customer info for delivery/takeaway
  if (order.customer_name) y += drawCenter(ctx, order.customer_name, y, 22, true);
  if (order.buzzer_number) y += drawCenter(ctx, `جهاز: ${order.buzzer_number}`, y, 22, true);

  y += drawCenter(ctx, `${nowDate()} ${nowTime()}`, y, 14);
  y += 20;

  const final = document.createElement('canvas');
  final.width = PW;
  final.height = y;
  final.getContext('2d').drawImage(canvas, 0, 0);
  return final;
}

// ============================================================
// ESC/POS BITMAP ENCODER (column mode ESC * 33)
// ============================================================
function canvasToEscPos(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;

  function isDark(x, y) {
    if (x >= w || y >= h) return 0;
    const i = (y * w + x) * 4;
    return (px[i]*0.299 + px[i+1]*0.587 + px[i+2]*0.114) < 128 ? 1 : 0;
  }

  const STRIP = 24;
  const nL = w & 0xFF, nH = (w >> 8) & 0xFF;
  const strips = Math.ceil(h / STRIP);
  const totalBytes = 5 + strips * (5 + w*3 + 1) + 8;
  const out = new Uint8Array(totalBytes);
  let p = 0;

  // ESC @ init + ESC 3 24 line spacing
  out[p++]=0x1B; out[p++]=0x40;
  out[p++]=0x1B; out[p++]=0x33; out[p++]=STRIP;

  for (let sy = 0; sy < h; sy += STRIP) {
    out[p++]=0x1B; out[p++]=0x2A; out[p++]=33; out[p++]=nL; out[p++]=nH;
    for (let col = 0; col < w; col++) {
      let b0=0,b1=0,b2=0;
      for (let bit=0;bit<8;bit++) { if(isDark(col,sy+bit))    b0|=(0x80>>bit); }
      for (let bit=0;bit<8;bit++) { if(isDark(col,sy+8+bit))  b1|=(0x80>>bit); }
      for (let bit=0;bit<8;bit++) { if(isDark(col,sy+16+bit)) b2|=(0x80>>bit); }
      out[p++]=b0; out[p++]=b1; out[p++]=b2;
    }
    out[p++]=0x0A;
  }

  // Reset + feed + cut
  out[p++]=0x1B; out[p++]=0x32;
  out[p++]=0x0A; out[p++]=0x0A; out[p++]=0x0A; out[p++]=0x0A;
  out[p++]=0x1D; out[p++]=0x56; out[p++]=0x42; out[p++]=0x00;

  return out.subarray(0, p);
}

function uint8ToBase64(arr) {
  const CHUNK = 8192;
  let bin = '';
  for (let i = 0; i < arr.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, arr.subarray(i, Math.min(i+CHUNK, arr.length)));
  }
  return btoa(bin);
}

/**
 * Generate ESC/POS print-ready data as base64
 * ASYNC to support logo loading for customer receipts
 */
export async function renderReceiptBitmap(order, config = {}) {
  try {
    const isKitchen = config.printer_type === 'kitchen';
    let canvas;

    if (isKitchen) {
      // Kitchen ticket: synchronous, no logos, fast
      canvas = renderKitchenTicket(order);
    } else {
      // Customer receipt: async (logo loading), full details
      canvas = await renderCustomerReceipt(order, config);
    }

    const bytes = canvasToEscPos(canvas);
    const base64 = uint8ToBase64(bytes);
    console.log(`[Receipt] ${isKitchen?'Kitchen':'Receipt'}: ${canvas.width}x${canvas.height}px, ${bytes.length} bytes`);
    return { success: true, raw_data: base64, size: bytes.length };
  } catch (err) {
    console.error('[Receipt] Render error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Test page bitmap
 */
export function renderTestBitmap(printerInfo = {}) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = PW;
    canvas.height = 1500;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, 0, PW, 1500);
    ctx.fillStyle = '#000';

    let y = 20;
    y += drawCenter(ctx, `${nowDate()} ${nowTime()}`, y, 16);
    y += 8;
    y += drawSep(ctx, y);
    y += drawCenter(ctx, '*** اختبار الطابعة ***', y, 30, true);
    y += 8;
    y += drawSep(ctx, y);

    if (printerInfo.name) y += drawCenter(ctx, printerInfo.name, y, 24, true);
    y += 6;

    if (printerInfo.connection_type === 'usb') {
      y += drawCenter(ctx, `USB: ${printerInfo.usb_printer_name || ''}`, y, 18);
    } else {
      y += drawCenter(ctx, `IP: ${printerInfo.ip_address || ''}:${printerInfo.port || 9100}`, y, 18);
    }
    y += 4;
    if (printerInfo.branch_name) y += drawCenter(ctx, `${printerInfo.branch_name} :الفرع`, y, 20);
    y += 6;
    y += drawSep(ctx, y);
    y += drawCenter(ctx, `${nowDate()} :التاريخ`, y, 20);
    y += drawCenter(ctx, `${nowTime()} :الوقت`, y, 20);
    y += 6;
    y += drawSep(ctx, y);
    y += drawCenter(ctx, 'الطباعة تعمل بنجاح!', y, 28, true);
    y += 8;
    y += drawSep(ctx, y, true);
    y += drawCenter(ctx, 'Maestro EGP', y, 18, true);
    y += 20;

    const final = document.createElement('canvas');
    final.width = PW;
    final.height = y;
    final.getContext('2d').drawImage(canvas, 0, 0);

    const bytes = canvasToEscPos(final);
    const base64 = uint8ToBase64(bytes);
    console.log(`[TestPrint] ${final.width}x${final.height}px, ${bytes.length} bytes`);
    return { success: true, raw_data: base64, size: bytes.length };
  } catch (err) {
    console.error('[TestPrint] Error:', err);
    return { success: false, error: err.message };
  }
}
