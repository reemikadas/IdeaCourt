# IdeaCourt

A real multi-agent startup validation workbench that puts startup ideas on trial. A founder enters an idea, and the app coordinates a team of agents to produce source-backed research, a hard viability verdict, and only the artifacts that verdict earns.

This is not a mocked demo. The backend refuses to generate a dossier unless live search and model credentials are configured.

## Product Rules

- Do not use browser local storage, session storage, or IndexedDB for product state.
- Keep state either in the active React session or in a real backend service when persistence is intentionally added.
- Every visible control, panel, metric, and feature must be connected to a real workflow, API result, or user decision.
- Do not add decorative, simulated, placeholder, or "coming soon" features.
- If a feature cannot work end to end yet, leave it out until its purpose and connection are real.

## Agent Team

- CEO Agent: coordinates team output into one startup thesis
- Market Research Agent: uses live web search for competitors, trends, whitespace, and risks
- Customer Interview Agent: turns public customer pain evidence into personas and interview scripts
- Evidence Gate Agent: rates Pain Urgency, Willingness To Pay, Market Pull, Competitive Opening, Reachable Customer, and MVP Feasibility
- Product Manager Agent: creates an MVP PRD
- Finance Agent: estimates pricing, revenue scenarios, and validation thresholds
- Growth Agent: creates GTM channels, launch sequence, and experiments
- UX Agent: produces task-first wireframes and onboarding flow

The Product Manager, Finance, Growth, and UX agents only run when the Evidence Gate returns a `Build` verdict.

## Viability Verdicts

- `Build`: generate the full conditional dossier with PRD, finance, GTM, UX, validation plan, and build order.
- `Pivot`: skip polished build artifacts and return critique, stronger adjacent directions, and validation experiments.
- `Do Not Build Yet`: skip polished build artifacts and return kill reasons, cheap tests, and what evidence could change the verdict.

## Requirements

- Node.js compatible with Next.js 16
- `TAVILY_API_KEY` for live web search
- `GMI_API_KEY` for GMI Cloud serverless Model Hub inference, or another configured model provider key

Create `.env.local`:

```bash
cp .env.example .env.local
```

Then fill in:

```env
TAVILY_API_KEY=...
AI_PROVIDER=gmi
GMI_API_KEY=...
GMI_BASE_URL=https://api.gmi-serving.com/v1
AI_MODEL=zai-org/GLM-5.2-FP8
AI_MODEL_FALLBACKS=MiniMaxAI/MiniMax-M3
AI_AGENT_DELAY_MS=1000
AI_CAPACITY_RETRIES=1
AI_CAPACITY_RETRY_DELAY_MS=5000
AI_QUOTA_RETRIES=0
```

For a final hackathon run with Nemotron, switch to:

```env
AI_MODEL=nvidia/nemotron-3-ultra-550b-a55b
AI_MODEL_FALLBACKS=zai-org/GLM-5.2-FP8,MiniMaxAI/MiniMax-M3
```

`AI_MODEL` is optional. GMI mode defaults to `zai-org/GLM-5.2-FP8`; direct Gemini mode defaults to `gemini-2.5-flash-lite`; AI Gateway mode defaults to `openai/gpt-5.5`.

Provider quota is real. The app serializes model calls and can optionally wait through provider retry windows when configured, but repeated full runs can still hit free-tier or credit limits.

Provider overload is also real. If the active model returns a temporary high-demand error, the app waits `AI_CAPACITY_RETRY_DELAY_MS`, retries once by default, and then tries the comma-separated `AI_MODEL_FALLBACKS` list. If every real model is unavailable, the API returns `503` instead of fabricating output.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build And Verify

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Architecture

- `src/app/page.tsx`: server page shell
- `src/components/startup-workbench.tsx`: interactive founder workbench
- `src/app/api/startup/route.ts`: startup dossier API route
- `src/lib/startup/search.ts`: Tavily live search client
- `src/lib/startup/schema.ts`: Zod contracts for every agent output
- `src/lib/startup/agents.ts`: multi-agent orchestration with structured AI SDK outputs and hard gating

The route is intentionally strict. Missing keys, invalid ideas, failed search calls, and schema-invalid model outputs return errors instead of fabricated fallback content.

The app currently keeps generated dossiers in active client memory only. It intentionally does not persist work locally in the browser.
