import type { Source } from "./schema";

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
};

type TavilyResponse = {
  results?: TavilyResult[];
};

const TAVILY_MAX_QUERY_CHARS = 400;
const DEFAULT_IDEA_QUERY_CHARS = 240;

export function compactForSearch(input: string, maxLength = DEFAULT_IDEA_QUERY_CHARS) {
  const normalized = input.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const words = normalized.split(" ");
  let compacted = "";

  for (const word of words) {
    const next = compacted ? `${compacted} ${word}` : word;

    if (next.length > maxLength - 3) {
      break;
    }

    compacted = next;
  }

  return `${compacted || normalized.slice(0, maxLength - 3)}...`;
}

export function tavilyQuery(topic: string, intent: string) {
  const suffix = intent.replace(/\s+/g, " ").trim();
  const maxTopicLength = Math.max(40, TAVILY_MAX_QUERY_CHARS - suffix.length - 1);
  const query = `${compactForSearch(topic, maxTopicLength)} ${suffix}`.trim();

  return compactForSearch(query, TAVILY_MAX_QUERY_CHARS);
}

export async function tavilySearch(query: string, maxResults = 5): Promise<Source[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  const safeQuery = compactForSearch(query, TAVILY_MAX_QUERY_CHARS);

  if (!apiKey) {
    throw new Error(
      "Missing TAVILY_API_KEY. IdeaCourt uses live web search and will not fabricate market data.",
    );
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: safeQuery,
      search_depth: "advanced",
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tavily search failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as TavilyResponse;

  return (data.results ?? [])
    .filter((result): result is Required<Pick<TavilyResult, "title" | "url">> & TavilyResult =>
      Boolean(result.title && result.url),
    )
    .map((result) => ({
      title: result.title,
      url: result.url,
      snippet: (result.content || result.raw_content || "").slice(0, 900),
    }));
}

export async function searchMany(queries: string[], maxResults = 5): Promise<Source[]> {
  const batches = await Promise.all(queries.map((query) => tavilySearch(query, maxResults)));
  const byUrl = new Map<string, Source>();

  for (const source of batches.flat()) {
    if (!byUrl.has(source.url)) {
      byUrl.set(source.url, source);
    }
  }

  return [...byUrl.values()];
}

export function formatSources(sources: Source[]): string {
  return sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title}\nURL: ${source.url}\nSnippet: ${source.snippet}`,
    )
    .join("\n\n");
}
