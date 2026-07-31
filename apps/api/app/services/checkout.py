import hashlib
import secrets
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import CheckoutIn


@dataclass
class PricedLine:
    item_id: UUID
    item_name_en: str
    item_name_tr: str
    quantity: int
    unit_price_kurus: int
    modifiers: list[dict[str, object]]

    @property
    def total(self) -> int:
        return self.unit_price_kurus * self.quantity


async def price_cart(db: AsyncSession, payload: CheckoutIn) -> list[PricedLine]:
    lines: list[PricedLine] = []
    for requested in payload.items:
        row = (await db.execute(text("""select id,name_en,name_tr,price_kurus,minimum_order_quantity,
            is_available,is_published
            from menu_items where id=:id for share"""), {"id": requested.menu_item_id})).mappings().first()
        if not row or not row["is_published"]:
            raise HTTPException(422, "A menu item no longer exists")
        if not row["is_available"]:
            raise HTTPException(409, f"{row['name_en']} is sold out")
        if requested.quantity < row["minimum_order_quantity"]:
            raise HTTPException(422,
                f"{row['name_en']} requires at least {row['minimum_order_quantity']} per order")
        available = (await db.execute(text("""select m.id modifier_id,m.name_en modifier_name_en,
            m.name_tr modifier_name_tr,m.is_required,m.min_select,m.max_select,o.id option_id,
            o.name_en option_name_en,o.name_tr option_name_tr,o.price_delta_kurus
            from modifiers m left join modifier_options o on o.modifier_id=m.id
            where m.menu_item_id=:item_id"""), {"item_id": requested.menu_item_id})).mappings().all()
        groups: dict[UUID, dict[str, Any]] = {}
        for option in available:
            group = groups.setdefault(option["modifier_id"], {
                "name_en": option["modifier_name_en"], "name_tr": option["modifier_name_tr"],
                "required": option["is_required"], "min": option["min_select"],
                "max": option["max_select"], "options": {}})
            if option["option_id"]:
                group["options"][option["option_id"]] = option
        selected_by_group = {selection.modifier_id: selection.option_ids for selection in requested.modifiers}
        if set(selected_by_group) - set(groups):
            raise HTTPException(422, "Invalid modifier selection")
        snapshots: list[dict[str, object]] = []
        price = row["price_kurus"]
        for modifier_id, group in groups.items():
            selected_ids = selected_by_group.get(modifier_id, [])
            minimum = max(int(group["min"]), 1 if group["required"] else 0)
            if not minimum <= len(selected_ids) <= int(group["max"]):
                raise HTTPException(422, f"Invalid selection count for {group['name_en']}")
            options = group["options"]
            if set(selected_ids) - set(options):
                raise HTTPException(422, "Invalid modifier option")
            picked = []
            for option_id in selected_ids:
                option = options[option_id]
                price += option["price_delta_kurus"]
                picked.append({"id": str(option_id), "name_en": option["option_name_en"],
                               "name_tr": option["option_name_tr"],
                               "price_delta_kurus": option["price_delta_kurus"]})
            if picked:
                snapshots.append({"id": str(modifier_id), "name_en": group["name_en"],
                                  "name_tr": group["name_tr"], "options": picked})
        lines.append(PricedLine(row["id"], row["name_en"], row["name_tr"], requested.quantity,
                                price, snapshots))
    return lines


def tracking_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()
