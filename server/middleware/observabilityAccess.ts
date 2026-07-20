import type { RequestHandler } from "express";
import { UserRole } from "@shared/schema";

export const requireObservabilityAccess: RequestHandler = (req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  if (!req.isAuthenticated?.()) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user?.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: "Super user access required" });
  }

  next();
};
