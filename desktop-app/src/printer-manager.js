const { BrowserWindow } = require('electron');

class PrinterManager {
  constructor(store) {
    this.store = store;
  }

  // الحصول على قائمة الطابعات المتاحة
  async getPrinters() {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return [];

    const printers = await window.webContents.getPrintersAsync();
    return printers.map(printer => ({
      name: printer.name,
      displayName: printer.displayName,
      description: printer.description,
      status: printer.status,
      isDefault: printer.isDefault
    }));
  }

  // طباعة فاتورة
  async printReceipt(data) {
    const printerName = this.store.get('printerSettings.receiptPrinter');
    
    if (!printerName) {
      throw new Error('لم يتم تحديد طابعة الفواتير');
    }

    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      throw new Error('لا توجد نافذة متاحة');
    }

    // إنشاء HTML للفاتورة
    const receiptHtml = this.generateReceiptHtml(data);
    
    // إنشاء نافذة مخفية للطباعة
    const printWindow = new BrowserWindow({
      width: 300,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false
      }
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHtml)}`);

    return new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          deviceName: printerName,
          silent: true,
          printBackground: true,
          margins: { marginType: 'none' }
        },
        (success, failureReason) => {
          printWindow.close();
          
          if (success) {
            resolve({ success: true });
          } else {
            reject(new Error(failureReason));
          }
        }
      );
    });
  }

  // طباعة طلب المطبخ
  async printKitchenOrder(data) {
    const printerName = this.store.get('printerSettings.kitchenPrinter');
    
    if (!printerName) {
      throw new Error('لم يتم تحديد طابعة المطبخ');
    }

    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      throw new Error('لا توجد نافذة متاحة');
    }

    // إنشاء HTML لطلب المطبخ
    const kitchenHtml = this.generateKitchenOrderHtml(data);
    
    const printWindow = new BrowserWindow({
      width: 300,
      height: 400,
      show: false,
      webPreferences: {
        nodeIntegration: false
      }
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(kitchenHtml)}`);

    return new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          deviceName: printerName,
          silent: true,
          printBackground: true,
          margins: { marginType: 'none' }
        },
        (success, failureReason) => {
          printWindow.close();
          
          if (success) {
            resolve({ success: true });
          } else {
            reject(new Error(failureReason));
          }
        }
      );
    });
  }

  // إنشاء HTML للفاتورة
  generateReceiptHtml(data) {
    const {
      orderNumber,
      branchName,
      cashierName,
      items,
      subtotal,
      discount,
      tax,
      total,
      paymentMethod,
      paidAmount,
      change,
      date,
      restaurantName,
      restaurantLogo,
      restaurantPhone,
      restaurantAddress
    } = data;

    const itemsHtml = items.map(item => `
      <tr>
        <td style="text-align: right;">${item.name}</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: left;">${this.formatPrice(item.total)}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Arial', sans-serif;
            font-size: 12px;
            width: 280px;
            padding: 10px;
            direction: rtl;
          }
          .header {
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 1px dashed #000;
            padding-bottom: 10px;
          }
          .logo {
            max-width: 80px;
            max-height: 80px;
            margin-bottom: 5px;
          }
          .restaurant-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .info {
            font-size: 10px;
            color: #333;
          }
          .order-info {
            margin: 10px 0;
            font-size: 11px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
          }
          .items-table th, .items-table td {
            padding: 5px 2px;
            border-bottom: 1px dotted #ccc;
          }
          .items-table th {
            border-bottom: 1px solid #000;
            font-weight: bold;
          }
          .totals {
            margin: 10px 0;
            border-top: 1px dashed #000;
            padding-top: 10px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin: 3px 0;
          }
          .grand-total {
            font-size: 16px;
            font-weight: bold;
            border-top: 2px solid #000;
            padding-top: 5px;
            margin-top: 5px;
          }
          .footer {
            text-align: center;
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px dashed #000;
            font-size: 10px;
          }
          .payment-info {
            background: #f5f5f5;
            padding: 8px;
            margin: 10px 0;
            border-radius: 3px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${restaurantLogo ? `<img src="${restaurantLogo}" class="logo" alt="Logo">` : ''}
          <div class="restaurant-name">${restaurantName || 'المطعم'}</div>
          ${restaurantAddress ? `<div class="info">${restaurantAddress}</div>` : ''}
          ${restaurantPhone ? `<div class="info">هاتف: ${restaurantPhone}</div>` : ''}
        </div>

        <div class="order-info">
          <div><strong>رقم الطلب:</strong> #${orderNumber}</div>
          <div><strong>الفرع:</strong> ${branchName || '-'}</div>
          <div><strong>الكاشير:</strong> ${cashierName || '-'}</div>
          <div><strong>التاريخ:</strong> ${date || new Date().toLocaleString('ar-IQ')}</div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="text-align: right;">الصنف</th>
              <th style="text-align: center;">الكمية</th>
              <th style="text-align: left;">السعر</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>المجموع الفرعي:</span>
            <span>${this.formatPrice(subtotal)}</span>
          </div>
          ${discount > 0 ? `
            <div class="total-row" style="color: green;">
              <span>الخصم:</span>
              <span>-${this.formatPrice(discount)}</span>
            </div>
          ` : ''}
          ${tax > 0 ? `
            <div class="total-row">
              <span>الضريبة:</span>
              <span>${this.formatPrice(tax)}</span>
            </div>
          ` : ''}
          <div class="total-row grand-total">
            <span>الإجمالي:</span>
            <span>${this.formatPrice(total)}</span>
          </div>
        </div>

        <div class="payment-info">
          <div class="total-row">
            <span>طريقة الدفع:</span>
            <span>${this.getPaymentMethodName(paymentMethod)}</span>
          </div>
          <div class="total-row">
            <span>المبلغ المدفوع:</span>
            <span>${this.formatPrice(paidAmount)}</span>
          </div>
          ${change > 0 ? `
            <div class="total-row">
              <span>الباقي:</span>
              <span>${this.formatPrice(change)}</span>
            </div>
          ` : ''}
        </div>

        <div class="footer">
          <p>شكراً لزيارتكم</p>
          <p>نتمنى لكم يوماً سعيداً</p>
        </div>
      </body>
      </html>
    `;
  }

  // إنشاء HTML لطلب المطبخ
  generateKitchenOrderHtml(data) {
    const { orderNumber, items, notes, date, orderType, tableNumber } = data;

    const itemsHtml = items.map(item => `
      <div class="kitchen-item">
        <span class="quantity">${item.quantity}x</span>
        <span class="name">${item.name}</span>
        ${item.notes ? `<div class="item-notes">📝 ${item.notes}</div>` : ''}
        ${item.modifiers && item.modifiers.length > 0 ? 
          `<div class="modifiers">${item.modifiers.map(m => `• ${m}`).join('<br>')}</div>` 
          : ''
        }
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: 'Arial', sans-serif;
            width: 280px;
            padding: 10px;
            direction: rtl;
          }
          .header {
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            border-bottom: 3px solid #000;
            padding-bottom: 10px;
            margin-bottom: 10px;
          }
          .order-number {
            font-size: 28px;
            text-align: center;
            margin: 10px 0;
          }
          .order-info {
            font-size: 14px;
            margin-bottom: 15px;
            padding: 8px;
            background: #f0f0f0;
          }
          .kitchen-item {
            border-bottom: 1px dashed #ccc;
            padding: 10px 0;
            font-size: 16px;
          }
          .quantity {
            font-weight: bold;
            font-size: 18px;
            margin-left: 10px;
          }
          .name {
            font-weight: bold;
          }
          .item-notes, .modifiers {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
            padding-right: 30px;
          }
          .notes {
            margin-top: 15px;
            padding: 10px;
            background: #fff3cd;
            border: 1px solid #ffc107;
            font-size: 14px;
          }
          .time {
            text-align: center;
            margin-top: 15px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">🍳 طلب مطبخ</div>
        
        <div class="order-number">#${orderNumber}</div>
        
        <div class="order-info">
          ${orderType ? `<div>نوع الطلب: ${orderType}</div>` : ''}
          ${tableNumber ? `<div>رقم الطاولة: ${tableNumber}</div>` : ''}
        </div>

        <div class="items">
          ${itemsHtml}
        </div>

        ${notes ? `<div class="notes">📝 ملاحظات: ${notes}</div>` : ''}

        <div class="time">${date || new Date().toLocaleString('ar-IQ')}</div>
      </body>
      </html>
    `;
  }

  // تنسيق السعر
  formatPrice(price) {
    return new Intl.NumberFormat('ar-IQ', {
      style: 'decimal',
      minimumFractionDigits: 0
    }).format(price || 0) + ' IQD';
  }

  // اسم طريقة الدفع
  getPaymentMethodName(method) {
    const methods = {
      'cash': 'نقداً',
      'card': 'بطاقة',
      'credit': 'آجل',
      'online': 'إلكتروني'
    };
    return methods[method] || method;
  }
}

module.exports = { PrinterManager };
