# JR-Bench results

Run on 2026-11-13 10:53 UTC. 16 planted bugs and 4 noise errors across 6 sample apps: messmenu (21 files), ledgerly (31 files), fleetwise (51 files), clinicq (56 files), campuskart (76 files), examhall (101 files).
Every bug is planted into clean code as if a commit introduced it, then the app is made to crash for real. JaagteRaho sees only the traceback and the app's files, never the hidden test.

| What | Result |
|---|---|
| Real bugs that reached the owner (notify or wake) | 16 of 16 (100%) |
| Noise errors kept quiet (logged or ignored) | 4 of 4 |
| Bugs during the exam window on a critical route that woke the owner | 3 of 3 |
| Right file named | 13 of 16 (81%) |
| Proposed edit fixes the bug (our hidden test passes) | 16 of 16 (100%) |
| Fixes shown to the owner after the gate | 6 of 16 |
| Shown fixes that were wrong (hidden test fails) | 0 of 6 |
| Withheld fixes that would have worked | 10 |
| Model's own regression test agreed with ours | 14 of 14 that ran |
| Median time: decision / fix ready | 1.4 s / 11.3 s |
| Cost | $0.237 total; about $0.0119 per error |

| Case | Kind | Decision | Right file | Gate | Fix works | Own test | Cost |
|---|---|---|---|---|---|---|---|
| messmenu-missing-plates | bug (cause elsewhere) | notify | yes | shown | yes | proved | $0.0142 |
| ledgerly-gst-float | bug | notify | yes | withheld | yes | proved | $0.014 |
| ledgerly-empty-average | bug | notify | yes | withheld | yes | proved | $0.0129 |
| ledgerly-date-format | bug | notify | yes | withheld | yes | proved | $0.0142 |
| fleetwise-config-rename | bug (cause elsewhere) | notify | no | shown | yes | proved | $0.013 |
| fleetwise-empty-string | bug (cause elsewhere) | notify | no | withheld | yes | proved | $0.0153 |
| fleetwise-overdue-datetime | bug (cause elsewhere) | notify | yes | withheld | yes | proved | $0.0128 |
| clinicq-store-keyerror | bug | notify | yes | withheld | yes | proved | $0.0126 |
| clinicq-is-past-datetime | bug | notify | yes | shown | yes | proved | $0.0134 |
| clinicq-bill-describe | bug | notify | yes | shown | yes | proved | $0.0133 |
| campuskart-offer-typo | bug | notify | yes | shown | yes | skipped | $0.0142 |
| campuskart-empty-page | bug | notify | yes | withheld | yes | proved | $0.0148 |
| campuskart-order-total | bug | notify | yes | withheld | yes | skipped | $0.0164 |
| examhall-answered-len | bug | wake | yes | withheld | yes | proved | $0.0173 |
| examhall-submission-average | bug | wake | yes | shown | yes | proved | $0.0147 |
| examhall-fee-gst | bug (cause elsewhere) | wake | no | withheld | yes | proved | $0.0222 |
| noise-client-disconnect | noise | ignore | - | - | - | - | $0.0006 |
| noise-favicon | noise | ignore | - | - | - | - | $0.0005 |
| noise-scanner | noise | ignore | - | - | - | - | $0.0006 |
| noise-shutdown | noise | ignore | - | - | - | - | $0.0005 |
