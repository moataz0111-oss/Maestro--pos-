"""
Payment Routes - واجهة برمجة الدفع الإلكتروني
Stripe Integration with saved cards
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from datetime import datetime, timezone
import uuid
import os

router = APIRouter(prefix="/payments", tags=["Payments"])

# ==================== MODELS ====================

class CreatePaymentRequest(BaseModel):
    order_id: str
    amount: float
    currency: str = "usd"
    customer_id: Optional[str] = None
    customer_phone: Optional[str] = None
    save_card: bool = False
    tenant_id: str

class SavedCard(BaseModel):
    card_id: str
    last4: str
    brand: str
    exp_month: int
    exp_year: int

class PaymentStatusResponse(BaseModel):
    status: str
    payment_status: str
    amount_total: float
    currency: str
    order_id: Optional[str] = None

# ==================== PAYMENT ROUTES ====================

def create_payment_routes(db):
    """إنشاء routes الدفع"""
    
    @router.post("/create-checkout/{tenant_id}")
    async def create_checkout_session(
        tenant_id: str,
        request: Request,
        order_id: str,
        amount: float,
        customer_phone: Optional[str] = None,
        save_card: bool = False
    ):
        """إنشاء جلسة دفع Stripe"""
        try:
            from emergentintegrations.payments.stripe.checkout import (
                StripeCheckout, 
                CheckoutSessionRequest,
                CheckoutSessionResponse
            )
            
            api_key = os.environ.get('STRIPE_API_KEY')
            if not api_key:
                raise HTTPException(status_code=500, detail="Stripe not configured")
            
            # جلب معلومات المطعم
            tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
            if not tenant:
                tenant = {"name": "المطعم", "id": tenant_id}
            
            # إعداد URLs
            host_url = str(request.base_url).rstrip('/')
            webhook_url = f"{host_url}/api/webhook/stripe"
            
            # استخدام الـ origin من الـ referer
            referer = request.headers.get('referer', '')
            if referer:
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                frontend_url = f"{parsed.scheme}://{parsed.netloc}"
            else:
                frontend_url = host_url
            
            success_url = f"{frontend_url}/menu/{tenant_id}?payment_success=true&session_id={{CHECKOUT_SESSION_ID}}"
            cancel_url = f"{frontend_url}/menu/{tenant_id}?payment_cancelled=true"
            
            stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
            
            # إنشاء طلب الدفع
            checkout_request = CheckoutSessionRequest(
                amount=float(amount),
                currency="usd",  # Stripe يدعم USD
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={
                    "order_id": order_id,
                    "tenant_id": tenant_id,
                    "customer_phone": customer_phone or "",
                    "save_card": str(save_card)
                },
                payment_methods=["card"]
            )
            
            session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
            
            # حفظ معاملة الدفع
            transaction = {
                "id": str(uuid.uuid4()),
                "session_id": session.session_id,
                "order_id": order_id,
                "tenant_id": tenant_id,
                "amount": amount,
                "currency": "usd",
                "customer_phone": customer_phone,
                "payment_status": "pending",
                "status": "initiated",
                "save_card": save_card,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.payment_transactions.insert_one(transaction)
            
            return {
                "success": True,
                "checkout_url": session.url,
                "session_id": session.session_id
            }
            
        except ImportError:
            raise HTTPException(status_code=500, detail="Payment library not installed")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Payment error: {str(e)}")
    
    @router.get("/status/{session_id}")
    async def get_payment_status(session_id: str):
        """التحقق من حالة الدفع"""
        try:
            from emergentintegrations.payments.stripe.checkout import StripeCheckout
            
            api_key = os.environ.get('STRIPE_API_KEY')
            if not api_key:
                raise HTTPException(status_code=500, detail="Stripe not configured")
            
            stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
            status = await stripe_checkout.get_checkout_status(session_id)
            
            # تحديث حالة المعاملة في قاعدة البيانات
            transaction = await db.payment_transactions.find_one({"session_id": session_id})
            
            if transaction:
                new_status = "completed" if status.payment_status == "paid" else status.payment_status
                
                # تجنب التحديث المتكرر
                if transaction.get("payment_status") != new_status:
                    await db.payment_transactions.update_one(
                        {"session_id": session_id},
                        {
                            "$set": {
                                "payment_status": new_status,
                                "status": status.status,
                                "updated_at": datetime.now(timezone.utc).isoformat()
                            }
                        }
                    )
                    
                    # تحديث حالة الطلب إذا تم الدفع
                    if status.payment_status == "paid" and transaction.get("order_id"):
                        await db.orders.update_one(
                            {"id": transaction["order_id"]},
                            {
                                "$set": {
                                    "payment_status": "paid",
                                    "paid_at": datetime.now(timezone.utc).isoformat()
                                }
                            }
                        )
            
            return {
                "status": status.status,
                "payment_status": status.payment_status,
                "amount_total": status.amount_total / 100,  # تحويل من سنت
                "currency": status.currency,
                "order_id": status.metadata.get("order_id") if status.metadata else None
            }
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Status check error: {str(e)}")
    
    @router.get("/customer-cards/{tenant_id}/{phone}")
    async def get_customer_saved_cards(tenant_id: str, phone: str):
        """جلب البطاقات المحفوظة للعميل"""
        cards = await db.saved_cards.find(
            {"tenant_id": tenant_id, "customer_phone": phone, "is_active": True},
            {"_id": 0, "card_token": 0}  # عدم إرجاع التوكن الحقيقي
        ).to_list(10)
        
        return {"cards": cards}
    
    @router.delete("/customer-cards/{card_id}")
    async def delete_saved_card(card_id: str):
        """حذف بطاقة محفوظة"""
        result = await db.saved_cards.update_one(
            {"id": card_id},
            {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="البطاقة غير موجودة")
        
        return {"success": True, "message": "تم حذف البطاقة"}
    
    return router


# Webhook handler
async def handle_stripe_webhook(request: Request, db):
    """معالجة webhook من Stripe"""
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        
        api_key = os.environ.get('STRIPE_API_KEY')
        if not api_key:
            return {"error": "Stripe not configured"}
        
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            # تحديث المعاملة
            await db.payment_transactions.update_one(
                {"session_id": webhook_response.session_id},
                {
                    "$set": {
                        "payment_status": "completed",
                        "status": "complete",
                        "webhook_event_id": webhook_response.event_id,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            # تحديث الطلب
            transaction = await db.payment_transactions.find_one({"session_id": webhook_response.session_id})
            if transaction and transaction.get("order_id"):
                await db.orders.update_one(
                    {"id": transaction["order_id"]},
                    {
                        "$set": {
                            "payment_status": "paid",
                            "paid_at": datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
        
        return {"received": True, "event_type": webhook_response.event_type}
        
    except Exception as e:
        return {"error": str(e)}
