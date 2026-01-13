"""
Email Service
"""
import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from config.settings import SENDGRID_API_KEY, SENDER_EMAIL

logger = logging.getLogger(__name__)

async def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Send an email using SendGrid"""
    if not SENDGRID_API_KEY:
        logger.warning("SendGrid API key not configured")
        return False
    
    try:
        message = Mail(
            from_email=SENDER_EMAIL,
            to_emails=to_email,
            subject=subject,
            html_content=html_content
        )
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        sg.send(message)
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False
