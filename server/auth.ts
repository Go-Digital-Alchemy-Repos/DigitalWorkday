/**
 * Authentication Module
 * 
 * Purpose: Session-based authentication using Passport.js + passport-local strategy.
 * 
 * Key Invariants:
 * - Sessions stored in PostgreSQL (user_sessions table) for multi-replica support
 * - First registered user automatically becomes Super Admin (server-determined)
 * - Password hashing uses scrypt with 64-byte output and random salt
 * 
 * Sharp Edges:
 * - SESSION_SECRET must be set in production (falls back to dev secret)
 * - Role field in registration is ignored for first user (always super_user)
 * - Never expose passwordHash in session or API responses
 */
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy, type Profile as GoogleProfile } from "passport-google-oauth20";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { db } from "./db";
import { users, UserRole, ClientAccessLevel, platformInvitations, platformAuditEvents, invitations, clientInvites, tenants, tenantSettings, systemSettings, workspaces, passwordResetTokens } from "@shared/schema";
import { getWorkspaceMembershipRoleForUserRole } from "@shared/roles";
import { eq, sql, and, desc } from "drizzle-orm";
import { createHash } from "crypto";
import type { User } from "@shared/schema";
import type { Express, Request, RequestHandler, Response } from "express";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { isGoogleEmailAllowed } from "./auth/googleDomain";
import { 
  loginRateLimiter, 
  bootstrapRateLimiter, 
  inviteAcceptRateLimiter,
  forgotPasswordRateLimiter,
  userCreateRateLimiter 
} from "./middleware/rateLimit";
import { getClientDescendantIds } from "./services/customerAccessPermissions";

const scryptAsync = promisify(scrypt);
const GOOGLE_CALLBACK_PATH = "/api/v1/auth/google/callback";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getGoogleOAuthCallbackUrl(req?: Request): string {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URL) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URL;
  }

  const configuredBaseUrl = process.env.APP_PUBLIC_URL?.replace(/\/$/, "");
  if (configuredBaseUrl) {
    return `${configuredBaseUrl}${GOOGLE_CALLBACK_PATH}`;
  }

  if (req) {
    return `${req.protocol}://${req.get("host")}${GOOGLE_CALLBACK_PATH}`;
  }

  return `http://localhost:${process.env.PORT || "5000"}${GOOGLE_CALLBACK_PATH}`;
}

function redirectToLoginWithError(res: Response, message: string): void {
  res.redirect(`/login?error=${encodeURIComponent(message)}`);
}

async function resolveWorkspaceIdForLogin(user: Express.User): Promise<string | undefined> {
  const isSuperUser = user.role === UserRole.SUPER_USER;
  const userWorkspaces = await storage.getWorkspacesByUser(user.id);
  const workspaceId = userWorkspaces.length > 0 ? userWorkspaces[0].id : undefined;

  if (!isSuperUser && !workspaceId) {
    throw new Error("No workspace access. Please contact your administrator.");
  }

  return workspaceId;
}

async function finishLogin(req: Request, res: Response, user: Express.User): Promise<void> {
  const workspaceId = await resolveWorkspaceIdForLogin(user);
  req.session.workspaceId = workspaceId;

  req.session.save((saveErr) => {
    if (saveErr) {
      console.error("Session save error:", saveErr);
    }
    return res.json({ user, workspaceId });
  });
}

async function finishGoogleLogin(req: Request, res: Response, user: Express.User): Promise<void> {
  const workspaceId = await resolveWorkspaceIdForLogin(user);
  req.session.workspaceId = workspaceId;

  req.session.save((saveErr) => {
    if (saveErr) {
      console.error("[auth] Google OAuth session save error:", saveErr);
    }
    const destination = user.role === UserRole.SUPER_USER ? "/super-admin/dashboard" : "/";
    res.redirect(destination);
  });
}

function extractVerifiedGoogleProfile(profile: GoogleProfile): {
  email: string;
  verified: boolean;
  avatarUrl: string | null;
} {
  const primaryEmail = profile.emails?.[0];
  const raw = profile._json as { email?: string; email_verified?: boolean; verified_email?: boolean; picture?: string };
  const email = (primaryEmail?.value || raw.email || "").toLowerCase().trim();
  const verified =
    primaryEmail?.verified === true ||
    raw.email_verified === true ||
    raw.verified_email === true;
  const avatarUrl = typeof raw.picture === "string" && raw.picture.trim()
    ? raw.picture.trim()
    : profile.photos?.[0]?.value || null;

  return { email, verified, avatarUrl };
}

declare global {
  namespace Express {
    interface User extends Omit<import("@shared/schema").User, "passwordHash"> {}
  }
}

declare module "express-session" {
  interface SessionData {
    workspaceId?: string;
  }
}

// Singleton session middleware for reuse in Socket.IO
let sessionMiddlewareInstance: ReturnType<typeof session> | null = null;

/**
 * Get the session middleware instance (for use in Socket.IO).
 * Must call setupAuth first.
 */
export function getSessionMiddleware(): ReturnType<typeof session> {
  if (!sessionMiddlewareInstance) {
    throw new Error("Session middleware not initialized. Call setupAuth first.");
  }
  return sessionMiddlewareInstance;
}

