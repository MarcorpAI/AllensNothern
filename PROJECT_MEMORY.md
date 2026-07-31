# AllensNothern Project Memory and Handoff

> Last audited: 27 July 2026
> Repository root: `/home/kaave/projects/AllensNothern`  
> Original product specification: `ecommerce-spec.md`

This is the living memory and handoff document for AllensNothern. It explains what the product is, why the current architecture exists, what has been built, what has been verified, what is only partially complete, what is not working or not configured, and the recommended order for finishing the project.

This document should be updated whenever a material feature, integration, schema, deployment decision, or known limitation changes.

---

## 1. Product Summary

AllensNothern is a standalone ecommerce storefront for one restaurant. It is not a marketplace and does not support multiple restaurant vendors. Its primary use case is prepared-food delivery within configured local delivery areas in Turkey.

The intended customer journey is:

1. Open the English or Turkish storefront.
2. Browse active menu sections and published food items.
3. Open an item and review its picture, description, and price.
4. Add the food to the cart.
5. Adjust quantities in the cart.
6. Enter contact and delivery information.
7. Search for an address and adjust the exact map pin.
8. Confirm that the pin is inside an active delivery area.
9. Submit the order, send the exact FAST/bank transfer with the order number, and report that the transfer was sent.
10. Wait for administrator verification, then track the paid order through the kitchen stages.

The intended restaurant workflow is:

1. Sign in with a Supabase Auth account approved as an administrator.
2. Manage menu sections, food names, descriptions, pictures, prices, ordering position, publishing, and sold-out status.
3. Define delivery areas and fees.
4. Configure opening hours and closures.
5. See incoming paid orders.
6. Advance each order through `received`, `preparing`, `out_for_delivery`, and `delivered`.
7. Review basic sales analytics.

### Explicit scope boundaries

The following are not part of the current v1 implementation unless deliberately added later:

- Multi-vendor or marketplace behavior.
- Multiple restaurant branches.
- Shipping packaged goods.
- Subscriptions.
- Dine-in or QR table ordering.
- Rider GPS tracking.
- Loyalty points.
- Multiple differentiated staff roles.

Scheduled orders, cash on delivery, SMS, push notifications, refunds, cancellations, and rider assignment were discussed in the original specification but are not implemented in the current codebase.

---

## 2. Current Technical Architecture

### Monorepo structure

- `apps/web` — Next.js 15 storefront and administrator dashboard.
- `apps/api` — FastAPI HTTP API and notification worker.
- `supabase` — local Supabase configuration, PostgreSQL/PostGIS migration, Storage bucket policy, and seed data.
- `.github/workflows/ci.yml` — frontend, backend, Docker, and database CI checks.
- `compose.yaml` — local API and worker containers.
- `ecommerce-spec.md` — original scope and product specification.

### Frontend

- Next.js App Router.
- React 19.
- TypeScript.
- `next-intl` for English and Turkish routes/messages.
- Supabase Auth email/password sessions with cookie-based PKCE refresh handling.
- Zustand with browser persistence for the guest/customer cart.
- Leaflet and OpenStreetMap tiles for address and delivery-area maps.
- PWA manifest and a production-only service worker.

### Backend

- FastAPI 0.139 line.
- Async SQLAlchemy and asyncpg.
- PostgreSQL/PostGIS through Supabase.
- Supabase Auth token validation plus protected `app_metadata` administrator authorization.
- Provider-neutral payment persistence with manual FAST/bank transfer selected for launch; the earlier Iyzico adapter is dormant future compatibility.
- Resend-based notification worker and a PostgreSQL outbox.
- Nominatim address-search proxy with caching and rate limiting.

### Local infrastructure

- Supabase CLI runs the local database, PostGIS, Storage, Studio, and related services.
- Docker Compose runs the FastAPI API and notification worker.
- The Next.js application runs directly with pnpm.
- API base URL: `http://localhost:8000/api/v1`.
- Storefront default URL: `http://localhost:3000/en`.
- Supabase Studio: `http://localhost:54323`.

### Important routing detail

The FastAPI application includes each route module directly in `app/main.py`. This avoids problems encountered with deeply nested live routers in the installed FastAPI version. Keep this direct route-registration structure unless a future framework upgrade is tested against all nested administrator paths.

---

## 3. Database and Persistence

The initial migration creates the following core tables:

- `users` — application profiles synchronized from Supabase Auth users.
- `restaurant_settings` — restaurant name, timezone, and temporary closure state.
- `operating_hours` — one or more opening intervals per weekday.
- `restaurant_closures` — holiday or exceptional closure dates.
- `order_capacity_rules` — recurring weekday or one-off date limits, optionally narrowed to a time window.
- `delivery_zones` — PostGIS polygon, fee, priority, and active state.
- `categories` — bilingual menu sections.
- `menu_items` — bilingual food item data, price, picture URL, publishing, and availability.
- `modifiers` and `modifier_options` — required protein groups and their priced choices for rice and
  soup items; order snapshots preserve historical selections.
- `addresses` — saved user addresses and geographic points.
- `orders` — customer, delivery, pricing, payment, tracking, and fulfillment state.
- `order_items` — frozen item names, selected choices, quantities, and prices.
- `order_status_history` — fulfillment-state audit trail.
- `payments` — provider, order reference, amount, verification status, and audit context for bank transfer or a future card provider.
- `webhook_events` — idempotent Iyzico webhook storage.
- `notification_outbox` — retryable email/status jobs.
- `storage_cleanup_jobs` — retryable deletion of replaced, failed, or removed menu-image objects.
- `audit_log` — administrator availability and order-status changes.
- `idempotency_keys` — checkout response deduplication.

### Important database behavior

- Money is stored as integer kuruş, never floating-point currency.
- Delivery areas use `geography(Polygon, 4326)` and address/order locations use geographic points.
- The database function `is_restaurant_open()` uses the `Europe/Istanbul` timezone, configured hours, holiday closures, and temporary closure state.
- An order stores item names, historical choice snapshots, and prices. Removing live choices or editing a menu item therefore does not rewrite old orders.
- Menu item deletion sets historical `order_items.menu_item_id` to `NULL` while preserving the snapshot.
- Paid-order and user-history indexes are present.
- Pending checkouts reserve matching capacity for 30 minutes. Paid orders continue to count for their local Istanbul day/time window; failed and expired pending reservations do not.
- A PostgreSQL transaction advisory lock serializes capacity counting and reservation so concurrent customers cannot both claim the last place.
- Supabase Realtime publication includes `orders` and `menu_items`, although the current frontend still polls rather than subscribing.
- Row Level Security policies exist for customer-owned data, public menu reads, administrator menu/order access, and public menu image reads.
- The API connects directly to PostgreSQL. API authorization remains essential even though RLS exists for direct Supabase access.

