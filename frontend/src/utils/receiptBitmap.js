/**
 * Maestro POS - Receipt Bitmap Generator
 * 65mm thermal (520px = 65mm at 8 dots/mm)
 * Arabic support via Canvas API
 */

import QRCode from 'qrcode';

const PW = 520;  // 65mm print width at 8 dots/mm
const MARGIN = 8;
const CW = PW - MARGIN * 2; // content width = 504
const FONT = '"Cairo", "Noto Sans Arabic", "Segoe UI", "Tahoma", sans-serif';

const isAr = t => /[\u0600-\u06FF\uFE70-\uFEFF]/.test(t);
const fmt = n => Number(n || 0).toLocaleString('en-US');
const pad2 = n => String(n).padStart(2, '0');

function nowStr() {
  const d = new Date();
  let h = d.getHours(); const m = pad2(d.getMinutes());
  const ap = h < 12 ? 'AM' : 'PM';
  if (!h) h = 12; else if (h > 12) h -= 12;
  return { date: `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`, time: `${h}:${pad2(m)} ${ap}` };
}

function font(size, bold, text) {
  return `${bold?'bold ':''}${size}px ${isAr(text||'')?FONT:'"Courier New",monospace'}`;
}

// Draw centered text with word wrap
function drawC(ctx, text, y, size = 18, bold = false) {
  if (!text) return 0;
  ctx.font = font(size, bold, text);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.direction = isAr(text) ? 'rtl' : 'ltr';
  const words = text.split(' ');
  let line = '', h = 0;
  const lh = size + 6;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > CW && line) {
      ctx.fillText(line, PW/2, y+h); h += lh; line = w;
    } else line = t;
  }
  if (line) { ctx.fillText(line, PW/2, y+h); h += lh; }
  ctx.direction = 'ltr';
  return h;
}

// Draw right-aligned text with word wrap
function drawR(ctx, text, y, size = 18, bold = false, maxW = CW) {
  if (!text) return 0;
  ctx.font = font(size, bold, text);
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.direction = 'rtl';
  const words = text.split(' ');
  let line = '', h = 0;
  const lh = size + 6;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(line, PW-MARGIN, y+h); h += lh; line = w;
    } else line = t;
  }
  if (line) { ctx.fillText(line, PW-MARGIN, y+h); h += lh; }
  ctx.direction = 'ltr';
  return h;
}

// Draw left=value right=label row (always bold)
function drawRow(ctx, label, value, y, size = 18) {
  if (label) { ctx.font = font(size, true, label); ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.direction = isAr(label)?'rtl':'ltr'; ctx.fillText(label, PW-MARGIN, y); ctx.direction = 'ltr'; }
  if (value) { ctx.font = font(size, true, value); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.direction = 'ltr'; ctx.fillText(value, MARGIN, y); }
  return size + 8;
}

// Dashed line
function dash(ctx, y) {
  ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.setLineDash([5,3]);
  ctx.beginPath(); ctx.moveTo(MARGIN,y+4); ctx.lineTo(PW-MARGIN,y+4); ctx.stroke();
  ctx.setLineDash([]); return 12;
}

