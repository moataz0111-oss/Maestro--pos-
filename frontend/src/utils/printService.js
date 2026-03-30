/**
 * Maestro EGP - خدمة الطباعة
 * تتواصل مع وسيط الطباعة المحلي لإرسال أوامر الطباعة لكل طابعة
 */

const PRINT_AGENT_URL = 'http://localhost:9999';
let _agentAvailable = null;
let _lastCheck = 0;
const CHECK_INTERVAL = 10000; // 10 seconds

/**
 * Check if print agent is running on localhost
 */
export const checkAgentStatus = async () => {
  const now = Date.now();
  if (_agentAvailable !== null && (now - _lastCheck) < CHECK_INTERVAL) {
    return _agentAvailable;
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${PRINT_AGENT_URL}/status`, { 
      mode: 'cors',
      signal: controller.signal 
    });
    clearTimeout(timeout);
    _agentAvailable = res.ok;
    _lastCheck = now;
    return _agentAvailable;
  } catch {
    _agentAvailable = false;
    _lastCheck = now;
    return false;
  }
};

/**
 * Check if a specific printer is reachable
 */
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
 * Send test page directly to a specific printer
 */
export const sendTestPrint = async (printer, branchName = '') => {
  const agentOk = await checkAgentStatus();
  if (!agentOk) {
    return { success: false, message: 'AGENT_NOT_RUNNING' };
  }
  
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/print-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: printer.ip_address,
        port: printer.port || 9100,
        name: printer.name,
        branch_name: branchName
      })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * Send raw text to a specific printer
 */
export const sendRawPrint = async (ip, port, text) => {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/print-raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port, text })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * Print a formatted receipt to a specific printer
 */
export const sendReceiptPrint = async (printer, orderData) => {
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/print-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: printer.ip_address,
        port: printer.port || 9100,
        order: orderData,
        printer_config: {
          show_prices: printer.show_prices !== false,
          print_mode: printer.print_mode || 'full_receipt',
          printer_type: printer.printer_type || 'receipt'
        }
      })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * Route order items to appropriate printers
 * Groups items by their assigned printer_ids
 * Returns: { printerId: [items] }
 */
export const routeOrderToPrinters = (orderItems, products, printers) => {
  const printerJobs = {};
  
  // Find the default receipt printer
  const defaultPrinter = printers.find(p => p.printer_type === 'receipt') || printers[0];
  
  for (const item of orderItems) {
    // Find the product to get its printer_ids
    const product = products.find(p => 
      p.id === item.product_id || p.id === item.id
    );
    
    const productPrinterIds = product?.printer_ids || [];
    
    if (productPrinterIds.length > 0) {
      // Send to all assigned printers
      for (const printerId of productPrinterIds) {
        if (!printerJobs[printerId]) printerJobs[printerId] = [];
        printerJobs[printerId].push(item);
      }
    } else if (defaultPrinter) {
      // No specific printer assigned - send to default receipt printer
      if (!printerJobs[defaultPrinter.id]) printerJobs[defaultPrinter.id] = [];
      printerJobs[defaultPrinter.id].push(item);
    }
  }
  
  return printerJobs;
};

/**
 * Print order to all assigned printers
 * Returns results for each printer
 */
export const printOrderToAllPrinters = async (order, orderItems, products, printers, restaurantName = '') => {
  const agentOk = await checkAgentStatus();
  if (!agentOk) {
    return { success: false, message: 'AGENT_NOT_RUNNING', results: [] };
  }
  
  const printerJobs = routeOrderToPrinters(orderItems, products, printers);
  const results = [];
  
  for (const [printerId, items] of Object.entries(printerJobs)) {
    const printer = printers.find(p => p.id === printerId);
    if (!printer) continue;
    
    // Build order data for this printer
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
  checkPrinterOnline,
  sendTestPrint,
  sendRawPrint,
  sendReceiptPrint,
  routeOrderToPrinters,
  printOrderToAllPrinters
};
