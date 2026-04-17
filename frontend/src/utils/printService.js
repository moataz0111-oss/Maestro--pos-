/**
 * Maestro POS - Print Service v4.0
 * النظام الجديد: المتصفح يرسل أوامر الطباعة للسيرفر (Print Queue)
 * الوسيط يسحب الأوامر من السيرفر ويطبعها
 * لا يوجد اتصال مباشر بين المتصفح والوسيط = لا CORS ولا PNA
 */

import { renderReceiptBitmap, renderTestBitmap } from './receiptBitmap';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * حفظ حالة الوسيط
 */
const AGENT_STATUS_KEY = 'maestro_agent_status';

const saveAgentStatus = (online, version = null) => {
  try { localStorage.setItem(AGENT_STATUS_KEY, JSON.stringify({ online, version, timestamp: Date.now() })); } catch {}
};

export const getSavedAgentStatus = () => {
  try {
    const data = JSON.parse(localStorage.getItem(AGENT_STATUS_KEY) || '{}');
    if (Date.now() - (data.timestamp || 0) < 300000) return data;
    return { online: false, version: null };
  } catch { return { online: false, version: null }; }
};

/**
 * فحص حالة الوسيط الحقيقية - يسأل السيرفر عن آخر heartbeat
 */
export const checkAgentStatus = async () => {
  try {
    const res = await axios.get(`${API}/print-queue/agent-status`);
    const data = res.data;
    saveAgentStatus(data.online, data.version);
    return data.online;
  } catch {
    saveAgentStatus(false);
    return false;
  }
};

/**
 * فحص توافق USB
 */
export const agentSupportsUsb = async () => true;

/**
 * فحص تطابق نسخة الوسيط
 */
export const checkAgentVersionMatch = async (backendUrl) => {
  try {
    // جلب النسخة المطلوبة من السيرفر
    const versionRes = await axios.get(`${backendUrl}/api/print-agent-version`);
    const latestVersion = versionRes.data?.version || '?';
    
    // جلب النسخة الفعلية للوسيط من الـ heartbeat
    const statusRes = await axios.get(`${API}/print-queue/agent-status`);
    const agentVersion = statusRes.data?.version || '?';
    
    const match = latestVersion !== '?' && agentVersion !== '?' && latestVersion === agentVersion;
    return {
      match,
      latestVersion,
      agentVersion,
      needsUpdate: !match && agentVersion !== '?'
    };
  } catch {
    return { match: false, latestVersion: '?', agentVersion: '?', needsUpdate: false };
  }
};

/**
 * قائمة الطابعات من الوسيط
 */
export const listAgentPrinters = async () => [];

/**
 * فحص حالة طابعة
 */
export const checkPrinterOnline = async () => ({ online: true });

/**
 * طباعة اختبار عبر الطابور
 */
export const sendTestPrint = async (printer) => {
  try {
    const testResult = renderTestBitmap({
      name: printer.name,
      connection_type: printer.connection_type,
      usb_printer_name: printer.usb_printer_name || '',
      ip_address: printer.ip_address || '',
      port: printer.port || 9100,
      branch_name: printer.branch_name || ''
    });
    if (!testResult.success) return { success: false, message: 'Render failed' };
    
    const token = localStorage.getItem('token');
    await axios.post(`${API}/print-queue`, {
      printer_name: printer.name,
      printer_type: printer.connection_type,
      usb_printer_name: printer.usb_printer_name || '',
      ip_address: printer.ip_address || '',
      port: printer.port || 9100,
      raw_data: testResult.raw_data
    }, { headers: { Authorization: `Bearer ${token}` } });
    
    return { success: true, message: 'Test print queued' };
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * طباعة إيصال عبر الطابور (Print Queue)
 * المتصفح يرسل للسيرفر → الوسيط يسحب ويطبع
 */
export const sendReceiptPrint = async (printer, orderData) => {
  try {
    const isKitchen = printer.print_mode === 'orders_only' || printer.print_mode === 'selected_products';
    const printerConfig = {
      show_prices: isKitchen ? false : (printer.show_prices !== false),
      print_mode: printer.print_mode || (isKitchen ? 'kitchen' : 'full_receipt'),
      printer_type: isKitchen ? 'kitchen' : 'receipt'
    };

    const jobData = {
      printer_name: printer.name || '',
      printer_type: printer.connection_type || 'usb',
      usb_printer_name: printer.usb_printer_name || '',
      ip_address: printer.ip_address || '',
      port: printer.port || 9100,
      branch_id: printer.branch_id || '',
    };

    // المطبخ USB: بيانات مباشرة (الوسيط يبني الإيصال)
    if (isKitchen && printer.connection_type === 'usb' && printer.usb_printer_name) {
      jobData.order_data = orderData;
      jobData.printer_config = printerConfig;
    } else {
      // الفاتورة + المطبخ شبكة: bitmap
      const renderResult = await renderReceiptBitmap(orderData, printerConfig);
      if (!renderResult.success || !renderResult.raw_data) {
        return { success: false, message: 'RENDER_FAILED: ' + (renderResult.error || 'Unknown') };
      }
      jobData.raw_data = renderResult.raw_data;
    }

    const token = localStorage.getItem('token');
    const res = await axios.post(`${API}/print-queue`, jobData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return { success: true, message: 'Print job queued', job_id: res.data?.job_id };
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * إرسال بيانات خام للطباعة عبر الطابور
 */
export const sendRawPrint = async (printer, rawData) => {
  try {
    const token = localStorage.getItem('token');
    await axios.post(`${API}/print-queue`, {
      printer_name: printer.name || '',
      printer_type: printer.connection_type || 'usb',
      usb_printer_name: printer.usb_printer_name || '',
      ip_address: printer.ip_address || '',
      port: printer.port || 9100,
      raw_data: rawData
    }, { headers: { Authorization: `Bearer ${token}` } });
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
};

/**
 * توزيع العناصر على الطابعات حسب ربط المنتجات
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
      is_paid: order.is_paid !== undefined ? order.is_paid : true,
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
  getSavedAgentStatus,
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
