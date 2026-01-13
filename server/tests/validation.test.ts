import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { z } from "zod";
import { validateBody, validateParams } from "../middleware/validate";
import { errorHandler } from "../middleware/errorHandler";

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
    const app = express();
    app.use(express.json());

    const teamIdSchema = z.object({
      teamId: z.string().min(1, "Team ID is required"),
    });

    app.post(
      "/api/teams/:teamId/members",
      validateParams(teamIdSchema),
      (req, res) => {
        res.status(201).json({ teamId: req.params.teamId });
      }
    );

    app.use(errorHandler);

    const response = await request(app)
      .post("/api/teams//members")
      .send({ userId: "user-123" });

    expect(response.status).toBe(404);
  });
});
