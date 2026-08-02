import asyncio
import logging
from time import monotonic

import resend
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.services.bank_transfer import expire_bank_transfer_orders
from app.services.email_templates import render_email
from app.services.menu_management import MenuImageStorage, process_storage_cleanup_jobs

settings = get_settings()
resend.api_key = settings.resend_api_key
image_storage = MenuImageStorage(settings)
logger = logging.getLogger("allensnothern.worker")


async def process_once() -> int:
    if not settings.resend_api_key:
        return 0
    async with SessionLocal() as db:
        rows = (await db.execute(text("""select id,order_id,kind,recipient,payload from notification_outbox
            where sent_at is null and attempts < 5 and available_at <= now()
            order by available_at for update skip locked limit 10"""))).mappings().all()
        for row in rows:
            try:
                order = (await db.execute(text("""select id,order_number,locale,customer_name,customer_email,
                    customer_phone,address_text,address_instructions,subtotal_kurus,delivery_fee_kurus,total_kurus
                    from orders where id=:id"""), {"id": row["order_id"]})).mappings().one()
                suffix = "tr" if order["locale"] == "tr" else "en"
                items = (await db.execute(text(f"""select item_name_{suffix} item_name,quantity,
                    line_total_kurus,selected_modifiers from order_items where order_id=:id order by id"""),
                    {"id": row["order_id"]})).mappings().all()
                rendered = render_email(row["kind"], dict(order), [dict(item) for item in items],
                    row["payload"], settings.app_url, settings.support_email)
                await asyncio.to_thread(resend.Emails.send, {
                    "from": settings.email_from,
                    "to": [row["recipient"]],
                    "reply_to": settings.support_email,
                    "subject": rendered.subject,
                    "html": rendered.html,
                    "text": rendered.text,
                }, {"idempotency_key": str(row["id"])})
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
    logging.basicConfig(level=logging.INFO)
    logger.info("AllensNothern background worker started")
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY is missing; notification jobs will remain queued")
    if not settings.admin_email:
        logger.warning("ADMIN_EMAIL is missing; administrator email alerts are disabled")
    last_heartbeat = monotonic()
    while True:
        notification_count, cleanup_count, expired_count = await asyncio.gather(
            process_once(), process_storage_cleanup_once(), expire_bank_transfers_once())
        count = notification_count + cleanup_count + expired_count
        if count:
            logger.info(
                "Worker processed notifications=%d cleanup=%d expired_transfers=%d",
                notification_count, cleanup_count, expired_count,
            )
        if monotonic() - last_heartbeat >= 60:
            logger.info("Worker heartbeat: active")
            last_heartbeat = monotonic()
        await asyncio.sleep(2 if count else 10)


if __name__ == "__main__":
    asyncio.run(main())
