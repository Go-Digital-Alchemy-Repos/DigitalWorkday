import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell, EmptyState, LoadingSkeleton, PageHeader, SectionHeader } from "@/components/ui-system";
import {
  EmptyState as LayoutEmptyState,
  LoadingState,
  PageShell,
  SurfacePanel,
} from "@/components/layout";

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

describe("design-system primitive SSR smoke", () => {
  it("renders representative ui-system primitives without relying on implicit React globals", () => {
    const markup = render(
      <AppShell>
        <PageHeader title="Projects" description="Track active work" />
        <SectionHeader title="Overview" description="Current portfolio" />
        <LoadingSkeleton variant="metric" count={1} />
        <EmptyState title="No projects yet" description="Create a project to get started." />
      </AppShell>,
    );

    expect(markup).toContain("Projects");
    expect(markup).toContain("Overview");
    expect(markup).toContain("No projects yet");
  });

  it("renders representative layout primitives without relying on implicit React globals", () => {
    const markup = render(
      <PageShell>
        <SurfacePanel>
          <LayoutEmptyState title="No clients yet" description="Add a client to continue." />
          <LoadingState type="list" rows={1} />
        </SurfacePanel>
      </PageShell>,
    );

    expect(markup).toContain("No clients yet");
    expect(markup).toContain("loading-state-list");
  });
});
