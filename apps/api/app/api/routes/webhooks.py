import hashlib
import hmac
import json
from collections.abc import Mapping
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.services.payments import retrieve_checkout

router = APIRouter(tags=["webhooks"])


async def mark_paid(
    db: AsyncSession, order_id: UUID, payment_id: str, raw: Mapping[str, object]
) -> None:
    order = (await db.execute(text("""select payment_status,payment_method from orders
        where id=:id for update"""),
                              {"id": order_id})).mappings().first()
    if not order or order["payment_method"] != "iyzico" or order["payment_status"] == "paid":
        return
    await db.execute(text("""update orders set payment_status='paid',status='received',paid_at=now() where id=:id"""),
                     {"id": order_id})
    await db.execute(text("""update payments set status='paid',provider_payment_id=:payment_id,
        raw_response=:raw where order_id=:id and provider='iyzico'"""), {"id": order_id, "payment_id": payment_id,
        "raw": json.dumps(raw)})
    await db.execute(text("insert into order_status_history(order_id,status) values (:id,'received')"), {"id": order_id})
    await db.execute(text("""insert into notification_outbox(order_id,kind,recipient,payload)
        select id,'order_confirmation',customer_email,jsonb_build_object('order_number',order_number,'total_kurus',total_kurus)
        from orders where id=:id on conflict do nothing"""), {"id": order_id})


@router.post("/iyzico/callback")
async def iyzico_callback(token: str = Form(), db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings)) -> RedirectResponse:
    payment = (await db.execute(text("""select p.order_id,o.locale from payments p join orders o on o.id=p.order_id
        where p.provider='iyzico' and p.provider_reference=:token"""),
                                {"token": token})).mappings().first()
    if not payment:
        raise HTTPException(404, "Payment session not found")
    result = await retrieve_checkout(token, str(payment["order_id"]), settings)
    if result.get("status") == "success" and result.get("paymentStatus") == "SUCCESS":
        await mark_paid(db, payment["order_id"], str(result.get("paymentId", "")), result)
        await db.commit()
        return RedirectResponse(
            f"{settings.app_url}/{payment['locale']}/orders/confirmation?order={payment['order_id']}", 303
        )
    await db.execute(text("update payments set status='failed',raw_response=:raw where order_id=:id"),
                     {"id": payment["order_id"], "raw": json.dumps(result)})
    await db.execute(text("update orders set payment_status='failed' where id=:id"), {"id": payment["order_id"]})
    await db.commit()
    return RedirectResponse(
        f"{settings.app_url}/{payment['locale']}/checkout?payment=failed&order={payment['order_id']}", 303
    )


@router.get("/iyzico/mock/complete")
async def mock_complete(token: str, db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings)) -> RedirectResponse:
    """Local-only payment success page used when sandbox credentials are absent."""
    if settings.is_production or not token.startswith("mock-"):
        raise HTTPException(404, "Not found")
    payment = (await db.execute(text("""select p.order_id,o.locale from payments p
        join orders o on o.id=p.order_id where p.provider='iyzico' and p.provider_reference=:token"""),
        {"token": token})).mappings().first()
    if not payment:
        raise HTTPException(404, "Payment session not found")
    result = {"status": "success", "paymentStatus": "SUCCESS", "paymentId": token}
    await mark_paid(db, payment["order_id"], token, result)
    await db.commit()
    return RedirectResponse(
        f"{settings.app_url}/{payment['locale']}/orders/confirmation?order={payment['order_id']}", 303
    )


@router.post("/iyzico")
async def iyzico_webhook(request: Request, db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings)) -> dict[str, bool]:
    payload = await request.json()
    signature = request.headers.get("x-iyz-signature-v3", "")
    values = [settings.iyzico_secret_key, str(payload.get("iyziEventType", "")),
              str(payload.get("iyziPaymentId", "")), str(payload.get("token", "")),
              str(payload.get("paymentConversationId", "")), str(payload.get("status", ""))]
    expected = hmac.new(settings.iyzico_secret_key.encode(), "".join(values).encode(), hashlib.sha256).hexdigest()
    if settings.is_production and not hmac.compare_digest(signature.casefold(), expected.casefold()):
        raise HTTPException(401, "Invalid webhook signature")
    event_id = str(payload.get("iyziReferenceCode") or hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest())
    inserted = (await db.execute(text("""insert into webhook_events(id,provider,event_type,payload)
        values (:id,'iyzico',:kind,:payload) on conflict do nothing returning id"""), {"id": event_id,
        "kind": str(payload.get("iyziEventType", "unknown")), "payload": json.dumps(payload)})).scalar()
    if inserted and payload.get("status") == "SUCCESS":
        await mark_paid(db, UUID(str(payload["paymentConversationId"])), str(payload.get("iyziPaymentId", "")), payload)
    await db.commit()
    return {"ok": True}