### Current local seed state

At the time of this audit, the local database contains:

- Four deterministic Nigerian development categories: Rice Dishes, Soups & Swallows, Grills & Proteins, and Sides & Small Chops.
- Thirty-seven real-menu items across Rice, Swallow, Soups, Proteins & Grills, and Snacks. Unconfirmed prices are explicitly temporary and images are optional.
- One sample Istanbul delivery zone.
- No paid orders.

The seed is additive and idempotent: stable UUIDs are upserted without deleting users, addresses, capacity rules, or test orders. Pictures may be added later through the administrator; old mismatched development pictures are cleared.

The seed delivery polygon, menu items, prices, delivery fee, hours, and content are development samples. They must not be treated as the real restaurant configuration.

---

## 4. What Has Been Built and Is Working

“Working” in this section means the implementation exists and has passed the available local static or integration checks. It does not automatically mean that an external production provider has been configured.

### Multi-currency manual transfers

- TRY remains the canonical menu and reporting currency. Checkout supports enabled local-transfer routes such as TRY and NGN, with owner-managed accounts and protected customer rates in **Admin → Payments**.
- Foreign-currency quotes are calculated server-side, rounded upward by the route setting, expire automatically, and are frozen with the account details on the resulting order.
- International SWIFT is an assisted contact route only; it does not create an order or reserve kitchen capacity.
- A customer transfer report records the sending name and optional bank reference but never marks an order paid. Staff enter the amount visible in the receiving account, and underpayments remain outside the kitchen queue.
- The seeded TRY and NGN routes are disabled until real account details are configured. Foreign routes additionally require a current rate-valid-until time.
- Checkout accepts international phone numbers for tourists while retaining Turkish local-number normalization.

### 4.1 Bilingual storefront shell

- Locale-prefixed English and Turkish routes exist.
- The header links to home, menu, cart, account/sign-in, and the alternate locale.
- Locale switching preserves the current localized path.
- Core home, menu, cart, and checkout labels have English and Turkish messages.
- Customer sign-in, sign-up, password recovery, and account pages use the same cream, deep-brown, orange, Bricolage Grotesque, square-control, and editorial-spacing system as the main storefront.
- Currency formatting uses Turkish lira.
- Responsive styles and mobile navigation are implemented.
- The storefront navbar uses the supplied stylized Allen's wordmark and “ONE FOR THE CULTURE” ribbon as a transparent image asset.
- The core storefront uses the approved cream, deep-brown, yellow, and CTA-orange design system with Bricolage Grotesque display text, Inter body text, square controls, visible focus states, and photography-led layouts.
- The homepage selects the first available uploaded menu picture for its full-width hero and falls back to a solid deep-brown field when no picture exists.
- The homepage displays every active category as its own section with a headline, a category-linked “See our menu” CTA, and at most the first two dishes even when more are added; the full menu remains the complete catalogue. Desktop cards are deliberately larger while the approved two-column mobile layout is unchanged, and there is no oversized featured dish.
- On desktop, the existing Nigerian hero photograph is paired with a square deep-brown editorial panel and cream text for readable contrast without altering the image. Mobile retains the original text-over-image treatment.
- The PWA manifest, app icon, theme color, service-worker registration, and basic cache strategy exist.
- The service worker only registers in a production build, which prevents stale development caches.

### 4.2 Public menu browsing

- `GET /api/v1/menu?locale=en|tr` returns active categories and published items.
- Item and category ordering is controlled by `sort_order`.
- The response includes whether the restaurant is currently open.
- The menu shows item pictures, names, descriptions, prices, and sold-out state.
- Items cannot be added while sold out or unpublished. The open/closed flag is informational and never blocks ordering in lean v1.
- Category navigation is sticky, horizontally scrollable, and tracks the section currently in view.
- Each category gives its first item a full-width feature treatment before the responsive photo grid.
- Clicking an item opens the localized, deep-linkable `/[locale]/menu/[itemId]` dish page, including for sold-out items.
- Adding an item shows an accessible confirmation and updates the header count.

### 4.3 Simple food ordering

- Rice and soup items require at least one protein choice and allow up to 25 protein portions, including multiple different choices and repeated portions of the same choice. Every selected portion and its price are carried through the cart, server-side repricing, order snapshot, and kitchen ticket.
- The administrator food form manages section, price, minimum quantity, food name, picture,
  description, position, availability, publishing, and required protein choices.
- Turkish item fields are hidden; the API receives the English name/description as safe fallback values for the existing bilingual schema.
- The dish page includes quantity controls, a sticky total-aware add button, and sold-out states.
- Customers may add available dishes and check out regardless of the restaurant-open flag; operating hours do not block ordering.
- The server independently validates current prices, publication state, sold-out state, per-item minimum quantities, and required protein choices.
- Customer cart persistence is at version 4. Its migration intentionally discards legacy cart lines
  left behind before successful checkout began consuming the cart.

### 4.4 Cart

- The cart persists in local browser storage.
- Identical food items with the same protein selections merge and increment quantity; different
  selections remain separate lines.
- Customers can increase/decrease quantity or remove a line.
- Snack minimum quantities are enforced in the UI and again by the API.
- Line totals and subtotal include every selected protein portion's price delta. Cart, customer tracking/order details, payment review, and kitchen tickets aggregate repeated portions as explicit counts such as `Chicken × 3`.
- A successfully created order immediately consumes the cart and checkout draft. Transfer reporting
  and administrator payment verification remain available through the saved tracking token.

#### Consistent food pictures

- Food media uses a consistent 4:3 frame on home, menu, dish, cart, and administrator views.
- Browser rendering uses `object-fit: contain`, so portrait, landscape, and square pictures remain fully visible rather than being zoomed or cropped.
- New uploads generate 600×450 and 1200×900 WebP derivatives with proportion-preserving padding in the store's deep-brown color.
- Previously generated cropped derivatives cannot recover pixels that were already removed; re-upload the original picture to regenerate them with the new behavior.

### 4.5 Address search, map, and delivery validation

- Address search is deliberately initiated by a button rather than autocomplete.
- The backend proxies Nominatim, identifies the application, applies a global one-request-per-second limiter per API process, and caches up to 500 searches.
- Search is limited to Turkey.
- Search results recenter the map and update the visible marker.
- Customers can manually move the map pin to the exact delivery point.
- `POST /api/v1/delivery-zones/check` checks the point against active PostGIS polygons.
- Checkout repeats delivery-area validation on the server before reserving the bank-transfer payment window.
- Checkout also validates whenever the visible pin changes and shows the matched zone and fee before payment.
- The local `MAP_CONTACT_EMAIL` is configured. Actual search still depends on Nominatim and network availability.

