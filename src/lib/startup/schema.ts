import { z } from "zod";

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function evidenceText(value: unknown, keys: string[]) {
  const record = asRecord(value);

  if (!record) {
    return value;
  }

  const text = firstString(...keys.map((key) => record[key]), record.description, record.summary);
  const evidenceUrl = firstString(record.evidenceUrl, record.url);

  if (!text) {
    return value;
  }

  return evidenceUrl ? `${text} Evidence: ${evidenceUrl}` : text;
}

function normalizedConfidence(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.toLowerCase();

  if (normalized.includes("low")) {
    return "Low";
  }

  if (normalized.includes("medium")) {
    return "Medium";
  }

  if (normalized.includes("high")) {
    return "High";
  }

  return value;
}

const LooseStringSchema = z.preprocess(
  (value) => evidenceText(value, ["point", "note", "evidence", "question", "trigger", "alternative", "text"]),
  z.string(),
);

function evidenceUrlFrom(value: unknown) {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  return firstString(record.evidenceUrl, record.evidence_url, record.sourceUrl, record.source_url, record.url) ?? null;
}

function sourcesFromEvidence(value: unknown) {
  const record = asRecord(value);

  if (!record) {
    return [];
  }

  const candidates = [
    ...(Array.isArray(record.competitors) ? record.competitors : []),
    ...(Array.isArray(record.trendSignals) ? record.trendSignals : []),
    ...(Array.isArray(record.trend_signals) ? record.trend_signals : []),
    ...(Array.isArray(record.whitespace) ? record.whitespace : []),
    ...(Array.isArray(record.whitespace_opportunities) ? record.whitespace_opportunities : []),
    ...(Array.isArray(record.risks) ? record.risks : []),
  ];
  const byUrl = new Map<string, { title: string; url: string; snippet: string }>();

  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate);
    const url = evidenceUrlFrom(candidateRecord);

    if (!candidateRecord || !url || byUrl.has(url)) {
      continue;
    }

    byUrl.set(url, {
      title:
        firstString(
          candidateRecord.title,
          candidateRecord.name,
          candidateRecord.signal,
          candidateRecord.risk,
          candidateRecord.opportunity,
        ) ?? url,
      url,
      snippet:
        firstString(
          candidateRecord.notes,
          candidateRecord.summary,
          candidateRecord.positioning,
          candidateRecord.uncertainty,
          candidateRecord.status,
        ) ?? "",
    });
  }

  return [...byUrl.values()];
}

export const SourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string().default(""),
});

export const EvidenceReferenceSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return {
      title: "Evidence",
      url: null,
      summary: value,
    };
  }

  const record = asRecord(value);

  if (!record) {
    return value;
  }

  return {
    title: record.title ?? record.point ?? record.source ?? "Evidence",
    url: record.url ?? record.evidenceUrl ?? record.evidence_url ?? record.sourceUrl ?? record.source_url ?? null,
    summary: record.summary ?? record.detail ?? record.reasoning ?? record.text ?? "",
  };
}, z.object({
  title: z.string(),
  url: z.string().nullable(),
  summary: z.string(),
}));

export const AuditEntrySchema = z.object({
  agent: z.string(),
  model: z.string(),
  durationMs: z.number(),
  sourceCount: z.number(),
});

export const ViabilityVerdictSchema = z.enum(["Build", "Pivot", "Do Not Build Yet"]);
export const EvidenceRatingSchema = z.enum(["Strong", "Mixed", "Weak"]);
export const ConfidenceSchema = z.enum(["High", "Medium", "Low"]);
export const EvidenceGateDimensionNameSchema = z.enum([
  "Pain Urgency",
  "Willingness To Pay",
  "Market Pull",
  "Competitive Opening",
  "Reachable Customer",
  "MVP Feasibility",
]);

export const EvidenceDimensionEvaluationSchema = z.preprocess((value) => {
  const record = asRecord(value);

  if (!record) {
    return value;
  }

  const dimension = record.dimension ?? record.name;

  return {
    ...record,
    dimension,
    evidence: record.evidence ?? [],
    assumption: record.assumption ?? null,
    confidence: normalizedConfidence(record.confidence),
    blockingConcern:
      record.blockingConcern ??
      (record.rating === "Weak" || (dimension === "Competitive Opening" && record.rating !== "Strong")),
  };
}, z.object({
  dimension: EvidenceGateDimensionNameSchema,
  rating: EvidenceRatingSchema,
  reasoning: z.string(),
  evidence: z.array(EvidenceReferenceSchema),
  confidence: ConfidenceSchema,
  assumption: z.string().nullable(),
  blockingConcern: z.boolean(),
}));

