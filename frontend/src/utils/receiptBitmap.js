/**
 * Maestro POS - Receipt Bitmap Generator (Browser-side)
 * 80mm thermal receipt (576px width at 8 dots/mm)
 * Supports Arabic natively via Canvas API
 * Matches POS preview exactly
 */

const PW = 576; // 80mm printer = 72mm print area = 576 dots at 8dpi
const MARGIN = 16;
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

function drawRow(ctx, rightText, leftText, y, fontSize = 18) {
  if (rightText) drawText(ctx, rightText, PW - MARGIN, y, fontSize, 'right');
  if (leftText) drawText(ctx, leftText, MARGIN, y, fontSize, 'left');
  return fontSize + 6;
}

function drawCenter(ctx, text, y, fontSize = 18, bold = false) {
  return drawWrappedText(ctx, text, PW / 2, y, CONTENT_W, fontSize, 'center', bold);
}

/** Double separator (=====) */
function drawDoubleSep(ctx, y) {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 2);
  ctx.lineTo(PW - MARGIN, y + 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 7);
  ctx.lineTo(PW - MARGIN, y + 7);
  ctx.stroke();
  return 16;
}

/** Dashed separator (-----) */
function drawDashedSep(ctx, y) {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 4);
  ctx.lineTo(PW - MARGIN, y + 4);
  ctx.stroke();
  ctx.setLineDash([]);
  return 12;
}

