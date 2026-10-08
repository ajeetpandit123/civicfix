# Authorization

Frontend role checks are UX only.

Every complaint read/write goes through `loadAuthorizedComplaint`:

| Role | Visibility |
| --- | --- |
| CITIZEN | Own complaints; public comments only |
| FIELD_WORKER | Complaints assigned to their team |
| OFFICER | Same jurisdiction **and** department as their profile |
| ADMIN | All |

`assertComplaintAccess` blocks citizen IDOR on the citizen id field; officer/worker checks add extra filters.

Status changes use `canRoleTransition` in `@civicfix/shared`. Workers cannot assign or edit mappings. Internal comments are forbidden for citizens.
