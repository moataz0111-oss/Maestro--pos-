/**
 * نظام طباعة التقارير الورقية
 * يدعم طباعة A4 بتنسيق احترافي
 */

import { formatPrice } from './currency';

// أنماط CSS للطباعة
const printStyles = `
  @page {
    size: A4;
    margin: 15mm;
  }
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    direction: rtl;
    font-size: 11pt;
    line-height: 1.4;
    color: #1a1a1a;
  }
  
  .print-header {
    text-align: center;
    padding-bottom: 15px;
    border-bottom: 2px solid #333;
    margin-bottom: 20px;
  }
  
  .print-header h1 {
    font-size: 20pt;
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  .print-header .branch-name {
    font-size: 14pt;
    color: #444;
    margin-bottom: 5px;
  }
  
  .print-header .report-date {
    font-size: 10pt;
    color: #666;
  }
  
  .print-section {
    margin-bottom: 15px;
    page-break-inside: avoid;
  }
  
  .section-title {
    font-size: 12pt;
    font-weight: bold;
    background: #f5f5f5;
    padding: 8px 12px;
    border-right: 4px solid #333;
    margin-bottom: 10px;
  }
  
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 15px;
  }
  
  .summary-box {
    border: 1px solid #ddd;
    padding: 10px;
    text-align: center;
    border-radius: 4px;
  }
  
  .summary-box .label {
    font-size: 9pt;
    color: #666;
    margin-bottom: 3px;
  }
  
  .summary-box .value {
    font-size: 14pt;
    font-weight: bold;
  }
  
  .summary-box.positive .value { color: #16a34a; }
  .summary-box.negative .value { color: #dc2626; }
  .summary-box.info .value { color: #2563eb; }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 15px;
    font-size: 10pt;
  }
  
  table th {
    background: #333;
    color: white;
    padding: 8px;
    text-align: right;
    font-weight: bold;
  }
  
  table td {
    padding: 6px 8px;
    border-bottom: 1px solid #ddd;
    text-align: right;
  }
  
  table tr:nth-child(even) {
    background: #f9f9f9;
  }
  
  table tr:hover {
    background: #f0f0f0;
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
    gap: 20px;
  }
  
  .print-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 9pt;
    color: #999;
    padding: 10px;
    border-top: 1px solid #ddd;
    background: white;
  }
  
  .row-item {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    border-bottom: 1px dotted #ddd;
  }
  
  .row-item:last-child {
    border-bottom: none;
  }
  
  .highlight-box {
    background: #f0f9ff;
    border: 2px solid #2563eb;
    padding: 15px;
    border-radius: 8px;
    margin: 15px 0;
  }
  
  .highlight-box.success {
    background: #f0fdf4;
    border-color: #16a34a;
  }
  
  .highlight-box.danger {
    background: #fef2f2;
    border-color: #dc2626;
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
 * طباعة التقرير الشامل
 */
export const printComprehensiveReport = (data, branchName, dateRange, t) => {
  const {
    salesReport,
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
        الفترة: ${dateRange.start} إلى ${dateRange.end}
        <br>
        تاريخ الطباعة: ${new Date().toLocaleString('ar-IQ')}
      </div>
    </div>

    <!-- ملخص عام -->
    <div class="print-section">
      <div class="section-title">الملخص العام</div>
      <div class="summary-grid">
        <div class="summary-box positive">
          <div class="label">إجمالي المبيعات</div>
          <div class="value">${formatPrice(salesReport?.total_sales || 0)}</div>
        </div>
        <div class="summary-box negative">
          <div class="label">إجمالي التكاليف</div>
          <div class="value">${formatPrice(salesReport?.total_cost || 0)}</div>
        </div>
        <div class="summary-box positive">
          <div class="label">إجمالي الأرباح</div>
          <div class="value">${formatPrice(salesReport?.total_profit || 0)}</div>
        </div>
        <div class="summary-box info">
          <div class="label">عدد الطلبات</div>
          <div class="value">${salesReport?.total_orders || 0}</div>
        </div>
      </div>
    </div>

    <!-- تفاصيل المبيعات -->
    <div class="print-section">
      <div class="section-title">تفاصيل المبيعات</div>
      <div class="two-cols">
        <div>
          <h4 style="margin-bottom: 10px;">حسب طريقة الدفع</h4>
          ${Object.entries(salesReport?.by_payment_method || {}).map(([method, amount]) => `
            <div class="row-item">
              <span>${method === 'cash' ? 'نقدي' : method === 'card' ? 'بطاقة' : 'آجل'}</span>
              <strong>${formatPrice(amount)}</strong>
            </div>
          `).join('')}
        </div>
        <div>
          <h4 style="margin-bottom: 10px;">حسب نوع الطلب</h4>
          ${Object.entries(salesReport?.by_order_type || {}).map(([type, amount]) => `
            <div class="row-item">
              <span>${type === 'dine_in' ? 'داخلي' : type === 'takeaway' ? 'سفري' : 'توصيل'}</span>
              <strong>${formatPrice(amount)}</strong>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- الأصناف الأكثر مبيعاً -->
    ${productsReport?.products?.length > 0 ? `
    <div class="print-section">
      <div class="section-title">تقرير الأصناف</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>الصنف</th>
            <th>السعر</th>
            <th>التكلفة</th>
            <th>الكمية</th>
            <th>الإيرادات</th>
            <th>الربح</th>
          </tr>
        </thead>
        <tbody>
          ${productsReport.products.slice(0, 20).map((p, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${p.name}</td>
              <td>${formatPrice(p.price)}</td>
              <td>${formatPrice(p.cost + (p.operating_cost || 0))}</td>
              <td>${p.quantity_sold}</td>
              <td>${formatPrice(p.total_revenue)}</td>
              <td class="text-positive">${formatPrice(p.total_profit)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- شركات التوصيل -->
    ${deliveryCreditsReport && Object.keys(deliveryCreditsReport.by_delivery_app || {}).length > 0 ? `
    <div class="print-section">
      <div class="section-title">شركات التوصيل</div>
      <table>
        <thead>
          <tr>
            <th>الشركة</th>
            <th>عدد الطلبات</th>
            <th>إجمالي المبيعات</th>
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
          <tr class="table-total">
            <td>الإجمالي</td>
            <td>${deliveryCreditsReport.total_orders || 0}</td>
            <td>${formatPrice(deliveryCreditsReport.total_sales || deliveryCreditsReport.total_credit || 0)}</td>
            <td class="text-negative">-${formatPrice(deliveryCreditsReport.total_commission || 0)}</td>
            <td class="text-positive">${formatPrice(deliveryCreditsReport.net_receivable || 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- المصاريف -->
    ${expensesReport ? `
    <div class="print-section">
      <div class="section-title">المصاريف</div>
      <div class="summary-grid">
        <div class="summary-box negative">
          <div class="label">إجمالي المصاريف</div>
          <div class="value">${formatPrice(expensesReport.total_expenses || 0)}</div>
        </div>
        <div class="summary-box info">
          <div class="label">عدد المعاملات</div>
          <div class="value">${expensesReport.total_transactions || 0}</div>
        </div>
      </div>
      ${Object.keys(expensesReport.by_category || {}).length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>التصنيف</th>
            <th>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(expensesReport.by_category || {}).map(([cat, amount]) => {
            const catNames = {
              rent: 'إيجار', utilities: 'كهرباء وماء', salaries: 'رواتب',
              maintenance: 'صيانة', supplies: 'مستلزمات', marketing: 'تسويق',
              transport: 'نقل', other: 'أخرى'
            };
            return `
              <tr>
                <td>${catNames[cat] || cat}</td>
                <td class="text-negative">${formatPrice(amount)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ` : ''}
    </div>
    ` : ''}

    <!-- الخصومات -->
    ${discountsReport ? `
    <div class="print-section">
      <div class="section-title">الخصومات</div>
      <div class="summary-grid">
        <div class="summary-box warning">
          <div class="label">إجمالي الخصومات</div>
          <div class="value">${formatPrice(discountsReport.total_discounts || 0)}</div>
        </div>
        <div class="summary-box info">
          <div class="label">عدد الطلبات المخصومة</div>
          <div class="value">${discountsReport.discounted_orders || 0}</div>
        </div>
        <div class="summary-box">
          <div class="label">متوسط الخصم</div>
          <div class="value">${formatPrice(discountsReport.average_discount || 0)}</div>
        </div>
        <div class="summary-box">
          <div class="label">نسبة من المبيعات</div>
          <div class="value">${(discountsReport.discount_percentage || 0).toFixed(1)}%</div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- الإلغاءات -->
    ${cancellationsReport ? `
    <div class="print-section">
      <div class="section-title">الإلغاءات</div>
      <div class="summary-grid">
        <div class="summary-box negative">
          <div class="label">عدد الإلغاءات</div>
          <div class="value">${cancellationsReport.total_cancelled || 0}</div>
        </div>
        <div class="summary-box negative">
          <div class="label">قيمة الإلغاءات</div>
          <div class="value">${formatPrice(cancellationsReport.total_value || 0)}</div>
        </div>
        <div class="summary-box warning">
          <div class="label">نسبة الإلغاء</div>
          <div class="value">${(cancellationsReport.cancellation_rate || 0).toFixed(1)}%</div>
        </div>
      </div>
      ${cancellationsReport.by_user && Object.keys(cancellationsReport.by_user).length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>المستخدم</th>
            <th>عدد الإلغاءات</th>
            <th>القيمة</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(cancellationsReport.by_user || {}).map(([user, data]) => `
            <tr>
              <td>${user}</td>
              <td>${data.count || 0}</td>
              <td class="text-negative">${formatPrice(data.value || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
    </div>
    ` : ''}

    <!-- الإرجاعات -->
    ${refundsReport && refundsReport.total_count > 0 ? `
    <div class="print-section">
      <div class="section-title">الإرجاعات</div>
      <div class="summary-grid">
        <div class="summary-box negative">
          <div class="label">عدد الإرجاعات</div>
          <div class="value">${refundsReport.total_count || 0}</div>
        </div>
        <div class="summary-box negative">
          <div class="label">إجمالي المبلغ المرتجع</div>
          <div class="value">${formatPrice(refundsReport.total_amount || 0)}</div>
        </div>
        <div class="summary-box info">
          <div class="label">الطلبات المتأثرة</div>
          <div class="value">${refundsReport.orders_affected || 0}</div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- الآجل -->
    ${creditReport ? `
    <div class="print-section">
      <div class="section-title">المبيعات الآجلة</div>
      <div class="summary-grid">
        <div class="summary-box warning">
          <div class="label">إجمالي الآجل</div>
          <div class="value">${formatPrice(creditReport.total_credit || 0)}</div>
        </div>
        <div class="summary-box positive">
          <div class="label">المدفوع</div>
          <div class="value">${formatPrice(creditReport.total_paid || 0)}</div>
        </div>
        <div class="summary-box negative">
          <div class="label">المتبقي</div>
          <div class="value">${formatPrice(creditReport.total_remaining || 0)}</div>
        </div>
        <div class="summary-box info">
          <div class="label">عدد الحسابات</div>
          <div class="value">${creditReport.accounts_count || 0}</div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- صافي الربح -->
    ${profitLossReport ? `
    <div class="highlight-box ${(profitLossReport.net_profit?.amount || 0) >= 0 ? 'success' : 'danger'}">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 14pt; font-weight: bold;">صافي الربح</div>
          <div style="font-size: 10pt; color: #666;">بعد خصم جميع التكاليف والمصاريف</div>
        </div>
        <div style="font-size: 24pt; font-weight: bold; ${(profitLossReport.net_profit?.amount || 0) >= 0 ? 'color: #16a34a;' : 'color: #dc2626;'}">
          ${formatPrice(profitLossReport.net_profit?.amount || 0)}
        </div>
      </div>
    </div>
    ` : ''}

    <div class="print-footer">
      <p>تم إنشاء هذا التقرير بواسطة نظام Maestro EGP</p>
      <p>${new Date().toLocaleString('ar-IQ')}</p>
    </div>
  `;

  openPrintWindow('التقرير الشامل - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير مبيعات
 */
export const printSalesReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير المبيعات</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">
        الفترة: ${dateRange.start} إلى ${dateRange.end}
        <br>
        تاريخ الطباعة: ${new Date().toLocaleString('ar-IQ')}
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
      </div>
    </div>

    <div class="print-section">
      <div class="section-title">حسب طريقة الدفع</div>
      <table>
        <thead>
          <tr>
            <th>طريقة الدفع</th>
            <th>المبلغ</th>
            <th>النسبة</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(data.by_payment_method || {}).map(([method, amount]) => {
            const percentage = ((amount / (data.total_sales || 1)) * 100).toFixed(1);
            return `
              <tr>
                <td>${method === 'cash' ? 'نقدي' : method === 'card' ? 'بطاقة' : 'آجل'}</td>
                <td>${formatPrice(amount)}</td>
                <td>${percentage}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="print-section">
      <div class="section-title">حسب نوع الطلب</div>
      <table>
        <thead>
          <tr>
            <th>نوع الطلب</th>
            <th>المبلغ</th>
            <th>النسبة</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(data.by_order_type || {}).map(([type, amount]) => {
            const percentage = ((amount / (data.total_sales || 1)) * 100).toFixed(1);
            return `
              <tr>
                <td>${type === 'dine_in' ? 'داخلي' : type === 'takeaway' ? 'سفري' : 'توصيل'}</td>
                <td>${formatPrice(amount)}</td>
                <td>${percentage}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    ${data.top_products && Object.keys(data.top_products).length > 0 ? `
    <div class="print-section">
      <div class="section-title">أكثر المنتجات مبيعاً</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>المنتج</th>
            <th>الكمية</th>
            <th>الإيرادات</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(data.top_products || {}).map(([name, info], idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${name}</td>
              <td>${info.quantity}</td>
              <td>${formatPrice(info.revenue)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="print-footer">
      <p>تم إنشاء هذا التقرير بواسطة نظام Maestro EGP</p>
      <p>${new Date().toLocaleString('ar-IQ')}</p>
    </div>
  `;

  openPrintWindow('تقرير المبيعات - ' + (branchName || 'جميع الفروع'), content);
};

/**
 * طباعة تقرير الأرباح والخسائر
 */
export const printProfitLossReport = (data, branchName, dateRange) => {
  const content = `
    <div class="print-header">
      <h1>تقرير الأرباح والخسائر</h1>
      <div class="branch-name">${branchName || 'جميع الفروع'}</div>
      <div class="report-date">
        الفترة: ${dateRange.start} إلى ${dateRange.end} (${data.period_days || 1} يوم)
        <br>
        تاريخ الطباعة: ${new Date().toLocaleString('ar-IQ')}
      </div>
    </div>

    <div class="print-section">
      <div class="section-title">الإيرادات</div>
      <div class="row-item" style="background: #f0fdf4; padding: 15px; border-radius: 8px;">
        <span style="font-size: 14pt;">إجمالي المبيعات</span>
        <strong style="font-size: 18pt; color: #16a34a;">${formatPrice(data.revenue?.total_sales || 0)}</strong>
      </div>
      <p style="text-align: left; color: #666; margin-top: 5px;">${data.revenue?.order_count || 0} طلب</p>
    </div>

    <div class="print-section">
      <div class="section-title">التكاليف</div>
      <div class="row-item">
        <span>تكلفة البضاعة المباعة</span>
        <strong class="text-negative">-${formatPrice(data.cost_of_goods_sold?.total || 0)}</strong>
      </div>
      <div class="row-item">
        <span>عمولات التوصيل</span>
        <strong class="text-negative">-${formatPrice(data.delivery_commissions || 0)}</strong>
      </div>
    </div>

    <div class="highlight-box" style="background: #eff6ff;">
      <div class="row-item" style="border: none;">
        <span style="font-weight: bold;">الربح الإجمالي</span>
        <strong style="font-size: 16pt; color: #2563eb;">${formatPrice(data.gross_profit?.amount || 0)}</strong>
      </div>
      <p style="text-align: left; color: #666;">هامش الربح: ${(data.gross_profit?.margin || 0).toFixed(1)}%</p>
    </div>

    ${data.fixed_costs ? `
    <div class="print-section">
      <div class="section-title">التكاليف التشغيلية</div>
      <table>
        <thead>
          <tr>
            <th>البند</th>
            <th>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>الإيجار</td>
            <td class="text-negative">-${formatPrice(data.fixed_costs.rent?.period || 0)}</td>
          </tr>
          <tr>
            <td>الكهرباء</td>
            <td class="text-negative">-${formatPrice(data.fixed_costs.electricity?.period || 0)}</td>
          </tr>
          <tr>
            <td>الماء</td>
            <td class="text-negative">-${formatPrice(data.fixed_costs.water?.period || 0)}</td>
          </tr>
          <tr>
            <td>المولدة</td>
            <td class="text-negative">-${formatPrice(data.fixed_costs.generator?.period || 0)}</td>
          </tr>
          ${data.salaries ? `
          <tr>
            <td>الرواتب (${data.salaries.employees_count} موظف)</td>
            <td class="text-negative">-${formatPrice(data.salaries.total_period || 0)}</td>
          </tr>
          ` : ''}
          <tr>
            <td>مصاريف أخرى</td>
            <td class="text-negative">-${formatPrice(data.operating_expenses?.total || 0)}</td>
          </tr>
          <tr class="table-total">
            <td>إجمالي التكاليف التشغيلية</td>
            <td class="text-negative">-${formatPrice(data.total_operating_costs?.total || 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="highlight-box ${(data.net_profit?.amount || 0) >= 0 ? 'success' : 'danger'}">
      <div class="row-item" style="border: none;">
        <span style="font-size: 16pt; font-weight: bold;">صافي الربح</span>
        <strong style="font-size: 24pt; ${(data.net_profit?.amount || 0) >= 0 ? 'color: #16a34a;' : 'color: #dc2626;'}">
          ${formatPrice(data.net_profit?.amount || 0)}
        </strong>
      </div>
      <p style="text-align: left; color: #666;">هامش الربح الصافي: ${(data.net_profit?.margin || 0).toFixed(1)}%</p>
    </div>

    <div class="print-footer">
      <p>تم إنشاء هذا التقرير بواسطة نظام Maestro EGP</p>
      <p>${new Date().toLocaleString('ar-IQ')}</p>
    </div>
  `;

  openPrintWindow('تقرير الأرباح والخسائر - ' + (branchName || 'جميع الفروع'), content);
};

export default {
  openPrintWindow,
  printComprehensiveReport,
  printSalesReport,
  printProfitLossReport
};