// Double line
function dbl(ctx, y) {
  ctx.strokeStyle='#000'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(MARGIN,y+2); ctx.lineTo(PW-MARGIN,y+2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(MARGIN,y+7); ctx.lineTo(PW-MARGIN,y+7); ctx.stroke();
  return 14;
}

// Inverse header (black bg, white text)
function invH(ctx, text, y, size = 26) {
  ctx.font = font(size, true, text);
  const tw = ctx.measureText(text).width;
  const bw = Math.min(tw + 28, CW);
  const bh = size + 14;
  const bx = (PW - bw) / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(bx, y, bw, bh);
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.direction = isAr(text)?'rtl':'ltr';
  ctx.fillText(text, PW/2, y + 7);
  ctx.direction = 'ltr'; ctx.fillStyle = '#000';
  return bh + 8;
}

// Load image - instant for base64, fast timeout for URLs
function loadImg(src) {
  return new Promise(r => {
    if (!src) return r(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => r(img);
    img.onerror = () => r(null);
    // base64 data URLs load instantly, HTTP URLs get 800ms max
    const timeout = src.startsWith('data:') ? 100 : 800;
    setTimeout(() => r(null), timeout);
    img.src = src;
  });
}

// Generate QR code as canvas
async function generateQR(url) {
  if (!url) return null;
  try {
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, url, {
      width: 100,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    return qrCanvas;
  } catch {
    return null;
  }
}

// ======== CUSTOMER RECEIPT (matches preview exactly) ========
async function renderReceipt(order) {
  const [logo, sysLogo, qrCanvas] = await Promise.all([
    loadImg(order.logo_base64 || order.logo_url),
    loadImg(order.system_logo_base64 || order.system_logo_url),
    generateQR(order.qr_url)
  ]);

  const c = document.createElement('canvas');
  c.width = PW; c.height = 8000;
  const x = c.getContext('2d');
  x.fillStyle = '#FFF'; x.fillRect(0,0,PW,8000);
  x.fillStyle = '#000';

  let y = 24;

  // ===== RESTAURANT LOGO (circular, centered) =====
  if (logo) {
    const sz = 80;
    const lx = (PW-sz)/2;
    x.save();
    x.beginPath(); x.arc(lx+sz/2, y+sz/2, sz/2, 0, Math.PI*2); x.clip();
    x.drawImage(logo, lx, y, sz, sz);
    x.restore();
    x.strokeStyle='#000'; x.lineWidth=2;
    x.beginPath(); x.arc(lx+sz/2, y+sz/2, sz/2, 0, Math.PI*2); x.stroke();
    y += sz + 10;
  }

  // ===== RESTAURANT NAME =====
  if (order.restaurant_name)
    y += drawC(x, order.restaurant_name, y, 30, true);

  // Phone
  const phones = [order.phone, order.phone2].filter(Boolean);
  if (phones.length) y += drawC(x, phones.join(' - '), y, 18, true);

  // Address
  if (order.address) y += drawC(x, order.address, y, 18, true);

  // Branch
  if (order.branch_name) { y += 2; y += drawC(x, order.branch_name, y, 18, true); }

  // Tax
  if (order.tax_number && order.show_tax !== false)
    y += drawC(x, `${order.tax_number} :TIN`, y, 14, true);

  y += dash(x, y);
  y += 4;

  // ===== INVOICE NUMBER (inverse header) =====
  if (order.order_number)
    y += invH(x, `#${order.order_number} :فاتورة رقم`, y, 24);

  // ===== ORDER NOTES (ملاحظات الفاتورة - تحت رقم الفاتورة) =====
  if (order.order_notes) {
    y += 4;
    y += drawC(x, order.order_notes, y, 16, true);
    y += 2;
  }

  // Date + Time
  const { date, time } = nowStr();
  y += drawC(x, `${date}  -  ${time}`, y, 18, true);

  // Cashier
  if (order.cashier_name)
    y += drawC(x, `${order.cashier_name} :الكاشير`, y, 18, true);

  y += dash(x, y);

  // ===== ORDER TYPE (centered) =====
  const types = {'dine_in':'طلب داخلي','takeaway':'طلب سفري','delivery':'طلب توصيل'};
  const typeText = types[order.order_type] || order.order_type || '';
  if (typeText) { y += drawC(x, typeText, y, 24, true); y += 2; }

  // Delivery company name ONLY (centered, no label)
  if (order.delivery_company) {
    y += drawC(x, order.delivery_company, y, 22, true);
  }

  // Table / Customer info
  if (order.order_type === 'dine_in' && order.table_number)
    y += drawC(x, `${order.table_number} : طاولة`, y, 22, true);
  if (order.order_type === 'takeaway') {
    if (order.buzzer_number) y += drawC(x, `${order.buzzer_number} :رقم الجهاز`, y, 20, true);
    if (order.customer_name) y += drawC(x, order.customer_name, y, 18, true);
  }
  if (order.order_type === 'delivery') {
    if (order.customer_name) y += drawRow(x, `${order.customer_name} :العميل`, '', y, 18);
    if (order.customer_phone) y += drawRow(x, `${order.customer_phone} :الهاتف`, '', y, 18);
    if (order.delivery_address) y += drawRow(x, `${order.delivery_address} :العنوان`, '', y, 18);
    if (order.driver_name) y += drawRow(x, `${order.driver_name} :السائق`, '', y, 18);
  }

  // Custom header (greeting)
  if (order.custom_header) { y += 4; y += drawC(x, order.custom_header, y, 16, true); }

  y += dash(x, y);
  y += 4;

  // ===== ITEMS TABLE - 3 COLUMN LAYOUT (like preview) =====
  // Column layout (RTL): السعر (left) | الكمية (center) | الصنف (right)
  const colPriceX = MARGIN;          // Price: left side
  const colQtyX = PW * 0.42;         // Quantity: center area
  const colNameX = PW - MARGIN;      // Item name: right side
  const nameMaxW = CW * 0.52;        // Max width for item name
  const priceMaxW = CW * 0.32;       // Max width for price

  // Column headers
  const headerSize = 20;
  x.font = font(headerSize, true, 'السعر');
  x.textAlign = 'left'; x.textBaseline = 'top'; x.direction = 'ltr';
  x.fillText('السعر', colPriceX, y);
  x.font = font(headerSize, true, 'الكمية');
  x.textAlign = 'center'; x.direction = 'rtl';
  x.fillText('الكمية', colQtyX, y);
  x.font = font(headerSize, true, 'الصنف');
  x.textAlign = 'right'; x.direction = 'rtl';
  x.fillText('الصنف', colNameX, y);
  x.direction = 'ltr';
  y += headerSize + 8;

  // Header separator
  x.strokeStyle='#000'; x.lineWidth=2; x.setLineDash([3,2]);
  x.beginPath(); x.moveTo(MARGIN, y); x.lineTo(PW-MARGIN, y); x.stroke();
  x.setLineDash([]); y += 6;

  // Item rows
  const items = order.items || [];
  const itemSize = 20;
  const itemLh = itemSize + 8;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = item.product_name || item.name || '';
    const qty = item.quantity || 1;
    const unitPrice = item.price || 0;
    // سعر المنتج الأساسي فقط (بدون الإضافات)
    const basePrice = unitPrice * qty;

    // Draw item name (right, may wrap)
    x.font = font(itemSize, true, name);
    x.textAlign = 'right'; x.textBaseline = 'top'; x.direction = 'rtl';

    // Word wrap for long names
    const nameWords = name.split(' ');
    let nameLine = '', nameH = 0;
    const firstLineY = y;
    for (const w of nameWords) {
      const t = nameLine ? nameLine + ' ' + w : w;
      if (ctx_measureW(x, t, itemSize, true) > nameMaxW && nameLine) {
        x.font = font(itemSize, true, nameLine);
        x.fillText(nameLine, colNameX, y + nameH);
        nameH += itemLh;
        nameLine = w;
      } else nameLine = t;
    }
    if (nameLine) {
      x.font = font(itemSize, true, nameLine);
      x.fillText(nameLine, colNameX, y + nameH);
      nameH += itemLh;
    }

    // Draw quantity (center, on first line)
    x.font = font(itemSize, true, String(qty));
    x.textAlign = 'center'; x.direction = 'ltr';
    x.fillText(String(qty), colQtyX, firstLineY);

    // Draw base price only (left, on first line) - بدون الإضافات
    const priceStr = `${fmt(basePrice)} IQD`;
    x.font = font(itemSize, true, priceStr);
    x.textAlign = 'left'; x.direction = 'ltr';
    x.fillText(priceStr, colPriceX, firstLineY);

    x.direction = 'ltr';
    y += nameH;

    // Notes
    if (item.notes) {
      y += drawR(x, `** ${item.notes} **`, y, 16, true);
    }

    // Extras - مع دعم الكمية
    const extras = item.extras || item.selectedExtras || [];
    for (const ext of extras) {
      if (ext.name) {
        const extQty = ext.quantity || 1;
        const extName = extQty > 1 ? `  + ${ext.name} ×${extQty}` : `  + ${ext.name}`;
        const extTotal = (ext.price || 0) * extQty;
        if (extTotal) {
          x.font = font(16, true, extName);
          x.textAlign = 'right'; x.textBaseline = 'top'; x.direction = 'rtl';
          x.fillText(extName, colNameX, y);
          x.direction = 'ltr'; x.textAlign = 'left';
          x.font = font(16, true, fmt(extTotal));
          x.fillText(fmt(extTotal), colPriceX, y);
          y += 24;
        } else {
          y += drawR(x, extName, y, 16, true);
        }
      }
    }

    // Item separator (dotted line between items)
    if (i < items.length - 1) {
      y += 2;
      x.setLineDash([2,4]); x.strokeStyle='#000'; x.lineWidth=2;
      x.beginPath(); x.moveTo(MARGIN+20, y); x.lineTo(PW-MARGIN-20, y); x.stroke();
      x.setLineDash([]); y += 8;
    }
  }

  y += dash(x, y);
  y += 4;

  // ===== TOTALS =====
  if (order.subtotal !== undefined && order.subtotal !== order.total) {
    y += drawRow(x, 'المجموع الفرعي:', `${fmt(order.subtotal)} IQD`, y, 20);
    y += 4;
  }

  if (order.discount > 0) {
    y += drawRow(x, 'الخصم:', `-${fmt(order.discount)} IQD`, y, 20);
    y += 4;
  }

  // Thick separator before total
  x.strokeStyle='#000'; x.lineWidth=3;
  x.beginPath(); x.moveTo(MARGIN, y+2); x.lineTo(PW-MARGIN, y+2); x.stroke();
  y += 12;

  // GRAND TOTAL (large, bold)
  const totalLabel = 'الإجمالي النهائي:';
  const totalValue = `${fmt(order.total || 0)} IQD`;
  x.font = font(26, true, totalLabel);
  x.textAlign = 'right'; x.textBaseline = 'top'; x.direction = 'rtl';
  x.fillText(totalLabel, PW-MARGIN, y);
  x.direction = 'ltr'; x.textAlign = 'left';
  x.font = font(26, true, totalValue);
  x.fillText(totalValue, MARGIN, y);
  y += 36;

  // Thick separator after total
  x.strokeStyle='#000'; x.lineWidth=3;
  x.beginPath(); x.moveTo(MARGIN, y); x.lineTo(PW-MARGIN, y); x.stroke();
  y += 10;

  // حالة الدفع - مدفوعة / غير مدفوعة
  const isPaid = order.is_paid === true || order.is_paid === 'true';
  const paidText = isPaid ? 'مدفوعة' : 'غير مدفوعة';
  const paidColor = isPaid ? '#16a34a' : '#dc2626';
  x.fillStyle = paidColor;
  x.font = font(24, true, paidText);
  const paidW = x.measureText(paidText).width;
  x.fillText(paidText, (PW - paidW) / 2, y);
  y += 32;
  x.fillStyle = '#000';

  // Payment method
  const pay = {'cash':'نقدي','card':'بطاقة','credit':'آجل','delivery_company':'شركة توصيل'};
  const payT = pay[order.payment_method] || order.payment_method || '';
  if (payT && payT !== 'pending') y += drawRow(x, 'طريقة الدفع:', payT, y, 18);

  // Custom footer
  if (order.custom_footer) { y += dash(x, y); y += drawC(x, order.custom_footer, y, 16, true); y += 4; }

  y += dash(x, y);
  y += 6;

  // ===== THANK YOU =====
  const thank = order.thank_you_message || 'شكراً لزيارتكم';
  y += drawC(x, thank, y, 22, true);
  y += 10;

  // ===== SYSTEM LOGO (right after thank you - no date/time) =====
  if (sysLogo) {
    const sz = 80;
    x.drawImage(sysLogo, (PW-sz)/2, y, sz, sz);
    y += sz + 4;
  }

  // System name
  y += drawC(x, order.system_name || 'Maestro EGP', y, 16, true);

  // Contact message
  const contactMsg = order.contact_message || 'للتواصل معنا لشراء نسخة امسح الكود';
  y += 2;
  y += drawC(x, contactMsg, y, 11, true);
  y += 4;

  // ===== QR CODE =====
  if (qrCanvas) {
    const qrSize = 80;
    x.drawImage(qrCanvas, (PW - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + 6;
  }

  y += 30; // Space for cut

  // Trim canvas to actual content (no padding)
  const f = document.createElement('canvas');
  f.width = PW; f.height = y;
  f.getContext('2d').drawImage(c, 0, 0);
  return f;
}

// Helper to measure text width
function ctx_measureW(ctx, text, size, bold) {
  ctx.font = font(size, bold, text);
  return ctx.measureText(text).width;
}

// ======== KITCHEN TICKET (65mm = 520px, with restaurant header) ========
async function renderKitchen(order) {
  // Load restaurant logo
  const logo = await loadImg(order.logo_base64 || order.logo_url);
  
  const KW = PW; // Same width as receipt (520px = 65mm)
  const KM = MARGIN;
  const KC = CW;
  const c = document.createElement('canvas');
  c.width = KW; c.height = 6000;
  const x = c.getContext('2d');
  x.fillStyle='#FFF'; x.fillRect(0,0,KW,6000);
  x.fillStyle='#000';
  let y = 16;

  function kC(text, yy, size, bold) {
    if (!text) return 0;
    x.font = font(size, bold, text);
    x.textAlign = 'center'; x.textBaseline = 'top';
    x.direction = isAr(text) ? 'rtl' : 'ltr';
    const words = text.split(' ');
    let line = '', h = 0, lh = size + 5;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (x.measureText(t).width > KC && line) {
        x.fillText(line, KW/2, yy+h); h += lh; line = w;
      } else line = t;
    }
    if (line) { x.fillText(line, KW/2, yy+h); h += lh; }
    x.direction = 'ltr';
    return h;
  }
  
  function kR(text, yy, size, bold) {
    if (!text) return 0;
    x.font = font(size, bold, text);
    x.textAlign = 'right'; x.textBaseline = 'top';
    x.direction = 'rtl';
    const words = text.split(' ');
    let line = '', h = 0, lh = size + 5;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (x.measureText(t).width > KC && line) {
        x.fillText(line, KW-KM, yy+h); h += lh; line = w;
      } else line = t;
    }
    if (line) { x.fillText(line, KW-KM, yy+h); h += lh; }
    x.direction = 'ltr';
    return h;
  }

  function kInv(text, yy, size) {
    x.font = font(size, true, text);
    const tw = x.measureText(text).width;
    const bw = Math.min(tw + 24, KC);
    const bh = size + 14;
    const bx = (KW - bw) / 2;
    x.fillStyle = '#000'; x.fillRect(bx, yy, bw, bh);
    x.fillStyle = '#FFF';
    x.textAlign = 'center'; x.textBaseline = 'top';
    x.direction = isAr(text)?'rtl':'ltr';
    x.fillText(text, KW/2, yy + 7);
    x.direction = 'ltr'; x.fillStyle = '#000';
    return bh + 6;
  }

  function kDash(yy) {
    x.strokeStyle='#000'; x.lineWidth=1; x.setLineDash([5,3]);
    x.beginPath(); x.moveTo(KM, yy+4); x.lineTo(KW-KM, yy+4); x.stroke();
    x.setLineDash([]); return 12;
  }

  function kDbl(yy) {
    x.strokeStyle='#000'; x.lineWidth=2;
    x.beginPath(); x.moveTo(KM, yy+2); x.lineTo(KW-KM, yy+2); x.stroke();
    x.beginPath(); x.moveTo(KM, yy+7); x.lineTo(KW-KM, yy+7); x.stroke();
    return 12;
  }

  // ===== RESTAURANT LOGO =====
  if (logo) {
    const sz = 70;
    const lx = (KW-sz)/2;
    x.save();
    x.beginPath(); x.arc(lx+sz/2, y+sz/2, sz/2, 0, Math.PI*2); x.clip();
    x.drawImage(logo, lx, y, sz, sz);
    x.restore();
    x.strokeStyle='#000'; x.lineWidth=2;
    x.beginPath(); x.arc(lx+sz/2, y+sz/2, sz/2, 0, Math.PI*2); x.stroke();
    y += sz + 8;
  }

  // ===== RESTAURANT NAME =====
  if (order.restaurant_name) y += kC(order.restaurant_name, y, 26, true);

  // ===== BRANCH NAME =====
  if (order.branch_name) y += kC(order.branch_name, y, 18, true);

  // ===== CASHIER NAME =====
  if (order.cashier_name) y += kC(`${order.cashier_name} :الكاشير`, y, 18, true);

  y += kDash(y);

  // ===== SECTION NAME (printer name) =====
  if (order.section_name) { y += kInv(order.section_name, y, 24); y += 2; }

  // ===== ORDER NUMBER =====
  if (order.order_number) y += kInv(`#${order.order_number} :طلب`, y, 24);

  // ===== ORDER NOTES (ملاحظات الفاتورة) =====
  if (order.order_notes) {
    y += 4;
    y += kC(order.order_notes, y, 16, true);
    y += 2;
  }

  // ===== ORDER TYPE =====
  const types = {'dine_in':'داخلي','takeaway':'سفري','delivery':'توصيل','delivery_company':'شركة توصيل'};
  y += kC(types[order.order_type] || '', y, 22, true);

  // ===== TABLE NUMBER =====
  if (order.table_number) y += kC(`${order.table_number} :الطاولة`, y, 22, true);

  // ===== DATE/TIME =====
  const { date, time } = nowStr();
  y += kC(`${date} - ${time}`, y, 16, true);

  y += kDbl(y);

  // ===== ITEMS =====
  const items = order.items || [];
  for (let i = 0; i < items.length; i++) {
    const name = items[i].product_name || items[i].name || '';
    const qty = items[i].quantity || 1;
    
    // Item name (right, bold)
    y += kR(name, y, 22, true);
    
    // Quantity (left, on same line as name)
    x.font = font(20, true, `x${qty}`);
    x.textAlign='left'; x.textBaseline='top'; x.direction='ltr';
    x.fillText(`x${qty}`, KM, y - 27);
    
    // Notes
    if (items[i].notes) y += kC(`** ${items[i].notes} **`, y, 16, true);
    
    // Extras - مع دعم الكمية
    const extras = items[i].extras || items[i].selectedExtras || [];
    for (const e of extras) {
      if (e.name) {
        const eQty = e.quantity || 1;
        const eName = eQty > 1 ? `  + ${e.name} ×${eQty}` : `  + ${e.name}`;
        y += kR(eName, y, 16, true);
      }
    }
    
    // Separator between items
    if (i < items.length-1) {
      y += 2;
      x.setLineDash([2,4]); x.strokeStyle='#000'; x.lineWidth=1;
      x.beginPath(); x.moveTo(KM+20,y); x.lineTo(KW-KM-20,y); x.stroke();
      x.setLineDash([]); y+=6;
    }
  }

  y += kDbl(y);

  // ===== CUSTOMER INFO =====
  if (order.customer_name) y += kC(order.customer_name, y, 18, true);
  if (order.buzzer_number) y += kC(`جهاز: ${order.buzzer_number}`, y, 18, true);

  y += kDash(y);

  // ===== SYSTEM NAME (footer) =====
  y += kC(order.system_name || 'Maestro EGP', y, 16, true);
  y += 20;

  const f = document.createElement('canvas');
  f.width = KW; f.height = y;
  f.getContext('2d').drawImage(c, 0, 0);
  return f;
}

// ======== ESC/POS ENCODER (column mode ESC * 33, skip blank strips) ========
// تحويل Canvas إلى ESC/POS raster mode (GS v 0) - يدعم التوسيط
function toEscPosRaster(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const px = ctx.getImageData(0,0,w,h).data;
  const dark = (cx,cy) => {
    if (cx>=w||cy>=h) return 0;
    const i=(cy*w+cx)*4;
    return (px[i]*.299+px[i+1]*.587+px[i+2]*.114)<128?1:0;
  };

  const bw = Math.ceil(w / 8); // bytes per row
  const imgData = new Uint8Array(bw * h);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (dark(x, y)) {
        imgData[y * bw + Math.floor(x / 8)] |= (0x80 >> (x % 8));
      }
    }
  }
  
  // Build ESC/POS command
  const buf = new Uint8Array(16 + imgData.length + 12);
  let p = 0;
  
  // ESC @ init
  buf[p++]=0x1B; buf[p++]=0x40;
  // ESC a 1 = center align
  buf[p++]=0x1B; buf[p++]=0x61; buf[p++]=0x01;
  // GS v 0 m xL xH yL yH [data]
  buf[p++]=0x1D; buf[p++]=0x76; buf[p++]=0x30; buf[p++]=0x00;
  buf[p++] = bw & 0xFF;        // xL (bytes per row)
  buf[p++] = (bw >> 8) & 0xFF; // xH
  buf[p++] = h & 0xFF;         // yL (height)
  buf[p++] = (h >> 8) & 0xFF;  // yH
  
  // Copy image data
  const result = new Uint8Array(p + imgData.length + 8);
  result.set(buf.subarray(0, p));
  result.set(imgData, p);
  p += imgData.length;
  
  // Feed + FULL CUT
  result[p++]=0x0A; result[p++]=0x0A; result[p++]=0x0A;
  result[p++]=0x1D; result[p++]=0x56; result[p++]=0x41; result[p++]=0x00;
  
  return result.subarray(0, p);
}

