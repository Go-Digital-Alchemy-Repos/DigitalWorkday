import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { desktopBootstrapSchema } from "@shared/desktopContracts";
import { derivePKCEChallenge, hashDesktopToken } from "../features/desktop/desktopAuth.service";

describe("desktop companion contract", () => {
  it("keeps the checked-in bootstrap fixture Codable-friendly", () => {
    const fixture = JSON.parse(readFileSync("docs/contracts/desktop-bootstrap.v1.json", "utf8"));
    const parsed = desktopBootstrapSchema.parse(fixture);
    expect(parsed.contractVersion).toBe(1);
    expect(parsed.tasks.items[0]?.projectName).toBe("Website Launch");
  });

  it("derives RFC 7636 S256 challenges", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(derivePKCEChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("hashes tokens without persisting plaintext", () => {
    expect(hashDesktopToken("secret-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDesktopToken("secret-token")).not.toContain("secret-token");
  });
});
