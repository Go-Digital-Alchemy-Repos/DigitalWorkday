import { db } from "../db";

export async function dbRows<T extends Record<string, unknown>>(
  q: Parameters<typeof db.execute>[0]
): Promise<T[]> {
  const result = await db.execute<T>(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

export function firstRow<T extends Record<string, unknown>>(
  result: unknown
): T | undefined {
  if (Array.isArray(result)) return result[0] as T | undefined;
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows[0] as T | undefined;
  }
  return undefined;
}
