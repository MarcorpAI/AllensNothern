from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def expire_bank_transfer_orders(db: AsyncSession) -> int:
    expired = (await db.execute(text("""update orders
        set payment_status='failed',updated_at=now()
        where payment_method='bank_transfer' and payment_status='pending'
        and payment_expires_at <= now()
        returning id"""))).scalars().all()
    if expired:
        await db.execute(text("""update payments set status='failed',updated_at=now(),
            raw_response=raw_response || '{"expired": true}'::jsonb
            where order_id=any(cast(:ids as uuid[])) and provider='bank_transfer' and status='pending'"""),
            {"ids": expired})
    return len(expired)
