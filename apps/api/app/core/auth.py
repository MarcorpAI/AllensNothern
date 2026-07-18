from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, Request, status

from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str = "customer"


async def _verify_token(token: str, settings: Settings) -> Principal:
    if settings.app_env == "test" and token.startswith("test_"):
        parts = token.split("_")
        return Principal(parts[1], parts[2] if len(parts) > 2 else "customer")
    if not settings.supabase_url or not settings.supabase_auth_key:
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_auth_key,
                    "Authorization": f"Bearer {token}",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is unavailable",
        ) from exc
    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        user = response.json()
        metadata = user.get("app_metadata") or {}
        role = "admin" if metadata.get("app_role") == "admin" else "customer"
        return Principal(user_id=str(user["id"]), role=role)
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


async def optional_principal(
    request: Request, settings: Settings = Depends(get_settings)
) -> Principal | None:
    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer "):
        return None
    return await _verify_token(authorization.removeprefix("Bearer "), settings)


async def require_principal(
    principal: Principal | None = Depends(optional_principal),
) -> Principal:
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required")
    return principal


async def require_admin(principal: Principal = Depends(require_principal)) -> Principal:
    if principal.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return principal
