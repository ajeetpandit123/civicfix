# Manual setup checklist — CivicFix

Everything below is work a human has to do. The repo runs, but it runs on demo
values and on integrations that silently do nothing.

The short version: **three of the four "integrations" in `.env` are accepted by the
config parser and then ignored.** Setting `STORAGE_DRIVER=s3`, `EMAIL_DRIVER=smtp`
or `REDIS_URL` changes nothing in behaviour. Those are code gaps, not setup gaps.

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
npm run prisma:migrate  # apply the baseline migration (apps/api/prisma/migrations/0001_init)
npm run db:seed         # optional: load the demo data below
```

No Docker? Install PostgreSQL yourself and point `DATABASE_URL` at it.

`redis` in `docker-compose.yml:18-21` is currently decorative — see §3.

---

## 2. Secrets you must generate (blocking)

`apps/api/src/config/env.ts:9-11` makes these three mandatory, with a 32-character
minimum on the two secrets. Right now `.env` is a copy of `.env.example`, so it
contains the literal placeholder `change-me-access-secret-min-32-chars`.

```bash
# Git Bash — generate two independent values
openssl rand -base64 48
openssl rand -base64 48
```

Paste one into `JWT_ACCESS_SECRET` and the other into `JWT_REFRESH_SECRET`. They
must be different from each other. Never commit them.

Everything else in `env.ts` has a default and boots without you setting it.

---

## 3. CODE WORK — configuration alone will not fix these

This is the section that matters most. Four things look configurable and are not.

### 3a. S3 storage is not implemented
`apps/api/src/storage/objectStorage.ts:30-32`:

```ts
export function createStorage(env: Env): ObjectStorage {
  return new LocalStorage(env.STORAGE_LOCAL_DIR);
}
```

The return value does not depend on `env.STORAGE_DRIVER` at all. The `S3_*` fields
(`env.ts:17-21`) are parsed and then never read by any file.

Consequence: uploads land on local disk under `./uploads`. That is fine for one
dev box and wrong for production or for anything multi-instance.

To fix properly: implement an `S3Storage implements ObjectStorage` with `put`/`get`
against `@aws-sdk/client-s3`, and branch on `env.STORAGE_DRIVER` in `createStorage`.
Until that exists, do not set `STORAGE_DRIVER=s3` expecting it to work.

### 3b. Email is not implemented — including password reset
`apps/api/src/services/notificationService.ts:24-30` logs and returns. Both drivers.

Worse, `apps/api/src/services/authService.ts:185-197` (`requestPasswordReset`)
writes a `passwordReset` row and logs `password_reset_issued`, but never calls
`deliverEmail`. So `POST /api/auth/forgot-password` always answers `{ok: true}`
and the reset link is written nowhere a user can reach it.

Consequence: **the forgot-password flow cannot work at all today.** Anyone who
registers normally and forgets their password is stuck until an admin intervenes.

To fix properly: wire a real transport (nodemailer against `SMTP_*`) into
`deliverEmail`, and have `requestPasswordReset` send
`${API_PUBLIC_URL}/reset-password?token=...`. Note the token is stored only as a
hash (`hashToken(token)`) — the plaintext exists exactly once, at send time.

### 3c. There is no job queue
`REDIS_URL` (`env.ts:14`) is referenced nowhere in `apps/api/src`. `ioredis` is a
declared dependency (`apps/api/package.json:32`) that is never imported — it is
dead weight. `apps/api/src/worker.ts:8-16` is a `setInterval` firing `runSlaSweep()`
once a minute.

Consequences: the worker must be a separate long-lived process (`npm run worker`),
it does nothing but SLA sweeping, and AI classification plus duplicate detection
run inline in the HTTP request for `POST /api/complaints`. There is no retry and no
visibility into failures.

To fix properly: introduce a queue (BullMQ over that Redis, or a Postgres-backed
jobs table if you want one less moving part) and move notification fan-out, AI
classification and duplicate analysis onto it. If you skip this, remove `ioredis`
from `package.json` rather than shipping an unused dependency.

### 3d. `MAPTILER_KEY` and `COOKIE_DOMAIN` do not exist
They are in `.env.example:46,50` and absent from `envSchema` (`env.ts:3-38`).
`apps/web/src/components/LocationMap.tsx:41` tiles straight from
`tile.openstreetmap.org`. Setting them is harmless and pointless. Either wire up
MapTiler or delete the two lines from `.env.example` so the example stops lying.

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

**SMTP** — credentials are useless until §3b is written. Skip for now.

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
cd /c/civicfix
git init
git add .
git commit -m "chore: initial CivicFix import"
```

Then create a private GitHub repo and push, so `.github/workflows/ci.yml` has
something to run on. Before that first `git add`, scan what is being staged and
confirm `.env` is not in it.

Related: `ci.yml:42-48` runs migrate, lint, typecheck, test and build against a
Postgres service container, but never exports `RUN_API_INTEGRATION=1`, so the
integration suites are skipped in CI as well as locally. Adding that line is how
the full complaint lifecycle gets exercised on every push.

---

## 8. Verification you owe

Local gates are green today: `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`. What has **not** been proven on a machine like yours:

- The end-to-end lifecycle (citizen → officer assign → worker accept/start/complete
  → citizen verify → closed). `apps/api/tests/integration.lifecycle.test.ts`
  covers it but is gated behind `DATABASE_URL` **and** `RUN_API_INTEGRATION=1`, and
  it has never executed:

  ```bash
  docker compose up -d postgres
  npm run prisma:migrate
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
6. Password-reset email (§3b) — otherwise forgetful users are permanently stuck
7. S3 storage (§3a) and the job queue (§3c) before real load
8. AI key and geocoder User-Agent (§4) — lowest risk, do last
