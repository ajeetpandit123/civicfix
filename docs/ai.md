# AI

Provider interface: `apps/api/src/ai/provider.ts`.

- `AI_PROVIDER=none` — classification skipped
- `mock` — deterministic keywords (garbage → waste, etc.) for demos/CI
- `openai` — JSON mode chat completions; timeouts and HTTP errors become `null`

Outputs must pass `aiClassificationSchema`. Suggested department is **advisory**. Routing uses `responsibility_mappings`.

PII: only title/description (truncated) and a location-type flag are sent. Do not send email, phone, or exact identity.

Duplicate assistance: geographic proximity + category + token overlap. Candidates are stored; merge is a citizen choice via `attachToComplaintId`, not automatic.
