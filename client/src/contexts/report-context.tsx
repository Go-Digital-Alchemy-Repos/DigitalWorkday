import { createContext, useContext } from "react";

interface ReportContextValue {
  isSuperAdmin: boolean;
  linkPrefix: string;
}

const ReportContext = createContext<ReportContextValue>({
  isSuperAdmin: false,
  linkPrefix: "",
});

export function ReportContextProvider({
  isSuperAdmin,
  children,
}: {
  isSuperAdmin: boolean;
  children: React.ReactNode;
}) {
  const linkPrefix = isSuperAdmin ? "/super-admin/reports" : "";
  return (
    <ReportContext.Provider value={{ isSuperAdmin, linkPrefix }}>
      {children}
    </ReportContext.Provider>
  );
}

export function useReportContext() {
  return useContext(ReportContext);
}

export function useReportLink() {
  const { isSuperAdmin, linkPrefix } = useReportContext();
  return (path: string): string => {
    if (!isSuperAdmin) return path;
    if (path.startsWith("/reports/")) {
      return linkPrefix + path.slice("/reports".length);
    }
    if (path.startsWith("/projects/")) {
      return linkPrefix + path;
    }
    return path;
  };
}
