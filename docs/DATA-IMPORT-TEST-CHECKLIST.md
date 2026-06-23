# Data Import — Manual Test Checklist

No automated test framework in admin-web. Run these tests on **staging/local only** after `supabase db push`.

**Environment:** staging or local Supabase; no production data.

---

## Employee import

| # | Test | Expected |
|---|------|----------|
| 1 | CSV **without** Status column | Parses; preview shows create/update; new employees default Active |
| 2 | CSV **with** Status Active/Inactive | Respects values on create and update |
| 3 | Manually deactivate employee → re-import **without** Status | Employee **stays Inactive** |
| 4 | Re-import same employee with explicit Status Active | Employee becomes Active |

## Assignment import — working week

| # | Test | Expected |
|---|------|----------|
| 5 | Employee on Job A in **current week**, import Job B same week | Conflict shown with current → new job and week dates |
| 6 | Same employee, Job A in **prior week only** (ended before week start), import Job B current week | **No conflict** |
| 7 | Choose **Skip** on conflict | Old assignment unchanged; new row not created |
| 8 | Choose **Move** without dates | Confirm Import **blocked**; validation hint shown |
| 9 | **Move** with end + start dates | Old assignment completed; new assignment created |

## Import history

| # | Test | Expected |
|---|------|----------|
| 10 | After assignment commit | History shows week dates + conflict count for ASSIGNMENT runs |

## Working week selector

| # | Test | Expected |
|---|------|----------|
| 11 | Current / Next / Custom Friday | Week start (Sat) and end (Fri) display correctly; changing week re-runs preview if rows parsed |

---

## Sign-off

| Role | Name | Date | Pass/Fail |
|------|------|------|-----------|
| Admin tester | | | |
| Raymond / business | | | |
