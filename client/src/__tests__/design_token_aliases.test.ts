import { describe, expect, it } from "vitest";

import { DURATION, RADII, SPACING, Z_INDEX } from "@/design/tokens";
import { motion, radius, sectionSpacing, spacing, zIndex } from "@/components/ui-system/tokens";

describe("ui-system token aliases", () => {
  it("derive spacing and radius aliases from canonical design tokens", () => {
    expect(spacing).toMatchObject({
      xs: SPACING["1"],
      sm: SPACING["2"],
      md: SPACING["4"],
      lg: SPACING["6"],
      xl: SPACING["8"],
      "2xl": SPACING["12"],
    });

    expect(radius).toMatchObject({
      sm: RADII.sm,
      md: RADII.md,
      lg: RADII.lg,
      xl: RADII.xl,
      full: RADII.full,
    });
  });

  it("keeps layout, motion, and z-index aliases tied to canonical tokens", () => {
    expect(sectionSpacing).toMatchObject({
      betweenSections: SPACING.section,
      withinSection: SPACING["4"],
      cardPadding: SPACING.card,
      pagePadding: SPACING.page,
    });

    expect(motion.duration).toMatchObject(DURATION);
    expect(zIndex).toMatchObject(Z_INDEX);
  });
});
