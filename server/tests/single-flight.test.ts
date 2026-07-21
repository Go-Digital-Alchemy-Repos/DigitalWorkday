import { describe, expect, it } from "vitest";
import { createSingleFlightRunner } from "../lib/singleFlight";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("createSingleFlightRunner", () => {
  it("skips overlapping async runs and allows later runs after completion", async () => {
    const firstRun = deferred();
    let runCount = 0;
    let skipCount = 0;

    const run = createSingleFlightRunner(
      async () => {
        runCount++;
        await firstRun.promise;
      },
      { onSkip: () => skipCount++ },
    );

    const running = run();
    await run();

    expect(runCount).toBe(1);
    expect(skipCount).toBe(1);

    firstRun.resolve();
    await running;

    await run();

    expect(runCount).toBe(2);
    expect(skipCount).toBe(1);
  });
});
