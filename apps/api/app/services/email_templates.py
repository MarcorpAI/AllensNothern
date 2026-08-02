from dataclasses import dataclass
from html import escape
from typing import Any

CREAM = "#f7f3ea"
BROWN = "#3b2317"
YELLOW = "#f7b500"
ORANGE = "#e2672a"
MUTED = "#7a6650"


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    html: str
    text: str


STATUS_COPY = {
    "en": {
        "received": ("Order confirmed", "We received your payment and sent your order to the kitchen."),
        "preparing": ("Your food is being prepared", "The kitchen is now preparing your order."),
        "out_for_delivery": ("Your order is on the way", "Your order has left the kitchen for delivery."),
        "delivered": ("Your order was delivered", "Your order has arrived. Thank you for eating with us."),
    },
    "tr": {
        "received": ("Sipariş onaylandı", "Ödemenizi aldık ve siparişinizi mutfağa ilettik."),
        "preparing": ("Yemeğiniz hazırlanıyor", "Mutfak şimdi siparişinizi hazırlıyor."),
        "out_for_delivery": ("Siparişiniz yolda", "Siparişiniz teslimat için mutfaktan çıktı."),
        "delivered": ("Siparişiniz teslim edildi", "Siparişiniz ulaştı. Bizi tercih ettiğiniz için teşekkürler."),
    },
}


def _money(kurus: int) -> str:
    return f"₺{kurus / 100:,.2f}"


def _option_counts(modifier: dict[str, Any], locale: str) -> str:
    key = "name_tr" if locale == "tr" else "name_en"
    counts: dict[str, int] = {}
    for option in modifier.get("options", []):
        name = str(option.get(key) or option.get("name_en") or "")
        counts[name] = counts.get(name, 0) + 1
    return ", ".join(f"{name} × {count}" for name, count in counts.items())


def _items_html(items: list[dict[str, Any]], locale: str) -> str:
    rows = []
    for item in items:
        modifiers = "".join(
            f'<div style="color:{MUTED};font-size:13px;line-height:1.5;margin-top:5px">'
            f'{escape(str(modifier.get("name_tr" if locale == "tr" else "name_en") or modifier.get("name_en") or ""))}: '
            f'{escape(_option_counts(modifier, locale))}</div>'
            for modifier in item.get("selected_modifiers", [])
        )
        rows.append(
            f'<tr><td style="padding:16px 0;border-bottom:1px solid #ded2bd;vertical-align:top">'
            f'<strong>{int(item["quantity"])} × {escape(str(item["item_name"]))}</strong>{modifiers}</td>'
            f'<td style="padding:16px 0;border-bottom:1px solid #ded2bd;text-align:right;vertical-align:top;font-weight:700">'
            f'{_money(int(item["line_total_kurus"]))}</td></tr>'
        )
    return f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0">{"".join(rows)}</table>'


def _items_text(items: list[dict[str, Any]], locale: str) -> str:
    lines = []
    for item in items:
        lines.append(f'{item["quantity"]} × {item["item_name"]} — {_money(int(item["line_total_kurus"]))}')
        for modifier in item.get("selected_modifiers", []):
            name = modifier.get("name_tr" if locale == "tr" else "name_en") or modifier.get("name_en", "")
            lines.append(f"  {name}: {_option_counts(modifier, locale)}")
    return "\n".join(lines)


def _layout(kicker: str, title: str, intro: str, body: str, footer: str, action: tuple[str, str] | None) -> str:
    button = ""
    if action:
        label, url = action
        button = (f'<a href="{escape(url, quote=True)}" style="display:inline-block;background:{ORANGE};color:#fff;'
                  'text-decoration:none;font-weight:700;padding:15px 22px;margin:24px 0 8px">'
                  f'{escape(label)}</a>')
    return f"""<!doctype html><html><body style="margin:0;background:{CREAM};color:{BROWN};font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">{escape(intro)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{CREAM}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffaf2;border:1px solid #ded2bd">
<tr><td style="background:{YELLOW};padding:28px 34px 20px"><div style="font-family:Georgia,serif;font-size:38px;font-weight:700;line-height:1">Allen’s</div><div style="display:inline-block;background:{ORANGE};color:white;font-size:10px;letter-spacing:3px;font-weight:700;padding:6px 12px;margin-top:7px">ONE FOR THE CULTURE</div></td></tr>
<tr><td style="padding:38px 34px"><div style="color:{ORANGE};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">{escape(kicker)}</div><h1 style="font-family:Georgia,serif;font-size:34px;line-height:1.08;margin:12px 0 14px">{escape(title)}</h1><p style="color:{MUTED};font-size:16px;line-height:1.65;margin:0 0 26px">{escape(intro)}</p>{body}{button}</td></tr>
<tr><td style="background:{BROWN};color:{CREAM};padding:24px 34px;font-size:12px;line-height:1.6">{escape(footer)}</td></tr>
</table></td></tr></table></body></html>"""


