import { describe, it, expect, vi } from "vitest";
import express from "express";
import { z } from "zod";
import { validateBody, validateParams } from "../middleware/validate";
import { errorHandler } from "../middleware/errorHandler";
import { request } from "./httpHarness";
import { AppError } from "../lib/errors";

describe("Validation Middleware", () => {
  it("should reject empty team name", async () => {
    const app = express();
    app.use(express.json());

    const createTeamSchema = z.object({
      name: z.string().min(1, "Team name is required"),
    });

    app.post("/api/teams", validateBody(createTeamSchema), (req, res) => {
      res.status(201).json({ id: "123", name: req.body.name });
    });

    app.use(errorHandler);

    const response = await request(app)
      .post("/api/teams")
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should accept valid team name", async () => {
    const app = express();
    app.use(express.json());

    const createTeamSchema = z.object({
      name: z.string().min(1, "Team name is required"),
    });

    app.post("/api/teams", validateBody(createTeamSchema), (req, res) => {
      res.status(201).json({ id: "123", name: req.body.name });
    });

    app.use(errorHandler);

    const response = await request(app)
      .post("/api/teams")
      .send({ name: "Engineering" });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe("Engineering");
  });

  it("should reject empty teamId in params", async () => {
    const teamIdSchema = z.object({
      teamId: z.string().min(1, "Team ID is required"),
    });

    const middleware = validateParams(teamIdSchema);
    const next = vi.fn();
    const req = { params: {} } as any;

    middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Path parameter validation failed");
  });
});
