import { generateText, NoObjectGeneratedError, Output } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

import {
  BuildSynthesisSchema,
  CustomerPersonasSchema,
  DoNotBuildYetSynthesisSchema,
  EvidenceGateSchema,
  FinanceSchema,
  GrowthSchema,
  MarketResearchSchema,
  PivotSynthesisSchema,
  PrdSchema,
  WireframeSchema,
  type AuditEntry,
  type EvidenceGate,
  type StartupDossier,
} from "./schema";
import { formatSources, searchMany, tavilyQuery } from "./search";

type AgentRun<T> = {
  output: T;
  audit: AuditEntry;
};

const DEFAULT_MODEL = "openai/gpt-5.5";
const DEFAULT_GOOGLE_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_GOOGLE_FALLBACK_MODELS = ["gemini-2.0-flash"];
const DEFAULT_GMI_MODEL = "zai-org/GLM-5.2-FP8";
const DEFAULT_GMI_FALLBACK_MODELS = ["MiniMaxAI/MiniMax-M3"];
const DEFAULT_GMI_BASE_URL = "https://api.gmi-serving.com/v1";
const GOOGLE_AGENT_DELAY_MS = 4500;
const PROVIDER_CAPACITY_RETRY_DELAY_MS = 8000;
const PROVIDER_QUOTA_RETRY_BUFFER_MS = 5000;
const EVIDENCE_DIMENSIONS = [
  "Pain Urgency",
  "Willingness To Pay",
  "Market Pull",
  "Competitive Opening",
  "Reachable Customer",
  "MVP Feasibility",
] as const;

function modelId() {
  return modelIds()[0];
}

