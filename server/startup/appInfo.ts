/**
 * App Info - Runtime logging for deployment verification
 * 
 * Logs app version, git SHA, environment, and configuration at startup.
 */

export function logAppInfo(): void {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  
  const gitSha = process.env.RAILWAY_GIT_COMMIT_SHA 
    || process.env.GIT_SHA 
    || process.env.RENDER_GIT_COMMIT 
    || "unknown";
  
  const gitBranch = process.env.RAILWAY_GIT_BRANCH 
    || process.env.GIT_BRANCH 
    || process.env.RENDER_GIT_BRANCH 
    || "unknown";
  
  const autoMigrate = process.env.AUTO_MIGRATE === "true";
  const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== "false";
  
  console.log("[app] =".repeat(10));
  console.log("[app] MyWorkDay Starting...");
  console.log("[app] =".repeat(10));
  console.log(`[app] Environment: ${nodeEnv}`);
  console.log(`[app] Git SHA: ${gitSha.substring(0, 7)}`);
  console.log(`[app] Git Branch: ${gitBranch}`);
  console.log(`[app] AUTO_MIGRATE: ${autoMigrate}`);
  console.log(`[app] Rate Limiting: ${rateLimitEnabled ? "enabled" : "disabled"}`);
  
  if (isProduction) {
    console.log("[app] Production mode - strict validation enabled");
  } else {
    console.log("[app] Development mode");
  }
  
  console.log("[app] =".repeat(10));
}

export function getAppVersion(): { gitSha: string; environment: string } {
  return {
    gitSha: process.env.RAILWAY_GIT_COMMIT_SHA 
      || process.env.GIT_SHA 
      || process.env.RENDER_GIT_COMMIT 
      || "unknown",
    environment: process.env.NODE_ENV || "development"
  };
}
