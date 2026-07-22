import { useState } from "react";
import {
  buildReportRangeSearchParams,
  reportRangeValueFromQuery,
  type ReportRangeValue,
} from "./report-command-center-layout";

export function useReportRangeState(defaultRange: ReportRangeValue): [ReportRangeValue, (range: ReportRangeValue) => void] {
  const [range, setRangeState] = useState<ReportRangeValue>(() => {
    if (typeof window === "undefined") return defaultRange;
    const query = new URLSearchParams(window.location.search);
    return query.has("range") || query.has("startDate") || query.has("endDate")
      ? reportRangeValueFromQuery(query)
      : defaultRange;
  });

  const setRange = (next: ReportRangeValue) => {
    setRangeState(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("range");
    url.searchParams.delete("startDate");
    url.searchParams.delete("endDate");
    for (const [key, value] of buildReportRangeSearchParams(next)) url.searchParams.set(key, value);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };

  return [range, setRange];
}
