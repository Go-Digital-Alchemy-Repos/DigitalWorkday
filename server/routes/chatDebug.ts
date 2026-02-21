/**
 * Chat Debug Routes
 * 
 * Read-only endpoints for Super Admin diagnostics when CHAT_DEBUG=true.
 * 
 * Endpoints:
 * - GET /api/v1/super/debug/chat/metrics - Active sockets, messages, errors
 * - GET /api/v1/super/debug/chat/events - Last N event summaries (IDs only)
 * - GET /api/v1/super/debug/chat/sockets - Active socket connections
 * - GET /api/v1/super/debug/chat/diagnostics - Chat data integrity diagnostics (always available)
 * 
 * Security Invariants:
 * - ALL routes require Super Admin role
 * - Most routes only enabled when CHAT_DEBUG=true
 * - Returns 404 when disabled (no internal information leaked)
 * - No secrets or message contents exposed
 */

import { Request, Response } from 'express';
import { createApiRouter } from '../http/routerFactory';
import { requireSuperUser } from '../middleware/tenantContext';
import { chatDebugStore, isChatDebugEnabled } from '../realtime/chatDebug';
import { storage } from '../storage';
import { z } from 'zod';

const router = createApiRouter({ policy: "superUser" });

function requireChatDebugEnabled(_req: Request, res: Response, next: Function) {
  if (!isChatDebugEnabled()) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}

router.get('/metrics', requireSuperUser, requireChatDebugEnabled, (_req: Request, res: Response) => {
  const metrics = chatDebugStore.getMetrics();
  res.json({
    success: true,
    data: metrics,
    timestamp: new Date().toISOString(),
  });
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).optional().default(200),
});

router.get('/events', requireSuperUser, requireChatDebugEnabled, (req: Request, res: Response) => {
  const parsed = eventsQuerySchema.safeParse(req.query);
  const limit = parsed.success ? parsed.data.limit : 200;
  
  const events = chatDebugStore.getEvents(limit);
  res.json({
    success: true,
    data: events,
    count: events.length,
    timestamp: new Date().toISOString(),
  });
});

router.get('/sockets', requireSuperUser, requireChatDebugEnabled, (_req: Request, res: Response) => {
  const sockets = chatDebugStore.getActiveSockets();
  res.json({
    success: true,
    data: sockets,
    count: sockets.length,
    timestamp: new Date().toISOString(),
  });
});

router.get('/status', requireSuperUser, (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      enabled: isChatDebugEnabled(),
      envVar: 'CHAT_DEBUG',
    },
  });
});

/**
 * Chat Diagnostics Endpoint (always available, does not require CHAT_DEBUG)
 * Reports:
 * - Counts of chat rows with tenantId null
 * - Counts of channels without members
 * - Counts of DM threads with <2 members
 * - Top 10 recent errors with requestId (chat-related)
 */
router.get('/diagnostics', requireSuperUser, async (_req: Request, res: Response) => {
  try {
    // Get chat data integrity diagnostics
    const diagnostics = await storage.getChatDiagnostics();
    
    // Get recent errors (last 10 chat-related or all recent)
    const { logs: recentErrors } = await storage.getErrorLogs({
      pathContains: '/chat',
      limit: 10,
    });
    
    // Map to safe output (no secrets)
    const safeErrors = recentErrors.map(e => ({
      requestId: e.requestId,
      status: e.status,
      path: e.path,
      method: e.method,
      errorName: e.errorName,
      message: e.message,
      createdAt: e.createdAt,
      tenantId: e.tenantId,
    }));

    res.json({
      success: true,
      data: {
        nullTenantCounts: diagnostics.nullTenantCounts,
        orphanedChannels: diagnostics.orphanedChannels,
        underMemberedDmThreads: diagnostics.underMemberedDmThreads,
        recentErrors: safeErrors,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[chatDebug] Error fetching diagnostics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chat diagnostics',
    });
  }
});

export default router;
