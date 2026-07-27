from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import (
    CategoryOut,
    MenuItemOut,
    MenuResponse,
    ModifierOptionOut,
    ModifierOut,
)


async def get_menu(db: AsyncSession, locale: str) -> MenuResponse:
    normalized_locale: Literal["en", "tr"] = "tr" if locale == "tr" else "en"
    suffix = normalized_locale
    result = await db.execute(
        text(
            f"""
            select c.id category_id, c.name_{suffix} category_name,
                   mi.id item_id, mi.name_{suffix} item_name,
                   mi.description_{suffix} description, mi.price_kurus,mi.minimum_order_quantity,
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
                    is_available=row["is_available"],
                    minimum_order_quantity=row["minimum_order_quantity"], modifiers=[]
                )
            )
    modifier_rows = (await db.execute(text(f"""select m.id,m.menu_item_id,m.name_{suffix} name,
        m.is_required,m.min_select,m.max_select,m.sort_order,o.id option_id,
        o.name_{suffix} option_name,o.price_delta_kurus,o.sort_order option_sort
        from modifiers m join modifier_options o on o.modifier_id=m.id
        join menu_items mi on mi.id=m.menu_item_id
        where mi.is_published order by m.sort_order,m.id,o.sort_order,o.id"""))).mappings().all()
    items = {item.id: item for category in categories.values() for item in category.items}
    groups: dict[object, ModifierOut] = {}
    for row in modifier_rows:
        group = groups.get(row["id"])
        if group is None:
            group = ModifierOut(id=row["id"], name=row["name"], is_required=row["is_required"],
                min_select=row["min_select"], max_select=row["max_select"], options=[])
            groups[row["id"]] = group
            item = items.get(row["menu_item_id"])
            if item:
                item.modifiers.append(group)
        group.options.append(ModifierOptionOut(id=row["option_id"], name=row["option_name"],
            price_delta_kurus=row["price_delta_kurus"]))
    is_open = bool((await db.execute(text("select is_restaurant_open(now())"))).scalar())
    return MenuResponse(locale=normalized_locale, is_open=is_open, categories=list(categories.values()))
