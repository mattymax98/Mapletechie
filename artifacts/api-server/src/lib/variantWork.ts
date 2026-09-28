/**
 * Coalesce concurrent requests for the same immutable variant without retaining
 * completed buffers in the process. Limit distinct cold misses so a burst does
 * not run an unbounded number of expensive decodes or hold an unbounded queue.
 */
export class VariantQueueFullError extends Error {}

type Job<T> = {
  key: string;
  work: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export class VariantWorkQueue<T> {
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly pending: Job<T>[] = [];
  private active = 0;

  constructor(
    private readonly maxActive: number,
    private readonly maxPending: number,
  ) {
    if (!Number.isInteger(maxActive) || maxActive < 1 || !Number.isInteger(maxPending) || maxPending < 0) {
      throw new Error("Invalid variant work queue limits");
    }
  }

  run(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    if (this.active >= this.maxActive && this.pending.length >= this.maxPending) {
      return Promise.reject(new VariantQueueFullError("Image transform queue is full"));
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.push({ key, work, resolve, reject });
    });
    this.inFlight.set(key, promise);
    this.drain();
    return promise;
  }

  private drain(): void {
    while (this.active < this.maxActive && this.pending.length) {
      const job = this.pending.shift()!;
      this.active++;
      void (async () => {
        try {
          job.resolve(await job.work());
        } catch (error) {
          job.reject(error);
        } finally {
          this.inFlight.delete(job.key);
          this.active--;
          this.drain();
        }
      })();
    }
  }
}