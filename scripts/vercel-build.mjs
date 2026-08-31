import { spawnSync } from "node:child_process";

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    ...options,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;

  return result;
}

function run(command, args) {
  const result = execute(command, args);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Configure it for the Vercel environment before deploying.");
  process.exit(1);
}

if (!process.env.DIRECT_URL) {
  console.warn("DIRECT_URL is missing. Prisma generation will use DATABASE_URL.");
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

if (process.env.RUN_DB_MIGRATIONS === "true") {
  console.error(
    "RUN_DB_MIGRATIONS=true is forbidden for application builds. Apply production migrations only through the protected Database Release workflow.",
  );
  process.exit(1);
}

run("npx", ["prisma", "generate"]);
console.log("Database migrations are intentionally separated from the application build.");
run("npx", ["next", "build", "--webpack"]);
