#!/usr/bin/env bun

import { createReadStream, statSync } from "node:fs";
import { request } from "node:https";
import { basename, resolve } from "node:path";
import { once } from "node:events";

const usage = () => {
  console.error("Usage: bun scripts/diagnose-media-upload.ts <video> [duration-seconds] [height]");
  process.exit(2);
};

const inputPath = process.argv[2];
if (!inputPath) usage();

const filePath = resolve(inputPath);
const fileSize = statSync(filePath).size;
const duration = process.argv[3] ?? "1";
const height = process.argv[4] ?? "360";
const endpoint = new URL(process.env.MIRAGE_UPLOAD_URL ?? "https://mirage.talk/api/upload_media");
const boundary = `mirage-upload-${crypto.randomUUID()}`;
const startedAt = performance.now();
const stamp = () => `${((performance.now() - startedAt) / 1000).toFixed(3)}s`;
const field = (name: string, value: string) =>
  `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const preamble = Buffer.from(
  field("kind", "video") +
    field("duration", duration) +
    field("height", height) +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${basename(filePath).replaceAll('"', "")}"\r\n` +
    "Content-Type: video/mp4\r\n\r\n",
);
const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
const contentLength = preamble.length + fileSize + epilogue.length;
let uploadedBodyBytes = 0;
let lastReportedPercent = -1;
let requestBodyQueuedAt: number | undefined;

const req = request(
  {
    protocol: endpoint.protocol,
    hostname: endpoint.hostname,
    port: endpoint.port || 443,
    path: `${endpoint.pathname}${endpoint.search}`,
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(contentLength),
      Accept: "application/json",
    },
  },
  (res) => {
    const responseStartedAt = performance.now();
    const chunks: Buffer[] = [];
    res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    res.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      let responseSummary = body;
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        responseSummary = JSON.stringify({
          kind: parsed.kind,
          asset_id: parsed.asset_id,
          has_url: typeof parsed.url === "string" && parsed.url.length > 0,
          error_code: parsed.error_code,
          error: parsed.error,
        });
      } catch {}
      const completedAt = performance.now();
      console.log(`[${stamp()}] response status=${res.statusCode} total_ms=${Math.round(completedAt - startedAt)} wait_after_body_ms=${requestBodyQueuedAt ? Math.round(completedAt - requestBodyQueuedAt) : "unknown"} response_read_ms=${Math.round(completedAt - responseStartedAt)} body=${responseSummary}`);
      process.exitCode = res.statusCode && res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1;
    });
  },
);

req.setTimeout(10 * 60 * 1000, () => {
  req.destroy(new Error("Upload diagnostic timed out after 10 minutes"));
});
req.on("socket", (socket) => {
  socket.once("secureConnect", () => console.log(`[${stamp()}] connected endpoint=${endpoint.origin}${endpoint.pathname}`));
});
req.on("error", (error) => {
  console.error(`[${stamp()}] request failed: ${error.message}`);
  process.exitCode = 1;
});

const write = async (chunk: Buffer) => {
  if (!req.write(chunk)) await once(req, "drain");
};

await write(preamble);
for await (const chunk of createReadStream(filePath, { highWaterMark: 256 * 1024 })) {
  const buffer = Buffer.from(chunk);
  await write(buffer);
  uploadedBodyBytes += buffer.length;
  const percent = Math.min(100, Math.floor((uploadedBodyBytes / fileSize) * 100));
  if (percent !== lastReportedPercent) {
    lastReportedPercent = percent;
    console.log(`[${stamp()}] client_write bytes=${uploadedBodyBytes}/${fileSize} percent=${percent}`);
  }
}
await write(epilogue);
req.end();
requestBodyQueuedAt = performance.now();
console.log(`[${stamp()}] request body queued bytes=${contentLength}`);
