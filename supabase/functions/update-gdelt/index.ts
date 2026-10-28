// Stage 1 safety stop for the legacy GDELT article importer.
import { serveWithErrorReporting } from "../_shared/observability.ts";
//
// The previous version inserted unclassified GDELT articles into
// cached_news with fixed sentiment/importance and fabricated impacts.
// This replacement intentionally performs no database writes. Keeping the
// slug alive makes manual/external invocations safe while the new news
// pipeline is built and verified in shadow mode.

serveWithErrorReporting("update-gdelt", () => {
  return Response.json({
    success: true,
    disabled: true,
    updated: 0,
    message:
      "update-gdelt is disabled in Stage 1. GDELT articles are no longer written to cached_news.",
    generated_at: new Date().toISOString(),
  });
});
