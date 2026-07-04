# Phase E Load Smoke Report

## Scope

Local production server only:

- Base URL: `http://127.0.0.1:3000`
- Mode: GET-only smoke
- No production traffic
- No payment mutation
- No auth mutation
- No email or notification endpoints

## Warmup

All warmup routes returned 200:

- `/collection`
- `/collection/Kempu-Pachai-and-bandhani`
- `/`
- `/cart`
- `/checkout`
- `/policies/privacy-policy`
- `/packing`

## Results

| Phase | Duration | Concurrency | Requests | RPS | Errors | p50 ms | p95 ms | p99 ms | Max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| collection_read | 15s | 10 | 519 | 34.60 | 0 | 273 | 346 | 870 | 980 |
| pdp_read | 15s | 10 | 554 | 36.93 | 0 | 266 | 330 | 380 | 740 |
| mixed_public_read | 20s | 15 | 1560 | 78.00 | 0 | 238 | 327 | 388 | 894 |

## Mixed Route Breakdown

| Route | Count | Errors | p50 ms | p95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| / | 223 | 0 | 245 | 307 | 894 |
| /collection | 223 | 0 | 271 | 354 | 414 |
| /collection/Kempu-Pachai-and-bandhani | 223 | 0 | 271 | 337 | 388 |
| /cart | 223 | 0 | 10 | 24 | 53 |
| /checkout | 223 | 0 | 4 | 16 | 46 |
| /policies/privacy-policy | 223 | 0 | 229 | 264 | 894 |
| /packing | 222 | 0 | 238 | 303 | 894 |

## Classification

Local GET load smoke: PASS.

This is not a production load test and should not be treated as production capacity proof.

