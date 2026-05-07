import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataPointHelp, DataPointLabel } from "@/components/data-point-help";
import { MetricCard } from "@/components/reports/report-shared";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderWithTooltipProvider(node: React.ReactElement) {
  return renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
}

describe("DataPointHelp", () => {
  it("adds accessible tooltip metadata for metric definitions", () => {
    const markup = renderWithTooltipProvider(
      <DataPointHelp
        label="Hours Tracked"
        definition="Total time entries recorded in the selected date range."
        source="time entries"
      />,
    );

    expect(markup).toContain('aria-label="Hours Tracked: Total time entries recorded in the selected date range. Source: time entries"');
    expect(markup).toContain('data-tooltip-label="Hours Tracked"');
    expect(markup).toContain('data-tooltip-source="time entries"');
  });

  it("can label a compact datapoint without replacing visible text", () => {
    const markup = renderWithTooltipProvider(
      <DataPointLabel
        label="Utilization"
        definition="Tracked hours compared with expected available hours."
      />,
    );

    expect(markup).toContain("Utilization");
    expect(markup).toContain('data-tooltip-definition="Tracked hours compared with expected available hours."');
  });
});

describe("Report MetricCard tooltips", () => {
  it("renders data point metadata when a report card has a definition", () => {
    const markup = renderWithTooltipProvider(
      <MetricCard
        label="Billable"
        value="12h"
        icon={<span />}
        color="bg-blue-500"
        definition="Tracked time categorized as client-billable."
        source="time entries"
      />,
    );

    expect(markup).toContain("Billable");
    expect(markup).toContain('data-tooltip-label="Billable"');
    expect(markup).toContain('data-tooltip-source="time entries"');
  });
});