export const EvidenceGateSchema = z.object({
  verdict: ViabilityVerdictSchema,
  verdictReasoning: z.string(),
  dimensions: z.array(EvidenceDimensionEvaluationSchema).length(6),
  strongestEvidence: z.array(z.preprocess((value) => evidenceText(value, ["point", "evidence"]), z.string())),
  biggestRisks: z.array(z.preprocess((value) => evidenceText(value, ["risk", "concern"]), z.string())),
  buildThreshold: z.string(),
});

export const CompetitorSchema = z.preprocess((value) => {
  const record = asRecord(value);

  if (!record) {
    return value;
  }

  return {
    ...record,
    url: record.url ?? record.evidenceUrl ?? record.evidence_url ?? null,
    positioning: record.positioning ?? record.description ?? "",
    targetCustomer: record.targetCustomer ?? record.customer ?? record.segment ?? "",
    pricingSignal:
      record.pricingSignal ??
      record.pricing ??
      record.price ??
      record.notes ??
      "No pricing signal found in supplied sources.",
    evidenceUrl: record.evidenceUrl ?? record.evidence_url ?? record.url ?? null,
  };
}, z.object({
  name: z.string(),
  url: z.string().nullable(),
  positioning: z.string(),
  targetCustomer: z.string(),
  pricingSignal: z.string(),
  evidenceUrl: z.string().nullable(),
}));

export const MarketResearchSchema = z.preprocess((value) => {
  const record = asRecord(value);

  if (!record) {
    return value;
  }

  return {
    ...record,
    marketProblem: record.marketProblem ?? record.market_problem ?? record.problem ?? record.honest_assessment ?? "",
    competitorSummary:
      record.competitorSummary ??
      record.competitor_summary ??
      record.competitive_summary ??
      record.honest_assessment ??
      "",
    competitors: record.competitors ?? [],
    trendSignals: record.trendSignals ?? record.trend_signals ?? [],
    whitespace: record.whitespace ?? record.whitespace_opportunities ?? [],
    risks: record.risks ?? [],
    sources: record.sources ?? sourcesFromEvidence(record),
  };
}, z.object({
  category: z.string(),
  marketProblem: z.string(),
  competitorSummary: z.string(),
  competitors: z.array(CompetitorSchema),
  trendSignals: z.array(
    z.preprocess((value) => {
      const record = asRecord(value);

      if (!record) {
        return value;
      }

      return {
        ...record,
        trend: record.trend ?? record.signal ?? "",
        whyItMatters: record.whyItMatters ?? record.reasoning ?? record.signal ?? "",
        evidenceUrl: record.evidenceUrl ?? record.evidence_url ?? record.url ?? null,
      };
    }, z.object({
      trend: z.string(),
      whyItMatters: z.string(),
      evidenceUrl: z.string().nullable(),
    })),
  ),
  whitespace: z.array(z.preprocess((value) => evidenceText(value, ["opportunity", "whitespace"]), z.string())),
  risks: z.array(z.preprocess((value) => evidenceText(value, ["risk", "concern"]), z.string())),
  sources: z.array(SourceSchema),
}));

export const CustomerPersonasSchema = z.object({
  personas: z.array(
    z.object({
      name: z.string(),
      segment: z.string(),
      pains: z.array(LooseStringSchema),
      triggers: z.array(LooseStringSchema),
      currentAlternatives: z.array(LooseStringSchema),
      willingnessToPaySignal: z.string(),
      interviewQuestions: z.array(LooseStringSchema),
    }),
  ),
  evidenceNotes: z.array(LooseStringSchema),
  sources: z.array(SourceSchema),
});

