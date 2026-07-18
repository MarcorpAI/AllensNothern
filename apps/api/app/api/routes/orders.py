import hashlib
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, require_principal
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.schemas import (
    BankTransferInstructionsOut,
    CustomerOrderDetailOut,
    CustomerProfileOut,
    OrderOut,
    SavedAddressOut,
    SavedAddressWrite,
    TrackedOrderOut,
    TransferSentOut,
)
from app.services.bank_transfer import expire_bank_transfer_orders

router = APIRouter(tags=["orders"])


def _order(data: RowMapping) -> OrderOut:
    return OrderOut(id=data["id"], order_number=data["order_number"], status=data["status"],
        payment_status=data["payment_status"], customer_name=data["customer_name"],
        total_kurus=data["total_kurus"], delivery_address=data["address_text"],
        created_at=data["created_at"], paid_at=data.get("paid_at"))


async def _status_history(db: AsyncSession, order_id: UUID) -> list[dict[str, object]]:
    rows = (await db.execute(text("""select status::text status,changed_at from order_status_history
        where order_id=:id order by changed_at,id"""), {"id": order_id})).mappings().all()
    return [dict(row) for row in rows]


@router.get("/orders/track/{token}", response_model=TrackedOrderOut)
async def track(token: str, db: AsyncSession = Depends(get_db),
                settings: Settings = Depends(get_settings)) -> dict[str, object]:
    if await expire_bank_transfer_orders(db):
        await db.commit()
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = (await db.execute(text("""select id,order_number,status,payment_status,customer_name,
        total_kurus,address_text,created_at,paid_at,payment_method,payment_expires_at,
        transfer_notified_at from orders where tracking_token_hash=:hash"""),
        {"hash": token_hash})).mappings().first()
    if not row:
        raise HTTPException(404, "Order not found")
    instructions = None
    if row["payment_method"] == "bank_transfer" and row["payment_status"] == "pending":
        instructions = BankTransferInstructionsOut(account_holder=settings.bank_transfer_account_holder,
            iban=settings.normalized_bank_transfer_iban, bank_name=settings.bank_transfer_bank_name,
            reference=row["order_number"], expires_at=row["payment_expires_at"])
    return dict(row) | {"delivery_address": row["address_text"], "bank_transfer": instructions,
                        "status_history": await _status_history(db, row["id"])}


@router.post("/orders/track/{token}/transfer-sent", response_model=TransferSentOut)
async def transfer_sent(token: str, db: AsyncSession = Depends(get_db),
                        settings: Settings = Depends(get_settings)) -> dict[str, object]:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = (await db.execute(text("""select id,payment_status::text payment_status,payment_method,
        payment_expires_at,transfer_notified_at from orders where tracking_token_hash=:hash for update"""),
        {"hash": token_hash})).mappings().first()
    if not row:
        raise HTTPException(404, "Order not found")
    if row["payment_method"] != "bank_transfer" or row["payment_status"] != "pending":
        raise HTTPException(409, "This order is not awaiting a bank transfer")
    if row["transfer_notified_at"] is None:
        updated = (await db.execute(text("""update orders set transfer_notified_at=now(),
            payment_expires_at=now()+make_interval(mins => :minutes),
            capacity_reserved_until=now()+make_interval(mins => :minutes),updated_at=now()
            where id=:id and payment_expires_at > now()
            returning transfer_notified_at,payment_expires_at"""), {"id": row["id"],
            "minutes": settings.bank_transfer_verification_minutes})).mappings().first()
        if not updated:
            await db.rollback()
            raise HTTPException(410, "The payment window has expired")
    else:
        updated = row
    await db.commit()
    return {"transfer_notified_at": updated["transfer_notified_at"],
            "payment_expires_at": updated["payment_expires_at"]}


