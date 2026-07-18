from fastapi import APIRouter

from app.api.routes import admin, checkout, orders, public, webhooks

api_router = APIRouter()
api_router.include_router(public.router)
api_router.include_router(checkout.router)
api_router.include_router(orders.router)
api_router.include_router(admin.router, prefix="/admin")
api_router.include_router(webhooks.router, prefix="/webhooks")

