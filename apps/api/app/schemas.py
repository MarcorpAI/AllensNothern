from datetime import datetime
from decimal import Decimal
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
    minimum_order_quantity: int = 1
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
    def validate_mobile(cls, value: str) -> str:
        digits = "".join(character for character in value if character.isdigit())
        if digits.startswith("0090"):
            digits = digits[2:]
        elif digits.startswith("0"):
            digits = "90" + digits[1:]
        elif len(digits) == 10:
            digits = "90" + digits
        if not 8 <= len(digits) <= 15:
            raise ValueError("Enter a valid international phone number including its country code")
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
    payment_route_id: UUID | None = None
    payment_quote_id: UUID | None = None

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


class CheckoutQuoteIn(BaseModel):
    address: AddressIn
    items: list[CheckoutItemIn] = Field(min_length=1, max_length=50)
    payment_route_id: UUID


class PaymentRouteOut(BaseModel):
    id: UUID
    code: str
    name: str
    route_type: Literal["local_transfer", "assisted"]
    currency: str | None
    contact_url: str
    rate_valid_until: datetime | None


class CheckoutQuoteOut(BaseModel):
    id: UUID
    route_id: UUID
    base_amount_kurus: int
    settlement_currency: str
    settlement_amount_minor: int
    customer_rate: Decimal
    expires_at: datetime


class BankTransferInstructionsOut(BaseModel):
    account_holder: str
    bank_name: str
    account_label: str = "IBAN"
    account_identifier: str
    currency: str = "TRY"
    amount_minor: int
    customer_rate: Decimal = Decimal("1")
    reference: str
    expires_at: datetime


class TransferSentIn(BaseModel):
    sender_name: str = Field(min_length=2, max_length=120)
    transaction_reference: str = Field(default="", max_length=120)
    amount_confirmed: bool


class TransferSentOut(BaseModel):
    transfer_notified_at: datetime
    payment_expires_at: datetime


class BankTransferConfirmationIn(BaseModel):
    reference: str = Field(default="", max_length=120)
    received_amount_minor: int = Field(ge=0)
    mismatch_note: str = Field(default="", max_length=250)


class PendingBankTransferItemOut(BaseModel):
    item_name: str
    quantity: int
    selected_modifiers: list[dict[str, object]]


class PendingBankTransferOrderOut(BaseModel):
    id: UUID
    order_number: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    delivery_address: str
    delivery_instructions: str
    total_kurus: int
    settlement_currency: str
    settlement_amount_minor: int
    payment_route_name: str
    transfer_sender_name: str | None
    transfer_customer_reference: str | None
    transfer_mismatch_note: str | None
    items: list[PendingBankTransferItemOut]
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
    locale: Literal["en", "tr"]
    payment_method: Literal["bank_transfer", "iyzico"]
    payment_expires_at: datetime | None = None
    transfer_notified_at: datetime | None = None
    bank_transfer: BankTransferInstructionsOut | None = None
    items: list[CustomerOrderItemOut]
    status_history: list[KitchenStatusHistoryOut]
