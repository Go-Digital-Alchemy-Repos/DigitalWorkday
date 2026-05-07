export type ReportViewState = "loading" | "error" | "empty" | "ready";

export function getReportViewState(params: {
  isLoading: boolean;
  isError?: boolean;
  hasData: boolean;
}): ReportViewState {
  const { isLoading, isError = false, hasData } = params;

  if (isLoading) return "loading";
  if (isError) return "error";
  if (!hasData) return "empty";
  return "ready";
}
