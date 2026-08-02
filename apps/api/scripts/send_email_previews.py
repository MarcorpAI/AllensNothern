"""Send customer and administrator template previews to the configured admin address."""

import argparse
import hashlib

import resend

from app.core.config import get_settings
from app.services.email_templates import render_email


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to", help="Preview recipient; defaults to ADMIN_EMAIL")
    args = parser.parse_args()
    settings = get_settings()
    if not settings.resend_api_key or not settings.admin_email:
        raise SystemExit("RESEND_API_KEY and ADMIN_EMAIL must be configured")
    resend.api_key = settings.resend_api_key
    recipient = args.to or settings.admin_email
    order = {
        "order_number": "PREVIEW-0001",
        "locale": "en",
        "customer_name": "Preview Customer",
        "customer_email": recipient,
        "customer_phone": "+90 555 000 0000",
        "address_text": "Preview delivery address, Istanbul",
        "address_instructions": "Email preview only — no order was placed.",
        "subtotal_kurus": 195_000,
        "delivery_fee_kurus": 10_000,
        "total_kurus": 205_000,
    }
    items = [{
        "item_name": "Jollof Rice",
        "quantity": 2,
        "line_total_kurus": 195_000,
        "selected_modifiers": [{
            "name_en": "Choose your protein",
            "name_tr": "Protein seçin",
            "options": [
                {"name_en": "Chicken", "name_tr": "Tavuk"},
                {"name_en": "Chicken", "name_tr": "Tavuk"},
                {"name_en": "Beef", "name_tr": "Dana eti"},
            ],
        }],
    }]
    messages = [
        render_email("order_confirmation", order, items, {"status": "received"},
                     settings.app_url, settings.support_email),
        render_email("admin_order_received", order, items, {}, settings.app_url, settings.support_email),
    ]
    recipient_key = hashlib.sha256(recipient.lower().encode()).hexdigest()[:16]
    for index, message in enumerate(messages, start=1):
        response = resend.Emails.send({
            "from": settings.email_from,
            "to": [recipient],
            "reply_to": settings.support_email,
            "subject": f"[Preview] {message.subject}",
            "html": message.html,
            "text": message.text,
        }, {"idempotency_key": f"allens-email-preview-v1-{recipient_key}-{index}"})
        print(f"Preview {index} accepted by Resend: {response['id']}")


if __name__ == "__main__":
    main()
