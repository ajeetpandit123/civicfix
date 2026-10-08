import { InMemoryJobStore, JobQueue, setJobQueue, type JobHandler } from './jobQueue.js';
import { logger } from '../lib/logger.js';
import {
  runComplaintCreatedSideEffects,
  type ComplaintCreatedJob,
} from '../services/complaintService.js';

/**
 * Handlers for the jobs the HTTP layer enqueues. Registered by the worker and
 * used inline as a fallback when no queue is wired, so behaviour is identical.
 */
export function jobHandlers(): Record<string, JobHandler> {
  return {
    'complaint.created': async (payload) => {
      await runComplaintCreatedSideEffects(payload as unknown as ComplaintCreatedJob);
    },
  };
}

/** Boots an in-process queue and registers it globally. */
export function bootstrapJobQueue(): JobQueue {
  const queue = new JobQueue(new InMemoryJobStore(), jobHandlers());
  setJobQueue(queue);
  logger.info({ handlers: Object.keys(jobHandlers()) }, 'job_queue_ready');
  return queue;
}
