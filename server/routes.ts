/**
 * Main API Routes — DEPRECATED
 * 
 * This file is kept for backward compatibility with test harnesses.
 * All route mounting has been consolidated into server/http/mount.ts.
 * 
 * @deprecated Use mountAllRoutes from server/http/mount.ts instead.
 */
import type { Express } from "express";
import type { Server } from "http";
import { mountAllRoutes } from "./http/mount";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  return mountAllRoutes(httpServer, app);
}
