export interface SingleFlightOptions {
  onSkip?: () => void;
}

export function createSingleFlightRunner(
  run: () => Promise<void>,
  options: SingleFlightOptions = {},
): () => Promise<void> {
  let running = false;

  return async () => {
    if (running) {
      options.onSkip?.();
      return;
    }

    running = true;
    try {
      await run();
    } finally {
      running = false;
    }
  };
}
