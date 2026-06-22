// BullMQ queue wiring with graceful degradation.
//
// Scalability story: invoice OCR + ML take seconds to tens of seconds each. Doing
// that inline on the HTTP request ties up a Node connection (and, for the
// CPU-bound bits, the event loop) for the whole duration — so a burst of uploads
// serializes into a slow, fragile crawl. Instead we push a tiny job onto a Redis-
// backed queue and return immediately; one or more separate worker processes
// drain the queue at their own pace. Scaling throughput is then just "run more
// workers" (even on other machines, all pointing at the same Redis) — no code
// change required.
//
// Graceful degradation: Redis is OPTIONAL. If it isn't configured/reachable, the
// queue stays disabled and the controllers fall back to processing inline (the
// original behaviour). This keeps local dev a single `npm run dev` with no extra
// moving parts, and means a Redis outage degrades latency rather than taking the
// system down. Mirrors how the ML service is treated elsewhere in this codebase.

const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// Queue is on unless explicitly disabled, but only actually used if a Redis
// connection can be established. Set QUEUE_ENABLED=false to force the inline path.
const QUEUE_ENABLED = process.env.QUEUE_ENABLED !== 'false';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const INVOICE_QUEUE_NAME = 'invoice-processing';

let connection = null;
let invoiceQueue = null;
let usable = false;

if (QUEUE_ENABLED) {
  // maxRetriesPerRequest must be null for BullMQ's blocking commands.
  // lazyConnect lets us attach error handlers before the first connect attempt
  // so a missing Redis logs one warning instead of crashing the process.
  connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  connection.on('ready', () => {
    usable = true;
    console.log('[queue] Redis connected — invoice processing is queued');
  });
  // Don't spam logs on every reconnection attempt; flip the flag and move on.
  connection.on('error', (err) => {
    if (usable) console.error('[queue] Redis error:', err.message);
    usable = false;
  });
  connection.on('end', () => { usable = false; });

  invoiceQueue = new Queue(INVOICE_QUEUE_NAME, { connection });

  // Kick off the connection; failure here just leaves us in inline-fallback mode.
  connection.connect().catch((err) => {
    console.warn(`[queue] Redis unavailable at ${REDIS_URL} (${err.message}) — falling back to inline processing`);
  });
}

// True only when the queue is enabled AND Redis is currently connected. Callers
// use this to decide between enqueueing and processing inline, per request.
function isQueueReady() {
  return QUEUE_ENABLED && usable && invoiceQueue != null;
}

// Default job options: retry transient failures with backoff, and keep the queue
// from growing unbounded by auto-trimming completed/failed job records.
const DEFAULT_JOB_OPTS = {
  attempts: Number(process.env.QUEUE_JOB_ATTEMPTS) || 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

async function enqueueInvoiceJob(type, data) {
  if (!isQueueReady()) throw new Error('Queue not ready');
  return invoiceQueue.add(type, data, DEFAULT_JOB_OPTS);
}

// Lightweight status lookup for the job-status endpoint the frontend polls.
async function getJobStatus(jobId) {
  if (!invoiceQueue) return null;
  const job = await invoiceQueue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState(); // waiting | active | completed | failed | delayed
  return {
    jobId: job.id,
    type: job.name,
    state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason || null,
    returnValue: job.returnvalue || null,
  };
}

module.exports = {
  INVOICE_QUEUE_NAME,
  REDIS_URL,
  QUEUE_ENABLED,
  connection,
  invoiceQueue,
  isQueueReady,
  enqueueInvoiceJob,
  getJobStatus,
  DEFAULT_JOB_OPTS,
};
