# JR-Bench results

Run on 2026-11-13 11:06 UTC. 20 planted bugs and 4 noise errors across 6 sample apps: messmenu (21 files), ledgerly (31 files), fleetwise (51 files), clinicq (56 files), campuskart (76 files), examhall (101 files), tiffinbox (1 files).
Every bug is planted into clean code as if a commit introduced it, then the app is made to crash for real. JaagteRaho sees only the traceback and the app's files, never the hidden test.

| What | Result |
|---|---|
| Real bugs that reached the owner (notify or wake) | 20 of 20 (100%) |
| Noise errors kept quiet (logged or ignored) | 4 of 4 |
| Bugs during the exam window on a critical route that woke the owner | 3 of 3 |
| Right file named | 15 of 20 (75%) |
| Proposed edit fixes the bug (our hidden test passes) | 20 of 20 (100%) |
| Fixes shown to the owner after the gate | 19 of 20: 14 recommended, 5 "use with care" |
| Shown fixes that were wrong (hidden test fails) | 0 of 19 |
| Withheld fixes that would have worked | 1 |
| Model's own regression test agreed with ours | 14 of 14 that ran |
| Median time: decision / fix ready | 1.6 s / 11.7 s |
| Cost | $0.319 total; about $0.0133 per error |

| Case | Kind | Decision | Right file | Gate | Fix works | Own test | Cost |
|---|---|---|---|---|---|---|---|
| messmenu-missing-plates | bug (cause elsewhere) | notify | yes | recommended | yes | proved | $0.0158 |
| ledgerly-gst-float | bug | notify | yes | recommended | yes | proved | $0.0136 |
| ledgerly-empty-average | bug | notify | yes | withheld | yes | proved | $0.0147 |
| ledgerly-date-format | bug | notify | yes | caution | yes | proved | $0.0163 |
| fleetwise-config-rename | bug (cause elsewhere) | notify | no | recommended | yes | proved | $0.0149 |
| fleetwise-empty-string | bug (cause elsewhere) | notify | no | recommended | yes | proved | $0.018 |
| fleetwise-overdue-datetime | bug (cause elsewhere) | notify | yes | caution | yes | proved | $0.0131 |
| clinicq-store-keyerror | bug | notify | yes | recommended | yes | proved | $0.0144 |
| clinicq-is-past-datetime | bug | notify | yes | recommended | yes | proved | $0.0135 |
| clinicq-bill-describe | bug | notify | yes | recommended | yes | proved | $0.0139 |
| campuskart-offer-typo | bug | notify | yes | recommended | yes | skipped | $0.0163 |
| campuskart-empty-page | bug | notify | yes | recommended | yes | proved | $0.0155 |
| campuskart-order-total | bug | notify | yes | caution | yes | skipped | $0.0179 |
| examhall-answered-len | bug | wake | yes | caution | yes | proved | $0.0209 |
| examhall-submission-average | bug | wake | yes | recommended | yes | proved | $0.0155 |
| examhall-fee-gst | bug (cause elsewhere) | wake | no | caution | yes | proved | $0.0168 |
| tiffinbox-menu-undefined | bug | notify | yes | recommended | yes | skipped | $0.0149 |
| tiffinbox-empty-average | bug | notify | yes | recommended | yes | skipped | $0.0151 |
| tiffinbox-config-rename | bug (cause elsewhere) | notify | no | recommended | yes | skipped | $0.0124 |
| tiffinbox-empty-string | bug (cause elsewhere) | notify | no | recommended | yes | skipped | $0.0229 |
| noise-client-disconnect | noise | ignore | - | - | - | - | $0.0006 |
| noise-favicon | noise | ignore | - | - | - | - | $0.0005 |
| noise-scanner | noise | ignore | - | - | - | - | $0.0006 |
| noise-shutdown | noise | ignore | - | - | - | - | $0.0005 |
