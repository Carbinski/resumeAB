# What to build next

This is a proposal for the maintainer. It does not change how ratings work. The site is a Next.js app in `web/` that proxies to one FastAPI process in `resume_ab/`. Accounts, résumés, sessions, and Elo live in one SQLite file. Original files live in a directory next to that file.

## 1. Deploying, and what a crowd would hit

### How a request runs today

`python -m resume_ab.api` starts one uvicorn process. `build_default_app` in `resume_ab/api.py` binds `127.0.0.1:8000` unless `LADDER_HOST` / `LADDER_PORT` say otherwise, opens `LADDER_DATA` (default `data/`), and builds one `Store` on `data/ladder.db` plus `data/blobs`. There is no worker flag. A second uvicorn worker would be a second process with its own memory and its own view of in-flight jobs.

The browser only talks to Next.js. `web/app/page.tsx` is `force-dynamic` and loads `/versions` and `/me` through `web/lib/server-api.ts`. Everything else goes to `/api/ladder/...`, which `web/app/api/ladder/[...path]/route.ts` forwards to `LADDER_API_ORIGIN` (default `http://127.0.0.1:8000`). The proxy keeps the `ladder_session` cookie, marks it `HttpOnly` and `SameSite=Lax`, and adds `Secure` when the public request is HTTPS. The API sets the same cookie for 30 days (`create_session` in `resume_ab/store.py`). The session row stores a hash of the token, not the token.

Publishing a résumé does not rate it inside the HTTP request. `_start_overall` inserts a membership in the level pool and `spawn` starts a daemon thread. The thread runs `place_resume`. The browser polls: `uploadResume` in `web/lib/api.ts` checks every 1.5s for up to 10 minutes, and `LadderProvider` polls every 2s while any version is still `placing` or `provisional`.

### Where the eight matchups go

`MATCH_BUDGET` in `resume_ab/cohort.py` is 8. `place_resume` in `resume_ab/place.py` plays opponents chosen by `select_opponents` until that budget is used, the pool runs out, or the early stop hits (4 matchups played, and the last three win probabilities sit within 0.08). Status becomes `provisional` after 2.

Each matchup is one `compare_resumes` call. That function in `resume_ab/compare.py` makes two sequential Jev requests (`jev-latest`, both reading orders) so position bias can be averaged. A published résumé then gets one more categorized comparison (the six questions in `resume_ab/categories.py`) against the previous version, or against one calibration anchor. Role tracks do not repeat that category pass.

The overall pool id is the level string: `intern` or `newgrad` (`overall_pool`). A role pool id is `{level}:{role}` (`role_pool`). Today those roles are `ai`, `cloud`, and `fullstack`, and they start only when someone hits "Rate your latest resume" (`POST /versions/{id}/roles/{role}`). Industry is not part of the pool id.

The A/B lab is a different path. `POST /compare` runs on the request thread and returns only after both Jev calls finish. It writes the `comparisons` table, keyed by the role id (`ai`) or by `jd:{hash}` when a job description is pasted. Placement writes `matches` and caches under the pool id (`intern` or `intern:ai`). A lab result is not reused when that role is later rated, and a lab run does not spend the matchup budget.

Ten synthetic résumés per level in `resume_ab/anchors.py` are seeded into the level pool at Elo 1000. `ensure_pool_anchors` copies those same rows into a role pool the first time that pool is used. They are opponents only. `present.py` keeps them off the public neighbor cards.

### The first production shape

One machine, two processes, one disk.

- Terminate HTTPS in front of `next start`. Point `LADDER_API_ORIGIN` at `http://127.0.0.1:8000`.
- Run the API as `python -m resume_ab.api` on `127.0.0.1` only. Leave it as one process. Set `LADDER_SECURE_COOKIES=1` and `TYPESAFE_API_KEY` in that process's environment.
- Put `LADDER_DATA` on a persistent disk (`ladder.db`, `blobs/`, and `logs/`). Back up the database and `blobs/` together. The judge reads `redacted_text` in SQLite; the blob is the original upload (`{id}.pdf` and the other allowed suffixes, mode `0600`, at most 5 MB, at most 20 files kept per account).
- Keep `data/logs/resume-text.log` on that same disk and out of any shared log drain. `resume_ab/textlog.py` appends the extracted text and the redacted text on every upload, with no rotation. Cap or rotate that file as part of bringing the box up. It is the copy of someone's résumé that will otherwise grow forever.
- A private beta of a few dozen people fits this shape with no code change. Before a class, a career fair, or a public link, cap how many placement threads `spawn` may run at once. `inflight` in `create_app` only skips a duplicate `(resume_id, pool_id)`. It does not limit the fan-out.

