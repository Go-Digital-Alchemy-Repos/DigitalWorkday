import { config } from "../../config";

export interface GroupPolicy {
  allowCoalesce: boolean;
  windowMinutes: number;
  showSenders: boolean;
  showCount: boolean;
}

const GROUP_POLICIES: Record<string, GroupPolicy> = {
  chat_message: {
    allowCoalesce: true,
    windowMinutes: 10,
    showSenders: true,
    showCount: true,
  },
  client_message: {
    allowCoalesce: true,
    windowMinutes: 30,
    showSenders: true,
    showCount: true,
  },
  support_ticket: {
    allowCoalesce: true,
    windowMinutes: 60,
    showSenders: false,
    showCount: true,
  },
  work_order: {
    allowCoalesce: true,
    windowMinutes: 60,
    showSenders: false,
    showCount: true,
  },
  task_deadline: {
    allowCoalesce: true,
    windowMinutes: 360,
    showSenders: false,
    showCount: false,
  },
  comment_added: {
    allowCoalesce: true,
    windowMinutes: 10,
    showSenders: true,
    showCount: true,
  },
  comment_mention: {
    allowCoalesce: false,
    windowMinutes: 0,
    showSenders: false,
    showCount: false,
  },
};

const DEFAULT_POLICY: GroupPolicy = {
  allowCoalesce: false,
  windowMinutes: 0,
  showSenders: false,
  showCount: false,
};

export function getGroupPolicy(type: string): GroupPolicy {
  return GROUP_POLICIES[type] || DEFAULT_POLICY;
}

export function isGroupingEnabled(): boolean {
  return config.features.notificationsGroupingV1;
}

export interface GroupMeta {
  count: number;
  lastActorId?: string;
  lastActorName?: string;
  actorIds?: string[];
  lastEntityId?: string;
  lastMessagePreview?: string;
}

export function buildGroupMeta(
  existing: GroupMeta | null,
  actorId?: string,
  actorName?: string,
  entityId?: string,
  messagePreview?: string
): GroupMeta {
  const current = existing || { count: 0 };
  const actorIds = current.actorIds || [];
  if (actorId && !actorIds.includes(actorId)) {
    actorIds.push(actorId);
    if (actorIds.length > 3) actorIds.shift();
  }

  return {
    count: current.count + 1,
    lastActorId: actorId || current.lastActorId,
    lastActorName: actorName || current.lastActorName,
    actorIds,
    lastEntityId: entityId || current.lastEntityId,
    lastMessagePreview: messagePreview || current.lastMessagePreview,
  };
}
