# Deployment

## Environments

- **Development:** `docker compose up -d postgres`, `npm run dev:api` and `dev:web`
- **Testing:** GitHub Actions service container + `prisma migrate deploy`
- **Production considerations:** managed Postgres, HTTPS, `COOKIE_SECURE=true`, long JWT secrets, `STORAGE_DRIVER=s3`, `AI_PROVIDER` as needed, run a worker process, backups of Postgres, object-storage lifecycle, no demo passwords

## Containers

`docker compose --profile app up --build` builds API and web images. Prefer running Node apps on a platform (Fly, Render, ECS) and Postgres as a managed service rather than composing everything on one VM.

## Health

Load balancers should hit `/health`; orchestrators can use `/ready` after migrations.

## Backups

Logical dump of PostgreSQL (`pg_dump`) plus object storage replication. Point-in-time recovery belongs to the database vendor.
