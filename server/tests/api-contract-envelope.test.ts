import express from "express";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { responseEnvelopeMiddleware } from "../http/policy/responseEnvelope";
import { validateBody, validateParams, validateQuery } from "../http/middleware/validateBody";
import { requestIdMiddleware } from "../middleware/requestId";
import { apiNotFoundHandler } from "../middleware/apiJsonGuard";
import { AppError } from "../lib/errors";
import { request } from "./httpHarness";

function createContractApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(responseEnvelopeMiddleware);
  return app;
}

describe("API contract envelopes", () => {
  it("res.ok is additive-compatible with ok and success success flags", async () => {
    const app = createContractApp();
    app.get("/test", (_req, res) => {
      res.ok({ id: "item-1" });
    });

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "contract-ok");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      success: true,
      requestId: "contract-ok",
      data: { id: "item-1" },
    });
  });

  it("res.fail includes legacy and v2 error contract fields", async () => {
    const app = createContractApp();
    app.get("/test", (_req, res) => {
      res.fail("CONFLICT", "Already exists", 409, { field: "name" });
    });

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "contract-fail");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      ok: false,
      success: false,
      requestId: "contract-fail",
      code: "CONFLICT",
      message: "Already exists",
      error: {
        code: "CONFLICT",
        message: "Already exists",
        status: 409,
        requestId: "contract-fail",
        details: { field: "name" },
      },
    });
  });

  it("sendError normalizes AppError into both legacy and v2 fields", async () => {
    const app = createContractApp();
    app.get("/test", (_req, res) => {
      res.sendError(AppError.notFound("Client"));
    });

    const res = await request(app)
      .get("/test")
      .set("X-Request-Id", "contract-send-error");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      ok: false,
      success: false,
      requestId: "contract-send-error",
      error: {
        code: "NOT_FOUND",
        message: "Client not found",
        status: 404,
        requestId: "contract-send-error",
      },
    });
  });

  it("validation middleware returns stable details with zod issue codes", async () => {
    const app = createContractApp();
    app.post(
      "/test/:id",
      validateParams(z.object({ id: z.string().uuid() })),
      validateQuery(z.object({ dryRun: z.coerce.boolean().optional() })),
      validateBody(z.object({ email: z.string().email() })),
      (_req, res) => res.sendSuccess({ accepted: true }, 202),
    );

    const invalidParams = await request(app)
      .post("/test/not-a-uuid")
      .set("X-Request-Id", "contract-params")
      .send({ email: "person@example.com" });

    expect(invalidParams.status).toBe(400);
    expect(invalidParams.body).toMatchObject({
      ok: false,
      success: false,
      requestId: "contract-params",
      error: {
        code: "VALIDATION_ERROR",
        status: 400,
        requestId: "contract-params",
      },
    });
    expect(invalidParams.body.error.details[0]).toMatchObject({
      path: "id",
      code: "invalid_string",
    });

    const invalidBody = await request(app)
      .post("/test/2fbbd7b8-1404-4b92-ae1c-5eecfb0f7199")
      .set("X-Request-Id", "contract-body")
      .send({ email: "nope" });

    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.error.details[0]).toMatchObject({
      path: "email",
      code: "invalid_string",
    });
  });

  it("API 404s use the same additive error envelope", async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(apiNotFoundHandler);

    const res = await request(app)
      .get("/api/missing")
      .set("X-Request-Id", "contract-404");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      ok: false,
      success: false,
      requestId: "contract-404",
      code: "NOT_FOUND",
      error: {
        code: "NOT_FOUND",
        status: 404,
        requestId: "contract-404",
      },
    });
  });
});