export const PrdSchema = z.object({
  productName: z.string(),
  oneLiner: z.string(),
  problemStatement: z.string(),
  primaryUser: z.string(),
  mvpFeatures: z.array(
    z.object({
      name: z.string(),
      userValue: z.string(),
      scope: z.string(),
      priority: z.enum(["P0", "P1", "P2"]),
    }),
  ),
  userStories: z.array(z.string()),
  successMetrics: z.array(z.string()),
  nonGoals: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export const FinanceSchema = z.object({
  revenueModel: z.string(),
  pricing: z.array(z.string()),
  assumptions: z.array(z.string()),
  scenarios: z.array(
    z.object({
      name: z.enum(["conservative", "base", "aggressive"]),
      customersYearOne: z.number(),
      arpaMonthly: z.number(),
      revenueYearOne: z.number(),
      grossMargin: z.number(),
      notes: z.string(),
    }),
  ),
  unitEconomics: z.array(z.string()),
  validationThresholds: z.array(z.string()),
});

export const GrowthSchema = z.object({
  icp: z.string(),
  positioning: z.string(),
  channels: z.array(z.string()),
  launchSequence: z.array(
    z.object({
      week: z.string(),
      objective: z.string(),
      actions: z.array(z.string()),
    }),
  ),
  experiments: z.array(z.string()),
  partnerships: z.array(z.string()),
  riskControls: z.array(z.string()),
});

export const WireframeSchema = z.object({
  designPrinciples: z.array(z.string()),
  screens: z.array(
    z.object({
      name: z.string(),
      objective: z.string(),
      layout: z.string(),
      components: z.array(
        z.object({
          type: z.string(),
          label: z.string(),
          purpose: z.string(),
          priority: z.enum(["primary", "secondary", "supporting"]),
        }),
      ),
    }),
  ),
  onboardingFlow: z.array(z.string()),
});

export const PivotOptionSchema = z.object({
  name: z.string(),
  targetCustomer: z.string(),
  whyBetter: z.string(),
  evidenceBasis: z.string(),
  validationSteps: z.array(z.string()),
});

export const ValidationExperimentSchema = z.object({
  name: z.string(),
  objective: z.string(),
  method: z.string(),
  successSignal: z.string(),
});

const SharedDossierFields = {
  startupName: z.string(),
  thesis: z.string(),
  executiveSummary: z.string(),
  market: MarketResearchSchema,
  customers: CustomerPersonasSchema,
  evidenceGate: EvidenceGateSchema,
  auditTrail: z.array(AuditEntrySchema),
};

export const BuildSynthesisSchema = z.object({
  startupName: z.string(),
  thesis: z.string(),
  executiveSummary: z.string(),
  buildOrder: z.array(z.string()),
  twoMinutePitch: z.string(),
  validationPlan: z.array(z.string()),
});

export const PivotSynthesisSchema = z.object({
  startupName: z.string(),
  thesis: z.string(),
  executiveSummary: z.string(),
  critiqueSummary: z.string(),
  pivotOptions: z.array(PivotOptionSchema),
  validationExperiments: z.array(ValidationExperimentSchema),
  risksToResolve: z.array(z.string()),
});

export const DoNotBuildYetSynthesisSchema = z.object({
  startupName: z.string(),
  thesis: z.string(),
  executiveSummary: z.string(),
  critiqueSummary: z.string(),
  killReasons: z.array(z.string()),
  cheapTests: z.array(ValidationExperimentSchema),
  whatWouldChangeVerdict: z.array(z.string()),
});

export const BuildDossierSchema = z.object({
  verdict: z.literal("Build"),
  ...SharedDossierFields,
  buildOrder: z.array(z.string()),
  twoMinutePitch: z.string(),
  validationPlan: z.array(z.string()),
  prd: PrdSchema,
  finance: FinanceSchema,
  growth: GrowthSchema,
  wireframe: WireframeSchema,
});

export const PivotDossierSchema = z.object({
  verdict: z.literal("Pivot"),
  ...SharedDossierFields,
  critiqueSummary: z.string(),
  pivotOptions: z.array(PivotOptionSchema),
  validationExperiments: z.array(ValidationExperimentSchema),
  risksToResolve: z.array(z.string()),
});

export const DoNotBuildYetDossierSchema = z.object({
  verdict: z.literal("Do Not Build Yet"),
  ...SharedDossierFields,
  critiqueSummary: z.string(),
  killReasons: z.array(z.string()),
  cheapTests: z.array(ValidationExperimentSchema),
  whatWouldChangeVerdict: z.array(z.string()),
});

export const StartupDossierSchema = z.discriminatedUnion("verdict", [
  BuildDossierSchema,
  PivotDossierSchema,
  DoNotBuildYetDossierSchema,
]);

export type Source = z.infer<typeof SourceSchema>;
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type ViabilityVerdict = z.infer<typeof ViabilityVerdictSchema>;
export type EvidenceGate = z.infer<typeof EvidenceGateSchema>;
export type StartupDossier = z.infer<typeof StartupDossierSchema>;
