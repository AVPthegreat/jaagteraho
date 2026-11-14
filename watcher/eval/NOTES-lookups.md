# Eval notes: looking beyond the stack trace (14 Nov 2026)

Goal: raise "cause outside the traceback" without hurting the in-traceback results or the cost.

## What changed
- **Repository snapshot** (`src/source/repo.ts`): the repository's tarball at the commit, unpacked in memory (code files only, capped at 40 MB, cached 10 minutes, 3 repositories).
- **Lookups** (`src/pipeline/diagnose.ts`): the diagnosis may call `find_definition`, `search_code` and `read_lines` for up to 3 rounds (8 lookups), with prompt caching so a round costs about $0.005. Files it reads are added to the files the fix gate checks edits against.
- **Map**: a code-picked block listing where the functions called by the failing code are defined, and where the error message's fixed text appears in the code.
- **Stack**: the whole stack is listed (library and caller frames marked), not only the last 8 app frames.
- **Compact view** when lookups are on: long files show the whole failing function plus 15 lines either side (was 80), so the first call is cheaper; the model reads more when it needs to.
- **Re-anchoring**: tracebacks from another release point at the line that still holds the reported code, inside the reported function.
- **Eval harness**: a frame counts as app code when it lies in one of the repository's own packages (was: the packages the real fix touched, which hid psf/black #5214 entirely and leaked the answer's package).
- Spend: cached reads and writes are now charged; follow-up rounds are logged as `diagnosis-lookup`, so the daily diagnosis cap still counts diagnoses.

## Runs (all in a throwaway container from the watcher image, the deployed key from the env file)
| Run | Cases | Code | Outside: right file | Outside: right lines | In trace: file / lines | Cost |
|---|---|---|---|---|---|---|
| before (13 Nov) | 30 | one call, related files | 2 of 9 (3 of 9 in an earlier run) | 0 of 9 | 20/20, 16/20 | $0.038 per diagnosis |
| A | 10 outside | lookups, 2 rounds | 2 of 10 | 1 | - | $0.063 |
| B | 10 outside | + map, whole stack | 3 of 10 | 1 | - | $0.063 |
| C | all 30 | + compact view, 3 rounds, last-round prompt | **5 of 10** | 3 | **20/20, 17/20** | **$0.042** |
| D | 10 outside (repeat of C's code) | same as C | **6 of 10** | 4 | - | $0.026 |

Total eval spend: about $2.79 of the $6 budget.

## Honest limits
- The design was made after reading all 10 outside-traceback cases, and runs A and B were on those same 10. There is no held-out outside-traceback set: the 10 are both the tuning set and the test set. The 20 in-traceback cases were not used for tuning and act as the regression guard. No rule is specific to a case (no repository names, no file lists).
- One or two runs per setting; the outside cases moved between 5 and 6 of 10 on the same code. Treat "about half" as the result, not a precise number.
- "Before" counted 9 outside cases (black #5214 was not diagnosed); now all 10 are diagnosed.
- Still missed: jinja #1701 (block concat in runtime.py), fastapi #9424 (the model reads dependencies/utils.py but blames routing.py), both black cases (blib2to3 Leaf attribute, linegen split).

## Security review fixes (after runs A-D; not re-measured, behaviour on the eval cases is unchanged except on errors)
- Tarball loading streams: unwanted entries are skipped by counting bytes, kept chunks are joined once, hard caps on download (80 MB) and decompressed bytes (200 MB), one 60 s limit over download, decompression and parsing.
- Paste page: the repository is downloaded only after the traceback's files are found in it; failed attempts count against the visitor's and the day's quota (never shown).
- Definitions come from a name index built once per snapshot (yielding to the event loop); search yields too; the map looks up at most 60 names.
- A failed lookup round falls back once to the single call without tools; the spend cap and the owner's credit are re-checked before every follow-up round.
- The snapshot cache key carries who could read it (project id, paste page, or public); unsafe refs are never put in a URL.
- Cached reads are charged at 0.1x the input price for every model.

# Round 2 (14 Nov 2026): following the value, not only the call

## What changed (`src/pipeline/diagnose.ts`, `src/source/repo.ts`)
- **Value trail** in the map: the failing statement and the conditions guarding it name some values; code follows each back to its last assignment in the same function (up to 3 hops), names where the producing functions are defined, and for attributes not set there, where the repository sets them. For "'X' object has no attribute 'y'": where class X is defined and where y is set.
- **`find_writers` lookup**: lines that assign a variable or attribute (assignments, loop targets, class declarations, setattr), app code first. Parameters in multi-line signatures are not counted.
- **Up to 5 lookup rounds / 14 lookups** (was 3 / 8). This exposed a bug: each round marked a cache breakpoint and the API refuses more than 4, so the 5th round failed and fell back to a single call at extra cost. Now only the first block and the newest block are marked (test added).
- **Re-anchoring** also accepts a line that starts with the reported code (a statement whose arguments a formatter moved onto its first line). Before, such frames jumped to the wrong function.
- **Named file**: an empty or loose `file` from the model is replaced by the repository path of a shown/read file, the first edit's file, or a path named in the technical cause.
- Prompt: follow the trail; name up to three candidate places and read those not shown; put the fix where the bad value or state originates unless the crash line's own logic is wrong.

## Method (anti-overfitting)
The 10 outside-traceback cases were split before any round-2 change by sha1(issue_url) (`eval/split.json`): design half (attrs 1284, black 5214, fastapi 9424, flask 5258, httpx 309) used for tuning; held-out half (celery 6164, marshmallow 2868, requests 6643, black 4062, jinja 1701) not looked at during round 2 (all 10 were seen in round 1). 12 new outside-traceback cases (`eval/real-bugs-new.json`, from 10 projects, verified fixed lines at the fix's parent commit) were collected by a separate agent and never looked at while tuning. "Before" is the code on main (round 1), run the same day.

## Results (right file / right lines ±3; final code, two runs each unless noted)
| Set | Before | After |
|---|---|---|
| Design half (tuned on) | 3/5, 3/5 (one run) | 3/5 and 2/5 file; 3/5 and 2/5 lines |
| Held-out half | 2/5 and 2/5 file; 0/5 and 0/5 lines | 3/5 and 1/5 file; 1/5 and 0/5 lines |
| 12 new cases (never seen) | 8/12 and 6/12 file; 2/12 and 3/12 lines | 8/12 and 8/12 file; 4/12 and 4/12 lines |
| All 22 outside, 2 runs | - | 25/44 file, 14/44 lines |
| 20 in-traceback (regression guard, one run) | 20/20, 17/20 (round 1) | 20/20, 17/20 |

Cost: about $0.045 per diagnosis after (range $0.032-0.075 per run), $0.029-0.058 before. Round-2 eval spend about $5.7.

## Honest reading
- On the cases never seen (the 12 new), right lines went from 5/24 to 8/24 and right file from 14/24 to 16/24. On the held-out half and the design half the change is within run-to-run noise (one case either way). There is no evidence of a large gain; there is no sign of harm to in-traceback cases.
- Still missed on design: fastapi 9424 (the trail now leads to `get_typed_return_annotation`, but the model fixes the route instead of the annotation helper; the cause needs `from __future__ import annotations` in the user's code, which the traceback does not show) and black 5214 (the model now finds that `Leaf` declares `bracket_depth` but blames `BracketTracker.mark` early returns instead of `Leaf.__init__`/`clone`).
- Intermediate design runs (v2a: cache-breakpoint failure; v2b: before the origin rule and named-file fix; v2c: an empty `file` cost httpx) are kept as `results-real-v2*-design.json`.
