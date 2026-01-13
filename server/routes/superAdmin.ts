import { Router } from "express";
import { storage } from "../storage";
import { requireSuperUser } from "../middleware/tenantContext";
import { insertTenantSchema, TenantStatus } from "@shared/schema";
import { z } from "zod";

const router = Router();

router.get("/tenants", requireSuperUser, async (req, res) => {
  try {
    const tenants = await storage.getAllTenants();
    res.json(tenants);
  } catch (error) {
    console.error("Error fetching tenants:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

router.get("/tenants/:id", requireSuperUser, async (req, res) => {
  try {
    const tenant = await storage.getTenant(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(tenant);
  } catch (error) {
    console.error("Error fetching tenant:", error);
    res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

const createTenantSchema = insertTenantSchema.extend({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

router.post("/tenants", requireSuperUser, async (req, res) => {
  try {
    const data = createTenantSchema.parse(req.body);
    
    const existingTenant = await storage.getTenantBySlug(data.slug);
    if (existingTenant) {
      return res.status(409).json({ error: "A tenant with this slug already exists" });
    }
    
    const tenant = await storage.createTenant({
      ...data,
      status: data.status || TenantStatus.ACTIVE,
    });
    res.status(201).json(tenant);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating tenant:", error);
    res.status(500).json({ error: "Failed to create tenant" });
  }
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum([TenantStatus.ACTIVE, TenantStatus.INACTIVE]).optional(),
});

router.patch("/tenants/:id", requireSuperUser, async (req, res) => {
  try {
    const data = updateTenantSchema.parse(req.body);
    
    const tenant = await storage.updateTenant(req.params.id, data);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(tenant);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating tenant:", error);
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

export default router;
