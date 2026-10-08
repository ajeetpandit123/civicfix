# Testing

## Unit

- `@civicfix/shared`: status machine, priority merge, SLA windows
- API: env validation, citizen IDOR guard

## Integration

Run against Postgres after migrate/seed. Use demo users. Cover login, create complaint, forbidden GET of another citizen’s id, assign, worker accept, citizen verify.

## E2E

Playwright in `apps/web/e2e`. Skipped unless `E2E=1` and the stack is up.

Happy path to rehearse manually:

1. Citizen login → new complaint at Adarsh Nagar coords → photo → submit → see department
2. Officer login → assign demo sanitation team
3. Worker login → accept → start → after photo → complete
4. Officer → citizen verification
5. Citizen → Yes, resolved → CLOSED
