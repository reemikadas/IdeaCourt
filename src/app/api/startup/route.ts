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

    return `Gemini free-tier quota was hit.${retryText} The app is using real API calls, so this happens when multiple agent calls exceed Google's current free-tier request limit.`;
  }

  if (isProviderCapacityError(message)) {
    return "Gemini is currently overloaded. The app retried and tried the configured real-model fallback, but the provider is still unavailable. Please try again in a few minutes.";
  }

  return message;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { idea?: unknown };
    const idea = typeof body.idea === "string" ? body.idea : "";
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
