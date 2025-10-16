import { setTimeout as sleep } from 'timers/promises';

export type RetryError = Error & { response?: { status?: number; headers?: Record<string, unknown> } } & {
  [k: string]: unknown;
};

export interface RetryOptions {
  maxAttempts: number; // total attempts including the first
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number; // 0..1 proportion of delay used as +/- random jitter
  shouldRetry: (error: RetryError, attempt: number) => boolean | Promise<boolean>;
  getRetryAfter?: (error: RetryError) => number | undefined; // milliseconds if provided
  onAttempt?: (attempt: number, delayMs: number, error: RetryError) => void;
}

function computeDelay(attempt: number, opts: RetryOptions, err: RetryError): number {
  let delay = computeBackoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
  const retryAfter = opts.getRetryAfter?.(err);
  if (typeof retryAfter === 'number' && retryAfter >= 0) {
    delay = Math.min(retryAfter, opts.maxDelayMs);
  }
  if (opts.jitterRatio > 0) {
    const jitterAmt = delay * opts.jitterRatio;
    const delta = (Math.random() * 2 - 1) * jitterAmt;
    delay = Math.max(0, Math.min(opts.maxDelayMs, Math.round(delay + delta)));
  }
  return delay;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 1;
  let lastError: RetryError | undefined;
  while (attempt <= opts.maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as RetryError;
      if (attempt >= opts.maxAttempts) break;
      if (!(await opts.shouldRetry(lastError, attempt))) break;
      const delay = computeDelay(attempt, opts, lastError);
      opts.onAttempt?.(attempt + 1, delay, lastError);
      await sleep(delay);
      attempt++;
    }
  }
  throw lastError || new Error('Retry failed without captured error');
}

export function computeBackoffDelay(attempt: number, base: number, max: number): number {
  // exponential backoff: base * 2^(attempt-1)
  const raw = base * Math.pow(2, attempt - 1);
  return Math.min(raw, max);
}
