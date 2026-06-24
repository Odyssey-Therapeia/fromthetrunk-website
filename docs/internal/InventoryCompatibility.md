# Inventory Compatibility

## Current Public Source Of Truth

`products.stock_status` plus `products.reserved_until` is the canonical public
availability source for PDP, lightweight stock API, and channel feeds.

The current checkout oversell guard is the atomic `products` row update:

```sql
update products
set stock_status = 'reserved'
where id in (...) and (
  stock_status = 'available'
  or (stock_status = 'reserved' and reserved_until < now())
)
returning id;
```

Because that product row is the write authority, public reads must not let
`reservations` table counts override `stock_status` while inventory v2 remains a
transition layer. A row with `stock_status='reserved'` and a future or null
`reserved_until` is reserved. A row with an expired `reserved_until` resolves as
available for reads and is later cleaned by the release job.

## Reservation Rows

`reservations` rows remain compatibility data for the v2 transition and order
cleanup. They are not the public availability source until the reservation
service becomes the canonical claim authority with its own idempotency and
concurrency contract.

## Future V2 Cutover Requirement

Before switching public reads to reservation-table state, checkout must first
move its authoritative one-of-one claim from the product-row update to a durable
reservation service that proves exactly one winner under concurrent claims.
