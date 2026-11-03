// Runs async jobs with at most `limit` in flight and returns results in the
// input order, so callers that merge outputs deterministically (analyst
// windows, compliance batches) get the same result as a sequential loop.
// Live runs showed sequential model calls (~2-3 min each) pushing case D
// past 20 minutes; a small pool keeps the demo inside a few minutes without
// flooding the Meta API.
export async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;
  const runLane = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index] as TInput;
      results[index] = await worker(item, index);
    }
  };
  const lanes = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: lanes }, () => runLane()));
  return results;
}
