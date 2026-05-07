import { describe, expect, it } from "vitest";

import { buildDownloadContentDisposition } from "../s3";

describe("S3 download content disposition", () => {
  it("builds an attachment disposition with ascii and utf-8 filenames", () => {
    const header = buildDownloadContentDisposition(
      "attachment",
      "Screenshot 2026-04-27 at 8.17 AM.png",
    );

    expect(header).toContain("attachment");
    expect(header).toContain('filename="Screenshot 2026-04-27 at 8.17 AM.png"');
    expect(header).toContain("filename*=UTF-8''Screenshot%202026-04-27%20at%208.17%20AM.png");
  });

  it("sanitizes unsafe ascii fallback characters while preserving utf-8 filename", () => {
    const header = buildDownloadContentDisposition(
      "attachment",
      'Client "Final"\n设计.png',
    );

    expect(header).toContain('filename="Client _Final____.png"');
    expect(header).toContain("filename*=UTF-8''Client%20%22Final%22%0A%E8%AE%BE%E8%AE%A1.png");
  });

  it("supports inline preview disposition", () => {
    expect(buildDownloadContentDisposition("inline")).toBe("inline");
  });
});
