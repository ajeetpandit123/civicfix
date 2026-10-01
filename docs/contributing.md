# Contributing

1. Small modules; domain logic in `apps/api/src/services` or `packages/shared`.
2. Do not invent real government officers. Label demo data as fictional.
3. Validate input with Zod. Validate AI with `aiClassificationSchema`.
4. Add tests for status/auth/routing changes.
5. Run `npm test && npm run typecheck && npm run lint` before opening a PR.
6. Conventional commits: `feat(area):`, `fix(area):`, `docs:`, `test:`.
