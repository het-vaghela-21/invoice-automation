// BullMQ worker: drains the invoice-processing queue.
//
// This is the horizontally-scalable half of the queue design. Run as many of
// these processes as you have CPU/RAM for — on this box or others — all pointed
// at the same Redis, and they share the load automatically. WORKER_CONCURRENCY
// controls how many jobs a single worker handles at once.
//
// Started two ways:
//   • Standalone:  `npm run worker`  (src/workers/start.js connects Mongo first)
//   • In-process:  startInvoiceWorker() from server.js when RUN_WORKER_INLINE=true
//                   — handy for single-machine dev so you don't run two processes.

const { Worker } = require('bullmq');
const { INVOICE_QUEUE_NAME, connection, QUEUE_ENABLED } = require('../config/queue');
const Invoice = require('../models/Invoice');
const { runOCR, runMatching } = require('../services/invoiceProcessor');

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 5;

// Record a failure on the invoice itself so it's visible in the UI's processing
// log, not just in worker stdout. Best-effort — never throw from the catch.
async function recordFailure(invoiceId, action, message) {
  try {
    await Invoice.findByIdAndUpdate(invoiceId, {
      $push: { processingLog: { action, details: message, status: 'error' } },
    });
  } catch (e) {
    console.error('[worker] could not record failure on invoice', invoiceId, e.message);
  }
}

function startInvoiceWorker() {
  if (!QUEUE_ENABLED || !connection) {
    console.log('[worker] queue disabled — not starting worker');
    return null;
  }

  const worker = new Worker(
    INVOICE_QUEUE_NAME,
    async (job) => {
      const { invoiceId } = job.data;
      if (job.name === 'ocr') {
        await runOCR(invoiceId);
        return { invoiceId, step: 'ocr' };
      }
      if (job.name === 'match') {
        await runMatching(invoiceId);
        return { invoiceId, step: 'match' };
      }
      throw new Error(`Unknown job type: ${job.name}`);
    },
    { connection, concurrency: CONCURRENCY }
  );

  worker.on('completed', (job) => {
    console.log(`[worker] ${job.name} done for invoice ${job.data.invoiceId} (job ${job.id})`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[worker] ${job?.name} failed for invoice ${job?.data?.invoiceId}: ${err.message}`);
    // Only annotate the invoice once all retry attempts are exhausted.
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      const action = job.name === 'ocr' ? 'OCR Failed' : 'Matching Failed';
      await recordFailure(job.data.invoiceId, action, err.message);
    }
  });

  console.log(`[worker] invoice worker started (concurrency ${CONCURRENCY})`);
  return worker;
}

module.exports = { startInvoiceWorker };
