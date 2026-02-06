import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../../db';
import { users, UserRole } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../../../auth';
import { timingSafeEqual } from 'crypto';

export const bootstrapRouter = Router();

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

const bootstrapSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

bootstrapRouter.post("/bootstrap", async (req, res) => {
  try {
    const bootstrapToken = process.env.SUPER_ADMIN_BOOTSTRAP_TOKEN;
    if (!bootstrapToken) {
      return res.status(503).json({ 
        error: "Bootstrap not configured",
        message: "SUPER_ADMIN_BOOTSTRAP_TOKEN environment variable is not set"
      });
    }

    const providedToken = req.headers["x-bootstrap-token"];
    if (!providedToken || typeof providedToken !== "string" || !safeCompare(providedToken, bootstrapToken)) {
      return res.status(401).json({ error: "Invalid bootstrap token" });
    }

    const existingSuperUsers = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.role, UserRole.SUPER_USER))
      .limit(1);

    if (existingSuperUsers.length > 0) {
      return res.status(409).json({ 
        error: "Super admin already initialized",
        message: "A super user account already exists. Bootstrap can only be used once."
      });
    }

    const body = bootstrapSchema.parse(req.body || {});

    const email = body.email || process.env.SUPER_ADMIN_EMAIL;
    const password = body.password || process.env.SUPER_ADMIN_PASSWORD;
    const firstName = body.firstName || process.env.SUPER_ADMIN_FIRST_NAME || "Super";
    const lastName = body.lastName || process.env.SUPER_ADMIN_LAST_NAME || "Admin";

    if (!email) {
      return res.status(400).json({ 
        error: "Email required",
        message: "Provide email in request body or set SUPER_ADMIN_EMAIL environment variable"
      });
    }

    if (!password) {
      return res.status(400).json({ 
        error: "Password required",
        message: "Provide password in request body or set SUPER_ADMIN_PASSWORD environment variable"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        error: "Password too short",
        message: "Password must be at least 8 characters"
      });
    }

    const existingUser = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({ 
        error: "Email already in use",
        message: "A user with this email already exists"
      });
    }

    const passwordHash = await hashPassword(password);
    
    const [superUser] = await db.insert(users).values({
      email,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      passwordHash,
      role: UserRole.SUPER_USER,
      isActive: true,
      tenantId: null,
    }).returning({ id: users.id, email: users.email, name: users.name });

    console.log("[bootstrap] Super admin initialized");

    res.status(201).json({
      success: true,
      message: "Super admin account created successfully",
      user: {
        id: superUser.id,
        email: superUser.email,
        name: superUser.name,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[bootstrap] Error during super admin bootstrap:", error);
    res.status(500).json({ error: "Bootstrap failed" });
  }
});
