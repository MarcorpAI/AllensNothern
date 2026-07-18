import asyncio
import time
from collections import OrderedDict

import httpx

from app.core.config import Settings
from app.schemas import GeocodeResult

_lock = asyncio.Lock()
_last_request = 0.0
_cache: OrderedDict[str, list[GeocodeResult]] = OrderedDict()


async def search(query: str, settings: Settings) -> list[GeocodeResult]:
    global _last_request
    key = " ".join(query.casefold().split())
    if key in _cache:
        return _cache[key]
    async with _lock:
        wait = 1.05 - (time.monotonic() - _last_request)
        if wait > 0:
            await asyncio.sleep(wait)
        contact_email = settings.map_contact_email.strip()
        if not contact_email or contact_email.endswith("@example.com"):
            raise RuntimeError("Set MAP_CONTACT_EMAIL to a real monitored address before using address search")
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            response = await client.get(
                f"{str(settings.nominatim_url).rstrip('/')}/search",
                params={"q": f"{query}, Turkey", "format": "jsonv2", "limit": 5, "countrycodes": "tr", "email": contact_email},
                headers={"User-Agent": f"AllensNothern/0.1 ({contact_email})"},
            )
            _last_request = time.monotonic()
            response.raise_for_status()
    results = [
        GeocodeResult(display_name=row["display_name"], latitude=float(row["lat"]), longitude=float(row["lon"]))
        for row in response.json()
    ]
    _cache[key] = results
    while len(_cache) > 500:
        _cache.popitem(last=False)
    return results
