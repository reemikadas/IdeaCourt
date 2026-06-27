export async function GET() {
  return Response.json({
    status: "ok",
    provider: process.env.AI_PROVIDER || "not set",
    hasApiKey: !!(process.env.GMI_MAAS_API_KEY || process.env.GMI_API_KEY),
    baseUrl: process.env.GMI_MAAS_BASE_URL || process.env.GMI_BASE_URL || "not set",
    model: process.env.AI_MODEL || "not set",
    hasTavily: !!process.env.TAVILY_API_KEY,
  });
}