### 4.6 Checkout and server-authoritative order creation

- Guest checkout is supported.
- Signed-in checkout associates orders with the verified Supabase Auth user. Checkout retains a conflict-safe profile-shell upsert as protection against lifecycle-trigger failure.
- Contact name, email, phone, address, instructions, pin, items, and quantities are submitted.
- Signed-in customer details are prefilled, saved addresses can be selected/edited/deleted, and every selected or edited location is revalidated against current delivery coverage.
- Turkish mobile numbers accept common local/international input forms and are normalized to
  `+905XXXXXXXXX`; valid international numbers are retained for tourists.
- Checkout requires explicit terms/privacy consent and records its timestamp plus the submitted legal-content version. The current `prelaunch-v1` copy is a functional hook, not approved legal text.
- Checkout intentionally accepts orders outside configured operating hours; individual sold-out state, publication state, and delivery coverage are still enforced.
- Delivery zone and fee are recalculated on the server.
- Every cart line is repriced from the database.
- Checkout requires an idempotency key and returns the same stored response if the same key is repeated.
- A cryptographically random guest tracking token is generated; only its SHA-256 hash is stored.
- Orders and order item snapshots are stored before bank instructions are returned.
- The cart and local checkout draft are cleared once the API has successfully created the order.
- Checkout returns the frozen account label/identifier, holder, optional bank name, settlement
  currency and amount, unique order-number reference, and payment deadline for the selected route.

### 4.7 Bank-transfer payments

- Manual bank transfer is the selected launch payment method for guest and signed-in checkout.
  Enabled TRY and NGN local routes are selectable; international SWIFT remains an assisted-contact route.
- “I completed the transfer” records customer acknowledgement and extends the reservation once for a bounded verification period; it never marks an order paid.
- The English-only administrator dashboard has a plain-language “Payments to check” queue showing the exact amount, customer, deadline, and whether the customer reported sending funds.
- Only an authorized administrator can confirm funds. Confirmation atomically changes `pending → paid`, moves fulfillment to `received`, records status history/audit/payment reference, and creates the notification job.
- The kitchen continues to query only paid orders, so screenshots or customer acknowledgement cannot admit an order.
- The worker automatically marks expired unpaid transfers failed and their capacity reservations stop counting.
- Expired orders cannot later be confirmed into the kitchen; the administrator must not prepare them and should resolve any late transfer directly with the customer.
- The dormant Iyzico callback/webhook adapter is restricted to orders whose payment method/provider is explicitly Iyzico, preventing cross-provider confirmation.

### 4.8 Guest order tracking and customer account

- A guest can track an order using the unguessable tracking token.
- The tracking page uses resilient exponential-backoff polling until delivery.
- It shows the current stage, timestamped status history, customer, delivery address, and total.
- Signed-in customers can retrieve their paid order history.
- Signed-in customers can open an owned order detail with frozen item snapshots, totals, delivery information, and its status timeline; active details poll with backoff. Historical modifier data remains in the API/database for record integrity but is not shown in the customer UI.
- Signed-in customers can retrieve saved addresses.
- The API and checkout UI support selecting, editing, and deleting only addresses owned by the current user.

### 4.9 Supabase authentication and administrator authorization

- Localized English/Turkish email/password registration, sign-in, sign-out, email confirmation callback, forgot-password, and password-update screens are integrated with Supabase Auth.
- `@supabase/ssr` stores PKCE sessions in cookies and middleware refreshes/validates claims without trusting an unverified server session.
- The backend asks Supabase Auth to validate each presented access token and uses the returned current user record.
- Administrator access is not granted merely because someone signed in.
- The backend grants administrator access only when protected `app_metadata.app_role == "admin"`; user-editable metadata is never used for authorization.
- PostgreSQL triggers create/update `public.users` profiles from `auth.users` and anonymize local profile fields after Auth-user deletion, eliminating the identity-webhook dependency.
- The administrator layout is gated by an API access check.
- The gate distinguishes expired sessions, non-admin accounts, and temporary authentication-service failure.
- It rechecks access every minute and whenever the browser regains focus.
- Administrator API errors return understandable messages instead of leaving protected pages mounted with stale data.

### 4.10 Administrator menu management

- Category listing exists in the English-only administrator dashboard; the database still retains bilingual category columns for storefront routing compatibility.
- Categories can be created, edited, ordered, shown/hidden, and deleted when empty.
- Categories containing items are protected from accidental deletion.
- Menu items can be created, edited, and deleted.
- The primary item inputs in the administrator UI are:
  - Menu section.
  - Name.
  - Description.
  - Price.
  - Food picture.
- Turkish name and description fields have been removed; the existing bilingual database columns receive the primary name and description as fallback values.
- Availability, customer-menu visibility, and display order remain simple optional controls.
- Existing items can retain their existing picture when edited.
- JPEG, PNG, and WebP uploads up to 10 MB are accepted.
- Image bytes are decoded rather than trusted from upload metadata, oversized pixel counts are rejected, and EXIF orientation is normalized.
- Pictures are proportionally contained and padded—never center-cropped—into consistent 600×450 card and 1200×900 detail WebP derivatives in the public Supabase Storage `menu-images` bucket.
- A preview is shown before saving/replacing a picture.
- The browser receives a public Supabase URL rather than the container-only internal URL.
- The editor sends item data, protein modifier groups, and the required create image or optional
  replacement image in one coordinated multipart operation.
- Item/modifier database changes commit together; new image objects are deleted if image, modifier, or database work fails.
- Replaced and deleted item objects are removed after a successful database commit.
- Storage deletion failures are durably recorded and retried by the worker, so objects are never abandoned without cleanup ownership.
- The earlier item, modifier, and image endpoints remain temporarily available for compatibility; the compatibility image/delete paths use the same validated derivative and cleanup behavior.
- Required protein selection is exposed for rice and soup items. Historical modifier snapshots remain
  frozen on order items even when live choices are later changed.
- Sold-out/available is a one-tap control on the menu list.
- Availability changes are optimistic in the UI and roll back if the API fails.
- Availability changes are written to the audit log.

### 4.11 Administrator order queue

