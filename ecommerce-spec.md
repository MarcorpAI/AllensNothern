# Restaurant Ecommerce Storefront — Project Spec (v0.1)

## 1. Project Overview

**What it is:** A standalone online storefront for a restaurant brand selling prepared food, with local delivery only. Customers browse the menu, order, pay online, and get food delivered within a defined delivery zone.

**Where:** Turkey — payments need to support Turkish cards (Iyzico), UI likely needs Turkish + English.

**What it is NOT (out of scope for v1):**
- Not a marketplace (single restaurant brand, not multi-vendor)
- No shipping/courier for packaged goods — delivery only, same-day/near-term
- No subscriptions or recurring orders (v1)
- No dine-in/table ordering (v1) — that's a different flow (QR ordering), can be a Phase 2 add-on

---

## 2. User Roles

| Role | Access |
|---|---|
| **Customer** | Browse menu, order, pay, track order, order history, saved addresses |
| **Restaurant Admin/Staff** | Manage menu, availability, orders, delivery zones, view sales |
| **Delivery rider** *(optional v1)* | View assigned orders, update delivery status — may just be manual/WhatsApp coordination at first |

---

## 3. Core Features

### Customer-facing
- Menu browsing by category (e.g., starters, mains, drinks, desserts)
- Item detail: photo, description, price, modifiers/options (e.g., spice level, add-ons, size)
- Cart (add/remove/update quantity, modifiers)
- Guest checkout **or** account-based checkout (recommend: allow guest, encourage account for order history)
- Delivery address input — must validate against delivery zone before allowing checkout
- Delivery fee calculation (flat, or by zone/distance)
- Order scheduling: "ASAP" vs scheduled time (respecting kitchen open/close hours)
- Payment via Iyzico (card) — cash-on-delivery as a fallback option is worth considering given local market norms
- Order confirmation + real-time-ish status (received → preparing → out for delivery → delivered)
- Order history / reorder
- Basic notifications (SMS/email/push) on status change

### Admin Dashboard
A separate authenticated area (own route group in Next.js, e.g. `/admin/*`, gated by protected Supabase Auth `app_metadata` — not just "logged in") covering:

- **Menu management:** create/edit/delete categories, items, modifiers; image upload (stored in Supabase Storage) with preview before publish
- **Availability toggle:** instant 86/un-86 of items — this needs to be a one-tap action from a list view, not buried in an edit form
- **Order queue:** live-ish list of incoming orders, status updates (received → preparing → out for delivery → delivered/cancelled)
- **Delivery zone management:** create/edit zones, fees, active/inactive
- **Operating hours:** set hours per day, mark holiday closures
- **Analytics:**
  - Revenue over time (daily/weekly/monthly view)
  - Order volume over time
  - Top-selling items / worst performers
  - Average order value
  - Peak ordering hours/days (useful for staffing prep)
  - Delivery zone breakdown (which zones drive the most orders/revenue)
- **Admin roles:** lean v1 has a single protected `admin` role via Supabase Auth; differentiated staff roles remain post-launch

---

## 4. Non-Functional Requirements

- **Availability toggling must be near-instant** — a sold-out item showing "available" is a direct customer complaint (kitchen ops reality, not just a UI nicety)
- **Delivery zone validation happens before payment**, not after — nothing worse than a paid order that can't be delivered
- Mobile-first (most food ordering is on phones)
- Order status should update customers proactively (push/SMS), not require them to refresh
- Kitchen-side order view needs to be dead simple — staff are cooking, not navigating a dashboard

---

## 5. Tech Stack

- **Backend:** FastAPI
- **Frontend:** Next.js as a **PWA** — installable on customers' phones without an app store, which matters a lot for a repeat-order food storefront (icon on home screen, push notifications later, offline menu caching)
- **Auth:** **Supabase Auth** — email/password registration, confirmation, sessions, and password recovery; no OAuth in lean v1
- **Database/Storage:** Supabase (Postgres + Storage for menu photos)
  - Free tier to start; upgrade to Pro ($25/mo) once live traffic justifies it
  - Native Auth JWTs allow Postgres RLS policies to use `auth.jwt()` directly.
  - `auth.users` lifecycle triggers synchronize the public application profile and anonymize it after Auth-user deletion; checkout retains a non-overwriting identity-shell upsert as a resilience fallback.
