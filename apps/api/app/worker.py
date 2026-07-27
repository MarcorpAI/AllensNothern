import asyncio

import resend
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.services.bank_transfer import expire_bank_transfer_orders
from app.services.menu_management import MenuImageStorage, process_storage_cleanup_jobs

settings = get_settings()
resend.api_key = settings.resend_api_key
image_storage = MenuImageStorage(settings)


async def process_once() -> int:
    if not settings.resend_api_key:
        return 0
    async with SessionLocal() as db:
        rows = (await db.execute(text("""select id,kind,recipient,payload from notification_outbox
            where sent_at is null and attempts < 5 and available_at <= now()
            order by available_at for update skip locked limit 10"""))).mappings().all()
        for row in rows:
            try:
                payload = row["payload"]
                subject = f"AllensNothern order {payload.get('order_number', '')}"
                resend.Emails.send({"from": settings.email_from, "to": [row["recipient"]],
                    "subject": subject, "html": f"<h1>{subject}</h1><p>Status: {payload.get('status', 'received')}</p>"})
                await db.execute(text("update notification_outbox set sent_at=now(),attempts=attempts+1 where id=:id"),
                                 {"id": row["id"]})
            except Exception as exc:
                await db.execute(text("""update notification_outbox set attempts=attempts+1,last_error=:error,
                    available_at=now() + make_interval(secs => least(3600,power(2,attempts+1)::integer * 30)) where id=:id"""),
                    {"id": row["id"], "error": str(exc)[:1000]})
        await db.commit()
        return len(rows)


async def process_storage_cleanup_once() -> int:
    async with SessionLocal() as db:
        return await process_storage_cleanup_jobs(db, image_storage)


async def expire_bank_transfers_once() -> int:
    async with SessionLocal() as db:
        count = await expire_bank_transfer_orders(db)
        await db.commit()
        return count


async def main() -> None:
    while True:
        notification_count, cleanup_count, expired_count = await asyncio.gather(
            process_once(), process_storage_cleanup_once(), expire_bank_transfers_once())
        count = notification_count + cleanup_count + expired_count
        await asyncio.sleep(2 if count else 10)


if __name__ == "__main__":
    asyncio.run(main())
