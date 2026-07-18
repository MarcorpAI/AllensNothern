from typing import Literal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CAPACITY_QUERY = text("""
with clock as (
  select now() current_time,
         (now() at time zone rs.timezone)::date local_date,
         (now() at time zone rs.timezone)::time local_time,
         extract(dow from now() at time zone rs.timezone)::smallint weekday
  from restaurant_settings rs where rs.id
), matching as (
  select r.*, c.current_time, c.local_date, c.local_time
  from order_capacity_rules r cross join clock c
  where r.is_active
    and (r.target_date = c.local_date
      or (r.target_date is null and r.weekday = c.weekday)
      or (r.target_date is null and r.weekday is null))
    and (r.starts_at is null or (c.local_time >= r.starts_at and c.local_time < r.ends_at))
)
select m.id,m.name,m.max_orders,m.target_date,m.weekday,m.starts_at::text,m.ends_at::text,
  (select count(*)::integer from orders o
   where (o.created_at at time zone 'Europe/Istanbul')::date = m.local_date
     and (m.starts_at is null or
       ((o.created_at at time zone 'Europe/Istanbul')::time >= m.starts_at and
        (o.created_at at time zone 'Europe/Istanbul')::time < m.ends_at))
     and (o.payment_status = 'paid' or
          (o.payment_status = 'pending' and o.capacity_reserved_until > m.current_time))) used_orders
from matching m order by m.max_orders, m.starts_at nulls first
""")


async def capacity_status(db: AsyncSession) -> dict[str, object]:
    rows = (await db.execute(CAPACITY_QUERY)).mappings().all()
    rules = [dict(row) | {"remaining": max(0, row["max_orders"] - row["used_orders"])} for row in rows]
    return {
        "available": all(rule["remaining"] > 0 for rule in rules),
        "rules": rules,
    }


async def enforce_capacity(db: AsyncSession, locale: Literal["en", "tr"]) -> None:
    # One transaction at a time may count and reserve capacity. This prevents
    # simultaneous checkouts from both claiming the final available place.
    await db.execute(text("select pg_advisory_xact_lock(hashtext('allensnothern-order-capacity'))"))
    status = await capacity_status(db)
    if status["available"]:
        return
    messages = {
        "en": "We have reached our order limit for this time. Please try again later.",
        "tr": "Bu zaman dilimi için sipariş limitimize ulaştık. Lütfen daha sonra tekrar deneyin.",
    }
    raise HTTPException(409, detail={"code": "ORDER_CAPACITY_REACHED", "message": messages[locale]})
