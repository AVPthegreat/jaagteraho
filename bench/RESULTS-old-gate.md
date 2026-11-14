# JR-Bench results

Run on 2026-11-13 10:56 UTC. 16 planted bugs and 4 noise errors across 6 sample apps: messmenu (21 files), ledgerly (31 files), fleetwise (51 files), clinicq (56 files), campuskart (76 files), examhall (101 files).
Every bug is planted into clean code as if a commit introduced it, then the app is made to crash for real. JaagteRaho sees only the traceback and the app's files, never the hidden test.

| What | Result |
|---|---|
| Real bugs that reached the owner (notify or wake) | 16 of 16 (100%) |
| Noise errors kept quiet (logged or ignored) | 4 of 4 |
| Bugs during the exam window on a critical route that woke the owner | 3 of 3 |
| Right file named | 14 of 16 (88%) |
| Proposed edit fixes the bug (our hidden test passes) | 16 of 16 (100%) |
| Fixes shown to the owner after the gate | 8 of 16 |
| Shown fixes that were wrong (hidden test fails) | 0 of 8 |
| Withheld fixes that would have worked | 8 |
| Model's own regression test agreed with ours | 14 of 14 that ran |
| Median time: decision / fix ready | 1.8 s / 11.5 s |
| Cost | $0.252 total; about $0.0126 per error |

| Case | Kind | Decision | Right file | Gate | Fix works | Own test | Cost |
|---|---|---|---|---|---|---|---|
| messmenu-missing-plates | bug (cause elsewhere) | notify | yes | shown | yes | proved | $0.0152 |
| ledgerly-gst-float | bug | notify | yes | shown | yes | proved | $0.014 |
| ledgerly-empty-average | bug | notify | yes | withheld | yes | proved | $0.015 |
| ledgerly-date-format | bug | notify | yes | withheld | yes | proved | $0.0161 |
| fleetwise-config-rename | bug (cause elsewhere) | notify | no | shown | yes | proved | $0.0151 |
| fleetwise-empty-string | bug (cause elsewhere) | notify | no | shown | yes | proved | $0.017 |
| fleetwise-overdue-datetime | bug (cause elsewhere) | notify | yes | withheld | yes | proved | $0.0134 |
| clinicq-store-keyerror | bug | notify | yes | withheld | yes | proved | $0.0138 |
| clinicq-is-past-datetime | bug | notify | yes | shown | yes | proved | $0.0137 |
| clinicq-bill-describe | bug | notify | yes | shown | yes | proved | $0.014 |
| campuskart-offer-typo | bug | notify | yes | shown | yes | skipped | $0.0158 |
| campuskart-empty-page | bug | notify | yes | withheld | yes | proved | $0.0158 |
| campuskart-order-total | bug | notify | yes | withheld | yes | skipped | $0.0183 |
| examhall-answered-len | bug | wake | yes | withheld | yes | proved | $0.0215 |
| examhall-submission-average | bug | wake | yes | shown | yes | proved | $0.0157 |
| examhall-fee-gst | bug (cause elsewhere) | wake | yes | withheld | yes | proved | $0.0153 |
| noise-client-disconnect | noise | ignore | - | - | - | - | $0.0006 |
| noise-favicon | noise | ignore | - | - | - | - | $0.0005 |
| noise-scanner | noise | ignore | - | - | - | - | $0.0006 |
| noise-shutdown | noise | ignore | - | - | - | - | $0.0005 |
