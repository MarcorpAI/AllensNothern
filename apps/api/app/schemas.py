from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


class ModifierOptionOut(BaseModel):
    id: UUID
    name: str
    price_delta_kurus: int


class ModifierOut(BaseModel):
    id: UUID
    name: str
    is_required: bool
    min_select: int
    max_select: int
    options: list[ModifierOptionOut]


class MenuItemOut(BaseModel):
    id: UUID
    category_id: UUID
    name: str
    description: str
    price_kurus: int
    image_url: str | None
    is_available: bool
    modifiers: list[ModifierOut] = []


class CategoryOut(BaseModel):
    id: UUID
    name: str
    items: list[MenuItemOut]


class MenuResponse(BaseModel):
    locale: Literal["en", "tr"]
    is_open: bool
    categories: list[CategoryOut]


class ZoneCheckIn(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class ZoneCheckOut(BaseModel):
    deliverable: bool
    zone_id: UUID | None = None
    zone_name: str | None = None
    delivery_fee_kurus: int | None = None


class GeocodeResult(BaseModel):
    display_name: str
    latitude: float
    longitude: float


class SelectedModifierIn(BaseModel):
    modifier_id: UUID
    option_ids: list[UUID]


class CheckoutItemIn(BaseModel):
    menu_item_id: UUID
    quantity: int = Field(ge=1, le=25)
    modifiers: list[SelectedModifierIn] = []


class CustomerIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=30)

    @field_validator("phone")
    @classmethod
    def validate_turkish_mobile(cls, value: str) -> str:
        digits = "".join(character for character in value if character.isdigit())
        if digits.startswith("0090"):
            digits = digits[2:]
        elif digits.startswith("0"):
            digits = "90" + digits[1:]
        elif len(digits) == 10:
            digits = "90" + digits
        if len(digits) != 12 or not digits.startswith("905"):
            raise ValueError("Enter a valid Turkish mobile number, for example +90 555 111 22 33")
        return f"+{digits}"


class AddressIn(BaseModel):
    full_address: str = Field(min_length=5, max_length=500)
    instructions: str = Field(default="", max_length=500)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CheckoutIn(BaseModel):
    locale: Literal["en", "tr"] = "en"
    customer: CustomerIn
    address: AddressIn
    items: list[CheckoutItemIn] = Field(min_length=1, max_length=50)
    save_address: bool = False
    address_label: str = Field(default="Home", max_length=50)
    terms_accepted: bool
    legal_version: str = Field(default="prelaunch-v1", min_length=1, max_length=50)

    @field_validator("terms_accepted")
    @classmethod
    def require_consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Terms and privacy consent is required")
        return value


class CheckoutOut(BaseModel):
    order_id: UUID
    order_number: str
    total_kurus: int
    payment_status: str
    payment_method: Literal["bank_transfer", "iyzico"]
    bank_transfer: "BankTransferInstructionsOut | None" = None
    tracking_token: str


class BankTransferInstructionsOut(BaseModel):
    account_holder: str
    iban: str
    bank_name: str
    reference: str
    expires_at: datetime


class TransferSentOut(BaseModel):
    transfer_notified_at: datetime
    payment_expires_at: datetime


class BankTransferConfirmationIn(BaseModel):
    reference: str = Field(default="", max_length=120)


class PendingBankTransferOrderOut(BaseModel):
    id: UUID
    order_number: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    total_kurus: int
    created_at: datetime
    payment_expires_at: datetime
    transfer_notified_at: datetime | None


class StatusUpdateIn(BaseModel):
    status: Literal["preparing", "out_for_delivery", "delivered"]


class OrderOut(BaseModel):
    id: UUID
    order_number: str
    status: str
    payment_status: str
    customer_name: str
    total_kurus: int
    delivery_address: str
    created_at: datetime
    paid_at: datetime | None = None


class KitchenOrderItemOut(BaseModel):
    id: UUID
    item_name: str
    quantity: int
    unit_price_kurus: int
    line_total_kurus: int
    selected_modifiers: list[dict[str, object]]


class KitchenStatusHistoryOut(BaseModel):
    status: str
    changed_at: datetime


class KitchenOrderDetailOut(BaseModel):
    id: UUID
    order_number: str
    status: str
    payment_status: str
    locale: Literal["en", "tr"]
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    delivery_address: str
    delivery_instructions: str
    delivery_zone_name: str
    subtotal_kurus: int
    delivery_fee_kurus: int
    total_kurus: int
    payment_reference: str | None
    created_at: datetime
    paid_at: datetime | None
    updated_at: datetime
    items: list[KitchenOrderItemOut]
    status_history: list[KitchenStatusHistoryOut]


class AvailabilityIn(BaseModel):
    is_available: bool


class SavedAddressOut(BaseModel):
    id: UUID
    label: str
    full_address: str
    instructions: str
    latitude: float
    longitude: float


class SavedAddressWrite(BaseModel):
    label: str = Field(min_length=1, max_length=50)
    full_address: str = Field(min_length=5, max_length=500)
    instructions: str = Field(default="", max_length=500)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CustomerProfileOut(BaseModel):
    full_name: str | None
    email: EmailStr | None
    phone: str | None


class CustomerOrderItemOut(BaseModel):
    id: UUID
    item_name: str
    quantity: int
    unit_price_kurus: int
    line_total_kurus: int
    selected_modifiers: list[dict[str, object]]


class CustomerOrderDetailOut(OrderOut):
    locale: Literal["en", "tr"]
    customer_email: EmailStr
    customer_phone: str
    delivery_instructions: str
    delivery_zone_name: str
    subtotal_kurus: int
    delivery_fee_kurus: int
    items: list[CustomerOrderItemOut]
    status_history: list[KitchenStatusHistoryOut]


class TrackedOrderOut(OrderOut):
    payment_method: Literal["bank_transfer", "iyzico"]
    payment_expires_at: datetime | None = None
    transfer_notified_at: datetime | None = None
    bank_transfer: BankTransferInstructionsOut | None = None
    status_history: list[KitchenStatusHistoryOut]
