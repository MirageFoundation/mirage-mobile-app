declare const Bun: {
  spawn: (
    command: string[],
    options: { stdio: ["inherit", "inherit", "inherit"]; env: typeof process.env },
  ) => { exited: Promise<number> };
};

const branch = process.argv[2] ?? process.env.EAS_UPDATE_BRANCH;
const extraArgs = process.argv.slice(3);

if (!branch) {
  console.error("Usage: bun run update:sentry <branch> [extra eas update args]");
  console.error("Example: bun run update:sentry preview --message \"Fix inbox screen\"");
  process.exit(1);
}

const hasEnvironmentArg = extraArgs.some((arg) => arg === "--environment" || arg.startsWith("--environment="));
const environmentArgs = hasEnvironmentArg ? [] : ["--environment", branch];

async function run(command: string, args: string[]) {
  const proc = Bun.spawn([command, ...args], {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

await run("bunx", ["eas", "update", "--branch", branch, ...environmentArgs, ...extraArgs]);
await run("bunx", ["sentry-expo-upload-sourcemaps", "dist"]);
