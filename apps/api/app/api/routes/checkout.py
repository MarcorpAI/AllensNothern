import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, optional_principal
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.schemas import BankTransferInstructionsOut, CheckoutIn, CheckoutOut
from app.services.capacity import enforce_capacity
from app.services.checkout import price_cart, tracking_token

router = APIRouter(tags=["checkout"])


@router.post("/checkout", response_model=CheckoutOut, status_code=201)
async def checkout(payload: CheckoutIn,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=16, max_length=128)],
    principal: Principal | None = Depends(optional_principal), db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings)) -> CheckoutOut:
    existing = (await db.execute(text("select response_json from idempotency_keys where key=:key and endpoint='checkout'"),
                                 {"key": idempotency_key})).scalar()
    if existing:
        return CheckoutOut.model_validate(existing)
    if not settings.bank_transfer_configured:
        raise HTTPException(503, "Bank transfer is not configured yet")
    zone = (await db.execute(text("""select id,name,delivery_fee_kurus from delivery_zones
        where is_active and ST_Covers(area,ST_SetSRID(ST_Point(:lng,:lat),4326)::geography)
        order by priority limit 1"""), {"lat": payload.address.latitude,
        "lng": payload.address.longitude})).mappings().first()
    if not zone:
        raise HTTPException(422, "This address is outside our delivery area")
    lines = await price_cart(db, payload)
    await enforce_capacity(db, payload.locale)
    subtotal = sum(line.total for line in lines)
    total = subtotal + zone["delivery_fee_kurus"]
    raw_token, token_hash = tracking_token()
    # The auth.users trigger normally creates this profile. Keep checkout resilient
    # to a delayed/missing lifecycle trigger without overwriting profile fields.
    if principal:
        await db.execute(
            text("insert into users(id) values (:id) on conflict(id) do nothing"),
            {"id": principal.user_id},
        )
    order = (await db.execute(text("""insert into orders (user_id,status,payment_status,locale,
        customer_name,customer_email,customer_phone,address_text,address_instructions,delivery_location,
        delivery_zone_id,delivery_zone_name,subtotal_kurus,delivery_fee_kurus,total_kurus,tracking_token_hash,
        capacity_reserved_until,payment_expires_at,payment_method,terms_accepted_at,legal_version)
        values (:user_id,'pending_payment','pending',:locale,:name,:email,:phone,:address,:instructions,
        ST_SetSRID(ST_Point(:lng,:lat),4326)::geography,:zone_id,:zone_name,:subtotal,:fee,:total,:token_hash,
        now() + make_interval(mins => :payment_minutes),now() + make_interval(mins => :payment_minutes),
        'bank_transfer',now(),:legal_version)
        returning id,order_number,payment_expires_at"""), {"user_id": principal.user_id if principal else None,
        "locale": payload.locale, "name": payload.customer.full_name, "email": str(payload.customer.email),
        "phone": payload.customer.phone, "address": payload.address.full_address,
        "instructions": payload.address.instructions, "lng": payload.address.longitude,
        "lat": payload.address.latitude, "zone_id": zone["id"], "zone_name": zone["name"],
        "subtotal": subtotal, "fee": zone["delivery_fee_kurus"], "total": total,
        "token_hash": token_hash, "payment_minutes": settings.bank_transfer_payment_minutes,
        "legal_version": payload.legal_version})).mappings().one()
    if principal and payload.save_address:
        await db.execute(text("""insert into addresses(user_id,label,full_address,instructions,location,delivery_zone_id)
            values (:user_id,:label,:address,:instructions,
            ST_SetSRID(ST_Point(:lng,:lat),4326)::geography,:zone_id)"""), {
            "user_id": principal.user_id, "label": payload.address_label,
            "address": payload.address.full_address, "instructions": payload.address.instructions,
            "lng": payload.address.longitude, "lat": payload.address.latitude, "zone_id": zone["id"]
        })
    for line in lines:
        await db.execute(text("""insert into order_items (order_id,menu_item_id,item_name_en,item_name_tr,
            quantity,unit_price_kurus,selected_modifiers,line_total_kurus)
            values (:order_id,:item_id,:name_en,:name_tr,:quantity,:unit_price,:modifiers,:total)"""),
            {"order_id": order["id"], "item_id": line.item_id, "name_en": line.item_name_en,
             "name_tr": line.item_name_tr, "quantity": line.quantity, "unit_price": line.unit_price_kurus,
             "modifiers": json.dumps(line.modifiers), "total": line.total})
    await db.execute(text("""insert into payments (order_id,provider,provider_reference,amount_kurus,status,raw_response)
        values (:order_id,'bank_transfer',:reference,:amount,'pending',:raw)"""), {"order_id": order["id"],
        "reference": order["order_number"], "amount": total,
        "raw": json.dumps({"method": "bank_transfer"})})
    response = CheckoutOut(order_id=order["id"], order_number=order["order_number"], total_kurus=total,
        payment_status="pending", payment_method="bank_transfer", tracking_token=raw_token,
        bank_transfer=BankTransferInstructionsOut(account_holder=settings.bank_transfer_account_holder,
            iban=settings.normalized_bank_transfer_iban, bank_name=settings.bank_transfer_bank_name,
            reference=order["order_number"], expires_at=order["payment_expires_at"]))
    await db.execute(text("insert into idempotency_keys(key,endpoint,response_json) values (:key,'checkout',:response)"),
                     {"key": idempotency_key, "response": json.dumps(response.model_dump(mode="json"))})
    await db.commit()
    return response
