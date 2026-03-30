type ProcessMode = "all" | "api" | "worker";

const raw = (process.env.PROCESS_MODE || "all").toLowerCase();

const VALID_MODES: ProcessMode[] = ["all", "api", "worker"];

export const processMode: ProcessMode = VALID_MODES.includes(raw as ProcessMode)
  ? (raw as ProcessMode)
  : "all";

if (!VALID_MODES.includes(raw as ProcessMode) && raw !== "all") {
  console.warn(
    `[process-mode] Invalid PROCESS_MODE="${process.env.PROCESS_MODE}", falling back to "all". Valid values: ${VALID_MODES.join(", ")}`
  );
}

console.log(`[process-mode] Running in "${processMode}" mode`);

export function shouldRunApi(): boolean {
  return processMode === "all" || processMode === "api";
}

export function shouldRunWorkers(): boolean {
  return processMode === "all" || processMode === "worker";
}
