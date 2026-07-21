import OpenAI from "openai";
import { db } from "../../db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import {
  AI_GOVERNANCE_SYSTEM_MESSAGE,
  boundAIInput,
  normalizeAIMaxTokens,
  normalizeAIModel,
  normalizeAITemperature,
  parseGovernedAIJson,
  projectPlanningSuggestionSchema,
  taskBreakdownSuggestionSchema,
} from "./governance";

function getEncryptionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET environment variable is required for AI encryption (minimum 16 characters)");
  }
  return secret;
}

function getEncryptionKey(): Buffer {
  const secret = getEncryptionSecret();
  const salt = crypto.createHash("sha256").update(secret).digest().slice(0, 16);
  return crypto.scryptSync(secret, salt, 32);
}

export function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(apiKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptApiKey(encryptedKey: string): string {
  const parts = encryptedKey.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted key format");
  }
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

interface AIConfig {
  enabled: boolean;
  provider: string;
  model: string;
  apiKey: string | null;
  maxTokens: number;
  temperature: number;
}

export interface AIConfigStatus {
  config: AIConfig | null;
  error?: string;
}

async function getAIConfig(): Promise<AIConfig | null> {
  const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, 1));
  
  if (!settings || !settings.aiEnabled || !settings.aiApiKeyEncrypted) {
    return null;
  }

  try {
    const apiKey = decryptApiKey(settings.aiApiKeyEncrypted);
    return {
      enabled: settings.aiEnabled,
      provider: settings.aiProvider || "openai",
      model: normalizeAIModel(settings.aiModel),
      apiKey,
      maxTokens: normalizeAIMaxTokens(settings.aiMaxTokens),
      temperature: normalizeAITemperature(settings.aiTemperature),
    };
  } catch (error) {
    console.error("[AI] Failed to decrypt API key:", error);
    return null;
  }
}

export async function getAIConfigStatus(): Promise<AIConfigStatus> {
  const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, 1));
  
  if (!settings) {
    return { config: null, error: "System settings not found" };
  }
  
  if (!settings.aiEnabled) {
    return { config: null, error: "AI is not enabled" };
  }
  
  if (!settings.aiApiKeyEncrypted) {
    return { config: null, error: "API key not configured" };
  }

  try {
    getEncryptionSecret();
  } catch (error) {
    return { config: null, error: "Encryption configuration error - check SESSION_SECRET" };
  }

  try {
    const apiKey = decryptApiKey(settings.aiApiKeyEncrypted);
    return {
      config: {
        enabled: settings.aiEnabled,
        provider: settings.aiProvider || "openai",
        model: normalizeAIModel(settings.aiModel),
        apiKey,
        maxTokens: normalizeAIMaxTokens(settings.aiMaxTokens),
        temperature: normalizeAITemperature(settings.aiTemperature),
      }
    };
  } catch (error) {
    return { config: null, error: "Failed to decrypt API key - key may be corrupted or encryption secret changed" };
  }
}

function getOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export interface TaskBreakdownSuggestion {
  subtasks: Array<{
    title: string;
    description?: string;
    estimatedMinutes?: number;
  }>;
  reasoning?: string;
}

export interface ProjectPlanningSuggestion {
  phases: Array<{
    name: string;
    description: string;
    suggestedDuration: string;
    tasks: Array<{
      title: string;
      priority: "high" | "medium" | "low";
    }>;
  }>;
  recommendations?: string[];
}

export async function isAIEnabled(): Promise<boolean> {
  const config = await getAIConfig();
  return config !== null && config.enabled;
}

export async function testAIConnection(): Promise<{ success: boolean; message: string; model?: string }> {
  const configStatus = await getAIConfigStatus();
  
  if (configStatus.error) {
    return { success: false, message: configStatus.error };
  }
  
  const config = configStatus.config;
  if (!config || !config.apiKey) {
    return { success: false, message: "API key is missing" };
  }

  try {
    const client = getOpenAIClient(config.apiKey);
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: "Say 'Hello' in one word." }],
      max_tokens: 10,
    });

    if (response.choices && response.choices.length > 0) {
      return { 
        success: true, 
        message: "Connection successful",
        model: response.model,
      };
    }
    return { success: false, message: "No response from API" };
  } catch (error: any) {
    console.error("[AI] Connection test failed:", error);
    return { 
      success: false, 
      message: error.message || "Failed to connect to OpenAI API",
    };
  }
}

