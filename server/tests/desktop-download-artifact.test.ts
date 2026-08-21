import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const downloadDirectory = resolve(repoRoot, "client/public/downloads/macos");
const archivePath = resolve(downloadDirectory, "DigitalWorkday.zip");
const checksumPath = resolve(downloadDirectory, "DigitalWorkday.zip.sha256");
const appcastPath = resolve(downloadDirectory, "appcast.xml");
const tenantRouterPath = resolve(repoRoot, "client/src/routing/tenantRouter.tsx");

describe("desktop app download artifact", () => {
  it("ships the referenced ZIP instead of allowing the SPA document to masquerade as an archive", () => {
    const archive = readFileSync(archivePath);
    const recordedChecksum = readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
    const tenantRouter = readFileSync(tenantRouterPath, "utf8");

    expect(archive.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(archive.subarray(0, 15).toString("utf8").toLowerCase()).not.toContain("<!doctype html");
    expect(createHash("sha256").update(archive).digest("hex")).toBe(recordedChecksum);
    expect(tenantRouter).toContain(
      'const MACOS_APP_DOWNLOAD_URL = "/downloads/macos/DigitalWorkday.zip?v=1.2.2-build.6";',
    );
    expect(tenantRouter).toContain("Download Desktop App (Mac Beta)");
  });

  it("keeps the Sparkle feed coherent with the notarized 1.2.2 build 6 archive", () => {
    const appcast = readFileSync(appcastPath, "utf8");
    const archiveSize = statSync(archivePath).size;

    expect(appcast).toContain("<sparkle:version>6</sparkle:version>");
    expect(appcast).toContain("<sparkle:shortVersionString>1.2.2</sparkle:shortVersionString>");
    expect(appcast).toContain(
      `url="https://digitalworkday.ai/downloads/macos/DigitalWorkday.zip" length="${archiveSize}"`,
    );
    expect(appcast).toMatch(/sparkle:edSignature="[A-Za-z0-9+/=]+"/);
  });
});
