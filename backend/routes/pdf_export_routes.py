"""Export to PDF (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403
from server import (_sn)

router = APIRouter()

# ==================== EXPORT TO PDF ====================

@router.get("/reports/export/pdf")
async def export_report_to_pdf(
    report_type: str = "sales",  # sales, payroll, expenses, inventory
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تصدير التقارير إلى PDF"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    
    tenant_id = get_user_tenant_id(current_user)
    
    if not start_date:
        start_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not end_date:
        end_date = start_date
    
    # Build query with branch filtering
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    effective_branch_id = None
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.MANAGER]:
        effective_branch_id = user_branch_id
    elif branch_id:
        effective_branch_id = branch_id
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=1*cm, leftMargin=1*cm, topMargin=1*cm, bottomMargin=1*cm)
    
    styles = getSampleStyleSheet()
    elements = []
    
    # Title
    title_text = ""
    headers = []
    data_rows = []
    totals_row = None
    
    if report_type == "sales":
        title_text = f"تقرير المبيعات - من {start_date} إلى {end_date}"
        
        query = {"status": {"$ne": "cancelled"}, "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}}
        if tenant_id:
            query["tenant_id"] = tenant_id
        if effective_branch_id:
            query["branch_id"] = effective_branch_id
        
        orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
        
        headers = ["#", "رقم الطلب", "التاريخ", "النوع", "طريقة الدفع", "المبلغ"]
        order_types = {"dine_in": "محلي", "takeaway": "سفري", "delivery": "توصيل"}
        payment_methods = {"cash": "نقدي", "card": "بطاقة", "credit": "آجل"}
        
        total_amount = 0
        for idx, order in enumerate(orders, 1):
            created_at = order.get("created_at", "")[:10]
            amount = _sn(order.get("total"))
            total_amount += amount
            
            data_rows.append([
                str(idx),
                order.get("order_number", ""),
                created_at,
                order_types.get(order.get("order_type"), order.get("order_type", "")),
                payment_methods.get(order.get("payment_method"), order.get("payment_method", "")),
                f"{amount:,.0f}"
            ])
        
        totals_row = ["", "", "", "", "الإجمالي:", f"{total_amount:,.0f}"]
        
    elif report_type == "expenses":
        title_text = f"تقرير المصاريف - من {start_date} إلى {end_date}"
        
        query = {"date": {"$gte": start_date, "$lte": end_date}}
        if tenant_id:
            query["tenant_id"] = tenant_id
        if effective_branch_id:
            query["branch_id"] = effective_branch_id
        
        expenses = await db.expenses.find(query, {"_id": 0}).to_list(1000)
        
        headers = ["#", "التاريخ", "الفئة", "الوصف", "المبلغ"]
        category_names = {
            "supplies": "مستلزمات", "utilities": "خدمات", "salaries": "رواتب",
            "rent": "إيجار", "maintenance": "صيانة", "marketing": "تسويق", "other": "أخرى"
        }
        
        total_amount = 0
        for idx, expense in enumerate(expenses, 1):
            amount = _sn(expense.get("amount"))
            total_amount += amount
            
            data_rows.append([
                str(idx),
                expense.get("date", ""),
                category_names.get(expense.get("category"), expense.get("category", "")),
                expense.get("description", "")[:30],
                f"{amount:,.0f}"
            ])
        
        totals_row = ["", "", "", "الإجمالي:", f"{total_amount:,.0f}"]
        
    elif report_type == "inventory":
        title_text = "تقرير المخزون"
        
        query = {}
        if tenant_id:
            query["tenant_id"] = tenant_id
        if effective_branch_id:
            query["branch_id"] = effective_branch_id
        
        items = await db.inventory.find(query, {"_id": 0}).to_list(1000)
        
        headers = ["#", "الصنف", "النوع", "الكمية", "الحد الأدنى", "سعر الوحدة", "القيمة"]
        type_names = {"raw": "خام", "finished": "منتج نهائي"}
        
        total_value = 0
        for idx, item in enumerate(items, 1):
            qty = _sn(item.get("quantity"))
            cost = item.get("cost_per_unit", 0)
            value = qty * cost
            total_value += value
            
            data_rows.append([
                str(idx),
                item.get("name", ""),
                type_names.get(item.get("item_type"), item.get("item_type", "")),
                str(qty),
                str(item.get("min_quantity", 0)),
                f"{cost:,.0f}",
                f"{value:,.0f}"
            ])
        
        totals_row = ["", "", "", "", "", "الإجمالي:", f"{total_value:,.0f}"]
    
    elif report_type == "payroll":
        title_text = f"تقرير الرواتب - {start_date[:7]}"
        
        query = {"is_active": True}
        if tenant_id:
            query["tenant_id"] = tenant_id
        if effective_branch_id:
            query["branch_id"] = effective_branch_id
        
        employees = await db.employees.find(query, {"_id": 0}).to_list(500)
        month = start_date[:7]
        month_start = f"{month}-01"
        month_end = f"{month}-31"
        
        headers = ["#", "الموظف", "الوظيفة", "الراتب", "المكافآت", "الخصومات", "السلف", "الصافي"]
        
        totals = [0, 0, 0, 0, 0]
        for idx, emp in enumerate(employees, 1):
            # Get deductions, bonuses, advances
            deductions = await db.deductions.find({
                "employee_id": emp["id"],
                "date": {"$gte": month_start, "$lte": month_end}
            }, {"_id": 0}).to_list(100)
            emp_deductions = sum(_sn(d.get("amount")) for d in deductions)
            
            bonuses = await db.bonuses.find({
                "employee_id": emp["id"],
                "date": {"$gte": month_start, "$lte": month_end}
            }, {"_id": 0}).to_list(100)
            emp_bonuses = sum(_sn(b.get("amount")) for b in bonuses)
            
            advances = await db.advances.find({
                "employee_id": emp["id"],
                "status": "approved",
                "remaining_amount": {"$gt": 0}
            }, {"_id": 0}).to_list(100)
            emp_advances = sum(a.get("monthly_deduction", 0) for a in advances)
            
            basic = _sn(emp.get("salary"))
            net = basic + emp_bonuses - emp_deductions - emp_advances
            
            totals[0] += basic
            totals[1] += emp_bonuses
            totals[2] += emp_deductions
            totals[3] += emp_advances
            totals[4] += net
            
            data_rows.append([
                str(idx),
                emp.get("name", ""),
                emp.get("position", ""),
                f"{basic:,.0f}",
                f"{emp_bonuses:,.0f}",
                f"{emp_deductions:,.0f}",
                f"{emp_advances:,.0f}",
                f"{net:,.0f}"
            ])
        
        totals_row = ["", "", "الإجمالي:", f"{totals[0]:,.0f}", f"{totals[1]:,.0f}", f"{totals[2]:,.0f}", f"{totals[3]:,.0f}", f"{totals[4]:,.0f}"]
    
    # Build PDF
    title_style = styles['Heading1']
    title_style.alignment = 1
    elements.append(Paragraph(title_text, title_style))
    elements.append(Spacer(1, 20))
    
    if headers and data_rows:
        table_data = [headers] + data_rows
        if totals_row:
            table_data.append(totals_row)
        
        col_widths = [doc.width / len(headers)] * len(headers)
        table = Table(table_data, colWidths=col_widths)
        
        style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4472C4')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F5F5F5')]),
        ])
        
        if totals_row:
            style.add('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#E6E6E6'))
            style.add('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold')
        
        table.setStyle(style)
        elements.append(table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"report_{report_type}_{start_date}_to_{end_date}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/reports/payroll/export/pdf")
async def export_payroll_pdf(
    month: str,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تصدير تقرير الرواتب إلى PDF"""
    return await export_report_to_pdf(
        report_type="payroll",
        start_date=f"{month}-01",
        end_date=f"{month}-31",
        branch_id=branch_id,
        current_user=current_user
    )

