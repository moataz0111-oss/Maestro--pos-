/**
 * Maestro EGP - خدمة الطباعة v2.2
 * تتواصل مع وسيط الطباعة المحلي لإرسال أوامر الطباعة
 * يدعم طابعات الشبكة (Ethernet/IP) وطابعات USB عبر Windows Spooler
 */

import { API_URL } from './api';

const PRINT_AGENT_URL = 'http://localhost:9999';
let _agentAvailable = null;
let _agentSupportsUsb = false;
let _lastCheck = 0;
const CHECK_INTERVAL = 10000;

export const checkAgentStatus = async () => {
  const now = Date.now();
  if (_agentAvailable !== null && (now - _lastCheck) < CHECK_INTERVAL) {
    return _agentAvailable;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${PRINT_AGENT_URL}/status`, { mode: 'cors', signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      _agentSupportsUsb = data.usb_support === true;
    }
    _agentAvailable = res.ok;
    _lastCheck = now;
    return _agentAvailable;
  } catch {
    _agentAvailable = false;
    _agentSupportsUsb = false;
    _lastCheck = now;
    return false;
  }
};

export const agentSupportsUsb = () => _agentSupportsUsb;

/**
 * جلب قائمة الطابعات المتوفرة في Windows
 * يرجع { printers: [], needsUpdate: false, agentOffline: false }
 */
export const listAgentPrinters = async () => {
  const agentOk = await checkAgentStatus();
  if (!agentOk) {
    return { printers: [], needsUpdate: false, agentOffline: true };
  }
  if (!_agentSupportsUsb) {
    return { printers: [], needsUpdate: true, agentOffline: false };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${PRINT_AGENT_URL}/list-printers`, { mode: 'cors', signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      return { printers: Array.isArray(data) ? data : [], needsUpdate: false, agentOffline: false };
    }
    return { printers: [], needsUpdate: true, agentOffline: false };
  } catch {
    return { printers: [], needsUpdate: true, agentOffline: false };
  }
};

