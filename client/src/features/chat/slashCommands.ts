import { CalendarDays, UserPlus, ListTodo, Bell, HelpCircle, type LucideIcon } from "lucide-react";

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  icon: LucideIcon;
  requiresArgs: boolean;
  argPlaceholder?: string;
  category: "task" | "utility";
  channelOnly?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "assign",
    description: "Notify channel that a user is assigned",
    usage: "/assign @username",
    icon: UserPlus,
    requiresArgs: true,
    argPlaceholder: "@user",
    category: "task",
    channelOnly: true,
  },
  {
    name: "due",
    description: "Post a due date notice to the channel",
    usage: "/due tomorrow | /due 2026-03-15",
    icon: CalendarDays,
    requiresArgs: true,
    argPlaceholder: "date (e.g. tomorrow, next friday, 2026-03-15)",
    category: "task",
  },
  {
    name: "create-task",
    description: "Create a personal task from chat",
    usage: "/create-task Buy new server equipment",
    icon: ListTodo,
    requiresArgs: true,
    argPlaceholder: "task title",
    category: "task",
  },
  {
    name: "remind",
    description: "Set a reminder notification",
    usage: "/remind in 30 minutes Check deployment",
    icon: Bell,
    requiresArgs: true,
    argPlaceholder: "in <time> <message>",
    category: "utility",
  },
  {
    name: "help",
    description: "Show available slash commands",
    usage: "/help",
    icon: HelpCircle,
    requiresArgs: false,
    category: "utility",
  },
];

export interface ParsedCommand {
  command: string;
  args: string;
  raw: string;
}

export function parseSlashCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const match = trimmed.match(/^\/([a-z][a-z0-9-]*)\s*(.*)?$/i);
  if (!match) return null;

  return {
    command: match[1].toLowerCase(),
    args: (match[2] || "").trim(),
    raw: trimmed,
  };
}

export function isSlashCommandInput(input: string): boolean {
  return input.trim().startsWith("/");
}

export function getMatchingCommands(input: string, isChannel = true): SlashCommand[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return [];

  const afterSlash = trimmed.slice(1).toLowerCase();

  if (!afterSlash || !afterSlash.includes(" ")) {
    return SLASH_COMMANDS.filter((cmd) =>
      cmd.name.startsWith(afterSlash) && (!cmd.channelOnly || isChannel)
    );
  }

  return [];
}

export function findCommand(name: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find((cmd) => cmd.name === name.toLowerCase());
}

export function parseDueDate(input: string): Date | null {
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

export function parseRemindTime(input: string): { delayMs: number; message: string } | null {
  const inMatch = input.match(/^in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\s+(.+)$/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();
    let delayMs = 0;
    if (unit.startsWith("min")) delayMs = amount * 60 * 1000;
    else if (unit.startsWith("h")) delayMs = amount * 60 * 60 * 1000;
    else if (unit.startsWith("d")) delayMs = amount * 24 * 60 * 60 * 1000;
    return { delayMs, message: inMatch[3].trim() };
  }

  return null;
}