- Only paid, active orders are shown to restaurant staff.
- The queue uses resilient polling with exponential backoff and supports manual refresh.
- An authorized detail endpoint returns a complete digital kitchen ticket with frozen item names, quantities, selected modifiers, customer contact details, delivery address/instructions, totals, order/payment timestamps, payment reference, and status history.
- The tablet-friendly dashboard shows elapsed wait time and highlights `received` or `preparing` orders after 20 minutes.
- Newly detected paid orders trigger a persistent visual alert. Staff can enable an audible Web Audio alert after a browser gesture and acknowledge new orders.
- Alert acknowledgements are retained for that browser/device in local storage so a refresh does not immediately repeat an acknowledged alert.
- Legal forward-only state transitions are enforced server-side:
  - `received` → `preparing`.
  - `preparing` → `out_for_delivery`.
  - `out_for_delivery` → `delivered`.
- Each transition creates status history, an administrator audit record, and a notification outbox item.
- Invalid or skipped transitions return a conflict rather than corrupting the workflow.

### 4.12 Delivery-area administration

- Existing zones and fees are listed in plain restaurant language.
- An administrator can create, edit, pause/reactivate, reprioritize, and delete zones and fees.
- The visual editor lets the administrator click boundary points on a map.
- The administrator can undo the last point or clear the drawing.
- The UI creates and closes the GeoJSON polygon automatically; the administrator never has to enter coordinate rings manually.
- At least three map points are required.
- PostgreSQL/PostGIS rejects invalid or self-intersecting shapes with a friendly error.
- Actual area overlaps are displayed by name; lower priority numbers win checkout matching.

### 4.13 Opening hours and closures

- Current weekly opening intervals are listed.
- Future holiday closures are listed.
- Administrators can add and remove dated closures with optional reasons.
- Administrators can close or reopen the restaurant immediately.
- The dashboard edits all weekdays, closed days, and multiple non-overlapping intervals.
- Europe/Istanbul is shown explicitly. Hours and closures remain informational and do not block checkout.

### 4.14 Analytics

- The administrator chooses a date range and daily, weekly, or monthly grouping.
- Revenue, paid-order volume, average order value, revenue/volume bars, delivery-zone performance, peak weekday/hour periods, best sellers, and zero/low-selling current dishes are displayed.
- Reporting uses Europe/Istanbul local dates.
- Empty analytics periods and API errors have usable UI states.

### 4.15 Order capacity

- Administrators can create, edit, pause, and delete recurring weekday or exact-date capacity rules.
- Rules may cover the full day or a specific time window, and every matching rule is enforced.
- Checkout exposes only a public available/unavailable signal and shows a localized English/Turkish capacity message before submission.
- Checkout rechecks capacity under a database transaction lock before creating the order, preventing simultaneous requests from exceeding the ceiling.
- Bank-transfer orders reserve capacity for 20 minutes by default; a customer transfer notice extends the reservation once for a 30-minute verification window by default. Failed or expired reservations stop counting.
- Capacity applies to the Istanbul-local time when checkout is placed. Scheduled ordering remains outside lean v1.

### 4.16 Notifications foundation

- Paid orders and later order-status changes create deduplicated outbox records.
- The worker locks jobs with `FOR UPDATE SKIP LOCKED`, allowing safe multi-worker processing.
- Failed sends retry with exponential backoff up to five attempts.
- Successfully handled records are marked sent.

### 4.17 Reliability and security foundations

- API CORS includes local Next.js origins and the required HTTP methods.
- Database errors return a generic restaurant-server message rather than raw SQL details.
- Request IDs are added to responses.
- Checkout, payment callbacks, and provider webhooks are designed to tolerate duplicates.
- Supabase Auth owns password hashing, confirmation, recovery tokens, refresh sessions, and abuse controls.
- Iyzico webhook signatures are checked in production.
- Customer tracking tokens are high entropy and stored only as hashes.
- Historic order contents do not depend on mutable menu records.

---

## 5. Current API Surface

All routes below are under `/api/v1` unless noted.

### Public/customer routes

| Method | Route | Current purpose |
|---|---|---|
| GET | `/menu` | Localized menu and open/closed state |
| GET | `/order-capacity` | Current public capacity availability without internal rule details |
| POST | `/delivery-zones/check` | Point-in-polygon delivery eligibility and fee |
| GET | `/geocoding/search` | Rate-limited Turkey address search |
| POST | `/checkout` | Validate and price order, reserve capacity, and return exact bank-transfer instructions |
| GET | `/orders/track/{token}` | Guest order tracking |
| POST | `/orders/track/{token}/transfer-sent` | Record customer transfer acknowledgement and bounded verification time |
| GET | `/orders` | Signed-in paid order history |
| GET | `/orders/{id}` | Complete owned paid-order detail and status history |
| GET | `/profile` | Signed-in checkout profile prefill |
| GET | `/addresses` | Signed-in saved addresses |
| PUT | `/addresses/{id}` | Edit and revalidate an owned saved address |
| DELETE | `/addresses/{id}` | Delete an owned saved address |

### Administrator routes

| Method | Route | Current purpose |
|---|---|---|
| GET | `/admin/access` | Authoritative administrator access check |
| GET | `/admin/orders` | Active paid order queue |
| GET | `/admin/payment-orders` | Pending bank transfers awaiting customer action or administrator verification |
| GET | `/admin/orders/{id}` | Complete authorized digital kitchen ticket |
| POST | `/admin/orders/{id}/confirm-bank-transfer` | Confirm funds after checking the receiving bank account |
| PATCH | `/admin/orders/{id}/status` | Advance order state |
| GET | `/admin/menu` | Complete management menu tree |
| POST/PUT/DELETE | `/admin/categories...` | Category management |
| POST/PUT/DELETE | `/admin/menu/items...` | Item management |
| POST | `/admin/menu/items/complete` | Transactional item, modifiers, and required image creation |
| PUT | `/admin/menu/items/{id}/complete` | Transactional item/modifier update with optional replacement image |
| PATCH | `/admin/menu/items/{id}/availability` | One-tap sold-out control |
| PUT | `/admin/menu/items/{id}/modifiers` | Replace item choice configuration |
| POST | `/admin/menu/items/{id}/image` | Upload/replace item picture |
| GET/POST/PUT/PATCH/DELETE | `/admin/zones...` | Complete delivery-area CRUD, active state, polygon, and priority management |
| GET/PUT | `/admin/hours` | Read/replace weekly hours |
| POST/DELETE | `/admin/closures...` | Add/remove holiday closures |
| PATCH | `/admin/temporary-closure` | Immediately close/reopen restaurant |
| GET/POST/PUT/DELETE | `/admin/capacity-rules...` | Recurring and date-specific daily/time-window order ceilings |
| GET | `/admin/analytics/summary` | Date-ranged and daily/weekly/monthly grouped analytics |

### Webhook/payment routes

