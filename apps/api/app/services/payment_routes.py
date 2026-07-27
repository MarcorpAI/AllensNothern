from decimal import ROUND_CEILING, Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def route_snapshot(route: dict[str, Any]) -> dict[str, object]:
    return {
        "route_id": str(route["id"]),
        "name_en": route["name_en"],
        "name_tr": route["name_tr"],
        "currency": route["currency"],
        "account_holder": route["account_holder"],
        "bank_name": route["bank_name"],
        "account_label": route["account_label"],
        "account_identifier": route["account_identifier"],
    }


def settlement_amount(total_kurus: int, rate: Decimal, increment: int) -> int:
    raw_minor = Decimal(total_kurus) * rate
    return int((raw_minor / Decimal(increment)).to_integral_value(rounding=ROUND_CEILING) * increment)


async def active_local_route(db: AsyncSession, route_id: object) -> dict[str, Any]:
    row = (await db.execute(text("""select id,code,name_en,name_tr,route_type,currency,account_holder,
        bank_name,account_label,account_identifier,customer_rate,rounding_increment_minor,quote_minutes,
        rate_valid_until from payment_routes where id=:id and is_enabled and route_type='local_transfer'
        and account_holder <> '' and account_identifier <> ''"""), {"id": route_id})).mappings().first()
    if not row:
        raise HTTPException(422, "This payment route is unavailable")
    result = dict(row)
    if result["currency"] != "TRY" and (
        result["customer_rate"] is None or result["rate_valid_until"] is None
    ):
        raise HTTPException(409, "This currency needs a current exchange rate")
    if result["currency"] != "TRY":
        fresh = (await db.execute(text("select :valid_until > now()"), {
            "valid_until": result["rate_valid_until"],
        })).scalar()
        if not fresh:
            raise HTTPException(409, "This exchange rate has expired")
    return result
