/**
 * Maestro POS - Print Service v3.0
 * يولد الإيصال كصورة bitmap مباشرة في المتصفح (يدعم العربية)
 * ثم يرسله للوكيل المحلي (localhost:9999)
 * 
 * التدفق: Browser Canvas → ESC/POS Bitmap → Print Agent → Printer
 */

import { renderReceiptBitmap, renderTestBitmap } from './receiptBitmap';

const PRINT_AGENT_URL = 'http://localhost:9999';

/**
 * فحص حالة وكيل الطباعة
 */
export const checkAgentStatus = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${PRINT_AGENT_URL}/status`, {
      mode: 'cors',
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    return data.status === 'running';
  } catch {
    return false;
  }
};

/**
 * فحص دعم USB
 */
export const agentSupportsUsb = async () => {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/status`);
    const data = await res.json();
    if (data.usb_support !== true) return false;
    const major = parseInt(String(data.version || '0').split('.')[0]) || 0;
    return (major >= 3);
  } catch {
    return false;
  }
};

/**
 * فحص إذا الوكيل يحتاج تحديث بمقارنة الإصدار مع السيرفر
 */
export const checkAgentVersionMatch = async (backendUrl) => {
  try {
    const agentRes = await fetch(`${PRINT_AGENT_URL}/status`);
    const agentData = await agentRes.json();
    const agentVersion = String(agentData.version || '0').trim();

    const serverRes = await fetch(`${backendUrl}/api/print-agent-version`);
    const serverData = await serverRes.json();
    const latestVersion = String(serverData.version || '0').trim();

    return { match: agentVersion === latestVersion, agentVersion, latestVersion };
  } catch {
    return { match: true, agentVersion: '?', latestVersion: '?' };
  }
};

/**
 * جلب قائمة الطابعات من الوكيل
 */
