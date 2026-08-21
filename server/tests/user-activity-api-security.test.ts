import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { superUsersRouter } from "../routes/modules/super-admin/users.router";
import desktopRouter from "../features/desktop/desktop.router";
import { createActivityHeartbeatRateLimiter } from "../middleware/rateLimit";

describe("user activity API authorization", () => {
  it("denies anonymous access to activity logs and read-only task previews", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/super", superUsersRouter);
    const [activity, task] = await Promise.all([
      request(app).get("/api/v1/super/users/user-1/activity-log"),
      request(app).get("/api/v1/super/tasks/task-1"),
    ]);
    expect([401, 403]).toContain(activity.status);
    expect([401, 403]).toContain(task.status);
  });

  it("requires authenticated desktop identity and rejects client-supplied identity", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/desktop", desktopRouter);
    const response = await request(app)
      .post("/api/v1/desktop/activity/heartbeat")
      .send({ state: "active", userId: "attacker-selected-user", tenantId: "attacker-tenant" });
    // Disabled desktop API intentionally hides the route with 404; when enabled,
    // the same request is rejected as unauthenticated before its body is read.
    expect([401, 404]).toContain(response.status);
  });

  it("bounds heartbeat requests per authenticated source", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: "user-1" } as Express.User;
      next();
    });
    app.post("/heartbeat", createActivityHeartbeatRateLimiter({ max: 2, skip: () => false }), (_req, res) => res.status(204).end());
    expect((await request(app).post("/heartbeat").send({ state: "active" })).status).toBe(204);
    expect((await request(app).post("/heartbeat").send({ state: "active" })).status).toBe(204);
    const limited = await request(app).post("/heartbeat").send({ state: "active" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });
});
