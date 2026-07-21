import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@shared/schema";
import {
  getPolicyMiddleware,
  requireExplicitTenantContext,
} from "../../http/policy/requiredMiddleware";
import { AppError } from "../../lib/errors";

function makeReq(overrides: Partial<Request>): Request {
  return overrides as Request;
}

describe("required route policy middleware", () => {
  it("authTenant policy requires the explicit tenant-context guard", () => {
    const middleware = getPolicyMiddleware("authTenant");

    expect(middleware).toContain(requireExplicitTenantContext);
  });

  it("blocks super users without an effective tenant on tenant-scoped routes", () => {
    const req = makeReq({
      user: {
        id: "super-1",
        role: UserRole.SUPER_USER,
        tenantId: "super-own-tenant",
      } as any,
      tenant: {
        tenantId: "super-own-tenant",
        effectiveTenantId: null,
        isSuperUser: true,
      } as any,
    });
    const next = vi.fn<NextFunction>();

    requireExplicitTenantContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    const [error] = next.mock.calls[0];
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("TENANT_REQUIRED");
  });

  it("allows super users with an explicitly selected effective tenant", () => {
    const req = makeReq({
      user: {
        id: "super-1",
        role: UserRole.SUPER_USER,
        tenantId: "super-own-tenant",
      } as any,
      tenant: {
        tenantId: "super-own-tenant",
        effectiveTenantId: "tenant-selected",
        isSuperUser: true,
      } as any,
    });
    const next = vi.fn<NextFunction>();

    requireExplicitTenantContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("allows regular users with tenant context", () => {
    const req = makeReq({
      user: {
        id: "user-1",
        role: UserRole.ADMIN,
        tenantId: "tenant-1",
      } as any,
      tenant: {
        tenantId: "tenant-1",
        effectiveTenantId: "tenant-1",
        isSuperUser: false,
      } as any,
    });
    const next = vi.fn<NextFunction>();

    requireExplicitTenantContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
