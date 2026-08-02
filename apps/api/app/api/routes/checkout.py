import json
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, optional_principal
from app.core.database import get_db
from app.schemas import (
    BankTransferInstructionsOut,
    CheckoutIn,
    CheckoutOut,
    CheckoutQuoteIn,
    CheckoutQuoteOut,
    CustomerIn,
    PaymentRouteOut,
)
from app.services.capacity import enforce_capacity
from app.services.checkout import price_cart, tracking_token
from app.services.payment_routes import active_local_route, route_snapshot, settlement_amount

router = APIRouter(tags=["checkout"])


async def _zone(db: AsyncSession, latitude: float, longitude: float) -> dict[str, Any]:
    row = (await db.execute(text("""select id,name,delivery_fee_kurus from delivery_zones
        where is_active and ST_Covers(area,ST_SetSRID(ST_Point(:lng,:lat),4326)::geography)
        order by priority limit 1"""), {"lat": latitude, "lng": longitude})).mappings().first()
    if not row:
        raise HTTPException(422, "This address is outside our delivery area")
    return dict(row)


@router.get("/payment-routes", response_model=list[PaymentRouteOut])
async def payment_routes(locale: str = "en", db: AsyncSession = Depends(get_db)) -> list[dict[str, object]]:
    rows = (await db.execute(text("""select id,code,name_en,name_tr,route_type,currency,contact_url,
        rate_valid_until from payment_routes where is_enabled and (
          (route_type='assisted' and contact_url <> '') or
          (route_type='local_transfer' and account_holder <> '' and account_identifier <> ''
            and (currency='TRY' or (customer_rate is not null and rate_valid_until > now())))
        ) order by sort_order,name_en"""))).mappings().all()
    suffix = "tr" if locale == "tr" else "en"
    return [dict(row) | {"name": row[f"name_{suffix}"]} for row in rows]