def render_customer_email(kind: str, order: dict[str, Any], items: list[dict[str, Any]], payload: dict[str, Any],
                          app_url: str, support_email: str) -> RenderedEmail:
    locale = "tr" if order.get("locale") == "tr" else "en"
    status = str(payload.get("status") or kind.removeprefix("status_") or "received")
    title, intro = STATUS_COPY[locale].get(status, STATUS_COPY[locale]["received"])
    order_number = str(order["order_number"])
    labels = ({"order": "Sipariş", "delivery": "Teslimat", "subtotal": "Ara toplam", "fee": "Teslimat ücreti",
               "total": "Toplam", "track": "Siparişi takip et", "footer": "Sorularınız için"}
              if locale == "tr" else
              {"order": "Order", "delivery": "Delivery", "subtotal": "Subtotal", "fee": "Delivery fee",
               "total": "Total", "track": "Track your order", "footer": "Questions? Contact"})
    totals = (f'<table role="presentation" width="100%" style="margin-top:22px"><tr><td>{labels["subtotal"]}</td><td align="right">{_money(int(order["subtotal_kurus"]))}</td></tr>'
              f'<tr><td>{labels["fee"]}</td><td align="right">{_money(int(order["delivery_fee_kurus"]))}</td></tr>'
              f'<tr><td style="padding-top:12px;font-weight:700">{labels["total"]}</td><td align="right" style="padding-top:12px;font-weight:700">{_money(int(order["total_kurus"]))}</td></tr></table>')
    address = f'<div style="margin-top:28px;padding:18px;background:{CREAM}"><strong>{labels["delivery"]}</strong><div style="color:{MUTED};margin-top:7px;line-height:1.5">{escape(str(order["address_text"]))}</div></div>'
    tracking_token = str(payload.get("tracking_token") or "")
    tracking_url = f"{app_url.rstrip('/')}/{locale}/orders/{tracking_token}" if tracking_token else ""
    body = f'<div style="font-weight:700;margin-bottom:8px">{labels["order"]} {escape(order_number)}</div>{_items_html(items, locale)}{totals}{address}'
    text = (f"{title}\n\n{intro}\n\n{labels['order']} {order_number}\n{_items_text(items, locale)}\n\n"
            f"{labels['subtotal']}: {_money(int(order['subtotal_kurus']))}\n{labels['fee']}: {_money(int(order['delivery_fee_kurus']))}\n"
            f"{labels['total']}: {_money(int(order['total_kurus']))}\n{labels['delivery']}: {order['address_text']}"
            + (f"\n{labels['track']}: {tracking_url}" if tracking_url else ""))
    return RenderedEmail(
        subject=f"{title} · {order_number}",
        html=_layout(order_number, title, intro, body, f"{labels['footer']} {support_email}",
                     (labels["track"], tracking_url) if tracking_url else None),
        text=text,
    )


def render_admin_email(kind: str, order: dict[str, Any], items: list[dict[str, Any]], app_url: str,
                       support_email: str) -> RenderedEmail:
    reported = kind == "admin_transfer_reported"
    title = "Transfer reported — verify payment" if reported else "New paid order"
    intro = ("The customer says the bank transfer was sent. Check the receiving account before confirming."
             if reported else "Payment is confirmed. This order is ready for the kitchen.")
    body = (f'<div style="font-weight:700;margin-bottom:8px">Order {escape(str(order["order_number"]))}</div>'
            f'{_items_html(items, "en")}<div style="margin-top:24px;padding:18px;background:{CREAM};line-height:1.65">'
            f'<strong>{escape(str(order["customer_name"]))}</strong><br>{escape(str(order["customer_email"]))}<br>'
            f'{escape(str(order["customer_phone"]))}<br><br>{escape(str(order["address_text"]))}'
            f'{"<br>" + escape(str(order["address_instructions"])) if order.get("address_instructions") else ""}</div>'
            f'<div style="font-size:20px;font-weight:700;text-align:right;margin-top:20px">Total {_money(int(order["total_kurus"]))}</div>')
    admin_url = f"{app_url.rstrip('/')}/en/admin/orders"
    text = (f"{title}\n\n{intro}\n\nOrder {order['order_number']}\n{_items_text(items, 'en')}\n\n"
            f"Customer: {order['customer_name']}\nEmail: {order['customer_email']}\nPhone: {order['customer_phone']}\n"
            f"Delivery: {order['address_text']}\nTotal: {_money(int(order['total_kurus']))}\nAdmin: {admin_url}")
    return RenderedEmail(
        subject=f"{title} · {order['order_number']}",
        html=_layout("Restaurant notification", title, intro, body, f"Operational email · {support_email}",
                     ("Open admin orders", admin_url)),
        text=text,
    )


def render_email(kind: str, order: dict[str, Any], items: list[dict[str, Any]], payload: dict[str, Any],
                 app_url: str, support_email: str) -> RenderedEmail:
    if kind.startswith("admin_"):
        return render_admin_email(kind, order, items, app_url, support_email)
    return render_customer_email(kind, order, items, payload, app_url, support_email)
