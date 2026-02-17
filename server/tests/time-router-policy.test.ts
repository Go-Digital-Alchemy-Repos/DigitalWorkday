import { describe, it, expect } from "vitest";
import request from "supertest";

const BASE = "http://localhost:5000";

describe("Time Router – authTenant policy drift tests", () => {
  it("GET /api/timer/current without auth returns 401", async () => {
    const res = await request(BASE).get("/api/timer/current");
    expect(res.status).toBe(401);
  });

  it("POST /api/timer/start without auth returns 401", async () => {
    const res = await request(BASE)
      .post("/api/timer/start")
      .send({});
    expect(res.status).toBe(401);
  });

  it("POST /api/timer/pause without auth returns 401", async () => {
    const res = await request(BASE).post("/api/timer/pause");
    expect(res.status).toBe(401);
  });

  it("POST /api/timer/resume without auth returns 401", async () => {
    const res = await request(BASE).post("/api/timer/resume");
    expect(res.status).toBe(401);
  });

  it("POST /api/timer/stop without auth returns 401", async () => {
    const res = await request(BASE)
      .post("/api/timer/stop")
      .send({});
    expect(res.status).toBe(401);
  });

  it("PATCH /api/timer/current without auth returns 401", async () => {
    const res = await request(BASE)
      .patch("/api/timer/current")
      .send({});
    expect(res.status).toBe(401);
  });

  it("DELETE /api/timer/current without auth returns 401", async () => {
    const res = await request(BASE).delete("/api/timer/current");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries without auth returns 401", async () => {
    const res = await request(BASE).get("/api/time-entries");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/my without auth returns 401", async () => {
    const res = await request(BASE).get("/api/time-entries/my");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/my/stats without auth returns 401", async () => {
    const res = await request(BASE).get("/api/time-entries/my/stats");
    expect(res.status).toBe(401);
  });

  it("POST /api/time-entries without auth returns 401", async () => {
    const res = await request(BASE)
      .post("/api/time-entries")
      .send({});
    expect(res.status).toBe(401);
  });

  it("PATCH /api/time-entries/fake-id without auth returns 401", async () => {
    const res = await request(BASE)
      .patch("/api/time-entries/fake-id")
      .send({});
    expect(res.status).toBe(401);
  });

  it("DELETE /api/time-entries/fake-id without auth returns 401", async () => {
    const res = await request(BASE).delete("/api/time-entries/fake-id");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/report/summary without auth returns 401", async () => {
    const res = await request(BASE).get("/api/time-entries/report/summary");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/export/csv without auth returns 401", async () => {
    const res = await request(BASE).get("/api/time-entries/export/csv");
    expect(res.status).toBe(401);
  });

  it("GET /api/calendar/events without auth returns 401", async () => {
    const res = await request(BASE).get("/api/calendar/events");
    expect(res.status).toBe(401);
  });

  it("GET /api/my-calendar/events without auth returns 401", async () => {
    const res = await request(BASE).get("/api/my-calendar/events");
    expect(res.status).toBe(401);
  });

  it("GET /api/time-entries/:id without auth returns 401", async () => {
    const res = await request(BASE).get("/api/time-entries/fake-id");
    expect(res.status).toBe(401);
  });

  it("time router factory metadata has authTenant policy", async () => {
    const { getRouterMeta } = await import("../http/routerFactory");
    const timeRouter = (await import("../http/domains/time.router")).default;
    const meta = getRouterMeta(timeRouter);
    expect(meta).toBeDefined();
    expect(meta!.policy).toBe("authTenant");
  });
});
