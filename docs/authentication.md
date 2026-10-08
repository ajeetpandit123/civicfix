# Authentication

- Passwords hashed with bcrypt (cost 12).
- Access token: HS256 JWT, default 15 minutes, `Authorization: Bearer`.
- Refresh token: random, SHA-256 stored, httpOnly cookie `cf_refresh` on path `/api/auth`, SameSite=Lax.
- Logout revokes the refresh row.
- Disabled users cannot authenticate.
- Registration creates `PENDING_VERIFICATION`; login is still allowed so demo/self-host can proceed. `verify-email` sets `ACTIVE`.
- Password reset: opaque token hashed at rest; all refresh tokens revoked on success.

Never put secrets in the client bundle. JWT secrets must be ≥ 32 characters (`apps/api/src/config/env.ts`).