- **Payments:** Iyzico (Turkish card processing) — cash-on-delivery as manual fallback option
- **Notifications:** Email via Resend/Postmark to start; SMS (Turkish provider, e.g. Netgsm/Iletimerkezi) if budget allows later; **PWA push notifications are a natural Phase 1.5 add** once the install base exists, since the PWA shell is already there

---

## 6. Database Schema (Draft)

```
users                     -- application profile synchronized from Supabase auth.users
  id (text form of Supabase Auth UUID)
  full_name
  phone
  created_at

addresses
  id
  user_id (FK, nullable for guest orders)
  label (e.g. "Home", "Work")
  full_address
  lat, lng
  delivery_zone_id (FK, resolved at save time)

delivery_zones
  id
  name
  polygon / radius_meters + center_lat/lng
  delivery_fee
  is_active

categories
  id
  name
  sort_order

menu_items
  id
  category_id (FK)
  name
  description
  price
  image_url
  is_available (boolean — the 86 toggle)
  sort_order

modifiers                  -- e.g. "Spice Level", "Add Cheese"
  id
  menu_item_id (FK)
  name
  is_required
  min_select, max_select

modifier_options
  id
  modifier_id (FK)
  name
  price_delta

carts                      -- optional if using client-side cart until checkout
  id
  user_id (nullable)
  session_id (for guest)

cart_items
  id
  cart_id (FK)
  menu_item_id (FK)
  quantity
  selected_modifiers (jsonb)

orders
  id
  user_id (nullable)
  address_id (FK)
  status (received | preparing | out_for_delivery | delivered | cancelled)
  subtotal
  delivery_fee
  total
  payment_method (card | cash)
  payment_status (pending | paid | failed)
  scheduled_for (nullable — null = ASAP)
  created_at

order_items
  id
  order_id (FK)
  menu_item_id (FK)
  quantity
  unit_price
  selected_modifiers (jsonb)

order_status_history
  id
  order_id (FK)
  status
  changed_at

payments
  id
  order_id (FK)
  provider (iyzico)
  provider_reference
  amount
  status
  raw_response (jsonb)
```

**Notes:**
- `selected_modifiers` stored as jsonb on order_items/cart_items to avoid a messy join table for a snapshot of what was ordered (menu items/prices change over time; orders need to freeze what was actually purchased).
- Row Level Security (RLS) in Supabase: customers can only read/write their own orders/addresses; admin role bypasses via service role or a `role` claim check.

---

## 7. API Structure (High-Level)

```
/menu              GET  categories + items (public)
/menu/items/:id    GET  item detail (public)
/cart              GET/POST/PATCH/DELETE (session or user scoped)
/checkout          POST  -> validates zone, calculates total, creates order, initiates payment
/orders/:id        GET  order status (owner or admin)
/orders/:id/status PATCH (admin only)
/delivery-zones/check  POST  -> given lat/lng or address, returns zone + fee or "out of range"
/admin/menu        CRUD (admin only)
/admin/menu/items/:id/image  POST  upload item photo (Supabase Storage)
/admin/orders      GET  queue view (admin only)
/admin/analytics/revenue     GET  revenue over time (admin only)
/admin/analytics/top-items   GET  best/worst sellers (admin only)
/admin/analytics/zones       GET  performance by delivery zone (admin only)
/webhooks/iyzico   POST  payment status callback
```

---

## 8. Phasing

**MVP (Phase 1):**
- Menu browsing, cart, guest + account checkout
- Delivery zone validation, flat or zone-based fee
- Iyzico payment + cash-on-delivery fallback
- Admin dashboard: menu CRUD + image upload, availability toggle, order queue, status updates, delivery zone/hours management
- Admin analytics: revenue, order volume, top items, average order value, zone breakdown
- Email order confirmations

**Phase 2:**
- SMS notifications
- Scheduled orders
- PWA push notifications (order status updates, promos)
- Rider assignment/tracking
- Loyalty/repeat-order incentives
- Multiple admin roles (e.g. kitchen-only vs owner/full-access)

---

## Open Questions (worth deciding before build starts)
1. Cash-on-delivery — in or out for v1? Affects checkout flow complexity.
2. Single delivery zone (fixed radius) or multiple named zones with different fees?
3. Guest checkout allowed, or account required? (Guest = lower friction, but loses order-history/marketing value)
4. Turkish + English from day one, or Turkish-only for v1?
