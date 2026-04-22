import { describe, it, expect } from "vitest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../http/routerFactory";
import timeRouter from "../http/domains/time.router";
import { request } from "./httpHarness";

function injectNoAuth(): RequestHandler {
  return (req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    (req as any).user = null;
    next();
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(injectNoAuth());
  app.use("/api", timeRouter);
  return app;
}

describe("Time Router – authTenant policy drift tests", () => {
  it("GET /api/timer/current without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/timer/current");
    expect(res.status).toBe(401);
  });

  it("POST /api/timer/start without auth returns 401", async () => {
    const res = await request(buildApp())
      .post("/api/timer/start")
      .send({});
    expect(res.status).toBe(401);
  });

  it("POST /api/timer/pause without auth returns 401", async () => {
    const res = await request(buildApp()).post("/api/timer/pause");
    expect(res.status).toBe(401);
  });

  it("POST /api/timer/resume without auth returns 401", async () => {
    const res = await request(buildApp()).post("/api/timer/resume");
    expect(res.status).toBe(401);
  });

  it("POST /api/timer/stop without auth returns 401", async () => {
    const res = await request(buildApp())
      .post("/api/timer/stop")
      .send({});
    expect(res.status).toBe(401);
  });

  it("PATCH /api/timer/current without auth returns 401", async () => {
    const res = await request(buildApp())
      .patch("/api/timer/current")
      .send({});
    expect(res.status).toBe(401);
  });

  it("DELETE /api/timer/current without auth returns 401", async () => {
    const res = await request(buildApp()).delete("/api/timer/current");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/time-entries");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/my without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/time-entries/my");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/my/stats without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/time-entries/my/stats");
    expect(res.status).toBe(401);
  });

  it("POST /api/time-entries without auth returns 401", async () => {
    const res = await request(buildApp())
      .post("/api/time-entries")
      .send({});
    expect(res.status).toBe(401);
  });

  it("PATCH /api/time-entries/fake-id without auth returns 401", async () => {
    const res = await request(buildApp())
      .patch("/api/time-entries/fake-id")
      .send({});
    expect(res.status).toBe(401);
  });

  it("DELETE /api/time-entries/fake-id without auth returns 401", async () => {
    const res = await request(buildApp()).delete("/api/time-entries/fake-id");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/report/summary without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/time-entries/report/summary");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/export/csv without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/time-entries/export/csv");
    expect(res.status).toBe(401);
  });

  it("GET /api/calendar/events without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/calendar/events");
    expect(res.status).toBe(401);
  });

  it("GET /api/my-calendar/events without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/my-calendar/events");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/:id without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/time-entries/fake-id");
    expect(res.status).toBe(401);
  });

  it("time router factory metadata has authTenant policy", () => {
    const meta = getRouterMeta(timeRouter);
    expect(meta).toBeDefined();
    expect(meta!.policy).toBe("authTenant");
  });
});
