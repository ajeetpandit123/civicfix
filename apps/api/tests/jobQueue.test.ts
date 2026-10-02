import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  InMemoryJobStore,
  JobQueue,
  RedisJobStore,
  type RedisLike,
} from '../src/jobs/jobQueue.js';

describe('backoff', () => {
  it('grows exponentially and then caps', () => {
    expect(backoffMs(0, 250, 60_000)).toBe(250);
    expect(backoffMs(1, 250, 60_000)).toBe(500);
    expect(backoffMs(2, 250, 60_000)).toBe(1000);
    expect(backoffMs(40, 250, 60_000)).toBe(60_000);
  });
});

describe('in-memory job queue', () => {
  it('runs an enqueued job through its handler', async () => {
    const seen: string[] = [];
    const queue = new JobQueue(new InMemoryJobStore(), {
      'notification.fanout': async (p) => {
        seen.push(String(p.complaintId));
      },
    });

    await queue.enqueue('notification.fanout', { complaintId: 'c1' });

    expect(await queue.drain()).toBe(1);
    expect(seen).toEqual(['c1']);
  });

  it('reports false when nothing is due', async () => {
    const queue = new JobQueue(new InMemoryJobStore(), {});

    expect(await queue.runOnce()).toBe(false);
  });

  it('does not run a job before its delay elapses', async () => {
    const store = new InMemoryJobStore();
    const queue = new JobQueue(store, { work: async () => {} });

    await queue.enqueue('work', {}, { delayMs: 10_000 });
    // Read the clock after enqueue: `runAt` is stamped at enqueue time, so an
    // offset captured before it loses to however long enqueue itself took.
    const now = Date.now();

    expect(await queue.runOnce(now)).toBe(false);
    expect(await queue.runOnce(now + 10_000)).toBe(true);
  });

  it('retries with backoff until the attempt budget is spent', async () => {
    const store = new InMemoryJobStore();
    let calls = 0;
    const queue = new JobQueue(store, {
      flaky: async () => {
        calls += 1;
        throw new Error('boom');
      },
    });

    const id = await queue.enqueue('flaky', {}, { maxAttempts: 3 });
    let now = Date.now();
    await queue.runOnce(now); // attempt 1 -> scheduled for later
    expect(calls).toBe(1);

    expect(await queue.runOnce(now + 1)).toBe(false); // still backing off

    now += backoffMs(1);
    await queue.runOnce(now); // attempt 2 -> scheduled again
    now += backoffMs(2);
    await queue.runOnce(now); // attempt 3 -> budget spent

    expect(calls).toBe(3);
    const job = store.get(id);
    expect(job?.state).toBe('FAILED');
    expect(job?.lastError).toBe('boom');
  });

  it('drops a job with no handler rather than looping on it', async () => {
    const store = new InMemoryJobStore();
    const queue = new JobQueue(store, {});

    await queue.enqueue('unknown.type', {});
    expect(await queue.drain()).toBe(1);
  });

  it('runs several jobs in one drain', async () => {
    let count = 0;
    const queue = new JobQueue(new InMemoryJobStore(), {
      tick: async () => {
        count += 1;
      },
    });

    await Promise.all([
      queue.enqueue('tick', {}),
      queue.enqueue('tick', {}),
      queue.enqueue('tick', {}),
    ]);

    expect(await queue.drain()).toBe(3);
    expect(count).toBe(3);
  });
});

function fakeRedis(): RedisLike & { entries: Array<{ score: number; value: string }> } {
  const entries: Array<{ score: number; value: string }> = [];
  const records = new Map<string, string>();
  return {
    entries,
    async zAdd(_k, score, member) {
      entries.push({ score, value: member });
      return 1;
    },
    async zPopMin() {
      if (!entries.length) return [];
      let lowest = 0;
      for (let i = 1; i < entries.length; i += 1) {
        if (entries[i].score < entries[lowest].score) lowest = i;
      }
      return [entries.splice(lowest, 1)[0]];
    },
    async hSet(_k, field, value) {
      records.set(field, value);
      return 1;
    },
    async hGet(_k, field) {
      return records.get(field) ?? null;
    },
    async hDel(_k, field) {
      records.delete(field);
      return 1;
    },
  };
}

describe('redis-backed job store', () => {
  it('claims and completes a due job', async () => {
    const redis = fakeRedis();
    const store = new RedisJobStore(redis);
    const queue = new JobQueue(store, { work: async () => {} });

    await queue.enqueue('work', { n: 1 }, { delayMs: 0 });

    expect(await queue.runOnce(Date.now())).toBe(true);
  });

  it('holds back a job that is not yet due', async () => {
    const redis = fakeRedis();
    const store = new RedisJobStore(redis);
    const queue = new JobQueue(store, { work: async () => {} });

    await queue.enqueue('work', {}, { delayMs: 5_000 });
    const now = Date.now();

    expect(await queue.runOnce(now)).toBe(false);
  });

  it('clears the record on success', async () => {
    const redis = fakeRedis();
    const store = new RedisJobStore(redis);
    const queue = new JobQueue(store, { ok: async () => {} });

    const id = await queue.enqueue('ok', {});
    await queue.runOnce(Date.now());

    expect(await redis.hGet('civicfix:jobs:records', id)).toBeNull();
  });
});
