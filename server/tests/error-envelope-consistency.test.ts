import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z, ZodError } from "zod";
import { requestIdMiddleware } from "../middleware/requestId";
import { errorHandler } from "../middleware/errorHandler";
import { AppError, sendError, handleRouteError, validateBody, toErrorResponse } from "../lib/errors";
import { validateBody as validateBodyMiddleware } from "../middleware/validate";

function createTestApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  return app;
}

function assertStandardEnvelope(body: any, expectedCode: string, expectedStatus: number) {
  expect(body.ok).toBe(false);
  expect(body.requestId).toBeDefined();
  expect(typeof body.requestId).toBe("string");
  expect(body.requestId).not.toBe("");

  expect(body.error).toBeDefined();
  expect(body.error.code).toBe(expectedCode);
  expect(body.error.status).toBe(expectedStatus);
  expect(typeof body.error.message).toBe("string");
  expect(body.error.requestId).toBe(body.requestId);

  expect(body.message).toBeDefined();
  expect(body.code).toBe(expectedCode);
}

describe("Error Envelope Consistency", () => {
  describe("VALIDATION_ERROR (400) via handleRouteError + ZodError", () => {
    it("should return 400 with standard envelope when ZodError is thrown inline", async () => {
      const app = createTestApp();
      const schema = z.object({ title: z.string().min(1) });

      app.post("/test", (req, res) => {
        try {
          schema.parse(req.body);
          res.json({ ok: true });
        } catch (error) {
          return handleRouteError(res, error, "POST /test", req);
        }
      });

      const res = await request(app)
        .post("/test")
        .send({});

      expect(res.status).toBe(400);
      assertStandardEnvelope(res.body, "VALIDATION_ERROR", 400);
      expect(res.body.error.details).toBeDefined();
      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.details[0]).toHaveProperty("path");
      expect(res.body.error.details[0]).toHaveProperty("message");
    });

    it("should include field-level details for multiple validation errors", async () => {
      const app = createTestApp();
      const schema = z.object({
        title: z.string().min(1),
        priority: z.enum(["low", "medium", "high"]),
        dueDate: z.string().datetime(),
      });

      app.post("/test", (req, res) => {
        try {
          schema.parse(req.body);
          res.json({ ok: true });
        } catch (error) {
          return handleRouteError(res, error, "POST /test", req);
        }
      });

      const res = await request(app)
        .post("/test")
        .send({ title: "", priority: "invalid", dueDate: "not-a-date" });

      expect(res.status).toBe(400);
      assertStandardEnvelope(res.body, "VALIDATION_ERROR", 400);
      expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("VALIDATION_ERROR (400) via validateBody middleware", () => {
    it("should return 400 with standard envelope when middleware rejects body", async () => {
      const app = createTestApp();
      const schema = z.object({ name: z.string().min(1) });

      app.post("/test", validateBodyMiddleware(schema), (req, res) => {
        res.json({ ok: true, data: req.body });
      });
      app.use(errorHandler);

      const res = await request(app)
        .post("/test")
        .send({ name: "" });

      expect(res.status).toBe(400);
      assertStandardEnvelope(res.body, "VALIDATION_ERROR", 400);
      expect(res.body.error.details).toBeDefined();
    });
  });

  describe("VALIDATION_ERROR (400) via validateBody helper", () => {
    it("should return 400 with standard envelope when helper rejects body", async () => {
      const app = createTestApp();
      const schema = z.object({ name: z.string().min(1) });

      app.post("/test", (req, res) => {
        const data = validateBody(req.body, schema, res, req);
        if (!data) return;
        res.json({ ok: true });
      });

      const res = await request(app)
        .post("/test")
        .send({ name: "" });

      expect(res.status).toBe(400);
      assertStandardEnvelope(res.body, "VALIDATION_ERROR", 400);
    });
  });

  describe("FORBIDDEN (403) via AppError", () => {
    it("should return 403 with standard envelope via sendError", async () => {
      const app = createTestApp();
      app.get("/test", (req, res) => {
        return sendError(res, AppError.forbidden("Access denied: resource belongs to a different tenant"), req);
      });

      const res = await request(app).get("/test");

      expect(res.status).toBe(403);
      assertStandardEnvelope(res.body, "FORBIDDEN", 403);
      expect(res.body.error.message).toContain("Access denied");
    });

    it("should return 403 with standard envelope via errorHandler", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.forbidden("Access denied"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(403);
      assertStandardEnvelope(res.body, "FORBIDDEN", 403);
    });

    it("should return 403 with standard envelope via handleRouteError", async () => {
      const app = createTestApp();
      app.get("/test", (req, res) => {
        return handleRouteError(res, AppError.forbidden("Not allowed"), "GET /test", req);
      });

      const res = await request(app).get("/test");

      expect(res.status).toBe(403);
      assertStandardEnvelope(res.body, "FORBIDDEN", 403);
    });
  });

  describe("TENANCY_VIOLATION (403) via AppError", () => {
    it("should return 403 with TENANCY_VIOLATION code", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.tenancyViolation("Cross-tenant access detected"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(403);
      assertStandardEnvelope(res.body, "TENANCY_VIOLATION", 403);
    });
  });

  describe("AGREEMENT_REQUIRED (451) via AppError", () => {
    it("should return 451 with standard envelope and redirect details", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.agreementRequired("Please accept the terms", "/terms"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(451);
      assertStandardEnvelope(res.body, "AGREEMENT_REQUIRED", 451);
      expect(res.body.error.details).toEqual({ redirectTo: "/terms" });
    });

    it("should return 451 via sendError with consistent shape", async () => {
      const app = createTestApp();
      app.get("/test", (req, res) => {
        return sendError(res, AppError.agreementRequired("Accept terms first", "/accept"), req);
      });

      const res = await request(app).get("/test");

      expect(res.status).toBe(451);
      assertStandardEnvelope(res.body, "AGREEMENT_REQUIRED", 451);
      expect(res.body.error.details).toEqual({ redirectTo: "/accept" });
    });
  });

  describe("NOT_FOUND (404) via AppError", () => {
    it("should return 404 with standard envelope", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.notFound("Project"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(404);
      assertStandardEnvelope(res.body, "NOT_FOUND", 404);
      expect(res.body.error.message).toBe("Project not found");
    });
  });

  describe("RATE_LIMITED (429) via AppError", () => {
    it("should return 429 with standard envelope", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.rateLimited("Too many login attempts"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(429);
      assertStandardEnvelope(res.body, "RATE_LIMITED", 429);
    });
  });

  describe("INTERNAL_ERROR (500) via handleRouteError", () => {
    it("should return 500 with standard envelope for unknown errors", async () => {
      const app = createTestApp();
      app.get("/test", (req, res) => {
        return handleRouteError(res, new Error("DB connection failed"), "GET /test", req);
      });

      const res = await request(app).get("/test");

      expect(res.status).toBe(500);
      assertStandardEnvelope(res.body, "INTERNAL_ERROR", 500);
    });
  });

  describe("TENANT_REQUIRED (400) via AppError", () => {
    it("should return 400 with TENANT_REQUIRED code", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.tenantRequired("Tenant context required for this operation"));
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.status).toBe(400);
      assertStandardEnvelope(res.body, "TENANT_REQUIRED", 400);
    });
  });

  describe("requestId correlation", () => {
    it("should use X-Request-Id from client when present", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.notFound("Widget"));
      });
      app.use(errorHandler);

      const customRequestId = "client-req-abc-123";
      const res = await request(app)
        .get("/test")
        .set("X-Request-Id", customRequestId);

      expect(res.status).toBe(404);
      expect(res.body.requestId).toBe(customRequestId);
      expect(res.body.error.requestId).toBe(customRequestId);
      expect(res.headers["x-request-id"]).toBe(customRequestId);
    });

    it("should generate requestId when X-Request-Id header is absent", async () => {
      const app = createTestApp();
      app.get("/test", (req, res, next) => {
        next(AppError.forbidden());
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.body.requestId).toBeDefined();
      expect(res.body.requestId).not.toBe("unknown");
      expect(res.body.error.requestId).toBe(res.body.requestId);
    });
  });

  describe("AppError.toJSON()", () => {
    it("should produce standard envelope shape", () => {
      const err = AppError.badRequest("Invalid input", [{ path: "name", message: "Required" }]);
      const json = err.toJSON("req-123");

      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(json.error.message).toBe("Invalid input");
      expect(json.error.status).toBe(400);
      expect(json.error.requestId).toBe("req-123");
      expect(json.error.details).toEqual([{ path: "name", message: "Required" }]);
      expect(json.message).toBe("Invalid input");
      expect(json.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Consistency across all error paths", () => {
    const errorScenarios = [
      { name: "sendError", setup: (app: express.Express) => {
        app.get("/test", (req, res) => sendError(res, AppError.forbidden(), req));
      }},
      { name: "handleRouteError(AppError)", setup: (app: express.Express) => {
        app.get("/test", (req, res) => handleRouteError(res, AppError.forbidden(), "test", req));
      }},
      { name: "errorHandler(AppError)", setup: (app: express.Express) => {
        app.get("/test", (req, res, next) => next(AppError.forbidden()));
        app.use(errorHandler);
      }},
      { name: "handleRouteError(ZodError)", setup: (app: express.Express) => {
        app.get("/test", (req, res) => {
          const err = new ZodError([{ code: "invalid_type", expected: "string", received: "undefined", path: ["name"], message: "Required" }]);
          return handleRouteError(res, err, "test", req);
        });
      }},
      { name: "errorHandler(ZodError)", setup: (app: express.Express) => {
        app.get("/test", (req, res, next) => {
          next(new ZodError([{ code: "invalid_type", expected: "string", received: "undefined", path: ["name"], message: "Required" }]));
        });
        app.use(errorHandler);
      }},
    ];

    for (const scenario of errorScenarios) {
      it(`should include ok, requestId, error.code, error.message, error.status, error.requestId via ${scenario.name}`, async () => {
        const app = createTestApp();
        scenario.setup(app);

        const res = await request(app).get("/test");

        expect(res.body.ok).toBe(false);
        expect(res.body.requestId).toBeDefined();
        expect(res.body.error).toBeDefined();
        expect(res.body.error.code).toBeDefined();
        expect(typeof res.body.error.message).toBe("string");
        expect(typeof res.body.error.status).toBe("number");
        expect(res.body.error.requestId).toBe(res.body.requestId);
        expect(res.body.message).toBeDefined();
        expect(res.body.code).toBeDefined();
      });
    }
  });
});