export const checkPrinterOnline = async (ip, port = 9100) => {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/check-printer?ip=${ip}&port=${port}`, { mode: 'cors' });
    const data = await res.json();
    return data.online;
  } catch {
    return false;
  }
};

/**
 * طباعة تجريبية - تدعم USB و Ethernet
 */
export const sendTestPrint = async (printer, branchName = '') => {
  const agentOk = await checkAgentStatus();
  if (!agentOk) return { success: false, message: 'AGENT_NOT_RUNNING' };

  try {
    const payload = { name: printer.name, branch_name: branchName };

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
 * طباعة فاتورة - تدعم USB و Ethernet
 * تولد صورة bitmap من السيرفر (تدعم العربية) ثم ترسلها للطابعة
 */
export const sendReceiptPrint = async (printer, orderData) => {
  try {
    // تحديد إذا كانت طابعة مطبخ - لا تعرض الأسعار
    const isKitchen = printer.printer_type === 'kitchen';
    const showPrices = isKitchen ? false : (printer.show_prices !== false);

    const payload = {
      order: orderData,
      printer_config: {
        show_prices: showPrices,
        print_mode: printer.print_mode || (isKitchen ? 'kitchen' : 'full_receipt'),
        printer_type: printer.printer_type || 'receipt'
      }
    };

    // الخطوة 1: توليد بيانات الإيصال كـ bitmap من السيرفر
    let rawData = null;
    try {
      const token = localStorage.getItem('token');
      const renderRes = await fetch(`${API_URL}/print/render-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!renderRes.ok) {
        console.error('Render receipt HTTP error:', renderRes.status);
      } else {
        const renderResult = await renderRes.json();
        if (renderResult.success && renderResult.raw_data) {
          rawData = renderResult.raw_data;
          console.log(`Receipt rendered OK (${renderResult.size} bytes) for ${printer.name}`);
        } else {
          console.error('Render receipt failed:', renderResult.error);
        }
      }
    } catch (renderErr) {
      console.error('Server render unavailable:', renderErr.message);
    }

    // إذا فشل التوليد من السيرفر، لا نطبع نص مشوه
    if (!rawData) {
      console.error('No raw_data from server - cannot print without bitmap');
      return { success: false, message: 'RENDER_FAILED' };
    }

    // الخطوة 2: إرسال البيانات الخام للطابعة عبر الوكيل المحلي
    const printPayload = {
      raw_data: rawData
    };

    if (printer.connection_type === 'usb' && printer.usb_printer_name) {
      printPayload.usb_printer_name = printer.usb_printer_name;
    } else {
      printPayload.ip = printer.ip_address;
      printPayload.port = printer.port || 9100;
    }

    const res = await fetch(`${PRINT_AGENT_URL}/print-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(printPayload)
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
};

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
 * توزيع الطلبات على الطابعات المناسبة
 */
export const routeOrderToPrinters = (orderItems, products, printers) => {
  const printerJobs = {};
  const defaultPrinter = printers.find(p => p.printer_type === 'kitchen') || printers[0];

  for (const item of orderItems) {
    const product = products.find(p => p.id === item.product_id || p.id === item.id);
    // تأكد من أن printer_ids مصفوفة صالحة وليست null أو undefined
    const productPrinterIds = Array.isArray(product?.printer_ids) ? product.printer_ids.filter(id => id) : [];

    if (productPrinterIds.length > 0) {
      for (const printerId of productPrinterIds) {
        // تحقق أن الطابعة موجودة في قائمة الطابعات المتاحة
        const targetPrinter = printers.find(p => p.id === printerId);
        if (targetPrinter) {
          if (!printerJobs[printerId]) printerJobs[printerId] = [];
          printerJobs[printerId].push(item);
        } else if (defaultPrinter) {
          // إذا لم تُوجد الطابعة المعينة، أرسل للافتراضية
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
 * طباعة الطلب على جميع الطابعات (USB + Ethernet)
 */
export const printOrderToAllPrinters = async (order, orderItems, products, printers, restaurantName = '') => {
  const agentOk = await checkAgentStatus();
  if (!agentOk) {
    return { success: false, message: 'AGENT_NOT_RUNNING', results: [] };
  }

  // تضمين جميع الطابعات: الشبكية (لها IP) و USB (لها usb_printer_name)
  const activePrinters = printers.filter(p =>
    (p.connection_type === 'usb' && p.usb_printer_name) ||
    (p.connection_type !== 'usb' && p.ip_address)
  );

  if (activePrinters.length === 0) {
    return { success: true, message: 'No configured printers', results: [] };
  }

  const printerJobs = routeOrderToPrinters(orderItems, products, activePrinters);
  const results = [];

  // إرسال جميع الطلبات بالتوازي لتسريع الطباعة
  const printPromises = Object.entries(printerJobs).map(async ([printerId, items]) => {
    const printer = printers.find(p => p.id === printerId);
    if (!printer) return null;

    const orderData = {
      restaurant_name: restaurantName,
      order_number: order.order_number || order.id,
      order_type: order.order_type || order.orderType,
      customer_name: order.customer_name || '',
      table_number: order.table_number || order.table_id || '',
      buzzer_number: order.buzzer_number || '',
      branch_name: order.branch_name || '',
      driver_name: order.driver_name || '',
      delivery_company: order.delivery_company || '',
      cashier_name: order.cashier_name || '',
      section_name: printer.name || '',
      language: order.language || localStorage.getItem('language') || 'ar',
      items: items,
      total: items.reduce((sum, item) => {
        const extras = (item.extras || item.selectedExtras || []).reduce((s, e) => s + (e.price || 0), 0);
        return sum + ((item.price + extras) * (item.quantity || 1));
      }, 0),
      discount: order.discount || 0
    };

    const result = await sendReceiptPrint(printer, orderData);
    return {
      printer_id: printerId,
      printer_name: printer.name,
      printer_type: printer.printer_type,
      connection_type: printer.connection_type,
      ...result
    };
  });

  const printResults = await Promise.all(printPromises);
  const validResults = printResults.filter(r => r !== null);

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
