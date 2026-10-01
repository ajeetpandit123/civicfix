# Security

- Secrets only in environment variables
- Helmet, CORS allowlist (`WEB_ORIGIN`), JSON body limit, global and auth rate limits
- Prisma parameterized queries
- File uploads: magic-byte `file-type`, 5MB cap, Sharp re-encode
- Access tokens not in localStorage (memory + refresh cookie)
- IDOR checks on complaints and notifications (`updateMany` scoped by `userId`)
- Audit log for create/status
- Structured logs with redaction for authorization/cookie/password fields
- Public map: no names, rounded lat/lng
- AI cannot bypass RBAC or mappings

This codebase is **not** a completed third-party pentest. Treat production rollout as requiring threat modeling, secret rotation, WAF, and dependency scanning.
