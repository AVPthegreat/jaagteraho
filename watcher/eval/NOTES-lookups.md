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