export const listAgentPrinters = async () => {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/list-printers`);
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * فحص طابعة شبكية
 */
export const checkPrinterOnline = async (ip, port = 9100) => {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/check-printer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * إرسال طباعة تجريبية
 * للـ USB: يولد صفحة اختبار كاملة بالعربية عبر Canvas/bitmap ثم يرسلها عبر /print-receipt
 * للشبكة: يرسل عبر /print-test العادي (يولد صفحة عربية كاملة من الوكيل)
 */
export const sendTestPrint = async (printer, branchName = '') => {
  try {
    // USB: توليد صفحة اختبار كبيرة عبر Canvas bitmap (مثل طابعات الشبكة)
    if (printer.connection_type === 'usb' && printer.usb_printer_name) {
      const renderResult = renderTestBitmap({
        name: printer.name || '',
        connection_type: 'usb',
        usb_printer_name: printer.usb_printer_name,
        branch_name: branchName || ''
      });
      
      if (!renderResult.success || !renderResult.raw_data) {
        return { success: false, message: 'RENDER_FAILED: ' + (renderResult.error || 'Unknown') };
      }
      
      const res = await fetch(`${PRINT_AGENT_URL}/print-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_data: renderResult.raw_data,
          usb_printer_name: printer.usb_printer_name
        })
      });
      return await res.json();
    }
    
    // شبكة: يستخدم /print-test من الوكيل (يولد صفحة عربية كبيرة)
    const payload = {
      printer_name: printer.name || 'Test',
      connection_type: printer.connection_type || 'network'
    };
    payload.ip = printer.ip_address;
    payload.port = printer.port || 9100;
    if (branchName) payload.branch_name = branchName;
    
    const res = await fetch(`${PRINT_AGENT_URL}/print-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * طباعة نص خام
 */
export const sendRawPrint = async (ip, port, text, usbPrinterName = null) => {
  try {
    const payload = { text };
    if (usbPrinterName) {
      payload.usb_printer_name = usbPrinterName;
    } else {
      payload.ip = ip;
      payload.port = port;
    }
    const res = await fetch(`${PRINT_AGENT_URL}/print-raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * طباعة إيصال - الدالة الرئيسية
 * الفاتورة: bitmap من المتصفح (نفس الشكل الأصلي تماماً)
 * المطبخ USB: بيانات مباشرة للوكيل (نصي سريع)
 */
export const sendReceiptPrint = async (printer, orderData) => {
  try {
    const isKitchen = printer.print_mode === 'orders_only' || printer.print_mode === 'selected_products';
    const printerConfig = {
      show_prices: isKitchen ? false : (printer.show_prices !== false),
      print_mode: printer.print_mode || (isKitchen ? 'kitchen' : 'full_receipt'),
      printer_type: isKitchen ? 'kitchen' : 'receipt'
    };

    const printPayload = {};

    // المطبخ USB: بيانات مباشرة للوكيل (نصي سريع جداً)
    if (isKitchen && printer.connection_type === 'usb' && printer.usb_printer_name) {
      printPayload.order = orderData;
      printPayload.printer_config = printerConfig;
      printPayload.usb_printer_name = printer.usb_printer_name;
    } else {
      // الفاتورة + شبكة: bitmap من المتصفح (نفس الشكل الأصلي)
      const renderResult = await renderReceiptBitmap(orderData, printerConfig);
      if (!renderResult.success || !renderResult.raw_data) {
        return { success: false, message: 'RENDER_FAILED: ' + (renderResult.error || 'Unknown') };
      }
      printPayload.raw_data = renderResult.raw_data;

      if (printer.connection_type === 'usb' && printer.usb_printer_name) {
        printPayload.usb_printer_name = printer.usb_printer_name;
      } else {
        printPayload.ip = printer.ip_address;
        printPayload.port = printer.port || 9100;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${PRINT_AGENT_URL}/print-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(printPayload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const result = await res.json();
    return result;
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * توزيع العناصر على الطابعات حسب ربط المنتجات
 * العناصر تظهر فقط في الطابعة المخصصة لها - لا يوجد طابعة افتراضية
 */
export const routeOrderToPrinters = (orderItems, products, printers) => {
  const printerJobs = {};

  for (const item of orderItems) {
    const product = products.find(p => p.id === item.product_id || p.id === item.id);
    // إزالة التكرارات من printer_ids باستخدام Set
    const rawIds = Array.isArray(product?.printer_ids) ? product.printer_ids.filter(id => id) : [];
    const productPrinterIds = [...new Set(rawIds)];

    if (productPrinterIds.length > 0) {
      for (const printerId of productPrinterIds) {
        const targetPrinter = printers.find(p => p.id === printerId);
        if (targetPrinter) {
          if (!printerJobs[printerId]) printerJobs[printerId] = [];
          printerJobs[printerId].push(item);
        }
        // لا نرسل للطابعة الافتراضية - فقط الطابعة المخصصة
      }
    }
    // إذا لا يوجد printer_ids = لا يتم طباعة هذا العنصر في أي مطبخ
  }
  return printerJobs;
};

/**
 * طباعة الطلب على جميع طابعات المطبخ
 */
export const printOrderToAllPrinters = async (order, orderItems, products, printers, restaurantName = '') => {
  // نطبع مباشرة بدون checkAgentStatus لسرعة أكبر
  // الأخطاء تُعالج في sendReceiptPrint لكل طابعة

  const activePrinters = printers.filter(p =>
    (p.connection_type === 'usb' && p.usb_printer_name) ||
    (p.connection_type !== 'usb' && p.ip_address)
  );

  if (activePrinters.length === 0) {
    console.warn('[Print] No active printers found!');
    return { success: false, message: 'No configured printers', results: [] };
  }

  const printerJobs = routeOrderToPrinters(orderItems, products, activePrinters);
  
  if (Object.keys(printerJobs).length === 0) {
    return { success: false, message: 'NO_PRINTERS_MATCHED', results: [] };
  }

  // طباعة متوازية (كل الطابعات في نفس الوقت) لأقصى سرعة
  const printJobs = Object.entries(printerJobs).map(([printerId, items]) => {
    const printer = printers.find(p => p.id === printerId);
    if (!printer) return null;

    const orderData = {
      restaurant_name: restaurantName,
      order_number: order.order_number || order.id,
      order_type: order.order_type || order.orderType,
      customer_name: order.customer_name || '',
      customer_phone: order.customer_phone || '',
      delivery_address: order.delivery_address || '',
      table_number: order.table_number || order.table_id || '',
      buzzer_number: order.buzzer_number || '',
      driver_name: order.driver_name || '',
      delivery_company: order.delivery_company || '',
      cashier_name: order.cashier_name || '',
      section_name: printer.name || '',
      language: order.language || localStorage.getItem('language') || 'ar',
      logo_base64: order.logo_base64 || null,
      logo_url: order.logo_url || null,
      system_logo_base64: order.system_logo_base64 || null,
      system_logo_url: order.system_logo_url || null,
      phone: order.phone || '',
      phone2: order.phone2 || '',
      address: order.address || '',
      tax_number: order.tax_number || '',
      show_tax: order.show_tax,
      custom_header: order.is_refund ? '*** مرتجع ***' : order.is_cancel ? '*** تم الحذف ***' : (order.custom_header || ''),
      custom_footer: order.custom_footer || '',
      thank_you_message: order.thank_you_message || '',
      system_name: order.system_name || 'Maestro EGP',
      branch_name: order.branch_name || '',
      order_notes: order.notes || order.order_notes || '',
      is_refund: order.is_refund || false,
      is_cancel: order.is_cancel || false,
      items: items,
      total: items.reduce((sum, item) => {
        const extras = (item.extras || item.selectedExtras || []).reduce((s, e) => s + ((e.price || 0) * (e.quantity || 1)), 0);
        return sum + ((item.price + extras) * (item.quantity || 1));
      }, 0),
      discount: order.discount || 0,
      payment_method: order.payment_method || '',
      qr_url: order.qr_url || '',
      contact_message: order.contact_message || ''
    };

    return sendReceiptPrint(printer, orderData).then(result => ({
      printer_id: printerId,
      printer_name: printer.name,
      printer_type: printer.printer_type,
      connection_type: printer.connection_type,
      ...result
    })).catch(err => ({
      printer_id: printerId,
      printer_name: printer.name,
      success: false,
      message: err.message
    }));
  }).filter(Boolean);

  const validResults = await Promise.all(printJobs);

  const allSuccess = validResults.length > 0 && validResults.every(r => r.success);

  return {
    success: allSuccess,
    message: validResults.length === 0 ? 'NO_PRINTERS_MATCHED' : (allSuccess ? 'All printers done' : 'Some printers failed'),
    results: validResults
  };
};

export default {
  checkAgentStatus,
  agentSupportsUsb,
  checkAgentVersionMatch,
  listAgentPrinters,
  checkPrinterOnline,
  sendTestPrint,
  sendRawPrint,
  sendReceiptPrint,
  routeOrderToPrinters,
  printOrderToAllPrinters
};
