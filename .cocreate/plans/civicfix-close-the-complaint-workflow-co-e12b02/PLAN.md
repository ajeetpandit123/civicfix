---
plan_id: e12b02b3
status: completed
created_at: 2026-09-29T16:56:29.812947
---

# CivicFix — close the complaint-workflow correctness and security gaps

## Goal
Harden the CivicFix complaint workflow's correctness and security core: (A) close the officer-scope authorization leak in `listComplaints`; (B) make `ComplaintAssignment` a real audited lifecycle (`PENDING`→`ACCEPTED`/`DECLINED`→`COMPLETED`) driven by the existing status machine, with `acceptedAt`/`completedAt` populated; (C) role-scope every complaint response so citizens/field workers never receive `escalations`, raw AI output, internal assignment notes or internal comments; (D) validate `MediaKind` with a role→kind policy instead of a raw cast; (E) register `GET /api/complaints/:id/duplicates` behind authorization; (F) generate the missing Prisma baseline migration; (G) prove all of it with unit tests plus a gated end-to-end lifecycle integration test.

Measurable success: root `npm run typecheck`, `npm run lint` and `npm test` each exit 0; new unit tests cover the officer-scope rule, response shaping, media kind policy, the `DECLINED` transition and assignment side-effects; `apps/api/prisma/migrations/0001_init/migration.sql` exists and is non-empty; a gated integration test drives ACCEPTED→IN_PROGRESS→RESOLVED→CITIZEN_VERIFICATION→CLOSED and asserts the `ComplaintAssignment` row reaches `COMPLETED` with `acceptedAt`/`completedAt` set and that a citizen response contains no `escalations`/`rawOutput`/internal `note` keys.

## Context
## Verified current architecture

**Monorepo** — npm workspaces (`package.json:1`): `apps/api` (Express + Prisma + TS, `module: NodeNext`), `apps/web` (Next.js 14 + Tailwind + TanStack Query), `packages/shared` (Zod schemas, status machine, constants). Root scripts: `typecheck`, `lint`, `test`, `build`, `dev`.

**Layering** (`apps/api/src`): `routes/` → `controllers/` → `services/` → `lib/prisma.ts` → DB. Complaint routes are `apps/api/src/routes/complaintRoutes.ts:38-50` (registers list/create/get/patch/media/comments/assign/status/resolve/verify/reopen/geocode). Handlers: `apps/api/src/controllers/complaintController.ts:26-110`.

**Status machine** — `packages/shared/src/statusMachine.ts:3-76`, the single gate:
```
TRANSITIONS (3-16)
  REPORTED: [ROUTING_PENDING, UNDER_REVIEW, REJECTED]
  ROUTING_PENDING: [UNDER_REVIEW, REJECTED]
  UNDER_REVIEW: [ASSIGNED, REJECTED, ROUTING_PENDING]
  ASSIGNED: [ACCEPTED, ASSIGNED, UNDER_REVIEW, REJECTED]
  ACCEPTED: [IN_PROGRESS, ASSIGNED]
  IN_PROGRESS: [ON_HOLD, RESOLVED, ASSIGNED]
  ON_HOLD: [IN_PROGRESS, ASSIGNED, REJECTED]
  RESOLVED: [CITIZEN_VERIFICATION, REOPENED]
  CITIZEN_VERIFICATION: [CLOSED, REOPENED]
  CLOSED: []   REJECTED: [UNDER_REVIEW, REOPENED]   REOPENED: [UNDER_REVIEW]

ROLE_TRANSITIONS (38-65)
  FIELD_WORKER: { ASSIGNED: [ACCEPTED], ACCEPTED: [IN_PROGRESS],
                  IN_PROGRESS: [ON_HOLD, RESOLVED], ON_HOLD: [IN_PROGRESS] }
  CITIZEN:      { CITIZEN_VERIFICATION: [CLOSED, REOPENED], RESOLVED: [CLOSED, REOPENED], CLOSED: [] }
  OFFICER:      (broad; ASSIGNED: [ASSIGNED, UNDER_REVIEW, REJECTED, ACCEPTED])
  ADMIN: TRANSITIONS
```
Exports `canTransition`, `assertTransition`, `canRoleTransition(role,from,to)`, `InvalidTransitionError`, `TRANSITIONS`.

