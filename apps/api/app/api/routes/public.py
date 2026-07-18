from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.schemas import GeocodeResult, MenuResponse, ZoneCheckIn, ZoneCheckOut
from app.services.capacity import capacity_status
from app.services.geocoding import search
from app.services.menu import get_menu

router = APIRouter(tags=["public"])


@router.get("/order-capacity")
async def order_capacity(db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    status = await capacity_status(db)
    return {"available": status["available"]}


@router.get("/menu", response_model=MenuResponse)
async def menu(
    locale: Literal["en", "tr"] = "en", db: AsyncSession = Depends(get_db)
) -> MenuResponse:
    return await get_menu(db, locale)


@router.post("/delivery-zones/check", response_model=ZoneCheckOut)
async def check_zone(payload: ZoneCheckIn, db: AsyncSession = Depends(get_db)) -> ZoneCheckOut:
    result = await db.execute(
        text("""select id, name, delivery_fee_kurus from delivery_zones
        where is_active and ST_Covers(area, ST_SetSRID(ST_Point(:lng, :lat), 4326)::geography)
        order by priority asc limit 1"""),
        {"lat": payload.latitude, "lng": payload.longitude},
    )
    zone = result.mappings().first()
    if not zone:
        return ZoneCheckOut(deliverable=False)
    return ZoneCheckOut(
        deliverable=True, zone_id=zone["id"], zone_name=zone["name"],
        delivery_fee_kurus=zone["delivery_fee_kurus"]
    )


@router.get("/geocoding/search", response_model=list[GeocodeResult])
async def geocode(
    q: Annotated[str, Query(min_length=3, max_length=200)],
    settings: Settings = Depends(get_settings),
) -> list[GeocodeResult]:
    try:
        return await search(q, settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Address search is temporarily unavailable") from exc
