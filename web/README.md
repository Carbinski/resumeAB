# Ladder (web)

Frontend for the resume ELO tool in the parent repo. One editorial page covering:

1. Upload a resume (drag anywhere, or browse) and see its overall ELO.
2. ELO over time, scrubbable, with a per-quality breakdown.
3. Role lens: Overall, AI & ML, Cloud Ops and Full-stack ratings.
4. A/B lab: compare two versions on a balance scale, with a verdict, six quality duels and a left/right position check.

Everything runs on mock data. No backend is required.

## Run it

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

## Where the mock data plugs in

All data flows through [`lib/api.ts`](lib/api.ts). Its functions return the shapes in [`lib/types.ts`](lib/types.ts), which mirror the Python package (`OrderResult` matches `resume_ab/compare.py`, and the Elo constants in [`lib/elo.ts`](lib/elo.ts) match `resume_ab/rating.py`).

| Function | Today | To go live |
| --- | --- | --- |
| `getHistory()` | returns `lib/mock/history.ts` | fetch the user's rated versions |
| `uploadResume(file, opts)` | fakes parsing and a deterministic rating | upload the file, return a rated `ResumeVersion` |
| `compareVersions(a, b, role)` | derives a result from the Elo gap | run the two-order comparison and return `CompareResult` |

`getHistory` runs on the server in `app/page.tsx`. The other two run in the browser, so swap them for `fetch` calls to route handlers.

### Categories

The six quality categories (Impact, Technical depth, Leadership, Role fit, Trajectory, Signal clarity) are invented and live in [`lib/categories.ts`](lib/categories.ts). Each has a `judgePrompt`, which is the question a backend `Choice` would ask. Adding one backend question per category in `build_questions` in `resume_ab/compare.py` is all the engine needs to feed the category duels.

## Design notes

- Palette sampled from the Decimals reference; tokens are in [`app/globals.css`](app/globals.css). `clay` is the only derived color.
- Type: Instrument Serif for display and ELO numerals, Geist for UI, Geist Mono for small figures.
- No component library. Charts are hand-built SVG (`d3-scale` and `d3-shape` for math only) and motion uses `motion`.
- Rename the product by editing `BRAND` in [`lib/brand.ts`](lib/brand.ts).
- Respects `prefers-reduced-motion`: smooth scrolling is disabled and animations are reduced.
