import { Router, Request, Response } from "express";
import { storage } from "../../../storage";
import { getCurrentUserId } from "../../../middleware/authContext";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { AppError } from "../../../lib/errors";
import { getCurrentTenantId } from "./shared";

const router = Router();

router.get(
  "/users",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { search } = req.query;
    const searchQuery = typeof search === "string" ? search.toLowerCase().trim() : "";

    const allUsers = await storage.getUsersByTenant(tenantId);
    
    let usersForTeam = allUsers.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      avatarUrl: u.avatarUrl,
      displayName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
    }));

    if (searchQuery) {
      usersForTeam = usersForTeam.filter(
        (u) =>
          u.displayName.toLowerCase().includes(searchQuery) ||
          u.email.toLowerCase().includes(searchQuery)
      );
    }

    res.json(usersForTeam);
  })
);

router.get(
  "/search",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { q, channelId, dmThreadId, fromUserId, limit = "50", offset = "0" } = req.query;
    
    if (!q || typeof q !== "string" || q.trim().length < 2) {
      throw AppError.badRequest("Search query must be at least 2 characters");
    }

    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const offsetNum = parseInt(offset as string) || 0;

    const results = await storage.searchChatMessages(tenantId, userId, {
      query: q.trim(),
      channelId: channelId as string | undefined,
      dmThreadId: dmThreadId as string | undefined,
      fromUserId: fromUserId as string | undefined,
      limit: limitNum,
      offset: offsetNum,
    });

    res.json(results);
  })
);

router.get(
  "/users/mentionable",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { channelId, dmThreadId, q } = req.query;
    
    let users = [];

    if (channelId && typeof channelId === "string") {
      const channel = await storage.getChatChannel(channelId);
      if (!channel || channel.tenantId !== tenantId) {
        throw AppError.notFound("Channel not found");
      }
      
      if (channel.isPrivate) {
        const members = await storage.getChatChannelMembers(channelId);
        const memberUserIds = members.map(m => m.userId);
        users = await storage.getUsersByIds(memberUserIds);
      } else {
        users = await storage.getUsersByTenant(tenantId);
      }
    } else if (dmThreadId && typeof dmThreadId === "string") {
      const dm = await storage.getChatDmThread(dmThreadId);
      if (!dm || dm.tenantId !== tenantId) {
        throw AppError.notFound("DM thread not found");
      }
      
      const participants = await storage.getChatDmParticipants(dmThreadId);
      const participantUserIds = participants.map(p => p.userId);
      users = await storage.getUsersByIds(participantUserIds);
    } else {
      users = await storage.getUsersByTenant(tenantId);
    }

    const query = typeof q === "string" ? q.toLowerCase().trim() : "";
    
    let filtered = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
    }));

    if (query) {
      filtered = filtered.filter(u => 
        u.displayName.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
      );
    }

    res.json(filtered.slice(0, 20));
  })
);

export default router;