function modelIds() {
  if (process.env.AI_PROVIDER === "google") {
    return uniqueModelIds([
      process.env.AI_MODEL || DEFAULT_GOOGLE_MODEL,
      ...(process.env.AI_MODEL_FALLBACKS?.split(",") ?? DEFAULT_GOOGLE_FALLBACK_MODELS),
    ]).map((id) => id.replace(/^google\//, ""));
  }

  if (process.env.AI_PROVIDER === "gmi") {
    return uniqueModelIds([
      process.env.AI_MODEL || DEFAULT_GMI_MODEL,
      ...(process.env.AI_MODEL_FALLBACKS?.split(",") ?? DEFAULT_GMI_FALLBACK_MODELS),
    ]);
  }

  return uniqueModelIds([process.env.AI_MODEL || DEFAULT_MODEL, ...(process.env.AI_MODEL_FALLBACKS?.split(",") ?? [])]);
}

function uniqueModelIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function model(modelName = modelId()) {
  if (process.env.AI_PROVIDER === "google") {
    return google(modelName);
  }

  if (process.env.AI_PROVIDER === "gmi") {
    const gmi = createOpenAICompatible({
      name: "gmi",
      apiKey: process.env.GMI_API_KEY,
      baseURL: process.env.GMI_BASE_URL || DEFAULT_GMI_BASE_URL,
    });

    return gmi(modelName);
  }

  return modelName;
}

function isGoogleProvider() {
  return process.env.AI_PROVIDER === "google";
}

function isDirectProviderWithManualRetries() {
  return process.env.AI_PROVIDER === "google" || process.env.AI_PROVIDER === "gmi";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pauseForFreeTier() {
  if (isGoogleProvider()) {
    await wait(Number(process.env.AI_AGENT_DELAY_MS || GOOGLE_AGENT_DELAY_MS));
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function extractJsonObject(text: string) {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseLooseStructuredOutput(schema: Parameters<typeof Output.object>[0]["schema"], text: string) {
  const parsed = extractJsonObject(text);

  if (!parsed || typeof schema !== "object" || schema === null || !("safeParse" in schema)) {
    return null;
  }

  const result = (schema as { safeParse: (value: unknown) => { success: boolean; data?: unknown } }).safeParse(parsed);

  return result.success ? result.data : null;
}

function schemaPrompt(schema: Parameters<typeof Output.object>[0]["schema"]) {
  try {
    if (typeof schema === "object" && schema !== null && "toJSONSchema" in schema) {
      return JSON.stringify((schema as { toJSONSchema: () => unknown }).toJSONSchema(), null, 2);
    }

    return JSON.stringify(z.toJSONSchema(schema as z.ZodTypeAny), null, 2);
  } catch {
    return "Return the exact fields required by the structured output schema.";
  }
}

export function isProviderCapacityError(error: unknown) {
  const message = errorMessage(error).toLowerCase();

  return (
    message.includes("no output generated") ||
    message.includes("empty response") ||
    message.includes("high demand") ||
    message.includes("try again later") ||
    message.includes("temporarily unavailable") ||
    message.includes("overloaded") ||
    message.includes("unavailable") ||
    message.includes("503")
  );
}

export function isProviderQuotaError(error: unknown) {
  const message = errorMessage(error).toLowerCase();

  return (
    message.includes("quota") ||
    message.includes("rate-limit") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("generate_content_free_tier_requests")
  );
}

export function providerRetryAfterSeconds(error: unknown) {
  const retryMatch = errorMessage(error).match(/retry in ([0-9.]+)s/i);

  if (!retryMatch) {
    return null;
  }

  return Math.max(1, Math.ceil(Number(retryMatch[1])));
}

function assertRuntimeCredentials() {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error(
      "Missing TAVILY_API_KEY. IdeaCourt uses live web search and will not fabricate market data.",
    );
  }

  if (isGoogleProvider()) {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error(
        "Missing GOOGLE_GENERATIVE_AI_API_KEY. IdeaCourt uses real Gemini calls and will not run simulated agents.",
      );
    }

    return;
  }

  if (process.env.AI_PROVIDER === "gmi") {
    if (!process.env.GMI_API_KEY) {
      throw new Error(
        "Missing GMI_API_KEY. IdeaCourt uses real GMI Cloud model calls and will not run simulated agents.",
      );
    }

    return;
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "Missing AI_GATEWAY_API_KEY. IdeaCourt uses real model calls and will not run simulated agents.",
    );
  }
}

async function runStructuredAgent<T>({
  agent,
  schema,
  prompt,
  sourceCount,
}: {
  agent: string;
  schema: Parameters<typeof Output.object>[0]["schema"];
  prompt: string;
  sourceCount: number;
}): Promise<AgentRun<T>> {
  const startedAt = Date.now();
  const outputSpec = Output.object({
    schema,
    name: agent.replace(/[^a-zA-Z0-9]/g, "_"),
    description: `Structured output for ${agent}.`,
  });
  const system = [
    `You are the ${agent} in IdeaCourt, a real startup validation team.`,
    "Return only data that matches the requested structured output schema.",
    "Do not invent citations, companies, prices, or facts.",
    "Only use the supplied source context and mark uncertainty in plain language.",
    "Be concise, operational, and useful to founders making real decisions.",
    "This is a real company workflow, not a demo. Weak ideas must be criticized honestly.",
  ].join("\n");

  async function attempt(structuredPrompt: string) {
    const candidates = modelIds();
    let lastCapacityError: unknown;
    let lastQuotaError: unknown;
    let lastSchemaError: unknown;

    for (const candidate of candidates) {
      try {
        if (process.env.AI_PROVIDER === "gmi") {
          const gmiPrompt = [
            structuredPrompt,
            "Required JSON schema:",
            schemaPrompt(schema),
            "Return only one JSON object that validates against this schema.",
          ].join("\n\n");
          const result = await generateText({
            model: model(candidate),
            maxRetries: 0,
            system: [
              system,
              "Return one valid JSON object only.",
              "Do not wrap the JSON in markdown fences.",
              "Do not include commentary before or after the JSON object.",
            ].join("\n"),
            prompt: gmiPrompt,
          });
          const looseOutput = parseLooseStructuredOutput(schema, result.text);

          if (!looseOutput) {
            lastSchemaError = new Error(`${candidate} returned text that did not parse as schema-valid JSON.`);
            continue;
          }

          return {
            modelId: candidate,
            result: { output: looseOutput },
          };
        }

        return {
          modelId: candidate,
          result: await generateText({
            model: model(candidate),
            output: outputSpec,
            maxRetries: isDirectProviderWithManualRetries() ? 0 : 2,
            system,
            prompt: structuredPrompt,
          }),
        };
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          const looseOutput = error.text ? parseLooseStructuredOutput(schema, error.text) : null;

          if (looseOutput) {
            return {
              modelId: candidate,
              result: { output: looseOutput },
            };
          }

          lastSchemaError = error;
          continue;
        }

        if (isProviderQuotaError(error)) {
          lastQuotaError = error;

          if (isDirectProviderWithManualRetries() && Number(process.env.AI_QUOTA_RETRIES ?? 1) > 0) {
            const retryAfter = providerRetryAfterSeconds(error);
            const retryDelayMs = retryAfter
              ? retryAfter * 1000 + PROVIDER_QUOTA_RETRY_BUFFER_MS
              : Number(process.env.AI_QUOTA_RETRY_DELAY_MS || 65000);

            await wait(retryDelayMs);

            try {
              return {
                modelId: candidate,
                result: await generateText({
                  model: model(candidate),
                  output: outputSpec,
                  maxRetries: 0,
                  system,
                  prompt: structuredPrompt,
                }),
              };
            } catch (retryError) {
              if (!isProviderQuotaError(retryError)) {
                throw retryError;
              }

              lastQuotaError = retryError;
            }
          }

          continue;
        }

        if (!isProviderCapacityError(error)) {
          throw error;
        }

        lastCapacityError = error;

        if (isDirectProviderWithManualRetries() && Number(process.env.AI_CAPACITY_RETRIES ?? 1) > 0) {
          await wait(Number(process.env.AI_CAPACITY_RETRY_DELAY_MS || PROVIDER_CAPACITY_RETRY_DELAY_MS));

          try {
            return {
              modelId: candidate,
              result: await generateText({
                model: model(candidate),
                output: outputSpec,
                maxRetries: 0,
                system,
                prompt: structuredPrompt,
              }),
            };
          } catch (retryError) {
            if (!isProviderCapacityError(retryError)) {
              throw retryError;
            }

            lastCapacityError = retryError;
          }
        }
      }
    }

    if (lastQuotaError) {
      throw lastQuotaError;
    }

    if (lastSchemaError) {
      throw lastSchemaError;
    }

    throw lastCapacityError;
  }

  let output: unknown;
  let usedModelId = modelId();

  try {
    const result = await attempt(prompt);
    output = result.result.output;
    usedModelId = result.modelId;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      const cause = error.cause instanceof Error ? error.cause.message : "unknown validation error";
      const repairPrompt = [
        "Your previous structured output failed schema validation.",
        "Repair the output so it matches the schema exactly.",
        "Preserve the factual substance from the prior attempt.",
        "Do not add fake personas, fake evidence, fake competitors, fake sources, or fake certainty just to fill arrays.",
        "If evidence is thin, return fewer items and explain the uncertainty in the allowed fields.",
        `Validation error: ${cause}`,
        "Previous model text:",
        error.text || "(no text captured)",
        "Original task:",
        prompt,
      ].join("\n\n");

      try {
        const repaired = await attempt(repairPrompt);
        output = repaired.result.output;
        usedModelId = repaired.modelId;
      } catch (repairError) {
        if (NoObjectGeneratedError.isInstance(repairError)) {
          const repairCause =
            repairError.cause instanceof Error ? repairError.cause.message : "unknown validation error";
          throw new Error(`${agent} generated output that did not match the required schema: ${repairCause}`);
        }

        throw repairError;
      }
    } else {
      throw new Error(`${agent} failed while calling the configured real model provider: ${errorMessage(error)}`);
    }
  }

  return {
    output: output as T,
    audit: {
      agent,
      model: usedModelId,
      durationMs: Date.now() - startedAt,
      sourceCount,
    },
  };
}

function assertCompleteEvidenceGate(evidenceGate: EvidenceGate) {
  const returnedDimensions = new Set(evidenceGate.dimensions.map((item) => item.dimension));
  const missing = EVIDENCE_DIMENSIONS.filter((dimension) => !returnedDimensions.has(dimension));

  if (missing.length > 0 || returnedDimensions.size !== EVIDENCE_DIMENSIONS.length) {
    throw new Error(`Evidence Gate returned incomplete dimensions: ${missing.join(", ") || "duplicate dimensions"}.`);
  }
}

export async function buildStartupDossier(idea: string): Promise<StartupDossier> {
  const cleanIdea = idea.trim();

  if (cleanIdea.length < 12) {
    throw new Error("Describe the startup idea in at least 12 characters.");
  }

  assertRuntimeCredentials();

  const [marketSources, customerSources] = await Promise.all([
    searchMany([
      tavilyQuery(cleanIdea, "market competitors startups pricing"),
      tavilyQuery(cleanIdea, "market trends 2026 adoption"),
      tavilyQuery(cleanIdea, "alternatives products reviews complaints"),
    ]),
    searchMany([
      tavilyQuery(cleanIdea, "customer pain points forum reddit reviews"),
      tavilyQuery(cleanIdea, "buyer persona willingness to pay"),
      tavilyQuery(cleanIdea, "users problems current solutions"),
    ]),
  ]);

  if (marketSources.length < 3) {
    throw new Error(
      `Live market search returned only ${marketSources.length} usable sources. Refine the idea or try again before generating a dossier.`,
    );
  }

  if (customerSources.length < 3) {
    throw new Error(
      `Live customer search returned only ${customerSources.length} usable sources. Refine the idea or try again before generating personas.`,
    );
  }

  const market = await runStructuredAgent<StartupDossier["market"]>({
    agent: "Market Research Agent",
    schema: MarketResearchSchema,
    sourceCount: marketSources.length,
    prompt: [
      `Idea brief: ${cleanIdea}`,
      "Create source-grounded market research with competitors, trend signals, whitespace, and risks.",
      "Every competitor and trend should include an evidence URL when the source context supports one.",
      "Source context:",
      formatSources(marketSources),
    ].join("\n\n"),
  });

  await pauseForFreeTier();

  const customers = await runStructuredAgent<StartupDossier["customers"]>({
    agent: "Customer Interview Agent",
    schema: CustomerPersonasSchema,
    sourceCount: customerSources.length,
    prompt: [
      `Idea brief: ${cleanIdea}`,
      "Generate target personas from public customer pain evidence, not imagined interviews.",
      "Return only evidence-backed personas. If the source context supports one clear persona, return one rather than padding with invented segments.",
      "Include interview questions founders should actually ask next.",
      "Source context:",
      formatSources(customerSources),
    ].join("\n\n"),
  });

  const researchContext = JSON.stringify(
    {
      idea: cleanIdea,
      market: market.output,
      customers: customers.output,
    },
    null,
    2,
  );

  await pauseForFreeTier();

  const evidenceGate = await runStructuredAgent<EvidenceGate>({
    agent: "Evidence Gate Agent",
    schema: EvidenceGateSchema,
    sourceCount: marketSources.length + customerSources.length,
    prompt: [
      "Evaluate whether this startup idea deserves product-planning work.",
      "Rate exactly these six Evidence Gate Dimensions once each: Pain Urgency, Willingness To Pay, Market Pull, Competitive Opening, Reachable Customer, MVP Feasibility.",
      "Each rating must be Strong, Mixed, or Weak with source-backed reasoning, confidence, and an assumption only when you infer beyond direct evidence.",
      "Verdict rules:",
      "- Build: strong pain, credible payment signal, reachable customer, and clear competitive opening.",
      "- Pivot: real pain or opportunity exists, but the current angle, customer, model, or wedge is weak.",
      "- Do Not Build Yet: pain is weak, payment signal is weak, market is too crowded without a wedge, or evidence is too thin.",
      "Do not reward polish or novelty. Be skeptical like a CEO protecting company time.",
      researchContext,
    ].join("\n\n"),
  });

  assertCompleteEvidenceGate(evidenceGate.output);
  await pauseForFreeTier();

  const gatedContext = JSON.stringify(
    {
      idea: cleanIdea,
      market: market.output,
      customers: customers.output,
      evidenceGate: evidenceGate.output,
    },
    null,
    2,
  );

  if (evidenceGate.output.verdict === "Build") {
    await pauseForFreeTier();

    const prd = await runStructuredAgent<Extract<StartupDossier, { verdict: "Build" }>["prd"]>({
      agent: "Product Manager Agent",
      schema: PrdSchema,
      sourceCount: marketSources.length + customerSources.length,
      prompt: [
        "The Evidence Gate verdict is Build. Create a production-minded MVP PRD from this founder research context.",
        "Keep scope buildable by a small founding team.",
        gatedContext,
      ].join("\n\n"),
    });

    await pauseForFreeTier();

    const finance = await runStructuredAgent<Extract<StartupDossier, { verdict: "Build" }>["finance"]>({
      agent: "Finance Agent",
      schema: FinanceSchema,
      sourceCount: marketSources.length,
      prompt: [
        "The Evidence Gate verdict is Build. Estimate a realistic first-year revenue model from this research context.",
        "Use explicit assumptions and simple arithmetic. Return monthly ARPA and year-one revenue as numbers.",
        gatedContext,
      ].join("\n\n"),
    });

    await pauseForFreeTier();

    const growth = await runStructuredAgent<Extract<StartupDossier, { verdict: "Build" }>["growth"]>({
      agent: "Growth Agent",
      schema: GrowthSchema,
      sourceCount: marketSources.length + customerSources.length,
      prompt: [
        "The Evidence Gate verdict is Build. Create a founder-executable GTM strategy from this research context.",
        "Prioritize channels that can validate demand before heavy product investment.",
        gatedContext,
      ].join("\n\n"),
    });

    await pauseForFreeTier();

    const wireframe = await runStructuredAgent<Extract<StartupDossier, { verdict: "Build" }>["wireframe"]>({
      agent: "UX Agent",
      schema: WireframeSchema,
      sourceCount: customerSources.length,
      prompt: [
        "The Evidence Gate verdict is Build. Create text wireframes for the MVP from this research context.",
        "Favor task-first flows and avoid decorative marketing pages.",
        gatedContext,
      ].join("\n\n"),
    });

    const auditTrail = [
      market.audit,
      customers.audit,
      evidenceGate.audit,
      prd.audit,
      finance.audit,
      growth.audit,
      wireframe.audit,
    ];

    await pauseForFreeTier();

    const ceo = await runStructuredAgent<
      Pick<
        Extract<StartupDossier, { verdict: "Build" }>,
        "startupName" | "thesis" | "executiveSummary" | "buildOrder" | "twoMinutePitch" | "validationPlan"
      >
    >({
      agent: "CEO Agent",
      schema: BuildSynthesisSchema,
      sourceCount: marketSources.length + customerSources.length,
      prompt: [
        "Create only the CEO synthesis fields for a Build dossier.",
        "Do not re-create market, customer, evidence gate, PRD, finance, GTM, UX, or audit trail objects.",
        "Preserve the Evidence Gate reasoning in the thesis and validation plan.",
        JSON.stringify(
          {
            idea: cleanIdea,
            verdict: "Build",
            market: market.output,
            customers: customers.output,
            evidenceGate: evidenceGate.output,
            prd: prd.output,
            finance: finance.output,
            growth: growth.output,
            wireframe: wireframe.output,
            auditTrail,
          },
          null,
          2,
        ),
      ].join("\n\n"),
    });

    return {
      verdict: "Build",
      startupName: ceo.output.startupName,
      thesis: ceo.output.thesis,
      executiveSummary: ceo.output.executiveSummary,
      buildOrder: ceo.output.buildOrder,
      twoMinutePitch: ceo.output.twoMinutePitch,
      validationPlan: ceo.output.validationPlan,
      market: market.output,
      customers: customers.output,
      evidenceGate: evidenceGate.output,
      prd: prd.output,
      finance: finance.output,
      growth: growth.output,
      wireframe: wireframe.output,
      auditTrail: [...auditTrail, ceo.audit],
    };
  }

  if (evidenceGate.output.verdict === "Pivot") {
    const auditTrail = [market.audit, customers.audit, evidenceGate.audit];
    await pauseForFreeTier();

    const ceo = await runStructuredAgent<
      Pick<
        Extract<StartupDossier, { verdict: "Pivot" }>,
        | "startupName"
        | "thesis"
        | "executiveSummary"
        | "critiqueSummary"
        | "pivotOptions"
        | "validationExperiments"
        | "risksToResolve"
      >
    >({
      agent: "CEO Agent",
      schema: PivotSynthesisSchema,
      sourceCount: marketSources.length + customerSources.length,
      prompt: [
        "Create only the CEO synthesis fields for a critique-first Pivot dossier.",
        "Do not create or re-create market, customer, evidence gate, PRD, finance plan, GTM plan, UX wireframes, or audit trail objects.",
        "Give three stronger adjacent directions and validation experiments that could earn a future Build verdict.",
        gatedContext,
      ].join("\n\n"),
    });

    return {
      verdict: "Pivot",
      startupName: ceo.output.startupName,
      thesis: ceo.output.thesis,
      executiveSummary: ceo.output.executiveSummary,
      critiqueSummary: ceo.output.critiqueSummary,
      pivotOptions: ceo.output.pivotOptions,
      validationExperiments: ceo.output.validationExperiments,
      risksToResolve: ceo.output.risksToResolve,
      market: market.output,
      customers: customers.output,
      evidenceGate: evidenceGate.output,
      auditTrail: [...auditTrail, ceo.audit],
    };
  }

  const auditTrail = [market.audit, customers.audit, evidenceGate.audit];
  await pauseForFreeTier();

  const ceo = await runStructuredAgent<
    Pick<
      Extract<StartupDossier, { verdict: "Do Not Build Yet" }>,
      | "startupName"
      | "thesis"
      | "executiveSummary"
      | "critiqueSummary"
      | "killReasons"
      | "cheapTests"
      | "whatWouldChangeVerdict"
    >
  >({
    agent: "CEO Agent",
    schema: DoNotBuildYetSynthesisSchema,
    sourceCount: marketSources.length + customerSources.length,
    prompt: [
      "Create only the CEO synthesis fields for a critique-first Do Not Build Yet dossier.",
      "Do not create or re-create market, customer, evidence gate, PRD, finance plan, GTM plan, UX wireframes, or audit trail objects.",
      "Make the stop decision useful: include kill reasons, cheap validation tests, and what evidence would change the verdict.",
      gatedContext,
    ].join("\n\n"),
  });

  return {
    verdict: "Do Not Build Yet",
    startupName: ceo.output.startupName,
    thesis: ceo.output.thesis,
    executiveSummary: ceo.output.executiveSummary,
    critiqueSummary: ceo.output.critiqueSummary,
    killReasons: ceo.output.killReasons,
    cheapTests: ceo.output.cheapTests,
    whatWouldChangeVerdict: ceo.output.whatWouldChangeVerdict,
    market: market.output,
    customers: customers.output,
    evidenceGate: evidenceGate.output,
    auditTrail: [...auditTrail, ceo.audit],
  };
}
