/**
 * Deploy Smoke Check (CommonJS version for production)
 * Runs before application start to verify deployment prerequisites.
 * Fails fast with actionable error messages if something is missing.
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'APP_ENCRYPTION_KEY',
];

const OPTIONAL_ENV_VARS = [
  'AUTO_MIGRATE',
  'SKIP_PARITY_CHECK',
  'NODE_ENV',
];

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  console.log(`[smoke] Node.js version: ${version}`);
  
  if (major < 18) {
    console.error(`[smoke] ERROR: Node.js ${major} is not supported. Requires Node.js 18+`);
    return false;
  }
  return true;
}

function checkEnvVars() {
  console.log('[smoke] Checking environment variables...');
  let allPresent = true;
  
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar];
    if (!value) {
      console.error(`[smoke] ERROR: Missing required env var: ${envVar}`);
      allPresent = false;
    } else {
      const masked = envVar.includes('SECRET') || envVar.includes('URL') 
        ? `${value.slice(0, 8)}...` 
        : value;
      console.log(`[smoke]   ${envVar}: ${masked}`);
    }
  }
  
  console.log('[smoke] Optional environment variables:');
  for (const envVar of OPTIONAL_ENV_VARS) {
    const value = process.env[envVar];
    console.log(`[smoke]   ${envVar}: ${value || '(not set)'}`);
  }
  
  return allPresent;
}

function checkEncryptionKey() {
  console.log('[smoke] Validating APP_ENCRYPTION_KEY format...');
  const value = process.env.APP_ENCRYPTION_KEY;

  if (!value) {
    console.error('[smoke] ERROR: APP_ENCRYPTION_KEY is required for production secret encryption');
    return false;
  }

  let decoded;
  try {
    decoded = Buffer.from(value, 'base64');
  } catch {
    console.error('[smoke] ERROR: APP_ENCRYPTION_KEY must be base64 encoded');
    return false;
  }

  if (decoded.length !== 32) {
    console.error(`[smoke] ERROR: APP_ENCRYPTION_KEY must decode to 32 bytes, found ${decoded.length}`);
    console.error("[smoke] Fix: Generate one with 'openssl rand -base64 32'");
    return false;
  }

  console.log('[smoke]   APP_ENCRYPTION_KEY: valid 32-byte base64 value');
  return true;
}

function checkBuildArtifacts() {
  console.log('[smoke] Checking build artifacts...');
  
  const distIndex = path.join(process.cwd(), 'dist', 'index.cjs');
  const distPublic = path.join(process.cwd(), 'dist', 'public', 'index.html');
  
  let allPresent = true;
  
  if (!fs.existsSync(distIndex)) {
    console.error(`[smoke] ERROR: Missing server bundle: dist/index.cjs`);
    console.error(`[smoke] Fix: Run 'npm run build' before 'npm run start'`);
    allPresent = false;
  } else {
    const stats = fs.statSync(distIndex);
    console.log(`[smoke]   dist/index.cjs: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }
  
  if (!fs.existsSync(distPublic)) {
    console.error(`[smoke] ERROR: Missing client build: dist/public/index.html`);
    console.error(`[smoke] Fix: Run 'npm run build' before 'npm run start'`);
    allPresent = false;
  } else {
    console.log(`[smoke]   dist/public/index.html: present`);
  }
  
  return allPresent;
}

function runSmokeCheck() {
  console.log('[smoke] ========================================');
  console.log('[smoke] Deploy Smoke Check');
  console.log('[smoke] ========================================');
  
  const checks = [
    { name: 'Node.js version', fn: checkNodeVersion },
    { name: 'Environment variables', fn: checkEnvVars },
    { name: 'Encryption key', fn: checkEncryptionKey },
    { name: 'Build artifacts', fn: checkBuildArtifacts },
  ];
  
  let failed = false;
  
  for (const check of checks) {
    console.log(`[smoke] --- ${check.name} ---`);
    if (!check.fn()) {
      failed = true;
    }
  }
  
  console.log('[smoke] ========================================');
  
  if (failed) {
    console.error('[smoke] FAILED: One or more smoke checks failed');
    console.error('[smoke] Fix the issues above before deploying');
    process.exit(1);
  }
  
  console.log('[smoke] PASSED: All smoke checks passed');
  console.log('[smoke] ========================================');
}

runSmokeCheck();