@router.post("/checkout/quote", response_model=CheckoutQuoteOut, status_code=201)
async def quote_checkout(payload: CheckoutQuoteIn, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    route = await active_local_route(db, payload.payment_route_id)
    zone = await _zone(db, payload.address.latitude, payload.address.longitude)
    quote_payload = CheckoutIn(
        customer=CustomerIn(full_name="Quote customer", email="quote@example.com", phone="+905551112233"),
        address=payload.address, items=payload.items, terms_accepted=True,
    )
    lines = await price_cart(db, quote_payload)
    total = sum(line.total for line in lines) + int(zone["delivery_fee_kurus"])
    rate = Decimal("1") if route["currency"] == "TRY" else Decimal(route["customer_rate"])
    amount = settlement_amount(total, rate, int(route["rounding_increment_minor"]))
    row = (await db.execute(text("""insert into payment_quotes(route_id,base_amount_kurus,
        settlement_currency,settlement_amount_minor,customer_rate,route_snapshot,expires_at)
        values (:route_id,:total,:currency,:amount,:rate,:snapshot,
        now()+make_interval(mins => :minutes))
        returning id,route_id,base_amount_kurus,settlement_currency,settlement_amount_minor,
        customer_rate,expires_at"""), {"route_id": route["id"], "total": total,
        "currency": route["currency"], "amount": amount, "rate": rate,
        "snapshot": json.dumps(route_snapshot(route)), "minutes": route["quote_minutes"]})).mappings().one()
    await db.commit()
    return dict(row)


@router.post("/checkout", response_model=CheckoutOut, status_code=201)
async def checkout(payload: CheckoutIn,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=16, max_length=128)],
    principal: Principal | None = Depends(optional_principal),
    db: AsyncSession = Depends(get_db)) -> CheckoutOut:
    existing = (await db.execute(text(
        "select response_json from idempotency_keys where key=:key and endpoint='checkout'"
    ), {"key": idempotency_key})).scalar()
    if existing:
        return CheckoutOut.model_validate(existing)
    if not payload.payment_route_id or not payload.payment_quote_id:
        raise HTTPException(422, "Choose a payment currency and request a current quote")

    zone = await _zone(db, payload.address.latitude, payload.address.longitude)
    lines = await price_cart(db, payload)
    await enforce_capacity(db, payload.locale)
    subtotal = sum(line.total for line in lines)
    total = subtotal + int(zone["delivery_fee_kurus"])
    quote = (await db.execute(text("""select id,route_id,base_amount_kurus,settlement_currency,
        settlement_amount_minor,customer_rate,route_snapshot,expires_at from payment_quotes
        where id=:id and route_id=:route_id and consumed_at is null and expires_at > now()
        for update"""), {"id": payload.payment_quote_id,
        "route_id": payload.payment_route_id})).mappings().first()
    if not quote:
        raise HTTPException(409, "Your payment quote expired; request a new quote")
    if quote["base_amount_kurus"] != total:
        raise HTTPException(409, "Your order total changed; request a new payment quote")
    snapshot = quote["route_snapshot"]
    raw_token, token_hash = tracking_token()

    if principal:
        await db.execute(text("insert into users(id) values (:id) on conflict(id) do nothing"),
                         {"id": principal.user_id})
    order = (await db.execute(text("""insert into orders (user_id,status,payment_status,locale,
        customer_name,customer_email,customer_phone,address_text,address_instructions,delivery_location,
        delivery_zone_id,delivery_zone_name,subtotal_kurus,delivery_fee_kurus,total_kurus,tracking_token_hash,
        capacity_reserved_until,payment_expires_at,payment_method,terms_accepted_at,legal_version,
        payment_route_id,settlement_currency,settlement_amount_minor,exchange_rate,payment_account_snapshot)
        values (:user_id,'pending_payment','pending',:locale,:name,:email,:phone,:address,:instructions,
        ST_SetSRID(ST_Point(:lng,:lat),4326)::geography,:zone_id,:zone_name,:subtotal,:fee,:total,:token_hash,
        :quote_expires_at,:quote_expires_at,'bank_transfer',now(),:legal_version,
        :route_id,:currency,:settlement_amount,:rate,:snapshot)
        returning id,order_number,payment_expires_at"""), {
        "user_id": principal.user_id if principal else None, "locale": payload.locale,
        "name": payload.customer.full_name, "email": str(payload.customer.email),
        "phone": payload.customer.phone, "address": payload.address.full_address,
        "instructions": payload.address.instructions, "lng": payload.address.longitude,
        "lat": payload.address.latitude, "zone_id": zone["id"], "zone_name": zone["name"],
        "subtotal": subtotal, "fee": zone["delivery_fee_kurus"], "total": total,
        "token_hash": token_hash, "legal_version": payload.legal_version, "route_id": quote["route_id"],
        "currency": quote["settlement_currency"], "settlement_amount": quote["settlement_amount_minor"],
        "rate": quote["customer_rate"], "snapshot": json.dumps(snapshot),
        "quote_expires_at": quote["expires_at"],
    })).mappings().one()

    if principal and payload.save_address:
        await db.execute(text("""insert into addresses(user_id,label,full_address,instructions,location,delivery_zone_id)
            values (:user_id,:label,:address,:instructions,
            ST_SetSRID(ST_Point(:lng,:lat),4326)::geography,:zone_id)"""), {
            "user_id": principal.user_id, "label": payload.address_label,
            "address": payload.address.full_address, "instructions": payload.address.instructions,
            "lng": payload.address.longitude, "lat": payload.address.latitude, "zone_id": zone["id"],
        })
    for line in lines:
        await db.execute(text("""insert into order_items (order_id,menu_item_id,item_name_en,item_name_tr,
            quantity,unit_price_kurus,selected_modifiers,line_total_kurus)
            values (:order_id,:item_id,:name_en,:name_tr,:quantity,:unit_price,:modifiers,:total)"""), {
            "order_id": order["id"], "item_id": line.item_id, "name_en": line.item_name_en,
            "name_tr": line.item_name_tr, "quantity": line.quantity, "unit_price": line.unit_price_kurus,
            "modifiers": json.dumps(line.modifiers), "total": line.total,
        })
    # Retain the guest bearer token only in the locked notification job. The job remains
    # unavailable until payment is confirmed, then supplies the secure tracking link.
    await db.execute(text("""insert into notification_outbox(order_id,kind,recipient,payload,available_at)
        values (:order_id,'order_confirmation',:recipient,
        jsonb_build_object('tracking_token',cast(:tracking_token as text),'status','received'),'infinity')"""), {
        "order_id": order["id"], "recipient": str(payload.customer.email), "tracking_token": raw_token,
    })
    await db.execute(text("""insert into payments (order_id,provider,provider_reference,amount_kurus,status,
        raw_response,settlement_currency,settlement_amount_minor,exchange_rate)
        values (:order_id,'bank_transfer',:reference,:amount,'pending',:raw,:currency,:settlement_amount,:rate)"""),
        {"order_id": order["id"], "reference": order["order_number"], "amount": total,
         "raw": json.dumps({"method": "bank_transfer", "route": snapshot}),
         "currency": quote["settlement_currency"], "settlement_amount": quote["settlement_amount_minor"],
         "rate": quote["customer_rate"]})
    await db.execute(text("update payment_quotes set consumed_at=now() where id=:id"), {"id": quote["id"]})
    response = CheckoutOut(
        order_id=order["id"], order_number=order["order_number"], total_kurus=total,
        payment_status="pending", payment_method="bank_transfer", tracking_token=raw_token,
        bank_transfer=BankTransferInstructionsOut(
            account_holder=snapshot["account_holder"], bank_name=snapshot["bank_name"],
            account_label=snapshot["account_label"], account_identifier=snapshot["account_identifier"],
            currency=quote["settlement_currency"], amount_minor=quote["settlement_amount_minor"],
            customer_rate=quote["customer_rate"], reference=order["order_number"],
            expires_at=order["payment_expires_at"],
        ),
    )
    await db.execute(text(
        "insert into idempotency_keys(key,endpoint,response_json) values (:key,'checkout',:response)"
    ), {"key": idempotency_key, "response": json.dumps(response.model_dump(mode="json"))})
    await db.commit()
    return response
