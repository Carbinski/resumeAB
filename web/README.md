# Ladder (web)

Frontend for the resume ELO tool in the parent repo. One editorial page covering:

1. Upload a resume (drag anywhere, or browse) and see its overall ELO.
2. ELO over time, scrubbable, with a per-quality breakdown.
3. Role lens: Overall, AI & ML, Cloud Ops and Full-stack ratings.
4. A/B lab: compare two versions on a balance scale, with a verdict, six quality duels and a left/right position check.

Ratings come from the Python service in the parent package (`python -m resume_ab.api` on port 8000). The browser calls `/api/ladder`, which proxies that service and forwards the session cookie.

## Run it

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

Start the API first, with `TYPESAFE_API_KEY` set. Without it the page still loads, and uploads fail when a matchup is actually judged.

## Where data comes from

All data flows through [`lib/api.ts`](lib/api.ts). Shapes live in [`lib/types.ts`](lib/types.ts). `OrderResult` matches `resume_ab/compare.py`, and the Elo constants in [`lib/elo.ts`](lib/elo.ts) match `resume_ab/rating.py`.

| Function | What it does |
| --- | --- |
| `getHistory()` | The signed-in user's published versions |
| `uploadResume(file, opts)` | Stores the file, redacts contact details, and rates it against the pool |
| `compareVersions(a, b, role)` | Two-order comparison, including the six quality questions |

### Categories

The six quality categories (Impact, Technical depth, Leadership, Role fit, Trajectory, Signal clarity) live in [`lib/categories.ts`](lib/categories.ts). Personal comparisons ask each one in the same Jev request as the headline choice. Pool matchups stay headline-only.

## Design notes

- Palette sampled from the Decimals reference; tokens are in [`app/globals.css`](app/globals.css). `clay` is the only derived color.
- Type: Instrument Serif for display and ELO numerals, Geist for UI, Geist Mono for small figures.
- No component library. Charts are hand-built SVG (`d3-scale` and `d3-shape` for math only) and motion uses `motion`.
- Rename the product by editing `BRAND` in [`lib/brand.ts`](lib/brand.ts).
- Respects `prefers-reduced-motion`: smooth scrolling is disabled and animations are reduced.
