export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function allowIntegrationMocks() {
  if (process.env.ALLOW_INTEGRATION_MOCKS === "1") return true;
  return !isProductionRuntime();
}
