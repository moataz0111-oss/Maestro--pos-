/**
 * نظام طباعة التقارير الورقية
 * يدعم طباعة A4 بتنسيق مضغوط واحترافي
 */

import { formatPrice } from './currency';

// أنماط CSS للطباعة - محسنة للحجم المضغوط
const printStyles = `
  @page {
    size: A4;
    margin: 10mm;
  }
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    direction: rtl;
    font-size: 8pt;
    line-height: 1.2;
    color: #1a1a1a;
  }
  
  .print-header {
    text-align: center;
    padding-bottom: 8px;
    border-bottom: 2px solid #333;
    margin-bottom: 10px;
  }
  
  .print-header h1 {
    font-size: 14pt;
    font-weight: bold;
    margin-bottom: 3px;
  }
  
  .print-header .branch-name {
    font-size: 10pt;
    color: #444;
    margin-bottom: 2px;
  }
  
  .print-header .report-date {
    font-size: 8pt;
    color: #666;
  }
  
  .print-section {
    margin-bottom: 8px;
    page-break-inside: avoid;
  }
  
  .section-title {
    font-size: 9pt;
    font-weight: bold;
    background: #f5f5f5;
    padding: 4px 8px;
    border-right: 3px solid #333;
    margin-bottom: 5px;
  }
  
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 5px;
    margin-bottom: 8px;
  }
  
  .summary-box {
    border: 1px solid #ddd;
    padding: 5px;
    text-align: center;
    border-radius: 3px;
  }
  
  .summary-box .label {
    font-size: 7pt;
    color: #666;
    margin-bottom: 1px;
  }
  
  .summary-box .value {
    font-size: 10pt;
    font-weight: bold;
  }
  
  .summary-box.positive .value { color: #16a34a; }
  .summary-box.negative .value { color: #dc2626; }
  .summary-box.info .value { color: #2563eb; }
  .summary-box.warning .value { color: #d97706; }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    font-size: 7pt;
  }
  
  table th {
    background: #333;
    color: white;
    padding: 4px 5px;
    text-align: right;
    font-weight: bold;
    font-size: 7pt;
  }
  
  table td {
    padding: 3px 5px;
    border-bottom: 1px solid #ddd;
    text-align: right;
  }
  
  table tr:nth-child(even) {
    background: #f9f9f9;
  }
  
  .table-total {
    font-weight: bold;
    background: #e5e5e5 !important;
  }
  
  .text-positive { color: #16a34a; }
  .text-negative { color: #dc2626; }
  .text-info { color: #2563eb; }
  .text-warning { color: #d97706; }
  
  .two-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  
  .three-cols {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
  }
  
  .print-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 7pt;
    color: #999;
    padding: 5px;
    border-top: 1px solid #ddd;
    background: white;
  }
  
  .row-item {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    border-bottom: 1px dotted #ddd;
    font-size: 8pt;
  }
  
  .row-item:last-child {
    border-bottom: none;
  }
  
  .highlight-box {
    background: #f0f9ff;
    border: 1px solid #2563eb;
    padding: 8px;
    border-radius: 5px;
    margin: 8px 0;
  }
  
  .highlight-box.success {
    background: #f0fdf4;
    border-color: #16a34a;
  }
  
  .highlight-box.danger {
    background: #fef2f2;
    border-color: #dc2626;
  }
  
  .mini-card {
    border: 1px solid #e5e5e5;
    padding: 6px;
    border-radius: 4px;
    margin-bottom: 5px;
  }
  
  .mini-card h4 {
    font-size: 8pt;
    font-weight: bold;
    margin-bottom: 4px;
    color: #333;
    border-bottom: 1px solid #eee;
    padding-bottom: 2px;
  }
  
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

/**
 * فتح نافذة طباعة مع المحتوى
 */
export const openPrintWindow = (title, content) => {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>${printStyles}</style>
    </head>
    <body>
      ${content}
    </body>
    </html>
  `);
  
  printWindow.document.close();
  
  // انتظار تحميل الصفحة ثم الطباعة
  printWindow.onload = () => {
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };
  
  return printWindow;
};

/**
 * طباعة التقرير الشامل - محسن ومضغوط
 */
