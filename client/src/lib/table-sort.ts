export type SortDirection = "asc" | "desc";

export type TableSortValue = string | number | boolean | Date | null | undefined;

export interface TableSortState<Key extends string> {
  key: Key | null;
  direction: SortDirection;
}

export function nextTableSortState<Key extends string>(
  current: TableSortState<Key>,
  key: Key,
  firstDirection: SortDirection = "asc",
): TableSortState<Key> {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }

  return { key, direction: firstDirection };
}

function comparableValue(value: TableSortValue): string | number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value ?? "";
}

export function compareTableValues(
  left: TableSortValue,
  right: TableSortValue,
  direction: SortDirection,
): number {
  const leftMissing = left === null || left === undefined || left === "";
  const rightMissing = right === null || right === undefined || right === "";

  // Missing values remain at the bottom in both directions.
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }

  const a = comparableValue(left);
  const b = comparableValue(right);
  let result: number;

  if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  return direction === "asc" ? result : -result;
}

export function sortTableRows<Row>(
  rows: readonly Row[],
  accessor: (row: Row) => TableSortValue,
  direction: SortDirection,
): Row[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const result = compareTableValues(accessor(left.row), accessor(right.row), direction);
      return result === 0 ? left.index - right.index : result;
    })
    .map(({ row }) => row);
}