// ESC * mode (bit image) - الطريقة القديمة المتوافقة
function toEscPos(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const px = ctx.getImageData(0,0,w,h).data;
  const dark = (cx,cy) => {
    if (cx>=w||cy>=h) return 0;
    const i=(cy*w+cx)*4;
    return (px[i]*.299+px[i+1]*.587+px[i+2]*.114)<128?1:0;
  };

  const S=24, nL=w&0xFF, nH=(w>>8)&0xFF;
  const strips=Math.ceil(h/S);
  // Max possible size (will use less with blank strip optimization)
  const buf=new Uint8Array(8 + strips*(5+w*3+1) + 12);
  let p=0;

  // ESC @ init
  buf[p++]=0x1B; buf[p++]=0x40;
  // ESC a 1 = center align
  buf[p++]=0x1B; buf[p++]=0x61; buf[p++]=0x01;
  // ESC 3 24 = line spacing
  buf[p++]=0x1B; buf[p++]=0x33; buf[p++]=S;

  for (let sy=0; sy<h; sy+=S) {
    // Check if this strip is entirely blank (white)
    let blank = true;
    for (let col=0; col<w && blank; col++) {
      for (let b=0; b<S && blank; b++) {
        if (dark(col, sy+b)) blank = false;
      }
    }

    if (blank) {
      // Skip blank strip - just send line feed (1 byte instead of ~1560)
      buf[p++]=0x0A;
    } else {
      // Send actual bitmap data
      buf[p++]=0x1B; buf[p++]=0x2A; buf[p++]=33; buf[p++]=nL; buf[p++]=nH;
      for (let col=0; col<w; col++) {
        let b0=0,b1=0,b2=0;
        for(let b=0;b<8;b++){if(dark(col,sy+b))b0|=(0x80>>b);}
        for(let b=0;b<8;b++){if(dark(col,sy+8+b))b1|=(0x80>>b);}
        for(let b=0;b<8;b++){if(dark(col,sy+16+b))b2|=(0x80>>b);}
        buf[p++]=b0; buf[p++]=b1; buf[p++]=b2;
      }
      buf[p++]=0x0A;
    }
  }

  // ESC 2 = reset line spacing
  buf[p++]=0x1B; buf[p++]=0x32;
  // Feed + FULL CUT
  buf[p++]=0x0A; buf[p++]=0x0A; buf[p++]=0x0A;
  // GS V A 0 = FULL CUT
  buf[p++]=0x1D; buf[p++]=0x56; buf[p++]=0x41; buf[p++]=0x00;

  return buf.subarray(0, p);
}