Restarting the API is safe for in-progress ratings: `resume_jobs=True` calls `incomplete_jobs` and respawns memberships still in `placing` or `provisional`. Sessions survive because they are rows, not memory. Daemon threads do not survive the process, which is why that restart scan exists.

### What breaks first

**Judge latency and cost break first.** The matchup budget caps work per résumé per pool. It does not cap how many résumés start together. Each published résumé occupies a thread for up to 16 Jev calls (8 matchups × 2 orders), often fewer because of the early stop, plus 2 more calls for category scores. Rating all three current roles adds up to 16 calls each, with no category pass. A lab comparison adds 2 calls and holds the single API process's request until Jev returns. A burst of publishes opens one unbounded thread per résumé, all of them calling Jev immediately. The visible failure is `standing.status = "error"` ("The judge could not score this résumé.") and `502` on `/compare`. The bill moves with that same fan-out.

**The process-wide store lock is the next bottleneck, and it shows up as a slow site while ratings are running.** `Store` uses one SQLite connection and one `RLock`. Writes cannot corrupt each other. The expensive critical section is `refit`: after every match it loads every membership and every match in that pool and runs Bradley–Terry (`resume_ab/rating.py`, up to 100,000 steps) while holding the lock. Login holds the same lock across scrypt (`n = 2**14` in `authenticate`). The polls from every waiting browser take it too. SQLite itself is not the first thing to fall over. This lock is.

**One disk is the durability limit.** Accounts, session hashes, redacted text, Elo, and original files are all under `LADDER_DATA`. Losing the disk loses the product. Filling the disk is unlikely before the judge fan-out; the unbounded text log is the file to watch.

**Session hosting breaks when a second API process appears.** The cookie is valid only for the database that stored its hash, and the blob paths are local. Two Next.js processes are fine: they are stateless and proxy to one origin. Two API processes are not, with the code as it stands.

### What to change only after real traffic

Leave SQLite in place through the first production box. Leave blobs on the local directory. Leave sessions in the `sessions` table. A hosted Postgres, object storage, or a shared session store pays for itself when you intentionally run a second API process, because that is when one file and one directory stop being a store.

Measure three things on the first box: placement age (upload time to `rated`), Jev errors, and how long `/versions` takes while placements are in flight. If Jev errors or placement age dominate, the concurrency cap and the existing budget of 8 are the levers. Raising `MATCH_BUDGET` spends more judge calls to move the same Elo. If `/versions` gets slow in step with `refit`, change the fit so it does not hold `Store._lock` for a full-pool gradient on every match. That is still SQLite. If a lab comparison and a later role rating are clearly double-charging the same pair, teach placement to read the `comparisons` row. Do that after the multi-track lab exists, because today the two caches use different keys on purpose: a pasted job description must not become a ladder match.

## 2. How it should feel after sign-in

An account stores email, a scrypt password hash, the name printed on the résumé, level (`intern` or `newgrad`), industry (the ten ids in `resume_ab/cohort.py`), and an optional company. `user_payload` returns all of those except the password. The name is used for redaction (`redact(..., name=user.name_on_resume)`). It is not shown as a greeting.

Uploading copies level, industry, and company onto the résumé row (`add_resume`). `PATCH /me` updates the user row only. A profile edit applies to the next upload, not to a version already placed. `version_payload` returns the level and not the industry or company, so the rating page cannot name the snapshot that was actually stored. Neighbors already use that snapshot: same level, same industry, widened to the whole level when fewer than three other real résumés share the industry (`INDUSTRY_COHORT = 3` in `neighbors_for`).

The signed-in page is still the marketing page. `Hero` never reads `user`. The empty score card says "Create an account and upload a resume." even when the account exists. "View sample history" stays up, and sample history replaces the real list (`history = demo ? SAMPLE_HISTORY : liveHistory` in `LadderProvider`). The rating header is "Your ELO, over time." The lab header talks about "your current resume" with no level on it. The account card is the only place that says the industry matters.

Keep the section order. Change four surfaces.

