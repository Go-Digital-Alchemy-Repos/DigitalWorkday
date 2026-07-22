import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SortableTableHead } from "@/components/ui/sortable-table-head";

describe("SortableTableHead", () => {
  it("renders a semantic sort button and active aria state", () => {
    const markup = renderToStaticMarkup(
      <table>
        <thead>
          <tr>
            <SortableTableHead
              label="Range Hours"
              columnLabel="range hours"
              active
              direction="desc"
              onSort={vi.fn()}
            />
          </tr>
        </thead>
      </table>,
    );

    expect(markup).toContain('aria-sort="descending"');
    expect(markup).toContain('aria-label="Sort by range hours"');
    expect(markup).toContain('type="button"');
  });
});
