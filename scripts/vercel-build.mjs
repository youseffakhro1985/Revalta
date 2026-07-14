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

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function runMigrationWithRetry() {
  const transientPatterns = [
    /P1001/i,
    /P1002/i,
    /connection.*(?:closed|refused|reset|timeout|timed out)/i,
    /server closed the connection unexpectedly/i,
    /too many connections/i,
    /prepared statement.*already exists/i,
  ];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.log(`Applying production database migrations (attempt ${attempt}/3)…`);
    const result = execute("npx", ["prisma", "migrate", "deploy"]);
    if (result.status === 0) return;

    const diagnostics = `${result.stdout || ""}\n${result.stderr || ""}`;
    const isTransient = transientPatterns.some((pattern) => pattern.test(diagnostics));

    if (!isTransient || attempt === 3) {
      console.error("Production migration failed with a non-transient error. Deployment stopped to protect database consistency.");
      process.exit(result.status ?? 1);
    }

    const delay = attempt * 3000;
    console.warn(`Temporary database connection error detected. Retrying in ${delay / 1000} seconds…`);
    sleep(delay);
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Configure it for the Vercel environment before deploying.");
  process.exit(1);
}

if (!process.env.DIRECT_URL) {
  console.warn("DIRECT_URL is missing. Falling back to DATABASE_URL for Prisma generation and migrations.");
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

run("npx", ["prisma", "generate"]);

if (process.env.VERCEL_ENV === "production") {
  runMigrationWithRetry();
} else {
  console.log("Skipping database migrations outside production.");
}

run("npx", ["next", "build", "--webpack"]);
