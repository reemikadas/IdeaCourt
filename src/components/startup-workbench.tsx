"use client";

import {
  AlertTriangle,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Compass,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  History,
  Loader2,
  Mic,
  MicOff,
  Play,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  XCircle,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";

import type { StartupDossier } from "@/lib/startup/schema";

type BuildDossier = Extract<StartupDossier, { verdict: "Build" }>;
type PivotDossier = Extract<StartupDossier, { verdict: "Pivot" }>;
type DoNotBuildYetDossier = Extract<StartupDossier, { verdict: "Do Not Build Yet" }>;

type ApiResponse =
  | {
      dossier: StartupDossier;
    }
  | {
      error: string;
      code?: string;
      retryAfterSeconds?: number | null;
    };

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

type SavedDossier = {
  id: string;
  name: string;
  verdict: string;
  idea: string;
  savedAt: string;
  dossier: StartupDossier;
};

const STORAGE_KEY = "ideacourt_saved";

function loadSaved(): SavedDossier[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedDossier[]) : [];
  } catch {
    return [];
  }
}

function writeSaved(items: SavedDossier[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function downloadPdf(dossier: StartupDossier) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  function checkPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 20;
    }
  }

  function heading(text: string) {
    checkPage(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(47, 111, 98);
    doc.text(text, margin, y);
    y += 9;
  }

  function subheading(text: string) {
    checkPage(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(21, 21, 21);
    doc.text(text, margin, y);
    y += 7;
  }

  function body(text: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(75, 72, 65);
    const lines = doc.splitTextToSize(text, contentWidth);
    checkPage(lines.length * 5);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 3;
  }

  function listItems(items: string[]) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(75, 72, 65);
    for (const item of items) {
      const lines = doc.splitTextToSize(item, contentWidth - 6);
      checkPage(lines.length * 5 + 2);
      doc.text("\u2022", margin, y);
      doc.text(lines, margin + 6, y);
      y += lines.length * 5 + 2;
    }
    y += 2;
  }

  function spacer(h = 6) { y += h; }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(21, 21, 21);
  doc.text(dossier.startupName, margin, y);
  y += 10;

  // Verdict badge
  doc.setFontSize(12);
  doc.setTextColor(47, 111, 98);
  doc.text(`Verdict: ${dossier.verdict}`, margin, y);
  y += 8;

  // Thesis
  body(dossier.thesis);
  spacer();

  // Executive Summary
  heading("Executive Summary");
  body(dossier.executiveSummary);
  spacer();

  // Two-minute pitch or critique
  if (dossier.verdict === "Build") {
    heading("Two-Minute Pitch");
    body(dossier.twoMinutePitch);
    spacer();
  } else {
    heading("Critique");
    body(dossier.critiqueSummary);
    spacer();
  }

  // Evidence Gate
  heading("Evidence Gate");
  body(dossier.evidenceGate.verdictReasoning);
  spacer(3);
  for (const dim of dossier.evidenceGate.dimensions) {
    subheading(`${dim.dimension} — ${dim.rating} (${dim.confidence})`);
    body(dim.reasoning);
    if (dim.assumption) {
      doc.setFont("helvetica", "italic");
      body(`Assumption: ${dim.assumption}`);
    }
  }
  spacer();

  // Market Research
  heading("Market Research");
  body(dossier.market.marketProblem);
  spacer(3);
  subheading("Competitors");
  for (const c of dossier.market.competitors) {
    checkPage(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(21, 21, 21);
    doc.text(c.name, margin, y);
    y += 5;
    body(c.positioning);
  }
  if (dossier.market.risks.length > 0) {
    subheading("Risks");
    listItems(dossier.market.risks);
  }
  spacer();

  // Customer Evidence
  heading("Customer Evidence");
  for (const p of dossier.customers.personas) {
    subheading(`${p.name} — ${p.segment}`);
    if (p.pains.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Pain points:", margin, y);
      y += 5;
      listItems(p.pains);
    }
  }
  spacer();

  // Build-specific sections
  if (dossier.verdict === "Build") {
    heading("Product PRD");
    body(dossier.prd.oneLiner);
    spacer(3);
    subheading("Problem");
    body(dossier.prd.problemStatement);
    subheading("MVP Features");
    for (const f of dossier.prd.mvpFeatures) {
      checkPage(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`${f.priority} — ${f.name}`, margin, y);
      y += 5;
      body(f.userValue);
    }
    spacer();

    heading("Finance");
    body(dossier.finance.revenueModel);
    spacer(3);
    for (const s of dossier.finance.scenarios) {
      subheading(`${s.name.charAt(0).toUpperCase() + s.name.slice(1)} Scenario`);
      body(`$${s.revenueYearOne.toLocaleString()} year one revenue, ${s.customersYearOne} customers, $${s.arpaMonthly} monthly ARPA`);
    }
    spacer();

    heading("GTM Strategy");
    body(dossier.growth.positioning);
    if (dossier.growth.channels.length > 0) {
      subheading("Channels");
      listItems(dossier.growth.channels);
    }
    spacer();

    heading("Build Order");
    listItems(dossier.buildOrder);
    spacer();

    heading("Validation Plan");
    listItems(dossier.validationPlan);
  }

  // Pivot-specific
  if (dossier.verdict === "Pivot") {
    heading("Pivot Options");
    for (const opt of dossier.pivotOptions) {
      subheading(opt.name);
      body(`Target: ${opt.targetCustomer}`);
      body(opt.whyBetter);
    }
    spacer();
    heading("Risks to Resolve");
    listItems(dossier.risksToResolve);
  }

  // Do Not Build Yet specific
  if (dossier.verdict === "Do Not Build Yet") {
    heading("Kill Reasons");
    listItems(dossier.killReasons);
    spacer();
    heading("Cheap Tests");
    for (const t of dossier.cheapTests) {
      subheading(t.name);
      body(t.objective);
      body(`Method: ${t.method}`);
      body(`Success signal: ${t.successSignal}`);
    }
    spacer();
    heading("What Would Change the Verdict");
    listItems(dossier.whatWouldChangeVerdict);
  }

  // Footer
  spacer(8);
  checkPage(10);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated by IdeaCourt on ${new Date().toLocaleDateString()}`, margin, y);

  doc.save(`${dossier.startupName.replace(/[^a-zA-Z0-9]/g, "-")}-IdeaCourt.pdf`);
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  }
}

const pipeline = [
  { name: "Market Research", icon: Search, detail: "Competitors, pricing, trends, risks" },
  { name: "Customer Evidence", icon: Users, detail: "Pain, alternatives, willingness to pay" },
  { name: "Evidence Gate", icon: ShieldCheck, detail: "Six dimensions with source-backed reasoning" },
  { name: "CEO Verdict", icon: BriefcaseBusiness, detail: "Build, Pivot, or Do Not Build Yet" },
  { name: "Build-only Team", icon: Bot, detail: "PRD, finance, growth, and UX only after Build" },
];

function voiceErrorMessage(error?: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone access is blocked. Allow microphone permission for localhost in your browser, or open this page in Chrome and try again.";
  }

  if (error === "no-speech") {
    return "No speech was detected. Try again and speak after the browser shows the microphone indicator.";
  }

  if (error === "audio-capture") {
    return "No microphone was found. Check your input device and browser permissions.";
  }

  if (error === "network") {
    return "Voice recognition could not reach the browser speech service. You can still type the pitch.";
  }

  return "Voice input stopped. You can try again or type the pitch.";
}

export function StartupWorkbench() {
  const [idea, setIdea] = useState("");
  const [dossier, setDossier] = useState<StartupDossier | null>(null);
  const [error, setError] = useState("");
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [savedDossiers, setSavedDossiers] = useState<SavedDossier[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentIdea, setCurrentIdea] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseTextRef = useRef("");

  useEffect(() => {
    setSavedDossiers(loadSaved());
  }, []);

  const saveDossier = useCallback(() => {
    if (!dossier) return;
    const entry: SavedDossier = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: dossier.startupName,
      verdict: dossier.verdict,
      idea: currentIdea,
      savedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      dossier,
    };
    const updated = [entry, ...savedDossiers];
    writeSaved(updated);
    setSavedDossiers(updated);
  }, [dossier, currentIdea, savedDossiers]);

  const deleteDossier = useCallback((id: string) => {
    const updated = savedDossiers.filter((d) => d.id !== id);
    writeSaved(updated);
    setSavedDossiers(updated);
  }, [savedDossiers]);

  const loadDossier = useCallback((saved: SavedDossier) => {
    setDossier(saved.dossier);
    setIdea(saved.idea);
    setCurrentIdea(saved.idea);
    setError("");
    setShowHistory(false);
  }, []);

  useEffect(() => {
    if (retryAfterSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setRetryAfterSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  function stopVoiceInput() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }

  function toggleVoiceInput() {
    if (isListening) {
      stopVoiceInput();
      setVoiceStatus("Pitch captured.");
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceStatus("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new Recognition();
    voiceBaseTextRef.current = idea.trim();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let spokenText = "";

      for (let index = 0; index < event.results.length; index += 1) {
        spokenText += ` ${event.results[index][0].transcript}`;
      }

      const nextIdea = [voiceBaseTextRef.current, spokenText.replace(/\s+/g, " ").trim()]
        .filter(Boolean)
        .join("\n\n");
      setIdea(nextIdea);
    };
    recognition.onerror = (event) => {
      setVoiceStatus(voiceErrorMessage(event.error));
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setError("");
      setVoiceStatus("Listening...");
      setIsListening(true);
    } catch {
      setVoiceStatus("Voice input could not start.");
      recognitionRef.current = null;
      setIsListening(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (retryAfterSeconds > 0) {
      return;
    }

    setError("");
    setRetryAfterSeconds(0);
    stopVoiceInput();
    setDossier(null);
    setCurrentIdea(idea);
    setIsRunning(true);
    setShowHistory(false);

    try {
      const response = await fetch("/api/startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || "error" in data) {
        if ("retryAfterSeconds" in data && typeof data.retryAfterSeconds === "number") {
          setRetryAfterSeconds(data.retryAfterSeconds);
        }

        throw new Error("error" in data ? data.error : "Unable to create IdeaCourt dossier.");
      }

      setDossier(data.dossier);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    } finally {
      setIsRunning(false);
    }
  }

  const totalDuration = useMemo(() => {
    if (!dossier) return 0;
    return dossier.auditTrail.reduce((sum, entry) => sum + entry.durationMs, 0);
  }, [dossier]);

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#151515]">
      <section className="border-b border-black/10 bg-[#faf9f4]">
        <div className="mx-auto grid min-h-[92vh] max-w-7xl grid-cols-1 gap-8 px-5 py-6 md:grid-cols-[minmax(320px,420px)_1fr] md:px-8 lg:px-10">
          <aside className="flex flex-col justify-between gap-8 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-[#151515] text-white">
                  <Bot size={20} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#69665e]">
                    IdeaCourt
                  </p>
                  <h1 className="text-3xl font-semibold leading-tight text-[#151515]">
                    Put the idea on trial.
                  </h1>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="idea" className="block text-sm font-semibold text-[#35332e]">
                    Idea brief
                  </label>
                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    disabled={isRunning}
                    aria-pressed={isListening}
                    title={isListening ? "Stop voice pitch" : "Start voice pitch"}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold text-[#35332e] transition hover:border-[#2f6f62] hover:text-[#2f6f62] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isListening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
                    {isListening ? "Stop pitch" : "Speak pitch"}
                  </button>
                </div>
                <textarea
                  id="idea"
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  rows={6}
                  className="w-full resize-none rounded-md border border-black/15 bg-[#fffdf7] px-4 py-3 text-base leading-7 outline-none transition focus:border-[#2f6f62] focus:ring-4 focus:ring-[#2f6f62]/15"
                  placeholder="Describe the startup idea, target user, and outcome."
                />
                {voiceStatus ? (
                  <p className="text-xs font-medium text-[#69665e]" aria-live="polite">
                    {voiceStatus}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={isRunning || retryAfterSeconds > 0}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#2f6f62] px-4 text-sm font-semibold text-white transition hover:bg-[#285f54] disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {isRunning ? (
                    <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                  ) : (
                    <Play size={18} aria-hidden="true" />
                  )}
                  {isRunning
                    ? "Running evidence gate"
                    : retryAfterSeconds > 0
                      ? `Retry available in ${retryAfterSeconds}s`
                    : "Run evidence gate"}
                </button>
              </form>

              {error ? (
                <div className="mt-5 rounded-md border border-[#b64b3a]/25 bg-[#fff0ed] p-4 text-sm leading-6 text-[#7b2d20]">
                  {error}
                  {retryAfterSeconds > 0 ? (
                    <div className="mt-3 flex items-center gap-2 font-semibold">
                      <AlertTriangle size={16} aria-hidden="true" />
                      Retry unlocks in {retryAfterSeconds}s.
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={saveDossier}
                  disabled={!dossier}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-black/15 bg-white text-sm font-semibold text-[#35332e] transition hover:border-[#2f6f62] hover:text-[#2f6f62] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save size={15} aria-hidden="true" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => dossier && downloadPdf(dossier)}
                  disabled={!dossier}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-black/15 bg-white text-sm font-semibold text-[#35332e] transition hover:border-[#2f6f62] hover:text-[#2f6f62] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={15} aria-hidden="true" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition ${showHistory ? "border-[#2f6f62] bg-[#eef5f2] text-[#2f6f62]" : "border-black/15 bg-white text-[#35332e] hover:border-[#2f6f62] hover:text-[#2f6f62]"}`}
                >
                  <History size={15} aria-hidden="true" />
                  History ({savedDossiers.length})
                </button>
              </div>
            </div>

            {showHistory ? (
              <div className="space-y-2">
                {savedDossiers.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[#69665e]">No saved results yet.</p>
                ) : (
                  savedDossiers.map((saved) => (
                    <div
                      key={saved.id}
                      className="group flex items-center gap-3 rounded-md border border-black/10 bg-[#f9f7f0] p-3 transition hover:border-[#2f6f62]/30"
                    >
                      <button
                        type="button"
                        onClick={() => loadDossier(saved)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-semibold">{saved.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <VerdictBadge verdict={saved.verdict as StartupDossier["verdict"]} />
                          <span className="text-xs text-[#69665e]">{saved.savedAt}</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDossier(saved.id)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#69665e] opacity-0 transition hover:bg-[#fff0ed] hover:text-[#7b2d20] group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
            <div className="space-y-3">
              {pipeline.map((agent) => {
                const Icon = agent.icon;
                return (
                  <div
                    key={agent.name}
                    className="grid grid-cols-[40px_1fr] gap-3 rounded-md border border-black/10 bg-[#f9f7f0] p-3"
                  >
                    <div className="flex size-9 items-center justify-center rounded-md bg-white text-[#2f6f62] shadow-sm">
                      <Icon size={18} aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{agent.name}</p>
                      <p className="text-xs leading-5 text-[#69665e]">{agent.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </aside>

          <section className="min-w-0">
            {!dossier && !isRunning ? <EmptyState /> : null}
            {isRunning ? <RunningState /> : null}
            {dossier ? <DossierView dossier={dossier} totalDuration={totalDuration} /> : null}
          </section>
        </div>
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-full items-center justify-center rounded-lg border border-dashed border-black/20 bg-white/60 p-8 text-center">
      <div className="max-w-xl">
        <Sparkles className="mx-auto text-[#c07f2d]" size={34} aria-hidden="true" />
        <h2 className="mt-4 text-2xl font-semibold">Ready for the evidence gate.</h2>
        <p className="mt-3 text-base leading-7 text-[#69665e]">
          Enter an idea and the agents will return a hard verdict before any product-planning work
          unlocks.
        </p>
      </div>
    </div>
  );
}

function RunningState() {
  return (
    <div className="grid gap-4">
      {pipeline.map((agent) => {
        const Icon = agent.icon;
        return (
          <div
            key={agent.name}
            className="flex items-center gap-4 rounded-lg border border-black/10 bg-white p-5 shadow-sm"
          >
            <div className="flex size-11 items-center justify-center rounded-md bg-[#eef5f2] text-[#2f6f62]">
              <Icon size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{agent.name}</p>
              <p className="text-sm text-[#69665e]">{agent.detail}</p>
            </div>
            <Loader2 className="animate-spin text-[#2f6f62]" size={20} aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

function DossierView({
  dossier,
  totalDuration,
}: {
  dossier: StartupDossier;
  totalDuration: number;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f6f62]">
              CEO Verdict
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-4xl font-semibold leading-tight">{dossier.startupName}</h2>
              <VerdictBadge verdict={dossier.verdict} />
            </div>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[#4b4841]">{dossier.thesis}</p>
          </div>
          <div className="grid min-w-52 grid-cols-2 gap-2 rounded-md border border-black/10 bg-[#f9f7f0] p-3 text-sm">
            <span className="text-[#69665e]">Agents</span>
            <span className="text-right font-semibold">{dossier.auditTrail.length}</span>
            <span className="text-[#69665e]">Runtime</span>
            <span className="text-right font-semibold">{Math.round(totalDuration / 1000)}s</span>
          </div>
        </div>
        <p className="mt-5 rounded-md bg-[#f4f0e5] p-4 text-sm leading-6">
          {dossier.verdict === "Build" ? dossier.twoMinutePitch : dossier.critiqueSummary}
        </p>
      </section>

      <EvidenceGatePanel dossier={dossier} />

      <Grid>
        <Panel title="Market Research" icon={Compass}>
          <p className="text-sm leading-6 text-[#4b4841]">{dossier.market.marketProblem}</p>
          <Subhead>Competitors</Subhead>
          {dossier.market.competitors.map((competitor) => (
            <div key={competitor.name} className="rounded-md border border-black/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{competitor.name}</p>
                {competitor.url ? <SourceLink href={competitor.url} /> : null}
              </div>
              <p className="mt-1 text-sm leading-6 text-[#4b4841]">{competitor.positioning}</p>
            </div>
          ))}
        </Panel>

        <Panel title="Customer Evidence" icon={Users}>
          {dossier.customers.personas.map((persona) => (
            <div key={persona.name} className="rounded-md border border-black/10 p-3">
              <p className="font-semibold">{persona.name}</p>
              <p className="text-sm text-[#69665e]">{persona.segment}</p>
              <List items={persona.pains.slice(0, 3)} />
            </div>
          ))}
        </Panel>
      </Grid>

      {dossier.verdict === "Build" ? <BuildArtifacts dossier={dossier} /> : null}
      {dossier.verdict === "Pivot" ? <PivotArtifacts dossier={dossier} /> : null}
      {dossier.verdict === "Do Not Build Yet" ? <StopArtifacts dossier={dossier} /> : null}

      <Grid>
        <Panel title="Audit Trail" icon={Bot}>
          {dossier.auditTrail.map((entry) => (
            <div key={`${entry.agent}-${entry.durationMs}`} className="rounded-md border border-black/10 p-3">
              <p className="font-semibold">{entry.agent}</p>
              <p className="text-sm text-[#4b4841]">
                {entry.model} · {Math.round(entry.durationMs / 1000)}s · {entry.sourceCount} sources
              </p>
            </div>
          ))}
        </Panel>
        <Panel title="Strongest Evidence" icon={CheckCircle2}>
          <List items={dossier.evidenceGate.strongestEvidence} />
        </Panel>
      </Grid>
    </div>
  );
}

function EvidenceGatePanel({ dossier }: { dossier: StartupDossier }) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-[#eef5f2] text-[#2f6f62]">
              <ShieldCheck size={18} aria-hidden="true" />
            </div>
            <h3 className="text-xl font-semibold">Evidence Gate</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#4b4841]">{dossier.evidenceGate.verdictReasoning}</p>
        </div>
        <VerdictBadge verdict={dossier.evidenceGate.verdict} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {dossier.evidenceGate.dimensions.map((dimension) => (
          <div key={dimension.dimension} className="rounded-md border border-black/10 bg-[#fffdf7] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{dimension.dimension}</p>
              <div className="flex gap-2">
                <RatingBadge rating={dimension.rating} />
                <span className="rounded-md border border-black/10 px-2 py-1 text-xs font-semibold text-[#69665e]">
                  {dimension.confidence}
                </span>
              </div>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#4b4841]">{dimension.reasoning}</p>
            {dimension.assumption ? (
              <p className="mt-2 rounded-md bg-[#f4f0e5] p-2 text-xs leading-5 text-[#5b574d]">
                Assumption: {dimension.assumption}
              </p>
            ) : null}
            {dimension.evidence.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {dimension.evidence.slice(0, 3).map((source) => (
                  source.url ? (
                    <a
                      key={`${dimension.dimension}-${source.url}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-8 items-center gap-2 rounded-md border border-black/10 px-2 text-xs text-[#2f6f62] transition hover:bg-[#eef5f2]"
                    >
                      <ExternalLink size={13} aria-hidden="true" />
                      Source
                    </a>
                  ) : null
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function BuildArtifacts({ dossier }: { dossier: BuildDossier }) {
  return (
    <>
      <Grid>
        <Panel title="Product PRD" icon={FileText}>
          <p className="text-sm leading-6 text-[#4b4841]">{dossier.prd.oneLiner}</p>
          <Subhead>MVP Features</Subhead>
          {dossier.prd.mvpFeatures.map((feature) => (
            <div key={feature.name} className="rounded-md bg-[#f9f7f0] p-3">
              <p className="font-semibold">
                {feature.priority} · {feature.name}
              </p>
              <p className="text-sm leading-6 text-[#4b4841]">{feature.userValue}</p>
            </div>
          ))}
        </Panel>

        <Panel title="Finance" icon={CircleDollarSign}>
          <p className="text-sm leading-6 text-[#4b4841]">{dossier.finance.revenueModel}</p>
          <div className="mt-3 grid gap-3">
            {dossier.finance.scenarios.map((scenario) => (
              <div key={scenario.name} className="rounded-md border border-black/10 p-3">
                <p className="font-semibold capitalize">{scenario.name}</p>
                <p className="text-sm text-[#4b4841]">
                  ${scenario.revenueYearOne.toLocaleString()} year one · {scenario.customersYearOne}{" "}
                  customers
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </Grid>

      <Grid>
        <Panel title="GTM Strategy" icon={BarChart3}>
          <p className="text-sm leading-6 text-[#4b4841]">{dossier.growth.positioning}</p>
          <Subhead>Launch Sequence</Subhead>
          {dossier.growth.launchSequence.map((item) => (
            <div key={`${item.week}-${item.objective}`} className="rounded-md border border-black/10 p-3">
              <p className="font-semibold">{item.week}</p>
              <p className="text-sm text-[#4b4841]">{item.objective}</p>
            </div>
          ))}
        </Panel>

        <Panel title="UX Wireframes" icon={Wand2}>
          {dossier.wireframe.screens.map((screen) => (
            <div key={screen.name} className="rounded-md border border-black/10 bg-[#fffdf7] p-3">
              <p className="font-semibold">{screen.name}</p>
              <p className="text-sm leading-6 text-[#4b4841]">{screen.objective}</p>
              <div className="mt-3 grid gap-2">
                {screen.components.slice(0, 5).map((component) => (
                  <div
                    key={`${screen.name}-${component.label}`}
                    className="flex min-h-9 items-center rounded border border-dashed border-black/20 bg-white px-3 text-xs text-[#4b4841]"
                  >
                    {component.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      </Grid>

      <Grid>
        <Panel title="Validation Plan" icon={CheckCircle2}>
          <List items={dossier.validationPlan} />
        </Panel>
        <Panel title="Build Order" icon={ClipboardList}>
          <List items={dossier.buildOrder} />
        </Panel>
      </Grid>
    </>
  );
}

function PivotArtifacts({ dossier }: { dossier: PivotDossier }) {
  return (
    <Grid>
      <Panel title="Pivot Options" icon={GitBranch}>
        {dossier.pivotOptions.map((option) => (
          <div key={option.name} className="rounded-md border border-black/10 bg-[#fffdf7] p-3">
            <p className="font-semibold">{option.name}</p>
            <p className="mt-1 text-sm text-[#69665e]">{option.targetCustomer}</p>
            <p className="mt-2 text-sm leading-6 text-[#4b4841]">{option.whyBetter}</p>
            <p className="mt-2 rounded-md bg-[#f4f0e5] p-2 text-xs leading-5 text-[#5b574d]">
              {option.evidenceBasis}
            </p>
            <List items={option.validationSteps} />
          </div>
        ))}
      </Panel>

      <Panel title="Risks To Resolve" icon={AlertTriangle}>
        <List items={dossier.risksToResolve} />
        <Subhead>Validation Experiments</Subhead>
        <ExperimentList experiments={dossier.validationExperiments} />
      </Panel>
    </Grid>
  );
}

function StopArtifacts({ dossier }: { dossier: DoNotBuildYetDossier }) {
  return (
    <Grid>
      <Panel title="Kill Reasons" icon={XCircle}>
        <List items={dossier.killReasons} />
      </Panel>

      <Panel title="Cheap Tests" icon={AlertTriangle}>
        <ExperimentList experiments={dossier.cheapTests} />
        <Subhead>What Would Change The Verdict</Subhead>
        <List items={dossier.whatWouldChangeVerdict} />
      </Panel>
    </Grid>
  );
}

function ExperimentList({
  experiments,
}: {
  experiments: Array<{ name: string; objective: string; method: string; successSignal: string }>;
}) {
  return (
    <div className="grid gap-3">
      {experiments.map((experiment) => (
        <div key={experiment.name} className="rounded-md border border-black/10 p-3">
          <p className="font-semibold">{experiment.name}</p>
          <p className="mt-1 text-sm leading-6 text-[#4b4841]">{experiment.objective}</p>
          <p className="mt-2 text-xs leading-5 text-[#69665e]">{experiment.method}</p>
          <p className="mt-2 rounded-md bg-[#f4f0e5] p-2 text-xs leading-5 text-[#5b574d]">
            Success: {experiment.successSignal}
          </p>
        </div>
      ))}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: StartupDossier["verdict"] }) {
  const className =
    verdict === "Build"
      ? "border-[#2f6f62]/25 bg-[#eef5f2] text-[#245a50]"
      : verdict === "Pivot"
        ? "border-[#c07f2d]/25 bg-[#fff6e8] text-[#815116]"
        : "border-[#b64b3a]/25 bg-[#fff0ed] text-[#7b2d20]";

  return <span className={`rounded-md border px-3 py-1 text-sm font-semibold ${className}`}>{verdict}</span>;
}

function RatingBadge({ rating }: { rating: "Strong" | "Mixed" | "Weak" }) {
  const className =
    rating === "Strong"
      ? "bg-[#eef5f2] text-[#245a50]"
      : rating === "Mixed"
        ? "bg-[#fff6e8] text-[#815116]"
        : "bg-[#fff0ed] text-[#7b2d20]";

  return <span className={`rounded-md px-2 py-1 text-xs font-semibold ${className}`}>{rating}</span>;
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 xl:grid-cols-2">{children}</div>;
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Bot;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-[#eef5f2] text-[#2f6f62]">
          <Icon size={18} aria-hidden="true" />
        </div>
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Subhead({ children }: { children: React.ReactNode }) {
  return <p className="pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#69665e]">{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-6 text-[#4b4841]">
          <CheckCircle2 className="mt-1 shrink-0 text-[#2f6f62]" size={15} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SourceLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-black/10 text-[#2f6f62] transition hover:bg-[#eef5f2]"
      aria-label="Open source"
    >
      <ExternalLink size={15} aria-hidden="true" />
    </a>
  );
}
