const GITHUB_DISPATCH_URL =
  "https://api.github.com/repos/Clincher1/market-pulse1/actions/workflows/426633068/dispatches";

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  const suppliedCronSecret = request.headers.get("x-cron-secret");
  if (!expectedCronSecret || !suppliedCronSecret || suppliedCronSecret !== expectedCronSecret) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const githubToken = Deno.env.get("GITHUB_ACTIONS_DISPATCH_TOKEN");
  if (!githubToken) {
    return jsonResponse(500, { error: "dispatch_not_configured" });
  }

  try {
    const githubResponse = await fetch(GITHUB_DISPATCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    });

    if (githubResponse.status !== 204) {
      // Deliberately omit response details and request headers from logs/responses.
      return jsonResponse(502, { error: "github_dispatch_failed", status: githubResponse.status });
    }

    return jsonResponse(202, { accepted: true, workflow: "update-static-snapshot", ref: "main" });
  } catch {
    // Never log the GitHub token or the Fetch exception, which may contain request metadata.
    return jsonResponse(502, { error: "github_dispatch_unreachable" });
  }
});
