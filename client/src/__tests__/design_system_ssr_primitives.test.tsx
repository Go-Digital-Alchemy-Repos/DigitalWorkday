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
import { Skeleton } from "@/components/ui/skeleton";
import { ToastClose } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

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

  it("renders accessible status and dismiss defaults for shared primitives", () => {
    const markup = render(
      <div>
        <LoadingState type="table" rows={1} />
        <Skeleton className="h-4 w-20" />
        <ToastClose />
      </div>,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-label="Loading content"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('aria-label="Close notification"');
  });

  it("marks shared cards and buttons for theme-specific styling", () => {
    const markup = render(
      <Card>
        <CardTitle>Editorial title</CardTitle>
        <CardContent>Card copy</CardContent>
        <Button>Save</Button>
        <Button variant="outline">Cancel</Button>
      </Card>,
    );

    expect(markup).toContain('data-ui="card"');
    expect(markup).toContain('data-ui="card-title"');
    expect(markup).toContain('data-ui="card-content"');
    expect(markup).toContain('data-variant="default"');
    expect(markup).toContain('data-variant="outline"');
  });
});
