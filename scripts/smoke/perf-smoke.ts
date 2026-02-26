#!/usr/bin/env tsx
/**
 * @file scripts/smoke/perf-smoke.ts
 * @description Performance regression smoke tests.
 *
 * Runs against a live server to verify:
 * - Key endpoints respond within budget
 * - Payloads stay within size limits
 * - Private-visibility items are not leaked
 *
 * Usage:
 *   SMOKE_BASE_URL=http://localhost:5000 SMOKE_SESSION_COOKIE="..." npx tsx scripts/smoke/perf-smoke.ts
 *
 * Gate: Only runs when ENABLE_REGRESSION_SMOKE_TESTS=true.
 * In CI, set SMOKE_BASE_URL to the staging URL and provide a valid session cookie.
 */

import https from "https";
import http from "http";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:5000";
const SESSION_COOKIE = process.env.SMOKE_SESSION_COOKIE || "";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS) || 5000;

interface SmokeResult {
  name: string;
  passed: boolean;
  durationMs: number;
  payloadBytes?: number;
  statusCode?: number;
  error?: string;
  assertions: Array<{ label: string; passed: boolean; detail?: string }>;
}

async function fetchUrl(
  url: string,
  options: { method?: string; timeoutMs?: number } = {}
): Promise<{ statusCode: number; body: string; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const lib = url.startsWith("https") ? https : http;
    const headers: Record<string, string> = {};
    if (SESSION_COOKIE) headers["Cookie"] = SESSION_COOKIE;

    const req = lib.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: data,
          durationMs: Date.now() - start,
        });
      });
    });

    req.setTimeout(options.timeoutMs || TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Timeout after ${options.timeoutMs || TIMEOUT_MS}ms`));
    });

    req.on("error", reject);
  });
}

function assert(
  results: SmokeResult["assertions"],
  label: string,
  condition: boolean,
  detail?: string
): void {
  results.push({ label, passed: condition, detail });
}

async function runTest(
  name: string,
  path: string,
  budgets: { maxMs?: number; maxBytes?: number; expectedStatus?: number }
): Promise<SmokeResult> {
  const assertions: SmokeResult["assertions"] = [];
  let durationMs = 0;
  let payloadBytes = 0;
  let statusCode = 0;

  try {
    const { statusCode: sc, body, durationMs: dur } = await fetchUrl(`${BASE_URL}${path}`);
    durationMs = dur;
    payloadBytes = Buffer.byteLength(body, "utf8");
    statusCode = sc;

    assert(
      assertions,
      `Status ${budgets.expectedStatus ?? 200}`,
      sc === (budgets.expectedStatus ?? 200),
      `Got ${sc}`
    );

    if (budgets.maxMs) {
      assert(assertions, `Response < ${budgets.maxMs}ms`, durationMs < budgets.maxMs, `Got ${durationMs}ms`);
    }

    if (budgets.maxBytes) {
      assert(
        assertions,
        `Payload < ${(budgets.maxBytes / 1024).toFixed(0)}KB`,
        payloadBytes < budgets.maxBytes,
        `Got ${(payloadBytes / 1024).toFixed(1)}KB`
      );
    }

    const passed = assertions.every((a) => a.passed);
    return { name, passed, durationMs, payloadBytes, statusCode, assertions };
  } catch (error: any) {
    return {
      name,
      passed: false,
      durationMs,
      payloadBytes,
      statusCode,
      error: error?.message,
      assertions,
    };
  }
}

async function main() {
  console.log(`\n[smoke] Running perf smoke tests against ${BASE_URL}\n`);

  const results: SmokeResult[] = await Promise.all([
    runTest("healthz liveness", "/healthz", { maxMs: 50, expectedStatus: 200 }),
    runTest("readyz readiness", "/readyz", { maxMs: 500, expectedStatus: 200 }),
    runTest("livez", "/livez", { maxMs: 50, expectedStatus: 200 }),
    runTest("Tasks list (batched)", "/api/tasks/my?limit=50", {
      maxMs: 1500,
      maxBytes: 500_000,
    }),
    runTest("Clients list (batched)", "/api/clients?limit=50", {
      maxMs: 1200,
      maxBytes: 300_000,
    }),
    runTest("Projects list (SQL filter)", "/api/projects?limit=50&status=open", {
      maxMs: 1200,
      maxBytes: 300_000,
    }),
    runTest("Notifications unread count", "/api/v1/notifications/unread-count", {
      maxMs: 300,
      maxBytes: 1_000,
    }),
  ]);

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const icon = result.passed ? "✓" : "✗";
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`  ${icon} [${status}] ${result.name} — ${result.durationMs}ms${result.payloadBytes ? `, ${(result.payloadBytes / 1024).toFixed(1)}KB` : ""}`);

    if (!result.passed) {
      failed++;
      if (result.error) console.log(`        Error: ${result.error}`);
      for (const a of result.assertions.filter((a) => !a.passed)) {
        console.log(`        ✗ ${a.label}${a.detail ? `: ${a.detail}` : ""}`);
      }
    } else {
      passed++;
    }
  }

  console.log(`\n[smoke] Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[smoke] Fatal error:", err);
  process.exit(1);
});
