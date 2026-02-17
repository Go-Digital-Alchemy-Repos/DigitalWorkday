import { Router } from "express";
import timerRoutes from "./timeTracking";
import superAdminRoutes from "./superAdmin";
import superDebugRoutes from "./superDebug";
import superChatRoutes from "./superChat";
import chatDebugRoutes from "./chatDebug";
import tenantOnboardingRoutes from "./tenantOnboarding";
import tenantBillingRoutes from "./tenantBilling";
import tenancyHealthRoutes from "./tenancyHealth";
import projectsDashboardRoutes from "./projectsDashboard";
import workloadReportsRoutes from "./workloadReports";
import uploadRoutes from "./uploads";
import emailOutboxRoutes from "./emailOutbox";
import systemStatusRoutes from "./systemStatus";
// systemIntegrations: migrated to new router factory (server/http/domains/system.router.ts)
// import systemIntegrationsRoutes from "./systemIntegrations";
import chatRoutes from "./chat";
import chatRetentionRoutes from "./chatRetention";
// presenceRoutes: migrated to new router factory (server/http/domains/presence.router.ts) — Prompt #5
// import presenceRoutes from "./presence";
// aiRoutes: migrated to new router factory (server/http/domains/ai.router.ts) — Prompt #5
// import aiRoutes from "./ai";
import featuresRoutes from "../features";
import superSystemStatusRouter from "./super/systemStatus.router";
import superIntegrationsRouter from "./super/integrations.router";
import superChatExportRouter from "./super/chatExport.router";
import { searchRouter } from "./modules/search/search.router";
import tasksRouter from "./tasks.router";
import timeTrackingRouter from "./timeTracking.router";
import clientsRouter from "./clients.router";
import projectsRouter from "./projects.router";
import usersRouter from "./users.router";
import crmRouter from "./crm.router";
import workspacesRouter from "./workspaces.router";
import teamsRouter from "./teams.router";
// tagsRouter: migrated to new router factory (server/http/domains/tags.router.ts) — Prompt #2
// import tagsRouter from "./tags.router";
// commentsRouter: migrated to new router factory (server/http/domains/comments.router.ts) — Prompt #4
// import commentsRouter from "./comments.router";
// activityRouter: migrated to new router factory (server/http/domains/activity.router.ts)
// import activityRouter from "./activity.router";
// attachmentsRouter: migrated to new router factory (server/http/domains/attachments.router.ts) — Prompt #6
// import attachmentsRouter from "./attachments.router";

const router = Router();

router.use(workspacesRouter);
router.use(teamsRouter);
// TODO: tagsRouter migrated to server/http/domains/tags.router.ts (Prompt #2)
// router.use(tagsRouter);
// commentsRouter: migrated to server/http/domains/comments.router.ts (Prompt #4)
// router.use(commentsRouter);
// activityRouter: migrated to server/http/domains/activity.router.ts
// router.use(activityRouter);
// attachmentsRouter: migrated to server/http/domains/attachments.router.ts (Prompt #6)
// router.use(attachmentsRouter);
router.use(usersRouter);
router.use(crmRouter);
router.use(projectsRouter);
router.use(clientsRouter);
router.use(timeTrackingRouter);
router.use(tasksRouter);
router.use(searchRouter);
router.use(featuresRoutes);
router.use("/timer", timerRoutes);
router.use("/v1/super", superAdminRoutes);
router.use("/v1/super", superSystemStatusRouter);
router.use("/v1/super", superIntegrationsRouter);
router.use("/v1/super/chat", superChatExportRouter);
router.use("/v1/super/debug", superDebugRoutes);
router.use("/v1/super/debug/chat", chatDebugRoutes);
router.use("/v1/super/chat", superChatRoutes);
router.use("/v1/super/status", systemStatusRoutes);
// TODO: systemIntegrations migrated to server/http/domains/system.router.ts (Prompt #1 pilot)
router.use("/v1/tenant", tenantOnboardingRoutes);
router.use("/v1/tenant", tenantBillingRoutes);
router.use("/v1", projectsDashboardRoutes);
router.use("/v1", workloadReportsRoutes);
router.use("/v1/uploads", uploadRoutes);
router.use("/v1", emailOutboxRoutes);
router.use("/v1/chat", chatRoutes);
router.use("/v1", chatRetentionRoutes);
// presenceRoutes: migrated to server/http/domains/presence.router.ts (Prompt #5)
// router.use("/v1/presence", presenceRoutes);
// aiRoutes: migrated to server/http/domains/ai.router.ts (Prompt #5)
// router.use("/v1/ai", aiRoutes);
router.use(tenancyHealthRoutes);

export default router;
