\echo '=== FTT schema audit ==='
SELECT
  m.name AS migration,
  CASE WHEN m.present THEN 'APPLIED' ELSE '** MISSING **' END AS state
FROM (
  VALUES
    ('0030 restock notify lifecycle', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='restock_notify_requests' AND column_name='attempt_count')),
    ('0031 products reserved_until idx', EXISTS (SELECT 1 FROM pg_indexes
        WHERE indexname='products_stock_reserved_until_idx')),
    ('0032 user_cart_items table', EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_name='user_cart_items')),
    ('0033 orders tracking consent', EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='orders' AND column_name='advertising_consent')
      AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='orders' AND column_name='analytics_consent')),
    ('0027 media_derivatives table', EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_name='media_derivatives'))
) AS m(name, present)
ORDER BY 1;
\echo ''
\echo '=== scale (is this production?) ==='
SELECT
  (SELECT count(*) FROM orders)   AS orders,
  (SELECT count(*) FROM users)    AS users,
  (SELECT count(*) FROM products) AS products,
  (SELECT max(placed_at)::date FROM orders) AS latest_order;
