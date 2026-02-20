import { Router, Request, Response } from "express";
import { storage } from "../../../storage";
import { getCurrentUserId } from "../../../middleware/authContext";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { AppError } from "../../../lib/errors";
import { emitToChatChannel } from "../../../realtime/socket";
import { CHAT_EVENTS } from "@shared/events";
import { getCurrentTenantId } from "./shared";

const router = Router();

function parseDueDate(input: string): Date | null {
  const lower = input.toLowerCase().trim();
  const now = new Date();

  if (lower === "today") {
    const d = new Date(now);
    d.setHours(23, 59, 59, 0);
    return d;
  }
  if (lower === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 0);
    return d;
  }
  if (lower === "next week") {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 59, 0);
    return d;
  }

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const nextMatch = lower.match(/^next\s+(\w+)$/);
  if (nextMatch) {
    const dayIdx = dayNames.indexOf(nextMatch[1]);
    if (dayIdx !== -1) {
      const d = new Date(now);
      const currentDay = d.getDay();
      let daysUntil = dayIdx - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      d.setDate(d.getDate() + daysUntil);
      d.setHours(23, 59, 59, 0);
      return d;
    }
  }

  const inMatch = lower.match(/^in\s+(\d+)\s+(day|days|week|weeks|hour|hours)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const d = new Date(now);
    if (unit.startsWith("day")) d.setDate(d.getDate() + amount);
    else if (unit.startsWith("week")) d.setDate(d.getDate() + amount * 7);
    else if (unit.startsWith("hour")) d.setHours(d.getHours() + amount);
    return d;
  }

  const parsed = new Date(input);
  if (!isNaN(parsed.getTime()) && parsed > now) return parsed;

  return null;
}

