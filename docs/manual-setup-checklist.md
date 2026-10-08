# Manual setup checklist — CivicFix

Everything below is work a human has to do. The repo runs on demo values and on
integrations that are implemented but stay in their local modes until you supply
credentials.

The short version: **storage, email and the job queue are all implemented** —
`STORAGE_DRIVER=s3`, `EMAIL_DRIVER=smtp` and `REDIS_URL` all change behaviour once
you provide the credentials below. Local development needs none of them.

---

## 1. Infrastructure (blocking — nothing else works until this is up)

PostgreSQL is required. Docker is the easy route:

```bash
docker compose up -d postgres
```

That brings up `postgres:16-alpine` with user/password/db all `civicfix`
(`docker-compose.yml:2-16`). Then create the schema and load demo data:

```bash
npm run db:generate     # regenerate the Prisma client
npm run db:migrate      # apply the baseline migration (apps/api/prisma/migrations/0001_init)
npm run db:seed         # optional: load the demo data below
```

No Docker? Either install PostgreSQL 16 yourself and point `DATABASE_URL` at it, or
let the repo run one — `npm run db:dev:up` downloads a local PostgreSQL 16 with the
same user/password/database as docker-compose.yml (`scripts/dev-postgres.mjs`).

`redis` in `docker-compose.yml:18-21` is optional — without `REDIS_URL` the job
queue uses its in-process store (see §3c).

---

## 2. Secrets you must generate (blocking)

`apps/api/src/config/env.ts:9-11` makes these three mandatory, with a 32-character
minimum on the two secrets. This checkout already has a local `.env` with freshly
generated values; generate your own if it is missing, and never reuse or share them.

```bash
# Git Bash — generate two independent values
openssl rand -base64 48
openssl rand -base64 48
```

Paste one into `JWT_ACCESS_SECRET` and the other into `JWT_REFRESH_SECRET`. They
must be different from each other. Never commit them.

Everything else in `env.ts` has a default and boots without you setting it.

---

## 3. Integrations — what is implemented and what each mode does

All four are implemented in code. Nothing here is a stub; the local modes are real
behaviour, not placeholders.

### 3a. Object storage
`apps/api/src/storage/objectStorage.ts` branches on `env.STORAGE_DRIVER`: `local`
(the default) stores under `STORAGE_LOCAL_DIR` with random names and no
caller-chosen path; `s3` selects `apps/api/src/storage/s3.ts`, which signs requests
with hand-rolled AWS SigV4 (works against S3, MinIO and R2 via `S3_ENDPOINT`).

Set `STORAGE_DRIVER=s3` plus `S3_BUCKET` (with `S3_REGION`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, and optionally `S3_ENDPOINT`) to move uploads off local
disk — required for production or any multi-instance deployment. The SigV4
implementation is pinned to the official AWS example vector in
`apps/api/tests/objectStorage.test.ts`.

### 3b. Email — including password reset
`apps/api/src/services/emailService.ts` has two real drivers: `console` (the
development default — prints the rendered message to the API log with only the host
redacted, so the token stays readable) and `smtp` (nodemailer over `SMTP_*`).
`requestPasswordReset` sends through `deliverEmail`, and registration sends the
verification mail the same way.

Reset and verification links are built from `WEB_ORIGIN` (the WEB app, never the
API) at `/reset-password` and `/verify-email`; both pages exist in
`apps/web/src/app/` and post to `POST /api/auth/reset-password` and
`POST /api/auth/verify-email`. The token is stored only as a hash
(`hashToken(token)`) — the plaintext exists exactly once, at send time.

For production set `EMAIL_DRIVER=smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS` and a real `SMTP_FROM`.

### 3c. Job queue
`apps/api/src/jobs/jobQueue.ts` implements a queue with retries and backoff, with
two stores: an in-process one (the default — no Redis needed) and a Redis-backed one
used when `REDIS_URL` is set (via `ioredis`). Handlers cover email delivery, AI
analysis and the SLA sweep (`apps/api/src/jobs/handlers.ts`, `slaSweep.ts`), and
notification fan-out plus duplicate analysis run on the queue or inline
(`complaintService.ts`, `runComplaintCreatedSideEffects`).

Run the dedicated worker with `npm run dev:worker` (it also runs the SLA sweep).
Retries and backoff are covered by `apps/api/tests/jobQueue.test.ts`.

### 3d. Map tiles
`apps/web/src/components/LocationMap.tsx` tiles straight from
`tile.openstreetmap.org`. The `MAPTILER_KEY` and `COOKIE_DOMAIN` lines that used to
sit in `.env.example` were read by no code and have been removed — there is no
MapTiler integration and no cookie-domain configuration to supply.

---

## 4. External service credentials (real, but optional today)

**AI** — `apps/api/src/ai/provider.ts:120-126` uses the real OpenAI client only when
*both* are set; otherwise it falls back to `MockProvider` (`provider.ts:22-69`),
which is keyword matching on words like "garbage", "pothole", "light", "drain",
"water".

```
AI_PROVIDER=openai
AI_API_KEY=sk-...        # from platform.openai.com
AI_MODEL=gpt-4o-mini
```

