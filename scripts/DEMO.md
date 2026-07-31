# Demo workspace

`scripts/demo-seed.ts` provisions a complete, believable Foyer workspace for
review deployments: a team that looks like it has been running a fundraise and
an acquisition for a couple of months, with real files in object storage and
sixty days of reading analytics behind it.

It is deterministic (seeded PRNG, ids derived from stable names) and idempotent:
structural rows are upserted by id, analytics rows are rebuilt each run, and
every date is computed relative to the moment it runs - so the 30-day chart is
always full and "latest visits" always has entries from the last hour. Nothing
outside the two demo teams is ever touched.

## Run it

```sh
docker compose -f docker-compose.dev.yml up -d      # Postgres :5433, MinIO :9002
bunx prisma migrate deploy
bun run scripts/demo-seed.ts
```

Re-running is safe. To wipe the demo teams (and their users) and start clean:

```sh
bun run scripts/demo-seed.ts --reset
```

Optional, and worth doing before a review: precompute page thumbnails so the
reading-trajectory rail and hover previews load instantly instead of
rasterising on first request.

```sh
bun run scripts/backfill-thumbnails.ts
```

The script prints the row counts it created plus the credentials below.

## Signing in

| | |
| --- | --- |
| Demo account | `demo@larkfield.io` (Avery Holt, OWNER of Larkfield Instruments) |
| Entry URL | `<origin>/api/demo-login` |
| Password-protected link | password `meridian-2026` (Project Meridian data room) |
| API token | `foyer_demo_a7Kq2Lm9Tz4WxRb6Yc1Nv8Ph` (only the hash is stored) |
| API token (reporting) | `foyer_demo_ci_3Fj8Dq1Rs6Vt9Ln2Zb5Kx` |

`/api/demo-login` creates a normal session for `DEMO_LOGIN_EMAIL` and redirects
to `/dashboard`. It is reusable, so one link can be shared with reviewers. It
returns 404 before touching anything when `DEMO_LOGIN_EMAIL` is unset, so it is
inert on any normal deployment. Never set that variable in production.

Ordinary magic-link login also works: `/login` with `demo@larkfield.io`. With
`RESEND_API_KEY` unset the link is printed to the server log.

## Environment for a demo deployment

Everything the app normally needs, plus one variable:

```sh
# --- the only demo-specific variable ---
DEMO_LOGIN_EMAIL=demo@larkfield.io

# --- normal app config ---
NEXT_PUBLIC_APP_URL=https://<host>       # fallback only; requests use their own origin
AUTH_SECRET=<long random string>
DATABASE_URL=postgresql://foyer:foyer@db:5432/foyer
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=foyer
S3_SECRET_ACCESS_KEY=foyer-secret
S3_BUCKET=foyer
S3_FORCE_PATH_STYLE=true

# Leave RESEND_API_KEY unset on a demo box: the seed's viewers and signers are
# fictional addresses and nothing should try to email them.
```

The seed reads `DATABASE_URL` and the `S3_*` variables, falling back to the
dev-compose defaults (`localhost:9002`, `foyer` / `foyer-secret`, bucket
`foyer`), exactly like `scripts/smoke-seed.ts`.

## What gets created

- **Teams**: Larkfield Instruments (an industrial sensing company mid Series B)
  and Harbour Lane Advisors, so the team switcher has somewhere to go. Team
  branding with logo, banner, accent colour, welcome text and a social card.
- **People**: six users across OWNER/ADMIN/MEMBER, two pending invites, per-user
  notification preferences and a few dataroom-scoped member permissions.
- **Library**: sixteen nested folders four levels deep, twenty-eight documents.
  Multi-page PDFs generated with pdf-lib (3 to 40 pages, title page, headings,
  body copy, a financials table on the page readers linger on, page numbers)
  plus a PNG diagram, a CSV, an XLSX and markdown/text files so the non-PDF
  viewers can be reviewed. Three documents carry version history.
- **Data rooms**: four, led by a nine-folder Series B room organised
  01 Corporate through 05 Product, plus an M&A room, a board pack and a
  customer-diligence room. Per-room branding override on the Series B room.
- **Links**: seventeen covering PUBLIC / EMAIL / EMAIL_VERIFIED, password,
  expiring, expired, archived, allow list, block list, download disabled,
  watermark, screenshot deterrence, NDA gate, a scoped link with
  `LinkPermission` grants, and direct `LinkRecipient` invites in opened and
  pending states.
- **Analytics**: ~600 views over 60 days from ~30 visitors at plausible firms,
  weekday-heavier and clustered in working hours, ramping as the round heats up.
  Session lengths run from 20-second bounces to 25-minute reads; ~5,100
  `PageView` rows with front-loaded attention, a spike on each document's key
  page, tail-off and last-page jumps; ~1,000 `MouseBatch` rows of sampled paths
  on the highest-dwell pages. Several visits land in the last few hours.
- **Everything else**: four access requests, six data room questions (answered
  and open), six signature envelopes covering draft / sent / partially signed
  with serial routing / completed with a stamped copy and real SHA-256 /
  declined / expired, with signers, placed fields, adopted signature PNGs and
  audit trails; fourteen notifications (read and unread), link presets, preview
  presets, API tokens, webhooks with a delivery history including two failures,
  and two custom domains (one verified, one pending).

## Notes

- `ViewerGroup` / `ViewerGroupMember` are not seeded: they were removed from the
  schema by migration `20260721165018_drop_viewer_groups`. Per-link scoping is
  done with `LinkPermission` instead, which the seed does use.
- No `NOTION` document is seeded: that type needs a live external Notion URL and
  would make the demo depend on the network.
- No `Import` rows are seeded, so Settings -> Import shows its starting state.
