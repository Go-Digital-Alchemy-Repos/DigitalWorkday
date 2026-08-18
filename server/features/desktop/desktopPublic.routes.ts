import type { Express as ExpressApp, Request } from "express";
import { z } from "zod";
import { config } from "../../config";
import { storage } from "../../storage";
import { UserRole } from "@shared/schema";
import { createRateLimiter } from "../../middleware/rateLimit";
import {
  DESKTOP_CLIENT_ID,
  DESKTOP_REDIRECT_URI,
  exchangeDesktopAuthorizationCode,
  issueDesktopAuthorizationCode,
  revokeDesktopSessionByRefreshToken,
  rotateDesktopRefreshToken,
} from "./desktopAuth.service";

const desktopAuthLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequestsPerIP: 20,
  maxRequestsPerEmail: 0,
  keyPrefix: "desktop-auth",
});

const authorizationQuerySchema = z.object({
  client_id: z.literal(DESKTOP_CLIENT_ID),
  redirect_uri: z.literal(DESKTOP_REDIRECT_URI),
  response_type: z.literal("code"),
  code_challenge_method: z.literal("S256"),
  code_challenge: z.string().min(43).max(128).regex(/^[A-Za-z0-9_-]+$/),
  state: z.string().min(16).max(256),
});

type DesktopAuthorizationRequest = z.infer<typeof authorizationQuerySchema>;

function featureEnabled(res: import("express").Response): boolean {
  if (config.features.enableDesktopApi) return true;
  res.status(404).send("Not found");
  return false;
}

function storeAuthorizationRequest(req: Request, value: DesktopAuthorizationRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    (req.session as any).desktopAuthorizationRequest = value;
    req.session.save((error) => error ? reject(error) : resolve());
  });
}

async function completeAuthorization(req: Request, res: import("express").Response): Promise<void> {
  if (!featureEnabled(res)) return;
  if (!req.user || !(req.isAuthenticated && req.isAuthenticated())) {
    res.redirect("/login?desktop=1");
    return;
  }

  const pending = (req.session as any).desktopAuthorizationRequest as DesktopAuthorizationRequest | undefined;
  const parsed = authorizationQuerySchema.safeParse(pending);
  if (!parsed.success) {
    res.status(400).send("Desktop authorization request expired. Return to the Mac app and try again.");
    return;
  }

  const user = req.user!;
  if (user.role === UserRole.CLIENT || user.role === UserRole.SUPER_USER || !user.tenantId) {
    res.status(403).send("This account type is not supported by Digital Workday for Mac.");
    return;
  }
  const workspaces = await storage.getWorkspacesByUser(user.id);
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) {
    res.status(403).send("No workspace is available for this account.");
    return;
  }

  const code = await issueDesktopAuthorizationCode({
    userId: user.id,
    tenantId: user.tenantId,
    workspaceId,
    codeChallenge: parsed.data.code_challenge,
    redirectUri: parsed.data.redirect_uri,
  });
  delete (req.session as any).desktopAuthorizationRequest;
  const callback = new URL(parsed.data.redirect_uri);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", parsed.data.state);
  res.redirect(callback.toString());
}

export function mountDesktopPublicRoutes(app: ExpressApp): void {
  app.get("/desktop/authorize", desktopAuthLimiter, async (req, res, next) => {
    if (!featureEnabled(res)) return;
    const parsed = authorizationQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).send("Invalid desktop authorization request.");
      return;
    }
    try {
      await storeAuthorizationRequest(req, parsed.data);
      if (!req.user || !(req.isAuthenticated && req.isAuthenticated())) {
        res.redirect("/login?desktop=1");
        return;
      }
      await completeAuthorization(req, res);
    } catch (error) {
      next(error);
    }
  });

  app.get("/desktop/authorize/continue", desktopAuthLimiter, (req, res, next) => {
    completeAuthorization(req, res).catch(next);
  });

  app.post("/api/v1/desktop/auth/token", desktopAuthLimiter, async (req, res, next) => {
    if (!featureEnabled(res)) return;
    const schema = z.discriminatedUnion("grant_type", [
      z.object({
        grant_type: z.literal("authorization_code"),
        code: z.string().min(32).max(256),
        code_verifier: z.string().min(43).max(128),
        redirect_uri: z.literal(DESKTOP_REDIRECT_URI),
        client_id: z.literal(DESKTOP_CLIENT_ID),
        device_name: z.string().max(200).optional(),
      }),
      z.object({
        grant_type: z.literal("refresh_token"),
        refresh_token: z.string().min(32).max(256),
        client_id: z.literal(DESKTOP_CLIENT_ID),
        device_name: z.string().max(200).optional(),
      }),
    ]);
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      const result = parsed.data.grant_type === "authorization_code"
        ? await exchangeDesktopAuthorizationCode({
            code: parsed.data.code,
            codeVerifier: parsed.data.code_verifier,
            redirectUri: parsed.data.redirect_uri,
            deviceName: parsed.data.device_name,
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
          })
        : await rotateDesktopRefreshToken({
            refreshToken: parsed.data.refresh_token,
            deviceName: parsed.data.device_name,
          });
      if (!result) {
        res.status(401).json({ error: "invalid_grant" });
        return;
      }
      res.set("Cache-Control", "no-store");
      res.json({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        token_type: result.tokenType,
        expires_in: result.expiresIn,
        session_id: result.sessionId,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/desktop/auth/revoke", desktopAuthLimiter, async (req, res, next) => {
    if (!featureEnabled(res)) return;
    const parsed = z.object({ refresh_token: z.string().min(32).max(256) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      await revokeDesktopSessionByRefreshToken(parsed.data.refresh_token);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}