**Enums** (`apps/api/prisma/schema.prisma`):
- `MediaKind` (45-51): `EVIDENCE, BEFORE, AFTER, RESOLUTION, REOPEN`
- `AssignmentStatus` (53-59): `PENDING, ACCEPTED, DECLINED, COMPLETED, REASSIGNED`
- `EscalationLevel` (61+): `NONE, REMINDER, …`

`ComplaintAssignment` (394-410): `id, complaintId, assignedById, officerId?, teamId?, status AssignmentStatus @default(PENDING), note?, createdAt, acceptedAt?, completedAt?`.

**complaintService.ts** (`apps/api/src/services/complaintService.ts`, 639 lines) — where every change lands:
- `complaintInclude` (18-30): category, subcategory, department, jurisdiction, area, `assignedTeam`, `assignedOfficer{id,name,role}`, `citizen{id,name}`, `statusHistory` asc, `media` asc, `assignments` desc take 10
- `type Actor = { id: string; role: Role; email: string }` (32)
- `assertComplaintAccess(actor: Actor, complaint: Complaint): void` (34-39) — ADMIN passes; CITIZEN must own
- `loadAuthorizedComplaint(actor: Actor, id: string)` (41-80) — `findFirst` by `{OR:[{id},{publicId}]}, deletedAt:null`; includes `complaintInclude` + `comments` (PUBLIC-only when actor is CITIZEN) + `aiAnalyses` (3) + `duplicateCandidates{match{id,publicId,title,status}}` + `escalations` asc (54-56). Officer: throws `ForbiddenError` when no `officerProfile` (62-64), then compares `jurisdictionId`/`departmentId` (65-70). Field worker: requires `complaint.assignedTeamId === fieldWorkerProfile.teamId` (73-77).
- `toCitizenView(complaint)` (82-89) — **exported but referenced nowhere in `apps/`**; only re-wraps `citizen` to `{id,name}`, strips nothing.
- `createComplaint(env, actor, input)` (91-259) — role gate CITIZEN|ADMIN (107); `classifySafe(createAiProvider(env), {title,description,address})` (113); category resolution (119-130); `computeSystemPriority({durationDays,healthRisk,publicSafetyRisk,obstruction,categoryCode})` + `mergePriority(aiPriority, system.priority)`, final = `input.priority ?? merged` (132-142); `routeComplaint({latitude,longitude,categoryId})` (144-148); initial status `routing.kind==='mapped' ? 'UNDER_REVIEW' : 'ROUTING_PENDING'` (150-151); creates complaint + first `complaintStatusHistory` row with `fromStatus: null` (176-187); `aiAnalysis` row when classification present (189-205); `applySla(complaintId, categoryId, finalPriority)` (207); `writeAudit({action:'complaint.create', …})` (208-214); citizen `notify` (216-225); unmapped → `notifyMany` all ACTIVE admins with `type:'ROUTING_PENDING'` (227-237), mapped → `notifyMany` matching `officerProfile` userIds (239-255); `findDuplicates(complaint.id)` (257).
- `findDuplicates(complaintId: string)` (261-318) — **no actor / no authorization check**. 50 open complaints from last 30 days; score = 0.45 (dist<0.01) + 0.25 (same category) + min(0.3, `overlapScore`); threshold 0.45; top 5; persists `DuplicateCandidate` (302-310).
- `listComplaints(actor, query)` (322-392) — base `{deletedAt:null}` (343); CITIZEN→`citizenId` (344); FIELD_WORKER→`assignedTeamId = worker?.teamId ?? '__none__'` (345-348); **OFFICER→`if (profile) { jurisdictionId; departmentId }` (349-355) — silently no filter when profile is missing**; filters status/priority/categoryId/areaId/assigned/sla/q (356-371).
- `transitionStatus(actor, complaintId, to, note?)` (394-438) — `canRoleTransition` else `ValidationError` (400-404); sets `resolvedAt`/`reopenedAt`/`closedAt` (405-408); update + `complaintStatusHistory.create({fromStatus, toStatus, actorId, note})`; `writeAudit`; `notify` citizen with `type: to==='REOPENED' ? 'COMPLAINT_REOPENED' : 'STATUS_CHANGED'` (430-437). **Never touches `complaintAssignment`.**
- `assignComplaint(actor, complaintId, {officerId?, teamId?, note?})` (440-505) — OFFICER|ADMIN (445); `canRoleTransition(…,'ASSIGNED')` (447); `complaintAssignment.updateMany({where:{complaintId, status:'PENDING'}, data:{status:'REASSIGNED'}})` (451-454); creates row `status:'PENDING'` (456-465); updates complaint `assignedOfficerId`/`assignedTeamId` (467-471).
- `addComment(actor, complaintId, body, visibility: 'PUBLIC'|'INTERNAL')` (507-533) — CITIZEN cannot post INTERNAL (514) and is forced to PUBLIC (520); notifies citizen on foreign PUBLIC comment (523-531).
- `verifyResolution(actor, complaintId, resolved: boolean, reason?)` (535-546) — CITIZEN only + must own (541-543); `to = resolved ? 'CLOSED' : 'REOPENED'` → `transitionStatus` (544-545).
- `analyticsSummary()` (579-637) — global counts, `groupBy` category/priority/area, `avgResolutionHours`, `slaCompliance`.

