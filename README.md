# IdeaCourt

IdeaCourt is a startup validation workbench for the moment before founders start building.

Most idea tools are too polite. They help turn a rough concept into a polished plan, even when the idea probably needs to be challenged first. IdeaCourt takes the opposite approach: it researches the market, looks for customer pain, compares alternatives, and gives the idea a verdict before generating any product plan.

If the evidence is strong, it produces the startup brief: market research, personas, PRD, revenue assumptions, GTM plan, validation steps, and UX outline. If the evidence is weak, it stops there and explains what needs to change.

## What It Does

- Turns a founder's idea into a source-backed validation dossier.
- Uses live web search instead of static sample data.
- Runs a multi-agent workflow for market research, customer insight, product, finance, growth, and UX.
- Adds an evidence gate before product planning, so weak ideas do not get dressed up as strong ones.
- Supports voice input for pitching an idea instead of typing a long prompt.
- Keeps generated work in the active session only; no browser local storage is used.

## How The Verdict Works

IdeaCourt does not always continue to product planning.

- `Build`: the idea earns the full dossier, including PRD, finance, GTM, UX, and build order.
- `Pivot`: the problem may be real, but the current angle needs to change before it is worth building.
- `Do Not Build Yet`: the evidence is too weak, crowded, low-value, or uncertain to justify a product plan.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Vercel AI SDK
- Tavily for live search
- GMI Cloud / OpenAI-compatible model APIs

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Fill in the keys you want to use:

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

Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Model Notes

The default setup uses GMI Cloud because it works well with hackathon credits and OpenAI-compatible serverless inference.

For a stronger final run, the model can be switched to Nemotron:

```env
AI_MODEL=nvidia/nemotron-3-ultra-550b-a55b
AI_MODEL_FALLBACKS=zai-org/GLM-5.2-FP8,MiniMaxAI/MiniMax-M3
```

Provider limits are real. If a model is out of quota or temporarily overloaded, the app returns a clear error instead of fabricating a result.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Architecture

- `src/app/api/startup/route.ts`: API route for dossier generation
- `src/components/startup-workbench.tsx`: interactive founder workbench
- `src/lib/startup/agents.ts`: agent orchestration and verdict gating
- `src/lib/startup/search.ts`: Tavily search client
- `src/lib/startup/schema.ts`: structured output contracts

The backend is intentionally strict. Missing keys, failed searches, invalid model output, and provider errors fail closed rather than falling back to fake data.
