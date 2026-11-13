interface ReadJob {
  key: string;
  priority: number;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  promise: Promise<unknown>;
}

/** Shares identical in-flight reads and gives foreground requests first access to four slots. */
export class RequestScheduler {
  private active = 0;
  private readonly queue: ReadJob[] = [];
  private readonly pending = new Map<string, ReadJob>();

  constructor(private readonly concurrency = 4) {}

  read<T>(key: string, priority: number, run: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) {
      existing.priority = Math.min(existing.priority, priority);
      return existing.promise as Promise<T>;
    }
    let resolve!: ReadJob['resolve'];
    let reject!: ReadJob['reject'];
    const promise = new Promise<unknown>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const job = { key, priority, run, resolve, reject, promise };
    this.pending.set(key, job);
    this.queue.push(job);
    this.drain();
    return promise as Promise<T>;
  }

  private drain(): void {
    this.queue.sort((left, right) => left.priority - right.priority);
    while (this.active < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active--;
          this.pending.delete(job.key);
          this.drain();
        });
    }
  }
}
