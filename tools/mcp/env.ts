import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), ".env");

function loadLocalEnv(): void {
  let contents: string;
  try {
    contents = readFileSync(ENV_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;

    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnv();

export const MIRAGE_NODE = (process.env.MIRAGE_NODE || "https://mirage.talk").replace(/\/+$/, "");

function port(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : fallback;
}

// Loopback by default: this server has no auth and derives a wallet address, so
// it must not be reachable from the network unless someone opts in explicitly.
export const MCP_HOST = process.env.MIRAGE_MCP_HOST?.trim() || "127.0.0.1";
export const MCP_PORT = port(process.env.MIRAGE_MCP_PORT, 8787);
export const MCP_ENDPOINT = `/${(process.env.MIRAGE_MCP_ENDPOINT || "mcp").replace(/^\/+|\/+$/g, "")}`;
export const MCP_URL = `http://${MCP_HOST}:${MCP_PORT}${MCP_ENDPOINT}`;

export function getMnemonic(): string | undefined {
  const mnemonic = process.env.MIRAGE_MNEMONIC?.trim();
  return mnemonic || undefined;
}