export const printComprehensiveReport = (data, branchName, dateRange, t) => {
  const {
    salesReport,
    purchasesReport,
    productsReport,
    expensesReport,
    cancellationsReport,
    discountsReport,
    deliveryCreditsReport,
    refundsReport,
    creditReport,
    profitLossReport
  } = data;

  const content = `
    <div class="print-header">
      <h1>التقرير الشامل</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">
        الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}
      </div>
    </div>

    <!-- ملخص عام -->
    <div class="print-section">
      <div class="summary-grid">
        <div class="summary-box positive">
          <div class="label">المبيعات</div>
          <div class="value">${formatPrice(salesReport?.total_sales || 0)}</div>
        </div>
        <div class="summary-box negative">
          <div class="label">المشتريات</div>
          <div class="value">${formatPrice(purchasesReport?.total_purchases || 0)}</div>
        </div>
        <div class="summary-box warning">
          <div class="label">المصاريف</div>
          <div class="value">${formatPrice(expensesReport?.total_expenses || 0)}</div>
        </div>
        <div class="summary-box info">
          <div class="label">الآجل المتبقي</div>
          <div class="value">${formatPrice(creditReport?.total_remaining || 0)}</div>
        </div>
        <div class="summary-box negative">
          <div class="label">الإلغاءات</div>
          <div class="value">${formatPrice(cancellationsReport?.total_value || 0)}</div>
        </div>
        <div class="summary-box positive">
          <div class="label">صافي الربح</div>
          <div class="value">${formatPrice(profitLossReport?.net_profit?.amount || 0)}</div>
        </div>
      </div>
    </div>

    <!-- التفاصيل في 3 أعمدة -->
    <div class="three-cols">
      <!-- المبيعات -->
      <div class="mini-card">
        <h4>📊 المبيعات</h4>
        <div class="row-item"><span>الإجمالي</span><strong>${formatPrice(salesReport?.total_sales || 0)}</strong></div>
        <div class="row-item"><span>نقدي</span><span>${formatPrice(salesReport?.by_payment_method?.cash || 0)}</span></div>
        <div class="row-item"><span>بطاقة</span><span>${formatPrice(salesReport?.by_payment_method?.card || 0)}</span></div>
        <div class="row-item"><span>آجل</span><span>${formatPrice(salesReport?.by_payment_method?.credit || 0)}</span></div>
        <div class="row-item"><span>عدد الطلبات</span><span>${salesReport?.total_orders || 0}</span></div>
      </div>

      <!-- المشتريات -->
      <div class="mini-card">
        <h4>🛒 المشتريات</h4>
        <div class="row-item"><span>الإجمالي</span><strong class="text-negative">${formatPrice(purchasesReport?.total_purchases || 0)}</strong></div>
        <div class="row-item"><span>المدفوع</span><span>${formatPrice(purchasesReport?.total_paid || 0)}</span></div>
        <div class="row-item"><span>المتبقي</span><span class="text-warning">${formatPrice(purchasesReport?.total_remaining || 0)}</span></div>
        <div class="row-item"><span>عدد الفواتير</span><span>${purchasesReport?.total_invoices || 0}</span></div>
      </div>

      <!-- المصاريف -->
      <div class="mini-card">
        <h4>💸 المصاريف</h4>
        <div class="row-item"><span>الإجمالي</span><strong class="text-warning">${formatPrice(expensesReport?.total_expenses || 0)}</strong></div>
        ${expensesReport?.by_category ? Object.entries(expensesReport.by_category).slice(0, 3).map(([cat, amount]) => {
          const catNames = { rent: 'إيجار', utilities: 'خدمات', salaries: 'رواتب', maintenance: 'صيانة', supplies: 'مستلزمات', marketing: 'تسويق', transport: 'نقل', other: 'أخرى' };
          return `<div class="row-item"><span>${catNames[cat] || cat}</span><span>${formatPrice(amount)}</span></div>`;
        }).join('') : ''}
        <div class="row-item"><span>المعاملات</span><span>${expensesReport?.total_transactions || 0}</span></div>
      </div>
    </div>

    <div class="three-cols" style="margin-top: 8px;">
      <!-- الآجل -->
      <div class="mini-card">
        <h4>💳 الآجل</h4>
        <div class="row-item"><span>الإجمالي</span><strong>${formatPrice(creditReport?.total_credit || 0)}</strong></div>
        <div class="row-item"><span>المدفوع</span><span class="text-positive">${formatPrice(creditReport?.total_paid || 0)}</span></div>
        <div class="row-item"><span>المتبقي</span><span class="text-negative">${formatPrice(creditReport?.total_remaining || 0)}</span></div>
        <div class="row-item"><span>الحسابات</span><span>${creditReport?.accounts_count || 0}</span></div>
      </div>

      <!-- التوصيل -->
      <div class="mini-card">
        <h4>🚚 التوصيل</h4>
        <div class="row-item"><span>المبيعات</span><strong>${formatPrice(deliveryCreditsReport?.total_sales || deliveryCreditsReport?.total_credit || 0)}</strong></div>
        <div class="row-item"><span>العمولات</span><span class="text-negative">-${formatPrice(deliveryCreditsReport?.total_commission || 0)}</span></div>
        <div class="row-item"><span>الصافي</span><span class="text-positive">${formatPrice(deliveryCreditsReport?.net_receivable || 0)}</span></div>
        <div class="row-item"><span>الطلبات</span><span>${deliveryCreditsReport?.total_orders || 0}</span></div>
      </div>

      <!-- الإلغاءات والخصومات -->
      <div class="mini-card">
        <h4>❌ الإلغاءات والخصومات</h4>
        <div class="row-item"><span>الإلغاءات</span><span class="text-negative">${cancellationsReport?.total_cancelled || 0} (${formatPrice(cancellationsReport?.total_value || 0)})</span></div>
        <div class="row-item"><span>الخصومات</span><span class="text-warning">${formatPrice(discountsReport?.total_discounts || 0)}</span></div>
        <div class="row-item"><span>الإرجاعات</span><span class="text-negative">${refundsReport?.total_count || 0} (${formatPrice(refundsReport?.total_amount || 0)})</span></div>
      </div>
    </div>

    <!-- شركات التوصيل -->
    ${deliveryCreditsReport && Object.keys(deliveryCreditsReport.by_delivery_app || {}).length > 0 ? `
    <div class="print-section">
      <div class="section-title">شركات التوصيل</div>
      <table>
        <thead>
          <tr>
            <th>الشركة</th>
            <th>الطلبات</th>
            <th>المبيعات</th>
            <th>العمولة</th>
            <th>الصافي</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(deliveryCreditsReport.by_delivery_app || {}).map(([app, data]) => `
            <tr>
              <td>${app}</td>
              <td>${data.count}</td>
              <td>${formatPrice(data.total)}</td>
              <td class="text-negative">-${formatPrice(data.commission)}</td>
              <td class="text-positive">${formatPrice(data.net_amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- الأصناف الأكثر مبيعاً -->
    ${productsReport?.products?.length > 0 ? `
    <div class="print-section">
      <div class="section-title">الأصناف الأكثر مبيعاً (أعلى 15)</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>الإيرادات</th>
            <th>الربح</th>
          </tr>
        </thead>
        <tbody>
          ${productsReport.products.slice(0, 15).map((p, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${p.name}</td>
              <td>${p.quantity_sold}</td>
              <td>${formatPrice(p.total_revenue)}</td>
              <td class="text-positive">${formatPrice(p.total_profit)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- صافي الربح -->
    <div class="highlight-box ${(profitLossReport?.net_profit?.amount || 0) >= 0 ? 'success' : 'danger'}">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 11pt; font-weight: bold;">صافي الربح الحقيقي</div>
          <div style="font-size: 8pt; color: #666;">بعد خصم جميع التكاليف والمصاريف</div>
        </div>
        <div style="font-size: 16pt; font-weight: bold; ${(profitLossReport?.net_profit?.amount || 0) >= 0 ? 'color: #16a34a;' : 'color: #dc2626;'}">
          ${formatPrice(profitLossReport?.net_profit?.amount || 0)}
        </div>
      </div>
    </div>

    <div class="print-footer">
      <p>تم إنشاء هذا التقرير بواسطة نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p>
    </div>
  `;

  openPrintWindow('التقرير الشامل - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير مبيعات - مضغوط
 */
export const printSalesReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير المبيعات</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">
        الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}
      </div>
    </div>

    <div class="print-section">
      <div class="summary-grid">
        <div class="summary-box positive">
          <div class="label">إجمالي المبيعات</div>
          <div class="value">${formatPrice(data.total_sales || 0)}</div>
        </div>
        <div class="summary-box negative">
          <div class="label">إجمالي التكاليف</div>
          <div class="value">${formatPrice(data.total_cost || 0)}</div>
        </div>
        <div class="summary-box positive">
          <div class="label">إجمالي الأرباح</div>
          <div class="value">${formatPrice(data.total_profit || 0)}</div>
        </div>
        <div class="summary-box info">
          <div class="label">عدد الطلبات</div>
          <div class="value">${data.total_orders || 0}</div>
        </div>
        <div class="summary-box">
          <div class="label">متوسط الطلب</div>
          <div class="value">${formatPrice(data.average_order_value || 0)}</div>
        </div>
        <div class="summary-box">
          <div class="label">هامش الربح</div>
          <div class="value">${(data.profit_margin || 0).toFixed(1)}%</div>
        </div>
      </div>
    </div>

    <div class="two-cols">
      <div class="print-section">
        <div class="section-title">حسب طريقة الدفع</div>
        <table>
          <thead>
            <tr><th>الطريقة</th><th>المبلغ</th><th>النسبة</th></tr>
          </thead>
          <tbody>
            ${Object.entries(data.by_payment_method || {}).map(([method, amount]) => {
              const percentage = ((amount / (data.total_sales || 1)) * 100).toFixed(1);
              return `<tr><td>${method === 'cash' ? 'نقدي' : method === 'card' ? 'بطاقة' : 'آجل'}</td><td>${formatPrice(amount)}</td><td>${percentage}%</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="print-section">
        <div class="section-title">حسب نوع الطلب</div>
        <table>
          <thead>
            <tr><th>النوع</th><th>المبلغ</th><th>النسبة</th></tr>
          </thead>
          <tbody>
            ${Object.entries(data.by_order_type || {}).map(([type, amount]) => {
              const percentage = ((amount / (data.total_sales || 1)) * 100).toFixed(1);
              return `<tr><td>${type === 'dine_in' ? 'داخلي' : type === 'takeaway' ? 'سفري' : 'توصيل'}</td><td>${formatPrice(amount)}</td><td>${percentage}%</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${data.top_products && Object.keys(data.top_products).length > 0 ? `
    <div class="print-section">
      <div class="section-title">أكثر المنتجات مبيعاً</div>
      <table>
        <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>الإيرادات</th></tr></thead>
        <tbody>
          ${Object.entries(data.top_products || {}).slice(0, 10).map(([name, info], idx) => `
            <tr><td>${idx + 1}</td><td>${name}</td><td>${info.quantity}</td><td>${formatPrice(info.revenue)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="print-footer">
      <p>تقرير المبيعات - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p>
    </div>
  `;

  openPrintWindow('تقرير المبيعات - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير الأرباح والخسائر - مضغوط
 */
export const printProfitLossReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير الأرباح والخسائر</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">
        الفترة: ${dateRange.start} إلى ${dateRange.end} (${data.period_days || 1} يوم) | طباعة: ${new Date().toLocaleString('ar-IQ')}
      </div>
    </div>

    <div class="print-section">
      <div class="section-title">الإيرادات</div>
      <div class="row-item" style="background: #f0fdf4; padding: 10px; border-radius: 5px;">
        <span style="font-size: 10pt;">إجمالي المبيعات (${data.revenue?.order_count || 0} طلب)</span>
        <strong style="font-size: 12pt; color: #16a34a;">${formatPrice(data.revenue?.total_sales || 0)}</strong>
      </div>
    </div>

    <div class="print-section">
      <div class="section-title">التكاليف</div>
      <div class="row-item"><span>تكلفة البضاعة المباعة</span><strong class="text-negative">-${formatPrice(data.cost_of_goods_sold?.total || 0)}</strong></div>
      <div class="row-item"><span>عمولات التوصيل</span><strong class="text-negative">-${formatPrice(data.delivery_commissions || 0)}</strong></div>
    </div>

    <div class="highlight-box" style="background: #eff6ff;">
      <div class="row-item" style="border: none;">
        <span style="font-weight: bold;">الربح الإجمالي</span>
        <strong style="font-size: 12pt; color: #2563eb;">${formatPrice(data.gross_profit?.amount || 0)}</strong>
      </div>
      <p style="text-align: left; color: #666; font-size: 8pt;">هامش الربح: ${(data.gross_profit?.margin || 0).toFixed(1)}%</p>
    </div>

    ${data.fixed_costs ? `
    <div class="print-section">
      <div class="section-title">التكاليف التشغيلية</div>
      <table>
        <thead><tr><th>البند</th><th>شهري</th><th>للفترة</th></tr></thead>
        <tbody>
          <tr><td>الإيجار</td><td>${formatPrice(data.fixed_costs.rent?.monthly || 0)}</td><td class="text-negative">-${formatPrice(data.fixed_costs.rent?.period || 0)}</td></tr>
          <tr><td>الكهرباء</td><td>${formatPrice(data.fixed_costs.electricity?.monthly || 0)}</td><td class="text-negative">-${formatPrice(data.fixed_costs.electricity?.period || 0)}</td></tr>
          <tr><td>الماء</td><td>${formatPrice(data.fixed_costs.water?.monthly || 0)}</td><td class="text-negative">-${formatPrice(data.fixed_costs.water?.period || 0)}</td></tr>
          <tr><td>المولدة</td><td>${formatPrice(data.fixed_costs.generator?.monthly || 0)}</td><td class="text-negative">-${formatPrice(data.fixed_costs.generator?.period || 0)}</td></tr>
          ${data.salaries ? `<tr><td>الرواتب (${data.salaries.employees_count} موظف)</td><td>${formatPrice(data.salaries.total_monthly || 0)}</td><td class="text-negative">-${formatPrice(data.salaries.total_period || 0)}</td></tr>` : ''}
          <tr><td>مصاريف أخرى</td><td>-</td><td class="text-negative">-${formatPrice(data.operating_expenses?.total || 0)}</td></tr>
          <tr class="table-total"><td>الإجمالي</td><td>-</td><td class="text-negative">-${formatPrice(data.total_operating_costs?.total || 0)}</td></tr>
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="highlight-box ${(data.net_profit?.amount || 0) >= 0 ? 'success' : 'danger'}">
      <div class="row-item" style="border: none;">
        <span style="font-size: 11pt; font-weight: bold;">صافي الربح</span>
        <strong style="font-size: 16pt; ${(data.net_profit?.amount || 0) >= 0 ? 'color: #16a34a;' : 'color: #dc2626;'}">
          ${formatPrice(data.net_profit?.amount || 0)}
        </strong>
      </div>
      <p style="text-align: left; color: #666; font-size: 8pt;">هامش الربح الصافي: ${(data.net_profit?.margin || 0).toFixed(1)}%</p>
    </div>

    <div class="print-footer">
      <p>تقرير الأرباح والخسائر - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p>
    </div>
  `;

  openPrintWindow('تقرير الأرباح والخسائر - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير المشتريات
 */
export const printPurchasesReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير المشتريات</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}</div>
    </div>
    <div class="print-section">
      <div class="summary-grid">
        <div class="summary-box negative"><div class="label">إجمالي المشتريات</div><div class="value">${formatPrice(data.total_purchases || 0)}</div></div>
        <div class="summary-box positive"><div class="label">المدفوع</div><div class="value">${formatPrice(data.total_paid || 0)}</div></div>
        <div class="summary-box warning"><div class="label">المتبقي</div><div class="value">${formatPrice(data.total_remaining || 0)}</div></div>
        <div class="summary-box info"><div class="label">عدد الفواتير</div><div class="value">${data.total_invoices || 0}</div></div>
      </div>
    </div>
    ${data.by_supplier && Object.keys(data.by_supplier).length > 0 ? `
    <div class="print-section">
      <div class="section-title">حسب المورد</div>
      <table><thead><tr><th>المورد</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${Object.entries(data.by_supplier || {}).map(([supplier, info]) => `
        <tr><td>${supplier}</td><td>${formatPrice(info.total || 0)}</td><td>${formatPrice(info.paid || 0)}</td><td class="text-negative">${formatPrice(info.remaining || 0)}</td></tr>
      `).join('')}</tbody></table>
    </div>` : ''}
    <div class="print-footer"><p>تقرير المشتريات - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow('تقرير المشتريات - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير المصاريف
 */
export const printExpensesReport = (data, branchName, dateRange) => {
  const catNames = { rent: 'إيجار', utilities: 'خدمات', salaries: 'رواتب', maintenance: 'صيانة', supplies: 'مستلزمات', marketing: 'تسويق', transport: 'نقل', other: 'أخرى' };
  const content = `
    <div class="print-header">
      <h1>تقرير المصاريف</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}</div>
    </div>
    <div class="print-section">
      <div class="summary-grid">
        <div class="summary-box negative"><div class="label">إجمالي المصاريف</div><div class="value">${formatPrice(data.total_expenses || 0)}</div></div>
        <div class="summary-box info"><div class="label">عدد المعاملات</div><div class="value">${data.total_transactions || 0}</div></div>
      </div>
    </div>
    ${data.by_category && Object.keys(data.by_category).length > 0 ? `
    <div class="print-section">
      <div class="section-title">حسب التصنيف</div>
      <table><thead><tr><th>التصنيف</th><th>المبلغ</th><th>النسبة</th></tr></thead>
      <tbody>${Object.entries(data.by_category || {}).map(([cat, amount]) => {
        const pct = ((amount / (data.total_expenses || 1)) * 100).toFixed(1);
        return `<tr><td>${catNames[cat] || cat}</td><td class="text-negative">${formatPrice(amount)}</td><td>${pct}%</td></tr>`;
      }).join('')}</tbody></table>
    </div>` : ''}
    <div class="print-footer"><p>تقرير المصاريف - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow('تقرير المصاريف - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير الأصناف
 */
export const printProductsReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير الأصناف</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}</div>
    </div>
    ${data.products && data.products.length > 0 ? `
    <div class="print-section">
      <table>
        <thead><tr><th>#</th><th>الصنف</th><th>السعر</th><th>التكلفة</th><th>الكمية</th><th>الإيرادات</th><th>الربح</th></tr></thead>
        <tbody>${data.products.map((p, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${p.name}</td>
            <td>${formatPrice(p.price)}</td>
            <td>${formatPrice(p.cost)}</td>
            <td>${p.quantity_sold}</td>
            <td>${formatPrice(p.total_revenue)}</td>
            <td class="text-positive">${formatPrice(p.total_profit)}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>` : '<p style="text-align:center;padding:20px;">لا توجد بيانات</p>'}
    <div class="print-footer"><p>تقرير الأصناف - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow('تقرير الأصناف - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير التوصيل
 */
export const printDeliveryReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير شركات التوصيل</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}</div>
    </div>
    <div class="print-section">
      <div class="summary-grid">
        <div class="summary-box positive"><div class="label">إجمالي المبيعات</div><div class="value">${formatPrice(data.total_sales || data.total_credit || 0)}</div></div>
        <div class="summary-box negative"><div class="label">العمولات</div><div class="value">${formatPrice(data.total_commission || 0)}</div></div>
        <div class="summary-box info"><div class="label">المستحق</div><div class="value">${formatPrice(data.net_receivable || 0)}</div></div>
        <div class="summary-box"><div class="label">الطلبات</div><div class="value">${data.total_orders || 0}</div></div>
      </div>
    </div>
    ${data.by_delivery_app && Object.keys(data.by_delivery_app).length > 0 ? `
    <div class="print-section">
      <div class="section-title">حسب شركة التوصيل</div>
      <table><thead><tr><th>الشركة</th><th>الطلبات</th><th>المبيعات</th><th>العمولة</th><th>الصافي</th></tr></thead>
      <tbody>${Object.entries(data.by_delivery_app || {}).map(([app, info]) => `
        <tr><td>${app}</td><td>${info.count}</td><td>${formatPrice(info.total)}</td><td class="text-negative">-${formatPrice(info.commission)}</td><td class="text-positive">${formatPrice(info.net_amount)}</td></tr>
      `).join('')}</tbody></table>
    </div>` : ''}
    <div class="print-footer"><p>تقرير التوصيل - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow('تقرير شركات التوصيل - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة إيصال تحصيل من شركة توصيل - صفحة A4 خارجية (عبر المتصفح / طابعة خارجية)
 * receipt = { company_name, period_start, period_end, total_sales, commission,
 *             net_receivable, has_offers, offer_amount, offer_percentage,
 *             collected_amount, collected_by, branch_name, datetime }
 */
export const printDeliveryCollectionReceipt = (receipt) => {
  const r = receipt || {};
  const fmt = (v) => formatPrice(v || 0);
  const content = `
    <div class="print-header">
      <h1>إيصال تحصيل - شركة توصيل</h1>
      <div class="branch-name">${r.branch_name || 'جميع الفروع'}</div>
      <div class="report-date">تاريخ التحصيل: ${r.datetime || new Date().toLocaleString('ar-IQ')}</div>
    </div>

    <div class="print-section">
      <div class="section-title">بيانات التحصيل</div>
      <table>
        <tbody>
          <tr><td style="width:40%"><b>شركة التوصيل</b></td><td>${r.company_name || '-'}</td></tr>
          <tr><td><b>فترة التحصيل</b></td><td>من ${r.period_start || '-'} إلى ${r.period_end || '-'}</td></tr>
          <tr><td><b>اسم المُحصِّل</b></td><td>${r.collected_by || '-'}</td></tr>
          <tr><td><b>الفرع</b></td><td>${r.branch_name || '-'}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="print-section">
      <div class="section-title">التفاصيل المالية</div>
      <table>
        <tbody>
          <tr><td style="width:60%">إجمالي المبيعات (قبل الاستقطاع)</td><td>${fmt(r.total_sales)}</td></tr>
          <tr><td>العمولة المستقطعة</td><td class="text-negative">- ${fmt(r.commission)}</td></tr>
          <tr><td><b>الصافي المستحق</b></td><td><b>${fmt(r.net_receivable)}</b></td></tr>
          ${r.has_offers ? `
          <tr><td>قيمة العرض / الخصم المخصوم</td><td class="text-negative">- ${fmt(r.offer_amount)} (${(r.offer_percentage || 0).toFixed(1)}%)</td></tr>
          ` : ''}
          <tr style="background:#eafaf0"><td><b>الصافي المُحصَّل والمُودَع في الخزينة</b></td><td><b class="text-positive">${fmt(r.collected_amount)}</b></td></tr>
        </tbody>
      </table>
    </div>

    <div class="print-section" style="margin-top:40px">
      <table style="border:none">
        <tbody>
          <tr style="border:none">
            <td style="border:none;text-align:center;padding-top:30px">
              <div style="border-top:1px solid #333;width:70%;margin:0 auto;padding-top:5px">توقيع المُحصِّل</div>
            </td>
            <td style="border:none;text-align:center;padding-top:30px">
              <div style="border-top:1px solid #333;width:70%;margin:0 auto;padding-top:5px">توقيع مندوب الشركة</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="print-footer"><p>إيصال تحصيل توصيل - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow('إيصال تحصيل - ' + (r.company_name || ''), content);
};


/**
 * طباعة تقرير الإلغاءات
 */
export const printCancellationsReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير الإلغاءات</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}</div>
    </div>
    <div class="print-section">
      <div class="summary-grid">
        <div class="summary-box negative"><div class="label">عدد الإلغاءات</div><div class="value">${data.total_cancelled || 0}</div></div>
        <div class="summary-box negative"><div class="label">قيمة الإلغاءات</div><div class="value">${formatPrice(data.total_value || 0)}</div></div>
        <div class="summary-box warning"><div class="label">نسبة الإلغاء</div><div class="value">${(data.cancellation_rate || 0).toFixed(1)}%</div></div>
      </div>
    </div>
    ${data.by_reason && Object.keys(data.by_reason).length > 0 ? `
    <div class="print-section">
      <div class="section-title">حسب السبب</div>
      <table><thead><tr><th>السبب</th><th>العدد</th><th>القيمة</th></tr></thead>
      <tbody>${Object.entries(data.by_reason || {}).map(([reason, info]) => `
        <tr><td>${reason}</td><td>${info.count || 0}</td><td class="text-negative">${formatPrice(info.value || 0)}</td></tr>
      `).join('')}</tbody></table>
    </div>` : ''}
    <div class="print-footer"><p>تقرير الإلغاءات - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow('تقرير الإلغاءات - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير الخصومات
 */
export const printDiscountsReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير الخصومات</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}</div>
    </div>
    <div class="print-section">
      <div class="summary-grid">
        <div class="summary-box warning"><div class="label">إجمالي الخصومات</div><div class="value">${formatPrice(data.total_discounts || 0)}</div></div>
        <div class="summary-box info"><div class="label">الطلبات المخصومة</div><div class="value">${data.discounted_orders || 0}</div></div>
        <div class="summary-box"><div class="label">متوسط الخصم</div><div class="value">${formatPrice(data.average_discount || 0)}</div></div>
        <div class="summary-box"><div class="label">نسبة من المبيعات</div><div class="value">${(data.discount_percentage || 0).toFixed(1)}%</div></div>
      </div>
    </div>
    <div class="print-footer"><p>تقرير الخصومات - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow('تقرير الخصومات - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير الإرجاعات
 */
export const printRefundsReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير الإرجاعات</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}</div>
    </div>
    <div class="print-section">
      <div class="summary-grid">
        <div class="summary-box negative"><div class="label">عدد الإرجاعات</div><div class="value">${data.total_count || 0}</div></div>
        <div class="summary-box negative"><div class="label">المبلغ المرتجع</div><div class="value">${formatPrice(data.total_amount || 0)}</div></div>
        <div class="summary-box info"><div class="label">الطلبات المتأثرة</div><div class="value">${data.orders_affected || 0}</div></div>
      </div>
    </div>
    ${data.refunds && data.refunds.length > 0 ? `
    <div class="print-section">
      <div class="section-title">تفاصيل الإرجاعات</div>
      <table><thead><tr><th>التاريخ</th><th>رقم الطلب</th><th>المبلغ</th><th>السبب</th></tr></thead>
      <tbody>${data.refunds.slice(0, 20).map(r => `
        <tr><td>${new Date(r.created_at).toLocaleDateString('ar-IQ')}</td><td>${r.order_id?.slice(-6) || '-'}</td><td class="text-negative">${formatPrice(r.refund_amount || 0)}</td><td>${r.reason || '-'}</td></tr>
      `).join('')}</tbody></table>
    </div>` : ''}
    <div class="print-footer"><p>تقرير الإرجاعات - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow('تقرير الإرجاعات - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير الآجل
 */
export const printCreditReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير الحسابات الآجلة</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">الفترة: ${dateRange.start} إلى ${dateRange.end} | طباعة: ${new Date().toLocaleString('ar-IQ')}</div>
    </div>
    <div class="print-section">
      <div class="summary-grid">
        <div class="summary-box warning"><div class="label">إجمالي الآجل</div><div class="value">${formatPrice(data.total_credit || 0)}</div></div>
        <div class="summary-box positive"><div class="label">المدفوع</div><div class="value">${formatPrice(data.total_paid || 0)}</div></div>
        <div class="summary-box negative"><div class="label">المتبقي</div><div class="value">${formatPrice(data.total_remaining || 0)}</div></div>
        <div class="summary-box info"><div class="label">عدد الحسابات</div><div class="value">${data.accounts_count || 0}</div></div>
      </div>
    </div>
    ${data.accounts && data.accounts.length > 0 ? `
    <div class="print-section">
      <div class="section-title">تفاصيل الحسابات</div>
      <table><thead><tr><th>العميل</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${data.accounts.map(acc => `
        <tr><td>${acc.customer_name || acc.name}</td><td>${formatPrice(acc.total || 0)}</td><td>${formatPrice(acc.paid || 0)}</td><td class="text-negative">${formatPrice(acc.remaining || 0)}</td></tr>
      `).join('')}</tbody></table>
    </div>` : ''}
    <div class="print-footer"><p>تقرير الآجل - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow('تقرير الآجل - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة طلب فرع (سند A4) — يفتح نافذة متصفح خارجية للطباعة (بعيداً عن وكيل الطباعة المحلي)
 */
export const printBranchOrder = (order) => {
  if (!order) return;
  const statusLabels = {
    pending: 'قيد الانتظار', approved: 'تمت الموافقة', processing: 'قيد التجهيز',
    shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي'
  };
  const reducedByName = {};
  (order.reduced_items || []).forEach(r => { reducedByName[r.product_name] = r; });
  const items = order.items || [];
  const hasReductions = (order.reduced_items || []).length > 0;
  const fmtNum = (n) => {
    const x = Number(n || 0);
    return Number.isInteger(x) ? x : x.toFixed(2);
  };
  const itemsRows = items.map(it => {
    const req = Number(it.quantity || 0);
    const red = reducedByName[it.product_name];
    const sent = red ? Number(red.sent || 0) : req;
    const cost = Number(it.cost_per_unit || 0);
    const isReduced = !!red;
    return `<tr${isReduced ? ' style="background:#fff7ed"' : ''}>
      <td>${it.product_name || ''}</td>
      <td>${fmtNum(req)} ${it.unit || ''}</td>
      <td class="${isReduced ? 'text-warning' : ''}">${fmtNum(sent)} ${it.unit || ''}${isReduced && sent <= 0 ? ' (مرفوض)' : ''}</td>
      <td>${formatPrice(cost)}</td>
      <td>${formatPrice(sent * cost)}</td>
    </tr>`;
  }).join('');

  const content = `
    <div class="print-header">
      <h1>سند طلب فرع — Maestro EGP</h1>
      <div class="branch-name">طلب رقم #${order.order_number || order.request_number || ''}</div>
      <div class="report-date">تاريخ الطلب: ${order.created_at ? new Date(order.created_at).toLocaleString('ar-IQ') : ''} | طباعة: ${new Date().toLocaleString('ar-IQ')}</div>
    </div>

    <div class="print-section">
      <div class="section-title">معلومات الطلب</div>
      <div class="two-cols">
        <div class="row-item"><span>الفرع:</span><strong>${order.to_branch_name || ''}</strong></div>
        <div class="row-item"><span>الحالة:</span><strong>${statusLabels[order.status] || order.status || ''}</strong></div>
        <div class="row-item"><span>طلب بواسطة:</span><strong>${order.requested_by_name || '—'}</strong></div>
        <div class="row-item"><span>نفّذه / أرسله:</span><strong>${order.fulfilled_by_name || '—'}</strong></div>
        ${order.priority === 'urgent' ? '<div class="row-item"><span>الأولوية:</span><strong class="text-negative">مستعجل</strong></div>' : ''}
        ${order.delivered_at ? `<div class="row-item"><span>تاريخ التسليم:</span><strong>${new Date(order.delivered_at).toLocaleString('ar-IQ')}</strong></div>` : ''}
      </div>
    </div>

    <div class="print-section">
      <div class="section-title">المنتجات</div>
      <table>
        <thead><tr><th>المنتج</th><th>المطلوب</th><th>المُرسَل</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${itemsRows}
          <tr class="table-total"><td colspan="4">إجمالي التكلفة</td><td>${formatPrice(order.total_cost || 0)}</td></tr>
        </tbody>
      </table>
    </div>

    ${hasReductions ? `
    <div class="print-section">
      <div class="highlight-box danger">
        <strong>تنبيه: تم تخفيض كميات من المصنع</strong>
        ${(order.reduced_items || []).map(r => `<div class="row-item"><span>${r.product_name}</span><span>المطلوب: ${fmtNum(r.requested)} ${r.unit || ''} ← ${r.rejected ? 'مرفوض' : 'المُرسَل: ' + fmtNum(r.sent) + ' ' + (r.unit || '')}</span></div>`).join('')}
        ${order.fulfillment_note ? `<div style="margin-top:6px"><strong>رسالة المصنع:</strong> ${order.fulfillment_note}</div>` : ''}
      </div>
    </div>` : ''}

    ${order.notes ? `<div class="print-section"><div class="section-title">ملاحظات</div><p>${order.notes}</p></div>` : ''}

    <div style="margin-top:40px" class="three-cols">
      <div style="text-align:center;border-top:1px solid #333;padding-top:6px">توقيع الطالب<br/>${order.requested_by_name || ''}</div>
      <div style="text-align:center;border-top:1px solid #333;padding-top:6px">توقيع المنفّذ<br/>${order.fulfilled_by_name || ''}</div>
      <div style="text-align:center;border-top:1px solid #333;padding-top:6px">توقيع المستلم</div>
    </div>

    <div class="print-footer"><p>سند طلب فرع - نظام Maestro EGP | ${new Date().toLocaleString('ar-IQ')}</p></div>
  `;
  openPrintWindow(`سند طلب #${order.order_number || order.request_number || ''}`, content);
};

export default {
  openPrintWindow,
  printComprehensiveReport,
  printSalesReport,
  printProfitLossReport,
  printPurchasesReport,
  printExpensesReport,
  printProductsReport,
  printDeliveryReport,
  printCancellationsReport,
  printDiscountsReport,
  printRefundsReport,
  printCreditReport,
  printBranchOrder
};
