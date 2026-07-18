import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError
from starlette.responses import JSONResponse

from app.api.routes import admin, checkout, orders, public, webhooks
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)
app = FastAPI(title="AllensNothern API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "Svix-Id", "Svix-Signature", "Svix-Timestamp"],
)
app.include_router(public.router, prefix="/api/v1")
app.include_router(checkout.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1/admin")
app.include_router(webhooks.router, prefix="/api/v1/webhooks")


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database request failed", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "The restaurant server could not complete this request. Please try again."})


@app.middleware("http")
async def request_id(request: Request, call_next):  # type: ignore[no-untyped-def]
    value = request.headers.get("x-request-id", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["x-request-id"] = value
    return response


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
