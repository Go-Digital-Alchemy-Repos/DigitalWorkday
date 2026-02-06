import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { systemSettings, updateSystemSettingsSchema } from '@shared/schema';
import { eq } from 'drizzle-orm';

export const systemSettingsRouter = Router();

systemSettingsRouter.get("/system-settings", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings) {
      return res.json({
        id: 1,
        defaultAppName: "MyWorkDay",
        defaultLogoUrl: null,
        defaultFaviconUrl: null,
        defaultPrimaryColor: "#3B82F6",
        defaultSecondaryColor: "#64748B",
        supportEmail: null,
        platformVersion: "1.0.0",
        maintenanceMode: false,
        maintenanceMessage: null,
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error("[system-settings] Failed to get settings:", error);
    res.status(500).json({ error: "Failed to get system settings" });
  }
});

systemSettingsRouter.patch("/system-settings", requireSuperUser, async (req, res) => {
  try {
    const parseResult = updateSystemSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid request data", 
        details: parseResult.error.errors 
      });
    }
    
    const updateData = parseResult.data;
    
    const [existing] = await db.select().from(systemSettings).limit(1);
    
    if (!existing) {
      const [newSettings] = await db.insert(systemSettings).values({
        id: 1,
        ...updateData,
        updatedAt: new Date(),
      }).returning();
      return res.json(newSettings);
    }
    
    const [updated] = await db.update(systemSettings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(systemSettings.id, 1))
      .returning();
    
    res.json(updated);
  } catch (error) {
    console.error("[system-settings] Failed to update settings:", error);
    res.status(500).json({ error: "Failed to update system settings" });
  }
});
