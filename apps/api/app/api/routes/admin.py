import json
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field, TypeAdapter, model_validator
from sqlalchemy import text
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, require_admin
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.schemas import (
    AvailabilityIn,
    BankTransferConfirmationIn,
    KitchenOrderDetailOut,
    OrderOut,
    PendingBankTransferOrderOut,
    StatusUpdateIn,
)
from app.services.bank_transfer import expire_bank_transfer_orders
from app.services.menu_management import (
    MenuImageStorage,
    MenuItemWrite,
    ModifierWrite,
    create_complete_item,
    delete_complete_item,
    replace_item_image,
    update_complete_item,
)

router = APIRouter(tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/access")
async def access_check() -> dict[str, str]:
    return {"role": "admin"}


class CategoryWrite(BaseModel):
    name_en: str = Field(min_length=1, max_length=100)
    name_tr: str = Field(min_length=1, max_length=100)
    sort_order: int = 0
    is_active: bool = True


class PolygonWrite(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[list[list[float]]]

    @model_validator(mode="after")
    def validate_polygon(self) -> "PolygonWrite":
        if len(self.coordinates) != 1:
            raise ValueError("Delivery areas must contain one outer boundary without holes")
        ring = self.coordinates[0]
        if len(ring) < 4 or ring[0] != ring[-1] or len({tuple(point) for point in ring[:-1]}) < 3:
            raise ValueError("Draw at least three boundary points and close the delivery area")
        if any(len(point) != 2 or not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90 for point in ring):
            raise ValueError("Delivery-area coordinates are invalid")
        return self


class ZoneWrite(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    polygon: PolygonWrite
    delivery_fee_kurus: int = Field(ge=0)
    priority: int = 100
    is_active: bool = True


class HoursInterval(BaseModel):
    weekday: int = Field(ge=0, le=6)
    opens_at: time
    closes_at: time


class HoursWrite(BaseModel):
    intervals: list[HoursInterval]


class ClosureWrite(BaseModel):
    closure_date: date
    reason: str = Field(default="", max_length=250)


class ZoneActiveWrite(BaseModel):
    is_active: bool


class CapacityRuleWrite(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    weekday: int | None = Field(default=None, ge=0, le=6)
    target_date: date | None = None
    starts_at: time | None = None
    ends_at: time | None = None
    max_orders: int = Field(ge=1, le=500)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_rule(self) -> "CapacityRuleWrite":
        if self.weekday is not None and self.target_date is not None:
            raise ValueError("Choose every day, one recurring weekday, or one specific date")
        if (self.starts_at is None) != (self.ends_at is None):
            raise ValueError("Provide both a start and end time, or leave both blank for an all-day limit")
        if self.starts_at is not None and self.ends_at is not None and self.starts_at >= self.ends_at:
            raise ValueError("Capacity start time must be before end time")
        return self


class PaymentRouteWrite(BaseModel):
    code: str = Field(pattern=r"^[a-z0-9-]+$", min_length=2, max_length=50)
    name_en: str = Field(min_length=2, max_length=100)
    name_tr: str = Field(min_length=2, max_length=100)
    route_type: Literal["local_transfer", "assisted"]
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    account_holder: str = Field(default="", max_length=120)
    bank_name: str = Field(default="", max_length=120)
    account_label: str = Field(default="Account number", max_length=50)
    account_identifier: str = Field(default="", max_length=120)
    contact_url: str = Field(default="", max_length=500)
    customer_rate: Decimal | None = Field(default=None, gt=0)
    rounding_increment_minor: int = Field(default=1, ge=1, le=100000)
    quote_minutes: int = Field(default=20, ge=5, le=120)
    rate_valid_until: datetime | None = None
    is_enabled: bool = False
    sort_order: int = 0

    @model_validator(mode="after")
    def validate_route(self) -> "PaymentRouteWrite":
        if self.route_type == "assisted":
            if not self.contact_url:
                raise ValueError("Assisted payment routes need a contact URL")
            self.currency = None
            self.customer_rate = None
        else:
            if not self.currency or not self.account_holder or not self.account_identifier:
                raise ValueError("Local transfers need a currency, account holder, and account identifier")
            if self.currency != "TRY" and (self.customer_rate is None or self.rate_valid_until is None):
                raise ValueError("Foreign-currency routes need a customer rate and validity time")
        return self


def order_out(data: RowMapping) -> OrderOut:
    return OrderOut(id=data["id"], order_number=data["order_number"], status=data["status"],
        payment_status=data["payment_status"], customer_name=data["customer_name"],
        total_kurus=data["total_kurus"], delivery_address=data["address_text"],
        created_at=data["created_at"], paid_at=data.get("paid_at"))


def get_menu_image_storage(settings: Settings = Depends(get_settings)) -> MenuImageStorage:
    return MenuImageStorage(settings)


def _item_payload(raw: str) -> MenuItemWrite:
    try:
        return MenuItemWrite.model_validate_json(raw)
    except ValueError as exc:
        raise HTTPException(422, "Invalid menu item data") from exc


def _modifier_payload(raw: str) -> list[ModifierWrite]:
    try:
        return TypeAdapter(list[ModifierWrite]).validate_json(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "Invalid modifier data") from exc


@router.get("/payment-routes")
async def admin_payment_routes(db: AsyncSession = Depends(get_db)) -> list[dict[str, object]]:
    rows = (await db.execute(text("""select id,code,name_en,name_tr,route_type,currency,account_holder,
        bank_name,account_label,account_identifier,contact_url,customer_rate,rounding_increment_minor,
        quote_minutes,rate_valid_until,is_enabled,sort_order,updated_at
        from payment_routes order by sort_order,name_en"""))).mappings().all()
    return [dict(row) for row in rows]


@router.post("/payment-routes", status_code=201)
async def create_payment_route(payload: PaymentRouteWrite,
                               db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("""insert into payment_routes(code,name_en,name_tr,route_type,currency,
        account_holder,bank_name,account_label,account_identifier,contact_url,customer_rate,
        rounding_increment_minor,quote_minutes,rate_valid_until,is_enabled,sort_order)
        values (:code,:name_en,:name_tr,:route_type,:currency,:account_holder,:bank_name,:account_label,
        :account_identifier,:contact_url,:customer_rate,:rounding_increment_minor,:quote_minutes,
        :rate_valid_until,:is_enabled,:sort_order) returning *"""), payload.model_dump())).mappings().one()
    await db.commit()
    return dict(row)


@router.put("/payment-routes/{route_id}")
async def update_payment_route(route_id: UUID, payload: PaymentRouteWrite,
                               db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("""update payment_routes set code=:code,name_en=:name_en,name_tr=:name_tr,
        route_type=:route_type,currency=:currency,account_holder=:account_holder,bank_name=:bank_name,
        account_label=:account_label,account_identifier=:account_identifier,contact_url=:contact_url,
        customer_rate=:customer_rate,rounding_increment_minor=:rounding_increment_minor,
        quote_minutes=:quote_minutes,rate_valid_until=:rate_valid_until,is_enabled=:is_enabled,
        sort_order=:sort_order where id=:id returning *"""), payload.model_dump() | {
        "id": route_id,
    })).mappings().first()
    if not row:
        raise HTTPException(404, "Payment route not found")
    await db.commit()
    return dict(row)


@router.get("/orders", response_model=list[OrderOut])
async def orders(db: AsyncSession = Depends(get_db)) -> list[OrderOut]:
    rows = (await db.execute(text("""select id,order_number,status,payment_status,customer_name,
        total_kurus,address_text,created_at,paid_at from orders where payment_status='paid'
        and status != 'delivered' order by created_at"""))).mappings().all()
    return [order_out(row) for row in rows]


@router.get("/payment-orders", response_model=list[PendingBankTransferOrderOut])
async def payment_orders(db: AsyncSession = Depends(get_db)) -> list[dict[str, object]]:
    if await expire_bank_transfer_orders(db):
        await db.commit()
    rows = (await db.execute(text("""select o.id,o.order_number,o.customer_name,o.customer_email,
        o.customer_phone,o.address_text delivery_address,
        o.address_instructions delivery_instructions,o.total_kurus,o.created_at,
        o.payment_expires_at,o.transfer_notified_at,
        coalesce(o.settlement_currency,'TRY') settlement_currency,
        coalesce(o.settlement_amount_minor,o.total_kurus) settlement_amount_minor,
        coalesce(o.transfer_sender_name,'') transfer_sender_name,
        o.transfer_customer_reference,o.transfer_mismatch_note,
        coalesce(r.name_en,'Bank transfer') payment_route_name,
        coalesce((select jsonb_agg(jsonb_build_object(
          'item_name',oi.item_name_en,'quantity',oi.quantity,
          'selected_modifiers',oi.selected_modifiers) order by oi.id)
          from order_items oi where oi.order_id=o.id),'[]'::jsonb) items
        from orders o left join payment_routes r on r.id=o.payment_route_id
        where o.payment_method='bank_transfer' and o.payment_status='pending'
        and payment_expires_at > now()
        order by (transfer_notified_at is null),created_at"""))).mappings().all()
    return [dict(row) for row in rows]


@router.post("/orders/{order_id}/confirm-bank-transfer", response_model=OrderOut)
async def confirm_bank_transfer(order_id: UUID, payload: BankTransferConfirmationIn,
    principal: Principal = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> OrderOut:
    await expire_bank_transfer_orders(db)
    current = (await db.execute(text("""select id,order_number,status::text status,
        payment_status::text payment_status,payment_method,customer_name,total_kurus,address_text,
        settlement_amount_minor,
        created_at,paid_at,payment_expires_at from orders where id=:id for update"""),
        {"id": order_id})).mappings().first()
    if not current or current["payment_method"] != "bank_transfer":
        raise HTTPException(404, "Bank-transfer order not found")
    if current["payment_status"] == "paid":
        return order_out(current)
    if current["payment_status"] != "pending":
        raise HTTPException(409, "This payment window has expired; do not prepare the order")
    expected = current.get("settlement_amount_minor") or current["total_kurus"]
    if payload.received_amount_minor < expected:
        await db.execute(text("""update orders set transfer_mismatch_note=:note,updated_at=now()
            where id=:id"""), {"id": order_id, "note": payload.mismatch_note.strip()
            or f"Received {payload.received_amount_minor}; expected {expected}"})
        await db.commit()
        raise HTTPException(409, "Received amount is below the quoted amount; the order remains unpaid")
    row = (await db.execute(text("""update orders set payment_status='paid',status='received',
        paid_at=now(),payment_confirmed_by=:actor,payment_confirmation_reference=nullif(:reference,''),
        updated_at=now() where id=:id and payment_expires_at > now()
        returning id,order_number,status::text status,payment_status::text payment_status,
        customer_name,total_kurus,address_text,created_at,paid_at"""), {"id": order_id,
        "actor": principal.user_id, "reference": payload.reference.strip()})).mappings().first()
    if not row:
        raise HTTPException(409, "This payment window has expired; do not prepare the order")
    await db.execute(text("""update payments set status='paid',provider_payment_id=coalesce(
        nullif(:reference,''),provider_reference),raw_response=raw_response ||
        jsonb_build_object('verified_by',cast(:actor as text),'verified_at',now()),
        received_amount_minor=:received_amount,updated_at=now()
        where order_id=:id and provider='bank_transfer'"""), {"id": order_id,
        "reference": payload.reference.strip(), "actor": principal.user_id,
        "received_amount": payload.received_amount_minor})
    await db.execute(text("""insert into order_status_history(order_id,status,changed_by)
        values (:id,'received',:actor)"""), {"id": order_id, "actor": principal.user_id})
    await db.execute(text("""insert into notification_outbox(order_id,kind,recipient,payload)
        select id,'order_confirmation',customer_email,jsonb_build_object(
        'order_number',order_number,'status','received') from orders where id=:id
        on conflict do nothing"""), {"id": order_id})
    await db.execute(text("""insert into audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
        values (:actor,'bank_transfer_confirmed','order',:id,
        jsonb_build_object('payment_status','pending'),jsonb_build_object('payment_status','paid'))"""),
        {"actor": principal.user_id, "id": str(order_id)})
    await db.commit()
    return order_out(row)


@router.get("/orders/{order_id}", response_model=KitchenOrderDetailOut)
async def order_detail(order_id: UUID, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    order = (await db.execute(text("""select o.id,o.order_number,o.status::text status,
        o.payment_status::text payment_status,o.locale,o.customer_name,o.customer_email,
        o.customer_phone,o.address_text delivery_address,o.address_instructions delivery_instructions,
        o.delivery_zone_name,o.subtotal_kurus,o.delivery_fee_kurus,o.total_kurus,o.created_at,
        o.paid_at,o.updated_at,coalesce(p.provider_payment_id,p.provider_reference) payment_reference
        from orders o left join lateral (select provider_payment_id,provider_reference from payments
        where order_id=o.id order by created_at desc limit 1) p on true where o.id=:id
        and o.payment_status='paid'"""), {"id": order_id})).mappings().first()
    if not order:
        raise HTTPException(404, "Paid order not found")
    item_rows = (await db.execute(text("""select id,item_name_en item_name,quantity,
        unit_price_kurus,line_total_kurus,selected_modifiers from order_items
        where order_id=:id order by id"""), {"id": order_id})).mappings().all()
    history_rows = (await db.execute(text("""select status::text status,changed_at
        from order_status_history where order_id=:id order by changed_at,id"""),
        {"id": order_id})).mappings().all()
    return dict(order) | {
        "items": [dict(item) for item in item_rows],
        "status_history": [dict(entry) for entry in history_rows],
    }


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_status(order_id: UUID, payload: StatusUpdateIn,
    principal: Principal = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> OrderOut:
    current = (await db.execute(text("select status,payment_status from orders where id=:id for update"),
                                {"id": order_id})).mappings().first()
    if not current:
        raise HTTPException(404, "Order not found")
    allowed = {"received": "preparing", "preparing": "out_for_delivery", "out_for_delivery": "delivered"}
    if current["payment_status"] != "paid" or allowed.get(current["status"]) != payload.status:
        raise HTTPException(409, "Invalid order status transition")
    row = (await db.execute(text("""update orders set status=:status,updated_at=now() where id=:id
        returning id,order_number,status,payment_status,customer_name,total_kurus,address_text,created_at,paid_at"""),
        {"status": payload.status, "id": order_id})).mappings().one()
    await db.execute(text("insert into order_status_history(order_id,status,changed_by) values (:id,:status,:actor)"),
                     {"id": order_id, "status": payload.status, "actor": principal.user_id})
    await db.execute(text("""insert into notification_outbox(order_id,kind,recipient,payload)
        select id,'status_' || :status,customer_email,jsonb_build_object('order_number',order_number,'status',:status)
        from orders where id=:id on conflict do nothing"""), {"id": order_id, "status": payload.status})
    await db.execute(text("""insert into audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
        values (:actor,'status_update','order',:id,jsonb_build_object('status',cast(:before as text)),
        jsonb_build_object('status',cast(:after as text)))"""),
        {"actor": principal.user_id, "id": str(order_id), "before": current["status"], "after": payload.status})
    await db.commit()
    return order_out(row)


@router.patch("/menu/items/{item_id}/availability")
async def availability(item_id: UUID, payload: AvailabilityIn,
    principal: Principal = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    before = (await db.execute(text("select is_available from menu_items where id=:id"), {"id": item_id})).scalar()
    if before is None:
        raise HTTPException(404, "Menu item not found")
    await db.execute(text("update menu_items set is_available=:value where id=:id"),
                     {"value": payload.is_available, "id": item_id})
    await db.execute(text("""insert into audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
        values (:actor,'availability_update','menu_item',:id,
        jsonb_build_object('is_available',cast(:before as boolean)),
        jsonb_build_object('is_available',cast(:after as boolean)))"""), {"actor": principal.user_id, "id": str(item_id),
        "before": before, "after": payload.is_available})
    await db.commit()
    return {"id": item_id, "is_available": payload.is_available}


@router.get("/menu")
async def manage_menu(db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    category_rows = (await db.execute(text("""select id,name_en,name_tr,sort_order,is_active
        from categories order by sort_order,name_en"""))).mappings().all()
    item_rows = (await db.execute(text("""select id,category_id,name_en,name_tr,description_en,
        description_tr,price_kurus,minimum_order_quantity,image_url,is_available,is_published,sort_order
        from menu_items order by sort_order,name_en"""))).mappings().all()
    categories: dict[UUID, dict[str, Any]] = {}
    items: dict[UUID, dict[str, Any]] = {}
    for row in category_rows:
        category = dict(row)
        category["items"] = []
        categories[row["id"]] = category
    for row in item_rows:
        item = dict(row)
        item["modifiers"] = []
        items[row["id"]] = item
        parent_category = categories.get(row["category_id"])
        if parent_category:
            parent_category["items"].append(item)
    modifier_rows = (await db.execute(text("""select m.id,m.menu_item_id,m.name_en,m.name_tr,
        m.is_required,m.min_select,m.max_select,m.sort_order,o.id option_id,o.name_en option_name_en,
        o.name_tr option_name_tr,o.price_delta_kurus,o.sort_order option_sort
        from modifiers m join modifier_options o on o.modifier_id=m.id
        order by m.sort_order,m.id,o.sort_order,o.id"""))).mappings().all()
    modifier_groups: dict[UUID, dict[str, Any]] = {}
    for row in modifier_rows:
        group = modifier_groups.get(row["id"])
        if group is None:
            group = {"id": row["id"], "name_en": row["name_en"], "name_tr": row["name_tr"],
                "is_required": row["is_required"], "min_select": row["min_select"],
                "max_select": row["max_select"], "sort_order": row["sort_order"], "options": []}
            modifier_groups[row["id"]] = group
            if row["menu_item_id"] in items:
                items[row["menu_item_id"]]["modifiers"].append(group)
        group["options"].append({"id": row["option_id"], "name_en": row["option_name_en"],
            "name_tr": row["option_name_tr"], "price_delta_kurus": row["price_delta_kurus"],
            "sort_order": row["option_sort"]})
    return {"categories": list(categories.values())}


@router.post("/categories", status_code=201)
async def create_category(payload: CategoryWrite, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("""insert into categories(name_en,name_tr,sort_order,is_active)
        values (:name_en,:name_tr,:sort_order,:is_active) returning id,name_en,name_tr,sort_order,is_active"""),
        payload.model_dump())).mappings().one()
    await db.commit()
    return dict(row)


@router.put("/categories/{category_id}")
async def edit_category(category_id: UUID, payload: CategoryWrite,
                        db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("""update categories set name_en=:name_en,name_tr=:name_tr,
        sort_order=:sort_order,is_active=:is_active,updated_at=now() where id=:id
        returning id,name_en,name_tr,sort_order,is_active"""), payload.model_dump() | {
        "id": category_id})).mappings().first()
    if not row:
        raise HTTPException(404, "Category not found")
    await db.commit()
    return dict(row)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    item_count = (await db.execute(text("select count(*) from menu_items where category_id=:id"),
                                   {"id": category_id})).scalar_one()
    if item_count:
        raise HTTPException(409, "Move or delete this category's menu items first")
    deleted = (await db.execute(text("delete from categories where id=:id returning id"),
                                {"id": category_id})).scalar()
    if not deleted:
        raise HTTPException(404, "Category not found")
    await db.commit()


@router.post("/menu/items/complete", status_code=201)
async def create_item_complete(item: str = Form(), modifiers: str = Form(),
    image: UploadFile | None = File(default=None),
    storage: MenuImageStorage = Depends(get_menu_image_storage),
    db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    return await create_complete_item(db, _item_payload(item), _modifier_payload(modifiers), image, storage)


@router.put("/menu/items/{item_id}/complete")
async def edit_item_complete(item_id: UUID, item: str = Form(), modifiers: str = Form(),
    image: UploadFile | None = File(default=None), storage: MenuImageStorage = Depends(get_menu_image_storage),
    db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    return await update_complete_item(db, item_id, _item_payload(item), _modifier_payload(modifiers), image, storage)


@router.post("/menu/items", status_code=201)
async def create_item(payload: MenuItemWrite, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("""insert into menu_items(category_id,name_en,name_tr,description_en,
        description_tr,price_kurus,minimum_order_quantity,image_url,is_available,is_published,sort_order)
        values (:category_id,:name_en,:name_tr,:description_en,:description_tr,:price_kurus,
        :minimum_order_quantity,:image_url,:is_available,:is_published,:sort_order)
        returning *"""), payload.model_dump())).mappings().one()
    await db.commit()
    return dict(row)


@router.put("/menu/items/{item_id}")
async def edit_item(item_id: UUID, payload: MenuItemWrite,
                    db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    values = payload.model_dump() | {"id": item_id}
    row = (await db.execute(text("""update menu_items set category_id=:category_id,name_en=:name_en,
        name_tr=:name_tr,description_en=:description_en,description_tr=:description_tr,
        price_kurus=:price_kurus,minimum_order_quantity=:minimum_order_quantity,
        image_url=:image_url,is_available=:is_available,
        is_published=:is_published,sort_order=:sort_order where id=:id returning *"""), values)).mappings().first()
    if not row:
        raise HTTPException(404, "Menu item not found")
    await db.commit()
    return dict(row)


@router.delete("/menu/items/{item_id}", status_code=204)
async def delete_item(item_id: UUID, storage: MenuImageStorage = Depends(get_menu_image_storage),
                      db: AsyncSession = Depends(get_db)) -> None:
    await delete_complete_item(db, item_id, storage)


@router.put("/menu/items/{item_id}/modifiers")
async def replace_modifiers(item_id: UUID, payload: list[ModifierWrite],
                            db: AsyncSession = Depends(get_db)) -> dict[str, bool]:
    exists = (await db.execute(text("select 1 from menu_items where id=:id"), {"id": item_id})).scalar()
    if not exists:
        raise HTTPException(404, "Menu item not found")
    for modifier in payload:
        if modifier.min_select > modifier.max_select:
            raise HTTPException(422, "The minimum selection limit cannot exceed the maximum")
        if modifier.is_required and modifier.min_select < 1:
            raise HTTPException(422, "Required modifier groups must require at least one choice")
    await db.execute(text("delete from modifiers where menu_item_id=:id"), {"id": item_id})
    for modifier in payload:
        row = (await db.execute(text("""insert into modifiers(menu_item_id,name_en,name_tr,is_required,
            min_select,max_select,sort_order) values (:item_id,:name_en,:name_tr,:is_required,
            :min_select,:max_select,:sort_order) returning id"""), modifier.model_dump(exclude={"options"}) | {
            "item_id": item_id})).mappings().one()
        for option in modifier.options:
            await db.execute(text("""insert into modifier_options(modifier_id,name_en,name_tr,
                price_delta_kurus,sort_order) values (:modifier_id,:name_en,:name_tr,
                :price_delta_kurus,:sort_order)"""), option.model_dump() | {"modifier_id": row["id"]})
    await db.commit()
    return {"ok": True}


@router.post("/menu/items/{item_id}/image")
async def upload_item_image(item_id: UUID, image: UploadFile = File(),
    storage: MenuImageStorage = Depends(get_menu_image_storage),
    db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    return await replace_item_image(db, item_id, image, storage)


@router.get("/zones")
async def zones(db: AsyncSession = Depends(get_db)) -> list[dict[str, object]]:
    rows = (await db.execute(text("""select id,name,ST_AsGeoJSON(area::geometry)::json polygon,
        delivery_fee_kurus,priority,is_active,
        coalesce((select jsonb_agg(jsonb_build_object('id',other.id,'name',other.name)
          order by other.priority,other.name) from delivery_zones other
          where other.id != delivery_zones.id
          and ST_Area(ST_Intersection(other.area,delivery_zones.area)) > 1),'[]') overlaps_with
        from delivery_zones order by priority,name"""))).mappings().all()
    return [dict(row) for row in rows]


async def validate_zone_polygon(db: AsyncSession, polygon: PolygonWrite) -> str:
    raw = json.dumps(polygon.model_dump())
    result = (await db.execute(text("""select ST_IsValid(shape) is_valid,ST_IsValidReason(shape) reason,
        ST_Area(shape::geography) area from (select ST_SetSRID(ST_GeomFromGeoJSON(:polygon),4326) shape) value"""),
        {"polygon": raw})).mappings().one()
    if not result["is_valid"]:
        raise HTTPException(422, f"This delivery-area shape is invalid: {result['reason']}")
    if result["area"] <= 1:
        raise HTTPException(422, "This delivery area is too small. Draw a larger boundary.")
    return raw


@router.post("/zones", status_code=201)
async def create_zone(payload: ZoneWrite, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    polygon = await validate_zone_polygon(db, payload.polygon)
    row = (await db.execute(text("""insert into delivery_zones(name,area,delivery_fee_kurus,priority,is_active)
        values (:name,ST_SetSRID(ST_GeomFromGeoJSON(:polygon),4326)::geography,:delivery_fee_kurus,:priority,:is_active)
        returning id,name,delivery_fee_kurus,priority,is_active"""), payload.model_dump() | {
        "polygon": polygon})).mappings().one()
    await db.commit()
    return dict(row)


@router.put("/zones/{zone_id}")
async def update_zone(zone_id: UUID, payload: ZoneWrite,
                      db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    polygon = await validate_zone_polygon(db, payload.polygon)
    row = (await db.execute(text("""update delivery_zones set name=:name,
        area=ST_SetSRID(ST_GeomFromGeoJSON(:polygon),4326)::geography,
        delivery_fee_kurus=:delivery_fee_kurus,priority=:priority,is_active=:is_active where id=:id
        returning id,name,delivery_fee_kurus,priority,is_active"""), payload.model_dump(exclude={"polygon"}) | {
        "id": zone_id, "polygon": polygon})).mappings().first()
    if not row:
        raise HTTPException(404, "Delivery area not found")
    await db.commit()
    return dict(row)


@router.patch("/zones/{zone_id}/active")
async def set_zone_active(zone_id: UUID, payload: ZoneActiveWrite,
                          db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("""update delivery_zones set is_active=:is_active where id=:id
        returning id,is_active"""), {"id": zone_id, "is_active": payload.is_active})).mappings().first()
    if not row:
        raise HTTPException(404, "Delivery area not found")
    await db.commit()
    return dict(row)


@router.delete("/zones/{zone_id}", status_code=204)
async def delete_zone(zone_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    deleted = (await db.execute(text("delete from delivery_zones where id=:id returning id"),
                                {"id": zone_id})).scalar()
    if not deleted:
        raise HTTPException(404, "Delivery area not found")
    await db.commit()


@router.get("/hours")
async def hours(db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    intervals = (await db.execute(text("""select id,weekday,opens_at::text,closes_at::text
        from operating_hours order by weekday,opens_at"""))).mappings().all()
    closures = (await db.execute(text("""select id,closure_date,reason from restaurant_closures
        where closure_date >= current_date order by closure_date"""))).mappings().all()
    settings = (await db.execute(text("select is_temporarily_closed,timezone from restaurant_settings where id"))).mappings().one()
    return {"intervals": [dict(row) for row in intervals], "closures": [dict(row) for row in closures],
            "is_temporarily_closed": settings["is_temporarily_closed"], "timezone": settings["timezone"]}


@router.put("/hours")
async def replace_hours(payload: HoursWrite, db: AsyncSession = Depends(get_db)) -> dict[str, bool]:
    by_day: dict[int, list[HoursInterval]] = {}
    for interval in payload.intervals:
        if interval.opens_at >= interval.closes_at:
            raise HTTPException(422, "Opening time must be before closing time")
        by_day.setdefault(interval.weekday, []).append(interval)
    for intervals in by_day.values():
        ordered = sorted(intervals, key=lambda value: value.opens_at)
        if any(current.opens_at < previous.closes_at for previous, current in zip(ordered, ordered[1:], strict=False)):
            raise HTTPException(422, "Opening intervals on the same day cannot overlap")
    await db.execute(text("delete from operating_hours"))
    for interval in payload.intervals:
        await db.execute(text("""insert into operating_hours(weekday,opens_at,closes_at)
            values (:weekday,:opens_at,:closes_at)"""), interval.model_dump())
    await db.commit()
    return {"ok": True}


@router.post("/closures", status_code=201)
async def add_closure(payload: ClosureWrite, db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("""insert into restaurant_closures(closure_date,reason)
        values (:closure_date,:reason) on conflict(closure_date) do update set reason=excluded.reason
        returning id,closure_date,reason"""), payload.model_dump())).mappings().one()
    await db.commit()
    return dict(row)


@router.delete("/closures/{closure_id}", status_code=204)
async def remove_closure(closure_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    deleted = (await db.execute(text("delete from restaurant_closures where id=:id returning id"),
                                {"id": closure_id})).scalar()
    if not deleted:
        raise HTTPException(404, "Closure not found")
    await db.commit()


@router.patch("/temporary-closure")
async def temporary_closure(closed: bool, db: AsyncSession = Depends(get_db)) -> dict[str, bool]:
    await db.execute(text("update restaurant_settings set is_temporarily_closed=:closed where id"),
                     {"closed": closed})
    await db.commit()
    return {"is_temporarily_closed": closed}


@router.get("/capacity-rules")
async def capacity_rules(db: AsyncSession = Depends(get_db)) -> list[dict[str, object]]:
    rows = (await db.execute(text("""select id,name,weekday,target_date,starts_at::text,ends_at::text,
        max_orders,is_active,created_at,updated_at from order_capacity_rules
        order by target_date nulls last,weekday nulls last,starts_at nulls first,name"""))).mappings().all()
    return [dict(row) for row in rows]


@router.post("/capacity-rules", status_code=201)
async def create_capacity_rule(payload: CapacityRuleWrite,
                               db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("""insert into order_capacity_rules
        (name,weekday,target_date,starts_at,ends_at,max_orders,is_active)
        values (:name,:weekday,:target_date,:starts_at,:ends_at,:max_orders,:is_active)
        returning id,name,weekday,target_date,starts_at::text,ends_at::text,max_orders,is_active"""),
        payload.model_dump())).mappings().one()
    await db.commit()
    return dict(row)


@router.put("/capacity-rules/{rule_id}")
async def update_capacity_rule(rule_id: UUID, payload: CapacityRuleWrite,
                               db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    row = (await db.execute(text("""update order_capacity_rules set name=:name,weekday=:weekday,
        target_date=:target_date,starts_at=:starts_at,ends_at=:ends_at,max_orders=:max_orders,
        is_active=:is_active where id=:id returning id,name,weekday,target_date,starts_at::text,
        ends_at::text,max_orders,is_active"""), payload.model_dump() | {"id": rule_id})).mappings().first()
    if not row:
        raise HTTPException(404, "Capacity rule not found")
    await db.commit()
    return dict(row)


@router.delete("/capacity-rules/{rule_id}", status_code=204)
async def delete_capacity_rule(rule_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    deleted = (await db.execute(text("delete from order_capacity_rules where id=:id returning id"),
                                {"id": rule_id})).scalar()
    if not deleted:
        raise HTTPException(404, "Capacity rule not found")
    await db.commit()


@router.get("/analytics/summary")
async def analytics(date_from: date = Query(), date_to: date = Query(),
                    grouping: Literal["daily", "weekly", "monthly"] = Query(default="daily"),
                    db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    if date_from > date_to:
        raise HTTPException(422, "Start date must be on or before end date")
    if (date_to - date_from).days > 731:
        raise HTTPException(422, "Analytics date ranges cannot exceed two years")
    period = {"daily": "day", "weekly": "week", "monthly": "month"}[grouping]
    summary = (await db.execute(text("""select coalesce(sum(total_kurus),0) revenue_kurus,count(*) order_count,
        coalesce(avg(total_kurus),0)::integer average_order_value_kurus from orders
        where payment_status='paid' and (created_at at time zone 'Europe/Istanbul')::date
        between cast(:start as date) and cast(:finish as date)"""),
        {"start": date_from, "finish": date_to})).mappings().one()
    items = (await db.execute(text("""select oi.item_name_en name,sum(oi.quantity)::integer quantity,
        sum(oi.line_total_kurus)::integer revenue_kurus from order_items oi join orders o on o.id=oi.order_id
        where o.payment_status='paid' and (o.created_at at time zone 'Europe/Istanbul')::date
        between cast(:start as date) and cast(:finish as date)
        group by oi.item_name_en order by quantity desc,name"""),
        {"start": date_from, "finish": date_to})).mappings().all()
    worst = (await db.execute(text("""select mi.name_en name,
        coalesce(sum(oi.quantity) filter (where o.payment_status='paid' and
          (o.created_at at time zone 'Europe/Istanbul')::date between cast(:start as date)
          and cast(:finish as date)),0)::integer quantity,
        coalesce(sum(oi.line_total_kurus) filter (where o.payment_status='paid' and
          (o.created_at at time zone 'Europe/Istanbul')::date between cast(:start as date)
          and cast(:finish as date)),0)::integer revenue_kurus
        from menu_items mi left join order_items oi on oi.menu_item_id=mi.id
        left join orders o on o.id=oi.order_id group by mi.id,mi.name_en
        order by quantity,name limit 10"""), {"start": date_from, "finish": date_to})).mappings().all()
    zones = (await db.execute(text("""select delivery_zone_name name,count(*)::integer order_count,
        sum(total_kurus)::integer revenue_kurus from orders where payment_status='paid'
        and (created_at at time zone 'Europe/Istanbul')::date
        between cast(:start as date) and cast(:finish as date)
        group by delivery_zone_name order by revenue_kurus desc"""),
        {"start": date_from, "finish": date_to})).mappings().all()
    peaks = (await db.execute(text("""select extract(dow from created_at at time zone 'Europe/Istanbul')::integer weekday,
        extract(hour from created_at at time zone 'Europe/Istanbul')::integer as "hour",
        count(*)::integer order_count from orders where payment_status='paid'
        and (created_at at time zone 'Europe/Istanbul')::date
        between cast(:start as date) and cast(:finish as date)
        group by 1,2 order by order_count desc,weekday,hour limit 10"""),
        {"start": date_from, "finish": date_to})).mappings().all()
    series = (await db.execute(text(f"""select date_trunc('{period}',created_at at time zone
        'Europe/Istanbul')::date period,count(*)::integer order_count,
        sum(total_kurus)::integer revenue_kurus from orders where payment_status='paid'
        and (created_at at time zone 'Europe/Istanbul')::date
        between cast(:start as date) and cast(:finish as date)
        group by 1 order by 1"""), {"start": date_from, "finish": date_to})).mappings().all()
    item_values = [dict(row) for row in items]
    return dict(summary) | {
        "grouping": grouping,
        "series": [dict(row) for row in series],
        "top_items": item_values[:10],
        "worst_items": [dict(row) for row in worst],
        "zones": [dict(row) for row in zones],
        "peak_periods": [dict(row) for row in peaks],
    }
