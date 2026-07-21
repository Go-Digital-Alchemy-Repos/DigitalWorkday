export interface PoolSizing {
  min: number;
  max: number;
}

export interface DbPoolCapacityConfig {
  app: PoolSizing;
  session: PoolSizing;
  totalMaxPerReplica: number;
}

function parseNonNegativeInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function clampMinToMax(min: number, max: number): PoolSizing {
  const normalizedMax = Math.max(max, 1);
  return {
    min: Math.min(min, normalizedMax),
    max: normalizedMax,
  };
}

export function getDbPoolCapacityConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { databaseConfigured?: boolean } = {},
): DbPoolCapacityConfig {
  const databaseConfigured = options.databaseConfigured ?? Boolean(env.DATABASE_URL);

  const appMax = parseNonNegativeInt(env.DB_POOL_MAX, 10);
  const appMinDefault = databaseConfigured ? 2 : 0;
  const appMin = parseNonNegativeInt(env.DB_POOL_MIN, appMinDefault);

  const sessionMax = parseNonNegativeInt(env.SESSION_DB_POOL_MAX, 5);
  const sessionMinDefault = databaseConfigured ? 0 : 0;
  const sessionMin = parseNonNegativeInt(env.SESSION_DB_POOL_MIN, sessionMinDefault);

  const app = clampMinToMax(appMin, appMax);
  const session = clampMinToMax(sessionMin, sessionMax);

  return {
    app,
    session,
    totalMaxPerReplica: app.max + session.max,
  };
}
