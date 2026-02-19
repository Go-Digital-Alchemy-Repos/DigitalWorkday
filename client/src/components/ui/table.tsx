import * as React from "react"

import { cn } from "@/lib/utils"

function useTableKeyboardNav(containerRef: React.RefObject<HTMLDivElement | null>) {
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const rows = Array.from(container.querySelectorAll("tbody tr")) as HTMLElement[];
    if (rows.length === 0) return;

    const currentIndex = rows.findIndex((r) => r === document.activeElement);

    let nextIndex = -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = currentIndex < rows.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex = currentIndex > 0 ? currentIndex - 1 : rows.length - 1;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = rows.length - 1;
    } else if (e.key === "Enter" && currentIndex >= 0) {
      const clickable = rows[currentIndex].querySelector("a, button, [role='button']") as HTMLElement | null;
      if (clickable) {
        clickable.click();
      } else {
        rows[currentIndex].click();
      }
      return;
    }

    if (nextIndex >= 0 && rows[nextIndex]) {
      rows[nextIndex].focus();
    }
  }, [containerRef]);

  return handleKeyDown;
}

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, role = "table", ...props }, ref) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const handleKeyDown = useTableKeyboardNav(containerRef);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="region"
      aria-label="Data table"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <table
        ref={ref}
        role={role}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
})
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, tabIndex, ...props }, ref) => (
  <tr
    ref={ref}
    tabIndex={tabIndex ?? -1}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, scope = "col", ...props }, ref) => (
  <th
    ref={ref}
    scope={scope}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
