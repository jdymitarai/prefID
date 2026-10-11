export function assertValidCount(count: number, max: number): void {
  if (!Number.isInteger(count) || count < 0 || count > max) {
    throw new RangeError(
      `prefid: \`count\` must be an integer between 0 and ${max}.`,
    );
  }
}
