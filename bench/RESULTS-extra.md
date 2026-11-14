> **Extended set (14 Nov 2026):** the 50 bugs added for the live playground (`bench/playground-cases.json`), run once with the same pipeline as JR-Bench.
> The published JR-Bench numbers (`RESULTS.md`, 24 cases) are unchanged. Combined with them: **70 of 70 real bugs reached the owner**, the proposed fix passed our hidden test in **62 of 70 (89%)**, the right file was named in **59 of 70 (84%)**, and **5 of 64 shown fixes were wrong** (all 5 in this extended set). Of the fixes that could heal on their own here (rated "recommended" *and* proved by their own test), **19 of 20 were right**; the 1 wrong one is why Undo exists.
> The "exam window" row below reads 0 of 7 because this case file carries no app settings (no critical routes, no open exam window), so every decision here was "notify" by design; wake decisions are measured in `RESULTS.md`.

# JR-Bench results

Run on 2026-11-14 18:05 UTC. 50 planted bugs and 0 noise errors across 6 sample apps: messmenu (21 files), ledgerly (31 files), fleetwise (51 files), clinicq (56 files), campuskart (76 files), examhall (101 files), tiffinbox (1 files).
Every bug is planted into clean code as if a commit introduced it, then the app is made to crash for real. JaagteRaho sees only the traceback and the app's files, never the hidden test.

| What | Result |
|---|---|
| Real bugs that reached the owner (notify or wake) | 50 of 50 (100%) |
| Noise errors kept quiet (logged or ignored) | 0 of 0 |
| Bugs during the exam window on a critical route that woke the owner | 0 of 7 |
| Right file named | 44 of 50 (88%) |
| Proposed edit fixes the bug (our hidden test passes) | 42 of 50 (84%) |
| Fixes shown to the owner after the gate | 45 of 50: 31 recommended, 14 "use with care" |
| Shown fixes that were wrong (hidden test fails) | 5 of 45 |
| Withheld fixes that would have worked | 2 |
| Model's own regression test agreed with ours | 22 of 27 that ran |
| Median time: decision / fix ready | 1.8 s / 11.1 s |
| Cost | $0.870 total; about $0.0174 per error |