export async function suggestTaskBreakdown(
  taskTitle: string,
  taskDescription?: string,
  projectContext?: string
): Promise<TaskBreakdownSuggestion | null> {
  const config = await getAIConfig();
  
  if (!config || !config.apiKey) {
    console.log("[AI] Task breakdown requested but AI is not configured");
    return null;
  }

  try {
    const client = getOpenAIClient(config.apiKey);
    
    const safeTitle = boundAIInput(taskTitle, 500) || "Untitled task";
    const safeDescription = boundAIInput(taskDescription);
    const safeProjectContext = boundAIInput(projectContext);
    const prompt = `Break down the task below into smaller, actionable subtasks.

Task Title:
<task_title>
${safeTitle}
</task_title>
${safeDescription ? `\nTask Description:\n<task_description>\n${safeDescription}\n</task_description>` : ""}
${safeProjectContext ? `\nProject Context:\n<project_context>\n${safeProjectContext}\n</project_context>` : ""}

Provide 3-7 subtasks that would help complete this task. For each subtask, include:
- A clear, actionable title
- A brief description (optional)
- Estimated time in minutes (optional)

Respond in JSON format:
{
  "subtasks": [
    {
      "title": "Subtask title",
      "description": "Brief description",
      "estimatedMinutes": 30
    }
  ],
  "reasoning": "Brief explanation of why you broke it down this way"
}`;

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: AI_GOVERNANCE_SYSTEM_MESSAGE },
        { role: "user", content: prompt },
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    return parseGovernedAIJson(content, taskBreakdownSuggestionSchema, "Task breakdown");
  } catch (error: any) {
    console.error("[AI] Task breakdown failed:", error);
    throw new Error(error.message || "Failed to generate task breakdown");
  }
}

export async function suggestProjectPlan(
  projectName: string,
  projectDescription?: string,
  clientName?: string,
  teamSize?: number
): Promise<ProjectPlanningSuggestion | null> {
  const config = await getAIConfig();
  
  if (!config || !config.apiKey) {
    console.log("[AI] Project planning requested but AI is not configured");
    return null;
  }

  try {
    const client = getOpenAIClient(config.apiKey);
    
    const safeProjectName = boundAIInput(projectName, 500) || "Untitled project";
    const safeProjectDescription = boundAIInput(projectDescription);
    const safeClientName = boundAIInput(clientName, 300);
    const prompt = `Create a project plan for the project below.

Project Name:
<project_name>
${safeProjectName}
</project_name>
${safeProjectDescription ? `\nDescription:\n<project_description>\n${safeProjectDescription}\n</project_description>` : ""}
${safeClientName ? `\nClient:\n<client_name>\n${safeClientName}\n</client_name>` : ""}
${teamSize ? `Team Size: ${teamSize} people` : ""}

Create a structured project plan with phases and tasks. Each phase should have:
- A clear name
- A description of what will be accomplished
- Suggested duration (e.g., "2 weeks", "3 days")
- Key tasks within that phase with priority levels

Respond in JSON format:
{
  "phases": [
    {
      "name": "Phase name",
      "description": "What will be accomplished",
      "suggestedDuration": "1 week",
      "tasks": [
        {
          "title": "Task title",
          "priority": "high"
        }
      ]
    }
  ],
  "recommendations": ["Key recommendation 1", "Key recommendation 2"]
}`;

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: AI_GOVERNANCE_SYSTEM_MESSAGE },
        { role: "user", content: prompt },
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    return parseGovernedAIJson(content, projectPlanningSuggestionSchema, "Project plan");
  } catch (error: any) {
    console.error("[AI] Project planning failed:", error);
    throw new Error(error.message || "Failed to generate project plan");
  }
}

export async function generateTaskDescription(
  taskTitle: string,
  projectContext?: string
): Promise<string | null> {
  const config = await getAIConfig();
  
  if (!config || !config.apiKey) {
    return null;
  }

  try {
    const client = getOpenAIClient(config.apiKey);
    
    const safeTitle = boundAIInput(taskTitle, 500) || "Untitled task";
    const safeProjectContext = boundAIInput(projectContext);
    const prompt = `Write a clear, concise task description for the task below.

Task Title:
<task_title>
${safeTitle}
</task_title>
${safeProjectContext ? `\nProject Context:\n<project_context>\n${safeProjectContext}\n</project_context>` : ""}

Write a 1-3 sentence description that clarifies what needs to be done. Be specific and actionable.`;

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: AI_GOVERNANCE_SYSTEM_MESSAGE },
        { role: "user", content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || null;
  } catch (error: any) {
    console.error("[AI] Description generation failed:", error);
    throw new Error(error.message || "Failed to generate task description");
  }
}
