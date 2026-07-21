import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState as LayoutEmptyState } from "@/components/layout/empty-state";
import { EmptyState as SystemEmptyState } from "@/components/ui-system/EmptyState";

describe("responsive empty state actions", () => {
  it("stacks ui-system primary and secondary actions on narrow screens", () => {
    const markup = renderToStaticMarkup(
      <SystemEmptyState
        title="No matching items"
        description="Clear filters or create a new saved view."
        action={{ label: "Clear filters", onClick: () => undefined }}
        secondaryAction={{ label: "Create saved view", onClick: () => undefined }}
      />,
    );

    expect(markup).toContain("flex-col");
    expect(markup).toContain("sm:flex-row");
    expect(markup).toContain("w-full whitespace-normal text-center sm:w-auto");
  });

  it("gives layout empty-state custom actions a bounded mobile container", () => {
    const markup = renderToStaticMarkup(
      <LayoutEmptyState
        title="No projects yet"
        description="Create a project to organize client work."
        action={<button type="button">Create project</button>}
      />,
    );

    expect(markup).toContain("flex w-full max-w-sm justify-center sm:w-auto sm:max-w-none");
  });
});
