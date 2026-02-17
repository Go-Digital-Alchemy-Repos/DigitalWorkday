import { Router } from "express";
// Migrated to server/http/domains/ factory routers:
// tags, comments, activity, attachments, projects, tasks, subtasks, time, uploads, chat, presence, ai, systemIntegrations

import superAdminRoutes from "./superAdmin";
import superDebugRoutes from "./superDebug";
import superChatRoutes from "./superChat";
import chatDebugRoutes from "./chatDebug";
import tenantOnboardingRoutes from "./tenantOnboarding";
import tenantBillingRoutes from "./tenantBilling";
import tenancyHealthRoutes from "./tenancyHealth";
import projectsDashboardRoutes from "./projectsDashboard";
import workloadReportsRoutes from "./workloadReports";
import emailOutboxRoutes from "./emailOutbox";
import systemStatusRoutes from "./systemStatus";
import chatRetentionRoutes from "./chatRetention";
import featuresRoutes from "../features";
import superSystemStatusRouter from "./super/systemStatus.router";
import superIntegrationsRouter from "./super/integrations.router";
import superChatExportRouter from "./super/chatExport.router";
import { searchRouter } from "./modules/search/search.router";
import clientsRouter from "./clients.router";
import usersRouter from "./users.router";
import crmRouter from "./crm.router";
import workspacesRouter from "./workspaces.router";
import teamsRouter from "./teams.router";

const router = Router();

router.use(workspacesRouter);
router.use(teamsRouter);
router.use(usersRouter);
router.use(crmRouter);
router.use(clientsRouter);
router.use(searchRouter);
router.use(featuresRoutes);
router.use("/v1/super", superAdminRoutes);
router.use("/v1/super", superSystemStatusRouter);
router.use("/v1/super", superIntegrationsRouter);
router.use("/v1/super/chat", superChatExportRouter);
router.use("/v1/super/debug", superDebugRoutes);
router.use("/v1/super/debug/chat", chatDebugRoutes);
router.use("/v1/super/chat", superChatRoutes);
router.use("/v1/super/status", systemStatusRoutes);
router.use("/v1/tenant", tenantOnboardingRoutes);
router.use("/v1/tenant", tenantBillingRoutes);
router.use("/v1", projectsDashboardRoutes);
router.use("/v1", workloadReportsRoutes);
router.use("/v1", emailOutboxRoutes);
router.use("/v1", chatRetentionRoutes);
router.use(tenancyHealthRoutes);

export default router;
