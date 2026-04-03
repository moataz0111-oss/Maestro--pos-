/**
 * Maestro POS - Print Service v3.0
 * يولد الإيصال كصورة bitmap مباشرة في المتصفح (يدعم العربية)
 * ثم يرسله للوكيل المحلي (localhost:9999)
 * 
 * التدفق: Browser Canvas → ESC/POS Bitmap → Print Agent → Printer
 */

import { renderReceiptBitmap } from './receiptBitmap';

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
    return data.usb_support === true;
  } catch {
    return false;
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
 */
export const sendTestPrint = async (printer) => {
  try {
    const payload = {
      printer_name: printer.name || 'Test',
      connection_type: printer.connection_type || 'network'
    };
    if (printer.connection_type === 'usb' && printer.usb_printer_name) {
      payload.usb_printer_name = printer.usb_printer_name;
    } else {
      payload.ip = printer.ip_address;
      payload.port = printer.port || 9100;
    }
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
 * 1. يولد صورة ESC/POS في المتصفح (Canvas)
 * 2. يرسلها كـ raw_data للوكيل المحلي
 */
export const sendReceiptPrint = async (printer, orderData) => {
  try {
    // تحديد إعدادات الطابعة
    const isKitchen = printer.printer_type === 'kitchen';
    const printerConfig = {
      show_prices: isKitchen ? false : (printer.show_prices !== false),
      print_mode: printer.print_mode || (isKitchen ? 'kitchen' : 'full_receipt'),
      printer_type: printer.printer_type || 'receipt'
    };

    // الخطوة 1: توليد ESC/POS bitmap في المتصفح
    console.log(`[Print] Rendering receipt for ${printer.name} (${printer.printer_type})`);
    const renderResult = renderReceiptBitmap(orderData, printerConfig);
    
    if (!renderResult.success || !renderResult.raw_data) {
      console.error('[Print] Browser render failed:', renderResult.error);
      return { success: false, message: 'RENDER_FAILED: ' + (renderResult.error || 'Unknown') };
    }

    console.log(`[Print] Bitmap ready: ${renderResult.size} bytes for ${printer.name}`);

    // الخطوة 2: إرسال البيانات الخام للطابعة عبر الوكيل
    const printPayload = {
      raw_data: renderResult.raw_data
    };

    if (printer.connection_type === 'usb' && printer.usb_printer_name) {
      printPayload.usb_printer_name = printer.usb_printer_name;
    } else {
      printPayload.ip = printer.ip_address;
      printPayload.port = printer.port || 9100;
    }

    console.log(`[Print] Sending to agent: ${printer.connection_type === 'usb' ? printer.usb_printer_name : printer.ip_address}`);
    
    const res = await fetch(`${PRINT_AGENT_URL}/print-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(printPayload)
    });
    
    const result = await res.json();
    console.log(`[Print] Agent response:`, result);
    return result;
  } catch (e) {
    console.error('[Print] Error:', e.message);
    return { success: false, message: e.message };
  }
};

/**
 * توزيع العناصر على الطابعات حسب ربط المنتجات
 */
export const routeOrderToPrinters = (orderItems, products, printers) => {
  const printerJobs = {};
  const defaultPrinter = printers.find(p => p.printer_type === 'kitchen') || printers[0];

  for (const item of orderItems) {
    const product = products.find(p => p.id === item.product_id || p.id === item.id);
    const productPrinterIds = Array.isArray(product?.printer_ids) ? product.printer_ids.filter(id => id) : [];

    if (productPrinterIds.length > 0) {
      for (const printerId of productPrinterIds) {
        const targetPrinter = printers.find(p => p.id === printerId);
        if (targetPrinter) {
          if (!printerJobs[printerId]) printerJobs[printerId] = [];
          printerJobs[printerId].push(item);
        } else if (defaultPrinter) {
          if (!printerJobs[defaultPrinter.id]) printerJobs[defaultPrinter.id] = [];
          printerJobs[defaultPrinter.id].push(item);
        }
      }
    } else if (defaultPrinter) {
      if (!printerJobs[defaultPrinter.id]) printerJobs[defaultPrinter.id] = [];
      printerJobs[defaultPrinter.id].push(item);
    }
  }
  return printerJobs;
};

/**
 * طباعة الطلب على جميع طابعات المطبخ
 */
export const printOrderToAllPrinters = async (order, orderItems, products, printers, restaurantName = '') => {
  const agentOk = await checkAgentStatus();
  if (!agentOk) {
    return { success: false, message: 'AGENT_NOT_RUNNING', results: [] };
  }

  const activePrinters = printers.filter(p =>
    (p.connection_type === 'usb' && p.usb_printer_name) ||
    (p.connection_type !== 'usb' && p.ip_address)
  );

  if (activePrinters.length === 0) {
    return { success: true, message: 'No configured printers', results: [] };
  }

  const printerJobs = routeOrderToPrinters(orderItems, products, activePrinters);
  
  console.log(`[Print] Kitchen routing: ${Object.keys(printerJobs).length} printers for ${orderItems.length} items`);
  Object.entries(printerJobs).forEach(([pid, items]) => {
    const p = printers.find(pr => pr.id === pid);
    console.log(`  → ${p?.name || pid}: ${items.map(i => i.name || i.product_name).join(', ')}`);
  });

  // طباعة تسلسلية (واحدة تلو الأخرى) لتجنب تضارب الوكيل
  const validResults = [];
  for (const [printerId, items] of Object.entries(printerJobs)) {
    const printer = printers.find(p => p.id === printerId);
    if (!printer) continue;

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
      // بيانات الفاتورة
      phone: order.phone || '',
      phone2: order.phone2 || '',
      address: order.address || '',
      tax_number: order.tax_number || '',
      show_tax: order.show_tax,
      custom_header: order.custom_header || '',
      custom_footer: order.custom_footer || '',
      thank_you_message: order.thank_you_message || '',
      system_name: order.system_name || 'Maestro EGP',
      branch_name: order.branch_name || '',
      items: items,
      total: items.reduce((sum, item) => {
        const extras = (item.extras || item.selectedExtras || []).reduce((s, e) => s + (e.price || 0), 0);
        return sum + ((item.price + extras) * (item.quantity || 1));
      }, 0),
      discount: order.discount || 0
    };

    console.log(`[Print] Sending to ${printer.name} (${printer.connection_type}: ${printer.ip_address || printer.usb_printer_name})`);
    const result = await sendReceiptPrint(printer, orderData);
    console.log(`[Print] ${printer.name} result:`, result.success, result.message || '');
    
    validResults.push({
      printer_id: printerId,
      printer_name: printer.name,
      printer_type: printer.printer_type,
      connection_type: printer.connection_type,
      ...result
    });
  }

  const allSuccess = validResults.every(r => r.success);

  return {
    success: allSuccess,
    message: allSuccess ? 'All printers done' : 'Some printers failed',
    results: validResults
  };
};

export default {
  checkAgentStatus,
  agentSupportsUsb,
  listAgentPrinters,
  checkPrinterOnline,
  sendTestPrint,
  sendRawPrint,
  sendReceiptPrint,
  routeOrderToPrinters,
  printOrderToAllPrinters
};