function toB64(arr) {
  const C=8192; let s='';
  for(let i=0;i<arr.length;i+=C) s+=String.fromCharCode.apply(null,arr.subarray(i,Math.min(i+C,arr.length)));
  return btoa(s);
}

// ======== MAIN EXPORT ========
export async function renderReceiptBitmap(order, config = {}) {
  try {
    const isK = config.printer_type === 'kitchen';
    const canvas = isK ? await renderKitchen(order) : await renderReceipt(order);
    const bytes = toEscPos(canvas);
    const b64 = toB64(bytes);
    console.log(`[Receipt] ${isK?'Kitchen':'Receipt'}: ${canvas.width}x${canvas.height}px, ${bytes.length}b`);
    return { success: true, raw_data: b64, size: bytes.length };
  } catch (e) {
    console.error('[Receipt] Error:', e);
    return { success: false, error: e.message };
  }
}

// ======== CLOSING RECEIPT BITMAP ========
export function renderClosingReceiptBitmap(data = {}) {
  try {
    const RW = PW; // نفس عرض فواتير الطلبات (520px) اللي تشتغل صح
    const RM = 6;
    const RC = RW - RM * 2;
    const c = document.createElement('canvas');
    c.width = RW; c.height = 6000;
    const x = c.getContext('2d');
    x.fillStyle='#FFF'; x.fillRect(0,0,RW,6000);
    x.fillStyle='#000';
    let y = 20;
    const fp = n => `${Number(n||0).toLocaleString()} IQD`;

    // === الشعار ===
    // رسم شعار بسيط (دائرة مع حرف)
    const logoSize = 60;
    x.beginPath();
    x.arc(RW/2, y + logoSize/2, logoSize/2, 0, Math.PI * 2);
    x.fillStyle = '#000'; x.fill();
    x.fillStyle = '#FFF'; x.font = 'bold 28px Arial';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const initial = (data.restaurantName || 'M')[0];
    x.fillText(initial, RW/2, y + logoSize/2);
    x.fillStyle = '#000';
    y += logoSize + 12;

    // === اسم المطعم ===
    if (data.restaurantName) {
      y += invH(x, data.restaurantName, y, 30);
    }
    
    // === اسم الفرع ===
    if (data.branchName) {
      y += drawC(x, data.branchName, y, 22, true);
    }
    y += 8;
    
    // === إيصال إغلاق الصندوق ===
    y += drawC(x, 'إيصال إغلاق الصندوق', y, 26, true);
    y += 10;
    
    if (data.dateStr) y += drawC(x, `التاريخ: ${data.dateStr}`, y, 20);
    if (data.timeStr) y += drawC(x, `الوقت: ${data.timeStr}`, y, 20);
    if (data.cashierName) y += drawC(x, `الكاشير: ${data.cashierName}`, y, 20);
    y += 8; y += dbl(x, y); y += 8;

    // === ملخص المبيعات ===
    y += drawC(x, 'ملخص المبيعات', y, 24, true);
    y += 8;
    y += drawRow(x, 'إجمالي المبيعات:', fp(data.total_sales), y, 22);
    y += drawRow(x, 'عدد الطلبات:', `${data.total_orders || 0}`, y, 20);
    y += 8; y += dash(x, y); y += 8;

    // === حسب طريقة الدفع ===
    y += drawC(x, 'حسب طريقة الدفع', y, 22, true);
    y += 8;
    y += drawRow(x, 'نقدي:', fp(data.cash_sales), y, 20);
    y += drawRow(x, 'بطاقة:', fp(data.card_sales), y, 20);
    y += drawRow(x, 'آجل:', fp(data.credit_sales), y, 20);
    y += 8; y += dash(x, y); y += 8;

    // === مبيعات تطبيقات التوصيل ===
    if (data.delivery_app_sales && Object.keys(data.delivery_app_sales).length > 0) {
      y += drawC(x, 'تطبيقات التوصيل', y, 22, true);
      y += 8;
      for (const [app, amount] of Object.entries(data.delivery_app_sales)) {
        y += drawRow(x, `${app}:`, fp(amount), y, 20);
      }
      y += 8; y += dash(x, y); y += 8;
    }

    // === المصاريف والخصومات ===
    y += drawC(x, 'المصاريف والخصومات', y, 22, true);
    y += 8;
    y += drawRow(x, 'المصاريف:', fp(data.total_expenses), y, 20);
    y += drawRow(x, 'الخصومات:', fp(data.total_discounts || data.discounts_total || 0), y, 20);
    y += drawRow(x, `المرتجعات (${data.refund_count || 0}):`, fp(data.total_refunds || 0), y, 20);
    y += drawRow(x, `الإلغاءات (${data.cancelled_orders || 0}):`, fp(data.cancelled_amount || 0), y, 20);
    y += 8; y += dash(x, y); y += 8;

    // === جرد الصندوق ===
    y += drawC(x, 'جرد الصندوق', y, 24, true);
    y += 8;
    const expectedCash = data.expected_cash || 0;
    const countedCash = data.closing_cash || data.counted_cash || 0;
    const difference = countedCash - expectedCash;
    y += drawRow(x, 'المتوقع:', fp(expectedCash), y, 22);
    y += drawRow(x, 'الجرد الفعلي:', fp(countedCash), y, 22);
    y += 8; y += dash(x, y); y += 8;

    // === الفرق ===
    if (difference > 0) {
      y += drawRow(x, 'زيادة:', `+${fp(Math.abs(difference))}`, y, 24);
    } else if (difference < 0) {
      y += drawRow(x, 'نقص:', `-${fp(Math.abs(difference))}`, y, 24);
    }

    // === صافي النقدي ===
    y += 8; y += dbl(x, y); y += 4;
    y += invH(x, `صافي النقدي: ${fp(countedCash)}`, y, 28);
    y += dbl(x, y); y += 8;

    // === ملاحظات ===
    if (data.notes) {
      y += drawC(x, `ملاحظات: ${data.notes}`, y, 18);
      y += 8;
    }

    // === Footer ===
    y += 10;
    y += drawC(x, 'شكراً لاستخدامكم نظام Maestro', y, 16);
    y += drawC(x, 'www.maestroegp.com', y, 16);
    y += 40;

    // Crop canvas to actual height
    const f = document.createElement('canvas');
    f.width = RW; f.height = y;
    f.getContext('2d').drawImage(c, 0, 0);
    const bytes = toEscPos(f);
    console.log(`[ClosingReceipt] ${f.width}x${f.height}px, ${bytes.length}b`);
    return { success: true, raw_data: toB64(bytes), size: bytes.length };
  } catch (e) {
    console.error('[ClosingReceipt] Error:', e);
    return { success: false, error: e.message };
  }
}

