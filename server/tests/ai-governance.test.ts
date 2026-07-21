import { describe, expect, it } from "vitest";
import {
  aiConfigUpdateSchema,
  boundAIInput,
  normalizeAIMaxTokens,
  normalizeAIModel,
  normalizeAITemperature,
  parseGovernedAIJson,
  projectPlanningSuggestionSchema,
  taskBreakdownSuggestionSchema,
} from "../services/ai/governance";

describe("AI governance helpers", () => {
  it("normalizes runtime AI config from environment or stored values", () => {
    expect(normalizeAIModel("gpt-4o")).toBe("gpt-4o");
    expect(normalizeAIModel("unknown-model")).toBe("gpt-4o-mini");
    expect(normalizeAIMaxTokens("90000")).toBe(8000);
    expect(normalizeAIMaxTokens("12")).toBe(100);
    expect(normalizeAITemperature("5")).toBe(1);
    expect(normalizeAITemperature("-1")).toBe(0);
  });

  it("rejects unsafe config updates at API boundaries", () => {
    expect(aiConfigUpdateSchema.safeParse({ model: "gpt-4o-mini", maxTokens: 2000, temperature: "0.7" }).success).toBe(true);
    expect(aiConfigUpdateSchema.safeParse({ model: "unlisted-model" }).success).toBe(false);
    expect(aiConfigUpdateSchema.safeParse({ maxTokens: 50 }).success).toBe(false);
    expect(aiConfigUpdateSchema.safeParse({ temperature: "1.5" }).success).toBe(false);
  });

  it("bounds user-provided prompt context before prompt construction", () => {
    expect(boundAIInput("  hello  ")).toBe("hello");
    expect(boundAIInput("x".repeat(20), 5)).toBe("xxxxx");
    expect(boundAIInput("   ")).toBeUndefined();
  });

  it("validates AI task breakdown JSON before trusting it", () => {
    const result = parseGovernedAIJson(
      JSON.stringify({
        subtasks: [{ title: "Draft outline", estimatedMinutes: 30 }],
        reasoning: "Small first step.",
      }),
      taskBreakdownSuggestionSchema,
      "Task breakdown",
    );

    expect(result.subtasks[0].title).toBe("Draft outline");
    expect(() => parseGovernedAIJson("{bad", taskBreakdownSuggestionSchema, "Task breakdown")).toThrow("invalid JSON");
    expect(() => parseGovernedAIJson(JSON.stringify({ subtasks: [] }), taskBreakdownSuggestionSchema, "Task breakdown")).toThrow("invalid structure");
  });

  it("validates AI project plan JSON before trusting it", () => {
    const result = parseGovernedAIJson(
      JSON.stringify({
        phases: [{
          name: "Discovery",
          description: "Confirm scope.",
          suggestedDuration: "1 week",
          tasks: [{ title: "Interview stakeholders", priority: "high" }],
        }],
      }),
      projectPlanningSuggestionSchema,
      "Project plan",
    );

    expect(result.phases[0].tasks[0].priority).toBe("high");
    expect(() => parseGovernedAIJson(
      JSON.stringify({ phases: [{ name: "Bad", description: "No tasks", suggestedDuration: "1 day", tasks: [] }] }),
      projectPlanningSuggestionSchema,
      "Project plan",
    )).toThrow("invalid structure");
  });
});
