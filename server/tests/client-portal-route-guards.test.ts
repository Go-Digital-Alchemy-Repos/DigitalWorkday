import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { UserRole } from "@shared/schema";
import projectNotesRouter from "../http/domains/project-notes.router";
import crmNotesRouter from "../routes/modules/crm/notes.router";
import clientNotesRouter from "../features/clients/notes.router";
import projectsRouter from "../http/domains/projects.router";
import tasksRouter from "../http/domains/tasks.router";
import subtasksRouter from "../http/domains/subtasks.router";
import commentsRouter from "../http/domains/comments.router";
import assetsRouter from "../http/domains/assets.router";

function clientUserMiddleware(req: any, _res: express.Response, next: express.NextFunction) {
  req.user = { id: "client-user-1", role: UserRole.CLIENT, tenantId: "tenant-1" };
  req.tenant = { tenantId: "tenant-1", effectiveTenantId: "tenant-1", isSuperUser: false };
  req.workspaceId = "workspace-1";
  req.isAuthenticated = () => true;
  next();
}

describe("client portal route guards", () => {
  it("does not let internal notes guards block client portal APIs mounted later", async () => {
    const app = express();
    app.use(clientUserMiddleware);
    app.use("/api", projectNotesRouter);
    app.use("/api", crmNotesRouter);
    app.use("/api/clients", clientNotesRouter);
    app.get("/api/client-portal/dashboard", (_req, res) => {
      res.json({ ok: true, clients: [], projects: [], tasks: [] });
    });

    const response = await request(app).get("/api/client-portal/dashboard");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("still blocks client portal users from internal notes routes", async () => {
    const app = express();
    app.use(clientUserMiddleware);
    app.use("/api", projectNotesRouter);
    app.use("/api", crmNotesRouter);
    app.use("/api/clients", clientNotesRouter);

    const projectNotesResponse = await request(app).get("/api/projects/project-1/notes");
    const crmNotesResponse = await request(app).get("/api/crm/clients/client-1/notes");
    const clientNotesResponse = await request(app).get("/api/clients/client-1/notes");

    expect(projectNotesResponse.status).toBe(403);
    expect(crmNotesResponse.status).toBe(403);
    expect(clientNotesResponse.status).toBe(403);
  });

  it("blocks portal users from bypassing dedicated APIs through internal CRUD routes", async () => {
    const app = express();
    app.use(express.json());
    app.use(clientUserMiddleware);
    app.use("/api", projectsRouter);
    app.use("/api", tasksRouter);
    app.use("/api", subtasksRouter);
    app.use("/api", commentsRouter);
    app.use("/api/v1", assetsRouter);

    const responses = await Promise.all([
      request(app).post("/api/projects").send({ name: "Bypass" }),
      request(app).patch("/api/tasks/task-1").send({ status: "done" }),
      request(app).post("/api/tasks/task-1/subtasks").send({ title: "Bypass" }),
      request(app).post("/api/tasks/task-1/comments").send({ body: "Bypass" }),
      request(app).get("/api/v1/assets?clientId=client-1"),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
  });
});
