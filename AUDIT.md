# IdeaCourt Audit

Date: 2026-06-26

## Scope

Audited the full newly created project:

- Next.js app shell and UI
- Startup dossier API route
- Tavily live-search client
- AI SDK agent orchestration
- Evidence Gate and hard-gated conditional dossier behavior
- Zod output contracts
- Documentation and environment setup
- Build, type, lint, and dependency health

## Verification Run

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass |
| `GET /` local smoke test | Pass, returned `200 text/html` |
| `POST /api/startup` without `TAVILY_API_KEY` | Pass, returned explicit `400` and refused fake data |
| `POST /api/startup` with a too-short idea | Pass, returned explicit `400` before search/model calls |
| Static scan for demo/mock/simulation patterns | Pass, no generated-data fallbacks found |
| Static scan for browser local persistence | Pass, no `localStorage`, `sessionStorage`, or IndexedDB usage found |
| Static scan for legacy product naming | Pass, no previous product-name runtime or documentation naming remains |
| Static scan for committed secret patterns | Pass, only safe `.env.example` placeholder names remain |
| Feature-purpose review | Pass, visible controls and panels map to evidence gate, verdict branch, API results, or audit evidence |

## Architecture Findings

- The app is a real Next.js 16 App Router project, not a static mockup.
- The backend calls Tavily live search before any market/customer synthesis.
- The API route fails closed when live search credentials are absent.
- The orchestrator rejects sparse search context before asking the model to create research outputs.
- Every agent output is validated by Zod schemas through AI SDK structured generation.
- The Evidence Gate Agent evaluates six dimensions before any product-planning agents run.
- GMI Cloud mode uses real OpenAI-compatible serverless model calls, with `zai-org/GLM-5.2-FP8` as the default working model and configurable real-model fallbacks.
- The app can switch to `nvidia/nemotron-3-ultra-550b-a55b` for a hackathon run without changing application code.
- Direct Gemini mode uses `gemini-2.5-flash-lite` by default, disables automatic provider retries, and spaces model calls to reduce free-tier quota pressure.
- Direct Gemini mode can wait through one provider-supplied quota retry window and retry the same agent call before surfacing a `429`.
- Direct Gemini mode can retry temporary high-demand failures once, then fall through to real configured fallback models.
- Gemini quota errors are returned as `429` with a clear retry-focused message instead of a generic server failure.
- Gemini provider-capacity errors are returned as `503` if every real configured model is unavailable.
- The CEO Agent composes outputs from the relevant branch and preserves an audit trail with model, runtime, and source count.
- The UI renders branch-specific artifacts: Build receives PRD/finance/GTM/UX, Pivot receives pivot options, and Do Not Build Yet receives kill reasons and cheap tests.

## Anti-Simulation Review

- No hardcoded startup dossier data exists.
- No competitor/persona/finance/wireframe fixtures exist.
- No random-number or dummy-output generation exists.
- No fallback creates fake results when Tavily or model calls fail.
- Model fallback only switches to another configured real model; it does not generate canned or simulated dossier data.
- Non-Build verdicts cannot contain PRD, finance, GTM, or UX artifacts because the schema discriminates by verdict.
- The only static content is product UI copy, agent labels, prompts, schemas, and setup documentation.

## Functional Surface Review

- The idea textarea feeds the startup generation API.
- The submit button starts the real evidence-gated workflow and reflects loading state.
- The pipeline list maps to real backend stages and labels the build-only team as conditional.
- Result panels render only fields returned from validated agent output.
- Evidence Gate panels render source-backed ratings, confidence, reasoning, and assumptions.
- Source links open evidence URLs returned by the market agent.
- Audit trail entries are generated from actual agent runtime metadata.
- No UI feature is present solely as decoration, roadmap filler, or a fake affordance.

## Persistence Review

- No browser local storage, session storage, or IndexedDB usage exists.
- Generated dossiers live in active React state only.
- Future persistence should be implemented through a deliberate backend data store, not client-side local persistence.

## Security And Secrets

- Secrets are read only on the server through environment variables.
- `TAVILY_API_KEY`, GMI Cloud credentials, direct Gemini credentials, and optional AI Gateway credentials are documented in `.env.example`.
- No secret values are committed.
- The client calls only the app API route; it does not receive Tavily, Gemini, or AI Gateway keys.

## Dependency Findings

- `npm audit --omit=dev` reports 2 moderate vulnerabilities from `next` depending on `postcss <8.5.10`.
- The suggested `npm audit fix --force` would downgrade/install a breaking `next@9.3.3`, so it was not applied.
- Recommended action: update Next.js when a patched stable release is available that keeps the app on the current App Router line.

## Operational Risks

- Running a Build dossier can be expensive because it performs multiple live searches and eight structured model calls.
- Pivot and Do Not Build Yet branches are cheaper because product-planning agents are skipped.
- The API route has a 300 second max duration; very broad ideas, slow providers, or rate-limit pauses may still exceed it.
- Gemini free-tier limits can still be hit by repeated runs. This is expected real-provider behavior, not a simulated failure path.
- Backend quota retries can make an in-progress run pause for roughly a minute; this is intentional and preserves the same real workflow.
- Gemini high-demand spikes can still fail after retry and fallback. This is expected provider-capacity behavior, not an app-side simulation path.
- Tavily source quality controls the quality of market and customer synthesis.
- GMI credits and model availability are real operational constraints. Expensive models such as Nemotron should be reserved for final demo runs, while cheaper GMI models should be used for iteration.
- Local development requires Tavily plus GMI Cloud, direct Gemini, or AI Gateway credentials.

## Verdict

IdeaCourt is ready as a real MVP foundation. The core product loop is implemented, typed, built, renamed, and verified. The main remaining work is operational: run end-to-end live generations with real spend, tune latency and cost, and add backend persistence only when there is a deliberate product reason.