// ======== TEST PRINT ========
export function renderTestBitmap(info = {}) {
  try {
    const c = document.createElement('canvas');
    c.width = PW; c.height = 1200;
    const x = c.getContext('2d');
    x.fillStyle='#FFF'; x.fillRect(0,0,PW,1200);
    x.fillStyle='#000';
    let y = 20;
    const {date,time} = nowStr();
    y += drawC(x, `${date} ${time}`, y, 16);
    y += 8; y += dash(x, y);
    y += drawC(x, '*** اختبار الطابعة ***', y, 28, true);
    y += 8; y += dash(x, y);
    if (info.name) y += drawC(x, info.name, y, 22, true);
    y += 6;
    if (info.connection_type==='usb') y += drawC(x, `USB: ${info.usb_printer_name||''}`, y, 18);
    else y += drawC(x, `IP: ${info.ip_address||''}:${info.port||9100}`, y, 18);
    if (info.branch_name) { y+=4; y += drawC(x, `${info.branch_name} :الفرع`, y, 20); }
    y += 6; y += dash(x, y);
    y += drawC(x, `${date} :التاريخ`, y, 20);
    y += drawC(x, `${time} :الوقت`, y, 20);
    y += 6; y += dash(x, y);
    y += drawC(x, 'الطباعة تعمل بنجاح!', y, 26, true);
    y += 8; y += dbl(x, y);
    y += drawC(x, 'Maestro EGP', y, 18, true);
    y += 30;
    const f = document.createElement('canvas');
    f.width = PW; f.height = y;
    f.getContext('2d').drawImage(c, 0, 0);
    const bytes = toEscPos(f);
    return { success: true, raw_data: toB64(bytes), size: bytes.length };
  } catch (e) {
    console.error('[TestPrint]', e);
    return { success: false, error: e.message };
  }
}
