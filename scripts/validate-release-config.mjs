import { readFile } from "node:fs/promises";

const configPath = new URL("../vercel.json", import.meta.url);
const raw = await readFile(configPath, "utf8");
let config;

try {
  config = JSON.parse(raw);
} catch (error) {
  console.error("vercel.json is not valid JSON", error);
  process.exit(1);
}

const deploymentEnabled = config?.git?.deploymentEnabled;
if (!deploymentEnabled || typeof deploymentEnabled !== "object" || Array.isArray(deploymentEnabled)) {
  console.error("vercel.json must define git.deploymentEnabled as an explicit branch map");
  process.exit(1);
}

const enabledBranches = Object.entries(deploymentEnabled)
  .filter(([, enabled]) => enabled === true)
  .map(([branch]) => branch)
  .sort();
const expectedBranches = ["main", "release-preview"];

if (JSON.stringify(enabledBranches) !== JSON.stringify(expectedBranches)) {
  console.error(
    `Automatic Vercel deployments must be limited to ${expectedBranches.join(", ")}; received ${enabledBranches.join(", ") || "none"}`,
  );
  process.exit(1);
}

if (Object.hasOwn(deploymentEnabled, "*")) {
  console.error("Wildcard Vercel deployment rules are not allowed");
  process.exit(1);
}

if (config.framework !== "nextjs") {
  console.error("Vercel framework must remain nextjs");
  process.exit(1);
}

if (config.buildCommand !== "npm run build" || config.installCommand !== "npm ci") {
  console.error("Vercel install/build commands differ from the controlled release contract");
  process.exit(1);
}

console.log("Release configuration is valid");
