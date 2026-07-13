import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["prisma", "generate"]);

if (process.env.VERCEL_ENV === "production") {
  console.log("Applying production database migrations…");
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.log("Skipping database migrations outside production.");
}

run("npx", ["next", "build", "--webpack"]);
