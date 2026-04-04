export interface RetryAttempt {
  attempt: number;
  delayMs: number;
  error: unknown;
}

export interface RetryOptions {
  delaysMs: readonly number[];
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: RetryAttempt) => void;
}

export const toRetryDelays = (
  baseDelayMs: number,
  retries: number,
): number[] => {
  if (baseDelayMs <= 0 || retries <= 0) return [];
  return Array.from({ length: retries }, (_, i) => baseDelayMs * (i + 1));
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const runWithRetry = async <T>(
  operation: () => PromiseLike<T>,
  options: RetryOptions,
): Promise<T> => {
  const { delaysMs, shouldRetry = () => true, onRetry } = options;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = delaysMs[attempt];
      if (delayMs === undefined || !shouldRetry(error)) {
        throw error;
      }

      onRetry?.({
        attempt: attempt + 1,
        delayMs,
        error,
      });
      await wait(delayMs);
    }
  }
};