| Method | Route | Current purpose |
|---|---|---|
| POST | `/webhooks/iyzico/callback` | Iyzico hosted-payment browser callback |
| GET | `/webhooks/iyzico/mock/complete` | Non-production mock payment completion |
| POST | `/webhooks/iyzico` | Iyzico server webhook |
| GET | `/health` | API health check; this route is not under `/api/v1` |

---

## 6. Verification State

Historical verification from earlier batches is listed below. The 27 July 2026 deployment-checkpoint
run additionally passed frontend TypeScript, ESLint, five unit tests and a production build, plus
backend Ruff, strict MyPy and three unit tests. Database migration validation is recorded separately
when the local Supabase container is available.

- Frontend TypeScript type checking.
- Frontend ESLint.
- Nine frontend unit tests across three test files, covering the simplified single-price cart, currency formatting, and Turkish phone normalization/rejection.
- Fifteen Playwright browser journeys covering email/password sign-in, username registration, Turkish password recovery, guest and signed-in bank-transfer checkout, exact IBAN/reference instructions, customer transfer acknowledgement, administrator payment review, saved-address reuse, authenticated order details, recovery, quantity editing, tracking, administrator denial/access, responsive English/Turkish behavior, kitchen tickets, localized capacity exhaustion, plain-language administrator operations, consistent contained image rendering, and multipart food-image upload.
- Frontend production build, including the dynamic localized dish route.
- Backend Ruff linting.
- Backend strict MyPy checking across 21 source files.
- Seven backend unit tests, including Supabase customer/admin claim mapping, invalid-token rejection, and authentication-service outage handling.
- Twenty-nine isolated PostgreSQL/PostGIS integration tests: three bank-transfer lifecycle/security/expiry scenarios, seven Batch 1 correctness scenarios, seven Batch 2 menu/image scenarios, one Supabase Auth lifecycle scenario, two kitchen-ticket scenarios, five Batch 6 capacity/zone/hours/analytics scenarios including a real concurrent last-place race, and four Batch 7 customer scenarios.
- A real local HTTP lifecycle for category creation, item creation, modifier replacement, modifier validation failure, sold-out update, English/Turkish public menu reads, and cleanup.
- A real local Supabase Storage upload, public URL assertion, object cleanup, item cleanup, and category cleanup.
- The idempotent Nigerian development seed was applied to the running local PostgreSQL instance: all four seeded categories contain two items, all eight items have image URLs, and `GET /api/v1/menu?locale=en` returned exactly the complete four-category seeded menu.
- Desktop (1440px) and mobile (390px) full-page browser captures verified the enlarged desktop cards, two-item homepage cap, unchanged mobile arrangement, uncropped contained photography, repeated menu CTA, and contrasting desktop hero panel.
- API container health check.
- Worker container running state.
- CORS preflight behavior was previously checked during troubleshooting.

At the time of this audit:

- The API container is healthy.
- The worker container is running.
- Local Supabase database and Storage are available.
- Local Supabase publishable and service-role keys are configured without being committed.
- Local Supabase Auth is enabled and its profile lifecycle migration has been applied successfully.
- The hosted Supabase project was last confirmed through
  `202607150008_bank_transfer_payments.sql`; the multi-currency and minimum-quantity migrations still
  need to be applied during production deployment.
- `MAP_CONTACT_EMAIL` is configured locally.
- The current root `.env` points Storage at the hosted project but still contains a local-development service-role JWT (`issuer=supabase-demo`). A live write check is rejected with signature verification failure. Replace `SUPABASE_SERVICE_ROLE_KEY` with the server-only key from project `bzvuqavmnuxvwfozmpnz` and recreate the API/worker containers before testing real menu uploads again. The UI multipart path itself is browser-tested, and Storage credential failures now produce an actionable administrator message.

### Test coverage limitations

The Batch 1 correctness and Batch 2 transactional menu/image paths are automated. Passing tests do not yet cover later-batch work including:

- Real Iyzico sandbox payment behavior.
- Hosted password-recovery delivery remains constrained by Supabase's built-in email rate limit until custom SMTP/Resend is configured; hosted registration and confirmation already work.
- Administrator role changes and refresh-token expiry in browser automation.
- Email rendering and delivery.
- Exact delivery-zone boundary behavior beyond the core point-in-polygon coverage.
- Midnight/timezone edge cases beyond Europe/Istanbul-local grouping and interval validation.
- Accessibility regressions.
- PWA installation/offline behavior.

---

## 7. What Is Partial, Not Working, or Not Production-Ready

### 7.1 Receiving routes must be configured

The bank-transfer flow is complete, but the repository deliberately does not contain real receiving
account details. Before checkout can accept an order, the owner must configure and enable at least one
local transfer route in **Admin → Payments**. Foreign-currency routes also require a protected customer
rate and validity deadline. International SWIFT is an assisted contact route rather than an automatic
checkout route.

The live operational limitation is manual reconciliation: the owner must check the receiving bank application and confirm the exact amount in the administrator dashboard. Customer acknowledgement and screenshots are never treated as payment. The dormant Iyzico adapter is future-only and is not the selected checkout path.

### 7.2 Real email is not configured

`RESEND_API_KEY` is missing. The development worker currently marks an outbox item as sent even when no Resend key is present, but no real email is delivered. This is acceptable only as a local simulation and must be changed before staging/production.

The current email is also incomplete:

- It is a minimal generic HTML message.
- It is not localized.
- Confirmation emails do not contain the guest tracking token/link.
- Status emails do not contain useful delivery context.
- Sender-domain verification has not been completed.
- There is no operator view for permanently failed notification jobs.

### 7.3 Hosted Supabase Auth still needs environment acceptance

The Clerk dependency has been removed. Local migrations prove profile creation, update, and deletion anonymization, while browser tests prove the localized form requests. A hosted Supabase project must still be configured with the production Site URL, both locale callback paths, email confirmation, recovery templates, password policy, rate limits, and SMTP delivery before launch.

Checkout keeps a minimal, conflict-safe identity-shell upsert so an authenticated order is not lost if a profile trigger is temporarily absent. It never overwrites synchronized profile fields.

### 7.4 Menu Storage cleanup is eventually consistent after a persistent provider outage

Normal replacements, deletions, and failed saves remove their Storage objects immediately. If Supabase Storage rejects all three immediate cleanup attempts, the operation records the exact object paths in `storage_cleanup_jobs`; the worker retries with exponential backoff. Operators do not yet have dashboard visibility into this queue—that operational visibility belongs with the later administrator/deployment batches.

### 7.5 Administrator operations — Batch 6 complete for lean v1

Delivery-area CRUD/priority/overlap display, weekly hours and closures, order capacity, and promised Phase 1 analytics are manageable without database access. Remaining deliberate limitations are:

