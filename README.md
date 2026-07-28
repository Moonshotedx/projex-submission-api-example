# ProjeX Submission API — fetch example

Minimal Next.js app that walks the submission flow over the public REST API
(`GET /api/v1/cohorts` → milestones/tasks → `POST …/submissions`) using plain
`fetch` in Server Actions. No SDK.

## Setup

```bash
cp .env.example .env.local
# paste PROJEX_API_KEY from Account → API keys
# for a local ProjeX app/API, set PROJEX_API_URL=http://localhost:3000

pnpm install
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001).

This sample UI runs on `localhost:3001`, but `PROJEX_API_URL` should point to the
ProjeX app/API origin, which is typically `http://localhost:3000` in local
development.

The checked-in example configuration only documents `http://localhost:3000` as the
local ProjeX API origin.

## What this shows

1. **Auth** — `Authorization: Bearer pjx_live_…` (key never reaches the browser).
2. **Discovery** — live cohorts, then milestones/tasks with ready-to-use `ref`s.
3. **Submit** — `POST /milestones/{ref}/submissions` or `/tasks/{ref}/submissions`.
4. **Files** — `POST /uploads` → browser `PUT` to the presigned URL → pass `attachments[{ fileKey }]` on submit.
5. **Dry-run** — `?dryRun=true` validates the window without writing.

Core client: [`src/lib/projex-api.ts`](src/lib/projex-api.ts).

Without the UI:

```bash
export PROJEX_API_KEY=pjx_live_…
./scripts/list-cohorts.sh
```

## Curl equivalent

```bash
export PROJEX_API_URL="https://projex.xcelerator.in"
export PROJEX_API_KEY="pjx_live_…"

curl -sS "$PROJEX_API_URL/api/v1/cohorts?status=live" \
  -H "Authorization: Bearer $PROJEX_API_KEY" | jq

# then, with a ref from the milestones list:
curl -sS -X POST "$PROJEX_API_URL/api/v1/milestones/T12M3/submissions?dryRun=true" \
  -H "Authorization: Bearer $PROJEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Sprint build","submission":"https://github.com/me/proj/pull/12"}' | jq
```

## Prefer typed clients?

See the sibling repo [`projex-submission-sdk-example`](https://github.com/Moonshotedx/projex-submission-sdk-example)
which does the same flow with `@pkg-projex/sdk`.
