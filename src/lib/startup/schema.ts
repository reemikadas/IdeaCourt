import { z } from "zod";

export const SourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});

export const EvidenceReferenceSchema = z.object({
  title: z.string(),
  url: z.string().nullable(),
  summary: z.string(),
});

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

export const EvidenceDimensionEvaluationSchema = z.object({
  dimension: EvidenceGateDimensionNameSchema,
  rating: EvidenceRatingSchema,
  reasoning: z.string(),
  evidence: z.array(EvidenceReferenceSchema),
  confidence: ConfidenceSchema,
  assumption: z.string().nullable(),
  blockingConcern: z.boolean(),
});

export const EvidenceGateSchema = z.object({
  verdict: ViabilityVerdictSchema,
  verdictReasoning: z.string(),
  dimensions: z.array(EvidenceDimensionEvaluationSchema).length(6),
  strongestEvidence: z.array(z.string()),
  biggestRisks: z.array(z.string()),
  buildThreshold: z.string(),
});

export const CompetitorSchema = z.object({
  name: z.string(),
  url: z.string().nullable(),
  positioning: z.string(),
  targetCustomer: z.string(),
  pricingSignal: z.string(),
  evidenceUrl: z.string().nullable(),
});

export const MarketResearchSchema = z.object({
  category: z.string(),
  marketProblem: z.string(),
  competitorSummary: z.string(),
  competitors: z.array(CompetitorSchema),
  trendSignals: z.array(
    z.object({
      trend: z.string(),
      whyItMatters: z.string(),
      evidenceUrl: z.string().nullable(),
    }),
  ),
  whitespace: z.array(z.string()),
  risks: z.array(z.string()),
  sources: z.array(SourceSchema),
});

export const CustomerPersonasSchema = z.object({
  personas: z.array(
    z.object({
      name: z.string(),
      segment: z.string(),
      pains: z.array(z.string()),
      triggers: z.array(z.string()),
      currentAlternatives: z.array(z.string()),
      willingnessToPaySignal: z.string(),
      interviewQuestions: z.array(z.string()),
    }),
  ),
  evidenceNotes: z.array(z.string()),
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
