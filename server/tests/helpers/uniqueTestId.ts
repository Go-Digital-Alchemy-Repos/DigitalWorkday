let sequence = 0;

export function uniqueTestId(prefix = "test"): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${sequence}`;
}
