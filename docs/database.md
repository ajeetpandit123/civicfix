# Database

Prisma schema: `apps/api/prisma/schema.prisma`.

## Core tables

- `users` — identity, role, status, password hash
- `refresh_tokens`, `password_resets`, `email_verifications`
- `jurisdictions`, `areas` (bounding box), `departments`
- `complaint_categories`, `complaint_subcategories`
- `officer_profiles`, `field_teams`, `field_worker_profiles`
- `responsibility_mappings` — unique `(areaId, categoryId)`
- `complaints` — publicId `CF-n`, status, coords, department vs assignment fields
- `complaint_media`, `complaint_assignments`, `complaint_status_history`, `complaint_comments`
- `notifications`, `sla_policies`, `escalations`, `audit_logs`
- `ai_analyses`, `duplicate_candidates`
- `sequences` — public complaint numbers

Soft delete: `deletedAt` on users, geo entities, complaints.

## Important indexes (and why)

| Index | Why |
| --- | --- |
| `complaints (citizenId, createdAt)` | Citizen dashboard pagination |
| `complaints (departmentId, status)` | Officer queues |
| `complaints (assignedTeamId, status)` | Worker tasks |
| `complaints (status, priority)` | Officer filters |
| `complaints (slaDeadline)` | SLA sweep |
| `complaints (latitude, longitude)` | Nearby duplicate scan |
| `notifications (userId, readAt, createdAt)` | Inbox |
| `audit_logs (entityType, entityId, createdAt)` | Entity history |
| `areas (isActive + bbox)` | Point-in-area routing |
| `responsibility_mappings (departmentId, isActive)` | Admin / routing |

## Demo data

`prisma/seed.ts` inserts fictional Delhi-demo wards and officers. `isDemo` on jurisdictions is the labeling flag.
