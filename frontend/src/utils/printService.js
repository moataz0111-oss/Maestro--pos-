/**
 * Maestro EGP - خدمة الطباعة v2.1
 * تتواصل مع وسيط الطباعة المحلي لإرسال أوامر الطباعة
 * يدعم طابعات الشبكة (Ethernet/IP) وطابعات USB عبر Windows Spooler
 */

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
 */
export const sendReceiptPrint = async (printer, orderData) => {
  try {
    const payload = {
      order: orderData,
      printer_config: {
        show_prices: printer.show_prices !== false,
        print_mode: printer.print_mode || 'full_receipt',
        printer_type: printer.printer_type || 'receipt'
      }
    };

    if (printer.connection_type === 'usb' && printer.usb_printer_name) {
      payload.usb_printer_name = printer.usb_printer_name;
    } else {
      payload.ip = printer.ip_address;
      payload.port = printer.port || 9100;
    }

    const res = await fetch(`${PRINT_AGENT_URL}/print-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
  const defaultPrinter = printers.find(p => p.printer_type === 'receipt') || printers[0];

  for (const item of orderItems) {
    const product = products.find(p => p.id === item.product_id || p.id === item.id);
    const productPrinterIds = product?.printer_ids || [];

    if (productPrinterIds.length > 0) {
      for (const printerId of productPrinterIds) {
        if (!printerJobs[printerId]) printerJobs[printerId] = [];
        printerJobs[printerId].push(item);
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

  for (const [printerId, items] of Object.entries(printerJobs)) {
    const printer = printers.find(p => p.id === printerId);
    if (!printer) continue;

    const orderData = {
      restaurant_name: restaurantName,
      order_number: order.order_number || order.id,
      order_type: order.order_type || order.orderType,
      customer_name: order.customer_name || '',
      table_number: order.table_number || order.table_id || '',
      items: items,
      total: items.reduce((sum, item) => {
        const extras = (item.extras || item.selectedExtras || []).reduce((s, e) => s + (e.price || 0), 0);
        return sum + ((item.price + extras) * (item.quantity || 1));
      }, 0),
      discount: order.discount || 0
    };

    const result = await sendReceiptPrint(printer, orderData);
    results.push({
      printer_id: printerId,
      printer_name: printer.name,
      printer_type: printer.printer_type,
      connection_type: printer.connection_type,
      ...result
    });
  }

  const allSuccess = results.every(r => r.success);
  return {
    success: allSuccess,
    message: allSuccess ? 'All printers done' : 'Some printers failed',
    results
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
