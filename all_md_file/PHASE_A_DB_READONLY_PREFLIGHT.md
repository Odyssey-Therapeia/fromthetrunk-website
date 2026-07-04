# Phase A DB Read-Only Preflight

Date: 2026-07-03

Scope: read-only DB identity and schema preflight against the existing `.env.local` database. No secrets printed.

## Execution Notes

The first Neon client attempt used the old callable API and failed before SQL execution with:

```text
This function can now be called only as a tagged-template function... use sql.query(...)
```

The preflight was rerun with `sql.query(...)`. All read-only queries completed.

## DB Identity

- current database: `neondb`
- current schema: `public`
- public table count: 60

Key tables present:

```text
auth_otp_challenges
discounts
events
order_items
orders
orders_items
products
reservations
```

## Required Table Findings

### orders

`orders` exists with 53 columns. Required checkout columns are present:

```text
id uuid not null default gen_random_uuid()
user_id uuid nullable
subtotal numeric nullable default 0
status USER-DEFINED nullable default 'pending'::enum_orders_status
placed_at timestamptz nullable
updated_at timestamptz not null default now()
created_at timestamptz not null default now()
shipping_cost numeric nullable default 0
shipping_method USER-DEFINED nullable
tax_rate numeric nullable
tax_amount numeric nullable
total numeric nullable
payment_gateway varchar nullable
razorpay_order_id varchar nullable
payment_id varchar nullable
payment_status USER-DEFINED nullable default 'pending'::enum_orders_payment_status
payment_method varchar nullable
subtotal_paise integer not null
shipping_cost_paise integer not null default 0
tax_amount_paise integer not null default 0
total_paise integer not null default 0
shipping_name text nullable
shipping_line1 text nullable
shipping_line2 text nullable
shipping_city text nullable
shipping_state text nullable
shipping_postal_code text nullable
shipping_country text nullable
shipping_phone text nullable
shipping_email text nullable
shipping_method_text text nullable
reminder_sent_at timestamptz nullable
discount_id uuid nullable
discount_code text nullable
refunded_at timestamptz nullable
refund_id text nullable
refunded_amount_paise integer nullable
tracking_number text nullable
tracking_carrier text nullable
internal_note text nullable
is_gift boolean not null default false
gift_from text nullable
gift_message text nullable
paid_at timestamptz nullable
```

The legacy `subtotal numeric` column is nullable with default `0`, so the known legacy `subtotal numeric NOT NULL` insert blocker is neutralized.

### order_items

`order_items` exists and has the required current checkout item shape:

```text
id uuid not null default gen_random_uuid()
order_id uuid not null
product_id uuid nullable
name text not null
price_paise integer not null
quantity integer not null default 1
image_url text nullable
created_at timestamptz not null default now()
selected_options jsonb not null default '{}'::jsonb
```

### orders_items

`orders_items` exists and is classified as a legacy Payload-era table:

```text
_order integer not null
_parent_id uuid not null
id varchar not null
product_id uuid nullable
name varchar not null
price numeric not null
quantity numeric not null
image_url varchar nullable
```

It was not modified or dropped.

### products

`products` exists and has the inventory fields required for one-of-one checks:

```text
stock_status USER-DEFINED nullable default 'available'::enum_products_stock_status
reserved_until timestamptz nullable
sold_at timestamptz nullable
quantity_available integer not null default 1
reserved_by_user_id uuid nullable
```

### reservations

`reservations` exists:

```text
id uuid not null default gen_random_uuid()
order_id uuid not null
product_id uuid not null
qty integer not null default 1
expires_at timestamptz not null
created_at timestamptz not null default now()
```

### events

`events` exists:

```text
id uuid not null default gen_random_uuid()
event_id text not null
type text not null
payload jsonb nullable
occurred_at timestamptz not null
created_at timestamptz not null default now()
```

`events_event_id_unique` exists.

### auth_otp_challenges

`auth_otp_challenges` exists and supports OTP concurrency/replay guards, including:

```text
purpose
identifier_type
identifier_normalized
delivery_email
user_id
otp_hash
challenge_token_hash
login_ticket_hash
login_ticket_expires_at
attempts default 0
max_attempts default 5
send_count default 1
expires_at
resend_available_at
verified_at
consumed_at
request_ip_hash
user_agent_hash
metadata
created_at
updated_at
```

### discounts

`discounts` exists and supports checkout validation:

```text
id uuid not null default gen_random_uuid()
code text not null
type USER-DEFINED not null
value integer not null
min_subtotal_paise integer not null default 0
collection_id uuid nullable
starts_at timestamptz nullable
ends_at timestamptz nullable
usage_limit integer nullable
usage_count integer not null default 0
active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Index Findings

Required/current indexes found:

```text
events_event_id_unique
order_items_order_idx
order_items_product_idx
orders_razorpay_order_id_unique
orders_payment_id_unique
orders_shipping_email_lower_idx
orders_status_idx
orders_payment_status_idx
orders_user_idx
orders_created_at_idx
orders_reminder_sent_at_idx
orders_refund_id_idx
products_slug_idx
products_status_stock_created_at_idx
products_reserved_expiry_idx
products_reserved_by_user_idx
reservations_order_idx
reservations_product_idx
reservations_product_expires_at_idx
reservations_expires_at_idx
```

## Type Findings

Both legacy Payload enum type names and newer app enum type names exist:

```text
enum_orders_payment_status: pending, paid, failed, refunded
enum_orders_shipping_method: standard, express
enum_orders_status: pending, confirmed, shipped, delivered
enum_products_status: draft, published
enum_products_stock_status: available, reserved, sold
order_status: pending, confirmed, shipped, delivered
payment_status: pending, paid, failed, refunded
product_status: draft, published
stock_status: available, reserved, sold
```

Important drift: several actual columns still use legacy `enum_*` types while `db/schema.ts` expects the newer enum type names. The runtime string labels are compatible, but the schema is hybrid.

