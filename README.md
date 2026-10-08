# CivicFix

CivicFix is a civic issue reporting and resolution platform. Citizens file complaints with photos and a map pin. Configured jurisdiction data — not an AI model — decides which **department** owns an area. Officers assign **field teams** to a specific complaint. Citizens confirm whether a “resolved” issue is actually gone.

This repository is a **modular monolith**: a Next.js UI, an Express API, PostgreSQL, and optional Redis. Demo authority records are **fictional** and labeled as such.

## Problem

Local problems (uncollected garbage, potholes, broken lights) are hard to track when reports vanish into informal channels and nobody can see status, evidence, or who is assigned. CivicFix makes that workflow explicit and auditable.

## Architecture (high level)

```
Browser (Next.js)
  → /api rewrite → Express API
      → services / repositories (Prisma)
      → PostgreSQL
      → local/S3 object storage
      → AI provider abstraction (mock / OpenAI / none)
      → in-app notifications + console/SMTP email
      → periodic SLA sweep
```

**Why this split:** the product spec asked for Express with routes → controllers → services, not business logic in React or route handlers. Next.js still owns UX and same-origin cookies via rewrites.

**Trade-off:** two processes locally instead of Next.js route handlers. That keeps authorization and domain rules in one backend you can test with Supertest.

## Features

- Email/password auth with hashed passwords, access JWT + httpOnly refresh cookie
- Roles: citizen, officer, field worker, admin (enforced on the server)
- Complaint lifecycle with a coded state machine and history
- Location stored as coordinates + address; public map uses **rounded** coordinates
- Responsibility routing: area bounding box + category → department mapping
- Assignment vs area responsibility are separate
- `ROUTING_PENDING` when no mapping exists (no invented officer)
- AI classification/priority **suggestions** with Zod validation; creation works if AI fails
- Duplicate candidates (nearby + text/category), no auto-merge
- Citizen verification / reopen
- SLA policies, escalation records, notifications
- Admin configuration and analytics
- Image upload with type/size checks and EXIF stripped via Sharp

## Tech stack

TypeScript, Next.js 15, Express 5, Prisma, PostgreSQL, Tailwind, TanStack Query, Zod, Vitest, GitHub Actions, Docker Compose.

## Local setup

Prerequisites: Node 20+, Docker (for Postgres).

```bash
cp .env.example .env
cp .env.example apps/api/.env
docker compose up -d postgres
npm install
npm run db:generate
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name init
npm run db:seed
npm run dev:api
npm run dev:web
```

Open http://localhost:3000

### Environment variables

See `.env.example`. Never commit real secrets. Required for the API: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (each ≥ 32 characters).

### Demo accounts (fictional authorities)

Password for all: `CivicFix!demo1`

| Role | Email |
| --- | --- |
| Citizen | citizen@civicfix.demo |
| Officer | officer@civicfix.demo |
| Field worker | worker@civicfix.demo |
| Admin | admin@civicfix.demo |

### Tests

```bash
npm test
npm run lint
npm run typecheck
npm run build
E2E=1 npm run test:e2e   # requires running web+api
```

### Deployment

See `docs/deployment.md`. CI on pull requests: lint, typecheck, tests, build.

## Limitations

- Bounding-box routing is simpler than true GIS/polygons (PostGIS is a future step)
- OpenAI is optional; default `AI_PROVIDER=mock`
- Local disk storage by default, not multi-instance safe
- SLA worker is in-process (`setInterval`) unless you run `npm run worker` separately
- Password reset tokens are issued but not emailed unless you configure SMTP
- Not a live government system; mappings must be entered by an admin

## Future improvements

PostGIS areas, SMS/push, S3 in production, stronger duplicate embeddings, OpenTelemetry, and a dedicated job runner with Redis.

Read more in `docs/`.
