#!/usr/bin/env tsx
/**
 * CLI Script: Bootstrap Super User
 * 
 * Creates the first super_user account in production if none exists.
 * Uses environment variables for credentials.
 * 
 * Required env vars:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - SUPER_ADMIN_EMAIL: Email for the super admin account
 *   - SUPER_ADMIN_PASSWORD: Password (min 8 characters)
 * 
 * Optional env vars:
 *   - SUPER_ADMIN_FIRST_NAME: First name (default: "Super")
 *   - SUPER_ADMIN_LAST_NAME: Last name (default: "Admin")
 * 
 * Usage:
 *   npx tsx server/scripts/bootstrap_super_user.ts
 */

import { db } from "../db";
import { users, UserRole } from "@shared/schema";
import { hashPassword } from "../auth";
import { eq } from "drizzle-orm";

async function bootstrapSuperUser(): Promise<void> {
  console.log("[bootstrap-cli] Starting super admin bootstrap...");

  // Get credentials from environment
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME || "Super";
  const lastName = process.env.SUPER_ADMIN_LAST_NAME || "Admin";

  // Validate required env vars
  if (!email) {
    console.error("[bootstrap-cli] ERROR: SUPER_ADMIN_EMAIL environment variable is required");
    process.exit(1);
  }

  if (!password) {
    console.error("[bootstrap-cli] ERROR: SUPER_ADMIN_PASSWORD environment variable is required");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("[bootstrap-cli] ERROR: Password must be at least 8 characters");
    process.exit(1);
  }

  try {
    // Check if a super_user already exists
    const existingSuperUsers = await db.select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.role, UserRole.SUPER_USER))
      .limit(1);

    if (existingSuperUsers.length > 0) {
      console.log("[bootstrap-cli] Super admin already exists. No action taken.");
      console.log(`[bootstrap-cli] Existing super admin email: ${existingSuperUsers[0].email}`);
      process.exit(0);
    }

    // Check if email is already in use
    const existingUser = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      console.error(`[bootstrap-cli] ERROR: A user with email ${email} already exists`);
      process.exit(1);
    }

    // Hash password and create super user
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
    }).returning({ id: users.id, email: users.email });

    console.log("[bootstrap-cli] Super admin initialized successfully");
    console.log(`[bootstrap-cli] User ID: ${superUser.id}`);
    console.log("[bootstrap-cli] You can now login at /login");
    
    process.exit(0);
  } catch (error) {
    console.error("[bootstrap-cli] Bootstrap failed:", error);
    process.exit(1);
  }
}

bootstrapSuperUser();