**schemas** (`packages/shared/src/schemas.ts`): `coordinateSchema` (25-39), `createComplaintSchema` (30-41: title, description, categoryId?, subcategoryId?, priority?, latitude, longitude, address, landmark?, `attachToComplaintId?: z.string().cuid()`), `statusChangeSchema` (43-46), `assignSchema` (48-52), `commentSchema` (54-57), `verifySchema` (59-62: `resolved: boolean`, `reason?`), `aiClassificationSchema` (64+), `paginationSchema`. `constants.ts` exports `ROLES`, `PRIORITIES`, `COMPLAINT_STATUSES`.

**mediaService.ts**: `ALLOWED = new Set(['image/jpeg','image/png','image/webp'])` (10), `MAX_BYTES = 5*1024*1024` (11), `saveComplaintMedia(env, actor, complaintId, file: {buffer,originalname,size}, kind: MediaKind)` (13-50; sniffs with `fileTypeFromBuffer`, `checksum()`, `createStorage(env)`), `readMedia(env, actor, mediaId)` (52-59). Controller casts `req.body.kind as MediaKind | undefined ?? 'EVIDENCE'` (**complaintController.ts:94 — unvalidated**).

**notificationService.ts**: `notify({userId, type, title, body, complaintId?})` (6-14), `notifyMany(userIds, payload)` (16-22), `deliverEmail(env, to, subject, text)` (24-30, logs only).

**Worker UI** (`apps/web/src/app/worker/dashboard/page.tsx:12-107`): `act` mutation POSTs `/api/complaints/:id/status` `{status, note}` (33-38) — buttons `ACCEPTED` (70), `IN_PROGRESS` (71-73), `RESOLVED` (74-76); `upload` mutation POSTs FormData `{file, kind}` to `/api/complaints/:id/media` (43-48) with kinds `BEFORE`/`AFTER` (85, 97). Note is one shared textarea (15, 55), not per-task. Fetches `/api/complaints` (29).

