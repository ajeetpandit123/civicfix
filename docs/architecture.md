# Architecture

## Shape

CivicFix is a **modular monolith**. One API process owns domain rules. The web app is a BFF-style client that proxies `/api/*` to Express so cookies stay first-party in development.

```
Citizen / Officer / Worker / Admin UI (Next.js App Router)
        |
        |  fetch /api  (rewrite)
        v
Express (helmet, CORS, rate limits, request id)
  routes → controllers → services → Prisma
        |
        +-- PostgreSQL
        +-- Object storage adapter (local | s3-shaped)
        +-- AI provider adapter (none | mock | openai)
        +-- Geocoder adapter (none | nominatim)
        +-- Email adapter (console | smtp stub)
        +-- SLA sweep (interval in API or `worker` process)
```

## Why these technologies

| Choice | Reason | Trade-off |
| --- | --- | --- |
| Express + Prisma | Explicit layers, easy authorization tests | Two local processes |
| Next.js App Router | Production UI, rewrites, TypeScript | Not a place for domain rules |
| PostgreSQL | Relational integrity for mappings, history, FKs | Needs Docker locally |
| Bounding boxes | Deterministic routing without PostGIS | Overlaps need smallest-area pick |
| JWT access + refresh cookie | API can be called without a browser store for access tokens | Refresh CSRF mitigated by SameSite + proxy |
| Mock AI | App works in CI without vendor keys | Mock is keyword-based, not a real model |

## AI pipeline

1. Minimize payload (title + truncated description; no email/phone).
2. Provider returns JSON.
3. Zod `aiClassificationSchema` validates.
4. Category codes are matched to **configured** `ComplaintCategory` rows.
5. Priority = merge(AI suggestion, rule engine). Officers can still change status later.
6. Failure → complaint still created; analysis row omitted.

AI never writes `assignedOfficerId` or invents mappings.

## Background jobs

`runSlaSweep` looks for approaching/breached deadlines and unassigned high-priority items, writes `Escalation` rows, and notifies. The API also ticks every 5 minutes. Production should run `apps/api` worker or a real queue (Redis URL is reserved).

## Notifications

In-app `Notification` rows first. Email is a console log unless SMTP is configured.

## Storage

Images are processed with Sharp (strip EXIF, cap size) then stored by key. PostgreSQL holds metadata only.