**Home.** In `web/components/sections/Hero.tsx`, when `user` is set and sample history is off, replace the paragraph under the headline with the ladder they joined: level label, industry label, and company when they typed one (`levelLabel` / `industryLabel` in `web/lib/cohort.ts`). Example: "Intern · Software · Northwind. Your score is against other interns." If they already have a version, the primary button scrolls to `#rating` and the upload button stays secondary. Hide "View sample history" once a real version exists, so the demo cannot cover their ladder. When they are signed in and have no version yet, the score card should say to upload onto that intern or new-grad ladder, not to create an account they already have.

**Rating.** In `web/components/sections/Rating.tsx`, the header names this version's pool: "Intern · Software" using the résumé's own level and industry, once `version_payload` includes industry. The chart and the overall number stay the level-wide Elo. That number is not an industry Elo, and the header should not imply that it is. In `web/components/sections/Standing.tsx`, the lead sentence names the industry, and the existing `widened` flag stays the explanation when the row had to open up. Add one line for the company they will show on other people's cards ("Your card shows Northwind" or "Your card has no company"). That uses the company stored on the résumé, not a company they typed after the upload.

**Lab.** In `web/components/sections/Lab.tsx`, the header states the level ("two intern résumés") and that a run judges this pair without moving the ladder. Elo changes when they keep a draft, which publishes it and starts the overall pool. The "Judge for" control already shares `role` with the chart through `LadderProvider`. Leave that one control. When section 3 filters tracks, this control and the role rungs should read the same list.

**Remember, and stop there.** Remember the account, the résumé snapshot (level, industry, company), the version list, and the selected role. Do not add a dashboard, a feed, or a second home route. Do not re-place old résumés when the profile changes.

## 3. More comparison-based features

### What is already a ladder

There are two different ideas in the code, and only one of them is Elo.

- **Overall Elo** is one Bradley–Terry fit per level. Pool ids are `intern` and `newgrad`. Every industry shares that fit. `refit` never sees `industry`.
- **Industry** is the neighbor filter and the signup list (`INDUSTRIES` in `resume_ab/cohort.py`, mirrored in `web/lib/cohort.ts`). It does not create a pool.
- **Role Elo** is a separate fit. Pool id `intern:ai` shares no match rows with `intern` or with `intern:cloud`. The description sent to Jev is `ROLE_DESCRIPTIONS` in `resume_ab/categories.py`. The screen list is `ROLES` in `web/lib/roles.ts`. Rating is opt-in, one role at a time, same budget of 8, same `place_resume`.
- **The six categories** (impact, depth, leadership, fit, trajectory, clarity) are a single comparison stored in `category_scores`. The lab already draws them as six win/loss rows (`Duels` in `web/components/Results.tsx`). They are not sub-industry ladders.

The current three roles are all software: AI & ML, Cloud Ops, Full-stack. They are the computer-science tracks. Keep their ids (`ai`, `cloud`, `fullstack`) so existing `memberships` rows stay valid.

### Three groups, eight tracks

The groups are degree families. The industry field is the kind of company. Those are different facts: a CS major can type Aerospace as the industry and still need the CS tracks. Add one account field, `focus`, with three values:

| Focus | Who it is for | Tracks to show |
| --- | --- | --- |
| `cs` | Computer science majors | `ai`, `cloud`, `fullstack` (already shipped) |
| `mee` | Mechanical, electrical, and aerospace engineers | `embedded`, `mechanical`, `flight` |
| `bme` | Biomedical engineers | `devices`, `biodata` |

Suggest the focus from the industry at signup, and let them change it: `software` → `cs`; `aerospace`, `manufacturing`, `automation` → `mee`; `biotech`, `healthcare` → `bme`. Leave `defense`, `robotics`, `consulting`, and `finance` unset until they pick. Those industries hire across the three groups, and a wrong default would hide the tracks they actually want. People with no focus see Overall only.

New track ids and the sentence Jev should see:

- `embedded` — Embedded and electronics engineer, internship or new grad. Firmware, circuits, boards, and test equipment.
- `mechanical` — Mechanical engineer, internship or new grad. Mechanisms, CAD, manufacturing, and hardware test.
- `flight` — Aerospace engineer, internship or new grad. Structures, flight systems, guidance, and vehicles. The id is `flight` so it does not collide with the industry id `aerospace`.
- `devices` — Biomedical devices engineer, internship or new grad. Instrumentation, implants, and imaging hardware.
- `biodata` — Biomedical data engineer, internship or new grad. Lab or clinical data, analysis pipelines, and bioinformatics.

That is the whole set. A one-off posting still uses the job-description box in `web/components/sections/Roles.tsx` (`AddRole`), which calls `/compare` with a pasted description and does not open a pool. New industries do not each get an Elo.