**Web client** — `apps/web/src/lib/api.ts`: `apiFetch<T>(path, init)` with `token`. `apps/web/src/app/complaints/[id]/page.tsx` (337 lines; citizen detail + timeline + `DuplicateComplaintDialog` + `CitizenVerificationCard`), `apps/web/src/app/officer/complaints/[id]/page.tsx` (86 lines; `/api/teams` + assign + status buttons).

**Tests** (`apps/api/tests/`): `authorization.test.ts` (uses `assertComplaintAccess` + a local `complaint(citizenId)` helper), `env.test.ts`, `routing.contract.test.ts`, `integration.auth.test.ts:7` **gated** `describe.skipIf(!(process.env.DATABASE_URL && process.env.RUN_API_INTEGRATION === '1'))`. `apps/web/e2e/smoke.spec.ts` is citizen-only. Config at `apps/api/vitest.config.ts`.

**Ops** — `docker-compose.yml` (api, web, postgres, redis), `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/web/Dockerfile.standalone`, `.github/workflows/ci.yml`, `docs/` (13 docs), `README.md`, `apps/api/prisma/seed.ts` (289 lines). **`apps/api/prisma/migrations/` contains only `.gitkeep`.**

**Local env** — Node v24.18.0, npm 11.16.0, generated Prisma client present (`node_modules/.prisma/client`), `sharp` installed, `node_modules` populated. **Docker daemon NOT running** (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`), no `psql`/`pg_ctl` on PATH — Postgres is unreachable locally unless an external `DATABASE_URL` is supplied.

## Design decision for (B), and its trade-off
The status machine already encodes the worker lifecycle exactly (`ASSIGNED→ACCEPTED→IN_PROGRESS→RESOLVED`), so the assignment record update is a **side effect of `transitionStatus`** driven by one lookup table — not a parallel state machine. Trade-off: the effect is derived rather than independently settable, which is the point (it makes the assignment trail impossible to desync from the status trail). The one genuinely new verb is **decline**, because `UNDER_REVIEW` reached by an officer from `ASSIGNED` means "re-review", not "declined", so a role-independent effect table cannot express it. Decline therefore keys on `(to, from, role)`. Every other worker action reuses `POST /api/complaints/:id/status` unchanged.

## Key Files
- `packages/shared/src/statusMachine.ts`
- `packages/shared/src/schemas.ts`
- `apps/api/src/services/complaintService.ts`
- `apps/api/src/services/mediaPolicy.ts`
- `apps/api/src/services/mediaService.ts`
- `apps/api/src/controllers/complaintController.ts`
- `apps/api/src/routes/complaintRoutes.ts`
- `apps/web/src/app/worker/dashboard/page.tsx`
- `apps/api/prisma/migrations/0001_init/migration.sql`
- `apps/api/tests/assignmentEffects.test.ts`
- `apps/api/tests/responseShaping.test.ts`
- `apps/api/tests/mediaPolicy.test.ts`
- `apps/api/tests/authorization.test.ts`
- `apps/api/tests/integration.lifecycle.test.ts`
- `packages/shared/src/statusMachine.test.ts`

## Approach
## Files and exact changes

### 1. `packages/shared/src/statusMachine.ts` — add the decline path
Extend only the FIELD_WORKER entry (lines 45-50):
```ts
FIELD_WORKER: {
  ASSIGNED: ['ACCEPTED', 'UNDER_REVIEW'],   // 'UNDER_REVIEW' == declined → back to officer
  ACCEPTED: ['IN_PROGRESS'],
  IN_PROGRESS: [ON_HOLD, 'RESOLVED'],
  ON_HOLD: ['IN_PROGRESS'],
},
```
No other role changes; `canTransition`/`canRoleTransition` signatures unchanged. **Control flow:** worker POSTs `status:'UNDER_REVIEW'` from `ASSIGNED` → passes the gate → service layer classifies it as a decline and stamps `AssignmentStatus.DECLINED`.

### 2. `packages/shared/src/schemas.ts` — media kind validation
Add next to `commentSchema`:
```ts
export const MEDIA_KINDS = ['EVIDENCE', 'BEFORE', 'AFTER', 'RESOLUTION', 'REOPEN'] as const;
export const mediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKindValue = z.infer<typeof mediaKindSchema>;
```
`verifySchema` (59-62) keeps `resolved`/`reason` — no shape break (reopen evidence rides the existing media endpoint with `kind: 'REOPEN'`).

### 3. `apps/api/src/services/mediaPolicy.ts` (NEW, pure — no service/DB imports)
One place deciding who may attach which evidence kind; testable with no DB.
```ts
import type { Role } from '@civicfix/shared';

export type MediaKind = 'EVIDENCE' | 'BEFORE' | 'AFTER' | 'RESOLUTION' | 'REOPEN';

const ROLE_MEDIA_KINDS: Record<Role, readonly MediaKind[]> = {
  CITIZEN:      ['EVIDENCE', 'REOPEN'],
  FIELD_WORKER: ['BEFORE', 'AFTER', 'EVIDENCE', 'RESOLUTION'],
  OFFICER:      ['EVIDENCE', 'RESOLUTION'],
  ADMIN:        ['EVIDENCE', 'BEFORE', 'AFTER', 'RESOLUTION', 'REOPEN'],
};

export function isMediaKindAllowed(role: Role, kind: MediaKind): boolean;
export function parseMediaKind(raw: unknown): MediaKind;   // throws ValidationError on unknown
```
`parseMediaKind`: default `'EVIDENCE'` on `undefined`/`''`; reject anything outside `MEDIA_KINDS` with `ValidationError('Unsupported media kind')`. `isMediaKindAllowed` is one `includes` lookup.

**Data flow:** `POST /api/complaints/:id/media` form field `kind` → `parseMediaKind(req.body.kind)` → `isMediaKindAllowed(actor.role, kind)` → `saveComplaintMedia` → storage + `ComplaintMedia{kind, storageKey, mimeType, byteSize}`.

### 4. `apps/api/src/services/complaintService.ts` — the bulk of the work

**4a. Assignment effect table + `DECLINED` (fixes B).** Near `complaintInclude`:
```ts
type AssignmentEffect = Prisma.ComplaintAssignmentUpdateManyMutationInput;

// Dates must be resolved per call — never capture `new Date()` at module scope.
export function resolveAssignmentEffect(
  to: ComplaintStatus,
  from: ComplaintStatus,
  role: Role,
): AssignmentEffect | undefined {
  if (to === 'ACCEPTED') return { status: 'ACCEPTED', acceptedAt: new Date() };
  if (to === 'RESOLVED') return { status: 'COMPLETED', completedAt: new Date() };
  if (to === 'ASSIGNED') return { status: 'REASSIGNED' };
  if (to === 'UNDER_REVIEW' && from === 'ASSIGNED' && role === 'FIELD_WORKER') {
    return { status: 'DECLINED' };
  }
  return undefined;
}
```
In `transitionStatus`, after the `complaint.update` (405-438):
```ts
const effect = resolveAssignmentEffect(to, complaint.status, actor.role);
if (effect) {
  await prisma.complaintAssignment.updateMany({
    where: { complaintId: complaint.id, status: 'PENDING' },
    data: effect,
  });
}
```
`where: {status:'PENDING'}` matches the row `assignComplaint:456-465` creates and self-heals stale rows. **One** write path for status + assignment.

**4b. Authorization leak in `listComplaints` (fixes A).** Replace 349-355 so it mirrors `loadAuthorizedComplaint:62-64`:
```ts
if (actor.role === 'OFFICER') {
  const profile = await prisma.officerProfile.findUnique({ where: { userId: actor.id } });
  if (!profile) throw new ForbiddenError();
  where.jurisdictionId = profile.jurisdictionId;
  where.departmentId = profile.departmentId;
}
```
Extract the pure predicate for unit testing without Prisma:
```ts
export function assertListScope(
  actor: Actor,
  profile: { jurisdictionId: string; departmentId: string } | null,
): void;
```
`listComplaints` calls it; `loadAuthorizedComplaint` keeps its existing inline check (behaviour unchanged).

**4c. Role-scoped response shaping (fixes C).** Replace dead `toCitizenView` (82-89) with one output-validation boundary:
```ts
export type LoadedComplaint = Prisma.ComplaintGetPayload<{ include: typeof complaintInclude }> & {
  comments?: unknown[]; aiAnalyses?: unknown[]; duplicateCandidates?: unknown[]; escalations?: unknown[];
};

export function presentComplaint(actor: Actor, complaint: LoadedComplaint): Record<string, unknown>;
```

| Field | CITIZEN | FIELD_WORKER | OFFICER / ADMIN |
|---|---|---|---|
| `escalations` | **drop** | **drop** | keep |
| `aiAnalyses[].rawOutput`, `.inputHash` | **drop** (keep category/severity/confidence/summary/hazards) | **drop** | keep |
| `assignments[].note`, `.assignedById` | **drop** | **drop** | keep |
| `assignments[].officerId` | only for the active assignment | same | keep |
| `citizen` | `{id, name}` (self) | **drop entirely** | `{id, name}` |
| `comments` | PUBLIC only (already filtered 46-51) | PUBLIC + INTERNAL | all |
| `duplicateCandidates[].score`, `.reasons` | **drop** (keep `match.{publicId,title,status}`) | **drop** | keep |
| `assignedOfficer` | `{id, name}` **only when an active (`PENDING`/`ACCEPTED`) assignment names an officer** — spec §31 forbids implying responsibility when no verified assignment exists | same | `{id,name,role}` |
| `latitude`,`longitude`,`address`,`landmark` | keep (own report) | keep | keep |
| everything else | keep | keep | keep |

Implementation: shallow clone (`{...complaint}`) then delete/replace restricted keys — **never mutate the input**, since `transitionStatus` still needs the full record. Return a plain object so `JSON.stringify` cannot leak a forgotten relation. (Trade-off vs. a schema-rebuild: cloning is less exhaustive but cannot silently drop fields the UI needs; the delete list is the audited surface.)

**Data flow:** service returns full record → controller calls `presentComplaint(req.user!, record)` → `res.json({ complaint: presented })`.

**4d. Duplicate endpoint (fixes E).**
```ts
export async function findDuplicates(actor: Actor, complaintId: string) {
  const complaint = await loadAuthorizedComplaint(actor, complaintId);  // enforces §25 ownership
  …
}
```
Internal call at `createComplaint:257` becomes `findDuplicates(actor, complaint.id)`.

### 5. `apps/api/src/controllers/complaintController.ts`
- `upload` (88-97): replace line 94 with `const kind = parseMediaKind(req.body.kind);` then `if (!isMediaKindAllowed(req.user!.role, kind)) throw new ForbiddenError();`.
- `get` (47-50): `res.json({ complaint: presentComplaint(req.user!, complaint) })`.
- `list` (33-46): map `result.items` through `presentComplaint`.
- `create` (28-32), `status` (55-59), `assign` (60-64), `verify` (70-74), `reopen` (75-83), `resolve` (84-87): wrap each returned complaint in `presentComplaint`.
- `duplicates` (51-54): `findDuplicates(req.user!, req.params.id)`.

### 6. `apps/api/src/routes/complaintRoutes.ts`
Add near the existing `r.get('/:id', …)` (38-50): `r.get('/:id/duplicates', asyncHandler(controller.duplicates));`. Unambiguous against the existing `/:id/media/:mediaId` at line 50.

### 7. `apps/web/src/app/worker/dashboard/page.tsx`
Presentation only — all workflow rules stay server-side:
- Per-task note state replacing the shared textarea (15, 55): move it into the `<li>` keyed by `c.id`.
- Status-conditional actions replacing the always-visible four buttons (70-76): **Accept** + **Decline** at `ASSIGNED` (Decline posts `status:'UNDER_REVIEW'`), **Start work** at `ACCEPTED`, **Resume** at `ON_HOLD`, **Mark complete** at `IN_PROGRESS`.
- Gate **Mark complete** behind a successful `AFTER` upload for that task (spec §44 steps 14-15) via `uploaded: Record<complaintId, Set<kind>>` filled from `upload.onSuccess`.

### 8. `apps/api/prisma/migrations/0001_init/migration.sql` (NEW)
Generated, not hand-written:
```
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0001_init/migration.sql
```
Plus `apps/api/prisma/migrations/migration_lock.toml` with `provider = "postgresql"`, so `prisma migrate deploy` in CI is real instead of a no-op.

### 9. Tests
- `packages/shared/src/statusMachine.test.ts` — extend: `canRoleTransition('FIELD_WORKER','ASSIGNED','UNDER_REVIEW') === true`; `('FIELD_WORKER','ASSIGNED','RESOLVED') === false`; `('CITIZEN','ASSIGNED','UNDER_REVIEW') === false`.
- `apps/api/tests/assignmentEffects.test.ts` (NEW, pure) — `resolveAssignmentEffect('ACCEPTED','ASSIGNED','FIELD_WORKER')` yields `status:'ACCEPTED'` + `acceptedAt instanceof Date`; `('RESOLVED','IN_PROGRESS','FIELD_WORKER')` → `COMPLETED` + `completedAt`; `('UNDER_REVIEW','ASSIGNED','FIELD_WORKER')` → `DECLINED`; `('UNDER_REVIEW','ASSIGNED','OFFICER')` → `undefined`; `('REOPENED','CITIZEN_VERIFICATION','CITIZEN')` → `undefined`.
- `apps/api/tests/responseShaping.test.ts` (NEW, pure) — fixture `LoadedComplaint` with `escalations`, `aiAnalyses[{rawOutput, inputHash, severity}]`, `assignments[{note, assignedById}]`, `duplicateCandidates[{score, reasons, match}]`, `comments[{visibility:'INTERNAL'}]`; assert the citizen projection has no `escalations`, no `rawOutput`, no assignment `note`, no `score`/`reasons`; assert the OFFICER projection retains them; assert the FIELD_WORKER projection drops `citizen`.
- `apps/api/tests/mediaPolicy.test.ts` (NEW, pure) — `isMediaKindAllowed('CITIZEN','BEFORE') === false`, `('FIELD_WORKER','BEFORE') === true`, `('CITIZEN','REOPEN') === true`, `parseMediaKind(undefined) === 'EVIDENCE'`, `parseMediaKind('nope')` throws.
- `apps/api/tests/authorization.test.ts` — add `assertListScope` cases: officer with profile passes; officer with `null` profile throws `ForbiddenError`.
- `apps/api/tests/integration.lifecycle.test.ts` (NEW, gated `RUN_API_INTEGRATION === '1'` exactly like `integration.auth.test.ts:7`) — the §44 path: citizen creates → officer assigns → worker `ACCEPTED` → `IN_PROGRESS` → `BEFORE`/`AFTER` upload → `RESOLVED` (assert assignment row `COMPLETED` with both timestamps) → officer `CITIZEN_VERIFICATION` → citizen `verifyResolution(true)` → `CLOSED`; plus `resolve:false` → `REOPENED` → `UNDER_REVIEW`; plus assertions the citizen `GET /api/complaints/:id` body has no `escalations`, `rawOutput` or assignment `note` keys.

## End-to-end flow (decline as the worked example)
1. Worker taps **Decline** → `apiFetch('/api/complaints/:id/status', {method:'POST', body:{status:'UNDER_REVIEW', note:'…'}})`.
2. `complaintRoutes` → `complaintController.status` → `statusChangeSchema.parse` (43-46).
3. `transitionStatus(actor, id, 'UNDER_REVIEW', note)` → `canRoleTransition('FIELD_WORKER','ASSIGNED','UNDER_REVIEW')` now **true** (change 1).
4. `resolveAssignmentEffect('UNDER_REVIEW','ASSIGNED','FIELD_WORKER')` → `{status:'DECLINED'}` (4a) → `complaintAssignment.updateMany`.
5. Complaint row updated; `complaintStatusHistory{fromStatus:'ASSIGNED', toStatus:'UNDER_REVIEW', actorId, note}`; `writeAudit`; `notify` citizen.
6. `presentComplaint` strips internal fields → `res.json`.
7. Worker list re-queries `GET /api/complaints`; the officer's dashboard sees it back in `UNDER_REVIEW`.

## App still works at each step
- Changes 1+2 are additive enum/schema widening — every existing call site keeps compiling.
- 4a/4b/4d are internal to `complaintService.ts`; the wire shape changes only by 4c, and 4c is applied uniformly at the controller **in the same commit**, so no endpoint returns half-shaped data.
- Change 7 is client-side only and depends on nothing new.

## Verification
Behavior → proof

- Officer with no profile cannot over-list → `npm test` runs `authorization.test.ts` asserting `assertListScope(officer, null)` throws `ForbiddenError` (fails before the fix).
- Assignment trail is real → `npm test` runs `assignmentEffects.test.ts` asserting `ACCEPTED`→`acceptedAt`, `RESOLVED`→`COMPLETED`+`completedAt`, decline→`DECLINED`; `grep -rn 'acceptedAt\|completedAt\|AssignmentStatus' apps/` returns matches (currently zero).
- Decline is a legal worker move → `npm test` runs `statusMachine.test.ts` case `canRoleTransition('FIELD_WORKER','ASSIGNED','UNDER_REVIEW')`.
- Citizens get no internal data → `npm test` runs `responseShaping.test.ts` asserting the citizen projection omits `escalations`, `rawOutput`, assignment `note`, `score`/`reasons`.
- `MediaKind` cannot be an arbitrary string → `npm test` runs `mediaPolicy.test.ts` asserting `parseMediaKind('nope')` throws and the role→kind matrix holds.
- Duplicate lookup is authorized → `complaintService.ts` `findDuplicates` calls `loadAuthorizedComplaint(actor, …)`; `npm run typecheck` exits 0 with the new required `actor` argument at both call sites.
- Baseline migration exists → `test -s apps/api/prisma/migrations/0001_init/migration.sql` exits 0 and `npx prisma validate` exits 0.
- Nothing regressed → root `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` each exit 0 (Rule 11).
- Full §44 lifecycle (needs a reachable `DATABASE_URL` — see risk) → `RUN_API_INTEGRATION=1 npm test` runs `integration.lifecycle.test.ts` green.
- UI reflects the real state → operator check: worker dashboard shows **Decline** only at `ASSIGNED`, gates **Mark complete** behind an uploaded `AFTER` photo, and posts per-task notes independently.

**Risk:** Docker is not running and no `psql`/`pg_ctl` is on PATH, so a live `RUN_API_INTEGRATION=1` run may be impossible on this machine. Per the validation contract I will then say so explicitly and rely on the deterministic unit/contract tests above; the integration test stays in the repo, correctly gated, ready for CI where Postgres exists.

## Todos
- [524cd9f6] Widen the status machine and add media kind schemas
- [ba42746b] Add the pure media kind policy module
- [1bf3822c] Implement assignment lifecycle effects and the officer list-scope guard
- [2665e89d] Add role-scoped response shaping and replace the dead toCitizenView
- [2a45a9f2] Apply presentation at the controller boundary and authorize duplicate lookup
- [5e8850f3] Generate the Prisma baseline migration
- [236ddf2b] Upgrade the worker dashboard to the real lifecycle
- [c2fe0857] Add the gated end-to-end lifecycle integration test
- [a3286e37] Prove the full suite is green
