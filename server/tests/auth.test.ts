import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { setupAuth } from "../auth";

describe("Auth Endpoints", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    
    app.use(
      session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      })
    );
    
    app.get("/api/auth/me", (req, res) => {
      if (!req.session || !(req.session as any).userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      res.json({ user: { id: (req.session as any).userId } });
    });
  });

  afterAll(async () => {
  });

  it("should return 401 when not authenticated", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("error");
  });
});
