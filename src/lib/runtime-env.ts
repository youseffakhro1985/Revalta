export function isProductionRuntime() {
  const vercelEnv = process.env.VERCEL_ENV;
  // Vercel Preview/Development builds ship with NODE_ENV=production. Trust
  // VERCEL_ENV when it is set so Preview is not treated as the paid runtime.
  if (vercelEnv) {
    return vercelEnv === "production";
  }
  return process.env.NODE_ENV === "production";
}

export function allowIntegrationMocks() {
  if (process.env.ALLOW_INTEGRATION_MOCKS === "1") return true;
  return !isProductionRuntime();
}