export function setupAuth(app: Express): void {
  // SECURITY: Fail fast in production if SESSION_SECRET is not configured
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error(
      "FATAL: SESSION_SECRET environment variable is required in production. " +
      "Sessions cannot be securely encrypted without it. " +
      "Set SESSION_SECRET to a strong random string (minimum 32 characters)."
    );
  }

  const PgSession = connectPgSimple(session);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Create session table manually if it doesn't exist
  pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
  `).catch(err => console.error("Session table creation error:", err));

  sessionMiddlewareInstance = session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: false, // We create it manually above
    }),
    secret: process.env.SESSION_SECRET || "dasana-dev-secret-key",
    resave: false,
    saveUninitialized: false,
    name: process.env.NODE_ENV === "production" ? "__Host-sid" : "connect.sid",
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });

  app.use(sessionMiddlewareInstance);
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email.toLowerCase().trim());
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }
          if (!user.isActive) {
            return done(null, false, { message: "Account is deactivated" });
          }
          if (!user.passwordHash) {
            return done(null, false, { message: "Account requires password setup" });
          }
          const isValid = await comparePasswords(password, user.passwordHash);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }
          const { passwordHash, ...userWithoutPassword } = user;
          return done(null, userWithoutPassword);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  if (isGoogleOAuthConfigured()) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: getGoogleOAuthCallbackUrl(),
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const { email, verified, avatarUrl } = extractVerifiedGoogleProfile(profile);

            if (!email) {
              return done(null, false, { message: "Could not get email from Google" });
            }

            if (!verified) {
              return done(null, false, { message: "Google account email is not verified" });
            }

            if (!isGoogleEmailAllowed(email)) {
              return done(null, false, { message: "This Google account is not allowed for this app" });
            }

            const [linkedUser] = await db.select().from(users).where(eq(users.googleId, profile.id)).limit(1);
            let user = linkedUser || await storage.getUserByEmail(email);

            if (!user) {
              return done(null, false, { message: "No DigitalWorkday account found. Please ask an administrator for an invite." });
            }

            if (!user.isActive) {
              return done(null, false, { message: "Account is deactivated" });
            }

            if (user.googleId && user.googleId !== profile.id) {
              return done(null, false, { message: "This email is already linked to another Google account" });
            }

            if (!user.googleId || (!user.avatarUrl && avatarUrl)) {
              const [updatedUser] = await db.update(users)
                .set({
                  googleId: user.googleId || profile.id,
                  avatarUrl: user.avatarUrl || avatarUrl,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, user.id))
                .returning();
              user = updatedUser;
            }

            const { passwordHash, ...userWithoutPassword } = user;
            return done(null, userWithoutPassword);
          } catch (error) {
            return done(error as Error);
          }
        }
      )
    );
  }

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      const { passwordHash, ...userWithoutPassword } = user;
      done(null, userWithoutPassword);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/auth/login", loginRateLimiter, (req, res, next) => {
    passport.authenticate("local", async (err: Error | null, user: Express.User | false, info: { message: string }) => {
      if (err) {
        return res.status(500).json({ error: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ error: "Login failed" });
        }
        
        try {
          await finishLogin(req, res, user);
        } catch (workspaceErr) {
          console.error("Workspace lookup error:", workspaceErr);
          req.logout(() => {});
          const message = workspaceErr instanceof Error ? workspaceErr.message : "Failed to resolve workspace";
          const status = message.startsWith("No workspace access") ? 403 : 500;
          return res.status(status).json({ error: message });
        }
      });
    })(req, res, next);
  });

  app.get("/api/v1/auth/google/status", (_req, res) => {
    res.json({ enabled: isGoogleOAuthConfigured() });
  });

  app.get("/api/v1/auth/google", loginRateLimiter, (req, res, next) => {
    if (!isGoogleOAuthConfigured()) {
      return redirectToLoginWithError(res, "Google authentication is not configured");
    }

    passport.authenticate("google", {
      scope: ["profile", "email"],
      prompt: "select_account",
    })(req, res, next);
  });

  app.get("/api/v1/auth/google/callback", (req, res, next) => {
    if (!isGoogleOAuthConfigured()) {
      return redirectToLoginWithError(res, "Google authentication is not configured");
    }

    passport.authenticate("google", {
      session: false,
    }, (err: Error | null, user: Express.User | false, info: { message?: string }) => {
      if (err) {
        console.error("[auth] Google OAuth callback error:", err);
        return redirectToLoginWithError(res, "Google authentication failed");
      }

      if (!user) {
        return redirectToLoginWithError(res, info?.message || "Google authentication failed");
      }

      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          console.error("[auth] Google OAuth login error:", loginErr);
          return redirectToLoginWithError(res, "Login failed");
        }

        try {
          await finishGoogleLogin(req, res, user);
        } catch (workspaceErr) {
          console.error("[auth] Google OAuth workspace lookup error:", workspaceErr);
          req.logout(() => {});
          const message = workspaceErr instanceof Error ? workspaceErr.message : "Failed to resolve workspace";
          return redirectToLoginWithError(res, message);
        }
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error("Session destroy error:", sessionErr);
        }
        const isProduction = process.env.NODE_ENV === "production";
        const cookieName = isProduction ? "__Host-sid" : "connect.sid";
        res.clearCookie(cookieName, {
          path: "/",
          httpOnly: true,
          secure: isProduction,
          sameSite: "lax",
        });
        res.json({ success: true });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    // Prevent caching to ensure fresh user data (especially for avatar updates)
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user as any;
    const session = req.session as any;
    
    // Debug logging for tenant context issues
    const debugTenantContext = process.env.DEBUG_TENANT_CONTEXT === "true";
    if (debugTenantContext) {
      console.log("[auth/me] Session ID:", req.sessionID);
      console.log("[auth/me] User ID:", user?.id);
      console.log("[auth/me] User email:", user?.email);
      console.log("[auth/me] User role:", user?.role);
      console.log("[auth/me] User tenantId:", user?.tenantId);
      console.log("[auth/me] Session keys:", Object.keys(session || {}));
    }
    
    // Debug logging for avatar issues (enable with DEBUG_AVATAR=true)
    if (process.env.DEBUG_AVATAR === "true") {
      console.log("[auth/me] Session ID:", req.sessionID);
      console.log("[auth/me] User ID:", user?.id);
      console.log("[auth/me] User avatarUrl:", user?.avatarUrl);
    }
    
    // Include impersonation context if active
    const impersonation = session.isImpersonatingUser ? {
      isImpersonating: true,
      impersonatedUser: {
        id: session.impersonatedUserId,
        email: session.impersonatedUserEmail,
        role: session.impersonatedUserRole,
      },
      impersonatedTenant: {
        id: session.impersonatedTenantId,
        name: session.impersonatedTenantName,
      },
      originalSuperUser: {
        id: session.originalSuperUserId,
        email: session.originalSuperUserEmail,
      },
      startedAt: session.impersonationStartedAt,
    } : null;
    
    res.json({ 
      user: req.user, 
      workspaceId: req.session.workspaceId,
      tenantId: user?.tenantId || null,
      impersonation,
    });
  });

  /**
   * Registration endpoint with first-user bootstrap
   * The first user to register becomes a Super Admin automatically
   * Subsequent users get the default role (employee)
   * 
   * SECURITY: The role field is NEVER accepted from the client.
   * The role is determined automatically based on whether users exist.
   */
  app.post("/api/auth/register", userCreateRateLimiter, async (req, res) => {
    try {
      const { email: rawEmail, password, firstName, lastName } = req.body;
      const email = rawEmail?.toLowerCase().trim();

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Atomic check: is this the first user? (with transaction for concurrency safety)
      const result = await db.transaction(async (tx) => {
        // Count existing users within transaction
        const countResult = await tx.execute(sql`SELECT COUNT(*)::int as count FROM users`);
        const userCount = (countResult.rows[0] as { count: number }).count;
        
        // Determine role: first user becomes super_user, others get employee
        const role = userCount === 0 ? UserRole.SUPER_USER : UserRole.EMPLOYEE;
        
        // Hash password
        const passwordHash = await hashPassword(password);
        
        // Create user
        const [newUser] = await tx.insert(users).values({
          email,
          name: `${firstName || ""} ${lastName || ""}`.trim() || email,
          firstName: firstName || null,
          lastName: lastName || null,
          passwordHash,
          role,
          isActive: true,
          tenantId: null,
        }).returning();

        return { user: newUser, isFirstUser: userCount === 0 };
      });

      // Don't expose password hash in response
      const { passwordHash: _, ...userWithoutPassword } = result.user;

      console.log(`[auth] User registered: ${email}, role: ${result.user.role}${result.isFirstUser ? " (first user - auto super admin)" : ""}`);

      res.status(201).json({ 
        user: userWithoutPassword,
        message: result.isFirstUser 
          ? "Account created. You are the first user and have been granted Super Admin access."
          : "Account created successfully."
      });
    } catch (error) {
      console.error("[auth] Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

/**
 * Bootstrap endpoints for first-user registration
 * These are separate from regular registration and only work when no users exist.
 */
export function setupBootstrapEndpoints(app: Express): void {
  /**
   * GET /api/v1/auth/bootstrap-status
   * Returns whether bootstrap registration is required (no users exist)
   */
  app.get("/api/v1/auth/bootstrap-status", async (_req, res) => {
    try {
      const countResult = await db.execute(sql`SELECT COUNT(*)::int as count FROM users`);
      const userCount = (countResult.rows[0] as { count: number }).count;
      
      res.json({
        bootstrapRequired: userCount === 0,
      });
    } catch (error) {
      console.error("[auth] bootstrap-status error:", error);
      res.status(500).json({ error: "Failed to check bootstrap status" });
    }
  });

  /**
   * GET /api/v1/auth/login-branding
   * Returns tenant branding for the login page (public, no auth required).
   * Returns the first active tenant's settings that has branding configured.
   */
  app.get("/api/v1/auth/login-branding", async (_req, res) => {
    try {
      // Fetch system-level defaults first
      const [sys] = await db.select().from(systemSettings).limit(1);

      // Fetch the first active tenant's branding overrides
      const tenantResult = await db
        .select({
          appName: tenantSettings.appName,
          displayName: tenantSettings.displayName,
          loginMessage: tenantSettings.loginMessage,
          logoUrl: tenantSettings.logoUrl,
          iconUrl: tenantSettings.iconUrl,
          faviconUrl: tenantSettings.faviconUrl,
          primaryColor: tenantSettings.primaryColor,
        })
        .from(tenantSettings)
        .innerJoin(tenants, eq(tenants.id, tenantSettings.tenantId))
        .where(eq(tenants.status, "active"))
        .limit(1);

      const tenant = tenantResult[0] || null;

      // Resolution chain: tenant setting → system default → null
      const appName    = tenant?.appName || tenant?.displayName || sys?.defaultAppName || null;
      const logoUrl    = tenant?.logoUrl    || sys?.defaultLogoUrl    || null;
      const iconUrl    = tenant?.iconUrl    || sys?.defaultIconUrl    || null;
      const faviconUrl = tenant?.faviconUrl || sys?.defaultFaviconUrl || null;
      const primaryColor = tenant?.primaryColor || sys?.defaultPrimaryColor || null;

      res.json({
        appName,
        loginMessage: tenant?.loginMessage || null,
        logoUrl,
        iconUrl,
        faviconUrl,
        primaryColor,
      });
    } catch (error) {
      console.error("[auth] login-branding error:", error);
      res.json({ appName: null, loginMessage: null, logoUrl: null, iconUrl: null, faviconUrl: null, primaryColor: null });
    }
  });

  /**
   * GET /api/v1/auth/dev-accounts
   * Returns test account credentials for programmatic testing.
   * Only available when DEV_AUTO_LOGIN is explicitly enabled.
   */
  if (process.env.DEV_AUTO_LOGIN === "true" && process.env.NODE_ENV !== "production") {
    app.get("/api/v1/auth/dev-accounts", (_req, res) => {
      res.json({
        accounts: [
          { role: "super_admin", email: "admin@myworkday.dev", password: "SuperAdmin123!", name: "Dev Super Admin" },
          { role: "tenant_admin", email: "alex@brightstudio.com", password: "Password123!", name: "Alex Rivera" },
          { role: "tenant_member", email: "mike@brightstudio.com", password: "Password123!", name: "Mike Johnson" },
        ],
      });
    });
  }

  /**
   * POST /api/v1/auth/bootstrap-register
   * Creates the first super admin account (only when no users exist)
   * Logs the user in immediately after creation.
   */
  app.post("/api/v1/auth/bootstrap-register", bootstrapRateLimiter, async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({ 
          error: { code: "VALIDATION_ERROR", message: "Email and password are required" },
          code: "VALIDATION_ERROR",
          message: "Email and password are required"
        });
      }

      if (password.length < 8) {
        return res.status(400).json({ 
          error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" },
          code: "VALIDATION_ERROR",
          message: "Password must be at least 8 characters"
        });
      }

      // Atomic check + create in transaction with SERIALIZABLE isolation for concurrency safety
      const result = await db.transaction(async (tx) => {
        // Set transaction isolation to SERIALIZABLE to prevent race conditions
        await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
        
        // Lock the users table to prevent concurrent bootstrap attempts
        await tx.execute(sql`LOCK TABLE users IN EXCLUSIVE MODE`);
        
        // Re-check user count inside transaction
        const countResult = await tx.execute(sql`SELECT COUNT(*)::int as count FROM users`);
        const userCount = (countResult.rows[0] as { count: number }).count;
        
        if (userCount > 0) {
          return { error: "REGISTRATION_DISABLED" };
        }

        // Check if email is already in use (shouldn't happen if count is 0, but be safe)
        const existingUsers = await tx.select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUsers.length > 0) {
          return { error: "EMAIL_EXISTS" };
        }

        // Hash password and create super user
        const passwordHash = await hashPassword(password);
        
        const [newUser] = await tx.insert(users).values({
          email,
          name: `${firstName || ""} ${lastName || ""}`.trim() || email,
          firstName: firstName || null,
          lastName: lastName || null,
          passwordHash,
          role: UserRole.SUPER_USER,
          isActive: true,
          tenantId: null,
        }).returning();

        return { user: newUser };
      });

      // Handle transaction results
      if ("error" in result) {
        if (result.error === "REGISTRATION_DISABLED") {
          return res.status(403).json({
            error: { code: "REGISTRATION_DISABLED", message: "Registration is disabled. Users already exist." },
            code: "REGISTRATION_DISABLED",
            message: "Registration is disabled. Users already exist."
          });
        }
        if (result.error === "EMAIL_EXISTS") {
          return res.status(409).json({
            error: { code: "CONFLICT", message: "Email already registered" },
            code: "CONFLICT",
            message: "Email already registered"
          });
        }
      }

      const { passwordHash: _, ...userWithoutPassword } = result.user!;

      // Log in the user immediately
      req.logIn(userWithoutPassword as Express.User, (loginErr) => {
        if (loginErr) {
          console.error("[auth] bootstrap login error:", loginErr);
          return res.status(201).json({ 
            user: userWithoutPassword,
            message: "Account created but auto-login failed. Please log in manually.",
            autoLoginFailed: true,
          });
        }

        // Save session
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth] session save error:", saveErr);
          }

          // Log bootstrap event
          console.log(JSON.stringify({
            level: "info",
            component: "auth",
            event: "bootstrap_register_created_super_admin",
            userId: userWithoutPassword.id,
            email: userWithoutPassword.email,
            requestId: req.requestId || "unknown",
            timestamp: new Date().toISOString(),
          }));

          res.status(201).json({ 
            user: userWithoutPassword,
            message: "Super Admin account created successfully.",
            autoLoginFailed: false,
          });
        });
      });
    } catch (error) {
      console.error("[auth] bootstrap-register error:", error);
      res.status(500).json({ 
        error: { code: "INTERNAL_ERROR", message: "Registration failed" },
        code: "INTERNAL_ERROR",
        message: "Registration failed"
      });
    }
  });
}

/**
 * Platform invite endpoints for onboarding new platform administrators.
 * Allows invited admins to verify their invite token and set their password.
 */
export function setupPlatformInviteEndpoints(app: Express): void {
  /**
   * GET /api/v1/auth/platform-invite/verify
   * Verifies a platform invite token and returns the target user's email.
   * Does not require authentication.
   */
  app.get("/api/v1/auth/platform-invite/verify", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Token is required" },
          code: "VALIDATION_ERROR",
          message: "Token is required"
        });
      }
      
      // Hash the token to compare with stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      // Find the invite
      const [invite] = await db.select()
        .from(platformInvitations)
        .where(eq(platformInvitations.tokenHash, tokenHash))
        .limit(1);
      
      if (!invite) {
        return res.status(404).json({
          error: { code: "INVALID_TOKEN", message: "Invalid or expired invite link" },
          code: "INVALID_TOKEN",
          message: "Invalid or expired invite link"
        });
      }
      
      // Check if already used
      if (invite.status === "accepted" || invite.usedAt) {
        return res.status(410).json({
          error: { code: "TOKEN_ALREADY_USED", message: "This invite has already been used" },
          code: "TOKEN_ALREADY_USED",
          message: "This invite has already been used"
        });
      }
      
      // Check if revoked
      if (invite.status === "revoked") {
        return res.status(410).json({
          error: { code: "TOKEN_REVOKED", message: "This invite has been revoked" },
          code: "TOKEN_REVOKED",
          message: "This invite has been revoked"
        });
      }
      
      // Check if expired
      if (new Date() > invite.expiresAt) {
        return res.status(410).json({
          error: { code: "TOKEN_EXPIRED", message: "This invite has expired" },
          code: "TOKEN_EXPIRED",
          message: "This invite has expired"
        });
      }
      
      // Get target user info
      const [targetUser] = invite.targetUserId ? await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      }).from(users)
        .where(eq(users.id, invite.targetUserId)) : [];
      
      res.json({
        valid: true,
        email: invite.email,
        expiresAt: invite.expiresAt.toISOString(),
        role: "super_user",
        targetUser: targetUser || null,
      });
    } catch (error) {
      console.error("[auth] platform-invite/verify error:", error);
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to verify invite" },
        code: "INTERNAL_ERROR",
        message: "Failed to verify invite"
      });
    }
  });

  /**
   * POST /api/v1/auth/platform-invite/accept
   * Accepts a platform invite, sets the user's password, and logs them in.
   */
  app.post("/api/v1/auth/platform-invite/accept", inviteAcceptRateLimiter, async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Token and password are required" },
          code: "VALIDATION_ERROR",
          message: "Token and password are required"
        });
      }
      
      if (password.length < 8) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" },
          code: "VALIDATION_ERROR",
          message: "Password must be at least 8 characters"
        });
      }
      
      // Hash the token to compare with stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      // Find the invite
      const [invite] = await db.select()
        .from(platformInvitations)
        .where(eq(platformInvitations.tokenHash, tokenHash))
        .limit(1);
      
      if (!invite) {
        return res.status(404).json({
          error: { code: "INVALID_TOKEN", message: "Invalid invite link" },
          code: "INVALID_TOKEN",
          message: "Invalid invite link"
        });
      }
      
      // Validate invite status
      if (invite.status === "accepted" || invite.usedAt) {
        return res.status(410).json({
          error: { code: "TOKEN_ALREADY_USED", message: "This invite has already been used" },
          code: "TOKEN_ALREADY_USED",
          message: "This invite has already been used"
        });
      }
      
      if (invite.status === "revoked") {
        return res.status(410).json({
          error: { code: "TOKEN_REVOKED", message: "This invite has been revoked" },
          code: "TOKEN_REVOKED",
          message: "This invite has been revoked"
        });
      }
      
      if (new Date() > invite.expiresAt) {
        return res.status(410).json({
          error: { code: "TOKEN_EXPIRED", message: "This invite has expired" },
          code: "TOKEN_EXPIRED",
          message: "This invite has expired"
        });
      }
      
      if (!invite.targetUserId) {
        return res.status(400).json({
          error: { code: "INVALID_INVITE", message: "This invite is not linked to a user" },
          code: "INVALID_INVITE",
          message: "This invite is not linked to a user"
        });
      }
      
      // Update user with password hash
      const passwordHash = await hashPassword(password);
      
      const [updatedUser] = await db.update(users)
        .set({ passwordHash })
        .where(eq(users.id, invite.targetUserId))
        .returning();
      
      // Mark invite as accepted
      await db.update(platformInvitations)
        .set({ status: "accepted", usedAt: new Date() })
        .where(eq(platformInvitations.id, invite.id));
      
      // Log audit event
      await db.insert(platformAuditEvents).values({
        actorUserId: invite.targetUserId,
        targetUserId: invite.targetUserId,
        eventType: "platform_admin_invite_accepted",
        message: `Platform admin invite accepted for ${invite.email}`,
        metadata: { inviteId: invite.id },
      });
      
      // Log in the user
      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      
      req.logIn(userWithoutPassword as Express.User, (loginErr) => {
        if (loginErr) {
          console.error("[auth] platform-invite login error:", loginErr);
          return res.status(200).json({
            success: true,
            user: userWithoutPassword,
            message: "Password set successfully. Please log in.",
            autoLoginFailed: true,
          });
        }
        
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth] session save error:", saveErr);
          }
          
          console.log(JSON.stringify({
            level: "info",
            component: "auth",
            event: "platform_invite_accepted",
            userId: userWithoutPassword.id,
            email: userWithoutPassword.email,
            timestamp: new Date().toISOString(),
          }));
          
          res.json({
            success: true,
            user: userWithoutPassword,
            message: "Account activated successfully.",
            autoLoginFailed: false,
          });
        });
      });
    } catch (error) {
      console.error("[auth] platform-invite/accept error:", error);
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to accept invite" },
        code: "INTERNAL_ERROR",
        message: "Failed to accept invite"
      });
    }
  });
}

/**
 * Tenant invite endpoints for onboarding new tenant users.
 * Allows invited users to verify their invite token and set their password.
 * These are PUBLIC endpoints - no authentication required.
 */
export function setupTenantInviteEndpoints(app: Express): void {
  /**
   * GET /api/v1/public/invites/validate
   * Validates a tenant invite token and returns safe preview info.
   * Does not require authentication.
   */
  app.get("/api/v1/public/invites/validate", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Token is required" },
          code: "VALIDATION_ERROR",
          message: "Token is required"
        });
      }
      
      // Hash the token to compare with stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      // Find the invite with tenant and workspace info
      const [invite] = await db.select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        usedAt: invitations.usedAt,
        tenantId: invitations.tenantId,
        workspaceId: invitations.workspaceId,
        clientId: invitations.clientId,
      })
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);
      
      if (!invite) {
        return res.status(404).json({
          ok: false,
          error: { code: "INVALID_TOKEN", message: "Invalid or expired invite link" },
          code: "INVALID_TOKEN",
          message: "Invalid or expired invite link"
        });
      }
      
      // Check if already used
      if (invite.status === "accepted" || invite.usedAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_ALREADY_USED", message: "This invite has already been used" },
          code: "TOKEN_ALREADY_USED",
          message: "This invite has already been used"
        });
      }
      
      // Check if revoked
      if (invite.status === "revoked") {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_REVOKED", message: "This invite has been revoked" },
          code: "TOKEN_REVOKED",
          message: "This invite has been revoked"
        });
      }
      
      // Check if expired
      if (new Date() > invite.expiresAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_EXPIRED", message: "This invite has expired" },
          code: "TOKEN_EXPIRED",
          message: "This invite has expired"
        });
      }
      
      // Get tenant name
      let tenantName = "Unknown Organization";
      if (invite.tenantId) {
        const [tenant] = await db.select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, invite.tenantId))
          .limit(1);
        if (tenant) {
          tenantName = tenant.name;
        }
      }
      
      // Get workspace name
      let workspaceName = "Unknown Workspace";
      const [workspace] = await db.select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, invite.workspaceId))
        .limit(1);
      if (workspace) {
        workspaceName = workspace.name;
      }
      
      // Mask email for privacy (show first 2 chars + domain)
      const [localPart, domain] = invite.email.split("@");
      const maskedEmail = localPart.length > 2 
        ? `${localPart.substring(0, 2)}***@${domain}`
        : `***@${domain}`;
      
      res.json({
        ok: true,
        emailMasked: maskedEmail,
        email: invite.email, // Full email for form pre-fill
        tenantName,
        workspaceName,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("[auth] tenant-invite/validate error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to validate invite" },
        code: "INTERNAL_ERROR",
        message: "Failed to validate invite"
      });
    }
  });

  /**
   * POST /api/v1/public/invites/accept
   * Accepts a tenant invite, creates/activates user, sets password, and logs them in.
   * Does not require authentication.
   */
  app.post("/api/v1/public/invites/accept", inviteAcceptRateLimiter, async (req, res) => {
    try {
      const { token, password, firstName, lastName } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Token and password are required" },
          code: "VALIDATION_ERROR",
          message: "Token and password are required"
        });
      }
      
      if (password.length < 8) {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" },
          code: "VALIDATION_ERROR",
          message: "Password must be at least 8 characters"
        });
      }
      
      // Hash the token to compare with stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      // Find the invite
      const [invite] = await db.select()
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);
      
      if (!invite) {
        return res.status(404).json({
          ok: false,
          error: { code: "INVALID_TOKEN", message: "Invalid invite link" },
          code: "INVALID_TOKEN",
          message: "Invalid invite link"
        });
      }
      
      // Validate invite status
      if (invite.status === "accepted" || invite.usedAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_ALREADY_USED", message: "This invite has already been used" },
          code: "TOKEN_ALREADY_USED",
          message: "This invite has already been used"
        });
      }
      
      if (invite.status === "revoked") {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_REVOKED", message: "This invite has been revoked" },
          code: "TOKEN_REVOKED",
          message: "This invite has been revoked"
        });
      }
      
      if (new Date() > invite.expiresAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_EXPIRED", message: "This invite has expired" },
          code: "TOKEN_EXPIRED",
          message: "This invite has expired"
        });
      }
      
      // Hash the password
      const passwordHash = await hashPassword(password);
      const isClientInvite = invite.role === UserRole.CLIENT;
      const [clientInviteAudit] = isClientInvite
        ? await db.select()
          .from(clientInvites)
          .where(and(
            eq(clientInvites.tokenPlaceholder, tokenHash),
            eq(clientInvites.email, invite.email),
          ))
          .orderBy(desc(clientInvites.createdAt))
          .limit(1)
        : [];
      
      // Check if user with this email already exists
      let user = await storage.getUserByEmail(invite.email);
      
      if (user) {
        if (isClientInvite && user.role !== UserRole.CLIENT) {
          return res.status(409).json({
            ok: false,
            error: { code: "EMAIL_ALREADY_IN_USE", message: "This email belongs to an internal account and cannot accept a client portal invite." },
            code: "EMAIL_ALREADY_IN_USE",
            message: "This email belongs to an internal account and cannot accept a client portal invite."
          });
        }

        if (isClientInvite && user.tenantId && user.tenantId !== invite.tenantId) {
          return res.status(409).json({
            ok: false,
            error: { code: "TENANT_MISMATCH", message: "This invite belongs to a different organization than the existing user account." },
            code: "TENANT_MISMATCH",
            message: "This invite belongs to a different organization than the existing user account."
          });
        }

        // Update existing user with password and activate
        const [updatedUser] = await db.update(users)
          .set({
            passwordHash,
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
            tenantId: user.tenantId || invite.tenantId,
            isActive: true,
            mustChangePasswordOnNextLogin: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
        user = updatedUser;
      } else {
        // Create new user
        const displayName = [firstName, lastName].filter(Boolean).join(" ") || invite.email.split("@")[0];
        const [newUser] = await db.insert(users)
          .values({
            name: displayName,
            email: invite.email,
            passwordHash,
            firstName: firstName || null,
            lastName: lastName || null,
            role: invite.role === UserRole.ADMIN
              ? UserRole.ADMIN
              : invite.role === UserRole.PROJECT_MANAGER
                ? UserRole.PROJECT_MANAGER
                : invite.role === UserRole.CLIENT
                  ? UserRole.CLIENT
                  : UserRole.EMPLOYEE,
            tenantId: invite.tenantId,
            isActive: true,
            mustChangePasswordOnNextLogin: false,
          })
          .returning();
        user = newUser;
        
        // Add user to workspace
        await storage.addWorkspaceMember({
          userId: user.id,
          workspaceId: invite.workspaceId,
          role: getWorkspaceMembershipRoleForUserRole(invite.role),
        });
      }

      if (isClientInvite) {
        if (!invite.clientId) {
          return res.status(400).json({
            ok: false,
            error: { code: "INVALID_INVITE", message: "Client portal invite is missing client access details." },
            code: "INVALID_INVITE",
            message: "Client portal invite is missing client access details."
          });
        }

        const accessLevel = clientInviteAudit?.roleHint === ClientAccessLevel.COLLABORATOR
          ? ClientAccessLevel.COLLABORATOR
          : ClientAccessLevel.VIEWER;
        const auditAccessClientIds: string[] = Array.isArray(clientInviteAudit?.accessClientIds) && clientInviteAudit.accessClientIds.length > 0
          ? clientInviteAudit.accessClientIds
          : [invite.clientId];
        const allowedAccessClientIds: string[] = invite.tenantId
          ? [invite.clientId, ...(await getClientDescendantIds(invite.clientId, invite.tenantId))]
          : [invite.clientId];
        const scopedClientIds: string[] = [...new Set<string>(auditAccessClientIds)].filter((clientId) => allowedAccessClientIds.includes(clientId));
        if (!scopedClientIds.includes(invite.clientId)) scopedClientIds.unshift(invite.clientId);

        for (const scopedClientId of scopedClientIds) {
          const existingAccess = await storage.getClientUserAccessByUserAndClient(user.id, scopedClientId);
          if (!existingAccess) {
            await storage.addClientUserAccess({
              workspaceId: invite.workspaceId,
              clientId: scopedClientId,
              userId: user.id,
              accessLevel,
            });
          }
        }

        if (clientInviteAudit) {
          await storage.updateClientInvite(clientInviteAudit.id, {
            status: "accepted",
          });
        }
      }
      
      // Mark invite as accepted
      await db.update(invitations)
        .set({
          status: "accepted",
          usedAt: new Date(),
        })
        .where(eq(invitations.id, invite.id));
      
      // Log the user in (establish session)
      const { passwordHash: _, ...userWithoutPassword } = user;
      
      req.login(userWithoutPassword, (loginErr) => {
        if (loginErr) {
          console.error("[auth] tenant-invite login error:", loginErr);
          return res.json({
            ok: true,
            success: true,
            user: userWithoutPassword,
            message: "Account activated. Please log in manually.",
            autoLoginFailed: true,
          });
        }
        
        // Set workspace in session
        req.session.workspaceId = invite.workspaceId;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth] session save error:", saveErr);
          }
          
          console.log(JSON.stringify({
            level: "info",
            component: "auth",
            event: "tenant_invite_accepted",
            userId: userWithoutPassword.id,
            email: userWithoutPassword.email,
            tenantId: invite.tenantId,
            workspaceId: invite.workspaceId,
            timestamp: new Date().toISOString(),
          }));
          
          res.json({
            ok: true,
            success: true,
            user: userWithoutPassword,
            message: "Account activated successfully.",
            autoLoginFailed: false,
          });
        });
      });
    } catch (error) {
      console.error("[auth] tenant-invite/accept error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to accept invite" },
        code: "INTERNAL_ERROR",
        message: "Failed to accept invite"
      });
    }
  });
}

/**
 * Password Reset Endpoints
 * 
 * Implements forgot password flow with optional email delivery.
 * - POST /api/v1/auth/forgot-password - Request a password reset
 * - POST /api/v1/auth/reset-password - Reset password with token
 * - GET /api/v1/auth/reset-password/validate - Validate a reset token
 * 
 * Security:
 * - Tokens are hashed before storage (SHA-256)
 * - Rate limited to prevent abuse
 * - Generic response to prevent email enumeration
 * - Short token expiry (30 minutes)
 */
export function setupPasswordResetEndpoints(app: Express): void {
  /**
   * POST /api/v1/auth/forgot-password
   * Request a password reset link. Always returns success to prevent email enumeration.
   */
  app.post("/api/v1/auth/forgot-password", forgotPasswordRateLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Email is required" },
          message: "Email is required"
        });
      }
      
      // Always respond with success to prevent email enumeration
      const genericResponse = {
        ok: true,
        message: "If an account exists with that email, you will receive password reset instructions."
      };
      
      // Find user by email
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      
      if (!user) {
        // User doesn't exist, but we don't reveal this
        console.log(`[auth] forgot-password: no user found for ${email}`);
        return res.json(genericResponse);
      }
      
      if (!user.isActive) {
        // User is deactivated, don't reveal this
        console.log(`[auth] forgot-password: user ${email} is deactivated`);
        return res.json(genericResponse);
      }
      
      // Generate reset token
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      
      // Store token hash
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
        createdByUserId: null, // User-initiated
      });
      
      // Generate reset URL
      const appPublicUrl = process.env.APP_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${appPublicUrl}/auth/reset-password?token=${token}`;
      
      // Log for audit
      console.log(JSON.stringify({
        level: "info",
        component: "auth",
        event: "password_reset_requested",
        userId: user.id,
        email: user.email,
        timestamp: new Date().toISOString(),
      }));
      
      let emailSent = false;
      let emailError: string | null = null;
      
      try {
        const { emailOutboxService } = await import("./services/emailOutbox");
        const { emailTemplateService } = await import("./services/emailTemplates");
        
        const templateVars: Record<string, string> = {
          userName: user.name || user.email,
          userEmail: user.email,
          resetUrl,
          expiryMinutes: "30",
          appName: "MyWorkDay",
        };
        
        const rendered = await emailTemplateService.renderByKey(user.tenantId, "forgot_password", templateVars);
        
        const subject = rendered?.subject || "Password Reset Request";
        const textBody = rendered?.textBody || `You requested a password reset.\n\nReset your password: ${resetUrl}\n\nThis link expires in 30 minutes.`;
        const htmlBody = rendered?.htmlBody || `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;"><h2>Password Reset Request</h2><p>You requested a password reset.</p><p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p><p style="color: #666; font-size: 14px;">This link expires in 30 minutes.</p></div>`;
        
        const result = await emailOutboxService.sendEmail({
          tenantId: user.tenantId,
          messageType: "forgot_password",
          toEmail: user.email,
          subject,
          textBody,
          htmlBody,
          requestId: req.requestId,
          metadata: { userId: user.id },
        });
        
        emailSent = result.success;
        if (!result.success) {
          emailError = result.error || "Unknown error sending email";
        }
      } catch (error: any) {
        emailError = error.message || "Failed to send email";
        console.error("[auth] Password reset email error:", error);
      }
      
      // Always log email delivery outcome (never log reset URL in production)
      if (!emailSent) {
        console.error(JSON.stringify({
          level: "error",
          component: "auth",
          event: "password_reset_email_failed",
          userId: user.id,
          email: user.email,
          error: emailError,
          timestamp: new Date().toISOString(),
        }));
      }
      if (process.env.NODE_ENV !== "production" && !emailSent) {
        console.log(`[auth] Password reset URL for ${email}: ${resetUrl}`);
      }
      
      res.json(genericResponse);
    } catch (error) {
      console.error("[auth] forgot-password error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to process request" },
        message: "Failed to process request"
      });
    }
  });

  /**
   * GET /api/v1/auth/reset-password/validate
   * Validate a password reset token before showing the form.
   */
  app.get("/api/v1/auth/reset-password/validate", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Token is required" },
          message: "Token is required"
        });
      }
      
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      const [resetToken] = await db.select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1);
      
      if (!resetToken) {
        return res.status(404).json({
          ok: false,
          error: { code: "INVALID_TOKEN", message: "Invalid or expired reset link" },
          message: "Invalid or expired reset link"
        });
      }
      
      if (resetToken.usedAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_ALREADY_USED", message: "This reset link has already been used" },
          message: "This reset link has already been used"
        });
      }
      
      if (new Date() > resetToken.expiresAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_EXPIRED", message: "This reset link has expired" },
          message: "This reset link has expired"
        });
      }
      
      // Get user email (masked)
      const [user] = await db.select({ email: users.email })
        .from(users)
        .where(eq(users.id, resetToken.userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({
          ok: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          message: "User not found"
        });
      }
      
      // Mask email
      const [localPart, domain] = user.email.split("@");
      const maskedEmail = localPart.length > 2 
        ? `${localPart.substring(0, 2)}***@${domain}`
        : `***@${domain}`;
      
      res.json({
        ok: true,
        emailMasked: maskedEmail,
        expiresAt: resetToken.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("[auth] reset-password/validate error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to validate token" },
        message: "Failed to validate token"
      });
    }
  });

  /**
   * POST /api/v1/auth/reset-password
   * Reset password using a valid token.
   */
  app.post("/api/v1/auth/reset-password", inviteAcceptRateLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Token and new password are required" },
          message: "Token and new password are required"
        });
      }
      
      if (newPassword.length < 8) {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" },
          message: "Password must be at least 8 characters"
        });
      }
      
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      const [resetToken] = await db.select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1);
      
      if (!resetToken) {
        return res.status(404).json({
          ok: false,
          error: { code: "INVALID_TOKEN", message: "Invalid reset link" },
          message: "Invalid reset link"
        });
      }
      
      if (resetToken.usedAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_ALREADY_USED", message: "This reset link has already been used" },
          message: "This reset link has already been used"
        });
      }
      
      if (new Date() > resetToken.expiresAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_EXPIRED", message: "This reset link has expired" },
          message: "This reset link has expired"
        });
      }
      
      // Hash the new password
      const passwordHash = await hashPassword(newPassword);
      
      // Update user password and clear mustChangePasswordOnNextLogin
      const [updatedUser] = await db.update(users)
        .set({
          passwordHash,
          mustChangePasswordOnNextLogin: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, resetToken.userId))
        .returning();
      
      if (!updatedUser) {
        return res.status(404).json({
          ok: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          message: "User not found"
        });
      }
      
      // Mark token as used
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));
      
      // Log for audit
      console.log(JSON.stringify({
        level: "info",
        component: "auth",
        event: "password_reset_completed",
        userId: updatedUser.id,
        email: updatedUser.email,
        initiatedBy: resetToken.createdByUserId ? "admin" : "user",
        timestamp: new Date().toISOString(),
      }));
      
      res.json({
        ok: true,
        message: "Password reset successfully. You can now log in with your new password."
      });
    } catch (error) {
      console.error("[auth] reset-password error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to reset password" },
        message: "Failed to reset password"
      });
    }
  });
}
