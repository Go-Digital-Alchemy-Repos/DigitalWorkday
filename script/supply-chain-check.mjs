import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lockfile = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const errors = [];

const allowedInstallScriptPackages = new Set([
  "bufferutil",
  "esbuild",
  "fsevents",
  "sharp",
]);

const devOnlyRuntimePackages = [
  /^@types\//,
  /^vitest$/,
  /^supertest$/,
  /^rollup-plugin-visualizer$/,
];

function fail(message) {
  errors.push(message);
}

function packageNameFromLockPath(path) {
  const segments = path.split("node_modules/");
  return segments[segments.length - 1];
}

for (const alternateLockfile of ["yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json"]) {
  if (fs.existsSync(alternateLockfile)) {
    fail(`Unexpected alternate lockfile present: ${alternateLockfile}`);
  }
}

if (lockfile.lockfileVersion !== 3) {
  fail(`Expected package-lock lockfileVersion 3, found ${lockfile.lockfileVersion}`);
}

for (const depName of Object.keys(packageJson.dependencies || {})) {
  if (devOnlyRuntimePackages.some(pattern => pattern.test(depName))) {
    fail(`Move development-only package out of dependencies: ${depName}`);
  }
}

for (const section of ["dependencies", "devDependencies", "optionalDependencies", "overrides"]) {
  const entries = packageJson[section] || {};
  for (const [name, spec] of Object.entries(entries)) {
    if (typeof spec !== "string") continue;
    if (/^(git\+|github:|git:|file:|https?:\/\/)/.test(spec)) {
      fail(`Disallowed non-registry spec in ${section}.${name}: ${spec}`);
    }
  }
}

for (const [path, pkg] of Object.entries(lockfile.packages || {})) {
  if (!path.startsWith("node_modules/")) continue;
  const packageName = packageNameFromLockPath(path);
  const resolved = pkg.resolved || "";

  if (resolved && !resolved.startsWith("https://registry.npmjs.org/")) {
    fail(`Disallowed non-registry resolved package ${packageName}: ${resolved}`);
  }

  if (resolved.startsWith("https://registry.npmjs.org/") && !pkg.integrity) {
    fail(`Registry package is missing integrity metadata: ${packageName}`);
  }

  if (pkg.hasInstallScript && !allowedInstallScriptPackages.has(packageName)) {
    fail(`Unexpected install script package: ${packageName}`);
  }
}

const approvedInstallScripts = packageJson.allowScripts || {};
for (const approved of Object.keys(approvedInstallScripts)) {
  const packageName = approved.replace(/@\d.*$/, "");
  if (!allowedInstallScriptPackages.has(packageName)) {
    fail(`Unexpected approved install script package: ${approved}`);
  }
}

if (errors.length > 0) {
  console.error("Supply-chain check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Supply-chain check passed");
