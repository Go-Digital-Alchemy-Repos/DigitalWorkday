/**
 * @file server/ai/pmFocus/generatePmFocusSummary.ts
 * @description AI generation for the PM Weekly Focus Summary.
 *
 * GROUNDING CONTRACT:
 * - Output only contains facts from the provided payload JSON
 * - No task titles, message content, or client PII beyond names
 * - Redaction post-check rejects outputs with emails or sensitive patterns
 * - Confidence is derived from data completeness, not invented
 */

import OpenAI from "openai";
import { getAIProvider } from "../../services/ai/getAIProvider";
import type { PmFocusPayload } from "./buildPmFocusPayload";

export interface PmFocusPriority {
  title: string;
  why: string;
  suggestedNextStep: string;
}

export interface PmFocusSummary {
  headline: string;
  topPriorities: PmFocusPriority[];
  risksToAddress: PmFocusPriority[];
  capacityConcerns: PmFocusPriority[];
  budgetConcerns: PmFocusPriority[];
  confidence: "Low" | "Medium" | "High";
  supportingMetrics: Array<{ metric: string; value: string }>;
  markdown: string;
}

export const PM_FOCUS_SUMMARY_VERSION = "1.0";

const SYSTEM_PROMPT = `You are a project management analytics assistant generating a "Weekly Focus Summary" for a Project Manager.

STRICT GROUNDING RULES — FOLLOW EXACTLY:
1. Only reference numbers and facts present in the provided JSON payload. NEVER invent project names, task titles, user names, or events not in the data.
2. If the payload has 0 at-risk projects, say there are none — do not suggest risks anyway.
3. Do not include personally identifiable information beyond the display names already in the payload.
4. Do not reference specific task titles, message contents, chat history, or private client details.
5. Keep every bullet to 1-2 sentences. Be actionable and direct.
6. Confidence: High = all key metrics populated with non-zero values, Medium = some zeros/nulls, Low = mostly empty.
7. Limit topPriorities to 3 items max, risksToAddress to 3 max, capacityConcerns to 2 max, budgetConcerns to 2 max.
8. Output ONLY valid JSON matching the required schema. No markdown wrapper, no extra keys.

REQUIRED OUTPUT SCHEMA (JSON only):
{
  "headline": "One-sentence summary of what demands the PM's attention this week.",
  "topPriorities": [
    { "title": "Short action-oriented title", "why": "Why this is a priority based on the data", "suggestedNextStep": "Specific actionable next step" }
  ],
  "risksToAddress": [
    { "title": "Risk title", "why": "Risk driver from data", "suggestedNextStep": "Mitigation step" }
  ],
  "capacityConcerns": [
    { "title": "Overloaded team member name or 'N team members overloaded'", "why": "Active task count context", "suggestedNextStep": "Suggested action" }
  ],
  "budgetConcerns": [
    { "title": "Project name from payload or 'N projects at burn risk'", "why": "Burn % context", "suggestedNextStep": "Budget review or reforecast action" }
  ],
  "confidence": "High" | "Medium" | "Low",
  "supportingMetrics": [
    { "metric": "metric name", "value": "formatted value" }
  ],
  "markdown": "### Weekly Focus Summary\\n\\n**Headline:** ...\\n\\n**Top Priorities**\\n- ...\\n\\n**Risks**\\n- ...\\n\\n**Capacity**\\n- ...\\n\\n**Budget**\\n- ..."
}`;

function buildUserPrompt(payload: PmFocusPayload): string {
  const sanitized = {
    rangeStart: payload.rangeStart,
    rangeEnd: payload.rangeEnd,
    portfolio: payload.portfolio,
    atRiskProjects: payload.atRiskProjects.map((p) => ({
      name: p.name,
      riskLevel: p.riskLevel,
      drivers: p.drivers,
      needsAck: p.needsAck,
      burnPercent: p.burnPercent,
      overdueTasksCount: p.overdueTasksCount,
    })),
    needsAckCount: payload.needsAckCount,
    capacityConcerns: payload.capacityConcerns.map((c) => ({
      displayName: c.displayName,
      activeTaskCount: c.activeTaskCount,
      overdueTaskCount: c.overdueTaskCount,
    })),
    weekOverWeekDeltas: payload.weekOverWeekDeltas,
  };

  return `Generate a Weekly PM Focus Summary for the following portfolio data.

PM PORTFOLIO DATA (JSON):
${JSON.stringify(sanitized, null, 2)}

Generate the summary strictly based on the above data. Identify 2-3 top priorities, relevant risks, capacity concerns, and budget issues. Keep recommendations actionable and grounded in the numbers provided.`;
}

const REDACTION_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

function failsRedactionCheck(text: string): boolean {
  for (const pattern of REDACTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

export async function generatePmFocusSummary(
  tenantId: string,
  payload: PmFocusPayload,
  enableRedaction: boolean
): Promise<PmFocusSummary> {
  const providerResult = await getAIProvider(tenantId);
  if (!providerResult) {
    throw new Error("AI is not configured for this tenant. Contact your administrator.");
  }

  const { config } = providerResult;
  const client = new OpenAI({ apiKey: config.apiKey });

  async function callModel(systemPrompt: string): Promise<PmFocusSummary> {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(payload) },
      ],
      max_tokens: Math.min(config.maxTokens ?? 4096, 1600),
      temperature: 0.35,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned an empty response.");

    const parsed = JSON.parse(content) as PmFocusSummary;

    if (!parsed.headline || !Array.isArray(parsed.topPriorities)) {
      throw new Error("AI response did not match expected schema.");
    }

    return parsed;
  }

  let result = await callModel(SYSTEM_PROMPT);

  if (enableRedaction) {
    const resultText = JSON.stringify(result);
    if (failsRedactionCheck(resultText)) {
      console.warn("[AI:pmFocus] Redaction check failed — regenerating with stricter prompt.");
      const stricterPrompt = SYSTEM_PROMPT + "\n\nCRITICAL: Do NOT include any email addresses, phone numbers, or contact details.";
      result = await callModel(stricterPrompt);

      if (failsRedactionCheck(JSON.stringify(result))) {
        throw new Error("AI summary contained sensitive content that could not be redacted. Please try again.");
      }
    }
  }

  if (!result.markdown) {
    result.markdown = buildFallbackMarkdown(result);
  }

  return result;
}

function buildFallbackMarkdown(s: PmFocusSummary): string {
  const lines = ["### Weekly Focus Summary", "", `**${s.headline}**`];

  if (s.topPriorities.length > 0) {
    lines.push("", "**Top Priorities**");
    s.topPriorities.forEach((p) => lines.push(`- **${p.title}:** ${p.why} → ${p.suggestedNextStep}`));
  }
  if (s.risksToAddress.length > 0) {
    lines.push("", "**Risks to Address**");
    s.risksToAddress.forEach((r) => lines.push(`- **${r.title}:** ${r.why} → ${r.suggestedNextStep}`));
  }
  if (s.capacityConcerns.length > 0) {
    lines.push("", "**Capacity**");
    s.capacityConcerns.forEach((c) => lines.push(`- **${c.title}:** ${c.why} → ${c.suggestedNextStep}`));
  }
  if (s.budgetConcerns.length > 0) {
    lines.push("", "**Budget**");
    s.budgetConcerns.forEach((b) => lines.push(`- **${b.title}:** ${b.why} → ${b.suggestedNextStep}`));
  }

  return lines.join("\n");
}
