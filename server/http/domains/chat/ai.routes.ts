import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../../../storage";
import { getCurrentUserId } from "../../../middleware/authContext";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { AppError } from "../../../lib/errors";
import { getCurrentTenantId } from "./shared";
import { getAIProviderOrThrow, AINotConfiguredError } from "../../../services/ai/getAIProvider";
import OpenAI from "openai";

const router = Router();

async function requireAiChat(tenantId: string): Promise<void> {
  const settings = await storage.getTenantSettings(tenantId);
  if (!settings?.aiChatEnabled) {
    throw AppError.forbidden("AI Chat Assist is not enabled for this workspace. An admin can enable it in Settings.");
  }
}

async function getOpenAIClientForTenant(tenantId: string): Promise<{ client: OpenAI; model: string; maxTokens: number; temperature: number }> {
  const result = await getAIProviderOrThrow(tenantId);
  return {
    client: new OpenAI({ apiKey: result.config.apiKey }),
    model: result.config.model,
    maxTokens: result.config.maxTokens,
    temperature: result.config.temperature,
  };
}

router.get(
  "/ai/status",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const settings = await storage.getTenantSettings(tenantId);
    const aiChatEnabled = settings?.aiChatEnabled ?? false;

    let aiAvailable = false;
    try {
      const result = await getAIProviderOrThrow(tenantId);
      aiAvailable = !!result;
    } catch {
      aiAvailable = false;
    }

    res.json({
      aiChatEnabled,
      aiAvailable,
      ready: aiChatEnabled && aiAvailable,
    });
  })
);

const summarizeChannelSchema = z.object({
  channelId: z.string().min(1),
  messageCount: z.number().int().min(10).max(200).default(50),
});

router.post(
  "/ai/summarize-channel",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    await requireAiChat(tenantId);

    const parsed = summarizeChannelSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Invalid request body");

    const { channelId, messageCount } = parsed.data;

    const hasAccess = await storage.validateChatRoomAccess("channel", channelId, userId, tenantId);
    if (!hasAccess) throw AppError.forbidden("You do not have access to this channel");

    const messages = await storage.getChatMessages("channel", channelId, messageCount);

    if (messages.length === 0) {
      return res.json({ summary: "No messages to summarize.", messageCount: 0 });
    }

    const transcript = messages.map(m => {
      const name = m.author?.name || m.author?.email || "Unknown";
      const time = new Date(m.createdAt).toLocaleString();
      return `[${time}] ${name}: ${m.body}`;
    }).join("\n");

    const { client, model, maxTokens, temperature } = await getOpenAIClientForTenant(tenantId);

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes chat conversations. Provide a concise summary of the key topics discussed, decisions made, and action items mentioned. Use bullet points for clarity. Do not include any personal identifiable information beyond first names.",
        },
        {
          role: "user",
          content: `Please summarize the following chat conversation (${messages.length} messages):\n\n${transcript}`,
        },
      ],
      max_tokens: maxTokens,
      temperature,
    });

    const summary = response.choices[0]?.message?.content || "Unable to generate summary.";

    res.json({
      summary,
      messageCount: messages.length,
      model: response.model,
    });
  })
);

const summarizeThreadSchema = z.object({
  channelId: z.string().optional(),
  dmThreadId: z.string().optional(),
  parentMessageId: z.string().min(1),
});

router.post(
  "/ai/summarize-thread",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    await requireAiChat(tenantId);

    const parsed = summarizeThreadSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Invalid request body");

    const { channelId, dmThreadId, parentMessageId } = parsed.data;

    if (!channelId && !dmThreadId) throw AppError.badRequest("Either channelId or dmThreadId is required");

    const targetType = channelId ? "channel" : "dm";
    const targetId = (channelId || dmThreadId)!;

    const hasAccess = await storage.validateChatRoomAccess(targetType, targetId, userId, tenantId);
    if (!hasAccess) throw AppError.forbidden("You do not have access to this conversation");

    const allMessages = await storage.getChatMessages(targetType, targetId, 200);
    const threadMessages = allMessages.filter(
      m => m.id === parentMessageId || m.parentMessageId === parentMessageId
    );

    if (threadMessages.length === 0) {
      return res.json({ summary: "No thread messages found.", messageCount: 0 });
    }

    const transcript = threadMessages.map(m => {
      const name = m.author?.name || m.author?.email || "Unknown";
      const time = new Date(m.createdAt).toLocaleString();
      return `[${time}] ${name}: ${m.body}`;
    }).join("\n");

    const { client, model, maxTokens, temperature } = await getOpenAIClientForTenant(tenantId);

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes chat thread conversations. Provide a concise summary of what was discussed in the thread, key decisions, and any action items. Use bullet points for clarity.",
        },
        {
          role: "user",
          content: `Please summarize this thread (${threadMessages.length} messages):\n\n${transcript}`,
        },
      ],
      max_tokens: maxTokens,
      temperature,
    });

    const summary = response.choices[0]?.message?.content || "Unable to generate summary.";

    res.json({
      summary,
      messageCount: threadMessages.length,
      model: response.model,
    });
  })
);

