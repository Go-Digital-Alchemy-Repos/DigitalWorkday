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
  createUser: vi.fn(),
  getContactsByClient: vi.fn(),
  createClientContact: vi.fn(),
};

const sendEmailMock = vi.fn();
const renderByKeyMock = vi.fn();
const getClientDescendantIdsMock = vi.fn();
const getPortalAccessOptionsMock = vi.fn();
const getPortalAccessMatrixMock = vi.fn();
const replacePortalAccessScopeMock = vi.fn();

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

vi.mock("../services/customerAccessPermissions", () => ({
  getClientDescendantIds: getClientDescendantIdsMock,
  getPortalAccessOptions: getPortalAccessOptionsMock,
  getPortalAccessMatrix: getPortalAccessMatrixMock,
  replacePortalAccessScope: replacePortalAccessScopeMock,
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
    process.env.APP_PUBLIC_URL = "https://app.test";

    storageMocks.getClientByIdAndTenant.mockResolvedValue(client);
    storageMocks.getClient.mockResolvedValue(client);
    storageMocks.getClientContact.mockResolvedValue(contact);
    storageMocks.getContactsByClient.mockResolvedValue([contact]);
    storageMocks.createClientContact.mockResolvedValue(contact);
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
    storageMocks.createUser.mockResolvedValue({
      id: "portal-user-1",
      tenantId: "tenant-1",
      email: "newportal@example.com",
      name: "New Portal",
      firstName: "New",
      lastName: "Portal",
      role: UserRole.CLIENT,
    });
    storageMocks.getTenant.mockResolvedValue({ id: "tenant-1", name: "Digital Workday" });
    renderByKeyMock.mockResolvedValue({
      subject: "Portal invite",
      textBody: "Use {{inviteUrl}}",
      htmlBody: "<p>Invite</p>",
    });
    sendEmailMock.mockResolvedValue({ success: true, emailId: "email-1" });
    getClientDescendantIdsMock.mockResolvedValue([]);
    getPortalAccessOptionsMock.mockResolvedValue([]);
    getPortalAccessMatrixMock.mockResolvedValue([]);
    replacePortalAccessScopeMock.mockResolvedValue([]);
  });

  it("returns portal users in the flattened shape used by the management UI", async () => {
    storageMocks.getClientUsers.mockResolvedValue([
      {
        user: {
          id: "portal-user-1",
          email: "portal@example.com",
          name: "Portal User",
          firstName: "Portal",
          lastName: "User",
          avatarUrl: null,
        },
        access: {
          id: "access-1",
          clientId: "client-1",
          userId: "portal-user-1",
          accessLevel: ClientAccessLevel.COLLABORATOR,
          createdAt: new Date("2026-07-20T12:00:00.000Z"),
        },
      },
    ]);

    const response = await request(createApp()).get("/api/clients/client-1/users");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: "access-1",
        clientId: "client-1",
        userId: "portal-user-1",
        accessLevel: ClientAccessLevel.COLLABORATOR,
        user: expect.objectContaining({
          id: "portal-user-1",
          email: "portal@example.com",
          firstName: "Portal",
          lastName: "User",
        }),
      }),
    ]);
  });

  it("returns account access options before creating a portal user", async () => {
    getPortalAccessOptionsMock.mockResolvedValue([
      {
        client: { ...client, parentClientId: null },
        relationship: "current",
      },
      {
        client: {
          id: "child-1",
          tenantId: "tenant-1",
          workspaceId: "workspace-1",
          companyName: "Acme Child",
          parentClientId: "client-1",
        },
        relationship: "child",
      },
    ]);

    const response = await request(createApp()).get("/api/clients/client-1/access-scope-options");

    expect(response.status).toBe(200);
    expect(response.body.entries).toEqual([
      expect.objectContaining({
        client: expect.objectContaining({ id: "client-1" }),
        relationship: "current",
      }),
      expect.objectContaining({
        client: expect.objectContaining({ id: "child-1" }),
        relationship: "child",
      }),
    ]);
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
      accessClientIds: ["client-1"],
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

  it("preserves selected child account access on an invite", async () => {
    getClientDescendantIdsMock.mockResolvedValue(["child-1", "child-2"]);

    const response = await request(createApp())
      .post("/api/clients/client-1/users/invite")
      .set("Host", "app.test")
      .set("X-Forwarded-Proto", "https")
      .send({
        contactId: contact.id,
        accessLevel: ClientAccessLevel.VIEWER,
        accessClientIds: ["client-1", "child-1", "not-a-child"],
      });

    expect(response.status).toBe(201);
    expect(storageMocks.createClientInvite).toHaveBeenCalledWith(expect.objectContaining({
      accessClientIds: ["client-1", "child-1"],
    }));
  });

  it("preserves selected child account access when creating a portal user directly", async () => {
    getClientDescendantIdsMock.mockResolvedValue(["child-1", "child-2"]);
    replacePortalAccessScopeMock.mockResolvedValue([
      {
        client,
        access: {
          clientId: "client-1",
          userId: "portal-user-1",
          accessLevel: ClientAccessLevel.COLLABORATOR,
        },
        relationship: "current",
      },
      {
        client: { id: "child-1", companyName: "Acme Child" },
        access: {
          clientId: "child-1",
          userId: "portal-user-1",
          accessLevel: ClientAccessLevel.COLLABORATOR,
        },
        relationship: "child",
      },
    ]);

    const response = await request(createApp())
      .post("/api/clients/client-1/users/create")
      .send({
        email: "newportal@example.com",
        firstName: "New",
        lastName: "Portal",
        password: "password123",
        accessLevel: ClientAccessLevel.COLLABORATOR,
        accessClientIds: ["client-1", "child-1", "not-a-child"],
      });

    expect(response.status).toBe(201);
    expect(replacePortalAccessScopeMock).toHaveBeenCalledWith(
      "tenant-1",
      "workspace-1",
      "client-1",
      "portal-user-1",
      {
        entries: [
          { clientId: "client-1", accessLevel: ClientAccessLevel.COLLABORATOR },
          { clientId: "child-1", accessLevel: ClientAccessLevel.COLLABORATOR },
        ],
      },
    );
  });

  it("creates a portal invite link from initial email setup without sending email", async () => {
    getClientDescendantIdsMock.mockResolvedValue(["child-1"]);

    const response = await request(createApp())
      .post("/api/clients/client-1/users/setup")
      .set("Host", "app.test")
      .set("X-Forwarded-Proto", "https")
      .send({
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        setupMethod: "invite_link",
        accessLevel: ClientAccessLevel.COLLABORATOR,
        accessClientIds: ["client-1", "child-1"],
      });

    expect(response.status).toBe(201);
    expect(response.body.registrationUrl).toMatch(/^https:\/\/app\.test\/accept-invite\//);
    expect(response.body.emailSent).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(storageMocks.createInvitation).toHaveBeenCalledWith(expect.objectContaining({
      email: contact.email,
      role: UserRole.CLIENT,
      clientId: "client-1",
      status: InvitationStatus.PENDING,
    }));
    expect(storageMocks.createClientInvite).toHaveBeenCalledWith(expect.objectContaining({
      clientId: "client-1",
      contactId: contact.id,
      email: contact.email,
      roleHint: ClientAccessLevel.COLLABORATOR,
      accessClientIds: ["client-1", "child-1"],
    }));
  });

  it("creates a contact when initial portal invite setup uses a new email", async () => {
    storageMocks.getContactsByClient.mockResolvedValue([]);
    storageMocks.createClientContact.mockResolvedValue({
      ...contact,
      id: "contact-created",
      email: "new-contact@example.com",
    });

    const response = await request(createApp())
      .post("/api/clients/client-1/users/setup")
      .set("Host", "app.test")
      .set("X-Forwarded-Proto", "https")
      .send({
        email: "new-contact@example.com",
        firstName: "New",
        lastName: "Contact",
        setupMethod: "invite_link",
        accessLevel: ClientAccessLevel.VIEWER,
      });

    expect(response.status).toBe(201);
    expect(storageMocks.createClientContact).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      clientId: "client-1",
      firstName: "New",
      lastName: "Contact",
      email: "new-contact@example.com",
    }));
    expect(storageMocks.createClientInvite).toHaveBeenCalledWith(expect.objectContaining({
      contactId: "contact-created",
      email: "new-contact@example.com",
    }));
  });

  it("creates a portal account now from initial setup when a password is supplied", async () => {
    const response = await request(createApp())
      .post("/api/clients/client-1/users/setup")
      .send({
        email: "newportal@example.com",
        firstName: "New",
        lastName: "Portal",
        setupMethod: "create_now",
        password: "password123",
        accessLevel: ClientAccessLevel.VIEWER,
      });

    expect(response.status).toBe(201);
    expect(storageMocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      email: "newportal@example.com",
      firstName: "New",
      lastName: "Portal",
      role: UserRole.CLIENT,
      isActive: true,
    }));
    expect(replacePortalAccessScopeMock).toHaveBeenCalledWith(
      "tenant-1",
      "workspace-1",
      "client-1",
      "portal-user-1",
      { entries: [{ clientId: "client-1", accessLevel: ClientAccessLevel.VIEWER }] },
    );
    expect(storageMocks.createInvitation).not.toHaveBeenCalled();
    expect(storageMocks.createClientInvite).not.toHaveBeenCalled();
  });
});
