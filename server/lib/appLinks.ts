import type { Request } from "express";

type RequestLike = Pick<Request, "protocol" | "get">;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function firstHeaderValue(value: string | undefined): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

export function getAppBaseUrl(req?: RequestLike): string {
  const configuredUrl = process.env.APP_PUBLIC_URL || process.env.APP_URL;
  if (configuredUrl?.trim()) {
    return trimTrailingSlash(configuredUrl.trim());
  }

  const forwardedProto = firstHeaderValue(req?.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(req?.get("x-forwarded-host"));
  const host = forwardedHost || req?.get("host");
  if (host) {
    return trimTrailingSlash(`${forwardedProto || req?.protocol || "http"}://${host}`);
  }

  return "http://localhost:5000";
}

export function buildAppUrl(pathOrUrl: string, req?: RequestLike): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${getAppBaseUrl(req)}${path}`;
}

export function buildProjectUrl(projectId: string, req?: RequestLike): string {
  return buildAppUrl(`/projects/${encodeURIComponent(projectId)}`, req);
}

export function buildTaskUrl(
  options: {
    taskId: string;
    projectId?: string | null;
    subtaskId?: string | null;
    commentId?: string | null;
  },
  req?: RequestLike,
): string {
  if (options.projectId) {
    const params = new URLSearchParams({ task: options.taskId });
    if (options.subtaskId) params.set("subtask", options.subtaskId);
    if (options.commentId) params.set("comment", options.commentId);
    return buildAppUrl(`/projects/${encodeURIComponent(options.projectId)}?${params.toString()}`, req);
  }

  const params = new URLSearchParams({ taskId: options.taskId });
  if (options.commentId) params.set("comment", options.commentId);
  return buildAppUrl(`/my-tasks?${params.toString()}`, req);
}

export function buildChatUrl(
  options: {
    type: "channel" | "dm";
    conversationId: string;
    messageId?: string | null;
  },
  req?: RequestLike,
): string {
  const params = new URLSearchParams({ c: `${options.type}:${options.conversationId}` });
  if (options.messageId) params.set("message", options.messageId);
  return buildAppUrl(`/chat?${params.toString()}`, req);
}