/** Inverse header - black bg with white text */
function drawInverseHeader(ctx, text, y, fontSize = 22) {
  const fontFamily = isArabic(text) ? FONT_AR : FONT_EN;
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  const textWidth = ctx.measureText(text).width;
  const padH = 12;
  const padV = 6;
  const boxW = Math.min(textWidth + padH * 2, CONTENT_W);
  const boxH = fontSize + padV * 2;
  const boxX = (PW - boxW) / 2;

  ctx.fillStyle = '#000';
  ctx.fillRect(boxX, y, boxW, boxH);

  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (isArabic(text)) ctx.direction = 'rtl';
  ctx.fillText(text, PW / 2, y + padV);
  ctx.direction = 'ltr';

  ctx.fillStyle = '#000';
  return boxH + 6;
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

/** Load image from URL/base64 */
function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Main receipt canvas renderer - matches POS preview
 * Now async to support logo loading
 */
async function renderReceiptCanvas(order, config = {}) {
  const showPrices = config.show_prices !== false;
  const isKitchen = config.printer_type === 'kitchen';
  
  // Pre-load images
  const [logoImg, sysLogoImg] = await Promise.all([
    !isKitchen ? loadImage(order.logo_base64 || order.logo_url) : Promise.resolve(null),
    !isKitchen ? loadImage(order.system_logo_base64 || order.system_logo_url) : Promise.resolve(null)
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = PW;
  canvas.height = 6000;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PW, 6000);
  ctx.fillStyle = '#000000';
  
  let y = 20;

  // ========== HEADER ==========
  
  // Restaurant logo (circular)
  if (!isKitchen && logoImg) {
    const logoSize = 90;
    const logoX = (PW - logoSize) / 2;
    // Draw circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, y + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logoImg, logoX, y, logoSize, logoSize);
    ctx.restore();
    // Circle border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, y + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    y += logoSize + 10;
  }

  // Restaurant name
  const restName = order.restaurant_name || '';
  if (restName) {
    y += drawCenter(ctx, restName, y, isKitchen ? 30 : 28, true);
    y += 2;
  }

  // Phone numbers
  if (!isKitchen) {
    const phones = [];
    if (order.phone) phones.push(order.phone);
    if (order.phone2) phones.push(order.phone2);
    if (phones.length > 0) {
      y += drawCenter(ctx, phones.join(' - '), y, 15, false);
    }
    
    // Restaurant address
    if (order.address) {
      y += drawCenter(ctx, order.address, y, 15, false);
    }
  }

  // Branch name
  if (order.branch_name) {
    y += drawCenter(ctx, order.branch_name, y, 17, true);
    y += 2;
  }

  // Kitchen section name
  if (isKitchen && order.section_name) {
    y += drawCenter(ctx, `[ ${order.section_name} ]`, y, 26, true);
    y += 4;
  }

  // Tax number
  if (!isKitchen && order.tax_number && order.show_tax !== false) {
    y += drawCenter(ctx, `${order.tax_number} :TIN`, y, 13, false);
  }

  // Dashed separator
  y += drawDashedSep(ctx, y);

  // ========== INVOICE INFO ==========
  
  // Invoice number - inverse header (black bg, white text)
  if (order.order_number) {
    const invoiceLabel = isKitchen ? `#${order.order_number} :` : `#${order.order_number} :`;
    if (isKitchen) {
      y += drawInverseHeader(ctx, invoiceLabel, y, 24);
    } else {
      y += drawInverseHeader(ctx, invoiceLabel, y, 22);
    }
  }

  // Date and time
  y += drawCenter(ctx, `${dateStr()} - ${time12()}`, y, 15, false);

  // Cashier name
  if (!isKitchen && order.cashier_name) {
    y += drawCenter(ctx, `${order.cashier_name} :`, y, 15, false);
  }

  // Dashed separator
  y += drawDashedSep(ctx, y);

  // ========== ORDER TYPE ==========
  const orderTypes = {
    'dine_in': '\u0637\u0644\u0628 \u062F\u0627\u062E\u0644\u064A',
    'takeaway': '\u0637\u0644\u0628 \u0633\u0641\u0631\u064A',
    'delivery': '\u0637\u0644\u0628 \u062A\u0648\u0635\u064A\u0644',
    'delivery_company': '\u0634\u0631\u0643\u0629 \u062A\u0648\u0635\u064A\u0644'
  };
  const orderTypeText = orderTypes[order.order_type] || order.order_type || '';
  if (orderTypeText) {
    y += drawCenter(ctx, orderTypeText, y, 22, true);
    y += 2;
  }

  // Order details by type
  if (order.order_type === 'dine_in' && order.table_number) {
    y += drawCenter(ctx, `${order.table_number} :`, y, 20, true);
  }

  if (order.order_type === 'takeaway') {
    if (order.buzzer_number) {
      y += drawCenter(ctx, `${order.buzzer_number} :`, y, 18, true);
    }
    if (order.customer_name) {
      y += drawCenter(ctx, order.customer_name, y, 17, false);
    }
  }

  if (order.order_type === 'delivery') {
    if (order.customer_name) {
      y += drawRow(ctx, `${order.customer_name} :`, '', y, 17);
    }
    if (order.customer_phone) {
      y += drawRow(ctx, `${order.customer_phone} :`, '', y, 16);
    }
    if (order.delivery_address) {
      y += drawRow(ctx, `${order.delivery_address} :`, '', y, 16);
    }
    if (order.driver_name) {
      y += drawRow(ctx, `${order.driver_name} :`, '', y, 17);
    }
    if (order.delivery_company) {
      y += drawRow(ctx, `${order.delivery_company} :`, '', y, 17);
    }
  }

  // Custom header text
  if (!isKitchen && order.custom_header) {
    y += 4;
    y += drawCenter(ctx, order.custom_header, y, 14, false);
  }

  // ========== DOUBLE SEPARATOR ==========
  y += drawDoubleSep(ctx, y);

  // ========== ITEMS TABLE HEADER ==========
  if (!isKitchen) {
    const headerFontSize = 16;
    ctx.font = `bold ${headerFontSize}px ${FONT_AR}`;
    ctx.textBaseline = 'top';
    
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillText('\u0627\u0644\u0635\u0646\u0641', PW - MARGIN, y);
    ctx.textAlign = 'center';
    ctx.fillText('\u0627\u0644\u0643\u0645\u064A\u0629', PW / 2, y);
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillText('\u0627\u0644\u0633\u0639\u0631', MARGIN, y);
    ctx.direction = 'ltr';
    y += headerFontSize + 6;
    
    // Line under headers
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PW - MARGIN, y);
    ctx.stroke();
    y += 6;
  }

  // ========== ITEMS ==========
  const items = order.items || [];
  const itemFontSize = isKitchen ? 24 : 18;
  
  for (const item of items) {
    const name = item.product_name || item.name || '';
    const qty = item.quantity || 1;
    
    if (isKitchen) {
      drawText(ctx, name, PW - MARGIN, y, itemFontSize, 'right', true);
      drawText(ctx, `x${qty}`, MARGIN, y, itemFontSize, 'left', true);
      y += itemFontSize + 10;
    } else {
      const linePrice = (item.price || 0) * qty;
      
      // Item name - right
      drawText(ctx, name, PW - MARGIN, y, itemFontSize, 'right');
      // Quantity - center
      ctx.font = `bold ${itemFontSize}px ${FONT_EN}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.direction = 'ltr';
      ctx.fillText(`${qty}`, PW / 2, y);
      // Price - left
      drawText(ctx, formatNum(linePrice), MARGIN, y, itemFontSize, 'left');
      y += itemFontSize + 8;
    }
    
    // Item notes
    if (item.notes) {
      y += drawRow(ctx, `>> ${item.notes}`, '', y, 14);
    }
    
    // Extras
    const extras = item.extras || item.selectedExtras || [];
    if (extras.length > 0) {
      for (const extra of extras) {
        const extraName = extra.name || '';
        if (showPrices && extra.price) {
          y += drawRow(ctx, `  + ${extraName}`, `${formatNum(extra.price)}`, y, 14);
        } else if (extraName) {
          y += drawRow(ctx, `  + ${extraName}`, '', y, 14);
        }
      }
    }
  }

  // ========== DOUBLE SEPARATOR ==========
  y += drawDoubleSep(ctx, y);

  // ========== TOTALS (receipt only) ==========
  if (showPrices && !isKitchen) {
    // Subtotal
    if (order.subtotal !== undefined && order.subtotal !== order.total) {
      y += drawRow(ctx, '\u0627\u0644\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064A:', formatNum(order.subtotal), y, 18);
    }

    // Discount
    const discount = order.discount || 0;
    if (discount > 0) {
      y += drawRow(ctx, '\u0627\u0644\u062E\u0635\u0645:', `-${formatNum(discount)}`, y, 18);
    }

    // Thick line before total
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y + 2);
    ctx.lineTo(PW - MARGIN, y + 2);
    ctx.stroke();
    y += 10;

    // Grand total - large bold
    const total = order.total || 0;
    drawText(ctx, '\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0646\u0647\u0627\u0626\u064A:', PW - MARGIN, y, 24, 'right', true);
    drawText(ctx, formatNum(total), MARGIN, y, 24, 'left', true);
    y += 32;

    // Payment method
    const payMethods = {
      'cash': '\u0646\u0642\u062F\u064A',
      'card': '\u0628\u0637\u0627\u0642\u0629',
      'credit': '\u0622\u062C\u0644',
      'delivery_company': '\u0634\u0631\u0643\u0629 \u062A\u0648\u0635\u064A\u0644',
      'pending': ''
    };
    const payText = payMethods[order.payment_method] || order.payment_method || '';
    if (payText) {
      y += drawRow(ctx, '\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062F\u0641\u0639:', payText, y, 17);
    }
  }

  // ========== CUSTOM FOOTER ==========
  if (!isKitchen && order.custom_footer) {
    y += drawDashedSep(ctx, y);
    y += drawCenter(ctx, order.custom_footer, y, 14, false);
  }

  // ========== DASHED SEPARATOR ==========
  y += drawDashedSep(ctx, y);

  // ========== FOOTER ==========
  if (!isKitchen) {
    // Thank you message
    const thankMsg = order.thank_you_message || '\u0634\u0643\u0631\u0627\u064B \u0644\u0632\u064A\u0627\u0631\u062A\u0643\u0645';
    y += drawCenter(ctx, thankMsg, y, 18, true);
    y += 6;
  }

  // Print time
  y += drawCenter(ctx, `${dateStr()} ${time12()}`, y, 13, false);
  y += 6;

  // System logo
  if (!isKitchen && sysLogoImg) {
    const sLogoSize = 50;
    const sLogoX = (PW - sLogoSize) / 2;
    ctx.drawImage(sysLogoImg, sLogoX, y, sLogoSize, sLogoSize);
    y += sLogoSize + 4;
  }

  // System name
  const sysName = order.system_name || 'Maestro EGP';
  y += drawCenter(ctx, sysName, y, 14, true);
  y += 20;

  // Trim canvas to actual height
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = PW;
  finalCanvas.height = y;
  const fctx = finalCanvas.getContext('2d');
  fctx.drawImage(canvas, 0, 0);
  
  return finalCanvas;
}

/**
 * Convert Canvas to ESC/POS bitmap bytes
 * Uses ESC * 33 (24-dot double-density) column mode
 */
function canvasToEscPos(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const pixels = imgData.data;
  
  function getPixel(x, y) {
    if (x >= w || y >= h) return 0;
    const idx = (y * w + x) * 4;
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];
    return (r * 0.299 + g * 0.587 + b * 0.114) < 128 ? 1 : 0;
  }
  
  const STRIP_H = 24;
  const nCols = w;
  const nL = nCols & 0xFF;
  const nH = (nCols >> 8) & 0xFF;
  
  const numStrips = Math.ceil(h / STRIP_H);
  const stripDataSize = 5 + nCols * 3 + 1;
  const totalEstimate = 2 + 3 + (numStrips * stripDataSize) + 3 + 8;
  const bytes = new Uint8Array(totalEstimate);
  let pos = 0;
  
  // ESC @ - Initialize printer
  bytes[pos++] = 0x1B;
  bytes[pos++] = 0x40;
  
  // ESC 3 n - Set line spacing to 24 dots
  bytes[pos++] = 0x1B;
  bytes[pos++] = 0x33;
  bytes[pos++] = STRIP_H;
  
  for (let stripStart = 0; stripStart < h; stripStart += STRIP_H) {
    // ESC * 33 nL nH
    bytes[pos++] = 0x1B;
    bytes[pos++] = 0x2A;
    bytes[pos++] = 33;
    bytes[pos++] = nL;
    bytes[pos++] = nH;
    
    for (let col = 0; col < nCols; col++) {
      let b0 = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (getPixel(col, stripStart + bit)) b0 |= (0x80 >> bit);
      }
      let b1 = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (getPixel(col, stripStart + 8 + bit)) b1 |= (0x80 >> bit);
      }
      let b2 = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (getPixel(col, stripStart + 16 + bit)) b2 |= (0x80 >> bit);
      }
      bytes[pos++] = b0;
      bytes[pos++] = b1;
      bytes[pos++] = b2;
    }
    
    bytes[pos++] = 0x0A;
  }
  
  // ESC 2 - Reset line spacing
  bytes[pos++] = 0x1B;
  bytes[pos++] = 0x32;
  
  // Feed paper
  bytes[pos++] = 0x0A;
  bytes[pos++] = 0x0A;
  bytes[pos++] = 0x0A;
  bytes[pos++] = 0x0A;
  
  // GS V B 0 - Partial cut
  bytes[pos++] = 0x1D;
  bytes[pos++] = 0x56;
  bytes[pos++] = 0x42;
  bytes[pos++] = 0x00;
  
  return bytes.subarray(0, pos);
}

/**
 * Convert Uint8Array to base64
 */
function uint8ToBase64(uint8Array) {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < uint8Array.length; i += CHUNK) {
    const slice = uint8Array.subarray(i, Math.min(i + CHUNK, uint8Array.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

/**
 * Generate ESC/POS print-ready data as base64
 * NOW ASYNC to support logo loading
 */
export async function renderReceiptBitmap(order, config = {}) {
  try {
    const canvas = await renderReceiptCanvas(order, config);
    const escposBytes = canvasToEscPos(canvas);
    const base64 = uint8ToBase64(escposBytes);
    
    console.log(`[ReceiptBitmap] Rendered OK: ${canvas.width}x${canvas.height}px, ${escposBytes.length} bytes, base64=${base64.length} chars`);
    return { success: true, raw_data: base64, size: escposBytes.length };
  } catch (err) {
    console.error('[ReceiptBitmap] Render failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Test page canvas renderer
 */
function renderTestPageCanvas(printerInfo = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = PW;
  canvas.height = 2000;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PW, 2000);
  ctx.fillStyle = '#000000';
  
  let y = 20;

  y += drawCenter(ctx, `${dateStr()} ${time12()}          `, y, 14, false);
  y += 10;
  y += drawDashedSep(ctx, y);

  y += drawCenter(ctx, '*** \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0637\u0627\u0628\u0639\u0629 ***', y, 26, true);
  y += 10;
  y += drawDashedSep(ctx, y);

  if (printerInfo.name) {
    y += drawCenter(ctx, printerInfo.name, y, 22, true);
    y += 6;
  }

  if (printerInfo.connection_type === 'usb') {
    y += drawCenter(ctx, `USB: ${printerInfo.usb_printer_name || ''}`, y, 17, false);
  } else {
    y += drawCenter(ctx, 'IP:', y, 17, false);
    y += drawCenter(ctx, `${printerInfo.ip_address || ''}:${printerInfo.port || 9100}`, y, 17, false);
  }
  y += 6;

  if (printerInfo.branch_name) {
    y += drawCenter(ctx, `${printerInfo.branch_name} :`, y, 18, false);
  }
  y += 6;
  y += drawDashedSep(ctx, y);

  y += drawCenter(ctx, `${dateStr()} :`, y, 18, false);
  y += drawCenter(ctx, `${time12()} :`, y, 18, false);
  y += 6;
  y += drawDashedSep(ctx, y);

  y += drawCenter(ctx, '\u0627\u0644\u0637\u0628\u0627\u0639\u0629 \u062A\u0639\u0645\u0644 \u0628\u0646\u062C\u0627\u062D!', y, 24, true);
  y += 10;
  y += drawDoubleSep(ctx, y);

  y += drawCenter(ctx, 'Maestro EGP', y, 16, true);
  y += 20;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = PW;
  finalCanvas.height = y;
  const fctx = finalCanvas.getContext('2d');
  fctx.drawImage(canvas, 0, 0);
  
  return finalCanvas;
}

/**
 * Generate test page ESC/POS as base64
 */
export function renderTestBitmap(printerInfo = {}) {
  try {
    const canvas = renderTestPageCanvas(printerInfo);
    const escposBytes = canvasToEscPos(canvas);
    const base64 = uint8ToBase64(escposBytes);
    
    console.log(`[TestBitmap] Rendered OK: ${canvas.width}x${canvas.height}px, ${escposBytes.length} bytes`);
    return { success: true, raw_data: base64, size: escposBytes.length };
  } catch (err) {
    console.error('[TestBitmap] Render failed:', err);
    return { success: false, error: err.message };
  }
}
