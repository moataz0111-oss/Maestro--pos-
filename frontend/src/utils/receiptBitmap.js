/**
 * Maestro POS - Receipt Bitmap Generator
 * 80mm thermal (608px = 76mm at 8 dots/mm)
 * Arabic support via Canvas API
 */

const PW = 608;  // 76mm print width (centered on 80mm paper)
const MARGIN = 8;
const CW = PW - MARGIN * 2; // content width = 592
const FONT = '"Cairo", "Noto Sans Arabic", "Segoe UI", "Tahoma", sans-serif';

const isAr = t => /[\u0600-\u06FF\uFE70-\uFEFF]/.test(t);
const fmt = n => Number(n || 0).toLocaleString('en-US');
const pad2 = n => String(n).padStart(2, '0');

function nowStr() {
  const d = new Date();
  let h = d.getHours(); const m = pad2(d.getMinutes());
  const ap = h < 12 ? 'AM' : 'PM';
  if (!h) h = 12; else if (h > 12) h -= 12;
  return { date: `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`, time: `${h}:${m} ${ap}` };
}

function font(size, bold, text) {
  return `${bold?'bold ':''}${size}px ${isAr(text)?FONT:'"Courier New",monospace'}`;
}

// Draw centered text with word wrap, returns total height
function drawC(ctx, text, y, size = 20, bold = false) {
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
function drawR(ctx, text, y, size = 20, bold = false, maxW = CW) {
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

// Draw left=value right=label row
function drawRow(ctx, label, value, y, size = 20) {
  if (label) { ctx.font = font(size, false, label); ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.direction = isAr(label)?'rtl':'ltr'; ctx.fillText(label, PW-MARGIN, y); ctx.direction = 'ltr'; }
  if (value) { ctx.font = font(size, false, value); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.direction = 'ltr'; ctx.fillText(value, MARGIN, y); }
  return size + 8;
}

// Dashed line
function dash(ctx, y) {
  ctx.strokeStyle='#000'; ctx.lineWidth=1; ctx.setLineDash([5,3]);
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
function invH(ctx, text, y, size = 28) {
  ctx.font = font(size, true, text);
  const tw = ctx.measureText(text).width;
  const bw = Math.min(tw + 32, CW);
  const bh = size + 16;
  const bx = (PW - bw) / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(bx, y, bw, bh);
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.direction = isAr(text)?'rtl':'ltr';
  ctx.fillText(text, PW/2, y + 8);
  ctx.direction = 'ltr'; ctx.fillStyle = '#000';
  return bh + 10;
}

// Load image with SHORT timeout (500ms max)
function loadImg(src) {
  return new Promise(r => {
    if (!src) return r(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => r(img);
    img.onerror = () => r(null);
    setTimeout(() => r(null), 500); // 500ms max!
    img.src = src;
  });
}

// ======== CUSTOMER RECEIPT ========
async function renderReceipt(order) {
  // Load logos with very short timeout
  const [logo, sysLogo] = await Promise.all([
    loadImg(order.logo_base64 || order.logo_url),
    loadImg(order.system_logo_base64 || order.system_logo_url)
  ]);

  const c = document.createElement('canvas');
  c.width = PW; c.height = 8000;
  const x = c.getContext('2d');
  x.fillStyle = '#FFF'; x.fillRect(0,0,PW,8000);
  x.fillStyle = '#000';

  let y = 30;

  // ===== LOGO (large, centered) =====
  if (logo) {
    const sz = 160;
    const lx = (PW-sz)/2;
    x.save();
    x.beginPath(); x.arc(lx+sz/2, y+sz/2, sz/2, 0, Math.PI*2); x.clip();
    x.drawImage(logo, lx, y, sz, sz);
    x.restore();
    x.strokeStyle='#000'; x.lineWidth=2;
    x.beginPath(); x.arc(lx+sz/2, y+sz/2, sz/2, 0, Math.PI*2); x.stroke();
    y += sz + 16;
  }

  // ===== RESTAURANT NAME (very large) =====
  if (order.restaurant_name) {
    y += drawC(x, order.restaurant_name, y, 36, true);
    y += 6;
  }

  // Phone
  const phones = [order.phone, order.phone2].filter(Boolean);
  if (phones.length) y += drawC(x, phones.join(' - '), y, 20);

  // Address
  if (order.address) y += drawC(x, order.address, y, 20);

  // Branch
  if (order.branch_name) { y += 4; y += drawC(x, order.branch_name, y, 22, true); }

  // Tax
  if (order.tax_number && order.show_tax !== false)
    y += drawC(x, `${order.tax_number} :TIN`, y, 16);

  y += dash(x, y);
  y += 4;

  // ===== INVOICE NUMBER =====
  if (order.order_number)
    y += invH(x, `#${order.order_number} :فاتورة`, y, 30);

  // Date + Time
  const { date, time } = nowStr();
  y += drawC(x, `${date}  -  ${time}`, y, 20);

  // Cashier
  if (order.cashier_name)
    y += drawC(x, `${order.cashier_name} :الكاشير`, y, 20);

  y += dash(x, y);

  // ===== ORDER TYPE =====
  const types = {'dine_in':'طلب داخلي','takeaway':'طلب سفري','delivery':'طلب توصيل','delivery_company':'شركة توصيل'};
  const typeText = types[order.order_type] || order.order_type || '';
  if (typeText) { y += drawC(x, typeText, y, 28, true); y += 4; }

  // Order details
  if (order.order_type === 'dine_in' && order.table_number)
    y += drawC(x, `${order.table_number} :الطاولة`, y, 24, true);
  if (order.order_type === 'takeaway') {
    if (order.buzzer_number) y += drawC(x, `${order.buzzer_number} :رقم الجهاز`, y, 22, true);
    if (order.customer_name) y += drawC(x, order.customer_name, y, 20);
  }
  if (order.order_type === 'delivery') {
    if (order.customer_name) y += drawRow(x, `${order.customer_name} :العميل`, '', y, 20);
    if (order.customer_phone) y += drawRow(x, `${order.customer_phone} :الهاتف`, '', y, 20);
    if (order.delivery_address) y += drawRow(x, `${order.delivery_address} :العنوان`, '', y, 20);
    if (order.driver_name) y += drawRow(x, `${order.driver_name} :السائق`, '', y, 20);
    if (order.delivery_company) y += drawRow(x, `${order.delivery_company} :شركة التوصيل`, '', y, 20);
  }

  // Custom header
  if (order.custom_header) { y += 4; y += drawC(x, order.custom_header, y, 18); }

  y += dbl(x, y);
  y += 4;

  // ===== ITEMS - TWO LINE FORMAT (name on top, qty+price below) =====
  const items = order.items || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = item.product_name || item.name || '';
    const qty = item.quantity || 1;
    const price = (item.price || 0) * qty;

    // Line 1: Item name (full width, right-aligned, BIG)
    y += drawR(x, name, y, 24, true);

    // Line 2: Quantity (center) + Price (left)
    x.font = font(22, false, '1');
    x.textAlign = 'center'; x.textBaseline = 'top'; x.direction = 'ltr';
    x.fillText(`x${qty}`, PW/2, y);
    x.textAlign = 'left';
    x.fillText(fmt(price), MARGIN, y);
    y += 28;

    // Notes
    if (item.notes) { y += drawR(x, `** ${item.notes} **`, y, 18); }

    // Extras
    const extras = item.extras || item.selectedExtras || [];
    for (const ext of extras) {
      if (ext.name) {
        if (ext.price) y += drawRow(x, `  + ${ext.name}`, fmt(ext.price), y, 18);
        else y += drawR(x, `  + ${ext.name}`, y, 18);
      }
    }

    // Item separator
    if (i < items.length - 1) {
      y += 2;
      x.setLineDash([2,4]); x.beginPath();
      x.moveTo(MARGIN+40, y); x.lineTo(PW-MARGIN-40, y); x.stroke();
      x.setLineDash([]); y += 8;
    }
  }

  y += dbl(x, y);
  y += 4;

  // ===== TOTALS =====
  if (order.subtotal !== undefined && order.subtotal !== order.total)
    y += drawRow(x, 'المجموع الفرعي:', fmt(order.subtotal), y, 22);

  if (order.discount > 0)
    y += drawRow(x, 'الخصم:', `-${fmt(order.discount)}`, y, 22);

  // Thick line
  x.strokeStyle='#000'; x.lineWidth=4;
  x.beginPath(); x.moveTo(MARGIN, y+2); x.lineTo(PW-MARGIN, y+2); x.stroke();
  y += 14;

  // GRAND TOTAL (very large)
  x.font = font(32, true, 'الإجمالي النهائي:');
  x.textAlign = 'right'; x.textBaseline = 'top'; x.direction = 'rtl';
  x.fillText('الإجمالي النهائي:', PW-MARGIN, y);
  x.direction = 'ltr'; x.textAlign = 'left';
  x.font = font(32, true, '0');
  x.fillText(fmt(order.total || 0), MARGIN, y);
  y += 42;

  // Payment
  const pay = {'cash':'نقدي','card':'بطاقة','credit':'آجل','delivery_company':'شركة توصيل'};
  const payT = pay[order.payment_method] || order.payment_method || '';
  if (payT && payT !== 'pending') y += drawRow(x, 'طريقة الدفع:', payT, y, 22);

  // Custom footer
  if (order.custom_footer) { y += dash(x, y); y += drawC(x, order.custom_footer, y, 18); }

  y += dash(x, y);
  y += 6;

  // ===== THANK YOU =====
  const thank = order.thank_you_message || 'شكراً لزيارتكم';
  y += drawC(x, thank, y, 26, true);
  y += 10;

  // Date/time
  y += drawC(x, `${date} ${time}`, y, 16);
  y += 10;

  // ===== SYSTEM LOGO (bottom) =====
  if (sysLogo) {
    const sz = 70;
    x.drawImage(sysLogo, (PW-sz)/2, y, sz, sz);
    y += sz + 6;
  }

  // System name
  y += drawC(x, order.system_name || 'Maestro EGP', y, 20, true);
  y += 40; // Extra space at bottom for cut

  // Trim
  const f = document.createElement('canvas');
  f.width = PW; f.height = y;
  f.getContext('2d').drawImage(c, 0, 0);
  return f;
}

// ======== KITCHEN TICKET (instant, no images) ========
function renderKitchen(order) {
  const c = document.createElement('canvas');
  c.width = PW; c.height = 4000;
  const x = c.getContext('2d');
  x.fillStyle='#FFF'; x.fillRect(0,0,PW,4000);
  x.fillStyle='#000';
  let y = 16;

  if (order.section_name) { y += invH(x, order.section_name, y, 32); y += 4; }
  if (order.order_number) y += invH(x, `#${order.order_number} :طلب`, y, 34);

  const types = {'dine_in':'داخلي','takeaway':'سفري','delivery':'توصيل','delivery_company':'شركة توصيل'};
  y += drawC(x, types[order.order_type] || '', y, 28, true);
  if (order.table_number) y += drawC(x, `${order.table_number} :الطاولة`, y, 28, true);
  y += drawC(x, `${nowStr().date} - ${nowStr().time}`, y, 18);
  y += dbl(x, y);

  const items = order.items || [];
  for (let i = 0; i < items.length; i++) {
    const name = items[i].product_name || items[i].name || '';
    const qty = items[i].quantity || 1;
    y += drawR(x, name, y, 30, true);
    x.font = font(28, true, 'x1'); x.textAlign='left'; x.textBaseline='top'; x.direction='ltr';
    x.fillText(`x${qty}`, MARGIN, y - 34);
    if (items[i].notes) y += drawC(x, `** ${items[i].notes} **`, y, 22, true);
    const extras = items[i].extras || items[i].selectedExtras || [];
    for (const e of extras) { if (e.name) y += drawR(x, `  + ${e.name}`, y, 22); }
    if (i < items.length-1) { x.setLineDash([2,4]); x.beginPath(); x.moveTo(MARGIN+20,y); x.lineTo(PW-MARGIN-20,y); x.stroke(); x.setLineDash([]); y+=8; }
  }

  y += dbl(x, y);
  if (order.customer_name) y += drawC(x, order.customer_name, y, 24, true);
  if (order.buzzer_number) y += drawC(x, `جهاز: ${order.buzzer_number}`, y, 24, true);
  y += drawC(x, `${nowStr().date} ${nowStr().time}`, y, 14);
  y += 30;

  const f = document.createElement('canvas');
  f.width = PW; f.height = y;
  f.getContext('2d').drawImage(c, 0, 0);
  return f;
}

// ======== ESC/POS ENCODER (column mode ESC * 33) ========
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
  const buf=new Uint8Array(8 + strips*(5+w*3+1) + 12);
  let p=0;

  // ESC @ init
  buf[p++]=0x1B; buf[p++]=0x40;
  // ESC a 1 = center align
  buf[p++]=0x1B; buf[p++]=0x61; buf[p++]=0x01;
  // ESC 3 24 = line spacing
  buf[p++]=0x1B; buf[p++]=0x33; buf[p++]=S;

  for (let sy=0; sy<h; sy+=S) {
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

  // ESC 2 = reset line spacing
  buf[p++]=0x1B; buf[p++]=0x32;
  // Feed + FULL CUT
  buf[p++]=0x0A; buf[p++]=0x0A; buf[p++]=0x0A; buf[p++]=0x0A;
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
    const canvas = isK ? renderKitchen(order) : await renderReceipt(order);
    const bytes = toEscPos(canvas);
    const b64 = toB64(bytes);
    console.log(`[Receipt] ${isK?'Kitchen':'Receipt'}: ${canvas.width}x${canvas.height}px, ${bytes.length}b`);
    return { success: true, raw_data: b64, size: bytes.length };
  } catch (e) {
    console.error('[Receipt] Error:', e);
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
    y += drawC(x, `${date} ${time}`, y, 18);
    y += 8; y += dash(x, y);
    y += drawC(x, '*** اختبار الطابعة ***', y, 32, true);
    y += 8; y += dash(x, y);
    if (info.name) y += drawC(x, info.name, y, 26, true);
    y += 6;
    if (info.connection_type==='usb') y += drawC(x, `USB: ${info.usb_printer_name||''}`, y, 20);
    else y += drawC(x, `IP: ${info.ip_address||''}:${info.port||9100}`, y, 20);
    if (info.branch_name) { y+=4; y += drawC(x, `${info.branch_name} :الفرع`, y, 22); }
    y += 6; y += dash(x, y);
    y += drawC(x, `${date} :التاريخ`, y, 22);
    y += drawC(x, `${time} :الوقت`, y, 22);
    y += 6; y += dash(x, y);
    y += drawC(x, 'الطباعة تعمل بنجاح!', y, 30, true);
    y += 8; y += dbl(x, y);
    y += drawC(x, 'Maestro EGP', y, 20, true);
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
