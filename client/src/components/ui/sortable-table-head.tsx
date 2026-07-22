import React, { type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/table-sort";
import { TableHead } from "@/components/ui/table";

interface SortableTableHeadProps {
  label: ReactNode;
  columnLabel: string;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
  align?: "left" | "center" | "right";
  help?: ReactNode;
  className?: string;
  testId?: string;
}

export function SortableTableHead({
  label,
  columnLabel,
  active,
  direction,
  onSort,
  align = "left",
  help,
  className,
  testId,
}: SortableTableHeadProps) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "whitespace-nowrap px-2",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
      data-testid={testId}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-1",
          align === "center" && "justify-center",
          align === "right" && "justify-end",
        )}
      >
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "group -my-2 inline-flex min-h-10 min-w-0 items-center gap-1.5 rounded-md px-2 font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active && "text-foreground",
          )}
          aria-label={`Sort by ${columnLabel}`}
        >
          <span className="truncate">{label}</span>
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              active ? "text-primary" : "text-muted-foreground/55 group-hover:text-muted-foreground",
            )}
            aria-hidden="true"
          />
        </button>
        {help}
      </div>
    </TableHead>
  );
}
