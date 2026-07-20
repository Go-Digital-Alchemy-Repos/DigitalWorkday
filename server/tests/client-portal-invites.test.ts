import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Response } from "express";
import request from "supertest";
import { UserRole, ClientAccessLevel, InvitationStatus } from "@shared/schema";

const storageMocks = {
  getClientByIdAndTenant: vi.fn(),
  getClient: vi.fn(),
  getClientContact: vi.fn(),
  getUserByEmail: vi.fn(),
  getClientUserAccessByUserAndClient: vi.fn(),
  addClientUserAccess: vi.fn(),
  createInvitation: vi.fn(),
  createClientInvite: vi.fn(),
  getTenant: vi.fn(),
  getClientUsers: vi.fn(),
};

const sendEmailMock = vi.fn();
const renderByKeyMock = vi.fn();

vi.mock("../storage", () => ({
  storage: storageMocks,
}));

vi.mock("../services/emailOutbox", () => ({
  emailOutboxService: {
    sendEmail: sendEmailMock,
  },
}));

vi.mock("../services/emailTemplates", () => ({
  emailTemplateService: {
    renderByKey: renderByKeyMock,
  },
}));

const { errorHandler } = await import("../middleware/errorHandler");
const { default: portalRouter } = await import("../features/clients/portal.router");

function createApp(role: string = UserRole.ADMIN) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.isAuthenticated = () => true;
    req.user = {
      id: "admin-1",
      name: "Admin User",
      email: "admin@example.com",
      role,
      tenantId: "tenant-1",
    };
    req.tenant = {
      tenantId: "tenant-1",
      effectiveTenantId: "tenant-1",
      isSuperUser: role === UserRole.SUPER_USER,
    };
    next();
  });
  app.use("/api/clients", portalRouter);
  app.use(errorHandler);
  return app;
}

const client = {
  id: "client-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  companyName: "Acme Client",
};

const contact = {
  id: "contact-1",
  clientId: "client-1",
  firstName: "Casey",
  lastName: "Customer",
  email: "casey@example.com",
};

describe("client portal invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_PUBLIC_URL;
    delete process.env.APP_URL;

    storageMocks.getClientByIdAndTenant.mockResolvedValue(client);
    storageMocks.getClient.mockResolvedValue(client);
    storageMocks.getClientContact.mockResolvedValue(contact);
    storageMocks.getUserByEmail.mockResolvedValue(undefined);
    storageMocks.createInvitation.mockResolvedValue({
      id: "invite-1",
      email: contact.email,
      status: InvitationStatus.PENDING,
      createdAt: new Date("2026-07-20T12:00:00.000Z"),
    });
    storageMocks.createClientInvite.mockResolvedValue({
      id: "client-invite-1",
      email: contact.email,
      status: InvitationStatus.PENDING,
      createdAt: new Date("2026-07-20T12:00:00.000Z"),
    });
    storageMocks.getTenant.mockResolvedValue({ id: "tenant-1", name: "Digital Workday" });
    renderByKeyMock.mockResolvedValue({
      subject: "Portal invite",
      textBody: "Use {{inviteUrl}}",
      htmlBody: "<p>Invite</p>",
    });
    sendEmailMock.mockResolvedValue({ success: true, emailId: "email-1" });
  });

  it("requires tenant admin access to invite portal users", async () => {
    const response = await request(createApp(UserRole.EMPLOYEE))
      .post("/api/clients/client-1/users/invite")
      .set("Host", "app.test")
      .set("X-Forwarded-Proto", "https")
      .send({ contactId: contact.id });

    expect(response.status).toBe(403);
    expect(storageMocks.createInvitation).not.toHaveBeenCalled();
  });

  it("sends an invite email and returns the generated registration URL", async () => {
    const response = await request(createApp())
      .post("/api/clients/client-1/users/invite")
      .set("Host", "app.test")
      .set("X-Forwarded-Proto", "https")
      .send({ contactId: contact.id, accessLevel: ClientAccessLevel.COLLABORATOR });

    expect(response.status).toBe(201);
    expect(response.body.emailSent).toBe(true);
    expect(response.body.registrationUrl).toMatch(/^https:\/\/app\.test\/accept-invite\//);
    expect(storageMocks.createInvitation).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      email: contact.email,
      role: UserRole.CLIENT,
      clientId: "client-1",
      status: InvitationStatus.PENDING,
    }));
    expect(storageMocks.createClientInvite).toHaveBeenCalledWith(expect.objectContaining({
      clientId: "client-1",
      contactId: contact.id,
      roleHint: ClientAccessLevel.COLLABORATOR,
      status: InvitationStatus.PENDING,
    }));
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      messageType: "invitation",
      toEmail: contact.email,
      actionLabel: "Accept Invitation",
    }));
  });

  it("does not grant portal access to an existing internal user", async () => {
    storageMocks.getUserByEmail.mockResolvedValue({
      id: "employee-1",
      email: contact.email,
      role: UserRole.EMPLOYEE,
      tenantId: "tenant-1",
    });

    const response = await request(createApp())
      .post("/api/clients/client-1/users/invite")
      .set("Host", "app.test")
      .set("X-Forwarded-Proto", "https")
      .send({ contactId: contact.id });

    expect(response.status).toBe(409);
    expect(storageMocks.addClientUserAccess).not.toHaveBeenCalled();
    expect(storageMocks.createInvitation).not.toHaveBeenCalled();
  });

  it("returns a copyable invite URL when email delivery is unavailable", async () => {
    sendEmailMock.mockResolvedValue({
      success: false,
      emailId: "email-1",
      error: "Mailgun not configured",
    });

    const response = await request(createApp())
      .post("/api/clients/client-1/users/invite")
      .set("Host", "app.test")
      .set("X-Forwarded-Proto", "https")
      .send({ contactId: contact.id });

    expect(response.status).toBe(201);
    expect(response.body.emailSent).toBe(false);
    expect(response.body.emailError).toBe("Mailgun not configured");
    expect(response.body.registrationUrl).toMatch(/^https:\/\/app\.test\/accept-invite\//);
  });
});
