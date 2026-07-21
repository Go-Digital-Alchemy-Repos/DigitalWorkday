#!/usr/bin/env node
/**
 * SLO smoke checker for production/staging health probes.
 *
 * Usage:
 *   SLO_BASE_URL=https://digitalworkday.ai node server/scripts/slo-check.cjs
 *   SLO_BASE_URL=https://digitalworkday.ai SLO_EXPECTED_VERSION=abc1234 node server/scripts/slo-check.cjs
 */

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_THRESHOLDS = {
  healthMs: 1000,
  readinessMs: 1500,
};

function normalizeBaseUrl(value) {
  if (!value || typeof value !== "string") {
    throw new Error("SLO_BASE_URL is required");
  }
  return value.replace(/\/+$/, "");
}

function isOkStatus(status) {
  return status >= 200 && status < 300;
}

function classifyProbe({ name, status, durationMs, body, thresholdMs, expectedVersion }) {
  const failures = [];

  if (!isOkStatus(status)) {
    failures.push(`${name} returned HTTP ${status}`);
  }

  if (durationMs > thresholdMs) {
    failures.push(`${name} latency ${durationMs}ms exceeded ${thresholdMs}ms`);
  }

  if (body && typeof body === "object") {
    if (Object.prototype.hasOwnProperty.call(body, "ok") && body.ok !== true) {
      failures.push(`${name} reported ok=false`);
    }
    if (Object.prototype.hasOwnProperty.call(body, "ready") && body.ready !== true) {
      failures.push(`${name} reported ready=false`);
    }
    if (expectedVersion && body.version && body.version !== expectedVersion.slice(0, body.version.length)) {
      failures.push(`${name} version ${body.version} did not match expected ${expectedVersion}`);
    }
  }

  return {
    name,
    status,
    durationMs,
    thresholdMs,
    ok: failures.length === 0,
    failures,
    version: body && typeof body === "object" ? body.version : undefined,
  };
}

async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { signal: controller.signal });
    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return {
      status: response.status,
      durationMs,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runSloCheck(options) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const expectedVersion = options.expectedVersion;

  const health = await fetchWithTimeout(`${baseUrl}/health`, options.timeoutMs);
  const readiness = await fetchWithTimeout(`${baseUrl}/readyz`, options.timeoutMs);

  const probes = [
    classifyProbe({
      name: "health",
      status: health.status,
      durationMs: health.durationMs,
      body: health.body,
      thresholdMs: thresholds.healthMs,
      expectedVersion,
    }),
    classifyProbe({
      name: "readiness",
      status: readiness.status,
      durationMs: readiness.durationMs,
      body: readiness.body,
      thresholdMs: thresholds.readinessMs,
    }),
  ];

  return {
    ok: probes.every((probe) => probe.ok),
    baseUrl,
    checkedAt: new Date().toISOString(),
    probes,
  };
}

async function main() {
  try {
    const result = await runSloCheck({
      baseUrl: process.env.SLO_BASE_URL,
      expectedVersion: process.env.SLO_EXPECTED_VERSION,
      timeoutMs: Number(process.env.SLO_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
      thresholds: {
        healthMs: Number(process.env.SLO_HEALTH_THRESHOLD_MS) || DEFAULT_THRESHOLDS.healthMs,
        readinessMs: Number(process.env.SLO_READINESS_THRESHOLD_MS) || DEFAULT_THRESHOLDS.readinessMs,
      },
    });

    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_THRESHOLDS,
  classifyProbe,
  normalizeBaseUrl,
  runSloCheck,
};