- The administrator workspace now follows the square-edged cream/brown/orange storefront system throughout; cards, buttons, status labels, maps, feedback, and kitchen tickets do not use rounded corners.
- Navigation and page copy use owner-facing labels such as “Food & prices,” “Delivery areas,” “Opening times,” “Order limits,” and “Sales.” Technical polling, timezone, overlap, and rule terminology has been replaced with plain operational explanations where it is not needed.
- Administrator success/error feedback is fixed to the viewport, square, high contrast, and immediately visible even when a long menu form is saved near the bottom of the page.
- Order limits default to “Every day” and support any number of independent clock windows, such as 10:00–16:00 capped at five orders and 16:00–21:00 with another ceiling. One repeating weekday and one-off dates remain available for exceptions. The screen previews each result in a sentence and the server matches every-day rules in Istanbul time when checkout occurs.

- Analytics has no bookkeeping export; add it only if the owner requests an export format.
- Capacity is based on checkout time because scheduled ordering is outside lean v1.
- Bank-transfer expiry and late-confirmation protection are complete; a genuinely late transfer must be resolved directly with the customer rather than silently overbooking the kitchen.
- Real restaurant zones, hours, fees, capacity ceilings, and reporting expectations still require owner input before Batch 9.

### 7.8 Kitchen operations — Batch 5 complete for lean v1

The complete digital ticket, elapsed/overdue display, visual and opt-in audible alerts, acknowledgement, resilient polling, and forward-only status controls are implemented and tested. Deliberate lean-v1 limitations remain:

- Alert acknowledgement is browser/device-local rather than synchronized between kitchen tablets.
- Browsers require a staff gesture before audio can be enabled.
- The dashboard polls rather than using Supabase Realtime.
- Printing, cancellation/refund, and manual problem/escalation controls remain outside lean v1.

### 7.9 Customer account — Batch 7 complete for lean v1

The bilingual account lists paid orders and saved addresses. Owned order details expose frozen item/modifier snapshots and link active fulfillment to a polling status timeline. Checkout prefills synchronized profile data and supports saved-address selection, map recentering, coverage-validated editing, and deletion. Reorder remains intentionally outside lean v1.

### 7.10 Checkout UX — Batch 7 complete for lean v1

- Turkish mobile numbers are normalized on both client and server, while valid international numbers
  are accepted for tourists.
- Address search still depends on a public service with no SLA.
- The form assumes Istanbul/Turkey in the Iyzico request.
- Required terms/privacy consent is recorded, but owner-approved legal copy and its production version are Batch 9 inputs.
- There is no scheduled-order flow.
- There is no cash-on-delivery flow.
- Failed checkout submission retains the cart and locally persisted form. Once an order is created,
  the cart is consumed and recovery continues through its saved tracking token.

### 7.11 Tracking — Batch 7 complete for lean v1; notifications remain basic

- Tracking uses resilient exponential-backoff polling rather than Realtime and displays timestamped status history.
- There is no estimated preparation or delivery time.
- There is no cancellation/failure state in the database enum.
- No SMS or push notification exists.
- The confirmation page assumes an email tracking link exists, but the current email payload does not contain one.

### 7.12 Localization is partial

Core storefront messages are bilingual, but many strings remain hardcoded in English, including parts of:

- Checkout.
- Account history.
- Confirmation and tracking.
- Validation/error messages.
- Administrator dashboard.

Locale switching returns to the locale home page rather than preserving the current path.

### 7.13 PWA support is foundational, not finished

- Manifest and service worker exist.
- There is no custom install prompt.
- Only an SVG icon is supplied; platform-specific PNG icon sizes and screenshots are missing.
- Offline behavior has not been browser-tested.
- Cache invalidation is a simple hardcoded version.
- There is no offline-state UI.
- Push notifications are not implemented.

### 7.14 Production deployment is not complete

There is no confirmed live staging or production environment. The following remain unproven:

- Managed Supabase migration and production RLS configuration.
- Production Next.js deployment.
- Production API and worker services.
- HTTPS callback/webhook URLs.
- Secret management.
- Domain and DNS configuration.
- Monitoring, alerting, centralized logs, and error tracking.
- Database backups and restore drills.
- Disaster recovery and rollback procedure.
- Load and concurrency behavior.

### 7.15 Business content is still sample content

Before launch, review or replace:

- The five seeded real-menu categories and thirty-seven dishes. Prices are provisional and images are
  intentionally optional so the owner can upload them through the administrator.
- Sample delivery polygon and ₺75 sample fee.
- Seed opening hours.
- Placeholder brand copy and icon if not final.
- Restaurant address, phone, email, social links, and legal business name.
- Map center if the restaurant is not at the current Istanbul sample coordinates.
- Iyzico buyer/city assumptions.

### 7.16 Policy, privacy, and operations are not defined

The storefront does not yet include:

- Privacy policy.
- Cookie/local-storage disclosure.
- Terms of sale.
- Delivery/cancellation/refund policy.
- KVKK-oriented data processing information.
- Allergen and dietary disclaimers.
- Data retention/deletion procedure.
- Support/contact workflow.

These require business/legal review rather than code assumptions.

---

## 8. Local Development Memory

### Prerequisites

- Node.js 22 or newer.
- Corepack.
- pnpm 10.12.4.
- Docker and Docker Compose.
- Standalone Supabase CLI. Do not expect `pnpm exec supabase` to work unless the CLI was deliberately installed as a project dependency.

### Start the project

```bash
corepack enable
pnpm install
supabase start
docker compose up -d api worker
pnpm dev
```

### Useful URLs

- Store: `http://localhost:3000/en`
- Turkish store: `http://localhost:3000/tr`
- Administrator: `http://localhost:3000/en/admin`
- API docs: `http://localhost:8000/docs`
- API health: `http://localhost:8000/health`
- Supabase Studio: `http://localhost:54323`

### Local administrator setup

1. Register/sign in to the intended owner through the storefront.
2. Using the Supabase dashboard or a trusted server-side Admin API call, set protected app metadata on that Auth user to:

   ```json
   {"app_role": "admin"}
   ```

3. Sign out and sign back in so the refreshed access token contains the protected claim.
4. Open `/en/admin`.

Do not expose an administrator-registration toggle in the restaurant UI. Administrator promotion must remain an explicit Supabase administrator action performed by a trusted owner; never use `user_metadata` for this decision.

### Environment-file behavior

- Root `.env` is used by Docker Compose for the API and worker.
- `apps/web/.env.local` is used by Next.js.
- Restart the affected process after changing environment values.
- Never commit real keys.
- At this audit, local Supabase Auth/database/Storage are available, while real Iyzico and Resend credentials are missing.