@router.get("/orders", response_model=list[OrderOut])
async def history(principal: Principal = Depends(require_principal),
                  db: AsyncSession = Depends(get_db)) -> list[OrderOut]:
    rows = (await db.execute(text("""select id,order_number,status,payment_status,customer_name,
        total_kurus,address_text,created_at,paid_at from orders where user_id=:user_id
        and payment_status='paid' order by created_at desc"""),
        {"user_id": principal.user_id})).mappings().all()
    return [_order(row) for row in rows]


@router.get("/orders/{order_id}", response_model=CustomerOrderDetailOut)
async def customer_order_detail(order_id: UUID, principal: Principal = Depends(require_principal),
                                db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    order = (await db.execute(text("""select id,order_number,status::text status,
        payment_status::text payment_status,locale,customer_name,customer_email,customer_phone,
        address_text,address_instructions delivery_instructions,delivery_zone_name,subtotal_kurus,
        delivery_fee_kurus,total_kurus,created_at,paid_at from orders where id=:id
        and user_id=:user_id and payment_status='paid'"""),
        {"id": order_id, "user_id": principal.user_id})).mappings().first()
    if not order:
        raise HTTPException(404, "Order not found")
    suffix = "tr" if order["locale"] == "tr" else "en"
    items = (await db.execute(text(f"""select id,item_name_{suffix} item_name,quantity,
        unit_price_kurus,line_total_kurus,selected_modifiers from order_items
        where order_id=:id order by id"""), {"id": order_id})).mappings().all()
    return dict(order) | {
        "delivery_address": order["address_text"],
        "items": [dict(item) for item in items],
        "status_history": await _status_history(db, order_id),
    }


@router.get("/profile", response_model=CustomerProfileOut)
async def profile(principal: Principal = Depends(require_principal),
                  db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("select full_name,email,phone from users where id=:id"),
                            {"id": principal.user_id})).mappings().first()
    return dict(row) if row else {"full_name": None, "email": None, "phone": None}


@router.get("/addresses", response_model=list[SavedAddressOut])
async def addresses(principal: Principal = Depends(require_principal),
                    db: AsyncSession = Depends(get_db)) -> list[SavedAddressOut]:
    rows = (await db.execute(text("""select id,label,full_address,instructions,
        ST_Y(location::geometry) latitude,ST_X(location::geometry) longitude
        from addresses where user_id=:user_id order by created_at desc"""),
        {"user_id": principal.user_id})).mappings().all()
    return [SavedAddressOut.model_validate(dict(row)) for row in rows]


@router.put("/addresses/{address_id}", response_model=SavedAddressOut)
async def update_address(address_id: UUID, payload: SavedAddressWrite,
                         principal: Principal = Depends(require_principal),
                         db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    zone_id = (await db.execute(text("""select id from delivery_zones where is_active
        and ST_Covers(area,ST_SetSRID(ST_Point(:lng,:lat),4326)::geography)
        order by priority limit 1"""), {"lat": payload.latitude, "lng": payload.longitude})).scalar()
    if not zone_id:
        raise HTTPException(422, "This address is outside our delivery area")
    row = (await db.execute(text("""update addresses set label=:label,full_address=:full_address,
        instructions=:instructions,location=ST_SetSRID(ST_Point(:longitude,:latitude),4326)::geography,
        delivery_zone_id=:zone_id,updated_at=now() where id=:id and user_id=:user_id
        returning id,label,full_address,instructions,ST_Y(location::geometry) latitude,
        ST_X(location::geometry) longitude"""), payload.model_dump() | {"id": address_id,
        "user_id": principal.user_id, "zone_id": zone_id})).mappings().first()
    if not row:
        raise HTTPException(404, "Address not found")
    await db.commit()
    return dict(row)


@router.delete("/addresses/{address_id}", status_code=204)
async def delete_address(address_id: UUID, principal: Principal = Depends(require_principal),
                         db: AsyncSession = Depends(get_db)) -> None:
    deleted = (await db.execute(text("delete from addresses where id=:id and user_id=:user_id returning id"),
                                {"id": address_id, "user_id": principal.user_id})).scalar()
    if not deleted:
        raise HTTPException(404, "Address not found")
    await db.commit()