const draftReplySchema = z.object({
  channelId: z.string().optional(),
  dmThreadId: z.string().optional(),
  parentMessageId: z.string().optional(),
  contextMessageCount: z.number().int().min(5).max(50).default(20),
  tone: z.enum(["professional", "casual", "friendly", "concise"]).default("professional"),
});

router.post(
  "/ai/draft-reply",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    await requireAiChat(tenantId);

    const parsed = draftReplySchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Invalid request body");

    const { channelId, dmThreadId, parentMessageId, contextMessageCount, tone } = parsed.data;

    if (!channelId && !dmThreadId) throw AppError.badRequest("Either channelId or dmThreadId is required");

    const targetType = channelId ? "channel" : "dm";
    const targetId = (channelId || dmThreadId)!;

    const hasAccess = await storage.validateChatRoomAccess(targetType, targetId, userId, tenantId);
    if (!hasAccess) throw AppError.forbidden("You do not have access to this conversation");

    const allMessages = await storage.getChatMessages(targetType, targetId, contextMessageCount);

    let contextMessages = allMessages;
    if (parentMessageId) {
      contextMessages = allMessages.filter(
        m => m.id === parentMessageId || m.parentMessageId === parentMessageId
      );
      if (contextMessages.length === 0) contextMessages = allMessages.slice(-10);
    }

    const transcript = contextMessages.map(m => {
      const name = m.author?.name || m.author?.email || "Unknown";
      return `${name}: ${m.body}`;
    }).join("\n");

    const { client, model, maxTokens, temperature } = await getOpenAIClientForTenant(tenantId);

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that drafts reply messages for a workplace chat application. Write a single suggested reply in a ${tone} tone. The reply should be relevant to the conversation context and helpful. Keep it concise (1-3 sentences). Do not include greetings or sign-offs. Output only the reply text, nothing else.`,
        },
        {
          role: "user",
          content: `Based on this conversation, draft a reply:\n\n${transcript}`,
        },
      ],
      max_tokens: 300,
      temperature: Math.min(temperature + 0.1, 1.0),
    });

    const draft = response.choices[0]?.message?.content || "Unable to generate draft.";

    res.json({ draft });
  })
);

const convertToTaskSchema = z.object({
  messageId: z.string().min(1),
  channelId: z.string().optional(),
  dmThreadId: z.string().optional(),
  projectId: z.string().optional(),
});

router.post(
  "/ai/convert-to-task",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    await requireAiChat(tenantId);

    const parsed = convertToTaskSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Invalid request body");

    const { messageId, channelId, dmThreadId, projectId } = parsed.data;

    if (!channelId && !dmThreadId) throw AppError.badRequest("Either channelId or dmThreadId is required");

    const targetType = channelId ? "channel" : "dm";
    const targetId = (channelId || dmThreadId)!;

    const hasAccess = await storage.validateChatRoomAccess(targetType, targetId, userId, tenantId);
    if (!hasAccess) throw AppError.forbidden("You do not have access to this conversation");

    const allMessages = await storage.getChatMessages(targetType, targetId, 50);
    const message = allMessages.find(m => m.id === messageId);

    if (!message) throw AppError.notFound("Message");

    const { client, model, temperature } = await getOpenAIClientForTenant(tenantId);

    const surroundingMessages = allMessages
      .filter(m => {
        const msgTime = new Date(m.createdAt).getTime();
        const targetTime = new Date(message.createdAt).getTime();
        return Math.abs(msgTime - targetTime) < 5 * 60 * 1000;
      })
      .map(m => {
        const name = m.author?.name || m.author?.email || "Unknown";
        return `${name}: ${m.body}`;
      })
      .join("\n");

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that converts chat messages into task items. Extract a clear task title and description from the message. Return JSON with this exact structure: {"title": "...", "description": "...", "priority": "medium"}. Priority must be one of: low, medium, high. Keep the title concise (under 100 chars) and the description brief (1-3 sentences).`,
        },
        {
          role: "user",
          content: `Convert this message into a task. Message: "${message.body}"\n\nContext:\n${surroundingMessages}`,
        },
      ],
      max_tokens: 300,
      temperature: Math.min(temperature, 0.5),
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    let taskData: { title: string; description?: string; priority?: string };
    try {
      taskData = JSON.parse(content || "{}");
    } catch {
      taskData = { title: message.body.slice(0, 100), description: message.body };
    }

    if (!taskData.title) {
      taskData.title = message.body.slice(0, 100);
    }

    const task = await storage.createTaskWithTenant(
      {
        title: taskData.title,
        description: taskData.description || message.body,
        priority: (taskData.priority as "low" | "medium" | "high") || "medium",
        status: "todo",
        projectId: projectId || null,
        createdBy: userId,
      },
      tenantId
    );

    res.json({
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        projectId: task.projectId,
      },
      sourceMessageId: messageId,
    });
  })
);

export default router;