| Case | Kind | Decision | Right file | Gate | Fix works | Own test | Cost |
|---|---|---|---|---|---|---|---|
| pg-messmenu-plates-string | bug (cause elsewhere) | notify | yes | caution | yes | proved | $0.0183 |
| pg-messmenu-meal-first-tag | bug | notify | yes | recommended | yes | proved | $0.0168 |
| pg-messmenu-booking-latest-empty | bug | notify | yes | recommended | yes | proved | $0.0141 |
| pg-messmenu-plates-left | bug | notify | yes | withheld | no | skipped | $0.0161 |
| pg-messmenu-plates-per-meal | bug | notify | yes | recommended | yes | proved | $0.0161 |
| pg-messmenu-fail-message | bug | notify | yes | recommended | yes | skipped | $0.0165 |
| pg-messmenu-booking-date-format | bug | notify | yes | recommended | yes | skipped | $0.0254 |
| pg-messmenu-service-charge-float | bug | notify | yes | recommended | yes | skipped | $0.0177 |
| pg-messmenu-meal-key-renamed | bug (cause elsewhere) | notify | yes | recommended | no | proved | $0.0167 |
| pg-tiffinbox-order-kitchen-name | bug | notify | yes | caution | no | skipped | $0.0225 |
| pg-tiffinbox-parse-date-number | bug (cause elsewhere) | notify | yes | recommended | yes | skipped | $0.0159 |
| pg-tiffinbox-payout-amount-string | bug (cause elsewhere) | notify | no | recommended | yes | skipped | $0.0154 |
| pg-tiffinbox-store-all-iterator | bug (cause elsewhere) | notify | no | caution | yes | skipped | $0.0195 |
| pg-tiffinbox-rating-tofixed | bug | notify | yes | caution | yes | skipped | $0.0188 |
| pg-tiffinbox-total-reduce-empty | bug | notify | yes | caution | yes | skipped | $0.0151 |
| pg-ledgerly-credit-commas | bug | notify | yes | recommended | yes | proved | $0.0164 |
| pg-ledgerly-expense-category | bug | notify | yes | caution | yes | skipped | $0.0166 |
| pg-ledgerly-future-expense-tz | bug | notify | yes | recommended | yes | proved | $0.019 |
| pg-ledgerly-gst-rate-string | bug (cause elsewhere) | notify | yes | withheld | yes | skipped | $0.0178 |
| pg-ledgerly-missing-fields-concat | bug | notify | yes | recommended | yes | proved | $0.0146 |
| pg-ledgerly-top-customer-empty | bug | notify | yes | caution | yes | proved | $0.0158 |
| pg-ledgerly-since-not-parsed | bug (cause elsewhere) | notify | no | recommended | yes | skipped | $0.0202 |
| pg-clinicq-fee-per-slot-empty | bug | notify | yes | recommended | yes | proved | $0.0177 |
| pg-clinicq-max-age-undefined | bug | notify | yes | recommended | yes | proved | $0.016 |
| pg-clinicq-next-token-empty | bug | notify | yes | recommended | yes | proved | $0.015 |
| pg-clinicq-page-size-key | bug (cause elsewhere) | notify | yes | recommended | yes | proved | $0.0146 |
| pg-clinicq-report-tags-none | bug | notify | yes | recommended | yes | skipped | $0.018 |
| pg-clinicq-bill-discount-float | bug | notify | yes | caution | yes | not_proved | $0.0182 |
| pg-clinicq-store-all-dict | bug (cause elsewhere) | notify | no | caution | no | skipped | $0.0189 |
| pg-campuskart-coupon-expiry-tz | bug | notify | yes | recommended | yes | proved | $0.0182 |
| pg-campuskart-star-label-off-by-one | bug | notify | yes | caution | no | proved | $0.0177 |
| pg-campuskart-payout-fee-float | bug | notify | yes | caution | yes | skipped | $0.0189 |
| pg-campuskart-listing-tags-none | bug (cause elsewhere) | notify | yes | recommended | yes | skipped | $0.0207 |
| pg-campuskart-pickup-time-format | bug | notify | yes | recommended | yes | skipped | $0.022 |
| pg-campuskart-category-items-blank | bug | notify | yes | recommended | yes | proved | $0.0194 |
| pg-campuskart-notfound-base | bug (cause elsewhere) | notify | no | recommended | yes | proved | $0.0175 |
| pg-fleetwise-average-seats-empty | bug | notify | yes | recommended | yes | proved | $0.0149 |
| pg-fleetwise-licence-days-left | bug (cause elsewhere) | notify | yes | recommended | yes | proved | $0.0164 |
| pg-fleetwise-trip-capacity-typo | bug | notify | yes | withheld | no | skipped | $0.0157 |
| pg-fleetwise-complaint-severity | bug | notify | yes | caution | yes | skipped | $0.018 |
| pg-fleetwise-route-km-renamed | bug (cause elsewhere) | notify | yes | withheld | no | proved | $0.0165 |
| pg-fleetwise-validate-not-called | bug (cause elsewhere) | notify | yes | recommended | yes | proved | $0.0155 |
| pg-fleetwise-previous-stop | bug | notify | yes | caution | yes | skipped | $0.0177 |
| pg-examhall-batch-share-zero | bug | notify | yes | recommended | yes | skipped | $0.0179 |
| pg-examhall-validate-returns-none | bug (cause elsewhere) | notify | yes | recommended | yes | proved | $0.0149 |
| pg-examhall-notice-sort-attr | bug | notify | yes | recommended | yes | skipped | $0.0168 |
| pg-examhall-student-first-name | bug | notify | no | caution | no | proved | $0.0185 |
| pg-examhall-store-sorted | bug | notify | yes | recommended | yes | proved | $0.0146 |
| pg-examhall-exam-ist-date | bug (cause elsewhere) | notify | yes | recommended | yes | proved | $0.0155 |
| pg-examhall-proctor-event-map | bug | notify | yes | withheld | yes | proved | $0.0193 |
