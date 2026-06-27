import {
  buildStartupDossier,
  isProviderCapacityError,
  isProviderQuotaError,
  providerRetryAfterSeconds,
} from "@/lib/startup/agents";

export const runtime = "nodejs";
export const maxDuration = 300;

function cleanErrorMessage(message: string) {
  return message.replace(/\u001b\[[0-9;]*m/g, "").trim();
}

function isQuotaError(message: string) {
  return isProviderQuotaError(message);
}

function retryAfterSeconds(message: string) {
  return providerRetryAfterSeconds(message);
}

function friendlyErrorMessage(message: string) {
  if (isQuotaError(message)) {
    const retryAfter = retryAfterSeconds(message);
    const retryText = retryAfter ? ` Wait about ${retryAfter} seconds and retry.` : "";

    return `The active model provider quota was hit.${retryText} The app is using real API calls, so this can happen when multiple agent calls exceed the current provider limit.`;
  }

  if (isProviderCapacityError(message)) {
    return "The active model provider did not return a usable response. The app retried and tried the configured real-model fallback, but the provider is still unavailable. Please try again in a few minutes.";
  }

  return message;
}

const NOT_A_STARTUP_PATTERNS = [
  /^(what|who|how|when|where|why|which|can you|do you|are you|is it|tell me|explain)\b/i,
  /\b(your hobby|your name|who are you|how are you|what do you do|favorite|joke|weather|hello|hi there|hey)\b/i,
];

function looksLikeStartupPitch(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return false;
  for (const pattern of NOT_A_STARTUP_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  return true;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { idea?: unknown };
    const idea = typeof body.idea === "string" ? body.idea : "";

    if (!looksLikeStartupPitch(idea)) {
      return Response.json(
        { error: "I only evaluate startup ideas. Describe a product or business you want to build and I'll put it through the evidence gate." },
        { status: 400 },
      );
    }

    const dossier = await buildStartupDossier(idea);

    return Response.json({ dossier });
  } catch (error) {
    const rawMessage = cleanErrorMessage(error instanceof Error ? error.message : "Unknown startup generation error.");
    const message = friendlyErrorMessage(rawMessage);
    const retryAfter = isQuotaError(rawMessage) ? retryAfterSeconds(rawMessage) : null;
    const status =
      message.includes("Missing ") || message.includes("at least 12") || message.includes("Unauthenticated")
        ? 400
        : isQuotaError(rawMessage)
          ? 429
        : isProviderCapacityError(rawMessage)
          ? 503
        : 500;

    return Response.json(
      {
        error: message,
        code: isQuotaError(rawMessage) ? "provider_quota" : isProviderCapacityError(rawMessage) ? "provider_capacity" : "error",
        retryAfterSeconds: retryAfter,
      },
      {
        status,
        headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
      },
    );
  }
}
