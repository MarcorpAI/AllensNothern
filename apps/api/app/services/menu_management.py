import json
import secrets
from dataclasses import dataclass
from io import BytesIO
from urllib.parse import quote, unquote, urlparse
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
RENDITIONS = {"card": (600, 450, 78), "detail": (1200, 900, 84)}


class MenuItemWrite(BaseModel):
    category_id: UUID
    name_en: str = Field(min_length=1, max_length=150)
    name_tr: str = Field(default="", max_length=150)
    description_en: str = Field(min_length=1, max_length=2000)
    description_tr: str = Field(default="", max_length=2000)
    price_kurus: int = Field(ge=0)
    image_url: str | None = None
    is_available: bool = True
    is_published: bool = True
    sort_order: int = 0

    @model_validator(mode="after")
    def use_primary_text_for_missing_translation(self) -> "MenuItemWrite":
        self.name_en = self.name_en.strip()
        self.description_en = self.description_en.strip()
        if not self.name_en or not self.description_en:
            raise ValueError("Name and description are required")
        self.name_tr = self.name_tr.strip() or self.name_en
        self.description_tr = self.description_tr.strip() or self.description_en
        return self


class ModifierOptionWrite(BaseModel):
    name_en: str = Field(min_length=1, max_length=100)
    name_tr: str = Field(default="", max_length=100)
    price_delta_kurus: int = Field(ge=0)
    sort_order: int = 0

    @model_validator(mode="after")
    def use_primary_option_name_for_missing_translation(self) -> "ModifierOptionWrite":
        self.name_en = self.name_en.strip()
        self.name_tr = self.name_tr.strip() or self.name_en
        return self


class ModifierWrite(BaseModel):
    name_en: str = Field(min_length=1, max_length=100)
    name_tr: str = Field(default="", max_length=100)
    is_required: bool = False
    min_select: int = Field(ge=0)
    max_select: int = Field(ge=1)
    sort_order: int = 0
    options: list[ModifierOptionWrite] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def validate_group(self) -> "ModifierWrite":
        self.name_en = self.name_en.strip()
        self.name_tr = self.name_tr.strip() or self.name_en
        if self.min_select > self.max_select or self.max_select > len(self.options):
            raise ValueError("Modifier selection limits must match the number of choices")
        if self.is_required and self.min_select < 1:
            raise ValueError("Required modifier groups must require at least one choice")
        return self


@dataclass(frozen=True)
class PreparedImage:
    content: dict[str, bytes]


@dataclass(frozen=True)
class StoredImage:
    variants: dict[str, str]
    paths: list[str]


class PartialImageUploadError(Exception):
    def __init__(self, paths: list[str], cause: Exception):
        super().__init__(str(cause))
        self.paths = paths


class MenuImageStorage:
    def __init__(self, settings: Settings):
        self.settings = settings

    def public_url(self, path: str) -> str:
        base = (self.settings.supabase_public_url or self.settings.supabase_url).rstrip("/")
        return f"{base}/storage/v1/object/public/menu-images/{quote(path, safe='/')}"

    async def upload(self, path: str, content: bytes) -> None:
        if not self.settings.supabase_service_role_key:
            raise HTTPException(503, "Supabase Storage is not configured")
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.settings.supabase_url.rstrip('/')}/storage/v1/object/menu-images/{quote(path, safe='/')}",
                content=content,
                headers={
                    "Authorization": f"Bearer {self.settings.supabase_service_role_key}",
                    "apikey": self.settings.supabase_service_role_key,
                    "Content-Type": "image/webp",
                    "x-upsert": "false",
                },
            )
        if response.status_code >= 300:
            if "signature verification failed" in response.text.lower() or response.status_code in {401, 403}:
                raise HTTPException(
                    503,
                    "Food picture storage is not connected. Ask the site administrator to reconnect Supabase Storage.",
                )
            raise HTTPException(502, "Image upload failed")

    async def delete(self, paths: list[str]) -> None:
        if not paths:
            return
        if not self.settings.supabase_service_role_key:
            raise HTTPException(503, "Supabase Storage is not configured")
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(
                "DELETE",
                f"{self.settings.supabase_url.rstrip('/')}/storage/v1/object/menu-images",
                json={"prefixes": paths},
                headers={
                    "Authorization": f"Bearer {self.settings.supabase_service_role_key}",
                    "apikey": self.settings.supabase_service_role_key,
                },
            )
        if response.status_code >= 300 and response.status_code != 404:
            raise HTTPException(502, "Image cleanup failed")


