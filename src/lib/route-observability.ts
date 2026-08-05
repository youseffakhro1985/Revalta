import { resolveRequestId, withRequestCorrelation } from "@/lib/request-correlation";
import { createLogger } from "@/lib/structured-logger";

function releaseContext() {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local";
  return {
    release: commitSha === "local" ? "local" : commitSha.slice(0, 7),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
  };
}

export function createRouteObservability(request: Request, route: string) {
  const requestId = resolveRequestId(request.headers);
  const startedAt = Date.now();
  const logger = createLogger({
    route,
    method: request.method,
    requestId,
    ...releaseContext(),
  });

  return {
    requestId,
    logger,
    elapsed: (context: Record<string, unknown> = {}) => ({
      ...context,
      latencyMs: Math.max(0, Date.now() - startedAt),
    }),
    correlate: <T extends Response>(response: T) => withRequestCorrelation(response, requestId) as T,
  };
}
