import OpenAI from "openai";
import { getAIProvider } from "../../services/ai/getAIProvider";
import type { EmployeeSummaryPayload } from "./buildEmployeeSummaryPayload";

export const SUMMARY_VERSION = "1.0";

export interface GeneratedSummary {
  headline: string;
  wins: string[];
  risks: string[];
  notableChanges: string[];
  recommendedActions: string[];
  confidence: "Low" | "Medium" | "High";
  supportingMetrics: Array<{ metric: string; value: string }>;
  markdown: string;
}

const SYSTEM_PROMPT = `You are a workforce analytics assistant generating an employee performance trend summary for a manager.

STRICT RULES — FOLLOW EXACTLY:
1. Only cite numbers and facts provided in the JSON payload. NEVER invent task names, project names, employee details, or events.
2. If a value is 0 or null, say "not available" or "none recorded" — do not estimate.
3. Do not include personally identifiable information beyond the employee's display name and role.
4. Do not reference specific task titles, message contents, or client names.
5. Be concise. Each bullet should be 1-2 sentences max.
6. Base confidence level on data completeness: High = all fields populated, Medium = some zeros, Low = mostly zeros.
7. Output ONLY valid JSON matching the required schema.

REQUIRED OUTPUT SCHEMA (JSON only, no markdown wrapper):
{
  "headline": "One sentence summarizing overall performance for the period.",
  "wins": ["Achievement 1", "Achievement 2"],
  "risks": ["Risk 1", "Risk 2"],
  "notableChanges": ["Change 1"],
  "recommendedActions": ["Action 1", "Action 2"],
  "confidence": "High" | "Medium" | "Low",
  "supportingMetrics": [
    { "metric": "metric name", "value": "formatted value" }
  ],
  "markdown": "### Performance Summary\\n\\n**Headline:** ...\\n\\n**Key Wins**\\n- ...\\n\\n**Risks**\\n- ...\\n\\n**Recommended Actions**\\n- ..."
}`;

function buildUserPrompt(payload: EmployeeSummaryPayload): string {
  return `Analyze the following employee performance data and generate a summary.

EMPLOYEE DATA (JSON):
${JSON.stringify(payload, null, 2)}

Generate a performance trend summary strictly based on the above data. Include 2-4 wins, 1-3 risks, 1-2 notable changes, and 2-3 recommended actions. Keep all statements factual and grounded in the provided numbers.`;
}

const REDACTION_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

function redactCheck(text: string): boolean {
  for (const pattern of REDACTION_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

export async function generateEmployeeSummary(
  tenantId: string,
  payload: EmployeeSummaryPayload,
  enableRedaction: boolean
): Promise<GeneratedSummary> {
  const providerResult = await getAIProvider(tenantId);
  if (!providerResult) {
    throw new Error("AI is not configured for this tenant. Contact your administrator.");
  }

  const { config } = providerResult;
  const client = new OpenAI({ apiKey: config.apiKey });

  async function callModel(systemPrompt: string): Promise<GeneratedSummary> {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(payload) },
      ],
      max_tokens: Math.min(config.maxTokens, 1200),
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("AI returned an empty response.");
    }

    const parsed = JSON.parse(content) as GeneratedSummary;

    if (!parsed.headline || !Array.isArray(parsed.wins)) {
      throw new Error("AI response did not match expected schema.");
    }

    return parsed;
  }

  let result = await callModel(SYSTEM_PROMPT);

  if (enableRedaction) {
    const resultText = JSON.stringify(result);
    if (redactCheck(resultText)) {
      console.warn("[AI:employeeSummary] Redaction check failed — regenerating with stricter prompt.");
      const stricterPrompt = SYSTEM_PROMPT + "\n\nCRITICAL: Do NOT include any email addresses or contact details.";
      result = await callModel(stricterPrompt);

      if (redactCheck(JSON.stringify(result))) {
        throw new Error("AI summary contained sensitive content that could not be redacted. Please try again.");
      }
    }
  }

  if (!result.markdown) {
    result.markdown = buildFallbackMarkdown(result);
  }

  return result;
}

function buildFallbackMarkdown(summary: GeneratedSummary): string {
  const lines = [
    `### Performance Summary`,
    ``,
    `**${summary.headline}**`,
  ];

  if (summary.wins.length > 0) {
    lines.push(``, `**Key Wins**`);
    summary.wins.forEach(w => lines.push(`- ${w}`));
  }

  if (summary.risks.length > 0) {
    lines.push(``, `**Risks**`);
    summary.risks.forEach(r => lines.push(`- ${r}`));
  }

  if (summary.notableChanges.length > 0) {
    lines.push(``, `**Notable Changes**`);
    summary.notableChanges.forEach(c => lines.push(`- ${c}`));
  }

  if (summary.recommendedActions.length > 0) {
    lines.push(``, `**Recommended Actions**`);
    summary.recommendedActions.forEach(a => lines.push(`- ${a}`));
  }

  return lines.join("\n");
}
