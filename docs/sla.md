# SLA and escalation

`SlaPolicy` rows are **demo/business configuration**, not legal government SLAs.

On create, `applySla` copies response/resolution hours onto `responseDeadline` / `slaDeadline`.

Sweep (`apps/api/src/jobs/slaSweep.ts`):

- Deadline within 24h → `REMINDER` escalation + officer notification
- Deadline missed → `SUPERVISOR` + admin notification
- High/critical still unassigned after 2 hours → officer ping

Each step writes an `escalations` row. States are recorded on `complaint.escalationLevel`.
