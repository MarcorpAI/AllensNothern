from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_env: str = "development"
    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:54322/postgres"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"])

    supabase_url: str = "http://127.0.0.1:54321"
    supabase_public_url: str = ""
    supabase_publishable_key: str = ""
    next_public_supabase_publishable_key: str = ""
    supabase_service_role_key: str = ""
    iyzico_api_key: str = ""
    iyzico_secret_key: str = ""
    iyzico_base_url: str = "https://sandbox-api.iyzipay.com"
    bank_transfer_account_holder: str = ""
    bank_transfer_iban: str = ""
    bank_transfer_bank_name: str = ""
    bank_transfer_payment_minutes: int = Field(default=20, ge=5, le=120)
    bank_transfer_verification_minutes: int = Field(default=30, ge=5, le=120)
    resend_api_key: str = ""
    email_from: str = "orders@example.com"
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    map_contact_email: str = "maps@example.com"
    capacity_reservation_minutes: int = Field(default=30, ge=5, le=120)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def supabase_auth_key(self) -> str:
        return self.supabase_publishable_key or self.next_public_supabase_publishable_key

    @property
    def bank_transfer_configured(self) -> bool:
        return bool(self.bank_transfer_account_holder.strip() and len(self.normalized_bank_transfer_iban) == 26
                    and self.normalized_bank_transfer_iban.startswith("TR")
                    and self.normalized_bank_transfer_iban[2:].isdigit())

    @property
    def normalized_bank_transfer_iban(self) -> str:
        return "".join(self.bank_transfer_iban.split()).upper()


@lru_cache
def get_settings() -> Settings:
    return Settings()