async def prepare_image(upload: UploadFile) -> PreparedImage:
    content = await upload.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image must be 10 MB or smaller")
    if not content:
        raise HTTPException(422, "The image file is empty")
    try:
        with Image.open(BytesIO(content)) as probe:
            probe.verify()
        with Image.open(BytesIO(content)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(422, "Only valid JPEG, PNG, and WebP images are allowed")
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise HTTPException(422, "Image dimensions are too large")
            normalized = ImageOps.exif_transpose(source).convert("RGB")
            rendered: dict[str, bytes] = {}
            for name, (width, height, quality) in RENDITIONS.items():
                rendition = ImageOps.pad(
                    normalized,
                    (width, height),
                    method=Image.Resampling.LANCZOS,
                    color=(59, 35, 23),
                    centering=(0.5, 0.5),
                )
                output = BytesIO()
                rendition.save(output, format="WEBP", quality=quality, method=6)
                rendered[name] = output.getvalue()
            return PreparedImage(rendered)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(422, "The uploaded file is not a valid image") from exc


async def _store_image(storage: MenuImageStorage, item_id: UUID, image: PreparedImage) -> StoredImage:
    version = secrets.token_hex(8)
    paths: list[str] = []
    variants: dict[str, str] = {}
    try:
        for name, content in image.content.items():
            path = f"items/{item_id}/{version}-{name}.webp"
            await storage.upload(path, content)
            paths.append(path)
            variants[name] = storage.public_url(path)
    except Exception as exc:
        if paths and not await _delete_uploaded(storage, paths):
            raise PartialImageUploadError(paths, exc) from exc
        raise
    return StoredImage(variants=variants, paths=paths)


async def _delete_uploaded(storage: MenuImageStorage, paths: list[str]) -> bool:
    if not paths:
        return True
    for _attempt in range(3):
        try:
            await storage.delete(paths)
            return True
        except Exception:
            continue
    return False


async def _queue_cleanup(db: AsyncSession, paths: list[str], reason: str, error: str = "") -> None:
    if not paths:
        return
    await db.execute(text("""insert into storage_cleanup_jobs(paths,reason,last_error)
        values (:paths,:reason,:error)"""), {"paths": json.dumps(paths), "reason": reason, "error": error[:1000]})
    await db.commit()


async def _cleanup_or_queue(db: AsyncSession, storage: MenuImageStorage, paths: list[str], reason: str) -> None:
    if paths and not await _delete_uploaded(storage, paths):
        await _queue_cleanup(db, paths, reason, "Immediate Storage deletion failed")


def _legacy_paths(image_url: str | None) -> list[str]:
    if not image_url:
        return []
    marker = "/storage/v1/object/public/menu-images/"
    path = urlparse(image_url).path
    return [unquote(path.split(marker, 1)[1])] if marker in path else []


async def _replace_modifiers(db: AsyncSession, item_id: UUID, modifiers: list[ModifierWrite]) -> None:
    await db.execute(text("delete from modifiers where menu_item_id=:id"), {"id": item_id})
    for modifier in modifiers:
        modifier_id = (await db.execute(text("""insert into modifiers(menu_item_id,name_en,name_tr,is_required,
            min_select,max_select,sort_order) values (:item_id,:name_en,:name_tr,:is_required,
            :min_select,:max_select,:sort_order) returning id"""),
            modifier.model_dump(exclude={"options"}) | {"item_id": item_id})).scalar_one()
        for option in modifier.options:
            await db.execute(text("""insert into modifier_options(modifier_id,name_en,name_tr,
                price_delta_kurus,sort_order) values (:modifier_id,:name_en,:name_tr,
                :price_delta_kurus,:sort_order)"""), option.model_dump() | {"modifier_id": modifier_id})


async def create_complete_item(db: AsyncSession, item: MenuItemWrite, modifiers: list[ModifierWrite],
                               image: UploadFile, storage: MenuImageStorage) -> dict[str, object]:
    item_id = uuid4()
    stored: StoredImage | None = None
    try:
        stored = await _store_image(storage, item_id, await prepare_image(image))
        values = item.model_dump(exclude={"image_url"}) | {
            "id": item_id, "image_url": stored.variants["detail"],
            "variants": json.dumps(stored.variants), "paths": json.dumps(stored.paths),
        }
        row = (await db.execute(text("""insert into menu_items(id,category_id,name_en,name_tr,description_en,
            description_tr,price_kurus,image_url,image_variants,image_storage_paths,is_available,is_published,sort_order)
            values (:id,:category_id,:name_en,:name_tr,:description_en,:description_tr,:price_kurus,:image_url,
            :variants,:paths,:is_available,:is_published,:sort_order) returning *"""), values)).mappings().one()
        await _replace_modifiers(db, item_id, modifiers)
        await db.commit()
        return dict(row)
    except Exception as exc:
        await db.rollback()
        if isinstance(exc, PartialImageUploadError):
            await _queue_cleanup(db, exc.paths, "partial_item_create_upload", str(exc))
            raise HTTPException(502, "Image upload failed; cleanup was queued") from exc
        if stored and not await _delete_uploaded(storage, stored.paths):
            await _queue_cleanup(db, stored.paths, "failed_item_create", str(exc))
        raise


async def update_complete_item(db: AsyncSession, item_id: UUID, item: MenuItemWrite,
                               modifiers: list[ModifierWrite], image: UploadFile | None,
                               storage: MenuImageStorage) -> dict[str, object]:
    current = (await db.execute(text("""select image_url,image_variants,image_storage_paths from menu_items
        where id=:id for update"""), {"id": item_id})).mappings().first()
    if not current:
        raise HTTPException(404, "Menu item not found")
    old_paths = list(current["image_storage_paths"] or []) or _legacy_paths(current["image_url"])
    stored: StoredImage | None = None
    try:
        if image:
            stored = await _store_image(storage, item_id, await prepare_image(image))
        values = item.model_dump(exclude={"image_url"}) | {
            "id": item_id,
            "image_url": stored.variants["detail"] if stored else current["image_url"],
            "variants": json.dumps(stored.variants) if stored else json.dumps(current["image_variants"]),
            "paths": json.dumps(stored.paths) if stored else json.dumps(current["image_storage_paths"]),
        }
        row = (await db.execute(text("""update menu_items set category_id=:category_id,name_en=:name_en,
            name_tr=:name_tr,description_en=:description_en,description_tr=:description_tr,
            price_kurus=:price_kurus,image_url=:image_url,image_variants=:variants,image_storage_paths=:paths,
            is_available=:is_available,is_published=:is_published,sort_order=:sort_order where id=:id returning *"""),
            values)).mappings().one()
        await _replace_modifiers(db, item_id, modifiers)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        if isinstance(exc, PartialImageUploadError):
            await _queue_cleanup(db, exc.paths, "partial_item_update_upload", str(exc))
            raise HTTPException(502, "Image upload failed; cleanup was queued") from exc
        if stored and not await _delete_uploaded(storage, stored.paths):
            await _queue_cleanup(db, stored.paths, "failed_item_update", str(exc))
        raise
    if stored:
        await _cleanup_or_queue(db, storage, old_paths, "replaced_item_image")
    return dict(row)


async def replace_item_image(db: AsyncSession, item_id: UUID, image: UploadFile,
                             storage: MenuImageStorage) -> dict[str, str]:
    current = (await db.execute(text("""select image_url,image_storage_paths from menu_items
        where id=:id for update"""), {"id": item_id})).mappings().first()
    if not current:
        raise HTTPException(404, "Menu item not found")
    old_paths = list(current["image_storage_paths"] or []) or _legacy_paths(current["image_url"])
    stored: StoredImage | None = None
    try:
        stored = await _store_image(storage, item_id, await prepare_image(image))
        await db.execute(text("""update menu_items set image_url=:url,image_variants=:variants,
            image_storage_paths=:paths where id=:id"""), {"url": stored.variants["detail"],
            "variants": json.dumps(stored.variants), "paths": json.dumps(stored.paths), "id": item_id})
        await db.commit()
    except Exception as exc:
        await db.rollback()
        if isinstance(exc, PartialImageUploadError):
            await _queue_cleanup(db, exc.paths, "partial_compatibility_image_upload", str(exc))
            raise HTTPException(502, "Image upload failed; cleanup was queued") from exc
        if stored and not await _delete_uploaded(storage, stored.paths):
            await _queue_cleanup(db, stored.paths, "failed_compatibility_image_update", str(exc))
        raise
    await _cleanup_or_queue(db, storage, old_paths, "replaced_compatibility_image")
    return {"image_url": stored.variants["detail"]}


async def delete_complete_item(db: AsyncSession, item_id: UUID, storage: MenuImageStorage) -> None:
    current = (await db.execute(text("""select image_url,image_storage_paths from menu_items
        where id=:id for update"""), {"id": item_id})).mappings().first()
    if not current:
        raise HTTPException(404, "Menu item not found")
    paths = list(current["image_storage_paths"] or []) or _legacy_paths(current["image_url"])
    await db.execute(text("delete from menu_items where id=:id"), {"id": item_id})
    await db.commit()
    await _cleanup_or_queue(db, storage, paths, "deleted_item_image")


async def process_storage_cleanup_jobs(db: AsyncSession, storage: MenuImageStorage) -> int:
    rows = (await db.execute(text("""select id,paths from storage_cleanup_jobs
        where attempts < 10 and available_at <= now() order by available_at
        for update skip locked limit 10"""))).mappings().all()
    for row in rows:
        try:
            await storage.delete(list(row["paths"]))
            await db.execute(text("delete from storage_cleanup_jobs where id=:id"), {"id": row["id"]})
        except Exception as exc:
            await db.execute(text("""update storage_cleanup_jobs set attempts=attempts+1,last_error=:error,
                available_at=now() + make_interval(secs => least(3600,power(2,attempts+1)::integer * 30))
                where id=:id"""), {"id": row["id"], "error": str(exc)[:1000]})
    await db.commit()
    return len(rows)
