import { describe, it, expect } from "vitest";
import express from "express";
import type { RequestHandler } from "express";
import { getRouterMeta } from "../http/routerFactory";
import chatRouter from "../http/domains/chat.router";
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
  app.use("/api/v1/chat", chatRouter);
  return app;
}

describe("Chat Router – authTenant policy drift tests", () => {
  it("GET /api/v1/chat/channels without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/v1/chat/channels");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/chat/channels without auth returns 401", async () => {
    const res = await request(buildApp())
      .post("/api/v1/chat/channels")
      .send({ name: "test", isPrivate: false });
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/chat/dm without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/v1/chat/dm");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/chat/dm without auth returns 401", async () => {
    const res = await request(buildApp())
      .post("/api/v1/chat/dm")
      .send({ userIds: ["fake-id"] });
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/chat/search without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/v1/chat/search?q=hello");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/chat/users without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/v1/chat/users");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/chat/uploads without auth returns 401", async () => {
    const res = await request(buildApp())
      .post("/api/v1/chat/uploads")
      .send({});
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/chat/reads without auth returns 401", async () => {
    const res = await request(buildApp())
      .post("/api/v1/chat/reads")
      .send({ conversationId: "channel:fake-id" });
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/chat/channels/fake-id/messages without auth returns 401", async () => {
    const res = await request(buildApp()).get("/api/v1/chat/channels/fake-id/messages");
    expect(res.status).toBe(401);
  });

  it("PATCH /api/v1/chat/messages/fake-id without auth returns 401", async () => {
    const res = await request(buildApp())
      .patch("/api/v1/chat/messages/fake-id")
      .send({ body: "edited" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/v1/chat/messages/fake-id without auth returns 401", async () => {
    const res = await request(buildApp())
      .delete("/api/v1/chat/messages/fake-id");
    expect(res.status).toBe(401);
  });

  it("chat router factory metadata has authTenant policy", () => {
    const meta = getRouterMeta(chatRouter);
    expect(meta).toBeDefined();
    expect(meta!.policy).toBe("authTenant");
  });
});
