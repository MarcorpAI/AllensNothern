import asyncio
import json
from typing import Any

import iyzipay  # type: ignore[import-untyped]

from app.core.config import Settings


def _options(settings: Settings) -> dict[str, str]:
    return {"api_key": settings.iyzico_api_key, "secret_key": settings.iyzico_secret_key,
            "base_url": settings.iyzico_base_url}


async def initialize_checkout(*, order_id: str, amount_kurus: int, locale: str,
                              customer: dict[str, str], address: dict[str, str],
                              basket_items: list[dict[str, str]], settings: Settings) -> dict[str, Any]:
    if not settings.iyzico_api_key or not settings.iyzico_secret_key:
        if settings.is_production:
            raise RuntimeError("Iyzico credentials are missing")
        token = f"mock-{order_id}"
        return {"status": "mock", "token": token,
                "paymentPageUrl": f"{settings.api_url}/api/v1/webhooks/iyzico/mock/complete?token={token}"}
    request = {
        "locale": locale, "conversationId": order_id,
        "price": f"{amount_kurus / 100:.2f}", "paidPrice": f"{amount_kurus / 100:.2f}",
        "currency": "TRY", "basketId": order_id, "paymentGroup": "PRODUCT",
        "callbackUrl": f"{settings.api_url}/api/v1/webhooks/iyzico/callback",
        "buyer": customer, "shippingAddress": address, "billingAddress": address,
        "basketItems": basket_items,
    }

    def create() -> dict[str, Any]:
        response = iyzipay.CheckoutFormInitialize().create(request, _options(settings))
        data: dict[str, Any] = json.loads(response.read().decode("utf-8"))
        return data

    return await asyncio.to_thread(create)


async def retrieve_checkout(token: str, order_id: str, settings: Settings) -> dict[str, Any]:
    if token.startswith("mock-") and not settings.is_production:
        return {"status": "success", "paymentStatus": "SUCCESS", "paymentId": token}
    request = {"locale": "en", "conversationId": order_id, "token": token}

    def retrieve() -> dict[str, Any]:
        response = iyzipay.CheckoutForm().retrieve(request, _options(settings))
        data: dict[str, Any] = json.loads(response.read().decode("utf-8"))
        return data

    return await asyncio.to_thread(retrieve)
