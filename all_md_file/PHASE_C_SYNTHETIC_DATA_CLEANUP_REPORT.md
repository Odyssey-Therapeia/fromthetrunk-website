# Phase C Synthetic Data Cleanup Report

## Cleanup Command

`npx -y -p node@22 -p pnpm@10.28.0 pnpm exec tsx --env-file=.env.local scripts/phase-c-order-isolation-proof.ts --allow-synthetic-db`

## Final Cleanup Counts

```json
{
  "addresses": 0,
  "events": 0,
  "orderItems": 0,
  "orderRows": 0,
  "orderEvents": 0,
  "products": 0,
  "reservations": 0,
  "users": 0,
  "wishlistRows": 0
}
```

## Synthetic Media/Assets

No synthetic media or product image assets were created.

## Result

Cleanup returned zero. No non-synthetic rows were targeted for deletion.