### Reset database

```bash
supabase db reset
```

This destroys local data and recreates the migration plus sample seed. Do not run it against production.

### Verification commands

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web test:e2e
pnpm --filter web build

docker compose run --rm api sh -c "ruff check . && mypy app && pytest"
TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:54322/postgres \
  apps/api/.venv/bin/pytest -m integration
docker compose build api worker
```

Do not run `next build` at the same time as `next dev` against the same `.next` directory. That previously caused missing vendor-chunk errors. Stop the development server before a production build, or use isolated build directories/CI.

---

## 9. Next Steps to Finish the Project

The steps below are ordered by dependency and launch risk. Do not begin with visual polish while payment, user synchronization, order operations, and production safety are unresolved.

### Priority 0 — Stabilize the current foundation

#### 0.1 Expand automated tests — Batch 1 complete

Batch 1 added rollback-isolated PostgreSQL/PostGIS tests for:

- Server-authoritative price calculation.
- Sold-out and unpublished item checkout rejection.
- Modifier validation and snapshot pricing.
- Checkout idempotency.
- Payment callback/webhook duplicate handling.
- Legal/illegal order transitions.
- Customer ownership authorization.
- First-time authenticated checkout before profile synchronization.
- Outside-hours ordering and active delivery coverage.

Batch 1 added Playwright journeys for:

- English and Turkish menu flows.
- Add-to-cart confirmation.
- Simple single-price item behavior.
- Cart quantity editing.
- Guest checkout with mock payment.
- Guest tracking.
- Non-admin denial and admin access.
- Mobile layouts.

CI installs Chromium and proves the primary guest, customer, and administrator journeys without relying on manual clicking. Auth coverage now also proves localized email/password sign-in, username registration, and password recovery. Batch 2 covers menu/image failure compensation; polygon boundaries and broader administrator operations remain with their owning later batches.

#### 0.2 Make menu item saving resilient — Batch 2 complete

- One multipart administrator operation coordinates item data, an empty compatibility modifier payload, and image handling.
- Versioned derivatives upload before the database commit; failure compensation deletes every newly uploaded path.
- Actual JPEG/PNG/WebP bytes are decoded, normalized, proportionally padded, and compressed into card/detail WebP assets.
- Old objects are deleted only after successful replacement commits, and item deletion removes associated objects.
- Persistent cleanup failures enter a durable retry queue processed by the worker.
- Compatibility endpoints remain available while the browser uses the new complete-item interface.

Gate passed: compatibility-modifier, database, partial upload, replacement, deletion, and cleanup failures leave no partial database item and no untracked Storage object. The current product UI deliberately uses no modifiers.

#### 0.3 Fix signed-in user creation ordering — Batch 1 complete

- Checkout upserts only a missing Supabase identity shell before inserting an order.
- A PostgreSQL integration test proves a newly signed-in user can order before profile synchronization.
- Supabase `auth.users` triggers remain the source of truth for profile lifecycle and profile data.

Gate passed: first-time signed-in checkout cannot fail because the local user row is absent.

### Priority 1 — Complete external integrations

#### 1.1 Supabase email/password authentication — Batch 3 authentication portion complete

- Clerk packages, middleware, backend API calls, webhook routes, Svix, and configuration have been removed.
- Cookie-based PKCE sessions, localized registration/sign-in/recovery/update screens, and safe callback redirects are implemented.
- The API delegates access-token validation to Supabase Auth and reads administrator authority only from protected app metadata.
- Database triggers synchronize profile creation/update and anonymize deletion; the lifecycle is covered against real local PostgreSQL.
- Hosted email delivery, redirect allow-listing, password policy, and abuse-limit acceptance remain deployment configuration work.

Gate passed locally: authentication journeys work without Clerk and local profiles remain synchronized without webhooks.

#### 1.2 Complete Iyzico sandbox integration

- Obtain restaurant sandbox credentials.
- Configure callback/webhook URLs over HTTPS.
- Confirm required identity, city, billing, and address fields.
- Remove or replace the placeholder identity number with a compliant merchant-approved approach.
- Test successful payment, declined payment, 3DS behavior if applicable, abandoned checkout, callback delay, webhook-before-callback, callback-before-webhook, duplicates, and amount mismatch handling.
- Verify provider amount and order identity before marking paid.
- Add pending-payment expiration/cleanup.
- Refund/cancellation controls are post-launch; Batch 9 still requires approved customer-facing legal policy text.

Definition of done: a real sandbox payment produces exactly one paid kitchen order, failures do not enter the queue, and reconciliation is auditable.

#### 1.3 Complete email delivery

- Configure Resend and verify the sending domain.
- Make missing credentials an explicit development log state; do not mark a message delivered when no provider call occurred outside an intentional test mode.
- Build localized confirmation and status templates.
- Include a secure tracking URL in guest confirmation email. This requires making the raw tracking token available to the notification payload safely at order creation/payment confirmation time.
- Include order summary, total, address, support details, and status context.
- Add delivery/failure observability and a retry/dead-letter admin view.

Definition of done: real emails arrive for paid order and every configured status transition in both locales.

### Priority 2 — Finish restaurant operations

#### 2.1 Kitchen-ready order detail/ticket — Batch 5 complete

- Authorized administrators receive complete item/modifier/contact/delivery/payment/timestamp snapshots.
- A responsive tablet ticket includes elapsed wait time and overdue highlighting.
- Resilient polling detects new paid orders and provides visual plus opt-in audible alerts with acknowledgement.
- Staff can advance every supported forward-only fulfillment state directly from the queue or ticket.
- Printing, cancellation/refund, and problem controls remain outside lean v1.

Gate passed: kitchen staff can prepare and advance an order without consulting another system.

#### 2.2 Delivery-zone CRUD — Batch 6 complete

- Add edit, pause/reactivate, delete, and priority endpoints.
- Add corresponding map UI.
- Show overlapping zones and explain priority.
- Validate polygon geometry and display friendly errors.
- Confirm the real restaurant delivery boundaries and fees.

Gate passed locally: the owner can maintain delivery coverage without Supabase Studio or GeoJSON knowledge.

#### 2.3 Operating-hours UI — Batch 6 complete

- Add editable weekday rows.
- Support closed days and multiple intervals.
- Validate overlapping intervals.
- Add closure deletion.
- Clearly show the Europe/Istanbul timezone.
- Test midnight and daylight-saving/timezone edge cases relevant to Turkey and the deployment server.

Gate passed: normal and exceptional hours are manageable from the dashboard and remain informational.

#### 2.4 Analytics and capacity — Batch 6 complete

- Add date range selection and daily/weekly/monthly views.
- Add revenue and order-volume charts.
- Display peak hours/days and delivery-zone breakdown.
- Add best and worst performers.
- Define treatment of refunds/cancellations before using revenue operationally.
- Add export if the owner needs bookkeeping output.

Gate passed locally: promised Phase 1 analytics and the owner-requested daily/time-window capacity controls are visible and understandable without SQL.

### Priority 3 — Finish customer experience

#### 3.1 Improve checkout totals and recovery — Batch 7 complete

- Show selected zone, delivery fee, subtotal, and final total before payment submission.
- Preserve form/cart state across payment failure.
- Provide clear retry and support actions.
- Improve Turkish phone validation/formatting.
- Prefill signed-in customer details.
- Decide whether saved addresses can be outside newly changed zones and always revalidate them.
- Add privacy/terms consent as required.

Definition of done: the customer knows the exact charge before entering payment and can recover from failure without rebuilding the order.

#### 3.2 Complete saved addresses and account orders — Batch 7 complete

- Select a saved address at checkout and recenter the map.
- Add edit/delete UI.
- Add full order detail including item snapshots; retain any historical choice data only for record integrity.
- Link active order history entries to tracking.
- Keep reorder outside lean v1.
- Localize the full account experience.

Definition of done: a returning signed-in customer can complete an order faster than a guest.

#### 3.3 Improve tracking — Batch 7 complete for lean v1

- Display status-history timestamps.
- Add estimated preparation/delivery information if the restaurant can maintain it.
- Move to Realtime or use a resilient backoff strategy.
- Keep SMS, WhatsApp, push, and additional notification channels outside lean v1.

Definition of done: the customer understands what is happening without contacting the restaurant.

#### 3.4 Finish localization and accessibility

- Move all hardcoded customer strings into locale files.
- Decide whether administrator UI also needs Turkish.
- Preserve the current path when switching locale.
- Localize API errors or map them to localized frontend messages.
- Audit keyboard navigation, focus trapping, screen-reader names, color contrast, error association, map alternatives, and reduced motion.

Definition of done: both locale journeys are complete and meet an agreed accessibility standard such as WCAG 2.2 AA for relevant pages.

### Priority 4 — Production readiness and launch

#### 4.1 Replace all sample business data

- Enter the real menu, categories, prices, pictures, and translations.
- Enter real delivery zones and fees.
- Enter real opening hours and closure dates.
- Add final logo, icons, colors, copy, address, phone, email, and social links.
- Add allergen/dietary information if required.
- Obtain owner sign-off on every customer-visible price and zone.

#### 4.2 Legal and privacy review

- Create privacy, terms, delivery, cancellation/refund, and cookie/local-storage disclosures.
- Review KVKK obligations with qualified counsel.
- Define retention for users, addresses, webhook payloads, raw payment responses, orders, and logs.
- Minimize stored provider/customer data where possible.
- Add customer account/data deletion handling consistent with legal requirements.

#### 4.3 Deploy staging

- Create managed Supabase project and apply migrations.
- Configure the Supabase Auth Site URL, locale callback allow-list, password policy, and email templates/SMTP.
- Deploy Next.js frontend.
- Deploy API and worker as separate services.
- Configure all secrets through the hosting platform.
- Configure HTTPS URLs, CORS, Supabase Auth redirects, and Iyzico callbacks.
- Run the full automated and manual acceptance suite.

#### 4.4 Add operations and observability

- Structured logs with request/order IDs.
- Error tracking for frontend, API, and worker.
- Uptime checks for storefront, API health, database, and worker heartbeat.
- Alerts for payment reconciliation failures, email dead letters, and worker downtime.
- Database backups and a tested restore procedure.
- Migration and rollback runbook.
- Rate limiting/abuse protection for checkout, tracking, and webhooks where appropriate.
- Dependency and container vulnerability scanning.

#### 4.5 Production acceptance

Run documented acceptance tests for:

- Both languages.
- Major mobile browsers.
- Administrator access and denial.
- Sold-out behavior.
- Outside-hours ordering plus informational open/closed display.
- Every real delivery-zone edge.
- Successful and failed Iyzico payments.
- Kitchen ticket correctness.
- All status transitions and emails.
- Slow network and provider outage behavior.
- PWA install/offline shell.
- Backup restore and deployment rollback.

Definition of done: the owner can accept a real low-value test order, fulfill it, notify the customer, reconcile the payment, and recover safely from a failed dependency.

---

## 10. Fixed Launch Decisions and Owner Inputs Still Needed

Lean v1 decisions are fixed:

- Manual FAST/bank transfer only for launch; guest and signed-in checkout. Iyzico/card payments remain a future upgrade after merchant eligibility.
- English/Turkish customer experience and English-only administration.
- Email notifications only; digital kitchen tickets without printing or separate staff roles.
- Ordering remains available outside operating hours.
- No cash on delivery, scheduling, reorder, cancellation/refund controls, SMS, WhatsApp, push, or promotional install prompt.

The owner must still supply or approve before Batch 9 can pass:

1. Real menu content, translations, prices, and images.
2. Real delivery zones, fees, overlap priorities, map center, and operating hours.
3. Contact/support details, legal business name, and final branding.
4. Privacy/KVKK, terms, delivery, cancellation/refund, cookie/local-storage, allergen, and dietary content.
5. Customer data-retention policy and any preparation/delivery promises shown publicly.

Document each decision here or in a dedicated decision log before implementing behavior that depends on it.

---

## 11. Recommended Immediate Work Order

If development resumes immediately, use this sequence:

1. Finish localization, accessibility, and PWA assets/testing (Batch 8).
2. Replace sample content and complete legal, security, monitoring, backup, and deployment-readiness acceptance (Batch 9).
3. When the owner has a verified domain, configure Resend/custom SMTP and complete localized notification delivery (deferred Batch 4 gate).
4. Add automated card payments only after the owner has a suitable registered merchant account; the current provider-neutral records allow this without replacing bank transfer.

This order addresses correctness and revenue risk before convenience and visual refinement.

---

## 12. Maintenance Rule for This Document

After every meaningful work session:

- Update the audit date.
- Move completed next steps into “What Has Been Built and Is Working.”
- Record any new limitation under “Partial, Not Working, or Not Production-Ready.”
- Update environment/integration status without writing secret values.
- Update verification results and test counts.
- Record product decisions that affect scope.
- Keep the immediate work order aligned with the highest launch risk.

The goal is that a new developer or a future AI session can read this single file, understand the project accurately, and continue without repeating the discovery and troubleshooting already completed.
