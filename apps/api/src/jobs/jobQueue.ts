import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

export type JobState = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface JobRecord {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  lastError?: string;
}

export interface JobStore {
  enqueue(record: JobRecord): Promise<void>;
  /** Atomically takes the next due job, or null when none is ready. */
  claimDue(now: number): Promise<JobRecord | null>;
  markComplete(id: string): Promise<void>;
  /** Puts a failed job back with a later `runAt`, or parks it as FAILED. */
  reschedule(job: JobRecord): Promise<void>;
  size(): Promise<number>;
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

export interface EnqueueOptions {
  maxAttempts?: number;
  /** Delay before the first attempt, in milliseconds. */
  delayMs?: number;
}

/** Exponential backoff: base * 2^attempts, capped so a job never parks forever. */
export function backoffMs(attempts: number, base = 250, cap = 60_000): number {
  return Math.min(base * 2 ** attempts, cap);
}

/** In-process store: enough for tests and a single-node deploy. */
export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, JobRecord>();

  async enqueue(record: JobRecord): Promise<void> {
    this.jobs.set(record.id, { ...record });
  }

  async claimDue(now: number): Promise<JobRecord | null> {
    for (const job of this.jobs.values()) {
      if (job.state === 'PENDING' && job.runAt <= now) {
        const claimed = { ...job, state: 'RUNNING' as const };
        this.jobs.set(job.id, claimed);
        return claimed;
      }
    }
    return null;
  }

  async markComplete(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) this.jobs.set(id, { ...job, state: 'COMPLETED' });
  }

  async reschedule(job: JobRecord): Promise<void> {
    this.jobs.set(job.id, { ...job });
  }

  async size(): Promise<number> {
    return this.jobs.size;
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }
}

/** Minimal sorted-set/hash client — keeps the queue decoupled from any one driver. */
export interface RedisLike {
  zAdd(key: string, score: number, member: string): Promise<unknown>;
  zPopMin(key: string): Promise<Array<{ score: number; value: string }>>;
  hSet(key: string, field: string, value: string): Promise<unknown>;
  hGet(key: string, field: string): Promise<string | null>;
  hDel(key: string, field: string): Promise<unknown>;
}

/**
 * Redis-backed store using a sorted set for scheduling and a hash for payloads.
 * Jobs are claimed by popping the lowest-scored due member.
 */
export class RedisJobStore implements JobStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly prefix = 'civicfix:jobs',
  ) {}

  private get scheduleKey(): string {
    return `${this.prefix}:due`;
  }

  private get recordKey(): string {
    return `${this.prefix}:records`;
  }

  async enqueue(record: JobRecord): Promise<void> {
    await this.redis.hSet(this.recordKey, record.id, JSON.stringify(record));
    await this.redis.zAdd(this.scheduleKey, record.runAt, record.id);
  }

  async claimDue(now: number): Promise<JobRecord | null> {
    const due = await this.redis.zPopMin(this.scheduleKey);
    for (const entry of due) {
      if (entry.score > now) {
        // Not actually due yet — put it back and stop.
        await this.redis.zAdd(this.scheduleKey, entry.score, entry.value);
        return null;
      }
      const raw = await this.redis.hGet(this.recordKey, entry.value);
      if (!raw) continue;
      const job = { ...(JSON.parse(raw) as JobRecord), state: 'RUNNING' as const };
      await this.redis.hSet(this.recordKey, job.id, JSON.stringify(job));
      return job;
    }
    return null;
  }

  async markComplete(id: string): Promise<void> {
    await this.redis.hDel(this.recordKey, id);
  }

  async reschedule(job: JobRecord): Promise<void> {
    await this.redis.hSet(this.recordKey, job.id, JSON.stringify(job));
    if (job.state === 'PENDING') await this.redis.zAdd(this.scheduleKey, job.runAt, job.id);
  }

  async size(): Promise<number> {
    return 0;
  }
}

export class JobQueue {
  constructor(
    private readonly store: JobStore,
    private readonly handlers: Record<string, JobHandler>,
  ) {}

  async enqueue(type: string, payload: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<string> {
    const id = randomUUID();
    await this.store.enqueue({
      id,
      type,
      payload,
      state: 'PENDING',
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? 3,
      runAt: Date.now() + (opts.delayMs ?? 0),
    });
    return id;
  }

  /**
   * Runs at most one due job. Returns false when nothing was ready, so callers
   * can drain or idle without a busy loop.
   */
  async runOnce(now = Date.now()): Promise<boolean> {
    const job = await this.store.claimDue(now);
    if (!job) return false;
    const handler = this.handlers[job.type];
    if (!handler) {
      await this.store.markComplete(job.id);
      logger.warn({ type: job.type }, 'job_no_handler_dropped');
      return true;
    }

    const attempts = job.attempts + 1;
    try {
      await handler(job.payload);
      await this.store.markComplete(job.id);
    } catch (err) {
      const failed: JobRecord = {
        ...job,
        attempts,
        lastError: err instanceof Error ? err.message : String(err),
      };
      if (attempts < job.maxAttempts) {
        await this.store.reschedule({ ...failed, state: 'PENDING', runAt: now + backoffMs(attempts) });
        logger.warn({ type: job.type, attempts }, 'job_retry_scheduled');
      } else {
        await this.store.reschedule({ ...failed, state: 'FAILED' });
        logger.error({ type: job.type, attempts, err }, 'job_failed');
      }
    }
    return true;
  }

  /** Runs until nothing is due. Used by tests and by the worker's sweep. */
  async drain(now = Date.now()): Promise<number> {
    let handled = 0;
    while (await this.runOnce(now)) handled += 1;
    return handled;
  }
}

let activeQueue: JobQueue | null = null;

export function setJobQueue(queue: JobQueue | null): void {
  activeQueue = queue;
}

/** Optional by design: callers fall back to inline work when no queue is wired. */
export function getJobQueue(): JobQueue | null {
  return activeQueue;
}
