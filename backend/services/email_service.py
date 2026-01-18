"""
Email Service - خدمة البريد الإلكتروني
إرسال التقارير والإشعارات عبر البريد
"""
import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)

# SendGrid configuration
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@maestroegp.com')


async def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """إرسال بريد إلكتروني باستخدام SendGrid"""
    if not SENDGRID_API_KEY:
        logger.warning("SendGrid API key not configured")
        return False
    
    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail, Email, To, Content
        
        sg = sendgrid.SendGridAPIClient(api_key=SENDGRID_API_KEY)
        message = Mail(
            from_email=Email(SENDER_EMAIL),
            to_emails=To(to_email),
            subject=subject,
            html_content=Content("text/html", html_content)
        )
        response = sg.send(message)
        logger.info(f"Email sent to {to_email}, status: {response.status_code}")
        return response.status_code in [200, 201, 202]
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False


def generate_daily_report_html(report_data: Dict) -> str:
    """إنشاء HTML لتقرير اليوم"""
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Format currency
    def format_price(amount):
        return f"{amount:,.0f} د.ع"
    
    branches_html = ""
    for branch in report_data.get("branches", []):
        branches_html += f"""
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">{branch['name']}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">{branch['orders']}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: left; color: #22c55e;">{format_price(branch['sales'])}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: left; color: #ef4444;">{format_price(branch['expenses'])}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: left; color: #3b82f6; font-weight: bold;">{format_price(branch['profit'])}</td>
        </tr>
        """
    
    html = f"""
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; background: #f5f5f5; margin: 0; padding: 20px; }}
            .container {{ max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
            .header {{ background: linear-gradient(135deg, #D4AF37, #f4d03f); padding: 30px; text-align: center; }}
            .header h1 {{ margin: 0; color: #1a1a2e; font-size: 28px; }}
            .header p {{ margin: 10px 0 0; color: #333; }}
            .content {{ padding: 30px; }}
            .stats {{ display: flex; justify-content: space-around; margin: 20px 0; text-align: center; }}
            .stat-box {{ background: #f8f9fa; padding: 20px; border-radius: 8px; min-width: 120px; }}
            .stat-box .value {{ font-size: 24px; font-weight: bold; color: #1a1a2e; }}
            .stat-box .label {{ font-size: 14px; color: #666; margin-top: 5px; }}
            table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            th {{ background: #1a1a2e; color: white; padding: 12px; text-align: right; }}
            .footer {{ background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            .success {{ color: #22c55e; }}
            .danger {{ color: #ef4444; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 التقرير اليومي</h1>
                <p>{today}</p>
            </div>
            
            <div class="content">
                <div class="stats">
                    <div class="stat-box">
                        <div class="value success">{format_price(report_data.get('total_sales', 0))}</div>
                        <div class="label">إجمالي المبيعات</div>
                    </div>
                    <div class="stat-box">
                        <div class="value">{report_data.get('total_orders', 0)}</div>
                        <div class="label">عدد الطلبات</div>
                    </div>
                    <div class="stat-box">
                        <div class="value danger">{format_price(report_data.get('total_expenses', 0))}</div>
                        <div class="label">المصاريف</div>
                    </div>
                    <div class="stat-box">
                        <div class="value" style="color: #3b82f6;">{format_price(report_data.get('net_profit', 0))}</div>
                        <div class="label">صافي الربح</div>
                    </div>
                </div>
                
                <h3>📍 تفاصيل الفروع</h3>
                <table>
                    <thead>
                        <tr>
                            <th>الفرع</th>
                            <th>الطلبات</th>
                            <th>المبيعات</th>
                            <th>المصاريف</th>
                            <th>الربح</th>
                        </tr>
                    </thead>
                    <tbody>
                        {branches_html if branches_html else '<tr><td colspan="5" style="text-align: center; padding: 20px;">لا توجد بيانات</td></tr>'}
                    </tbody>
                </table>
                
                <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-top: 20px;">
                    <strong>ملاحظات:</strong>
                    <ul style="margin: 10px 0; padding-right: 20px;">
                        <li>تم إغلاق {report_data.get('shifts_closed', 0)} وردية</li>
                        <li>عدد الطلبات الملغية: {report_data.get('cancelled_orders', 0)}</li>
                        <li>وقت إنشاء التقرير: {datetime.now(timezone.utc).strftime('%H:%M')}</li>
                    </ul>
                </div>
            </div>
            
            <div class="footer">
                <p>تم إرسال هذا التقرير تلقائياً من نظام Maestro EGP</p>
                <p>للمزيد من التفاصيل، قم بزيارة لوحة التحكم</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return html


async def send_daily_report(tenant_id: Optional[str], report_data: Dict, recipient_emails: List[str]) -> Dict:
    """إرسال التقرير اليومي عبر البريد"""
    results = {"success": 0, "failed": 0, "emails": []}
    
    if not recipient_emails:
        logger.warning("No recipient emails provided for daily report")
        return results
    
    html_content = generate_daily_report_html(report_data)
    subject = f"📊 التقرير اليومي - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    
    for email in recipient_emails:
        success = await send_email(email, subject, html_content)
        if success:
            results["success"] += 1
            results["emails"].append({"email": email, "status": "sent"})
        else:
            results["failed"] += 1
            results["emails"].append({"email": email, "status": "failed"})
    
    return results
