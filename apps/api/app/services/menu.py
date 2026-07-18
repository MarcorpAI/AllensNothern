from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import (
    CategoryOut,
    MenuItemOut,
    MenuResponse,
)


async def get_menu(db: AsyncSession, locale: str) -> MenuResponse:
    normalized_locale: Literal["en", "tr"] = "tr" if locale == "tr" else "en"
    suffix = normalized_locale
    result = await db.execute(
        text(
            f"""
            select c.id category_id, c.name_{suffix} category_name,
                   mi.id item_id, mi.name_{suffix} item_name,
                   mi.description_{suffix} description, mi.price_kurus,
                   mi.image_url, mi.is_available
            from categories c
            left join menu_items mi on mi.category_id = c.id and mi.is_published
            where c.is_active
            order by c.sort_order, mi.sort_order
            """
        )
    )
    categories: dict[object, CategoryOut] = {}
    for row in result.mappings():
        category = categories.setdefault(
            row["category_id"],
            CategoryOut(id=row["category_id"], name=row["category_name"], items=[]),
        )
        if row["item_id"]:
            category.items.append(
                MenuItemOut(
                    id=row["item_id"], category_id=row["category_id"],
                    name=row["item_name"], description=row["description"] or "",
                    price_kurus=row["price_kurus"], image_url=row["image_url"],
                    is_available=row["is_available"], modifiers=[]
                )
            )
    is_open = bool((await db.execute(text("select is_restaurant_open(now())"))).scalar())
    return MenuResponse(locale=normalized_locale, is_open=is_open, categories=list(categories.values()))