@router.get("/reports/employee-salary-slip/{employee_id}/export/pdf")
async def export_employee_salary_slip_pdf(
    employee_id: str,
    month: str,
    current_user: dict = Depends(get_current_user)
):
    """تصدير مفردات مرتب موظف إلى PDF"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    
    # Get salary slip data
    slip_data = await get_employee_salary_slip(employee_id, month, current_user)
    employee = slip_data["employee"]
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    
    styles = getSampleStyleSheet()
    elements = []
    
    # Title
    title_style = styles['Heading1']
    title_style.alignment = 1
    elements.append(Paragraph("مفردات المرتب", title_style))
    elements.append(Spacer(1, 20))
    
    # Employee info
    info_data = [
        ["الموظف:", employee.get("name", ""), "الشهر:", month],
        ["الوظيفة:", employee.get("position", ""), "الفرع:", slip_data.get("branch", {}).get("name", "-") if slip_data.get("branch") else "-"]
    ]
    info_table = Table(info_data, colWidths=[doc.width/4]*4)
    info_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 20))
    
    # Salary details
    salary_data = [
        ["البند", "المبلغ"],
        ["الراتب الأساسي", f"{slip_data['salary_details']['basic_salary']:,.0f}"],
        ["المكافآت", f"{slip_data['bonuses']['total']:,.0f}"],
        ["الخصومات", f"-{slip_data['deductions']['total']:,.0f}"],
        ["خصم السلف", f"-{slip_data['advances']['deduction_this_month']:,.0f}"],
        ["صافي الراتب", f"{slip_data['summary']['net_salary']:,.0f}"],
    ]
    
    salary_table = Table(salary_data, colWidths=[doc.width/2]*2)
    salary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4472C4')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#E6E6E6')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(salary_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"salary_slip_{employee.get('name', 'employee')}_{month}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

