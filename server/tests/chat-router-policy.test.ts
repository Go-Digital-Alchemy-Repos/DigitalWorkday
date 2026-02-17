import { describe, it, expect } from "vitest";
import request from "supertest";

const BASE = "http://localhost:5000";

describe("Chat Router – authTenant policy drift tests", () => {
  it("GET /api/v1/chat/channels without auth returns 401", async () => {
    const res = await request(BASE).get("/api/v1/chat/channels");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/chat/channels without auth returns 401", async () => {
    const res = await request(BASE)
      .post("/api/v1/chat/channels")
      .send({ name: "test", isPrivate: false });
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/chat/dm without auth returns 401", async () => {
    const res = await request(BASE).get("/api/v1/chat/dm");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/chat/dm without auth returns 401", async () => {
    const res = await request(BASE)
      .post("/api/v1/chat/dm")
      .send({ userIds: ["fake-id"] });
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/chat/search without auth returns 401", async () => {
    const res = await request(BASE).get("/api/v1/chat/search?q=hello");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/chat/users without auth returns 401", async () => {
    const res = await request(BASE).get("/api/v1/chat/users");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/chat/uploads without auth returns 401", async () => {
    const res = await request(BASE)
      .post("/api/v1/chat/uploads")
      .send({});
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/chat/reads without auth returns 401", async () => {
    const res = await request(BASE)
      .post("/api/v1/chat/reads")
      .send({ conversationId: "channel:fake-id" });
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/chat/channels/fake-id/messages without auth returns 401", async () => {
    const res = await request(BASE).get("/api/v1/chat/channels/fake-id/messages");
    expect(res.status).toBe(401);
  });

  it("PATCH /api/v1/chat/messages/fake-id without auth returns 401", async () => {
    const res = await request(BASE)
      .patch("/api/v1/chat/messages/fake-id")
      .send({ body: "edited" });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/v1/chat/messages/fake-id without auth returns 401", async () => {
    const res = await request(BASE)
      .delete("/api/v1/chat/messages/fake-id");
    expect(res.status).toBe(401);
  });
});
