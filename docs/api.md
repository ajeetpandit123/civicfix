# HTTP API

Base: `http://localhost:4000` or via Next rewrite `http://localhost:3000`.

JSON errors: `{ error: { code, message, details? }, requestId }`.

## Health

- `GET /health` — process up
- `GET /ready` — database ping

## Auth

- `POST /api/auth/register`
- `POST /api/auth/login` — sets `cf_refresh` httpOnly cookie; returns `{ accessToken, user }`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me` (Bearer)
- `POST /api/auth/verify-email`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

## Complaints (Bearer unless noted)

- `GET /api/complaints/public` — rounded coordinates, no PII
- `GET /api/complaints/meta/categories`
- `GET /api/complaints` — role-scoped list, pagination `page`, `pageSize`, filters `status`, `priority`, `q`, `areaId`, `assigned`, `sla`
- `POST /api/complaints` — citizen create
- `GET /api/complaints/:id` — cuid or publicId; **authorization required**
- `POST /api/complaints/:id/status`
- `POST /api/complaints/:id/assign` — officer/admin
- `POST /api/complaints/:id/comments`
- `POST /api/complaints/:id/verify` — citizen
- `POST /api/complaints/:id/reopen`
- `POST /api/complaints/:id/resolve`
- `POST /api/complaints/:id/media` — multipart `file`, `kind`
- `GET /api/complaints/:id/media/:mediaId`
- `GET /api/complaints/geocode?q=`

## Catalog

- `GET /api/departments|jurisdictions|areas`
- `GET /api/teams` — not citizens
- `GET /api/notifications`
- `POST /api/notifications/:id/read`

## Admin (`ADMIN` only)

- `/api/admin/users`
- `/api/admin/departments`
- `/api/admin/jurisdictions`
- `/api/admin/areas`
- `/api/admin/officers`
- `/api/admin/teams`
- `/api/admin/responsibility-mappings`
- `/api/admin/sla-policies`
- `/api/admin/categories`
- `/api/admin/audit-logs`
- `/api/admin/analytics`
- `/api/admin/routing-preview?lat=&lng=&categoryId=`
