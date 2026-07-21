import { describe, expect, it } from "vitest";
import { getStaticCacheControl } from "../static";

describe("static asset cache control", () => {
  it("serves hashed build assets with immutable cache headers", () => {
    expect(getStaticCacheControl("/app/dist/public/assets/index-H-Z1mW3g.js")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("keeps the SPA document revalidatable after deploys", () => {
    expect(getStaticCacheControl("/app/dist/public/index.html")).toBe("no-cache");
  });

  it("uses a short cache for non-hashed static files", () => {
    expect(getStaticCacheControl("/app/dist/public/favicon.ico")).toBe("public, max-age=3600");
  });
});
