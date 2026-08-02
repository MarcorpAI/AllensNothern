from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def admin_notification_email(db: AsyncSession, fallback: str = "") -> str:
    value = (await db.execute(text("""select coalesce(nullif(trim(admin_notification_email),''),:fallback)
        from restaurant_settings where id"""), {"fallback": fallback.strip()})).scalar_one()
    return str(value or "")