Wire-up is the lists that already exist, not a new scheduler. Add the ids to `ROLE_IDS`, the blurbs to `ROLE_DESCRIPTIONS`, and the labels to `ROLES`. `place_resume` already looks up the description from the pool id. `rate_role` already rejects unknown ids. Extend `RoleRatings` in `web/lib/types.ts` and the `ratings` object in `version_payload`. `web/lib/sampleHistory.ts` stays a software intern: the new keys are `null`, and `ai` stays the rated sample. `Roles` and the lab segmented control render Overall plus the tracks for `user.focus`, not all eight.

### Overall score and per-track score

Publishing still starts only the overall pool (`_start_overall`). That Elo stays the headline: how this résumé does against the intern pool or the new-grad pool, with no role description. Category scores stay attached to that pass.

A track score is the membership on `{level}:{track}`. The person spends it by pressing the existing "Rate your latest resume" button, which runs another budget of 8 against that pool's opponents, including the calibration résumés copied in at 1000. The fits are independent, so the same document can be 1210 overall, 1280 on `embedded`, and 1010 on `flight`. Do not auto-rate every track on upload. For the CS focus that would triple the judge calls (up to 48 extra Jev requests) on top of the overall placement.

`Roles.tsx` currently says a track "beats the average résumé" using distance from 1000. That sentence is the center of the fit, which includes the calibration documents. For the new tracks, say "against the calibration set" until those documents are rewritten. The percentile in Standing is computed only on the overall level pool (`rounded_percentile` in `version_payload`). Leave it there. A track with one real résumé and ten CS anchors is not a percentile of aerospace or biomedical résumés.

### Win one track and lose another

The lab already judges one role per run. `Verdict` in `web/components/Results.tsx` says "B is stronger for AI & ML" from a single `pB`. A result within five percentage points of 50% is a tie (`TIE_BAND = 0.05` in `web/lib/elo.ts`). `/compare` accepts `overall` and each id in `ROLE_IDS`, and caches each pool key separately. A new track works once its id is in that tuple.

Add one action on the lab result: run the same pair once per track in the person's focus (two or three calls to the existing `/compare`). Draw a strip of verdicts, reusing `verdictFor`. A CS major might see "Full-stack: B wins · AI & ML: A wins · Cloud Ops: too close." An aerospace-focused major might see "Flight systems: B wins · Embedded: A wins." The six quality rows stay under the track they just opened; they are not a substitute for the strip.

Show an Elo delta on a strip row only when that track is `provisional` or `rated`. `comparison_payload` falls back to the overall Elo when `ratings[role]` is null, so an unrated track would display the overall gap and can contradict the pairwise winner. The pairwise percent is the result that matters until they rate the track. Say in the strip that these calls do not move either ladder. Publishing the challenger still starts overall placement only. Track Elo moves when they rate that track.

### Calibration résumés

`ensure_pool_anchors` will put the current ten intern and ten new-grad documents into every new pool. Those documents are computer-science résumés (coursework, product internships, infrastructure). That is good enough to keep a new pool from being empty, and it is a poor ruler for mechanical, flight, or biomedical devices work, because the opponent text is still a CS résumé even when the question names another job. Ship the tracks with that known bias, and rewrite the anchor text per focus before treating a `flight` or `devices` number as something to show a stranger. The comment at the top of `resume_ab/anchors.py` already says the scale is those documents.

## Order of work

1. **One box.** Next.js in front, the API on localhost, `LADDER_DATA` on a persistent disk, text log kept local and rotated, one API process. Cap placement threads before any public link. No new database.
2. **Signed-in copy.** Hero, rating header, standing, and lab, using the account and the résumé snapshot. Add industry and company to `version_payload` so the words match the row that was placed.
3. **Focus.** One field, defaulted from industry, editable. CS-focused people see the three roles that already exist. Everyone else still has Overall.
4. **Five new tracks.** `embedded`, `mechanical`, `flight`, `devices`, `biodata`, through the existing role lists and the existing rate button. Still opt-in. Still a budget of 8 per track.
5. **Lab strip.** One `/compare` per track in the focus, with Elo deltas only after that track has been rated.
6. **Anchors per focus.** Replace the calibration text before quoting a non-CS track as a standing among peers.

Steps 1–3 are useful if step 4 slips. Step 4 without step 6 is still a real head-to-head; it is a weak cohort percentile, which is why the percentile stays on the overall pool.