router.post(
  "/slash-command",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { command, args, channelId } = req.body;
    if (!command) throw AppError.badRequest("command is required");

    const user = await storage.getUser(userId);
    const userName = user?.name || user?.email || "Someone";

    switch (command) {
      case "assign": {
        if (!args) throw AppError.badRequest("Usage: /assign @username");
        if (!channelId) throw AppError.badRequest("/assign can only be used in a channel");

        const member = await storage.getChatChannelMember(channelId, userId);
        if (!member) throw AppError.forbidden("You must be a channel member to use /assign");

        const mentionMatch = args.match(/@\[([^\]]+)\]\(([^)]+)\)/);
        let targetUserId: string | null = null;
        let targetName: string | null = null;

        if (mentionMatch) {
          targetName = mentionMatch[1];
          targetUserId = mentionMatch[2];
        } else {
          const cleanName = args.replace(/^@/, "").trim();
          const tenantUsers = await storage.getUsersByTenant(tenantId);
          const match = tenantUsers.find(
            (u) =>
              u.email.toLowerCase() === cleanName.toLowerCase() ||
              (u.name && u.name.toLowerCase() === cleanName.toLowerCase())
          );
          if (!match) {
            throw AppError.badRequest(`User "${cleanName}" not found`);
          }
          targetUserId = match.id;
          targetName = match.name || match.email;
        }

        emitToChatChannel(channelId, CHAT_EVENTS.NEW_MESSAGE, {
          id: `system-${Date.now()}`,
          channelId,
          tenantId,
          authorUserId: userId,
          body: `${userName} assigned ${targetName} to this conversation`,
          createdAt: new Date(),
          isSystem: true,
        });

        res.json({
          success: true,
          type: "assign",
          message: `Assigned ${targetName} to this conversation`,
          data: { userId: targetUserId, userName: targetName },
        });
        break;
      }

      case "due": {
        if (!args) throw AppError.badRequest("Usage: /due tomorrow or /due 2026-03-15");

        const dueDate = parseDueDate(args);
        if (!dueDate) {
          throw AppError.badRequest(
            `Could not parse date "${args}". Try: tomorrow, next week, next friday, in 3 days, or YYYY-MM-DD`
          );
        }

        if (channelId) {
          emitToChatChannel(channelId, CHAT_EVENTS.NEW_MESSAGE, {
            id: `system-${Date.now()}`,
            channelId,
            tenantId,
            authorUserId: userId,
            body: `${userName} set a due date: ${dueDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
            createdAt: new Date(),
            isSystem: true,
          });
        }

        res.json({
          success: true,
          type: "due",
          message: `Due date set to ${dueDate.toLocaleDateString()}`,
          data: { dueDate: dueDate.toISOString() },
        });
        break;
      }

      case "create-task": {
        if (!args) throw AppError.badRequest("Usage: /create-task Task title here");

        const sanitizedTitle = args.replace(/[<>]/g, "").trim();
        if (!sanitizedTitle) throw AppError.badRequest("Task title cannot be empty");
        if (sanitizedTitle.length > 500) throw AppError.badRequest("Task title too long (max 500 chars)");

        const task = await storage.createTaskWithTenant({
          title: sanitizedTitle,
          createdBy: userId,
          isPersonal: true,
          status: "todo",
          priority: "medium",
        }, tenantId);

        if (channelId) {
          emitToChatChannel(channelId, CHAT_EVENTS.NEW_MESSAGE, {
            id: `system-${Date.now()}`,
            channelId,
            tenantId,
            authorUserId: userId,
            body: `${userName} created a task: "${sanitizedTitle}"`,
            createdAt: new Date(),
            isSystem: true,
          });
        }

        res.json({
          success: true,
          type: "create-task",
          message: `Task created: "${sanitizedTitle}"`,
          data: { taskId: task.id, title: sanitizedTitle },
        });
        break;
      }

      case "remind": {
        if (!args) throw AppError.badRequest("Usage: /remind in 30 minutes Check deployment");

        const inMatch = args.match(/^in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\s+(.+)$/i);
        if (!inMatch) {
          throw AppError.badRequest(
            'Could not parse reminder. Format: /remind in <number> <minutes|hours|days> <message>'
          );
        }

        const amount = parseInt(inMatch[1], 10);
        const unit = inMatch[2].toLowerCase();
        const reminderMessage = inMatch[3].trim().replace(/[<>]/g, "");
        if (!reminderMessage) throw AppError.badRequest("Reminder message cannot be empty");

        let delayMs = 0;
        let unitLabel = "";
        if (unit.startsWith("min")) {
          delayMs = amount * 60 * 1000;
          unitLabel = amount === 1 ? "minute" : "minutes";
        } else if (unit.startsWith("h")) {
          delayMs = amount * 60 * 60 * 1000;
          unitLabel = amount === 1 ? "hour" : "hours";
        } else if (unit.startsWith("d")) {
          delayMs = amount * 24 * 60 * 60 * 1000;
          unitLabel = amount === 1 ? "day" : "days";
        }

        const remindAt = new Date(Date.now() + delayMs);

        res.json({
          success: true,
          type: "remind",
          message: `Reminder set: "${reminderMessage}" in ${amount} ${unitLabel}`,
          data: { remindAt: remindAt.toISOString(), message: reminderMessage },
        });
        break;
      }

      case "help": {
        res.json({
          success: true,
          type: "help",
          message: "Available commands",
          data: {
            commands: [
              { name: "/assign", usage: "/assign @user", description: "Assign a user to the conversation" },
              { name: "/due", usage: "/due tomorrow", description: "Set a due date reminder" },
              { name: "/create-task", usage: "/create-task Title", description: "Create a new personal task" },
              { name: "/remind", usage: "/remind in 30 min Message", description: "Set a reminder" },
              { name: "/help", usage: "/help", description: "Show this help" },
            ],
          },
        });
        break;
      }

      default:
        throw AppError.badRequest(`Unknown command: /${command}`);
    }
  })
);

export default router;
