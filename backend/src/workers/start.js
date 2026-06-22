// Standalone worker entrypoint: `npm run worker`.
//
// Connects its own Mongoose client (workers are separate processes from the API
// server and need their own DB connection), then starts the BullMQ worker. Run
// one or more of these alongside the API to scale processing throughput.

const mongoose = require('mongoose');
require('dotenv').config();

const { startInvoiceWorker } = require('./invoiceWorker');
const { QUEUE_ENABLED, REDIS_URL } = require('../config/queue');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/invoice-automation';

if (!QUEUE_ENABLED) {
  console.error('QUEUE_ENABLED is false — nothing to do. Set QUEUE_ENABLED=true (and run Redis) to use the worker.');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('[worker] connected to MongoDB');
    console.log(`[worker] using Redis at ${REDIS_URL}`);
    const worker = startInvoiceWorker();

    // Drain in-flight jobs cleanly on shutdown so a deploy/restart doesn't
    // leave a job half-done and stuck in "active".
    const shutdown = async () => {
      console.log('[worker] shutting down…');
      if (worker) await worker.close();
      await mongoose.connection.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((err) => {
    console.error('[worker] MongoDB connection error:', err);
    process.exit(1);
  });
