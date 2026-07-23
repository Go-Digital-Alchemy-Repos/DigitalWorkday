import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { cp, rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // App Docs is runtime content, not just repository documentation. Keep it in
  // the deploy artifact so production builders that prune source files do not
  // leave the Super Admin documentation center empty.
  console.log("copying app docs...");
  await cp("docs", "dist/docs", { recursive: true });

  // The in-app Sync API Docs action scans route source to preserve useful file
  // and line references. Package only the server trees it needs when a runtime
  // image omits the repository source.
  console.log("copying API documentation scanner sources...");
  for (const directory of ["http", "routes", "features", "jobs"]) {
    await cp(`server/${directory}`, `dist/source/server/${directory}`, { recursive: true });
  }
}

buildAll()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