The app is designed to survive AI failure (`classifySafe`, `provider.ts:128-133`
returns `null` and complaint creation continues), so this is the lowest-risk thing
on the list.

**Geocoding** — already real. `apps/api/src/geo/geocoder.ts:24-66` calls
`nominatim.openstreetmap.org`. The OSM usage policy requires an identifying
User-Agent with a contact address, and caps you around one request per second. Set
this before you put real traffic through it:

```
GEOCODER_USER_AGENT=CivicFix/0.1 (you@example.com)
```

For production volume, swap to a paid geocoder — `createGeocoder`
(`geocoder.ts:68-71`) is the one seam to replace.

**SMTP** — only needed once you set `EMAIL_DRIVER=smtp` (see §3b). Skip for
development; `EMAIL_DRIVER=console` prints the mail to the API log.

---

## 5. Demo data you must replace before anyone real uses this

`npm run db:seed` creates four accounts sharing **`CivicFix!demo1`**
(`apps/api/prisma/seed.ts:4`). The seed prints the password at
`seed.ts:279`, and `README.md:70-79` documents all four:

| Role | Email |
|---|---|
| Admin | `admin@civicfix.demo` |
| Officer | `officer@civicfix.demo` |
| Field worker | `worker@civicfix.demo` |
| Citizen | `citizen@civicfix.demo` |

Before any real user arrives:

- Change or disable every seeded account. A shared, published password is not a
  credential.
- The jurisdiction "National Capital Territory (demo / fictional)" and area
  "Adarsh Nagar (demo ward)" carry invented bounding boxes
  (`seed.ts:98-121`). Replace them with real geometry.
- The three departments — Sanitation, Roads & Public Works, Street Lighting — are
  labelled `(demo)` (`seed.ts:15-33`).
- The officer and field team are fictional (`seed.ts:148-181`).
- The responsibility mapping (`seed.ts:203-218`) is what routes every complaint.
  This is the record that decides who is accountable, so it must be entered by
  someone with the authority to make that call. Spec §8/§9 is explicit that the
  system must never invent this.
- SLA policies are demo values (`seed.ts:220-229`) and assert no real service
  guarantee. Set them from whatever you are actually committed to.
- Complaint `CF-10291` and its two notifications (`seed.ts:231-277`) are throwaway
  demo rows.

Everything seeded is flagged `isDemo: true` or "(demo)" in its name, so it is
findable.

---

## 6. Security settings to flip before production

- `COOKIE_SECURE=true` — `apps/api/src/controllers/authController.ts:23` already
  forces this when `NODE_ENV=production`, so it is belt-and-braces, but set it.
- `WEB_ORIGIN` and `API_PUBLIC_URL` — `http://localhost:*` defaults
  (`env.ts:6-7`) must become your real HTTPS origins.
- `NODE_ENV=production`.
- `.gitignore` covers `.env`, but see §7: the repo does not exist yet, so nothing
  has been committed. Do not be the one to commit it.

---

## 7. Process work

**There is no git repository.** `git status` in the project root returns
"Not a git repository". For a project of this size that is the single biggest
process risk — there is no history, no rollback and no isolation from mistakes.

```bash
git init
git add .
git commit -m "chore: initial CivicFix import"
```

Then create a private GitHub repo and push, so `.github/workflows/ci.yml` has
something to run on. Before that first `git add`, scan what is being staged and
confirm `.env` is not in it (it is gitignored; `uploads/`, `.pgdata` and build
output are too).

`.github/workflows/ci.yml` runs lint, typecheck, tests and build in one job, plus a
second job that exports `RUN_API_INTEGRATION=1` and runs the integration suites
against a throwaway Postgres service container after `db:migrate` + `db:seed` — so
the full complaint lifecycle is exercised on every push, with no destructive reset.

---

## 8. Verification you owe

Run the local gates yourself and expect exit 0: `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`. What still needs a database and a running stack:

- The end-to-end lifecycle (citizen → officer assign → worker accept/start/complete
  → citizen verify → closed). `apps/api/tests/integration.lifecycle.test.ts`
  covers it but is gated behind `DATABASE_URL` **and** `RUN_API_INTEGRATION=1`:

  ```bash
  docker compose up -d postgres   # or: npm run db:dev:up
  npm run db:migrate
  npm run db:seed
  RUN_API_INTEGRATION=1 npm test
  ```

- Docker image builds (`docker compose --profile app up --build`).
- Anything in §3.

The manual walkthrough worth doing once the stack is up is written out at
`docs/testing.md:16-22`.

---

## Priority order

1. PostgreSQL + migrations (§1)
2. JWT secrets (§2)
3. `git init` + first commit with `.env` excluded (§7)
4. `RUN_API_INTEGRATION=1 npm test` to actually exercise the lifecycle (§8)
5. Real responsibility mappings, replacing the fictional ones (§5) — this is the
   record that decides who is accountable for a complaint
6. SMTP credentials for the password-reset email (§3b) — the flow works, but
   `EMAIL_DRIVER=console` only prints the link to the API log
7. S3 credentials (§3a) and `REDIS_URL` (§3c) before real load
8. AI key and geocoder User-Agent (§4) — lowest risk, do last
